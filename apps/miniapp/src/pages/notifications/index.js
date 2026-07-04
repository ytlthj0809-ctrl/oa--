const { finishPageLoading, handlePageRequestError, openPage, requireAnchorId, stopPullDownRefresh } = require("../../utils/api");
const { statusLabel, statusTone, typeLabel } = require("../../utils/formatters");
const { listNotifications, markNotificationRead } = require("../../services/miniapp-api");

function decorateNotification(notification) {
  return {
    ...notification,
    noticeTypeText: typeLabel(notification.noticeType),
    readStatusText: statusLabel(notification.readStatus),
    readStatusTone: statusTone(notification.readStatus),
  };
}

Page({
  data: {
    loading: false,
    error: "",
    notifications: [],
  },

  onShow() {
    this.loadNotifications();
  },

  onPullDownRefresh() {
    this.loadNotifications().finally(stopPullDownRefresh);
  },

  async loadNotifications() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const notifications = await listNotifications(anchorId);
      this.setData({ notifications: (notifications || []).map(decorateNotification) });
    } catch (error) {
      handlePageRequestError(this, error);
    } finally {
      finishPageLoading(this);
    }
  },

  async markRead(event) {
    const notificationId = event.currentTarget.dataset.id;
    if (!notificationId) return;
    this.setData({ error: "" });
    let anchorId = "";
    try {
      anchorId = requireAnchorId();
    } catch (error) {
      handlePageRequestError(this, error);
      return;
    }
    const previousNotifications = this.data.notifications;
    this.setData({
      notifications: previousNotifications.map((item) => item.notificationId === notificationId
        ? decorateNotification({ ...item, readStatus: "READ" })
        : item),
    });
    try {
      await markNotificationRead({ anchorId, notificationId });
    } catch (error) {
      if (handlePageRequestError(this, error)) return;
      this.setData({ notifications: previousNotifications, error: error.message });
    }
  },

  openDetail(event) {
    const notificationId = event.currentTarget.dataset.id;
    if (!notificationId) return;
    openPage("notification-detail", { notificationId });
  },
});
