const mongoose = require("mongoose");
const moment = require("moment");

const liveSagamingSchema = new mongoose.Schema(
  {
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
    validbetamount: {
      type: Number,
    },
    settleamount: {
      type: Number,
    },
    adjustmentType: {
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
    gift: {
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

liveSagamingSchema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const LiveSaGamingModal = mongoose.model(
  "LiveSaGamingModal",
  liveSagamingSchema
);

module.exports = LiveSaGamingModal;
