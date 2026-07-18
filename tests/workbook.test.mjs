import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseDailyWorkbook } from "../services/api/src/importer.mjs";
import { buildPayoutFiles } from "../services/api/src/payout.mjs";

test("daily workbook is parsed atomically with per-anchor rounding", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("直播数据");
  sheet.addRow(["ID", "昵称", "总星动值"]);
  sheet.addRow(["10001", "主播甲", 1]);
  sheet.addRow(["10002", "主播乙", 10_000]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const parsed = await parseDailyWorkbook({ fileName: "直播数据-详情数据_2026-07-01.xlsx", buffer });
  assert.deepEqual(parsed.summary, { rowCount: 2, positiveCount: 2, zeroCount: 0, totalStar: 10_001, totalAmountCents: 5_801 });
  assert.equal(parsed.rows[0].amountCents, 1);
});

test("duplicate IDs reject the entire workbook", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("直播数据");
  sheet.addRow(["ID", "昵称", "总星动值"]);
  sheet.addRow(["10001", "主播甲", 100]);
  sheet.addRow(["10001", "主播乙", 200]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  await assert.rejects(() => parseDailyWorkbook({ fileName: "直播数据-详情数据_2026-07-01.xlsx", buffer }), /重复 ID/);
});

test("payout workbook follows the confirmed Yunzhanghu mapping", async () => {
  const [file] = await buildPayoutFiles({
    businessDate: "2026-07-19",
    rows: [{ bank_card_no: "6222000000000000", real_name: "测试姓名", id_card_no: "210000000000000000", payment_mobile: "18800000000", amount_cents: 12_345 }],
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file.buffer);
  const sheet = workbook.getWorksheet("上传模板");
  assert.equal(file.fileName, "云账户-嘉音文化7.19.xlsx");
  assert.equal(sheet.getCell("A5").text, "");
  assert.equal(sheet.getCell("B5").text, "6222000000000000");
  assert.equal(sheet.getCell("F5").text, "210000000000000000");
  assert.equal(sheet.getCell("H5").text, "云账户APP");
  assert.equal(sheet.getCell("I5").value, 123.45);
  assert.equal(sheet.getCell("J5").text, "");
});
