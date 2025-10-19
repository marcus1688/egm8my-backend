const mongoose = require("mongoose");
const moment = require("moment");

const PlaytechGameSchema = new mongoose.Schema(
  {
    username: {
      type: String,
    },
    transactionCode: {
      type: String,
    },
    settleTransactionCode: {
      type: String,
    },
    bonusTransactionCode: {
      type: String,
    },
    bet: {
      type: Boolean,
    },
    settle: {
      type: Boolean,
    },
    cancel: {
      type: Boolean,
    },
    bonus: {
      type: Boolean,
    },
    externalTransactionCode: {
      type: String,
    },
    externalSettleTransactionCode: {
      type: String,
    },
    externalBonusTransactionCode: {
      type: String,
    },
    betAmount: {
      type: Number,
    },
    settleamount: {
      type: Number,
    },
    gameRoundCode: {
      type: String,
    },

    // Additional fields for bonus events
    remoteBonusCode: {
      type: String,
    },
    bonusInstanceCode: {
      type: String,
    },
    resultingStatus: {
      type: String,
      enum: ["ACCEPTED", "REMOVED"],
    },
    eventDate: {
      type: Date,
    },
    bonusBalanceChange: {
      type: Number,
    },
    freeSpinsChange: {
      type: Number,
    },
    goldenChipsChange: {
      type: Object,
    },
    bonusTemplateId: {
      type: String,
    },
    freeSpinValue: {
      type: Number,
    },
    claimed: {
      type: Boolean,
      default: false,
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

PlaytechGameSchema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const PlaytechGameModal = mongoose.model("PlaytechGame", PlaytechGameSchema);

module.exports = PlaytechGameModal;
