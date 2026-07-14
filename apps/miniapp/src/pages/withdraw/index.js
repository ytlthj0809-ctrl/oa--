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
const { CHINA_TIME_OFFSET_MS } = require("../../utils/constants");
const { decorateHome, decorateWithdrawRecord } = require("../../utils/decorators");
const { isPaymentInfoReady, isSigned } = require("../../utils/formatters");
const { parseAmountYuanToCents } = require("../../utils/validators");
const { createWithdrawApply, getHome, getWithdrawRules, listWithdrawApplies } = require("../../services/miniapp-api");

const pendingWithdrawStorageKey = "withdraw-oa.miniapp.pending-withdraw";
const pendingWithdrawMaxAgeMs = 24 * 60 * 60 * 1000;
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

function readPendingWithdrawAttempts() {
  const stored = wx.getStorageSync(pendingWithdrawStorageKey);
  if (!stored) return {};
  if (stored.attempts && typeof stored.attempts === "object") return stored.attempts;
  if (stored.anchorId && stored.clientRequestId) return { [stored.anchorId]: stored };
  return {};
}

function persistPendingWithdrawAttempts(attempts = {}) {
  if (Object.keys(attempts).length === 0) {
    wx.removeStorageSync(pendingWithdrawStorageKey);
    return;
  }
  wx.setStorageSync(pendingWithdrawStorageKey, { version: 2, attempts });
}

function readPendingWithdrawAttempt(anchorId) {
  if (!anchorId) return null;
  const attempts = readPendingWithdrawAttempts();
  const attempt = attempts[anchorId];
  if (!attempt || !attempt.clientRequestId || attempt.anchorId !== anchorId) return null;
  if (Date.now() - Number(attempt.createdAt || 0) > pendingWithdrawMaxAgeMs) {
    delete attempts[anchorId];
    persistPendingWithdrawAttempts(attempts);
    return null;
  }
  return attempt;
}

function writePendingWithdrawAttempt(attempt) {
  const anchorId = String(attempt && attempt.anchorId || "").trim();
  if (!anchorId || !attempt.clientRequestId) throw new Error("提现请求信息不完整，请刷新后重试");
  const attempts = readPendingWithdrawAttempts();
  const current = attempts[anchorId];
  if (current && current.clientRequestId !== attempt.clientRequestId) {
    throw new Error("上次提现结果尚未确认，不能发起新请求");
  }
  attempts[anchorId] = attempt;
  persistPendingWithdrawAttempts(attempts);
  return attempt;
}

function clearPendingWithdrawAttempt(anchorId, clientRequestId = "") {
  if (!anchorId) return;
  const attempts = readPendingWithdrawAttempts();
  const current = attempts[anchorId];
  if (!current || (clientRequestId && current.clientRequestId !== clientRequestId)) return;
  delete attempts[anchorId];
  persistPendingWithdrawAttempts(attempts);
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
    submitResultUncertain: false,
    error: "",
    errorSource: "",
    successText: "",
    records: [],
    recentRecords: [],
    emptyText: "暂无提现记录",
    rulesExpanded: true,
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
