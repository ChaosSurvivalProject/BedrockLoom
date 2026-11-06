export async function runApiSelfTest({ createApi, diagnostics = () => {} } = {}) {
  const failures = [];
  const checks = [];
  const check = (id, fn) => {
    try {
      const passed = Boolean(fn());
      checks.push({ id, passed });
      if (!passed) failures.push(id);
    } catch (error) {
      checks.push({ id, passed: false, error: String(error) });
      failures.push(id);
    }
  };

  check("invalid_model_id_rejected", () => {
    const api = createApi({ namespace: "selftest", permissions: [] });
    try { api.model.register({ id: "bad id" }); return false; } catch { return true; }
  });
  check("duplicate_destroy_is_idempotent", () => {
    const api = createApi({ namespace: "selftest", permissions: [] });
    const stop = api.entity.observe(null, { onChange: () => {} });
    stop(); stop(); api.dispose(); api.dispose(); return true;
  });
  check("permission_isolated", () => {
    const api = createApi({ namespace: "selftest", permissions: [] });
    try { api.permissions.require("presentation.local"); return false; } catch { return true; }
  });
  check("fixed_input_is_deterministic", () => {
    const api = createApi({ namespace: "selftest", permissions: [] });
    const first = api.camera.pulse({ amplitude: 2, durationTicks: 100 });
    const second = api.camera.pulse({ amplitude: 2, durationTicks: 100 });
    return JSON.stringify(first) === JSON.stringify(second) && first.amplitude === 1 && first.durationTicks === 40;
  });
  const storageApi = createApi({ namespace: "selftest", permissions: [] });
  const storage = await storageApi.storage.open("quota", 1);
  check("storage_quota_rejected", () => {
    try { storage.set("large", "x".repeat(9000)); return false; } catch { return true; }
  });

  const report = Object.freeze({ schema: "bedrockloom.api-self-test/v1", passed: failures.length === 0, checks, failures });
  diagnostics("api_self_test", JSON.stringify(report));
  return report;
}
