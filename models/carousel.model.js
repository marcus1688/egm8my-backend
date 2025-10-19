const mongoose = require("mongoose");
const moment = require("moment");

const carouselSchema = new mongoose.Schema({
  name: String,
  link: String,
  status: Boolean,
  order: Number,
});

const carousel = mongoose.model("carousel", carouselSchema);

module.exports = carousel;
