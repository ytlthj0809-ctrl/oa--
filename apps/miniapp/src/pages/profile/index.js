const {
  finishPageLoading,
  getMiniappDataDirtyAt,
  handlePageRequestError,
  markMiniappDataDirty,
  openPage,
  requireAnchorId,
  stopPullDownRefresh,
} = require("../../utils/api");
const { PROFILE_CACHE_TTL_MS } = require("../../utils/constants");
const { statusLabel, statusTone } = require("../../utils/formatters");
const {
  agreeProtocol: agreeProtocolRequest,
  getContact,
  getLegacyHistory,
  getProfile,
  getProtocols,
} = require("../../services/miniapp-api");

Page({
  data: {
    loading: false,
    error: "",
    profile: null,
    protocols: null,
    contact: null,
    legacy: null,
    loadedAt: 0,
  },

  onShow() {
    this.loadProfile();
  },

  onPullDownRefresh() {
    this.loadProfile({ force: true }).finally(stopPullDownRefresh);
  },

  async loadProfile(options = {}) {
    const dirtyAt = getMiniappDataDirtyAt();
    if (
      !options.force
      && this.data.profile
      && this.data.loadedAt >= dirtyAt
      && Date.now() - this.data.loadedAt < PROFILE_CACHE_TTL_MS
    ) {
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const [profile, protocols, contact, legacy] = await Promise.all([
        getProfile(anchorId),
        getProtocols(anchorId),
        getContact({ auth: false, skipAuthRedirect: true }),
        getLegacyHistory(anchorId),
      ]);
      this.setData({
        profile: profile ? {
          ...profile,
          anchorStatusText: statusLabel(profile.anchorStatus),
          anchorStatusTone: statusTone(profile.anchorStatus),
          signStatusText: statusLabel(profile.signStatus),
          signStatusTone: statusTone(profile.signStatus),
        } : null,
        protocols,
        contact,
        legacy,
        loadedAt: Date.now(),
      });
    } catch (error) {
      handlePageRequestError(this, error);
    } finally {
      finishPageLoading(this);
    }
  },

  async agreeProtocol(event) {
    const protocolType = event.currentTarget.dataset.type;
    const versionNo = event.currentTarget.dataset.version;
    try {
      const anchorId = requireAnchorId();
      await agreeProtocolRequest({ anchorId, protocolType, versionNo });
      markMiniappDataDirty();
      this.loadProfile({ force: true });
    } catch (error) {
      handlePageRequestError(this, error);
    }
  },

  goPage(event) {
    const page = event.currentTarget.dataset.page;
    if (!page) return;
    openPage(page);
  },
});
