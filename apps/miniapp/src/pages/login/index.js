const { openPage, setSession, setWechatBindToken } = require("../../utils/api");
const { LOGIN_COOLDOWN_MS, LOGIN_FAILURE_LIMIT } = require("../../utils/constants");
const { loginByPassword, loginByWechat: loginByWechatRequest } = require("../../services/miniapp-api");

const loginFailureStorageKey = "jy-miniapp-login-failure";
let cooldownTimer = null;

function getLoginFailureState() {
  return wx.getStorageSync(loginFailureStorageKey) || { count: 0, cooldownUntil: 0 };
}

function setLoginFailureState(state) {
  wx.setStorageSync(loginFailureStorageKey, state);
}

function clearLoginFailureState() {
  wx.removeStorageSync(loginFailureStorageKey);
}

function getCooldownText(cooldownUntil) {
  const remainSeconds = Math.ceil((Number(cooldownUntil || 0) - Date.now()) / 1000);
  return remainSeconds > 0 ? `登录失败较多，请 ${remainSeconds} 秒后再试` : "";
}

function clearCooldownTimer() {
  if (cooldownTimer) {
    clearTimeout(cooldownTimer);
    cooldownTimer = null;
  }
}

Page({
  data: {
    form: {
      mobile: "",
      password: "",
    },
    submitting: false,
    wechatSubmitting: false,
    error: "",
    cooldownText: "",
  },

  onShow() {
    this.syncLoginCooldown();
  },

  onHide() {
    clearCooldownTimer();
  },

  onUnload() {
    clearCooldownTimer();
  },

  syncLoginCooldown() {
    const state = getLoginFailureState();
    const cooldownText = getCooldownText(state.cooldownUntil);
    this.setData({ cooldownText });
    clearCooldownTimer();
    if (cooldownText) {
      cooldownTimer = setTimeout(() => this.syncLoginCooldown(), 1000);
    } else if (state.cooldownUntil && state.cooldownUntil <= Date.now()) {
      clearLoginFailureState();
    }
    return Boolean(cooldownText);
  },

  recordPasswordLoginFailure() {
    const state = getLoginFailureState();
    const count = Number(state.count || 0) + 1;
    const cooldownUntil = count >= LOGIN_FAILURE_LIMIT ? Date.now() + LOGIN_COOLDOWN_MS : 0;
    setLoginFailureState({ count, cooldownUntil });
    this.syncLoginCooldown();
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
  },

  enterWithSession(session) {
    setSession(session);
    if (session.protocolStatus && session.protocolStatus !== "AGREED") {
      wx.redirectTo({ url: "/src/pages/protocols/index?mode=required" });
      return;
    }
    wx.switchTab({ url: "/src/pages/home/index" });
  },

  async loginWithCurrentForm() {
    if (this.syncLoginCooldown()) return;
    this.setData({ submitting: true, error: "" });
    try {
      if (!this.data.form.mobile) {
        const error = new Error("请输入手机号或账号");
        error.clientValidation = true;
        throw error;
      }
      if (!this.data.form.password) {
        const error = new Error("请输入密码");
        error.clientValidation = true;
        throw error;
      }
      const session = await loginByPassword({
        loginAccount: this.data.form.mobile,
        password: this.data.form.password,
      });
      clearLoginFailureState();
      this.setData({ form: { ...this.data.form, password: "" } });
      this.enterWithSession(session);
    } catch (error) {
      this.setData({ error: error.message });
      if (!error.clientValidation) this.recordPasswordLoginFailure();
    } finally {
      this.setData({ submitting: false });
    }
  },

  loginByWechat() {
    this.setData({ wechatSubmitting: true, error: "" });
    wx.login({
      success: async ({ code }) => {
        try {
          if (!code) throw new Error("未获取到微信登录凭证，请重试");
          const result = await loginByWechatRequest(code);
          if (result.bindingRequired) {
            if (result.wechatBindToken) {
              setWechatBindToken(result.wechatBindToken);
            }
            wx.showToast({ title: "请先提交主播注册申请", icon: "none" });
            wx.navigateTo({ url: "/src/pages/register/index?from=wechatLogin" });
            return;
          }
          this.enterWithSession(result);
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
