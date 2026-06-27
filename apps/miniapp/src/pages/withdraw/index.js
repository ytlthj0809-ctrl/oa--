const { appendQuery, formatMoney, openPage, request, requireAnchorId } = require("../../utils/api");

const withdrawRuleSnapshot = {
  dailyLimitText: "每日最多 1 次",
  windowText: "每日 09:00-18:00 可提交",
  arrivalText: "预计次日到账，节假日或银行处理可能顺延",
  amountRangeText: "单笔最低 1 元，最高不超过可提现余额",
  feeText: "测试阶段不收手续费；生产以平台公示为准",
  frozenText: "提交后冻结对应余额，失败或驳回自动退回",
  auditText: "申请需通过初审、财务复核、成批和打款确认",
  exceptionText: "资料缺失、未签约或余额不足时不可提交",
};

function decorateRecord(record) {
  return {
    ...record,
    amountText: formatMoney(record.amountCents),
    progressText: `进度 ${record.progressStep || 0}/5`,
  };
}

function decorateDetail(detail) {
  if (!detail) return null;
  return {
    ...detail,
    amountText: formatMoney(detail.amountCents),
    frozenAmountText: formatMoney(detail.frozenAmountCents),
    statusHistory: detail.statusHistory || [],
  };
}

Page({
  data: {
    amountYuan: "",
    home: null,
    withdrawRuleSnapshot,
    dailyRemainText: "今日剩余 1 次",
    submitWindowText: withdrawRuleSnapshot.windowText,
    arrivalText: withdrawRuleSnapshot.arrivalText,
    loadingList: false,
    loadingDetail: false,
    submitting: false,
    error: "",
    records: [],
    detail: null,
    emptyText: "暂无提现记录",
  },

  onLoad() {
    this.loadWithdrawList();
  },

  retryLoad() {
    this.loadWithdrawList();
  },

  updateAmount(event) {
    this.setData({ amountYuan: event.detail.value });
  },

  async loadWithdrawList() {
    this.setData({ loadingList: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const [home, recordsRaw] = await Promise.all([
        request(appendQuery("/api/miniapp/home", { anchorId })),
        request(appendQuery("/api/miniapp/withdraw-applies", { anchorId })),
      ]);
      const records = (recordsRaw || []).map(decorateRecord);
      const today = new Date().toISOString().slice(0, 10);
      const todayCount = records.filter((record) => String(record.createdAt || "").slice(0, 10) === today).length;
      const dailyRemain = Math.max(0, 1 - todayCount);
      const detail = records[0]
        ? decorateDetail(await request(`/api/miniapp/withdraw-applies/${records[0].applyId}`))
        : null;
      this.setData({
        home: { ...home, availableBalanceText: formatMoney(home.availableBalanceCents), frozenBalanceText: formatMoney(home.frozenBalanceCents) },
        dailyRemainText: `今日剩余 ${dailyRemain} 次`,
        records,
        detail,
        emptyText: records.length ? "" : "暂无提现记录",
      });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loadingList: false });
    }
  },

  async loadWithdrawDetail(event) {
    const applyId = event.currentTarget.dataset.applyId;
    if (!applyId) return;
    this.setData({ loadingDetail: true, error: "" });
    try {
      const detail = decorateDetail(await request(`/api/miniapp/withdraw-applies/${applyId}`));
      this.setData({ detail });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loadingDetail: false });
    }
  },

  async submitWithdraw() {
    this.setData({ submitting: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const amountCents = Math.round(Number(this.data.amountYuan || 0) * 100);
      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        throw new Error("请输入大于 0 的提现金额");
      }
      if (!this.data.home || this.data.home.paymentInfoStatus === "MISSING") {
        openPage("withdraw-guide", { reason: "PAYMENT_INFO_MISSING" });
        return;
      }
      if (this.data.home.signStatus !== "SIGNED") {
        openPage("withdraw-guide", { reason: "YZH_UNSIGNED" });
        return;
      }
      const clientRequestId = `miniapp-page-${Date.now()}`;
      const apply = await request("/api/miniapp/withdraw-applies", {
        method: "POST",
        data: {
          anchorId,
          amountCents,
          clientRequestId,
          operatorId: anchorId,
        },
      });
      const records = (await request(appendQuery("/api/miniapp/withdraw-applies", { anchorId }))).map(decorateRecord);
      const detail = decorateDetail(await request(`/api/miniapp/withdraw-applies/${apply.applyId}`));
      this.setData({ records, detail, emptyText: "" });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ submitting: false });
    }
  },

  openRecords() {
    openPage("withdraw-records");
  },

  openGuide() {
    openPage("withdraw-guide", { reason: "RULES" });
  },

  openDetail(event) {
    const applyId = event.currentTarget.dataset.applyId;
    if (!applyId) return;
    openPage("withdraw-detail", { applyId });
  },
});
