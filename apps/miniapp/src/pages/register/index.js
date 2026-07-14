const { clearWechatBindToken, getWechatBindToken, openPage } = require("../../utils/api");
const { createAnchorRegistrationRequest, listAnchorRegistrationRequests } = require("../../services/miniapp-api");
const { statusLabel, statusTone } = require("../../utils/formatters");
const {
  openPrivacyContract: openWechatPrivacyContract,
  requirePrivacyAuthorization,
} = require("../../utils/privacy-consent");

function buildDefaultForm() {
  return {
    anchorId: "",
    displayName: "",
    mobile: "",
    protocolChecked: false,
  };
}

function normalizeMobile(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function normalizeRegistrationForm(form) {
  return {
    anchorId: String(form.anchorId || "").trim(),
    displayName: String(form.displayName || "").trim(),
    mobile: normalizeMobile(form.mobile),
  };
}

function canSubmitRegistration(form) {
  const normalized = normalizeRegistrationForm(form);
  return Boolean(
    normalized.anchorId &&
    normalized.displayName &&
    /^1[3-9]\d{9}$/.test(normalized.mobile) &&
    form.protocolChecked
  );
}

function decorateRegistrationRequest(requestRecord) {
  if (!requestRecord) return null;
  const reviewStatus = requestRecord.reviewStatus || requestRecord.status;
  return {
    ...requestRecord,
    reviewStatusText: statusLabel(reviewStatus),
    reviewStatusTone: statusTone(reviewStatus),
    nextStepText: reviewStatus === "APPROVED"
      ? "审核已通过，请返回登录页使用微信登录。"
      : "申请已提交，请等待后台审核。审核通过后可直接微信登录。",
  };
}

function isRegistrationLocked(requestRecord) {
  const reviewStatus = requestRecord && (requestRecord.reviewStatus || requestRecord.status);
  return reviewStatus === "PENDING_REVIEW" || reviewStatus === "APPROVED";
}

Page({
  data: {
    form: buildDefaultForm(),
    submitting: false,
    loadingStatus: false,
    error: "",
    latestRequest: null,
    registrationLocked: false,
    canSubmit: false,
    sourceText: "注册后由后台审核，打款信息在提现前单独填写。",
  },

  onLoad(options = {}) {
    if (options.from === "wechatLogin") {
      this.setData({ sourceText: "当前微信尚未绑定。提交后等待审核，通过即可微信登录。" });
    }
  },

  updateField(event) {
    if (this.data.registrationLocked) return;
    const field = event.currentTarget.dataset.field;
    const form = {
      ...this.data.form,
      [field]: event.detail.value,
    };
    this.setData({
      form,
      canSubmit: canSubmitRegistration(form),
    });
  },

  toggleProtocol(event) {
    if (this.data.registrationLocked) return;
    const values = event.detail && event.detail.value ? event.detail.value : [];
    const form = {
      ...this.data.form,
      protocolChecked: values.includes("agreed"),
    };
    this.setData({ form, canSubmit: canSubmitRegistration(form) });
  },

  async submitRegistration() {
    if (this.data.submitting || this.data.registrationLocked) return;
    this.setData({ submitting: true, error: "" });
    try {
      const form = this.data.form;
      const normalizedForm = normalizeRegistrationForm(form);
      if (!normalizedForm.anchorId) throw new Error("请输入主播ID");
      if (!normalizedForm.displayName) throw new Error("请输入主播姓名或昵称");
      if (!/^1[3-9]\d{9}$/.test(normalizedForm.mobile)) throw new Error("请输入正确的手机号");
      if (!this.data.form.protocolChecked) {
        throw new Error("请先同意协议和隐私政策");
      }
      await requirePrivacyAuthorization();
      const wechatBindToken = getWechatBindToken();
      const result = await createAnchorRegistrationRequest({
        ...normalizedForm,
        ...(wechatBindToken ? { wechatBindToken } : {}),
      });
      if (wechatBindToken) {
        clearWechatBindToken();
      }
      const latestRequest = decorateRegistrationRequest(result);
      const registrationLocked = isRegistrationLocked(latestRequest);
      this.setData({
        latestRequest,
        registrationLocked,
        canSubmit: !registrationLocked && canSubmitRegistration(this.data.form),
      });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async refreshRegistrationStatus() {
    if (this.data.loadingStatus) return;
    this.setData({ loadingStatus: true, error: "" });
    try {
      const form = normalizeRegistrationForm(this.data.form);
      if (!form.anchorId && !form.mobile) throw new Error("请先输入主播ID或手机号");
      const records = await listAnchorRegistrationRequests({
        anchorId: form.anchorId,
        mobile: form.mobile,
      });
      const latestRequest = Array.isArray(records) ? records[records.length - 1] : null;
      const decoratedRequest = decorateRegistrationRequest(latestRequest);
      const registrationLocked = isRegistrationLocked(decoratedRequest);
      this.setData({
        latestRequest: decoratedRequest,
        registrationLocked,
        canSubmit: !registrationLocked && canSubmitRegistration(this.data.form),
      });
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

  async openPrivacyContract() {
    try {
      await openWechatPrivacyContract();
    } catch (error) {
      this.setData({ error: error.message || "隐私指引暂时无法打开" });
    }
  },
});
