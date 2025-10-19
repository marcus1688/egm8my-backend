const mongoose = require("mongoose");
const moment = require("moment");

const slotlive22schema = new mongoose.Schema(
  {
    betId: {
      type: String,
    },
    tranId: {
      type: String,
      default: null,
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

slotlive22schema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotLive22Modal = mongoose.model("SlotLive22Modal", slotlive22schema);

module.exports = SlotLive22Modal;
