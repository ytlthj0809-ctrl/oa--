const {
  clearSession,
  finishPageLoading,
  getAnchorId,
  getSession,
  handlePageRequestError,
  isAuthRequiredError,
  markMiniappDataDirty,
  setSession,
} = require("../../utils/api");
const { agreeProtocol, getProtocols, logout } = require("../../services/miniapp-api");

Page({
  data: {
    mode: "",
    loading: false,
    submitting: false,
    error: "",
    protocols: null,
    protocolItems: [],
    canAgree: false,
    userAgreementChecked: false,
    privacyPolicyChecked: false,
  },

  onLoad(options = {}) {
    this.setData({ mode: options.mode || "" });
    this.loadProtocols();
  },

  async loadProtocols(options = {}) {
    this.setData(options.preserveError ? { loading: true } : { loading: true, error: "" });
    try {
      const anchorId = getAnchorId();
      const protocols = await getProtocols(anchorId, {
        auth: Boolean(anchorId),
        skipAuthRedirect: !anchorId,
      });
      this.setData({
        protocols,
        protocolItems: [protocols.userAgreement, protocols.privacyPolicy].filter(Boolean),
        canAgree: Boolean(getAnchorId()),
      });
      return { ok: true };
    } catch (error) {
      if (isAuthRequiredError(error)) {
        this.__authRedirecting = true;
        return { ok: false, authRequired: true, error };
      }
      if (!options.preserveError) this.setData({ error: error.message });
      return { ok: false, error };
    } finally {
      finishPageLoading(this);
    }
  },

  toggleAgreement(event) {
    const field = event.currentTarget.dataset.field;
    const values = event.detail && event.detail.value ? event.detail.value : [];
    this.setData({ [field]: values.includes("agreed") });
  },

  async agreeAll() {
    if (!this.data.userAgreementChecked || !this.data.privacyPolicyChecked) {
      this.setData({ error: "请分别阅读并勾选两项协议" });
      return;
    }
    this.setData({ submitting: true, error: "" });
    try {
      const protocols = this.data.protocols || {};
      const items = [protocols.userAgreement, protocols.privacyPolicy].filter(Boolean);
      if (items.length !== 2) throw new Error("协议内容未完整加载，请重新加载");
      let result = null;
      for (const item of items) {
        result = await agreeProtocol({
          protocolType: item.protocolType,
          versionNo: item.versionNo,
        });
      }
      if (!result || result.protocolStatus !== "AGREED") {
        throw new Error("协议确认未完成，请重试");
      }
      const session = getSession();
      setSession({ ...session, protocolStatus: "AGREED" });
      markMiniappDataDirty();
      wx.switchTab({ url: "/src/pages/home/index" });
    } catch (error) {
      const agreementError = error;
      const refreshResult = await this.loadProtocols({ preserveError: true });
      if (refreshResult && refreshResult.authRequired) return;
      handlePageRequestError(this, agreementError);
    } finally {
      finishPageLoading(this, "submitting");
    }
  },

  async declineAndExit() {
    this.setData({ submitting: true, error: "" });
    try {
      if (getAnchorId()) await logout();
    } catch (error) {
      // Local session must still be removed when the network logout cannot finish.
    } finally {
      clearSession();
      wx.reLaunch({ url: "/src/pages/login/index" });
    }
  },
});
