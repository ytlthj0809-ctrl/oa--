const { clearSession, openPage } = require("../../utils/api");

Page({
  data: {
    version: "v0.2",
  },

  logout() {
    clearSession();
    wx.reLaunch({ url: "/src/pages/login/index" });
  },

  openProtocols() {
    openPage("protocols");
  },

  openContact() {
    openPage("contact");
  },
});
