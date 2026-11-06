// services/installation-service.mjs —— 原子安装/升级/卸载、可取消、进度可观察、失败自动回滚、崩溃恢复。
// 真实文件系统操作（node:fs/promises）；不直接替换正在使用的文件（先备份 + 目录 rename）。
import { mkdtemp, mkdir, writeFile, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ok, fail, partial, Status } from "../core/result.mjs";
import { begin, transition, recover as recoverPlan, toLogEntry } from "../core/fsm.mjs";
import { verifyFileList, bytesOf } from "./integrity.mjs";

const FAULTS = {
  "disk-full": { code: "E_TX_DISK_FULL", message: "磁盘空间不足", status: Status.RESOURCE_EXHAUSTED },
  permission: { code: "E_TX_PERMISSION", message: "目标目录不可写", status: Status.DENIED },
  busy: { code: "E_TX_FILE_BUSY", message: "目标文件被占用", status: Status.TIMEOUT },
  network: { code: "E_TX_NETWORK", message: "下载中断", status: Status.TIMEOUT },
  hash: { code: "E_FILE_HASH_MISMATCH", message: "校验失败", status: Status.DENIED }
};

export async function createWorkspace(prefix = "loom-install-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  await Promise.all(["staging", "mods", "backup", "pending"].map((d) => mkdir(path.join(root, d), { recursive: true })));
  return root;
}

export class AtomicInstaller {
  constructor({ root, trustStore = null, verifyFn = null, onLog = null }) {
    this.root = root;
    this.trustStore = trustStore;
    this.verifyFn = verifyFn;
    this.onLog = onLog;
    this.logPath = path.join(root, "txlog.json");
    this.transactions = new Map();
  }

  progress(onProgress, state, pct) { onProgress?.({ state, pct, at: new Date().toISOString() }); }

  async _appendLog(tx) {
    this.transactions.set(tx.txId, tx);
    const entries = [...this.transactions.values()].map(toLogEntry);
    await writeFile(this.logPath, JSON.stringify({ schema: "bedrockloom.txlog/v1", transactions: entries }, null, 2), "utf8");
    this.onLog?.(toLogEntry(tx));
  }

  _checkAbort(signal) {
    if (signal?.aborted) return fail(Status.PARTIAL, "E_TX_CANCELLED", "用户取消", { recoverable: true });
    return null;
  }

  async _writeStaging(dir, files) {
    for (const [rel, content] of files) {
      const dest = path.join(dir, rel);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, bytesOf(content));
    }
  }

  /**
   * install: 事务流 INIT -> PRECHECK -> STAGING -> BACKUP -> COMMIT_PENDING -> COMMITTED -> VERIFY -> DONE
   * 任何阶段失败或取消都自动回滚；COMMIT_PENDING 崩溃由 recover() 依据 marker 与备份恢复。
   */
  async install(pack, { modId, version, signal, onProgress, faultInjection = null, envelope = null } = {}) {
    const begun = begin("install", { modId, toVersion: version, stagingPath: `staging/${modId}`, backupPath: `backup/${modId}` });
    if (begun.status !== Status.OK) return begun;
    let tx = begun.value;
    await this._appendLog(tx);
    const id = modId ?? pack?.manifest?.identity?.id ?? "unknown";
    const stagingDir = path.join(this.root, "staging", tx.txId);
    const targetDir = path.join(this.root, "mods", id);
    const backupDir = path.join(this.root, "backup", tx.txId);
    const marker = path.join(this.root, "pending", `${tx.txId}.json`);
    const steps = ["PRECHECK", "STAGING", "BACKUP", "COMMIT_PENDING", "COMMITTED", "VERIFY", "DONE"];

    try {
      // PRECHECK：签名 + 文件清单（拒绝未列文件）
      this.progress(onProgress, "PRECHECK", 10);
      let aborted = this._checkAbort(signal);
      if (aborted) throw Object.assign(new Error(aborted.message), { blResult: aborted });
      if (!pack?.files) throw Object.assign(new Error("包内无文件集合"), { blResult: fail(Status.DENIED, "E_FILE_LIST_MISSING", "包内无文件集合") });
      const integrity = verifyFileList({ manifest: pack.manifest, fileList: pack.fileList, files: pack.files });
      if (integrity.status !== Status.OK) throw Object.assign(new Error(integrity.message), { blResult: integrity });
      if (envelope && this.verifyFn && this.trustStore) {
        const sig = this.verifyFn({ manifest: pack.manifest, fileList: pack.fileList, envelope, trustStore: this.trustStore });
        if (sig.status !== Status.OK) throw Object.assign(new Error(sig.message), { blResult: sig });
      }
      tx = (await this._advance(tx, "PRECHECK", "预检通过")); await this._appendLog(tx);
      this._maybeFault(faultInjection, "PRECHECK");

      // STAGING：写入独立临时目录（不碰目标）
      this.progress(onProgress, "STAGING", 30);
      aborted = this._checkAbort(signal);
      if (aborted) throw Object.assign(new Error(aborted.message), { blResult: aborted });
      await mkdir(stagingDir, { recursive: true });
      await this._writeStaging(stagingDir, pack.files);
      this._maybeFault(faultInjection, "STAGING");
      tx = (await this._advance(tx, "STAGING", `暂存 ${pack.files.size} 个文件`)); await this._appendLog(tx);

      // BACKUP：若已安装则先备份（升级/替换）
      this.progress(onProgress, "BACKUP", 50);
      let hadBackup = false;
      try { await stat(targetDir); hadBackup = true; } catch { hadBackup = false; }
      if (hadBackup) await rename(targetDir, backupDir);
      this._maybeFault(faultInjection, "BACKUP");
      tx = (await this._advance(tx, "BACKUP", hadBackup ? "已备份旧版本" : "首次安装，无备份")); await this._appendLog(tx);

      // COMMIT_PENDING：写恢复 marker，崩溃后可判定
      this.progress(onProgress, "COMMIT_PENDING", 70);
      await mkdir(path.dirname(marker), { recursive: true });
      await writeFile(marker, JSON.stringify({ txId: tx.txId, modId: id, backupExists: hadBackup, stagingDir, targetDir, backupDir }), "utf8");
      this._maybeFault(faultInjection, "COMMIT_PENDING");
      tx = (await this._advance(tx, "COMMIT_PENDING", "提交点已记录")); await this._appendLog(tx);

      // COMMITTED：目录 rename 原子替换
      this.progress(onProgress, "COMMITTED", 85);
      await rename(stagingDir, targetDir);
      await rm(marker, { force: true });
      tx = (await this._advance(tx, "COMMITTED", "已提交")); await this._appendLog(tx);

      // VERIFY：读回逐文件确认
      this.progress(onProgress, "VERIFY", 95);
      const written = await readdir(targetDir);
      if (written.length === 0) throw Object.assign(new Error("提交后目录为空"), { blResult: fail(Status.DENIED, "E_TX_FAILED", "提交后目录为空") });
      tx = (await this._advance(tx, "VERIFY", `回读 ${written.length} 项`)); await this._appendLog(tx);

      tx = (await this._advance(tx, "DONE", "安装完成")); await this._appendLog(tx);
      this.progress(onProgress, "DONE", 100);
      return ok(Object.freeze({ tx: toLogEntry(tx), modId: id, installedPath: targetDir, backupCreated: hadBackup }));
    } catch (e) {
      const bl = e.blResult ?? fail(Status.DENIED, "E_TX_FAILED", String(e.message ?? e), { recoverable: true });
      if (bl.code === "E_TX_CRASH_RECOVERY") {
        // 进程中断：不执行回滚，保留恢复标记与暂存现场，交给 recoverPending() 判定
        const crashed = transition(tx, "crash", "进程在提交点中断");
        tx = crashed.status === Status.OK ? crashed.value : tx;
        await this._appendLog(tx);
        return Object.freeze({ ...bl, tx: toLogEntry(tx), rollback: Object.freeze({ rolledBack: false, reason: "进程中断：保留恢复标记与暂存，等待崩溃恢复" }), phase: tx.state });
      }
      const rolled = await this._rollbackFiles({ targetDir, backupDir, stagingDir, marker });
      const failed = transition(tx, "fail", { code: bl.code, message: bl.message });
      tx = failed.status === Status.OK ? failed.value : tx;
      await this._appendLog(tx);
      return Object.freeze({ ...bl, tx: toLogEntry(tx), rollback: rolled, phase: tx.state });
    }
  }

  async _advance(tx, expected, detail) {
    const r = transition(tx, "advance", detail);
    if (r.status !== Status.OK) throw Object.assign(new Error(r.message), { blResult: r });
    if (r.value.state !== expected) throw Object.assign(new Error(`状态机异常: 期望 ${expected} 得到 ${r.value.state}`), { blResult: fail(Status.DENIED, "E_TX_BAD_STATE", "状态机推进异常") });
    return r.value;
  }

  _maybeFault(fi, state) {
    if (!fi || fi.at !== state) return;
    const f = FAULTS[fi.error] ?? FAULTS["disk-full"];
    if (fi.error === "crash") {
      // 模拟进程中断：marker 已留在磁盘，交给 recover()
      throw Object.assign(new Error("模拟进程中断"), { blResult: fail(Status.PARTIAL, "E_TX_CRASH_RECOVERY", "进程在提交点中断", { recoverable: true }) });
    }
    throw Object.assign(new Error(f.message), { blResult: fail(f.status, f.code, f.message, { recoverable: true }) });
  }

  async _rollbackFiles({ targetDir, backupDir, stagingDir, marker }) {
    const actions = [];
    try { await rm(stagingDir, { recursive: true, force: true }); actions.push("清理暂存目录"); } catch { /* noop */ }
    try { await rm(marker, { force: true }); actions.push("清理恢复标记"); } catch { /* noop */ }
    try {
      await stat(backupDir);
      await rm(targetDir, { recursive: true, force: true });
      await rename(backupDir, targetDir);
      actions.push("从备份恢复旧版本");
    } catch {
      try { await rm(targetDir, { recursive: true, force: true }); actions.push("回滚新建目录"); } catch { /* noop */ }
    }
    return Object.freeze({ rolledBack: true, actions: Object.freeze(actions) });
  }

  async rollback(txId) {
    const tx = this.transactions.get(txId);
    if (!tx) return fail(Status.UNSUPPORTED, "E_TX_INVALID", `未知事务 ${txId}`);
    const r = transition(tx, "rollback", "手动回滚");
    if (r.status !== Status.OK) return r;
    await this._appendLog(r.value);
    return ok(Object.freeze({ txId, state: r.value.state }));
  }

  /** 崩溃恢复：读 pending marker 与事务日志，按 fsm.recover 的决策执行，不留下不可启动状态。 */
  async recoverPending() {
    const pendingDir = path.join(this.root, "pending");
    let markers = [];
    try { markers = (await readdir(pendingDir)).filter((f) => f.endsWith(".json")); } catch { markers = []; }
    const results = [];
    for (const f of markers) {
      const raw = JSON.parse(await readFile(path.join(pendingDir, f), "utf8"));
      const plan = recoverPlan({
        txId: raw.txId, kind: "install", modId: raw.modId,
        state: "COMMIT_PENDING",
        backupPath: raw.backupExists ? raw.backupDir : null
      });
      const p = plan.value;
      const markerPath = path.join(pendingDir, f);
      if (p.action === "ROLLBACK_FROM_BACKUP") {
        await this._rollbackFiles({ targetDir: raw.targetDir, backupDir: raw.backupDir, stagingDir: raw.stagingDir, marker: markerPath });
      } else if (p.action === "REPLAY_COMMIT") {
        // 提交阶段中断且无备份：完成未完成的目录 rename（重放提交）
        try { await stat(raw.stagingDir); await rename(raw.stagingDir, raw.targetDir); } catch { /* 已提交或暂存已清理 */ }
        await rm(markerPath, { force: true });
      } else {
        await rm(markerPath, { force: true });
      }
      results.push(Object.freeze({ txId: raw.txId, action: p.action, safeMode: p.safeMode, reason: p.reason }));
    }
    return ok(Object.freeze({ recovered: results.length, results: Object.freeze(results) }));
  }
}

export { FAULTS };
