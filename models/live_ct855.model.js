const mongoose = require("mongoose");
const moment = require("moment");

const livect855schema = new mongoose.Schema(
  {
    betId: {
      type: String,
    },
    userServerId: {
      type: String,
    },
    settleId: {
      type: String,
    },
    cancelId: {
      type: String,
    },
    tranId: {
      type: String,
      default: null,
    },
    betamount: {
      type: Number,
    },
    settleamount: {
      type: Number,
    },
    username: {
      type: String,
    },
    bet: {
      type: Boolean,
    },
    settle: {
      type: Boolean,
      default: false,
    },
    cancel: {
      type: Boolean,
    },
    claimed: {
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

livect855schema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const LiveCT855Modal = mongoose.model("LiveCT855Modal", livect855schema);

module.exports = LiveCT855Modal;
