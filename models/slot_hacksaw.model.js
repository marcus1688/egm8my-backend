const mongoose = require("mongoose");
const moment = require("moment");

const slotHacksawschema = new mongoose.Schema(
  {
    betId: {
      type: String,
    },
    tranId: {
      type: String,
      default: null,
    },
    cancelId: {
      type: String,
    },
    appendId: {
      type: String,
    },
    settleId: {
      type: String,
    },
    freespinId: {
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

slotHacksawschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotHacksawModal = mongoose.model("SlotHacksawModal", slotHacksawschema);

module.exports = SlotHacksawModal;
