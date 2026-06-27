App({
  globalData: {
    appName: "嘉音提现",
    defaultApiBase: "https://api.jiayin.site",
    q100PrdAcceptanceRuntime: true,
    q101PrdOperationActionRuntime: true,
    serviceOrigin: "https://api.jiayin.site",
    sessionStorageKey: "jy-miniapp-session",
  },

  onLaunch() {
    this.globalData.launchTime = Date.now();
  },
});
