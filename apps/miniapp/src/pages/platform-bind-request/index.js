const {
  finishPageLoading,
  handlePageRequestError,
  markMiniappDataDirty,
  requireAnchorId,
} = require("../../utils/api");
const { statusLabel, statusTone } = require("../../utils/formatters");
const { createPlatformBindRequest } = require("../../services/miniapp-api");

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
      const result = await createPlatformBindRequest({ anchorId, ...form });
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
      handlePageRequestError(this, error);
    } finally {
      finishPageLoading(this, "submitting");
    }
  },
});
