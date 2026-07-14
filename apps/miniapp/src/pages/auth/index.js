const { getSession } = require("../../utils/api");

Page({
  onLoad() {
    const session = getSession();
    if (!session || !session.anchorId) {
      wx.redirectTo({ url: "/src/pages/login/index" });
      return;
    }
    if (session.protocolStatus !== "AGREED") {
      wx.redirectTo({ url: "/src/pages/protocols/index?mode=required" });
      return;
    }
    wx.switchTab({ url: "/src/pages/home/index" });
  },
});
