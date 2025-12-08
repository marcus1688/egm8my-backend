const mongoose = require("mongoose");
const moment = require("moment");

const slotyellowbatschema = new mongoose.Schema(
  {
    username: {
      type: String,
    },
    betId: {
      type: String,
    },
    status: {
      type: String,
      default: null,
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
    reward: {
      type: Boolean,
    },
    attemptcancel: {
      type: Boolean,
    },
    settle: {
      type: Boolean,
      default: false,
    },
    gametype: {
      type: String,
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

slotyellowbatschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotYellowbatModal = mongoose.model(
  "SlotYellowbatModal",
  slotyellowbatschema
);

module.exports = SlotYellowbatModal;
