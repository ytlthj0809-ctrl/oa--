const { finishPageLoading, handlePageRequestError, requireAnchorId, stopPullDownRefresh } = require("../../utils/api");
const { decorateBalanceFlow } = require("../../utils/decorators");
const { listBalanceFlows } = require("../../services/miniapp-api");

Page({
  data: {
    direction: "",
    loading: false,
    error: "",
    flows: [],
  },

  onLoad(options = {}) {
    this.setData({ direction: options.direction || options.balanceType || "" });
    this.loadFlows();
  },

  onPullDownRefresh() {
    this.loadFlows().finally(stopPullDownRefresh);
  },

  async loadFlows() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const flows = await listBalanceFlows({ anchorId, direction: this.data.direction });
      this.setData({
        flows: (flows || []).map(decorateBalanceFlow),
      });
    } catch (error) {
      handlePageRequestError(this, error);
    } finally {
      finishPageLoading(this);
    }
  },
});
