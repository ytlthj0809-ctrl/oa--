import crypto from "node:crypto";
import fs from "node:fs";

const DEFAULT_API_BASE = "https://api-service.yunzhanghu.com";
const DEFAULT_ASSISTANT_APP_ID = "wx9518fe08d36ee44e";

function parseEnvText(text = "") {
  const result = {};
  for (const rawLine of String(text).split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[key] = value.replace(/\\n/gu, "\n");
  }
  return result;
}

function readSecret(environment, valueKey, refKey, aliases = []) {
  for (const key of [valueKey, ...aliases]) if (environment[key]) return String(environment[key]).trim().replace(/\\n/gu, "\n");
  const reference = String(environment[refKey] || "").trim();
  if (!reference || reference.startsWith("secret://") || !fs.existsSync(reference)) return "";
  const text = fs.readFileSync(reference, "utf8").trim();
  if (text.includes("-----BEGIN")) return text.replace(/\\n/gu, "\n");
  const values = parseEnvText(text);
  for (const key of [valueKey, ...aliases]) if (values[key]) return values[key].replace(/\\n/gu, "\n");
  return text;
}

export function resolveYzhConfig(environment = process.env) {
  const config = {
    apiBaseUrl: String(environment.YZH_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/u, ""),
    enabled: environment.YZH_REAL_SIGNING_ENABLED === "true",
    dealerId: String(environment.YZH_DEALER_ID || "").trim(),
    brokerId: String(environment.YZH_BROKER_ID || "").trim(),
    appKey: readSecret(environment, "YZH_APP_KEY", "YZH_APP_KEY_REF"),
    des3Key: readSecret(environment, "YZH_3DES_KEY", "YZH_3DES_KEY_REF", ["YZH_DES3_KEY"]),
    privateKey: readSecret(environment, "YZH_PRIVATE_KEY", "YZH_PRIVATE_KEY_REF"),
    publicKey: readSecret(environment, "YZH_PUBLIC_KEY", "YZH_PUBLIC_KEY_REF", ["YZH_YUNZHANGHU_PUBLIC_KEY"]),
    signType: String(environment.YZH_SIGN_TYPE || "rsa").toLowerCase(),
    callbackUrl: environment.YZH_CALLBACK_URL || "https://api.jiayin.site/api/callback/yzh/sign",
    returnUrl: environment.YZH_SIGN_RETURN_URL || "weixin://miniapp/yzh-sign-return",
    assistantAppId: environment.YZH_ASSISTANT_APP_ID || DEFAULT_ASSISTANT_APP_ID,
  };
  config.missing = ["dealerId", "brokerId", "appKey", "des3Key", "privateKey", "publicKey"].filter((key) => !config[key]);
  config.ready = config.missing.length === 0 && config.des3Key.length === 24;
  return config;
}

function signingText({ data, mess, timestamp, appKey }) {
  return `data=${data}&mess=${mess}&timestamp=${timestamp}&key=${appKey}`;
}

function encryptData(plaintext, key) {
  if (String(key).length !== 24) throw new Error("YZH 3DES key must be 24 characters");
  const cipher = crypto.createCipheriv("des-ede3-cbc", key, key.slice(0, 8));
  return Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]).toString("base64");
}

function decryptData(ciphertext, key) {
  if (String(key).length !== 24) throw new Error("YZH 3DES key must be 24 characters");
  const decipher = crypto.createDecipheriv("des-ede3-cbc", key, key.slice(0, 8));
  return Buffer.concat([decipher.update(String(ciphertext), "base64"), decipher.final()]).toString("utf8");
}

function signEnvelope({ data, mess, timestamp, config }) {
  const plaintext = signingText({ data, mess, timestamp, appKey: config.appKey });
  if (config.signType === "sha256") return crypto.createHmac("sha256", config.appKey).update(plaintext).digest("hex");
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(plaintext);
  return signer.sign(config.privateKey, "base64");
}

function verifyEnvelope({ data, mess, timestamp, sign, signType, config }) {
  const plaintext = signingText({ data, mess, timestamp, appKey: config.appKey });
  if (signType === "sha256") {
    const expected = crypto.createHmac("sha256", config.appKey).update(plaintext).digest("hex");
    const left = Buffer.from(expected);
    const right = Buffer.from(String(sign || ""));
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  }
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(plaintext);
  return verifier.verify(config.publicKey, String(sign || ""), "base64");
}

async function requestYzh(path, payload, config, method = "POST") {
  if (!config.enabled) throw Object.assign(new Error("云账户正式签约尚未启用"), { code: "YZH_SIGNING_DISABLED", status: 503 });
  if (!config.ready) throw Object.assign(new Error(`云账户签约配置不完整：${config.missing.join(", ")}`), { code: "YZH_CONFIG_INCOMPLETE", status: 503 });
  const mess = crypto.randomBytes(16).toString("hex");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const data = encryptData(JSON.stringify(payload), config.des3Key);
  const envelope = { data, mess, timestamp, sign: signEnvelope({ data, mess, timestamp, config }), sign_type: config.signType };
  const url = new URL(path, `${config.apiBaseUrl}/`);
  const init = { method, headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "dealer-id": config.dealerId, "request-id": payload.request_id } };
  const encoded = new URLSearchParams(envelope);
  if (method === "GET") for (const [key, value] of encoded) url.searchParams.set(key, value);
  else init.body = encoded.toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = null; }
    if (!response.ok || !body || String(body.code || "") !== "0000") {
      throw Object.assign(new Error(body?.message || `云账户接口请求失败（HTTP ${response.status}）`), { code: "YZH_API_FAILED", status: 502 });
    }
    return body.data || {};
  } finally {
    clearTimeout(timeout);
  }
}

export async function createYzhPresign({ realName, idCardNo, returnUrl = "", config = resolveYzhConfig() }) {
  const requestId = crypto.randomUUID();
  const presign = await requestYzh("/api/sdk/v1/presign", {
    request_id: requestId,
    dealer_id: config.dealerId,
    broker_id: config.brokerId,
    real_name: realName,
    id_card: idCardNo,
    certificate_type: 0,
    collect_phone_no: 0,
    page_open_way: 1,
  }, config);
  const token = String(presign.token || "");
  if (!token) throw Object.assign(new Error("云账户未返回签约令牌"), { code: "YZH_TOKEN_MISSING", status: 502 });
  const signRequestId = crypto.randomUUID();
  const sign = await requestYzh("/api/sdk/v1/sign/h5", {
    request_id: signRequestId,
    token,
    color: "",
    url: config.callbackUrl,
    event_callback_url: config.callbackUrl,
    redirect_url: returnUrl || config.returnUrl,
  }, config, "GET");
  const signUrl = String(sign.url || "");
  if (!signUrl) throw Object.assign(new Error("云账户未返回签约地址"), { code: "YZH_SIGN_URL_MISSING", status: 502 });
  return { token, signUrl, status: mapYzhSignStatus(presign.status), assistantAppId: config.assistantAppId, miniProgramPath: "pages/api-sign/index" };
}

export function decodeYzhCallback(params, config = resolveYzhConfig()) {
  const data = String(params.data || "");
  const mess = String(params.mess || "");
  const timestamp = String(params.timestamp || "");
  const sign = String(params.sign || "");
  const signType = String(params.sign_type || config.signType || "rsa").toLowerCase();
  if (!data || !timestamp || !sign) throw Object.assign(new Error("云账户回调字段缺失"), { code: "YZH_CALLBACK_INVALID", status: 400 });
  if (!config.ready) throw Object.assign(new Error("云账户回调配置不完整"), { code: "YZH_CONFIG_INCOMPLETE", status: 503 });
  if (!verifyEnvelope({ data, mess, timestamp, sign, signType, config })) throw Object.assign(new Error("云账户回调签名校验失败"), { code: "YZH_SIGNATURE_INVALID", status: 403 });
  return JSON.parse(decryptData(data, config.des3Key));
}

export function mapYzhSignStatus(status) {
  if (Number(status) === 1) return "SIGNED";
  if (Number(status) === 2) return "RELEASED";
  return "UNSIGNED";
}

export function maskYzhIdentity(payload = {}) {
  const id = String(payload.id_card || "");
  const phone = String(payload.phone || "");
  const name = String(payload.real_name || "");
  return {
    dealerId: payload.dealer_id || "",
    brokerId: payload.broker_id || "",
    realName: name ? `${name.slice(0, 1)}*` : "",
    idCard: id.length > 8 ? `${id.slice(0, 4)}**********${id.slice(-4)}` : "***",
    phone: phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : "***",
    status: payload.status,
    eventType: payload.event_type || "SIGN_CALLBACK",
    eventStatus: payload.event_status || "",
  };
}
