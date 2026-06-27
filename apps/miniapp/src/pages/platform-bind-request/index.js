const { request, requireAnchorId } = require("../../utils/api");

Page({
  data: {
    form: {
      platform: "",
      accountNo: "",
    },
    submitting: false,
    error: "",
    result: null,
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
  },

  async submitRequest() {
    this.setData({ submitting: true, error: "", result: null });
    try {
      const anchorId = requireAnchorId();
      const result = await request("/api/miniapp/platform-bind-requests", {
        method: "POST",
        data: { anchorId, ...this.data.form, operatorId: "MINIAPP" },
      });
      this.setData({ result });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
