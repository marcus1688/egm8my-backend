const mongoose = require("mongoose");

const popUpSchema = new mongoose.Schema({
  company: String,
  titleCN: String,
  titleEN: String,
  titleMS: String,
  contentCN: String,
  contentEN: String,
  contentMS: String,
  status: Boolean,
  image: String,
});

const popUp = mongoose.model("popUp", popUpSchema);

module.exports = popUp;
