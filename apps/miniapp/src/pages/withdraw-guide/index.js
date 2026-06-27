const { openPage } = require("../../utils/api");

const reasonMap = {
  RULES: {
    title: "提现规则说明",
    detail: "提交提现前请确认可提现额度、每日次数、提现时间和到账时间。",
    actionText: "返回提现",
    page: "",
  },
  PAYMENT_INFO_MISSING: {
    title: "请先补充打款信息",
    detail: "提现前需要完成实名和银行卡信息，保存后再返回提现。",
    actionText: "去填写",
    page: "payment-info-form",
  },
  YZH_UNSIGNED: {
    title: "请先完成云账户签约",
    detail: "签约完成后，系统才能提交提现并进入打款流程。",
    actionText: "去签约",
    page: "sign",
  },
};

const ruleSections = [
  {
    title: "可提现额度",
    detail: "页面展示的可提现余额为当前可提交上限，冻结余额和未结算金额暂不可提现。",
  },
  {
    title: "每日提现次数",
    detail: "测试阶段每日最多提交 1 次提现申请；页面会展示今日剩余次数。",
  },
  {
    title: "提现时间",
    detail: "每日 09:00-18:00 可提交提现申请，非窗口期请等待下一可提交时段。",
  },
  {
    title: "到账时间",
    detail: "预计次日到账，节假日、银行处理或人工复核异常时可能顺延。",
  },
  {
    title: "单笔限额",
    detail: "单笔最低 1 元，最高不超过页面展示的可提现余额。",
  },
  {
    title: "手续费",
    detail: "测试阶段不收手续费；生产阶段以平台页面公示和财务规则为准。",
  },
  {
    title: "余额冻结",
    detail: "提现提交后冻结对应余额，申请失败、驳回或取消时自动退回可提现余额。",
  },
  {
    title: "审核流程",
    detail: "申请需经过初审、财务复核、成批和打款确认，最终以财务与云账户打款结果为准。",
  },
  {
    title: "异常处理",
    detail: "资料缺失、未签约、余额不足、超过次数或风控异常时不可提交或会进入人工复核。",
  },
];

Page({
  data: {
    reason: "PAYMENT_INFO_MISSING",
    guide: reasonMap.PAYMENT_INFO_MISSING,
    ruleSections,
  },

  onLoad(options = {}) {
    const reason = options.reason || "PAYMENT_INFO_MISSING";
    this.setData({ reason, guide: reasonMap[reason] || reasonMap.PAYMENT_INFO_MISSING });
  },

  goAction() {
    if (!this.data.guide.page) {
      this.goWithdraw();
      return;
    }
    openPage(this.data.guide.page);
  },

  goWithdraw() {
    wx.switchTab({ url: "/src/pages/withdraw/index" });
  },
});
