const { appendQuery, formatMoney, openPage, request, isAuthRequiredError, requireAnchorId } = require("../../utils/api");
const { decorateWithdrawRecord } = require("../../utils/decorators");
const { formatDateShort, statusLabel, statusTone } = require("../../utils/formatters");

const rejectedStatuses = new Set(["CANCELLED", "FAILED", "FINANCE_REJECTED", "FIRST_REJECTED", "PAY_FAILED", "REJECTED", "RETURNED", "SUPER_REJECTED"]);

function decorate(detail) {
  if (!detail) return null;
  const progress = decorateWithdrawRecord(detail);
  const history = (detail.statusHistory || []).map((item) => ({
    ...item,
    createdAtText: formatDateShort(item.createdAt),
    statusText: item.statusText || statusLabel(item.status),
  }));
  return {
    ...detail,
    amountText: formatMoney(detail.amountCents),
    createdAtText: formatDateShort(detail.createdAt),
    frozenAmountText: formatMoney(detail.frozenAmountCents),
    displayStatusText: detail.statusText || statusLabel(detail.status),
    displayStatusTone: statusTone(detail.status),
    currentStepText: progress.currentStepText,
    progressSteps: progress.progressSteps,
    progressSummaryText: progress.progressSummaryText,
    statusHistory: history,
  };
}

Page({
  data: {
    applyId: "",
    loading: false,
    error: "",
    detail: null,
    isRejected: false,
  },

  onLoad(options = {}) {
    this.setData({ applyId: options.applyId || "" });
    this.loadDetail();
  },

  async loadDetail() {
    if (!this.data.applyId) {
      this.setData({ error: "缺少提现记录编号" });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const detail = await request(appendQuery(`/api/miniapp/withdraw-applies/${this.data.applyId}`, { anchorId }));
      const decorated = decorate(detail);
      const status = detail.status || detail.reviewStatus;
      this.setData({
        detail: decorated,
        isRejected: rejectedStatuses.has(String(status || "").trim().toUpperCase()),
      });
    } catch (error) {
      if (isAuthRequiredError(error)) { this.__authRedirecting = true; return; }
      this.setData({ error: error.message });
    } finally {
      if (!this.__authRedirecting) this.setData({ loading: false });
    }
  },

  resubmit() {
    openPage("withdraw");
  },

  openContact() {
    openPage("contact");
  },

  goRecords() {
    openPage("withdraw-records");
  },
});
