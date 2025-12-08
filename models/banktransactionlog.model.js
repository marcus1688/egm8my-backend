const mongoose = require("mongoose");
const moment = require("moment");

const bankTransactionLogSchema = new mongoose.Schema(
  {
    bankName: String,
    ownername: String,
    bankAccount: String,
    remark: {
      type: String,
      default: "-",
    },
    lastBalance: Number,
    currentBalance: Number,
    processby: String,
    qrimage: String,
    playerusername: String,
    playerfullname: String,
    transactiontype: String,
    amount: Number,
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

const BankTransactionLog = mongoose.model(
  "BankTransactionLog",
  bankTransactionLogSchema
);

module.exports = BankTransactionLog;
