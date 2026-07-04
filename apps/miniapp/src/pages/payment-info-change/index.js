const { markMiniappDataDirty, request, isAuthRequiredError, requireAnchorId } = require("../../utils/api");
const { statusLabel, statusTone } = require("../../utils/formatters");
const { normalizePaymentInfoForm, validatePaymentInfoForm } = require("../../utils/validators");

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
    submitting: false,
    error: "",
    result: null,
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
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
