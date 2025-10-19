const mongoose = require("mongoose");
const moment = require("moment");

const gameWalletLogSchema = new mongoose.Schema(
  {
    username: String,
    transactiontype: String,
    remark: String,
    amount: Number,
    gamebalance: Number,
    beforewalletbalance: Number,
    afterwalletbalance: Number,
    gamename: String,
    reverted: {
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

gameWalletLogSchema.index({ createdAt: -1 }, { expireAfterSeconds: 5260000 });

const GameWalletLog = mongoose.model("GameWalletLog", gameWalletLogSchema);

module.exports = GameWalletLog;
