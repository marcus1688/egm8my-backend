const mongoose = require("mongoose");
const moment = require("moment");

const slotspadeschema = new mongoose.Schema(
  {
    transferId: {
      type: String,
    },
    settleId: {
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
    cancelamount: {
      type: Number,
    },
    bonusamount: {
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
    depositamount: {
      type: Number,
    },
    withdrawamount: {
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

slotspadeschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotSpadeGamingModal = mongoose.model(
  "SlotSpadeGamingModal",
  slotspadeschema
);

module.exports = SlotSpadeGamingModal;
