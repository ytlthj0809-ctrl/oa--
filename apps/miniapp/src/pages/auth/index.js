const { getSession, isAuthRequiredError, setSession } = require("../../utils/api");
const { getProtocols } = require("../../services/miniapp-api");

Page({
  data: {
    error: "",
    showFallback: false,
  },

  async onLoad() {
    const session = getSession();
    if (!session || !session.anchorId) {
      wx.redirectTo({ url: "/src/pages/login/index" });
      return;
    }
    this.setData({ error: "", showFallback: false });
    try {
      const protocols = await getProtocols(session.anchorId);
      const currentSession = protocols && protocols.protocolStatus === "AGREED"
        ? { ...session, protocolStatus: "AGREED" }
        : { ...session, protocolStatus: "PENDING" };
      setSession(currentSession);
      if (currentSession.protocolStatus !== "AGREED") {
        wx.redirectTo({ url: "/src/pages/protocols/index?mode=required" });
        return;
      }
      wx.switchTab({ url: "/src/pages/home/index" });
    } catch (error) {
      if (isAuthRequiredError(error)) return;
      this.setData({
        error: error && error.message ? error.message : "登录状态确认失败，请重试",
        showFallback: true,
      });
    }
  },

  goLogin() {
    wx.reLaunch({ url: "/src/pages/login/index" });
  },
});
