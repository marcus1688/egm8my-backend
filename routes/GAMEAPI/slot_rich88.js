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
const SlotRich88Modal = require("../../models/slot_rich88.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const GameWalletLog = require("../../models/gamewalletlog.model");
const GameRich88GameModal = require("../../models/slot_rich88Database.model");
const GameRich88GeneralGameModal = require("../../models/slot_rich88General.model");
const Decimal = require("decimal.js");
require("dotenv").config();

const rich88PFID = "pmyr_IEGP";
const rich88Secret = process.env.RICH88_SECRET;
const webURL = "https://www.bm8my.vip/";
const rich88APIURL = "https://lobbycenter.ark8899.com/";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateRich88ApiKey(pfId, privateKey, timestamp) {
  const stringToHash = `${pfId}${privateKey}${timestamp}`;

  const apiKey = crypto.createHash("sha256").update(stringToHash).digest("hex");

  return apiKey;
}

function getCurrentFormattedDate() {
  return moment.utc().format("YYYY-MM-DD HH:mm:ss");
}

async function GameWalletLogAttempt(
  username,
  transactiontype,
  remark,
  amount,
  gamename
) {
  await GameWalletLog.create({
    username,
    transactiontype,
    remark: remark || "",
    amount,
    gamename: gamename,
  });
}

// Update createdAt timestamps for Habanero games in specific manual order
// async function updateHabaneroManualOrderTimestamps() {
//   try {
//     // List of gameIDs in order (va-golden-empire2 = latest, lucky-7 = oldest)
//     const gameIds = [
//       "王者野牛 MEGAWAYS",
//       "跳起来",
//       "777",
//       "跳爽爽",
//       "超级牛B豪华版",
//       "秘境宝石",
//       "玛雅宝石",
//       "幸运王牌",
//       "金库小猪",
//       "天神宙斯",
//       "88财神",
//       "黄金王国",
//       "福星聚宝",
//       "麻将来了3+",
//       "宠物当家",
//     ];

//     // Start from current time for the latest game (va-golden-empire2)
//     const startTime = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

//     // Process each gameID with 30-minute intervals
//     for (let i = 0; i < gameIds.length; i++) {
//       const gameId = gameIds[i];

//       // Calculate timestamp: latest game gets current time, each subsequent game is 30 minutes older
//       const timestamp = new Date(startTime.getTime() - i * 30 * 60 * 1000); // 30 minutes = 30 * 60 * 1000 milliseconds

//       // Update the document directly in the collection, bypassing schema timestamps
//       const result = await GameRich88GameModal.collection.updateOne(
//         { gameNameCN: gameId },
//         {
//           $set: {
//             createdAt: timestamp,
//             updatedAt: timestamp,
//           },
//         }
//       );

//       if (result.matchedCount > 0) {
//         console.log(
//           `Updated Habanero gameID ${gameId} with timestamp: ${timestamp.toISOString()}`
//         );
//       } else {
//         console.log(`Habanero GameID ${gameId} not found in database`);
//       }
//     }

//     console.log("Habanero manual order timestamp update completed!");

//     // Verify the updates by fetching and displaying the results
//     const updatedGames = await GameRich88GameModal.find(
//       { gameNameCN: { $in: gameIds } },
//       { gameID: 1, createdAt: 1, gameNameEN: 1, hot: 1 }
//     ).sort({ createdAt: -1 });

//     console.log(
//       "\nVerification - Habanero Games ordered by createdAt (newest first):"
//     );
//     updatedGames.forEach((game, index) => {
//       console.log(
//         `${index + 1}. GameID: ${
//           game.gameID
//         }, CreatedAt: ${game.createdAt.toISOString()}, Hot: ${
//           game.hot
//         }, Name: ${game.gameNameEN}`
//       );
//     });

//     console.log(
//       `\nTotal games updated: ${updatedGames.length}/${gameIds.length}`
//     );
//   } catch (error) {
//     console.error("Error updating Habanero manual order timestamps:", error);
//   }
// }

// // Call the function
// updateHabaneroManualOrderTimestamps();

router.post("/api/rich88/updatetimestampsbyorder", async (req, res) => {
  try {
    const mongoose = require("mongoose");
    const { startDateTime = null } = req.body;

    console.log("Starting Rich88 timestamp update based on API order...");

    // Generate API key and fetch game list
    const timestamp = Math.floor(Date.now() / 1000);
    const api_key = generateRich88ApiKey(rich88PFID, rich88Secret, timestamp);

    const response = await axios.get(
      `${rich88APIURL}v2/platform/gamelist?active_only=true`,
      {
        headers: {
          "Content-Type": "application/json",
          api_key: api_key,
          pf_id: rich88PFID,
          timestamp: timestamp.toString(),
        },
      }
    );

    // Check if API returned successful response
    if (response.data.code !== 0) {
      console.error("Rich88 API Error:", response.data);
      return res.status(400).json({
        success: false,
        error: response.data,
        message: {
          en: `Rich88 API Error: ${response.data.msg || "Unknown error"}`,
          zh: `Rich88 API 错误: ${response.data.msg || "未知错误"}`,
          ms: `Ralat API Rich88: ${
            response.data.msg || "Ralat tidak diketahui"
          }`,
        },
      });
    }

    // Extract game codes in order from API response
    const apiGames = response.data.data || [];

    if (!Array.isArray(apiGames) || apiGames.length === 0) {
      return res.status(400).json({
        success: false,
        message: {
          en: "No games found in Rich88 API response.",
          zh: "Rich88 API 响应中未找到游戏。",
          ms: "Tiada permainan dijumpai dalam respons API Rich88.",
        },
      });
    }

    const gameCodesInOrder = apiGames.map((game) => game.game_code);

    console.log(`Found ${gameCodesInOrder.length} games in API response`);
    console.log(
      "Game codes in API order:",
      gameCodesInOrder.slice(0, 10).join(", "),
      "..."
    );

    // Use custom start time or current time
    const startTime = startDateTime
      ? moment(startDateTime).utc()
      : moment().utc();

    if (startDateTime && !startTime.isValid()) {
      return res.status(400).json({
        success: false,
        message: {
          en: "Invalid startDateTime format. Please use ISO 8601 format (e.g., '2024-01-01T00:00:00Z').",
          zh: "无效的开始时间格式。请使用 ISO 8601 格式。",
          ms: "Format masa permulaan tidak sah. Sila gunakan format ISO 8601.",
        },
      });
    }

    console.log(`Starting timestamp: ${startTime.toISOString()}`);

    // Use direct MongoDB collection to bypass Mongoose timestamps
    const db = mongoose.connection.db;
    const collection = db.collection("gamerich88gamemodals"); // Adjust collection name if needed

    const bulkOps = [];

    // Prepare timestamp updates for games based on API order
    for (let i = 0; i < gameCodesInOrder.length; i++) {
      const gameCode = gameCodesInOrder[i];

      // Calculate timestamp: first game gets current time, each subsequent game gets 30 minutes earlier
      const gameTimestamp = moment(startTime)
        .subtract(i * 30, "minutes")
        .utc()
        .toDate();

      console.log(
        `Game ${i + 1}: ${gameCode} will get timestamp: ${moment(
          gameTimestamp
        ).toISOString()}`
      );

      bulkOps.push({
        updateOne: {
          filter: { gameID: gameCode },
          update: {
            $set: {
              createdAt: gameTimestamp,
              updatedAt: new Date(),
            },
          },
        },
      });
    }

    // Execute bulk operation directly on MongoDB collection
    console.log("Executing bulk timestamp updates via direct MongoDB...");
    const bulkResult = await collection.bulkWrite(bulkOps);

    console.log("Bulk write result:", {
      matchedCount: bulkResult.matchedCount,
      modifiedCount: bulkResult.modifiedCount,
      upsertedCount: bulkResult.upsertedCount,
    });

    // Verify the updates by fetching the updated documents
    const updatedGames = await GameRich88GameModal.find(
      { gameID: { $in: gameCodesInOrder } },
      {
        gameID: 1,
        gameNameEN: 1,
        gameNameCN: 1,
        gameNameHK: 1,
        gameType: 1,
        createdAt: 1,
        updatedAt: 1,
      }
    ).sort({ createdAt: -1 });

    // Separate found and not found games
    const foundGameIds = updatedGames.map((game) => game.gameID);
    const notFoundGames = gameCodesInOrder.filter(
      (code) => !foundGameIds.includes(code)
    );

    const foundGames = updatedGames.map((game) => ({
      gameID: game.gameID,
      gameNameEN: game.gameNameEN,
      gameNameCN: game.gameNameCN,
      gameNameHK: game.gameNameHK,
      gameType: game.gameType,
      newCreatedAt: game.createdAt,
      apiPosition: gameCodesInOrder.indexOf(game.gameID) + 1,
      minutesFromLatest: gameCodesInOrder.indexOf(game.gameID) * 30,
    }));

    // Get detailed info about missing games from API data
    const missingGamesDetails = notFoundGames.map((code) => {
      const apiGame = apiGames.find((game) => game.game_code === code);

      return {
        gameCode: code,
        gameNameEN: apiGame?.game_name_enu || "Unknown",
        gameNameCN: apiGame?.game_name_chs || "Unknown",
        category: apiGame?.category || "Unknown",
        gameType: apiGame?.game_type || "Unknown",
        apiPosition: gameCodesInOrder.indexOf(code) + 1,
        expectedTimestamp: moment(startTime)
          .subtract(gameCodesInOrder.indexOf(code) * 30, "minutes")
          .utc()
          .toISOString(),
      };
    });

    console.log(
      `Successfully updated timestamps for ${foundGames.length} games`
    );
    console.log(`Games not found in database: ${notFoundGames.length}`);

    return res.status(200).json({
      success: true,
      message: {
        en: `Successfully updated timestamps for ${bulkResult.modifiedCount} Rich88 games based on API order.`,
        zh: `成功根据 API 顺序更新了 ${bulkResult.modifiedCount} 个 Rich88 游戏的时间戳。`,
        ms: `Berjaya mengemas kini cap masa untuk ${bulkResult.modifiedCount} permainan Rich88 berdasarkan urutan API.`,
      },
      data: {
        totalApiGames: gameCodesInOrder.length,
        gamesFoundAndUpdated: bulkResult.modifiedCount,
        gamesMatched: bulkResult.matchedCount,
        gamesNotFoundInDb: notFoundGames.length,
        timeRange: {
          latest: {
            gameCode: foundGames[0]?.gameID,
            gameName: foundGames[0]?.gameNameEN,
            category: foundGames[0]?.gameType,
            createdAt: foundGames[0]?.newCreatedAt,
            position: 1,
          },
          oldest: {
            gameCode: foundGames[foundGames.length - 1]?.gameID,
            gameName: foundGames[foundGames.length - 1]?.gameNameEN,
            category: foundGames[foundGames.length - 1]?.gameType,
            createdAt: foundGames[foundGames.length - 1]?.newCreatedAt,
            position: foundGames.length,
          },
        },
        updatedGames: foundGames.map((game) => ({
          gameID: game.gameID,
          gameNameEN: game.gameNameEN,
          gameNameCN: game.gameNameCN,
          gameType: game.gameType,
          apiPosition: game.apiPosition,
          minutesFromLatest: game.minutesFromLatest,
          createdAt: game.newCreatedAt,
        })),
        gamesNotFoundInDatabase: missingGamesDetails,
        bulkWriteStats: {
          matchedCount: bulkResult.matchedCount,
          modifiedCount: bulkResult.modifiedCount,
          upsertedCount: bulkResult.upsertedCount,
        },
        apiOrder: gameCodesInOrder,
        timestampInfo: {
          startTime: startTime.toISOString(),
          intervalMinutes: 30,
          totalTimeSpan: `${(gameCodesInOrder.length - 1) * 30} minutes`,
          endTime: moment(startTime)
            .subtract((gameCodesInOrder.length - 1) * 30, "minutes")
            .utc()
            .toISOString(),
        },
      },
    });
  } catch (error) {
    console.error("Error in Rich88 timestamp update:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
      message: {
        en: "Rich88: Timestamp update failed. Please try again or contact customer service for assistance.",
        zh: "Rich88: 时间戳更新失败，请重试或联系客服以获得帮助。",
        ms: "Rich88: Kemaskini cap masa gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/rich88/sync-games", async (req, res) => {
  try {
    console.log("Starting Rich88 game sync...");

    // Generate API key and fetch game list
    const timestamp = Math.floor(Date.now() / 1000);
    const api_key = generateRich88ApiKey(rich88PFID, rich88Secret, timestamp);

    const response = await axios.get(
      `${rich88APIURL}v2/platform/gamelist?active_only=true`,
      {
        headers: {
          "Content-Type": "application/json",
          api_key: api_key,
          pf_id: rich88PFID,
          timestamp: timestamp.toString(),
        },
      }
    );

    // Check if API returned successful response
    if (response.data.code !== 0) {
      console.error("Rich88 API Error:", response.data);
      return res.status(200).json({
        success: false,
        error: response.data,
        message: {
          en: `Rich88 API Error: ${response.data.msg || "Unknown error"}`,
          zh: `Rich88 API 错误: ${response.data.msg || "未知错误"}`,
          ms: `Ralat API Rich88: ${
            response.data.msg || "Ralat tidak diketahui"
          }`,
        },
      });
    }

    const apiGames = response.data.data || [];

    if (!Array.isArray(apiGames) || apiGames.length === 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "No games found from Rich88 API.",
          zh: "未从 Rich88 API 找到游戏。",
          ms: "Tiada permainan dijumpai dari Rich88 API.",
        },
      });
    }

    // Get all game codes from Rich88 API
    const apiGameCodes = apiGames.map((game) => game.game_code);

    console.log(`Found ${apiGameCodes.length} games from Rich88 API`);

    // Get all games from database
    const dbGames = await GameRich88GameModal.find({}).lean();
    const dbGameCodes = dbGames.map((game) => game.gameID);

    console.log(`Found ${dbGameCodes.length} games in database`);

    // Find missing games (in Rich88 API but not in DB)
    const missingGameCodes = apiGameCodes.filter(
      (code) => !dbGameCodes.includes(code)
    );

    const missingGames = apiGames.filter((game) =>
      missingGameCodes.includes(game.game_code)
    );

    // Find extra games (in DB but not in Rich88 API)
    const extraGameCodes = dbGameCodes.filter(
      (code) => !apiGameCodes.includes(code)
    );

    const extraGames = dbGames.filter((game) =>
      extraGameCodes.includes(game.gameID)
    );

    // Update maintenance status for extra games
    if (extraGameCodes.length > 0) {
      await GameRich88GameModal.updateMany(
        {
          gameID: { $in: extraGameCodes },
        },
        {
          $set: { maintenance: true },
        }
      );
      console.log(`Set maintenance=true for ${extraGameCodes.length} games`);
    }

    // Prepare response with game names
    const missingGameDetails = missingGames.map((game) => ({
      gameCode: game.game_code,
      gameName: {
        en: game.game_name_enu || "N/A",
        cn: game.game_name_chs || "N/A",
        vi: game.game_name_vie || "N/A",
        th: game.game_name_tha || "N/A",
      },
      category: game.category || "N/A",
      gameType: game.game_type || "N/A",
      isActive: game.is_active,
    }));

    const extraGameDetails = extraGames.map((game) => ({
      gameCode: game.gameID,
      gameName: {
        en: game.gameNameEN || "N/A",
        cn: game.gameNameCN || "N/A",
        hk: game.gameNameHK || "N/A",
      },
      gameType: game.gameType || "N/A",
      maintenanceSet: true, // Indicates we've set it to maintenance
    }));

    return res.status(200).json({
      success: true,
      summary: {
        totalRich88Games: apiGameCodes.length,
        totalDatabaseGames: dbGameCodes.length,
        missingInDatabase: missingGameCodes.length,
        extraInDatabase: extraGameCodes.length,
      },
      missingGames: missingGameDetails,
      extraGames: extraGameDetails,
      message: {
        en: `Sync complete. Found ${missingGameCodes.length} missing games and ${extraGameCodes.length} extra games (set to maintenance).`,
        zh: `同步完成。发现 ${missingGameCodes.length} 个缺失游戏和 ${extraGameCodes.length} 个额外游戏（已设置为维护）。`,
        ms: `Penyegerakan selesai. Dijumpai ${missingGameCodes.length} permainan hilang dan ${extraGameCodes.length} permainan tambahan (ditetapkan ke penyelenggaraan).`,
      },
    });
  } catch (error) {
    console.error("Rich88 game sync error:", error.message);
    return res.status(200).json({
      success: false,
      error: error.message,
      message: {
        en: "Failed to sync games. Please try again or contact support.",
        zh: "同步游戏失败。请重试或联系支持。",
        ms: "Gagal menyegerakkan permainan. Sila cuba lagi atau hubungi sokongan.",
      },
    });
  }
});

router.post("/api/rich88/getprovidergamelist", async (req, res) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);

    const api_key = generateRich88ApiKey(rich88PFID, rich88Secret, timestamp);

    const response = await axios.get(
      `${rich88APIURL}v2/platform/gamelist?active_only=true`,
      {
        headers: {
          "Content-Type": "application/json",
          api_key: api_key,
          pf_id: rich88PFID,
          timestamp: timestamp.toString(),
        },
      }
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
      },
    });
  } catch (error) {
    console.log("RICH88 error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "RICH88: Game launch failed. Please try again or customer service for assistance.",
        zh: "RICH88: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "RICH88: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/rich88/getgamelist", async (req, res) => {
  try {
    const games = await GameRich88GameModal.find({
      $and: [
        {
          $or: [{ maintenance: false }, { maintenance: { $exists: false } }],
        },
        {
          imageUrlEN: { $exists: true, $ne: null, $ne: "" },
        },
      ],
    }).sort({
      hot: -1,
      createdAt: -1,
    });
    if (!games || games.length === 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "No games found. Please try again later.",
          zh: "未找到游戏。请稍后再试。",
          ms: "Tiada permainan ditemui. Sila cuba lagi kemudian.",
          zh_hk: "未找到遊戲。請稍後再試。",
          id: "Tidak ada permainan ditemukan. Silakan coba lagi nanti.",
        },
      });
    }

    // Transform data into the desired format
    const reformattedGamelist = games.map((game) => ({
      GameCode: game.gameID,
      GameNameEN: game.gameNameEN,
      GameNameZH: game.gameNameCN,
      gameNameHK: game.gameNameHK,
      GameType: game.gameType,
      GameImage: game.imageUrlEN || "",
      GameImageZH: game.imageUrlCN || "",
      Hot: game.hot || false,
      RTP: game.rtpRate,
    }));

    return res.status(200).json({
      success: true,
      gamelist: reformattedGamelist,
    });
  } catch (error) {
    console.log("RICH88 error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "RICH88: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "RICH88: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "RICH88: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "RICH88: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "RICH88: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/rich88/launchGame", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found. Please try again or contact customer service for assistance.",
          zh: "用户未找到，请重试或联系客服以获取帮助。",
          ms: "Pengguna tidak ditemui, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "用戶未找到，請重試或聯絡客服以獲取幫助。",
          id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    if (user.gameLock.rich88.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
          zh_hk: "您的遊戲訪問已被鎖定，請聯絡客服以獲取進一步幫助。",
          id: "Akses permainan Anda telah dikunci. Silakan hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }

    const timestamp = Math.floor(Date.now() / 1000);

    const api_key = generateRich88ApiKey(rich88PFID, rich88Secret, timestamp);

    // gameLang === en-us || zh-cn
    const { gameCode, gameLang } = req.body;

    let lang = "en-US";

    if (gameLang === "en") {
      lang = "en-US";
    } else if (gameLang === "zh") {
      lang = "zh-CN";
    } else if (gameLang === "ms") {
      lang = "en-US";
    } else if (gameLang === "id") {
      lang = "id-ID";
    } else if (gameLang === "zh_hk") {
      lang = "zh-CN";
    }

    const payload = {
      account: user.gameId,
      game_code: gameCode,
      lang,
    };

    const response = await axios.post(
      `${rich88APIURL}v2/platform/login`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          api_key: api_key,
          pf_id: rich88PFID,
          timestamp: timestamp.toString(),
        },
      }
    );

    if (response.data.code !== 0) {
      if (response.data.code === 999) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Game under maintenance. Please try again later.",
            zh: "游戏正在维护中，请稍后再试。",
            ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
            zh_hk: "遊戲正在維護中，請稍後再試。",
            id: "Permainan sedang dalam pemeliharaan. Silakan coba lagi nanti.",
          },
        });
      }

      console.log("RICH88 error in launching game", response.data);
      return res.status(200).json({
        success: false,
        message: {
          en: "RICH88: Game launch failed. Please try again or customer service for assistance.",
          zh: "RICH88: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "RICH88: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "RICH88: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "RICH88: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "RICH88"
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data.data.url,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("RICH88 error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "RICH88: Game launch failed. Please try again or customer service for assistance.",
        zh: "RICH88: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "RICH88: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "RICH88: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "RICH88: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

function generateRich88SessionId() {
  const timestamp = Date.now();
  const randomPart = crypto.randomBytes(16).toString("hex");

  const sessionId = `${timestamp}_${randomPart}`;

  return sessionId;
}

router.get("/api/rich88prod/rich88/session_id", async (req, res) => {
  const sessionID = generateRich88SessionId();

  try {
    const apiKey = req.headers["api-key"];
    const pfId = req.headers["pf-id"];
    const timestamp = req.headers["timestamp"];

    if (!apiKey || !pfId || !timestamp) {
      return res.status(200).json({
        code: 20008,
        msg: "Invalid params",
        data: {
          sid: sessionID,
        },
      });
    }

    const api_key = generateRich88ApiKey(rich88PFID, rich88Secret, timestamp);

    if (apiKey !== api_key || rich88PFID !== pfId) {
      console.log("generated api key", api_key);
      console.log("hisssssssssssssss", apiKey);
      return res.status(200).json({
        code: 16007,
        msg: "API key authorization failed",
        data: {
          sid: sessionID,
        },
      });
    }

    await GameRich88GeneralGameModal.create({
      sessionID: sessionID,
    });

    return res.status(200).json({
      code: 0,
      msg: "Success",
      data: {
        sid: sessionID,
      },
    });
  } catch (error) {
    console.error(
      "RICH88: Error in game provider calling seesion api:",
      error.message
    );
    return res.status(200).json({
      code: 22008,
      msg: "Platform occured error",
      data: {
        sid: sessionID,
      },
    });
  }
});

router.get("/api/rich88prod/rich88/balance/:account", async (req, res) => {
  try {
    const { account } = req.params;

    const authorization = req.headers["authorization"];

    const session = await GameRich88GeneralGameModal.findOne({
      sessionID: authorization,
    });

    if (!session) {
      return res.status(200).json({
        code: 22003,
        msg: "Session validate fail",
        data: {
          balance: 0,
        },
      });
    }

    const currentUser = await User.findOne(
      { gameId: account },
      { wallet: 1, _id: 1 }
    ).lean();
    if (!currentUser) {
      return res.status(200).json({
        code: 22006,
        msg: "Player is non-existent",
        data: {
          balance: 0,
        },
      });
    }

    const newBalance = new Decimal(Number(currentUser.wallet)).toDecimalPlaces(
      6
    );

    return res.status(200).json({
      code: 0,
      msg: "Success",
      data: {
        balance: newBalance.toNumber(),
      },
    });
  } catch (error) {
    console.error(
      "RICH88: Error in game provider calling get balance api:",
      error.message
    );
    return res.status(200).json({
      code: 22008,
      msg: "Platform occured error",
      data: {
        balance: 0,
      },
    });
  }
});

router.post("/api/rich88prod/rich88/transfer", async (req, res) => {
  try {
    const { account, record_id, action, round_id, money } = req.body;
    const authorization = req.headers["authorization"];
    const amount = new Decimal(Number(money)).toDecimalPlaces(6).toNumber();
    switch (action) {
      case "withdraw": {
        const [session, currentUser, existingBet] = await Promise.all([
          GameRich88GeneralGameModal.findOne(
            { sessionID: authorization },
            { _id: 1 }
          ).lean(),
          User.findOne(
            { gameId: account },
            { wallet: 1, "gameLock.rich88.lock": 1, _id: 1 }
          ).lean(),
          SlotRich88Modal.findOne(
            { roundId: round_id, username: account },
            { _id: 1 }
          ).lean(),
        ]);

        if (!session) {
          return res.status(200).json({
            code: 22003,
            msg: "Session validate fail",
            data: { balance: 0 },
          });
        }

        if (!currentUser) {
          return res.status(200).json({
            code: 22006,
            msg: "Player is non-existent",
          });
        }

        if (currentUser.gameLock?.rich88?.lock) {
          return res.status(200).json({
            code: 13004,
            msg: "This account has been blocked",
          });
        }

        if (existingBet) {
          return res.status(200).json({
            code: 22004,
            msg: "Transfer has been executed",
          });
        }

        const updatedUserBalance = await User.findOneAndUpdate(
          {
            _id: currentUser._id,
            wallet: { $gte: amount },
          },
          { $inc: { wallet: -amount } },
          { new: true, projection: { wallet: 1 } }
        ).lean();

        if (!updatedUserBalance) {
          return res.status(200).json({
            code: 22007,
            msg: "Player money is not enough",
          });
        }

        await SlotRich88Modal.create({
          username: account,
          betId: record_id,
          roundId: round_id,
          bet: true,
          betamount: amount,
        });

        return res.status(200).json({
          code: 0,
          msg: "Success",
        });
      }

      case "deposit": {
        const [session, currentUser, existingBet] = await Promise.all([
          GameRich88GeneralGameModal.findOne(
            { sessionID: authorization },
            { _id: 1 }
          ).lean(),
          User.findOne({ gameId: account }, { wallet: 1, _id: 1 }).lean(),
          SlotRich88Modal.findOne(
            { roundId: round_id, username: account },
            { settle: 1, cancel: 1, _id: 1 }
          ).lean(),
        ]);

        if (!session) {
          return res.status(200).json({
            code: 22003,
            msg: "Session validate fail",
            data: { balance: 0 },
          });
        }

        if (!currentUser) {
          return res.status(200).json({
            code: 22006,
            msg: "Player is non-existent",
          });
        }

        if (!existingBet) {
          return res.status(200).json({
            code: 22005,
            msg: "Transfer ID is non-existent",
          });
        }

        if (existingBet.settle || existingBet.cancel) {
          return res.status(200).json({
            code: 22004,
            msg: "Transfer has been executed",
          });
        }

        await Promise.all([
          User.findByIdAndUpdate(
            currentUser._id,
            { $inc: { wallet: amount } },
            { new: true }
          ),
          SlotRich88Modal.findOneAndUpdate(
            { roundId: round_id },
            { $set: { settle: true, settleamount: amount } }
          ),
        ]);

        return res.status(200).json({
          code: 0,
          msg: "Success",
        });
      }

      case "rollback": {
        const [session, currentUser, existingBet] = await Promise.all([
          GameRich88GeneralGameModal.findOne(
            { sessionID: authorization },
            { _id: 1 }
          ).lean(),
          User.findOne({ gameId: account }, { wallet: 1, _id: 1 }).lean(),
          SlotRich88Modal.findOne(
            { roundId: round_id, username: account },
            { settle: 1, cancel: 1, betamount: 1, _id: 1 }
          ).lean(),
        ]);

        if (!session) {
          return res.status(200).json({
            code: 22003,
            msg: "Session validate fail",
            data: { balance: 0 },
          });
        }

        if (!currentUser) {
          return res.status(200).json({
            code: 22006,
            msg: "Player is non-existent",
          });
        }

        if (!existingBet) {
          return res.status(200).json({
            code: 22005,
            msg: "Transfer ID is non-existent",
          });
        }

        if (existingBet.settle || existingBet.cancel) {
          return res.status(200).json({
            code: 22004,
            msg: "Transfer has been executed",
          });
        }

        const refundAmount = existingBet.betamount;

        await Promise.all([
          User.findByIdAndUpdate(
            currentUser._id,
            { $inc: { wallet: amount } },
            { new: true }
          ),
          SlotRich88Modal.findOneAndUpdate(
            { roundId: round_id },
            { $set: { cancel: true } }
          ),
        ]);

        return res.status(200).json({
          code: 0,
          msg: "Success",
        });
      }

      default:
        return res.status(200).json({
          code: 22008,
          msg: "Invalid action",
        });
    }
  } catch (error) {
    console.error(
      "RICH88: Error in game provider calling transfer api:",
      error.message
    );
    return res.status(200).json({
      code: 22008,
      msg: "Platform occured error",
    });
  }
});

router.post("/api/rich88prod/rich88/award_activity", async (req, res) => {
  try {
    const { account, award_id, action, event_id, money } = req.body;
    const authorization = req.headers["authorization"];
    const amount = new Decimal(Number(money)).toDecimalPlaces(6).toNumber();

    switch (action) {
      case "prize": {
        const [session, currentUser, existingBet] = await Promise.all([
          GameRich88GeneralGameModal.findOne(
            { sessionID: authorization },
            { _id: 1 }
          ).lean(),
          User.findOne({ gameId: account }, { wallet: 1, _id: 1 }).lean(),
          SlotRich88Modal.findOne(
            { betId: award_id, username: account },
            { _id: 1 }
          ).lean(),
        ]);

        if (!session) {
          return res.status(200).json({
            code: 22003,
            msg: "Session validate fail",
            data: { balance: 0 },
          });
        }

        if (!currentUser) {
          return res.status(200).json({
            code: 22006,
            msg: "Player is non-existent",
          });
        }

        if (existingBet) {
          return res.status(200).json({
            code: 22004,
            msg: "Transfer has been executed",
          });
        }

        await Promise.all([
          User.findByIdAndUpdate(
            currentUser._id,
            { $inc: { wallet: amount } },
            { new: true }
          ),

          SlotRich88Modal.create({
            username: account,
            betId: award_id,
            roundId: event_id,
            bet: true,
            betamount: 0,
            settleamount: amount,
            settle: true,
          }),
        ]);

        return res.status(200).json({
          code: 0,
          msg: "Success",
        });
      }

      default:
        return res.status(200).json({
          code: 22008,
          msg: "Invalid action",
        });
    }
  } catch (error) {
    console.error(
      "RICH88: Error in game provider calling award api:",
      error.message
    );
    return res.status(200).json({
      code: 22008,
      msg: "Platform occured error",
    });
  }
});

router.post("/api/rich88/getturnoverforrebate", async (req, res) => {
  try {
    const { date } = req.body;

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

    console.log("RICH88 QUERYING TIME", startDate, endDate);

    const records = await SlotRich88Modal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      cancel: { $ne: true },

      settle: true,
    });

    const uniqueGameIds = [
      ...new Set(records.map((record) => record.username)),
    ];

    const users = await User.find(
      { gameId: { $in: uniqueGameIds } },
      { gameId: 1, username: 1 }
    ).lean();

    const gameIdToUsername = {};
    users.forEach((user) => {
      gameIdToUsername[user.gameId] = user.username;
    });

    // Aggregate turnover and win/loss for each player
    let playerSummary = {};

    records.forEach((record) => {
      const gameId = record.username;
      const actualUsername = gameIdToUsername[gameId];

      if (!actualUsername) {
        console.warn(`RICH88 User not found for gameId: ${gameId}`);
        return;
      }

      if (!playerSummary[actualUsername]) {
        playerSummary[actualUsername] = { turnover: 0, winloss: 0 };
      }

      playerSummary[actualUsername].turnover += record.betamount || 0;

      playerSummary[actualUsername].winloss +=
        (record.settleamount || 0) - (record.betamount || 0);
    });
    // Format the turnover and win/loss for each player to two decimal places
    Object.keys(playerSummary).forEach((playerId) => {
      playerSummary[playerId].turnover = Number(
        playerSummary[playerId].turnover.toFixed(2)
      );
      playerSummary[playerId].winloss = Number(
        playerSummary[playerId].winloss.toFixed(2)
      );
    });
    // Return the aggregated results
    return res.status(200).json({
      success: true,
      summary: {
        gamename: "RICH88",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("RICH88: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "RICH88: Failed to fetch win/loss report",
        zh: "RICH88: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/rich88/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotRich88Modal.find({
        username: user.gameId,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },

        settle: true,
      });

      // Aggregate turnover and win/loss for each player
      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;
        totalWinLoss += (record.settleamount || 0) - (record.betamount || 0);
      });

      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));
      // Return the aggregated results
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "RICH88",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("RICH88: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "RICH88: Failed to fetch win/loss report",
          zh: "RICH88: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/rich88/:userId/gamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await GameDataLog.find({
        username: user.username,
        date: {
          $gte: moment(new Date(startDate))
            .utc()
            .add(8, "hours")
            .format("YYYY-MM-DD"),
          $lte: moment(new Date(endDate))
            .utc()
            .add(8, "hours")
            .format("YYYY-MM-DD"),
        },
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      // Sum up the values for EVOLUTION under Live Casino
      records.forEach((record) => {
        // Convert Mongoose Map to Plain Object
        const gameCategories =
          record.gameCategories instanceof Map
            ? Object.fromEntries(record.gameCategories)
            : record.gameCategories;

        if (
          gameCategories &&
          gameCategories["Slot Games"] &&
          gameCategories["Slot Games"] instanceof Map
        ) {
          const slotGames = Object.fromEntries(gameCategories["Slot Games"]);

          if (slotGames["RICH88"]) {
            totalTurnover += slotGames["RICH88"].turnover || 0;
            totalWinLoss += slotGames["RICH88"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "RICH88",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("RICH88: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "RICH88: Failed to fetch win/loss report",
          zh: "RICH88: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/rich88/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotRich88Modal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },

        settle: true,
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;

        totalWinLoss += (record.betamount || 0) - (record.settleamount || 0);
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "RICH88",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("RICH88: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "RICH88: Failed to fetch win/loss report",
          zh: "RICH88: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/rich88/kioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await GameDataLog.find({
        date: {
          $gte: moment(new Date(startDate))
            .utc()
            .add(8, "hours")
            .format("YYYY-MM-DD"),
          $lte: moment(new Date(endDate))
            .utc()
            .add(8, "hours")
            .format("YYYY-MM-DD"),
        },
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        const gameCategories =
          record.gameCategories instanceof Map
            ? Object.fromEntries(record.gameCategories)
            : record.gameCategories;

        if (
          gameCategories &&
          gameCategories["Slot Games"] &&
          gameCategories["Slot Games"] instanceof Map
        ) {
          const liveCasino = Object.fromEntries(gameCategories["Slot Games"]);

          if (liveCasino["RICH88"]) {
            totalTurnover += Number(liveCasino["RICH88"].turnover || 0);
            totalWinLoss += Number(liveCasino["RICH88"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "RICH88",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("RICH88: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "RICH88: Failed to fetch win/loss report",
          zh: "RICH88: 获取盈亏报告失败",
        },
      });
    }
  }
);
module.exports = router;
