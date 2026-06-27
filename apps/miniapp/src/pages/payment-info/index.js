const { appendQuery, openPage, request, requireAnchorId } = require("../../utils/api");

function defaultForm() {
  return {
    realName: "",
    idCardNo: "",
    paymentMobile: "",
    bankCardNo: "",
    modifyReason: "",
  };
}

Page({
  data: {
    form: defaultForm(),
    loading: false,
    submitting: false,
    error: "",
    paymentInfo: null,
    changeRequests: [],
  },

  onLoad() {
    this.loadPaymentInfo();
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
  },

  async loadPaymentInfo() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const [paymentInfo, changeRequests] = await Promise.all([
        request(appendQuery("/api/miniapp/payment-info", { anchorId })),
        request(appendQuery("/api/miniapp/payment-info/change-requests", { anchorId })),
      ]);
      this.setData({ paymentInfo, changeRequests });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  async saveFirstInfo() {
    this.setData({ submitting: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const paymentInfo = await request("/api/miniapp/payment-info", {
        method: "POST",
        data: { anchorId, ...this.data.form, operatorId: "MINIAPP" },
      });
      this.setData({ paymentInfo });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async submitChange() {
    this.setData({ submitting: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const requestBody = {
        anchorId,
        patch: {
          realName: this.data.form.realName,
          idCardNo: this.data.form.idCardNo,
          paymentMobile: this.data.form.paymentMobile,
          bankCardNo: this.data.form.bankCardNo,
        },
        modifyReason: this.data.form.modifyReason,
        voucherFileName: "payment_info_change_voucher.csv",
        operatorId: "MINIAPP",
      };
      await request("/api/miniapp/payment-info/change-requests", {
        method: "POST",
        data: requestBody,
      });
      this.loadPaymentInfo();
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ submitting: false });
    }
  },

  openForm() {
    openPage("payment-info-form");
  },

  openChange() {
    openPage("payment-info-change");
  },
});
