const checkSportPendingMatch = async (userId) => {
  try {
    return false;

    // 未来的真实逻辑（先注释掉）：
    // const SportBet = require("../models/sportbet.model");
    // const pendingMatches = await SportBet.find({
    //   userId: userId,
    //   status: "pending"
    // });
    // return pendingMatches.length > 0;
  } catch (error) {
    console.error("Error checking sport pending match:", error);
    return false;
  }
};

module.exports = {
  checkSportPendingMatch,
};
