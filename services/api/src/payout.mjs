import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { sha256 } from "./security.mjs";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.resolve(currentDirectory, "../assets/yzh-payout-template.xlsx");

export async function buildPayoutFiles({ businessDate, rows }) {
  const [, month, day] = businessDate.split("-");
  const chunks = [];
  for (let index = 0; index < rows.length; index += 10_000) chunks.push(rows.slice(index, index + 10_000));
  const files = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const suffix = chunks.length > 1 ? `-${index + 1}` : "";
    const batchName = `云账户-嘉音文化${Number(month)}.${Number(day)}${suffix}`;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const sheet = workbook.getWorksheet("上传模板");
    sheet.getCell("A3").value = batchName;
    sheet.getCell("B3").value = chunk.length;
    sheet.getCell("C3").value = chunk.reduce((sum, row) => sum + Number(row.amount_cents), 0) / 100;
    chunk.forEach((row, rowIndex) => {
      const excelRow = rowIndex + 5;
      const values = [
        "",
        row.bank_card_no,
        row.real_name,
        row.id_card_no,
        row.payment_mobile,
        row.id_card_no,
        row.real_name,
        "云账户APP",
        Number(row.amount_cents) / 100,
        "",
      ];
      values.forEach((value, columnIndex) => { sheet.getRow(excelRow).getCell(columnIndex + 1).value = value; });
    });
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    files.push({ fileName: `${batchName}.xlsx`, buffer, hash: sha256(buffer), rows: chunk });
  }
  return files;
}
