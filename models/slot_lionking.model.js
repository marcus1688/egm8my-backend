const mongoose = require("mongoose");
const moment = require("moment");

const slotLionKing5schema = new mongoose.Schema(
  {
    tranId: {
      type: String,
      default: null,
      unique: true,
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

    settle: {
      type: Boolean,
      default: false,
    },
    betDate: {
      type: Date,
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

slotLionKing5schema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const slotLionKingModal = mongoose.model(
  "slotLionKingModal",
  slotLionKing5schema
);

module.exports = slotLionKingModal;
