const { appendQuery, openPage, request, requireAnchorId } = require("../../utils/api");

Page({
  data: {
    notificationId: "",
    loading: false,
    error: "",
    notification: null,
  },

  onLoad(options = {}) {
    this.setData({ notificationId: options.notificationId || "" });
    this.loadDetail();
  },

  async loadDetail() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const notifications = await request(appendQuery("/api/miniapp/notifications", { anchorId }));
      const notification = (notifications || []).find((item) => item.notificationId === this.data.notificationId) || null;
      this.setData({ notification });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  openBusiness() {
    const item = this.data.notification || {};
    if (item.businessType === "WITHDRAW") openPage("withdraw-records");
    else if (item.businessType === "TASK_REWARD") openPage("rewards");
    else if (item.businessType === "PAYMENT_INFO") openPage("payment-info");
    else openPage("notifications");
  },
});
