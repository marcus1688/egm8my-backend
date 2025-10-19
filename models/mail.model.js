const mongoose = require("mongoose");

const mailSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    titleEN: {
      type: String,
    },
    titleCN: {
      type: String,
    },
    titleMS: {
      type: String,
    },
    contentEN: {
      type: String,
    },
    contentCN: {
      type: String,
    },
    contentMS: {
      type: String,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Mail = mongoose.model("Mail", mailSchema);

module.exports = { Mail };
