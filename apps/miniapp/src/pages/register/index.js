const { appendQuery, openPage, request } = require("../../utils/api");

function buildDefaultForm() {
  return {
    anchorCode: "",
    displayName: "",
    mobile: "",
    password: "",
    confirmPassword: "",
    platform: "",
    accountNo: "",
    protocolChecked: false,
  };
}

Page({
  data: {
    form: buildDefaultForm(),
    submitting: false,
    loadingStatus: false,
    error: "",
    latestRequest: null,
    sourceText: "注册后由后台审核，打款信息在提现前单独填写。",
  },

  onLoad(options = {}) {
    if (options.from === "wechatLogin") {
      this.setData({ sourceText: "当前微信尚未绑定主播账号，请先提交注册申请。审核通过后可直接登录。" });
    }
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      form: {
        ...this.data.form,
        [field]: event.detail.value,
      },
    });
  },

  toggleProtocol(event) {
    this.setData({
      form: {
        ...this.data.form,
        protocolChecked: Boolean(event.detail.value),
      },
    });
  },

  async submitRegistration() {
    this.setData({ submitting: true, error: "" });
    try {
      if (this.data.form.password !== this.data.form.confirmPassword) {
        throw new Error("两次密码不一致");
      }
      if (!this.data.form.protocolChecked) {
        throw new Error("请先同意协议和隐私政策");
      }
      const wechatBindToken = wx.getStorageSync("jy-miniapp-wechat-bind-token") || "";
      const result = await request("/api/miniapp/anchor-registration-requests", {
        method: "POST",
        data: {
          ...this.data.form,
          openId: wechatBindToken || `local-openid-${this.data.form.mobile}`,
          operatorId: "MINIAPP",
        },
      });
      if (wechatBindToken) {
        wx.removeStorageSync("jy-miniapp-wechat-bind-token");
      }
      this.setData({ latestRequest: result });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async refreshRegistrationStatus() {
    this.setData({ loadingStatus: true, error: "" });
    try {
      const records = await request(appendQuery("/api/miniapp/anchor-registration-requests", { mobile: this.data.form.mobile }));
      this.setData({ latestRequest: records[0] || null });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loadingStatus: false });
    }
  },

  goLogin() {
    wx.redirectTo({ url: "/src/pages/login/index" });
  },

  openProtocols() {
    openPage("protocols");
  },
});
