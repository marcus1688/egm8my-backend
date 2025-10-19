const mongoose = require("mongoose");

const LuckyDrawLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    fullname: {
      type: String,
      required: true,
    },
    prizeName: {
      type: String,
      required: true,
    },
    prizeValue: {
      type: Number,
      required: true,
    },
    gridPosition: {
      type: Number,
      required: true,
      min: 0,
      max: 8,
    },
    depositAmount: {
      type: Number,
      required: true,
    },
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const LuckyDrawLog = mongoose.model("luckydrawlog", LuckyDrawLogSchema);
module.exports = LuckyDrawLog;
