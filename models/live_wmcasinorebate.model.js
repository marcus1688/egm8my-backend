const mongoose = require("mongoose");
const moment = require("moment");

const livewmcasinorebatschema = new mongoose.Schema(
  {
    username: {
      type: String,
    },
    betId: {
      type: String,
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
    settle: {
      type: Boolean,
      default: false,
    },
    betTime: {
      type: Date,
    },
    notvalidbetamount: {
      type: Number,
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

livewmcasinorebatschema.index(
  { createdAt: -1 },
  { expireAfterSeconds: 172800 }
);

const LiveWMCasinoRebateModal = mongoose.model(
  "LiveWMCasinoRebateModal",
  livewmcasinorebatschema
);

module.exports = LiveWMCasinoRebateModal;
