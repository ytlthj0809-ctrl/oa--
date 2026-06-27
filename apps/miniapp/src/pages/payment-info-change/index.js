const { request, requireAnchorId } = require("../../utils/api");

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
      const result = await request("/api/miniapp/payment-info/change-requests", {
        method: "POST",
        data: {
          anchorId,
          patch: {
            realName: this.data.form.realName,
            idCardNo: this.data.form.idCardNo,
            paymentMobile: this.data.form.paymentMobile,
            bankCardNo: this.data.form.bankCardNo,
          },
          modifyReason: this.data.form.modifyReason,
          operatorId: "MINIAPP",
        },
      });
      this.setData({ result });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
