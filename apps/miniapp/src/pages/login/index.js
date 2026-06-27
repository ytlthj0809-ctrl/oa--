const { openPage, request, setSession } = require("../../utils/api");

Page({
  data: {
    form: {
      mobile: "",
      password: "",
    },
    submitting: false,
    error: "",
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
  },

  async submitLogin() {
    this.setData({ submitting: true, error: "" });
    try {
      if (!this.data.form.mobile) throw new Error("请输入手机号");
      if (!this.data.form.password) throw new Error("请输入密码");
      const session = await request("/api/miniapp/auth/login", {
        method: "POST",
        data: {
          mobile: this.data.form.mobile,
          password: this.data.form.password,
        },
      });
      setSession(session);
      if (session.protocolStatus && session.protocolStatus !== "AGREED") {
        wx.redirectTo({ url: "/src/pages/protocols/index?mode=required" });
        return;
      }
      wx.switchTab({ url: "/src/pages/home/index" });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ submitting: false });
    }
  },

  goRegister() {
    wx.navigateTo({ url: "/src/pages/register/index" });
  },

  openProtocols() {
    openPage("protocols");
  },

  openContact() {
    openPage("contact");
  },
});
