const mongoose = require("mongoose");
const moment = require("moment");

const slotvpowerschema = new mongoose.Schema(
  {
    betId: {
      type: String,
    },
    settleId: {
      type: String,
    },
    roundId: {
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

slotvpowerschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotVPowerModal = mongoose.model("SlotVPowerModal", slotvpowerschema);

module.exports = SlotVPowerModal;
