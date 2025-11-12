const mongoose = require("mongoose");
const moment = require("moment");

const GameRich88DataSchema = new mongoose.Schema(
  {
    gameNameEN: {
      type: String,
    },
    gameNameCN: {
      type: String,
    },
    gameNameHK: {
      type: String,
    },
    imageUrlEN: {
      type: String,
    },
    imageUrlCN: {
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

GameRich88DataSchema.index({ createdAt: -1 });

const GameRich88GameModal = mongoose.model(
  "GameRich88GameModal",
  GameRich88DataSchema
);

module.exports = GameRich88GameModal;
