const mongoose = require("mongoose");
const moment = require("moment");

const GameFunkyDataSchema = new mongoose.Schema(
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
    imageUrlEN: {
      type: String,
    },
    imageUrlCN: {
      type: String,
    },
    imageUrlID: {
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

GameFunkyDataSchema.index({ createdAt: -1 });

const GameFunkyGameModal = mongoose.model(
  "GameFunkyGameModal",
  GameFunkyDataSchema
);

module.exports = GameFunkyGameModal;
