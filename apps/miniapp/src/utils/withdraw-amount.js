const { formatMoney } = require("./api");
const { parseAmountYuanToCents } = require("./validators");

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

module.exports = {
  confirmWithdrawSubmit,
  buildAmountFeedback,
};
