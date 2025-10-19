const mongoose = require("mongoose");

const promotionCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

const PromotionCategory = mongoose.model(
  "PromotionCategory",
  promotionCategorySchema
);

module.exports = { PromotionCategory };
