const mongoose = require("mongoose");

const BlogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
    },
    titleCN: {
      type: String,
    },
    description: {
      type: String,
    },
    descriptionCN: {
      type: String,
    },
    content: {
      type: String,
    },
    contentCN: {
      type: String,
    },
    metaTitle: {
      type: String,
    },
    metaTitleCN: {
      type: String,
    },
    metaDescription: {
      type: String,
    },
    metaDescriptionCN: {
      type: String,
    },
    image: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
    },
    isVisible: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Blog = mongoose.model("blog", BlogSchema);
module.exports = Blog;
