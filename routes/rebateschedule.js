const express = require("express");
const router = express.Router();
const schedule = require("node-schedule");
const { RebateSchedule } = require("../models/rebateSchedule.model");
const { RebateLog } = require("../models/rebate.model");
const Deposit = require("../models/deposit.model");
const Withdraw = require("../models/withdraw.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { User, UserGameData } = require("../models/users.model");
const vip = require("../models/vip.model");
const UserWalletLog = require("../models/userwalletlog.model");
const { getYesterdayGameLogs } = require("../services/gameData");
const { updateKioskBalance } = require("../services/kioskBalanceService");
const kioskbalance = require("../models/kioskbalance.model");
const axios = require("axios");

const moment = require("moment-timezone");

const AGENT_LEVEL_REQUIREMENTS = [
  {
    level: 1,
    requiredVipLevel: 3,
    requiredCount: 3,
    bonus: 100,
  },
  {
    level: 2,
    requiredVipLevel: 6,
    requiredCount: 3,
    bonus: 500,
  },
  {
    level: 3,
    requiredVipLevel: 9,
    requiredCount: 3,
    bonus: 2000,
  },
  {
    level: 4,
    requiredVipLevel: 15,
    requiredCount: 3,
    bonus: 5000,
  },
  {
    level: 5,
    requiredVipLevel: 18,
    requiredCount: 3,
    bonus: 10000,
  },
];

// Update Agent Level & Agent Upgrade Bonus
async function checkAndUpdateAgentLevel(userId) {
  try {
    const agent = await User.findById(userId).populate("referrals.user_id");
    if (!agent) {
      throw new Error("Agent not found");
    }
    console.log("Agent details:", {
      userId: agent._id,
      agentLevel: agent.agentLevel,
      referrals: agent.referrals.length,
    });
    const downlines = agent.referrals.map((ref) => ref.user_id).filter(Boolean);
    let newLevel = agent.agentLevel || 0;
    let bonusToAward = 0;
    let bonusDetails = [];
    for (const requirement of AGENT_LEVEL_REQUIREMENTS) {
      const qualifiedDownlines = downlines.filter(
        (user) => user.viplevel >= requirement.requiredVipLevel
      );
      console.log(
        `Qualified downlines for Level ${requirement.level}:`,
        qualifiedDownlines.length
      );
      if (qualifiedDownlines.length >= requirement.requiredCount) {
        if (requirement.level > (agent.agentLevel || 0)) {
          bonusToAward += requirement.bonus;
          bonusDetails.push({
            fromLevel: requirement.level,
            bonus: requirement.bonus,
          });
        }
        newLevel = Math.max(newLevel, requirement.level);
      }
    }

    if (newLevel > (agent.agentLevel || 0)) {
      console.log(
        `Updating agent level from ${agent.agentLevel || 0} to ${newLevel}`
      );
      const finalBonus = parseFloat(bonusToAward.toFixed(2));
      if (finalBonus > 0) {
        const kioskSettings = await kioskbalance.findOne({});
        if (kioskSettings && kioskSettings.status) {
          const kioskResult = await updateKioskBalance("subtract", finalBonus, {
            username: agent.username,
            transactionType: "agent upgrade bonus",
            remark: `Agent Upgrade Bonus`,
            processBy: "system",
          });
          if (!kioskResult.success) {
            console.error(
              `Failed to update kiosk balance for agent ${agent.username}: ${kioskResult.message}`
            );
          }
        }
      }
      await User.findByIdAndUpdate(userId, {
        $set: { agentLevel: newLevel },
        $inc: { wallet: finalBonus },
      });
      console.log(`Total bonus of ${finalBonus} awarded to user: ${userId}`);
      const bonusBreakdown = bonusDetails
        .map((detail) => `Level ${detail.fromLevel}: ${detail.bonus}`)
        .join(", ");
      await UserWalletLog.create({
        userId: userId,
        transactiontime: new Date(),
        transactiontype: "bonus",
        amount: finalBonus,
        status: "approved",
        promotionnameEN: `Agent Upgrade Bonus`,
        remark: `Upgrade bonus details: ${bonusBreakdown}`,
      });
      return {
        success: true,
        oldLevel: agent.agentLevel || 0,
        newLevel,
        bonusAwarded: finalBonus,
        bonusDetails: bonusDetails,
        qualifiedDownlines: downlines.filter(
          (user) =>
            user.viplevel >=
            AGENT_LEVEL_REQUIREMENTS[newLevel - 1].requiredVipLevel
        ).length,
      };
    }
    console.log("No level update needed for user:", userId);
    return {
      success: true,
      oldLevel: agent.agentLevel || 0,
      newLevel: agent.agentLevel || 0,
      bonusAwarded: 0,
      bonusDetails: [],
      qualifiedDownlines: downlines.length,
    };
  } catch (error) {
    console.error("Error in checkAndUpdateAgentLevel:", error);
    throw error;
  }
}

// Update User VIP Level & Upgrade Bonus
async function calculateAndUpdateVIPLevel(userId, totalTurnover, vipConfig) {
  try {
    const sortedVipLevels = vipConfig.vipLevels
      .map((level) => ({
        name: level.name,
        requirement: parseFloat(level.benefits.get("Turnover Require")) || 0,
        upgradeBonus: parseFloat(level.benefits.get("Upgrade Bonus")) || 0,
        originalLevel: level,
      }))
      .sort((a, b) => a.requirement - b.requirement);

    const minRequirement = sortedVipLevels[0].requirement;
    if (totalTurnover < minRequirement) {
      return;
    }

    let left = 0;
    let right = sortedVipLevels.length - 1;
    let targetIndex = 0;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (sortedVipLevels[mid].requirement <= totalTurnover) {
        targetIndex = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    const newVipLevelData = sortedVipLevels[targetIndex] || {
      name: "0",
      upgradeBonus: 0,
    };
    const newVipLevel = newVipLevelData.name;
    const user = await User.findById(userId);
    if (!user) {
      console.log(`User not found: ID ${userId}`);
      return newVipLevel;
    }
    if (user.viplevel !== newVipLevel) {
      try {
        const currentVipIndex = sortedVipLevels.findIndex(
          (level) => level.name === user.viplevel
        );
        const newVipIndex = sortedVipLevels.findIndex(
          (level) => level.name === newVipLevel
        );
        if (newVipIndex > currentVipIndex) {
          let totalUpgradeBonus = 0;
          const upgradeDetails = [];
          for (let i = currentVipIndex + 1; i <= newVipIndex; i++) {
            const levelBonus = sortedVipLevels[i].upgradeBonus;
            if (levelBonus > 0) {
              totalUpgradeBonus += levelBonus;
              upgradeDetails.push({
                level: sortedVipLevels[i].name,
                bonus: levelBonus,
              });
            }
          }
          if (totalUpgradeBonus > 0) {
            totalUpgradeBonus = parseFloat(totalUpgradeBonus.toFixed(2));

            const kioskSettings = await kioskbalance.findOne({});
            if (kioskSettings && kioskSettings.status) {
              const kioskResult = await updateKioskBalance(
                "subtract",
                totalUpgradeBonus,
                {
                  username: user.username,
                  transactionType: "vip upgrade bonus",
                  remark: `VIP Upgrade Bonus`,
                  processBy: "system",
                }
              );
              if (!kioskResult.success) {
                console.error(
                  `Failed to update kiosk balance for user ${username}: ${kioskResult.message}`
                );
              }
            }
            await User.findOneAndUpdate(
              { _id: user._id },
              {
                $inc: { wallet: totalUpgradeBonus },
                $set: { viplevel: newVipLevel },
              }
            );

            await UserWalletLog.create({
              userId: user._id,
              transactiontime: new Date(),
              transactiontype: "bonus",
              amount: totalUpgradeBonus,
              status: "approved",
              promotionnameEN: `VIP UPGRADE BONUS`,
              remark: `Upgrade bonus details: ${upgradeDetails
                .map((d) => `VIP ${d.level}: ${d.bonus}`)
                .join(", ")}`,
            });
          } else {
            await User.findOneAndUpdate(
              { _id: user._id },
              { $set: { viplevel: newVipLevel } }
            );
          }
          if (user.referralBy && user.referralBy.user_id) {
            try {
              await checkAndUpdateAgentLevel(user.referralBy.user_id);
            } catch (agentError) {
              console.error(
                `Error updating agent level for ${user.username}'s referrer (${user.referralBy}):`,
                agentError
              );
            }
          }
        } else {
          await User.findOneAndUpdate(
            { _id: user._id },
            { $set: { viplevel: newVipLevel } }
          );
        }
      } catch (error) {
        console.error("Error processing VIP upgrade:", error);
        throw error;
      }
    }
    return newVipLevel;
  } catch (error) {
    console.error("Error calculating VIP level:", error);
    throw error;
  }
}

// Process turnover data from game providers and update all users' VIP levels
async function processGameProviderData() {
  try {
    console.log("==== Starting processGameProviderData ====");
    console.log("Preparing to fetch turnover data from game providers...");
    const turnoverRoutes = [
      { route: "spadegaming/getturnoverforfish", provider: "Spade Gaming" },
      { route: "fastspin/getturnoverforfish", provider: "Fastspin" },
      { route: "mega888/getturnoverforrebate", provider: "Mega888" },
      { route: "918kiss/getturnoverforrebate", provider: "918Kiss" },
      { route: "pussy888/getturnoverforrebate", provider: "Pussy888" },
      { route: "xe88/getturnoverforrebate", provider: "XE88" },
    ];
    const allUsersTurnover = {};
    for (const routeInfo of turnoverRoutes) {
      try {
        console.log(
          `Calling ${routeInfo.provider} via route: ${process.env.BASE_URL}api/${routeInfo.route}`
        );
        const response = await axios.post(
          `${process.env.BASE_URL}api/${routeInfo.route}`,
          {
            date: "yesterday",
          }
        );
        console.log(
          `Response from ${routeInfo.provider}:`,
          JSON.stringify(response.data, null, 2)
        );
        if (
          response.data.success &&
          response.data.summary &&
          response.data.summary.users
        ) {
          const { users } = response.data.summary;
          console.log(
            `${routeInfo.provider} returned data for ${
              Object.keys(users).length
            } users`
          );
          for (const [username, userData] of Object.entries(users)) {
            if (!allUsersTurnover[username]) {
              allUsersTurnover[username] = {
                totalTurnover: 0,
                providers: [],
              };
            }
            const turnover = userData.turnover || 0;
            allUsersTurnover[username].totalTurnover += turnover;
            allUsersTurnover[username].providers.push({
              provider: routeInfo.provider,
              turnover: turnover,
              winloss: userData.winloss || 0,
            });
            console.log(
              `Added ${turnover} turnover from ${routeInfo.provider} for user ${username}`
            );
          }
        } else {
          console.log(
            `Invalid response format from ${routeInfo.provider} or no users data`
          );
          console.log(`Response structure:`, Object.keys(response.data));
          if (response.data.summary) {
            console.log(
              `Summary structure:`,
              Object.keys(response.data.summary)
            );
          }
        }
      } catch (error) {
        console.error(
          `Error fetching turnover data from ${routeInfo.provider}:`,
          error
        );
        console.error(`Error details:`, error.message);
        if (error.response) {
          console.error(`Response status: ${error.response.status}`);
          console.error(`Response data:`, error.response.data);
        }
      }
    }
    console.log(
      "Compiled turnover data for all users:",
      JSON.stringify(allUsersTurnover, null, 2)
    );
    console.log(
      `Total users with turnover data: ${Object.keys(allUsersTurnover).length}`
    );
    console.log(`Fetching VIP configuration...`);
    const vipConfig = await vip.findOne();
    if (!vipConfig) {
      console.error("VIP configuration not found");
      throw new Error("VIP configuration not found");
    }
    console.log(
      `VIP configuration loaded with ${vipConfig.vipLevels.length} levels`
    );
    for (const [username, turnoverData] of Object.entries(allUsersTurnover)) {
      if (turnoverData.totalTurnover <= 0) {
        console.log(`Skipping user ${username} - no positive turnover`);
        continue;
      }
      console.log(
        `Processing user ${username} with total turnover: ${turnoverData.totalTurnover}`
      );
      console.log(
        `Provider breakdown for ${username}:`,
        JSON.stringify(turnoverData.providers, null, 2)
      );
      try {
        const user = await User.findOne({ username });
        if (!user) {
          console.log(`User not found in database: ${username}`);
          continue;
        }
        console.log(
          `Found user: ${username} (ID: ${user._id}, Current VIP level: ${user.viplevel}, Current total turnover: ${user.totalturnover})`
        );
        console.log(
          `Updating user's total turnover: ${user.totalturnover} + ${
            turnoverData.totalTurnover
          } = ${user.totalturnover + turnoverData.totalTurnover}`
        );
        await User.findByIdAndUpdate(user._id, {
          $inc: { totalturnover: turnoverData.totalTurnover },
        });
        console.log(`User's totalturnover updated in database`);
        const updatedUser = await User.findById(user._id);
        console.log(
          `Updated user total turnover: ${updatedUser.totalturnover}`
        );
        const newVipLevel = await calculateAndUpdateVIPLevel(
          user._id,
          updatedUser.totalturnover,
          vipConfig
        );
        console.log(
          `VIP level calculation complete for ${username}: ${user.viplevel} -> ${newVipLevel}`
        );
      } catch (error) {
        console.error(`Error processing user ${username}:`, error);
      }
    }
    console.log("==== Completed processGameProviderData ====");
    return { success: true, message: "Processed turnover data for all users" };
  } catch (error) {
    console.error("Error in processGameProviderData:", error);
    console.error("Error stack:", error.stack);
    return { success: false, message: error.message };
  }
}

// Admin Get Rebate Report
router.get(
  "/admin/api/rebate-report",
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
      const rebateLogs = await RebateLog.find(dateFilter).sort({
        createdAt: -1,
      });
      const currentType = rebateLogs[0]?.type || "winlose";
      const formattedLogs = rebateLogs.map((log, index) => {
        if (currentType === "turnover") {
          return {
            type: "turnover",
            username: log.username,
            liveCasino: log.livecasino,
            sports: log.sports,
            slotGames: log.slot,
            fishing: log.fishing,
            poker: log.poker,
            mahjong: log.mahjong,
            eSports: log.esports,
            horse: log.horse,
            lottery: log.lottery,
            formula: log.formula,
            totalRebate: log.totalRebate,
            totalTurnover: log.totalturnover,
            rebateissuesdate: log.createdAt,
          };
        } else {
          return {
            type: "winlose",
            username: log.username,
            totaldeposit: log.totaldeposit,
            totalwithdraw: log.totalwithdraw,
            totalwinlose: log.totalwinlose,
            formula: log.formula,
            totalRebate: log.totalRebate,
            rebateissuesdate: log.createdAt,
          };
        }
      });
      res.json({
        success: true,
        data: formattedLogs,
        type: currentType,
      });
    } catch (error) {
      console.error("Error fetching rebate report:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch rebate report",
        error: error.message,
      });
    }
  }
);

// Admin Get Rebate Schedule
router.get(
  "/admin/api/rebate-schedule",
  authenticateAdminToken,
  async (req, res) => {
    try {
      let schedule = await RebateSchedule.findOne();
      if (!schedule) {
        schedule = await RebateSchedule.create({
          hour: 3,
          minute: 0,
          isActive: true,
          calculationType: "turnover",
          winLosePercentage: 0,
          categoryPercentages: {
            liveCasino: 0,
            sports: 0,
            slotGames: 0,
            fishing: 0,
            poker: 0,
            mahjong: 0,
            eSports: 0,
            horse: 0,
            lottery: 0,
          },
        });
      }
      res.json({ success: true, data: schedule });
    } catch (error) {
      console.error("Error fetching rebate schedule:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch rebate schedule",
        error: error.message,
      });
    }
  }
);

// Admin Create Rebate-Schedule
router.post(
  "/admin/api/rebate-schedule",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const {
        hour,
        minute,
        isActive,
        calculationType,
        winLosePercentage,
        categoryPercentages,
      } = req.body;
      let schedule = await RebateSchedule.findOne();
      if (!schedule) {
        schedule = new RebateSchedule();
      }

      schedule.hour = hour;
      schedule.minute = minute;
      schedule.isActive = isActive;
      schedule.calculationType = calculationType;

      if (calculationType === "winlose") {
        schedule.winLosePercentage = winLosePercentage;
      } else {
        schedule.categoryPercentages = categoryPercentages;
      }

      await schedule.save();

      res.status(200).json({
        success: true,
        message: {
          en: "Rebate schedule updated successfully",
          zh: "返水计划更新成功",
        },
        data: schedule,
      });
    } catch (error) {
      console.error("Error updating rebate schedule:", error);
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

// Admin Manual Action Route (If Needed)
router.post(
  "/admin/api/rebate-calculate/manual",
  // authenticateAdminToken,
  async (req, res) => {
    try {
      await runRebateCalculation();
      res.json({
        success: true,
        message: "Rebate calculation completed",
      });
    } catch (error) {
      console.error("Error running manual rebate calculation:", error);
      res.status(500).json({
        success: false,
        message: "Failed to run rebate calculation",
        error: error.message,
      });
    }
  }
);

// Run Rebate Function
async function runRebateCalculation() {
  try {
    const schedule = await RebateSchedule.findOne();
    if (!schedule) return;
    const now = moment().tz("Asia/Kuala_Lumpur");
    const startDate = moment(now).subtract(1, "day").startOf("day").toDate();
    const endDate = moment(now).subtract(1, "day").endOf("day").toDate();
    if (schedule.calculationType === "winlose") {
      await calculateWinLoseRebate(
        schedule.winLosePercentage,
        startDate,
        endDate
      );
    } else {
      await calculateTurnoverRebate(
        schedule.categoryPercentages,
        startDate,
        endDate
      );
    }
  } catch (error) {
    console.error("Rebate calculation error:", error);
    throw error;
  }
}

// Rebate Based on Winlose
async function calculateWinLoseRebate(percentage, startDate, endDate) {
  try {
    console.log("Calculating for period:", { startDate, endDate });
    const deposits = await Deposit.find({
      createdAt: {
        $gte: moment(new Date(startDate)).utc().toDate(),
        $lte: moment(new Date(endDate)).utc().toDate(),
      },
      status: "approved",
      reverted: false,
    });
    const withdraws = await Withdraw.find({
      createdAt: {
        $gte: moment(new Date(startDate)).utc().toDate(),
        $lte: moment(new Date(endDate)).utc().toDate(),
      },
      status: "approved",
      reverted: false,
    });
    const userStats = {};
    deposits.forEach((deposit) => {
      if (!userStats[deposit.username]) {
        userStats[deposit.username] = {
          totaldeposit: 0,
          totalwithdraw: 0,
          totalwinlose: 0,
          totalRebate: 0,
        };
      }
      userStats[deposit.username].totaldeposit += deposit.amount;
    });
    withdraws.forEach((withdraw) => {
      if (!userStats[withdraw.username]) {
        userStats[withdraw.username] = {
          totaldeposit: 0,
          totalwithdraw: 0,
          totalwinlose: 0,
          totalRebate: 0,
        };
      }
      userStats[withdraw.username].totalwithdraw += withdraw.amount;
    });

    for (const [username, stats] of Object.entries(userStats)) {
      stats.totalwinlose = stats.totalwithdraw - stats.totaldeposit;
      if (stats.totalwinlose < 0) {
        stats.totalRebate = Math.abs(stats.totalwinlose) * (percentage / 100);
        if (stats.totalRebate >= 1) {
          await RebateLog.create({
            username,
            totaldeposit: stats.totaldeposit,
            totalwithdraw: stats.totalwithdraw,
            totalwinlose: stats.totalwinlose,
            totalRebate: stats.totalRebate,
            rebateissuesdate: moment().utc().toDate(),
            formula: `${Math.abs(stats.totalwinlose)} * ${percentage}% = ${
              stats.totalRebate
            }`,
            type: "winlose",
          });
          const user = await User.findOne({ username: username });
          if (user) {
            const kioskSettings = await kioskbalance.findOne({});
            if (kioskSettings && kioskSettings.status) {
              const kioskResult = await updateKioskBalance(
                "subtract",
                stats.totalRebate,
                {
                  username: username,
                  transactionType: "rebate",
                  remark: `Win/Lose Rebate"`,
                  processBy: "system",
                }
              );
              if (!kioskResult.success) {
                console.error(
                  `Failed to update kiosk balance for user ${username}: ${kioskResult.message}`
                );
                continue;
              }
            }
            stats.totalRebate = parseFloat(stats.totalRebate.toFixed(2));
            user.wallet += stats.totalRebate;
            await user.save();
            const walletLog = new UserWalletLog({
              userId: user._id,
              transactiontime: new Date(),
              transactiontype: "rebate",
              amount: stats.totalRebate,
              status: "approved",
              promotionnameEN: `${moment(startDate).format("DD-MM-YYYY")}`,
            });
            await walletLog.save();
            console.log(
              `Rebate processed for ${username}: ${stats.totalRebate}`
            );
          } else {
            console.log(`User not found: ${username}`);
          }
        }
      }
    }
    console.log("Rebate calculation completed");
  } catch (error) {
    console.error("Win/Lose rebate calculation error:", error);
    throw error;
  }
}

// Rebate Based on Turnover
async function calculateTurnoverRebate() {
  try {
    const mockData = await getYesterdayGameLogs();
    // const mockData = {
    //   "Slot Games": {
    //     marcus888: {
    //       turnover: 45000,
    //       winloss: 3200,
    //     },
    //     test1: {
    //       turnover: 35000,
    //       winloss: -4800,
    //     },
    //     test2: {
    //       turnover: 120000,
    //       winloss: 9500,
    //     },
    //   },
    //   "Live Casino": {
    //     marcus888: {
    //       turnover: 25000,
    //       winloss: -2100,
    //     },
    //     test1: {
    //       turnover: 12000,
    //       winloss: 1500,
    //     },
    //     test2: {
    //       turnover: 85000,
    //       winloss: -7200,
    //     },
    //   },
    //   Sports: {
    //     marcus888: {
    //       turnover: 5800,
    //       winloss: 600,
    //     },
    //     test1: {
    //       turnover: 15000,
    //       winloss: -1800,
    //     },
    //     test2: {
    //       turnover: 7500,
    //       winloss: 900,
    //     },
    //   },
    //   Fishing: {
    //     marcus888: {
    //       turnover: 12000,
    //       winloss: -1500,
    //     },
    //     test1: {
    //       turnover: 6500,
    //       winloss: 800,
    //     },
    //   },
    //   "E-Sports": {
    //     marcus888: {
    //       turnover: 3200,
    //       winloss: 350,
    //     },
    //     test1: {
    //       turnover: 6000,
    //       winloss: -750,
    //     },
    //     test2: {
    //       turnover: 4800,
    //       winloss: 580,
    //     },
    //   },
    //   Lottery: {
    //     marcus888: {
    //       turnover: 7500,
    //       winloss: 850,
    //     },
    //     test1: {
    //       turnover: 22000,
    //       winloss: -2600,
    //     },
    //   },
    // };
    const vipConfig = await vip.findOne();
    if (!vipConfig) {
      throw new Error("VIP configuration not found");
    }
    const uniqueUsernames = [
      ...new Set(
        Object.values(mockData).flatMap((category) => Object.keys(category))
      ),
    ];
    console.log(`Processing users:`, uniqueUsernames);
    const users = await User.find({ username: { $in: uniqueUsernames } });
    const userVipMap = new Map(users.map((user) => [user.username, user]));
    const userTurnovers = {};
    for (const [category, userData] of Object.entries(mockData)) {
      for (const [username, data] of Object.entries(userData)) {
        const user = userVipMap.get(username);
        if (!user) {
          console.log(`User not found: ${username}`);
          continue;
        }
        if (!userTurnovers[username]) {
          userTurnovers[username] = {
            categoryTurnover: {},
            categoryWinloss: {},
            total: 0,
          };
        }
        const categoryKey = category.toLowerCase().replace(/\s+/g, "");
        userTurnovers[username].categoryTurnover[categoryKey] = data.turnover;
        userTurnovers[username].categoryWinloss[categoryKey] =
          data.winloss || 0;
        userTurnovers[username].total += data.turnover;
      }
    }

    for (const [username, turnoverData] of Object.entries(userTurnovers)) {
      const user = userVipMap.get(username);

      if (user) {
        const oldVipLevel = user.viplevel;
        const updatedUser = await User.findOneAndUpdate(
          { _id: user._id },
          { $inc: { totalturnover: turnoverData.total } },
          { new: true }
        );
        // const newVipLevel = await calculateAndUpdateVIPLevel(
        //   user._id,
        //   updatedUser.totalturnover,
        //   vipConfig
        // );
        const latestUser = await User.findById(user._id);
        userVipMap.set(username, latestUser);

        const gameAmounts = {
          "Slot Games": {
            turnover: turnoverData.categoryTurnover.slotgames || 0,
            winloss: turnoverData.categoryWinloss.slotgames || 0,
          },
          "Live Casino": {
            turnover: turnoverData.categoryTurnover.livecasino || 0,
            winloss: turnoverData.categoryWinloss.livecasino || 0,
          },
          Sports: {
            turnover: turnoverData.categoryTurnover.sports || 0,
            winloss: turnoverData.categoryWinloss.sports || 0,
          },
          Fishing: {
            turnover: turnoverData.categoryTurnover.fishing || 0,
            winloss: turnoverData.categoryWinloss.fishing || 0,
          },
          Poker: {
            turnover: turnoverData.categoryTurnover.poker || 0,
            winloss: turnoverData.categoryWinloss.poker || 0,
          },
          "Mah Jong": {
            turnover: turnoverData.categoryTurnover.mahjong || 0,
            winloss: turnoverData.categoryWinloss.mahjong || 0,
          },
          "E-Sports": {
            turnover: turnoverData.categoryTurnover.esports || 0,
            winloss: turnoverData.categoryWinloss.esports || 0,
          },
          Horse: {
            turnover: turnoverData.categoryTurnover.horse || 0,
            winloss: turnoverData.categoryWinloss.horse || 0,
          },
          Lottery: {
            turnover: turnoverData.categoryTurnover.lottery || 0,
            winloss: turnoverData.categoryWinloss.lottery || 0,
          },
        };

        let userGameData = await UserGameData.findOne({ userId: user._id });
        if (!userGameData) {
          userGameData = new UserGameData({
            userId: user._id,
            username: username,
            gameHistory: new Map(),
          });
        }

        const yesterday = moment()
          .tz("Asia/Kuala_Lumpur")
          .subtract(1, "day")
          .format("DD-MM-YYYY");
        const twoMonthsAgo = moment()
          .tz("Asia/Kuala_Lumpur")
          .subtract(2, "months");

        const historyEntries = Array.from(userGameData.gameHistory.entries());
        const filteredEntries = historyEntries.filter(([date]) => {
          const entryDate = moment(date, "DD-MM-YYYY");
          return entryDate.isAfter(twoMonthsAgo);
        });

        filteredEntries.push([yesterday, gameAmounts]);
        userGameData.gameHistory = new Map(filteredEntries);

        await userGameData.save();

        console.log(
          `Updated game history for user ${username} for date ${yesterday}`
        );
      }
    }

    const userRebates = {};
    for (const [category, userData] of Object.entries(mockData)) {
      for (const [username, data] of Object.entries(userData)) {
        const user = userVipMap.get(username);
        if (!user) continue;
        if (!userRebates[username]) {
          userRebates[username] = {
            totalRebate: 0,
            categoryTurnover: userTurnovers[username].categoryTurnover,
            categoryRebates: {},
            formula: [],
          };
        }
        let rebatePercentage = 0;
        const vipLevel = vipConfig.vipLevels.find(
          (level) => level.name === user.viplevel
        );
        if (vipLevel) {
          const rebateValue = vipLevel.benefits.get("Rebate");
          rebatePercentage =
            rebateValue === "no" ? 0 : parseFloat(rebateValue) || 0;
        }
        const categoryKey = category.toLowerCase().replace(/\s+/g, "");
        const categoryRebate = data.turnover * rebatePercentage;
        userRebates[username].categoryRebates[categoryKey] = categoryRebate;
        userRebates[username].totalRebate += categoryRebate;
        userRebates[username].formula.push(
          `${category} (VIP ${user.viplevel}): ${
            data.turnover
          } * ${rebatePercentage}% = ${(categoryRebate / 100).toFixed(2)}`
        );
      }
    }

    for (const [username, rebateData] of Object.entries(userRebates)) {
      const user = userVipMap.get(username);
      if (!user) continue;
      rebateData.totalRebate = parseFloat(
        (rebateData.totalRebate / 100).toFixed(2)
      );
      if (rebateData.totalRebate > 0) {
        const kioskSettings = await kioskbalance.findOne({});
        if (kioskSettings && kioskSettings.status) {
          const kioskResult = await updateKioskBalance(
            "subtract",
            rebateData.totalRebate,
            {
              username: username,
              transactionType: "rebate",
              remark: `Turnover Rebate`,
              processBy: "system",
            }
          );
          if (!kioskResult.success) {
            console.error(
              `Failed to update kiosk balance for user ${username}: ${kioskResult.message}`
            );
            continue;
          }
        }
        await User.findOneAndUpdate(
          { _id: user._id },
          { $inc: { wallet: rebateData.totalRebate } }
        );
        await RebateLog.create({
          username,
          categoryTurnover: rebateData.categoryTurnover,
          totalRebate: rebateData.totalRebate,
          formula: rebateData.formula.join("\n"),
          type: "turnover",
          rebateissuesdate: new Date(),
          totalturnover: userTurnovers[username].total,
          slot: rebateData.categoryTurnover.slotgames || 0,
          livecasino: rebateData.categoryTurnover.livecasino || 0,
          sports: rebateData.categoryTurnover.sports || 0,
          fishing: rebateData.categoryTurnover.fishing || 0,
          poker: rebateData.categoryTurnover.poker || 0,
          mahjong: rebateData.categoryTurnover.mahjong || 0,
          esports: rebateData.categoryTurnover["e-sports"] || 0,
          horse: rebateData.categoryTurnover.horse || 0,
          lottery: rebateData.categoryTurnover.lottery || 0,
        });
        await UserWalletLog.create({
          userId: user._id,
          transactiontime: new Date(),
          transactiontype: "rebate",
          amount: rebateData.totalRebate,
          status: "approved",
          promotionnameEN: `Rebate ${moment()
            .tz("Asia/Kuala_Lumpur")
            .subtract(1, "day")
            .format("YYYY-MM-DD")}`,
        });
      }
    }
  } catch (error) {
    console.error("Turnover rebate calculation error:", error);
    throw error;
  }
}

// Rebate all console.log
// async function calculateTurnoverRebate() {
//   try {
//     console.log("==== Starting calculateTurnoverRebate ====");
//     const mockData = await getYesterdayGameLogs();
//     console.log("Fetched game logs:", mockData);

//     const vipConfig = await vip.findOne();
//     console.log("Fetched VIP config:", vipConfig);
//     if (!vipConfig) {
//       throw new Error("VIP configuration not found");
//     }

//     const uniqueUsernames = [
//       ...new Set(
//         Object.values(mockData).flatMap((category) => Object.keys(category))
//       ),
//     ];
//     console.log("Found unique usernames:", uniqueUsernames);

//     const users = await User.find({ username: { $in: uniqueUsernames } });
//     console.log(
//       "Found users from DB:",
//       users.map((u) => u.username)
//     );

//     const userVipMap = new Map(users.map((user) => [user.username, user]));
//     console.log(
//       "Created userVipMap with users:",
//       Array.from(userVipMap.keys())
//     );

//     const userTurnovers = {};
//     for (const [category, userData] of Object.entries(mockData)) {
//       console.log(`Processing category: ${category}`);
//       for (const [username, data] of Object.entries(userData)) {
//         const user = userVipMap.get(username);
//         if (!user) {
//           console.log(`User not found in database: ${username}`);
//           continue;
//         }
//         if (!userTurnovers[username]) {
//           userTurnovers[username] = {
//             categoryTurnover: {},
//             categoryWinloss: {},
//             total: 0,
//           };
//         }
//         const categoryKey = category.toLowerCase().replace(/\s+/g, "");
//         userTurnovers[username].categoryTurnover[categoryKey] = data.turnover;
//         userTurnovers[username].categoryWinloss[categoryKey] =
//           data.winloss || 0;
//         userTurnovers[username].total += data.turnover;
//         console.log(
//           `Updated turnover for ${username}:`,
//           userTurnovers[username]
//         );
//       }
//     }

//     console.log("Final userTurnovers data:", userTurnovers);

//     for (const [username, turnoverData] of Object.entries(userTurnovers)) {
//       console.log(`Processing user: ${username}`);
//       const user = userVipMap.get(username);

//       if (user) {
//         const oldVipLevel = user.viplevel;
//         console.log(`${username} old VIP level:`, oldVipLevel);

//         const updatedUser = await User.findOneAndUpdate(
//           { _id: user._id },
//           { $inc: { totalturnover: turnoverData.total } },
//           { new: true }
//         );
//         console.log(
//           `${username} updated total turnover:`,
//           updatedUser.totalturnover
//         );

//         const newVipLevel = await calculateAndUpdateVIPLevel(
//           user._id,
//           updatedUser.totalturnover,
//           vipConfig
//         );
//         console.log(`${username} new VIP level:`, newVipLevel);

//         const latestUser = await User.findById(user._id);
//         userVipMap.set(username, latestUser);

//         const gameAmounts = {
//           "Slot Games": {
//             turnover: turnoverData.categoryTurnover.slotgames || 0,
//             winloss: turnoverData.categoryWinloss.slotgames || 0,
//           },
//           "Live Casino": {
//             turnover: turnoverData.categoryTurnover.livecasino || 0,
//             winloss: turnoverData.categoryWinloss.livecasino || 0,
//           },
//           Sports: {
//             turnover: turnoverData.categoryTurnover.sports || 0,
//             winloss: turnoverData.categoryWinloss.sports || 0,
//           },
//           Fishing: {
//             turnover: turnoverData.categoryTurnover.fishing || 0,
//             winloss: turnoverData.categoryWinloss.fishing || 0,
//           },
//           Poker: {
//             turnover: turnoverData.categoryTurnover.poker || 0,
//             winloss: turnoverData.categoryWinloss.poker || 0,
//           },
//           "Mah Jong": {
//             turnover: turnoverData.categoryTurnover.mahjong || 0,
//             winloss: turnoverData.categoryWinloss.mahjong || 0,
//           },
//           "E-Sports": {
//             turnover: turnoverData.categoryTurnover.esports || 0,
//             winloss: turnoverData.categoryWinloss.esports || 0,
//           },
//           Horse: {
//             turnover: turnoverData.categoryTurnover.horse || 0,
//             winloss: turnoverData.categoryWinloss.horse || 0,
//           },
//           Lottery: {
//             turnover: turnoverData.categoryTurnover.lottery || 0,
//             winloss: turnoverData.categoryWinloss.lottery || 0,
//           },
//         };

//         console.log(`${username} game amounts:`, gameAmounts);

//         let userGameData = await UserGameData.findOne({ userId: user._id });
//         console.log(`${username} existing game data:`, userGameData);

//         if (!userGameData) {
//           userGameData = new UserGameData({
//             userId: user._id,
//             username: username,
//             gameHistory: new Map(),
//           });
//           console.log(`Created new game data for ${username}`);
//         }

//         const yesterday = moment()
//           .tz("Australia/Sydney")
//           .subtract(1, "day")
//           .format("DD-MM-YYYY");
//         const twoMonthsAgo = moment()
//           .tz("Australia/Sydney")
//           .subtract(2, "months");

//         const historyEntries = Array.from(userGameData.gameHistory.entries());
//         const filteredEntries = historyEntries.filter(([date]) => {
//           const entryDate = moment(date, "DD-MM-YYYY");
//           return entryDate.isAfter(twoMonthsAgo);
//         });

//         filteredEntries.push([yesterday, gameAmounts]);
//         userGameData.gameHistory = new Map(filteredEntries);

//         await userGameData.save();
//         console.log(`Saved game history for ${username} for date ${yesterday}`);
//       }
//     }

//     console.log("Starting rebate calculations");
//     const userRebates = {};
//     for (const [category, userData] of Object.entries(mockData)) {
//       for (const [username, data] of Object.entries(userData)) {
//         const user = userVipMap.get(username);
//         if (!user) continue;
//         if (!userRebates[username]) {
//           userRebates[username] = {
//             totalRebate: 0,
//             categoryTurnover: userTurnovers[username].categoryTurnover,
//             categoryRebates: {},
//             formula: [],
//           };
//         }
//         let rebatePercentage = 0;
//         const vipLevel = vipConfig.vipLevels.find(
//           (level) => level.name === user.viplevel
//         );
//         if (vipLevel) {
//           const rebateValue = vipLevel.benefits.get("Rebate %");
//           rebatePercentage =
//             rebateValue === "no" ? 0 : parseFloat(rebateValue) || 0;
//         }
//         console.log(`${username} rebate percentage:`, rebatePercentage);

//         const categoryKey = category.toLowerCase().replace(/\s+/g, "");
//         const categoryRebate = data.turnover * rebatePercentage;
//         userRebates[username].categoryRebates[categoryKey] = categoryRebate;
//         userRebates[username].totalRebate += categoryRebate;
//         userRebates[username].formula.push(
//           `${category} (VIP ${user.viplevel}): ${
//             data.turnover
//           } * ${rebatePercentage}% = ${(categoryRebate / 100).toFixed(2)}`
//         );
//         console.log(`${username} ${category} rebate calculation:`, {
//           turnover: data.turnover,
//           rebatePercentage,
//           categoryRebate: categoryRebate / 100,
//         });
//       }
//     }

//     console.log("Final user rebates:", userRebates);

//     for (const [username, rebateData] of Object.entries(userRebates)) {
//       const user = userVipMap.get(username);
//       if (!user) continue;
//       rebateData.totalRebate = parseFloat(
//         (rebateData.totalRebate / 100).toFixed(2)
//       );
//       console.log(`${username} final rebate amount:`, rebateData.totalRebate);

//       if (rebateData.totalRebate > 0) {
//         console.log(`Processing rebate for ${username}`);
//         await User.findOneAndUpdate(
//           { _id: user._id },
//           { $inc: { wallet: rebateData.totalRebate } }
//         );
//         await RebateLog.create({
//           username,
//           categoryTurnover: rebateData.categoryTurnover,
//           totalRebate: rebateData.totalRebate,
//           formula: rebateData.formula.join("\n"),
//           type: "turnover",
//           rebateissuesdate: new Date(),
//           totalturnover: userTurnovers[username].total,
//           slot: rebateData.categoryTurnover.slotgames || 0,
//           livecasino: rebateData.categoryTurnover.livecasino || 0,
//           sports: rebateData.categoryTurnover.sports || 0,
//           fishing: rebateData.categoryTurnover.fishing || 0,
//           poker: rebateData.categoryTurnover.poker || 0,
//           mahjong: rebateData.categoryTurnover.mahjong || 0,
//           esports: rebateData.categoryTurnover["e-sports"] || 0,
//           horse: rebateData.categoryTurnover.horse || 0,
//           lottery: rebateData.categoryTurnover.lottery || 0,
//         });
//         await UserWalletLog.create({
//           userId: user._id,
//           transactiontime: new Date(),
//           transactiontype: "rebate",
//           amount: rebateData.totalRebate,
//           status: "approved",
//           promotionnameEN: `Rebate ${moment()
//             .tz("Australia/Sydney")
//             .subtract(1, "day")
//             .format("YYYY-MM-DD")}`,
//         });
//         console.log(`Completed rebate processing for ${username}`);
//       } else {
//         console.log(`${username} rebate amount too small, skipping`);
//       }
//     }
//     console.log("==== Completed calculateTurnoverRebate ====");
//   } catch (error) {
//     console.error("Turnover rebate calculation error:", error);
//     throw error;
//   }
// }

// Initialize Schedule

module.exports = router;
