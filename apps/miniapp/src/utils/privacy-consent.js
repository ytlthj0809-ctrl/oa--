function unsupportedError(apiName) {
  const error = new Error("当前微信版本不支持隐私授权，请升级微信后重试");
  error.code = "MINIAPP_PRIVACY_API_UNAVAILABLE";
  error.apiName = apiName;
  return error;
}

function privacyApiError(apiName, cause) {
  const messageByApi = {
    "wx.getPrivacySetting": "读取微信隐私授权状态失败，请重试",
    "wx.openPrivacyContract": "隐私指引暂时无法打开",
    "wx.requirePrivacyAuthorize": "隐私授权未完成，请重试",
  };
  const error = new Error(messageByApi[apiName] || "微信隐私授权失败，请重试");
  error.code = "MINIAPP_PRIVACY_API_FAILED";
  error.apiName = apiName;
  error.cause = cause;
  return error;
}

function getPrivacySetting() {
  return new Promise((resolve, reject) => {
    if (typeof wx === "undefined" || typeof wx.getPrivacySetting !== "function") {
      reject(unsupportedError("wx.getPrivacySetting"));
      return;
    }
    wx.getPrivacySetting({
      success: resolve,
      fail: (error) => reject(privacyApiError("wx.getPrivacySetting", error)),
    });
  });
}

function openPrivacyContract() {
  return new Promise((resolve, reject) => {
    if (typeof wx === "undefined" || typeof wx.openPrivacyContract !== "function") {
      reject(unsupportedError("wx.openPrivacyContract"));
      return;
    }
    wx.openPrivacyContract({
      success: resolve,
      fail: (error) => reject(privacyApiError("wx.openPrivacyContract", error)),
    });
  });
}

async function requirePrivacyAuthorization() {
  const setting = await getPrivacySetting();
  if (setting && setting.needAuthorization === false) {
    return { authorized: true, required: false };
  }
  await new Promise((resolve, reject) => {
    if (typeof wx === "undefined" || typeof wx.requirePrivacyAuthorize !== "function") {
      reject(unsupportedError("wx.requirePrivacyAuthorize"));
      return;
    }
    wx.requirePrivacyAuthorize({
      success: resolve,
      fail: (error) => reject(privacyApiError("wx.requirePrivacyAuthorize", error)),
    });
  });
  return { authorized: true, required: true };
}

function getWechatLoginCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(result) {
        if (!result.code) reject(new Error("未获取到微信登录凭证，请重试"));
        else resolve(result.code);
      },
      fail: reject,
    });
  });
}

module.exports = {
  getPrivacySetting,
  getWechatLoginCode,
  openPrivacyContract,
  requirePrivacyAuthorization,
};
