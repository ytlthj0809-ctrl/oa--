const resetters = [];

function registerMiniappCacheResetter(reset) {
  if (typeof reset === "function" && !resetters.includes(reset)) {
    resetters.push(reset);
  }
}

function clearMiniappCaches() {
  resetters.forEach((reset) => {
    try {
      reset();
    } catch (error) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("miniapp cache reset failed", error);
      }
    }
  });
}

module.exports = {
  clearMiniappCaches,
  registerMiniappCacheResetter,
};
