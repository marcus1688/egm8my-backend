const mongoose = require("mongoose");
const moment = require("moment");

const slotHabaneroSchema = new mongoose.Schema(
  {
    uniqueId: {
      type: String,
    },
    settleuniqueId: {
      type: String,
    },
    refunduniqueId: {
      type: String,
    },
    roundId: {
      type: String,
    },
    username: {
      type: String,
    },
    betamount: {
      type: Number,
    },
    settleamount: {
      type: Number,
    },

    bet: {
      type: Boolean,
    },
    refund: {
      type: Boolean,
    },

    settle: {
      type: Boolean,
      default: false,
    },

    buyfeatureid: {
      type: Number, // null = regular spin, non-null = feature buy
    },

    freeSpinOngoing: {
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

slotHabaneroSchema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SlotHabaneroModal = mongoose.model(
  "SlotHabaneroModal",
  slotHabaneroSchema
);

module.exports = SlotHabaneroModal;
