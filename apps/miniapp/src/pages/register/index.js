const { appendQuery, clearWechatBindToken, getWechatBindToken, openPage, request } = require("../../utils/api");
const { statusLabel, statusTone } = require("../../utils/formatters");

function buildDefaultForm() {
  return {
    anchorId: "",
    displayName: "",
    mobile: "",
    protocolChecked: false,
  };
}

function normalizeMobile(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function normalizeRegistrationForm(form) {
  return {
    anchorId: String(form.anchorId || "").trim(),
    displayName: String(form.displayName || "").trim(),
    mobile: normalizeMobile(form.mobile),
  };
}

function decorateRegistrationRequest(requestRecord) {
  if (!requestRecord) return null;
  const reviewStatus = requestRecord.reviewStatus || requestRecord.status;
  return {
    ...requestRecord,
    reviewStatusText: statusLabel(reviewStatus),
    reviewStatusTone: statusTone(reviewStatus),
    nextStepText: reviewStatus === "APPROVED"
      ? "审核已通过，请返回登录页使用微信登录。"
      : "申请已提交，请等待后台审核。审核通过后可直接微信登录。",
  };
}

Page({
  data: {
    form: buildDefaultForm(),
    submitting: false,
    loadingStatus: false,
    error: "",
    latestRequest: null,
    sourceText: "注册后由后台审核，打款信息在提现前单独填写。",
  },

  onLoad(options = {}) {
    if (options.from === "wechatLogin") {
      this.setData({ sourceText: "当前微信尚未绑定主播账号，请先提交注册申请。审核通过后可直接登录。" });
    }
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      form: {
        ...this.data.form,
        [field]: event.detail.value,
      },
    });
  },

  toggleProtocol(event) {
    const values = event.detail && event.detail.value ? event.detail.value : [];
    this.setData({
      form: {
        ...this.data.form,
        protocolChecked: values.includes("agreed"),
      },
    });
  },

  async submitRegistration() {
    this.setData({ submitting: true, error: "" });
    try {
      const form = this.data.form;
      const normalizedForm = normalizeRegistrationForm(form);
      if (!normalizedForm.anchorId) throw new Error("请输入主播ID");
      if (!normalizedForm.displayName) throw new Error("请输入主播姓名或昵称");
      if (!/^1[3-9]\d{9}$/.test(normalizedForm.mobile)) throw new Error("请输入正确的手机号");
      if (!this.data.form.protocolChecked) {
        throw new Error("请先同意协议和隐私政策");
      }
      const wechatBindToken = getWechatBindToken();
      const result = await request("/api/miniapp/anchor-registration-requests", {
        method: "POST",
        data: {
          ...normalizedForm,
          ...(wechatBindToken ? { wechatBindToken } : {}),
          operatorId: "MINIAPP",
        },
      });
      if (wechatBindToken) {
        clearWechatBindToken();
      }
      this.setData({ latestRequest: decorateRegistrationRequest(result) });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async refreshRegistrationStatus() {
    this.setData({ loadingStatus: true, error: "" });
    try {
      const form = normalizeRegistrationForm(this.data.form);
      if (!form.anchorId && !form.mobile) throw new Error("请先输入主播ID或手机号");
      const records = await request(appendQuery("/api/miniapp/anchor-registration-requests", {
        anchorId: form.anchorId,
        mobile: form.mobile,
      }));
      this.setData({ latestRequest: decorateRegistrationRequest(records[0] || null) });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loadingStatus: false });
    }
  },

  goLogin() {
    wx.redirectTo({ url: "/src/pages/login/index" });
  },

  openProtocols() {
    openPage("protocols");
  },
});
