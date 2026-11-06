import test from "node:test";
import assert from "node:assert/strict";
import { parse, compare, satisfies, rankCandidates, highestSatisfying, validateRange } from "../core/semver.mjs";
import { Status } from "../core/result.mjs";

test("S05/S06 parse：合法与非法 SemVer", () => {
  assert.equal(parse("1.21.130").patch, 130);
  assert.deepEqual(parse("2.0.0-beta.1").prerelease, ["beta", "1"]);
  assert.equal(parse("1.2"), null);
  assert.equal(parse("not-a-version"), null);
});

test("S05 compare：正式版大于预发布，数值段正确", () => {
  assert.equal(compare("1.21.130", "1.21.129"), 1);
  assert.equal(compare("1.21.130", "1.21.130"), 0);
  assert.equal(compare("2.0.0-rc.1", "2.0.0"), -1);
  assert.equal(compare("2.0.0-beta.2", "2.0.0-beta.10"), -1);
});

test("S05 satisfies：AND / OR / 比较符 / ^ / ~ / *", () => {
  assert.equal(satisfies("1.5.0", ">=1.0.0 <2.0.0"), true);
  assert.equal(satisfies("2.0.0", ">=1.0.0 <2.0.0"), false);
  assert.equal(satisfies("1.5.0", "^1.2.0"), true);
  assert.equal(satisfies("2.0.0", "^1.2.0"), false);
  assert.equal(satisfies("1.2.9", "~1.2.0"), true);
  assert.equal(satisfies("1.3.0", "~1.2.0"), false);
  assert.equal(satisfies("9.9.9", "*"), true);
  assert.equal(satisfies("1.0.0", ">=1.0.0 <2.0.0 || >=3.0.0"), true);
  assert.equal(satisfies("2.5.0", ">=1.0.0 <2.0.0 || >=3.0.0"), false);
});

test("S05 预发布版本默认不匹配无预发布的范围", () => {
  assert.equal(satisfies("2.0.0-beta.1", ">=1.0.0 <2.0.0"), false);
  assert.equal(satisfies("2.0.0-beta.1", ">=2.0.0-beta.1 <2.0.0"), true);
});

test("S06 rankCandidates：兼容候选降序，不满足项排后且给出原因", () => {
  const ranked = rankCandidates(
    [{ version: "1.0.0" }, { version: "1.2.0", breaking: true }, { version: "1.1.0" }, { version: "2.0.0" }, { version: "bad" }],
    { loaderApiRange: ">=1.0.0 <2.0.0", skipVersions: new Set(["1.2.0"]), allowBreaking: false }
  );
  assert.deepEqual(ranked.filter((r) => r.compatible).map((r) => r.version), ["1.1.0", "1.0.0"]);
  assert.equal(ranked.find((r) => r.version === "2.0.0").compatible, false);
  assert.match(ranked.find((r) => r.version === "1.2.0").reason, /跳过/);
  assert.match(ranked.find((r) => r.version === "bad").reason, /SemVer/);
});

test("S06 highestSatisfying 与 validateRange", () => {
  assert.equal(highestSatisfying(["1.0.0", "1.9.0", "2.0.0"], ">=1.0.0 <2.0.0"), "1.9.0");
  assert.equal(validateRange(">=2.0.0 <3.0.0").status, Status.OK);
  assert.equal(validateRange("").status, Status.UNSUPPORTED);
  assert.equal(validateRange("not a range !!").status, Status.UNSUPPORTED);
});
