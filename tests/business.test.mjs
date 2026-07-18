import test from "node:test";
import assert from "node:assert/strict";
import {
  amountCentsFromStar,
  assertUniqueIds,
  evaluateWithdrawWindow,
  inferBusinessDate,
  normalizeBixinId,
} from "../services/api/src/business.mjs";

test("Bixin IDs are numeric strings with at most twenty digits", () => {
  assert.equal(normalizeBixinId(" 12345678901234567890 "), "12345678901234567890");
  assert.throws(() => normalizeBixinId("10a0"));
  assert.throws(() => normalizeBixinId("123456789012345678901"));
});

test("income rounds per anchor to cents", () => {
  assert.equal(amountCentsFromStar(1), 1);
  assert.equal(amountCentsFromStar(10000), 5800);
  assert.equal(amountCentsFromStar(0), 0);
});

test("file name date inference supports the real naming rule", () => {
  assert.equal(inferBusinessDate("直播数据-详情数据_2026-07-01.xlsx"), "2026-07-01");
  assert.throws(() => inferBusinessDate("直播数据-详情数据_2026-02-31.xlsx"), /日期无效/);
});

test("duplicate IDs block the full import", () => {
  assert.throws(() => assertUniqueIds([{ bixinUserId: "1" }, { bixinUserId: "1" }]), /重复 ID/);
});

test("withdraw window is fixed to 08:00 inclusive and 16:00 exclusive in Shanghai", () => {
  assert.equal(evaluateWithdrawWindow({ now: new Date("2026-07-01T00:00:00Z") }).isOpen, true);
  assert.equal(evaluateWithdrawWindow({ now: new Date("2026-07-01T07:59:59Z") }).isOpen, true);
  assert.equal(evaluateWithdrawWindow({ now: new Date("2026-07-01T08:00:00Z") }).isOpen, false);
  assert.equal(evaluateWithdrawWindow({ now: new Date("2026-07-01T01:00:00Z"), dateOverride: false }).isOpen, false);
});
