const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
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
    category: {
      type: String,
      required: true,
    },
    isVisible: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Announcement = mongoose.model("Announcement", announcementSchema);

module.exports = Announcement;
