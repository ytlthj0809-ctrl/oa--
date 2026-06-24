const environmentOptions = [
  { key: "local", label: "本地联调", apiBase: "http://127.0.0.1:3000" },
  { key: "server", label: "云服预发", apiBase: "http://82.156.202.188" },
];

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

function buildDefaultForm() {
  const suffix = String(Date.now()).slice(-5);
  return {
    anchorCode: `AMINI${suffix}`,
    displayName: `小程序主播${suffix}`,
    mobile: `1397${suffix.padStart(7, "0").slice(0, 7)}`,
    platform: "bixin",
    accountNo: `bx-miniapp-${suffix}`,
    bankAccountNo: "6222020200000000777",
    idCardNo: "110101199707070077",
  };
}

Page({
  data: {
    environmentOptions,
    environmentIndex: 0,
    environmentLabel: environmentOptions[0].label,
    apiBase: environmentOptions[0].apiBase,
    form: buildDefaultForm(),
    submitting: false,
    loadingStatus: false,
    error: "",
    latestRequest: null,
  },

  changeEnvironment(event) {
    const environmentIndex = Number(event.detail.value || 0);
    const nextEnvironment = environmentOptions[environmentIndex] || environmentOptions[0];
    this.setData({
      environmentIndex,
      environmentLabel: nextEnvironment.label,
      apiBase: nextEnvironment.apiBase,
      error: "",
    });
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      form: {
        ...this.data.form,
        [field]: event.detail.value,
      },
    });
  },

  async submitRegistration() {
    this.setData({ submitting: true, error: "" });
    try {
      const result = await request(this.data.apiBase, "/api/miniapp/anchor-registration-requests", {
        method: "POST",
        data: {
          ...this.data.form,
          openId: `local-openid-${this.data.form.mobile}`,
          operatorId: "MINIAPP",
        },
      });
      this.setData({ latestRequest: result });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async refreshRegistrationStatus() {
    this.setData({ loadingStatus: true, error: "" });
    try {
      const records = await request(this.data.apiBase, `/api/miniapp/anchor-registration-requests?mobile=${this.data.form.mobile}`);
      this.setData({ latestRequest: records[0] || null });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loadingStatus: false });
    }
  },
});
