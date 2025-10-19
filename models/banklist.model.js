const mongoose = require("mongoose");
const moment = require("moment");

const banklistScehma = new mongoose.Schema(
  {
    bankname: String,
    bankaccount: String,
    ownername: String,
    fastpayment: String,
    transactionlimit: String,
    transactionamountlimit: String,
    remark: {
      type: String,
      default: "-",
    },
    qrimage: String,
    isActive: {
      type: Boolean,
      default: true,
    },
    startingbalance: {
      type: Number,
      default: 0,
    },
    currentbalance: {
      type: Number,
      default: 0,
    },
    totalDeposits: {
      type: Number,
      default: 0,
    },
    totalWithdrawals: {
      type: Number,
      default: 0,
    },
    totalCashIn: {
      type: Number,
      default: 0,
    },
    totalCashOut: {
      type: Number,
      default: 0,
    },
    totalTransactionFees: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

const BankList = mongoose.model("BankList", banklistScehma);

module.exports = BankList;
