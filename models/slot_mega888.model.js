const mongoose = require("mongoose");
const moment = require("moment");

const slotMega88echema = new mongoose.Schema(
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
    claimed: {
      type: Boolean,
      default: false,
    },
    betTime: {
      type: Date,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

slotMega88echema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const slotMega888Modal = mongoose.model("slotMega888Modal", slotMega88echema);

module.exports = slotMega888Modal;
