const mongoose = require("mongoose");
const moment = require("moment");

const userbanklistScehma = new mongoose.Schema(
  {
    bankname: String,
    bankcode: String,
    remark: {
      type: String,
      default: "-",
    },
    logo: String,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

const UserBankList = mongoose.model("UserBankList", userbanklistScehma);

module.exports = UserBankList;
