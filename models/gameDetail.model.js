const mongoose = require("mongoose");
const moment = require("moment");
const GameGeneralSchema = new mongoose.Schema(
  {
    // ========== CORE IDENTIFICATION ==========
    provider: { type: String, default: null },
    category: {
      type: String,
      enum: ["Sports", "Slot", "Live Casino", "Esports", "Fishing", "Lottery"],
      default: null,
    },
    username: { type: String, default: null },
    betId: { type: String, default: null },
    transactionId: { type: String, default: null },
    roundId: { type: String, default: null },

    // ========== UNIVERSAL AMOUNTS ==========
    betamount: { type: Number, default: 0 },
    validbetamount: { type: Number, default: 0 },
    winlossamount: { type: Number, default: 0 },
    settleamount: { type: Number, default: 0 },
    turnover: { type: Number, default: 0 },
    commission: { type: Number, default: 0 },

    // ========== UNIVERSAL STATUS ==========
    status: {
      type: String,
      enum: ["accepted", "rejected", "cancelled", null],
      default: null,
    },
    result: {
      type: String,
      enum: [
        "pending",
        "won",
        "lost",
        "draw",
        "void",
        "half_won",
        "half_lost",
        null,
      ],
      default: null,
    },
    settle: { type: Boolean, default: false },
    cancel: { type: Boolean, default: false },
    refund: { type: Boolean, default: false },

    // ========== UNIVERSAL GAME INFO ==========
    gameName: { type: String, default: null },
    gameId: { type: String, default: null },
    gameType: { type: String, default: null },

    // ========== UNIVERSAL DATES ==========
    betTime: { type: Date, default: null },
    settleTime: { type: Date, default: null },

    // ========== UNIVERSAL INFO ==========
    currency: { type: String, default: "MYR" },
    ipAddress: { type: String, default: null },
    deviceType: { type: String, default: null },

    // ========== RAW STATUS (for debugging) ==========
    statusRaw: { type: String, default: null },
    resultRaw: { type: String, default: null },

    // =====================================================
    // CATEGORY SPECIFIC DATA
    // =====================================================

    // ========== SPORTS SPECIFIC ==========
    sports: {
      // Sport type
      sportsType: { type: String, default: null },
      sportsTypeId: { type: Number, default: null },
      gameType: { type: String, default: null },

      // Odds
      odds: { type: Number, default: null },
      oddsType: { type: String, default: null },

      // League
      leagueId: { type: String, default: null },
      leagueName: { type: String, default: null },

      // Teams
      homeTeamId: { type: String, default: null },
      homeTeamName: { type: String, default: null },
      awayTeamId: { type: String, default: null },
      awayTeamName: { type: String, default: null },

      // Bet selection
      side: { type: String, default: null },
      selection: { type: String, default: null },
      handicapInfo: { type: String, default: null },
      half: { type: String, default: null },

      // Scores
      homeScore: { type: Number, default: null },
      awayScore: { type: Number, default: null },
      score: { type: String, default: null },
      halfTimeScore: { type: String, default: null },
      runningScore: { type: String, default: null },

      // Flags
      isLive: { type: Boolean, default: false },
      isParlay: { type: Boolean, default: false },
      isCashOut: { type: Boolean, default: false },
      isHalfWonLose: { type: Boolean, default: false },

      // Dates
      matchDate: { type: String, default: null },
      matchDateTime: { type: Date, default: null },
      matchEndTime: { type: Date, default: null },
      workDate: { type: Date, default: null },

      // Parlay
      groupId: { type: String, default: null },
      comboInfo: { type: String, default: null },
      parlayLegs: { type: Number, default: null },
      parlayDetails: { type: Array, default: [] },
      subBets: { type: Array, default: [] },

      // Turnover details
      turnoverByStake: { type: Number, default: 0 },
      turnoverByActualStake: { type: Number, default: 0 },
      netTurnoverByStake: { type: Number, default: 0 },
      netTurnoverByActualStake: { type: Number, default: 0 },
      maxWinWithoutActualStake: { type: Number, default: 0 },

      // Risk flags
      isSystemTagRisky: { type: Boolean, default: false },
      isCustomerTagRisky: { type: Boolean, default: false },

      // Other
      voidReason: { type: String, default: null },
      topDownline: { type: String, default: null },
      firstLastGoal: { type: String, default: null },
      result4d: { type: String, default: null },
      transSerial: { type: String, default: null },
      fetchId: { type: String, default: null },
      commissionAmount: { type: Number, default: null },
    },

    // ========== SLOT SPECIFIC ==========
    slot: {
      gameId: { type: String, default: null },
      gameName: { type: String, default: null },
      gameCode: { type: String, default: null },
      gameType: { type: String, default: null },

      spinCount: { type: Number, default: null },
      freeSpinCount: { type: Number, default: null },
      bonusRound: { type: Boolean, default: false },
      multiplier: { type: Number, default: null },

      // Fish game specific
      fishTurnover: { type: Number, default: null },
      fishWinLoss: { type: Number, default: null },
      depositamount: { type: Number, default: null },
      withdrawamount: { type: Number, default: null },

      // Transfer (ExpanseStudio)
      transferbetamount: { type: Number, default: null },
      transfersettleamount: { type: Number, default: null },
    },

    // ========== LIVE CASINO SPECIFIC ==========
    liveCasino: {
      gameId: { type: String, default: null },
      gameName: { type: String, default: null },
      gameCode: { type: String, default: null },
      gameType: { type: String, default: null },

      tableId: { type: String, default: null },
      tableName: { type: String, default: null },
      dealerId: { type: String, default: null },
      dealerName: { type: String, default: null },

      result: { type: String, default: null },
      cards: { type: String, default: null },
      playerCards: { type: String, default: null },
      bankerCards: { type: String, default: null },

      betType: { type: String, default: null },
      betDetail: { type: String, default: null },

      shoeId: { type: String, default: null },
      roundNo: { type: Number, default: null },
    },

    // ========== ESPORTS SPECIFIC ==========
    esports: {
      gameId: { type: String, default: null },
      gameName: { type: String, default: null },
      gameType: { type: String, default: null },

      tournamentId: { type: String, default: null },
      tournamentName: { type: String, default: null },
      matchId: { type: String, default: null },

      team1Id: { type: String, default: null },
      team1Name: { type: String, default: null },
      team2Id: { type: String, default: null },
      team2Name: { type: String, default: null },

      selection: { type: String, default: null },
      odds: { type: Number, default: null },
      handicap: { type: String, default: null },

      result: { type: String, default: null },
      score: { type: String, default: null },
      mapScore: { type: String, default: null },

      matchDateTime: { type: Date, default: null },
    },

    // ========== FISHING SPECIFIC ==========
    fishing: {
      gameId: { type: String, default: null },
      gameName: { type: String, default: null },
      gameCode: { type: String, default: null },

      fishTurnover: { type: Number, default: null },
      fishWinLoss: { type: Number, default: null },
      depositamount: { type: Number, default: null },
      withdrawamount: { type: Number, default: null },
    },

    // ========== LOTTERY SPECIFIC ==========
    lottery: {
      gameId: { type: String, default: null },
      gameName: { type: String, default: null },
      gameType: { type: String, default: null },

      drawId: { type: String, default: null },
      drawDate: { type: Date, default: null },
      drawNumber: { type: String, default: null },

      betNumber: { type: String, default: null },
      betType: { type: String, default: null },
      betPosition: { type: String, default: null },

      winningNumbers: { type: String, default: null },
      result: { type: String, default: null },
      prizeType: { type: String, default: null },
    },
  },
  {
    timestamps: true,
  }
);

GameGeneralSchema.index({ createdAt: -1 }, { expireAfterSeconds: 2992000 });

const GameGeneralDetailDataModal = mongoose.model(
  "GameGeneralDetailDataModal",
  GameGeneralSchema
);

module.exports = GameGeneralDetailDataModal;
