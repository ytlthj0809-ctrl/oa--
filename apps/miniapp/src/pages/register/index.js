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
    bankAccountNo: "",
    idCardNo: "",
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
      const result = await request("/api/miniapp/anchor-registration-requests", {
        method: "POST",
        data: {
          ...this.data.form,
          openId: `local-openid-${this.data.form.mobile}`,
          operatorId: "MINIAPP",
        },
      });
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
