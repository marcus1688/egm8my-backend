const express = require("express");
const router = express.Router();
const nodeSchedule = require("node-schedule");
const moment = require("moment-timezone");
const {
  AgentCommission,
  AgentCommissionReport,
} = require("../models/agent.model");
const { User, GameDataValidLog } = require("../models/users.model");
const Deposit = require("../models/deposit.model");
const Withdraw = require("../models/withdraw.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { authenticateToken } = require("../auth/auth");
// const BetRecord = require("../models/betrecord.model");
const UserWalletLog = require("../models/userwalletlog.model");
const { LEVEL_REQUIREMENTS } = require("../config/agentConfig");
const { updateKioskBalance } = require("../services/kioskBalanceService");
const kioskbalance = require("../models/kioskbalance.model");
const Bonus = require("../models/bonus.model");
const axios = require("axios");

let scheduledJob = null;

// UTC Server
// const setScheduledJob = async (schedule) => {
//   const { type, weekDay, monthDay, hour, minute } = schedule;
//   let serverHour = (parseInt(hour) - 8 + 24) % 24;
//   let serverMinute = parseInt(minute);
//   let serverWeekDay = parseInt(weekDay);
//   if (parseInt(hour) < 8) {
//     if (serverWeekDay === 0) {
//       serverWeekDay = 6;
//     } else {
//       serverWeekDay = serverWeekDay - 1;
//     }
//   }
//   if (scheduledJob) {
//     console.log(`Cancelling existing commission schedule job`);
//     scheduledJob.cancel();
//   }
//   const commission = await AgentCommission.findOne();
//   if (!commission) return;
//   let cronExpression;
//   if (type === "weekly") {
//     cronExpression = `${serverMinute} ${serverHour} * * ${serverWeekDay}`;
//   } else {
//     cronExpression = `${serverMinute} ${serverHour} ${monthDay} * *`;
//   }
//   scheduledJob = nodeSchedule.scheduleJob(cronExpression, async () => {
//     try {
//       console.log(
//         `Running commission calculation at ${new Date().toISOString()}`
//       );
//       await runCommissionCalculation();
//       await AgentCommission.findOneAndUpdate({}, { lastRunTime: new Date() });
//       console.log(
//         `Commission calculation completed successfully at ${new Date().toISOString()}`
//       );
//     } catch (error) {
//       console.error(
//         `Commission calculation error at ${new Date().toISOString()}:`,
//         error
//       );
//     }
//   });
//   console.log(
//     `Next commission calculation scheduled for: ${scheduledJob.nextInvocation()}`
//   );
// };

const setScheduledJob = async (schedule) => {
  const { type, weekDay, monthDay, hour, minute } = schedule;
  // For Malaysia Time (UTC+8), no need to adjust the hour
  let serverHour = parseInt(hour);
  let serverMinute = parseInt(minute);
  let serverWeekDay = parseInt(weekDay);

  // Remove the weekday adjustment that was related to the timezone conversion
  // The original code had this adjustment for crossing midnight in UTC when converting from Malaysia time

  if (scheduledJob) {
    console.log(`Cancelling existing commission schedule job`);
    scheduledJob.cancel();
  }

  const commission = await AgentCommission.findOne();
  if (!commission) return;

  let cronExpression;
  if (type === "weekly") {
    cronExpression = `${serverMinute} ${serverHour} * * ${serverWeekDay}`;
  } else {
    cronExpression = `${serverMinute} ${serverHour} ${monthDay} * *`;
  }

  scheduledJob = nodeSchedule.scheduleJob(cronExpression, async () => {
    try {
      console.log(
        `Running commission calculation at ${new Date().toISOString()}`
      );
      await runCommissionCalculation();
      await AgentCommission.findOneAndUpdate({}, { lastRunTime: new Date() });
      console.log(
        `Commission calculation completed successfully at ${new Date().toISOString()}`
      );
    } catch (error) {
      console.error(
        `Commission calculation error at ${new Date().toISOString()}:`,
        error
      );
    }
  });

  console.log(
    `Next commission calculation scheduled for: ${scheduledJob.nextInvocation()}`
  );
};

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

// User Claim Commission
router.post("/api/claim-commission", authenticateToken, async (req, res) => {
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

    if (user.wallet > 1) {
      return res.json({
        success: false,
        message: {
          en: "Your wallet balance must be less than MYR 1 to claim commission",
          zh: "您的钱包余额必须少于MYR 1才能领取佣金",
          ms: "Baki dompet anda mestilah kurang daripada MYR 1 untuk menuntut komisen",
        },
      });
    }

    const result = await calculateUserTurnoverCommission(userId);
    return res.json({
      success: result.success,
      message: result.message,
      data: {
        amount: result.amount,
      },
    });
  } catch (error) {
    console.error("Error claiming commission:", error);
    return res.status(500).json({
      success: false,
      message: {
        en: "Failed to claim commission",
        zh: "领取佣金失败",
        ms: "Gagal menuntut komisen",
      },
      error: error.message,
    });
  }
});

// User Get Agent Commission Report
router.get(
  "/api/agent-commission-report",
  authenticateToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.user.userId;

      const queryFilter = {
        agentId: userId,
      };

      if (startDate && endDate) {
        queryFilter.createdAt = {
          $gte: moment
            .tz(startDate, "Asia/Kuala_Lumpur")
            .startOf("day")
            .utc()
            .toDate(),
          $lte: moment
            .tz(endDate, "Asia/Kuala_Lumpur")
            .endOf("day")
            .utc()
            .toDate(),
        };
      }

      const reports = await AgentCommissionReport.find(queryFilter).sort({
        createdAt: -1,
      });

      res.json({
        success: true,
        data: reports.map((report) => ({
          downlineUsername: report.downlineUsername,
          // downlineFullname: report.downlineFullname,
          calculationType: report.calculationType,
          categoryTurnover: report.categoryTurnover,
          totalTurnover: report.totalTurnover,
          commissionAmount: report.commissionAmount,
          formula: report.formula,
          status: report.status,
          createdAt: report.createdAt,
          remark: report.remark,
        })),
      });
    } catch (error) {
      console.error("Error fetching user commission report:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch commission report",
        error: error.message,
      });
    }
  }
);

// User Get Agent Commission Details
router.get("/api/agent-commission", authenticateToken, async (req, res) => {
  try {
    const commission = await AgentCommission.findOne();

    if (!commission) {
      return res.json({
        success: true,
        data: null,
        message: "No commission settings found",
      });
    }

    res.json({
      success: true,
      data: commission,
    });
  } catch (error) {
    console.error("Error fetching agent commission:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch commission settings",
      error: error.message,
    });
  }
});

// User Get Agent Progress
router.get("/api/agent-progress", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const agent = await User.findById(userId).populate("referrals.user_id");
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    const downlines = agent.referrals.map((ref) => ref.user_id).filter(Boolean);
    const currentLevel = agent.agentLevel || 0;
    let nextLevelProgress = {
      currentLevel,
      nextLevel: null,
      currentQualifiedCount: 0,
      requiredCount: 0,
      requiredVipLevel: 0,
      remaining: 0,
    };
    const nextLevelReq = LEVEL_REQUIREMENTS.find(
      (req) => req.level === currentLevel + 1
    );

    if (nextLevelReq) {
      const qualifiedDownlines = downlines.filter(
        (user) => user.viplevel >= nextLevelReq.requiredVipLevel
      );
      nextLevelProgress = {
        currentLevel,
        nextLevel: currentLevel + 1,
        currentQualifiedCount: qualifiedDownlines.length,
        requiredCount: nextLevelReq.requiredCount,
        requiredVipLevel: nextLevelReq.requiredVipLevel,
        remaining: Math.max(
          0,
          nextLevelReq.requiredCount - qualifiedDownlines.length
        ),
      };
    }
    const response = {
      success: true,
      data: {
        currentAgentLevel: currentLevel,
        totalDownlines: downlines.length,
        nextLevelProgress,
        // Include the breakdown of downlines by VIP level
        downlinesByVipLevel: downlines.reduce((acc, downline) => {
          const vipLevel = downline.viplevel || 0;
          acc[vipLevel] = (acc[vipLevel] || 0) + 1;
          return acc;
        }, {}),
      },
    };

    res.json(response);
  } catch (error) {
    console.error("Error fetching agent progress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch agent progress",
      error: error.message,
    });
  }
});

// User Agent Member Management
router.get("/api/get-downlines", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const agentCommission = await AgentCommission.findOne();
    const maxDownline = parseInt(agentCommission.maxDownline);

    async function getDownlineUsers(parentId, currentLevel = 1, maxLevel) {
      if (currentLevel > maxLevel) return { downlines: [], indirectCount: 0 };

      const directDownlines = await User.find({
        "referralBy.user_id": parentId,
      }).select(
        " fullname createdAt status lastLogin lastdepositdate viplevel totalturnover username"
      );

      let allDownlines = [];
      let indirectCount = 0;

      for (const user of directDownlines) {
        const userWithLevel = {
          ...user.toObject(),
          level: currentLevel,
        };
        allDownlines.push(userWithLevel);

        if (currentLevel === 1) {
          // 只递归查找 **间接下线的数量**（不返回数据）
          const { indirectCount: nextLevelIndirectCount } =
            await getDownlineUsers(user._id, currentLevel + 1, maxLevel);
          indirectCount += nextLevelIndirectCount;
        } else {
          indirectCount += 1;
        }
      }

      return { downlines: allDownlines, indirectCount };
    }

    // 获取 **直接下线用户数据** & **间接下线数量**
    const { downlines, indirectCount } = await getDownlineUsers(
      userId,
      1,
      maxDownline
    );

    const response = {
      direct: downlines,
      indirectCount, // 只返回间接下线的总数量
    };

    const summary = {
      totalDirect: response.direct.length,
      totalIndirect: indirectCount, // ✅ 只返回数量
      totalDownlines: response.direct.length + indirectCount,
    };

    res.json({
      success: true,
      data: {
        downlines: response,
        summary: summary,
      },
    });
  } catch (error) {
    console.error("Error getting downlines:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// User Team Stats
router.get("/api/team-stats", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const agentCommission = await AgentCommission.findOne();
    const maxDownline = parseInt(agentCommission.maxDownline);
    // const maxDownline = parseInt(1);

    async function getDownlineUsers(parentId, currentLevel = 1, maxLevel) {
      if (currentLevel > maxLevel) return [];

      const directDownlines = await User.find({
        "referralBy.user_id": parentId,
      }).select("_id referralBy totaldeposit");

      let allDownlines = [];
      for (const user of directDownlines) {
        const userWithLevel = {
          ...user.toObject(),
          level: currentLevel,
        };
        allDownlines.push(userWithLevel);

        const nextLevelDownlines = await getDownlineUsers(
          user._id,
          currentLevel + 1,
          maxLevel
        );
        allDownlines = allDownlines.concat(nextLevelDownlines);
      }
      return allDownlines;
    }

    const allDownlines = await getDownlineUsers(userId, 1, maxDownline);
    const directDownlines = allDownlines.filter((user) => user.level === 1);
    const indirectDownlines = allDownlines.filter((user) => user.level > 1);
    const stats = {
      all: {
        registeredUsers: allDownlines.length,
        validUsers: allDownlines.filter((user) => user.totaldeposit > 0).length,
        teamUsers: allDownlines.length,
      },
      direct: {
        registeredUsers: directDownlines.length,
        validUsers: directDownlines.filter((user) => user.totaldeposit > 0)
          .length,
        teamUsers: directDownlines.length,
      },
      indirect: {
        registeredUsers: indirectDownlines.length,
        validUsers: indirectDownlines.filter((user) => user.totaldeposit > 0)
          .length,
        teamUsers: indirectDownlines.length,
      },
    };
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Error getting team stats:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Admin Get Agent Commission Settings
router.get(
  "/admin/api/agent-commission",
  authenticateAdminToken,
  async (req, res) => {
    try {
      let commission = await AgentCommission.findOne();
      if (!commission) {
        commission = await AgentCommission.create({
          type: "weekly",
          weekDay: "1",
          monthDay: 1,
          hour: "03",
          minute: "00",
          isActive: true,
          calculationType: "turnover",
          maxDownline: "1",
        });
      }
      res.json({ success: true, data: commission });
    } catch (error) {
      console.error("Error fetching agent commission settings:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch commission settings",
        error: error.message,
      });
    }
  }
);

// Admin Update Agent Commission Settings
router.post(
  "/admin/api/agent-commission",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const {
        type,
        weekDay,
        monthDay,
        hour,
        minute,
        isActive,
        calculationType,
        maxDownline,
        winLoseCommission,
        commissionPercentages,
      } = req.body;

      let commission = await AgentCommission.findOne();
      if (!commission) {
        commission = new AgentCommission();
      }

      commission.type = type;
      commission.weekDay = weekDay;
      commission.monthDay = monthDay;
      commission.hour = hour;
      commission.minute = minute;
      commission.isActive = isActive;
      commission.calculationType = calculationType;
      commission.maxDownline = maxDownline;

      if (calculationType === "winlose") {
        commission.winLoseCommission = winLoseCommission;
      } else {
        commission.commissionPercentages = commissionPercentages;
      }

      await commission.save();

      if (isActive) {
        await setScheduledJob({
          type,
          weekDay,
          monthDay,
          hour,
          minute,
        });
      } else if (scheduledJob) {
        scheduledJob.cancel();
      }

      res.status(200).json({
        success: true,
        message: {
          en: "Commission settings updated successfully",
          zh: "佣金设置更新成功",
        },
        data: commission,
      });
    } catch (error) {
      console.error("Error updating commission settings:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to update commission settings",
          zh: "更新佣金设置失败",
        },
      });
    }
  }
);

// Admin Manual Commission Calculation (If Needed)
router.post(
  "/admin/api/commission-calculate/manual",
  authenticateAdminToken,
  async (req, res) => {
    try {
      await runCommissionCalculation();
      res.json({
        success: true,
        message: "Commission calculation completed",
      });
    } catch (error) {
      console.error("Error running manual commission calculation:", error);
      res.status(500).json({
        success: false,
        message: "Failed to run commission calculation",
        error: error.message,
      });
    }
  }
);

// Admin Get Commission Reports
router.get(
  "/admin/api/commission-report",
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

      const reports = await AgentCommissionReport.find(dateFilter)
        .populate("agentId", "username")
        .populate("downlineId", "username")
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: reports,
      });
    } catch (error) {
      console.error("Error fetching commission report:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch commission report",
        error: error.message,
      });
    }
  }
);

// Admin Get Specific User Downline
router.get(
  "/admin/api/user-downlines/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const agentCommission = await AgentCommission.findOne();
      const maxDownline = parseInt(agentCommission?.maxDownline || 1);
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      async function getDownlineUsers(parentId, currentLevel = 1, maxLevel) {
        if (currentLevel > maxLevel) return [];
        const directDownlines = await User.find({
          "referralBy.user_id": parentId,
        }).select(
          "username createdAt status lastLogin lastdepositdate viplevel totalturnover totaldeposit email"
        );
        let allDownlines = [];
        for (const user of directDownlines) {
          const userWithLevel = {
            ...user.toObject(),
            level: currentLevel,
          };
          allDownlines.push(userWithLevel);
          const nextLevelDownlines = await getDownlineUsers(
            user._id,
            currentLevel + 1,
            maxLevel
          );
          allDownlines = allDownlines.concat(nextLevelDownlines);
        }
        return allDownlines;
      }
      const allDownlines = await getDownlineUsers(userId, 1, maxDownline);
      const groupedDownlines = {
        direct: allDownlines.filter((user) => user.level === 1),
        indirect: allDownlines.filter((user) => user.level > 1),
      };
      const summary = {
        totalDirect: groupedDownlines.direct.length,
        totalIndirect: groupedDownlines.indirect.length,
        totalDownlines: allDownlines.length,
        validUsers: allDownlines.filter((user) => user.totaldeposit > 0).length,
      };
      res.json({
        success: true,
        data: {
          userInfo: {
            username: user.username,
            id: user._id,
            agentLevel: user.agentLevel || 0,
          },
          downlines: groupedDownlines,
          summary: summary,
        },
      });
    } catch (error) {
      console.error("Error getting user downlines:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }
);

async function runCommissionCalculation() {
  try {
    const commission = await AgentCommission.findOne();
    if (!commission || !commission.isActive) return;

    if (commission.calculationType === "turnover") {
      await calculateTurnoverCommission();
    } else {
      await calculateWinLoseCommission();
    }
    if (commission.isActive) {
      await setScheduledJob({
        type: commission.type,
        weekDay: commission.weekDay,
        monthDay: commission.monthDay,
        hour: commission.hour,
        minute: commission.minute,
      });
    }
  } catch (error) {
    console.error("Commission calculation error:", error);
    throw error;
  }
}

const calculateWinLoseCommission = async () => {
  try {
    const commission = await AgentCommission.findOne();
    const maxLevel = parseInt(commission.maxDownline);

    const weekStart = moment()
      .utc()
      //       // .subtract(1, "week")
      .startOf("isoWeek")
      .subtract(8, "hours")
      .toDate();

    const weekEnd = moment()
      .utc()
      //       // .subtract(1, "week")
      .endOf("isoWeek")
      .subtract(8, "hours")
      .toDate();

    const transactionUsers = await Deposit.aggregate([
      {
        $match: {
          createdAt: { $gte: weekStart, $lte: weekEnd },
          status: "approved",
          reverted: false,
        },
      },
      {
        $group: {
          _id: "$userId",
          totalDeposit: { $sum: "$amount" },
        },
      },
    ]);

    const userIds = transactionUsers.map((u) => u._id);
    const withdrawals = await Withdraw.aggregate([
      {
        $match: {
          userid: { $in: userIds },
          createdAt: { $gte: weekStart, $lte: weekEnd },
          status: "approved",
          reverted: false,
        },
      },
      {
        $group: {
          _id: "$userid",
          totalWithdraw: { $sum: "$amount" },
        },
      },
    ]);

    const withdrawMap = new Map(
      withdrawals.map((w) => [w._id.toString(), w.totalWithdraw])
    );

    const userNetAmounts = transactionUsers.map((user) => ({
      userId: user._id,
      netAmount:
        user.totalDeposit - (withdrawMap.get(user._id.toString()) || 0),
    }));

    const users = await User.find({
      _id: { $in: userIds },
    }).select("username referralBy");

    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const referrerMap = new Map();

    users.forEach((user) => {
      if (user.referralBy && user.referralBy.user_id) {
        const referrerId = user.referralBy.user_id.toString();
        if (!referrerMap.has(referrerId)) {
          referrerMap.set(referrerId, []);
        }
        referrerMap.get(referrerId).push({
          userId: user._id,
          username: user.username,
          level: 1,
        });
      }
    });

    const commissionResults = new Map();

    for (const [referrerId, directDownlines] of referrerMap.entries()) {
      let totalCommission = 0;
      let formulaString = "";
      const downlineDetails = [];

      const calculateLevelCommission = (downlines, level) => {
        if (level > maxLevel) return;
        for (const downline of downlines) {
          const userNetAmount =
            userNetAmounts.find(
              (u) => u.userId.toString() === downline.userId.toString()
            )?.netAmount || 0;

          if (userNetAmount > 0) {
            const percentage = commission.winLoseCommission[level] || 0;
            const commissionAmount = (userNetAmount * percentage) / 100;

            totalCommission += commissionAmount;
            formulaString += `${
              downline.username
            }(L${level}): ${userNetAmount} * ${percentage}% = ${commissionAmount.toFixed(
              2
            )}\n`;

            downlineDetails.push({
              level,
              username: downline.username,
              netAmount: userNetAmount,
              commission: commissionAmount,
            });
          }
          const nextLevelDownlines =
            referrerMap.get(downline.userId.toString()) || [];
          calculateLevelCommission(nextLevelDownlines, level + 1);
        }
      };
      calculateLevelCommission(directDownlines, 1);
      if (totalCommission > 0) {
        commissionResults.set(referrerId, {
          totalCommission,
          formula: formulaString,
          downlineDetails,
        });
      }
    }

    const agentUsers = await User.find({
      _id: { $in: Array.from(commissionResults.keys()) },
    }).select("username _id");

    const agentMap = new Map(
      agentUsers.map((agent) => [agent._id.toString(), agent.username])
    );

    const reports = [];
    for (const [referrerId, result] of commissionResults) {
      reports.push(
        AgentCommissionReport.create({
          agentId: referrerId,
          agentUsername: agentMap.get(referrerId),
          calculationType: "winlose",
          commissionAmount: roundToTwoDecimals(result.totalCommission),
          formula: result.formula,
          downlineDetailWinLoss: result.downlineDetails,
          status: "approved",
          remark: `${moment(weekStart).format("YYYY-MM-DD")} to ${moment(
            weekEnd
          ).format("YYYY-MM-DD")}`,
        })
      );
    }
    await Promise.all(reports);
    console.log("Commission calculation completed successfully");
  } catch (error) {
    console.error("Error calculating winlose commission:", error);
    throw error;
  }
};

const calculateTurnoverCommission = async () => {
  console.log("====== STARTING TURNOVER COMMISSION CALCULATION ======");

  const mockTurnoverData = {
    test1: {
      "25-04-2025": {
        "Slot Games": 600000,
        Lottery: 6000,
        "Live Casino": 4850,
        Sports: 2220,
        Fishing: 1000,
        "E-Sports": 4500,
      },
      "26-04-2025": {
        "Slot Games": 5000,
        Others: 6000,
        "Live Casino": 4850,
        Sports: 2220,
      },
    },
    test2: {
      "25-04-2025": {
        "Slot Games": 5000,
        Others: 6000,
        "Live Casino": 4850,
        Sports: 2220,
      },
      "26-04-2025": {
        "Slot Games": 5000,
        Others: 6000,
        "Live Casino": 4850,
        Sports: 2220,
      },
    },
    60147852369: {
      "10-03-2025": {
        "Slot Games": 5000,
        Others: 6000,
        "Live Casino": 4850,
        Sports: 2220,
      },
      "16-03-2025": {
        "Slot Games": 5000,
        Others: 6000,
        "Live Casino": 4850,
        Sports: 2220,
      },
    },
  };

  console.log("Mock turnover data loaded:", Object.keys(mockTurnoverData));
  try {
    console.log("Fetching commission settings...");
    const commission = await AgentCommission.findOne();
    console.log("Commission settings found:", commission ? "Yes" : "No");
    if (!commission || !commission.isActive) {
      console.log(
        "No commission settings or commission not active, exiting function"
      );
      return;
    }
    const maxUpline = parseInt(commission.maxDownline) || 1;
    console.log(`Maximum upline level: ${maxUpline}`);
    console.log(
      "Commission percentages:",
      JSON.stringify(commission.commissionPercentages, null, 2)
    );
    console.log("Calculating date range for previous week...");
    const weekStart = moment().subtract(1, "week").startOf("isoWeek").toDate();
    const weekEnd = moment().subtract(1, "week").endOf("isoWeek").toDate();
    console.log(
      `Date range: ${weekStart.toISOString()} to ${weekEnd.toISOString()}`
    );
    console.log("Filtering turnovers based on date range...");
    const filteredUserTurnovers = {};
    Object.entries(mockTurnoverData).forEach(([username, dates]) => {
      console.log(`\nProcessing user: ${username}`);
      Object.entries(dates).forEach(([date, turnover]) => {
        console.log(`  Checking date: ${date}`);
        const turnoverDate = moment(date, "DD-MM-YYYY").toDate();
        const isInRange = turnoverDate >= weekStart && turnoverDate <= weekEnd;
        console.log(`  Is in date range: ${isInRange}`);
        if (isInRange) {
          if (!filteredUserTurnovers[username]) {
            filteredUserTurnovers[username] = {};
            console.log(
              `  Created entry for user ${username} in filtered turnovers`
            );
          }
          filteredUserTurnovers[username][date] = turnover;
          console.log(`  Added turnover data for ${date} to filtered data`);
        }
      });
    });
    console.log("\nFiltered user turnovers summary:");
    for (const [username, dates] of Object.entries(filteredUserTurnovers)) {
      console.log(
        `User ${username}: ${Object.keys(dates).length} dates within range`
      );
    }
    const agentCommissions = {};
    const usersWithTurnover = await User.find({
      username: { $in: Object.keys(filteredUserTurnovers) },
    }).select("_id username fullname referralBy");
    console.log(`Found ${usersWithTurnover.length} users with turnover data`);
    for (const user of usersWithTurnover) {
      console.log(
        `\n>> Processing user with turnover: ${user.username} (${user._id})`
      );
      const userTurnover = filteredUserTurnovers[user.username];
      if (!userTurnover) {
        console.log(`   No turnover data found for user, skipping`);
        continue;
      }
      await processUplineChain(
        user,
        userTurnover,
        1,
        maxUpline,
        commission,
        agentCommissions
      );
    }
    console.log("\n>> Creating commission reports and updating wallets");
    for (const [agentId, commissionData] of Object.entries(agentCommissions)) {
      if (commissionData.formulaData) {
        let formattedFormula = "";
        const sortedDates = Object.keys(commissionData.formulaData).sort();
        for (const date of sortedDates) {
          const usersData = commissionData.formulaData[date];
          formattedFormula += `${date}\n`;
          const sortedUsers = Object.keys(usersData).sort((a, b) => {
            const levelA = parseInt(a.match(/L(\d+)/)[1]);
            const levelB = parseInt(b.match(/L(\d+)/)[1]);
            return levelA - levelB;
          });
          for (const userLevel of sortedUsers) {
            const categories = usersData[userLevel];
            if (categories.length > 0) {
              formattedFormula += `  ${userLevel}\n${categories.join("\n")}\n`;
            }
          }
          formattedFormula += "\n";
        }
        commissionData.formula = formattedFormula;
      }
    }
    for (const [agentId, commissionData] of Object.entries(agentCommissions)) {
      const {
        totalCommission,
        formula,
        agent,
        downlines,
        categoryTurnover,
        levelData,
      } = commissionData;

      const cappedCommission = Math.min(totalCommission, 1000);

      console.log(`\n   Processing agent: ${agent.username} (${agentId})`);
      console.log(
        `   Total commission: ${roundToTwoDecimals(totalCommission)}`
      );

      if (totalCommission > 1000) {
        console.log(
          `   Commission capped at 1000 (original: ${roundToTwoDecimals(
            totalCommission
          )})`
        );
      }

      if (totalCommission > 0) {
        try {
          const allDownlines = {};
          for (const [downlineUsername, downlineData] of Object.entries(
            downlines
          )) {
            await AgentCommissionReport.create({
              agentId: agentId,
              agentUsername: agent.username,
              agentFullname: agent.fullname,
              downlineUsername: downlineUsername,
              downlineFullname: downlineData.fullname,
              calculationType: "turnover",
              categoryTurnover: downlineData.categoryTurnover,
              totalTurnover: downlineData.totalTurnover,
              downlineLevel: downlineData.level,
              commissionAmount: roundToTwoDecimals(cappedCommission),
              formula: formula,
              status: "approved",
              remark: `${moment(weekStart).format("YYYY-MM-DD")} to ${moment(
                weekEnd
              ).format("YYYY-MM-DD")}`,
            });
          }
          console.log(`   Commission reports created successfully`);
          const weekStartFormatted = moment(weekStart).format("DD/MM/YYYY");
          const weekEndFormatted = moment(weekEnd).format("DD/MM/YYYY");
          const commissionPeriod = `${weekStartFormatted} - ${weekEndFormatted}`;
          await updateAgentWallet(agentId, cappedCommission, commissionPeriod);
          console.log(`   Agent wallet updated with ${cappedCommission}`);
        } catch (err) {
          console.error(
            `   Error creating report or updating wallet: ${err.message}`
          );
        }
      } else {
        console.log(`   No commission to pay, skipping report creation`);
      }
    }
    console.log(
      "\n====== TURNOVER COMMISSION CALCULATION COMPLETED SUCCESSFULLY ======"
    );
  } catch (error) {
    console.error("\n====== ERROR IN TURNOVER COMMISSION CALCULATION ======");
    console.error(`Error message: ${error.message}`);
    console.error(`Error stack: ${error.stack}`);
    throw error;
  }
};

async function processUplineChain(
  user,
  userTurnover,
  currentLevel,
  maxLevel,
  commission,
  agentCommissions
) {
  if (currentLevel > maxLevel || !user.referralBy || !user.referralBy.user_id) {
    return;
  }
  const referrerId = user.referralBy.user_id.toString();
  console.log(`   Processing upline level ${currentLevel}: ${referrerId}`);
  const levelCommissionRates =
    commission.commissionPercentages[currentLevel.toString()];
  if (!levelCommissionRates) {
    console.log(
      `   No commission rates defined for level ${currentLevel}, skipping`
    );
    return;
  }
  const referrer = await User.findById(referrerId).select(
    "_id username fullname referralBy"
  );
  if (!referrer) {
    console.log(`   Referrer not found, skipping`);
    return;
  }
  console.log(`   Referrer found: ${referrer.username}`);
  if (!agentCommissions[referrerId]) {
    agentCommissions[referrerId] = {
      agent: referrer,
      totalCommission: 0,
      formula: "",
      formulaData: {},
      downlines: {},
      categoryTurnover: {},
      levelData: {},
    };
  }
  if (!agentCommissions[referrerId].formulaData) {
    agentCommissions[referrerId].formulaData = {};
  }
  if (!agentCommissions[referrerId].levelData[currentLevel]) {
    agentCommissions[referrerId].levelData[currentLevel] = {
      downlines: {},
      categoryTurnover: {},
      totalTurnover: 0,
    };
  }
  if (
    !agentCommissions[referrerId].levelData[currentLevel].downlines[
      user.username
    ]
  ) {
    agentCommissions[referrerId].levelData[currentLevel].downlines[
      user.username
    ] = {
      categoryTurnover: {},
      totalTurnover: 0,
    };
  }
  if (!agentCommissions[referrerId].downlines) {
    agentCommissions[referrerId].downlines = {};
  }
  if (!agentCommissions[referrerId].downlines[user.username]) {
    agentCommissions[referrerId].downlines[user.username] = {
      categoryTurnover: {},
      totalTurnover: 0,
      level: currentLevel,
      fullname: user.fullname,
    };
  }
  let levelCommission = 0;
  Object.entries(userTurnover).forEach(([date, categories]) => {
    const formattedDate = moment(date, "DD-MM-YYYY").format("DD/MM/YYYY");
    const displayName = user.username.toUpperCase();
    const userLevelKey = `${displayName}(L${currentLevel})`;
    if (!agentCommissions[referrerId].formulaData[formattedDate]) {
      agentCommissions[referrerId].formulaData[formattedDate] = {};
    }
    if (
      !agentCommissions[referrerId].formulaData[formattedDate][userLevelKey]
    ) {
      agentCommissions[referrerId].formulaData[formattedDate][userLevelKey] =
        [];
    }
    Object.entries(categories).forEach(([category, turnover]) => {
      if (!agentCommissions[referrerId].categoryTurnover[category]) {
        agentCommissions[referrerId].categoryTurnover[category] = 0;
      }
      agentCommissions[referrerId].categoryTurnover[category] += turnover;
      if (
        !agentCommissions[referrerId].levelData[currentLevel].categoryTurnover[
          category
        ]
      ) {
        agentCommissions[referrerId].levelData[currentLevel].categoryTurnover[
          category
        ] = 0;
      }
      agentCommissions[referrerId].levelData[currentLevel].categoryTurnover[
        category
      ] += turnover;
      agentCommissions[referrerId].levelData[currentLevel].totalTurnover +=
        turnover;
      if (
        !agentCommissions[referrerId].levelData[currentLevel].downlines[
          user.username
        ].categoryTurnover[category]
      ) {
        agentCommissions[referrerId].levelData[currentLevel].downlines[
          user.username
        ].categoryTurnover[category] = 0;
      }
      agentCommissions[referrerId].levelData[currentLevel].downlines[
        user.username
      ].categoryTurnover[category] += turnover;
      agentCommissions[referrerId].levelData[currentLevel].downlines[
        user.username
      ].totalTurnover += turnover;
      if (
        !agentCommissions[referrerId].downlines[user.username].categoryTurnover[
          category
        ]
      ) {
        agentCommissions[referrerId].downlines[user.username].categoryTurnover[
          category
        ] = 0;
      }
      agentCommissions[referrerId].downlines[user.username].categoryTurnover[
        category
      ] += turnover;
      agentCommissions[referrerId].downlines[user.username].totalTurnover +=
        turnover;
      const rate = levelCommissionRates[category] || 0;
      if (rate > 0) {
        const categoryCommission = (turnover * rate) / 100;
        levelCommission += categoryCommission;
        agentCommissions[referrerId].totalCommission += categoryCommission;
        agentCommissions[referrerId].formulaData[formattedDate][
          userLevelKey
        ].push(
          `    ${category}: ${turnover} * ${rate}% = ${categoryCommission.toFixed(
            2
          )}`
        );
        console.log(
          `     ${category}: ${turnover} * ${rate}% = ${categoryCommission.toFixed(
            2
          )}`
        );
      }
    });
  });
  console.log(
    `   Level ${currentLevel} commission for agent ${
      referrer.username
    }: ${levelCommission.toFixed(2)}`
  );
  await processUplineChain(
    referrer,
    userTurnover,
    currentLevel + 1,
    maxLevel,
    commission,
    agentCommissions
  );
}

const updateAgentWallet = async (agentId, commissionAmount) => {
  try {
    const kioskSettings = await kioskbalance.findOne({});
    if (kioskSettings && kioskSettings.status) {
      const agent = await User.findById(agentId);
      if (!agent) {
        console.error(`Agent not found: ${agentId}`);
        return;
      }
      const kioskResult = await updateKioskBalance(
        "subtract",
        commissionAmount,
        {
          username: agent.username,
          transactionType: "agent commission",
          remark: `Agent Commission Payment`,
          processBy: "system",
        }
      );

      if (!kioskResult.success) {
        console.error(
          `Failed to update kiosk balance for agent ${agent.username}: ${kioskResult.message}`
        );
      }
    }
    const weekStart = moment()
      .subtract(1, "week")
      .startOf("isoWeek")
      .format("DD/MM/YYYY");
    const weekEnd = moment()
      .subtract(1, "week")
      .endOf("isoWeek")
      .format("DD/MM/YYYY");
    const commissionPeriod = `${weekStart} - ${weekEnd}`;
    await User.findOneAndUpdate(
      { _id: agentId },
      { $inc: { wallet: commissionAmount } }
    );
    await UserWalletLog.create({
      userId: agentId,
      transactiontype: "agent commission",
      amount: commissionAmount,
      status: "approved",
      promotionnameEN: `${commissionPeriod}`,
      promotionnameCN: `${commissionPeriod}`,
      transactiontime: new Date(),
    });
  } catch (error) {
    console.error("Error updating agent wallet:", error);
    throw error;
  }
};

async function getAgentDownlines(agentId, maxLevel) {
  const downlines = {};
  for (let i = 1; i <= maxLevel; i++) {
    downlines[i] = await User.find({
      parentAgentId:
        i === 1 ? agentId : { $in: downlines[i - 1].map((u) => u._id) },
    });
  }
  return downlines;
}

const calculateUserTurnoverCommission = async (userId) => {
  console.log("====== STARTING USER TURNOVER COMMISSION CALCULATION ======");
  console.log(`Processing for user ID: ${userId}`);
  try {
    const user = await User.findById(userId);
    if (!user) {
      console.log(`User not found: ${userId}`);
      return {
        success: false,
        message: {
          en: "User not found",
          zh: "找不到用户",
          ms: "Pengguna tidak dijumpai",
        },
        amount: 0,
      };
    }

    if (user.duplicateIP) {
      console.log(
        `User ${user.username} has duplicateIP=true, blocking commission`
      );
      return {
        success: false,
        message: {
          en: "Commission not available due to account restrictions",
          zh: "由于账户限制，佣金不可用",
          ms: "Komisen tidak tersedia kerana sekatan akaun",
        },
        amount: 0,
      };
    }

    console.log(`Processing for user: ${user.username}`);
    const commission = await AgentCommission.findOne();
    if (!commission || !commission.isActive) {
      console.log("No commission settings or commission not active");
      return {
        success: false,
        message: {
          en: "Commission feature is not active",
          zh: "佣金功能未激活",
          ms: "Ciri komisen tidak aktif",
        },
        amount: 0,
      };
    }

    try {
      const response = await axios.get(
        `${process.env.BASE_URL}api/user/getCommissionDatatest?userId=${userId}`
      );
      if (!response.data.success) {
        console.log("API call failed:", response.data.message);
        return {
          success: false,
          message: {
            en: "Failed to retrieve commission data",
            zh: "获取佣金数据失败",
            ms: "Gagal mendapatkan data komisen",
          },
          amount: 0,
        };
      }
      mockTurnoverData = response.data.data;
    } catch (error) {
      console.error("Error fetching commission data:", error.message);
      return {
        success: false,
        message: {
          en: "An error occurred while retrieving commission data",
          zh: "获取佣金数据时发生错误",
          ms: "Ralat berlaku semasa mendapatkan data komisen",
        },
        amount: 0,
      };
    }

    if (
      mockTurnoverData.downlines &&
      Object.keys(mockTurnoverData.downlines).length > 0
    ) {
      const downlineUsernames = Object.keys(mockTurnoverData.downlines);
      const downlineUsers = await User.find({
        username: { $in: downlineUsernames },
      }).select("username duplicateIP");
      const duplicateIPMap = new Map();
      downlineUsers.forEach((user) => {
        duplicateIPMap.set(user.username, user.duplicateIP || false);
      });
      const filteredDownlines = {};
      let excludedDownlinesCount = 0;
      for (const [downlineUsername, turnoverByDate] of Object.entries(
        mockTurnoverData.downlines
      )) {
        const hasDuplicateIP = duplicateIPMap.get(downlineUsername);
        if (hasDuplicateIP) {
          console.log(
            `Excluding downline ${downlineUsername} due to duplicateIP=true`
          );
          excludedDownlinesCount++;
          continue;
        }
        filteredDownlines[downlineUsername] = turnoverByDate;
      }
      console.log(
        `Excluded ${excludedDownlinesCount} downlines due to duplicateIP restrictions`
      );
      console.log(
        `Processing ${
          Object.keys(filteredDownlines).length
        } valid downlines for commission calculation`
      );
      mockTurnoverData.downlines = filteredDownlines;
      if (Object.keys(filteredDownlines).length === 0) {
        console.log("No valid downlines found after duplicateIP filtering");
        return {
          success: false,
          message: {
            en: "No eligible downlines found for commission calculation",
            zh: "没有符合条件的下线可以计算佣金",
            ms: "Tiada downline yang layak untuk pengiraan komisen",
          },
          amount: 0,
        };
      }
    } else {
      console.log("No downlines found in commission data");
      return {
        success: false,
        message: {
          en: "No downlines found for commission calculation",
          zh: "没有找到下线进行佣金计算",
          ms: "Tiada downline dijumpai untuk pengiraan komisen",
        },
        amount: 0,
      };
    }

    // const mockTurnoverData = {
    //   // 佣金计算的起止日期
    //   startDate: "01-05-2025",
    //   endDate: "07-05-2025",

    //   // 下线数据
    //   downlines: {
    //     test1: {
    //       "02-05-2025": {
    //         "Slot Games": 600000,
    //         Lottery: 6000,
    //         "Live Casino": 4850,
    //         Sports: 2220,
    //         Fishing: 1000,
    //         "E-Sports": 4500,
    //         downlineLevel: 1,
    //       },
    //       "05-05-2025": {
    //         "Slot Games": 5000,
    //         Others: 6000,
    //         "Live Casino": 4850,
    //         Sports: 2220,
    //         downlineLevel: 1,
    //       },
    //     },
    //     test2: {
    //       "03-05-2025": {
    //         "Slot Games": 5000,
    //         Others: 6000,
    //         "Live Casino": 4850,
    //         Sports: 2220,
    //         downlineLevel: 2,
    //       },
    //       "06-05-2025": {
    //         "Slot Games": 5000,
    //         Others: 6000,
    //         "Live Casino": 4850,
    //         Sports: 2220,
    //         downlineLevel: 2,
    //       },
    //     },
    //     test3: {
    //       "01-05-2025": {
    //         "Slot Games": 5000,
    //         Others: 6000,
    //         "Live Casino": 4850,
    //         Sports: 2220,
    //         downlineLevel: 3,
    //       },
    //       "07-05-2025": {
    //         "Slot Games": 5000,
    //         Others: 6000,
    //         "Live Casino": 4850,
    //         Sports: 2220,
    //         downlineLevel: 3,
    //       },
    //     },
    //   },
    // };

    console.log(
      "Mock turnover data loaded with date range:",
      mockTurnoverData.startDate,
      "to",
      mockTurnoverData.endDate
    );
    console.log(
      "Downlines count:",
      Object.keys(mockTurnoverData.downlines).length
    );
    const startDate = moment(mockTurnoverData.startDate, "DD-MM-YYYY").toDate();
    const endDate = moment(mockTurnoverData.endDate, "DD-MM-YYYY").toDate();
    const startDateFormatted = moment(startDate).format("DD/MM/YYYY");
    const endDateFormatted = moment(endDate).format("DD/MM/YYYY");
    const commissionPeriod = `${startDateFormatted} - ${endDateFormatted}`;
    console.log(`Commission period: ${commissionPeriod}`);
    let totalCommission = 0;
    let downlinesData = {};
    let downlineFormulaData = {};
    for (const [downlineUsername, turnoverByDate] of Object.entries(
      mockTurnoverData.downlines
    )) {
      console.log(`\nProcessing downline: ${downlineUsername}`);
      const downlineCategories = {};
      let downlineTotalTurnover = 0;
      let downlineLevel = 1;
      let downlineCommission = 0;
      downlineFormulaData[downlineUsername] = {};
      for (const [date, turnoverData] of Object.entries(turnoverByDate)) {
        const formattedDate = moment(date, "DD-MM-YYYY").format("DD/MM/YYYY");
        downlineLevel = turnoverData.downlineLevel || 1;
        if (!downlineFormulaData[downlineUsername][formattedDate]) {
          downlineFormulaData[downlineUsername][formattedDate] = {};
        }
        const userLevelKey = `${downlineUsername.toUpperCase()}(L${downlineLevel})`;
        if (
          !downlineFormulaData[downlineUsername][formattedDate][userLevelKey]
        ) {
          downlineFormulaData[downlineUsername][formattedDate][userLevelKey] =
            [];
        }
        for (const [category, turnover] of Object.entries(turnoverData)) {
          if (category === "downlineLevel") continue;
          if (!downlineCategories[category]) {
            downlineCategories[category] = 0;
          }
          downlineCategories[category] += turnover;
          downlineTotalTurnover += turnover;
          const rate =
            commission.commissionPercentages[downlineLevel.toString()]?.[
              category
            ] || 0;

          if (rate > 0) {
            const categoryCommission = (turnover * rate) / 100;
            totalCommission += categoryCommission;
            downlineCommission += categoryCommission;
            downlineFormulaData[downlineUsername][formattedDate][
              userLevelKey
            ].push(
              `    ${category}: ${turnover} * ${rate}% = ${categoryCommission.toFixed(
                2
              )}`
            );

            console.log(
              `  ${category}: ${turnover} * ${rate}% = ${categoryCommission.toFixed(
                2
              )}`
            );
          }
        }
      }
      downlinesData[downlineUsername] = {
        categoryTurnover: downlineCategories,
        totalTurnover: downlineTotalTurnover,
        level: downlineLevel,
        commission: downlineCommission,
      };
    }
    const roundedCommission = roundToTwoDecimals(totalCommission);
    console.log(`Total commission calculated: ${roundedCommission}`);
    if (roundedCommission < 1) {
      console.log("Commission amount is less than 1, cannot claim");
      return {
        success: false,
        message: {
          en: `Your commission amount (${roundedCommission}) is less than 1, cannot claim yet`,
          zh: `您的佣金金额(${roundedCommission})少于1，暂时无法领取`,
          ms: `Jumlah komisen anda (${roundedCommission}) kurang daripada 1, tidak boleh dituntut lagi`,
        },
        amount: roundedCommission,
      };
    }
    let totalAdjustedCommission = 0;
    for (const [downlineUsername, downlineData] of Object.entries(
      downlinesData
    )) {
      let formattedFormula = "";
      const downlineFormula = downlineFormulaData[downlineUsername];
      const sortedDates = Object.keys(downlineFormula).sort();
      for (const date of sortedDates) {
        const usersData = downlineFormula[date];
        formattedFormula += `${date}\n`;
        const sortedUsers = Object.keys(usersData).sort((a, b) => {
          const levelA = parseInt(a.match(/L(\d+)/)[1]);
          const levelB = parseInt(b.match(/L(\d+)/)[1]);
          return levelA - levelB;
        });
        for (const userLevel of sortedUsers) {
          const categories = usersData[userLevel];
          if (categories.length > 0) {
            formattedFormula += `  ${userLevel}\n${categories.join("\n")}\n`;
          }
        }
        formattedFormula += "\n";
      }
      let downlineCommission = roundToTwoDecimals(downlineData.commission);
      let originalCommission = downlineCommission;
      if (downlineCommission > 1000) {
        downlineCommission = 1000;
        console.log(
          `Commission for downline ${downlineUsername} capped at 1000 MYR (original: ${originalCommission})`
        );
      }
      totalAdjustedCommission += downlineCommission;
      await AgentCommissionReport.create({
        agentId: userId,
        agentUsername: user.username,
        agentFullname: user.fullname,
        downlineUsername: downlineUsername,
        downlineFullname: "",
        calculationType: "turnover",
        categoryTurnover: downlineData.categoryTurnover,
        totalTurnover: downlineData.totalTurnover,
        downlineLevel: downlineData.level,
        commissionAmount: downlineCommission,
        formula: formattedFormula,
        status: "approved",
        remark: `${startDateFormatted} to ${endDateFormatted}`,
      });
      console.log(
        `Created commission report for downline ${downlineUsername} with commission ${downlineCommission}`
      );
    }
    totalAdjustedCommission = roundToTwoDecimals(totalAdjustedCommission);
    console.log(`Total adjusted commission: ${totalAdjustedCommission}`);
    const transactionId = `COM${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const NewBonusTransaction = new Bonus({
      transactionId: transactionId,
      userId: userId,
      username: user.username,
      fullname: user.fullname,
      transactionType: "bonus",
      processBy: user.username,
      amount: totalAdjustedCommission,
      status: "approved",
      method: "manual",
      remark: "-",
      promotionname: "佣金",
      promotionnameEN: "Commission",
      promotionId: "6824c18db6b20f85bf963190",
      processtime: "-",
    });
    await NewBonusTransaction.save();
    await User.findByIdAndUpdate(userId, {
      $inc: { wallet: totalAdjustedCommission },
      lastCommissionClaim: new Date(),
    });
    await UserWalletLog.create({
      userId: userId,
      transactiontype: "agent commission",
      amount: totalAdjustedCommission,
      status: "approved",
      promotionnameEN: `${commissionPeriod}`,
      promotionnameCN: `${commissionPeriod}`,
      transactiontime: new Date(),
    });
    console.log(
      `Commission of ${totalAdjustedCommission} successfully processed for user ${user.username}`
    );
    return {
      success: true,
      message: {
        en: `Commission of ${totalAdjustedCommission} has been added to your wallet`,
        zh: `佣金 ${totalAdjustedCommission} 已添加到您的钱包`,
        ms: `Komisen ${totalAdjustedCommission} telah ditambahkan ke dompet anda`,
      },
      amount: totalAdjustedCommission,
    };
  } catch (error) {
    console.error(
      "\n====== ERROR IN USER TURNOVER COMMISSION CALCULATION ======"
    );
    console.error(`Error message: ${error.message}`);
    console.error(`Error stack: ${error.stack}`);

    return {
      success: false,
      message: {
        en: "An error occurred while processing your commission",
        zh: "处理佣金时发生错误",
        ms: "Ralat berlaku semasa memproses komisen anda",
      },
      amount: 0,
    };
  }
};

async function initializeSchedule() {
  try {
    const commission = await AgentCommission.findOne();
    if (commission && commission.isActive) {
      await setScheduledJob({
        type: commission.type,
        weekDay: commission.weekDay,
        monthDay: commission.monthDay,
        hour: commission.hour,
        minute: commission.minute,
      });
    }
  } catch (error) {
    console.error("Schedule initialization error:", error);
  }
}

const getUserCommissionData = async (userId) => {
  try {
    console.log("====== STARTING GET COMMISSION DATA FUNCTION ======");
    const startProcessTime = Date.now();

    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return {
        success: false,
        message: "User not found",
      };
    }

    console.log(`Processing commission data for user: ${currentUser.username}`);

    let startDate, endDate;
    endDate = moment.utc().add(8, "hours").endOf("day").toDate();

    if (currentUser.lastCommissionClaim) {
      startDate = moment(currentUser.lastCommissionClaim)
        .utc()
        .add(8, "hours")
        .startOf("day")
        .toDate();
      console.log(
        `User has previous commission claim. Start date set to: ${startDate.toISOString()}`
      );
    } else {
      startDate = moment(currentUser.createdAt)
        .utc()
        .add(8, "hours")
        .startOf("day")
        .toDate();
      console.log(
        `No previous commission claim found. Using user creation date: ${startDate.toISOString()}`
      );
    }

    console.log(
      `Date range for commission data: ${startDate.toISOString()} to ${endDate.toISOString()}`
    );

    // Fetch commission settings
    const commission = await AgentCommission.findOne();
    if (!commission || !commission.isActive) {
      console.log("Commission system is not active");
      return {
        success: false,
        message: "Commission system is not active",
      };
    }

    const maxDownlineLevel = parseInt(commission.maxDownline) || 1;
    console.log(`Maximum downline level: ${maxDownlineLevel}`);

    const startDateFormatted = moment(startDate).utc().format("DD-MM-YYYY");
    const endDateFormatted = moment(endDate).utc().format("DD-MM-YYYY");

    const commissionData = {
      startDate: startDateFormatted,
      endDate: endDateFormatted,
      downlines: {},
    };

    // Find all of the user's downlines up to maxDownlineLevel
    console.log(
      `Finding downlines for user ${currentUser.username} up to level ${maxDownlineLevel}...`
    );

    const directDownlines = await User.find({
      "referralBy.user_id": currentUser._id,
    })
      .select("_id username fullname referralBy")
      .lean();

    console.log(`Found ${directDownlines.length} direct downlines (level 1)`);

    let allDownlines = [];

    allDownlines = directDownlines.map((user) => ({
      ...user,
      level: 1,
    }));

    let currentLevelDownlines = directDownlines;

    for (let level = 2; level <= maxDownlineLevel; level++) {
      if (currentLevelDownlines.length === 0) break;

      const downlineIds = currentLevelDownlines.map((d) => d._id);

      const nextLevelDownlines = await User.find({
        "referralBy.user_id": { $in: downlineIds },
      })
        .select("_id username fullname referralBy")
        .lean();

      console.log(
        `Found ${nextLevelDownlines.length} downlines at level ${level}`
      );

      allDownlines = allDownlines.concat(
        nextLevelDownlines.map((user) => ({
          ...user,
          level: level,
        }))
      );

      currentLevelDownlines = nextLevelDownlines;
    }

    console.log(
      `Total downlines found across all levels: ${allDownlines.length}`
    );

    if (allDownlines.length === 0) {
      console.log("No downlines found for commission calculation");
      return {
        success: true,
        message: "No downlines found for commission calculation",
        data: commissionData,
      };
    }

    const dateRange = [];
    let currentDate = moment(startDate);
    while (currentDate <= moment(endDate)) {
      dateRange.push(currentDate.format("YYYY-MM-DD"));
      currentDate = currentDate.add(1, "days");
    }

    console.log(
      `Processing ${dateRange.length} days of data for ${allDownlines.length} downlines`
    );

    // For each downline, get their GameDataLog entries within the date range
    for (const downline of allDownlines) {
      console.log(
        `Processing downline: ${downline.username} (Level ${downline.level})`
      );

      // Get all GameDataLog entries for this downline within the date range
      const gameDataLogs = await GameDataValidLog.find({
        username: downline.username,
        date: { $in: dateRange },
      }).lean();

      console.log(
        `Found ${gameDataLogs.length} game data logs for ${downline.username}`
      );

      for (const log of gameDataLogs) {
        const logDate = moment(log.date).format("DD-MM-YYYY");

        if (!commissionData.downlines[downline.username]) {
          commissionData.downlines[downline.username] = {};
        }

        if (!commissionData.downlines[downline.username][logDate]) {
          commissionData.downlines[downline.username][logDate] = {
            downlineLevel: downline.level,
          };
        }

        const gameCategories =
          log.gameCategories instanceof Map
            ? Object.fromEntries(log.gameCategories)
            : log.gameCategories;

        if (gameCategories) {
          Object.keys(gameCategories).forEach((categoryName) => {
            const category =
              gameCategories[categoryName] instanceof Map
                ? Object.fromEntries(gameCategories[categoryName])
                : gameCategories[categoryName];

            Object.keys(category).forEach((gameName) => {
              const game = category[gameName];
              const validTurnover = Number(game.turnover || 0);

              if (validTurnover > 0) {
                if (
                  !commissionData.downlines[downline.username][logDate][
                    categoryName
                  ]
                ) {
                  commissionData.downlines[downline.username][logDate][
                    categoryName
                  ] = 0;
                }

                commissionData.downlines[downline.username][logDate][
                  categoryName
                ] += validTurnover;
              }
            });
          });
        }
      }

      if (commissionData.downlines[downline.username]) {
        for (const dateKey of Object.keys(
          commissionData.downlines[downline.username]
        )) {
          const dateData = commissionData.downlines[downline.username][dateKey];
          let hasTurnover = false;

          for (const category of Object.keys(dateData)) {
            if (category !== "downlineLevel" && dateData[category] > 0) {
              dateData[category] = Number(dateData[category].toFixed(2));
              hasTurnover = true;
            }
          }

          if (!hasTurnover) {
            delete commissionData.downlines[downline.username][dateKey];
          }
        }

        if (
          Object.keys(commissionData.downlines[downline.username]).length === 0
        ) {
          delete commissionData.downlines[downline.username];
        }
      }
    }

    const executionTime = Date.now() - startProcessTime;
    console.log(
      `====== GET COMMISSION DATA COMPLETED IN ${executionTime}ms ======`
    );

    return {
      success: true,
      message: "Commission data retrieved successfully",
      executionTime,
      data: commissionData,
    };
  } catch (error) {
    console.error("Error retrieving commission data:", error);
    return {
      success: false,
      message: "An error occurred while retrieving commission data",
      error: error.message,
    };
  }
};

// Example usage in a route:
router.get("/api/user/getCommissionDatatest", async (req, res) => {
  try {
    const userId = req.query.userId;
    const result = await getUserCommissionData(userId);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Error in commission data route:", error);
    return res.status(500).json({
      success: false,
      message: {
        en: "An error occurred while retrieving commission data",
        zh: "获取佣金数据时发生错误",
        ms: "Ralat berlaku semasa mengambil data komisen",
      },
      error: error.message,
    });
  }
});

router.get(
  "/api/user/getCommissionDatahahaha",
  authenticateToken,
  async (req, res) => {
    try {
      console.log("====== STARTING GET COMMISSION DATA ROUTE ======");
      const startProcessTime = Date.now();
      const userId = req.user.userId;

      // Find the current user
      const currentUser = await User.findById(userId);
      if (!currentUser) {
        return res.status(404).json({
          success: false,
          message: {
            en: "User not found",
            zh: "未找到用户",
            ms: "Pengguna tidak dijumpai",
          },
        });
      }

      console.log(
        `Processing commission data for user: ${currentUser.username}`
      );

      // Determine date range based on lastCommissionClaim
      let startDate, endDate;
      endDate = moment.utc().add(8, "hours").endOf("day").toDate(); // Today

      if (currentUser.lastCommissionClaim) {
        // If user has claimed commission before, use that date as start date
        startDate = moment(currentUser.lastCommissionClaim)
          .utc()
          .add(8, "hours")
          .startOf("day")
          .toDate();
        console.log(
          `User has previous commission claim. Start date set to: ${startDate.toISOString()}`
        );
      } else {
        // If never claimed, use user creation date
        startDate = moment(currentUser.createdAt)
          .utc()
          .add(8, "hours")
          .startOf("day")
          .toDate();
        console.log(
          `No previous commission claim found. Using user creation date: ${startDate.toISOString()}`
        );
      }

      console.log(
        `Date range for commission data: ${startDate.toISOString()} to ${endDate.toISOString()}`
      );

      // Fetch commission settings
      const commission = await AgentCommission.findOne();
      if (!commission || !commission.isActive) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Commission system is not active",
            zh: "佣金系统未激活",
            ms: "Sistem komisen tidak aktif",
          },
        });
      }

      // Get max downline level from commission settings
      const maxDownlineLevel = parseInt(commission.maxDownline) || 1;
      console.log(`Maximum downline level: ${maxDownlineLevel}`);

      // Format dates for response
      const startDateFormatted = moment(startDate).format("DD-MM-YYYY");
      const endDateFormatted = moment(endDate).format("DD-MM-YYYY");

      // Initialize response data structure
      const commissionData = {
        startDate: startDateFormatted,
        endDate: endDateFormatted,
        downlines: {},
      };

      // Find all of the user's downlines up to maxDownlineLevel
      console.log(
        `Finding downlines for user ${currentUser.username} up to level ${maxDownlineLevel}...`
      );

      // Find direct downlines (level 1)
      const directDownlines = await User.find({
        "referralBy.user_id": currentUser._id,
      })
        .select("_id username fullname referralBy")
        .lean();

      console.log(`Found ${directDownlines.length} direct downlines (level 1)`);

      // Store all downlines with their levels
      let allDownlines = [];

      // Add direct downlines with level 1
      allDownlines = directDownlines.map((user) => ({
        ...user,
        level: 1,
      }));

      // Find deeper level downlines (2 to maxDownlineLevel)
      let currentLevelDownlines = directDownlines;

      for (let level = 2; level <= maxDownlineLevel; level++) {
        if (currentLevelDownlines.length === 0) break;

        // Get IDs of current level downlines
        const downlineIds = currentLevelDownlines.map((d) => d._id);

        // Find next level downlines
        const nextLevelDownlines = await User.find({
          "referralBy.user_id": { $in: downlineIds },
        })
          .select("_id username fullname referralBy")
          .lean();

        console.log(
          `Found ${nextLevelDownlines.length} downlines at level ${level}`
        );

        // Add to allDownlines with their level
        allDownlines = allDownlines.concat(
          nextLevelDownlines.map((user) => ({
            ...user,
            level: level,
          }))
        );

        // Update current level downlines for next iteration
        currentLevelDownlines = nextLevelDownlines;
      }

      console.log(
        `Total downlines found across all levels: ${allDownlines.length}`
      );

      // No downlines found
      if (allDownlines.length === 0) {
        return res.status(200).json({
          success: true,
          message: {
            en: "No downlines found for commission calculation",
            zh: "没有找到下线进行佣金计算",
            ms: "Tidak menemukan downline untuk perhitungan komisen",
          },
          data: commissionData,
        });
      }

      // Get the date range as an array of dates
      const dateRange = [];
      let currentDate = moment(startDate);
      while (currentDate <= moment(endDate)) {
        dateRange.push(currentDate.format("YYYY-MM-DD"));
        currentDate = currentDate.add(1, "days");
      }

      console.log(
        `Processing ${dateRange.length} days of data for ${allDownlines.length} downlines`
      );

      // For each downline, get their GameDataLog entries within the date range
      for (const downline of allDownlines) {
        console.log(
          `Processing downline: ${downline.username} (Level ${downline.level})`
        );

        // Get all GameDataLog entries for this downline within the date range
        const gameDataLogs = await GameDataValidLog.find({
          username: downline.username,
          date: { $in: dateRange },
        }).lean();

        console.log(
          `Found ${gameDataLogs.length} game data logs for ${downline.username}`
        );

        // Process each log entry by date
        for (const log of gameDataLogs) {
          const logDate = moment(log.date).format("DD-MM-YYYY");

          // Initialize downline in response if not exists
          if (!commissionData.downlines[downline.username]) {
            commissionData.downlines[downline.username] = {};
          }

          // Initialize date for this downline if not exists
          if (!commissionData.downlines[downline.username][logDate]) {
            commissionData.downlines[downline.username][logDate] = {
              downlineLevel: downline.level,
            };
          }

          // Process game categories in this log
          const gameCategories =
            log.gameCategories instanceof Map
              ? Object.fromEntries(log.gameCategories)
              : log.gameCategories;

          // Sum up turnover from each game category
          if (gameCategories) {
            Object.keys(gameCategories).forEach((categoryName) => {
              const category =
                gameCategories[categoryName] instanceof Map
                  ? Object.fromEntries(gameCategories[categoryName])
                  : gameCategories[categoryName];

              // Process each game in this category
              Object.keys(category).forEach((gameName) => {
                const game = category[gameName];
                const validTurnover = Number(game.turnover || 0); // Use valid turnover

                // Add to the appropriate category in the response
                if (validTurnover > 0) {
                  // Initialize category if not exists
                  if (
                    !commissionData.downlines[downline.username][logDate][
                      categoryName
                    ]
                  ) {
                    commissionData.downlines[downline.username][logDate][
                      categoryName
                    ] = 0;
                  }

                  // Add turnover to category
                  commissionData.downlines[downline.username][logDate][
                    categoryName
                  ] += validTurnover;
                }
              });
            });
          }
        }

        // Format numbers and remove dates with no turnover
        if (commissionData.downlines[downline.username]) {
          for (const dateKey of Object.keys(
            commissionData.downlines[downline.username]
          )) {
            const dateData =
              commissionData.downlines[downline.username][dateKey];
            let hasTurnover = false;

            // Format each category value and check if there's any turnover
            for (const category of Object.keys(dateData)) {
              if (category !== "downlineLevel" && dateData[category] > 0) {
                dateData[category] = Number(dateData[category].toFixed(2));
                hasTurnover = true;
              }
            }

            // Remove date if no turnover in any category
            if (!hasTurnover) {
              delete commissionData.downlines[downline.username][dateKey];
            }
          }

          // Remove downline if no dates with turnover
          if (
            Object.keys(commissionData.downlines[downline.username]).length ===
            0
          ) {
            delete commissionData.downlines[downline.username];
          }
        }
      }

      const executionTime = Date.now() - startProcessTime;
      console.log(
        `====== GET COMMISSION DATA COMPLETED IN ${executionTime}ms ======`
      );

      return res.status(200).json({
        success: true,
        message: {
          en: "Commission data retrieved successfully",
          zh: "佣金数据获取成功",
          ms: "Data komisen berjaya diambil",
        },
        executionTime,
        data: commissionData,
      });
    } catch (error) {
      console.error("Error retrieving commission data:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "An error occurred while retrieving commission data",
          zh: "获取佣金数据时发生错误",
          ms: "Ralat berlaku semasa mengambil data komisen",
        },
        error: error.message,
      });
    }
  }
);

initializeSchedule();

module.exports = router;
