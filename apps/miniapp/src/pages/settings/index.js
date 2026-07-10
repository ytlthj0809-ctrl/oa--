const { clearSession, clearWechatBindToken, openPage } = require("../../utils/api");
const { logout: logoutRequest } = require("../../services/miniapp-api");

Page({
  data: {
    version: "",
  },

  onLoad() {
    const app = typeof getApp === "function" ? getApp() : null;
    const globalData = app && app.globalData ? app.globalData : {};
    this.setData({ version: globalData.version || "" });
  },

  logout() {
    wx.showModal({
      title: "退出登录",
      content: "确认退出当前主播账号吗？",
      confirmText: "退出",
      async success(result) {
        if (!result.confirm) return;
        wx.showLoading({ title: "正在退出", mask: true });
        try {
          await logoutRequest();
        } catch (error) {
          // 本地会话仍需清除，避免网络异常时把用户困在当前账号。
        } finally {
          clearSession();
          clearWechatBindToken();
          wx.hideLoading();
          wx.reLaunch({ url: "/src/pages/login/index" });
        }
      },
    });
  },

  openProtocols() {
    openPage("protocols");
  },

  openContact() {
    openPage("contact");
  },
});
