const mongoose = require("mongoose");

const helpSchema = new mongoose.Schema(
  {
    questionEN: { type: String },
    questionCN: { type: String },
    questionMS: { type: String },
    answerEN: { type: String },
    answerCN: { type: String },
    answerMS: { type: String },
    isVisible: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Help", helpSchema);
