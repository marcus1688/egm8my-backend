const express = require("express");
const router = express.Router();
const { authenticateAdminToken } = require("../auth/adminAuth");
const { authenticateToken } = require("../auth/auth");
const { User } = require("../models/users.model");
const LuckyDrawLog = require("../models/luckydrawlog.model");
const Deposit = require("../models/deposit.model");
const moment = require("moment");
const { checkSportPendingMatch } = require("../helpers/turnoverHelper");
const Bonus = require("../models/bonus.model");
const UserWalletLog = require("../models/userwalletlog.model");
const { v4: uuidv4 } = require("uuid");
const Promotion = require("../models/promotion.model");
const LuckyDrawSetting = require("../models/luckydrawsetting.model");
const { adminUser } = require("../models/adminuser.model");

const prizes = [
  { id: 1, name: "RM30", value: 30, gridPosition: 0, winningRate: 0 },
  {
    id: 2,
    name: "Apple Iphone 16",
    value: 3500,
    gridPosition: 1,
    winningRate: 0,
  },
  { id: 3, name: "RM10", value: 10, gridPosition: 2, winningRate: 0 },
  { id: 4, name: "RM5", value: 5, gridPosition: 3, winningRate: 500 },
  {
    id: 5,
    name: "Apple Watch 10",
    value: 1500,
    gridPosition: 5,
    winningRate: 0,
  },
  {
    id: 6,
    name: `Apple iPad 11"`,
    value: 2500,
    gridPosition: 6,
    winningRate: 0,
  },
  { id: 7, name: "RM20", value: 20, gridPosition: 7, winningRate: 0 },
  {
    id: 8,
    name: "RM3",
    value: 3,
    gridPosition: 8,
    winningRate: 9500,
  },
];

function selectPrizeByRate() {
  const random = Math.random() * 10000;
  let cumulativeRate = 0;
  for (const prize of prizes) {
    cumulativeRate += prize.winningRate;
    if (random <= cumulativeRate) {
      return prize;
    }
  }
  return prizes[0];
}

// User Get Lucky Draw Prizes
router.get("/api/luckydraw9grid/prizes", async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: {
        en: "Prizes retrieved successfully",
        zh: "奖品列表获取成功",
        ms: "Senarai hadiah berjaya diperoleh",
      },
      data: prizes,
    });
  } catch (error) {
    console.error("Error getting prizes:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Internal server error",
        zh: "服务器内部错误",
        ms: "Ralat dalaman pelayan",
      },
    });
  }
});

// User Start Spin
router.post("/api/luckydraw9grid/spin", authenticateToken, async (req, res) => {
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

    if (user.wallet >= 1) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your wallet balance must be less than RM1 to participate",
          zh: "您的钱包余额必须少于1令吉才能参与",
          ms: "Baki dompet anda mesti kurang daripada RM1 untuk menyertai",
        },
      });
    }
    const todayStart = moment().startOf("day").toDate();
    const todayEnd = moment().endOf("day").toDate();
    const todayDeposit = await Deposit.findOne({
      userId: userId,
      status: "approved",
      reverted: false,
      createdAt: {
        $gte: todayStart,
        $lte: todayEnd,
      },
    });
    if (!todayDeposit) {
      return res.status(200).json({
        success: false,
        message: {
          en: "You need to make a deposit today to participate in the lucky draw",
          zh: "您需要在今天进行存款才能参与幸运抽奖",
          ms: "Anda perlu membuat deposit hari ini untuk menyertai cabutan bertuah",
        },
      });
    }
    const todayDraw = await LuckyDrawLog.findOne({
      userId: userId,
      createdAt: {
        $gte: todayStart,
        $lte: todayEnd,
      },
    });
    if (todayDraw) {
      return res.status(200).json({
        success: false,
        message: {
          en: "You have already participated in today's lucky draw",
          zh: "您今天已经参与过幸运抽奖了",
          ms: "Anda telah menyertai cabutan bertuah hari ini",
        },
      });
    }
    const promotionId = "68a8e6095b0b3524a723a8ba";
    const promotion = await Promotion.findById(promotionId);
    if (!promotion) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Promotion not found",
          zh: "找不到促销活动",
          ms: "Promosi tidak dijumpai",
        },
      });
    }
    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();
    const userAgent = req.get("User-Agent") || "Unknown";
    const selectedPrize = selectPrizeByRate();
    const newWalletBalance = user.wallet + selectedPrize.value;
    const transactionId = uuidv4();
    const hasSportPendingMatch = await checkSportPendingMatch(user.gameId);
    const isNewCycle = !hasSportPendingMatch && user.wallet <= 5;
    const bonusTransaction = new Bonus({
      transactionId: transactionId,
      userId: userId,
      username: user.username,
      fullname: user.fullname,
      transactionType: "bonus",
      processBy: "system",
      amount: selectedPrize.value,
      walletamount: user.wallet,
      status: "approved",
      method: "auto",
      remark: `Lucky Draw Prizes: ${selectedPrize.name}`,
      promotionname: promotion.maintitle,
      promotionnameEN: promotion.maintitleEN,
      promotionId: promotionId,
      isCheckinBonus: true,
      processtime: "00:00:00",
      isNewCycle: isNewCycle,
    });

    const walletLog = new UserWalletLog({
      userId: userId,
      transactionid: transactionId,
      transactiontime: new Date(),
      transactiontype: "bonus",
      amount: selectedPrize.value,
      status: "approved",
      promotionnameCN: promotion.maintitle,
      promotionnameEN: promotion.maintitleEN,
    });

    const drawLog = new LuckyDrawLog({
      userId: user._id,
      username: user.username,
      fullname: user.fullname,
      prizeName: selectedPrize.name,
      prizeValue: selectedPrize.value,
      gridPosition: selectedPrize.gridPosition,
      depositAmount: todayDeposit.amount,
      ipAddress: clientIp,
      userAgent: userAgent,
    });

    await Promise.all([
      User.findByIdAndUpdate(userId, {
        $inc: { wallet: selectedPrize.value },
      }),
      drawLog.save(),
      bonusTransaction.save(),
      walletLog.save(),
    ]);
    res.status(200).json({
      success: true,
      message: {
        en: "Lucky draw completed successfully",
        zh: "幸运抽奖完成",
        ms: "Cabutan bertuah selesai dengan jayanya",
      },
      data: {
        prize: selectedPrize,
        depositAmount: todayDeposit.amount,
        newWalletBalance: newWalletBalance,
        bonusAmount: selectedPrize.value,
      },
    });
  } catch (error) {
    console.error("Lucky Draw 9Grid Error:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Failed to complete the lucky draw",
        zh: "抽奖失败",
        ms: "Gagal untuk melengkapkan cabutan bertuah",
      },
    });
  }
});

// User Get Lucky Draw Status
router.get("/api/luckydraw9grid/status", async (req, res) => {
  try {
    let setting = await LuckyDrawSetting.findOne();
    if (!setting) {
      setting = new LuckyDrawSetting({
        isActive: true,
        updatedBy: "system",
      });
      await setting.save();
    }
    res.status(200).json({
      success: true,
      message: {
        en: "Status retrieved successfully",
        zh: "状态获取成功",
        ms: "Status berjaya diperoleh",
      },
      data: setting,
    });
  } catch (error) {
    console.error("Error getting lucky draw status:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Internal server error",
        zh: "服务器内部错误",
        ms: "Ralat dalaman pelayan",
      },
    });
  }
});

// Admin get logs
router.get(
  "/admin/api/luckydraw9grid/logs",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate, page = 1, limit = 50 } = req.query;

      const dateFilter = {};
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }

      const skip = (page - 1) * limit;

      const [logs, totalCount] = await Promise.all([
        LuckyDrawLog.find(dateFilter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        LuckyDrawLog.countDocuments(dateFilter),
      ]);

      res.status(200).json({
        success: true,
        message: {
          en: "Logs retrieved successfully",
          zh: "日志获取成功",
          ms: "Log berjaya diperoleh",
        },
        data: {
          logs,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
          },
        },
      });
    } catch (error) {
      console.error("Error getting admin logs:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
          ms: "Ralat dalaman pelayan",
        },
      });
    }
  }
);

// Admin Get Lucky Draw Status
router.get(
  "/admin/api/luckydraw9grid/status",
  authenticateAdminToken,
  async (req, res) => {
    try {
      let setting = await LuckyDrawSetting.findOne();
      if (!setting) {
        setting = new LuckyDrawSetting({
          isActive: true,
          updatedBy: "system",
        });
        await setting.save();
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Status retrieved successfully",
          zh: "状态获取成功",
          ms: "Status berjaya diperoleh",
        },
        data: setting,
      });
    } catch (error) {
      console.error("Error getting lucky draw status:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
          ms: "Ralat dalaman pelayan",
        },
      });
    }
  }
);

// Admin Toggle Lucky Draw Status
router.patch(
  "/admin/api/luckydraw9grid/status",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { isActive } = req.body;
      const adminId = req.user.userId;
      const adminuser = await adminUser.findById(adminId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin user not found",
            zh: "找不到管理员用户",
            ms: "Pengguna admin tidak dijumpai",
          },
        });
      }
      let setting = await LuckyDrawSetting.findOne();
      if (!setting) {
        setting = new LuckyDrawSetting({
          isActive: isActive,
          updatedBy: adminuser.username,
        });
      } else {
        setting.isActive = isActive;
        setting.updatedBy = adminuser.username;
      }

      await setting.save();

      res.status(200).json({
        success: true,
        message: {
          en: `Lucky Draw ${
            isActive ? "activated" : "deactivated"
          } successfully`,
          zh: `幸运抽奖已${isActive ? "激活" : "停用"}`,
          ms: `Lucky Draw berjaya ${
            isActive ? "diaktifkan" : "dinyahaktifkan"
          }`,
        },
        data: setting,
      });
    } catch (error) {
      console.error("Error updating lucky draw status:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
          ms: "Ralat dalaman pelayan",
        },
      });
    }
  }
);
module.exports = router;
