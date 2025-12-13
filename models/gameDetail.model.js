const mongoose = require("mongoose");
const moment = require("moment");
const GameGeneralSchema = new mongoose.Schema(
  {
    // ========== CORE IDENTIFICATION ==========
    provider: {
      type: String,
      default: null,
    },
    category: {
      type: String,
      enum: ["Sports", "Slot", "Live Casino", "Esports", "Fishing", "Lottery"],
      default: null,
    },
    username: {
      type: String,
      default: null,
    },

    // Bet/Transaction identification
    betId: {
      type: String,
      default: null,
    },
    fetchId: {
      type: String,
      default: null,
    },
    transactionId: {
      type: String,
      default: null,
    },
    roundId: {
      type: String,
      default: null,
    },

    // ========== COMMON AMOUNTS ==========
    betamount: {
      type: Number,
      default: 0,
    },
    validbetamount: {
      type: Number,
      default: null,
    },
    winlossamount: {
      type: Number,
      default: 0,
    },
    settleamount: {
      type: Number,
      default: 0,
    },
    commission: {
      type: Number,
      default: 0,
    },
    jackpotAmount: {
      type: Number,
      default: 0,
    },

    // ========== STATUS FLAGS ==========
    settle: {
      type: Boolean,
      default: false,
    },
    cancel: {
      type: Boolean,
      default: false,
    },
    refund: {
      type: Boolean,
      default: false,
    },

    // ========== COMMON INFO ==========
    currency: {
      type: String,
      default: "MYR",
    },
    ipAddress: {
      type: String,
      default: null,
    },
    deviceType: {
      type: String,
      default: null,
    },

    // ========== SPORTS SPECIFIC ==========
    sports: {
      odds: { type: Number, default: null },
      oddsType: { type: String, default: null },
      sportsType: { type: Number, default: null },
      sportsTypeName: { type: String, default: null },
      gameType: { type: String, default: null },
      leagueId: { type: Number, default: null },
      leagueName: { type: String, default: null },
      homeId: { type: Number, default: null },
      homeName: { type: String, default: null },
      awayId: { type: Number, default: null },
      awayName: { type: String, default: null },
      side: { type: String, default: null },
      handicapInfo: { type: String, default: null },
      half: { type: String, default: null },
      score: { type: String, default: null },
      halfTimeScore: { type: String, default: null },
      runningScore: { type: String, default: null },
      status: { type: String, default: null },
      result: { type: String, default: null },
      matchDate: { type: String, default: null },
      matchDateTime: { type: Date, default: null },
      matchOverDate: { type: Date, default: null },
      workDate: { type: Date, default: null },
      groupId: { type: String, default: null },
      comboInfo: { type: String, default: null },
      isParlay: { type: Boolean, default: false },
      parlayLegs: { type: Number, default: null },
      isCashOut: { type: Boolean, default: false },
      result4d: { type: String, default: null },
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
      fishTurnover: { type: Number, default: null },
      fishWinLoss: { type: Number, default: null },
      depositamount: { type: Number, default: null },
      withdrawamount: { type: Number, default: null },
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

    // ========== DATES ==========
    betTime: {
      type: Date,
      default: null,
    },
    settleTime: {
      type: Date,
      default: null,
    },
    transactionDate: {
      type: Date,
      default: null,
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
