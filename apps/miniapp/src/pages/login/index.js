const {
  clearWechatBindToken,
  getWechatBindToken,
  openPage,
  setSession,
  setWechatBindToken,
} = require("../../utils/api");
const { LOGIN_COOLDOWN_MS, LOGIN_FAILURE_LIMIT } = require("../../utils/constants");
const {
  getWechatLoginCode,
  openPrivacyContract: openWechatPrivacyContract,
  requirePrivacyAuthorization,
} = require("../../utils/privacy-consent");
const {
  bindWechatAccount,
  loginByPassword,
  loginByWechat: loginByWechatRequest,
} = require("../../services/miniapp-api");

const loginFailureStorageKey = "jy-miniapp-login-failure";

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
    legacyLoginExpanded: false,
    passwordVisible: false,
    wechatBindingPending: false,
  },

  onLoad(options = {}) {
    const wechatBindingPending = options.wechatChecked === "1" && Boolean(getWechatBindToken());
    this.setData({
      wechatBindingPending,
      legacyLoginExpanded: wechatBindingPending,
    });
  },

  onShow() {
    this.syncLoginCooldown();
  },

  onHide() {
    this.clearCooldownTimer();
  },

  onUnload() {
    this.clearCooldownTimer();
  },

  clearCooldownTimer() {
    if (this.__cooldownTimer) {
      clearTimeout(this.__cooldownTimer);
      this.__cooldownTimer = null;
    }
  },

  syncLoginCooldown() {
    const state = getLoginFailureState();
    const cooldownText = getCooldownText(state.cooldownUntil);
    this.setData({ cooldownText });
    this.clearCooldownTimer();
    if (cooldownText) {
      this.__cooldownTimer = setTimeout(() => this.syncLoginCooldown(), 1000);
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

  routeAfterLogin(session) {
    if (session.protocolStatus && session.protocolStatus !== "AGREED") {
      wx.redirectTo({ url: "/src/pages/protocols/index?mode=required" });
      return;
    }
    wx.switchTab({ url: "/src/pages/home/index" });
  },

  async enterWithSession(session) {
    const wechatBindToken = getWechatBindToken();
    setSession(session);
    if (!wechatBindToken) {
      this.routeAfterLogin(session);
      return;
    }
    try {
      await bindWechatAccount(wechatBindToken);
      clearWechatBindToken();
      wx.showToast({ title: "微信绑定成功", icon: "success" });
      this.routeAfterLogin({ ...session, bindingStatus: "BOUND" });
    } catch (error) {
      setWechatBindToken(wechatBindToken);
      wx.showModal({
        title: "登录成功，微信绑定未完成",
        content: `${error.message || "绑定失败"}。本次仍可进入系统，稍后可重新绑定。`,
        showCancel: false,
        complete: () => this.routeAfterLogin(session),
      });
    }
  },

  async loginWithCurrentForm() {
    if (this.syncLoginCooldown()) return;
    let passwordRequestStarted = false;
    let passwordRequestCompleted = false;
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
      const loginAccount = this.data.form.mobile;
      const password = this.data.form.password;
      this.setData({ form: { ...this.data.form, password: "" } });
      await requirePrivacyAuthorization();
      passwordRequestStarted = true;
      const session = await loginByPassword({
        loginAccount,
        password,
      });
      passwordRequestCompleted = true;
      clearLoginFailureState();
      await this.enterWithSession(session);
    } catch (error) {
      this.setData({ error: (error && error.message) || "登录失败，请重试" });
      if (passwordRequestStarted && !passwordRequestCompleted && !(error && error.clientValidation)) {
        this.recordPasswordLoginFailure();
      }
    } finally {
      this.setData({ submitting: false });
    }
  },

  async loginByWechat() {
    if (this.data.wechatSubmitting || this.data.submitting) return;
    this.setData({ wechatSubmitting: true, error: "" });
    try {
      await requirePrivacyAuthorization();
      const result = await loginByWechatRequest(await getWechatLoginCode());
      if (result.bindingRequired) {
        if (result.wechatBindToken) setWechatBindToken(result.wechatBindToken);
        this.setData({ wechatBindingPending: true, legacyLoginExpanded: true });
        return;
      }
      await this.enterWithSession(result);
    } catch (error) {
      this.setData({ error: error.message || "微信登录失败，请重试" });
    } finally {
      this.setData({ wechatSubmitting: false });
    }
  },

  async openPrivacyContract() {
    try {
      await openWechatPrivacyContract();
    } catch (error) {
      this.setData({ error: error.message || "隐私指引暂时无法打开" });
    }
  },

  toggleLegacyLogin() {
    this.setData({ legacyLoginExpanded: !this.data.legacyLoginExpanded });
  },

  openLegacyLogin() {
    this.setData({ legacyLoginExpanded: true });
  },

  togglePasswordVisibility() {
    this.setData({ passwordVisible: !this.data.passwordVisible });
  },

  goRegister() {
    wx.navigateTo({ url: `/src/pages/register/index${getWechatBindToken() ? "?from=wechatLogin" : ""}` });
  },

  openProtocols() {
    openPage("protocols");
  },
});
