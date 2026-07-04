const { clearSession, clearWechatBindToken, openPage } = require("../../utils/api");

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
      success(result) {
        if (!result.confirm) return;
        clearSession();
        clearWechatBindToken();
        wx.reLaunch({ url: "/src/pages/login/index" });
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
