const { markMiniappDataDirty, request, isAuthRequiredError, requireAnchorId } = require("../../utils/api");
const { statusLabel, statusTone } = require("../../utils/formatters");

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
      const form = {
        platform: String(this.data.form.platform || "").trim(),
        accountNo: String(this.data.form.accountNo || "").trim(),
      };
      if (!form.platform) throw new Error("请输入平台");
      if (!form.accountNo) throw new Error("请输入平台账号");
      const anchorId = requireAnchorId();
      const result = await request("/api/miniapp/platform-bind-requests", {
        method: "POST",
        data: { anchorId, ...form, operatorId: "MINIAPP" },
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
