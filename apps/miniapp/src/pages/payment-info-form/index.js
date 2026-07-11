const {
  finishPageLoading,
  handlePageRequestError,
  markMiniappDataDirty,
  openPage,
  requireAnchorId,
} = require("../../utils/api");
const { createPaymentInfo } = require("../../services/miniapp-api");
const { normalizePaymentInfoForm, paymentInfoFieldValidators, validatePaymentInfoForm } = require("../../utils/validators");

function emptyPaymentInfoForm() {
  return { realName: "", idCardNo: "", paymentMobile: "", bankCardNo: "" };
}

Page({
  data: {
    form: emptyPaymentInfoForm(),
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
    if (!field || !paymentInfoFieldValidators[field]) return;
    const value = this.data.form[field];
    const errorMsg = paymentInfoFieldValidators[field](value);
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
      await createPaymentInfo({ anchorId, ...form });
      markMiniappDataDirty();
      this.setData({
        form: emptyPaymentInfoForm(),
        fieldErrors: {},
        fieldTones: {},
        saved: true,
      });
    } catch (error) {
      handlePageRequestError(this, error);
    } finally {
      finishPageLoading(this, "submitting");
    }
  },

  goPaymentInfo() {
    openPage("payment-info");
  },

  goSign() {
    openPage("sign");
  },
});
