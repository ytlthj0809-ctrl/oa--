const {
  finishPageLoading,
  formatMoney,
  handlePageRequestError,
  openPage,
  requireAnchorId,
  stopPullDownRefresh,
} = require("../../utils/api");
const { getWithdrawApplyDetail } = require("../../services/miniapp-api");
const { decorateWithdrawRecord } = require("../../utils/decorators");
const { formatDateShort, statusLabel, statusTone } = require("../../utils/formatters");

const resubmittableStatuses = new Set(["CANCELLED", "FAILED", "FINANCE_REJECTED", "FIRST_REJECTED", "REJECTED", "RETURNED", "SUPER_REJECTED"]);

function formatVisibleReason(value) {
  const text = String(value || "").trim();
  if (!text || /^[a-z0-9_.:-]+$/i.test(text)) return "";
  return text;
}

function buildNextStepText(statusValue) {
  const status = String(statusValue || "").trim().toUpperCase();
  if (resubmittableStatuses.has(status)) return "请查看驳回原因，修正资料后重新提交。";
  if (status === "PAY_FAILED") return "财务正在处理付款异常，无需重复提交；长时间未更新可线下联系运营。";
  if (["PAID", "COMPLETED", "SUCCESS"].includes(status)) return "本次提现已经完成，请核对银行卡到账记录。";
  if (["WAIT_PAY", "PAYING"].includes(status)) return "申请已通过审核，正在等待线下付款和结果登记。";
  if (["WAIT_BATCH", "BATCH_CREATED"].includes(status)) return "审核已通过，正在等待财务安排付款批次。";
  return "申请正在审核中，无需重复提交；状态更新后会显示在本页。";
}

function decorate(detail) {
  if (!detail) return null;
  const progress = decorateWithdrawRecord(detail);
  const history = (detail.statusHistory || []).map((item) => ({
    ...item,
    createdAtText: formatDateShort(item.changedAt || item.createdAt),
    visibleReason: formatVisibleReason(item.reason),
    statusText: item.statusText || statusLabel(item.status),
  }));
  const paymentInfoSnapshot = detail.paymentInfoSnapshot || {};
  const status = detail.status || detail.reviewStatus;
  return {
    ...detail,
    amountText: formatMoney(detail.amountCents),
    createdAtText: formatDateShort(detail.createdAt),
    frozenAmountText: formatMoney(detail.frozenAmountCents),
    bankCardText: paymentInfoSnapshot.maskedBankAccountNo || paymentInfoSnapshot.bankCardNoMasked || "暂未记录",
    displayStatusText: detail.statusText || statusLabel(detail.status),
    displayStatusTone: statusTone(detail.status),
    currentStepText: progress.currentStepText,
    progressSteps: progress.progressSteps,
    progressSummaryText: progress.progressSummaryText,
    nextStepText: buildNextStepText(status),
    statusHistory: history,
  };
}

Page({
  data: {
    applyId: "",
    loading: false,
    error: "",
    detail: null,
    canResubmit: false,
  },

  onLoad(options = {}) {
    this.__initialShowPending = true;
    this.setData({ applyId: options.applyId || "" });
    this.loadDetail();
  },

  onShow() {
    if (this.__initialShowPending) {
      this.__initialShowPending = false;
      return;
    }
    this.loadDetail();
  },

  onPullDownRefresh() {
    this.loadDetail().finally(stopPullDownRefresh);
  },

  onUnload() {
    this.__detailLoadGeneration = Number(this.__detailLoadGeneration || 0) + 1;
  },

  async loadDetail() {
    const generation = Number(this.__detailLoadGeneration || 0) + 1;
    this.__detailLoadGeneration = generation;
    if (!this.data.applyId) {
      this.setData({ error: "缺少提现记录编号" });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const detail = await getWithdrawApplyDetail({ anchorId, applyId: this.data.applyId });
      if (generation !== this.__detailLoadGeneration) return;
      const decorated = decorate(detail);
      const status = detail.status || detail.reviewStatus;
      this.setData({
        detail: decorated,
        canResubmit: resubmittableStatuses.has(String(status || "").trim().toUpperCase()),
      });
    } catch (error) {
      if (generation !== this.__detailLoadGeneration) return;
      handlePageRequestError(this, error);
    } finally {
      if (generation === this.__detailLoadGeneration) {
        finishPageLoading(this);
      }
    }
  },

  resubmit() {
    openPage("withdraw");
  },

  goRecords() {
    openPage("withdraw-records");
  },
});
