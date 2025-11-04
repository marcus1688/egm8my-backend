const mongoose = require("mongoose");
const moment = require("moment");

const slotfunkyschema = new mongoose.Schema(
  {
    betId: {
      type: String,
    },
    username: {
      type: String,
    },
    resultId: {
      type: String,
      default: null,
    },
    settleamount: {
      type: Number,
      default: 0,
    },
    betamount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      default: null,
    },
    gametype: {
      type: String,
    },
    bet: {
      type: Boolean,
    },
    cancel: {
      type: Boolean,
    },

    settle: {
      type: Boolean,
      default: false,
    },
    gametype: {
      type: String,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

slotfunkyschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotFunkyModal = mongoose.model("SlotFunkyModal", slotfunkyschema);

module.exports = SlotFunkyModal;
