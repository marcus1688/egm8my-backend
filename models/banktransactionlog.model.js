const mongoose = require("mongoose");
const moment = require("moment");

const bankTransactionLogSchema = new mongoose.Schema(
  {
    bankName: String,
    ownername: String,
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

bankTransactionLogSchema.index(
  { createdAt: -1 },
  { expireAfterSeconds: 5260000 }
);

const BankTransactionLog = mongoose.model(
  "BankTransactionLog",
  bankTransactionLogSchema
);

module.exports = BankTransactionLog;
