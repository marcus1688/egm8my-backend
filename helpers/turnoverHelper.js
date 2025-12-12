const EsportTfGamingModal = require("../models/esport_tfgaming.model");
const SportM9BetModal = require("../models/sport_m9bet.model");
const SportSBOBETModal = require("../models/sport_sbobet.model");
const SportsCMD368UnlimitedModal = require("../models/sport_cmdunlimited.model");
const SportCMDModal = require("../models/sport_cmd368.model");

const GAME_MODELS_CONFIG = [
  {
    model: EsportTfGamingModal,
    getQuery: (userId) => ({
      username: userId,
      $or: [{ settle: false }, { settle: { $exists: false } }],
      cancel: { $ne: true },
    }),
  },
  {
    model: SportM9BetModal,
    getQuery: (userId) => ({
      username: userId,
      $or: [{ settle: false }, { settle: { $exists: false } }],
      cancel: { $ne: true },
    }),
  },
  {
    model: SportSBOBETModal,
    getQuery: (userId) => ({
      username: userId,
      $or: [{ settle: false }, { settle: { $exists: false } }],
      cancel: { $ne: true },
    }),
  },
  // {
  //   model: AnotherGameModal,
  //   getQuery: (userId) => ({
  //     username: userId,
  //     isSettled: false,
  //     isCancelled: { $ne: true },
  //   }),
  // },
];

const checkCMD368PendingMatch = async (userId) => {
  try {
    const cmdBets = await SportCMDModal.find({
      username: userId,
      $or: [{ settle: false }, { settle: { $exists: false } }],
    })
      .select("betId")
      .lean();

    if (cmdBets.length === 0) return false;

    const betIds = cmdBets.map((bet) => bet.betId);

    const settledCount = await SportsCMD368UnlimitedModal.countDocuments({
      betId: { $in: betIds },
    });

    return settledCount < betIds.length;
  } catch (error) {
    console.error("Error checking CMD368 pending match:", error);
    return false;
  }
};

const checkSportPendingMatch = async (userId) => {
  try {
    // Check all models in parallel using exists() for efficiency
    const checks = GAME_MODELS_CONFIG.map(({ model, getQuery }) =>
      model.exists(getQuery(userId))
    );

    checks.push(checkCMD368PendingMatch(userId));

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
