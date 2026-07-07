const { markMiniappDataDirty, openPage, request, isAuthRequiredError, requireAnchorId } = require("../../utils/api");
const { isValidBankCard, isValidMainlandIdCard, isValidMobile, normalizePaymentInfoForm, validatePaymentInfoForm } = require("../../utils/validators");

const fieldValidators = {
  realName: (v) => {
    const text = String(v || "").trim();
    if (!text) return "请输入真实姓名";
    if (text.length < 2) return "姓名至少 2 个字";
    return "";
  },
  idCardNo: (v) => {
    if (!v) return "请输入身份证号";
    if (!isValidMainlandIdCard(v)) return "请输入有效的 18 位身份证号";
    return "";
  },
  paymentMobile: (v) => {
    if (!v) return "请输入手机号";
    if (!isValidMobile(v)) return "请输入有效的 11 位手机号";
    return "";
  },
  bankCardNo: (v) => {
    if (!v) return "请输入银行卡号";
    if (!isValidBankCard(v)) return "请输入有效的银行卡号";
    return "";
  },
};

Page({
  data: {
    form: {
      realName: "",
      idCardNo: "",
      paymentMobile: "",
      bankCardNo: "",
    },
    fieldErrors: {},
    fieldTones: {},
    submitting: false,
    error: "",
    saved: false,
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
  },

  validateField(event) {
    const field = event.currentTarget.dataset.field;
    if (!field || !fieldValidators[field]) return;
    const value = this.data.form[field];
    const errorMsg = fieldValidators[field](value);
    const fieldErrors = { ...this.data.fieldErrors, [field]: errorMsg };
    const fieldTones = { ...this.data.fieldTones, [field]: errorMsg ? "field-error" : (value ? "field-success" : "") };
    this.setData({ fieldErrors, fieldTones });
  },

  confirmSave() {
    return new Promise((resolve) => {
      wx.showModal({
        title: "确认提交",
        content: "打款信息提交后将用于签约和打款，请确认信息无误。",
        confirmText: "确认",
        cancelText: "再检查",
        success(result) { resolve(Boolean(result.confirm)); },
        fail() { resolve(false); },
      });
    });
  },

  async submitForm() {
    if (this.data.submitting) return;
    this.setData({ submitting: true, error: "", saved: false });
    try {
      const anchorId = requireAnchorId();
      const form = normalizePaymentInfoForm(this.data.form);
      validatePaymentInfoForm(form);
      const confirmed = await this.confirmSave();
      if (!confirmed) return;
      await request("/api/miniapp/payment-info", {
        method: "POST",
        data: { anchorId, ...form, operatorId: "MINIAPP" },
      });
      markMiniappDataDirty();
      this.setData({ form, saved: true });
    } catch (error) {
      if (isAuthRequiredError(error)) { this.__authRedirecting = true; return; }
      this.setData({ error: error.message });
    } finally {
      if (!this.__authRedirecting) this.setData({ submitting: false });
    }
  },

  goPaymentInfo() {
    openPage("payment-info");
  },

  goSign() {
    openPage("sign");
  },
});
