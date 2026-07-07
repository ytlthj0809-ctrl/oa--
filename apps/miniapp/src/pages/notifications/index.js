const { finishPageLoading, handlePageRequestError, openPage, requireAnchorId, stopPullDownRefresh } = require("../../utils/api");
const { formatDateShort, statusLabel, statusTone, typeLabel } = require("../../utils/formatters");
const { listNotifications, markNotificationRead } = require("../../services/miniapp-api");

function decorateNotification(notification) {
  return {
    ...notification,
    createdAtText: formatDateShort(notification.createdAt),
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
    hasUnread: false,
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
      const decorated = (notifications || []).map(decorateNotification);
      this.setData({
        notifications: decorated,
        hasUnread: decorated.some((n) => n.readStatus !== "READ"),
      });
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
    this.setData({ hasUnread: this.data.notifications.some((n) => n.readStatus !== "READ") });
    try {
      await markNotificationRead({ anchorId, notificationId });
    } catch (error) {
      if (handlePageRequestError(this, error)) return;
      this.setData({ notifications: previousNotifications, error: error.message });
    }
  },

  async markAllRead() {
    this.setData({ error: "" });
    let anchorId = "";
    try {
      anchorId = requireAnchorId();
    } catch (error) {
      handlePageRequestError(this, error);
      return;
    }
    const previousNotifications = this.data.notifications;
    const updated = this.data.notifications.map((item) =>
      item.readStatus !== "READ" ? decorateNotification({ ...item, readStatus: "READ" }) : item
    );
    this.setData({ notifications: updated, hasUnread: false });
    try {
      const unreadIds = previousNotifications.filter((n) => n.readStatus !== "READ").map((n) => n.notificationId);
      await Promise.all(unreadIds.map((id) => markNotificationRead({ anchorId, notificationId: id })));
    } catch (error) {
      if (handlePageRequestError(this, error)) return;
      this.setData({ notifications: previousNotifications });
    }
  },

  openDetail(event) {
    const notificationId = event.currentTarget.dataset.id;
    if (!notificationId) return;
    openPage("notification-detail", { notificationId });
  },
});
