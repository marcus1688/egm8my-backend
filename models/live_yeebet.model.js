const mongoose = require("mongoose");
const moment = require("moment");

const liveyeebetschema = new mongoose.Schema(
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

liveyeebetschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const LiveYeebetModal = mongoose.model("LiveYeebetModal", liveyeebetschema);

module.exports = LiveYeebetModal;
