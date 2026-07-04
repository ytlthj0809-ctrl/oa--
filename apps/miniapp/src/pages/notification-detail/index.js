const { appendQuery, openPage, request, isAuthRequiredError, requireAnchorId } = require("../../utils/api");
const { statusLabel, statusTone, typeLabel } = require("../../utils/formatters");

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
      const notification = await request(appendQuery(`/api/miniapp/notifications/${this.data.notificationId}`, { anchorId }));
      this.setData({
        notification: notification ? {
          ...notification,
          noticeTypeText: typeLabel(notification.noticeType),
          readStatusText: statusLabel(notification.readStatus),
          readStatusTone: statusTone(notification.readStatus),
        } : null,
      });
    } catch (error) {
      if (isAuthRequiredError(error)) { this.__authRedirecting = true; return; }
      this.setData({ error: error.message });
    } finally {
      if (!this.__authRedirecting) this.setData({ loading: false });
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
