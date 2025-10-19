const mongoose = require("mongoose");

const WeeklyTurnoverSchema = new mongoose.Schema(
  {
    data: [
      {
        username: {
          type: String,
          required: true,
        },
        totalValidTurnover: {
          type: Number,
          required: true,
          min: 0,
        },
      },
    ],
    metadata: {
      startDate: {
        type: String,
        required: false,
      },
      endDate: {
        type: String,
        required: false,
      },
      daysIncluded: {
        type: [String],
        required: false,
      },
      totalUsers: {
        type: Number,
        required: false,
      },
    },
  },
  {
    timestamps: true,
  }
);

const WeeklyTurnover = mongoose.model("weeklyturnover", WeeklyTurnoverSchema);
module.exports = WeeklyTurnover;
