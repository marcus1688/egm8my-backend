const mongoose = require("mongoose");
const moment = require("moment");

const slotmega888h5schema = new mongoose.Schema(
  {
    betId: {
      type: String,
    },
    refundId: {
      type: String,
    },
    settleId: {
      type: String,
    },
    fundRequestId: {
      type: String,
    },
    fundBetResultId: {
      type: String,
    },
    jackpotWinId: {
      type: String,
    },
    fundReturnId: {
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
    fundRequestAmount: {
      type: Number,
    },
    fundReturnAmount: {
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
    jackpotWin: {
      type: Boolean,
    },
    fundRequest: {
      type: Boolean,
    },
    fundReturn: {
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

slotmega888h5schema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotMega888H5Modal = mongoose.model(
  "SlotMega888H5Modal",
  slotmega888h5schema
);

module.exports = SlotMega888H5Modal;
