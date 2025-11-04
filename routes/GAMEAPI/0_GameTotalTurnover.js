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
} = require("../../models/users.model");
const { adminUser, adminLog } = require("../../models/adminuser.model");

const SlotEpicWinModal = require("../../models/slot_epicwin.model");
const SlotFachaiModal = require("../../models/slot_fachai.model");
const SlotLivePlayAceModal = require("../../models/slot_liveplayace.model");
const SlotJiliModal = require("../../models/slot_jili.model");
const SlotYGRModal = require("../../models/slot_yesgetrich.model");
const SlotJokerModal = require("../../models/slot_joker.model");

const { v4: uuidv4 } = require("uuid");
const querystring = require("querystring");
const moment = require("moment");

require("dotenv").config();

const getGameDataSummary = async (
  model,
  username,
  start,
  end,
  aggregationPipeline
) => {
  try {
    const results = await model.aggregate([
      {
        $match: {
          username: username,
          createdAt: { $gte: start, $lte: end },
          ...aggregationPipeline.$match,
        },
      },
      {
        $group: aggregationPipeline.$group,
      },
    ]);

    return results.length > 0 ? results[0] : { turnover: 0, winLoss: 0 };
  } catch (error) {
    console.error(
      `Error aggregating data for model ${model.modelName}:`,
      error
    );
    return { turnover: 0, winLoss: 0 };
  }
};

router.get("/api/all/dailygamedata", authenticateToken, async (req, res) => {
  const startTime = Date.now();
  try {
    const { startDate } = req.query;
    const endDate = moment().format("YYYY-MM-DD HH:mm:ss");
    if (!startDate) {
      return res.status(400).json({
        success: false,
        message: {
          en: "Start date and end date are required",
          zh: "开始日期和结束日期是必填项",
          ms: "Tarikh mula dan tarikh akhir diperlukan",
        },
      });
    }

    const userId = req.user.userId;
    const user = await User.findById(userId);
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

    const username = user.username;

    const start = moment(new Date(startDate)).utc().toDate();
    const end = moment(new Date(endDate)).utc().toDate();

    const aggregations = {
      epicwin: {
        $match: {
          cancel: { $ne: true },
          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },

      fachai: {
        $match: {
          cancel: { $ne: true },
          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      playace: {
        $match: {
          cancel: { $ne: true },
          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      jili: {
        $match: {
          cancel: { $ne: true },
          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      ygr: {
        $match: {
          cancel: { $ne: true },
          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      joker: {
        $match: {
          cancel: { $ne: true },
          settle: true,
        },
        $group: {
          _id: null,
          turnover: {
            $sum: {
              $cond: {
                if: { $eq: ["$gametype", "FISH"] },
                then: { $ifNull: ["$fishTurnover", 0] },
                else: { $ifNull: ["$betamount", 0] },
              },
            },
          },
          winLoss: {
            $sum: {
              $cond: {
                if: { $eq: ["$gametype", "FISH"] },
                then: { $ifNull: ["$fishWinLoss", 0] },
                else: {
                  $subtract: [
                    { $ifNull: ["$settleamount", 0] },
                    { $ifNull: ["$betamount", 0] },
                  ],
                },
              },
            },
          },
        },
      },
    };

    // Create an array of promises for all aggregations to match player-report
    const promiseResults = await Promise.allSettled([
      getGameDataSummary(
        SlotEpicWinModal,
        user.gameId,
        start,
        end,
        aggregations.epicwin
      ),

      getGameDataSummary(
        SlotFachaiModal,
        user.gameId,
        start,
        end,
        aggregations.fachai
      ),

      getGameDataSummary(
        SlotLivePlayAceModal,
        user.gameId,
        start,
        end,
        aggregations.playace
      ),
      getGameDataSummary(
        SlotJiliModal,
        user.gameId,
        start,
        end,
        aggregations.jili
      ),
      getGameDataSummary(
        SlotYGRModal,
        user.gameId,
        start,
        end,
        aggregations.ygr
      ),
      getGameDataSummary(
        SlotJokerModal,
        user.gameId,
        start,
        end,
        aggregations.joker
      ),
    ]);

    // Create a result map from the resolved promises
    const results = {
      epicwin:
        promiseResults[0].status === "fulfilled"
          ? promiseResults[0].value
          : { turnover: 0, winLoss: 0 },

      fachai:
        promiseResults[1].status === "fulfilled"
          ? promiseResults[1].value
          : { turnover: 0, winLoss: 0 },

      playace:
        promiseResults[2].status === "fulfilled"
          ? promiseResults[2].value
          : { turnover: 0, winLoss: 0 },
      jili:
        promiseResults[3].status === "fulfilled"
          ? promiseResults[3].value
          : { turnover: 0, winLoss: 0 },
      ygr:
        promiseResults[4].status === "fulfilled"
          ? promiseResults[4].value
          : { turnover: 0, winLoss: 0 },
      joker:
        promiseResults[5].status === "fulfilled"
          ? promiseResults[5].value
          : { turnover: 0, winLoss: 0 },
    };
    // Calculate total turnover and win loss
    const totalTurnover = Object.values(results).reduce(
      (sum, current) => sum + (current.turnover || 0),
      0
    );

    const totalWinLoss = Object.values(results).reduce(
      (sum, current) => sum + (current.winLoss || 0),
      0
    );

    const executionTime = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      summary: {
        username,
        totalTurnover: Number(totalTurnover.toFixed(2)),
        totalWinLoss: Number(totalWinLoss.toFixed(2)),
        executionTime, // Include in development, remove in production
      },
    });
  } catch (error) {
    console.error("ALL GAME DATA: Failed to fetch report:", error);
    return res.status(500).json({
      success: false,
      message: {
        en: "Internal Server Error. Please contact IT support for further assistance.",
        zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
        ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
        zh_hk: "內部伺服器錯誤。請聯絡IT客服以獲取進一步幫助。",
        id: "Kesalahan Server Internal. Silakan hubungi dukungan IT untuk bantuan lebih lanjut.",
      },
    });
  }
});

router.post("/api/games/active-games", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    let user = await User.findById(userId, { username: 1, gameId: 1 }).lean();

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
            username: user.gameId,
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
      queryModel(
        SlotEpicWinModal,
        {
          $or: [{ settle: false }, { settle: { $exists: false } }],
          cancel: { $ne: true },
        },
        "EpicWin"
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
        SlotJiliModal,
        {
          $or: [{ settle: false }, { settle: { $exists: false } }],
          cancel: { $ne: true },
          gametype: "SLOT",
        },
        "Jili"
      ),
      queryModel(
        SlotYGRModal,
        {
          $or: [{ settle: false }, { settle: { $exists: false } }],
          cancel: { $ne: true },
          gametype: "SLOT",
        },
        "YGR"
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
              username: user.gameId,
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
        queryModel(
          SlotEpicWinModal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            cancel: { $ne: true },
          },
          "EpicWin"
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
          SlotJiliModal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            cancel: { $ne: true },
            gametype: "SLOT",
          },
          "Jili"
        ),
        queryModel(
          SlotYGRModal,
          {
            $or: [{ settle: false }, { settle: { $exists: false } }],
            cancel: { $ne: true },
            gametype: "SLOT",
          },
          "YGR"
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

router.post(
  "/admin/api/games/manual-status-update",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { gameName, betId, action, reason = "Manual update" } = req.body;

      const admin = await adminUser.findById(req.user.userId);

      if (!gameName || !betId || !action) {
        return res.status(200).json({
          success: false,
          message: {
            en: "gameName, betId, and action are required fields",
            zh: "gameName、betId 和 action 是必填字段",
            ms: "gameName, betId, dan action adalah medan yang diperlukan",
            zh_hk: "gameName、betId 和 action 是必填字段",
            id: "gameName, betId, dan action adalah field yang wajib diisi",
          },
        });
      }

      if (!["settle", "cancel"].includes(action)) {
        return res.status(200).json({
          success: false,
          message: {
            en: "action must be either 'settle' or 'cancel'",
            zh: "action 必须是 'settle' 或 'cancel'",
            ms: "action mesti sama ada 'settle' atau 'cancel'",
            zh_hk: "action 必須是 'settle' 或 'cancel'",
            id: "action harus 'settle' atau 'cancel'",
          },
        });
      }

      const providerModels = {
        EpicWin: SlotEpicWinModal,
        Fachai: SlotFachaiModal,
        Jili: SlotJiliModal,
        YGR: SlotYGRModal,
        Joker: SlotJokerModal,
      };

      const Model = providerModels[gameName];
      if (!Model) {
        return res.status(200).json({
          success: false,
          message: {
            en: `Invalid game provider: ${gameName}`,
            zh: `无效的游戏提供商: ${gameName}`,
            ms: `Pembekal permainan tidak sah: ${gameName}`,
            zh_hk: `無效的遊戲提供商: ${gameName}`,
            id: `Penyedia permainan tidak valid: ${gameName}`,
          },
        });
      }

      // Find ALL game records with the same betId (changed from findOne to find)
      const gameRecords = await Model.find({
        $or: [
          { betId: betId },
          { uniqueId: betId },
          { tranId: betId },
          { gameRoundCode: betId },
        ],
      }).lean();

      if (!gameRecords || gameRecords.length === 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: `No game records found for betId: ${betId}`,
            zh: `未找到投注ID为 ${betId} 的游戏记录`,
            ms: `Rekod permainan tidak ditemui untuk betId: ${betId}`,
            zh_hk: `未找到投注ID為 ${betId} 的遊戲記錄`,
            id: `Catatan permainan tidak ditemukan untuk betId: ${betId}`,
          },
        });
      }

      // Check status and filter records that need updating
      const recordsToUpdate = [];
      const alreadyProcessedRecords = [];

      for (const gameRecord of gameRecords) {
        let isAlreadySettled = false;
        let isAlreadyCanceled = false;

        switch (gameName) {
          case "EpicWin":
          case "Fachai":
          case "Jili":
          case "YGR":
          case "Joker":
          default:
            isAlreadySettled = gameRecord.settle === true;
            isAlreadyCanceled = gameRecord.cancel === true;
            break;
        }

        // Check if this record needs updating
        if (action === "settle" && !isAlreadySettled) {
          recordsToUpdate.push(gameRecord);
        } else if (action === "cancel" && !isAlreadyCanceled) {
          recordsToUpdate.push(gameRecord);
        } else {
          alreadyProcessedRecords.push(gameRecord);
        }
      }

      // If no records need updating, return appropriate message
      if (recordsToUpdate.length === 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: `All ${gameRecords.length} records are already ${action}${
              action === "settle" ? "d" : "ed"
            }`,
            zh: `所有 ${gameRecords.length} 条记录已经${
              action === "settle" ? "结算" : "取消"
            }`,
            ms: `Semua ${gameRecords.length} rekod sudah ${
              action === "settle" ? "diselesaikan" : "dibatalkan"
            }`,
            zh_hk: `所有 ${gameRecords.length} 條記錄已經${
              action === "settle" ? "結算" : "取消"
            }`,
            id: `Semua ${gameRecords.length} catatan sudah ${
              action === "settle" ? "diselesaikan" : "dibatalkan"
            }`,
          },
        });
      }

      // Determine update data based on action and game provider
      let updateData = {};

      if (action === "settle") {
        switch (gameName) {
          default:
            updateData = { settle: true };
            break;
        }
      } else if (action === "cancel") {
        switch (gameName) {
          default:
            updateData = { cancel: true };
            break;
        }
      }

      let clientIp = req.headers["x-forwarded-for"] || req.ip;
      clientIp = clientIp.split(",")[0].trim();

      // Get the IDs of records to update
      const recordIdsToUpdate = recordsToUpdate.map((record) => record._id);

      // Update ALL matching records in a single operation (changed from findByIdAndUpdate to updateMany)
      const [updateResult] = await Promise.all([
        Model.updateMany(
          { _id: { $in: recordIdsToUpdate } },
          {
            $set: {
              ...updateData,
              manualUpdate: true,
              manualUpdateReason: reason,
            },
          }
        ),

        adminLog.create({
          username: admin.username,
          fullname: admin.fullname,
          ip: clientIp,
          remark: `Manual Update on BetID "${betId}" With Action "${action}" - Updated ${
            recordsToUpdate.length
          } records, ${
            alreadyProcessedRecords.length
          } already processed. Users: ${[
            ...new Set(recordsToUpdate.map((r) => r.username)),
          ].join(", ")}`,
        }),
      ]);

      if (!updateResult || updateResult.modifiedCount === 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Failed to update game records",
            zh: "更新游戏记录失败",
            ms: "Gagal mengemas kini rekod permainan",
            zh_hk: "更新遊戲記錄失敗",
            id: "Gagal memperbarui catatan permainan",
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: {
          en: `Successfully ${action}d ${updateResult.modifiedCount} game records for ${gameName}. ${alreadyProcessedRecords.length} records were already processed.`,
          zh: `成功为 ${gameName} ${action === "settle" ? "结算" : "取消"} ${
            updateResult.modifiedCount
          } 条游戏记录。${alreadyProcessedRecords.length} 条记录已经处理过。`,
          ms: `Berjaya ${
            action === "settle" ? "menyelesaikan" : "membatalkan"
          } ${updateResult.modifiedCount} rekod permainan untuk ${gameName}. ${
            alreadyProcessedRecords.length
          } rekod sudah diproses.`,
          zh_hk: `成功為 ${gameName} ${action === "settle" ? "結算" : "取消"} ${
            updateResult.modifiedCount
          } 條遊戲記錄。${alreadyProcessedRecords.length} 條記錄已經處理過。`,
          id: `Berhasil ${
            action === "settle" ? "menyelesaikan" : "membatalkan"
          } ${
            updateResult.modifiedCount
          } catatan permainan untuk ${gameName}. ${
            alreadyProcessedRecords.length
          } catatan sudah diproses.`,
        },
        details: {
          totalRecordsFound: gameRecords.length,
          recordsUpdated: updateResult.modifiedCount,
          recordsAlreadyProcessed: alreadyProcessedRecords.length,
          affectedUsers: [...new Set(recordsToUpdate.map((r) => r.username))],
        },
      });
    } catch (error) {
      console.error("Manual game status update error:", error);
      return res.status(200).json({
        success: false,
        message: {
          en: "Internal server error while updating game status",
          zh: "更新游戏状态时发生内部服务器错误",
          ms: "Ralat pelayan dalaman semasa mengemas kini status permainan",
          zh_hk: "更新遊戲狀態時發生內部伺服器錯誤",
          id: "Kesalahan server internal saat memperbarui status permainan",
        },
      });
    }
  }
);

module.exports = router;
