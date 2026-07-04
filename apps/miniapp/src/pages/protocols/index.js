const { appendQuery, getAnchorId, markMiniappDataDirty, request, isAuthRequiredError, requireAnchorId } = require("../../utils/api");

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
      const protocols = await request(appendQuery("/api/miniapp/protocols", { anchorId }), {
        auth: Boolean(anchorId),
        skipAuthRedirect: !anchorId,
      });
      this.setData({ protocols });
    } catch (error) {
      if (isAuthRequiredError(error)) { this.__authRedirecting = true; return; }
      this.setData({ error: error.message });
    } finally {
      if (!this.__authRedirecting) this.setData({ loading: false });
    }
  },

  async agreeAll() {
    this.setData({ submitting: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const protocols = this.data.protocols || {};
      const items = [protocols.userAgreement, protocols.privacyPolicy].filter(Boolean);
      if (items.length === 0) throw new Error("暂无需要确认的协议");
      if (!getAnchorId()) {
        wx.showToast({ title: "请先登录后再确认协议", icon: "none" });
        wx.redirectTo({ url: "/src/pages/login/index" });
        return;
      }
      const results = await Promise.allSettled(items.map((item) => request("/api/miniapp/protocols/agree", {
        method: "POST",
        data: { anchorId, protocolType: item.protocolType, versionNo: item.versionNo },
      })));
      const failedCount = results.filter((result) => result.status === "rejected").length;
      if (failedCount > 0) {
        const successCount = results.length - failedCount;
        await this.loadProtocols();
        throw new Error(successCount > 0
          ? `已同意 ${successCount} 项，${failedCount} 项失败，请重试。`
          : "协议确认失败，请稍后重试。");
      }
      markMiniappDataDirty();
      wx.switchTab({ url: "/src/pages/home/index" });
    } catch (error) {
      if (isAuthRequiredError(error)) { this.__authRedirecting = true; return; }
      this.setData({ error: error.message });
    } finally {
      if (!this.__authRedirecting) this.setData({ submitting: false });
    }
  },
});
