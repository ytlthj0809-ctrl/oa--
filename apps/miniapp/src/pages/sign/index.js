const { finishPageLoading, handlePageRequestError, openPage, requireAnchorId } = require("../../utils/api");
const { createYzhPresign, getPaymentInfo, getYzhSignStatus } = require("../../services/miniapp-api");
const { decorateSignStatus } = require("../../utils/decorators");
const { isPaymentInfoReady, statusLabel, statusTone } = require("../../utils/formatters");
const { normalizeSignIdentityForm, validateSignIdentityForm } = require("../../utils/validators");
const { clearYzhSdkContext, startYzhSdk, yzhAssistantAppId } = require("../../utils/yzh-sdk");

function decoratePaymentInfoForSign(paymentInfo) {
  const paymentInfoStatus = paymentInfo && paymentInfo.paymentInfoStatus ? paymentInfo.paymentInfoStatus : "MISSING";
  if (!isPaymentInfoReady(paymentInfoStatus)) {
    return {
      ready: false,
      hasPlainIdentity: false,
      statusText: statusLabel(paymentInfoStatus),
      statusTone: statusTone(paymentInfoStatus),
      helperText: paymentInfoStatus === "MISSING"
        ? "请先补充打款信息，再进行云账户签约。"
        : "打款信息尚未生效，审核通过后才能生成云账户签约入口。",
    };
  }
  return {
    ready: true,
    hasPlainIdentity: false,
    statusText: statusLabel(paymentInfoStatus),
    statusTone: statusTone(paymentInfoStatus),
    helperText: "已保存实名信息；为保护隐私，系统只返回脱敏摘要。本次签约需本人再确认姓名和身份证号。",
  };
}

function emptySignIdentityForm() {
  return { realName: "", idCardNo: "" };
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
    presignReady: false,
    form: emptySignIdentityForm(),
  },

  onLoad() {
    this.__yzhPresign = null;
    this.loadSignStatus();
  },

  onUnload() {
    this.__signRequestGeneration = Number(this.__signRequestGeneration || 0) + 1;
    this.clearPresignContext();
  },

  clearPresignContext() {
    this.__yzhPresign = null;
    clearYzhSdkContext();
  },

  async loadSignStatus() {
    const generation = Number(this.__signRequestGeneration || 0) + 1;
    this.__signRequestGeneration = generation;
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const [signStatus, paymentInfo] = await Promise.all([
        getYzhSignStatus(anchorId),
        getPaymentInfo(anchorId),
      ]);
      if (generation !== this.__signRequestGeneration) return;
      const decoratedPaymentInfo = decoratePaymentInfoForSign(paymentInfo);
      this.setData({
        signStatus: decorateSignStatus(signStatus),
        paymentInfo: decoratedPaymentInfo,
        form: emptySignIdentityForm(),
        identityFormExpanded: !decoratedPaymentInfo.ready || !decoratedPaymentInfo.hasPlainIdentity,
      });
    } catch (error) {
      if (generation === this.__signRequestGeneration) handlePageRequestError(this, error);
    } finally {
      if (generation === this.__signRequestGeneration) finishPageLoading(this);
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
    if (this.data.presigning || this.data.refreshing) return;
    const generation = Number(this.__signRequestGeneration || 0) + 1;
    this.__signRequestGeneration = generation;
    this.clearPresignContext();
    this.setData({ loading: false, presigning: true, presignReady: false, error: "" });
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
      const presign = await createYzhPresign({
        anchorId,
        realName: form.realName,
        idCardNo: form.idCardNo,
        certificateType: 0,
        collectPhoneNo: 0,
      });
      if (generation !== this.__signRequestGeneration) return;
      const signStatus = presign && typeof presign.signStatus === "object" && presign.signStatus
        ? presign.signStatus
        : {
            anchorId,
            signStatus: "SIGNING",
            eventStatusDetail: "签约入口已生成，请前往云账户完成签约",
          };
      this.__yzhPresign = {
        signUrl: presign.signUrl || "",
        assistantAppId: presign.assistantAppId || yzhAssistantAppId,
        miniProgramPath: presign.miniProgramPath || "pages/api-sign/index",
      };
      this.setData({
        form: emptySignIdentityForm(),
        presignReady: Boolean(this.__yzhPresign.signUrl),
        signStatus: decorateSignStatus(signStatus),
      }, () => {
        this.openYzhSignMiniProgram();
      });
    } catch (error) {
      if (generation === this.__signRequestGeneration) handlePageRequestError(this, error);
    } finally {
      if (generation === this.__signRequestGeneration) finishPageLoading(this, "presigning");
    }
  },

  async refreshSigned() {
    if (this.data.refreshing || this.data.presigning) return;
    const generation = Number(this.__signRequestGeneration || 0) + 1;
    this.__signRequestGeneration = generation;
    this.setData({ loading: false, refreshing: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const signStatus = await getYzhSignStatus(anchorId);
      if (generation !== this.__signRequestGeneration) return;
      const decoratedSignStatus = decorateSignStatus(signStatus);
      if (decoratedSignStatus.isSigned) this.clearPresignContext();
      this.setData({
        signStatus: decoratedSignStatus,
        ...(decoratedSignStatus.isSigned ? { presignReady: false } : {}),
      });
    } catch (error) {
      if (generation === this.__signRequestGeneration) handlePageRequestError(this, error);
    } finally {
      if (generation === this.__signRequestGeneration) finishPageLoading(this, "refreshing");
    }
  },

  openYzhSignMiniProgram() {
    const presign = this.__yzhPresign || {};
    const signUrl = presign.signUrl;
    if (!signUrl) return;
    startYzhSdk({
      data: { url: signUrl },
      appId: presign.assistantAppId || yzhAssistantAppId,
      path: presign.miniProgramPath || "pages/api-sign/index",
      envVersion: "release",
      onNavigateSuccess() {
        wx.showToast({ title: "已打开签约", icon: "success" });
      },
      onNavigateFail: () => {
        wx.showModal({
          title: "未能打开云账户",
          content: "请稍后重试；如需手动处理，请点击“复制签约链接”。",
          showCancel: false,
        });
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
    const signUrl = this.__yzhPresign && this.__yzhPresign.signUrl;
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
