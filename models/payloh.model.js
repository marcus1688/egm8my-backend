const mongoose = require("mongoose");
const moment = require("moment");

const paylohSchema = new mongoose.Schema(
  {
    ourRefNo: {
      type: String,
    },
    paymentGatewayRefNo: {
      type: String,
    },
    amount: {
      type: Number,
    },
    username: {
      type: String,
    },
    platformCharge: {
      type: String,
    },
    status: {
      type: String,
    },
    remark: {
      type: String,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

const paylohModal = mongoose.model("paylohModal", paylohSchema);

module.exports = paylohModal;
