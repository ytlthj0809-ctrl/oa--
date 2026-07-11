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
const { registerMiniappCacheResetter } = require("../../utils/cache");
const { statusLabel, statusTone } = require("../../utils/formatters");
const {
  agreeProtocol: agreeProtocolRequest,
  getContact,
  getLegacyHistory,
  getProfile,
  getProtocols,
} = require("../../services/miniapp-api");

let profileCache = { anchorId: "", data: null, loadedAt: 0 };

function resetProfileCache() {
  profileCache = { anchorId: "", data: null, loadedAt: 0 };
}

function decorateProtocols(protocols) {
  if (!protocols) return null;
  const agreements = Array.isArray(protocols.agreements) ? protocols.agreements : [];
  const agreedKeys = new Set(agreements.map((item) => `${item.protocolType}:${item.versionNo}`));
  const decorate = (item) => item ? {
    ...item,
    agreed: agreedKeys.has(`${item.protocolType}:${item.versionNo}`),
  } : null;
  return {
    ...protocols,
    userAgreement: decorate(protocols.userAgreement),
    privacyPolicy: decorate(protocols.privacyPolicy),
  };
}

registerMiniappCacheResetter(resetProfileCache);

Page({
  data: {
    loading: false,
    error: "",
    profile: null,
    protocols: null,
    contact: null,
    legacy: null,
    loadedAt: 0,
    agreeingProtocolType: "",
  },

  onShow() {
    const wasDisposed = this.__profileDisposed;
    this.__profileDisposed = false;
    if (wasDisposed && this.data.agreeingProtocolType) {
      this.setData({ agreeingProtocolType: "" });
    }
    this.loadProfile();
  },

  onUnload() {
    this.__profileDisposed = true;
    this.__profileLoadRequestId = (this.__profileLoadRequestId || 0) + 1;
    this.__profileAgreeRequestId = (this.__profileAgreeRequestId || 0) + 1;
  },

  onPullDownRefresh() {
    this.loadProfile({ force: true }).finally(stopPullDownRefresh);
  },

  async loadProfile(options = {}) {
    if (this.__profileDisposed) return;
    const requestId = (this.__profileLoadRequestId || 0) + 1;
    this.__profileLoadRequestId = requestId;
    let anchorId = "";
    try {
      anchorId = requireAnchorId();
    } catch (error) {
      if (!this.__profileDisposed && requestId === this.__profileLoadRequestId) {
        handlePageRequestError(this, error);
      }
      return;
    }
    const dirtyAt = getMiniappDataDirtyAt();
    const moduleCacheFresh = profileCache.loadedAt >= dirtyAt;
    if (
      !options.force
      && profileCache.anchorId === anchorId
      && profileCache.data
      && moduleCacheFresh
      && Date.now() - profileCache.loadedAt < PROFILE_CACHE_TTL_MS
    ) {
      if (this.__profileDisposed || requestId !== this.__profileLoadRequestId) return;
      this.setData({ ...profileCache.data, loadedAt: profileCache.loadedAt, loading: false, error: "" });
      return;
    }
    if (this.__profileDisposed || requestId !== this.__profileLoadRequestId) return;
    this.setData({ loading: true, error: "" });
    try {
      const [profile, protocols, contact, legacy] = await Promise.all([
        getProfile(anchorId),
        getProtocols(anchorId),
        getContact({ auth: false, skipAuthRedirect: true }),
        getLegacyHistory(anchorId),
      ]);
      if (this.__profileDisposed || requestId !== this.__profileLoadRequestId) return;
      if (getMiniappDataDirtyAt() !== dirtyAt) {
        await this.loadProfile({ force: true });
        return;
      }
      const pageData = {
        profile: profile ? {
          ...profile,
          anchorStatusText: statusLabel(profile.anchorStatus),
          anchorStatusTone: statusTone(profile.anchorStatus),
          signStatusText: statusLabel(profile.signStatus),
          signStatusTone: statusTone(profile.signStatus),
        } : null,
        protocols: decorateProtocols(protocols),
        contact,
        legacy,
      };
      profileCache = { anchorId, data: pageData, loadedAt: Date.now() };
      this.setData({ ...pageData, loadedAt: profileCache.loadedAt });
    } catch (error) {
      if (!this.__profileDisposed && requestId === this.__profileLoadRequestId) {
        handlePageRequestError(this, error);
      }
    } finally {
      if (!this.__profileDisposed && requestId === this.__profileLoadRequestId) {
        finishPageLoading(this);
      }
    }
  },

  async agreeProtocol(event) {
    const protocolType = event.currentTarget.dataset.type;
    const versionNo = event.currentTarget.dataset.version;
    if (!protocolType || !versionNo || this.data.agreeingProtocolType || this.__profileDisposed) return;
    const agreeRequestId = (this.__profileAgreeRequestId || 0) + 1;
    this.__profileAgreeRequestId = agreeRequestId;
    this.__profileLoadRequestId = (this.__profileLoadRequestId || 0) + 1;
    this.setData({ agreeingProtocolType: protocolType, loading: false, error: "" });
    try {
      const anchorId = requireAnchorId();
      await agreeProtocolRequest({ anchorId, protocolType, versionNo });
      markMiniappDataDirty();
      if (this.__profileDisposed || agreeRequestId !== this.__profileAgreeRequestId) return;
      await this.loadProfile({ force: true });
    } catch (error) {
      if (!this.__profileDisposed && agreeRequestId === this.__profileAgreeRequestId) {
        handlePageRequestError(this, error);
      }
    } finally {
      if (!this.__profileDisposed && agreeRequestId === this.__profileAgreeRequestId) {
        this.setData({ agreeingProtocolType: "" });
      }
    }
  },

  goPage(event) {
    const page = event.currentTarget.dataset.page;
    if (!page) return;
    openPage(page);
  },
});
