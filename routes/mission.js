const express = require("express");
const router = express.Router();
const Mission = require("../models/mission.model");
const MissionClaimLog = require("../models/missionclaimlog.model");
const { User } = require("../models/users.model");
const { authenticateToken } = require("../auth/auth");
const { authenticateAdminToken } = require("../auth/adminAuth");
const moment = require("moment-timezone");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
const axios = require("axios");
const { Mail } = require("../models/mail.model");

const getMalaysiaTime = () => moment().tz("Asia/Kuala_Lumpur");

async function calculateTodayTurnover(userId, today, todayEnd) {
  try {
    const malaysiaTime = getMalaysiaTime();
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
    console.error("Error fetching today's turnover:", error);
    return 0;
  }
}

async function getTodayUserStats(userId, today, todayEnd) {
  const Withdraw = require("../models/withdraw.model");
  const Deposit = require("../models/deposit.model");
  const totalTurnover = await calculateTodayTurnover(userId, today, todayEnd);
  const withdrawCount = await Withdraw.countDocuments({
    userId: userId,
    status: "approved",
    createdAt: {
      $gte: today.toDate(),
      $lte: todayEnd.toDate(),
    },
  });
  const depositCount = await Deposit.countDocuments({
    userId: userId,
    status: "approved",
    createdAt: {
      $gte: today.toDate(),
      $lte: todayEnd.toDate(),
    },
  });
  return {
    totalTurnover: totalTurnover || 0,
    withdrawCount: withdrawCount || 0,
    depositCount: depositCount || 0,
  };
}

// User Get Mission Progress
router.get(
  "/api/user/missions/progress",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const today = moment().tz("Asia/Kuala_Lumpur").startOf("day");
      const todayEnd = moment().tz("Asia/Kuala_Lumpur").endOf("day");
      const todayStats = await getTodayUserStats(userId, today, todayEnd);
      const missions = await Mission.find({ isActive: true });
      const sortedMissions = missions.sort((a, b) => {
        const orderA = a.sortOrder || 0;
        const orderB = b.sortOrder || 0;
        if (orderA === 0 && orderB !== 0) return 1;
        if (orderA !== 0 && orderB === 0) return -1;
        return orderA - orderB;
      });
      const claimedToday = await MissionClaimLog.find({
        userId: userId,
        claimDate: {
          $gte: today.toDate(),
          $lte: todayEnd.toDate(),
        },
      });

      const claimedMissionIds = claimedToday.map((log) =>
        log.missionId.toString()
      );

      const missionsWithProgress = sortedMissions.map((mission) => {
        let currentProgress = 0;

        switch (mission.missionType) {
          case "totalTurnover":
            currentProgress = todayStats.totalTurnover;
            break;
          case "withdrawCount":
            currentProgress = todayStats.withdrawCount;
            break;
          case "depositCount":
            currentProgress = todayStats.depositCount;
            break;
        }

        const isCompleted = currentProgress >= mission.targetValue;
        const isClaimed = claimedMissionIds.includes(mission._id.toString());

        return {
          _id: mission._id,
          title: mission.title,
          titleCN: mission.titleCN,
          titleMS: mission.titleMS,
          description: mission.description,
          descriptionCN: mission.descriptionCN,
          descriptionMS: mission.descriptionMS,
          missionType: mission.missionType,
          targetValue: mission.targetValue,
          rewardPoints: mission.rewardPoints,
          currentProgress: currentProgress,
          isCompleted: isCompleted,
          isClaimed: isClaimed,
        };
      });

      res.json({
        success: true,
        data: {
          todayStats: todayStats,
          missions: missionsWithProgress,
        },
      });
    } catch (error) {
      console.error("Get missions progress error:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to get missions progress",
          zh: "获取任务进度失败",
          ms: "Gagal mendapatkan kemajuan misi",
        },
      });
    }
  }
);

// User Claim Mission Reward
router.post("/api/user/missions/claim", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { missionId } = req.body;
    const user = await User.findById(userId);
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
    const mission = await Mission.findById(missionId);
    if (!mission || !mission.isActive) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Mission not found or inactive",
          zh: "任务不存在或已停用",
          ms: "Misi tidak dijumpai atau tidak aktif",
        },
      });
    }
    const today = moment().tz("Asia/Kuala_Lumpur").startOf("day");
    const todayEnd = moment().tz("Asia/Kuala_Lumpur").endOf("day");
    const alreadyClaimed = await MissionClaimLog.findOne({
      userId: userId,
      missionId: missionId,
      claimDate: {
        $gte: today.toDate(),
        $lte: todayEnd.toDate(),
      },
    });
    if (alreadyClaimed) {
      return res.status(200).json({
        success: false,
        message: {
          en: "You have already claimed this mission today",
          zh: "您今天已经领取过此任务奖励",
          ms: "Anda telah menuntut misi ini hari ini",
        },
      });
    }
    const todayStats = await getTodayUserStats(userId, today, todayEnd);
    let currentProgress = 0;
    switch (mission.missionType) {
      case "totalTurnover":
        currentProgress = todayStats.totalTurnover;
        break;
      case "withdrawCount":
        currentProgress = todayStats.withdrawCount;
        break;
      case "depositCount":
        currentProgress = todayStats.depositCount;
        break;
    }
    if (currentProgress < mission.targetValue) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Mission not completed yet",
          zh: "任务尚未完成",
          ms: "Misi belum selesai",
        },
      });
    }
    const transactionId = uuidv4();
    const claimLog = new MissionClaimLog({
      userId: user._id,
      username: user.username,
      missionId: mission._id,
      missionTitle: mission.title,
      missionTitleCN: mission.titleCN,
      missionTitleMS: mission.titleMS,
      missionType: mission.missionType,
      rewardPoints: mission.rewardPoints,
      progressValue: currentProgress,
      targetValue: mission.targetValue,
      claimDate: new Date(),
      transactionId: transactionId,
    });
    await Promise.all([
      claimLog.save(),
      User.findByIdAndUpdate(userId, {
        $inc: { luckySpinPoints: mission.rewardPoints },
      }),
    ]);
    res.status(200).json({
      success: true,
      data: {
        rewardPoints: mission.rewardPoints,
        newLuckySpinPoints: user.luckySpinPoints + mission.rewardPoints,
      },
      message: {
        en: `Successfully claimed ${mission.rewardPoints} Lucky Spin Points!`,
        zh: `成功领取 ${mission.rewardPoints} 幸运转盘积分！`,
        ms: `Berjaya menuntut ${mission.rewardPoints} Lucky Spin Points!`,
      },
    });
  } catch (error) {
    console.error("Mission claim error:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Failed to claim mission reward",
        zh: "领取任务奖励失败",
        ms: "Gagal menuntut ganjaran misi",
      },
    });
  }
});

// User Mission Reminder
router.get("/api/missions/reminder", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const today = moment().tz("Asia/Kuala_Lumpur").startOf("day");
    const todayEnd = moment().tz("Asia/Kuala_Lumpur").endOf("day");
    const user = await User.findById(userId);
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
    const todayStats = await getTodayUserStats(userId, today, todayEnd);
    const missions = await Mission.find({ isActive: true });
    const claimedToday = await MissionClaimLog.find({
      userId: userId,
      claimDate: {
        $gte: today.toDate(),
        $lte: todayEnd.toDate(),
      },
    });
    const claimedMissionIds = claimedToday.map((log) =>
      log.missionId.toString()
    );
    const unclaimedMissions = [];
    for (const mission of missions) {
      if (claimedMissionIds.includes(mission._id.toString())) {
        continue;
      }
      let currentProgress = 0;
      switch (mission.missionType) {
        case "totalTurnover":
          currentProgress = todayStats.totalTurnover;
          break;
        case "withdrawCount":
          currentProgress = todayStats.withdrawCount;
          break;
        case "depositCount":
          currentProgress = todayStats.depositCount;
          break;
      }
      if (currentProgress >= mission.targetValue) {
        unclaimedMissions.push({
          missionId: mission._id,
          title: mission.title,
          titleCN: mission.titleCN,
          titleMS: mission.titleMS,
          rewardPoints: mission.rewardPoints,
          missionType: mission.missionType,
        });
      }
    }
    if (unclaimedMissions.length > 0) {
      for (const mission of unclaimedMissions) {
        const todayMailSent = await Mail.findOne({
          recipientId: userId,
          missionId: mission.missionId,
          createdAt: {
            $gte: today.toDate(),
            $lte: todayEnd.toDate(),
          },
        });

        if (!todayMailSent) {
          await Mail.create({
            recipientId: userId,
            username: user.username,
            missionId: mission.missionId,
            titleEN: `Mission Completed: ${mission.title}`,
            titleCN: `任务已完成：${mission.titleCN}`,
            titleMS: `Misi Selesai: ${mission.titleMS}`,
            contentEN: `Congratulations! You have completed the mission "${mission.title}".\n\nReward: ${mission.rewardPoints} Lucky Spin Points\n\nClaim your reward now!`,
            contentCN: `恭喜！您已完成任务"${mission.titleCN}"。\n\n奖励：${mission.rewardPoints} 幸运转盘积分\n\n立即领取您的奖励！`,
            contentMS: `Tahniah! Anda telah menyelesaikan misi "${mission.titleMS}".\n\nGanjaran: ${mission.rewardPoints} Lucky Spin Points\n\nTuntut ganjaran anda sekarang!`,
            isRead: false,
          });
        }
      }

      return res.status(200).json({
        success: true,
        reminder: true,
        unclaimedCount: unclaimedMissions.length,
        totalRewards: unclaimedMissions.reduce(
          (sum, m) => sum + m.rewardPoints,
          0
        ),
        missions: unclaimedMissions,
        message: {
          en: `You have ${unclaimedMissions.length} mission${
            unclaimedMissions.length > 1 ? "s" : ""
          } ready to claim!`,
          zh: `您有 ${unclaimedMissions.length} 个任务可以领取！`,
          ms: `Anda mempunyai ${unclaimedMissions.length} misi untuk dituntut!`,
        },
      });
    }
    return res.status(200).json({
      success: true,
      reminder: false,
      unclaimedCount: 0,
      message: {
        en: "No missions ready to claim",
        zh: "暂无可领取的任务",
        ms: "Tiada misi untuk dituntut",
      },
    });
  } catch (error) {
    console.error("Mission reminder error:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Failed to check mission reminder",
        zh: "检查任务提醒失败",
        ms: "Gagal memeriksa peringatan misi",
      },
    });
  }
});

// Get User Mission Claim History
router.get(
  "/api/user/missions/history",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const claimHistory = await MissionClaimLog.find({ userId: userId }).sort({
        createdAt: -1,
      });

      res.json({
        success: true,
        data: claimHistory,
      });
    } catch (error) {
      console.error("Get mission history error:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to get mission history",
          zh: "获取任务历史失败",
          ms: "Gagal mendapatkan sejarah misi",
        },
      });
    }
  }
);

// Admin Get All Missions
router.get("/admin/api/missions", authenticateAdminToken, async (req, res) => {
  try {
    const missions = await Mission.find();
    const sortedMissions = missions.sort((a, b) => {
      const orderA = a.sortOrder || 0;
      const orderB = b.sortOrder || 0;
      if (orderA === 0 && orderB !== 0) return 1;
      if (orderA !== 0 && orderB === 0) return -1;
      return orderA - orderB;
    });
    res.json({
      success: true,
      data: sortedMissions,
    });
  } catch (error) {
    console.error("Get missions error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Admin Create Mission
router.post("/admin/api/missions", authenticateAdminToken, async (req, res) => {
  try {
    const {
      title,
      titleCN,
      titleMS,
      description,
      descriptionCN,
      descriptionMS,
      missionType,
      targetValue,
      rewardPoints,
      sortOrder,
    } = req.body;

    const mission = new Mission({
      title,
      titleCN,
      titleMS,
      description,
      descriptionCN,
      descriptionMS,
      missionType,
      targetValue,
      rewardPoints,
      sortOrder: sortOrder || 0,
    });
    await mission.save();
    res.status(200).json({
      success: true,
      message: {
        en: "Mission created successfully",
        zh: "任务创建成功",
        ms: "Misi berjaya dicipta",
      },
      data: mission,
    });
  } catch (error) {
    console.error("Create mission error:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Failed to create mission",
        zh: "创建任务失败",
        ms: "Gagal mencipta misi",
      },
    });
  }
});

// Admin Update Mission
router.put(
  "/admin/api/missions/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const {
        title,
        titleCN,
        titleMS,
        description,
        descriptionCN,
        descriptionMS,
        targetValue,
        rewardPoints,
        sortOrder,
      } = req.body;
      const mission = await Mission.findByIdAndUpdate(
        req.params.id,
        {
          title,
          titleCN,
          titleMS,
          description,
          descriptionCN,
          descriptionMS,
          targetValue,
          rewardPoints,
          sortOrder,
        },
        { new: true }
      );
      if (!mission) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Mission not found",
            zh: "找不到任务",
            ms: "Misi tidak dijumpai",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Mission updated successfully",
          zh: "任务更新成功",
          ms: "Misi berjaya dikemas kini",
        },
        data: mission,
      });
    } catch (error) {
      console.error("Update mission error:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to update mission",
          zh: "更新任务失败",
          ms: "Gagal mengemas kini misi",
        },
      });
    }
  }
);

// Admin Toggle Mission Status
router.patch(
  "/admin/api/missions/:id/toggle",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const mission = await Mission.findById(req.params.id);
      if (!mission) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Mission not found",
            zh: "找不到任务",
            ms: "Misi tidak dijumpai",
          },
        });
      }
      mission.isActive = !mission.isActive;
      await mission.save();
      res.status(200).json({
        success: true,
        message: {
          en: `Mission is now ${mission.isActive ? "active" : "inactive"}`,
          zh: `任务${mission.isActive ? "已激活" : "已停用"}`,
          ms: `Misi kini ${mission.isActive ? "aktif" : "tidak aktif"}`,
        },
        data: mission,
      });
    } catch (error) {
      console.error("Toggle mission status error:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to update mission status",
          zh: "更新任务状态失败",
          ms: "Gagal mengemas kini status misi",
        },
      });
    }
  }
);

// Admin Delete Mission
router.delete(
  "/admin/api/missions/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const mission = await Mission.findByIdAndDelete(req.params.id);
      if (!mission) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Mission not found",
            zh: "找不到任务",
            ms: "Misi tidak dijumpai",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Mission deleted successfully",
          zh: "任务删除成功",
          ms: "Misi berjaya dipadam",
        },
      });
    } catch (error) {
      console.error("Delete mission error:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to delete mission",
          zh: "删除任务失败",
          ms: "Gagal memadam misi",
        },
      });
    }
  }
);

// Admin Get Mission Claim Logs
router.get(
  "/admin/api/missions/claims",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const dateFilter = {};
      if (startDate && endDate) {
        dateFilter.claimDate = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }
      const claimLogs = await MissionClaimLog.find({
        ...dateFilter,
      }).sort({ createdAt: -1 });
      res.json({
        success: true,
        data: claimLogs,
      });
    } catch (error) {
      console.error("Get mission claims error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

module.exports = router;
