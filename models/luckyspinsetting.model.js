const mongoose = require("mongoose");

const LuckySpinSettingSchema = new mongoose.Schema(
  {
    depositAmount: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const LuckySpinSetting = mongoose.model(
  "luckyspinsetting",
  LuckySpinSettingSchema
);

module.exports = LuckySpinSetting;
