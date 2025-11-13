const mongoose = require("mongoose");
const moment = require("moment");

const GameRSGDataSchema = new mongoose.Schema(
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
    gameNameID: {
      type: String,
    },
    gameNameMS: {
      type: String,
    },
    imageUrlEN: {
      type: String,
    },
    imageUrlCN: {
      type: String,
    },
    imageUrlHK: {
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

GameRSGDataSchema.index({ createdAt: -1 });

const GameRSGGameModal = mongoose.model("GameRSGGameModal", GameRSGDataSchema);

module.exports = GameRSGGameModal;
