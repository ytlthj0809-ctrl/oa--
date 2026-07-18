const {
  createClientRequestId,
  finishPageLoading,
  formatMoney,
  getMiniappDataDirtyAt,
  handlePageRequestError,
  markMiniappDataDirty,
  openPage,
  requireAnchorId,
  stopPullDownRefresh,
} = require("../../utils/api");
const { registerMiniappCacheResetter } = require("../../utils/cache");
const { decorateHome, decorateWithdrawRecord } = require("../../utils/decorators");
const { isPaymentInfoReady, isSigned } = require("../../utils/formatters");
const { parseAmountYuanToCents } = require("../../utils/validators");
const { createWithdrawApply, getHome, getWithdrawRules, listWithdrawApplies } = require("../../services/miniapp-api");
const {
  EMPTY_RULE_SNAPSHOT,
  buildDailySubmitMeta,
  buildWithdrawRuleView,
  buildRecordView,
  normalizeAmountInput,
} = require("../../utils/withdraw-helpers");
const {
  readPendingWithdrawAttempt,
  writePendingWithdrawAttempt,
  clearPendingWithdrawAttempt,
} = require("../../utils/pending-withdraw");
const { confirmWithdrawSubmit, buildAmountFeedback } = require("../../utils/withdraw-amount");

const WITHDRAW_CACHE_TTL_MS = 10 * 1000;

let withdrawCache = {
  anchorId: "",
  home: null,
  records: [],
  rules: null,
  loadedAt: 0,
};

function resetWithdrawCache() {
  withdrawCache = {
    anchorId: "",
    home: null,
    records: [],
    rules: null,
    loadedAt: 0,
  };
}

registerMiniappCacheResetter(resetWithdrawCache);

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
    submitResultUncertain: false,
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
    let anchorId = "";
    try {
      anchorId = requireAnchorId();
    } catch (error) {
      handlePageRequestError(this, error);
      return;
    }
    const pendingAttempt = readPendingWithdrawAttempt(anchorId);
    if (pendingAttempt) {
      this.setData({
        amountYuan: (Number(pendingAttempt.amountCents || 0) / 100).toFixed(2),
        submitResultUncertain: true,
        error: "上次提现的提交结果尚未确认，请查询结果，不要重复发起。",
        errorSource: "submit-uncertain",
      });
    } else if (this.data.submitResultUncertain) {
      this.setData({
        submitResultUncertain: false,
        ...(this.data.errorSource === "submit-uncertain" ? { error: "", errorSource: "" } : {}),
      });
    }
    this.loadWithdrawList({ force: Boolean(pendingAttempt) });
  },

  onUnload() {
    this.__withdrawStateGeneration = Number(this.__withdrawStateGeneration || 0) + 1;
  },

  onPullDownRefresh() {
    this.loadWithdrawList({ force: true }).finally(stopPullDownRefresh);
  },

  retryLoad() {
    if (this.data.errorSource === "submit-uncertain") {
      this.runWithdrawSubmit({ replayPending: true });
      return;
    }
    if (this.data.errorSource === "submit") {
      this.runWithdrawSubmit({ replayPending: false });
      return;
    }
    this.loadWithdrawList({ force: true });
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

  async loadWithdrawList(options = {}) {
    if (this.data.submitting) return;
    const generation = Number(this.__withdrawStateGeneration || 0) + 1;
    this.__withdrawStateGeneration = generation;
    let anchorId = "";
    this.setData({ loadingList: true, error: "", errorSource: "" });
    try {
      anchorId = requireAnchorId();
      const dirtyAt = getMiniappDataDirtyAt();
      const canUseCache = !options.force
        && withdrawCache.anchorId === anchorId
        && withdrawCache.home
        && withdrawCache.rules
        && withdrawCache.loadedAt >= dirtyAt
        && Date.now() - withdrawCache.loadedAt < WITHDRAW_CACHE_TTL_MS;
      let decoratedHome = withdrawCache.home;
      let records = withdrawCache.records;
      let rules = withdrawCache.rules;
      if (!canUseCache) {
        const [home, recordsRaw, latestRules] = await Promise.all([
          getHome(anchorId),
          listWithdrawApplies(anchorId),
          getWithdrawRules(),
        ]);
        if (generation !== this.__withdrawStateGeneration) return;
        decoratedHome = decorateHome(home);
        records = (recordsRaw || []).map(decorateWithdrawRecord);
        rules = latestRules;
        withdrawCache = {
          anchorId,
          home: decoratedHome,
          records,
          rules,
          loadedAt: Date.now(),
        };
      }
      if (generation !== this.__withdrawStateGeneration) return;
      const pendingAttempt = readPendingWithdrawAttempt(anchorId);
      const confirmedRecord = pendingAttempt
        ? records.find((record) => record.clientRequestId === pendingAttempt.clientRequestId)
        : null;
      if (confirmedRecord) clearPendingWithdrawAttempt(anchorId, pendingAttempt.clientRequestId);
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
        ...(confirmedRecord ? {
          submitResultUncertain: false,
          error: "",
          errorSource: "",
          successText: `已确认提现申请：${confirmedRecord.applyId}`,
        } : pendingAttempt ? {
          amountYuan: (Number(pendingAttempt.amountCents || 0) / 100).toFixed(2),
          submitResultUncertain: true,
          error: "上次提现的提交结果尚未确认，请点击“查询提交结果”。",
          errorSource: "submit-uncertain",
        } : {
          submitResultUncertain: false,
        }),
      });
    } catch (error) {
      if (generation !== this.__withdrawStateGeneration) return;
      if (handlePageRequestError(this, error)) return;
      const pendingAttempt = readPendingWithdrawAttempt(anchorId);
      if (pendingAttempt) {
        this.setData({
          amountYuan: (Number(pendingAttempt.amountCents || 0) / 100).toFixed(2),
          submitResultUncertain: true,
          error: `${error.userMessage || error.message || "提现记录加载失败"}。上次提现结果仍待确认，请查询结果。`,
          errorSource: "submit-uncertain",
        });
      } else {
        this.setData({ errorSource: "load" });
      }
    } finally {
      if (generation === this.__withdrawStateGeneration) {
        finishPageLoading(this, "loadingList");
      }
    }
  },

  async submitWithdraw() {
    return this.runWithdrawSubmit({ replayPending: false });
  },

  async runWithdrawSubmit({ replayPending = false } = {}) {
    if (this.data.submitting) return;
    const generation = Number(this.__withdrawStateGeneration || 0) + 1;
    this.__withdrawStateGeneration = generation;
    this.setData({ submitting: true, loadingList: false, error: "", errorSource: "", successText: "" });
    let requestStarted = false;
    let clientRequestId = "";
    let anchorId = "";
    try {
      anchorId = requireAnchorId();
      const pendingAttempt = readPendingWithdrawAttempt(anchorId);
      const canReplayPending = Boolean(pendingAttempt);
      if (replayPending && !canReplayPending) {
        throw new Error("未找到当前主播的待确认提现请求，请刷新后重试");
      }

      const amountCents = canReplayPending
        ? Number(pendingAttempt.amountCents)
        : parseAmountYuanToCents(this.data.amountYuan);
      clientRequestId = canReplayPending ? pendingAttempt.clientRequestId : "";

      if (canReplayPending) {
        if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !clientRequestId) {
          throw new Error("待确认提现请求不完整，请联系客服处理");
        }
        this.setData({
          amountYuan: (amountCents / 100).toFixed(2),
          submitResultUncertain: true,
          error: "",
          errorSource: "",
        });
      } else {
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
        if (!confirmed) return;
        clientRequestId = canReplayPending ? pendingAttempt.clientRequestId : createClientRequestId("withdraw");
        writePendingWithdrawAttempt({ anchorId, amountCents, clientRequestId, createdAt: Date.now() });
      }

      requestStarted = true;
      const apply = await createWithdrawApply({
        anchorId,
        amountCents,
        clientRequestId,
      });
      clearPendingWithdrawAttempt(anchorId, clientRequestId);
      markMiniappDataDirty();
      if (generation !== this.__withdrawStateGeneration) return;
      try { wx.vibrateShort({ type: "medium" }); } catch (_) {}
      this.setData({
        amountYuan: "",
        amountFeedbackText: "",
        amountFeedbackTone: "neutral",
        canSubmitAmount: false,
        submitResultUncertain: false,
        successText: `提现申请已提交：${apply.applyId}`,
      });
      try {
        const [latestHome, recordsRaw, latestRules] = await Promise.all([
          getHome(anchorId),
          listWithdrawApplies(anchorId),
          getWithdrawRules(),
        ]);
        if (generation !== this.__withdrawStateGeneration) return;
        const decoratedLatestHome = decorateHome(latestHome);
        const records = (recordsRaw || []).map(decorateWithdrawRecord);
        withdrawCache = {
          anchorId,
          home: decoratedLatestHome,
          records,
          rules: latestRules,
          loadedAt: Date.now(),
        };
        this.setData({
          home: decoratedLatestHome,
          ...buildWithdrawRuleView(latestRules),
          ...buildRecordView(records),
          ...buildDailySubmitMeta(records, latestRules.serverDate),
        });
        this.openSubmittedDetail(apply.applyId);
      } catch (refreshError) {
        if (generation !== this.__withdrawStateGeneration) return;
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
      if (generation !== this.__withdrawStateGeneration) return;
      if (handlePageRequestError(this, error)) return;
      const statusCode = Number(error.statusCode || 0);
      const isDefinitiveRejection = statusCode >= 400 && statusCode < 500;
      if (requestStarted && isDefinitiveRejection) {
        clearPendingWithdrawAttempt(anchorId, clientRequestId);
      }
      const remainingPending = readPendingWithdrawAttempt(anchorId);
      const resultUncertain = Boolean(remainingPending);
      this.setData({
        ...(remainingPending ? {
          amountYuan: (Number(remainingPending.amountCents || 0) / 100).toFixed(2),
        } : {}),
        submitResultUncertain: resultUncertain,
        error: resultUncertain
          ? `${requestStarted ? "提交结果尚未确认" : error.userMessage || error.message || "待确认请求暂时无法重放"}。请点击“查询提交结果”，系统会沿用同一请求号核对，避免重复提现。`
          : error.userMessage || error.message || "提现提交失败，请检查后重试",
        errorSource: resultUncertain ? "submit-uncertain" : "submit",
      });
    } finally {
      if (generation === this.__withdrawStateGeneration) {
        finishPageLoading(this, "submitting");
      }
    }
  },

  openRecords() {
    openPage("withdraw-records");
  },

  openSubmittedDetail(applyId) {
    if (!applyId) return;
    wx.showToast({ title: "提现已提交", icon: "success" });
    openPage("withdraw-detail", { applyId });
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
