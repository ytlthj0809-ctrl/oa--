const { markMiniappDataDirty, openPage, request, isAuthRequiredError, requireAnchorId } = require("../../utils/api");
const { normalizePaymentInfoForm, validatePaymentInfoForm } = require("../../utils/validators");

Page({
  data: {
    form: {
      realName: "",
      idCardNo: "",
      paymentMobile: "",
      bankCardNo: "",
    },
    submitting: false,
    error: "",
    saved: false,
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
  },

  async submitForm() {
    if (this.data.submitting) return;
    this.setData({ submitting: true, error: "", saved: false });
    try {
      const anchorId = requireAnchorId();
      const form = normalizePaymentInfoForm(this.data.form);
      validatePaymentInfoForm(form);
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
