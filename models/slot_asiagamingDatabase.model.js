const mongoose = require("mongoose");
const moment = require("moment");

const GameAsiaGamingDataSchema = new mongoose.Schema(
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
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

GameAsiaGamingDataSchema.index({ createdAt: -1 });

const GameAsiaGamingGameModal = mongoose.model(
  "GameAsiaGamingGameModal",
  GameAsiaGamingDataSchema
);

module.exports = GameAsiaGamingGameModal;
