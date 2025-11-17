const express = require("express");
const router = express.Router();
const Checkin = require("../models/checkin.model");
const { User } = require("../models/users.model");
const { authenticateToken } = require("../auth/auth");
const { authenticateAdminToken } = require("../auth/adminAuth");
const moment = require("moment-timezone");
const vip = require("../models/vip.model");
const Bonus = require("../models/bonus.model");
const UserWalletLog = require("../models/userwalletlog.model");
const Promotion = require("../models/promotion.model");
const { v4: uuidv4 } = require("uuid");
const cron = require("node-cron");

const getMalaysiaTime = () => moment().tz("Asia/Kuala_Lumpur");

// Helper function to check if user completed a full week (Monday-Sunday)
const checkWeeklyCompletion = (monthlyCheckIns) => {
  const malaysiaTime = getMalaysiaTime();
  const past7Days = [];

  // 获取过去7天的所有签到记录
  for (let i = 6; i >= 0; i--) {
    const date = malaysiaTime.clone().subtract(i, "days");
    const month = date.month();
    const day = date.date();

    const monthCheckIns = monthlyCheckIns[month] || [];
    if (monthCheckIns.includes(day)) {
      past7Days.push(date);
    }
  }

  // 必须有连续7天的签到
  if (past7Days.length !== 7) return false;

  // 检查是否是连续的7天
  for (let i = 1; i < past7Days.length; i++) {
    const diff = past7Days[i].diff(past7Days[i - 1], "days");
    if (diff !== 1) return false; // 不连续
  }

  // 检查第一天是 Monday (1)，最后一天是 Sunday (0)
  return past7Days[0].day() === 1 && past7Days[6].day() === 0;
};

// Helper function to check if user completed entire month
const checkMonthlyCompletion = (monthlyCheckIns, month, year) => {
  const checkIns = monthlyCheckIns[month] || [];
  const daysInMonth = moment
    .tz(`${year}-${month + 1}`, "YYYY-MM", "Asia/Kuala_Lumpur")
    .daysInMonth();

  return checkIns.length === daysInMonth;
};

// Helper function to get user's daily turnover
const getUserDailyTurnover = async (userId) => {
  const malaysiaTime = getMalaysiaTime();
  const startOfDay = malaysiaTime.clone().startOf("day").toDate();
  const endOfDay = malaysiaTime.clone().endOf("day").toDate();

  const user = await User.findById(userId);
  if (!user) return 0;

  // Calculate today's turnover from user's turnover history or transaction logs
  // You'll need to implement this based on your turnover tracking system
  // This is a placeholder - adjust according to your actual implementation
  const todayTurnover = user.todayTurnover || 100; // Assuming you track daily turnover

  return todayTurnover;
};

// Function to distribute pending rewards
const distributeCheckinRewards = async () => {
  try {
    const malaysiaTime = getMalaysiaTime();
    console.log(
      `Starting check-in reward distribution at: ${malaysiaTime.toISOString()}`
    );

    const allCheckins = await Checkin.find({
      "pendingRewards.distributed": false,
      "pendingRewards.scheduledDistribution": {
        $lte: malaysiaTime.toDate(),
      },
    });

    const [vipSettings, promotion] = await Promise.all([
      vip.findOne({}),
      Promotion.findById(global.DAILY_CHECK_IN_PROMOTION_ID),
    ]);

    if (!vipSettings) {
      console.error("VIP settings not found");
      return;
    }

    if (!promotion) {
      console.error("Daily check-in promotion not found");
      return;
    }

    let distributedCount = 0;
    let errorCount = 0;

    for (const checkin of allCheckins) {
      try {
        const user = await User.findById(checkin.userId);
        if (!user) {
          console.error(`User not found for checkin: ${checkin.userId}`);
          continue;
        }

        // Get user's VIP level rewards
        const userVipLevel = vipSettings.vipLevels.find(
          (level) => level.name === user.viplevel
        );

        if (!userVipLevel) {
          console.error(
            `VIP level not found for user: ${user.username} (${user.viplevel})`
          );
          continue;
        }

        for (const reward of checkin.pendingRewards) {
          if (reward.distributed) continue;
          if (moment(reward.scheduledDistribution).isAfter(malaysiaTime))
            continue;

          let rewardAmount = 0;
          let rewardNameEN = "";
          let rewardNameCN = "";

          // Get reward based on type
          if (reward.rewardType === "daily") {
            rewardAmount = parseFloat(
              userVipLevel.benefits.get("Daily Rewards") || 0
            );
            rewardNameEN = "Daily Check-In Reward";
            rewardNameCN = "每日签到奖励";
          } else if (reward.rewardType === "weekly") {
            rewardAmount = parseFloat(
              userVipLevel.benefits.get("Weekly Rewards") || 0
            );
            rewardNameEN = "Weekly Check-In Reward";
            rewardNameCN = "每周签到奖励";
          } else if (reward.rewardType === "monthly") {
            rewardAmount = parseFloat(
              userVipLevel.benefits.get("Monthly Rewards") || 0
            );
            rewardNameEN = "Monthly Check-In Reward";
            rewardNameCN = "每月签到奖励";
          }

          if (rewardAmount <= 0) {
            reward.distributed = true;
            console.log(
              `No reward amount for ${user.username} - ${reward.rewardType}`
            );
            continue;
          }

          // Create bonus transaction
          const transactionId = uuidv4();
          const bonus = new Bonus({
            transactionId: transactionId,
            userId: user._id,
            username: user.username,
            fullname: user.fullname,
            transactionType: "bonus",
            processBy: "System",
            amount: rewardAmount,
            walletamount: user.wallet + rewardAmount,
            status: "approved",
            method: "auto",
            remark: rewardNameEN,
            promotionname: promotion.maintitle || "每日签到",
            promotionnameEN: promotion.maintitleEN || "Daily Check-In",
            promotionId: global.DAILY_CHECK_IN_PROMOTION_ID,
            processtime: "00:00:00",
          });

          // Update user wallet
          user.wallet += rewardAmount;

          // Create wallet log
          const walletLog = new UserWalletLog({
            userId: user._id,
            transactionid: transactionId,
            transactiontime: new Date(),
            transactiontype: "bonus",
            amount: rewardAmount,
            status: "approved",
            promotionnameEN: rewardNameEN,
            promotionnameCN: rewardNameCN,
          });

          await Promise.all([bonus.save(), user.save(), walletLog.save()]);

          reward.distributed = true;
          distributedCount++;
          console.log(
            `Distributed ${rewardAmount} to ${user.username} (${reward.rewardType})`
          );
        }

        checkin.markModified("pendingRewards");
        await checkin.save();
      } catch (userError) {
        errorCount++;
        console.error(
          `Error processing checkin for user ${checkin.userId}:`,
          userError
        );
      }
    }

    console.log(
      `Check-in reward distribution completed at: ${getMalaysiaTime().toISOString()}. Distributed: ${distributedCount}, Errors: ${errorCount}`
    );
  } catch (error) {
    console.error("Check-in reward distribution error:", error);
  }
};

// Helper function to get next run time
const getNextRunTime = (hour, minute) => {
  const now = getMalaysiaTime();
  let nextRun = getMalaysiaTime().set({
    hour,
    minute,
    second: 0,
    millisecond: 0,
  });

  if (nextRun.isBefore(now)) {
    nextRun.add(1, "day");
  }

  return nextRun.format("YYYY-MM-DD HH:mm:ss");
};

// Schedule check-in reward distribution at 1 AM daily
if (process.env.NODE_ENV !== "development") {
  cron.schedule(
    "0 1 * * *",
    async () => {
      console.log(
        `Starting check-in reward distribution at: ${getMalaysiaTime().toISOString()}`
      );
      try {
        await distributeCheckinRewards();
      } catch (error) {
        console.error(
          `Check-in reward distribution error at ${getMalaysiaTime().toISOString()}:`,
          error
        );
      }
    },
    {
      scheduled: true,
      timezone: "Asia/Kuala_Lumpur",
    }
  );
  console.log(
    `Check-in reward distribution job scheduled for 1:00 AM (Asia/Kuala_Lumpur). Next run: ${getNextRunTime(
      1,
      0
    )}`
  );
}

// Check-in endpoint

router.post("/api/checkin", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const malaysiaTime = getMalaysiaTime();
    const malaysiaMidnight = malaysiaTime.clone().startOf("day");

    let [checkin, user, vipSettings] = await Promise.all([
      Checkin.findOne({ userId }),
      User.findById(userId),
      vip.findOne({}),
    ]);

    if (!checkin) {
      checkin = new Checkin({ userId });
    }

    // Check if already checked in today
    const lastCheckInDate = checkin.lastCheckIn
      ? moment(checkin.lastCheckIn).tz("Asia/Kuala_Lumpur")
      : null;

    if (
      lastCheckInDate &&
      lastCheckInDate.isSameOrAfter(malaysiaMidnight, "day")
    ) {
      return res.status(200).json({
        success: false,
        message: {
          en: "You have already checked in today",
          zh: "您今天已经签到过了",
          ms: "Anda telah mendaftar masuk hari ini",
        },
      });
    }

    // Check if user has made first deposit
    if (!user.firstDepositDate) {
      return res.status(200).json({
        success: false,
        message: {
          en: "You need to make a deposit before checking in",
          zh: "您需要先充值才能签到",
          ms: "Anda perlu membuat deposit sebelum mendaftar masuk",
        },
      });
    }

    // Check if user has 100 turnover today
    const todayTurnover = await getUserDailyTurnover(userId);
    if (todayTurnover < 100) {
      return res.status(200).json({
        success: false,
        message: {
          en: `You need at least 100 turnover today to check in. Current turnover: ${todayTurnover.toFixed(
            2
          )}`,
          zh: `您今天需要至少100流水才能签到。当前流水：${todayTurnover.toFixed(
            2
          )}`,
          ms: `Anda memerlukan sekurang-kurangnya 100 turnover hari ini untuk mendaftar masuk. Turnover semasa: ${todayTurnover.toFixed(
            2
          )}`,
        },
      });
    }

    // Calculate streak
    const diffDays = lastCheckInDate
      ? malaysiaTime.diff(lastCheckInDate.clone().startOf("day"), "days")
      : null;

    if (!lastCheckInDate || diffDays > 1) {
      // Streak broken or first check-in
      checkin.currentStreak = 1;
    } else if (diffDays === 1) {
      // Consecutive day
      checkin.currentStreak += 1;
    }

    // Update monthly check-ins
    const month = malaysiaTime.month();
    const day = malaysiaTime.date();
    const year = malaysiaTime.year();

    if (!checkin.monthlyCheckIns) {
      checkin.monthlyCheckIns = {};
    }
    if (!checkin.monthlyCheckIns[month]) {
      checkin.monthlyCheckIns[month] = [];
    }
    if (!checkin.monthlyCheckIns[month].includes(day)) {
      checkin.monthlyCheckIns[month].push(day);
      checkin.monthlyCheckIns[month].sort((a, b) => a - b);
    }

    // Check for weekly and monthly completion
    const isWeeklyComplete = checkWeeklyCompletion(checkin.monthlyCheckIns);
    const isMonthlyComplete = checkMonthlyCompletion(
      checkin.monthlyCheckIns,
      month,
      year
    );

    // Get user's VIP level rewards
    let rewardAmount = 0;
    let rewardType = "daily";

    if (vipSettings) {
      const userVipLevel = vipSettings.vipLevels.find(
        (level) => level.name === user.viplevel
      );

      if (userVipLevel) {
        if (isMonthlyComplete) {
          rewardAmount = parseFloat(
            userVipLevel.benefits.get("Monthly Rewards") || 0
          );
          rewardType = "monthly";
        } else if (isWeeklyComplete) {
          rewardAmount = parseFloat(
            userVipLevel.benefits.get("Weekly Rewards") || 0
          );
          rewardType = "weekly";
        } else {
          rewardAmount = parseFloat(
            userVipLevel.benefits.get("Daily Rewards") || 0
          );
          rewardType = "daily";
        }
      }
    }

    // Create pending reward (to be distributed at 1 AM next day)
    const pendingReward = {
      date: malaysiaTime.toDate(),
      rewardType: rewardType,
      amount: rewardAmount,
      distributed: false,
      scheduledDistribution: malaysiaTime
        .clone()
        .add(1, "day")
        .startOf("day")
        .add(1, "hour")
        .toDate(),
    };

    if (!checkin.pendingRewards) {
      checkin.pendingRewards = [];
    }
    checkin.pendingRewards.push(pendingReward);

    // Update check-in data
    checkin.username = user.username;
    checkin.lastCheckIn = malaysiaTime.toDate();
    checkin.totalCheckins += 1;
    checkin.markModified("monthlyCheckIns");
    checkin.markModified("pendingRewards");
    await checkin.save();

    res.status(200).json({
      success: true,
      message: {
        en: "Check-in successful! Your reward will be distributed tomorrow at 1 AM.",
        zh: "签到成功！您的奖励将在明天凌晨1点发放。",
        ms: "Daftar masuk berjaya! Ganjaran anda akan diagihkan esok pada 1 Pagi.",
      },
      checkInData: {
        currentStreak: checkin.currentStreak,
        lastCheckIn: checkin.lastCheckIn,
        monthlyCheckIns: checkin.monthlyCheckIns,
      },
      isWeeklyComplete,
      isMonthlyComplete,
    });
  } catch (error) {
    console.error("Check-in error:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Failed to check in. Please try again",
        zh: "签到失败，请重试",
        ms: "Gagal mendaftar masuk. Sila cuba lagi",
      },
    });
  }
});

// Get check-in status
router.get("/api/checkin/status", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const malaysiaTime = getMalaysiaTime();
    const malaysiaMidnight = malaysiaTime.clone().startOf("day");

    let checkin = await Checkin.findOne({ userId });
    if (!checkin) {
      checkin = new Checkin({ userId });
      await checkin.save();
    }

    const lastCheckInDate = checkin.lastCheckIn
      ? moment.tz(checkin.lastCheckIn, "Asia/Kuala_Lumpur")
      : null;

    const hasCheckedInToday =
      lastCheckInDate && lastCheckInDate.isSame(malaysiaMidnight, "day");

    res.json({
      success: true,
      checkedIn: hasCheckedInToday,
      checkInData: {
        currentStreak: checkin.currentStreak,
        lastCheckIn: checkin.lastCheckIn,
        monthlyCheckIns: checkin.monthlyCheckIns || {},
      },
    });
  } catch (error) {
    console.error("Check-in status error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
});

// Admin endpoints
router.get("/admin/api/checkins", authenticateAdminToken, async (req, res) => {
  try {
    const checkins = await Checkin.find()
      .populate("userId", "username")
      .sort({ currentStreak: -1 });

    res.json({
      success: true,
      data: checkins,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
});

router.post(
  "/admin/api/checkins/:userId/reset",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const checkin = await Checkin.findOne({ userId: req.params.userId });
      if (!checkin) {
        return res.status(404).json({
          success: false,
          message: "Checkin record not found.",
        });
      }

      checkin.currentStreak = 0;
      checkin.lastCheckIn = null;
      checkin.monthlyCheckIns = {};
      checkin.pendingRewards = [];
      await checkin.save();

      res.json({
        success: true,
        message: "Checkin record reset successfully.",
        data: checkin,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error.",
        error: error.message,
      });
    }
  }
);

module.exports = router;
