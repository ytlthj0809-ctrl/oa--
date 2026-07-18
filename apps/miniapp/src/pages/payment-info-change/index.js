const {
  createClientRequestId,
  finishPageLoading,
  handlePageRequestError,
  isAuthRequiredError,
  markMiniappDataDirty,
  requireAnchorId,
} = require("../../utils/api");
const { createPaymentInfoChangeRequest, getPaymentInfo } = require("../../services/miniapp-api");
const { statusLabel, statusTone } = require("../../utils/formatters");
const {
  normalizePaymentInfoPatch,
  paymentInfoFieldValidators,
  validatePaymentInfoPatch,
} = require("../../utils/validators");

function emptyPaymentInfoChangeForm() {
  return { realName: "", idCardNo: "", paymentMobile: "", bankCardNo: "", modifyReason: "" };
}

function normalizePaymentInfoChangeForm(form) {
  return {
    patch: normalizePaymentInfoPatch(form),
    modifyReason: String(form.modifyReason || "").trim(),
  };
}

function validatePaymentInfoChangeForm(form) {
  validatePaymentInfoPatch(form.patch);
  if (!form.modifyReason) throw new Error("请输入变更原因");
}

Page({
  data: {
    form: emptyPaymentInfoChangeForm(),
    currentInfo: null,
    currentInfoLoadError: "",
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
    this.setData({ currentInfoLoadError: "" });
    try {
      const anchorId = requireAnchorId();
      const info = await getPaymentInfo(anchorId);
      if (info) {
        this.setData({
          currentInfo: {
            realNameMasked: info.realNameMasked || "",
            idCardNoMasked: info.idCardNoMasked || "",
            paymentMobileMasked: info.paymentMobileMasked || "",
            bankCardNoMasked: info.bankCardNoMasked || "",
          },
        });
      }
    } catch (error) {
      if (isAuthRequiredError(error)) {
        this.__authRedirecting = true;
        return;
      }
      this.setData({ currentInfoLoadError: "当前打款信息加载失败，您仍可填写新信息后提交" });
    }
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
  },

  validateField(event) {
    const field = event.currentTarget.dataset.field;
    if (!field || !paymentInfoFieldValidators[field]) return;
    const value = this.data.form[field];
    const errorMsg = value ? paymentInfoFieldValidators[field](value) : "";
    const fieldErrors = { ...this.data.fieldErrors, [field]: errorMsg };
    const fieldTones = { ...this.data.fieldTones, [field]: errorMsg ? "field-error" : (value ? "field-success" : "") };
    this.setData({ fieldErrors, fieldTones });
  },

  async submitChange() {
    if (this.data.submitting) return;
    this.setData({ submitting: true, error: "", result: null });
    try {
      const anchorId = requireAnchorId();
      const form = normalizePaymentInfoChangeForm(this.data.form);
      validatePaymentInfoChangeForm(form);
      const clientRequestId = createClientRequestId("payment-info-change");
      const result = await createPaymentInfoChangeRequest({
        anchorId,
        patch: form.patch,
        modifyReason: form.modifyReason,
        clientRequestId,
      });
      markMiniappDataDirty();
      this.setData({
        form: emptyPaymentInfoChangeForm(),
        fieldErrors: {},
        fieldTones: {},
        result: {
          changeRequestId: result.changeRequestId || result.requestId || "",
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
