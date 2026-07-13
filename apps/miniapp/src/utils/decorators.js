const { formatMoney } = require("./api");
const { directionLabel, formatDateShort, isPaymentInfoReady, isSigned, ruleCodeLabel, statusLabel, statusTone, typeLabel } = require("./formatters");

function buildGreeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 6) return "夜深了";
  if (hour < 9) return "早上好";
  if (hour < 12) return "上午好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  if (hour < 22) return "晚上好";
  return "夜深了";
}

function isRegistrationReady(status) {
  return ["ACTIVE", "APPROVED"].includes(String(status || "").trim().toUpperCase());
}

function isWhitelistReady(status) {
  return ["APPROVED", "AVAILABLE", "USED"].includes(String(status || "").trim().toUpperCase());
}

function buildProgressSteps(registrationStatus, whitelistStatus, paymentInfoStatus, signStatus) {
  const registrationDone = isRegistrationReady(registrationStatus);
  const whitelistDone = isWhitelistReady(whitelistStatus);
  const paymentInfoDone = isPaymentInfoReady(paymentInfoStatus);
  const steps = [
    { label: "注册审核", done: registrationDone },
    { label: "提现白名单", done: whitelistDone },
    { label: "打款信息", done: paymentInfoDone },
    { label: "签约", done: isSigned(signStatus) },
    { label: "提现", done: false },
  ];
  if (!registrationDone) steps[0].current = true;
  else if (!whitelistDone) steps[1].current = true;
  else if (!paymentInfoDone) steps[2].current = true;
  else if (!isSigned(signStatus)) steps[3].current = true;
  else steps[4].current = true;
  return steps;
}

function buildWithdrawGuideSteps(registrationStatus, whitelistStatus, paymentInfoStatus, signStatus) {
  const registrationDone = isRegistrationReady(registrationStatus);
  const whitelistDone = isWhitelistReady(whitelistStatus);
  const paymentInfoDone = isPaymentInfoReady(paymentInfoStatus);
  const signDone = isSigned(signStatus);
  const paymentInfoPending = ["PENDING", "PENDING_REVIEW"].includes(String(paymentInfoStatus || "").toUpperCase());
  return [
    {
      key: "registration",
      title: "主播注册",
      description: registrationDone ? "主播注册已通过审核" : "提交注册申请并等待后台审核",
      statusText: registrationDone ? "已通过" : statusLabel(registrationStatus),
      tone: registrationDone ? "success" : "warning",
      buttonText: registrationDone ? "查看状态" : "去注册",
      page: "register",
      disabled: false,
    },
    {
      key: "whitelist",
      title: "提现白名单",
      description: whitelistDone ? "平台账号已纳入提现白名单" : "请线下联系运营上传白名单并完成账号核对",
      statusText: whitelistDone ? "已就绪" : "待运营处理",
      tone: whitelistDone ? "success" : "warning",
      buttonText: "查看注册状态",
      page: "register",
      disabled: !registrationDone,
      disabledText: "请先完成主播注册审核",
    },
    {
      key: "payment-info",
      title: "打款信息",
      description: paymentInfoDone
        ? "实名和收款信息已生效"
        : paymentInfoPending
          ? "打款信息待审核，审核通过后才可签约提现"
          : "先补充本人实名和收款信息",
      statusText: paymentInfoDone ? "已完成" : paymentInfoPending ? "待审核" : "待完成",
      tone: paymentInfoDone ? "success" : "warning",
      buttonText: paymentInfoDone ? "查看信息" : paymentInfoPending ? "查看进度" : "去补充",
      page: "payment-info",
      disabled: !(registrationDone && whitelistDone),
      disabledText: "请先完成注册审核和提现白名单",
    },
    {
      key: "sign",
      title: "云账户签约",
      description: signDone ? "云账户签约已完成" : "使用已保存实名信息完成云账户签约",
      statusText: signDone ? "已完成" : "待签约",
      tone: signDone ? "success" : "warning",
      buttonText: signDone ? "查看状态" : "去签约",
      page: "sign",
      disabled: !(registrationDone && whitelistDone && paymentInfoDone),
      disabledText: "注册、白名单和打款信息均就绪后才能签约",
    },
    {
      key: "withdraw",
      title: "提交提现",
      description: registrationDone && whitelistDone && paymentInfoDone && signDone ? "可提交提现申请" : "完成前四步后开放提现",
      statusText: registrationDone && whitelistDone && paymentInfoDone && signDone ? "可提现" : "未开放",
      tone: registrationDone && whitelistDone && paymentInfoDone && signDone ? "success" : "neutral",
      buttonText: "去提现",
      page: "withdraw",
      disabled: !(registrationDone && whitelistDone && paymentInfoDone && signDone),
      disabledText: "需先完成注册、白名单、有效打款信息和签约",
    },
  ];
}

function decorateSignStatus(signStatus) {
  const normalized = signStatus || { signStatus: "UNSIGNED" };
  const status = normalized.signStatus || "UNSIGNED";
  return {
    ...normalized,
    signStatusText: statusLabel(status),
    signStatusTone: statusTone(status),
    isSigned: isSigned(status),
    actionHint: isSigned(status)
      ? "已完成签约，可以返回提现继续提交申请。"
      : "请使用本人实名信息生成云账户签约入口，并在云账户助手中完成签约。",
  };
}

function buildWithdrawRecordSteps(statusValue) {
  const status = String(statusValue || "").trim().toUpperCase();
  const steps = [
    { key: "submitted", label: "已提交" },
    { key: "first-review", label: "初审" },
    { key: "finance-review", label: "财审" },
    { key: "super-review", label: "终审" },
    { key: "batch", label: "成批" },
    { key: "pay", label: "付款" },
  ];
  const failedStepByStatus = {
    CANCELLED: 1,
    FAILED: 1,
    FINANCE_REJECTED: 2,
    FIRST_REJECTED: 1,
    PAY_FAILED: 5,
    REJECTED: 1,
    RETURNED: 5,
    SUPER_REJECTED: 3,
  };
  const currentStepByStatus = {
    PENDING_FIRST_REVIEW: 1,
    PENDING_REVIEW: 1,
    SUBMITTED: 1,
    PENDING_FINANCE_REVIEW: 2,
    PENDING_SUPER_REVIEW: 3,
    WAIT_BATCH: 4,
    BATCH_CREATED: 4,
    WAIT_PAY: 5,
    PAYING: 5,
  };
  const doneUntilByStatus = {
    PAID: 5,
    COMPLETED: 5,
    SUCCESS: 5,
    WAIT_PAY: 4,
    PAYING: 4,
    WAIT_BATCH: 3,
    BATCH_CREATED: 3,
    PENDING_SUPER_REVIEW: 2,
    PENDING_FINANCE_REVIEW: 1,
    PENDING_FIRST_REVIEW: 0,
    PENDING_REVIEW: 0,
    SUBMITTED: 0,
  };
  const failedStep = failedStepByStatus[status];
  const currentStep = failedStep !== undefined ? failedStep : currentStepByStatus[status];
  const doneUntil = failedStep !== undefined
    ? Math.max(0, failedStep - 1)
    : doneUntilByStatus[status] ?? 0;
  const progressSteps = steps.map((step, index) => ({
    ...step,
    index: index + 1,
    done: index <= doneUntil,
    current: currentStep === index,
    failed: failedStep === index,
  }));
  const current = progressSteps.find((step) => step.current || step.failed) || progressSteps.find((step) => !step.done) || progressSteps[progressSteps.length - 1];
  const summaryPrefix = failedStep !== undefined ? "当前卡在" : "当前进度";
  return {
    currentStepText: current ? current.label : "-",
    progressSteps,
    progressSummaryText: `${summaryPrefix}：${current ? current.label : "-"}`,
  };
}

function decorateHome(home = {}) {
  const todayMetrics = home.todayMetrics || {};
  const registrationStatus = home.registrationStatus || "MISSING";
  const whitelistStatus = home.whitelistStatus || "MISSING";
  const paymentInfoStatus = home.paymentInfoStatus || "MISSING";
  const signStatus = home.signStatus || "UNSIGNED";
  const registrationDone = isRegistrationReady(registrationStatus);
  const whitelistDone = isWhitelistReady(whitelistStatus);
  const paymentInfoDone = isPaymentInfoReady(paymentInfoStatus);
  const withdrawReady = registrationDone && whitelistDone && paymentInfoDone && isSigned(signStatus);
  const nextAction = !registrationDone
    ? { text: "请先提交主播注册申请并等待审核", buttonText: "查看注册状态", page: "register", tone: "warning" }
    : !whitelistDone
      ? { text: "提现白名单尚未就绪，请线下联系运营处理", buttonText: "查看注册状态", page: "register", tone: "warning" }
      : !paymentInfoDone
        ? { text: "打款信息生效后才能继续签约和提现", buttonText: "查看打款信息", page: "payment-info", tone: "warning" }
        : !isSigned(signStatus)
          ? { text: "请完成云账户签约", buttonText: "去签约", page: "sign", tone: "warning" }
          : { text: "可以提交提现申请", buttonText: "去提现", page: "withdraw", tone: "success" };

  return {
    ...home,
    availableBalanceText: formatMoney(home.availableBalanceCents),
    frozenBalanceText: formatMoney(home.frozenBalanceCents),
    greetingText: buildGreeting(),
    paymentInfoSummary: home.paymentInfoSummary || {},
    paymentInfoStatusText: statusLabel(paymentInfoStatus),
    paymentInfoStatusTone: statusTone(paymentInfoStatus),
    registrationStatusText: registrationStatus === "MISSING" ? "未提交" : statusLabel(registrationStatus),
    registrationStatusTone: statusTone(registrationStatus),
    whitelistStatusText: whitelistStatus === "MISSING" ? "未在白名单" : statusLabel(whitelistStatus),
    whitelistStatusTone: statusTone(whitelistStatus),
    progressSteps: buildProgressSteps(registrationStatus, whitelistStatus, paymentInfoStatus, signStatus),
    withdrawGuideSteps: buildWithdrawGuideSteps(registrationStatus, whitelistStatus, paymentInfoStatus, signStatus),
    rewardBalanceText: formatMoney(home.rewardBalanceCents),
    signStatusText: statusLabel(signStatus),
    signStatusTone: statusTone(signStatus),
    withdrawReady,
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
  const progress = buildWithdrawRecordSteps(status);
  return {
    ...record,
    amountText: formatMoney(record.amountCents),
    createdAtText: formatDateShort(record.createdAt),
    displayStatusText: record.statusText || statusLabel(status),
    displayStatusTone: statusTone(status),
    progressText: progress.progressSummaryText,
    ...progress,
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
  buildGreeting,
  decorateBalanceFlow,
  decorateDataSnapshot,
  decorateHome,
  decorateReward,
  decorateSignStatus,
  decorateWithdrawRecord,
};
