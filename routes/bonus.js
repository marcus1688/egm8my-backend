const express = require("express");
const moment = require("moment");
const router = express.Router();
const { authenticateToken, authenticateBothToken } = require("../auth/auth");
const Bonus = require("../models/bonus.model");
const { User } = require("../models/users.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { adminUser } = require("../models/adminuser.model");
const { v4: uuidv4 } = require("uuid");
const UserWalletLog = require("../models/userwalletlog.model");
const Promotion = require("../models/promotion.model");
const vip = require("../models/vip.model");
const { checkSportPendingMatch } = require("../helpers/turnoverHelper");
const { mega888CheckBalance } = require("./GAMEAPI/slot_mega888");
const { kiss918CheckBalance } = require("./GAMEAPI/slot_918kiss");
const { huaweiCheckBalance } = require("./GAMEAPI/other_huaweilottery");
//this need change useing createdAt time
const calculateCountdown = (createdAt) => {
  // //   const now = moment.utc().add(8, "hours"); // GMT+8 timezone
  const nextDay = moment(createdAt)
    .utc()
    .add(8, "hours")
    .add(1, "month")
    .startOf("month");

  // const nextDay = moment.utc().add(8, "hours").add(5, "seconds");

  return nextDay.toDate();
};

const calculateWeeklyCountdown = (createdAt) => {
  const createdTime = moment(createdAt).utc().add(8, "hours");
  let nextMonday;

  if (createdTime.day() === 1) {
    nextMonday = createdTime.clone().startOf("day").add(7, "days");
  } else {
    nextMonday = createdTime.clone().startOf("isoWeek").add(1, "week");
  }

  return nextMonday.toDate();
};

async function getTotalGameBalance(user) {
  const GAME_CHECKERS = [
    { name: "MEGA888", checker: mega888CheckBalance },
    { name: "918KISS", checker: kiss918CheckBalance },
    { name: "GRANDDRAGON", checker: huaweiCheckBalance },
  ];

  const results = await Promise.all(
    GAME_CHECKERS.map(({ name, checker }) =>
      checker(user)
        .then((result) => ({ name, success: true, ...result }))
        .catch((error) => ({
          name,
          success: false,
          error: error.message || "Connection failed",
          balance: 0,
        }))
    )
  );

  const errors = {};
  const totalBalance = results.reduce((total, result) => {
    if (result.success && result.balance != null) {
      return total + (Number(result.balance) || 0);
    }

    console.error(`${result.name} balance check error:`, result);
    errors[result.name.toLowerCase()] = {
      error: result.error || "Failed to fetch balance",
    };
    return total;
  }, 0);

  return { totalBalance, errors };
}

// Customer Submit Bonus
router.post(
  "/api/client/submitdepositbonus",
  authenticateToken,
  async (req, res) => {
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
      const { promotionId, depositAmount, depositId } = req.body;
      if (!promotionId) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion ID is required",
            zh: "需要促销活动ID",
            ms: "ID promosi diperlukan",
          },
        });
      }
      const promotion = await Promotion.findById(promotionId);
      if (!promotion) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion not found",
            zh: "找不到该促销活动",
            ms: "Promosi tidak dijumpai",
          },
        });
      }

      let bonusAmount;
      let bonusPercentage = promotion.bonuspercentage;

      if (
        promotion.maintitleEN === "Unlimited Bonus" ||
        promotion.maintitle === "无限存款"
      ) {
        const vipSettings = await vip.findOne();

        if (vipSettings && user.viplevel) {
          const vipLevelData = vipSettings.vipLevels.find(
            (level) => level.name === user.viplevel.toString()
          );

          if (
            vipLevelData &&
            vipLevelData.benefits.has("Unlimited Deposit Bonus")
          ) {
            const unlimitedBonusValue = vipLevelData.benefits.get(
              "Unlimited Deposit Bonus"
            );
            bonusPercentage = parseFloat(unlimitedBonusValue) || 0;
          } else {
            bonusPercentage = 0;
          }
        } else {
          bonusPercentage = 0;
        }
      }

      if (promotion.claimtype === "Percentage") {
        bonusAmount = (depositAmount * parseFloat(bonusPercentage)) / 100;
        if (promotion.maxbonus > 0 && bonusAmount > promotion.maxbonus) {
          bonusAmount = promotion.maxbonus;
        }
      } else if (promotion.claimtype === "Exact") {
        bonusAmount = parseFloat(promotion.bonusexact);
        if (promotion.maxbonus > 0 && bonusAmount > promotion.maxbonus) {
          bonusAmount = promotion.maxbonus;
        }
      } else {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid promotion claim type",
            zh: "无效的促销领取类型",
          },
        });
      }

      const transactionId = uuidv4();

      const { totalBalance: totalGameBalance, errors: balanceFetchErrors } =
        await getTotalGameBalance(user);

      if (Object.keys(balanceFetchErrors).length > 0) {
        console.log("Some game balance checks failed:", balanceFetchErrors);
      }

      const totalWalletAmount = Number(user.wallet || 0) + totalGameBalance;
      const hasSportPendingMatch = await checkSportPendingMatch(user.gameId);
      const isNewCycle = !hasSportPendingMatch && user.wallet <= 5;
      const NewBonusTransaction = new Bonus({
        transactionId: transactionId,
        userId: userId,
        username: user.username,
        fullname: user.fullname,
        transactionType: "bonus",
        processBy: "admin",
        amount: bonusAmount,
        walletamount: totalWalletAmount,
        status: "pending",
        method: "manual",
        remark: "-",
        promotionname: promotion.maintitle,
        promotionnameEN: promotion.maintitleEN,
        promotionId: promotionId,
        depositId,
        duplicateIP: user.duplicateIP,
        isNewCycle: isNewCycle,
      });
      await NewBonusTransaction.save();
      const walletLog = new UserWalletLog({
        userId: userId,
        transactionid: NewBonusTransaction.transactionId,
        transactiontime: new Date(),
        transactiontype: "bonus",
        amount: bonusAmount,
        status: "pending",
        promotionnameCN: promotion.maintitle,
        promotionnameEN: promotion.maintitleEN,
      });
      await walletLog.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Bonus submitted successfully",
          zh: "奖金提交成功",
          ms: "Bonus berjaya dihantar",
        },
      });
    } catch (error) {
      console.error("Error during submit bonus:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to submit bonus",
          zh: "奖金提交失败",
          ms: "Gagal menghantar bonus",
        },
      });
    }
  }
);

// Admin Submit Deposit Bonus
router.post(
  "/admin/api/submitdepositbonus",
  authenticateAdminToken,
  async (req, res) => {
    try {
      console.log(req.body);
      const adminId = req.user.userId;
      const adminuser = await adminUser.findById(adminId);
      if (!adminuser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin User not found, please contact customer service",
            zh: "找不到管理员用户，请联系客服",
          },
        });
      }
      const { userid, username, promotionId, depositId, depositAmount } =
        req.body;
      if (!userid || !username || !promotionId) {
        return res.status(200).json({
          success: false,
          message: {
            en: "All fields are required",
            zh: "所有字段都是必填的",
          },
        });
      }
      const user = await User.findById(userid);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      const promotion = await Promotion.findById(promotionId);
      if (!promotion) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion not found",
            zh: "找不到促销活动",
          },
        });
      }
      let bonusAmount;
      if (promotion.claimtype === "Percentage") {
        bonusAmount =
          (depositAmount * parseFloat(promotion.bonuspercentage)) / 100;
        if (promotion.maxbonus > 0 && bonusAmount > promotion.maxbonus) {
          bonusAmount = promotion.maxbonus;
        }
      } else if (promotion.claimtype === "Exact") {
        bonusAmount = parseFloat(promotion.bonusexact);
        if (promotion.maxbonus > 0 && bonusAmount > promotion.maxbonus) {
          bonusAmount = promotion.maxbonus;
        }
      } else {
        return res.status(200).json({
          success: false,
          message: {
            en: "Invalid promotion claim type",
            zh: "无效的促销领取类型",
          },
        });
      }
      const transactionId = uuidv4();

      const { totalBalance: totalGameBalance, errors: balanceFetchErrors } =
        await getTotalGameBalance(user);

      if (Object.keys(balanceFetchErrors).length > 0) {
        console.log("Some game balance checks failed:", balanceFetchErrors);
      }

      const totalWalletAmount = Number(user.wallet || 0) + totalGameBalance;
      const hasSportPendingMatch = await checkSportPendingMatch(user.gameId);
      const isNewCycle = !hasSportPendingMatch && user.wallet <= 5;
      const NewBonusTransaction = new Bonus({
        transactionId: transactionId,
        userId: userid,
        username: user.username,
        fullname: user.fullname,
        transactionType: "bonus",
        processBy: "admin",
        amount: bonusAmount,
        walletamount: totalWalletAmount,
        status: "pending",
        method: "manual",
        remark: "CS",
        promotionname: promotion.maintitle,
        promotionnameEN: promotion.maintitleEN,
        promotionId: promotion._id,
        depositId,
        duplicateIP: user.duplicateIP,
        isNewCycle: isNewCycle,
      });
      await NewBonusTransaction.save();
      const walletLog = new UserWalletLog({
        userId: userid,
        transactionid: NewBonusTransaction.transactionId,
        transactiontime: new Date(),
        transactiontype: "bonus",
        amount: bonusAmount,
        status: "pending",
        promotionnameCN: promotion.maintitle,
        promotionnameEN: promotion.maintitleEN,
      });
      await walletLog.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Bonus submitted successfully",
          zh: "奖金提交成功",
        },
      });
    } catch (error) {
      console.error("Error during submit bonus:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error submitting bonus",
          zh: "提交奖金时出错",
        },
        error: error.toString(),
      });
    }
  }
);

// Admin Submit Bonus
router.post("/admin/api/bonus", authenticateAdminToken, async (req, res) => {
  try {
    const adminId = req.user.userId;
    const adminuser = await adminUser.findById(adminId);
    if (!adminuser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Admin User not found, please contact customer service",
          zh: "找不到管理员用户，请联系客服",
        },
      });
    }

    const { userid, username, bankid, amount } = req.body;
    if (!userid || !username || !bankid || !amount) {
      return res.status(200).json({
        success: false,
        message: {
          en: "All fields are required",
          zh: "所有字段都是必填的",
        },
      });
    }

    const user = await User.findById(userid);
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found",
          zh: "找不到用户",
        },
      });
    }

    const promotionData = await Promotion.findById(bankid);
    if (!promotionData) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Promotion not found",
          zh: "找不到促销活动",
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
        const monthStart = malaysiaNow.clone().startOf("month").utc().toDate();
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

    if (promotionData.claimcount !== 0) {
      const bonusCount = await Bonus.countDocuments({
        userId: userid,
        promotionId: bankid,
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
    }

    const transactionId = uuidv4();
    const hasSportPendingMatch = await checkSportPendingMatch(user.gameId);
    const isNewCycle = !hasSportPendingMatch && user.wallet <= 5;
    const NewBonusTransaction = new Bonus({
      transactionId: transactionId,
      userId: userid,
      username: user.username,
      fullname: user.fullname,
      transactionType: "bonus",
      processBy: "admin",
      amount: amount,
      walletamount: user.wallet,
      status: "pending",
      method: "manual",
      remark: "CS",
      promotionname: promotionData.maintitle,
      promotionnameEN: promotionData.maintitleEN,
      promotionId: promotionData._id,
      duplicateIP: user.duplicateIP,
      duplicateBank: user.duplicateBank,
      isNewCycle: isNewCycle,
    });
    await NewBonusTransaction.save();

    const walletLog = new UserWalletLog({
      userId: userid,
      transactionid: NewBonusTransaction.transactionId,
      transactiontime: new Date(),
      transactiontype: "bonus",
      amount: amount,
      status: "pending",
      promotionnameCN: promotionData.maintitle,
      promotionnameEN: promotionData.maintitleEN,
    });
    await walletLog.save();

    res.status(200).json({
      success: true,
      message: {
        en: "Bonus submitted successfully",
        zh: "奖金提交成功",
      },
    });
  } catch (error) {
    console.error("Error during submit bonus:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Error submitting bonus",
        zh: "提交奖金时出错",
      },
      error: error.toString(),
    });
  }
});

// Admin Get User Bonus Logs
router.get(
  "/admin/api/user/:userId/bonuses",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(400).json({
          success: false,
          message: "User ID is required",
        });
      }

      const { startDate, endDate } = req.query;

      const dateFilter = {
        username: user.username,
      };
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }

      const bonuses = await Bonus.find(dateFilter)
        .sort({ createdAt: -1 })
        .lean();
      res.status(200).json({
        success: true,
        message: "Bonus history retrieved successfully",
        data: bonuses,
      });
    } catch (error) {
      console.error("Error retrieving user bonus history:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve bonus history",
        error: error.message,
      });
    }
  }
);

//获取当前用户的promotion的history
router.get(
  "/api/userpromotionhistory/:userId",
  authenticateToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res.status(200).json({ message: "缺少用户ID参数。" });
      }

      // 从数据库中查找所有与该用户相关的优惠申请记录
      const userBonuses = await Bonus.find({ userId }).sort({ createdAt: -1 });

      res.status(200).json({ authorized: true, userBonuses });
    } catch (error) {
      console.error("获取用户优惠申请历史时发生错误:", error);
      res.status(200).json({
        message: "获取用户优惠申请历史时出错。",
        error: error.toString(),
      });
    }
  }
);

// 只是獲取APPROVED OR REJECTED的Bonus數據而已
router.get("/api/filterbonus", async (req, res) => {
  try {
    const bonus = await Bonus.find({
      $or: [{ status: "APPROVED" }, { status: "REJECTED" }],
    });
    res.status(200).json({
      authorized: true,
      message: "Bonus fetched successfully",
      data: bonus,
    });
  } catch (error) {
    console.error("Error fetching Bonus", error);
    res
      .status(200)
      .json({ message: "Error fetching Bonus", error: error.toString() });
  }
});

module.exports = router;
