import fs from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

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

function isFormalEnvironment() {
  return ["production", "formal"].includes(
    String(process.env.NODE_ENV || process.env.APP_ENV || "").toLowerCase(),
  );
}

function createCosClient(config) {
  return new S3Client({
    region: config.region,
    endpoint: `https://cos.${config.region}.myqcloud.com`,
    credentials: {
      accessKeyId: config.secretId,
      secretAccessKey: config.secretKey,
    },
    forcePathStyle: false,
  });
}

function hasCosConfig(config) {
  return Boolean(
    config.secretId && config.secretKey && config.bucket && config.region,
  );
}

function localTarget(key) {
  return path.resolve(process.cwd(), ".data/private", key);
}

async function responseBodyToBuffer(body) {
  if (!body) return Buffer.alloc(0);
  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function storePrivateFile({ key, body, contentType }) {
  const config = await resolveCosConfig();
  if (hasCosConfig(config)) {
    const client = createCosClient(config);
    try {
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType || "application/octet-stream",
        ACL: "private",
      }));
    } finally {
      client.destroy();
    }
    return { provider: "cos", key };
  }
  if (isFormalEnvironment()) throw new Error("COS 私有存储配置不完整");
  const target = localTarget(key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, body);
  return { provider: "local", key };
}

export async function readPrivateFile({ key }) {
  const config = await resolveCosConfig();
  if (hasCosConfig(config)) {
    const client = createCosClient(config);
    try {
      const response = await client.send(new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }));
      return await responseBodyToBuffer(response.Body);
    } finally {
      client.destroy();
    }
  }
  if (isFormalEnvironment()) throw new Error("COS 私有存储配置不完整");
  return fs.readFile(localTarget(key));
}

export async function deletePrivateFile({ key }) {
  const config = await resolveCosConfig();
  if (hasCosConfig(config)) {
    const client = createCosClient(config);
    try {
      await client.send(new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }));
    } finally {
      client.destroy();
    }
    return { provider: "cos", key };
  }
  if (isFormalEnvironment()) throw new Error("COS 私有存储配置不完整");
  await fs.rm(localTarget(key), { force: true });
  return { provider: "local", key };
}
