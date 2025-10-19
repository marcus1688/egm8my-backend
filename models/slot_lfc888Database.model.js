const mongoose = require("mongoose");
const moment = require("moment");

const GameLFC888DataSchema = new mongoose.Schema(
  {
    gameNameEN: {
      type: String,
    },
    gameNameCN: {
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
    imageUrlMS: {
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

GameLFC888DataSchema.index({ createdAt: -1 });

const GameLFC888GameModal = mongoose.model(
  "GameLFC888GameModal",
  GameLFC888DataSchema
);

module.exports = GameLFC888GameModal;
