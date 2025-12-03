const mongoose = require("mongoose");
const moment = require("moment");

const sportSabaSportschema = new mongoose.Schema(
  {
    licenseeTxId: {
      type: String,
    },
    betId: {
      type: String,
    },
    cancelOperationId: {
      type: String,
    },
    tranId: {
      type: String,
      default: null,
    },
    matchId: {
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
    confirmbet: {
      type: Boolean,
    },
    cancel: {
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

sportSabaSportschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SportSabaSportModal = mongoose.model(
  "SportSabaSportModal",
  sportSabaSportschema
);

module.exports = SportSabaSportModal;
