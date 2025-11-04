const mongoose = require("mongoose");
const moment = require("moment");

const liveWeCasinoschema = new mongoose.Schema(
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
    validbetamount: {
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
    resettlement: {
      type: Boolean,
    },
    settle: {
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

liveWeCasinoschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const LiveWeCasinoModal = mongoose.model(
  "LiveWeCasinoModal",
  liveWeCasinoschema
);

module.exports = LiveWeCasinoModal;
