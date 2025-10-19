const express = require("express");
const router = express.Router();
const Checkin = require("../models/checkin.model");
const { User } = require("../models/users.model");
const { authenticateToken } = require("../auth/auth");
const { authenticateAdminToken } = require("../auth/adminAuth");
const moment = require("moment-timezone");

router.post("/api/checkin", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const malaysiaTime = moment().tz("Asia/Kuala_Lumpur");
    // const testDate = req.body.testDate;
    // const malaysiaTime = testDate
    //   ? moment(testDate).tz("Asia/Kuala_Lumpur")
    //   : moment().tz("Asia/Kuala_Lumpur");

    const malaysiaMidnight = malaysiaTime.clone().startOf("day");
    let [checkin, user] = await Promise.all([
      Checkin.findOne({ userId }),
      User.findById(userId),
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

    if (user.totaldeposit <= 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "You need to make a deposit before checking in",
          zh: "您需要先充值才能签到",
          ms: "Anda perlu membuat deposit sebelum mendaftar masuk",
        },
      });
    }

    const diffDays = lastCheckInDate
      ? malaysiaTime.diff(lastCheckInDate.clone().startOf("day"), "days")
      : null;
    if (!lastCheckInDate || diffDays > 1) {
      checkin.currentStreak = 1;
    } else if (diffDays === 1) {
      if (checkin.currentStreak >= 7) {
        checkin.currentStreak = 1;
      } else {
        checkin.currentStreak += 1;
      }
    }
    let spinReward = 1;
    let rewardTypes = ["daily"];
    if (checkin.currentStreak === 3) {
      spinReward += 1;
      rewardTypes.push("three_days");
    }
    if (checkin.currentStreak === 7) {
      spinReward += 2;
      rewardTypes.push("seven_days");
    }
    user.luckySpinCount = (user.luckySpinCount || 0) + spinReward;
    await user.save();
    checkin.dailyRewards.push({
      date: malaysiaTime.format(),
      spinCount: spinReward,
      rewardTypes: rewardTypes,
    });
    checkin.username = user.username;
    checkin.lastCheckIn = malaysiaTime.toDate();
    checkin.totalCheckins += 1;
    await checkin.save();
    const month = malaysiaTime.month();
    const day = malaysiaTime.date();
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
    checkin.markModified("monthlyCheckIns");
    await checkin.save();
    res.status(200).json({
      success: true,
      message: {
        en: "Check-in successful",
        zh: "签到成功",
        ms: "Daftar masuk berjaya",
      },
      checkInData: {
        currentStreak: checkin.currentStreak,
        lastCheckIn: checkin.lastCheckIn,
        dailyRewards: checkin.dailyRewards,
        monthlyCheckIns: checkin.monthlyCheckIns,
        luckySpinCount: user.luckySpinCount,
      },
      reward: {
        type: "luckySpin",
        amount: spinReward,
        types: rewardTypes,
      },
    });
  } catch (error) {
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

router.get("/api/checkin/status", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const malaysiaTime = moment().tz("Asia/Kuala_Lumpur");
    const malaysiaMidnight = malaysiaTime.clone().startOf("day");
    let checkin = await Checkin.findOne({ userId });
    if (!checkin) {
      checkin = new Checkin({ userId, checkInHistory: [] });
      await checkin.save();
    }
    const lastCheckInDate = checkin.lastCheckIn
      ? moment.tz(checkin.lastCheckIn, "Asia/Kuala_Lumpur")
      : null;
    const hasCheckedInToday =
      lastCheckInDate && lastCheckInDate.isSame(malaysiaMidnight, "day");
    const user = await User.findById(userId);
    res.json({
      success: true,
      checkedIn: hasCheckedInToday,
      checkInData: {
        currentStreak: checkin.currentStreak,
        lastCheckIn: checkin.lastCheckIn,
        dailyRewards: checkin.dailyRewards,
        monthlyCheckIns: checkin.monthlyCheckIns || {},
        checkInHistory: checkin.checkInHistory || [],
        luckySpinCount: user.luckySpinCount || 0,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
});

router.get("/admin/api/checkins", authenticateAdminToken, async (req, res) => {
  try {
    const checkins = await Checkin.find()
      .populate("userId", "username luckySpinCount")
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
      checkin.rewards = [];
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
