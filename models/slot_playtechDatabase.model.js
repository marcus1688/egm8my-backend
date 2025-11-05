const mongoose = require("mongoose");
const moment = require("moment");

const GamePlaytechDataSchema = new mongoose.Schema(
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
    gameID: {
      type: String,
    },
    gameType: {
      type: String,
    },
    rtpRate: {
      type: String,
    },
    imageUrlCN: {
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

GamePlaytechDataSchema.index({ createdAt: -1 });

const GamePlaytechGameModal = mongoose.model(
  "GamePlaytechGameModal",
  GamePlaytechDataSchema
);

module.exports = GamePlaytechGameModal;
