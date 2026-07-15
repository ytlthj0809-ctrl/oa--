const { openPage } = require("../../utils/api");
const { getWithdrawRules } = require("../../services/miniapp-api");

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

Page({
  data: {
    reason: "PAYMENT_INFO_MISSING",
    guide: reasonMap.PAYMENT_INFO_MISSING,
    ruleSections: [],
    loadingRules: true,
    ruleError: "",
    fromLogin: false,
  },

  onLoad(options = {}) {
    const reason = options.reason || "PAYMENT_INFO_MISSING";
    this.setData({
      reason,
      guide: reasonMap[reason] || reasonMap.PAYMENT_INFO_MISSING,
      fromLogin: options.from === "login",
    });
    this.loadRules();
  },

  async loadRules() {
    this.setData({ loadingRules: true, ruleError: "" });
    try {
      const rules = await getWithdrawRules({ auth: false, skipAuthRedirect: true });
      this.setData({ ruleSections: rules.ruleSections || [] });
    } catch (error) {
      this.setData({ ruleError: error.message || "提现规则加载失败，请稍后重试" });
    } finally {
      this.setData({ loadingRules: false });
    }
  },

  goAction() {
    if (this.data.fromLogin) {
      wx.redirectTo({ url: "/src/pages/login/index" });
      return;
    }
    if (!this.data.guide.page) return this.goWithdraw();
    openPage(this.data.guide.page);
  },

  goWithdraw() {
    if (this.data.fromLogin) {
      wx.redirectTo({ url: "/src/pages/login/index" });
      return;
    }
    wx.switchTab({ url: "/src/pages/withdraw/index" });
  },
});
