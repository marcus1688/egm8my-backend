const mongoose = require("mongoose");

const luckyDrawSettingSchema = new mongoose.Schema(
  {
    isActive: {
      type: Boolean,
      default: true,
    },
    updatedBy: {
      type: String,
      default: "system",
    },
  },
  {
    timestamps: true,
  }
);

const LuckyDrawSetting = mongoose.model(
  "luckydrawsetting",
  luckyDrawSettingSchema
);
module.exports = LuckyDrawSetting;
