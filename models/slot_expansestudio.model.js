const mongoose = require("mongoose");
const moment = require("moment");

const slotexpansestudioSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      default: null,
    },
    bonusId: {
      type: String,
    },
    betId: {
      type: String,
    },
    betUniqueID: {
      type: String,
    },
    transInUniqueID: {
      type: String,
    },
    winUniqueID: {
      type: String,
    },
    transOutUniqueID: {
      type: String,
    },
    cancelUniqueID: {
      type: String,
    },
    amendUniqueID: {
      type: String,
    },
    roundId: {
      type: String,
    },
    username: {
      type: String,
    },
    transferbetamount: {
      type: Number,
    },
    transfersettleamount: {
      type: Number,
    },
    betamount: {
      type: Number,
    },
    settleamount: {
      type: Number,
    },
    depositamount: {
      type: Number,
    },
    withdrawamount: {
      type: Number,
    },
    ultimatesettleamount: {
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
    settle: {
      type: Boolean,
      default: false,
    },
    resettle: {
      type: Boolean,
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

slotexpansestudioSchema.index(
  { createdAt: -1 },
  { expireAfterSeconds: 172800 }
);

const SlotExpanseStudioModal = mongoose.model(
  "SlotExpanseStudioModal",
  slotexpansestudioSchema
);

module.exports = SlotExpanseStudioModal;
