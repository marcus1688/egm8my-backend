const mongoose = require("mongoose");
const moment = require("moment");

const slotibexschema = new mongoose.Schema(
  {
    betId: {
      type: String,
    },
    betTranId: {
      type: String,
    },
    settleTranId: {
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

    balanceattime: {
      type: Number,
    },
    endroundbalanceattime: {
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

slotibexschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotIBEXModal = mongoose.model("SlotIBEXModal", slotibexschema);

module.exports = SlotIBEXModal;
