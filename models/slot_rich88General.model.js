const mongoose = require("mongoose");
const moment = require("moment");

const GameRich88GeneralDataSchema = new mongoose.Schema(
  {
    sessionID: {
      type: String,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

GameRich88GeneralDataSchema.index({ createdAt: -1 });

GameRich88GeneralDataSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 172800 }
);

const GameRich88GeneralGameModal = mongoose.model(
  "GameRich88GeneralGameModal",
  GameRich88GeneralDataSchema
);

module.exports = GameRich88GeneralGameModal;
