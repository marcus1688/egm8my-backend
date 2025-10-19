const mongoose = require("mongoose");

const smsPricingSchema = new mongoose.Schema({
  pricing: Number,
});

const smspricing = mongoose.model("smspricing", smsPricingSchema);

module.exports = smspricing;
