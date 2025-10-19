const express = require("express");
const { general } = require("../models/general.model");
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
  const folderPath = "general/";
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

// User Get All General Settting Data
router.get("/api/generalsetting", async (req, res) => {
  try {
    const generalData = await general.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: generalData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching general setting",
      error: error.message,
    });
  }
});

// Admin Create General Settting Data
router.post(
  "/admin/api/generalsetting",
  authenticateAdminToken,
  upload.fields([
    { name: "logoimage", maxCount: 1 },
    { name: "logogif", maxCount: 1 },
    { name: "video", maxCount: 2 },
    { name: "apkfile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        company,
        country,
        website,
        welcomemessageCN,
        welcomemessageEN,
        announcementCN,
        announcementEN,
        referralCN,
        referralEN,
        telegram,
        wechat,
        videotitleCN,
        videotitleEN,
        videodescriptionCN,
        videodescriptionEN,
        facebook,
        instagram,
        livechat,
        gmail,
        youtube,
        whatsapp,
      } = req.body;
      let uploadedFiles = {
        logoimage: null,
        logogif: null,
        video: [],
        apkfile: null,
      };
      if (req.files.logoimage && req.files.logoimage[0]) {
        try {
          uploadedFiles.logoimage = await uploadFileToS3(
            req.files.logoimage[0],
            "image"
          );
        } catch (error) {
          console.error("Error uploading logo to S3:", error);
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to upload logo image. Please try again.",
              zh: "上传徽标图像失败，请重试。",
            },
          });
        }
      }
      if (req.files.logogif && req.files.logogif[0]) {
        try {
          uploadedFiles.logogif = await uploadFileToS3(
            req.files.logogif[0],
            "gif"
          );
        } catch (error) {
          console.error("Error uploading logo gif to S3:", error);
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to upload logo animation. Please try again.",
              zh: "上传徽标动画失败，请重试。",
            },
          });
        }
      }
      if (req.files.video && req.files.video.length > 0) {
        try {
          for (const videoFile of req.files.video) {
            const videoUrl = await uploadFileToS3(videoFile, "video");
            uploadedFiles.video.push(videoUrl);
          }
        } catch (error) {
          console.error("Error uploading videos to S3:", error);
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to upload videos. Please try again.",
              zh: "上传视频失败，请重试。",
            },
          });
        }
      }

      if (req.files.apkfile && req.files.apkfile[0]) {
        try {
          uploadedFiles.apkfile = await uploadFileToS3(
            req.files.apkfile[0],
            "application"
          );
        } catch (error) {
          console.error("Error uploading APK to S3:", error);
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to upload APK file. Please try again.",
              zh: "上传APK文件失败，请重试。",
              ms: "Gagal memuat naik fail APK. Sila cuba lagi.",
            },
          });
        }
      }
      const generalSetting = new general({
        company,
        logoimage: uploadedFiles.logoimage,
        logogif: uploadedFiles.logogif,
        video: uploadedFiles.video,
        apkfile: uploadedFiles.apkfile,
        country,
        website,
        welcomemessageCN,
        welcomemessageEN,
        announcementCN,
        announcementEN,
        referralCN,
        referralEN,
        telegram,
        wechat,
        videotitleCN,
        videotitleEN,
        videodescriptionCN,
        videodescriptionEN,
        facebook,
        instagram,
        livechat,
        gmail,
        youtube,
        whatsapp,
      });

      const savedData = await generalSetting.save();
      res.status(200).json({
        success: true,
        message: {
          en: "General setting created successfully",
          zh: "常规设置创建成功",
        },
        data: savedData,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error creating general setting",
          zh: "创建常规设置时出错",
        },
      });
    }
  }
);

// Admin Get All General Settting Data
router.get(
  "/admin/api/generalsetting",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const generalData = await general.find().sort({ createdAt: -1 });
      res.status(200).json({
        success: true,
        data: generalData,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching general setting",
        error: error.message,
      });
    }
  }
);

// Admin Update General Settting Data
router.put(
  "/admin/api/generalsetting/:id",
  authenticateAdminToken,
  upload.fields([
    { name: "logoimage", maxCount: 1 },
    { name: "logogif", maxCount: 1 },
    { name: "video", maxCount: 2 },
    { name: "apkfile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        company,
        country,
        website,
        welcomemessageCN,
        welcomemessageEN,
        announcementCN,
        announcementEN,
        referralCN,
        referralEN,
        telegram,
        wechat,
        videotitleCN,
        videotitleEN,
        videodescriptionCN,
        videodescriptionEN,
        facebook,
        instagram,
        livechat,
        gmail,
        youtube,
        whatsapp,
        videosToDelete,
      } = req.body;
      const generalUpdate = await general.findById(req.params.id);
      if (!generalUpdate) {
        return res.status(200).json({
          success: false,
          message: {
            en: "General Setting not found",
            zh: "找不到常规设置",
          },
        });
      }
      const updates = {
        company: company || "",
        country: country || "",
        website: website || "",
        welcomemessageCN: welcomemessageCN || "",
        welcomemessageEN: welcomemessageEN || "",
        announcementCN: announcementCN || "",
        announcementEN: announcementEN || "",
        referralCN: referralCN || "",
        referralEN: referralEN || "",
        telegram: telegram || "",
        wechat: wechat || "",
        videotitleCN: videotitleCN || "",
        videotitleEN: videotitleEN || "",
        videodescriptionCN: videodescriptionCN || "",
        videodescriptionEN: videodescriptionEN || "",
        facebook: facebook || "",
        instagram: instagram || "",
        livechat: livechat || "",
        gmail: gmail || "",
        youtube: youtube || "",
        whatsapp: whatsapp || "",
      };
      if (req.files.logoimage && req.files.logoimage[0]) {
        if (generalUpdate.logoimage) {
          const oldImageUrl = generalUpdate.logoimage;
          const oldKey = oldImageUrl.split("/").slice(-2).join("/");
          const deleteParams = {
            Bucket: process.env.S3_MAINBUCKET,
            Key: oldKey,
          };
          try {
            await s3Client.send(new DeleteObjectCommand(deleteParams));
          } catch (error) {
            console.error("Error deleting old logo image from S3:", error);
          }
        }
        try {
          updates.logoimage = await uploadFileToS3(
            req.files.logoimage[0],
            "image"
          );
        } catch (error) {
          console.error("Error uploading new logo image to S3:", error);
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to upload new logo image. Please try again.",
              zh: "上传新徽标图像失败，请重试。",
            },
          });
        }
      }
      if (req.files.logogif && req.files.logogif[0]) {
        if (generalUpdate.logogif) {
          const oldGifUrl = generalUpdate.logogif;
          const oldKey = oldGifUrl.split("/").slice(-2).join("/");
          const deleteParams = {
            Bucket: process.env.S3_MAINBUCKET,
            Key: oldKey,
          };
          try {
            await s3Client.send(new DeleteObjectCommand(deleteParams));
          } catch (error) {
            console.error("Error deleting old logo gif from S3:", error);
          }
        }
        try {
          updates.logogif = await uploadFileToS3(req.files.logogif[0], "gif");
        } catch (error) {
          console.error("Error uploading new logo gif to S3:", error);
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to upload new logo gif. Please try again.",
              zh: "上传新徽标动画失败，请重试。",
            },
          });
        }
      }
      let currentVideos = generalUpdate.video || [];
      if (videosToDelete) {
        try {
          const indicesToDelete = JSON.parse(videosToDelete);
          for (const index of indicesToDelete) {
            if (currentVideos[index]) {
              const oldVideoUrl = currentVideos[index];
              const oldKey = oldVideoUrl.split("/").slice(-2).join("/");
              const deleteParams = {
                Bucket: process.env.S3_MAINBUCKET,
                Key: oldKey,
              };
              try {
                await s3Client.send(new DeleteObjectCommand(deleteParams));
                console.log(`Deleted video from S3: ${oldKey}`);
              } catch (error) {
                console.error("Error deleting video from S3:", error);
              }
            }
          }
          currentVideos = currentVideos.filter(
            (_, index) => !indicesToDelete.includes(index)
          );
        } catch (error) {
          console.error("Error parsing videosToDelete:", error);
        }
      }

      if (req.files.video && req.files.video.length > 0) {
        try {
          for (const videoFile of req.files.video) {
            if (currentVideos.length >= 2) {
              return res.status(200).json({
                success: false,
                message: {
                  en: "Cannot upload more than 2 videos",
                  zh: "不能上传超过2个视频",
                },
              });
            }
            const videoUrl = await uploadFileToS3(videoFile, "video");
            currentVideos.push(videoUrl);
          }
        } catch (error) {
          console.error("Error uploading new videos to S3:", error);
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to upload new videos. Please try again.",
              zh: "上传新视频失败，请重试。",
            },
          });
        }
      }
      updates.video = currentVideos;
      if (req.files.apkfile && req.files.apkfile[0]) {
        if (generalUpdate.apkfile) {
          const oldApkUrl = generalUpdate.apkfile;
          const oldKey = oldApkUrl.split("/").slice(-2).join("/");
          const deleteParams = {
            Bucket: process.env.S3_MAINBUCKET,
            Key: oldKey,
          };
          try {
            await s3Client.send(new DeleteObjectCommand(deleteParams));
          } catch (error) {
            console.error("Error deleting old APK from S3:", error);
          }
        }
        try {
          updates.apkfile = await uploadFileToS3(
            req.files.apkfile[0],
            "application"
          );
        } catch (error) {
          console.error("Error uploading new APK to S3:", error);
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to upload new APK. Please try again.",
              zh: "上传新APK失败，请重试。",
              ms: "Gagal memuat naik APK baru. Sila cuba lagi.",
            },
          });
        }
      }

      const updateGeneralSetting = await general.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true }
      );

      res.status(200).json({
        success: true,
        message: {
          en: "General setting updated successfully",
          zh: "常规设置更新成功",
        },
        data: updateGeneralSetting,
      });
    } catch (error) {
      console.error("Error updating general setting:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating general setting",
          zh: "更新常规设置时出错",
        },
      });
    }
  }
);

module.exports = router;
