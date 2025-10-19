const mongoose = require("mongoose");

const memoSchema = new mongoose.Schema(
  {
    memoText: {
      type: String,
      required: true,
    },
    photos: [
      {
        type: String,
      },
    ],
    lastUpdatedBy: {
      type: String,
      required: true,
    },
    createdBy: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

const Memo = mongoose.model("Memo", memoSchema);
module.exports = Memo;
