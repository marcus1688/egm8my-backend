const mongoose = require("mongoose");
const moment = require("moment");

const slotlivemicrogamingschema = new mongoose.Schema(
  {
    betId: {
      type: String,
    },
    settleId: {
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
    gameType: {
      type: String,
    },
    completed: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

slotlivemicrogamingschema.index(
  { createdAt: -1 },
  { expireAfterSeconds: 172800 }
);

const SlotLiveMicroGamingModal = mongoose.model(
  "SlotLiveMicroGamingModal",
  slotlivemicrogamingschema
);

module.exports = SlotLiveMicroGamingModal;
