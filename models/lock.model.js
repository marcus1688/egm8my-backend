const mongoose = require("mongoose");

const lockSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  lockedAt: { type: Date, default: Date.now, expires: 5 },
});

const Lock = mongoose.model("Lock", lockSchema);
module.exports = Lock;
