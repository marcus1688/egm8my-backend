const mongoose = require("mongoose");
const moment = require("moment");

const sportSBOBETschema = new mongoose.Schema(
  {
    betId: {
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
    raiseamount: {
      type: Number,
    },
    username: {
      type: String,
    },
    producttype: {
      type: String,
    },
    bet: {
      type: Boolean,
    },
    cancel: {
      type: Boolean,
    },
    settle: {
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

sportSBOBETschema.index({ createdAt: -1 }, { expireAfterSeconds: 172800 });

const SportSBOBETModal = mongoose.model("SportSBOBETModal", sportSBOBETschema);

module.exports = SportSBOBETModal;
