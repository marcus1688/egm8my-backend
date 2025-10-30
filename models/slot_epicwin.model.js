const mongoose = require("mongoose");
const moment = require("moment");

const slotepicwinschema = new mongoose.Schema(
  {
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

slotepicwinschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotEpicWinModal = mongoose.model("SlotEpicWinModal", slotepicwinschema);

module.exports = SlotEpicWinModal;
