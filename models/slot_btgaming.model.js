const mongoose = require("mongoose");
const moment = require("moment");

const slotbtgamingschema = new mongoose.Schema(
  {
    uniqueStartId: {
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

slotbtgamingschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotBTGamingModal = mongoose.model(
  "SlotBTGamingModal",
  slotbtgamingschema
);

module.exports = SlotBTGamingModal;
