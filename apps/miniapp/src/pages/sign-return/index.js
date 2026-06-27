const { request, requireAnchorId } = require("../../utils/api");

Page({
  data: {
    loading: false,
    error: "",
    signStatus: null,
  },

  onLoad() {
    this.refreshReturnStatus();
  },

  async refreshReturnStatus() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const signStatus = await request("/api/miniapp/yzh/refresh", {
        method: "POST",
        data: { anchorId, signStatus: "SIGNED", operatorId: "MINIAPP" },
      });
      this.setData({ signStatus });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  goSign() {
    wx.redirectTo({ url: "/src/pages/sign/index" });
  },
});
