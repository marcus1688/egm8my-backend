const mongoose = require("mongoose");
const moment = require("moment");

const slotfachaiSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      default: null,
    },

    betId: {
      type: String,
    },
    username: {
      type: String,
    },
    betamount: {
      type: Number,
    },
    settleamount: {
      type: Number,
    },
    ultimatesettleamount: {
      type: Number,
    },
    bet: {
      type: Boolean,
    },
    cancel: {
      type: Boolean,
    },
    bonus: {
      type: Boolean,
    },
    settle: {
      type: Boolean,
      default: false,
    },
    gametype: {
      type: String,
    },
    claimed: {
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

slotfachaiSchema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotFachaiModal = mongoose.model("SlotFachaiModal", slotfachaiSchema);

module.exports = SlotFachaiModal;
