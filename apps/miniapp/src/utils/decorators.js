const { formatMoney } = require("./api");
const { directionLabel, formatDateShort, isSigned, ruleCodeLabel, statusLabel, statusTone, typeLabel } = require("./formatters");

function buildGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 9) return "早上好";
  if (hour < 12) return "上午好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  if (hour < 22) return "晚上好";
  return "夜深了";
}

function buildProgressSteps(paymentInfoStatus, signStatus) {
  const steps = [
    { label: "打款信息", done: paymentInfoStatus !== "MISSING" },
    { label: "签约", done: isSigned(signStatus) },
    { label: "提现", done: false },
  ];
  if (paymentInfoStatus === "MISSING") steps[0].current = true;
  else if (!isSigned(signStatus)) steps[1].current = true;
  else steps[2].current = true;
  return steps;
}

function decorateHome(home = {}) {
  const todayMetrics = home.todayMetrics || {};
  const paymentInfoStatus = home.paymentInfoStatus || "MISSING";
  const signStatus = home.signStatus || "UNSIGNED";
  const nextAction = !home.paymentInfoStatus || paymentInfoStatus === "MISSING"
    ? { text: "请先补充打款信息", buttonText: "去补充", page: "payment-info" }
    : !isSigned(signStatus)
      ? { text: "请完成云账户签约", buttonText: "去签约", page: "sign" }
      : { text: "可以提交提现申请", buttonText: "去提现", page: "withdraw" };

  return {
    ...home,
    availableBalanceText: formatMoney(home.availableBalanceCents),
    frozenBalanceText: formatMoney(home.frozenBalanceCents),
    greetingText: buildGreeting(),
    paymentInfoStatusText: statusLabel(paymentInfoStatus),
    paymentInfoStatusTone: statusTone(paymentInfoStatus),
    progressSteps: buildProgressSteps(paymentInfoStatus, signStatus),
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
    createdAtText: formatDateShort(record.createdAt),
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
    createdAtText: formatDateShort(item.createdAt),
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
    ruleCodeLabelText: ruleCodeLabel(item.ruleCode),
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
