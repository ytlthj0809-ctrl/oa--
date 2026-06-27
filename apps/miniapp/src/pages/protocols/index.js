const { appendQuery, getAnchorId, request, requireAnchorId } = require("../../utils/api");

Page({
  data: {
    mode: "",
    loading: false,
    submitting: false,
    error: "",
    protocols: null,
  },

  onLoad(options = {}) {
    this.setData({ mode: options.mode || "" });
    this.loadProtocols();
  },

  async loadProtocols() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = getAnchorId();
      const protocols = await request(appendQuery("/api/miniapp/protocols", { anchorId }));
      this.setData({ protocols });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  async agreeAll() {
    this.setData({ submitting: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const items = [this.data.protocols.userAgreement, this.data.protocols.privacyPolicy].filter(Boolean);
      for (const item of items) {
        await request("/api/miniapp/protocols/agree", {
          method: "POST",
          data: { anchorId, protocolType: item.protocolType, versionNo: item.versionNo },
        });
      }
      wx.switchTab({ url: "/src/pages/home/index" });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
