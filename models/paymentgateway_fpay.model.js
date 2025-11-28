const mongoose = require("mongoose");
const moment = require("moment");

const fpaySchema = new mongoose.Schema(
  {
    ourRefNo: {
      type: String,
    },
    paymentGatewayRefNo: {
      type: String,
    },
    bankCode: {
      type: String,
    },
    transferType: {
      type: String,
    },
    transactiontype: {
      type: String,
    },
    amount: {
      type: Number,
    },
    username: {
      type: String,
    },
    transfername: {
      type: String,
    },
    platformCharge: {
      type: Number,
    },
    status: {
      type: String,
    },
    remark: {
      type: String,
    },
    promotionId: {
      type: String,
    },

    // paymenttype
    paymenttype: {
      type: String,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

const fpayModal = mongoose.model("fpayModal", fpaySchema);

module.exports = fpayModal;
