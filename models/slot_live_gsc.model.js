const mongoose = require("mongoose");
const moment = require("moment");

const slotliveGSCschema = new mongoose.Schema(
  {
    roundId: {
      type: String,
    },
    betId: {
      type: String,
    },
    tranId: {
      type: String,
      default: null,
    },
    platform: {
      type: String,
    },
    gametype: {
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

slotliveGSCschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotLiveGSCModal = mongoose.model("SlotLiveGSCModal", slotliveGSCschema);

module.exports = SlotLiveGSCModal;
