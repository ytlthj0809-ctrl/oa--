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
const {
  CHINA_TIME_OFFSET_MS,
  WITHDRAW_MIN_AMOUNT_CENTS,
  WITHDRAW_SUBMIT_END_MINUTE_OF_DAY,
  WITHDRAW_SUBMIT_START_MINUTE_OF_DAY,
} = require("../../utils/constants");
const { decorateHome, decorateWithdrawRecord } = require("../../utils/decorators");
const { isSigned } = require("../../utils/formatters");
const { parseAmountYuanToCents } = require("../../utils/validators");
const { createWithdrawApply, getHome, listWithdrawApplies } = require("../../services/miniapp-api");

const withdrawRuleSnapshot = {
  dailyLimitText: "不限次数",
  windowText: "每日 08:00-16:30 可提交，后台可调整不可提现时段",
  arrivalText: "预计当日到账",
  amountRangeText: "单笔最低 100 元，无固定上限，最高不超过可提现余额",
  feeText: "不扣平台服务费和银行/第三方手续费；税费由云账户代扣代缴",
  frozenText: "提交后冻结对应余额，失败或驳回自动退回",
  auditText: "申请需通过财务经理初审、管理员财审、超管终审和线下付款登记",
  exceptionText: "资料缺失、未签约、余额不足或处于不可提现时段时不可提交",
};

function getChinaDateKey(date = new Date()) {
  return new Date(date.getTime() + CHINA_TIME_OFFSET_MS).toISOString().slice(0, 10);
}

function getChinaDateKeyFromValue(value) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return getChinaDateKey(parsed);
  return String(value || "").slice(0, 10);
}

function getChinaMinuteOfDay(date = new Date()) {
  const [hour, minute] = new Date(date.getTime() + CHINA_TIME_OFFSET_MS)
    .toISOString()
    .slice(11, 16)
    .split(":")
    .map(Number);
  return hour * 60 + minute;
}

function isWithdrawSubmitWindowOpen(date = new Date()) {
  const minuteOfDay = getChinaMinuteOfDay(date);
  return minuteOfDay >= WITHDRAW_SUBMIT_START_MINUTE_OF_DAY && minuteOfDay < WITHDRAW_SUBMIT_END_MINUTE_OF_DAY;
}

function buildDailySubmitMeta(records = []) {
  const today = getChinaDateKey();
  const todayCount = records.filter((record) => getChinaDateKeyFromValue(record.createdAt) === today).length;
  return {
    dailyRemain: null,
    dailyRemainText: `今日已提交 ${todayCount} 次，不限次数`,
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

function buildAmountFeedback({ amountYuan, availableBalanceCents }) {
  const text = String(amountYuan || "").trim();
  if (!text) {
    return { amountFeedbackText: "", amountFeedbackTone: "neutral", canSubmitAmount: false };
  }
  try {
    const amountCents = parseAmountYuanToCents(text);
    if (amountCents < WITHDRAW_MIN_AMOUNT_CENTS) {
      return {
        amountFeedbackText: `单笔提现最低 ${formatMoney(WITHDRAW_MIN_AMOUNT_CENTS)}`,
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
    withdrawRuleSnapshot,
    dailyRemain: null,
    dailyRemainText: "今日不限提交次数",
    submitWindowText: withdrawRuleSnapshot.windowText,
    arrivalText: withdrawRuleSnapshot.arrivalText,
    loadingList: false,
    submitting: false,
    error: "",
    errorSource: "",
    successText: "",
    records: [],
    emptyText: "暂无提现记录",
    rulesExpanded: true,
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
    const amountYuan = event.detail.value;
    this.setData({
      amountYuan,
      ...buildAmountFeedback({
        amountYuan,
        availableBalanceCents: this.data.home && this.data.home.availableBalanceCents,
      }),
    });
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
      ...buildAmountFeedback({ amountYuan, availableBalanceCents }),
    });
  },

  async loadWithdrawList() {
    this.setData({ loadingList: true, error: "", errorSource: "" });
    try {
      const anchorId = requireAnchorId();
      const [home, recordsRaw] = await Promise.all([
        getHome(anchorId),
        listWithdrawApplies(anchorId),
      ]);
      const decoratedHome = decorateHome(home);
      const records = (recordsRaw || []).map(decorateWithdrawRecord);
      this.setData({
        home: decoratedHome,
        ...buildDailySubmitMeta(records),
        records,
        emptyText: records.length ? "" : "暂无提现记录",
        ...buildAmountFeedback({
          amountYuan: this.data.amountYuan,
          availableBalanceCents: decoratedHome.availableBalanceCents,
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
      if (!Number.isFinite(amountCents) || amountCents < WITHDRAW_MIN_AMOUNT_CENTS) {
        throw new Error("单笔提现最低 100 元");
      }
      if (!this.data.home) {
        throw new Error("余额和提现条件未加载，请刷新后再提交");
      }
      if (amountCents > Number(this.data.home.availableBalanceCents || 0)) {
        throw new Error("提现金额不能超过可提现余额");
      }
      if (this.data.home.paymentInfoStatus === "MISSING") {
        wx.showToast({ title: "请先填写打款信息", icon: "none" });
        openPage("withdraw-guide", { reason: "PAYMENT_INFO_MISSING" });
        return;
      }
      if (!isSigned(this.data.home.signStatus)) {
        wx.showToast({ title: "请先完成签约", icon: "none" });
        openPage("withdraw-guide", { reason: "YZH_UNSIGNED" });
        return;
      }
      if (!isWithdrawSubmitWindowOpen()) {
        throw new Error("请在每日 08:00-16:30 提交提现申请");
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
        const [latestHome, recordsRaw] = await Promise.all([
          getHome(anchorId),
          listWithdrawApplies(anchorId),
        ]);
        const records = (recordsRaw || []).map(decorateWithdrawRecord);
        this.setData({
          home: decorateHome(latestHome),
          records,
          emptyText: "",
          ...buildDailySubmitMeta(records),
        });
      } catch (refreshError) {
        const nextRecords = [decorateWithdrawRecord(apply), ...this.data.records.filter((record) => record.applyId !== apply.applyId)];
        this.setData({
          records: nextRecords,
          emptyText: "",
          ...buildDailySubmitMeta(nextRecords),
          error: "提现已提交成功，但记录刷新失败，请稍后下拉或进入提现记录查看。",
          errorSource: "load",
        });
      }
    } catch (error) {
      if (handlePageRequestError(this, error)) return;
      this.setData({ error: error.message, errorSource: "submit" });
    } finally {
      if (!this.__authRedirecting) this.setData({ submitting: false });
    }
  },

  openRecords() {
    openPage("withdraw-records");
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
