const { request } = require("../../utils/api");

Page({
  data: {
    loading: false,
    error: "",
    contact: null,
  },

  onLoad() {
    this.loadContact();
  },

  async loadContact() {
    this.setData({ loading: true, error: "" });
    try {
      const contact = await request("/api/miniapp/contact", { auth: false, skipAuthRedirect: true });
      this.setData({ contact });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  callPhone() {
    const phone = this.data.contact && this.data.contact.phone;
    if (!phone) return;
    wx.makePhoneCall({ phoneNumber: phone });
  },

  copyWechat() {
    const wechat = this.data.contact && this.data.contact.wechat;
    if (!wechat) return;
    wx.setClipboardData({
      data: wechat,
      success() {
        wx.showToast({ title: "客服微信已复制", icon: "success" });
      },
    });
  },
});
