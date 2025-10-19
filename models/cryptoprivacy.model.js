const mongoose = require("mongoose");

const cryptoprivacySchema = new mongoose.Schema({
  xpub: { type: String },
});

const cryptoprivacyModel = mongoose.model("cryptoprivacy", cryptoprivacySchema);

module.exports = { cryptoprivacyModel };
