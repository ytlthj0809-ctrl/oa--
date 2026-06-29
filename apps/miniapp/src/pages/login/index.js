const { openPage, request, setSession } = require("../../utils/api");

Page({
  data: {
    form: {
      mobile: "",
      password: "",
    },
    submitting: false,
    wechatSubmitting: false,
    error: "",
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
  },

  async submitLogin() {
    return this.loginWithCurrentForm();
  },

  async loginWithCurrentForm() {
    this.setData({ submitting: true, error: "" });
    try {
      if (!this.data.form.mobile) throw new Error("请输入手机号或账号");
      if (!this.data.form.password) throw new Error("请输入密码");
      const session = await request("/api/miniapp/auth/login", {
        method: "POST",
        data: {
          loginAccount: this.data.form.mobile,
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

  loginByWechat() {
    this.setData({ wechatSubmitting: true, error: "" });
    wx.login({
      success: async ({ code }) => {
        try {
          const result = await request("/api/miniapp/auth/wechat-login", {
            method: "POST",
            data: { jsCode: code },
          });
          if (result.bindingRequired) {
            if (result.wechatBindToken) {
              wx.setStorageSync("jy-miniapp-wechat-bind-token", result.wechatBindToken);
            }
            wx.showToast({ title: "请先提交主播注册申请", icon: "none" });
            wx.navigateTo({ url: "/src/pages/register/index?from=wechatLogin" });
            return;
          }
          setSession(result);
          wx.switchTab({ url: "/src/pages/home/index" });
        } catch (error) {
          this.setData({ error: error.message });
        } finally {
          this.setData({ wechatSubmitting: false });
        }
      },
      fail: (error) => {
        this.setData({ error: error.errMsg || "微信登录失败", wechatSubmitting: false });
      },
    });
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
