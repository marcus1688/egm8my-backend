const mongoose = require("mongoose");

const ContentBlockSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      default: "",
    },
    contentCN: {
      type: String,
      default: "",
    },
    order: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const SEOPageSchema = new mongoose.Schema(
  {
    pageType: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9-]+$/,
    },
    isVisible: {
      type: Boolean,
      default: true,
    },
    contentBlocks: [ContentBlockSchema],
  },
  {
    timestamps: true,
  }
);

const SEOPage = mongoose.model("SEOPage", SEOPageSchema);
module.exports = SEOPage;
