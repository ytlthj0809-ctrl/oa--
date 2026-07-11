const {
  finishPageLoading,
  handlePageRequestError,
  markMiniappDataDirty,
  requireAnchorId,
} = require("../../utils/api");
const { statusLabel, statusTone } = require("../../utils/formatters");
const { createPlatformBindRequest, listPlatformAccounts } = require("../../services/miniapp-api");

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
      const accounts = await listPlatformAccounts({ anchorId });
      this.setData({ accounts: (accounts || []).map(decorateAccount) });
    } catch (error) {
      handlePageRequestError(this, error);
    } finally {
      finishPageLoading(this);
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
      const requestResult = await createPlatformBindRequest({ anchorId, ...form });
      markMiniappDataDirty();
      this.setData({ form, requestResult: decorateRequest(requestResult) });
      await this.loadAccounts();
    } catch (error) {
      handlePageRequestError(this, error);
    } finally {
      finishPageLoading(this, "submitting");
    }
  },
});
