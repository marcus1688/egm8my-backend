const mongoose = require("mongoose");
const moment = require("moment");

const slotlfc888schema = new mongoose.Schema(
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
    rewardamount: {
      type: Number,
    },
    refundamount: {
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

slotlfc888schema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotLFC888Modal = mongoose.model("SlotLFC888Modal", slotlfc888schema);

module.exports = SlotLFC888Modal;
