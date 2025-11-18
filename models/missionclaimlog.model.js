const mongoose = require("mongoose");

const missionClaimLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    username: { type: String, required: true },

    missionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mission",
      required: true,
    },
    missionTitle: { type: String, required: true },
    missionTitleCN: { type: String },
    missionTitleMS: { type: String },
    missionType: { type: String, required: true },

    rewardPoints: { type: Number, required: true },

    progressValue: { type: Number, required: true },
    targetValue: { type: Number, required: true },

    claimDate: { type: Date, required: true },
    transactionId: { type: String, required: true },
  },
  { timestamps: true }
);

missionClaimLogSchema.index({ userId: 1, missionId: 1, claimDate: 1 });

const MissionClaimLog = mongoose.model(
  "MissionClaimLog",
  missionClaimLogSchema
);
module.exports = MissionClaimLog;
