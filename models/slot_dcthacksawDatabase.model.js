const mongoose = require("mongoose");
const moment = require("moment");

const GameHackaswDataSchema = new mongoose.Schema(
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

GameHackaswDataSchema.index({ createdAt: -1 });

const GameHacksawGameModal = mongoose.model(
  "GameHacksawGameModal",
  GameHackaswDataSchema
);

module.exports = GameHacksawGameModal;
