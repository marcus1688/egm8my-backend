const mongoose = require("mongoose");

const AnnouncementCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
});

const AnnouncementCategory = mongoose.model(
  "announcementcategory",
  AnnouncementCategorySchema
);
module.exports = AnnouncementCategory;
