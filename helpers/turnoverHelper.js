const EsportTfGamingModal = require("../models/esport_tfgaming.model");

const GAME_MODELS_CONFIG = [
  {
    model: EsportTfGamingModal,
    getQuery: (userId) => ({
      username: userId,
      $or: [{ settle: false }, { settle: { $exists: false } }],
      cancel: { $ne: true },
    }),
  },
  // {
  //   model: SportBetModal,
  //   getQuery: (userId) => ({
  //     userId: userId,
  //     status: "pending",
  //   }),
  // },
  // {
  //   model: AnotherGameModal,
  //   getQuery: (userId) => ({
  //     username: userId,
  //     isSettled: false,
  //     isCancelled: { $ne: true },
  //   }),
  // },
];

const checkSportPendingMatch = async (userId) => {
  try {
    // Check all models in parallel using exists() for efficiency
    const checks = GAME_MODELS_CONFIG.map(({ model, getQuery }) =>
      model.exists(getQuery(userId))
    );

    const results = await Promise.all(checks);
    // Return true if ANY model has a pending match
    return results.some((result) => result !== null);
  } catch (error) {
    console.error("Error checking sport pending match:", error);
    return false;
  }
};

module.exports = {
  checkSportPendingMatch,
};
