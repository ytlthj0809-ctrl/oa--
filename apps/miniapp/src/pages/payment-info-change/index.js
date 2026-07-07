const { appendQuery, markMiniappDataDirty, request, isAuthRequiredError, requireAnchorId } = require("../../utils/api");
const { statusLabel, statusTone } = require("../../utils/formatters");
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

function normalizePaymentInfoChangeForm(form) {
  return {
    ...normalizePaymentInfoForm(form),
    modifyReason: String(form.modifyReason || "").trim(),
  };
}

function validatePaymentInfoChangeForm(form) {
  validatePaymentInfoForm(form);
  if (!form.modifyReason) throw new Error("请输入变更原因");
}

Page({
  data: {
    form: {
      realName: "",
      idCardNo: "",
      paymentMobile: "",
      bankCardNo: "",
      modifyReason: "",
    },
    fieldErrors: {},
    fieldTones: {},
    submitting: false,
    error: "",
    result: null,
  },

  onLoad() {
    this.loadExistingPaymentInfo();
  },

  async loadExistingPaymentInfo() {
    try {
      const anchorId = requireAnchorId();
      const info = await request(appendQuery("/api/miniapp/payment-info", { anchorId }));
      if (info) {
        this.setData({
          form: {
            ...this.data.form,
            realName: info.realName || "",
            idCardNo: info.idCardNo || "",
            paymentMobile: info.paymentMobile || "",
            bankCardNo: info.bankCardNo || "",
          },
        });
      }
    } catch (_) {
      // silently ignore; user can fill manually
    }
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

  async submitChange() {
    this.setData({ submitting: true, error: "", result: null });
    try {
      const anchorId = requireAnchorId();
      const form = normalizePaymentInfoChangeForm(this.data.form);
      validatePaymentInfoChangeForm(form);
      const result = await request("/api/miniapp/payment-info/change-requests", {
        method: "POST",
        data: {
          anchorId,
          patch: {
            realName: form.realName,
            idCardNo: form.idCardNo,
            paymentMobile: form.paymentMobile,
            bankCardNo: form.bankCardNo,
          },
          modifyReason: form.modifyReason,
          operatorId: "MINIAPP",
        },
      });
      markMiniappDataDirty();
      this.setData({
        form,
        result: {
          ...result,
          reviewStatusText: statusLabel(result.reviewStatus || result.status),
          reviewStatusTone: statusTone(result.reviewStatus || result.status),
        },
      });
    } catch (error) {
      if (isAuthRequiredError(error)) { this.__authRedirecting = true; return; }
      this.setData({ error: error.message });
    } finally {
      if (!this.__authRedirecting) this.setData({ submitting: false });
    }
  },
});
