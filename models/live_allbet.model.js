const mongoose = require("mongoose");
const moment = require("moment");

const liveallbetschema = new mongoose.Schema(
  {
    cancelId: {
      type: String,
    },
    betId: {
      type: String,
    },
    roundId: {
      type: Number,
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
    winlossamount: {
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

liveallbetschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const liveAllbetModal = mongoose.model("liveAllbetModal", liveallbetschema);

module.exports = liveAllbetModal;
