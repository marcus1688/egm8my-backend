const mongoose = require("mongoose");
const moment = require("moment");

const esportTfGamingschema = new mongoose.Schema(
  {
    betId: {
      type: String,
    },
    tranId: {
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
    resettle: {
      type: Boolean,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

esportTfGamingschema.index({ createdAt: -1 }, { expireAfterSeconds: 604800 });

const EsportTfGamingModal = mongoose.model(
  "EsportTfGamingModal",
  esportTfGamingschema
);

module.exports = EsportTfGamingModal;
