const mongoose = require("mongoose");
const moment = require("moment");

const slotcq9schema = new mongoose.Schema(
  {
    betId: {
      type: String,
    },
    betTranId: {
      type: String,
    },
    settleTranId: {
      type: [String],
      default: [],
    },
    rolloutTranId: {
      type: String,
    },
    takeallTransId: {
      type: String,
    },
    rollinTransId: {
      type: String,
    },
    promoTransId: {
      type: String,
    },
    cancelBetId: {
      type: String,
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
    refundAmount: {
      type: Number,
    },
    withdrawamount: {
      type: Number,
    },
    balanceattime: {
      type: Number,
    },
    endroundbalanceattime: {
      type: Number,
    },
    rollinbalanceattime: {
      type: Number,
    },
    creditbalanceattime: {
      type: Number,
    },
    debitbalanceattime: {
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
    refund: {
      type: Boolean,
    },
    amend: {
      type: Boolean,
    },
    settle: {
      type: Boolean,
      default: false,
    },
    cancelRefund: {
      type: Boolean,
    },
    gametype: {
      type: String,
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

slotcq9schema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotCQ9Modal = mongoose.model("SlotCQ9Modal", slotcq9schema);

module.exports = SlotCQ9Modal;
