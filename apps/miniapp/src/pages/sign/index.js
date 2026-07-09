const { appendQuery, openPage, request, isAuthRequiredError, requireAnchorId } = require("../../utils/api");
const { isPaymentInfoReady, isSigned, statusLabel, statusTone } = require("../../utils/formatters");
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

function decoratePaymentInfoForSign(paymentInfo) {
  const paymentInfoStatus = paymentInfo?.paymentInfoStatus || "MISSING";
  if (!isPaymentInfoReady(paymentInfoStatus)) {
    return {
      ...paymentInfo,
      ready: false,
      statusText: statusLabel(paymentInfoStatus),
      statusTone: statusTone(paymentInfoStatus),
      helperText: paymentInfoStatus === "MISSING"
        ? "请先补充打款信息，再进行云账户签约。"
        : "打款信息尚未生效，审核通过后才能生成云账户签约入口。",
    };
  }
  const hasPlainIdentity = Boolean(paymentInfo.realName && paymentInfo.idCardNo);
  return {
    ...paymentInfo,
    ready: true,
    hasPlainIdentity,
    statusText: statusLabel(paymentInfoStatus),
    statusTone: statusTone(paymentInfoStatus),
    helperText: hasPlainIdentity
      ? "将使用已保存实名信息生成签约入口。"
      : "已保存实名信息；为保护隐私，系统只保留脱敏摘要。本次签约需本人再确认姓名和身份证号。",
  };
}

function buildIdentityFormFromPaymentInfo(paymentInfo) {
  if (!paymentInfo) return { realName: "", idCardNo: "" };
  return {
    realName: paymentInfo.realName || "",
    idCardNo: paymentInfo.idCardNo || "",
  };
}

Page({
  data: {
    loading: false,
    presigning: false,
    refreshing: false,
    error: "",
    signStatus: null,
    paymentInfo: null,
    identityFormExpanded: true,
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
      const [signStatus, paymentInfo] = await Promise.all([
        request(appendQuery("/api/miniapp/yzh/sign-status", { anchorId })),
        request(appendQuery("/api/miniapp/payment-info", { anchorId })),
      ]);
      const decoratedPaymentInfo = decoratePaymentInfoForSign(paymentInfo);
      const nextForm = buildIdentityFormFromPaymentInfo(paymentInfo);
      this.setData({
        signStatus: decorateSignStatus(signStatus),
        paymentInfo: decoratedPaymentInfo,
        form: nextForm,
        identityFormExpanded: !decoratedPaymentInfo.ready || !decoratedPaymentInfo.hasPlainIdentity,
      });
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

  toggleIdentityForm() {
    this.setData({ identityFormExpanded: !this.data.identityFormExpanded });
  },

  async createPresign() {
    if (this.data.presigning) return;
    this.setData({ presigning: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      if (!this.data.paymentInfo || !this.data.paymentInfo.ready) {
        wx.showToast({ title: "打款信息生效后才能签约", icon: "none" });
        openPage("payment-info");
        return;
      }
      const form = normalizeSignIdentityForm(this.data.form);
      try {
        validateSignIdentityForm(form);
      } catch (validationError) {
        this.setData({ identityFormExpanded: true });
        throw validationError;
      }
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
