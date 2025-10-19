const express = require("express");
const carousel = require("../models/carousel.model");
const { adminUser } = require("../models/adminuser.model");
const router = express.Router();
const { authenticateAdminToken } = require("../auth/adminAuth");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const multer = require("multer");
require("dotenv").config();
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const upload = multer({ storage: multer.memoryStorage() });
async function uploadFileToS3(file) {
  const folderPath = "Carousel/";
  const fileKey = `${folderPath}${Date.now()}_${file.originalname}`;
  const uploadParams = {
    Bucket: process.env.S3_MAINBUCKET,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
  };
  await s3Client.send(new PutObjectCommand(uploadParams));
  return `https://${process.env.S3_MAINBUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
}

// User Get All Carousels
router.get("/api/client/getallcarousels", async (req, res) => {
  try {
    const carousels = await carousel.find({ status: true }).sort({ order: 1 });
    res.status(200).json({
      success: true,
      message: "Carousel retrieved successfully",
      carousels,
    });
  } catch (error) {
    console.error("Error occurred while retrieving carousel:", error);
    res.status(200).json({
      success: false,
      message: "Internal server error",
      error: error.toString(),
    });
  }
});

// Admin Get All Carousel
router.get("/admin/api/carousel", authenticateAdminToken, async (req, res) => {
  try {
    const carousels = await carousel.find({}).sort({ order: 1 });
    res.status(200).json({
      success: true,
      message: "Carousel retrieved successfully",
      data: carousels,
    });
  } catch (error) {
    console.error("Error occurred while retrieving carousel:", error);
    res.status(200).json({
      success: false,
      message: "Internal server error",
      error: error.toString(),
    });
  }
});

// Admin Create Carousel
router.post(
  "/admin/api/createcarousel",
  authenticateAdminToken,
  upload.single("image"),
  async (req, res) => {
    try {
      const { name, link, status, order } = req.body;
      if (!req.file) {
        return res.status(200).json({
          success: false,
          message: {
            en: "No image file provided",
            zh: "未提供图片文件",
          },
        });
      }
      const imageUrl = await uploadFileToS3(req.file);
      const newCarousel = await carousel.create({
        name,
        link: imageUrl,
        status: status === "true",
        order: parseInt(order),
      });
      res.status(200).json({
        success: true,
        message: {
          en: "Carousel created successfully",
          zh: "轮播图创建成功",
        },
        data: newCarousel,
      });
    } catch (error) {
      console.error("Error occurred while creating carousel:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

// Admin Update Carousel
router.patch(
  "/admin/api/updatecarousel/:id",
  authenticateAdminToken,
  upload.single("image"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, link, status, order } = req.body;
      const existingCarousel = await carousel.findById(id);
      if (!existingCarousel) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Carousel not found",
            zh: "轮播图未找到",
          },
        });
      }
      let imageUrl = existingCarousel.link;
      if (req.file) {
        if (imageUrl) {
          const url = new URL(imageUrl);
          const key = decodeURIComponent(url.pathname.substring(1));
          try {
            await s3Client.send(
              new DeleteObjectCommand({
                Bucket: process.env.S3_MAINBUCKET,
                Key: key,
              })
            );
          } catch (deleteError) {
            console.error("Error deleting old image:", deleteError);
          }
        }
        imageUrl = await uploadFileToS3(req.file);
      }
      const updateData = {
        name,
        link: imageUrl,
        status: status === "true",
        order: parseInt(order),
      };
      const updatedCarousel = await carousel.findByIdAndUpdate(id, updateData, {
        new: true,
      });
      res.status(200).json({
        success: true,
        message: {
          en: "Carousel updated successfully",
          zh: "轮播图更新成功",
        },
        data: updatedCarousel,
      });
    } catch (error) {
      console.error("Error occurred while updating carousel:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

// Admin Delete Carousel
router.delete(
  "/admin/api/deletecarousel/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const carouselItem = await carousel.findById(req.params.id);
      if (!carouselItem) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Carousel not found",
            zh: "未找到轮播图",
          },
        });
      }
      if (carouselItem.link) {
        const url = new URL(carouselItem.link);
        const key = decodeURIComponent(url.pathname.substring(1));
        try {
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: process.env.S3_MAINBUCKET,
              Key: key,
            })
          );
        } catch (deleteError) {
          console.error("Error deleting image:", deleteError);
        }
      }
      const deletedCarousel = await carousel.findByIdAndDelete(req.params.id);
      res.status(200).json({
        success: true,
        message: {
          en: "Carousel deleted successfully",
          zh: "轮播图删除成功",
        },
        data: deletedCarousel,
      });
    } catch (error) {
      console.error("Error occurred while deleting carousel:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

// Admin Update Carousel Status
router.patch(
  "/admin/api/updatecarouselstatus",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { id, status } = req.body;
      const updatedCarousel = await carousel.findByIdAndUpdate(
        id,
        { status },
        { new: true }
      );
      if (!updatedCarousel) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Carousel not found",
            zh: "未找到轮播图",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Carousel status updated successfully",
          zh: "轮播图状态更新成功",
        },
        data: updatedCarousel,
      });
    } catch (error) {
      console.error("Error occurred while updating carousel status:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

module.exports = router;
