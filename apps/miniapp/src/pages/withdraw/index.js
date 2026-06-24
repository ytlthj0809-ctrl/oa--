const apiBase = "http://127.0.0.1:3000";

function request(route, options = {}) {
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

Page({
  data: {
    anchorId: "ANCHOR-001",
    amountCents: 5000,
    loading: false,
    error: "",
    records: [],
    detail: null,
  },

  onLoad() {
    this.loadWithdrawList();
  },

  async loadWithdrawList() {
    this.setData({ loading: true, error: "" });
    try {
      const records = await request(`/api/miniapp/withdraw-applies?anchorId=${this.data.anchorId}`);
      const detail = records[0] ? await request(`/api/miniapp/withdraw-applies/${records[0].applyId}`) : null;
      this.setData({ records, detail });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadWithdrawDetail(event) {
    const applyId = event.currentTarget.dataset.applyId;
    if (!applyId) return;
    this.setData({ loading: true, error: "" });
    try {
      const detail = await request(`/api/miniapp/withdraw-applies/${applyId}`);
      this.setData({ detail });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  async submitSampleWithdraw() {
    this.setData({ loading: true, error: "" });
    try {
      const clientRequestId = `miniapp-page-${Date.now()}`;
      const apply = await request("/api/miniapp/withdraw-applies", {
        method: "POST",
        data: {
          anchorId: this.data.anchorId,
          amountCents: this.data.amountCents,
          clientRequestId,
          operatorId: this.data.anchorId,
        },
      });
      const records = await request(`/api/miniapp/withdraw-applies?anchorId=${this.data.anchorId}`);
      const detail = await request(`/api/miniapp/withdraw-applies/${apply.applyId}`);
      this.setData({ records, detail });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },
});
