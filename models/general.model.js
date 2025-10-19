const mongoose = require("mongoose");
const moment = require("moment");

const generalSchema = new mongoose.Schema(
  {
    company: String,
    logoimage: String,
    logogif: String,
    apkfile: String,
    country: String,
    website: String,
    welcomemessageCN: String,
    welcomemessageEN: String,
    announcementCN: String,
    announcementEN: String,
    announcementMS: String,
    referralCN: String,
    referralEN: String,
    telegram: String,
    wechat: String,
    video: [String],
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

const general = mongoose.model("general", generalSchema);

module.exports = { general };
