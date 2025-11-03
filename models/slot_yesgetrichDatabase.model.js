const mongoose = require("mongoose");
const moment = require("moment");

const GameYesGetRichDataSchema = new mongoose.Schema(
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
    imageUrlHK: {
      type: String,
    },
    imageUrlID: {
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

GameYesGetRichDataSchema.index({ createdAt: -1 });

const GameYGRGameModal = mongoose.model(
  "GameYGRGameModal",
  GameYesGetRichDataSchema
);

module.exports = GameYGRGameModal;
