const mongoose = require("mongoose");
const moment = require("moment");

const lotteryHUAWEIschema = new mongoose.Schema(
  {
    betId: {
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
    settle: {
      type: Boolean,
      default: false,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    betTime: {
      type: Date,
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

lotteryHUAWEIschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const LotteryHuaweiModal = mongoose.model(
  "LotteryHuaweiModal",
  lotteryHUAWEIschema
);

module.exports = LotteryHuaweiModal;
