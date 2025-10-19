const mongoose = require("mongoose");
const moment = require("moment");

const vipSchema = new mongoose.Schema(
  {
    tableTitle: {
      type: String,
      default: "VIP Benefits",
    },
    rowHeaders: [
      {
        name: String,
      },
    ],
    vipLevels: [
      {
        name: String,
        iconUrl: String,
        benefits: {
          type: Map,
          of: String,
        },
      },
    ],
    terms: {
      en: String,
      zh: String,
      ms: String,
    },
  },
  {
    timestamps: true,
  }
);

const vip = mongoose.model("vip", vipSchema);

module.exports = vip;
