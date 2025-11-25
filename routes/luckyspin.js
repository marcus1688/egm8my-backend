const express = require("express");
const router = express.Router();
const LuckySpin = require("../models/luckyspin.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { authenticateToken } = require("../auth/auth");
const { adminUser } = require("../models/adminuser.model");
const LuckySpinLog = require("../models/luckyspinlog.model");
const { User } = require("../models/users.model");
const { updateKioskBalance } = require("../services/kioskBalanceService");
const kioskbalance = require("../models/kioskbalance.model");
const moment = require("moment");
const { checkSportPendingMatch } = require("../helpers/turnoverHelper");
const { v4: uuidv4 } = require("uuid");
const UserWalletLog = require("../models/userwalletlog.model");
const Bonus = require("../models/bonus.model");
const LuckySpinSetting = require("../models/luckyspinsetting.model");
const Promotion = require("../models/promotion.model");

async function getLuckySpinPointRate() {
  try {
    const setting = await LuckySpinSetting.findOne();
    return setting ? setting.depositAmount : 100;
  } catch (error) {
    console.error("Error fetching lucky spin setting:", error);
    return 100;
  }
}

// Start Spin
router.post("/api/luckySpinStartGame", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found, please contact customer service",
          zh: "找不到用户,请联系客服",
          ms: "Pengguna tidak dijumpai, sila hubungi khidmat pelanggan",
        },
      });
    }

    const promotion = await Promotion.findById(global.LUCKY_SPIN_PROMOTION_ID);
    const pointsPerSpin = await getLuckySpinPointRate();

    if (user.luckySpinPoints < pointsPerSpin) {
      return res.status(200).json({
        success: false,
        message: {
          en: `You need at least ${pointsPerSpin} points to spin`,
          zh: `您需要至少${pointsPerSpin}积分才能转动转盘`,
          ms: `Anda memerlukan sekurang-kurangnya ${pointsPerSpin} mata untuk memutar`,
        },
      });
    }

    const pointsBeforeSpin = user.luckySpinPoints;

    let allProbabilitySlots = [];
    let selectedPrizes;

    if (
      user.luckySpinSetting?.settings &&
      user.luckySpinSetting.remainingCount > 0
    ) {
      selectedPrizes = user.luckySpinSetting.settings;
      selectedPrizes.forEach((prize) => {
        for (let i = 0; i < prize.probability; i++) {
          allProbabilitySlots.push(prize);
        }
      });
      user.luckySpinSetting.remainingCount -= 1;
    } else {
      const defaultPrizes = await LuckySpin.find();
      defaultPrizes.forEach((prize) => {
        for (let i = 0; i < prize.probability; i++) {
          allProbabilitySlots.push(prize);
        }
      });
    }

    for (let i = allProbabilitySlots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allProbabilitySlots[i], allProbabilitySlots[j]] = [
        allProbabilitySlots[j],
        allProbabilitySlots[i],
      ];
    }

    const randomIndex = Math.floor(Math.random() * allProbabilitySlots.length);
    const selectedPrize = allProbabilitySlots[randomIndex];
    const pointsAfterSpin = pointsBeforeSpin - pointsPerSpin;
    const transactionId = uuidv4();

    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      {
        $inc: {
          wallet: selectedPrize.value,
          luckySpinPoints: -pointsPerSpin,
        },
      },
      { new: true }
    );

    const spinLog = new LuckySpinLog({
      playerusername: user.username,
      playerfullname: user.fullname,
      winning: selectedPrize.value,
      beforefreespin: pointsBeforeSpin,
      afterfreespin: pointsAfterSpin,
    });

    const kioskSettings = await kioskbalance.findOne({});
    if (kioskSettings && kioskSettings.status && selectedPrize.value > 0) {
      const kioskResult = await updateKioskBalance(
        "subtract",
        selectedPrize.value,
        {
          username: user.username,
          transactionType: "lucky spin",
          remark: `Lucky Spin - ${selectedPrize.name}`,
          processBy: "system",
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

    if (selectedPrize.value > 0) {
      const hasSportPendingMatch = await checkSportPendingMatch(user.gameId);
      const isNewCycle = !hasSportPendingMatch && user.wallet <= 5;

      const NewBonusTransaction = new Bonus({
        transactionId: transactionId,
        userId: user._id,
        username: user.username,
        fullname: user.fullname,
        transactionType: "bonus",
        processBy: "System",
        amount: selectedPrize.value,
        walletamount: user.wallet,
        status: "approved",
        method: "auto",
        remark: `Lucky Spin - ${selectedPrize.name}`,
        promotionname: promotion?.maintitle || "幸运转盘",
        promotionnameEN: promotion?.maintitleEN || "Lucky Spin",
        promotionId: global.LUCKY_SPIN_PROMOTION_ID,
        processtime: "00:00:00",
        isNewCycle: isNewCycle,
      });

      const walletLog = new UserWalletLog({
        userId: user._id,
        transactionid: transactionId,
        transactiontime: new Date(),
        transactiontype: "bonus",
        amount: selectedPrize.value,
        status: "approved",
        promotionnameEN: `Lucky Spin - ${selectedPrize.name}`,
        promotionnameCN: `幸运转盘 - ${selectedPrize.name}`,
      });

      await Promise.all([
        user.save(),
        spinLog.save(),
        NewBonusTransaction.save(),
        walletLog.save(),
      ]);
    } else {
      await Promise.all([user.save(), spinLog.save()]);
    }

    res.status(200).json({
      success: true,
      prize: selectedPrize,
      message: {
        en: "Spin successful",
        zh: "转盘成功",
        ms: "Putaran berjaya",
      },
    });
  } catch (error) {
    console.error("Lucky Spin Error:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Failed to spin the wheel",
        zh: "转盘失败",
        ms: "Gagal untuk memutar roda",
      },
    });
  }
});

// Get Big Winner List
router.get("/api/UserLuckySpinLog", async (req, res) => {
  try {
    const luckyspinlog = await LuckySpinLog.find({
      winning: { $gt: 0 },
    })
      .select("playerusername createdAt")
      .sort({ createdAt: -1 })
      .limit(20);
    const processedData = luckyspinlog.map((log) => {
      let username = log.playerusername;
      if (username.startsWith("6")) {
        username = username.substring(1);
      }
      if (username.length > 6) {
        username =
          username.substring(0, 3) +
          "****" +
          username.substring(username.length - 3);
      }
      return {
        playerusername: username,
        createdAt: log.createdAt,
      };
    });
    res.json({ success: true, data: processedData });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Lucky Spin Point Rate Setting
router.get("/api/getLuckySpinPointRate", async (req, res) => {
  try {
    const pointRate = await getLuckySpinPointRate();
    res.json({
      success: true,
      pointsPerSpin: pointRate,
    });
  } catch (error) {
    console.error("Error fetching point rate:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch point rate",
    });
  }
});

// Get My Lucky Spin Log (User's own records)
router.get("/api/MyLuckySpinLog", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: {
          en: "User not found",
          zh: "找不到用户",
          ms: "Pengguna tidak dijumpai",
        },
      });
    }
    const mySpinLogs = await LuckySpinLog.find({
      playerusername: user.username,
    })
      .select("winning createdAt")
      .sort({ createdAt: -1 })
      .limit(50);
    const processedData = mySpinLogs.map((log) => ({
      amount: parseFloat(log.winning),
      createdAt: log.createdAt,
    }));

    res.json({
      success: true,
      data: processedData,
    });
  } catch (error) {
    console.error("Error fetching my lucky spin logs:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Failed to fetch spin records",
        zh: "获取转盘记录失败",
        ms: "Gagal mendapatkan rekod pusingan",
      },
    });
  }
});

// Admin Get Lucky Spin Log
router.get(
  "/admin/api/getLuckySpinLog",
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
      const luckyspinlog = await LuckySpinLog.find({
        ...dateFilter,
      }).sort({ createdAt: -1 });
      res.json({ success: true, luckyspinlog });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Admin Create Lucky Spin
router.post(
  "/admin/api/createLuckySpin",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { name, angle, probability, value } = req.body;
      if (
        !name ||
        angle === undefined ||
        probability === undefined ||
        value === undefined
      ) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Missing required fields",
            zh: "缺少必填字段",
          },
        });
      }
      const newLuckySpin = new LuckySpin({
        name,
        angle,
        probability,
        value,
      });
      const savedLuckySpin = await newLuckySpin.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Lucky spin prize created successfully",
          zh: "幸运转盘奖品创建成功",
        },
        data: savedLuckySpin,
      });
    } catch (error) {
      console.error("Error creating LuckySpin:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error creating lucky spin prize",
          zh: "创建幸运转盘奖品时出错",
        },
      });
    }
  }
);

// Admin Update Lucky Spin Data
router.put(
  "/admin/api/updateLuckySpin/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, angle, probability, value } = req.body;
      if (
        !name ||
        angle === undefined ||
        probability === undefined ||
        value === undefined
      ) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Missing required fields",
            zh: "缺少必填字段",
          },
        });
      }
      const updatedPrize = await LuckySpin.findByIdAndUpdate(
        id,
        { name, angle, probability, value },
        { new: true }
      );
      if (!updatedPrize) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Prize not found",
            zh: "找不到奖品",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Prize updated successfully",
          zh: "奖品更新成功",
        },
        data: updatedPrize,
      });
    } catch (error) {
      console.error("Error updating LuckySpin:", error);
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

// Admin Update User Lucky Spin Points
router.put(
  "/admin/api/updateUserLuckySpinPoints/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { points } = req.body;
      const updatedUser = await User.findByIdAndUpdate(userId, {
        luckySpinPoints: points,
      });
      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      res.json({
        success: true,
      });
    } catch (error) {
      console.error("Error updating lucky spin points:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Admin Update User Lucky Spin Count
router.put(
  "/admin/api/updateUserLuckySpinCount/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { count } = req.body;
      const updatedUser = await User.findByIdAndUpdate(userId, {
        luckySpinCount: count,
      });
      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      res.json({
        success: true,
      });
    } catch (error) {
      console.error("Error updating lucky spin count:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Admin Get Lucky Spin Data
router.get(
  "/admin/api/getLuckySpin",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const prizes = await LuckySpin.find().sort({ angle: 1 });
      res.json({ success: true, prizes });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Admin Update Specific User Lucky Spin Probability
router.post(
  "/admin/api/setUserLuckySpinSetting/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { settings, remainingCount } = req.body;
      const { userId } = req.params;
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            luckySpinSetting: {
              settings: settings,
              remainingCount: remainingCount,
            },
          },
        },
        { new: true }
      );
      if (!updatedUser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Lucky spin settings updated successfully",
          zh: "幸运转盘设置更新成功",
        },
        data: updatedUser.luckySpinSetting,
      });
    } catch (error) {
      console.error("Error updating lucky spin settings:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating lucky spin settings",
          zh: "更新幸运转盘设置时出错",
        },
      });
    }
  }
);

// Admin Get Specific User Lucky Spin Setting
router.get(
  "/admin/api/getUserLuckySpinSetting/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      res.json({
        success: true,
        data: user.luckySpinSetting || [],
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// Admin Delete Lucky Spin
router.delete(
  "/admin/api/luckySpin/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const deletedLuckySpin = await LuckySpin.findByIdAndDelete(req.params.id);
      if (!deletedLuckySpin) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Prize not found",
            zh: "找不到奖品",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Prize deleted successfully",
          zh: "奖品删除成功",
        },
      });
    } catch (error) {
      console.error("Error deleting LuckySpin:", error);
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
