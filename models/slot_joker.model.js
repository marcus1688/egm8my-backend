const mongoose = require("mongoose");
const moment = require("moment");

const slotjokerschema = new mongoose.Schema(
  {
    username: {
      type: String,
    },
    betId: {
      type: String,
    },
    settleId: {
      type: String,
    },
    cancelId: {
      type: String,
    },
    bonusId: {
      type: String,
    },
    jackpotId: {
      type: String,
    },
    tournamentId: {
      type: String,
    },
    void: {
      type: Boolean,
    },
    cancelTournamentId: {
      type: String,
    },
    settleTournamentId: {
      type: String,
    },
    roundId: {
      type: String,
      default: null,
    },

    amount: {
      type: Number,
    },
    bet: {
      type: Boolean,
    },
    bonus: {
      type: Boolean,
    },
    cancel: {
      type: Boolean,
    },
    remarkcancel: {
      type: Boolean,
    },
    jackpot: {
      type: Boolean,
    },
    tournament: {
      type: Boolean,
    },
    canceltournament: {
      type: Boolean,
    },
    settletournament: {
      type: Boolean,
    },
    settle: {
      type: Boolean,
      default: false,
    },
    deposit: {
      type: Boolean,
    },
    withdraw: {
      type: Boolean,
    },
    betamount: {
      type: Number,
    },
    settleamount: {
      type: Number,
    },
    depositAmount: {
      type: Number,
    },
    withdrawAmount: {
      type: Number,
    },
    fishTurnover: {
      type: Number,
    },
    fishWinLoss: {
      type: Number,
    },

    gametype: {
      type: String,
    },
    claimed: {
      type: Boolean,
      default: false,
    },
    disqualified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

slotjokerschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotJokerModal = mongoose.model("SlotJokerModal", slotjokerschema);

module.exports = SlotJokerModal;
