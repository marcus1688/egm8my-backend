const mongoose = require("mongoose");
const moment = require("moment");

const slotJiliSchema = new mongoose.Schema(
  {
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

slotJiliSchema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotJiliModal = mongoose.model("SlotJiliModal", slotJiliSchema);

module.exports = SlotJiliModal;
