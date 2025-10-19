const mongoose = require("mongoose");
const moment = require("moment");

const slotuuslotschema = new mongoose.Schema(
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

slotuuslotschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotUUSlotModal = mongoose.model("SlotUUSlotModal", slotuuslotschema);

module.exports = SlotUUSlotModal;
