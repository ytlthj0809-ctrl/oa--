const { getSession } = require("../../utils/api");

Page({
  onLoad() {
    const session = getSession();
    if (session && session.anchorId) {
      wx.switchTab({ url: "/src/pages/home/index" });
      return;
    }
    wx.redirectTo({ url: "/src/pages/login/index" });
  },
});
