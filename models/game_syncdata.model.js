const mongoose = require("mongoose");
const moment = require("moment");

const gameSyncLogSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      index: true,
    },
    syncTime: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

gameSyncLogSchema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const GameSyncLog = mongoose.model("GameSyncLog", gameSyncLogSchema);

module.exports = GameSyncLog;
