const mongoose = require("mongoose");
const moment = require("moment");

const GameFastSpinDataSchema = new mongoose.Schema(
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

GameFastSpinDataSchema.index({ createdAt: -1 });

const GameFastSpinGameModal = mongoose.model(
  "GameFastSpinGameModal",
  GameFastSpinDataSchema
);

module.exports = GameFastSpinGameModal;
