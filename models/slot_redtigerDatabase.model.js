const mongoose = require("mongoose");
const moment = require("moment");

const GameRedTigerDataSchema = new mongoose.Schema(
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

GameRedTigerDataSchema.index({ createdAt: -1 });

const GameRedTigerGameModal = mongoose.model(
  "GameRedTigerGameModal",
  GameRedTigerDataSchema
);

module.exports = GameRedTigerGameModal;
