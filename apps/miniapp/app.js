const { handleYzhAppShow, initYzhSdk, isYzhAssistantReturn } = require("./src/utils/yzh-sdk");

function reportMiniappRuntimeError(type, detail) {
  if (typeof console !== "undefined" && console.error) {
    console.error(`[miniapp:${type}]`, detail);
  }
}

App({
  globalData: {
    appName: "嘉音提现",
    defaultApiBase: "https://api.jiayin.site",
    version: "0.1.0",
    q100PrdAcceptanceRuntime: true,
    q101PrdOperationActionRuntime: true,
    serviceOrigin: "https://api.jiayin.site",
    sessionStorageKey: "jy-miniapp-session",
    networkOnline: true,
  },

  onLaunch() {
    this.globalData.launchTime = Date.now();
    initYzhSdk();
    if (wx.onNetworkStatusChange) {
      wx.onNetworkStatusChange(({ isConnected }) => {
        this.globalData.networkOnline = Boolean(isConnected);
        if (!isConnected) {
          wx.showToast({ title: "网络已断开，请检查连接", icon: "none" });
        }
      });
    }
  },

  onShow(options = {}) {
    if (isYzhAssistantReturn(options)) {
      handleYzhAppShow(options);
      return;
    }
    this.globalData.lastShowTime = Date.now();
  },

  onError(error) {
    reportMiniappRuntimeError("error", error);
  },

  onUnhandledRejection(result) {
    reportMiniappRuntimeError("unhandled-rejection", result && (result.reason || result));
  },

  onPageNotFound(result) {
    reportMiniappRuntimeError("page-not-found", result);
    wx.reLaunch({ url: "/src/pages/home/index" });
  },
});
