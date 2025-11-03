const mongoose = require("mongoose");
const moment = require("moment");

const slotfastspinschema = new mongoose.Schema(
  {
    transferId: {
      type: String,
    },
    settleId: {
      type: String,
    },
    username: {
      type: String,
    },
    betamount: {
      type: Number,
    },
    settleamount: {
      type: Number,
    },
    cancelAmount: {
      type: Number,
    },
    bonusamount: {
      type: Number,
    },
    bet: {
      type: Boolean,
    },
    cancel: {
      type: Boolean,
    },
    bonus: {
      type: Boolean,
    },
    fish: {
      type: Boolean,
    },
    settle: {
      type: Boolean,
      default: false,
    },
    depositamount: {
      type: Number,
    },
    withdrawamount: {
      type: Number,
    },
    gametype: {
      type: String,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

slotfastspinschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotFastSpinModal = mongoose.model(
  "SlotFastSpinModal",
  slotfastspinschema
);

module.exports = SlotFastSpinModal;
