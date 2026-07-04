const { appendQuery, markMiniappDataDirty, openPage, request, isAuthRequiredError, requireAnchorId } = require("../../utils/api");
const { statusLabel, statusTone } = require("../../utils/formatters");

function decorateAccount(account) {
  const status = account.bindStatus || account.status;
  return {
    ...account,
    bindStatusText: statusLabel(status),
    bindStatusTone: statusTone(status),
  };
}

function decorateRequest(result) {
  if (!result) return null;
  const status = result.reviewStatus || result.status;
  return {
    ...result,
    reviewStatusText: statusLabel(status),
    reviewStatusTone: statusTone(status),
  };
}

Page({
  data: {
    form: { platform: "", accountNo: "" },
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
      this.setData({ accounts: (accounts || []).map(decorateAccount) });
    } catch (error) {
      if (isAuthRequiredError(error)) { this.__authRedirecting = true; return; }
      this.setData({ error: error.message });
    } finally {
      if (!this.__authRedirecting) this.setData({ loading: false });
    }
  },

  async submitBindRequest() {
    this.setData({ submitting: true, error: "" });
    try {
      const form = {
        platform: String(this.data.form.platform || "").trim(),
        accountNo: String(this.data.form.accountNo || "").trim(),
      };
      if (!form.platform) throw new Error("请输入平台");
      if (!form.accountNo) throw new Error("请输入平台账号");
      const anchorId = requireAnchorId();
      const requestResult = await request("/api/miniapp/platform-bind-requests", {
        method: "POST",
        data: { anchorId, ...form, operatorId: "MINIAPP" },
      });
      markMiniappDataDirty();
      this.setData({ form, requestResult: decorateRequest(requestResult) });
      this.loadAccounts();
    } catch (error) {
      if (isAuthRequiredError(error)) { this.__authRedirecting = true; return; }
      this.setData({ error: error.message });
    } finally {
      if (!this.__authRedirecting) this.setData({ submitting: false });
    }
  },

  openBindRequest() {
    openPage("platform-bind-request");
  },
});
