const mongoose = require("mongoose");
const moment = require("moment");

const slotYGRschema = new mongoose.Schema(
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
    depositamount: {
      type: Number,
    },
    withdrawamount: {
      type: Number,
    },
    username: {
      type: String,
    },
    fish: {
      type: Boolean,
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
    currentConnectToken: {
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

slotYGRschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotYGRModal = mongoose.model("SlotYGRModal", slotYGRschema);

module.exports = SlotYGRModal;
