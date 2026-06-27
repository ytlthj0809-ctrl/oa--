const { appendQuery, request, requireAnchorId } = require("../../utils/api");

Page({
  data: {
    loading: false,
    submitting: false,
    error: "",
    signStatus: null,
    presign: null,
  },

  onLoad() {
    this.loadSignStatus();
  },

  async loadSignStatus() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const signStatus = await request(appendQuery("/api/miniapp/yzh/sign-status", { anchorId }));
      this.setData({ signStatus });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  async createPresign() {
    this.setData({ submitting: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const presign = await request("/api/miniapp/yzh/presign", {
        method: "POST",
        data: { anchorId, operatorId: "MINIAPP" },
      });
      this.setData({ presign, signStatus: presign.signStatus });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async refreshSigned() {
    this.setData({ submitting: true, error: "" });
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
      this.setData({ submitting: false });
    }
  },
});
