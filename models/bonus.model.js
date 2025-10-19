const mongoose = require("mongoose");
const moment = require("moment");

const bonusschema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      unique: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    username: {
      type: String,
    },
    fullname: {
      type: String,
    },
    walletType: {
      type: String,
      default: "Main",
    },
    transactionType: {
      type: String,
    },
    processBy: {
      type: String,
    },
    promotionname: {
      type: String,
    },
    promotionnameEN: {
      type: String,
    },
    promotionId: {
      type: String,
    },
    amount: {
      type: Number,
    },
    walletamount: {
      type: Number,
    },
    method: {
      type: String,
    },
    status: {
      type: String,
      default: "pending",
    },
    remark: {
      type: String,
    },
    reverted: {
      type: Boolean,
      default: false,
    },
    duplicateIP: {
      type: Boolean,
      default: false,
    },
    isLuckySpin: {
      type: Boolean,
      default: false,
    },
    isCheckinBonus: {
      type: Boolean,
      default: false,
    },
    revertedProcessBy: {
      type: String,
    },
    processtime: {
      type: String,
      default: "PENDING",
    },
    refferalbonusid: {
      type: String,
      default: null,
    },
    ownrefferalbonusid: {
      type: String,
      default: null,
    },
    depositId: {
      type: String,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

bonusschema.index({ createdAt: -1 });
bonusschema.index(
  { userId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  }
);
const Bonus = mongoose.model("bonus", bonusschema);

module.exports = Bonus;
