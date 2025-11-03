const mongoose = require("mongoose");
const moment = require("moment");

const GameRelaxGamingDataSchema = new mongoose.Schema(
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

GameRelaxGamingDataSchema.index({ createdAt: -1 });

const GameRelaxGamingGameModal = mongoose.model(
  "GameRelaxGamingGameModal",
  GameRelaxGamingDataSchema
);

module.exports = GameRelaxGamingGameModal;
