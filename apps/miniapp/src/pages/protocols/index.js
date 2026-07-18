const {
  finishPageLoading,
  getAnchorId,
  handlePageRequestError,
  isAuthRequiredError,
  markMiniappDataDirty,
  requireAnchorId,
} = require("../../utils/api");
const { agreeProtocol, getProtocols } = require("../../services/miniapp-api");

Page({
  data: {
    mode: "",
    loading: false,
    submitting: false,
    error: "",
    protocols: null,
    checked: { userAgreement: false, privacyPolicy: false },
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
      this.setData({ protocols });
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

  async agreeAll() {
    if (!this.data.checked.userAgreement || !this.data.checked.privacyPolicy) {
      this.setData({ error: "请先阅读并分别勾选用户服务协议和隐私政策" });
      return;
    }
    this.setData({ submitting: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const protocols = this.data.protocols || {};
      const items = [protocols.userAgreement, protocols.privacyPolicy].filter(Boolean);
      if (items.length === 0) throw new Error("暂无需要确认的协议");
      const results = await Promise.allSettled(items.map((item) => agreeProtocol({
        anchorId,
        protocolType: item.protocolType,
        versionNo: item.versionNo,
      })));
      const failedCount = results.filter((result) => result.status === "rejected").length;
      if (failedCount > 0) {
        const successCount = results.length - failedCount;
        const agreementError = new Error(successCount > 0
          ? `已同意 ${successCount} 项，${failedCount} 项失败，请重试。`
          : "协议确认失败，请稍后重试。");
        const refreshResult = await this.loadProtocols({ preserveError: true });
        if (refreshResult && refreshResult.authRequired) return;
        throw agreementError;
      }
      markMiniappDataDirty();
      wx.switchTab({ url: "/src/pages/home/index" });
    } catch (error) {
      handlePageRequestError(this, error);
    } finally {
      finishPageLoading(this, "submitting");
    }
  },

  toggleProtocol(event) {
    const type = event.currentTarget.dataset.type;
    if (!type) return;
    this.setData({ checked: { ...this.data.checked, [type]: Boolean(event.detail.value.length) }, error: "" });
  },
});
