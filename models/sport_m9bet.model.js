const mongoose = require("mongoose");
const moment = require("moment");

const sportM9BETschema = new mongoose.Schema(
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
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

sportM9BETschema.index({ createdAt: -1 }, { expireAfterSeconds: 604800 });

const SportM9BetModal = mongoose.model("SportM9BetModal", sportM9BETschema);

module.exports = SportM9BetModal;
