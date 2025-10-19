const mongoose = require("mongoose");
const moment = require("moment");

const truePaySchema = new mongoose.Schema(
  {
    ourRefNo: {
      type: String,
    },
    bankCode: {
      type: String,
    },
    amount: {
      type: Number,
    },
    username: {
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
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

const truePayModal = mongoose.model("truePayModal", truePaySchema);

module.exports = truePayModal;
