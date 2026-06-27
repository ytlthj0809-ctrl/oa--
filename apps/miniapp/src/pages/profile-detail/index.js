const { appendQuery, request, requireAnchorId } = require("../../utils/api");

Page({
  data: {
    loading: false,
    error: "",
    profile: null,
    legacy: null,
  },

  onLoad() {
    this.loadProfile();
  },

  async loadProfile() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const [profile, legacy] = await Promise.all([
        request(appendQuery("/api/miniapp/profile", { anchorId })),
        request(appendQuery("/api/miniapp/legacy-history", { anchorId })),
      ]);
      this.setData({ profile, legacy });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },
});
