const mongoose = require("mongoose");
const moment = require("moment");

const sportscmd368unlimitedSchema = new mongoose.Schema(
  {
    betId: {
      type: String,
    },

    betamount: {
      type: Number,
    },
    winlossamount: {
      type: Number,
    },
    status: {
      type: String,
    },
    result: {
      type: String,
    },
    username: {
      type: String,
    },
    iscashout: {
      type: Boolean,
      default: false,
    },
    claimed: {
      type: Boolean,
      default: false,
    },
    disqualified: {
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

sportscmd368unlimitedSchema.index(
  { createdAt: -1 },
  { expireAfterSeconds: 432000 }
);

const SportsCMD368UnlimitedModal = mongoose.model(
  "SportsCMD368UnlimitedModal",
  sportscmd368unlimitedSchema
);

module.exports = SportsCMD368UnlimitedModal;
