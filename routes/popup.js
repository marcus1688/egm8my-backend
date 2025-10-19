const express = require("express");
const popUp = require("../models/popup.model");
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
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fieldSize: 50 * 1024 * 1024,
    fileSize: 50 * 1024 * 1024,
  },
});
async function uploadFileToS3(file) {
  const folderPath = "popup/";
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

async function handleBase64Image(base64String) {
  try {
    const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error("Invalid base64 string");
    }
    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");
    const fileExt = mimeType.split("/")[1];
    const fileName = `${Date.now()}.${fileExt}`;
    const uploadParams = {
      Bucket: process.env.S3_MAINBUCKET,
      Key: `popup/${fileName}`,
      Body: buffer,
      ContentType: mimeType,
    };
    await s3Client.send(new PutObjectCommand(uploadParams));
    return `https://${process.env.S3_MAINBUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/popup/${fileName}`;
  } catch (error) {
    console.error("Error processing base64 image:", error);
    throw error;
  }
}

// User Get Popup
router.get("/api/active-popup", async (req, res) => {
  try {
    const activePopup = await popUp
      .findOne({ status: true })
      .sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: activePopup,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching active popup",
      error: error.message,
    });
  }
});

// Admin Get Popup Data
router.get("/admin/api/popup", authenticateAdminToken, async (req, res) => {
  try {
    const popupData = await popUp.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: popupData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching popup data",
      error: error.message,
    });
  }
});

// Admnin Create Popup
router.post(
  "/admin/api/popup",
  authenticateAdminToken,
  upload.single("image"),
  async (req, res) => {
    try {
      const popupData = { ...req.body };
      if (req.file) {
        const imageUrl = await uploadFileToS3(req.file);
        popupData.image = imageUrl;
      }
      if (popupData.contentEN) {
        let contentENProcessed = popupData.contentEN;
        const base64Regex = /src="data:image\/[^;]+;base64[^"]+"/g;
        const base64Matches = popupData.contentEN.match(base64Regex);

        if (base64Matches) {
          for (const base64Match of base64Matches) {
            const base64String = base64Match.substring(
              5,
              base64Match.length - 1
            );
            try {
              const imageUrl = await handleBase64Image(base64String);
              contentENProcessed = contentENProcessed.replace(
                base64String,
                imageUrl
              );
            } catch (error) {
              console.error("Error processing image in contentEN:", error);
            }
          }
        }

        popupData.contentEN = contentENProcessed;
      }
      if (popupData.contentCN) {
        let contentCNProcessed = popupData.contentCN;
        const base64Regex = /src="data:image\/[^;]+;base64[^"]+"/g;
        const base64MatchesCN = popupData.contentCN.match(base64Regex);

        if (base64MatchesCN) {
          for (const base64Match of base64MatchesCN) {
            const base64String = base64Match.substring(
              5,
              base64Match.length - 1
            );
            try {
              const imageUrl = await handleBase64Image(base64String);
              contentCNProcessed = contentCNProcessed.replace(
                base64String,
                imageUrl
              );
            } catch (error) {
              console.error("Error processing image in contentCN:", error);
            }
          }
        }
        popupData.contentCN = contentCNProcessed;
      }
      if (popupData.status === undefined) {
        popupData.status = true;
      }
      const newPopup = new popUp(popupData);
      const savedPopup = await newPopup.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Popup created successfully",
          zh: "弹窗创建成功",
        },
        data: savedPopup,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error creating popup",
          zh: "创建弹窗时出错",
        },
      });
    }
  }
);

// Admin Update Popup Data
router.put(
  "/admin/api/popup/:id",
  authenticateAdminToken,
  upload.single("image"),
  async (req, res) => {
    try {
      const updates = { ...req.body };
      const oldPopup = await popUp.findById(req.params.id);
      if (!oldPopup) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Popup not found",
            zh: "找不到弹窗",
          },
        });
      }
      if (req.file) {
        const imageUrl = await uploadFileToS3(req.file);
        updates.image = imageUrl;

        if (oldPopup?.image) {
          const oldKey = oldPopup.image.split("/").slice(-2).join("/");
          const deleteParams = {
            Bucket: process.env.S3_MAINBUCKET,
            Key: oldKey,
          };
          try {
            await s3Client.send(new DeleteObjectCommand(deleteParams));
          } catch (error) {
            console.error("Error deleting old image:", error);
          }
        }
      }
      const imgRegex = /<img[^>]+src="([^">]+)"/g;
      const oldImages = new Set();
      let match;
      if (oldPopup.contentEN) {
        while ((match = imgRegex.exec(oldPopup.contentEN)) !== null) {
          const imageUrl = match[1];
          if (imageUrl.includes(process.env.S3_MAINBUCKET)) {
            oldImages.add(imageUrl);
          }
        }
      }
      if (oldPopup.contentCN) {
        while ((match = imgRegex.exec(oldPopup.contentCN)) !== null) {
          const imageUrl = match[1];
          if (imageUrl.includes(process.env.S3_MAINBUCKET)) {
            oldImages.add(imageUrl);
          }
        }
      }
      const newImages = new Set();
      if (updates.contentEN) {
        let contentENProcessed = updates.contentEN;
        const base64Regex = /src="data:image\/[^;]+;base64[^"]+"/g;
        const base64Matches = updates.contentEN.match(base64Regex);

        if (base64Matches) {
          for (const base64Match of base64Matches) {
            const base64String = base64Match.substring(
              5,
              base64Match.length - 1
            );
            try {
              const imageUrl = await handleBase64Image(base64String);
              contentENProcessed = contentENProcessed.replace(
                base64String,
                imageUrl
              );
              newImages.add(imageUrl);
            } catch (error) {
              console.error("Error processing image in contentEN:", error);
            }
          }
        }
        updates.contentEN = contentENProcessed;
        while ((match = imgRegex.exec(contentENProcessed)) !== null) {
          const imageUrl = match[1];
          if (imageUrl.includes(process.env.S3_MAINBUCKET)) {
            newImages.add(imageUrl);
          }
        }
      }
      if (updates.contentCN) {
        let contentCNProcessed = updates.contentCN;
        const base64Regex = /src="data:image\/[^;]+;base64[^"]+"/g;
        const base64MatchesCN = updates.contentCN.match(base64Regex);

        if (base64MatchesCN) {
          for (const base64Match of base64MatchesCN) {
            const base64String = base64Match.substring(
              5,
              base64Match.length - 1
            );
            try {
              const imageUrl = await handleBase64Image(base64String);
              contentCNProcessed = contentCNProcessed.replace(
                base64String,
                imageUrl
              );
              newImages.add(imageUrl);
            } catch (error) {
              console.error("Error processing image in contentCN:", error);
            }
          }
        }
        updates.contentCN = contentCNProcessed;
        while ((match = imgRegex.exec(contentCNProcessed)) !== null) {
          const imageUrl = match[1];
          if (imageUrl.includes(process.env.S3_MAINBUCKET)) {
            newImages.add(imageUrl);
          }
        }
      }
      const urlsToDelete = Array.from(oldImages).filter(
        (url) => !newImages.has(url)
      );
      for (const url of urlsToDelete) {
        try {
          const key = url.split(".com/")[1];
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: process.env.S3_MAINBUCKET,
              Key: key,
            })
          );
        } catch (error) {
          console.error("Error deleting old image:", error);
        }
      }
      const updatedPopup = await popUp.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true }
      );
      res.status(200).json({
        success: true,
        message: {
          en: "Popup updated successfully",
          zh: "弹窗更新成功",
        },
        data: updatedPopup,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating popup",
          zh: "更新弹窗时出错",
        },
      });
    }
  }
);

// Admin Delete Popup Image
router.delete(
  "/admin/api/popup/:id/delete-image",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const popup = await popUp.findById(req.params.id);
      if (!popup) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Popup not found",
            zh: "找不到弹窗",
          },
        });
      }
      if (!popup.image) {
        return res.status(200).json({
          success: false,
          message: {
            en: "No media to delete",
            zh: "没有媒体文件可删除",
          },
        });
      }
      const imageUrl = popup.image;
      const key = imageUrl.split("/").slice(-2).join("/");
      const deleteParams = {
        Bucket: process.env.S3_MAINBUCKET,
        Key: key,
      };
      try {
        await s3Client.send(new DeleteObjectCommand(deleteParams));
      } catch (error) {
        console.error("Error deleting image from S3:", error);
      }
      popup.image = null;
      await popup.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Popup media deleted successfully",
          zh: "弹窗媒体文件删除成功",
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error deleting popup media",
          zh: "删除弹窗媒体文件时出错",
        },
        error: error.message,
      });
    }
  }
);

module.exports = router;
