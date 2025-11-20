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
const GameYGRGameModal = require("../../models/slot_yesgetrichDatabase.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const GameWalletLog = require("../../models/gamewalletlog.model");
const SlotYGRModal = require("../../models/slot_yesgetrich.model");
const Decimal = require("decimal.js");
require("dotenv").config();

const ygrHeaders = "EGM8MYR";
const webURL = "https://www.bm8my.vip/";
const ygrAPIURL = "https://tyche8w-service.yahutech.com";
const ygrLaunchAPIURL = "https://tyche8w-service.yahutech.com";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

const generateRandomCode = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }

  return result;
};

const generatePassword = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }

  return result;
};

function generateTraceCode() {
  return uuidv4();
}

function generateDateTime() {
  return moment().utc().format("YYYY-MM-DDTHH:mm:ss.SSSZ");
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

// router.post("/api/yesgetrich/updatetimestampsbyorder", async (req, res) => {
//   try {
//     const mongoose = require("mongoose");
//     const { startDateTime = null } = req.body;

//     console.log(
//       "Starting YesGetRich timestamp update based on custom order..."
//     );

//     // Define the game order (84 is latest, 97 is oldest)
//     const gameCodesInOrder = [
//       "84",
//       "75",
//       "111",
//       "112",
//       "30",
//       "113",
//       "90",
//       "110",
//       "71",
//       "106",
//       "95",
//       "70",
//       "18",
//       "35",
//       "105",
//       "77",
//       "4",
//       "21",
//       "109",
//       "43",
//     ];

//     console.log(`Total games to update: ${gameCodesInOrder.length}`);
//     console.log("Game codes in specified order:", gameCodesInOrder.join(", "));

//     // Use custom start time or current time
//     const startTime = startDateTime
//       ? moment(startDateTime).utc()
//       : moment().utc().add(5, "months");

//     if (startDateTime && !startTime.isValid()) {
//       return res.status(400).json({
//         success: false,
//         message: {
//           en: "Invalid startDateTime format. Please use ISO 8601 format (e.g., '2024-01-01T00:00:00Z').",
//           zh: "无效的开始时间格式。请使用 ISO 8601 格式。",
//           ms: "Format masa permulaan tidak sah. Sila gunakan format ISO 8601.",
//           zh_hk: "無效的開始時間格式。請使用 ISO 8601 格式。",
//           id: "Format waktu mulai tidak valid. Silakan gunakan format ISO 8601.",
//         },
//       });
//     }

//     console.log(`Starting timestamp: ${startTime.toISOString()}`);

//     // Use direct MongoDB collection to bypass Mongoose timestamps
//     const db = mongoose.connection.db;
//     const collection = db.collection("gameygrgamemodals"); // YesGetRich collection name

//     const bulkOps = [];

//     // Prepare timestamp updates for games based on specified order
//     for (let i = 0; i < gameCodesInOrder.length; i++) {
//       const gameCode = gameCodesInOrder[i];

//       // Calculate timestamp: first game (84) gets current time, each subsequent game gets 30 minutes earlier
//       const gameTimestamp = moment(startTime)
//         .subtract(i * 30, "minutes")
//         .utc()
//         .toDate();

//       console.log(
//         `Game ${i + 1}: ID ${gameCode} will get timestamp: ${moment(
//           gameTimestamp
//         ).toISOString()}`
//       );

//       bulkOps.push({
//         updateOne: {
//           filter: { gameID: gameCode },
//           update: {
//             $set: {
//               createdAt: gameTimestamp,
//               updatedAt: new Date(),
//             },
//           },
//         },
//       });
//     }

//     // Execute bulk operation directly on MongoDB collection
//     console.log("Executing bulk timestamp updates via direct MongoDB...");
//     const bulkResult = await collection.bulkWrite(bulkOps);

//     console.log("Bulk write result:", {
//       matchedCount: bulkResult.matchedCount,
//       modifiedCount: bulkResult.modifiedCount,
//       upsertedCount: bulkResult.upsertedCount,
//     });

//     // Verify the updates by fetching the updated documents
//     const updatedGames = await GameYGRGameModal.find(
//       { gameID: { $in: gameCodesInOrder } },
//       {
//         gameID: 1,
//         gameNameEN: 1,
//         gameNameCN: 1,
//         gameNameHK: 1,
//         createdAt: 1,
//         updatedAt: 1,
//       }
//     ).sort({ createdAt: -1 });

//     // Separate found and not found games
//     const foundGameIds = updatedGames.map((game) => game.gameID);
//     const notFoundGames = gameCodesInOrder.filter(
//       (code) => !foundGameIds.includes(code)
//     );

//     const foundGames = updatedGames.map((game) => ({
//       gameID: game.gameID,
//       gameNameEN: game.gameNameEN,
//       gameNameCN: game.gameNameCN,
//       gameNameHK: game.gameNameHK,
//       newCreatedAt: game.createdAt,
//       specifiedPosition: gameCodesInOrder.indexOf(game.gameID) + 1,
//       minutesFromLatest: gameCodesInOrder.indexOf(game.gameID) * 30,
//     }));

//     // Get detailed info about missing games
//     const missingGamesDetails = notFoundGames.map((code) => ({
//       gameCode: code,
//       specifiedPosition: gameCodesInOrder.indexOf(code) + 1,
//       expectedTimestamp: moment(startTime)
//         .subtract(gameCodesInOrder.indexOf(code) * 30, "minutes")
//         .utc()
//         .toISOString(),
//     }));

//     console.log(
//       `Successfully updated timestamps for ${foundGames.length} games`
//     );
//     console.log(`Games not found in database: ${notFoundGames.length}`);

//     return res.status(200).json({
//       success: true,
//       message: {
//         en: `Successfully updated timestamps for ${bulkResult.modifiedCount} YesGetRich games based on specified order.`,
//         zh: `成功根据指定顺序更新了 ${bulkResult.modifiedCount} 个 YesGetRich 游戏的时间戳。`,
//         ms: `Berjaya mengemas kini cap masa untuk ${bulkResult.modifiedCount} permainan YesGetRich berdasarkan urutan yang ditetapkan.`,
//         zh_hk: `成功根據指定順序更新了 ${bulkResult.modifiedCount} 個 YesGetRich 遊戲的時間戳。`,
//         id: `Berhasil memperbarui timestamp untuk ${bulkResult.modifiedCount} permainan YesGetRich berdasarkan urutan yang ditentukan.`,
//       },
//       data: {
//         totalGamesInOrder: gameCodesInOrder.length,
//         gamesFoundAndUpdated: bulkResult.modifiedCount,
//         gamesMatched: bulkResult.matchedCount,
//         gamesNotFoundInDb: notFoundGames.length,
//         timeRange: {
//           latest: {
//             gameID: foundGames[0]?.gameID,
//             gameName: foundGames[0]?.gameNameEN,
//             createdAt: foundGames[0]?.newCreatedAt,
//             position: 1,
//           },
//           oldest: {
//             gameID: foundGames[foundGames.length - 1]?.gameID,
//             gameName: foundGames[foundGames.length - 1]?.gameNameEN,
//             createdAt: foundGames[foundGames.length - 1]?.newCreatedAt,
//             position: foundGames.length,
//           },
//         },
//         updatedGames: foundGames.map((game) => ({
//           gameID: game.gameID,
//           gameNameEN: game.gameNameEN,
//           gameNameCN: game.gameNameCN,
//           gameNameHK: game.gameNameHK,
//           specifiedPosition: game.specifiedPosition,
//           minutesFromLatest: game.minutesFromLatest,
//           createdAt: game.newCreatedAt,
//         })),
//         gamesNotFoundInDatabase: missingGamesDetails,
//         bulkWriteStats: {
//           matchedCount: bulkResult.matchedCount,
//           modifiedCount: bulkResult.modifiedCount,
//           upsertedCount: bulkResult.upsertedCount,
//         },
//         specifiedOrder: gameCodesInOrder,
//         timestampInfo: {
//           startTime: startTime.toISOString(),
//           intervalMinutes: 30,
//           totalTimeSpan: `${(gameCodesInOrder.length - 1) * 30} minutes`,
//           endTime: moment(startTime)
//             .subtract((gameCodesInOrder.length - 1) * 30, "minutes")
//             .utc()
//             .toISOString(),
//         },
//       },
//     });
//   } catch (error) {
//     console.error("Error in YesGetRich timestamp update:", error);
//     return res.status(500).json({
//       success: false,
//       error: error.message,
//       message: {
//         en: "YesGetRich: Timestamp update failed. Please try again or contact customer service for assistance.",
//         zh: "YesGetRich: 时间戳更新失败，请重试或联系客服以获得帮助。",
//         ms: "YesGetRich: Kemaskini cap masa gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
//         zh_hk: "YesGetRich: 時間戳更新失敗，請重試或聯絡客服以獲得幫助。",
//         id: "YesGetRich: Pembaruan timestamp gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
//       },
//     });
//   }
// });
router.post("/api/yesgetrich/comparegamelist", async (req, res) => {
  try {
    // Fetch games from YGR API
    const response = await axios.post(
      `${ygrAPIURL}/GameList`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: ygrHeaders,
        },
      }
    );

    if (response.data.ErrorCode !== 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Failed to retrieve game list from provider.",
          zh: "从提供商获取游戏列表失败。",
          ms: "Gagal mendapatkan senarai permainan dari pembekal.",
        },
      });
    }

    const providerGames = response.data.Data || [];

    // Fetch all games from database
    const dbGames = await GameYGRGameModal.find(
      {},
      { gameID: 1, gameNameEN: 1, gameNameCN: 1, maintenance: 1 }
    ).lean();

    // Helper function to normalize gameID to 3 digits
    const normalizeGameId = (gameId) => {
      const numericId = parseInt(gameId, 10);
      return numericId.toString().padStart(3, "0");
    };

    // Create lookup sets for comparison using normalized IDs
    const providerGameIds = new Set(
      providerGames.map((game) => normalizeGameId(game.GameId))
    );

    const dbGameIds = new Set(
      dbGames.map((game) => normalizeGameId(game.gameID))
    );

    // Create maps for easy lookup of original game data
    const providerGameMap = new Map(
      providerGames.map((game) => [normalizeGameId(game.GameId), game])
    );

    const dbGameMap = new Map(
      dbGames.map((game) => [normalizeGameId(game.gameID), game])
    );

    // Find missing games (in provider but not in database)
    const missingGames = Array.from(providerGameIds)
      .filter((normalizedId) => !dbGameIds.has(normalizedId))
      .map((normalizedId) => {
        const game = providerGameMap.get(normalizedId);
        return {
          gameId: normalizedId, // Return normalized ID (e.g., "001", "087")
          originalGameId: game.GameId, // Original from provider
          nameEN: game.EnName,
          nameCN: game.CnName,
          nameTW: game.TwName,
          categoryId: game.GameCategoryId,
          platformType: game.PlatformType,
        };
      });

    // Find extra games (in database but not in provider - should be set to maintenance)
    const extraGames = Array.from(dbGameIds)
      .filter((normalizedId) => !providerGameIds.has(normalizedId))
      .map((normalizedId) => {
        const game = dbGameMap.get(normalizedId);
        return {
          gameId: normalizedId, // Return normalized ID (e.g., "001", "087")
          originalGameId: game.gameID, // Original from database
          nameEN: game.gameNameEN,
          nameCN: game.gameNameCN,
          currentMaintenance: game.maintenance || false,
        };
      });

    // Update extra games to maintenance mode (using original gameIDs from database)
    if (extraGames.length > 0) {
      const extraGameOriginalIds = extraGames.map(
        (game) => game.originalGameId
      );

      await GameYGRGameModal.updateMany(
        { gameID: { $in: extraGameOriginalIds } },
        { $set: { maintenance: true } }
      );

      console.log(`✅ Set ${extraGames.length} games to maintenance mode`);
    }

    // Identify games that are in both but might need maintenance flag removed
    const activeGames = dbGames.filter((game) => {
      const normalizedDbId = normalizeGameId(game.gameID);
      return providerGameIds.has(normalizedDbId) && game.maintenance === true;
    });

    if (activeGames.length > 0) {
      const activeGameIds = activeGames.map((game) => game.gameID);

      await GameYGRGameModal.updateMany(
        { gameID: { $in: activeGameIds } },
        { $set: { maintenance: false } }
      );

      console.log(
        `✅ Removed maintenance mode from ${activeGames.length} active games`
      );
    }

    return res.status(200).json({
      success: true,
      summary: {
        totalProviderGames: providerGames.length,
        totalDatabaseGames: dbGames.length,
        missingInDatabase: missingGames.length,
        extraInDatabase: extraGames.length,
        reactivated: activeGames.length,
      },
      missingGames: missingGames, // Games in provider but not in DB
      extraGames: extraGames.map((game) => ({
        ...game,
        updatedMaintenance: true,
      })), // Games in DB but not in provider (now set to maintenance)
      reactivatedGames: activeGames.map((game) => ({
        gameId: normalizeGameId(game.gameID),
        originalGameId: game.gameID,
        nameEN: game.gameNameEN,
        nameCN: game.gameNameCN,
      })), // Games that were in maintenance but are now active again
      message: {
        en: "Game list comparison completed successfully.",
        zh: "游戏列表比较成功完成。",
        ms: "Perbandingan senarai permainan berjaya diselesaikan.",
      },
    });
  } catch (error) {
    console.error("YGR Compare GameList error:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "Failed to compare game lists.",
        zh: "比较游戏列表失败。",
        ms: "Gagal membandingkan senarai permainan.",
      },
      error: error.message,
    });
  }
});

router.post("/api/yesgetrich/getprovidergamelist", async (req, res) => {
  try {
    const response = await axios.post(
      `${ygrAPIURL}/GameList`,
      {}, // Empty body as per documentation (Request: none)
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: ygrHeaders, // Token provided by YGR
        },
      }
    );

    console.log("YGR GetGameList Response:", response.data);

    return res.status(200).json({
      success: true,
      gameList: response.data,
      message: {
        en: "Game list retrieved successfully.",
        zh: "游戏列表获取成功。",
        ms: "Senarai permainan berjaya diambil.",
      },
    });
  } catch (error) {
    console.log("SLOT4D error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "SLOT4D: Game launch failed. Please try again or customer service for assistance.",
        zh: "SLOT4D: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "SLOT4D: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/yesgetrich/getgamelist", async (req, res) => {
  try {
    const games = await GameYGRGameModal.find({
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
      GameNameHK: game.gameNameHK,
      GameNameID: game.gameNameID,
      GameType: game.gameType,
      GameImage: game.imageUrlEN || "",
      GameImageZH: game.imageUrlCN || "",
      GameImageHK: game.imageUrlHK || "",
      GameImageID: game.imageUrlID || "",
      Hot: game.hot || false,
      RTP: game.rtpRate,
    }));

    return res.status(200).json({
      success: true,
      gamelist: reformattedGamelist,
    });
  } catch (error) {
    console.log("YGR error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "YGR: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "YGR: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "YGR: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "YGR: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "YGR: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/api/yesgetrich/launchGame",
  authenticateToken,
  async (req, res) => {
    try {
      const { gameLang, gameCode, gameType } = req.body;

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

      const isLocked =
        gameType === "Fishing"
          ? user.gameLock?.yesgetrichfish?.lock
          : user.gameLock?.yesgetrichslot?.lock;

      if (isLocked) {
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
        lang = "zh-TW";
      }

      let token = `${user.gameId}:${gameCode}:${generateRandomCode()}`;

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000);

      await User.findByIdAndUpdate(
        user._id,
        {
          $push: {
            ygrGameTokens: {
              token: token,
              createdAt: now,
              expiresAt: expiresAt,
            },
          },
        },
        { new: true }
      );

      const response = await axios.get(
        `${ygrLaunchAPIURL}/launch?token=${token}&language=${lang}`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: ygrHeaders,
            Supplier: ygrHeaders,
          },
        }
      );

      if (response.data.ErrorCode !== 0) {
        console.log("YGR error in launching game", response.data);

        if (response.data.ErrorCode === 104) {
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

        return res.status(200).json({
          success: false,
          message: {
            en: "YGR: Game launch failed. Please try again or customer service for assistance.",
            zh: "YGR: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "YGR: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "YGR: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
            id: "YGR: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "YGR"
      );

      return res.status(200).json({
        success: true,
        gameLobby: response.data.Data.Url,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
          zh_hk: "遊戲啟動成功。",
          id: "Permainan berhasil diluncurkan.",
        },
      });
    } catch (error) {
      console.log("YGR error in launching game", error);
      return res.status(200).json({
        success: false,
        message: {
          en: "YGR: Game launch failed. Please try again or customer service for assistance.",
          zh: "YGR: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "YGR: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "YGR: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "YGR: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/api/yesgetrich/token/authorizationConnectToken",
  async (req, res) => {
    try {
      const { connectToken } = req.body;

      if (!connectToken) {
        console.log("faield 1");
        return res.status(200).json({
          data: null,
          status: {
            code: "201",
            message: "Bad parameter",
            dateTime: generateDateTime(),
            traceCode: generateTraceCode(),
          },
        });
      }

      const [gameId, gameCode] = connectToken.split(":");

      const currentUser = await User.findOne(
        { gameId: gameId },
        { wallet: 1, _id: 1, ygrGameTokens: 1, username: 1 }
      ).lean();

      if (!currentUser) {
        console.log("faield 2");
        return res.status(200).json({
          data: null,
          status: {
            code: "205",
            message: "Account not exist",
            dateTime: generateDateTime(),
            traceCode: generateTraceCode(),
          },
        });
      }

      const validToken = currentUser.ygrGameTokens?.find(
        (t) => t.token === connectToken
      );

      if (!validToken) {
        console.log("faield 3");
        return res.status(200).json({
          data: null,
          status: {
            code: "401",
            message: "Unauthorized",
            dateTime: generateDateTime(),
            traceCode: generateTraceCode(),
          },
        });
      }

      const existingGame = await GameYGRGameModal.findOne(
        { gameID: gameCode },
        { _id: 1 }
      ).lean();

      if (!existingGame) {
        console.log("gam enot exist ygr");
        return res.status(200).json({
          data: null,
          status: {
            code: "206",
            message: "Game not exist",
            dateTime: generateDateTime(),
            traceCode: generateTraceCode(),
          },
        });
      }

      return res.status(200).json({
        data: {
          gameId: gameCode,
          userId: gameId,
          nickname: currentUser.username,
          ownerId: ygrHeaders,
          parentId: ygrHeaders,
          currency: "MYR",
          amount: roundToTwoDecimals(currentUser.wallet),
        },
        status: {
          code: "0",
          message: "Success",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    } catch (error) {
      console.error(
        "YGR: Error in game provider calling ae96 get balance api:",
        error.message
      );
      return res.status(200).json({
        data: null,
        status: {
          code: "999",
          message: "Something wrong",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }
  }
);

router.get("/api/yesgetrich/token/getConnectTokenAmount", async (req, res) => {
  try {
    const { connectToken } = req.query;
    if (!connectToken) {
      return res.status(200).json({
        data: null,
        status: {
          code: "201",
          message: "Bad parameter",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    const [gameId] = connectToken.split(":");

    const currentUser = await User.findOne(
      { gameId: gameId },
      { wallet: 1, _id: 1 }
    ).lean();

    if (!currentUser) {
      console.log("faield get token");
      return res.status(200).json({
        data: null,
        status: {
          code: "205",
          message: "Account not exist",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }
    return res.status(200).json({
      data: {
        currency: "MYR",
        amount: roundToTwoDecimals(currentUser.wallet),
      },
      status: {
        code: "0",
        message: "Success",
        dateTime: generateDateTime(),
        traceCode: generateTraceCode(),
      },
    });
  } catch (error) {
    console.error(
      "YGR: Error in game provider calling ae96 get balance api:",
      error.message
    );
    return res.status(200).json({
      data: null,
      status: {
        code: "999",
        message: "Something wrong",
        dateTime: generateDateTime(),
        traceCode: generateTraceCode(),
      },
    });
  }
});

router.post("/api/yesgetrich/token/delConnectToken", async (req, res) => {
  try {
    const { connectToken } = req.body;

    if (!connectToken) {
      return res.status(200).json({
        data: null,
        status: {
          code: "201",
          message: "Bad parameter",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    const [gameId] = connectToken.split(":");

    const currentUser = await User.findOne(
      { gameId: gameId },
      { wallet: 1, _id: 1, ygrGameTokens: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(200).json({
        data: null,
        status: {
          code: "205",
          message: "Account not exist",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    const validToken = currentUser.ygrGameTokens?.find(
      (t) => t.token === connectToken
    );

    if (!validToken) {
      return res.status(200).json({
        data: {},
        status: {
          code: "0",
          message: "Success",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    await User.updateOne(
      { _id: currentUser._id },
      {
        $pull: {
          ygrGameTokens: { token: connectToken },
        },
      }
    );

    return res.status(200).json({
      data: {},
      status: {
        code: "0",
        message: "Success",
        dateTime: generateDateTime(),
        traceCode: generateTraceCode(),
      },
    });
  } catch (error) {
    console.error(
      "YGR: Error in game provider calling ae96 get balance api:",
      error.message
    );
    return res.status(200).json({
      data: null,
      status: {
        code: "999",
        message: "Something wrong",
        dateTime: generateDateTime(),
        traceCode: generateTraceCode(),
      },
    });
  }
});

router.post("/api/yesgetrich/transaction/addGameResult", async (req, res) => {
  try {
    const {
      connectToken,
      transID,
      roundID,
      betAmount,
      payoutAmount,
      winLoseAmount,
      freeGame,
    } = req.body;
    if (
      !connectToken ||
      !transID ||
      !roundID ||
      betAmount === undefined ||
      betAmount === null ||
      payoutAmount === undefined ||
      payoutAmount === null ||
      winLoseAmount === undefined ||
      winLoseAmount === null
    ) {
      return res.status(200).json({
        data: null,
        status: {
          code: "201",
          message: "Bad parameter",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    const [gameId] = connectToken.split(":");

    const [currentUser, existingTransaction] = await Promise.all([
      User.findOne(
        { gameId: gameId },
        {
          wallet: 1,
          "gameLock.yesgetrichslot.lock": 1,
          ygrGameTokens: 1,
          _id: 1,
        }
      ).lean(),
      SlotYGRModal.findOne({ tranId: transID }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        data: null,
        status: {
          code: "205",
          message: "Account not exist",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    const validToken = currentUser.ygrGameTokens?.find(
      (t) => t.token === connectToken
    );

    if (currentUser.gameLock?.yesgetrichslot?.lock || !validToken) {
      return res.status(200).json({
        data: null,
        status: {
          code: "401",
          message: "Unauthorized",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        data: null,
        status: {
          code: "203",
          message: "Transaction ID duplicated",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: roundToTwoDecimals(betAmount) },
      },
      { $inc: { wallet: roundToTwoDecimals(winLoseAmount) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res.status(200).json({
        data: null,
        status: {
          code: "204",
          message: "Insufficient balance",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    await SlotYGRModal.create({
      betId: roundID,
      tranId: transID,
      bet: true,
      settle: true,
      username: gameId,
      betamount: roundToTwoDecimals(betAmount),
      settleamount: roundToTwoDecimals(payoutAmount),
      gametype: "SLOT",
      currentConnectToken: connectToken,
    });

    return res.status(200).json({
      data: {
        currency: "MYR",
        balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
      status: {
        code: "0",
        message: "Success",
        dateTime: generateDateTime(),
        traceCode: generateTraceCode(),
      },
    });
  } catch (error) {
    console.error(
      "YGR: Error in game provider calling ae96 get balance api:",
      error.message
    );
    return res.status(200).json({
      data: null,
      status: {
        code: "999",
        message: "Something wrong",
        dateTime: generateDateTime(),
        traceCode: generateTraceCode(),
      },
    });
  }
});

router.post("/api/yesgetrich/transaction/rollOut", async (req, res) => {
  try {
    const { connectToken, transID, roundID, amount, takeAll } = req.body;
    if (
      !connectToken ||
      !transID ||
      !roundID ||
      amount === undefined ||
      amount === null
    ) {
      return res.status(200).json({
        data: null,
        status: {
          code: "201",
          message: "Bad parameter",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    const [gameId] = connectToken.split(":");

    const [currentUser, existingTransaction] = await Promise.all([
      User.findOne(
        { gameId: gameId },
        {
          wallet: 1,
          "gameLock.yesgetrichfish.lock": 1,
          ygrGameTokens: 1,
          _id: 1,
        }
      ).lean(),
      SlotYGRModal.findOne({ tranId: transID }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        data: null,
        status: {
          code: "205",
          message: "Account not exist",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    const validToken = currentUser.ygrGameTokens?.find(
      (t) => t.token === connectToken
    );

    if (currentUser.gameLock?.yesgetrichfish?.lock || !validToken) {
      return res.status(200).json({
        data: null,
        status: {
          code: "401",
          message: "Unauthorized",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        data: null,
        status: {
          code: "203",
          message: "Transaction ID duplicated",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    let deductedAmount;
    let updatedUserBalance;

    if (takeAll) {
      updatedUserBalance = await User.findOneAndUpdate(
        {
          _id: currentUser._id,
          wallet: { $gt: 0 },
        },
        [
          {
            $set: {
              deductedAmount: "$wallet",
              wallet: 0,
            },
          },
        ],
        { new: true, projection: { wallet: 1, deductedAmount: 1 } }
      ).lean();

      deductedAmount = roundToTwoDecimals(updatedUserBalance.deductedAmount);
    } else {
      updatedUserBalance = await User.findOneAndUpdate(
        {
          _id: currentUser._id,
          wallet: { $gte: roundToTwoDecimals(amount) },
        },
        { $inc: { wallet: -roundToTwoDecimals(amount) } },
        { new: true, projection: { wallet: 1 } }
      ).lean();

      deductedAmount = roundToTwoDecimals(amount);
    }

    if (!updatedUserBalance) {
      return res.status(200).json({
        data: null,
        status: {
          code: "204",
          message: "Insufficient balance",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    await SlotYGRModal.create({
      betId: roundID,
      tranId: transID,
      fish: true,
      bet: true,
      settle: false,
      username: gameId,
      depositamount: deductedAmount,
      gametype: "FISH",
      currentConnectToken: connectToken,
    });

    return res.status(200).json({
      data: {
        amount: roundToTwoDecimals(deductedAmount),
        currency: "MYR",
        balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
      status: {
        code: "0",
        message: "Success",
        dateTime: generateDateTime(),
        traceCode: generateTraceCode(),
      },
    });
  } catch (error) {
    console.error(
      "YGR: Error in game provider calling ae96 get balance api:",
      error.message
    );
    return res.status(200).json({
      data: null,
      status: {
        code: "999",
        message: "Something wrong",
        dateTime: generateDateTime(),
        traceCode: generateTraceCode(),
      },
    });
  }
});

router.post("/api/yesgetrich/transaction/rollIn", async (req, res) => {
  try {
    const {
      connectToken,
      transID,
      roundID,
      amount,
      betAmount,
      payoutAmount,
      winLoseAmount,
    } = req.body;
    if (
      !connectToken ||
      !transID ||
      !roundID ||
      amount === undefined ||
      amount === null ||
      betAmount === undefined ||
      betAmount === null ||
      payoutAmount === undefined ||
      payoutAmount === null ||
      winLoseAmount === undefined ||
      winLoseAmount === null
    ) {
      return res.status(200).json({
        data: null,
        status: {
          code: "201",
          message: "Bad parameter",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    const [gameId] = connectToken.split(":");

    const [currentUser, existingTransaction] = await Promise.all([
      User.findOne(
        { gameId: gameId },
        {
          wallet: 1,
          _id: 1,
        }
      ).lean(),
      SlotYGRModal.findOne(
        { betId: roundID },
        { _id: 1, settle: 1, cancel: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        data: null,
        status: {
          code: "205",
          message: "Account not exist",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    if (!existingTransaction) {
      // ✅ FIXED
      return res.status(200).json({
        data: null,
        status: {
          code: "404",
          message: "Not Found",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    if (existingTransaction.settle || existingTransaction.cancel) {
      return res.status(200).json({
        data: {
          currency: "MYR",
          balance: roundToTwoDecimals(currentUser.wallet),
        },
        status: {
          code: "0",
          message: "Success",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: roundToTwoDecimals(amount) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotYGRModal.findOneAndUpdate(
        { betId: roundID },
        {
          $set: {
            settle: true,
            betamount: roundToTwoDecimals(betAmount),
            settleamount: roundToTwoDecimals(payoutAmount),
            withdrawamount: roundToTwoDecimals(amount),
          },
        },
        { upsert: true }
      ),
    ]);

    return res.status(200).json({
      data: {
        currency: "MYR",
        balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
      status: {
        code: "0",
        message: "Success",
        dateTime: generateDateTime(),
        traceCode: generateTraceCode(),
      },
    });
  } catch (error) {
    console.error(
      "YGR: Error in game provider calling ae96 get balance api:",
      error.message
    );
    return res.status(200).json({
      data: null,
      status: {
        code: "999",
        message: "Something wrong",
        dateTime: generateDateTime(),
        traceCode: generateTraceCode(),
      },
    });
  }
});

router.post("/api/yesgetrich/transaction/refund", async (req, res) => {
  try {
    const { connectToken, transID } = req.body;

    if (!connectToken || !transID) {
      return res.status(200).json({
        data: null,
        status: {
          code: "201",
          message: "Bad parameter",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    const [gameId] = connectToken.split(":");

    const [currentUser, existingTransaction] = await Promise.all([
      User.findOne({ gameId: gameId }, { wallet: 1, _id: 1 }).lean(),
      SlotYGRModal.findOne(
        { tranId: transID },
        { _id: 1, settle: 1, cancel: 1, depositamount: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        data: null,
        status: {
          code: "205",
          message: "Account not exist",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    if (!existingTransaction) {
      return res.status(200).json({
        data: null,
        status: {
          code: "404",
          message: "Not Found",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    if (existingTransaction.settle || existingTransaction.cancel) {
      return res.status(200).json({
        data: {
          currency: "MYR",
          balance: roundToTwoDecimals(currentUser.wallet),
        },
        status: {
          code: "0",
          message: "Success",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        {
          $inc: {
            wallet: roundToTwoDecimals(existingTransaction.depositamount || 0),
          },
        },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotYGRModal.updateOne({ tranId: transID }, { $set: { cancel: true } }),
    ]);

    return res.status(200).json({
      data: {
        currency: "MYR",
        balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
      status: {
        code: "0",
        message: "Success",
        dateTime: generateDateTime(),
        traceCode: generateTraceCode(),
      },
    });
  } catch (error) {
    console.error(
      "YGR: Error in game provider calling ae96 get balance api:",
      error.message
    );
    return res.status(200).json({
      data: null,
      status: {
        code: "999",
        message: "Something wrong",
        dateTime: generateDateTime(),
        traceCode: generateTraceCode(),
      },
    });
  }
});

router.post("/api/yesgetrich/betSlip/roundCheck", async (req, res) => {
  try {
    const { fromDate, toDate } = req.body;

    // Validate parameters
    if (!fromDate || !toDate) {
      return res.status(200).json({
        data: null,
        status: {
          code: "201",
          message: "Bad parameter",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    let startDate, endDate;
    try {
      startDate = new Date(fromDate);
      endDate = new Date(toDate);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error("Invalid date format");
      }
    } catch (dateError) {
      return res.status(200).json({
        data: null,
        status: {
          code: "201",
          message: "Invalid date format. Please use RFC3339 format",
          dateTime: generateDateTime(),
          traceCode: generateTraceCode(),
        },
      });
    }

    const incompleteBets = await SlotYGRModal.find({
      gametype: "FISH",
      bet: true,
      $or: [{ settle: false }, { cancel: false }],
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
    })
      .select("tranId betId depositamount currentConnectToken createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const formattedData = incompleteBets.map((bet) => ({
      transID: bet.tranId,
      roundID: bet.betId,
      amount: roundToTwoDecimals(bet.depositamount || 0),
      connectToken: bet.currentConnectToken || "",
      rollTime: bet.createdAt.toISOString(),
    }));

    return res.status(200).json({
      data: formattedData,
      status: {
        code: "0",
        message: "Success",
        dateTime: generateDateTime(),
        traceCode: generateTraceCode(),
      },
    });
  } catch (error) {
    console.error(
      "YGR: Error in game provider calling ae96 get balance api:",
      error.message
    );
    return res.status(200).json({
      data: null,
      status: {
        code: "999",
        message: "Something wrong",
        dateTime: generateDateTime(),
        traceCode: generateTraceCode(),
      },
    });
  }
});

router.post("/api/yesgetrichslot/getturnoverforrebate", async (req, res) => {
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

    console.log("YGR QUERYING TIME", startDate, endDate);

    const records = await SlotYGRModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      cancel: { $ne: true },
      settle: true,
      gametype: "SLOT",
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

    let playerSummary = {};

    records.forEach((record) => {
      const gameId = record.username;
      const actualUsername = gameIdToUsername[gameId];

      if (!actualUsername) {
        console.warn(`YGR User not found for gameId: ${gameId}`);
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
        gamename: "YGR",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("YGR: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "YGR: Failed to fetch win/loss report",
        zh: "YGR: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/yesgetrichslot/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotYGRModal.find({
        username: user.gameId,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },

        settle: true,
        gametype: "SLOT",
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
          gamename: "YGR",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("YGR: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "YGR: Failed to fetch win/loss report",
          zh: "YGR: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/yesgetrichslot/:userId/gamedata",
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

          if (slotGames["YGR"]) {
            totalTurnover += slotGames["YGR"].turnover || 0;
            totalWinLoss += slotGames["YGR"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "YGR",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("YGR: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "YGR: Failed to fetch win/loss report",
          zh: "YGR: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/yesgetrichslot/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotYGRModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        settle: true,
        gametype: "SLOT",
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
          gamename: "YGR",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("YGR: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "YGR: Failed to fetch win/loss report",
          zh: "YGR: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/yesgetrichslot/kioskreport",
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

          if (liveCasino["YGR"]) {
            totalTurnover += Number(liveCasino["YGR"].turnover || 0);
            totalWinLoss += Number(liveCasino["YGR"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "YGR",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("YGR: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "YGR: Failed to fetch win/loss report",
          zh: "YGR: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.post("/api/yesgetrichfish/getturnoverforrebate", async (req, res) => {
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

    console.log("YGR FISH QUERYING TIME", startDate, endDate);

    const records = await SlotYGRModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "FISH",
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
        gamename: "YGR",
        gamecategory: "Fishing",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("YGR: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "YGR: Failed to fetch win/loss report",
        zh: "YGR: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/yesgetrichfish/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotYGRModal.find({
        username: user.gameId,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "FISH",
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
          gamename: "YGR",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("YGR: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "YGR: Failed to fetch win/loss report",
          zh: "YGR: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/yesgetrichfish/:userId/gamedata",
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
          gameCategories["Fishing"] &&
          gameCategories["Fishing"] instanceof Map
        ) {
          const gameCat = Object.fromEntries(gameCategories["Fishing"]);

          if (gameCat["YGR"]) {
            totalTurnover += gameCat["YGR"].turnover || 0;
            totalWinLoss += gameCat["YGR"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "YGR",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("YGR: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "YGR: Failed to fetch win/loss report",
          zh: "YGR: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/yesgetrichfish/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotYGRModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "FISH",
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
          gamename: "YGR",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("YGR: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "YGR: Failed to fetch win/loss report",
          zh: "YGR: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/yesgetrichfish/kioskreport",
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
          gameCategories["Fishing"] &&
          gameCategories["Fishing"] instanceof Map
        ) {
          const gameCat = Object.fromEntries(gameCategories["Fishing"]);

          if (gameCat["YGR"]) {
            totalTurnover += Number(gameCat["YGR"].turnover || 0);
            totalWinLoss += Number(gameCat["YGR"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "YGR",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("YGR: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "YGR: Failed to fetch win/loss report",
          zh: "YGR: 获取盈亏报告失败",
        },
      });
    }
  }
);

module.exports = router;
