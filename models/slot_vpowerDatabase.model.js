const mongoose = require("mongoose");
const moment = require("moment");

const GameVPowerDataSchema = new mongoose.Schema(
  {
    gameNameEN: {
      type: String,
    },
    imageUrlEN: {
      type: String,
    },
    gameID: {
      type: String,
    },
    gameType: {
      type: String,
    },
    rtpRate: {
      type: String,
    },
    hot: {
      type: Boolean,
      default: false,
    },
    maintenance: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

GameVPowerDataSchema.index({ createdAt: -1 });

const GameVPowerGameModal = mongoose.model(
  "GameVPowerGameModal",
  GameVPowerDataSchema
);

module.exports = GameVPowerGameModal;
