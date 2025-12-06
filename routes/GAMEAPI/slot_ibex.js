const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");
const CryptoJS = require("crypto-js");
const { authenticateToken } = require("../../auth/auth");
const { authenticateAdminToken } = require("../../auth/adminAuth");
const {
  User,
  adminUserWalletLog,
  GameDataLog,
} = require("../../models/users.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const qs = require("querystring");
const GameWalletLog = require("../../models/gamewalletlog.model");
const GameIBexGameModal = require("../../models/slot_ibexDatabase.model");
const SlotIBEXModal = require("../../models/slot_ibex.model");
const Decimal = require("decimal.js");
require("dotenv").config();

const ibexOperatorToken = process.env.IBEX_OPERATORTOKEN;
const ibexSecret = process.env.IBEX_SECRET;
const webURL = "https://www.bm8my.vip/";
const ibexAPIURL = "https://pgf-thek60.com";
const ibexHost = "pgf-thek60.com";
const ibexGameURL = "https://pgf-thek60.com/gameredirect";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateUpdatedTimeUTC() {
  return moment.utc().add(10, "hours").valueOf();
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

function generateIBEXAuthHeaders(bodyString) {
  const xDate = moment.utc().format("YYYYMMDD");

  const xContentSha256 = crypto
    .createHash("sha256")
    .update(bodyString)
    .digest("hex");

  const stringToSign = ibexHost + xContentSha256 + xDate;
  const signature = crypto
    .createHmac("sha256", ibexSecret)
    .update(stringToSign)
    .digest("hex");

  const authorization = `PWS-HMAC-SHA256 Credential=${xDate}/${ibexOperatorToken}/pws/v1,SignedHeaders=host;x-content-sha256;x-date,Signature=${signature}`;

  return {
    "Content-Type": "application/x-www-form-urlencoded",
    Host: ibexHost,
    "x-date": xDate,
    "x-content-sha256": xContentSha256,
    Authorization: authorization,
  };
}

// async function updateIBEXManualOrderTimestamps() {
//   try {
//     // List of game names in order (first = latest, last = oldest)
//     const gameNames = [
//       "MAHJONG WIN 2",
//       "MAHJONG WIN",
//       "AZTEC EMPIRE",
//       "LUCKY MEOW",
//       "WILD HUNT SHOWDOWN",
//       "HIGHWAY HERO",
//       "LEGENDS OF THE QILIN",
//       "Moto GG",
//       "BANDITO FIESTA",
//       "FORTUNE TIGGER",
//     ];

//     /**
//      * Normalize string for comparison
//      * - Convert to lowercase
//      * - Remove all spaces
//      */
//     const normalizeString = (str) => {
//       if (!str) return "";
//       return str.toLowerCase().replace(/\s+/g, "");
//     };

//     // Get all games from database
//     const allGames = await GameIBexGameModal.find(
//       {},
//       { gameID: 1, gameNameEN: 1, _id: 1 }
//     ).lean();

//     // Create lookup map: normalizedName -> game document
//     const dbGameMap = new Map();
//     allGames.forEach((game) => {
//       const normalizedName = normalizeString(game.gameNameEN);
//       dbGameMap.set(normalizedName, game);
//     });

//     console.log(`\n=== IBEX Manual Order Timestamp Update ===`);
//     console.log(`Database has ${allGames.length} games`);
//     console.log(`Processing ${gameNames.length} game names\n`);

//     // Start from current time + 1 month for the latest game
//     const currentTime = new Date();
//     const startTime = new Date(
//       currentTime.getTime() + 30 * 24 * 60 * 60 * 1000
//     ); // Add 30 days

//     let updatedCount = 0;
//     let notFoundCount = 0;

//     // Process each game name with 30-minute intervals
//     for (let i = 0; i < gameNames.length; i++) {
//       const gameName = gameNames[i];
//       const normalizedName = normalizeString(gameName);

//       // Calculate timestamp: latest game gets start time, each subsequent is 30 minutes older
//       const timestamp = new Date(startTime.getTime() - i * 30 * 60 * 1000);

//       // Find matching game in database
//       const matchedGame = dbGameMap.get(normalizedName);

//       if (matchedGame) {
//         // Update directly in collection to bypass schema timestamps
//         const result = await GameIBexGameModal.collection.updateOne(
//           { _id: matchedGame._id },
//           {
//             $set: {
//               createdAt: timestamp,
//               updatedAt: timestamp,
//             },
//           }
//         );

//         if (result.matchedCount > 0) {
//           console.log(
//             `✅ Updated "${gameName}" (gameID: ${
//               matchedGame.gameID
//             }) -> ${timestamp.toISOString()}`
//           );
//           updatedCount++;
//         }
//       } else {
//         console.log(
//           `❌ Not found: "${gameName}" (normalized: "${normalizedName}")`
//         );
//         notFoundCount++;
//       }
//     }

//     console.log(`\n=== Summary ===`);
//     console.log(`Start time: ${startTime.toISOString()} (current + 1 month)`);
//     console.log(`Updated: ${updatedCount}/${gameNames.length}`);
//     console.log(`Not found: ${notFoundCount}`);

//     // Verify the updates
//     const normalizedNames = gameNames.map((name) => normalizeString(name));
//     const matchedGameIds = allGames
//       .filter((game) =>
//         normalizedNames.includes(normalizeString(game.gameNameEN))
//       )
//       .map((game) => game.gameID);

//     const updatedGames = await GameIBexGameModal.find(
//       { gameID: { $in: matchedGameIds } },
//       { gameID: 1, gameNameEN: 1, createdAt: 1, hot: 1 }
//     ).sort({ createdAt: -1 });

//     console.log(
//       `\n=== Verification - Games ordered by createdAt (newest first) ===`
//     );
//     updatedGames.forEach((game, index) => {
//       console.log(
//         `${index + 1}. gameID: ${game.gameID}, name: "${
//           game.gameNameEN
//         }", createdAt: ${game.createdAt.toISOString()}, hot: ${game.hot}`
//       );
//     });

//     return {
//       success: true,
//       updated: updatedCount,
//       notFound: notFoundCount,
//       total: gameNames.length,
//     };
//   } catch (error) {
//     console.error("Error updating IBEX manual order timestamps:", error);
//     return {
//       success: false,
//       error: error.message,
//     };
//   }
// }

// // Call the function
// updateIBEXManualOrderTimestamps();

router.post("/api/ibex/syncGameStatus", async (req, res) => {
  try {
    const { currency = "MYR", status = 1 } = req.body;

    const traceId = uuidv4();

    const bodyParams = {
      operator_token: ibexOperatorToken,
      secret_key: ibexSecret,
      currency,
      language: "en-us",
      status,
    };

    const bodyString = qs.stringify(bodyParams);
    const headers = generateIBEXAuthHeaders(bodyString);

    const response = await axios.post(
      `${ibexAPIURL}/Game/v2/Get?trace_id=${traceId}`,
      bodyString,
      { headers }
    );

    if (response.data.error) {
      console.log("IBEX error:", response.data.error);
      return res.status(200).json({
        success: false,
        message: "Failed to fetch game list from IBEX",
      });
    }

    // Extract gameIds from API response
    const apiGameList = response.data.data || [];
    const apiGameIds = new Set(apiGameList.map((game) => String(game.gameId)));

    console.log(`\n=== IBEX Game Sync ===`);
    console.log(`API returned ${apiGameIds.size} games`);

    // Get all games from database
    const dbGames = await GameIBexGameModal.find(
      {},
      { gameID: 1, gameNameEN: 1, maintenance: 1, _id: 1 }
    ).lean();

    const dbGameIds = new Set(dbGames.map((game) => String(game.gameID)));

    console.log(`Database has ${dbGameIds.size} games`);

    // Find missing games (in API but not in DB)
    const missingInDB = [];
    for (const game of apiGameList) {
      const gameId = String(game.gameId);
      if (!dbGameIds.has(gameId)) {
        missingInDB.push({
          gameId: game.gameId,
          gameName: game.gameName,
          gameCode: game.gameCode,
        });
      }
    }

    if (missingInDB.length > 0) {
      console.log(`\n❌ Missing in Database (${missingInDB.length} games):`);
      missingInDB.forEach((game) => {
        console.log(
          `  - gameId: ${game.gameId}, name: ${game.gameName}, code: ${game.gameCode}`
        );
      });
    } else {
      console.log(`\n✅ No missing games in database`);
    }

    // Find extra games (in DB but not in API) -> set maintenance: true
    // Find matching games (in both) -> set maintenance: false
    const bulkOps = [];
    const extraInDB = [];
    const matchingGames = [];

    for (const dbGame of dbGames) {
      const gameId = String(dbGame.gameID);

      if (!apiGameIds.has(gameId)) {
        // Extra in DB -> set maintenance: true
        extraInDB.push({
          gameID: dbGame.gameID,
          gameNameEN: dbGame.gameNameEN,
        });

        if (!dbGame.maintenance) {
          bulkOps.push({
            updateOne: {
              filter: { _id: dbGame._id },
              update: { $set: { maintenance: true } },
            },
          });
        }
      } else {
        // Matching -> set maintenance: false
        matchingGames.push(dbGame.gameID);

        if (dbGame.maintenance) {
          bulkOps.push({
            updateOne: {
              filter: { _id: dbGame._id },
              update: { $set: { maintenance: false } },
            },
          });
        }
      }
    }

    if (extraInDB.length > 0) {
      console.log(
        `\n⚠️ Extra in Database - Setting maintenance: true (${extraInDB.length} games):`
      );
      extraInDB.forEach((game) => {
        console.log(`  - gameID: ${game.gameID}, name: ${game.gameNameEN}`);
      });
    } else {
      console.log(`\n✅ No extra games in database`);
    }

    // Execute bulk update
    let modifiedCount = 0;
    if (bulkOps.length > 0) {
      const result = await GameIBexGameModal.bulkWrite(bulkOps);
      modifiedCount = result.modifiedCount;
      console.log(`\n📝 Updated ${modifiedCount} games`);
    }

    return res.status(200).json({
      success: true,
      message: "Game sync completed",
      summary: {
        apiGameCount: apiGameIds.size,
        dbGameCount: dbGameIds.size,
        matchingGames: matchingGames.length,
        missingInDB: missingInDB.length,
        extraInDB: extraInDB.length,
        updatedGames: modifiedCount,
      },
      missingInDB: missingInDB,
      extraInDB: extraInDB,
    });
  } catch (error) {
    console.error("IBEX sync error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to sync game status",
      error: error.message,
    });
  }
});

router.post("/api/ibex/getprovidergamelist", async (req, res) => {
  try {
    const { gameLang, currency = "MYR", status = 1 } = req.body;

    let language = "en-us";
    if (gameLang === "zh" || gameLang === "zh_hk") {
      language = "zh-cn";
    }

    const traceId = uuidv4();

    const bodyParams = {
      operator_token: ibexOperatorToken,
      secret_key: ibexSecret,
      currency,
      language,
      status,
    };

    const bodyString = qs.stringify(bodyParams);

    // Generate auth headers (optional - remove if not using hash auth)
    const headers = generateIBEXAuthHeaders(bodyString);

    const response = await axios.post(
      `${ibexAPIURL}/Game/v2/Get?trace_id=${traceId}`,
      bodyString,
      { headers }
    );

    // Check for error
    if (response.data.error) {
      console.log("IBEX error:", response.data.error);
      return res.status(200).json({
        success: false,
        message: {
          en: "IBEX: Unable to retrieve game list. Please contact customer service for assistance.",
          zh: "IBEX: 无法获取游戏列表，请联系客服以获取帮助。",
          ms: "IBEX: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "IBEX: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
          id: "IBEX: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    return res.status(200).json({
      success: true,
      gamelist: response.data,
      message: {
        en: "Game list retrieved successfully.",
        zh: "游戏列表获取成功。",
        ms: "Senarai permainan berjaya diperoleh.",
        zh_hk: "遊戲列表獲取成功。",
        id: "Daftar permainan berhasil diambil.",
      },
    });
  } catch (error) {
    console.log("IBEX error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "IBEX: Unable to retrieve game list. Please contact customer service for assistance.",
        zh: "IBEX: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "IBEX: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "IBEX: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "IBEX: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/ibex/getgamelist", async (req, res) => {
  try {
    const games = await GameIBexGameModal.find({
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

    const reformattedGamelist = games.map((game) => ({
      GameCode: game.gameID,
      GameNameEN: game.gameNameEN,
      GameNameZH: game.gameNameCN,
      GameNameHK: game.gameNameHK,
      GameType: game.gameType,
      GameImage: game.imageUrlEN || "",
      GameImageZH: game.imageUrlCN || "",
      Hot: game.hot,
      RTP: game.rtpRate,
    }));

    return res.status(200).json({
      success: true,
      gamelist: reformattedGamelist,
    });
  } catch (error) {
    console.error("IBEX Error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "IBEX: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "IBEX: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "IBEX: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "IBEX: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "IBEX: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/ibex/launchGame", authenticateToken, async (req, res) => {
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

    if (user.gameLock.ibex.lock) {
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

    const { gameCode, gameLang } = req.body;

    let lang = "en";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "zh";
    } else if (gameLang === "zh_hk") {
      lang = "zh";
    } else if (gameLang === "ms") {
      lang = "en";
    } else if (gameLang === "id") {
      lang = "id";
    }

    const token = `${user.gameId}:${generateRandomCode()}`;

    const exitUrl = encodeURIComponent(webURL);

    const queryParams = new URLSearchParams({
      btt: 1,
      ot: ibexOperatorToken,
      ops: token,
      l: lang,
      f: exitUrl,
    });

    const gameLaunchUrl = `${ibexGameURL}/${gameCode}/index.html?${queryParams.toString()}`;

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        ibexGameToken: token,
      },
      { new: true }
    );

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "IBEX"
    );

    return res.status(200).json({
      success: true,
      gameLobby: gameLaunchUrl,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("IBEX error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "IBEX: Game launch failed. Please try again or contact customer service for assistance.",
        zh: "IBEX: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "IBEX: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "IBEX: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "IBEX: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/ibex/verifysession", async (req, res) => {
  try {
    const { operator_token, secret_key, operator_player_session } = req.body;

    if (
      !operator_token ||
      !secret_key ||
      !operator_player_session ||
      operator_token !== ibexOperatorToken ||
      secret_key !== ibexSecret
    ) {
      return res.status(200).json({
        data: null,
        error: { code: "1034", message: "Invalid request" },
      });
    }

    const decodedSession = decodeURIComponent(operator_player_session);
    const username = decodedSession.split(":")[0];

    const currentUser = await User.findOne(
      { gameId: username },
      { wallet: 1, ibexGameToken: 1, username: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(200).json({
        data: null,
        error: {
          code: "3004",
          message: `Player does not exist`,
        },
      });
    }

    if (currentUser.ibexGameToken !== operator_player_session) {
      return res.status(200).json({
        data: null,
        error: {
          code: "1300",
          message: `Invalid player session`,
        },
      });
    }

    return res.status(200).json({
      data: {
        player_name: username,
        nickname: currentUser.username,
        currency: "MYR",
      },
      error: null,
    });
  } catch (error) {
    console.error(
      "IBEX: Error in game provider calling  get balance api:",
      error.message
    );
    return res.status(200).json({
      data: null,
      error: {
        code: "1200",
        message: `Internal server error`,
      },
    });
  }
});

router.post("/api/ibex/getbalance", async (req, res) => {
  try {
    const { operator_token, secret_key, operator_player_session, player_name } =
      req.body;

    if (
      !operator_token ||
      !secret_key ||
      !operator_player_session ||
      operator_token !== ibexOperatorToken ||
      secret_key !== ibexSecret
    ) {
      return res.status(200).json({
        data: null,
        error: { code: "1034", message: "Invalid request" },
      });
    }

    const currentUser = await User.findOne(
      { gameId: player_name },
      { wallet: 1, _id: 1 }
    ).lean();

    if (!currentUser) {
      console.log("failed 1");
      return res.status(200).json({
        data: null,
        error: {
          code: "3004",
          message: `Player does not exist`,
        },
      });
    }

    return res.status(200).json({
      data: {
        currency_code: "MYR",
        balance_amount: roundToTwoDecimals(currentUser.wallet),
        updated_time: generateUpdatedTimeUTC(),
      },
      error: null,
    });
  } catch (error) {
    console.error(
      "IBEX: Error in game provider calling getbalance api:",
      error.message
    );
    return res.status(200).json({
      data: null,
      error: {
        code: "1200",
        message: `Internal server error`,
      },
    });
  }
});

router.post("/api/ibex/betpayout", async (req, res) => {
  try {
    const {
      operator_token,
      secret_key,
      player_name,
      parent_bet_id,
      bet_id,
      updated_time,
      bet_amount,
      win_amount,
      transfer_amount,
      transaction_id,
      currency_code,
    } = req.body;

    if (
      !operator_token ||
      !secret_key ||
      !player_name ||
      operator_token !== ibexOperatorToken ||
      secret_key !== ibexSecret
    ) {
      return res.status(200).json({
        data: null,
        error: { code: "1034", message: "Invalid request" },
      });
    }

    if (currency_code !== "MYR") {
      return res.status(200).json({
        data: null,
        error: { code: "1034", message: "Invalid request" },
      });
    }

    const parsedBet = roundToTwoDecimals(Number(bet_amount) || 0);
    const parsedWin = roundToTwoDecimals(Number(win_amount) || 0);
    const parsedTransfer = roundToTwoDecimals(Number(transfer_amount) || 0);

    const [currentUser, existingTransaction] = await Promise.all([
      User.findOne(
        { gameId: player_name },
        {
          username: 1,
          wallet: 1,
          "gameLock.ibex.lock": 1,
          _id: 1,
        }
      ).lean(),
      SlotIBEXModal.findOne({ betTranId: transaction_id }, { _id: 1 }).lean(),
    ]);

    if (!currentUser || currentUser.gameLock?.ibex?.lock) {
      return res.status(200).json({
        data: null,
        error: { code: "3004", message: "Player does not exist" },
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        data: {
          currency_code: "MYR",
          balance_amount: roundToTwoDecimals(currentUser.wallet),
          updated_time,
        },
        error: null,
      });
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        gameId: player_name,
        wallet: { $gte: parsedBet },
      },
      { $inc: { wallet: parsedTransfer } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res.status(200).json({
        data: null,
        error: {
          code: "3202",
          message: `Insufficient player balance`,
        },
      });
    }

    await SlotIBEXModal.create({
      betId: parent_bet_id,
      betTranId: transaction_id,
      bet: true,
      settle: true,
      username: player_name,
      betamount: parsedBet,
      settleamount: parsedWin,
    });

    return res.status(200).json({
      data: {
        currency_code: "MYR",
        balance_amount: roundToTwoDecimals(updatedUserBalance.wallet),
        updated_time,
      },
      error: null,
    });
  } catch (error) {
    console.error(
      "IBEX: Error in game provider calling betninfo api:",
      error.message
    );
    return res.status(200).json({
      data: null,
      error: {
        code: "1200",
        message: `Internal server error`,
      },
    });
  }
});

router.post("/api/ibex/adjustment", async (req, res) => {
  try {
    const {
      operator_token,
      secret_key,
      player_name,
      currency_code,
      transfer_amount,
      adjustment_id,
      adjustment_transaction_id,
      promotion_id,
      adjustment_time,
    } = req.body;

    if (
      !operator_token ||
      !secret_key ||
      !player_name ||
      operator_token !== ibexOperatorToken ||
      secret_key !== ibexSecret
    ) {
      return res.status(200).json({
        data: null,
        error: { code: "1034", message: "Invalid request" },
      });
    }

    if (currency_code !== "MYR") {
      return res.status(200).json({
        data: null,
        error: { code: "1034", message: "Invalid request" },
      });
    }

    const roundedTransfer = roundToTwoDecimals(transfer_amount);
    const absTransfer = roundToTwoDecimals(Math.abs(transfer_amount));
    const isDeduction = roundToTwoDecimals(transfer_amount || 0) < 0;

    const [currentUser, existingTransaction] = await Promise.all([
      User.findOne(
        { gameId: player_name },
        {
          username: 1,
          wallet: 1,
          _id: 1,
        }
      ).lean(),
      SlotIBEXModal.findOne(
        { betTranId: adjustment_transaction_id },
        { _id: 1, balanceattime: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        data: null,
        error: {
          code: "3004",
          message: `Player does not exist`,
        },
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        data: {
          adjust_amount: transfer_amount,
          balance_before: roundToTwoDecimals(existingTransaction.balanceattime),
          balance_after: roundToTwoDecimals(currentUser.wallet),
          updated_time: adjustment_time,
        },
        error: null,
      });
    }

    const updateQuery = isDeduction
      ? {
          gameId: player_name,
          wallet: { $gte: absTransfer },
        }
      : {
          gameId: player_name,
        };

    const updatedUserBalance = await User.findOneAndUpdate(
      updateQuery,
      { $inc: { wallet: roundedTransfer } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res.status(200).json({
        data: null,
        error: {
          code: "3202",
          message: `Insufficient player balance`,
        },
      });
    }
    await SlotIBEXModal.create({
      betId: adjustment_id,
      betTranId: adjustment_transaction_id,
      bet: true,
      settle: true,
      username: player_name,
      settleamount: roundedTransfer,
      balanceattime: roundToTwoDecimals(currentUser.wallet),
    });

    return res.status(200).json({
      data: {
        adjust_amount: transfer_amount,
        balance_before: roundToTwoDecimals(currentUser.wallet),
        balance_after: roundToTwoDecimals(updatedUserBalance.wallet),
        updated_time: adjustment_time,
      },
      error: null,
    });
  } catch (error) {
    console.error(
      "IBEX: Error in game provider calling betninfo api:",
      error.message
    );
    return res.status(200).json({
      data: null,
      error: {
        code: "1200",
        message: `Internal server error`,
      },
    });
  }
});

router.post("/api/ibex/getturnoverforrebate", async (req, res) => {
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

    console.log("IBEX QUERYING TIME", startDate, endDate);

    const records = await SlotIBEXModal.find({
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

    let playerSummary = {};

    records.forEach((record) => {
      const gameId = record.username;
      const actualUsername = gameIdToUsername[gameId];

      if (!actualUsername) {
        console.warn(`IBEX User not found for gameId: ${gameId}`);
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
        gamename: "IBEX",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("IBEX: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "IBEX: Failed to fetch win/loss report",
        zh: "IBEX: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/ibex/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotIBEXModal.find({
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
          gamename: "IBEX",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("IBEX: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "IBEX: Failed to fetch win/loss report",
          zh: "IBEX: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/ibex/:userId/gamedata",
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

          if (slotGames["IBEX"]) {
            totalTurnover += slotGames["IBEX"].turnover || 0;
            totalWinLoss += slotGames["IBEX"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "IBEX",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("IBEX: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "IBEX: Failed to fetch win/loss report",
          zh: "IBEX: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/ibex/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotIBEXModal.find({
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
          gamename: "IBEX",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("IBEX: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "IBEX: Failed to fetch win/loss report",
          zh: "IBEX: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/ibex/kioskreport",
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

          if (liveCasino["IBEX"]) {
            totalTurnover += Number(liveCasino["IBEX"].turnover || 0);
            totalWinLoss += Number(liveCasino["IBEX"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "IBEX",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("IBEX: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "IBEX: Failed to fetch win/loss report",
          zh: "IBEX: 获取盈亏报告失败",
        },
      });
    }
  }
);
module.exports = router;
