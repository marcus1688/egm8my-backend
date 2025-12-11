const mongoose = require("mongoose");
const moment = require("moment");

const liveoncasinoschema = new mongoose.Schema(
  {
    username: {
      type: String,
    },
    betId: {
      type: String,
    },
    tranId: {
      type: String,
      default: null,
    },
    validbetamount: {
      type: Number,
    },
    betamount: {
      type: Number,
    },
    settleamount: {
      type: Number,
    },
    tipamount: {
      type: Number,
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

liveoncasinoschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const LiveOnCasinoModal = mongoose.model(
  "LiveOnCasinoModal",
  liveoncasinoschema
);

module.exports = LiveOnCasinoModal;
