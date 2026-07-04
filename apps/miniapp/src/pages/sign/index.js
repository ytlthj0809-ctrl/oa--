const { appendQuery, request, isAuthRequiredError, requireAnchorId } = require("../../utils/api");
const { isSigned, statusLabel, statusTone } = require("../../utils/formatters");
const { normalizeSignIdentityForm, validateSignIdentityForm } = require("../../utils/validators");
const { startYzhSdk } = require("../../utils/yzh-sdk");

function decorateSignStatus(signStatus) {
  const normalized = signStatus || { signStatus: "UNSIGNED" };
  const status = normalized.signStatus || "UNSIGNED";
  return {
    ...normalized,
    signStatusText: statusLabel(status),
    signStatusTone: statusTone(status),
    isSigned: isSigned(status),
    actionHint: isSigned(status)
      ? "已完成签约，可以返回提现继续提交申请。"
      : "请使用本人实名信息生成云账户签约入口，并在云账户助手中完成签约。",
  };
}

Page({
  data: {
    loading: false,
    presigning: false,
    refreshing: false,
    error: "",
    signStatus: null,
    presign: null,
    form: {
      realName: "",
      idCardNo: "",
    },
  },

  onLoad() {
    this.loadSignStatus();
  },

  async loadSignStatus() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const signStatus = await request(appendQuery("/api/miniapp/yzh/sign-status", { anchorId }));
      this.setData({ signStatus: decorateSignStatus(signStatus) });
    } catch (error) {
      if (isAuthRequiredError(error)) { this.__authRedirecting = true; return; }
      this.setData({ error: error.message });
    } finally {
      if (!this.__authRedirecting) this.setData({ loading: false });
    }
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
  },

  async createPresign() {
    if (this.data.presigning) return;
    this.setData({ presigning: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const form = normalizeSignIdentityForm(this.data.form);
      validateSignIdentityForm(form);
      const presign = await request("/api/miniapp/yzh/presign", {
        method: "POST",
        data: {
          anchorId,
          realName: form.realName,
          idCardNo: form.idCardNo,
          certificateType: 0,
          collectPhoneNo: 0,
          operatorId: "MINIAPP",
        },
      });
      const signStatus = presign && typeof presign.signStatus === "object" && presign.signStatus
        ? presign.signStatus
        : {
            anchorId,
            signStatus: "SIGNING",
            eventStatusDetail: "签约入口已生成，请前往云账户完成签约",
          };
      this.setData({ form, presign, signStatus: decorateSignStatus(signStatus) }, () => {
        this.openYzhSignMiniProgram();
      });
    } catch (error) {
      if (isAuthRequiredError(error)) { this.__authRedirecting = true; return; }
      this.setData({ error: error.message });
    } finally {
      if (!this.__authRedirecting) this.setData({ presigning: false });
    }
  },

  async refreshSigned() {
    if (this.data.refreshing) return;
    this.setData({ refreshing: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const signStatus = await request(appendQuery("/api/miniapp/yzh/sign-status", { anchorId }));
      this.setData({ signStatus: decorateSignStatus(signStatus) });
    } catch (error) {
      if (isAuthRequiredError(error)) { this.__authRedirecting = true; return; }
      this.setData({ error: error.message });
    } finally {
      if (!this.__authRedirecting) this.setData({ refreshing: false });
    }
  },

  openYzhSignMiniProgram() {
    const presign = this.data.presign || {};
    const signUrl = presign.signUrl;
    if (!signUrl) return;
    startYzhSdk({
      data: { url: signUrl },
      appId: presign.assistantAppId || "wx9518fe08d36ee44e",
      path: presign.miniProgramPath || "pages/api-sign/index",
      envVersion: "release",
      onNavigateSuccess() {
        wx.showToast({ title: "已打开签约", icon: "success" });
      },
      onNavigateFail: () => {
        this.copyPresignUrl();
      },
      verifyDoneCallback: ({ verifyDone }) => {
        wx.showToast({
          title: verifyDone ? "签约返回，正在刷新" : "已返回签约页",
          icon: "none",
        });
        this.refreshSigned();
      },
    });
  },

  copyPresignUrl() {
    const signUrl = this.data.presign && this.data.presign.signUrl;
    if (!signUrl) return;
    wx.setClipboardData({
      data: signUrl,
      success() {
        wx.showToast({ title: "签约链接已复制", icon: "success" });
      },
    });
  },

  goWithdraw() {
    wx.switchTab({ url: "/src/pages/withdraw/index" });
  },
});
