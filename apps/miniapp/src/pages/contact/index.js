const { request } = require("../../utils/api");

Page({
  data: {
    loading: false,
    error: "",
    contact: null,
  },

  onLoad() {
    this.loadContact();
  },

  async loadContact() {
    this.setData({ loading: true, error: "" });
    try {
      const contact = await request("/api/miniapp/contact");
      this.setData({ contact });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },
});
