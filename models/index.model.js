const mongoose = require("mongoose");

const indexSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  currentIndex: { type: Number, default: 0 },
});

const IndexModel = mongoose.model("Index", indexSchema);

module.exports = { IndexModel };
