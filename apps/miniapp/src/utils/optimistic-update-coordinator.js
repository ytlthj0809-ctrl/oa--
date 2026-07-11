function createOptimisticUpdateCoordinator() {
  let active = true;
  let lifecycleGeneration = 0;
  let loadGeneration = 0;
  let mutationCount = 0;
  let bulkMutationVersion = 0;
  let bulkMutationActive = false;
  let loadPending = false;
  const activeLoadGenerations = new Set();
  const itemMutationVersions = new Map();

  function invalidateLoads() {
    loadGeneration += 1;
  }

  function isCurrentLifecycle(token) {
    return Boolean(token) && active && token.lifecycleGeneration === lifecycleGeneration;
  }

  function consumePendingLoad() {
    if (!active || mutationCount > 0 || !loadPending) return false;
    loadPending = false;
    return true;
  }

  return {
    unload() {
      active = false;
      loadPending = false;
      activeLoadGenerations.clear();
      lifecycleGeneration += 1;
      invalidateLoads();
    },

    beginLoad() {
      if (!active) return null;
      if (mutationCount > 0) {
        loadPending = true;
        return null;
      }
      loadPending = false;
      loadGeneration += 1;
      activeLoadGenerations.add(loadGeneration);
      return { lifecycleGeneration, loadGeneration };
    },

    canApplyLoad(token) {
      return isCurrentLifecycle(token)
        && mutationCount === 0
        && token.loadGeneration === loadGeneration;
    },

    endLoad(token) {
      if (token) activeLoadGenerations.delete(token.loadGeneration);
      return consumePendingLoad();
    },

    beginItemMutation(itemId) {
      if (!active || bulkMutationActive) return null;
      if (activeLoadGenerations.has(loadGeneration)) loadPending = true;
      invalidateLoads();
      mutationCount += 1;
      const mutationVersion = Number(itemMutationVersions.get(itemId) || 0) + 1;
      itemMutationVersions.set(itemId, mutationVersion);
      return { lifecycleGeneration, itemId, mutationVersion };
    },

    canApplyItemMutation(token) {
      return isCurrentLifecycle(token)
        && itemMutationVersions.get(token.itemId) === token.mutationVersion;
    },

    endItemMutation(token) {
      mutationCount = Math.max(0, mutationCount - 1);
      if (token && itemMutationVersions.get(token.itemId) === token.mutationVersion) {
        itemMutationVersions.delete(token.itemId);
      }
      return consumePendingLoad();
    },

    beginBulkMutation() {
      if (!active || mutationCount > 0) return null;
      if (activeLoadGenerations.has(loadGeneration)) loadPending = true;
      invalidateLoads();
      mutationCount = 1;
      bulkMutationActive = true;
      bulkMutationVersion += 1;
      return { lifecycleGeneration, bulkMutationVersion };
    },

    canApplyBulkMutation(token) {
      return isCurrentLifecycle(token)
        && bulkMutationActive
        && token.bulkMutationVersion === bulkMutationVersion;
    },

    endBulkMutation(token) {
      if (!token || token.bulkMutationVersion !== bulkMutationVersion) return false;
      mutationCount = 0;
      bulkMutationActive = false;
      return consumePendingLoad();
    },
  };
}

module.exports = {
  createOptimisticUpdateCoordinator,
};
