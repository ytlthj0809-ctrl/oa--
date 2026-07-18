let staticDataCacheGeneration = 0;

function createStaticDataCache(data = {}) {
  return {
    anchorId: "",
    flows: [],
    rewards: [],
    flowPage: 0,
    rewardPage: 0,
    flowHasMore: false,
    rewardHasMore: false,
    loadedAt: 0,
    generation: ++staticDataCacheGeneration,
    flowGeneration: 0,
    rewardGeneration: 0,
    ...data,
  };
}

const state = {
  staticDataCache: createStaticDataCache(),
};

function resetStaticDataCache() {
  state.staticDataCache = createStaticDataCache();
}

module.exports = {
  state,
  createStaticDataCache,
  resetStaticDataCache,
};
