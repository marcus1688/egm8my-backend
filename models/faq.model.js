const mongoose = require("mongoose");
const moment = require("moment");

const faqSchema = new mongoose.Schema(
  {
    lastUpdatedAt: {
      type: Date,
      default: () => new Date(Date.now() + 8 * 60 * 60 * 1000), // GMT + 8
    },
    lastUpdatedBy: {
      type: String,
    },
    faqText: {
      type: String,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

const FaqData = mongoose.model("FaqData", faqSchema);

module.exports = FaqData;
