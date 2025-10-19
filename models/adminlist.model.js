const mongoose = require("mongoose");
const moment = require("moment");

const adminListSchema = new mongoose.Schema(
  {
    logoimage: String,
    logogif: String,
    country: String,
    website: String,
    announcementCN: String,
    announcementEN: String,
    referralCN: String,
    referralEN: String,
    telegram: String,
    wechat: String,
    video: String,
    videotitleCN: String,
    videotitleEN: String,
    videodescriptionCN: String,
    videodescriptionEN: String,
    facebook: String,
    instagram: String,
    livechat: String,
    gmail: String,
    youtube: String,
    whatsapp: String,
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

const adminList = mongoose.model("adminList", adminListSchema);

module.exports = { adminList };
