const mongoose = require("mongoose");

const LuckySpinLogSchema = new mongoose.Schema(
  {
    playerusername: {
      type: String,
      required: true,
    },
    playerfullname: {
      type: String,
      required: true,
    },
    winning: {
      type: String,
      required: true,
    },
    beforefreespin: {
      type: Number,
      default: 0,
    },
    afterfreespin: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const LuckySpinLog = mongoose.model("luckyspinlog", LuckySpinLogSchema);

module.exports = LuckySpinLog;
