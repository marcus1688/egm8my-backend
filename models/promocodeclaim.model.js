const mongoose = require("mongoose");

const promoCodeClaimSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    username: { type: String, required: true },
    promoCodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PromoCode",
      required: true,
    },
    code: { type: String, required: true },
    amount: { type: Number, required: true },
    rewardType: {
      type: String,
      enum: ["wallet", "luckySpinPoints"],
      default: "wallet",
    },
  },
  { timestamps: true }
);

const PromoCodeClaim = mongoose.model("PromoCodeClaim", promoCodeClaimSchema);
module.exports = PromoCodeClaim;
