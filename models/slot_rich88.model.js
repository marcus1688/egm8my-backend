const mongoose = require("mongoose");
const moment = require("moment");

const slotrich88schema = new mongoose.Schema(
  {
    betId: {
      type: String,
    },
    roundId: {
      type: String,
    },
    betamount: {
      type: Number,
    },
    settleamount: {
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
    settle: {
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

slotrich88schema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotRich88Modal = mongoose.model("SlotRich88Modal", slotrich88schema);

module.exports = SlotRich88Modal;
