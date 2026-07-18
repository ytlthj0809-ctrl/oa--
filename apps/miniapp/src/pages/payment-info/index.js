const { finishPageLoading, getMiniappDataDirtyAt, handlePageRequestError, openPage, requireAnchorId } = require("../../utils/api");
const { PAYMENT_INFO_CACHE_TTL_MS } = require("../../utils/constants");
const { registerMiniappCacheResetter } = require("../../utils/cache");
const { statusLabel, statusTone, yesNo } = require("../../utils/formatters");
const { getPaymentInfo, listPaymentInfoChangeRequests } = require("../../services/miniapp-api");

let paymentInfoCache = { anchorId: "", paymentInfo: null, changeRequests: null, canCreatePaymentInfo: true, loadedAt: 0 };

function resetPaymentInfoCache() {
  paymentInfoCache = { anchorId: "", paymentInfo: null, changeRequests: null, canCreatePaymentInfo: true, loadedAt: 0 };
}

registerMiniappCacheResetter(resetPaymentInfoCache);

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

  async loadPaymentInfo(options = {}) {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const dirtyAt = getMiniappDataDirtyAt();
      if (
        !options.force
        && paymentInfoCache.anchorId === anchorId
        && paymentInfoCache.paymentInfo !== null
        && paymentInfoCache.loadedAt >= dirtyAt
        && Date.now() - paymentInfoCache.loadedAt < PAYMENT_INFO_CACHE_TTL_MS
      ) {
        this.setData({
          paymentInfo: paymentInfoCache.paymentInfo,
          changeRequests: paymentInfoCache.changeRequests,
          canCreatePaymentInfo: paymentInfoCache.canCreatePaymentInfo,
        });
        return;
      }
      const [paymentInfo, changeRequests] = await Promise.all([
        getPaymentInfo(anchorId),
        listPaymentInfoChangeRequests({ anchorId }),
      ]);
      const paymentInfoStatus = paymentInfo && paymentInfo.paymentInfoStatus;
      const canCreatePaymentInfo = !paymentInfo || ["MISSING", "REJECTED", "RETURNED", "FAILED"].includes(paymentInfoStatus);
      const decoratedPaymentInfo = decoratePaymentInfo(paymentInfo);
      const decoratedChangeRequests = (changeRequests || []).map(decorateChangeRequest);
      paymentInfoCache = {
        anchorId,
        paymentInfo: decoratedPaymentInfo,
        changeRequests: decoratedChangeRequests,
        canCreatePaymentInfo,
        loadedAt: Date.now(),
      };
      this.setData({
        paymentInfo: decoratedPaymentInfo,
        changeRequests: decoratedChangeRequests,
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
