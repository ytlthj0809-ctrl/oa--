const {
  createClientRequestId,
  finishPageLoading,
  formatMoney,
  handlePageRequestError,
  markMiniappDataDirty,
  openPage,
  requireAnchorId,
  stopPullDownRefresh,
} = require("../../utils/api");
const { CHINA_TIME_OFFSET_MS } = require("../../utils/constants");
const { decorateHome, decorateWithdrawRecord } = require("../../utils/decorators");
const { isPaymentInfoReady, isSigned } = require("../../utils/formatters");
const { parseAmountYuanToCents } = require("../../utils/validators");
const { createWithdrawApply, getHome, getWithdrawRules, listWithdrawApplies } = require("../../services/miniapp-api");

const EMPTY_RULE_SNAPSHOT = {
  amountRangeText: "加载中",
  feeText: "加载中",
  frozenText: "加载中",
  auditText: "加载中",
  exceptionText: "加载中",
};

function getChinaDateKey(date = new Date()) {
  return new Date(date.getTime() + CHINA_TIME_OFFSET_MS).toISOString().slice(0, 10);
}

function getChinaDateKeyFromValue(value) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return getChinaDateKey(parsed);
  return String(value || "").slice(0, 10);
}

function buildDailySubmitMeta(records = [], serverDate = getChinaDateKey()) {
  const today = serverDate || getChinaDateKey();
  const todayCount = records.filter((record) => getChinaDateKeyFromValue(record.createdAt) === today).length;
  return {
    dailyRemain: null,
    dailyRemainText: `今日已提交 ${todayCount} 次，不限次数`,
  };
}

function buildWithdrawRuleView(rules = {}) {
  const snapshot = rules.snapshot || EMPTY_RULE_SNAPSHOT;
  return {
    withdrawRules: rules,
    withdrawRuleSnapshot: snapshot,
    withdrawRuleSummaryItems: rules.summaryItems || [],
    submitWindowText: snapshot.windowText || "规则加载中",
    arrivalText: snapshot.arrivalText || "规则加载中",
    submitWindowOpen: rules.submitWindowOpen === true,
    submitWindowStatusText: rules.submitWindowStatusText || "提现规则加载中",
    submitWindowCountdownText: rules.submitWindowCountdownText || "",
    submitWindowTone: rules.submitWindowTone || "neutral",
  };
}

function normalizeAmountInput(value) {
  const raw = String(value || "").replace(/[^\d.]/g, "");
  const decimalIndex = raw.indexOf(".");
  const integerPart = (decimalIndex >= 0 ? raw.slice(0, decimalIndex) : raw).replace(/^0+(?=\d)/, "");
  if (decimalIndex < 0) return integerPart;
  const decimalPart = raw.slice(decimalIndex + 1).replace(/\./g, "").slice(0, 2);
  return `${integerPart || "0"}.${decimalPart}`;
}

function sortWithdrawRecords(records = []) {
  return [...records].sort((left, right) => {
    const leftTime = new Date(left.createdAt || 0).getTime();
    const rightTime = new Date(right.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
}

function buildRecordView(records = []) {
  const sortedRecords = sortWithdrawRecords(records);
  return {
    records: sortedRecords,
    recentRecords: sortedRecords.slice(0, 3),
    emptyText: sortedRecords.length ? "" : "暂无提现记录",
  };
}

function confirmWithdrawSubmit({ amountText, availableBalanceText, dailyRemainText }) {
  const remainText = dailyRemainText || "今日不限提交次数";
  return new Promise((resolve) => {
    wx.showModal({
      title: "确认提交提现",
      content: `本次提现 ${amountText}，提交后会冻结对应余额并进入财务审核。当前可提现 ${availableBalanceText || "-"}，${remainText}。`,
      confirmText: "确认提交",
      cancelText: "再检查",
      success(result) {
        resolve(Boolean(result.confirm));
      },
      fail() {
        resolve(false);
      },
    });
  });
}

function buildAmountFeedback({ amountYuan, availableBalanceCents, minAmountCents }) {
  const text = String(amountYuan || "").trim();
  if (!text) {
    return { amountFeedbackText: "", amountFeedbackTone: "neutral", canSubmitAmount: false };
  }
  try {
    const amountCents = parseAmountYuanToCents(text);
    if (!Number.isSafeInteger(minAmountCents) || minAmountCents <= 0) {
      return {
        amountFeedbackText: "提现规则加载后可提交",
        amountFeedbackTone: "neutral",
        canSubmitAmount: false,
      };
    }
    if (amountCents < minAmountCents) {
      return {
        amountFeedbackText: `单笔提现最低 ${formatMoney(minAmountCents)}`,
        amountFeedbackTone: "danger",
        canSubmitAmount: false,
      };
    }
    if (availableBalanceCents === undefined || availableBalanceCents === null) {
      return {
        amountFeedbackText: `本次申请 ${formatMoney(amountCents)}，余额加载后可提交`,
        amountFeedbackTone: "neutral",
        canSubmitAmount: false,
      };
    }
    if (amountCents > Number(availableBalanceCents || 0)) {
      return {
        amountFeedbackText: `当前可提现 ${formatMoney(availableBalanceCents)}，请调整金额`,
        amountFeedbackTone: "danger",
        canSubmitAmount: false,
      };
    }
    return {
      amountFeedbackText: `本次申请 ${formatMoney(amountCents)}，提交后将冻结对应余额`,
      amountFeedbackTone: "success",
      canSubmitAmount: true,
    };
  } catch (error) {
    return {
      amountFeedbackText: error.message || "请输入正确的提现金额",
      amountFeedbackTone: "danger",
      canSubmitAmount: false,
    };
  }
}

Page({
  data: {
    amountYuan: "",
    amountFeedbackText: "",
    amountFeedbackTone: "neutral",
    canSubmitAmount: false,
    home: null,
    withdrawRules: null,
    withdrawRuleSnapshot: EMPTY_RULE_SNAPSHOT,
    dailyRemain: null,
    dailyRemainText: "今日不限提交次数",
    submitWindowText: "规则加载中",
    submitWindowOpen: false,
    submitWindowStatusText: "提现规则加载中",
    submitWindowCountdownText: "",
    submitWindowTone: "neutral",
    arrivalText: "规则加载中",
    loadingList: false,
    submitting: false,
    error: "",
    errorSource: "",
    successText: "",
    records: [],
    recentRecords: [],
    emptyText: "暂无提现记录",
    rulesExpanded: false,
    withdrawRuleSummaryItems: [],
  },

  onShow() {
    this.loadWithdrawList();
  },

  onPullDownRefresh() {
    this.loadWithdrawList({ force: true }).finally(stopPullDownRefresh);
  },

  retryLoad() {
    if (this.data.errorSource === "submit") {
      this.submitWithdraw();
      return;
    }
    this.loadWithdrawList();
  },

  updateAmount(event) {
    const amountYuan = normalizeAmountInput(event.detail.value);
    this.setData({
      amountYuan,
      ...buildAmountFeedback({
        amountYuan,
        availableBalanceCents: this.data.home && this.data.home.availableBalanceCents,
        minAmountCents: this.data.withdrawRules && this.data.withdrawRules.minAmountCents,
      }),
    });
    return amountYuan;
  },

  fillFullAmount() {
    const availableBalanceCents = Number(this.data.home && this.data.home.availableBalanceCents || 0);
    if (availableBalanceCents <= 0) {
      wx.showToast({ title: "当前无可提现余额", icon: "none" });
      return;
    }
    const amountYuan = (availableBalanceCents / 100).toFixed(2);
    this.setData({
      amountYuan,
      ...buildAmountFeedback({
        amountYuan,
        availableBalanceCents,
        minAmountCents: this.data.withdrawRules && this.data.withdrawRules.minAmountCents,
      }),
    });
  },

  async loadWithdrawList() {
    this.setData({ loadingList: true, error: "", errorSource: "" });
    try {
      const anchorId = requireAnchorId();
      const [home, recordsRaw, rules] = await Promise.all([
        getHome(anchorId),
        listWithdrawApplies(anchorId),
        getWithdrawRules(),
      ]);
      const decoratedHome = decorateHome(home);
      const records = (recordsRaw || []).map(decorateWithdrawRecord);
      this.setData({
        home: decoratedHome,
        ...buildWithdrawRuleView(rules),
        ...buildDailySubmitMeta(records, rules.serverDate),
        ...buildRecordView(records),
        ...buildAmountFeedback({
          amountYuan: this.data.amountYuan,
          availableBalanceCents: decoratedHome.availableBalanceCents,
          minAmountCents: rules.minAmountCents,
        }),
      });
    } catch (error) {
      if (handlePageRequestError(this, error)) return;
      this.setData({ errorSource: "load" });
    } finally {
      finishPageLoading(this, "loadingList");
    }
  },

  async submitWithdraw() {
    if (this.data.submitting) return;
    this.setData({ submitting: true, error: "", errorSource: "", successText: "" });
    try {
      const anchorId = requireAnchorId();
      const amountCents = parseAmountYuanToCents(this.data.amountYuan);
      const minAmountCents = Number(this.data.withdrawRules && this.data.withdrawRules.minAmountCents);
      if (!Number.isSafeInteger(minAmountCents) || minAmountCents <= 0) {
        throw new Error("提现规则未加载，请刷新后再提交");
      }
      if (!Number.isFinite(amountCents) || amountCents < minAmountCents) {
        throw new Error(`单笔提现最低 ${formatMoney(minAmountCents)}`);
      }
      if (!this.data.home) {
        throw new Error("余额和提现条件未加载，请刷新后再提交");
      }
      if (amountCents > Number(this.data.home.availableBalanceCents || 0)) {
        throw new Error("提现金额不能超过可提现余额");
      }
      if (!isPaymentInfoReady(this.data.home.paymentInfoStatus)) {
        wx.showToast({ title: "打款信息生效后才能提现", icon: "none" });
        openPage("withdraw-guide", { reason: "PAYMENT_INFO_NOT_EFFECTIVE" });
        return;
      }
      if (!isSigned(this.data.home.signStatus)) {
        wx.showToast({ title: "请先完成签约", icon: "none" });
        openPage("withdraw-guide", { reason: "YZH_UNSIGNED" });
        return;
      }
      if (!this.data.submitWindowOpen) {
        throw new Error(this.data.submitWindowStatusText || "当前不在可提现时间段");
      }
      const confirmed = await confirmWithdrawSubmit({
        amountText: formatMoney(amountCents),
        availableBalanceText: this.data.home.availableBalanceText,
        dailyRemainText: this.data.dailyRemainText,
      });
      if (!confirmed) {
        return;
      }
      const clientRequestId = createClientRequestId("withdraw");
      const apply = await createWithdrawApply({
        anchorId,
        amountCents,
        clientRequestId,
        operatorId: "MINIAPP",
      });
      markMiniappDataDirty();
      try { wx.vibrateShort({ type: "medium" }); } catch (_) {}
      this.setData({
        amountYuan: "",
        amountFeedbackText: "",
        amountFeedbackTone: "neutral",
        canSubmitAmount: false,
        successText: `提现申请已提交：${apply.applyId}`,
      });
      try {
        const [latestHome, recordsRaw, latestRules] = await Promise.all([
          getHome(anchorId),
          listWithdrawApplies(anchorId),
          getWithdrawRules(),
        ]);
        const records = (recordsRaw || []).map(decorateWithdrawRecord);
        this.setData({
          home: decorateHome(latestHome),
          ...buildWithdrawRuleView(latestRules),
          ...buildRecordView(records),
          ...buildDailySubmitMeta(records, latestRules.serverDate),
        });
        this.openSubmittedDetail(apply.applyId);
      } catch (refreshError) {
        const nextRecords = [decorateWithdrawRecord(apply), ...this.data.records.filter((record) => record.applyId !== apply.applyId)];
        this.setData({
          ...buildRecordView(nextRecords),
          ...buildDailySubmitMeta(nextRecords, this.data.withdrawRules && this.data.withdrawRules.serverDate),
          error: "提现已提交成功，但记录刷新失败，请稍后下拉或进入提现记录查看。",
          errorSource: "load",
        });
        this.openSubmittedDetail(apply.applyId);
      }
    } catch (error) {
      if (handlePageRequestError(this, error)) return;
      this.setData({ error: error.userMessage || error.message || "提现提交失败，请稍后重试", errorSource: "submit" });
    } finally {
      if (!this.__authRedirecting) this.setData({ submitting: false });
    }
  },

  openRecords() {
    openPage("withdraw-records");
  },

  openSubmittedDetail(applyId) {
    if (!applyId) return;
    wx.showToast({ title: "提现已提交", icon: "success" });
    setTimeout(() => openPage("withdraw-detail", { applyId }), 350);
  },

  toggleRules() {
    this.setData({ rulesExpanded: !this.data.rulesExpanded });
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
