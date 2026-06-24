const environmentOptions = [
  { key: "local", label: "本地联调", apiBase: "http://127.0.0.1:3000" },
  { key: "server", label: "云服预发", apiBase: "http://82.156.202.188" },
];

function formatMoney(cents = 0) {
  return `¥${(Number(cents || 0) / 100).toFixed(2)}`;
}

function request(apiBase, route, options = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${apiBase}${route}`,
      method: options.method || "GET",
      data: options.data || {},
      header: {
        "content-type": "application/json",
      },
      success(response) {
        const payload = response.data || {};
        if (response.statusCode >= 400 || payload.ok === false) {
          reject(new Error((payload.error && payload.error.message) || `request failed: ${route}`));
          return;
        }
        resolve(payload.data);
      },
      fail(error) {
        reject(error);
      },
    });
  });
}

function decorateRecord(record) {
  return {
    ...record,
    amountText: formatMoney(record.amountCents),
    progressText: `进度 ${record.progressStep || 0}/5`,
  };
}

function decorateDetail(detail) {
  if (!detail) return null;
  return {
    ...detail,
    amountText: formatMoney(detail.amountCents),
    frozenAmountText: formatMoney(detail.frozenAmountCents),
    statusHistory: detail.statusHistory || [],
  };
}

Page({
  data: {
    anchorId: "ANCHOR-001",
    amountCents: 5000,
    environmentOptions,
    environmentIndex: 0,
    environmentKey: environmentOptions[0].key,
    environmentLabel: environmentOptions[0].label,
    apiBase: environmentOptions[0].apiBase,
    loadingList: false,
    loadingDetail: false,
    submitting: false,
    error: "",
    records: [],
    detail: null,
    emptyText: "暂无提现记录",
  },

  onLoad() {
    this.loadWithdrawList();
  },

  changeEnvironment(event) {
    const environmentIndex = Number(event.detail.value || 0);
    const nextEnvironment = environmentOptions[environmentIndex] || environmentOptions[0];
    this.setData({
      environmentIndex,
      environmentKey: nextEnvironment.key,
      environmentLabel: nextEnvironment.label,
      apiBase: nextEnvironment.apiBase,
      records: [],
      detail: null,
      error: "",
    });
    this.loadWithdrawList();
  },

  retryLoad() {
    this.loadWithdrawList();
  },

  async loadWithdrawList() {
    this.setData({ loadingList: true, error: "" });
    try {
      const records = (await request(this.data.apiBase, `/api/miniapp/withdraw-applies?anchorId=${this.data.anchorId}`)).map(decorateRecord);
      const detail = records[0]
        ? decorateDetail(await request(this.data.apiBase, `/api/miniapp/withdraw-applies/${records[0].applyId}`))
        : null;
      this.setData({ records, detail, emptyText: records.length ? "" : "暂无提现记录" });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loadingList: false });
    }
  },

  async loadWithdrawDetail(event) {
    const applyId = event.currentTarget.dataset.applyId;
    if (!applyId) return;
    this.setData({ loadingDetail: true, error: "" });
    try {
      const detail = decorateDetail(await request(this.data.apiBase, `/api/miniapp/withdraw-applies/${applyId}`));
      this.setData({ detail });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loadingDetail: false });
    }
  },

  async submitSampleWithdraw() {
    this.setData({ submitting: true, error: "" });
    try {
      const clientRequestId = `miniapp-page-${Date.now()}`;
      const apply = await request(this.data.apiBase, "/api/miniapp/withdraw-applies", {
        method: "POST",
        data: {
          anchorId: this.data.anchorId,
          amountCents: this.data.amountCents,
          clientRequestId,
          operatorId: this.data.anchorId,
        },
      });
      const records = (await request(this.data.apiBase, `/api/miniapp/withdraw-applies?anchorId=${this.data.anchorId}`)).map(decorateRecord);
      const detail = decorateDetail(await request(this.data.apiBase, `/api/miniapp/withdraw-applies/${apply.applyId}`));
      this.setData({ records, detail, emptyText: "" });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
