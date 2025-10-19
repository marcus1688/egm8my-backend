const mongoose = require("mongoose");

const SportScheduleSchema = new mongoose.Schema({
  fixtureId: {
    type: Number,
    required: true,
    unique: true,
  },
  date: {
    type: Date,
    required: true,
  },
  status: {
    long: String,
    short: String,
    elapsed: Number,
    extra: Number,
  },
  teams: {
    home: {
      id: Number,
      name: String,
      logo: String,
    },
    away: {
      id: Number,
      name: String,
      logo: String,
    },
  },
  goals: {
    home: {
      type: Number,
      default: null,
    },
    away: {
      type: Number,
      default: null,
    },
  },
  venue: Object,
  isInplay: {
    type: Boolean,
    default: false,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("SportSchedule", SportScheduleSchema);
