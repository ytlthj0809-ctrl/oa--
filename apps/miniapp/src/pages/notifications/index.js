const { appendQuery, openPage, request, requireAnchorId } = require("../../utils/api");

Page({
  data: {
    loading: false,
    error: "",
    notifications: [],
  },

  onLoad() {
    this.loadNotifications();
  },

  async loadNotifications() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const notifications = await request(appendQuery("/api/miniapp/notifications", { anchorId }));
      this.setData({ notifications });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  async markRead(event) {
    const notificationId = event.currentTarget.dataset.id;
    if (!notificationId) return;
    this.setData({ error: "" });
    try {
      const anchorId = requireAnchorId();
      await request(`/api/miniapp/notifications/${notificationId}/read`, {
        method: "POST",
        data: { anchorId, operatorId: "MINIAPP" },
      });
      this.loadNotifications();
    } catch (error) {
      this.setData({ error: error.message });
    }
  },

  openDetail(event) {
    const notificationId = event.currentTarget.dataset.id;
    if (!notificationId) return;
    openPage("notification-detail", { notificationId });
  },
});
