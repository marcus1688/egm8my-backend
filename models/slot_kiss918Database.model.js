const mongoose = require("mongoose");
const moment = require("moment");

const GameKiss918DataSchema = new mongoose.Schema(
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

GameKiss918DataSchema.index({ createdAt: -1 });

const GameKiss918GameModal = mongoose.model(
  "GameKiss918GameModal",
  GameKiss918DataSchema
);

module.exports = GameKiss918GameModal;
