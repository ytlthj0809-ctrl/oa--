const { finishPageLoading, handlePageRequestError, requireAnchorId } = require("../../utils/api");
const { decorateDataSnapshot } = require("../../utils/decorators");
const { getCurrentChinaMonth } = require("../../utils/formatters");
const { getDataSnapshots } = require("../../services/miniapp-api");

Page({
  data: {
    month: "",
    platform: "ALL",
    loading: false,
    error: "",
    detail: null,
  },

  onLoad(options = {}) {
    this.setData({ month: options.month || getCurrentChinaMonth(), platform: options.platform || "ALL" });
    this.loadDetail();
  },

  async loadDetail() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const list = await getDataSnapshots({
        anchorId,
        month: this.data.month,
        platform: this.data.platform,
      });
      const detail = (Array.isArray(list) ? list : []).find((item) => (
        item.month === this.data.month && item.platform === this.data.platform
      )) || (Array.isArray(list) ? list[0] : null) || null;
      this.setData({ detail: detail ? decorateDataSnapshot(detail) : null });
    } catch (error) {
      handlePageRequestError(this, error);
    } finally {
      finishPageLoading(this);
    }
  },
});
