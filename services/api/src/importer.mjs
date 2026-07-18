import ExcelJS from "exceljs";
import JSZip from "jszip";
import { amountCentsFromStar, assertUniqueIds, inferBusinessDate, normalizeBixinId } from "./business.mjs";
import { sha256 } from "./security.mjs";

export async function parseDailyWorkbook({ fileName, buffer }) {
  const businessDate = inferBusinessDate(fileName);
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer.subarray(0, 2).toString() !== "PK") throw new Error("文件不是有效的 .xlsx 工作簿");
  const archive = await JSZip.loadAsync(buffer);
  const entries = Object.values(archive.files);
  const uncompressedBytes = entries.reduce((sum, entry) => sum + Number(entry?._data?.uncompressedSize || 0), 0);
  if (entries.length > 5_000 || uncompressedBytes > 200 * 1024 * 1024) throw new Error("Excel 解压后内容过大，已阻止解析");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Excel 中没有可读取的工作表");
  const matrix = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = [];
    for (let index = 1; index <= sheet.columnCount; index += 1) values.push(row.getCell(index).text || "");
    matrix.push(values);
  });
  if (!matrix.length) throw new Error("Excel 内容为空");
  const headers = matrix[0].map((value) => String(value || "").trim());
  const idIndex = headers.indexOf("ID");
  const nicknameIndex = headers.indexOf("昵称");
  const starIndex = headers.indexOf("总星动值");
  if (idIndex < 0 || nicknameIndex < 0 || starIndex < 0) throw new Error("Excel 必须包含 ID、昵称、总星动值三列");
  const errors = [];
  const rows = matrix.slice(1).filter((row) => row.some((value) => String(value ?? "").trim())).map((row, index) => {
    try {
      const bixinUserId = normalizeBixinId(row[idIndex]);
      const nickname = String(row[nicknameIndex] || "").trim().slice(0, 128);
      const starText = String(row[starIndex] ?? "").replaceAll(",", "").trim();
      const starValue = Number(starText);
      if (!Number.isSafeInteger(starValue) || starValue < 0) throw new Error("总星动值必须是安全的非负整数");
      return { bixinUserId, nickname, starValue, amountCents: amountCentsFromStar(starValue) };
    } catch (error) {
      errors.push({ row: index + 2, message: error.message });
      return null;
    }
  }).filter(Boolean);
  if (errors.length) {
    const error = new Error(`文件存在 ${errors.length} 行错误`);
    error.code = "INVALID_DAILY_ROWS";
    error.details = errors.slice(0, 100);
    throw error;
  }
  assertUniqueIds(rows);
  return {
    businessDate,
    fileName,
    fileHash: sha256(buffer),
    rows,
    summary: {
      rowCount: rows.length,
      positiveCount: rows.filter((row) => row.amountCents > 0).length,
      zeroCount: rows.filter((row) => row.amountCents === 0).length,
      totalStar: rows.reduce((sum, row) => sum + row.starValue, 0),
      totalAmountCents: rows.reduce((sum, row) => sum + row.amountCents, 0),
    },
  };
}
