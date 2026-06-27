const { request, requireAnchorId } = require("../../utils/api");

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
    this.setData({ submitting: true, error: "", saved: false });
    try {
      const anchorId = requireAnchorId();
      await request("/api/miniapp/payment-info", {
        method: "POST",
        data: { anchorId, ...this.data.form, operatorId: "MINIAPP" },
      });
      this.setData({ saved: true });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
