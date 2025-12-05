const mongoose = require("mongoose");
const moment = require("moment");

const sportSabaSportschema = new mongoose.Schema(
  {
    licenseeTxId: {
      type: String,
    },
    operationId: {
      type: String,
    },
    betId: {
      type: String,
    },
    confirmbetId: {
      type: String,
    },
    cancelOperationId: {
      type: String,
    },
    settleOperationId: {
      type: String,
    },
    resettleOperationId: {
      type: String,
    },
    unsettleOperationId: {
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
    resettleamount: {
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
    isOddsChanged: {
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

sportSabaSportschema.index({ createdAt: -1 }, { expireAfterSeconds: 604800 });

const SportSabaSportModal = mongoose.model(
  "SportSabaSportModal",
  sportSabaSportschema
);

module.exports = SportSabaSportModal;
