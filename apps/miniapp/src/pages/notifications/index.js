const {
  finishPageLoading,
  handlePageRequestError,
  isAuthRequiredError,
  markMiniappDataDirty,
  openPage,
  requireAnchorId,
  stopPullDownRefresh,
} = require("../../utils/api");
const { formatDateShort, statusLabel, statusTone, typeLabel } = require("../../utils/formatters");
const { createOptimisticUpdateCoordinator } = require("../../utils/optimistic-update-coordinator");
const { listNotifications, markNotificationRead } = require("../../services/miniapp-api");
const NOTIFICATION_READ_CONCURRENCY = 5;

// Keep async loads and optimistic mutations behind one lifecycle-aware coordinator.
function getNotificationCoordinator(page) {
  if (!page.__notificationCoordinator) {
    page.__notificationCoordinator = createOptimisticUpdateCoordinator();
  }
  return page.__notificationCoordinator;
}

function decorateNotification(notification) {
  return {
    ...notification,
    createdAtText: formatDateShort(notification.createdAt),
    noticeTypeText: typeLabel(notification.noticeType),
    readStatusText: statusLabel(notification.readStatus),
    readStatusTone: statusTone(notification.readStatus),
  };
}

function updateTabBarUnreadBadge(notifications = []) {
  const unreadCount = notifications.filter((item) => item.readStatus !== "READ").length;
  if (unreadCount > 0) {
    wx.setTabBarBadge({ index: 3, text: String(unreadCount) });
  } else {
    wx.removeTabBarBadge({ index: 3 });
  }
}

function applyNotificationState(page, notifications, data = {}) {
  page.setData({
    ...data,
    notifications,
    hasUnread: notifications.some((item) => item.readStatus !== "READ"),
  });
  updateTabBarUnreadBadge(notifications);
}

async function settleNotificationReads(anchorId, notificationIds = []) {
  const results = [];
  for (let index = 0; index < notificationIds.length; index += NOTIFICATION_READ_CONCURRENCY) {
    const batch = notificationIds.slice(index, index + NOTIFICATION_READ_CONCURRENCY);
    results.push(...await Promise.allSettled(
      batch.map((notificationId) => markNotificationRead({ anchorId, notificationId })),
    ));
  }
  return results;
}

Page({
  data: {
    loading: false,
    error: "",
    notifications: [],
    hasUnread: false,
    markingAllRead: false,
  },

  onShow() {
    this.loadNotifications();
  },

  onPullDownRefresh() {
    this.loadNotifications().finally(stopPullDownRefresh);
  },

  onUnload() {
    getNotificationCoordinator(this).unload();
  },

  async loadNotifications(options = {}) {
    const coordinator = getNotificationCoordinator(this);
    const loadToken = coordinator.beginLoad();
    if (!loadToken) return;
    this.setData({ loading: true, ...(options.preserveError ? {} : { error: "" }) });
    try {
      const anchorId = requireAnchorId();
      const notifications = await listNotifications(anchorId);
      if (!coordinator.canApplyLoad(loadToken)) return;
      const decorated = (notifications || []).map(decorateNotification);
      applyNotificationState(this, decorated);
    } catch (error) {
      if (!coordinator.canApplyLoad(loadToken)) return;
      if (options.preserveError && this.data.error && !isAuthRequiredError(error)) return;
      handlePageRequestError(this, error);
    } finally {
      const shouldFinish = coordinator.canApplyLoad(loadToken);
      const shouldReload = coordinator.endLoad(loadToken);
      if (shouldFinish) finishPageLoading(this);
      if (shouldReload && !this.__authRedirecting) this.loadNotifications({ preserveError: true });
    }
  },

  async markRead(event) {
    if (this.data.markingAllRead) return;
    const notificationId = event.currentTarget.dataset.id;
    if (!notificationId) return;
    const previousItem = this.data.notifications.find((item) => item.notificationId === notificationId);
    if (!previousItem || previousItem.readStatus === "READ") return;
    const coordinator = getNotificationCoordinator(this);
    const mutationToken = coordinator.beginItemMutation(notificationId);
    if (!mutationToken) return;
    this.setData({ error: "", loading: false });
    let anchorId = "";
    try {
      anchorId = requireAnchorId();
    } catch (error) {
      const shouldHandle = coordinator.canApplyItemMutation(mutationToken);
      coordinator.endItemMutation(mutationToken);
      if (shouldHandle) handlePageRequestError(this, error);
      return;
    }
    const previousNotifications = this.data.notifications;
    const updatedNotifications = previousNotifications.map((item) =>
      item.notificationId === notificationId
        ? decorateNotification({ ...item, readStatus: "READ" })
        : item
    );
    applyNotificationState(this, updatedNotifications);
    try {
      await markNotificationRead({ anchorId, notificationId });
      markMiniappDataDirty();
    } catch (error) {
      if (!coordinator.canApplyItemMutation(mutationToken)) return;
      const rolledBackNotifications = this.data.notifications.map((item) =>
        item.notificationId === notificationId
          ? decorateNotification({ ...item, readStatus: previousItem.readStatus })
          : item
      );
      applyNotificationState(this, rolledBackNotifications);
      handlePageRequestError(this, error);
    } finally {
      const shouldReload = coordinator.endItemMutation(mutationToken);
      if (shouldReload && !this.__authRedirecting) this.loadNotifications({ preserveError: true });
    }
  },

  async markAllRead() {
    if (this.data.markingAllRead) return;
    const coordinator = getNotificationCoordinator(this);
    const mutationToken = coordinator.beginBulkMutation();
    if (!mutationToken) return;
    this.setData({ error: "", loading: false });
    let anchorId = "";
    try {
      anchorId = requireAnchorId();
    } catch (error) {
      const shouldHandle = coordinator.canApplyBulkMutation(mutationToken);
      coordinator.endBulkMutation(mutationToken);
      if (shouldHandle) handlePageRequestError(this, error);
      return;
    }
    const previousNotifications = this.data.notifications;
    const updated = this.data.notifications.map((item) =>
      item.readStatus !== "READ" ? decorateNotification({ ...item, readStatus: "READ" }) : item
    );
    applyNotificationState(this, updated, { markingAllRead: true });
    try {
      const unreadIds = previousNotifications
        .filter((item) => item.readStatus !== "READ" && item.notificationId)
        .map((item) => item.notificationId);
      const results = await settleNotificationReads(anchorId, unreadIds);
      const successfulIds = new Set(
        unreadIds.filter((_, index) => results[index].status === "fulfilled"),
      );
      if (successfulIds.size > 0) markMiniappDataDirty();
      if (!coordinator.canApplyBulkMutation(mutationToken)) return;
      const failedResults = results.filter((result) => result.status === "rejected");
      const reconciledNotifications = previousNotifications.map((item) =>
        successfulIds.has(item.notificationId)
          ? decorateNotification({ ...item, readStatus: "READ" })
          : item
      );
      applyNotificationState(this, reconciledNotifications);
      if (failedResults.length > 0) {
        const authFailure = failedResults.find((result) => isAuthRequiredError(result.reason));
        if (authFailure && handlePageRequestError(this, authFailure.reason)) return;
        this.setData({
          error: successfulIds.size > 0
            ? `已标记 ${successfulIds.size} 条，${failedResults.length} 条失败，请重试。`
            : "通知标记失败，请稍后重试。",
        });
      }
    } catch (error) {
      if (!coordinator.canApplyBulkMutation(mutationToken)) return;
      applyNotificationState(this, previousNotifications);
      handlePageRequestError(this, error);
    } finally {
      const shouldFinish = coordinator.canApplyBulkMutation(mutationToken);
      const shouldReload = coordinator.endBulkMutation(mutationToken);
      if (shouldFinish && !this.__authRedirecting) this.setData({ markingAllRead: false });
      if (shouldReload && !this.__authRedirecting) this.loadNotifications({ preserveError: true });
    }
  },

  openDetail(event) {
    const notificationId = event.currentTarget.dataset.id;
    if (!notificationId) return;
    openPage("notification-detail", { notificationId });
  },
});
