const { finishPageLoading, handlePageRequestError, openPage, requireAnchorId } = require("../../utils/api");
const { statusLabel, statusTone, yesNo } = require("../../utils/formatters");
const { getPaymentInfo, listPaymentInfoChangeRequests } = require("../../services/miniapp-api");

function decoratePaymentInfo(paymentInfo) {
  if (!paymentInfo) return null;
  const paymentInfoStatus = paymentInfo.paymentInfoStatus || "MISSING";
  const signStatus = paymentInfo.signStatus || "UNSIGNED";
  return {
    bankCardNoMasked: paymentInfo.bankCardNoMasked || "",
    paymentInfoStatus,
    paymentInfoStatusText: statusLabel(paymentInfoStatus),
    paymentInfoStatusTone: statusTone(paymentInfoStatus),
    realNameMasked: paymentInfo.realNameMasked || "",
    signStatus,
    signStatusText: statusLabel(signStatus),
    signStatusTone: statusTone(signStatus),
  };
}

function decorateChangeRequest(item) {
  const reviewStatus = item.reviewStatus || item.status;
  return {
    changeRequestId: item.changeRequestId || "",
    reviewStatus,
    reviewStatusText: statusLabel(reviewStatus),
    reviewStatusTone: statusTone(reviewStatus),
    requireResign: Boolean(item.requireResign),
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
        getPaymentInfo(anchorId),
        listPaymentInfoChangeRequests({ anchorId }),
      ]);
      const paymentInfoStatus = paymentInfo && paymentInfo.paymentInfoStatus;
      const canCreatePaymentInfo = !paymentInfo || ["MISSING", "REJECTED", "RETURNED", "FAILED"].includes(paymentInfoStatus);
      this.setData({
        paymentInfo: decoratePaymentInfo(paymentInfo),
        changeRequests: (changeRequests || []).map(decorateChangeRequest),
        canCreatePaymentInfo,
      });
    } catch (error) {
      handlePageRequestError(this, error);
    } finally {
      finishPageLoading(this);
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
