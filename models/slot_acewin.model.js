const mongoose = require("mongoose");
const moment = require("moment");

const slotAceWinSchema = new mongoose.Schema(
  {
    requestId: {
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
    roundId: {
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
    sessionRoundId: {
      type: String,
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

slotAceWinSchema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotAceWinModal = mongoose.model("SlotAceWinModal", slotAceWinSchema);

module.exports = SlotAceWinModal;
