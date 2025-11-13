const mongoose = require("mongoose");
const moment = require("moment");

const slotrsgSchema = new mongoose.Schema(
  {
    betId: {
      type: String,
    },
    mainbetId: {
      type: String,
    },
    uniquebetId: {
      type: String,
    },
    uniquesettlementId: {
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
    gametype: {
      type: String,
    },
    depositamount: {
      type: Number,
    },
    withdrawamount: {
      type: Number,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

slotrsgSchema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotRSGModal = mongoose.model("SlotRSGModal", slotrsgSchema);

module.exports = SlotRSGModal;
