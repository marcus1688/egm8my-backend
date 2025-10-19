const mongoose = require("mongoose");
const moment = require("moment");

const GameLive22DataSchema = new mongoose.Schema(
  {
    gameNameEN: {
      type: String,
    },
    gameNameCN: {
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

GameLive22DataSchema.index({ createdAt: -1 });

const GameLive22GameModal = mongoose.model(
  "GameLive22GameModal",
  GameLive22DataSchema
);

module.exports = GameLive22GameModal;
