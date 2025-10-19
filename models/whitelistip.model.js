const mongoose = require("mongoose");
const moment = require("moment");

const whitelistIPSchema = new mongoose.Schema(
  {
    ips: {
      type: [String],
      default: [],
    },
    description: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

const WhitelistIP = mongoose.model("whitelistIP", whitelistIPSchema);

module.exports = WhitelistIP;
