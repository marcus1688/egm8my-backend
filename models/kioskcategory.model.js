const mongoose = require("mongoose");

const kioskCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

const KioskCategory = mongoose.model("KioskCategory", kioskCategorySchema);

module.exports = { KioskCategory };
