const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema(
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
    descriptionEN: {
      type: String,
    },
    descriptionCN: {
      type: String,
    },
    descriptionMS: {
      type: String,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    author: {
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

const Review = mongoose.model("review", ReviewSchema);

module.exports = Review;
