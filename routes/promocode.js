const express = require("express");
const router = express.Router();
const PromoCode = require("../models/promocode.model");
const PromoClaim = require("../models/promocodeclaim.model");
const Promotion = require("../models/promotion.model");
const { User } = require("../models/users.model");
const { authenticateToken } = require("../auth/auth");
const { authenticateAdminToken } = require("../auth/adminAuth");
const moment = require("moment");
const { v4: uuidv4 } = require("uuid");
const Bonus = require("../models/bonus.model");
const UserWalletLog = require("../models/userwalletlog.model");
const { updateKioskBalance } = require("../services/kioskBalanceService");
const kioskbalance = require("../models/kioskbalance.model");
const Kiosk = require("../models/kiosk.model");

// Generate random code
function generatePromoCode(length = 8) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// User Claim Promo Code
router.post("/api/promocodes/claim", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found, please contact customer service",
          zh: "找不到用户，请联系客服",
          ms: "Pengguna tidak dijumpai, sila hubungi khidmat pelanggan",
        },
      });
    }

    const promoCode = await PromoCode.findOne({
      code: req.body.code,
      isActive: true,
    });

    if (!promoCode) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Invalid promo code",
          zh: "无效的优惠码",
          ms: "Kod promosi tidak sah",
        },
      });
    }

    if (promoCode.claimedCount >= promoCode.claimLimit) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Promo code has reached claim limit",
          zh: "优惠码已达到使用上限",
          ms: "Kod promosi telah mencapai had tuntutan",
        },
      });
    }

    const existingClaim = await PromoClaim.findOne({
      userId: req.user.userId,
      promoCodeId: promoCode._id,
    });

    if (existingClaim) {
      return res.status(200).json({
        success: false,
        message: {
          en: "You have already claimed this code",
          zh: "您已经使用过此优惠码",
          ms: "Anda telah menuntut kod ini",
        },
      });
    }

    const promotion = await Promotion.findById(global.PROMO_CODE_PROMOTION_ID);
    if (!promotion) {
      console.error("Promo code promotion not found");
    }

    const transactionId = uuidv4();
    let newWalletAmount = user.wallet;
    let newLuckySpinPoints = user.luckySpinPoints || 0;

    if (promoCode.rewardType === "luckySpinPoints") {
      newLuckySpinPoints += promoCode.amount;
    } else {
      newWalletAmount += promoCode.amount;
    }

    const claim = new PromoClaim({
      userId: req.user.userId,
      username: user.username,
      promoCodeId: promoCode._id,
      code: promoCode.code,
      amount: promoCode.amount,
      rewardType: promoCode.rewardType,
      transactionId: transactionId,
    });

    const bonus = new Bonus({
      transactionId: transactionId,
      userId: user._id,
      username: user.username,
      fullname: user.fullname,
      transactionType: "bonus",
      processBy: "System",
      amount: promoCode.amount,
      walletamount: newWalletAmount,
      status: "approved",
      method: "auto",
      remark: `Promo Code: ${promoCode.code}${
        promoCode.rewardType === "luckySpinPoints" ? " (Lucky Spin Points)" : ""
      }`,
      promotionname: promotion?.maintitle || "优惠码",
      promotionnameEN: promotion?.maintitleEN || "Promo Code",
      promotionId: global.PROMO_CODE_PROMOTION_ID,
      processtime: "00:00:00",
    });

    const walletLog = new UserWalletLog({
      userId: user._id,
      transactionid: transactionId,
      transactiontime: new Date(),
      transactiontype: "bonus",
      amount: promoCode.amount,
      status: "approved",
      promotionnameEN: "Promo Code",
      promotionnameCN: "优惠码",
    });

    promoCode.claimedCount += 1;
    if (promoCode.claimedCount >= promoCode.claimLimit) {
      promoCode.isActive = false;
    }

    if (promoCode.rewardType === "wallet") {
      const kioskSettings = await kioskbalance.findOne({});
      if (kioskSettings && kioskSettings.status) {
        const kioskResult = await updateKioskBalance(
          "subtract",
          promoCode.amount,
          {
            username: user.username,
            transactionType: "promo code claim",
            remark: `Promo code claim: ${promoCode.code}`,
            processBy: "System",
          }
        );
        if (!kioskResult.success) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to update kiosk balance",
              zh: "更新Kiosk余额失败",
              ms: "Gagal mengemas kini baki kiosk",
            },
          });
        }
      }
    }

    const updateData =
      promoCode.rewardType === "luckySpinPoints"
        ? { $inc: { luckySpinPoints: promoCode.amount } }
        : { $inc: { wallet: promoCode.amount } };

    await Promise.all([
      claim.save(),
      bonus.save(),
      walletLog.save(),
      promoCode.save(),
      User.findByIdAndUpdate(req.user.userId, updateData),
    ]);

    res.status(200).json({
      success: true,
      data: {
        amount: promoCode.amount,
        rewardType: promoCode.rewardType,
        newBalance:
          promoCode.rewardType === "wallet"
            ? newWalletAmount
            : newLuckySpinPoints,
      },
      message: {
        en:
          promoCode.rewardType === "luckySpinPoints"
            ? `Successfully claimed ${promoCode.amount} Lucky Spin Points!`
            : `Successfully claimed $${promoCode.amount} credits!`,
        zh:
          promoCode.rewardType === "luckySpinPoints"
            ? `成功领取 ${promoCode.amount} 幸运转盘积分！`
            : `成功领取 $${promoCode.amount}！`,
        ms:
          promoCode.rewardType === "luckySpinPoints"
            ? `Berjaya menuntut ${promoCode.amount} Lucky Spin Points!`
            : `Berjaya menuntut $${promoCode.amount} kredit!`,
      },
    });
  } catch (error) {
    console.error("Promo code claim error:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Failed to claim promo code",
        zh: "领取优惠码失败",
        ms: "Gagal menuntut kod promosi",
      },
    });
  }
});

// User Promo Code Claim History
router.get("/api/user/promoclaims", authenticateToken, async (req, res) => {
  try {
    const claims = await PromoClaim.find({ userId: req.user.userId }).sort({
      createdAt: -1,
    });
    res.json({ success: true, data: claims });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin Create Promo Code
router.post(
  "/admin/api/promocodes",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const code = generatePromoCode();
      const promoCode = new PromoCode({
        code,
        amount: req.body.amount,
        claimLimit: req.body.claimLimit,
        rewardType: req.body.rewardType || "wallet",
      });
      await promoCode.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Promo code generated successfully",
          zh: "促销码生成成功",
        },
        data: promoCode,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error generating promo code",
          zh: "生成促销码时出错",
        },
      });
    }
  }
);

// Admin Get All Promo Code
router.get(
  "/admin/api/promocodesadmin",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const promoCodes = await PromoCode.find().sort({ createdAt: -1 });
      res.json({ success: true, data: promoCodes });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Admin Get Claim Promo Code Logs
router.get(
  "/admin/api/promoclaimsadmin",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const dateFilter = {};
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }
      const claims = await PromoClaim.find({
        ...dateFilter,
      }).sort({ createdAt: -1 });
      res.json({ success: true, data: claims });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Admin Update Promo Code Amount & Limit
router.put(
  "/admin/api/promocodes/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { amount, claimLimit } = req.body;
      const promoCode = await PromoCode.findByIdAndUpdate(
        req.params.id,
        { amount, claimLimit, rewardType },
        { new: true }
      );
      if (!promoCode) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promo code not found",
            zh: "找不到促销码",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Promo code updated successfully",
          zh: "促销码更新成功",
        },
        data: promoCode,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating promo code",
          zh: "更新促销码时出错",
        },
      });
    }
  }
);

// Admin Update Promo Code Status
router.patch(
  "/admin/api/promocodes/:id/toggle",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const promoCode = await PromoCode.findById(req.params.id);
      if (!promoCode) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promo code not found",
            zh: "找不到促销代码",
          },
        });
      }
      promoCode.isActive = !promoCode.isActive;
      await promoCode.save();
      res.status(200).json({
        success: true,
        message: {
          en: `Promo code is now ${promoCode.isActive ? "active" : "inactive"}`,
          zh: `促销代码${promoCode.isActive ? "已激活" : "已停用"}`,
        },
        data: promoCode,
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

module.exports = router;
