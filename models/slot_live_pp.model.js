const mongoose = require("mongoose");
const moment = require("moment");

const slotliveppSchema = new mongoose.Schema(
  {
    username: {
      type: String,
    },
    gameType: {
      type: String,
    },
    betamount: {
      type: Number,
    },
    settleamount: {
      type: Number,
    },
    promoamount: {
      type: Number,
    },
    betId: {
      type: String,
    },
    betreferenceId: {
      type: String,
    },
    settlereferenceId: {
      type: String,
    },
    refunded: {
      type: Boolean,
      default: false,
    },
    bonuscode: {
      type: String,
    },
    bonusreferenceId: {
      type: String,
    },
    jackpotreferenceId: {
      type: String,
    },
    promoreferenceId: {
      type: String,
    },
    adjustmentreferenceId: {
      type: String,
    },
    ended: {
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

slotliveppSchema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotLivePPModal = mongoose.model("SlotLivePPModal", slotliveppSchema);

module.exports = SlotLivePPModal;
