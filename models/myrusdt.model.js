const mongoose = require("mongoose");

const myrusdtSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  buyrate: { type: Number, default: 0 },
  sellrate: { type: Number, default: 0 },
  lastUpdate: { type: Date, default: Date.now },
});

const myrusdtModel = mongoose.model("myrusdt", myrusdtSchema);

module.exports = { myrusdtModel };
