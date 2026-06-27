const { appendQuery, openPage, request, requireAnchorId } = require("../../utils/api");

Page({
  data: {
    form: { platform: "bixin", accountNo: "bx-miniapp-extra" },
    loading: false,
    submitting: false,
    error: "",
    accounts: [],
    requestResult: null,
  },

  onLoad() {
    this.loadAccounts();
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
  },

  async loadAccounts() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const accounts = await request(appendQuery("/api/miniapp/platform-accounts", { anchorId }));
      this.setData({ accounts });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  async submitBindRequest() {
    this.setData({ submitting: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const requestResult = await request("/api/miniapp/platform-bind-requests", {
        method: "POST",
        data: { anchorId, ...this.data.form, operatorId: "MINIAPP" },
      });
      this.setData({ requestResult });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ submitting: false });
    }
  },

  openBindRequest() {
    openPage("platform-bind-request");
  },
});
