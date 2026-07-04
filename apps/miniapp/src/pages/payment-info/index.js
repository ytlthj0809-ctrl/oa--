const { appendQuery, openPage, request, isAuthRequiredError, requireAnchorId } = require("../../utils/api");
const { statusLabel, statusTone, yesNo } = require("../../utils/formatters");

function decoratePaymentInfo(paymentInfo) {
  if (!paymentInfo) return null;
  return {
    ...paymentInfo,
    paymentInfoStatusText: statusLabel(paymentInfo.paymentInfoStatus || "MISSING"),
    paymentInfoStatusTone: statusTone(paymentInfo.paymentInfoStatus || "MISSING"),
    signStatusText: statusLabel(paymentInfo.signStatus || "UNSIGNED"),
    signStatusTone: statusTone(paymentInfo.signStatus || "UNSIGNED"),
  };
}

function decorateChangeRequest(item) {
  return {
    ...item,
    reviewStatusText: statusLabel(item.reviewStatus || item.status),
    reviewStatusTone: statusTone(item.reviewStatus || item.status),
    requireResignText: yesNo(item.requireResign),
  };
}

Page({
  data: {
    loading: false,
    error: "",
    paymentInfo: null,
    changeRequests: [],
    canCreatePaymentInfo: true,
  },

  onShow() {
    this.loadPaymentInfo();
  },

  async loadPaymentInfo() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const [paymentInfo, changeRequests] = await Promise.all([
        request(appendQuery("/api/miniapp/payment-info", { anchorId })),
        request(appendQuery("/api/miniapp/payment-info/change-requests", { anchorId })),
      ]);
      const paymentInfoStatus = paymentInfo && paymentInfo.paymentInfoStatus;
      const canCreatePaymentInfo = !paymentInfo || ["MISSING", "REJECTED", "RETURNED", "FAILED"].includes(paymentInfoStatus);
      this.setData({
        paymentInfo: decoratePaymentInfo(paymentInfo),
        changeRequests: (changeRequests || []).map(decorateChangeRequest),
        canCreatePaymentInfo,
      });
    } catch (error) {
      if (isAuthRequiredError(error)) { this.__authRedirecting = true; return; }
      this.setData({ error: error.message });
    } finally {
      if (!this.__authRedirecting) this.setData({ loading: false });
    }
  },

  openForm() {
    if (!this.data.canCreatePaymentInfo) return;
    openPage("payment-info-form");
  },

  openChange() {
    openPage("payment-info-change");
  },
});
