// render-intent/runtime/bus.mjs —— 本机意图总线（Node 侧，零第三方依赖）
// 只用 node:http / node:crypto / node:fs，实现：
//   - 文件管道 loom-v2/runtime/intent.jsonl（离线可用）
//   - SSE /events（浏览器原生 EventSource）
//   - RFC6455 WebSocket 文本帧（浏览器原生 WebSocket）
//   - POST /intent（BDS HTTP 桥接 / 本地工具）
// 仅监听 127.0.0.1，并校验 Host，拒绝外部来源。不访问任何外部网络。

import http from "node:http";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Status, ok, fail } from "../../core/result.mjs";
import { toEnvelope, toWire, fromWire, ENVELOPE_SCHEMA, FRAME_SCHEMA, INTENT_SCHEMA, LIMITS } from "../core/intent.mjs";
import { CAPABILITY_TABLE } from "../core/capability.mjs";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function isLoopbackHost(host) {
  if (!host) return false;
  const name = String(host).split(":")[0].toLowerCase();
  return name === "127.0.0.1" || name === "localhost" || name === "::1";
}

// ---------------------------------------------------------------------------
// RFC6455 帧编码 / 解析（只支持文本帧、ping/pong、close；不支持分片续帧）
// ---------------------------------------------------------------------------
export function wsTextFrame(text) {
  const payload = Buffer.from(text, "utf8");
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function wsControlFrame(opcode, payload = Buffer.alloc(0)) {
  const header = Buffer.alloc(2 + payload.length);
  header[0] = 0x80 | opcode;
  header[1] = payload.length;
  payload.copy(header, 2);
  return header;
}

/** 返回 { rest, texts, close, pings }；rest 是不完整帧的剩余字节。 */
export function parseWsFrames(buf) {
  const texts = [];
  const pings = [];
  let offset = 0;
  let close = false;
  while (buf.length >= offset + 2) {
    const b0 = buf[offset];
    const b1 = buf[offset + 1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let headerLen = 2;
    if (len === 126) {
      if (buf.length < offset + 4) break;
      len = buf.readUInt16BE(offset + 2); headerLen = 4;
    } else if (len === 127) {
      if (buf.length < offset + 10) break;
      len = Number(buf.readBigUInt64BE(offset + 2)); headerLen = 10;
    }
    if (len > LIMITS.maxPayloadBytes * 2) { close = true; break; }
    const maskLen = masked ? 4 : 0;
    const total = headerLen + maskLen + len;
    if (buf.length < offset + total) break;
    let payload = buf.subarray(offset + headerLen + maskLen, offset + total);
    if (masked) {
      const mask = buf.subarray(offset + headerLen, offset + headerLen + 4);
      const out = Buffer.allocUnsafe(len);
      for (let i = 0; i < len; i += 1) out[i] = payload[i] ^ mask[i % 4];
      payload = out;
    }
    offset += total;
    if (opcode === 0x1) texts.push(payload.toString("utf8"));
    else if (opcode === 0x8) { close = true; break; }
    else if (opcode === 0x9) pings.push(Buffer.from(payload));
  }
  return { rest: Buffer.from(buf.subarray(offset)), texts, close, pings };
}

// ---------------------------------------------------------------------------
// 文件管道
// ---------------------------------------------------------------------------
export async function createFileBus(filePath, { maxBuffered = 256 } = {}) {
  const abs = path.resolve(filePath);
  await mkdir(path.dirname(abs), { recursive: true });
  if (!existsSync(abs)) await writeFile(abs, "", "utf8");
  const initial = await readFile(abs, "utf8");
  let seq = initial.split("\n").filter((l) => l.trim()).length;
  const buffer = [];
  return Object.freeze({
    kind: "file",
    filePath: abs,
    async publish(payload, channel) {
      const r = toEnvelope(seq, channel, payload);
      if (r.status !== Status.OK) return r;
      seq += 1;
      buffer.push(r.value);
      if (buffer.length > maxBuffered) buffer.shift();
      await appendFile(abs, `${toWire(r.value)}\n`, "utf8");
      return r;
    },
    recent(limit = 32) { return ok(Object.freeze(buffer.slice(-limit))); },
    async readAll() {
      const text = await readFile(abs, "utf8");
      const out = [];
      const errors = [];
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        const r = fromWire(line);
        if (r.status === Status.OK) out.push(r.value);
        else errors.push({ line, code: r.code });
      }
      return ok(Object.freeze({ envelopes: Object.freeze(out), errors: Object.freeze(errors) }));
    },
    async close() { return ok(null); }
  });
}

// ---------------------------------------------------------------------------
// 本地 HTTP + SSE + WS 总线
// ---------------------------------------------------------------------------
export function createLocalBus({
  port = 8787,
  host = "127.0.0.1",
  overlayPath = null,
  filePath = null,
  maxBuffered = 256,
  loopbackOnly = true
} = {}) {
  if (loopbackOnly && host !== "127.0.0.1") {
    throw new Error("loopbackOnly 模式下 host 只能是 127.0.0.1");
  }
  const buffer = [];
  const sseClients = new Set();
  const wsClients = new Set();
  let seq = 0;
  let closed = false;
  let heartbeat = null;
  let fileBusPromise = filePath ? createFileBus(filePath, { maxBuffered }) : null;

  async function pushToBuffer(envelope) {
    buffer.push(envelope);
    if (buffer.length > maxBuffered) buffer.shift();
    if (fileBusPromise) {
      const fb = await fileBusPromise;
      await appendFile(fb.filePath, `${toWire(envelope)}\n`, "utf8");
    }
  }

  function broadcast(envelope) {
    const wire = toWire(envelope);
    for (const res of sseClients) {
      try { res.write(`data: ${wire}\n\n`); } catch { sseClients.delete(res); }
    }
    const frame = wsTextFrame(wire);
    for (const s of wsClients) {
      try { s.write(frame); } catch { wsClients.delete(s); }
    }
  }

  async function publish(payload, channel) {
    if (closed) return fail(Status.DENIED, "E_RI_BUS_CLOSED", "总线已关闭");
    const r = toEnvelope(seq, channel, payload);
    if (r.status !== Status.OK) return r;
    seq += 1;
    await pushToBuffer(r.value);
    broadcast(r.value);
    return r;
  }

  /** 把外部 POST/WS 文本规范化为一条信封。支持三种输入形态。 */
  async function ingestText(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch {
      return fail(Status.DENIED, "E_RI_BAD_JSON", "请求体不是合法 JSON");
    }
    if (parsed?.schema === ENVELOPE_SCHEMA) {
      const r = toEnvelope(parsed.seq ?? seq, parsed.channel, parsed.payload);
      if (r.status !== Status.OK) return r;
      // 外部信封不改本地 seq，但保留其通道语义
      return publish(parsed.payload, parsed.channel);
    }
    if (parsed?.channel && parsed?.payload) return publish(parsed.payload, parsed.channel);
    if (parsed?.schema === FRAME_SCHEMA) return publish(parsed, "frame");
    if (parsed?.schema === INTENT_SCHEMA) return publish(parsed, "intent");
    return fail(Status.DENIED, "E_RI_BAD_BODY", "无法识别请求体；需 envelope / {channel,payload} / frame / intent");
  }

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > LIMITS.maxPayloadBytes * 2) {
        return fail(Status.RESOURCE_EXHAUSTED, "E_RI_BODY_TOO_LARGE", "请求体超过预算");
      }
      chunks.push(c);
    }
    return ok(Buffer.concat(chunks).toString("utf8"));
  }

  const json = (res, code, obj) => {
    const body = JSON.stringify(obj);
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
    res.end(body);
  };

  const server = http.createServer(async (req, res) => {
    if (!isLoopbackHost(req.headers.host)) {
      json(res, 403, { status: "denied", code: "E_RI_NON_LOOPBACK", message: "仅允许本机回环访问" });
      return;
    }
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/health") {
      json(res, 200, { status: "ok", kind: "local-bus", clients: { sse: sseClients.size, ws: wsClients.size }, buffered: buffer.length, seq });
      return;
    }
    if (req.method === "GET" && url.pathname === "/capabilities") {
      json(res, 200, { schema: "bedrockloom.capability-table/v1", rows: CAPABILITY_TABLE });
      return;
    }
    if (req.method === "GET" && url.pathname === "/intents.jsonl") {
      const body = buffer.map(toWire).join("\n") + (buffer.length ? "\n" : "");
      res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8" });
      res.end(body);
      return;
    }
    if (req.method === "GET" && url.pathname === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"
      });
      res.write(`data: ${JSON.stringify({ type: "hello", seq })}\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }
    if (req.method === "POST" && url.pathname === "/intent") {
      const body = await readBody(req);
      if (body.status !== Status.OK) { json(res, 413, body); return; }
      const r = await ingestText(body.value);
      json(res, r.status === Status.OK ? 200 : 400, r);
      return;
    }
    if (req.method === "GET" && url.pathname === "/") {
      if (overlayPath && existsSync(overlayPath)) {
        const html = await readFile(overlayPath);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": html.length });
        res.end(html);
      } else {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("BedrockLoom Render-Intent Bus：本地回环服务已启动。请用 demo/overlay.html 连接，或访问 /health、/events、/intents.jsonl、/capabilities。\n");
      }
      return;
    }
    json(res, 404, { status: "denied", code: "E_RI_NOT_FOUND", message: "未知路由" });
  });

  server.on("upgrade", (req, socket, head) => {
    if (!isLoopbackHost(req.headers.host)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const key = req.headers["sec-websocket-key"];
    if (String(req.headers.upgrade ?? "").toLowerCase() !== "websocket" || !key || req.headers["sec-websocket-version"] !== "13") {
      socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const accept = createHash("sha1").update(String(key) + WS_GUID).digest("base64");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    wsClients.add(socket);
    let pending = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
    // 连接建立后回放最近若干条，方便离线重连
    for (const env of buffer.slice(-10)) {
      try { socket.write(wsTextFrame(toWire(env))); } catch { /* 连接已断开 */ }
    }
    socket.on("data", async (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      const parsed = parseWsFrames(pending);
      pending = parsed.rest;
      for (const p of parsed.pings) {
        try { socket.write(wsControlFrame(0xa, p)); } catch { /* ignore */ }
      }
      for (const t of parsed.texts) {
        await ingestText(t);
      }
      if (parsed.close) {
        try { socket.write(wsControlFrame(0x8)); } catch { /* ignore */ }
        socket.end();
      }
    });
    socket.on("close", () => wsClients.delete(socket));
    socket.on("error", () => wsClients.delete(socket));
  });

  return Object.freeze({
    get port() { return server.address()?.port ?? port; },
    get seq() { return seq; },
    get buffered() { return buffer.length; },
    get clients() { return Object.freeze({ sse: sseClients.size, ws: wsClients.size }); },
    server,
    start() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          heartbeat = setInterval(() => {
            for (const res of sseClients) {
              try { res.write(": ping\n\n"); } catch { sseClients.delete(res); }
            }
          }, 15000);
          heartbeat.unref?.();
          resolve(Object.freeze({ host, port: server.address().port }));
        });
      });
    },
    publish,
    ingestText,
    recent(limit = 32) { return ok(Object.freeze(buffer.slice(-limit))); },
    async close() {
      if (closed) return ok(null);
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      for (const res of sseClients) { try { res.end(); } catch { /* ignore */ } }
      sseClients.clear();
      for (const s of wsClients) { try { s.destroy(); } catch { /* ignore */ } }
      wsClients.clear();
      await new Promise((resolve) => server.close(() => resolve()));
      return ok(null);
    }
  });
}
