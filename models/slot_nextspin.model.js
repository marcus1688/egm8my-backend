const mongoose = require("mongoose");
const moment = require("moment");

const slotNextspinSchema = new mongoose.Schema(
  {
    referenceId: {
      type: String,
    },
    tranId: {
      type: String,
      default: null,
    },
    canceltranId: {
      type: String,
    },
    settletranId: {
      type: String,
    },
    jackpottranId: {
      type: String,
    },
    betamount: {
      type: Number,
    },
    settleamount: {
      type: Number,
    },
    jackpotamount: {
      type: Number,
    },
    username: {
      type: String,
    },
    bet: {
      type: Boolean,
    },
    cancel: {
      type: Boolean,
    },
    jackpot: {
      type: Boolean,
    },
    settle: {
      type: Boolean,
      default: false,
    },
    freeSpinCount: {
      type: Number,
      default: 0,
    },
    freeSpinSequence: {
      type: Number,
      default: 0,
    },
    freeSpinOngoing: {
      type: Boolean,
      default: false,
    },
    gameCode: {
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

slotNextspinSchema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotNextSpinModal = mongoose.model(
  "SlotNextSpinModal",
  slotNextspinSchema
);

module.exports = SlotNextSpinModal;
