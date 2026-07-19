import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { payoutObjectKey } from "../services/api/src/payout.mjs";
import {
  deletePrivateFile,
  readPrivateFile,
  storePrivateFile,
} from "../services/api/src/storage.mjs";
import { schemaStatements } from "../services/api/src/schema.mjs";

test("private storage supports write, verified read and cleanup in local mode", async () => {
  const originalDirectory = process.cwd();
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "withdraw-storage-"));
  const savedEnvironment = {
    APP_ENV: process.env.APP_ENV,
    NODE_ENV: process.env.NODE_ENV,
    COS_SECRET_ID: process.env.COS_SECRET_ID,
    COS_SECRET_KEY: process.env.COS_SECRET_KEY,
    COS_SECRET_REF: process.env.COS_SECRET_REF,
    COS_BUCKET: process.env.COS_BUCKET,
    COS_REGION: process.env.COS_REGION,
  };
  try {
    process.chdir(temporaryDirectory);
    process.env.APP_ENV = "test";
    delete process.env.NODE_ENV;
    delete process.env.COS_SECRET_ID;
    delete process.env.COS_SECRET_KEY;
    delete process.env.COS_SECRET_REF;
    delete process.env.COS_BUCKET;
    delete process.env.COS_REGION;
    const key = "v2/payouts/2026-07-19/exp_test/part-1-test.xlsx";
    const body = Buffer.from("payout-file");
    await storePrivateFile({ key, body });
    assert.deepEqual(await readPrivateFile({ key }), body);
    await deletePrivateFile({ key });
    await assert.rejects(() => readPrivateFile({ key }), /ENOENT/);
  } finally {
    process.chdir(originalDirectory);
    for (const [key, value] of Object.entries(savedEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("payout metadata stores a private object key and hash without a database blob", () => {
  assert.equal(
    payoutObjectKey({
      businessDate: "2026-07-19",
      exportId: "exp_test",
      partNo: 1,
      fileName: "云账户 嘉音.xlsx",
    }),
    "v2/payouts/2026-07-19/exp_test/part-1-云账户_嘉音.xlsx",
  );
  const payoutFileSchema = schemaStatements.find((statement) =>
    statement.includes("CREATE TABLE IF NOT EXISTS v2_payout_export_file"),
  );
  assert.match(payoutFileSchema, /object_key VARCHAR\(500\) NOT NULL/);
  assert.doesNotMatch(payoutFileSchema, /file_blob|LONGBLOB/);
});
