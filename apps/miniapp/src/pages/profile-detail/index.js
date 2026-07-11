const { finishPageLoading, handlePageRequestError, requireAnchorId } = require("../../utils/api");
const { statusLabel, statusTone } = require("../../utils/formatters");
const { getLegacyHistory, getProfile } = require("../../services/miniapp-api");

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
        getProfile(anchorId),
        getLegacyHistory(anchorId),
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
      handlePageRequestError(this, error);
    } finally {
      finishPageLoading(this);
    }
  },
});
