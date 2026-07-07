const { getSession } = require("../../utils/api");

const AUTH_TIMEOUT_MS = 3000;

Page({
  data: {
    showFallback: false,
  },

  onLoad() {
    const session = getSession();
    if (session && session.anchorId) {
      wx.switchTab({ url: "/src/pages/home/index" });
      return;
    }
    this._fallbackTimer = setTimeout(() => {
      this.setData({ showFallback: true });
    }, AUTH_TIMEOUT_MS);
  },

  onUnload() {
    if (this._fallbackTimer) clearTimeout(this._fallbackTimer);
  },

  goLogin() {
    wx.redirectTo({ url: "/src/pages/login/index" });
  },
});
