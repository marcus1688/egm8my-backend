const express = require("express");
const promotion = require("../models/promotion.model");
const Bonus = require("../models/bonus.model");
const { adminUser } = require("../models/adminuser.model");
const router = express.Router();
const { authenticateAdminToken } = require("../auth/adminAuth");
const { authenticateToken } = require("../auth/auth");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const multer = require("multer");
const moment = require("moment");
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
  const folderPath = "promotion/";
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

// Client Side Check Promotion
router.post(
  "/api/client/checkpromotion",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const { promotionId, depositAmount } = req.body;
      if (!promotionId) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion ID is required",
            zh: "需要提供优惠活动ID",
          },
        });
      }
      const promotionData = await promotion.findById(promotionId);
      if (!promotionData) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion not found",
            zh: "找不到该优惠活动",
          },
        });
      }

      if (depositAmount < promotionData.mindeposit) {
        return res.status(200).json({
          success: false,
          message: {
            en: `Minimum deposit amount for this promotion is ${promotionData.mindeposit}`,
            zh: `此优惠的最低存款金额为 ${promotionData.mindeposit}`,
          },
        });
      }
      const malaysiaNow = moment().tz("Asia/Kuala_Lumpur");
      let dateFilter = {};
      switch (promotionData.claimfrequency) {
        case "daily":
          const dayStart = malaysiaNow.clone().startOf("day").utc().toDate();
          const dayEnd = malaysiaNow.clone().endOf("day").utc().toDate();
          dateFilter = {
            createdAt: {
              $gte: dayStart,
              $lt: dayEnd,
            },
          };
          break;

        case "weekly":
          const weekStart = malaysiaNow.clone().startOf("week").utc().toDate();
          const weekEnd = malaysiaNow.clone().endOf("week").utc().toDate();
          dateFilter = {
            createdAt: {
              $gte: weekStart,
              $lt: weekEnd,
            },
          };
          break;

        case "monthly":
          const monthStart = malaysiaNow
            .clone()
            .startOf("month")
            .utc()
            .toDate();
          const monthEnd = malaysiaNow.clone().endOf("month").utc().toDate();
          dateFilter = {
            createdAt: {
              $gte: monthStart,
              $lt: monthEnd,
            },
          };
          break;

        case "lifetime":
          dateFilter = {};
          break;
      }

      if (promotionData.claimcount === 0) {
        return res.status(200).json({
          success: true,
          message: {
            en: "You can claim this promotion",
            zh: "您可以申请此优惠",
          },
        });
      }

      const bonusCount = await Bonus.countDocuments({
        userId: userId,
        promotionId: promotionId,
        status: "approved",
        ...dateFilter,
      });

      if (bonusCount >= promotionData.claimcount) {
        return res.status(200).json({
          success: false,
          message: {
            en: `You have reached the maximum claim limit for this promotion (${promotionData.claimcount} times ${promotionData.claimfrequency})`,
            zh: `您已达到此优惠的最大申请次数限制（${
              promotionData.claimfrequency === "daily"
                ? "每天"
                : promotionData.claimfrequency === "weekly"
                ? "每周"
                : promotionData.claimfrequency === "monthly"
                ? "每月"
                : "永久"
            } ${promotionData.claimcount} 次）`,
          },
        });
      }
      return res.status(200).json({
        success: true,
        message: {
          en: "You can claim this promotion",
          zh: "您可以申请此优惠",
        },
      });
    } catch (error) {
      console.error("Error checking promotion:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to check promotion",
          zh: "检查优惠失败",
        },
      });
    }
  }
);

// User Get All Promotion
router.get("/api/client/getallpromotion", async (req, res) => {
  try {
    const promotions = await promotion
      .find({ status: true })
      .populate("categories");

    const sortedPromotions = promotions.sort((a, b) => {
      const orderA = a.order || 0;
      const orderB = b.order || 0;
      if (orderA === 0 && orderB !== 0) return 1;
      if (orderA !== 0 && orderB === 0) return -1;
      return orderA - orderB;
    });

    res.status(200).json({ success: true, promotions: sortedPromotions });
  } catch (error) {
    console.log(error);
    res.status(200).send({ success: false, message: "Internal server error" });
  }
});

// User Get Deposit Promotion
router.get("/api/getdepositpromotion", async (req, res) => {
  try {
    const promotions = await promotion.find(
      { isDeposit: true },
      "_id maintitle maintitleEN bonuspercentage order"
    );

    const sortedPromotions = promotions.sort((a, b) => {
      const orderA = a.order || 0;
      const orderB = b.order || 0;
      if (orderA === 0 && orderB !== 0) return 1;
      if (orderA !== 0 && orderB === 0) return -1;
      return orderA - orderB;
    });

    res.status(200).json({ success: true, data: sortedPromotions });
  } catch (error) {
    console.error(error);
    res.status(200).send({ message: "Internal server error" });
  }
});

// User Get Exact Promotion
router.get("/api/getexactpromotion", async (req, res) => {
  try {
    const promotions = await promotion.find(
      { claimtype: "Exact", status: true },
      "_id maintitle maintitleEN bonusexact order"
    );

    const sortedPromotions = promotions.sort((a, b) => {
      const orderA = a.order || 0;
      const orderB = b.order || 0;
      if (orderA === 0 && orderB !== 0) return 1;
      if (orderA !== 0 && orderB === 0) return -1;
      return orderA - orderB;
    });

    res.status(200).json({ authorized: true, promotions: sortedPromotions });
  } catch (error) {
    console.error(error);
    res.status(200).send({ message: "Internal server error" });
  }
});

// Admin Side Check Promotion
router.post(
  "/admin/api/checkpromotion",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { promotionId, depositAmount, userid } = req.body;

      if (!promotionId) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion ID is required",
            zh: "需要提供优惠活动ID",
          },
        });
      }
      const promotionData = await promotion.findById(promotionId);
      if (!promotionData) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion not found",
            zh: "找不到该优惠活动",
          },
        });
      }

      if (depositAmount < promotionData.mindeposit) {
        return res.status(200).json({
          success: false,
          message: {
            en: `Minimum deposit amount for this promotion is ${promotionData.mindeposit}`,
            zh: `此优惠的最低存款金额为 ${promotionData.mindeposit}`,
          },
        });
      }
      const malaysiaNow = moment().tz("Asia/Kuala_Lumpur");
      let dateFilter = {};
      switch (promotionData.claimfrequency) {
        case "daily":
          const dayStart = malaysiaNow.clone().startOf("day").utc().toDate();
          const dayEnd = malaysiaNow.clone().endOf("day").utc().toDate();
          dateFilter = {
            createdAt: {
              $gte: dayStart,
              $lt: dayEnd,
            },
          };
          break;

        case "weekly":
          const weekStart = malaysiaNow.clone().startOf("week").utc().toDate();
          const weekEnd = malaysiaNow.clone().endOf("week").utc().toDate();
          dateFilter = {
            createdAt: {
              $gte: weekStart,
              $lt: weekEnd,
            },
          };
          break;

        case "monthly":
          const monthStart = malaysiaNow
            .clone()
            .startOf("month")
            .utc()
            .toDate();
          const monthEnd = malaysiaNow.clone().endOf("month").utc().toDate();
          dateFilter = {
            createdAt: {
              $gte: monthStart,
              $lt: monthEnd,
            },
          };
          break;

        case "lifetime":
          dateFilter = {};
          break;
      }

      if (promotionData.claimcount === 0) {
        return res.status(200).json({
          success: true,
          message: {
            en: "You can claim this promotion",
            zh: "您可以申请此优惠",
          },
        });
      }

      const bonusCount = await Bonus.countDocuments({
        userId: userid,
        promotionId: promotionId,
        status: "approved",
        ...dateFilter,
      });

      if (bonusCount >= promotionData.claimcount) {
        return res.status(200).json({
          success: false,
          message: {
            en: `This user have reached the maximum claim limit for this promotion (${promotionData.claimcount} times ${promotionData.claimfrequency})`,
            zh: `这名用户已达到此优惠的最大申请次数限制（${
              promotionData.claimfrequency === "daily"
                ? "每天"
                : promotionData.claimfrequency === "weekly"
                ? "每周"
                : promotionData.claimfrequency === "monthly"
                ? "每月"
                : "永久"
            } ${promotionData.claimcount} 次）`,
          },
        });
      }
      return res.status(200).json({
        success: true,
        message: {
          en: "You can claim this promotion",
          zh: "您可以申请此优惠",
        },
      });
    } catch (error) {
      console.error("Error checking promotion:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to check promotion",
          zh: "检查优惠失败",
        },
      });
    }
  }
);

// Admin Get Deposit Promotion
router.get(
  "/admin/api/getdepositpromotion",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const promotions = await promotion
        .find({ isDeposit: true }, "_id maintitle maintitleEN bonuspercentage")
        .sort({ createdAt: 1 });
      res.status(200).json({ success: true, data: promotions });
    } catch (error) {
      console.error(error);
      res.status(200).send({ message: "Internal server error" });
    }
  }
);

// Admin Create Promotion
router.post(
  "/admin/api/promotions",
  authenticateAdminToken,
  upload.single("promotionimage"),
  async (req, res) => {
    try {
      const promotionData = req.body;
      if (req.file) {
        promotionData.promotionimage = await uploadFileToS3(req.file);
      }
      const newPromotion = new promotion(promotionData);
      await newPromotion.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Promotion created successfully",
          zh: "优惠创建成功",
        },
        data: newPromotion,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error creating promotion",
          zh: "创建优惠时出错",
        },
      });
    }
  }
);

//  Admin Get All Promotion
router.get(
  "/admin/api/promotions",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const promotions = await promotion
        .find()
        .populate("categories")
        .sort({ createdAt: -1 });
      res.json({ success: true, data: promotions });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Admin Update Promotion
router.put(
  "/admin/api/promotions/:id",
  authenticateAdminToken,
  upload.single("promotionimage"),
  async (req, res) => {
    try {
      const existingPromotion = await promotion.findById(req.params.id);
      if (!existingPromotion) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion not found",
            zh: "找不到优惠",
          },
        });
      }

      const updates = req.body;
      if (req.file) {
        if (existingPromotion.promotionimage) {
          const oldKey = existingPromotion.promotionimage
            .split("/")
            .slice(-2)
            .join("/");
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: process.env.S3_MAINBUCKET,
              Key: oldKey,
            })
          );
        }
        updates.promotionimage = await uploadFileToS3(req.file);
      }

      const updatedPromotion = await promotion
        .findByIdAndUpdate(req.params.id, updates, { new: true })
        .populate("categories");

      res.status(200).json({
        success: true,
        message: {
          en: "Promotion updated successfully",
          zh: "优惠更新成功",
        },
        data: updatedPromotion,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating promotion",
          zh: "更新优惠时出错",
        },
      });
    }
  }
);

// Admin Delete Promotion
router.delete(
  "/admin/api/promotions/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const existingPromotion = await promotion.findById(req.params.id);
      if (!existingPromotion) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion not found",
            zh: "找不到优惠活动",
          },
        });
      }
      if (existingPromotion.promotionimage) {
        const imageKey = existingPromotion.promotionimage
          .split("/")
          .slice(-2)
          .join("/");
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: process.env.S3_MAINBUCKET,
            Key: imageKey,
          })
        );
      }
      await promotion.findByIdAndDelete(req.params.id);
      res.status(200).json({
        success: true,
        message: {
          en: "Promotion deleted successfully",
          zh: "优惠删除成功",
        },
      });
    } catch (error) {
      console.error("Error deleting promotion:", error);
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

// Admin Update Promotion Status
router.patch(
  "/admin/api/promotions/:id/toggle",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const existingPromotion = await promotion.findById(req.params.id);
      if (!existingPromotion) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion not found",
            zh: "找不到优惠",
          },
        });
      }
      existingPromotion.status = !existingPromotion.status;
      await existingPromotion.save();
      res.status(200).json({
        success: true,
        data: existingPromotion,
        message: {
          en: `Status ${
            existingPromotion.status ? "activated" : "deactivated"
          } successfully`,
          zh: `优惠已${existingPromotion.status ? "激活" : "停用"}`,
        },
      });
    } catch (error) {
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

// Admin Get Promotion Report
router.get(
  "/admin/api/promotions-report",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const promotions = await promotion.find().populate("categories");
      const dateFilter = {};
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }
      const statsResults = await Bonus.aggregate([
        {
          $match: {
            promotionId: { $in: promotions.map((p) => p._id.toString()) },
            ...dateFilter,
          },
        },
        {
          $group: {
            _id: "$promotionId",
            appClaimCount: {
              $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] },
            },
            appBonusAmount: {
              $sum: { $cond: [{ $eq: ["$status", "approved"] }, "$amount", 0] },
            },
            rejClaimCount: {
              $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
            },
            rejBonusAmount: {
              $sum: { $cond: [{ $eq: ["$status", "rejected"] }, "$amount", 0] },
            },
            revClaimCount: {
              $sum: { $cond: [{ $eq: ["$reverted", true] }, 1, 0] },
            },
            revBonusAmount: {
              $sum: { $cond: [{ $eq: ["$reverted", true] }, "$amount", 0] },
            },
          },
        },
      ]);
      const statsMap = new Map(statsResults.map((stat) => [stat._id, stat]));
      const reportData = promotions.map((promo) => {
        const stats = statsMap.get(promo._id.toString()) || {};
        const categories = promo.categories.map((cat) => cat.name).join(", ");
        return {
          id: promo._id,
          name: promo.maintitle,
          nameEN: promo.maintitleEN,
          claimtype: promo.claimtype,
          category: categories,
          description: promo.description,
          claimType: promo.claimType,
          appClaimCount: stats.appClaimCount || 0,
          appBonusAmount: stats.appBonusAmount || 0,
          rejClaimCount: stats.rejClaimCount || 0,
          rejBonusAmount: stats.rejBonusAmount || 0,
          revClaimCount: stats.revClaimCount || 0,
          revBonusAmount: stats.revBonusAmount || 0,
        };
      });
      res.json({ success: true, data: reportData });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

module.exports = router;
