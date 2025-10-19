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
const SlotFachaiModal = require("../../models/slot_fachai.model");
const GameWalletLog = require("../../models/gamewalletlog.model");
const GameFachaiGameModal = require("../../models/slot_fachaiDatabase.model");
require("dotenv").config();

//Staging
const fachaiSecret = process.env.FACHAI_SECRET;
const fachaiCode = "OCOC";
const webURL = "https://www.oc7.me/";
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

// router.post("/api/fachai/update-hot-games", async (req, res) => {
//   try {
//     // Your hot game IDs list in priority order
//     const hotGameIds = [
//       "22064",
//       "22047",
//       "22063",
//       "22071",
//       "22040",
//       "22057",
//       "22041",
//       "22054",
//       "22061",
//       "22020",
//       "21009",
//       "22043",
//       "22049",
//       "22067",
//       "22072",
//       "22053",
//       "22060",
//       "22055",
//       "22062",
//       "22018",
//     ];

//     console.log(`Processing ${hotGameIds.length} hot Fachai games...`);

//     // First, set all games hot = false
//     await GameFachaiGameModal.updateMany({}, { $set: { hot: false } });

//     // Update each hot game with createdAt based on their position in the list
//     const updateResults = [];
//     const baseTime = new Date(); // Current time for the #1 game

//     // Process all hot games
//     for (let i = 0; i < hotGameIds.length; i++) {
//       const gameId = hotGameIds[i];

//       // Calculate createdAt: #1 game = latest time, each subsequent game is 30 minutes earlier
//       const createdAtTime = new Date(baseTime.getTime() - i * 30 * 60 * 1000);

//       try {
//         // Use MongoDB collection directly to bypass Mongoose timestamps
//         const updateResult = await GameFachaiGameModal.collection.updateOne(
//           { gameID: gameId },
//           {
//             $set: {
//               hot: true,
//               createdAt: createdAtTime,
//               updatedAt: new Date(),
//             },
//           }
//         );

//         updateResults.push({
//           position: i + 1,
//           gameId: gameId,
//           createdAt: createdAtTime.toISOString(),
//           hot: true,
//           matched: updateResult.matchedCount > 0,
//           updated: updateResult.modifiedCount > 0,
//         });

//         console.log(
//           `#${i + 1} - ${gameId} - ${createdAtTime.toISOString()} - ${
//             updateResult.matchedCount > 0 ? "FOUND" : "NOT FOUND"
//           } - Hot: true`
//         );
//       } catch (error) {
//         console.error(`Error updating game ${gameId}:`, error);
//         updateResults.push({
//           position: i + 1,
//           gameId: gameId,
//           createdAt: createdAtTime.toISOString(),
//           hot: true,
//           matched: false,
//           updated: false,
//           error: error.message,
//         });
//       }
//     }

//     // Count results
//     const totalMatched = updateResults.filter((r) => r.matched).length;
//     const totalUpdated = updateResults.filter((r) => r.updated).length;
//     const notFound = updateResults.filter((r) => !r.matched);

//     console.log(
//       `Update complete: ${totalUpdated}/${hotGameIds.length} hot games updated`
//     );

//     return res.status(200).json({
//       success: true,
//       message: `Updated ${totalUpdated} Fachai hot games with new createdAt times`,
//       summary: {
//         totalHotGames: hotGameIds.length,
//         totalFoundInDB: totalMatched,
//         totalUpdated: totalUpdated,
//         notFoundInDB: hotGameIds.length - totalMatched,
//         allOtherGamesSetToNotHot: true,
//       },
//       updateResults: updateResults,
//       gamesNotFound: notFound.map((g) => ({
//         position: g.position,
//         gameId: g.gameId,
//       })),
//       timeRange: {
//         earliest: new Date(
//           baseTime.getTime() - (hotGameIds.length - 1) * 30 * 60 * 1000
//         ).toISOString(),
//         latest: baseTime.toISOString(),
//         intervalMinutes: 30,
//       },
//     });
//   } catch (error) {
//     console.error("Update Fachai hot games error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error updating Fachai hot games",
//       error: error.message,
//     });
//   }
// });

// router.post("/api/fachai/comparegames", async (req, res) => {
//   try {
//     // Get games from API
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

//     // Fetch API games and database games in parallel
//     const [apiResponse, dbGames] = await Promise.all([
//       axios.post(`${fachaiAPIURL}/GetGameIconList`, requestBody, {
//         headers: {
//           "Content-Type": "application/x-www-form-urlencoded",
//         },
//       }),
//       GameFachaiGameModal.find(
//         {},
//         { gameID: 1, gameNameEN: 1, gameType: 1, _id: 0 }
//       ).lean(),
//     ]);

//     if (apiResponse.data.Result !== 0) {
//       return res.status(200).json({
//         success: false,
//         message: "Fachai API error",
//         error: `API returned result code: ${apiResponse.data.Result}`,
//       });
//     }

//     // Extract all game IDs from API response (all categories)
//     const apiGameCodes = new Set();
//     const apiGamesDetails = [];
//     const gameIconList = apiResponse.data.GetGameIconList;

//     // Process each category: fishing, arcade, slot, table
//     ["fishing", "arcade", "slot", "table"].forEach((category) => {
//       if (gameIconList[category]) {
//         Object.keys(gameIconList[category]).forEach((gameId) => {
//           const game = gameIconList[category][gameId];
//           apiGameCodes.add(gameId);
//           apiGamesDetails.push({
//             gameId: gameId,
//             category: category,
//             status: game.status,
//             gameNameEN: game.gameNameOfEnglish,
//             gameNameCN: game.gameNameOfChinese,
//             cnUrl: game.cnUrl,
//             enUrl: game.enUrl,
//           });
//         });
//       }
//     });

//     const dbGameIDs = new Set(dbGames.map((game) => game.gameID));

//     // Find differences
//     const missingInDB = [...apiGameCodes].filter(
//       (code) => !dbGameIDs.has(code)
//     );
//     const extraInDB = [...dbGameIDs].filter((id) => !apiGameCodes.has(id));

//     console.log(`API Games: ${apiGameCodes.size}, DB Games: ${dbGameIDs.size}`);
//     console.log(
//       `Missing in DB: ${missingInDB.length}, Extra in DB: ${extraInDB.length}`
//     );

//     // Update maintenance status
//     const [setMaintenanceTrue, setMaintenanceFalse] = await Promise.all([
//       // Set maintenance = true for games NOT in API (extra in DB)
//       GameFachaiGameModal.updateMany(
//         { gameID: { $in: extraInDB } },
//         { $set: { maintenance: true } }
//       ),
//       // Set maintenance = false for games that exist in API
//       GameFachaiGameModal.updateMany(
//         { gameID: { $in: [...apiGameCodes] } },
//         { $set: { maintenance: false } }
//       ),
//     ]);

//     // Get details for missing games
//     const missingGamesDetails = apiGamesDetails
//       .filter((game) => missingInDB.includes(game.gameId))
//       .map((game) => ({
//         gameId: game.gameId,
//         category: game.category,
//         gameNameEN: game.gameNameEN,
//         gameNameCN: game.gameNameCN,
//         status: game.status,
//         cnUrl: game.cnUrl,
//         enUrl: game.enUrl,
//       }));

//     // Get details for extra games
//     const extraGamesDetails = dbGames
//       .filter((game) => extraInDB.includes(game.gameID))
//       .map((game) => ({
//         gameID: game.gameID,
//         gameNameEN: game.gameNameEN,
//         gameType: game.gameType,
//       }));

//     // Group missing games by category for easier viewing
//     const missingByCategory = {
//       fishing: missingGamesDetails.filter((g) => g.category === "fishing")
//         .length,
//       arcade: missingGamesDetails.filter((g) => g.category === "arcade").length,
//       slot: missingGamesDetails.filter((g) => g.category === "slot").length,
//       table: missingGamesDetails.filter((g) => g.category === "table").length,
//     };

//     return res.status(200).json({
//       success: true,
//       summary: {
//         totalAPIGames: apiGameCodes.size,
//         totalDBGames: dbGameIDs.size,
//         missingInDB: missingInDB.length,
//         extraInDB: extraInDB.length,
//         matching: apiGameCodes.size - missingInDB.length,
//         missingByCategory: missingByCategory,
//       },
//       maintenanceUpdates: {
//         setToMaintenance: setMaintenanceTrue.modifiedCount,
//         setToActive: setMaintenanceFalse.modifiedCount,
//       },
//       missingInDatabase: missingGamesDetails,
//       extraInDatabase: extraGamesDetails,
//       apiCategories: {
//         fishing: gameIconList.fishing
//           ? Object.keys(gameIconList.fishing).length
//           : 0,
//         arcade: gameIconList.arcade
//           ? Object.keys(gameIconList.arcade).length
//           : 0,
//         slot: gameIconList.slot ? Object.keys(gameIconList.slot).length : 0,
//         table: gameIconList.table ? Object.keys(gameIconList.table).length : 0,
//       },
//     });
//   } catch (error) {
//     console.error("Fachai compare games error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error comparing Fachai games",
//       error: error.message,
//     });
//   }
// });

router.post("/api/fachai/getprovidergamelist", async (req, res) => {
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

    return res.status(200).json({
      success: true,
      gameLobby: response.data,
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
        },
      });
    }

    // Transform data into the desired format
    const reformattedGamelist = games.map((game) => ({
      GameCode: game.gameID,
      GameNameEN: game.gameNameEN,
      GameNameZH: game.gameNameCN,
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
      },
    });
  }
});

router.post("/api/fachai/launchGame", authenticateToken, async (req, res) => {
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
        },
      });
    }

    if (user.gameLock.fachai.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
          zh_hk: "您的遊戲訪問已被鎖定，請聯絡客服以獲取進一步幫助。",
        },
      });
    }

    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();

    // gameLang ===1  or 2
    const { gameLang, gameCode } = req.body;

    let lang = 2;

    if (gameLang === "en") {
      lang = 1;
    } else if (gameLang === "zh") {
      lang = 2;
    } else if (gameLang === "ms") {
      lang = 5;
    }

    const payload = {
      MemberAccount: user.userServerId,
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
      },
    });
  }
});

router.post("/api/fachai/getBalance", async (req, res) => {
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
      { userServerId: MemberAccount },
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

router.post("/api/fachai/betNInfo", async (req, res) => {
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
        { userServerId: MemberAccount },
        {
          username: 1,
          wallet: 1,
          "gameLock.fachai.lock": 1,
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

    if (currentUser.gameLock?.fachai?.lock) {
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
        userServerId: MemberAccount,
        wallet: { $gte: roundToTwoDecimals(requiredAmount) },
      },
      { $inc: { wallet: roundToTwoDecimals(NetWin || 0) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    const updatedUserBalance = await updatedUserBalancePromise;

    if (!updatedUserBalance) {
      const latestUser = await User.findOne(
        { userServerId: MemberAccount },
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
      username: currentUser.username,
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

router.post("/api/fachai/cancelBetNInfo", async (req, res) => {
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
        User.findOne(
          { userServerId: MemberAccount },
          { wallet: 1, _id: 1 }
        ).lean(),
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
        { userServerId: MemberAccount },
        {
          $inc: {
            wallet: -roundToTwoDecimals(
              existingTransaction.ultimatesettleamount || 0
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
        { userServerId: MemberAccount },
        { username: 1, wallet: 1, "gameLock.fachai.lock": 1 }
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

    if (currentUser.gameLock?.fachai?.lock) {
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
        userServerId: MemberAccount,
        wallet: { $gte: roundToTwoDecimals(Bet) },
      },
      { $inc: { wallet: -roundToTwoDecimals(Bet || 0) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      const latestUser = await User.findOne(
        { userServerId: MemberAccount },
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
      username: currentUser.username,
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
          { userServerId: MemberAccount },
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
        { userServerId: MemberAccount },
        { $inc: { wallet: roundToTwoDecimals(Refund || 0) } },
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

router.post("/api/fachai/cancelBet", async (req, res) => {
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
        User.findOne({ userServerId: MemberAccount }, { wallet: 1 }).lean(),
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
        { userServerId: MemberAccount },
        { $inc: { wallet: roundToTwoDecimals(Bet || 0) } },
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
      User.findOne({ userServerId: memberAccount }, { wallet: 1 }).lean(),
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
        { userServerId: memberAccount },
        { $inc: { wallet: roundToTwoDecimals(points || 0) } },
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

    const records = await SlotFachaiModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "SLOT",
      cancel: { $ne: true },
      settle: true,
    });

    let playerSummary = {};

    records.forEach((record) => {
      const username = record.username.toLowerCase();

      if (!playerSummary[username]) {
        playerSummary[username] = { turnover: 0, winloss: 0 };
      }

      playerSummary[username].turnover += record.betamount || 0;

      playerSummary[username].winloss +=
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
        username: user.username,
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

    const records = await SlotFachaiModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "FISH",
      cancel: { $ne: true },
      settle: true,
    });

    let playerSummary = {};

    records.forEach((record) => {
      const username = record.username.toLowerCase();

      if (!playerSummary[username]) {
        playerSummary[username] = { turnover: 0, winloss: 0 };
      }

      playerSummary[username].turnover += record.betamount || 0;

      playerSummary[username].winloss +=
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
        username: user.username,
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
