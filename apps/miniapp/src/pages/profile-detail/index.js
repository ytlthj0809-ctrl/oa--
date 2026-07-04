const { appendQuery, request, isAuthRequiredError, requireAnchorId } = require("../../utils/api");
const { statusLabel, statusTone } = require("../../utils/formatters");

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
      this.setData({
        profile: profile ? {
          ...profile,
          anchorStatusText: statusLabel(profile.anchorStatus),
          anchorStatusTone: statusTone(profile.anchorStatus),
        } : null,
        legacy,
      });
    } catch (error) {
      if (isAuthRequiredError(error)) { this.__authRedirecting = true; return; }
      this.setData({ error: error.message });
    } finally {
      if (!this.__authRedirecting) this.setData({ loading: false });
    }
  },
});
