const mongoose = require("mongoose");

const LuckySpinSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    angle: {
      type: Number,
      required: true,
    },
    probability: {
      type: Number,
      required: true,
    },
    value: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const LuckySpin = mongoose.model("luckyspin", LuckySpinSchema);

module.exports = LuckySpin;
