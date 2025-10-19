const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");
const { authenticateToken } = require("../../auth/auth");
const { authenticateAdminToken } = require("../../auth/adminAuth");
const {
  User,
  adminUserWalletLog,
  GameDataLog,
  GameDataValidLog,
} = require("../../models/users.model");
const { v4: uuidv4 } = require("uuid");
const querystring = require("querystring");
const moment = require("moment");
const Deposit = require("../../models/deposit.model");
const Withdraw = require("../../models/withdraw.model");
const Bonus = require("../../models/bonus.model");
const promotion = require("../../models/promotion.model");
const vip = require("../../models/vip.model");
const { RebateLog } = require("../../models/rebate.model");
const UserWalletLog = require("../../models/userwalletlog.model");

const SlotLivePPModal = require("../../models/slot_live_pp.model");
const SlotLiveAGModal = require("../../models/slot_live_ag.model");
const SlotLiveGSCModal = require("../../models/slot_live_gsc.model");
const SlotJokerModal = require("../../models/slot_joker.model");
const SlotJiliModal = require("../../models/slot_jili.model");
const SlotHabaneroModal = require("../../models/slot_habanero.model");
const SlotKiss918H5Modal = require("../../models/slot_kiss918.model");
const SlotCQ9Modal = require("../../models/slot_cq9.model");
const SlotLive22Modal = require("../../models/slot_live22.model");
const SlotUUSlotModal = require("../../models/slot_uuslot.model");
const LiveCT855Modal = require("../../models/live_ct855.model");
const SlotNextSpinModal = require("../../models/slot_nextspin.model");
const SlotLFC888Modal = require("../../models/slot_lfc888.model");
const PlaytechGameModal = require("../../models/slot_playtech.model");
const SlotMega888H5Modal = require("../../models/slot_mega888h5.model");
const LotteryAP95Modal = require("../../models/lottery_ap95.mode");
const slotGW99Modal = require("../../models/slot_gw99.model");
const slotLionKingModal = require("../../models/slot_lionking.model");
const SlotSpadeGamingModal = require("../../models/slot_spadegaming.model");
const SlotFachaiModal = require("../../models/slot_fachai.model");
const LiveSaGamingModal = require("../../models/live_sagaming.model");
const SlotLiveMicroGamingModal = require("../../models/slot_microgaming.model");
const SlotHacksawModal = require("../../models/slot_hacksaw.model");
const SportCMDModal = require("../../models/sport_cmd.model");

require("dotenv").config();

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

router.post("/api/games/allturnoverdata", async (req, res) => {
  const startTime = Date.now();
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: {
          en: "Start date and end date are required",
          zh: "开始日期和结束日期是必填项",
          ms: "Tarikh mula dan tarikh akhir diperlukan",
        },
      });
    }

    const today = moment().utc().format("YYYY-MM-DD");
    const startDateFormatted = moment(new Date(startDate))
      .utc()
      .add(8, "hours")
      .format("YYYY-MM-DD");
    const endDateFormatted = moment(new Date(endDate))
      .utc()
      .add(8, "hours")
      .format("YYYY-MM-DD");

    // Determine which data sources we need
    const needsTodayData = endDateFormatted >= today;
    const needsHistoricalData = startDateFormatted < today;

    // Initialize user summary object
    const userSummary = {};

    // PART 1: Get historical data from GameDataLog if needed
    if (needsHistoricalData) {
      const historyStartTime = Date.now();

      const historicalRecords = await GameDataLog.find({
        date: {
          $gte: startDateFormatted,
          $lte:
            endDateFormatted < today
              ? endDateFormatted
              : moment.utc().subtract(1, "days").format("YYYY-MM-DD"),
        },
      });

      console.log(
        `Retrieved ${historicalRecords.length} historical records in ${
          Date.now() - historyStartTime
        }ms`
      );

      // Process historical records
      historicalRecords.forEach((record) => {
        const username = record.username.toLowerCase();

        // Initialize user if not exists
        if (!userSummary[username]) {
          userSummary[username] = { turnover: 0 };
        }

        // Convert gameCategories Map to Object if needed
        const gameCategories =
          record.gameCategories instanceof Map
            ? Object.fromEntries(record.gameCategories)
            : record.gameCategories;

        // Sum up turnover from all categories and games
        if (gameCategories) {
          Object.keys(gameCategories).forEach((categoryName) => {
            const category =
              gameCategories[categoryName] instanceof Map
                ? Object.fromEntries(gameCategories[categoryName])
                : gameCategories[categoryName];

            // Process each game in this category
            Object.keys(category).forEach((gameName) => {
              const game = category[gameName];
              const turnover = Number(game.turnover || 0);

              // Add to user total
              userSummary[username].turnover += turnover;
            });
          });
        }
      });
    }

    // PART 2: Get today's data from game models if needed
    if (needsTodayData) {
      const liveStartTime = Date.now();

      // Generic aggregation function for game turnover
      const getAllUsersTurnover = async (
        model,
        matchConditions,
        turnoverExpression = { $ifNull: ["$betamount", 0] }
      ) => {
        try {
          const results = await model.aggregate([
            {
              $match: {
                createdAt: {
                  $gte: moment(new Date(startDate)).utc().toDate(),
                  $lte: moment(new Date(endDate)).utc().toDate(),
                },
                ...matchConditions,
              },
            },
            {
              $group: {
                _id: { $toLower: "$username" },
                turnover: { $sum: turnoverExpression },
              },
            },
          ]);

          return results.map((item) => ({
            username: item._id,
            turnover: Number(item.turnover.toFixed(2)),
          }));
        } catch (error) {
          console.error(
            `Error aggregating data for model ${model.modelName}:`,
            error
          );
          return [];
        }
      };

      // Execute all game model queries in parallel
      const gameQueries = await Promise.allSettled([
        // PP Slot & Live combined
        getAllUsersTurnover(SlotLivePPModal, {
          refunded: false,
          ended: true,
        }),

        // AG Slot & Live combined
        getAllUsersTurnover(SlotLiveAGModal, {
          cancel: { $ne: true },
          settle: true,
        }),

        // All GSC games combined
        getAllUsersTurnover(SlotLiveGSCModal, {
          cancel: { $ne: true },
          settle: true,
        }),

        // Joker - Special case with combined fields
        getAllUsersTurnover(
          SlotJokerModal,
          {
            cancel: { $ne: true },

            settle: true,
          },
          {
            $add: [
              { $ifNull: ["$betamount", 0] },
              { $ifNull: ["$fishTurnover", 0] },
            ],
          }
        ),

        // Jili Slot & Fish combined
        getAllUsersTurnover(SlotJiliModal, {
          cancel: { $ne: true },

          settle: true,
        }),

        // Habanero
        getAllUsersTurnover(SlotHabaneroModal, {
          refund: { $ne: true },

          settle: true,
        }),

        // Kiss918
        getAllUsersTurnover(SlotKiss918H5Modal, {
          cancel: { $ne: true },

          settle: true,
        }),

        // CQ9 Slot & Fish combined
        getAllUsersTurnover(SlotCQ9Modal, {
          cancel: { $ne: true },
          refund: { $ne: true },
          settle: true,
        }),

        // Live22
        getAllUsersTurnover(SlotLive22Modal, {
          cancel: { $ne: true },

          settle: true,
        }),

        // UUSlot
        getAllUsersTurnover(SlotUUSlotModal, {
          cancel: { $ne: true },

          settle: true,
        }),

        // CT855
        getAllUsersTurnover(LiveCT855Modal, {
          cancel: { $ne: true },
          settle: true,
        }),

        // Playtech
        getAllUsersTurnover(
          PlaytechGameModal,
          {
            settle: true,
            cancel: { $ne: true },
          },
          { $ifNull: ["$betAmount", 0] }
        ),

        // Nextspin
        getAllUsersTurnover(SlotNextSpinModal, {
          settle: true,
          cancel: { $ne: true },
        }),

        // LFC888
        getAllUsersTurnover(SlotLFC888Modal, {
          settle: true,
          cancel: { $ne: true },
        }),
        getAllUsersTurnover(SlotMega888H5Modal, {
          settle: true,
          cancel: { $ne: true },
        }),
        getAllUsersTurnover(LotteryAP95Modal, {}),
        getAllUsersTurnover(slotGW99Modal, {
          settle: true,
        }),
        getAllUsersTurnover(SlotSpadeGamingModal, {
          settle: true,
          cancel: { $ne: true },
        }),
        getAllUsersTurnover(SlotFachaiModal, {
          settle: true,
          cancel: { $ne: true },
        }),

        getAllUsersTurnover(LiveSaGamingModal, {
          cancel: { $ne: true },

          settle: true,
        }),
        getAllUsersTurnover(SlotLiveMicroGamingModal, {
          cancel: { $ne: true },

          settle: true,
        }),
        getAllUsersTurnover(SlotHacksawModal, {
          cancel: { $ne: true },

          settle: true,
        }),
        getAllUsersTurnover(SportCMDModal, {
          cancel: { $ne: true },
        }),
      ]);

      // Process game queries results
      gameQueries.forEach((result) => {
        if (result.status === "fulfilled") {
          result.value.forEach((userResult) => {
            const username = userResult.username;
            if (!username) return;

            if (!userSummary[username]) {
              userSummary[username] = { turnover: 0 };
            }

            userSummary[username].turnover += userResult.turnover || 0;
          });
        }
      });
    }

    // Format all numbers
    Object.keys(userSummary).forEach((username) => {
      userSummary[username].turnover = Number(
        userSummary[username].turnover.toFixed(2)
      );
    });

    const executionTime = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      dateRange: {
        start: startDateFormatted,
        end: endDateFormatted,
      },
      executionTime,
      users: userSummary,
    });
  } catch (error) {
    console.error("Failed to fetch all users turnover:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "Failed to fetch all users turnover",
        zh: "获取所有用户总投注额失败",
        ms: "Gagal mendapatkan jumlah pusing ganti untuk semua pengguna",
      },
    });
  }
});

router.post("/admin/api/getAllValidTurnoverForRebate", async (req, res) => {
  try {
    console.log("==== START: ALL GAMES TURNOVER CALCULATION ====");
    const { date } = req.body;
    console.log(`Request received for date: ${date}`);

    let startDate, endDate;
    if (date === "today") {
      startDate = moment
        .utc()
        .add(8, "hours")
        .startOf("day")
        .subtract(8, "hours")
        .toDate();
      endDate = moment
        .utc()
        .add(8, "hours")
        .endOf("day")
        .subtract(8, "hours")
        .toDate();
    } else if (date === "yesterday") {
      startDate = moment
        .utc()
        .add(8, "hours")
        .subtract(1, "days")
        .startOf("day")
        .subtract(8, "hours")
        .toDate();
      endDate = moment
        .utc()
        .add(8, "hours")
        .subtract(1, "days")
        .endOf("day")
        .subtract(8, "hours")
        .toDate();
    }

    console.log(
      `Query time range: ${startDate.toISOString()} to ${endDate.toISOString()}`
    );

    // 定义所有游戏模型及其相关信息
    const gameModels = [
      {
        name: "PPSLOT",
        model: SlotLivePPModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          refunded: false,
          ended: true,
          gameType: "Slot",
        },
      },
      {
        name: "PPLIVE",
        model: SlotLivePPModal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          refunded: false,
          ended: true,
          gameType: "Live",
        },
      },
      {
        name: "ASIA GAMING",
        model: SlotLiveAGModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          gametype: "SLOT",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "ASIA GAMING",
        model: SlotLiveAGModal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          gametype: "LIVE",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "WM CASINO",
        model: SlotLiveGSCModal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          platform: "1020",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "YEEBET",
        model: SlotLiveGSCModal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          platform: "1016",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "SEXYBCRT",
        model: SlotLiveGSCModal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          platform: "1022",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "DREAM GAMING",
        model: SlotLiveGSCModal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          platform: "1052",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "EVOLUTION",
        model: SlotLiveGSCModal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          platform: "1002",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "BIG GAMING",
        model: SlotLiveGSCModal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          platform: "1004",
          gametype: "LIVE_CASINO",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "NOLIMIT",
        model: SlotLiveGSCModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          platform: "1166",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "JDB",
        model: SlotLiveGSCModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          platform: "1085",
          gametype: "SLOT",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "JDB",
        model: SlotLiveGSCModal,
        category: "Fishing",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          platform: "1085",
          gametype: "FISHING",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "RED TIGER",
        model: SlotLiveGSCModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          platform: "1169",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "NETENT",
        model: SlotLiveGSCModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          platform: "1168",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "TFGAMING",
        model: SlotLiveGSCModal,
        category: "E-Sports",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          platform: "1222",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "JOKER",
        model: SlotJokerModal,
        category: "Slot Games",
        betField: "betamount", // 基本下注字段
        settleField: "settleamount", // 基本结算字段
        // 特殊处理标志
        hasFishGame: true, // 添加标志表明有钓鱼游戏相关字段
        fishTurnoverField: "fishTurnover", // 钓鱼游戏的流水字段
        fishWinLossField: "fishWinLoss", // 钓鱼游戏的输赢字段
        query: {
          createdAt: { $gte: startDate, $lt: endDate },
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "JILI",
        model: SlotJiliModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          cancel: { $ne: true },
          gametype: "SLOT",
          settle: true,
        },
      },
      {
        name: "JILI",
        model: SlotJiliModal,
        category: "Fishing",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          cancel: { $ne: true },
          gametype: "FISH",
          settle: true,
        },
      },
      {
        name: "HABANERO",
        model: SlotHabaneroModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          refund: { $ne: true },
          settle: true,
        },
      },
      {
        name: "918KISSH5",
        model: SlotKiss918H5Modal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "CQ9",
        model: SlotCQ9Modal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          gametype: "SLOT",
          cancel: { $ne: true },
          refund: { $ne: true },
          settle: true,
        },
      },
      {
        name: "CQ9",
        model: SlotCQ9Modal,
        category: "Fishing",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          gametype: "FISH",
          cancel: { $ne: true },
          refund: { $ne: true },
          settle: true,
        },
      },
      {
        name: "LIVE22",
        model: SlotLive22Modal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "UU SLOT",
        model: SlotUUSlotModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "CT855",
        model: LiveCT855Modal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "PLAYTECH",
        model: PlaytechGameModal,
        category: "Slot Games",
        betField: "betAmount",
        settleField: "settleamount",
        query: {
          createdAt: { $gte: startDate, $lt: endDate },
          settle: true,
          cancel: { $ne: true },
          gameType: "Slot",
        },
      },
      {
        name: "PLAYTECH",
        model: PlaytechGameModal,
        category: "Live Casino",
        betField: "betAmount",
        settleField: "settleamount",
        query: {
          createdAt: { $gte: startDate, $lt: endDate },
          settle: true,
          cancel: { $ne: true },
          gameType: "Live",
        },
      },
      {
        name: "NEXTSPIN",
        model: SlotNextSpinModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: { $gte: startDate, $lt: endDate },
          settle: true,
          cancel: { $ne: true },
        },
      },
      {
        name: "LFC888",
        model: SlotLFC888Modal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: { $gte: startDate, $lt: endDate },
          settle: true,
          cancel: { $ne: true },
        },
      },
      {
        name: "MEGA888H5",
        model: SlotMega888H5Modal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: { $gte: startDate, $lt: endDate },
          settle: true,
          cancel: { $ne: true },
        },
      },
      {
        name: "ALIPAY",
        model: LotteryAP95Modal,
        category: "Lottery",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: { $gte: startDate, $lt: endDate },
        },
      },
      {
        name: "LIONKING",
        model: slotLionKingModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: { $gte: startDate, $lt: endDate },
        },
      },
      {
        name: "GW99",
        model: slotGW99Modal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          settle: true,
        },
      },
      {
        name: "SPADE GAMING SLOT",
        model: SlotSpadeGamingModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          settle: true,
          cancel: { $ne: true },
          gametype: "SLOT",
        },
      },
      {
        name: "SPADE GAMING FISH",
        model: SlotSpadeGamingModal,
        category: "Fishing",
        betField: "betamount",
        settleField: "withdrawamount", // This won't be used for win/loss calculation
        // Special handling flags for Spade Gaming Fish
        hasSpecialWinLoss: true,
        depositField: "depositamount",
        withdrawField: "withdrawamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          settle: true,
          cancel: { $ne: true },
          gametype: "FISH",
        },
      },
      {
        name: "FACHAI",
        model: SlotFachaiModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          settle: true,
          cancel: { $ne: true },
        },
      },
      {
        name: "SA GAMING",
        model: LiveSaGamingModal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "MICRO GAMING",
        model: SlotLiveMicroGamingModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          cancel: { $ne: true },
          settle: true,
          gameType: "SLOT",
        },
      },
      {
        name: "MICRO GAMING",
        model: SlotLiveMicroGamingModal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          cancel: { $ne: true },
          settle: true,
          gameType: "LIVE",
        },
      },
      {
        name: "HACKSAW",
        model: SlotHacksawModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "CMD368",
        model: SportCMDModal,
        category: "Sports",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          cancel: { $ne: true },
        },
      },
    ];

    // 获取所有游戏记录并组织按用户名分组
    console.log("Fetching game records from all game models...");

    // 使用对象存储所有用户的下注记录
    const allUserBets = {};
    // 使用对象存储每个游戏类型对应的用户汇总数据
    const gameTypeSummaries = {};

    // 初始化游戏类型汇总对象 - 使用复合键
    for (const game of gameModels) {
      const key = `${game.name}_${game.category}`;
      gameTypeSummaries[key] = {
        gamename: game.name,
        gamecategory: game.category,
        users: {},
      };
    }

    // 添加一个总计汇总
    const totalSummary = {
      gamename: "ALL_GAMES",
      gamecategory: "All Games",
      users: {},
    };

    // 从所有游戏模型获取记录
    for (const game of gameModels) {
      console.log(`Fetching records from ${game.name} (${game.category})...`);
      const gameRecords = await game.model.find(game.query).lean();
      console.log(
        `Found ${gameRecords.length} records in ${game.name} (${game.category})`
      );

      // 使用复合键标识游戏类型
      const key = `${game.name}_${game.category}`;

      // 处理每条记录
      for (const record of gameRecords) {
        const username = record.username.toLowerCase();

        // 初始化用户记录容器
        if (!allUserBets[username]) {
          allUserBets[username] = [];
        }

        // 添加游戏类型标识
        record.gameType = game.name;
        record.gameCategory = game.category;
        record.gameKey = key; // 添加复合键
        record.betField = game.betField;
        record.settleField = game.settleField;

        // 添加特殊游戏字段处理
        if (game.hasFishGame) {
          record.hasFishGame = true;
          record.fishTurnoverField = game.fishTurnoverField;
          record.fishWinLossField = game.fishWinLossField;
        }

        // 添加特殊win/loss计算标志 for Spade Gaming Fish
        if (game.hasSpecialWinLoss) {
          record.hasSpecialWinLoss = true;
          record.depositField = game.depositField;
          record.withdrawField = game.withdrawField;
        }

        // 添加记录到用户的下注列表
        allUserBets[username].push(record);

        // 更新游戏类型汇总
        if (!gameTypeSummaries[key].users[username]) {
          gameTypeSummaries[key].users[username] = {
            turnover: 0,
            winloss: 0,
            turnoverForRebate: 0,
          };
        }

        // 获取下注金额（turnover）
        let betAmount = record[game.betField] || 0;

        // 处理钓鱼游戏特殊字段 (Joker)
        if (game.hasFishGame) {
          betAmount += record[game.fishTurnoverField] || 0;
        }
        // For Spade Gaming Fish, betamount is already the correct turnover

        // 计算win/loss
        let winLoss = 0;

        if (game.hasSpecialWinLoss) {
          // Special calculation for Spade Gaming Fish: withdrawamount - depositamount
          const withdrawAmount = record[game.withdrawField] || 0;
          const depositAmount = record[game.depositField] || 0;
          winLoss = withdrawAmount - depositAmount;
        } else if (game.hasFishGame) {
          // Handle Joker fish games
          const settleAmount = record[game.settleField] || 0;
          const fishWinLoss = record[game.fishWinLossField] || 0;
          winLoss = settleAmount - betAmount + fishWinLoss;
        } else {
          // Standard calculation: settleAmount - betAmount
          const settleAmount = record[game.settleField] || 0;
          winLoss = settleAmount - betAmount;
        }

        // 更新游戏类型汇总
        gameTypeSummaries[key].users[username].turnover += betAmount;
        gameTypeSummaries[key].users[username].winloss += winLoss;

        // 更新总计汇总
        if (!totalSummary.users[username]) {
          totalSummary.users[username] = {
            turnover: 0,
            winloss: 0,
            turnoverForRebate: 0,
          };
        }
        totalSummary.users[username].turnover += betAmount;
        totalSummary.users[username].winloss += winLoss;
      }
    }

    // 获取所有用户名
    const usernames = Object.keys(allUserBets);
    console.log(`Found ${usernames.length} unique users with activity`);

    // 处理每个用户的奖金和下注
    for (const username of usernames) {
      console.log(`\n--- Processing user: ${username} ---`);

      // 按时间排序该用户的所有下注记录
      const userBets = allUserBets[username].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      );

      if (userBets.length === 0) {
        continue;
      }

      // 获取所有奖金记录
      const bonuses = await Bonus.find({
        username: username,
        status: "approved",
        createdAt: { $lt: endDate },
      })
        .sort({ createdAt: 1 })
        .lean();

      console.log(`Found ${bonuses.length} bonuses for ${username}`);

      // 获取用户的普通存款记录（未关联奖金的存款）
      console.log(`Searching for non-bonus deposits for ${username}...`);

      // 提取所有已关联奖金的存款ID
      const linkedDepositIds = bonuses
        .filter((b) => b.depositId)
        .map((b) => b.depositId.toString());

      const deposits = await Deposit.find({
        username: username,
        status: "approved",
        createdAt: { $lt: endDate },
      }).lean();

      // 过滤出未关联奖金的存款
      const nonBonusDeposits = deposits.filter(
        (d) => !linkedDepositIds.includes(d._id.toString())
      );

      console.log(
        `Found ${nonBonusDeposits.length} non-bonus deposits for ${username}`
      );

      // 如果没有找到奖金记录和普通存款，所有下注都计入返水
      if (bonuses.length === 0 && nonBonusDeposits.length === 0) {
        console.log(
          `No bonuses or non-bonus deposits found for ${username}, all bets will count for rebate`
        );

        // 为每个游戏类型更新返水金额
        for (const game of gameModels) {
          const key = `${game.name}_${game.category}`;
          if (gameTypeSummaries[key].users[username]) {
            gameTypeSummaries[key].users[username].turnoverForRebate =
              gameTypeSummaries[key].users[username].turnover;
          }
        }

        // 更新总计返水
        totalSummary.users[username].turnoverForRebate =
          totalSummary.users[username].turnover;
        continue;
      }

      // 处理每个奖金和普通存款记录
      const turnoverRequirements = [];

      // 先处理奖金记录
      for (const bonus of bonuses) {
        console.log(`\n  Processing bonus ID: ${bonus._id}`);
        console.log(`  Created at: ${bonus.createdAt}`);

        // 获取促销信息
        const bonusPromotion = await promotion
          .findById(bonus.promotionId)
          .lean();

        if (!bonusPromotion) {
          console.log(
            `  ⚠️ Promotion not found for ID: ${bonus.promotionId}, skipping this bonus`
          );
          continue;
        }

        console.log(
          `  Promotion requirement: ${bonusPromotion.turnoverrequiremnt}x`
        );

        // 获取存款信息
        let depositAmount = 0;
        if (bonus.depositId) {
          const relatedDeposit = await Deposit.findById(bonus.depositId).lean();

          if (relatedDeposit) {
            depositAmount = relatedDeposit.amount || 0;
            console.log(`  Related deposit amount: ${depositAmount}`);
          }
        }

        // 计算流水要求
        const baseAmount = bonus.amount + depositAmount;
        const requiredTurnover = baseAmount * bonusPromotion.turnoverrequiremnt;

        console.log(`  Bonus amount: ${bonus.amount}`);
        console.log(`  Deposit amount: ${depositAmount}`);
        console.log(`  Total required turnover: ${requiredTurnover}`);

        turnoverRequirements.push({
          id: bonus._id.toString(),
          createdAt: new Date(bonus.createdAt),
          amount: bonus.amount,
          depositAmount: depositAmount,
          requiredTurnover: requiredTurnover,
          completedTurnover: 0,
          completedAt: null,
          isActive: true,
          excessCalculated: false,
          isRegularDeposit: false, // 标记为奖金
        });
      }

      // 再处理普通存款记录
      for (const deposit of nonBonusDeposits) {
        console.log(`\n  Processing non-bonus deposit ID: ${deposit._id}`);
        console.log(`  Created at: ${deposit.createdAt}`);
        console.log(`  Deposit amount: ${deposit.amount}`);

        // 对于普通存款，流水要求就等于存款金额
        const requiredTurnover = deposit.amount;

        console.log(`  Total required turnover: ${requiredTurnover}`);

        turnoverRequirements.push({
          id: `deposit-${deposit._id.toString()}`,
          createdAt: new Date(deposit.createdAt),
          amount: 0, // 不是奖金，所以奖金金额为0
          depositAmount: deposit.amount,
          requiredTurnover: requiredTurnover,
          completedTurnover: 0,
          completedAt: null,
          isActive: true,
          excessCalculated: false,
          isRegularDeposit: true, // 标记为普通存款
        });
      }

      // 按创建时间排序所有流水要求记录
      turnoverRequirements.sort((a, b) => a.createdAt - b.createdAt);

      // 按时间顺序处理所有下注
      console.log(
        `\n  Processing bets in chronological order for ${username}...`
      );

      // 为每个游戏类型初始化有效返水金额 - 使用复合键
      const gameTypeValidTurnover = {};
      for (const game of gameModels) {
        const key = `${game.name}_${game.category}`;
        gameTypeValidTurnover[key] = 0;
      }

      // 跟踪当前活跃的流水要求索引
      let currentRequirementIndex = -1;

      for (const bet of userBets) {
        const betTime = new Date(bet.createdAt);
        const gameKey = bet.gameKey;

        // 计算下注金额
        let betAmount = bet[bet.betField] || 0;

        if (bet.hasFishGame) {
          betAmount += bet[bet.fishTurnoverField] || 0;
        }
        // For Spade Gaming Fish, betamount is already the correct turnover

        // 查找这笔下注时活跃的流水要求
        while (
          currentRequirementIndex + 1 < turnoverRequirements.length &&
          betTime >= turnoverRequirements[currentRequirementIndex + 1].createdAt
        ) {
          // 切换到下一个流水要求之前，检查前一个流水要求的超额流水
          if (currentRequirementIndex >= 0) {
            const prevRequirement =
              turnoverRequirements[currentRequirementIndex];
            if (
              prevRequirement.completedTurnover >=
                prevRequirement.requiredTurnover &&
              !prevRequirement.excessCalculated
            ) {
              const excess =
                prevRequirement.completedTurnover -
                prevRequirement.requiredTurnover;
              if (excess > 0) {
                const requirementType = prevRequirement.isRegularDeposit
                  ? "deposit"
                  : "bonus";
                console.log(
                  `  Previous ${requirementType} ${prevRequirement.id} completed with excess: ${excess}`
                );

                // 计算每个游戏类型在总流水中的占比
                const totalTurnover = Object.values(
                  gameTypeValidTurnover
                ).reduce((sum, val) => sum + val, 0);

                if (totalTurnover > 0) {
                  // 按比例分配超额流水到各个游戏类型
                  for (const game of gameModels) {
                    const key = `${game.name}_${game.category}`;
                    const gameShare =
                      (gameTypeValidTurnover[key] / totalTurnover) * excess;
                    gameTypeValidTurnover[key] += gameShare;
                    console.log(
                      `  Allocated ${gameShare.toFixed(2)} excess to ${
                        game.name
                      } (${game.category}) based on proportion`
                    );
                  }
                }

                prevRequirement.excessCalculated = true;
              }
            }
          }

          // 切换到下一个流水要求
          currentRequirementIndex++;

          const currentReq = turnoverRequirements[currentRequirementIndex];
          const reqType = currentReq.isRegularDeposit ? "deposit" : "bonus";

          console.log(
            `  Switched to ${reqType} ${currentReq.id} at bet time ${betTime}`
          );
          console.log(`  Required turnover: ${currentReq.requiredTurnover}`);
          console.log(`  Completed so far: ${currentReq.completedTurnover}`);
        }

        // 检查是否有活跃的流水要求
        if (currentRequirementIndex === -1) {
          // 没有活跃的流水要求，这笔下注应该计入返水
          gameTypeValidTurnover[gameKey] += betAmount;
          console.log(
            `  Bet at ${betTime} (${bet.gameType}, ${bet.gameCategory}): amount=${betAmount}, for rebate=${betAmount}, reason=No active requirement`
          );
        } else {
          // 有活跃的流水要求，检查是否已满足
          const currentRequirement =
            turnoverRequirements[currentRequirementIndex];
          const reqType = currentRequirement.isRegularDeposit
            ? "deposit"
            : "bonus";

          // 如果流水要求已经满足
          if (
            currentRequirement.completedTurnover >=
            currentRequirement.requiredTurnover
          ) {
            // 这笔下注应该计入返水
            gameTypeValidTurnover[gameKey] += betAmount;
            console.log(
              `  Bet at ${betTime} (${bet.gameType}, ${bet.gameCategory}): amount=${betAmount}, for rebate=${betAmount}, reason=${reqType} requirement already met`
            );
          } else {
            // 流水要求还没满足，这笔下注用于满足流水
            const previousTurnover = currentRequirement.completedTurnover;
            currentRequirement.completedTurnover += betAmount;

            // 检查这笔下注后是否满足流水要求
            if (
              currentRequirement.completedTurnover >=
              currentRequirement.requiredTurnover
            ) {
              // 这笔下注满足了流水要求
              currentRequirement.completedAt = betTime;

              // 计算超出部分
              const excess =
                currentRequirement.completedTurnover -
                currentRequirement.requiredTurnover;
              if (excess > 0) {
                // 超出部分计入返水
                gameTypeValidTurnover[gameKey] += excess;
                currentRequirement.excessCalculated = true;
                console.log(
                  `  Bet at ${betTime} (${bet.gameType}, ${bet.gameCategory}): amount=${betAmount}, for rebate=${excess}, reason=Partially counted (${reqType} requirement met with excess)`
                );
              } else {
                console.log(
                  `  Bet at ${betTime} (${bet.gameType}, ${bet.gameCategory}): amount=${betAmount}, for rebate=0, reason=Exactly met ${reqType} requirement`
                );
              }
            } else {
              // 未满足流水要求
              console.log(
                `  Bet at ${betTime} (${bet.gameType}, ${bet.gameCategory}): amount=${betAmount}, for rebate=0, reason=Contributing to ${reqType} requirement (${currentRequirement.completedTurnover}/${currentRequirement.requiredTurnover})`
              );
            }
          }
        }
      }

      // 检查最后一个活跃流水要求的超额部分
      if (currentRequirementIndex >= 0) {
        const lastRequirement = turnoverRequirements[currentRequirementIndex];
        if (
          lastRequirement.completedTurnover >=
            lastRequirement.requiredTurnover &&
          !lastRequirement.excessCalculated
        ) {
          const excess =
            lastRequirement.completedTurnover -
            lastRequirement.requiredTurnover;
          if (excess > 0) {
            const reqType = lastRequirement.isRegularDeposit
              ? "deposit"
              : "bonus";
            console.log(
              `  Last ${reqType} ${lastRequirement.id} completed with excess: ${excess}`
            );

            const totalTurnoverBeforeExcess = Object.values(
              gameTypeValidTurnover
            ).reduce((sum, val) => sum + val, 0);
            const totalGameTurnover = totalSummary.users[username].turnover;

            // 如果已经有一些有效返水，按比例分配超额
            if (totalTurnoverBeforeExcess > 0) {
              for (const game of gameModels) {
                const key = `${game.name}_${game.category}`;
                const gameShare =
                  (gameTypeValidTurnover[key] / totalTurnoverBeforeExcess) *
                  excess;
                gameTypeValidTurnover[key] += gameShare;
                console.log(
                  `  Allocated ${gameShare.toFixed(2)} final excess to ${
                    game.name
                  } (${game.category}) based on proportion`
                );
              }
            }
            // 如果之前没有有效返水，按总流水比例分配
            else if (totalGameTurnover > 0) {
              for (const game of gameModels) {
                const key = `${game.name}_${game.category}`;
                if (gameTypeSummaries[key].users[username]) {
                  const gameTurnover =
                    gameTypeSummaries[key].users[username].turnover;
                  const gameShare = (gameTurnover / totalGameTurnover) * excess;
                  gameTypeValidTurnover[key] += gameShare;
                  console.log(
                    `  Allocated ${gameShare.toFixed(2)} final excess to ${
                      game.name
                    } (${game.category}) based on total turnover`
                  );
                }
              }
            }

            lastRequirement.excessCalculated = true;
          }
        }
      }

      // 更新每个游戏类型的有效返水 - 使用复合键
      for (const game of gameModels) {
        const key = `${game.name}_${game.category}`;
        if (gameTypeSummaries[key].users[username]) {
          gameTypeSummaries[key].users[username].turnoverForRebate =
            gameTypeValidTurnover[key];
        }
      }

      // 更新总计的有效返水
      totalSummary.users[username].turnoverForRebate = Object.values(
        gameTypeValidTurnover
      ).reduce((sum, val) => sum + val, 0);

      // 打印总结
      console.log(`\n  Summary for user ${username}:`);
      for (const req of turnoverRequirements) {
        const reqType = req.isRegularDeposit ? "Deposit" : "Bonus";
        console.log(
          `  ${reqType} ${req.id}: required=${req.requiredTurnover}, completed=${req.completedTurnover}, ` +
            `${
              req.completedTurnover >= req.requiredTurnover
                ? "COMPLETED"
                : "NOT COMPLETED"
            }`
        );
      }

      // 按游戏类型打印有效返水
      for (const game of gameModels) {
        const key = `${game.name}_${game.category}`;
        if (gameTypeSummaries[key].users[username]) {
          console.log(
            `  ${game.name} (${
              game.category
            }) valid turnover: ${gameTypeValidTurnover[key].toFixed(2)}`
          );
        }
      }

      console.log(
        `  Total valid turnover: ${totalSummary.users[
          username
        ].turnoverForRebate.toFixed(2)}`
      );
    }

    // 格式化结果
    console.log("\n==== Formatting results ====");

    // 格式化每个游戏类型的汇总数据
    for (const game of gameModels) {
      const key = `${game.name}_${game.category}`;
      const summary = gameTypeSummaries[key];

      Object.keys(summary.users).forEach((username) => {
        const user = summary.users[username];

        user.turnover = Number(user.turnover.toFixed(2));
        user.turnoverForRebate = Number(user.turnoverForRebate.toFixed(2));
        user.winloss = Number(user.winloss.toFixed(2));

        console.log(
          `User ${username} summary for ${game.name} (${game.category}):`
        );
        console.log(`  Total turnover: ${user.turnover}`);
        console.log(`  Valid turnover: ${user.turnoverForRebate}`);
        console.log(`  Win/Loss: ${user.winloss}`);
      });
    }

    // 格式化总计汇总数据
    Object.keys(totalSummary.users).forEach((username) => {
      const user = totalSummary.users[username];

      user.turnover = Number(user.turnover.toFixed(2));
      user.turnoverForRebate = Number(user.turnoverForRebate.toFixed(2));
      user.winloss = Number(user.winloss.toFixed(2));

      console.log(`User ${username} total summary:`);
      console.log(`  Total turnover: ${user.turnover}`);
      console.log(`  Total valid turnover: ${user.turnoverForRebate}`);
      console.log(`  Total win/loss: ${user.winloss}`);
    });

    console.log("==== API response ready ====");

    console.log("==== Storing valid turnover data in GameDataValidLog ====");

    // 为每个用户存储数据
    for (const username of usernames) {
      // 只处理有下注记录的用户
      if (!totalSummary.users[username]) continue;

      // 检查用户是否有有效流水
      if (totalSummary.users[username].turnoverForRebate <= 0) {
        console.log(`Skipping ${username}: no valid turnover for rebate`);
        continue;
      }

      // 创建日期字符串 (YYYY-MM-DD格式)
      const dateString = moment
        .utc()
        .add(8, "hours")
        .subtract(1, "days")
        .format("YYYY-MM-DD");

      // 初始化游戏类别数据结构
      const gameCategories = {};

      // 遍历所有游戏类型汇总数据
      for (const key in gameTypeSummaries) {
        const summary = gameTypeSummaries[key];

        if (
          summary.users &&
          summary.users[username] &&
          summary.users[username].turnoverForRebate > 0
        ) {
          // 只处理有效流水大于0的游戏

          // 获取游戏名称和类别
          const gameName = summary.gamename;
          const gameCategory = summary.gamecategory;

          // 跳过总计摘要
          if (gameName === "ALL_GAMES") continue;

          // 如果该类别不存在，初始化
          if (!gameCategories[gameCategory]) {
            gameCategories[gameCategory] = {};
          }

          // 存储游戏有效流水（而非总流水）
          gameCategories[gameCategory][gameName] = {
            turnover: summary.users[username].turnoverForRebate,
          };
        }
      }

      // 检查是否有任何游戏类别有有效流水
      const hasValidTurnover = Object.keys(gameCategories).length > 0;

      if (!hasValidTurnover) {
        console.log(`Skipping ${username}: no valid turnover for any game`);
        continue;
      }

      try {
        // 查找现有记录
        const existingLog = await GameDataValidLog.findOne({
          username: username,
          date: dateString,
        });

        if (existingLog) {
          // 更新现有记录
          console.log(
            `Updating existing GameDataValidLog for ${username} on ${dateString}`
          );
          existingLog.gameCategories = gameCategories;
          await existingLog.save();
        } else {
          // 创建新记录
          console.log(
            `Creating new GameDataValidLog for ${username} on ${dateString}`
          );
          await GameDataValidLog.create({
            username: username,
            date: dateString,
            gameCategories: gameCategories,
          });
        }
      } catch (error) {
        console.error(`Error storing GameDataValidLog for ${username}:`, error);
      }
    }

    console.log("==== Finished storing valid turnover data ====");

    // 返回汇总结果
    return res.status(200).json({
      success: true,
      summaries: [...Object.values(gameTypeSummaries), totalSummary],
    });
  } catch (error) {
    console.error("==== ERROR IN ALL GAMES TURNOVER CALCULATION ====");
    console.error("Error details:", error);
    console.error("Stack trace:", error.stack);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch turnover report for all games",
    });
  } finally {
    console.log("==== END: ALL GAMES TURNOVER CALCULATION ====\n");
  }
});

router.post("/api/turnover/getweeklyturnover", async (req, res) => {
  try {
    const today = moment.utc().add(8, "hours");
    const currentDayOfWeek = today.day();
    let startDate, endDate;

    if (currentDayOfWeek === 1) {
      startDate = moment(today)
        .subtract(7, "days")
        .startOf("week")
        .add(1, "days");
      endDate = moment(today).subtract(1, "days").endOf("day");
    } else {
      startDate = moment(today).startOf("week").add(1, "days");
      endDate = moment(today).subtract(1, "days").endOf("day");
    }

    const startDateStr = startDate.format("YYYY-MM-DD");
    const endDateStr = endDate.format("YYYY-MM-DD");

    const dateRange = [];
    let currentDate = moment(startDate);
    while (currentDate <= endDate) {
      dateRange.push(currentDate.format("YYYY-MM-DD"));
      currentDate = moment(currentDate).add(1, "days");
    }

    const aggregatedResults = await GameDataValidLog.aggregate([
      { $match: { date: { $in: dateRange } } },

      {
        $project: {
          username: 1,
          date: 1,
          gameCategories: { $objectToArray: "$gameCategories" },
        },
      },

      { $unwind: "$gameCategories" },
      {
        $project: {
          username: 1,
          date: 1,
          categoryName: "$gameCategories.k",
          games: { $objectToArray: "$gameCategories.v" },
        },
      },

      { $unwind: "$games" },
      {
        $project: {
          username: 1,
          date: 1,
          gameName: "$games.k",
          gameTurnover: { $toDouble: "$games.v.turnover" },
        },
      },

      {
        $group: {
          _id: "$username",
          totalValidTurnover: { $sum: "$gameTurnover" },
        },
      },

      {
        $project: {
          _id: 0,
          username: "$_id",
          totalValidTurnover: { $round: ["$totalValidTurnover", 2] },
        },
      },

      { $sort: { totalValidTurnover: -1 } },
      { $limit: 20 },
    ]);

    const metadata = {
      daysIncluded: dateRange,
      totalUsers: aggregatedResults.length,
      startDate: startDateStr,
      endDate: endDateStr,
    };

    return res.status(200).json({
      startDate: startDateStr,
      endDate: endDateStr,
      success: true,
      metadata: metadata,
      data: aggregatedResults,
    });
  } catch (error) {
    console.error("==== ERROR IN WEEKLY TURNOVER RETRIEVAL ====");
    console.error("Error obtaining weekly turnover data:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "Internal Server Error. Please contact customer service for further assistance",
        zh: "服务器内部错误。请联系客服以获取进一步帮助",
        ms: "Ralat Pelayan Dalaman. Sila hubungi khidmat pelanggan untuk bantuan lanjut",
      },
    });
  }
});

async function getLastWeekValidTurnoverByCategory() {
  try {
    const today = moment.utc().add(8, "hours");
    const yesterday = moment(today).subtract(1, "days");
    const yesterdayDayOfWeek = yesterday.day();

    let startDate;

    if (yesterdayDayOfWeek === 0) {
      startDate = moment(yesterday).subtract(6, "days");
    } else {
      startDate = moment(yesterday).startOf("week").add(1, "days");
    }

    const endDate = yesterday;

    console.log(`Query start date: ${startDate.format("YYYY-MM-DD")}`);
    console.log(`Query end date: ${endDate.format("YYYY-MM-DD")}`);

    // 生成查询时间范围内的所有日期
    const dateRange = [];
    let currentDate = moment(startDate);

    while (currentDate <= endDate) {
      dateRange.push(currentDate.format("YYYY-MM-DD"));
      currentDate = moment(currentDate).add(1, "days");
    }

    console.log(`Date range: ${dateRange.join(", ")}`);

    const validTurnoverLogs = await GameDataValidLog.find({
      date: { $in: dateRange },
    }).lean();

    console.log(
      `Found ${validTurnoverLogs.length} turnover records in date range`
    );

    const resultByCategory = {};

    for (const log of validTurnoverLogs) {
      const username = log.username;

      for (const [categoryName, games] of Object.entries(log.gameCategories)) {
        if (!resultByCategory[categoryName]) {
          resultByCategory[categoryName] = {};
        }

        for (const [gameName, gameData] of Object.entries(games)) {
          if (!resultByCategory[categoryName][username]) {
            resultByCategory[categoryName][username] = {
              turnover: 0,
            };
          }

          const turnover = gameData.turnover || 0;
          resultByCategory[categoryName][username].turnover += turnover;
        }
      }
    }

    for (const category in resultByCategory) {
      for (const username in resultByCategory[category]) {
        resultByCategory[category][username].turnover = Number(
          resultByCategory[category][username].turnover.toFixed(2)
        );
      }
    }

    return {
      success: true,
      resultByCategory,
    };
  } catch (error) {
    console.error("Error obtaining last week valid turnover:", error.message);

    return {
      success: false,
      resultByCategory: {},
    };
  }
}

router.post("/api/user/claimrebate", authenticateToken, async (req, res) => {
  try {
    console.log("==== START: USER CLAIM REBATE PROCESS ====");
    const userId = req.user.userId;
    const user = await User.findById(userId);
    const username = user.username;
    console.log(`Processing rebate claim for user: ${username}`);

    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found. Please try again or contact customer service for assistance.",
          zh: "用户未找到，请重试或联系客服以获取帮助。",
          ms: "Pengguna tidak ditemui, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
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

    console.log(`User VIP level: ${user.viplevel}`);

    // 获取VIP设置以获取返水比例
    const vipSetting = await vip.findOne();

    if (!vipSetting) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Invalid VIP. Please try again or contact customer service for assistance.",
          zh: "VIP 无效，请重试或联系客服以获取帮助。",
          ms: "VIP tidak sah, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    // 查找用户的VIP等级对应的设置
    const userVipLevel = vipSetting.vipLevels.find(
      (level) => level.name === user.viplevel
    );

    if (!userVipLevel) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Invalid VIP level. Please try again or contact customer service for assistance.",
          zh: "VIP 等级无效，请重试或联系客服以获取帮助。",
          ms: "Tahap VIP tidak sah, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    console.log(`Found user VIP level settings: ${userVipLevel.name}`);

    // 解析各游戏类别的返水比例
    const rebateRates = {
      "Slot Games":
        parseFloat(userVipLevel.benefits.get("Rebate Slot") || "0%") / 100,
      "Live Casino":
        parseFloat(userVipLevel.benefits.get("Rebate Live Casino") || "0%") /
        100,
      Sports:
        parseFloat(
          userVipLevel.benefits.get("Rebate Sports & Esports") || "0%"
        ) / 100,
      "E-Sports":
        parseFloat(
          userVipLevel.benefits.get("Rebate Sports & Esports") || "0%"
        ) / 100,
    };

    // 检查其他游戏类别是否有返水设置
    for (const category of ["Fishing", "Lottery"]) {
      if (userVipLevel.benefits[`Rebate ${category}`]) {
        rebateRates[category] =
          parseFloat(userVipLevel.benefits[`Rebate ${category}`]) / 100;
      } else {
        console.log(
          `No rebate setting found for category: ${category}, defaulting to 0%`
        );
        rebateRates[category] = 0;
      }
    }

    console.log("Rebate rates by category:", rebateRates);

    // 确定查询的时间范围
    let endDate = moment.utc().toDate(); // 当前时间
    // 设置一个固定的往前查询天数，例如30天
    let startDate = moment
      .utc()
      .add(8, "hours")
      .subtract(4, "days")
      .subtract(8, "hours")
      .toDate();

    console.log(
      `Query time range: ${startDate.toISOString()} to ${endDate.toISOString()}`
    );

    // 定义所有游戏模型及其相关信息
    const gameModels = [
      {
        name: "PPSLOT",
        model: SlotLivePPModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          refunded: false,
          ended: true,
          gameType: "Slot",
        },
      },
      {
        name: "PPLIVE",
        model: SlotLivePPModal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          refunded: false,
          ended: true,
          gameType: "Live",
        },
      },
      {
        name: "ASIA GAMING",
        model: SlotLiveAGModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          gametype: "SLOT",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "ASIA GAMING",
        model: SlotLiveAGModal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          gametype: "LIVE",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "WM CASINO",
        model: SlotLiveGSCModal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          platform: "1020",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "YEEBET",
        model: SlotLiveGSCModal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          platform: "1016",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "SEXYBCRT",
        model: SlotLiveGSCModal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          platform: "1022",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "DREAM GAMING",
        model: SlotLiveGSCModal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          platform: "1052",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "EVOLUTION",
        model: SlotLiveGSCModal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          platform: "1002",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "BIG GAMING",
        model: SlotLiveGSCModal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          platform: "1004",
          gametype: "LIVE_CASINO",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "NOLIMIT",
        model: SlotLiveGSCModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          platform: "1166",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "JDB",
        model: SlotLiveGSCModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          platform: "1085",
          gametype: "SLOT",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "JDB",
        model: SlotLiveGSCModal,
        category: "Fishing",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          platform: "1085",
          gametype: "FISHING",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "RED TIGER",
        model: SlotLiveGSCModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          platform: "1169",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "NETENT",
        model: SlotLiveGSCModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          platform: "1168",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "TFGAMING",
        model: SlotLiveGSCModal,
        category: "E-Sports",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          platform: "1222",
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "JOKER",
        model: SlotJokerModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        hasFishGame: true,
        fishTurnoverField: "fishTurnover",
        fishWinLossField: "fishWinLoss",
        query: {
          createdAt: { $gte: startDate, $lt: endDate },
          username: username,
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "JILI",
        model: SlotJiliModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          cancel: { $ne: true },
          gametype: "SLOT",
          settle: true,
        },
      },
      {
        name: "JILI",
        model: SlotJiliModal,
        category: "Fishing",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          cancel: { $ne: true },
          gametype: "FISH",
          settle: true,
        },
      },
      {
        name: "HABANERO",
        model: SlotHabaneroModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          refund: { $ne: true },
          settle: true,
        },
      },
      {
        name: "918KISSH5",
        model: SlotKiss918H5Modal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "CQ9",
        model: SlotCQ9Modal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          gametype: "SLOT",
          cancel: { $ne: true },
          refund: { $ne: true },
          settle: true,
        },
      },
      {
        name: "CQ9",
        model: SlotCQ9Modal,
        category: "Fishing",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          gametype: "FISH",
          cancel: { $ne: true },
          refund: { $ne: true },
          settle: true,
        },
      },
      {
        name: "LIVE22",
        model: SlotLive22Modal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "UU SLOT",
        model: SlotUUSlotModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "CT855",
        model: LiveCT855Modal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "PLAYTECH",
        model: PlaytechGameModal,
        category: "Slot Games",
        betField: "betAmount",
        settleField: "settleamount",
        query: {
          createdAt: { $gte: startDate, $lt: endDate },
          settle: true,
          username: username,
          cancel: { $ne: true },
          gameType: "Slot",
        },
      },
      {
        name: "PLAYTECH",
        model: PlaytechGameModal,
        category: "Live Casino",
        betField: "betAmount",
        settleField: "settleamount",
        query: {
          createdAt: { $gte: startDate, $lt: endDate },
          settle: true,
          username: username,
          cancel: { $ne: true },
          gameType: "Live",
        },
      },
      {
        name: "NEXTSPIN",
        model: SlotNextSpinModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: { $gte: startDate, $lt: endDate },
          settle: true,
          username: username,
          cancel: { $ne: true },
        },
      },
      {
        name: "LFC888",
        model: SlotLFC888Modal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: { $gte: startDate, $lt: endDate },
          settle: true,
          username: username,
          cancel: { $ne: true },
        },
      },
      {
        name: "MEGA888H5",
        model: SlotMega888H5Modal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: { $gte: startDate, $lt: endDate },
          settle: true,
          username: username,
          cancel: { $ne: true },
        },
      },
      {
        name: "ALIPAY",
        model: LotteryAP95Modal,
        category: "Lottery",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: { $gte: startDate, $lt: endDate },
          username: username,
        },
      },
      {
        name: "LIONKING",
        model: slotLionKingModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: { $gte: startDate, $lt: endDate },
          username: username,
        },
      },
      {
        name: "GW99",
        model: slotGW99Modal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          settle: true,
        },
      },
      // SPADE GAMING SLOT
      {
        name: "SPADE GAMING SLOT",
        model: SlotSpadeGamingModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          settle: true,
          cancel: { $ne: true },
          gametype: "SLOT",
        },
      },
      // SPADE GAMING FISH
      {
        name: "SPADE GAMING FISH",
        model: SlotSpadeGamingModal,
        category: "Fishing",
        betField: "betamount",
        settleField: "withdrawamount", // This won't be used for win/loss calculation
        // Special handling flags for Spade Gaming Fish
        hasSpecialWinLoss: true,
        depositField: "depositamount",
        withdrawField: "withdrawamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          settle: true,
          cancel: { $ne: true },
          gametype: "FISH",
        },
      },
      // FACHAI
      {
        name: "FACHAI",
        model: SlotFachaiModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          settle: true,
          cancel: { $ne: true },
        },
      },
      {
        name: "SA GAMING",
        model: LiveSaGamingModal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "MICRO GAMING",
        model: SlotLiveMicroGamingModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          cancel: { $ne: true },
          settle: true,
          gameType: "SLOT",
        },
      },
      {
        name: "MICRO GAMING",
        model: SlotLiveMicroGamingModal,
        category: "Live Casino",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          cancel: { $ne: true },
          settle: true,
          gameType: "LIVE",
        },
      },
      {
        name: "HACKSAW",
        model: SlotHacksawModal,
        category: "Slot Games",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          cancel: { $ne: true },
          settle: true,
        },
      },
      {
        name: "CMD368",
        model: SportCMDModal,
        category: "Sports",
        betField: "betamount",
        settleField: "settleamount",
        query: {
          createdAt: {
            $gte: startDate,
            $lt: endDate,
          },
          username: username,
          cancel: { $ne: true },
        },
      },
    ];

    // 使用对象存储所有用户的下注记录
    const allUserBets = [];

    // 使用对象存储每个游戏类型对应的用户汇总数据
    const gameTypeSummaries = {};

    // 初始化游戏类型汇总对象 - 使用复合键
    for (const game of gameModels) {
      const key = `${game.name}_${game.category}`;
      gameTypeSummaries[key] = {
        gamename: game.name,
        gamecategory: game.category,
        turnover: 0,
        winloss: 0,
        turnoverForRebate: 0,
        claimedTurnover: 0, // 新增：已领取的流水
        unclaimedTurnover: 0, // 新增：未领取的流水
      };
    }

    // 添加一个总计汇总
    const totalSummary = {
      gamename: "ALL_GAMES",
      gamecategory: "All Games",
      turnover: 0,
      winloss: 0,
      turnoverForRebate: 0,
      claimedTurnover: 0, // 新增：已领取的流水
      unclaimedTurnover: 0, // 新增：未领取的流水
    };

    // 从所有游戏模型获取记录
    for (const game of gameModels) {
      console.log(`Fetching records from ${game.name} (${game.category})...`);
      const gameRecords = await game.model.find(game.query).lean();
      console.log(
        `Found ${gameRecords.length} records in ${game.name} (${game.category})`
      );

      // 跳过没有记录的游戏
      if (gameRecords.length === 0) {
        continue;
      }

      // 使用复合键标识游戏类型
      const key = `${game.name}_${game.category}`;

      // 处理每条记录
      for (const record of gameRecords) {
        // 确保 claimed 字段存在，如果不存在则设为 false
        record.claimed = record.claimed || false;

        // 添加游戏类型标识
        record.gameType = game.name;
        record.gameCategory = game.category;
        record.gameKey = key; // 添加复合键
        record.betField = game.betField;
        record.settleField = game.settleField;

        // 添加特殊游戏字段处理
        if (game.hasFishGame) {
          record.hasFishGame = true;
          record.fishTurnoverField = game.fishTurnoverField;
          record.fishWinLossField = game.fishWinLossField;
        }

        // 添加特殊win/loss计算标志 for Spade Gaming Fish
        if (game.hasSpecialWinLoss) {
          record.hasSpecialWinLoss = true;
          record.depositField = game.depositField;
          record.withdrawField = game.withdrawField;
        }

        // 添加记录到用户的下注列表
        allUserBets.push(record);

        // 获取下注金额（turnover）
        let betAmount = record[game.betField] || 0;

        // 处理钓鱼游戏特殊字段 (Joker)
        if (game.hasFishGame) {
          betAmount += record[game.fishTurnoverField] || 0;
        }
        // For Spade Gaming Fish, betamount is already the correct turnover

        // 计算win/loss
        let winLoss = 0;

        if (game.hasSpecialWinLoss) {
          // Special calculation for Spade Gaming Fish: withdrawamount - depositamount
          const withdrawAmount = record[game.withdrawField] || 0;
          const depositAmount = record[game.depositField] || 0;
          winLoss = withdrawAmount - depositAmount;
        } else if (game.hasFishGame) {
          // Handle Joker fish games
          const settleAmount = record[game.settleField] || 0;
          const fishWinLoss = record[game.fishWinLossField] || 0;
          winLoss = settleAmount - betAmount + fishWinLoss;
        } else {
          // Standard calculation: settleAmount - betAmount
          const settleAmount = record[game.settleField] || 0;
          winLoss = settleAmount - betAmount;
        }

        // 更新游戏类型汇总
        gameTypeSummaries[key].turnover += betAmount;
        gameTypeSummaries[key].winloss += winLoss;

        // 根据claimed状态分别累计流水
        if (record.claimed) {
          gameTypeSummaries[key].claimedTurnover += betAmount;
        } else {
          gameTypeSummaries[key].unclaimedTurnover += betAmount;
        }

        // 更新总计汇总
        totalSummary.turnover += betAmount;
        totalSummary.winloss += winLoss;

        // 根据claimed状态分别累计总流水
        if (record.claimed) {
          totalSummary.claimedTurnover += betAmount;
        } else {
          totalSummary.unclaimedTurnover += betAmount;
        }
      }
    }

    console.log(`Found ${allUserBets.length} total bets for user ${username}`);

    // 如果没有下注记录，直接返回
    if (allUserBets.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No game records found in the specified period",
        rebateAmount: 0,
        claimDetails: {},
      });
    }

    // 按时间排序所有下注记录
    allUserBets.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // 获取所有奖金记录
    const bonuses = await Bonus.find({
      username: username,
      status: "approved",
      createdAt: { $lt: endDate },
    })
      .sort({ createdAt: 1 })
      .lean();

    console.log(`Found ${bonuses.length} bonuses for ${username}`);

    // 获取用户的普通存款记录（未关联奖金的存款）
    console.log(`Searching for non-bonus deposits for ${username}...`);

    // 提取所有已关联奖金的存款ID
    const linkedDepositIds = bonuses
      .filter((b) => b.depositId)
      .map((b) => b.depositId.toString());

    const deposits = await Deposit.find({
      username: username,
      status: "approved",
      createdAt: { $lt: endDate },
    }).lean();

    // 过滤出未关联奖金的存款
    const nonBonusDeposits = deposits.filter(
      (d) => !linkedDepositIds.includes(d._id.toString())
    );

    console.log(
      `Found ${nonBonusDeposits.length} non-bonus deposits for ${username}`
    );

    // 如果没有找到奖金记录和普通存款，所有下注都计入返水
    if (bonuses.length === 0 && nonBonusDeposits.length === 0) {
      console.log(
        `No bonuses or non-bonus deposits found for ${username}, all bets will count for rebate`
      );

      // 为每个游戏类型更新返水金额 - 所有有效流水
      for (const key in gameTypeSummaries) {
        gameTypeSummaries[key].turnoverForRebate =
          gameTypeSummaries[key].turnover;
      }

      // 更新总计返水
      totalSummary.turnoverForRebate = totalSummary.turnover;
    } else {
      // 处理每个奖金和普通存款记录
      const turnoverRequirements = [];

      // 先处理奖金记录
      for (const bonus of bonuses) {
        console.log(`Processing bonus ID: ${bonus._id}`);

        // 获取促销信息
        const bonusPromotion = await promotion
          .findById(bonus.promotionId)
          .lean();

        if (!bonusPromotion) {
          console.log(
            `Promotion not found for ID: ${bonus.promotionId}, skipping this bonus`
          );
          continue;
        }

        // 获取存款信息
        let depositAmount = 0;
        if (bonus.depositId) {
          const relatedDeposit = await Deposit.findById(bonus.depositId).lean();

          if (relatedDeposit) {
            depositAmount = relatedDeposit.amount || 0;
          }
        }

        // 计算流水要求
        const baseAmount = bonus.amount + depositAmount;
        const requiredTurnover = baseAmount * bonusPromotion.turnoverrequiremnt;

        turnoverRequirements.push({
          id: bonus._id.toString(),
          createdAt: new Date(bonus.createdAt),
          amount: bonus.amount,
          depositAmount: depositAmount,
          requiredTurnover: requiredTurnover,
          completedTurnover: 0,
          completedAt: null,
          isActive: true,
          excessCalculated: false,
          isRegularDeposit: false, // 标记为奖金
        });
      }

      // 再处理普通存款记录
      for (const deposit of nonBonusDeposits) {
        console.log(`Processing non-bonus deposit ID: ${deposit._id}`);

        // 对于普通存款，流水要求就等于存款金额
        const requiredTurnover = deposit.amount;

        turnoverRequirements.push({
          id: `deposit-${deposit._id.toString()}`,
          createdAt: new Date(deposit.createdAt),
          amount: 0, // 不是奖金，所以奖金金额为0
          depositAmount: deposit.amount,
          requiredTurnover: requiredTurnover,
          completedTurnover: 0,
          completedAt: null,
          isActive: true,
          excessCalculated: false,
          isRegularDeposit: true, // 标记为普通存款
        });
      }

      // 按创建时间排序所有流水要求记录
      turnoverRequirements.sort((a, b) => a.createdAt - b.createdAt);

      // 按时间顺序处理所有下注
      console.log(`Processing bets in chronological order...`);

      // 为每个游戏类型初始化有效返水金额 - 使用复合键
      const gameTypeValidTurnover = {};
      for (const key in gameTypeSummaries) {
        gameTypeValidTurnover[key] = 0;
      }

      // 跟踪当前活跃的流水要求索引
      let currentRequirementIndex = -1;

      for (const bet of allUserBets) {
        const betTime = new Date(bet.createdAt);
        const gameKey = bet.gameKey;

        // 计算下注金额
        let betAmount = bet[bet.betField] || 0;

        if (bet.hasFishGame) {
          betAmount += bet[bet.fishTurnoverField] || 0;
        }
        // For Spade Gaming Fish, betamount is already the correct turnover

        // 查找这笔下注时活跃的流水要求
        while (
          currentRequirementIndex + 1 < turnoverRequirements.length &&
          betTime >= turnoverRequirements[currentRequirementIndex + 1].createdAt
        ) {
          // 切换到下一个流水要求之前，检查前一个流水要求的超额流水
          if (currentRequirementIndex >= 0) {
            const prevRequirement =
              turnoverRequirements[currentRequirementIndex];
            if (
              prevRequirement.completedTurnover >=
                prevRequirement.requiredTurnover &&
              !prevRequirement.excessCalculated
            ) {
              const excess =
                prevRequirement.completedTurnover -
                prevRequirement.requiredTurnover;
              if (excess > 0) {
                // 计算每个游戏类型在总流水中的占比
                const totalTurnover = Object.values(
                  gameTypeValidTurnover
                ).reduce((sum, val) => sum + val, 0);

                if (totalTurnover > 0) {
                  // 按比例分配超额流水到各个游戏类型
                  for (const key in gameTypeValidTurnover) {
                    const gameShare =
                      (gameTypeValidTurnover[key] / totalTurnover) * excess;
                    gameTypeValidTurnover[key] += gameShare;
                  }
                }

                prevRequirement.excessCalculated = true;
              }
            }
          }

          // 切换到下一个流水要求
          currentRequirementIndex++;
        }

        // 检查是否有活跃的流水要求
        if (currentRequirementIndex === -1) {
          // 没有活跃的流水要求，这笔下注应该计入返水
          gameTypeValidTurnover[gameKey] += betAmount;
        } else {
          // 有活跃的流水要求，检查是否已满足
          const currentRequirement =
            turnoverRequirements[currentRequirementIndex];

          // 如果流水要求已经满足
          if (
            currentRequirement.completedTurnover >=
            currentRequirement.requiredTurnover
          ) {
            // 这笔下注应该计入返水
            gameTypeValidTurnover[gameKey] += betAmount;
          } else {
            // 流水要求还没满足，这笔下注用于满足流水
            const previousTurnover = currentRequirement.completedTurnover;
            currentRequirement.completedTurnover += betAmount;

            // 检查这笔下注后是否满足流水要求
            if (
              currentRequirement.completedTurnover >=
              currentRequirement.requiredTurnover
            ) {
              // 这笔下注满足了流水要求
              currentRequirement.completedAt = betTime;

              // 计算超出部分
              const excess =
                currentRequirement.completedTurnover -
                currentRequirement.requiredTurnover;
              if (excess > 0) {
                // 超出部分计入返水
                gameTypeValidTurnover[gameKey] += excess;
                currentRequirement.excessCalculated = true;
              }
            }
          }
        }
      }

      // 检查最后一个活跃流水要求的超额部分
      if (currentRequirementIndex >= 0) {
        const lastRequirement = turnoverRequirements[currentRequirementIndex];
        if (
          lastRequirement.completedTurnover >=
            lastRequirement.requiredTurnover &&
          !lastRequirement.excessCalculated
        ) {
          const excess =
            lastRequirement.completedTurnover -
            lastRequirement.requiredTurnover;
          if (excess > 0) {
            const totalTurnoverBeforeExcess = Object.values(
              gameTypeValidTurnover
            ).reduce((sum, val) => sum + val, 0);
            const totalGameTurnover = totalSummary.turnover;

            // 如果已经有一些有效返水，按比例分配超额
            if (totalTurnoverBeforeExcess > 0) {
              for (const key in gameTypeValidTurnover) {
                const gameShare =
                  (gameTypeValidTurnover[key] / totalTurnoverBeforeExcess) *
                  excess;
                gameTypeValidTurnover[key] += gameShare;
              }
            }
            // 如果之前没有有效返水，按总流水比例分配
            else if (totalGameTurnover > 0) {
              for (const key in gameTypeSummaries) {
                const gameTurnover = gameTypeSummaries[key].turnover;
                const gameShare = (gameTurnover / totalGameTurnover) * excess;
                gameTypeValidTurnover[key] += gameShare;
              }
            }

            lastRequirement.excessCalculated = true;
          }
        }
      }

      // 更新每个游戏类型的有效返水 - 使用复合键
      for (const key in gameTypeSummaries) {
        gameTypeSummaries[key].turnoverForRebate =
          gameTypeValidTurnover[key] || 0;
      }

      // 更新总计的有效返水
      totalSummary.turnoverForRebate = Object.values(
        gameTypeValidTurnover
      ).reduce((sum, val) => sum + val, 0);
    }

    // 格式化结果
    console.log("\n==== Formatting results ====");

    // 格式化每个游戏类型的汇总数据
    for (const key in gameTypeSummaries) {
      const summary = gameTypeSummaries[key];
      summary.turnover = Number(summary.turnover.toFixed(2));
      summary.turnoverForRebate = Number(summary.turnoverForRebate.toFixed(2));
      summary.winloss = Number(summary.winloss.toFixed(2));
      summary.claimedTurnover = Number(summary.claimedTurnover.toFixed(2));
      summary.unclaimedTurnover = Number(summary.unclaimedTurnover.toFixed(2));
    }

    // 格式化总计汇总数据
    totalSummary.turnover = Number(totalSummary.turnover.toFixed(2));
    totalSummary.turnoverForRebate = Number(
      totalSummary.turnoverForRebate.toFixed(2)
    );
    totalSummary.winloss = Number(totalSummary.winloss.toFixed(2));
    totalSummary.claimedTurnover = Number(
      totalSummary.claimedTurnover.toFixed(2)
    );
    totalSummary.unclaimedTurnover = Number(
      totalSummary.unclaimedTurnover.toFixed(2)
    );

    // 按游戏类别组织返水数据
    const categoryRebate = {};
    let totalRebateAmount = 0;

    // 处理每个游戏类型汇总
    for (const key in gameTypeSummaries) {
      const summary = gameTypeSummaries[key];
      const category = summary.gamecategory;

      // 如果该类别不存在，初始化
      if (!categoryRebate[category]) {
        categoryRebate[category] = {
          totalTurnover: 0,
          validTurnover: 0,
          unclaimedValidTurnover: 0, // 新增：未领取的有效流水
          winloss: 0,
          rebateRate: rebateRates[category] || 0,
          rebateAmount: 0,
          games: {},
        };
      }

      // 累加类别数据
      categoryRebate[category].totalTurnover += summary.turnover;

      // 有效流水计算 - 这里需要考虑claimed状态
      const validTurnover = summary.turnoverForRebate;
      categoryRebate[category].validTurnover += validTurnover;

      // 计算未领取的有效流水比例
      const totalBetAmount = summary.turnover;
      const unclaimedBetAmount = summary.unclaimedTurnover;

      // 如果总流水为0，则未领取的有效流水也为0
      let unclaimedValidTurnover = 0;
      if (totalBetAmount > 0) {
        // 按比例计算未领取的有效流水
        const unclaimedRatio = unclaimedBetAmount / totalBetAmount;

        unclaimedValidTurnover = validTurnover * unclaimedRatio;
      }

      categoryRebate[category].unclaimedValidTurnover += unclaimedValidTurnover;
      categoryRebate[category].winloss += summary.winloss;

      // 添加游戏数据
      categoryRebate[category].games[summary.gamename] = {
        turnover: summary.turnover,
        validTurnover: validTurnover,
        unclaimedValidTurnover: unclaimedValidTurnover,
        winloss: summary.winloss,
      };
    }

    const formulaStrings = [];

    // 计算每个类别的返水金额 - 只考虑未领取的有效流水
    for (const category in categoryRebate) {
      const data = categoryRebate[category];
      const rebatePercentage = (data.rebateRate * 100).toFixed(2); // Convert rate to percentage

      // 计算返水金额（未领取的有效流水 * 返水比例）
      data.rebateAmount = data.unclaimedValidTurnover * data.rebateRate;

      totalRebateAmount += data.rebateAmount;

      formulaStrings.push(
        `${category} (VIP ${
          user.viplevel
        }): ${data.unclaimedValidTurnover.toFixed(
          2
        )} * ${rebatePercentage}% = ${data.rebateAmount.toFixed(2)}`
      );

      // 格式化数字
      data.totalTurnover = Number(data.totalTurnover.toFixed(2));
      data.validTurnover = Number(data.validTurnover.toFixed(2));
      data.unclaimedValidTurnover = Number(
        data.unclaimedValidTurnover.toFixed(2)
      );
      data.winloss = Number(data.winloss.toFixed(2));
      data.rebateAmount = Number(data.rebateAmount.toFixed(2));
    }

    // 格式化总返水金额
    totalRebateAmount = Number(totalRebateAmount.toFixed(2));

    // 如果总返水金额为0，直接返回
    if (totalRebateAmount <= 1) {
      console.log("rebate amount is less than 1, cannot claim");
      return res.status(200).json({
        success: false,
        message: {
          en: `Your current rebate amount (${totalRebateAmount}) is insufficient to claim. The minimum amount for rebate claims is 1.`,
          zh: `您的当前返水金额 (${totalRebateAmount}) 不足以领取。返水领取的最低金额为1。`,
          ms: `Jumlah rebat semasa anda (${totalRebateAmount}) tidak mencukupi untuk dituntut. Jumlah minimum untuk tuntutan rebat adalah 1.`,
        },
        totalvalidturnover: totalSummary.unclaimedTurnover,
      });

      // return res.status(200).json({
      //   success: true,
      //   message: "No rebate available for the specified period",
      //   rebateAmount: 0,
      //   claimDetails: {
      //     totalValidTurnover: totalSummary.turnoverForRebate,
      //     totalUnclaimedValidTurnover: totalSummary.unclaimedTurnover,
      //     totalTurnover: totalSummary.turnover,
      //     totalWinLoss: totalSummary.winloss,
      //     categoryDetails: categoryRebate,
      //   },
      // });
    }

    // 使用 findOneAndUpdate 原子操作更新用户的钱包余额
    const roundToTwoDecimals = (num) => Math.round(num * 100) / 100;

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      { $inc: { wallet: roundToTwoDecimals(parseFloat(totalRebateAmount)) } },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Rebate claimed failed. Please try again or contact customer service for assistance.",
          zh: "返水领取失败，请重试或联系客服以获取帮助。",
          ms: "Penebusan rebat gagal, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    console.log(`Updated user wallet balance: +${totalRebateAmount}`);

    // 标记所有未领取的游戏记录为已领取
    const updatePromises = [];

    // 找出所有未领取的记录IDs
    const unclaimedBets = allUserBets.filter((bet) => !bet.claimed);

    for (const game of gameModels) {
      // 找出该游戏中未领取的记录IDs
      const claimableRecords = unclaimedBets
        .filter(
          (bet) =>
            bet.gameType === game.name && bet.gameCategory === game.category
        )
        .map((bet) => bet._id);

      if (claimableRecords.length > 0) {
        updatePromises.push(
          game.model.updateMany(
            { _id: { $in: claimableRecords } },
            { $set: { claimed: true } }
          )
        );
      }
    }

    // 等待所有更新完成
    await Promise.all(updatePromises);

    await RebateLog.create({
      username,
      categoryTurnover: {
        slotgames: categoryRebate["Slot Games"]?.validTurnover || 0,
        livecasino: categoryRebate["Live Casino"]?.validTurnover || 0,
        sports: categoryRebate["Sports"]?.validTurnover || 0,
        fishing: categoryRebate["Fishing"]?.validTurnover || 0,
        "e-sports": categoryRebate["E-Sports"]?.validTurnover || 0,
        lottery: categoryRebate["Lottery"]?.validTurnover || 0,
      },
      totalRebate: roundToTwoDecimals(parseFloat(totalRebateAmount)),
      formula: formulaStrings.join("\n"),
      type: "turnover",
      rebateissuesdate: new Date(),
      totalturnover: totalSummary.turnoverForRebate,
      slot: categoryRebate["Slot Games"]?.validTurnover || 0,
      livecasino: categoryRebate["Live Casino"]?.validTurnover || 0,
      sports: categoryRebate["Sports"]?.validTurnover || 0,
      fishing: categoryRebate["Fishing"]?.validTurnover || 0,
      esports: categoryRebate["E-Sports"]?.validTurnover || 0,
      lottery: categoryRebate["Lottery"]?.validTurnover || 0,
    });

    await UserWalletLog.create({
      userId: user._id,
      transactiontime: new Date(),
      transactiontype: "rebate",
      amount: roundToTwoDecimals(parseFloat(totalRebateAmount)),
      status: "approved",
      promotionnameEN: `Rebate ${moment()
        .tz("Asia/Kuala_Lumpur")
        .subtract(1, "day")
        .format("YYYY-MM-DD")}`,
    });

    console.log(`Marked ${unclaimedBets.length} game records as claimed`);

    // 返回结果
    return res.status(200).json({
      success: true,
      message: {
        en: `Rebate of ${totalRebateAmount} has been added to your wallet`,
        zh: `返水金额 ${totalRebateAmount} 已添加到您的钱包`,
        ms: `Rebat ${totalRebateAmount} telah ditambahkan ke dompet anda`,
      },
      claimDetails: {
        totalValidTurnover: totalSummary.turnoverForRebate,
        totalUnclaimedValidTurnover: totalSummary.unclaimedTurnover,
        totalTurnover: totalSummary.turnover,
        totalWinLoss: totalSummary.winloss,
        categoryDetails: categoryRebate,
      },
    });
  } catch (error) {
    console.error("Error USER CLAIM REBATE PROCESS:", error.message);

    return res.status(500).json({
      success: false,
      message: {
        en: "Internal Server Error. Please contact customer service for further assistance",
        zh: "服务器内部错误。请联系客服以获取进一步帮助",
        ms: "Ralat Pelayan Dalaman. Sila hubungi khidmat pelanggan untuk bantuan lanjut",
      },
    });
  }
});

router.post("/api/games/active-games", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Use lean() and only select username field for faster lookup
    let user = await User.findById(userId, { username: 1 }).lean();

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

    const seenGameNames = new Set();
    const uniqueActiveGames = [];

    const queryModel = async (model, conditions, gameName) => {
      try {
        // Early return if we've already seen this game
        if (seenGameNames.has(gameName)) {
          return [];
        }

        const games = await model
          .find({
            username: user.username,
            ...conditions,
          })
          .select("_id betId uniqueId tranId createdAt gameRoundCode")
          .sort({ createdAt: -1 }) // Sort at DB level
          .limit(1) // Only get the most recent game per provider
          .lean(); // Use lean() for faster queries

        if (games.length > 0) {
          seenGameNames.add(gameName);
          return [
            {
              gameName,
              betId:
                games[0].betId ||
                games[0].gameRoundCode ||
                games[0].tranId ||
                games[0].uniqueId,
              username: user.username,
              createdAt: games[0].createdAt,
            },
          ];
        }
        return [];
      } catch (error) {
        console.error(`Error querying ${gameName}:`, error);
        return [];
      }
    };

    // Execute queries with early termination potential
    const gameQueries = await Promise.allSettled([
      // PP Slot & Live
      queryModel(
        SlotLivePPModal,
        {
          $or: [{ ended: false }, { ended: { $exists: false } }],
          refunded: false,
          gameType: "Slot",
        },
        "Pragmatic Play"
      ),

      queryModel(
        SlotLiveAGModal,
        {
          $or: [{ settle: false }, { settle: { $exists: false } }],
          cancel: { $ne: true },
          gametype: "SLOT",
        },
        "Asia Gaming"
      ),

      queryModel(
        SlotLiveGSCModal,
        {
          $or: [{ settle: false }, { settle: { $exists: false } }],
          cancel: { $ne: true },
          platform: "1166",
        },
        "NOLIMIT"
      ),

      queryModel(
        SlotLiveGSCModal,
        {
          $or: [{ settle: false }, { settle: { $exists: false } }],
          cancel: { $ne: true },
          platform: "1085",
          gametype: "SLOT",
        },
        "JDB"
      ),

      queryModel(
        SlotLiveGSCModal,
        {
          $or: [{ settle: false }, { settle: { $exists: false } }],
          cancel: { $ne: true },
          platform: "1169",
        },
        "Red Tiger"
      ),

      queryModel(
        SlotLiveGSCModal,
        {
          $or: [{ settle: false }, { settle: { $exists: false } }],
          cancel: { $ne: true },
          platform: "1168",
        },
        "NETENT"
      ),

      queryModel(
        SlotJokerModal,
        {
          $or: [{ settle: false }, { settle: { $exists: false } }],
          withdraw: { $ne: true },
          deposit: { $ne: true },
          cancel: { $ne: true },
        },
        "Joker"
      ),

      queryModel(
        SlotJiliModal,
        {
          $or: [{ settle: false }, { settle: { $exists: false } }],
          cancel: { $ne: true },
          gametype: "SLOT",
        },
        "Jili"
      ),

      queryModel(
        SlotHabaneroModal,
        {
          $or: [
            {
              $and: [
                { $or: [{ settle: false }, { settle: { $exists: false } }] },
                {
                  $or: [
                    { freeSpinOngoing: { $exists: false } },
                    { freeSpinOngoing: false },
                  ],
                },
              ],
            },
            { freeSpinOngoing: true },
          ],
          refund: { $ne: true },
        },
        "Habanero"
      ),

      queryModel(
        SlotKiss918H5Modal,
        {
          $or: [{ settle: false }, { settle: { $exists: false } }],
          cancel: { $ne: true },
        },
        "Kiss918"
      ),

      queryModel(
        SlotCQ9Modal,
        {
          $or: [{ settle: false }, { settle: { $exists: false } }],
          cancel: { $ne: true },
          refund: { $ne: true },
          gametype: "SLOT",
        },
        "CQ9"
      ),

      queryModel(
        SlotLive22Modal,
        {
          $or: [{ settle: false }, { settle: { $exists: false } }],
          cancel: { $ne: true },
        },
        "Live22"
      ),
      queryModel(
        SlotHacksawModal,
        {
          $or: [{ settle: false }, { settle: { $exists: false } }],
          cancel: { $ne: true },
        },
        "Hacksaw"
      ),

      queryModel(
        SlotUUSlotModal,
        {
          $or: [{ settle: false }, { settle: { $exists: false } }],
          cancel: { $ne: true },
        },
        "UUSlot"
      ),

      queryModel(
        PlaytechGameModal,
        {
          $or: [{ settle: false }, { settle: { $exists: false } }],
          cancel: { $ne: true },
          gameType: "Slot",
        },
        "Playtech"
      ),

      queryModel(
        SlotLFC888Modal,
        {
          $or: [{ settle: false }, { settle: { $exists: false } }],
          cancel: { $ne: true },
        },
        "LFC888"
      ),

      queryModel(
        SlotMega888H5Modal,
        {
          $or: [{ settle: false }, { settle: { $exists: false } }],
          cancel: { $ne: true },
        },
        "Mega888H5"
      ),
      queryModel(
        SlotSpadeGamingModal,
        {
          $or: [{ settle: false }, { settle: { $exists: false } }],
          cancel: { $ne: true },
        },
        "Spade Gaming"
      ),
      queryModel(
        SlotFachaiModal,
        {
          $or: [{ settle: false }, { settle: { $exists: false } }],
          cancel: { $ne: true },
        },
        "Fachai"
      ),
      queryModel(
        SlotLiveMicroGamingModal,
        {
          $or: [{ completed: false }, { completed: { $exists: false } }],
          cancel: { $ne: true },
          gameType: "SLOT",
        },
        "MICRO GAMING"
      ),
    ]);

    // Process results - much faster since we're only getting 1 game per provider
    gameQueries.forEach((result) => {
      if (
        result.status === "fulfilled" &&
        result.value &&
        result.value.length > 0
      ) {
        uniqueActiveGames.push(...result.value);
      } else if (result.status === "rejected") {
        console.error("Query failed:", result.reason);
      }
    });

    // Sort the final unique results
    uniqueActiveGames.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return res.status(200).json({
      success: true,
      totalActiveGames: uniqueActiveGames.length,

      activeGames: uniqueActiveGames,
      message: {
        en: "Active games retrieved successfully.",
        zh: "成功检索活跃游戏。",
        ms: "Permainan aktif berjaya diperoleh.",
      },
    });
  } catch (error) {
    console.error("Error finding active games for user:", error);
    return res.status(500).json({
      success: false,
      message: {
        en: "Failed to fetch active games",
        zh: "获取活跃游戏失败",
        ms: "Gagal mendapatkan permainan aktif",
      },
      error: error.message,
    });
  }
});

router.post(
  "/admin/api/games/active-gamesdetail/:userId",
  authenticateAdminToken,
  async (req, res) => {
    const startTime = Date.now();
    try {
      const userId = req.params.userId;
      let user = await User.findById(userId);

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

      const activeGames = [];

      const queryModel = async (model, conditions, gameName) => {
        try {
          const games = await model
            .find({
              username: user.username,
              ...conditions,
            })
            .select(
              "_id username betamount betAmount betId uniqueId tranId createdAt gameRoundCode"
            );

          return games.map((game) => ({
            gameName,
            betId:
              game.betId || game.gameRoundCode || game.tranId || game.uniqueId,
            username: user.username,
            createdAt: game.createdAt,
          }));
        } catch (error) {
          console.error(`Error querying ${gameName}:`, error);
          return [];
        }
      };

      // Execute all queries in parallel (same as above)
      const gameQueries = await Promise.allSettled([
        // PP Slot & Live - looking for ended: false
        queryModel(
          SlotLivePPModal,
          {
            $or: [{ ended: false }, { ended: { $exists: false } }],
            refunded: false,
            gameType: "Slot",
          },
          "Pragmatic Play"
        ),

        queryModel(
          SlotLiveAGModal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            cancel: { $ne: true },
            gametype: "SLOT",
          },
          "Asia Gaming"
        ),

        queryModel(
          SlotLiveGSCModal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            cancel: { $ne: true },
            platform: "1166",
          },
          "NOLIMIT"
        ),

        queryModel(
          SlotLiveGSCModal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            cancel: { $ne: true },
            platform: "1085",
            gametype: "SLOT",
          },
          "JDB"
        ),

        queryModel(
          SlotLiveGSCModal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            cancel: { $ne: true },
            platform: "1169",
          },
          "Red Tiger"
        ),

        queryModel(
          SlotLiveGSCModal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            cancel: { $ne: true },
            platform: "1168",
          },
          "NETENT"
        ),

        // Joker - looking for settle: false
        queryModel(
          SlotJokerModal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            withdraw: { $ne: true },
            deposit: { $ne: true },
            cancel: { $ne: true },
          },
          "Joker"
        ),

        // Jili - looking for settle: false
        queryModel(
          SlotJiliModal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            cancel: { $ne: true },
            gametype: "SLOT",
          },
          "Jili"
        ),

        // Habanero - looking for settle: false
        queryModel(
          SlotHabaneroModal,
          {
            $or: [
              {
                $and: [
                  { $or: [{ settle: false }, { settle: { $exists: false } }] },
                  {
                    $or: [
                      { freeSpinOngoing: { $exists: false } },
                      { freeSpinOngoing: false },
                    ],
                  },
                ],
              },
              { freeSpinOngoing: true },
            ],
            refund: { $ne: true },
          },
          "Habanero"
        ),

        // Kiss918 - looking for settle: false
        queryModel(
          SlotKiss918H5Modal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            cancel: { $ne: true },
          },
          "Kiss918"
        ),

        // CQ9 - looking for settle: false
        queryModel(
          SlotCQ9Modal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            cancel: { $ne: true },
            refund: { $ne: true },
            gametype: "SLOT",
          },
          "CQ9"
        ),

        // Live22 - looking for settle: false
        queryModel(
          SlotLive22Modal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            cancel: { $ne: true },
          },
          "Live22"
        ),
        queryModel(
          SlotHacksawModal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            cancel: { $ne: true },
          },
          "Hacksaw"
        ),
        // UUSlot - looking for settle: false
        queryModel(
          SlotUUSlotModal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            cancel: { $ne: true },
          },
          "UUSlot"
        ),

        // Playtech - looking for settle: false
        queryModel(
          PlaytechGameModal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            cancel: { $ne: true },
            gameType: "Slot",
          },
          "Playtech"
        ),

        // Nextspin - looking for settle: false

        // LFC888 - looking for settle: false
        queryModel(
          SlotLFC888Modal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            cancel: { $ne: true },
          },
          "LFC888"
        ),

        // Mega888 - looking for settle: false
        queryModel(
          SlotMega888H5Modal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            cancel: { $ne: true },
          },
          "Mega888H5"
        ),
        queryModel(
          SlotSpadeGamingModal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            cancel: { $ne: true },
          },
          "Spade Gaming"
        ),
        queryModel(
          SlotFachaiModal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            cancel: { $ne: true },
          },
          "Fachai"
        ),

        queryModel(
          LiveSaGamingModal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            cancel: { $ne: true },
          },
          "Sa Gaming"
        ),
        queryModel(
          SlotLiveMicroGamingModal,
          {
            $or: [{ completed: false }, { completed: { $exists: false } }],
            cancel: { $ne: true },
            gameType: "SLOT",
          },
          "MICRO GAMING"
        ),
      ]);

      // Process results and combine all active games
      gameQueries.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          activeGames.push(...result.value);
        } else if (result.status === "rejected") {
          console.error("Query failed:", result.reason);
        }
      });

      // Sort by creation date (newest first)
      activeGames.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      const uniqueActiveGames = [];
      const seenGameNames = new Set();

      activeGames.forEach((game) => {
        if (!seenGameNames.has(game.gameName)) {
          seenGameNames.add(game.gameName);
          uniqueActiveGames.push(game);
        }
      });

      const executionTime = Date.now() - startTime;

      return res.status(200).json({
        success: true,
        totalActiveGames: activeGames.length,
        executionTime,
        activeGames: uniqueActiveGames,
        message: {
          en: "Active games retrieved successfully.",
          zh: "成功检索活跃游戏。",
          ms: "Permainan aktif berjaya diperoleh.",
        },
      });
    } catch (error) {
      console.error("Error finding active games for user:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "Failed to fetch active games",
          zh: "获取活跃游戏失败",
          ms: "Gagal mendapatkan permainan aktif",
        },
        error: error.message,
      });
    }
  }
);

module.exports = router;
module.exports.getLastWeekValidTurnoverByCategory =
  getLastWeekValidTurnoverByCategory;
