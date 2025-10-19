const mongoose = require("mongoose");
const moment = require("moment");

const slotliveAGschema = new mongoose.Schema(
  {
    roundId: {
      type: String,
    },
    billNo: {
      type: String,
    },
    gametype: {
      type: String,
    },
    betId: {
      type: String,
    },
    settleId: {
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
    event: {
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
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

slotliveAGschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotLiveAGModal = mongoose.model("SlotLiveAGModal", slotliveAGschema);

module.exports = SlotLiveAGModal;
