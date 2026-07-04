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
  WITHDRAW_DAILY_LIMIT,
  WITHDRAW_MIN_AMOUNT_CENTS,
  WITHDRAW_SUBMIT_END_HOUR,
  WITHDRAW_SUBMIT_START_HOUR,
} = require("../../utils/constants");
const { decorateHome, decorateWithdrawRecord } = require("../../utils/decorators");
const { isSigned } = require("../../utils/formatters");
const { parseAmountYuanToCents } = require("../../utils/validators");
const { createWithdrawApply, getHome, listWithdrawApplies } = require("../../services/miniapp-api");

const withdrawRuleSnapshot = {
  dailyLimitText: "每日最多 1 次",
  windowText: "每日 09:00-18:00 可提交",
  arrivalText: "预计次日到账，节假日或银行处理可能顺延",
  amountRangeText: "单笔最低 1 元，最高不超过可提现余额",
  feeText: "当前不收取提现手续费；后续如有调整以平台公示和财务规则为准",
  frozenText: "提交后冻结对应余额，失败或驳回自动退回",
  auditText: "申请需通过初审、财务复核、成批和打款确认",
  exceptionText: "资料缺失、未签约或余额不足时不可提交",
};

function getChinaDateKey(date = new Date()) {
  return new Date(date.getTime() + CHINA_TIME_OFFSET_MS).toISOString().slice(0, 10);
}

function getChinaDateKeyFromValue(value) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return getChinaDateKey(parsed);
  return String(value || "").slice(0, 10);
}

function getChinaHour(date = new Date()) {
  return Number(new Date(date.getTime() + CHINA_TIME_OFFSET_MS).toISOString().slice(11, 13));
}

function confirmWithdrawSubmit({ amountText, availableBalanceText, dailyRemainText }) {
  const remainText = dailyRemainText || "请确认今日次数";
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
    dailyRemain: 1,
    dailyRemainText: "今日剩余 1 次",
    submitWindowText: withdrawRuleSnapshot.windowText,
    arrivalText: withdrawRuleSnapshot.arrivalText,
    loadingList: false,
    submitting: false,
    error: "",
    errorSource: "",
    successText: "",
    records: [],
    emptyText: "暂无提现记录",
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
      const today = getChinaDateKey();
      const todayCount = records.filter((record) => getChinaDateKeyFromValue(record.createdAt) === today).length;
      const dailyRemain = Math.max(0, WITHDRAW_DAILY_LIMIT - todayCount);
      this.setData({
        home: decoratedHome,
        dailyRemain,
        dailyRemainText: `今日剩余 ${dailyRemain} 次`,
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
      if (!Number.isFinite(amountCents) || amountCents < 100) {
        throw new Error("单笔提现最低 1 元");
      }
      if (!this.data.home) {
        throw new Error("余额和提现条件未加载，请刷新后再提交");
      }
      if (amountCents > Number(this.data.home.availableBalanceCents || 0)) {
        throw new Error("提现金额不能超过可提现余额");
      }
      if (this.data.dailyRemain <= 0) {
        throw new Error("今日提现次数已用完");
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
      const hour = getChinaHour();
      if (hour < WITHDRAW_SUBMIT_START_HOUR || hour >= WITHDRAW_SUBMIT_END_HOUR) {
        throw new Error("请在每日 09:00-18:00 提交提现申请");
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
          dailyRemain: 0,
          dailyRemainText: "今日剩余 0 次",
        });
      } catch (refreshError) {
        const nextRecords = [decorateWithdrawRecord(apply), ...this.data.records.filter((record) => record.applyId !== apply.applyId)];
        this.setData({
          records: nextRecords,
          emptyText: "",
          dailyRemain: 0,
          dailyRemainText: "今日剩余 0 次",
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

  openGuide() {
    openPage("withdraw-guide", { reason: "RULES" });
  },

  openDetail(event) {
    const applyId = event.currentTarget.dataset.applyId;
    if (!applyId) return;
    openPage("withdraw-detail", { applyId });
  },
});
