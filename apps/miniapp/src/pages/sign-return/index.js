const { appendQuery, request, isAuthRequiredError, requireAnchorId } = require("../../utils/api");
const { statusLabel, statusTone } = require("../../utils/formatters");

function hasSignedReturn(options = {}) {
  const status = String(options.signStatus || options.status || options.result || "").toUpperCase();
  const success = String(options.success || "").toLowerCase();
  return status === "SIGNED" || status === "SUCCESS" || success === "true" || success === "1";
}

Page({
  data: {
    loading: false,
    error: "",
    signStatus: null,
    returnHint: "",
  },

  decorateSignStatus(signStatus) {
    const status = signStatus && signStatus.signStatus ? signStatus.signStatus : "UNSIGNED";
    return {
      ...(signStatus || {}),
      signStatusText: statusLabel(status),
      signStatusTone: statusTone(status),
    };
  },

  onLoad(options = {}) {
    this.refreshReturnStatus(options);
  },

  async refreshReturnStatus(options = {}) {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const signStatus = hasSignedReturn(options)
        ? await request("/api/miniapp/yzh/refresh", {
            method: "POST",
            data: { anchorId, signStatus: "SIGNED", operatorId: "MINIAPP" },
          })
        : await request(appendQuery("/api/miniapp/yzh/sign-status", { anchorId }));
      this.setData({ signStatus: this.decorateSignStatus(signStatus) });
      if (!hasSignedReturn(options)) {
        this.setData({ returnHint: "未收到签约成功参数，已仅查询当前签约状态。" });
      }
    } catch (error) {
      if (isAuthRequiredError(error)) { this.__authRedirecting = true; return; }
      this.setData({ error: error.message });
    } finally {
      if (!this.__authRedirecting) this.setData({ loading: false });
    }
  },

  goSign() {
    wx.redirectTo({ url: "/src/pages/sign/index" });
  },
});
