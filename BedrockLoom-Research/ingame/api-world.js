/**
 * loom.world.* —— 世界表现与空间数据的合规封装（中文注释）。
 *
 * 只读 + 客户端本地事实，绝不把客户端结果伪装成多人权威操作。
 * FOV / 视锥 / 包围盒不可读，恒 null。
 */

import { Status, ok, fail } from "./result.js";

function need(host, key) { return typeof host?.[key] === "function"; }

export function createWorldApi(host = {}) {
  return Object.freeze({
    /** 玩家视图：位置/朝向/维度；authority 明确为客户端本地。 */
    playerView() {
      if (!need(host, "getPlayerView")) {
        return fail(Status.UNSUPPORTED, "E_VIEW_NO_BINDING", "host 未提供 getPlayerView");
      }
      let v;
      try { v = host.getPlayerView(); }
      catch { return fail(Status.DEGRADED, "E_VIEW_THREW", "读取玩家视图抛错，已隔离"); }
      return ok(Object.freeze({
        position: v?.position ?? null,
        viewDirection: v?.viewDirection ?? null,
        dimensionId: v?.dimensionId ?? null,
        fovDegrees: null, frustum: null, bounds: null,
        authority: "client-local",
        caveat: "客户端本地事实；不得作为多人权威操作；不提供 FOV/视锥/包围盒"
      }));
    },

    /** 实体简要列表。包围盒恒 null；不读其他模组内部对象。 */
    entities(filter = {}) {
      if (!need(host, "listEntities")) {
        return fail(Status.UNSUPPORTED, "E_ENTITIES_NO_BINDING", "host 未提供 listEntities");
      }
      if (typeof filter !== "object" || filter === null) {
        return fail(Status.DENIED, "E_FILTER_SHAPE", "filter 必须是对象");
      }
      let list;
      try { list = host.listEntities(filter); }
      catch { return fail(Status.DEGRADED, "E_ENTITIES_THREW", "实体查询抛错，已隔离"); }
      if (!Array.isArray(list)) return fail(Status.DENIED, "E_ENTITIES_SHAPE", "适配器返回值不是数组");
      const brief = list.slice(0, 512).map((e) => Object.freeze({
        id: e?.id ?? null,
        typeId: e?.typeId ?? null,
        position: e?.position ?? null,
        bounds: null,
        caveat: "包围盒不可读；不读取其他模组内部文件或私有对象"
      }));
      return ok(Object.freeze({ count: brief.length, items: Object.freeze(brief) }),
        { truncated: list.length > 512 ? true : undefined });
    },

    /** 区块采样（公开范围内只读）。坐标为整数，拒绝非有限值。 */
    sampleChunk(x, z) {
      if (!Number.isInteger(x) || !Number.isInteger(z)) {
        return fail(Status.DENIED, "E_CHUNK_COORD", "区块坐标必须是整数");
      }
      if (!need(host, "sampleChunk")) {
        return fail(Status.UNSUPPORTED, "E_CHUNK_NO_BINDING", "host 未提供 sampleChunk");
      }
      try {
        const s = host.sampleChunk(x, z);
        return ok(Object.freeze({ x, z, loaded: Boolean(s?.loaded), authority: "client-local" }),
          { note: "只读采样；不缓存跨维度状态；区块卸载/维度切换由平台侧清理" });
      } catch { return fail(Status.DEGRADED, "E_CHUNK_THREW", "区块采样抛错，已隔离"); }
    },

    /** 模组私有配置：分层合并与配额由平台侧服务提供，本层不写任意文件。 */
    config() {
      return ok(Object.freeze({
        layers: Object.freeze(["global", "world", "player"]),
        note: "Schema 版本/原子保存/备份/迁移由平台侧 ConfigService 提供；本层不提供任意文件系统访问",
        sensitiveFieldsRedacted: true
      }));
    }
  });
}
