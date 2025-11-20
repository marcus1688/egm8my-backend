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
const { v4: uuidv4 } = require("uuid");
const querystring = require("querystring");
const moment = require("moment");
const { errorMonitor } = require("events");
const SlotFachaiModal = require("../../models/slot_fachai.model");
const GameWalletLog = require("../../models/gamewalletlog.model");
const GameFachaiGameModal = require("../../models/slot_fachaiDatabase.model");
require("dotenv").config();

//Staging
const fachaiSecret = process.env.FACHAI_SECRET;
const fachaiCode = "DAD";
const webURL = "https://www.bm8my.vip/";
const fachaiAPIURL = "https://ap9.fcg178.net";

function aesEncrypt(dataString, appKey) {
  const cipher = crypto.createCipheriv(
    "aes-128-ecb",
    Buffer.from(appKey, "utf8"),
    null
  );
  let encrypted = cipher.update(dataString, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

function generateMD5(dataString) {
  return crypto.createHash("md5").update(dataString, "utf8").digest("hex");
}

function aesDecrypt(encryptedData, appKey) {
  const decipher = crypto.createDecipheriv(
    "aes-128-ecb",
    Buffer.from(appKey, "utf8"),
    null
  );
  let decrypted = decipher.update(encryptedData, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
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

const validateRequest = (req) => {
  const { AgentCode, Params, Sign } = req.body;

  if (!AgentCode) {
    return {
      error: true,
      response: {
        Result: 1011,
        MainPoints: 0,
        ErrorText: "API customer (agent) code is missing",
      },
    };
  }

  if (!Params) {
    return {
      error: true,
      response: {
        Result: 1013,
        MainPoints: 0,
        ErrorText: "The parameter does not contain any data",
      },
    };
  }

  if (!Sign) {
    return {
      error: true,
      response: {
        Result: 1014,
        MainPoints: 0,
        ErrorText: "API customer (agent) sign is missing",
      },
    };
  }

  return { error: false };
};

// Utility function for signature verification
const verifySignature = (decryptedParams, Sign) => {
  const generatedSign = crypto
    .createHash("md5")
    .update(decryptedParams, "utf8")
    .digest("hex");

  return generatedSign === Sign;
};

// async function updateBTGamingManualOrderTimestampsPlus() {
//   try {
//     // List of gameIDs in order (AB1541 = latest, AB1501 = oldest)
//     const gameIds = [
//       "22064",
//       "22047",
//       "22084",
//       "22040",
//       "22072",
//       "22063",
//       "22041",
//       "22054",
//       "22061",
//       "21009",
//       "22053",
//       "22071",
//       "22075",
//       "22060",
//       "22057",
//       "22049",
//       "22067",
//       "22055",
//       "22069",
//       "22020",
//     ];

//     // Start from current time + 1 month for the latest game (AB1541)
//     const currentTime = new Date();
//     const startTime = new Date(
//       currentTime.getTime() + 30 * 24 * 60 * 60 * 1000
//     ); // Add 30 days (1 month)

//     // Process each gameID with 30-minute intervals
//     for (let i = 0; i < gameIds.length; i++) {
//       const gameId = gameIds[i];

//       // Calculate timestamp: latest game gets start time (current + 1 month), each subsequent game is 30 minutes older
//       const timestamp = new Date(startTime.getTime() - i * 30 * 60 * 1000); // 30 minutes = 30 * 60 * 1000 milliseconds

//       // Update the document directly in the collection, bypassing schema timestamps
//       const result = await GameFachaiGameModal.collection.updateOne(
//         { gameID: gameId },
//         {
//           $set: {
//             createdAt: timestamp,
//             updatedAt: timestamp,
//           },
//         }
//       );

//       if (result.matchedCount > 0) {
//         console.log(
//           `Updated BTGaming gameID ${gameId} with timestamp: ${timestamp.toISOString()}`
//         );
//       } else {
//         console.log(`BTGaming GameID ${gameId} not found in database`);
//       }
//     }

//     console.log("BTGaming manual order timestamp update completed!");
//     console.log(
//       `Start time was set to: ${startTime.toISOString()} (current time + 1 month)`
//     );

//     // Verify the updates by fetching and displaying the results
//     const updatedGames = await GameFachaiGameModal.find(
//       { gameID: { $in: gameIds } },
//       { gameID: 1, createdAt: 1, gameNameEN: 1, hot: 1 }
//     ).sort({ createdAt: -1 });

//     console.log(
//       "\nVerification - BTGaming Games ordered by createdAt (newest first):"
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
//     console.error("Error updating BTGaming manual order timestamps:", error);
//   }
// }

// // Call the function
// updateBTGamingManualOrderTimestampsPlus();

router.post("/api/fachai/comparegame", async (req, res) => {
  try {
    const payload = {};

    const originalJsonString = JSON.stringify(payload);

    const encryptedPayload = aesEncrypt(originalJsonString, fachaiSecret);

    const md5Sign = generateMD5(originalJsonString);

    const requestBody = querystring.stringify({
      AgentCode: fachaiCode,
      Currency: "MYR",
      Params: encryptedPayload,
      Sign: md5Sign,
    });

    const response = await axios.post(
      `${fachaiAPIURL}/GetGameIconList`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    console.log(response.data);

    // Check if API response is successful
    if (response.data.Result !== 0) {
      console.log("FACHAI error fetching game list:", response.data);
      return res.status(200).json({
        success: false,
        message: {
          en: "FACHAI: Unable to retrieve game lists. Please contact customer service for assistance.",
          zh: "FACHAI: 无法获取游戏列表，请联系客服以获取帮助。",
          ms: "FACHAI: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "FACHAI: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
          id: "FACHAI: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    // Get all games from database
    const dbGames = await GameFachaiGameModal.find({}, "gameID");

    // Extract game IDs from database
    const dbGameIds = new Set(dbGames.map((game) => game.gameID));

    // Extract all games from API response across all game types
    const gameIconList = response.data.GetGameIconList;
    const allApiGames = [];

    // Process each game type (fishing, arcade, slot, table)
    Object.keys(gameIconList).forEach((gameType) => {
      Object.keys(gameIconList[gameType]).forEach((gameId) => {
        const gameData = gameIconList[gameType][gameId];
        allApiGames.push({
          gameId: gameId,
          gameType: gameType,
          status: gameData.status,
          gameNameOfChinese: gameData.gameNameOfChinese,
          gameNameOfEnglish: gameData.gameNameOfEnglish,
          cnUrl: gameData.cnUrl,
          enUrl: gameData.enUrl,
        });
      });
    });

    // Extract game IDs from API response
    const apiGameIds = new Set(allApiGames.map((game) => game.gameId));

    // Count totals
    const totalApiGames = allApiGames.length;
    const totalDbGames = dbGames.length;

    // Find missing games (in API but not in database)
    const missingGames = allApiGames.filter(
      (game) => !dbGameIds.has(game.gameId)
    );

    // Find extra games (in database but not in API) and set maintenance to true
    const extraGameIds = [...dbGameIds].filter(
      (gameId) => !apiGameIds.has(gameId)
    );

    // Update extra games to maintenance: true
    if (extraGameIds.length > 0) {
      await GameFachaiGameModal.updateMany(
        { gameID: { $in: extraGameIds } },
        { maintenance: true }
      );
      console.log(
        `Set maintenance: true for ${extraGameIds.length} games not in API`
      );
    }

    // Set maintenance to false for games that are in API (not extra)
    const activeGameIds = [...apiGameIds];
    if (activeGameIds.length > 0) {
      await GameFachaiGameModal.updateMany(
        { gameID: { $in: activeGameIds } },
        { maintenance: false }
      );
      console.log(
        `Set maintenance: false for ${activeGameIds.length} games in API`
      );
    }

    // Return missing games with gameType and gameId
    const missingGamesInfo = missingGames.map((game) => ({
      gameId: game.gameId,
      gameType: game.gameType,
      status: game.status,
      gameNameOfChinese: game.gameNameOfChinese,
      gameNameOfEnglish: game.gameNameOfEnglish,
      cnUrl: game.cnUrl,
      enUrl: game.enUrl,
    }));

    console.log("Missing games:", missingGamesInfo);
    console.log("Extra games set to maintenance:", extraGameIds.length);
    console.log(
      `Total API games: ${totalApiGames}, Total DB games: ${totalDbGames}`
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data,
      comparison: {
        missingGames: missingGamesInfo,
        extraGamesCount: extraGameIds.length,
        extraGameIds: extraGameIds,
        missingCount: missingGamesInfo.length,
        totalApiGames: totalApiGames,
        totalDbGames: totalDbGames,
      },
    });
  } catch (error) {
    console.log("FACHAI error in launching game", error);
    return res.status(200).json({
      success: false,
      message: {
        en: "FACHAI: Game launch failed. Please try again or customer service for assistance.",
        zh: "FACHAI: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "FACHAI: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "FACHAI: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "FACHAI: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

// router.post("/api/fachai/getprovidergamelist", async (req, res) => {
//   try {
//     const payload = {};

//     const originalJsonString = JSON.stringify(payload);

//     const encryptedPayload = aesEncrypt(originalJsonString, fachaiSecret);

//     const md5Sign = generateMD5(originalJsonString);

//     const requestBody = querystring.stringify({
//       AgentCode: fachaiCode,
//       Currency: "MYR",
//       Params: encryptedPayload,
//       Sign: md5Sign,
//     });

//     const response = await axios.post(
//       `${fachaiAPIURL}/GetGameIconList`,
//       requestBody,
//       {
//         headers: {
//           "Content-Type": "application/x-www-form-urlencoded",
//         },
//       }
//     );
//     console.log(response.data);

//     return res.status(200).json({
//       success: true,
//       gameLobby: response.data,
//     });
//   } catch (error) {
//     console.log("FACHAI error in launching game", error);
//     return res.status(200).json({
//       success: false,
//       message: {
//         en: "FACHAI: Game launch failed. Please try again or customer service for assistance.",
//         zh: "FACHAI: 游戏启动失败，请重试或联系客服以获得帮助。",
//         ms: "FACHAI: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
//         zh_hk: "FACHAI: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
//         id: "FACHAI: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
//       },
//     });
//   }
// });

router.post("/api/fachai/getgamelist", async (req, res) => {
  try {
    const games = await GameFachaiGameModal.find({
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
    console.log("FACHAI error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "FACHAI: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "FACHAI: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "FACHAI: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "FACHAI: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "FACHAI: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/fachai/launchGame", authenticateToken, async (req, res) => {
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
        ? user.gameLock?.fachaifish?.lock
        : user.gameLock?.fachaislot?.lock;

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

    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();

    // gameLang ===1  or 2
    let lang = 1;

    if (gameLang === "en") {
      lang = 1;
    } else if (gameLang === "zh") {
      lang = 2;
    } else if (gameLang === "zh_hk") {
      lang = 2;
    } else if (gameLang === "ms") {
      lang = 5;
    } else if (gameLang === "id") {
      lang = 5;
    }

    const payload = {
      MemberAccount: user.gameId,
      LanguageID: lang,
      HomeUrl: webURL,
      GameID: gameCode,
    };

    const originalJsonString = JSON.stringify(payload);

    const encryptedPayload = aesEncrypt(originalJsonString, fachaiSecret);

    const md5Sign = generateMD5(originalJsonString);

    const requestBody = querystring.stringify({
      AgentCode: fachaiCode,
      Currency: "MYR",
      Params: encryptedPayload,
      Sign: md5Sign,
    });

    const response = await axios.post(`${fachaiAPIURL}/Login`, requestBody, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (
      response.data.Result === 403 ||
      response.data.Result === 408 ||
      response.data.Result === 411
    ) {
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

    if (response.data.Result !== 0) {
      console.log("FACHAI error in launching game", response.data);
      return res.status(200).json({
        success: false,
        message: {
          en: "FACHAI: Game launch failed. Please try again or customer service for assistance.",
          zh: "FACHAI: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "FACHAI: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "FACHAI: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "FACHAI: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "FACHAI"
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data.Url,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("FACHAI error in launching game", error);
    return res.status(200).json({
      success: false,
      message: {
        en: "FACHAI: Game launch failed. Please try again or customer service for assistance.",
        zh: "FACHAI: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "FACHAI: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "FACHAI: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "FACHAI: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/fachai/getbalance", async (req, res) => {
  try {
    const validationResult = validateRequest(req);
    if (validationResult.error) {
      return res.status(200).json(validationResult.response);
    }

    const { AgentCode, Params, Sign } = req.body;

    const decryptedParams = aesDecrypt(Params, fachaiSecret);
    if (!verifySignature(decryptedParams, Sign)) {
      return res.status(200).json({
        Result: 604,
        MainPoints: 0,
        ErrorText: "Verification failed",
      });
    }

    const originalPayload = JSON.parse(decryptedParams);

    const { Ts, MemberAccount, Currency, GameID } = originalPayload;

    const currentUser = await User.findOne(
      { gameId: MemberAccount },
      { wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(200).json({
        Result: 500,
        MainPoints: 0,
        ErrorText: "Player ID not exist",
      });
    }

    return res.status(200).json({
      Result: 0,
      MainPoints: roundToTwoDecimals(currentUser.wallet),
      ErrorText: "Success",
    });
  } catch (error) {
    console.error(
      "FACHAI: Error in game provider calling ae96 get balance api:",
      error.message
    );
    return res.status(200).json({
      Result: 999,
      MainPoints: 0,
      ErrorText: "Unknown errors",
    });
  }
});

router.post("/api/fachai/betninfo", async (req, res) => {
  try {
    const validationResult = validateRequest(req);
    if (validationResult.error) {
      return res.status(200).json(validationResult.response);
    }

    const { AgentCode, Params, Sign } = req.body;

    const decryptedParams = aesDecrypt(Params, fachaiSecret);
    if (!verifySignature(decryptedParams, Sign)) {
      return res.status(200).json({
        Result: 604,
        MainPoints: 0,
        ErrorText: "Verification failed",
      });
    }

    const originalPayload = JSON.parse(decryptedParams);

    const {
      RecordID,
      MemberAccount,
      BankID,
      GameID,
      GameType,
      Bet,
      Win,
      NetWin,
      RequireAmt,
    } = originalPayload;
    const [currentUser, existingTransaction] = await Promise.all([
      User.findOne(
        { gameId: MemberAccount },
        {
          username: 1,
          wallet: 1,
          "gameLock.fachaifish.lock": 1,
          "gameLock.fachaislot.lock": 1,
          _id: 1,
        }
      ).lean(),
      SlotFachaiModal.findOne({ betId: BankID }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        Result: 500,
        MainPoints: 0,
        ErrorText: "Player ID not exist",
      });
    }

    const isLocked =
      GameType === 1
        ? currentUser.gameLock?.fachaifish?.lock
        : currentUser.gameLock?.fachaislot?.lock;

    if (isLocked) {
      return res.status(200).json({
        Result: 407,
        ErrorText: "Account locked",
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        Result: 0,
        MainPoints: roundToTwoDecimals(currentUser.wallet),
        ErrorText: "Success",
      });
    }
    const requiredAmount = RequireAmt ? RequireAmt : Bet;

    const updatedUserBalancePromise = User.findOneAndUpdate(
      {
        gameId: MemberAccount,
        wallet: { $gte: roundToTwoDecimals(requiredAmount) },
      },
      { $inc: { wallet: roundToTwoDecimals(NetWin) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    const updatedUserBalance = await updatedUserBalancePromise;

    if (!updatedUserBalance) {
      const latestUser = await User.findOne(
        { gameId: MemberAccount },
        { wallet: 1 }
      ).lean();

      return res.status(200).json({
        Result: 203,
        MainPoints: roundToTwoDecimals(latestUser?.wallet || 0),
        ErrorText: "Insufficient Balance",
      });
    }

    const gameType = GameType === 1 ? "FISH" : "SLOT";

    SlotFachaiModal.create({
      betId: BankID,
      bet: true,
      settle: true,
      username: MemberAccount,
      betamount: roundToTwoDecimals(Bet),
      settleamount: roundToTwoDecimals(Win),
      ultimatesettleamount: roundToTwoDecimals(NetWin),
      gametype: gameType,
    }).catch((error) => {
      console.error("Error creating FACHAI transaction:", error.message);
    });

    return res.status(200).json({
      Result: 0,
      MainPoints: roundToTwoDecimals(updatedUserBalance.wallet),
      ErrorText: "Success",
    });
  } catch (error) {
    console.error(
      "FACHAI: Error in game provider calling ae96 betninfo api:",
      error.message
    );
    return res.status(200).json({
      Result: 999,
      MainPoints: 0,
      ErrorText: "Unknown errors",
    });
  }
});

router.post("/api/fachai/cancelbetninfo", async (req, res) => {
  try {
    const validationResult = validateRequest(req);
    if (validationResult.error) {
      return res.status(200).json(validationResult.response);
    }

    const { AgentCode, Params, Sign } = req.body;

    const decryptedParams = aesDecrypt(Params, fachaiSecret);
    if (!verifySignature(decryptedParams, Sign)) {
      return res.status(200).json({
        Result: 604,
        MainPoints: 0,
        ErrorText: "Verification failed",
      });
    }

    const originalPayload = JSON.parse(decryptedParams);

    const { MemberAccount, BankID, GameID } = originalPayload;

    const [currentUser, existingCancelBet, existingTransaction] =
      await Promise.all([
        User.findOne({ gameId: MemberAccount }, { wallet: 1, _id: 1 }).lean(),
        SlotFachaiModal.findOne(
          { betId: BankID, cancel: true },
          { _id: 1 }
        ).lean(),
        SlotFachaiModal.findOne(
          { betId: BankID },
          { ultimatesettleamount: 1 }
        ).lean(),
      ]);

    if (!currentUser) {
      return res.status(200).json({
        Result: 500,
        MainPoints: 0,
        ErrorText: "Player ID not exist",
      });
    }

    if (existingCancelBet) {
      return res.status(200).json({
        Result: 799,
        MainPoints: roundToTwoDecimals(currentUser.wallet),
        ErrorText: "Revert Cancel Bet",
      });
    }

    if (!existingTransaction) {
      return res.status(200).json({
        Result: 221,
        MainPoints: roundToTwoDecimals(currentUser.wallet),
        ErrorText: "Transaction ID number not exist",
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: MemberAccount },
        {
          $inc: {
            wallet: -roundToTwoDecimals(
              existingTransaction.ultimatesettleamount
            ),
          },
        },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
      SlotFachaiModal.findOneAndUpdate(
        { betId: BankID },
        { cancel: true },
        { new: false }
      ),
    ]);

    return res.status(200).json({
      Result: 0,
      MainPoints: roundToTwoDecimals(updatedUserBalance.wallet),
      ErrorText: "Success",
    });
  } catch (error) {
    console.error(
      "FACHAI: Error in game provider calling ae96 cancel betninfo api:",
      error.message
    );
    return res.status(200).json({
      Result: 999,
      MainPoints: 0,
      ErrorText: "Unknown errors",
    });
  }
});

router.post("/api/fachai/bet", async (req, res) => {
  try {
    const validationResult = validateRequest(req);
    if (validationResult.error) {
      return res.status(200).json(validationResult.response);
    }

    const { AgentCode, Params, Sign } = req.body;

    const decryptedParams = aesDecrypt(Params, fachaiSecret);
    if (!verifySignature(decryptedParams, Sign)) {
      return res.status(200).json({
        Result: 604,
        MainPoints: 0,
        ErrorText: "Verification failed",
      });
    }

    const originalPayload = JSON.parse(decryptedParams);

    const {
      RecordID,
      MemberAccount,
      BetID,
      GameID,
      GameType,
      Bet,
      CreateDate,
      Ts,
    } = originalPayload;

    const [currentUser, existingTransaction] = await Promise.all([
      User.findOne(
        { gameId: MemberAccount },
        {
          username: 1,
          wallet: 1,
          "gameLock.fachaifish.lock": 1,
          "gameLock.fachaislot.lock": 1,
        }
      ).lean(),
      SlotFachaiModal.findOne({ betId: BetID }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        Result: 500,
        MainPoints: 0,
        ErrorText: "Player ID not exist",
      });
    }

    const isLocked =
      GameType === 1
        ? currentUser.gameLock?.fachaifish?.lock
        : currentUser.gameLock?.fachaislot?.lock;

    if (isLocked) {
      return res.status(200).json({
        Result: 407,
        ErrorText: "Account locked",
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        Result: 0,
        MainPoints: roundToTwoDecimals(currentUser.wallet),
        ErrorText: "Success",
      });
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        gameId: MemberAccount,
        wallet: { $gte: roundToTwoDecimals(Bet) },
      },
      { $inc: { wallet: -roundToTwoDecimals(Bet) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      const latestUser = await User.findOne(
        { gameId: MemberAccount },
        { wallet: 1 }
      ).lean();

      return res.status(200).json({
        Result: 203,
        MainPoints: roundToTwoDecimals(latestUser?.wallet || 0),
        ErrorText: "Insufficient Balance",
      });
    }

    SlotFachaiModal.create({
      betId: BetID,
      username: MemberAccount,
      bet: true,
      betamount: roundToTwoDecimals(Bet),
      gametype: "SLOT",
    }).catch((error) => {
      console.error("Error creating transaction:", error.message);
    });

    return res.status(200).json({
      Result: 0,
      MainPoints: roundToTwoDecimals(updatedUserBalance.wallet),
      ErrorText: "Success",
    });
  } catch (error) {
    console.error(
      "FACHAI: Error in game provider calling ae96 bet api:",
      error.message
    );
    return res.status(200).json({
      Result: 999,
      MainPoints: 0,
      ErrorText: "Unknown errors",
    });
  }
});

router.post("/api/fachai/settle", async (req, res) => {
  try {
    const validationResult = validateRequest(req);
    if (validationResult.error) {
      return res.status(200).json(validationResult.response);
    }

    const { AgentCode, Params, Sign } = req.body;

    const decryptedParams = aesDecrypt(Params, fachaiSecret);
    if (!verifySignature(decryptedParams, Sign)) {
      return res.status(200).json({
        Result: 604,
        MainPoints: 0,
        ErrorText: "Verification failed",
      });
    }

    const originalPayload = JSON.parse(decryptedParams);

    const { MemberAccount, SettleBetIDs, Win, Bet, Refund, ValidBet } =
      originalPayload;

    const betID = SettleBetIDs[0].betID;

    const [currentUser, existingTransaction, existingSettledTransaction] =
      await Promise.all([
        User.findOne(
          { gameId: MemberAccount },
          { username: 1, wallet: 1, _id: 1 }
        ).lean(),
        SlotFachaiModal.findOne({ betId: betID }, { _id: 1 }).lean(),
        SlotFachaiModal.findOne(
          { betId: betID, $or: [{ cancel: true }, { settle: true }] },
          { _id: 1 }
        ).lean(),
      ]);

    if (!currentUser) {
      return res.status(200).json({
        Result: 500,
        MainPoints: 0,
        ErrorText: "Player ID not exist",
      });
    }

    if (!existingTransaction) {
      return res.status(200).json({
        Result: 221,
        MainPoints: roundToTwoDecimals(currentUser.wallet),
        ErrorText: "Transaction ID not exist",
      });
    }

    if (existingSettledTransaction) {
      return res.status(200).json({
        Result: 0,
        MainPoints: roundToTwoDecimals(currentUser.wallet),
        ErrorText: "Success",
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: MemberAccount },
        { $inc: { wallet: roundToTwoDecimals(Refund) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
      SlotFachaiModal.findOneAndUpdate(
        { betId: betID },
        {
          settle: true,
          betamount: roundToTwoDecimals(ValidBet),
          settleamount: roundToTwoDecimals(Win),
        },
        { new: false }
      ),
    ]);

    return res.status(200).json({
      Result: 0,
      MainPoints: roundToTwoDecimals(updatedUserBalance.wallet),
      ErrorText: "Success",
    });
  } catch (error) {
    console.error(
      "FACHAI: Error in game provider calling ae96 settle bet api:",
      error.message
    );
    return res.status(200).json({
      Result: 999,
      MainPoints: 0,
      ErrorText: "Unknown errors",
    });
  }
});

router.post("/api/fachai/cancelbet", async (req, res) => {
  try {
    const validationResult = validateRequest(req);
    if (validationResult.error) {
      return res.status(200).json(validationResult.response);
    }

    const { AgentCode, Params, Sign } = req.body;

    const decryptedParams = aesDecrypt(Params, fachaiSecret);
    if (!verifySignature(decryptedParams, Sign)) {
      return res.status(200).json({
        Result: 604,
        MainPoints: 0,
        ErrorText: "Verification failed",
      });
    }

    const originalPayload = JSON.parse(decryptedParams);

    const { MemberAccount, BetID, Bet } = originalPayload;

    const [currentUser, existingTransaction, existingSettledTransaction] =
      await Promise.all([
        User.findOne({ gameId: MemberAccount }, { wallet: 1 }).lean(),
        SlotFachaiModal.findOne({ betId: BetID }, { _id: 1 }).lean(),
        SlotFachaiModal.findOne(
          { betId: BetID, $or: [{ cancel: true }, { settle: true }] },
          { _id: 1 }
        ).lean(),
      ]);

    if (!currentUser) {
      return res.status(200).json({
        Result: 500,
        MainPoints: 0,
        ErrorText: "Player ID not exist",
      });
    }

    if (!existingTransaction) {
      return res.status(200).json({
        Result: 221,
        MainPoints: roundToTwoDecimals(currentUser.wallet),
        ErrorText: "Transaction ID not exist",
      });
    }

    if (existingSettledTransaction) {
      return res.status(200).json({
        Result: 0,
        MainPoints: roundToTwoDecimals(currentUser.wallet),
        ErrorText: "Success",
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: MemberAccount },
        { $inc: { wallet: roundToTwoDecimals(Bet) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
      SlotFachaiModal.findOneAndUpdate(
        { betId: BetID },
        { cancel: true },
        { new: false }
      ),
    ]);

    return res.status(200).json({
      Result: 0,
      MainPoints: roundToTwoDecimals(updatedUserBalance.wallet),
      ErrorText: "Success",
    });
  } catch (error) {
    console.error(
      "FACHAI: Error in game provider calling ae96 cancel bet api:",
      error.message
    );
    return res.status(200).json({
      Result: 999,
      MainPoints: 0,
      ErrorText: "Unknown errors",
    });
  }
});

router.post("/api/fachai/activity", async (req, res) => {
  try {
    const validationResult = validateRequest(req);
    if (validationResult.error) {
      return res.status(200).json(validationResult.response);
    }

    const { AgentCode, Params, Sign } = req.body;

    const decryptedParams = aesDecrypt(Params, fachaiSecret);
    if (!verifySignature(decryptedParams, Sign)) {
      return res.status(200).json({
        Result: 604,
        MainPoints: 0,
        ErrorText: "Verification failed",
      });
    }

    const originalPayload = JSON.parse(decryptedParams);

    const { List } = originalPayload;
    const memberAccount = List[0].memberAccount;
    const bankID = List[0].bankID;
    const points = List[0].points;

    const [currentUser, existingTransaction] = await Promise.all([
      User.findOne({ gameId: memberAccount }, { wallet: 1 }).lean(),
      SlotFachaiModal.findOne(
        { betId: bankID, status: "Award Success" },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        Result: 500,
        MainPoints: 0,
        ErrorText: "Player ID not exist",
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        Result: 0,
        MainPoints: roundToTwoDecimals(currentUser.wallet),
        ErrorText: "Success",
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: memberAccount },
        { $inc: { wallet: roundToTwoDecimals(points) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
      SlotFachaiModal.create({
        betId: bankID,
        status: "Award Success",
      }),
    ]);

    return res.status(200).json({
      Result: 0,
      MainPoints: roundToTwoDecimals(updatedUserBalance.wallet),
      ErrorText: "Success",
    });
  } catch (error) {
    console.error(
      "FACHAI: Error in game provider calling ae96 event api:",
      error.message
    );
    return res.status(200).json({
      Result: 999,
      MainPoints: 0,
      ErrorText: "Unknown errors",
    });
  }
});

router.post("/api/fachaislot/getturnoverforrebate", async (req, res) => {
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

    console.log("FACHAI SLOT QUERYING TIME", startDate, endDate);

    const records = await SlotFachaiModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "SLOT",
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
        console.warn(`FACHAI User not found for gameId: ${gameId}`);
        return;
      }

      if (!playerSummary[actualUsername]) {
        playerSummary[actualUsername] = { turnover: 0, winloss: 0 };
      }

      playerSummary[actualUsername].turnover += record.betamount || 0;

      playerSummary[actualUsername].winloss +=
        (record.settleamount || 0) - (record.betamount || 0);
    });
    Object.keys(playerSummary).forEach((playerId) => {
      playerSummary[playerId].turnover = Number(
        playerSummary[playerId].turnover.toFixed(2)
      );
      playerSummary[playerId].winloss = Number(
        playerSummary[playerId].winloss.toFixed(2)
      );
    });
    return res.status(200).json({
      success: true,
      summary: {
        gamename: "FACHAI",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("FACHAI: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "FACHAI: Failed to fetch win/loss report",
        zh: "FACHAI: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/fachaislot/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotFachaiModal.find({
        username: user.gameId,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "SLOT",
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
          gamename: "FACHAI",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("FACHAI: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "FACHAI: Failed to fetch win/loss report",
          zh: "FACHAI: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/fachaislot/:userId/gamedata",
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
          const gameCat = Object.fromEntries(gameCategories["Slot Games"]);

          if (gameCat["FACHAI"]) {
            totalTurnover += gameCat["FACHAI"].turnover || 0;
            totalWinLoss += gameCat["FACHAI"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "FACHAI",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("FACHAI: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "FACHAI: Failed to fetch win/loss report",
          zh: "FACHAI: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/fachaislot/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotFachaiModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "SLOT",
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
          gamename: "FACHAI",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("FACHAI: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "FACHAI: Failed to fetch win/loss report",
          zh: "FACHAI: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/fachaislot/kioskreport",
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
          const gameCat = Object.fromEntries(gameCategories["Slot Games"]);

          if (gameCat["FACHAI"]) {
            totalTurnover += Number(gameCat["FACHAI"].turnover || 0);
            totalWinLoss += Number(gameCat["FACHAI"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "FACHAI",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("FACHAI: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "FACHAI: Failed to fetch win/loss report",
          zh: "FACHAI: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ----------------
router.post("/api/fachaifish/getturnoverforrebate", async (req, res) => {
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

    console.log("FACHAI FISH QUERYING TIME", startDate, endDate);

    const records = await SlotFachaiModal.find({
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
        gamename: "FACHAI",
        gamecategory: "Fishing",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("FACHAI: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "FACHAI: Failed to fetch win/loss report",
        zh: "FACHAI: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/fachaifish/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotFachaiModal.find({
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
          gamename: "FACHAI",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("FACHAI: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "FACHAI: Failed to fetch win/loss report",
          zh: "FACHAI: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/fachaifish/:userId/gamedata",
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

          if (gameCat["FACHAI"]) {
            totalTurnover += gameCat["FACHAI"].turnover || 0;
            totalWinLoss += gameCat["FACHAI"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "FACHAI",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("FACHAI: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "FACHAI: Failed to fetch win/loss report",
          zh: "FACHAI: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/fachaifish/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotFachaiModal.find({
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
          gamename: "FACHAI",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("FACHAI: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "FACHAI: Failed to fetch win/loss report",
          zh: "FACHAI: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/fachaifish/kioskreport",
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

          if (gameCat["FACHAI"]) {
            totalTurnover += Number(gameCat["FACHAI"].turnover || 0);
            totalWinLoss += Number(gameCat["FACHAI"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "FACHAI",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("FACHAI: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "FACHAI: Failed to fetch win/loss report",
          zh: "FACHAI: 获取盈亏报告失败",
        },
      });
    }
  }
);

module.exports = router;
