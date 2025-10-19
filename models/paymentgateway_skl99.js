const mongoose = require("mongoose");
const moment = require("moment");

const skl99Schema = new mongoose.Schema(
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

const skl99Modal = mongoose.model("skl99Modal", skl99Schema);

module.exports = skl99Modal;
