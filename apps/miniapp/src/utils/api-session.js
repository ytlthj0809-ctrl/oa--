const { clearMiniappCaches } = require("./cache");

function createSessionManager({
  dataDirtyStorageKey,
  getSessionStorageKey,
  wechatBindTokenStorageKey,
}) {
  let authRedirecting = false;

  function readSession() {
    return wx.getStorageSync(getSessionStorageKey()) || null;
  }

  function writeSession(session) {
    authRedirecting = false;
    wx.setStorageSync(getSessionStorageKey(), session);
    wx.removeStorageSync(wechatBindTokenStorageKey);
  }

  function clearSession(options = {}) {
    wx.removeStorageSync(getSessionStorageKey());
    wx.removeStorageSync(dataDirtyStorageKey);
    clearMiniappCaches();
    if (!options.preserveAuthRedirect) {
      authRedirecting = false;
    }
  }

  function getWechatBindToken() {
    return wx.getStorageSync(wechatBindTokenStorageKey) || "";
  }

  function setWechatBindToken(token) {
    if (!token) return;
    wx.setStorageSync(wechatBindTokenStorageKey, token);
  }

  function clearWechatBindToken() {
    wx.removeStorageSync(wechatBindTokenStorageKey);
  }

  function redirectToLogin() {
    if (authRedirecting) return;
    authRedirecting = true;
    setTimeout(() => {
      try {
        wx.reLaunch({
          url: "/src/pages/login/index",
          fail() {
            authRedirecting = false;
          },
        });
      } catch (error) {
        authRedirecting = false;
      }
    }, 0);
  }

  function markMiniappDataDirty() {
    const dirtyAt = Date.now();
    wx.setStorageSync(dataDirtyStorageKey, dirtyAt);
    return dirtyAt;
  }

  function getMiniappDataDirtyAt() {
    return Number(wx.getStorageSync(dataDirtyStorageKey) || 0);
  }

  return {
    clearSession,
    clearWechatBindToken,
    getMiniappDataDirtyAt,
    getWechatBindToken,
    markMiniappDataDirty,
    readSession,
    redirectToLogin,
    setWechatBindToken,
    writeSession,
  };
}

module.exports = {
  createSessionManager,
};
