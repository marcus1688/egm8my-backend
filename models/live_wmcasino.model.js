const mongoose = require("mongoose");
const moment = require("moment");

const liveWMCasinoSchema = new mongoose.Schema(
  {
    username: {
      type: String,
    },
    code: { type: String },
    trxId: {
      type: String,
    },
    uniquebetId: {
      type: String,
    },
    betId: {
      type: String,
    },
    resettle: {
      type: Boolean,
    },
    trasferAmount: {
      type: Number,
    },
    betamount: {
      type: Number,
    },
    settleamount: {
      type: Number,
    },
    bet: {
      type: Boolean,
    },
    cancel: {
      type: Boolean,
    },
    resettle: {
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
      currentTime: () => moment().utc().toDate(),
    },
  }
);

liveWMCasinoSchema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const liveWMCasinoModal = mongoose.model(
  "liveWMCasinoModal",
  liveWMCasinoSchema
);

module.exports = liveWMCasinoModal;
