const mongoose = require("mongoose");
const moment = require("moment");

const slotkiss918schema = new mongoose.Schema(
  {
    betId: {
      type: String,
    },
    transId: {
      type: String,
    },
    settletransId: {
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

slotkiss918schema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotKiss918H5Modal = mongoose.model(
  "SlotKiss918H5Modal",
  slotkiss918schema
);

module.exports = SlotKiss918H5Modal;
