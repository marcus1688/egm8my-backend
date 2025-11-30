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
const { updateKioskBalance } = require("../services/kioskBalanceService");
const kioskbalance = require("../models/kioskbalance.model");
const axios = require("axios");

const getMalaysiaTime = () => moment().tz("Asia/Kuala_Lumpur");

const checkWeeklyCompletion = (monthlyCheckIns, checkInDate) => {
  const referenceDate = checkInDate
    ? moment.tz(checkInDate, "Asia/Kuala_Lumpur")
    : getMalaysiaTime();
  const startOfWeek = referenceDate.clone().startOf("week").add(1, "day");
  const monday =
    referenceDate.day() === 0
      ? startOfWeek.clone().subtract(7, "days")
      : startOfWeek;
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const date = monday.clone().add(i, "days");
    const month = date.month();
    const day = date.date();
    const monthCheckIns = monthlyCheckIns[month] || [];
    if (monthCheckIns.includes(day)) {
      weekDays.push(date);
    }
  }

  if (weekDays.length !== 7) {
    return false;
  }

  const firstDay = weekDays[0].day();
  const lastDay = weekDays[6].day();

  return firstDay === 1 && lastDay === 0;
};

const checkMonthlyCompletion = (monthlyCheckIns, checkInDate) => {
  const referenceDate = getMalaysiaTime();
  const month = referenceDate.month();
  const year = referenceDate.year();
  const checkIns = monthlyCheckIns[month] || [];
  const daysInMonth = moment
    .tz(`${year}-${month + 1}`, "YYYY-MM", "Asia/Kuala_Lumpur")
    .daysInMonth();
  return checkIns.length === daysInMonth;
};

const getUserDailyTurnover = async (userId, targetDate = null) => {
  try {
    const malaysiaTime = targetDate
      ? moment.tz(targetDate, "Asia/Kuala_Lumpur")
      : getMalaysiaTime();
    const startOfDay = malaysiaTime
      .clone()
      .startOf("day")
      .format("YYYY-MM-DD HH:mm:ss");
    const endOfDay = malaysiaTime
      .clone()
      .endOf("day")
      .format("YYYY-MM-DD HH:mm:ss");
    const user = await User.findById(userId);
    if (!user) return 0;
    const response = await axios.get(
      `${process.env.API_URL}api/all/${userId}/dailygamedata`,
      {
        params: {
          startDate: startOfDay,
        },
      }
    );
    if (response.data.success) {
      return response.data.summary.totalTurnover || 0;
    }
    return 0;
  } catch (error) {
    console.error("Error fetching daily turnover:", error);
    return 0;
  }
};

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
          const kioskSettings = await kioskbalance.findOne({});
          if (kioskSettings && kioskSettings.status) {
            const kioskResult = await updateKioskBalance(
              "subtract",
              rewardAmount,
              {
                username: user.username,
                transactionType: "check-in reward",
                remark: `${rewardNameEN}: ${reward.rewardType}`,
                processBy: "System",
              }
            );

            if (!kioskResult.success) {
              console.error(
                `Failed to update kiosk balance for ${user.username}: ${kioskResult.message}`
              );
              errorCount++;
              continue;
            }
          }
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
          const updatedUser = await User.findByIdAndUpdate(
            user._id,
            { $inc: { wallet: rewardAmount } },
            { new: true }
          );
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
    const diffDays = lastCheckInDate
      ? malaysiaTime.diff(lastCheckInDate.clone().startOf("day"), "days")
      : null;
    if (!lastCheckInDate || diffDays > 1) {
      checkin.currentStreak = 1;
    } else if (diffDays === 1) {
      checkin.currentStreak += 1;
    }
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

    const isWeeklyComplete = checkWeeklyCompletion(checkin.monthlyCheckIns);
    const isMonthlyComplete = checkMonthlyCompletion(
      checkin.monthlyCheckIns,
      month,
      year
    );

    let rewardAmount = 0;
    let rewardType = "daily";
    let dailyRewardAmount = 0;
    let weeklyRewardAmount = 0;
    let monthlyRewardAmount = 0;

    if (vipSettings) {
      const userVipLevel = vipSettings.vipLevels.find(
        (level) => level.name === user.viplevel
      );

      if (userVipLevel) {
        dailyRewardAmount = parseFloat(
          userVipLevel.benefits.get("Daily Rewards") || 0
        );
        if (isWeeklyComplete) {
          weeklyRewardAmount = parseFloat(
            userVipLevel.benefits.get("Weekly Rewards") || 0
          );
        }
        if (isMonthlyComplete) {
          monthlyRewardAmount = parseFloat(
            userVipLevel.benefits.get("Monthly Rewards") || 0
          );
        }
      }
    }

    const tomorrowDistribution = malaysiaTime
      .clone()
      .add(1, "day")
      .startOf("day")
      .add(1, "hour")
      .toDate();

    if (!checkin.pendingRewards) {
      checkin.pendingRewards = [];
    }

    if (dailyRewardAmount > 0) {
      checkin.pendingRewards.push({
        date: malaysiaTime.toDate(),
        rewardType: "daily",
        amount: dailyRewardAmount,
        distributed: false,
        scheduledDistribution: tomorrowDistribution,
      });
    }

    if (weeklyRewardAmount > 0) {
      checkin.pendingRewards.push({
        date: malaysiaTime.toDate(),
        rewardType: "weekly",
        amount: weeklyRewardAmount,
        distributed: false,
        scheduledDistribution: tomorrowDistribution,
      });
    }

    if (monthlyRewardAmount > 0) {
      checkin.pendingRewards.push({
        date: malaysiaTime.toDate(),
        rewardType: "monthly",
        amount: monthlyRewardAmount,
        distributed: false,
        scheduledDistribution: tomorrowDistribution,
      });
    }

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

// Check In Reminder
router.get("/api/checkin/reminder", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const malaysiaTime = getMalaysiaTime();
    const malaysiaMidnight = malaysiaTime.clone().startOf("day");
    const [user, checkin] = await Promise.all([
      User.findById(userId),
      Checkin.findOne({ userId }),
    ]);
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found",
          zh: "找不到用户",
          ms: "Pengguna tidak dijumpai",
        },
      });
    }
    const lastCheckInDate = checkin?.lastCheckIn
      ? moment(checkin.lastCheckIn).tz("Asia/Kuala_Lumpur")
      : null;

    const alreadyCheckedIn =
      lastCheckInDate && lastCheckInDate.isSameOrAfter(malaysiaMidnight, "day");

    if (alreadyCheckedIn) {
      return res.status(200).json({
        success: true,
        reminder: false,
        message: {
          en: "You have already checked in today",
          zh: "您今天已经签到过了",
          ms: "Anda telah mendaftar masuk hari ini",
        },
      });
    }

    const todayTurnover = await getUserDailyTurnover(userId);

    if (todayTurnover >= 100) {
      return res.status(200).json({
        success: true,
        reminder: true,
        turnover: todayTurnover,
        message: {
          en: "You have enough turnover to check in!",
          zh: "您的流水已达标，可以签到了！",
          ms: "Turnover anda mencukupi untuk daftar masuk!",
        },
      });
    }

    return res.status(200).json({
      success: true,
      reminder: false,
      turnover: todayTurnover,
      required: 100,
      message: {
        en: `You need at least 100 turnover to check in. Current: ${todayTurnover.toFixed(
          2
        )}`,
        zh: `您需要至少100流水才能签到。当前：${todayTurnover.toFixed(2)}`,
        ms: `Anda memerlukan sekurang-kurangnya 100 turnover untuk daftar masuk. Semasa: ${todayTurnover.toFixed(
          2
        )}`,
      },
    });
  } catch (error) {
    console.error("Check-in reminder error:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Failed to check reminder status",
        zh: "检查提醒状态失败",
        ms: "Gagal memeriksa status peringatan",
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
      return res.json({
        success: true,
        checkedIn: false,
        checkInData: {
          currentStreak: 0,
          lastCheckIn: null,
          monthlyCheckIns: {},
        },
      });
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

// Test Route: Check In
router.post(
  "/api/checkin/test/simulate-daily",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId, date } = req.body; // userId 和 date 都从 body 获取

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "userId is required in request body",
        });
      }

      const malaysiaTime = date
        ? moment.tz(date, "Asia/Kuala_Lumpur")
        : getMalaysiaTime();

      const malaysiaMidnight = malaysiaTime.clone().startOf("day");

      let [checkin, user, vipSettings] = await Promise.all([
        Checkin.findOne({ userId }),
        User.findById(userId),
        vip.findOne({}),
      ]);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      if (!checkin) {
        checkin = new Checkin({ userId });
      }

      // 跳过所有验证，直接签到
      console.log(
        `[TEST] Simulating check-in for ${
          user.username
        } on ${malaysiaTime.format("YYYY-MM-DD")}`
      );

      // Calculate streak
      const lastCheckInDate = checkin.lastCheckIn
        ? moment(checkin.lastCheckIn).tz("Asia/Kuala_Lumpur")
        : null;

      const diffDays = lastCheckInDate
        ? malaysiaTime.diff(lastCheckInDate.clone().startOf("day"), "days")
        : null;

      if (!lastCheckInDate || diffDays > 1) {
        checkin.currentStreak = 1;
      } else if (diffDays === 1) {
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
      const isWeeklyComplete = checkWeeklyCompletion(
        checkin.monthlyCheckIns,
        malaysiaTime
      );
      const isMonthlyComplete = checkMonthlyCompletion(
        checkin.monthlyCheckIns,
        month,
        year
      );

      // Get user's VIP level rewards
      let rewardAmount = 0;
      let rewardType = "daily";
      let dailyRewardAmount = 0;
      let weeklyRewardAmount = 0;
      let monthlyRewardAmount = 0;

      if (vipSettings) {
        const userVipLevel = vipSettings.vipLevels.find(
          (level) => level.name === user.viplevel
        );

        if (userVipLevel) {
          dailyRewardAmount = parseFloat(
            userVipLevel.benefits.get("Daily Rewards") || 0
          );

          if (isWeeklyComplete) {
            weeklyRewardAmount = parseFloat(
              userVipLevel.benefits.get("Weekly Rewards") || 0
            );
          }

          if (isMonthlyComplete) {
            monthlyRewardAmount = parseFloat(
              userVipLevel.benefits.get("Monthly Rewards") || 0
            );
          }
        }
      }

      const tomorrowDistribution = malaysiaTime
        .clone()
        .add(1, "day")
        .startOf("day")
        .add(1, "hour")
        .toDate();

      if (!checkin.pendingRewards) {
        checkin.pendingRewards = [];
      }

      if (dailyRewardAmount > 0) {
        checkin.pendingRewards.push({
          date: malaysiaTime.toDate(),
          rewardType: "daily",
          amount: dailyRewardAmount,
          distributed: false,
          scheduledDistribution: tomorrowDistribution,
        });
      }

      if (weeklyRewardAmount > 0) {
        checkin.pendingRewards.push({
          date: malaysiaTime.toDate(),
          rewardType: "weekly",
          amount: weeklyRewardAmount,
          distributed: false,
          scheduledDistribution: tomorrowDistribution,
        });
      }

      if (monthlyRewardAmount > 0) {
        checkin.pendingRewards.push({
          date: malaysiaTime.toDate(),
          rewardType: "monthly",
          amount: monthlyRewardAmount,
          distributed: false,
          scheduledDistribution: tomorrowDistribution,
        });
      }

      checkin.username = user.username;
      checkin.lastCheckIn = malaysiaTime.toDate();
      checkin.totalCheckins += 1;
      checkin.markModified("monthlyCheckIns");
      checkin.markModified("pendingRewards");
      await checkin.save();

      res.status(200).json({
        success: true,
        message: `[TEST] Check-in simulated for ${malaysiaTime.format(
          "YYYY-MM-DD"
        )}`,
        checkInData: {
          date: malaysiaTime.format("YYYY-MM-DD"),
          currentStreak: checkin.currentStreak,
          lastCheckIn: checkin.lastCheckIn,
          monthlyCheckIns: checkin.monthlyCheckIns,
          rewardType: rewardType,
          rewardAmount: rewardAmount,
        },
        isWeeklyComplete,
        isMonthlyComplete,
      });
    } catch (error) {
      console.error("[TEST] Simulate check-in error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to simulate check-in",
        error: error.message,
      });
    }
  }
);

// Test Route: Distribute Rewards
router.post(
  "/api/checkin/test/distribute-rewards",
  authenticateAdminToken,
  async (req, res) => {
    try {
      console.log("[TEST] Manually triggering reward distribution...");

      const malaysiaTime = getMalaysiaTime();
      const allCheckins = await Checkin.find({
        "pendingRewards.distributed": false,
      });

      const [vipSettings, promotion] = await Promise.all([
        vip.findOne({}),
        Promotion.findById(global.DAILY_CHECK_IN_PROMOTION_ID),
      ]);

      if (!vipSettings) {
        return res.status(400).json({
          success: false,
          message: "VIP settings not found",
        });
      }

      if (!promotion) {
        return res.status(400).json({
          success: false,
          message: "Daily check-in promotion not found",
        });
      }

      let distributedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      const distributionDetails = [];

      for (const checkin of allCheckins) {
        try {
          const user = await User.findById(checkin.userId);
          if (!user) {
            console.error(`[TEST] User not found: ${checkin.userId}`);
            errorCount++;
            continue;
          }

          const userVipLevel = vipSettings.vipLevels.find(
            (level) => level.name === user.viplevel
          );

          if (!userVipLevel) {
            console.error(`[TEST] VIP level not found: ${user.username}`);
            errorCount++;
            continue;
          }

          for (const reward of checkin.pendingRewards) {
            if (reward.distributed) continue;

            // 测试模式：忽略 scheduledDistribution 时间检查
            let rewardAmount = reward.amount || 0;
            let rewardNameEN = "";
            let rewardNameCN = "";

            if (reward.rewardType === "daily") {
              rewardNameEN = "Daily Check-In Reward";
              rewardNameCN = "每日签到奖励";
            } else if (reward.rewardType === "weekly") {
              rewardNameEN = "Weekly Check-In Reward";
              rewardNameCN = "每周签到奖励";
            } else if (reward.rewardType === "monthly") {
              rewardNameEN = "Monthly Check-In Reward";
              rewardNameCN = "每月签到奖励";
            }

            if (rewardAmount <= 0) {
              reward.distributed = true;
              skippedCount++;
              console.log(
                `[TEST] Skipped (no amount): ${user.username} - ${reward.rewardType}`
              );
              continue;
            }

            const kioskSettings = await kioskbalance.findOne({});
            if (kioskSettings && kioskSettings.status) {
              const kioskResult = await updateKioskBalance(
                "subtract",
                rewardAmount,
                {
                  username: user.username,
                  transactionType: "check-in reward",
                  remark: `[TEST] ${rewardNameEN}: ${reward.rewardType}`,
                  processBy: "System-Test",
                }
              );

              if (!kioskResult.success) {
                console.error(
                  `[TEST] Failed to update kiosk balance for ${user.username}: ${kioskResult.message}`
                );
                errorCount++;
                continue;
              }
            }

            // Create bonus transaction
            const transactionId = uuidv4();
            const bonus = new Bonus({
              transactionId: transactionId,
              userId: user._id,
              username: user.username,
              fullname: user.fullname,
              transactionType: "bonus",
              processBy: "System-Test",
              amount: rewardAmount,
              walletamount: user.wallet + rewardAmount,
              status: "approved",
              method: "auto",
              remark: `[TEST] ${rewardNameEN}`,
              promotionname: promotion.maintitle || "每日签到",
              promotionnameEN: promotion.maintitleEN || "Daily Check-In",
              promotionId: global.DAILY_CHECK_IN_PROMOTION_ID,
              processtime: "00:00:00",
            });

            // Update user wallet
            const updatedUser = await User.findByIdAndUpdate(
              user._id,
              { $inc: { wallet: rewardAmount } },
              { new: true }
            );

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

            distributionDetails.push({
              username: user.username,
              rewardType: reward.rewardType,
              amount: rewardAmount,
              transactionId: transactionId,
            });

            console.log(
              `[TEST] Distributed ${rewardAmount} to ${user.username} (${reward.rewardType})`
            );
          }

          checkin.markModified("pendingRewards");
          await checkin.save();
        } catch (userError) {
          errorCount++;
          console.error(
            `[TEST] Error processing: ${checkin.userId}`,
            userError
          );
        }
      }

      res.status(200).json({
        success: true,
        message: "[TEST] Reward distribution completed",
        summary: {
          distributed: distributedCount,
          skipped: skippedCount,
          errors: errorCount,
          totalCheckins: allCheckins.length,
        },
        details: distributionDetails,
      });
    } catch (error) {
      console.error("[TEST] Distribution error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to distribute rewards",
        error: error.message,
      });
    }
  }
);
module.exports = router;
