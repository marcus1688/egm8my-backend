const mongoose = require("mongoose");
const moment = require("moment");

const lotteryAp95schema = new mongoose.Schema(
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
    resultDate: {
      type: Date,
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

lotteryAp95schema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const LotteryAP95Modal = mongoose.model("LotteryAP95Modal", lotteryAp95schema);

module.exports = LotteryAP95Modal;
