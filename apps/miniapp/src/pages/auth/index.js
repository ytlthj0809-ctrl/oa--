const { getSession, setSession, setWechatBindToken } = require("../../utils/api");
const { loginByWechat } = require("../../services/miniapp-api");

function getWechatLoginCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(result) {
        if (!result.code) {
          reject(new Error("未获取到微信登录凭证"));
          return;
        }
        resolve(result.code);
      },
      fail: reject,
    });
  });
}

Page({
  data: {
    showFallback: false,
    error: "",
  },

  async onLoad() {
    const session = getSession();
    if (session && session.anchorId) {
      wx.switchTab({ url: "/src/pages/home/index" });
      return;
    }
    try {
      const result = await loginByWechat(await getWechatLoginCode());
      if (result.bindingRequired) {
        setWechatBindToken(result.wechatBindToken);
        wx.redirectTo({ url: "/src/pages/login/index?wechatChecked=1" });
        return;
      }
      setSession(result);
      if (result.protocolStatus && result.protocolStatus !== "AGREED") {
        wx.redirectTo({ url: "/src/pages/protocols/index?mode=required" });
        return;
      }
      wx.switchTab({ url: "/src/pages/home/index" });
    } catch (error) {
      this.setData({
        error: error && error.message ? error.message : "自动登录失败，请手动重试",
        showFallback: true,
      });
    }
  },

  goLogin() {
    wx.redirectTo({ url: "/src/pages/login/index" });
  },
});
