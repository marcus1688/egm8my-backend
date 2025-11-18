const mongoose = require("mongoose");

const missionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    titleCN: { type: String, required: true },
    titleMS: { type: String, required: true },
    description: { type: String },
    descriptionCN: { type: String },
    descriptionMS: { type: String },

    missionType: {
      type: String,
      enum: ["totalTurnover", "withdrawCount", "depositCount"],
      required: true,
    },

    targetValue: { type: Number, required: true },
    rewardPoints: { type: Number, required: true },

    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Mission = mongoose.model("Mission", missionSchema);
module.exports = Mission;
