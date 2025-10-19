const mongoose = require("mongoose");
const moment = require("moment");

const GameMega888H5DataSchema = new mongoose.Schema(
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

GameMega888H5DataSchema.index({ createdAt: -1 });

const GameMega888H5GameModal = mongoose.model(
  "GameMega888H5GameModal",
  GameMega888H5DataSchema
);

module.exports = GameMega888H5GameModal;
