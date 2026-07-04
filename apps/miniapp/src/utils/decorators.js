const { formatMoney } = require("./api");
const { directionLabel, isSigned, statusLabel, statusTone, typeLabel } = require("./formatters");

function decorateHome(home = {}) {
  const todayMetrics = home.todayMetrics || {};
  const paymentInfoStatus = home.paymentInfoStatus || "MISSING";
  const signStatus = home.signStatus || "UNSIGNED";
  const nextAction = !home.paymentInfoStatus || paymentInfoStatus === "MISSING"
    ? { text: "请先补充打款信息", page: "payment-info" }
    : !isSigned(signStatus)
      ? { text: "请完成云账户签约", page: "sign" }
      : { text: "可以提交提现申请", page: "withdraw" };

  return {
    ...home,
    availableBalanceText: formatMoney(home.availableBalanceCents),
    frozenBalanceText: formatMoney(home.frozenBalanceCents),
    paymentInfoStatusText: statusLabel(paymentInfoStatus),
    paymentInfoStatusTone: statusTone(paymentInfoStatus),
    rewardBalanceText: formatMoney(home.rewardBalanceCents),
    signStatusText: statusLabel(signStatus),
    signStatusTone: statusTone(signStatus),
    nextAction,
    todayMetrics: {
      incomeCents: todayMetrics.incomeCents || 0,
      validDurationMinutes: todayMetrics.validDurationMinutes || 0,
      validDays: todayMetrics.validDays || 0,
      taskStatus: todayMetrics.taskStatus || "-",
      taskStatusText: statusLabel(todayMetrics.taskStatus),
      taskStatusTone: statusTone(todayMetrics.taskStatus),
    },
    todayIncomeText: formatMoney(todayMetrics.incomeCents),
  };
}

function decorateWithdrawRecord(record = {}) {
  const status = record.status || record.reviewStatus;
  return {
    ...record,
    amountText: formatMoney(record.amountCents),
    displayStatusText: record.statusText || statusLabel(status),
    displayStatusTone: statusTone(status),
    progressText: `进度 ${record.progressStep || 0}/5`,
    statusText: record.statusText || statusLabel(status),
    statusTone: statusTone(status),
  };
}

function decorateBalanceFlow(item = {}) {
  return {
    ...item,
    amountText: formatMoney(item.amountCents),
    directionText: directionLabel(item.direction),
    flowTypeText: typeLabel(item.flowType),
    statusText: statusLabel(item.status),
    statusTone: statusTone(item.status),
  };
}

function decorateReward(item = {}) {
  return {
    ...item,
    rewardText: formatMoney(item.rewardCents || item.rewardAmountCents),
    statusText: statusLabel(item.status),
    statusTone: statusTone(item.status),
  };
}

function decorateDataSnapshot(snapshot = {}) {
  return {
    ...snapshot,
    durationText: `${snapshot.validDurationMinutes || 0} 分钟`,
    incomeText: formatMoney(snapshot.incomeCents),
    taskStatusText: statusLabel(snapshot.taskStatus),
    taskStatusTone: statusTone(snapshot.taskStatus),
  };
}

module.exports = {
  decorateBalanceFlow,
  decorateDataSnapshot,
  decorateHome,
  decorateReward,
  decorateWithdrawRecord,
};
