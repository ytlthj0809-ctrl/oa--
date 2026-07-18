import fs from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function parseEnvText(text) {
  const values = {};
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

async function resolveCosConfig() {
  let secrets = {};
  const secretRef = process.env.COS_SECRET_REF;
  if (secretRef) secrets = parseEnvText(await fs.readFile(secretRef, "utf8"));
  return {
    secretId: process.env.COS_SECRET_ID || secrets.COS_SECRET_ID || "",
    secretKey: process.env.COS_SECRET_KEY || secrets.COS_SECRET_KEY || "",
    bucket: process.env.COS_BUCKET || process.env.OBJECT_STORAGE_BUCKET || "",
    region: process.env.COS_REGION || process.env.OBJECT_STORAGE_REGION || "",
  };
}

export async function storePrivateFile({ key, body, contentType }) {
  const config = await resolveCosConfig();
  if (config.secretId && config.secretKey && config.bucket && config.region) {
    const client = new S3Client({
      region: config.region,
      endpoint: `https://cos.${config.region}.myqcloud.com`,
      credentials: { accessKeyId: config.secretId, secretAccessKey: config.secretKey },
      forcePathStyle: false,
    });
    await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
    }));
    client.destroy();
    return { provider: "cos", key };
  }
  if (["production", "formal"].includes(String(process.env.NODE_ENV || process.env.APP_ENV || "").toLowerCase())) throw new Error("COS 私有存储配置不完整");
  const target = path.resolve(process.cwd(), ".data/private", key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, body);
  return { provider: "local", key };
}
