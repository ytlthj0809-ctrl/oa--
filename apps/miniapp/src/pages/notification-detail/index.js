const { appendQuery, openPage, request, isAuthRequiredError, requireAnchorId } = require("../../utils/api");
const { statusLabel, statusTone, typeLabel } = require("../../utils/formatters");
const { markNotificationRead } = require("../../services/miniapp-api");

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
      if (notification && notification.readStatus !== "READ") {
        this.autoMarkRead(anchorId);
      }
    } catch (error) {
      if (isAuthRequiredError(error)) { this.__authRedirecting = true; return; }
      this.setData({ error: error.message });
    } finally {
      if (!this.__authRedirecting) this.setData({ loading: false });
    }
  },

  async autoMarkRead(anchorId) {
    try {
      await markNotificationRead({ anchorId, notificationId: this.data.notificationId });
      if (this.data.notification) {
        this.setData({
          notification: {
            ...this.data.notification,
            readStatus: "READ",
            readStatusText: statusLabel("READ"),
            readStatusTone: statusTone("READ"),
          },
        });
      }
    } catch (_) {
      // silently ignore auto-mark failure
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
