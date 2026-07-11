const { finishPageLoading, handlePageRequestError, requireAnchorId } = require("../../utils/api");
const { getYzhSignStatus } = require("../../services/miniapp-api");
const { decorateSignStatus } = require("../../utils/decorators");

function hasSignedReturn(options = {}) {
  const status = String(options.signStatus || options.status || options.result || "").toUpperCase();
  const success = String(options.success || "").toLowerCase();
  return status === "SIGNED" || status === "SUCCESS" || success === "true" || success === "1";
}

Page({
  data: {
    loading: false,
    error: "",
    signStatus: null,
    returnHint: "",
  },

  onLoad(options = {}) {
    this.refreshReturnStatus(options);
  },

  async refreshReturnStatus(options = {}) {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const returnedAsSigned = hasSignedReturn(options);
      const signStatus = await getYzhSignStatus(anchorId);
      const decoratedSignStatus = decorateSignStatus(signStatus);
      const serverSigned = decoratedSignStatus.signStatus === "SIGNED";
      this.setData({
        signStatus: decoratedSignStatus,
        returnHint: returnedAsSigned
          ? serverSigned
            ? "已收到签约完成提示，服务端状态已同步。"
            : "已收到签约完成提示，服务端状态正在同步，请稍后刷新。"
          : "未收到签约完成参数，已查询服务端当前状态。",
      });
    } catch (error) {
      handlePageRequestError(this, error);
    } finally {
      finishPageLoading(this);
    }
  },

  goSign() {
    wx.redirectTo({ url: "/src/pages/sign/index" });
  },
});
