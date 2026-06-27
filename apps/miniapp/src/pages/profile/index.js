const { appendQuery, openPage, request, requireAnchorId } = require("../../utils/api");

Page({
  data: {
    loading: false,
    error: "",
    profile: null,
    protocols: null,
    contact: null,
    legacy: null,
  },

  onLoad() {
    this.loadProfile();
  },

  async loadProfile() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const [profile, protocols, contact, legacy] = await Promise.all([
        request(appendQuery("/api/miniapp/profile", { anchorId })),
        request(appendQuery("/api/miniapp/protocols", { anchorId })),
        request("/api/miniapp/contact"),
        request(appendQuery("/api/miniapp/legacy-history", { anchorId })),
      ]);
      this.setData({ profile, protocols, contact, legacy });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  async agreeProtocol(event) {
    const protocolType = event.currentTarget.dataset.type;
    const versionNo = event.currentTarget.dataset.version;
    try {
      const anchorId = requireAnchorId();
      await request("/api/miniapp/protocols/agree", {
        method: "POST",
        data: { anchorId, protocolType, versionNo },
      });
      this.loadProfile();
    } catch (error) {
      this.setData({ error: error.message });
    }
  },

  goPage(event) {
    const page = event.currentTarget.dataset.page;
    if (!page) return;
    openPage(page);
  },
});
