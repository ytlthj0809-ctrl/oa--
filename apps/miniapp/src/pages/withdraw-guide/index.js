const { openPage } = require("../../utils/api");

const reasonMap = {
  RULES: {
    title: "提现规则说明",
    detail: "提交提现前请确认可提现额度、提现时间、签约状态和到账说明。",
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
    detail: "不限次数；后台仍会根据签约、余额、不可提现时段和风控规则拦截异常申请。",
  },
  {
    title: "提现时间",
    detail: "当前每日 08:00-16:30 可提交；后台可调整不可提现时段，页面提示以最新配置为准。",
  },
  {
    title: "到账时间",
    detail: "预计当日到账；如遇人工复核、银行处理或后台调整可能顺延。",
  },
  {
    title: "单笔限额",
    detail: "单笔最低 100 元，无固定上限，最高不超过页面展示的可提现余额。",
  },
  {
    title: "手续费",
    detail: "嘉音不扣平台服务费和银行/第三方手续费；税费由云账户代扣代缴，提现页不展示扣费拆分。",
  },
  {
    title: "余额冻结",
    detail: "提现提交后冻结对应余额，申请失败、驳回或取消时自动退回可提现余额。",
  },
  {
    title: "审核流程",
    detail: "申请需经过财务经理初审、管理员财审、超管终审和线下付款登记，最终以财务线下确认和系统登记结果为准。",
  },
  {
    title: "异常处理",
    detail: "资料缺失、未签约、余额不足、处于不可提现时段或风控异常时不可提交或会进入人工复核。",
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
