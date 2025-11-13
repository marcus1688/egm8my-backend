const express = require("express");
const router = express.Router();
const axios = require("axios");
const moment = require("moment");
const crypto = require("crypto");
const CryptoJS = require("crypto-js");
const { authenticateToken } = require("../../auth/auth");
const { authenticateAdminToken } = require("../../auth/adminAuth");
const {
  User,
  adminUserWalletLog,
  GameDataLog,
} = require("../../models/users.model");
const { adminUser, adminLog } = require("../../models/adminuser.model");
const GameWalletLog = require("../../models/gamewalletlog.model");
const Decimal = require("decimal.js");
const GameRSGGameModal = require("../../models/slot_rsgDatabase.model");
const SlotRSGModal = require("../../models/slot_rsg.model");
require("dotenv").config();

const webURL = "http://egm8my.vip/";
const rsgAPIURL = "http://tsegm8-api.royalgaming777.com/SingleWallet";
const rsgAccount = "6op3qc6uk93l";
const rsgSecret = process.env.RSG_SECRET;
const rsgDesKey = process.env.RSG_DESKEY;
const rsgDesIV = process.env.RSG_DESIV;
const rsgSystemCode = "EGM8";

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

function encryptDES(data, key, iv) {
  const keyHex = CryptoJS.enc.Utf8.parse(key);
  const ivHex = CryptoJS.enc.Utf8.parse(iv);

  const encrypted = CryptoJS.DES.encrypt(data, keyHex, {
    iv: ivHex,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return encrypted.toString();
}

function decryptDES(encryptedData, key, iv) {
  const keyHex = CryptoJS.enc.Utf8.parse(key);
  const ivHex = CryptoJS.enc.Utf8.parse(iv);

  const decrypted = CryptoJS.DES.decrypt(encryptedData, keyHex, {
    iv: ivHex,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return decrypted.toString(CryptoJS.enc.Utf8);
}

// Generate MD5 Signature
function generateMD5Signature(
  clientId,
  clientSecret,
  timestamp,
  encryptedData
) {
  const signatureString = `${clientId}${clientSecret}${timestamp}${encryptedData}`;
  return crypto.createHash("md5").update(signatureString).digest("hex");
}

async function registerRSGUser(user) {
  try {
    const timestamp = Math.floor(Date.now() / 1000);

    const payload = {
      SystemCode: rsgSystemCode,
      WebId: "EGM8MY",
      UserId: user.gameId,
      Currency: "MYR",
    };

    const jsonData = JSON.stringify(payload);

    const encryptedData = encryptDES(jsonData, rsgDesKey, rsgDesIV);

    const signature = generateMD5Signature(
      rsgAccount,
      rsgSecret,
      timestamp,
      encryptedData
    );

    const response = await axios.post(
      `${rsgAPIURL}/Player/CreatePlayer`,
      `Msg=${encryptedData}`, // Body format: Msg=encryptedData (no quotes)
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-API-ClientID": rsgAccount,
          "X-API-Signature": signature,
          "X-API-Timestamp": timestamp.toString(),
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      }
    );
    const decryptedResponse = decryptDES(response.data, rsgDesKey, rsgDesIV);

    const responseData = JSON.parse(decryptedResponse);

    if (responseData.ErrorCode !== 0) {
      console.log(responseData, "error registering rsg");
      if (responseData.ErrorCode === 1002) {
        return {
          success: false,
          error: responseData,
          maintenance: true,
        };
      }

      return {
        success: false,
        error: responseData,
        maintenance: false,
      };
    }
    return {
      success: true,
      data: responseData,
      maintenance: false,
    };
  } catch (error) {
    console.log(error, "error registering rsg");
    return {
      success: false,
      error: error.responseData,
      maintenance: false,
    };
  }
}

// async function updateBTGamingManualOrderTimestampsPlus() {
//   try {
//     // List of gameIDs in order (AB1541 = latest, AB1501 = oldest)
//     const gameIds = [
//       "121",
//       "117",
//       "19",
//       "128",
//       "112",
//       "118",
//       "123",
//       "116",
//       "3001",
//       "127",
//       "3002",
//       "125",
//       "52",
//       "111",
//       "122",
//       "100",
//       "114",
//       "30",
//       "59",
//       "51",
//       "5",
//       "126",
//       "1",
//       "120",
//       "55",
//       "8",
//       "41",
//       "24",
//       "82",
//       "6",
//       "90",
//       "61",
//       "27",
//       "21",
//       "81",
//       "2001",
//       "26",
//       "119",
//       "16",
//       "43",
//       "25",
//       "70",
//       "40",
//       "78",
//       "113",
//       "3",
//       "28",
//       "4",
//       "15",
//       "11",
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
//       const result = await GameRSGGameModal.collection.updateOne(
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
//     const updatedGames = await GameRSGGameModal.find(
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

router.post("/api/rsg/getprovidergamelist", async (req, res) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);

    const payload = {
      SystemCode: rsgSystemCode,
    };

    const jsonData = JSON.stringify(payload);

    const encryptedData = encryptDES(jsonData, rsgDesKey, rsgDesIV);

    const signature = generateMD5Signature(
      rsgAccount,
      rsgSecret,
      timestamp,
      encryptedData
    );

    const response = await axios.post(
      `${rsgAPIURL}/Game/GameList`,
      `Msg=${encryptedData}`, // Body format: Msg=encryptedData (no quotes)
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-API-ClientID": rsgAccount,
          "X-API-Signature": signature,
          "X-API-Timestamp": timestamp.toString(),
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      }
    );
    const decryptedResponse = decryptDES(response.data, rsgDesKey, rsgDesIV);

    const responseData = JSON.parse(decryptedResponse);

    return res.status(200).json({
      success: true,
      gameLobby: responseData,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.error("M9BET login error:", error);
    return res.status(200).json({
      success: false,
      message: {
        en: "M9BET: Game launch failed. Please try again or customer service for assistance.",
        zh: "M9BET: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "M9BET: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "M9BET: 遊戲開唔到，老闆試多次或者搵客服幫手。",
        id: "M9BET: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/rsg/comparegame", async (req, res) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);

    const payload = {
      SystemCode: rsgSystemCode,
    };

    const jsonData = JSON.stringify(payload);
    const encryptedData = encryptDES(jsonData, rsgDesKey, rsgDesIV);
    const signature = generateMD5Signature(
      rsgAccount,
      rsgSecret,
      timestamp,
      encryptedData
    );

    const response = await axios.post(
      `${rsgAPIURL}/Game/GameList`,
      `Msg=${encryptedData}`,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-API-ClientID": rsgAccount,
          "X-API-Signature": signature,
          "X-API-Timestamp": timestamp.toString(),
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      }
    );

    const decryptedResponse = decryptDES(response.data, rsgDesKey, rsgDesIV);
    const responseData = JSON.parse(decryptedResponse);

    if (responseData.ErrorCode !== 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: `RSG: ${responseData.ErrorMessage}`,
          zh: `RSG: ${responseData.ErrorMessage}`,
        },
      });
    }

    const providerGames = responseData.Data.GameList;

    // Get all games from database
    const dbGames = await GameRSGGameModal.find(
      {},
      { gameID: 1, gameNameEN: 1, maintenance: 1, _id: 1 }
    ).lean();

    // Create sets for comparison
    const providerGameIds = new Set(
      providerGames.map((game) => game.GameId.toString())
    );
    const dbGameIds = new Set(dbGames.map((game) => game.gameID));

    // Find missing games (in provider but not in database)
    const missingGames = providerGames
      .filter((game) => !dbGameIds.has(game.GameId.toString()))
      .map((game) => ({
        gameId: game.GameId,
        gameNameEN: game.GameName.en_US || game.GameName.en_MY,
        gameNameCN: game.GameName.zh_CN,
        gameNameHK: game.GameName.zh_TW,
        gameNameID: game.GameName.id_ID,
        gameType: game.GameType === 1 ? "SLOT" : "OTHER",
        gameStatus: game.GameStatus,
      }));

    // Find extra games (in database but not in provider) - set maintenance to true
    const extraGameIds = Array.from(dbGameIds).filter(
      (id) => !providerGameIds.has(id)
    );

    // Update extra games to maintenance mode
    if (extraGameIds.length > 0) {
      await GameRSGGameModal.updateMany(
        { gameID: { $in: extraGameIds } },
        { $set: { maintenance: true } }
      );
    }

    // Get details of extra games for response
    const extraGames = dbGames
      .filter((game) => extraGameIds.includes(game.gameID))
      .map((game) => ({
        gameId: game.gameID,
        gameNameEN: game.gameNameEN,
        maintenanceSet: true,
      }));

    return res.status(200).json({
      success: true,
      summary: {
        totalProviderGames: providerGames.length,
        totalDbGames: dbGames.length,
        missingInDb: missingGames.length,
        extraInDb: extraGames.length,
        maintenanceUpdated: extraGames.length,
      },
      missingGames: missingGames,
      extraGames: extraGames,
      message: {
        en: `Game list retrieved successfully. ${missingGames.length} games missing in database, ${extraGames.length} games set to maintenance.`,
        zh: `游戏列表检索成功。数据库中缺少 ${missingGames.length} 个游戏，${extraGames.length} 个游戏已设置为维护模式。`,
      },
    });
  } catch (error) {
    console.error("RSG get game list error:", error);
    return res.status(200).json({
      success: false,
      message: {
        en: "RSG: Game list retrieval failed. Please try again or contact customer service for assistance.",
        zh: "RSG: 游戏列表检索失败，请重试或联系客服以获得帮助。",
      },
    });
  }
});

router.post("/api/rsg/getgamelist", async (req, res) => {
  try {
    const games = await GameRSGGameModal.find({
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
      GameNameID: game.gameNameID,
      GameNameMS: game.gameNameMS,
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
    console.error("RSG Error fetching game list:", error);
    return res.status(200).json({
      success: false,
      message: {
        en: "RSG: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "RSG: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "RSG: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "RSG: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "RSG: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/rsg/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, gameCode } = req.body;
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found. Please try again or contact customer service for assistance.",
          zh: "用户未找到，请重试或联系客服以获取帮助。",
          ms: "Pengguna tidak ditemui, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "搵唔到用戶，麻煩再試多次或者聯絡客服幫手。",
          id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    if (user.gameLock?.rsg?.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
          zh_hk: "老闆你嘅遊戲訪問已經被鎖定咗，麻煩聯絡客服獲取進一步幫助。",
          id: "Akses permainan Anda telah dikunci. Silakan hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }

    if (!user.rsgRegistered) {
      const registeredData = await registerRSGUser(user);

      if (!registeredData.success) {
        console.log(`RSG error in registering account ${registeredData}`);

        if (registeredData.maintenance) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Game under maintenance. Please try again later.",
              zh: "游戏正在维护中，请稍后再试。",
              ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
              zh_hk: "遊戲而家維護緊，老闆遲啲再試下。",
              id: "Permainan sedang dalam pemeliharaan. Silakan coba lagi nanti.",
            },
          });
        }

        return res.status(200).json({
          success: false,
          message: {
            en: "RSG: Game launch failed. Please try again or customer service for assistance.",
            zh: "RSG: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "RSG: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "RSG: 遊戲開唔到，老闆試多次或者搵客服幫手。",
            id: "RSG: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      await User.findOneAndUpdate(
        { username: user.username },
        {
          $set: {
            rsgRegistered: true,
          },
        }
      );
    }

    lang = "en-US";

    if (gameLang === "en") {
      lang = "en-US";
    } else if (gameLang === "zh") {
      lang = "zh-CN";
    } else if (gameLang === "ms") {
      lang = "ms-MY";
    } else if (gameLang === "id") {
      lang = "id-ID";
    } else if (gameLang === "zh_hk") {
      lang = "zh-TW";
    }

    const timestamp = Math.floor(Date.now() / 1000);

    const payload = {
      SystemCode: rsgSystemCode,
      WebId: "EGM8MY",
      UserId: user.gameId,
      UserName: user.username,
      GameId: parseFloat(gameCode),
      Currency: "MYR",
      Language: lang,
      ExitAction: webURL,
    };
    const jsonData = JSON.stringify(payload);

    const encryptedData = encryptDES(jsonData, rsgDesKey, rsgDesIV);

    const signature = generateMD5Signature(
      rsgAccount,
      rsgSecret,
      timestamp,
      encryptedData
    );

    const response = await axios.post(
      `${rsgAPIURL}/Player/GetURLToken`,
      `Msg=${encryptedData}`, // Body format: Msg=encryptedData (no quotes)
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-API-ClientID": rsgAccount,
          "X-API-Signature": signature,
          "X-API-Timestamp": timestamp.toString(),
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      }
    );
    const decryptedResponse = decryptDES(response.data, rsgDesKey, rsgDesIV);

    const responseData = JSON.parse(decryptedResponse);
    if (responseData.ErrorCode !== 0) {
      if (responseData.ErrorCode === 1002) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Game under maintenance. Please try again later.",
            zh: "游戏正在维护中，请稍后再试。",
            ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
            zh_hk: "遊戲而家維護緊，老闆遲啲再試下。",
            id: "Permainan sedang dalam pemeliharaan. Silakan coba lagi nanti.",
          },
        });
      }
      console.log(responseData, "error launching rsg game");
      return res.status(200).json({
        success: false,
        message: {
          en: "RSG: Game launch failed. Please try again or customer service for assistance.",
          zh: "RSG: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "RSG: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "RSG: 遊戲開唔到，老闆試多次或者搵客服幫手。",
          id: "RSG: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "RSG"
    );

    return res.status(200).json({
      success: true,
      gameLobby: responseData.Data.URL,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.error("M9BET login error:", error);
    return res.status(200).json({
      success: false,
      message: {
        en: "RSG: Game launch failed. Please try again or customer service for assistance.",
        zh: "RSG: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "RSG: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "RSG: 遊戲開唔到，老闆試多次或者搵客服幫手。",
        id: "RSG: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/rsg/GetBalance", async (req, res) => {
  try {
    const decryptedRequest = decryptDES(req.body.Msg, rsgDesKey, rsgDesIV);
    const requestData = JSON.parse(decryptedRequest);

    const { SystemCode, WebId, UserId, Currency } = requestData;

    if (!SystemCode || !WebId || !UserId || !Currency) {
      const errorResponse = {
        ErrorCode: 2001,
        ErrorMessage: "Illegal arguments.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    if (SystemCode !== rsgSystemCode || WebId !== "EGM8MY") {
      const errorResponse = {
        ErrorCode: 2001,
        ErrorMessage: "Illegal arguments.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    const currentUser = await User.findOne(
      { gameId: UserId },
      { wallet: 1, _id: 1 }
    ).lean();
    if (!currentUser) {
      const errorResponse = {
        ErrorCode: 4001,
        ErrorMessage: "The player's currency doesn't exist.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    const successResponse = {
      ErrorCode: 0,
      ErrorMessage: "OK",
      Timestamp: Math.floor(Date.now() / 1000),
      Data: {
        Balance: roundToTwoDecimals(currentUser.wallet),
      },
    };

    const encryptedResponse = encryptDES(
      JSON.stringify(successResponse),
      rsgDesKey,
      rsgDesIV
    );

    return res.status(200).send(encryptedResponse);
  } catch (error) {
    console.error(
      "RSG: Error in game provider calling get balance api:",
      error.message
    );
    const errorResponse = {
      ErrorCode: 1001,
      ErrorMessage: "Execute failed.",
      Timestamp: Math.floor(Date.now() / 1000),
    };

    try {
      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );
      return res.status(200).send(encryptedResponse);
    } catch (encryptError) {
      console.error("RSG GetBalance encryption error:", encryptError);
      return res.status(500).send("System error");
    }
  }
});

router.post("/api/rsg/Bet", async (req, res) => {
  try {
    const decryptedRequest = decryptDES(req.body.Msg, rsgDesKey, rsgDesIV);
    const requestData = JSON.parse(decryptedRequest);

    const {
      SystemCode,
      WebId,
      UserId,
      TransactionID,
      Currency,
      GameId,
      SequenNumber,
      Amount,
      BelongSequenNumber,
    } = requestData;

    if (
      !WebId ||
      !SystemCode ||
      !SequenNumber ||
      !UserId ||
      !TransactionID ||
      Amount === null ||
      Amount === undefined
    ) {
      const errorResponse = {
        ErrorCode: 2001,
        ErrorMessage: "Illegal arguments.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    if (SystemCode !== rsgSystemCode || WebId !== "EGM8MY") {
      const errorResponse = {
        ErrorCode: 2001,
        ErrorMessage: "Illegal arguments.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    const [currentUser, existingTransaction] = await Promise.all([
      User.findOne(
        { gameId: UserId },
        {
          username: 1,
          wallet: 1,
          "gameLock.rsg.lock": 1,
        }
      ).lean(),
      SlotRSGModal.findOne({ betId: SequenNumber }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      const errorResponse = {
        ErrorCode: 4001,
        ErrorMessage: "The player's currency doesn't exist.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    if (currentUser.gameLock?.rsg?.lock) {
      const errorResponse = {
        ErrorCode: 1001,
        ErrorMessage: "Execute failed.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    if (existingTransaction) {
      const errorResponse = {
        ErrorCode: 4002,
        ErrorMessage: "Duplicate SequenNumber.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        gameId: UserId,
        wallet: { $gte: roundToTwoDecimals(Amount) },
      },
      { $inc: { wallet: -roundToTwoDecimals(Amount) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      const errorResponse = {
        ErrorCode: 4003,
        ErrorMessage: "Balance is not enough.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    await SlotRSGModal.create({
      username: UserId,
      betId: SequenNumber,
      uniquebetId: TransactionID,
      bet: true,
      betamount: roundToTwoDecimals(Amount),
      gametype: "SLOT",
    });

    const successResponse = {
      ErrorCode: 0,
      ErrorMessage: "OK",
      Timestamp: Math.floor(Date.now() / 1000),
      Data: {
        Balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
    };

    const encryptedResponse = encryptDES(
      JSON.stringify(successResponse),
      rsgDesKey,
      rsgDesIV
    );

    return res.status(200).send(encryptedResponse);
  } catch (error) {
    console.error(
      "RSG: Error in game provider calling bet api:",
      error.message
    );
    const errorResponse = {
      ErrorCode: 1001,
      ErrorMessage: "Execute failed.",
      Timestamp: Math.floor(Date.now() / 1000),
    };

    try {
      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );
      return res.status(200).send(encryptedResponse);
    } catch (encryptError) {
      console.error("RSG GetBalance encryption error:", encryptError);
      return res.status(500).send("System error");
    }
  }
});

router.post("/api/rsg/BetResult", async (req, res) => {
  try {
    const decryptedRequest = decryptDES(req.body.Msg, rsgDesKey, rsgDesIV);
    const requestData = JSON.parse(decryptedRequest);

    const {
      SystemCode,
      WebId,
      UserId,
      TransactionID,
      Currency,
      GameId,
      SequenNumber,
      Amount,
      BelongSequenNumber,
      BetAmount,
    } = requestData;

    if (
      !WebId ||
      !SystemCode ||
      !SequenNumber ||
      !UserId ||
      !TransactionID ||
      Amount === null ||
      Amount === undefined
    ) {
      const errorResponse = {
        ErrorCode: 2001,
        ErrorMessage: "Illegal arguments.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    const [currentUser, existingTransaction, existingSettledTransaction] =
      await Promise.all([
        User.findOne(
          { gameId: UserId },
          { username: 1, wallet: 1, _id: 1 }
        ).lean(),
        SlotRSGModal.findOne({ betId: SequenNumber }, { _id: 1 }).lean(),
        SlotRSGModal.findOne(
          { betId: SequenNumber, $or: [{ cancel: true }, { settle: true }] },
          { _id: 1 }
        ).lean(),
      ]);

    if (!currentUser) {
      const errorResponse = {
        ErrorCode: 4001,
        ErrorMessage: "The player's currency doesn't exist.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    if (!existingTransaction) {
      const errorResponse = {
        ErrorCode: 4004,
        ErrorMessage: "The SequenNumber doesn't exist.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    if (existingSettledTransaction) {
      const errorResponse = {
        ErrorCode: 4005,
        ErrorMessage: "This SequenNumber has been settled.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: UserId },
        { $inc: { wallet: roundToTwoDecimals(Amount) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
      SlotRSGModal.findOneAndUpdate(
        { betId: SequenNumber },
        {
          settle: true,
          settleamount: roundToTwoDecimals(Amount),
          uniquesettlementId: TransactionID,
          mainbetId: BelongSequenNumber,
        },
        { new: false }
      ),
    ]);

    const successResponse = {
      ErrorCode: 0,
      ErrorMessage: "OK",
      Timestamp: Math.floor(Date.now() / 1000),
      Data: {
        Balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
    };

    const encryptedResponse = encryptDES(
      JSON.stringify(successResponse),
      rsgDesKey,
      rsgDesIV
    );

    return res.status(200).send(encryptedResponse);
  } catch (error) {
    console.error(
      "RSG: Error in game provider calling settle api:",
      error.message
    );
    const errorResponse = {
      ErrorCode: 1001,
      ErrorMessage: "Execute failed.",
      Timestamp: Math.floor(Date.now() / 1000),
    };

    try {
      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );
      return res.status(200).send(encryptedResponse);
    } catch (encryptError) {
      console.error("RSG GetBalance encryption error:", encryptError);
      return res.status(500).send("System error");
    }
  }
});

router.post("/api/rsg/JackpotResult", async (req, res) => {
  try {
    const decryptedRequest = decryptDES(req.body.Msg, rsgDesKey, rsgDesIV);
    const requestData = JSON.parse(decryptedRequest);

    const {
      SystemCode,
      WebId,
      UserId,
      TransactionID,
      Currency,
      GameId,
      SequenNumber,
      Amount,
      BelongSequenNumber,
    } = requestData;

    if (
      !WebId ||
      !SystemCode ||
      !SequenNumber ||
      !UserId ||
      !TransactionID ||
      Amount === null ||
      Amount === undefined
    ) {
      const errorResponse = {
        ErrorCode: 2001,
        ErrorMessage: "Illegal arguments.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    const [currentUser, existingTransaction] = await Promise.all([
      User.findOne(
        { gameId: UserId },
        { username: 1, wallet: 1, _id: 1 }
      ).lean(),
      SlotRSGModal.findOne({ betId: SequenNumber }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      const errorResponse = {
        ErrorCode: 4001,
        ErrorMessage: "The player's currency doesn't exist.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    if (existingTransaction) {
      const errorResponse = {
        ErrorCode: 4005,
        ErrorMessage: "This SequenNumber has been settled.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: UserId },
        { $inc: { wallet: roundToTwoDecimals(Amount) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotRSGModal.create({
        username: UserId,
        betId: SequenNumber,
        uniquesettlementId: TransactionID,
        bet: true,
        jackpot: true,
        settle: true,
        settleamount: roundToTwoDecimals(Amount),
        betamount: 0,
        gametype: "SLOT",
        mainbetId: BelongSequenNumber,
      }),
    ]);

    const successResponse = {
      ErrorCode: 0,
      ErrorMessage: "OK",
      Timestamp: Math.floor(Date.now() / 1000),
      Data: {
        Balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
    };

    const encryptedResponse = encryptDES(
      JSON.stringify(successResponse),
      rsgDesKey,
      rsgDesIV
    );

    return res.status(200).send(encryptedResponse);
  } catch (error) {
    console.error(
      "RSG: Error in game provider calling settle api:",
      error.message
    );
    const errorResponse = {
      ErrorCode: 1001,
      ErrorMessage: "Execute failed.",
      Timestamp: Math.floor(Date.now() / 1000),
    };

    try {
      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );
      return res.status(200).send(encryptedResponse);
    } catch (encryptError) {
      console.error("RSG GetBalance encryption error:", encryptError);
      return res.status(500).send("System error");
    }
  }
});

router.post("/api/rsg/CancelBet", async (req, res) => {
  try {
    const decryptedRequest = decryptDES(req.body.Msg, rsgDesKey, rsgDesIV);
    const requestData = JSON.parse(decryptedRequest);

    const {
      SystemCode,
      WebId,
      UserId,
      TransactionID,
      SequenNumber,
      BelongSequenNumber,
      BetAmount,
    } = requestData;

    if (
      !WebId ||
      !SystemCode ||
      !SequenNumber ||
      !UserId ||
      !TransactionID ||
      BetAmount === null ||
      BetAmount === undefined
    ) {
      const errorResponse = {
        ErrorCode: 2001,
        ErrorMessage: "Illegal arguments.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    const [currentUser, existingCancelBet, existingTransaction] =
      await Promise.all([
        User.findOne(
          { gameId: UserId },
          { username: 1, wallet: 1, _id: 1 }
        ).lean(),
        SlotRSGModal.findOne(
          { betId: SequenNumber, cancel: true },
          { _id: 1 }
        ).lean(),
        SlotRSGModal.findOne(
          { betId: SequenNumber },
          { _id: 1, betamount: 1 }
        ).lean(),
      ]);

    if (!currentUser) {
      const errorResponse = {
        ErrorCode: 4001,
        ErrorMessage: "The player's currency doesn't exist.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    if (existingCancelBet) {
      const errorResponse = {
        ErrorCode: 4006,
        ErrorMessage: "This SequenNumber has been cancelled.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    if (!existingTransaction) {
      const errorResponse = {
        ErrorCode: 4004,
        ErrorMessage: "The SequenNumber doesn't exist.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: UserId },
        { $inc: { wallet: roundToTwoDecimals(existingTransaction.betamount) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
      SlotRSGModal.findOneAndUpdate(
        { betId: SequenNumber },
        {
          cancel: true,
          cancelamount: roundToTwoDecimals(BetAmount),
        },
        { new: false }
      ),
    ]);

    const successResponse = {
      ErrorCode: 0,
      ErrorMessage: "OK",
      Timestamp: Math.floor(Date.now() / 1000),
      Data: {
        Balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
    };

    const encryptedResponse = encryptDES(
      JSON.stringify(successResponse),
      rsgDesKey,
      rsgDesIV
    );

    return res.status(200).send(encryptedResponse);
  } catch (error) {
    console.error(
      "RSG: Error in game provider calling settle api:",
      error.message
    );
    const errorResponse = {
      ErrorCode: 1001,
      ErrorMessage: "Execute failed.",
      Timestamp: Math.floor(Date.now() / 1000),
    };

    try {
      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );
      return res.status(200).send(encryptedResponse);
    } catch (encryptError) {
      console.error("RSG GetBalance encryption error:", encryptError);
      return res.status(500).send("System error");
    }
  }
});

router.post("/api/rsg/Prepay", async (req, res) => {
  try {
    const decryptedRequest = decryptDES(req.body.Msg, rsgDesKey, rsgDesIV);
    const requestData = JSON.parse(decryptedRequest);

    const { SystemCode, WebId, UserId, TransactionId, Amount, SessionId } =
      requestData;
    console.log("Prepay", requestData, "prepay");
    if (
      !WebId ||
      !SystemCode ||
      !SessionId ||
      !UserId ||
      !TransactionId ||
      Amount === null ||
      Amount === undefined
    ) {
      const errorResponse = {
        ErrorCode: 2001,
        ErrorMessage: "Illegal arguments.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    if (SystemCode !== rsgSystemCode || WebId !== "EGM8MY") {
      const errorResponse = {
        ErrorCode: 2001,
        ErrorMessage: "Illegal arguments.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    const [currentUser, existingTransaction] = await Promise.all([
      User.findOne(
        { gameId: UserId },
        {
          username: 1,
          wallet: 1,
          "gameLock.rsg.lock": 1,
        }
      ).lean(),
      SlotRSGModal.findOne({ uniquebetId: TransactionId }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      const errorResponse = {
        ErrorCode: 4001,
        ErrorMessage: "The player's currency doesn't exist.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    if (currentUser.gameLock?.rsg?.lock) {
      const errorResponse = {
        ErrorCode: 4008,
        ErrorMessage: "Deny prepay, other reasons.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    if (existingTransaction) {
      const errorResponse = {
        ErrorCode: 4007,
        ErrorMessage: "Duplicate TransactionId.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        gameId: UserId,
        wallet: { $gte: roundToTwoDecimals(Amount) },
      },
      { $inc: { wallet: -roundToTwoDecimals(Amount) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      const errorResponse = {
        ErrorCode: 4003,
        ErrorMessage: "Balance is not enough.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    await SlotRSGModal.create({
      username: UserId,
      betId: SessionId,
      uniquebetId: TransactionId,
      bet: true,
      depositamount: roundToTwoDecimals(Amount),
      gametype: "FISH",
    });

    const successResponse = {
      ErrorCode: 0,
      ErrorMessage: "OK",
      Timestamp: Math.floor(Date.now() / 1000),
      Data: {
        Balance: roundToTwoDecimals(updatedUserBalance.wallet),
        Amount: roundToTwoDecimals(Amount),
      },
    };

    const encryptedResponse = encryptDES(
      JSON.stringify(successResponse),
      rsgDesKey,
      rsgDesIV
    );

    return res.status(200).send(encryptedResponse);
  } catch (error) {
    console.error(
      "RSG: Error in game provider calling bet api:",
      error.message
    );
    const errorResponse = {
      ErrorCode: 1001,
      ErrorMessage: "Execute failed.",
      Timestamp: Math.floor(Date.now() / 1000),
    };

    try {
      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );
      return res.status(200).send(encryptedResponse);
    } catch (encryptError) {
      console.error("RSG GetBalance encryption error:", encryptError);
      return res.status(500).send("System error");
    }
  }
});

router.post("/api/rsg/Refund", async (req, res) => {
  try {
    const decryptedRequest = decryptDES(req.body.Msg, rsgDesKey, rsgDesIV);
    const requestData = JSON.parse(decryptedRequest);

    const { SystemCode, WebId, UserId, TransactionId, SessionId, Amount } =
      requestData;
    console.log("Refund", requestData, "refund");
    if (
      !WebId ||
      !SystemCode ||
      !SessionId ||
      !UserId ||
      !TransactionId ||
      Amount === null ||
      Amount === undefined
    ) {
      const errorResponse = {
        ErrorCode: 2001,
        ErrorMessage: "Illegal arguments.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    const [currentUser, existingTransaction, existingSettledTransaction] =
      await Promise.all([
        User.findOne(
          { gameId: UserId },
          { username: 1, wallet: 1, _id: 1 }
        ).lean(),
        SlotRSGModal.findOne({ uniquebetId: TransactionId }, { _id: 1 }).lean(),
        SlotRSGModal.findOne(
          {
            uniquebetId: TransactionId,
            $or: [{ cancel: true }, { settle: true }],
          },
          { _id: 1 }
        ).lean(),
      ]);

    if (!currentUser) {
      const errorResponse = {
        ErrorCode: 4001,
        ErrorMessage: "The player's currency doesn't exist.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    if (!existingTransaction) {
      const errorResponse = {
        ErrorCode: 4009,
        ErrorMessage: "Transaction is not found.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    if (existingSettledTransaction) {
      const errorResponse = {
        ErrorCode: 4007,
        ErrorMessage: "	Duplicate TransactionId.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: UserId },
        { $inc: { wallet: roundToTwoDecimals(Amount) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
      SlotRSGModal.findOneAndUpdate(
        { uniquebetId: TransactionId },
        {
          settle: true,
          withdrawamount: roundToTwoDecimals(Amount),
        },
        { new: false }
      ),
    ]);

    const successResponse = {
      ErrorCode: 0,
      ErrorMessage: "OK",
      Timestamp: Math.floor(Date.now() / 1000),
      Data: {
        Balance: roundToTwoDecimals(updatedUserBalance.wallet),
        Amount: roundToTwoDecimals(Amount),
      },
    };

    const encryptedResponse = encryptDES(
      JSON.stringify(successResponse),
      rsgDesKey,
      rsgDesIV
    );

    return res.status(200).send(encryptedResponse);
  } catch (error) {
    console.error(
      "RSG: Error in game provider calling settle api:",
      error.message
    );
    const errorResponse = {
      ErrorCode: 1001,
      ErrorMessage: "Execute failed.",
      Timestamp: Math.floor(Date.now() / 1000),
    };

    try {
      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );
      return res.status(200).send(encryptedResponse);
    } catch (encryptError) {
      console.error("RSG GetBalance encryption error:", encryptError);
      return res.status(500).send("System error");
    }
  }
});

router.post("/api/rsg/CheckTransaction", async (req, res) => {
  try {
    const decryptedRequest = decryptDES(req.body.Msg, rsgDesKey, rsgDesIV);
    const requestData = JSON.parse(decryptedRequest);

    const { SystemCode, WebId, UserId, GameId, Currency, TransactionId } =
      requestData;

    if (
      !SystemCode ||
      !WebId ||
      !UserId ||
      !GameId ||
      !Currency ||
      !TransactionId
    ) {
      const errorResponse = {
        ErrorCode: 2001,
        ErrorMessage: "Illegal arguments.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    if (SystemCode !== rsgSystemCode || WebId !== rsgAccount) {
      const errorResponse = {
        ErrorCode: 2001,
        ErrorMessage: "Illegal arguments.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    // Check if user exists
    const user = await User.findOne({ gameId: UserId }, { _id: 1 }).lean();

    if (!user) {
      const errorResponse = {
        ErrorCode: 4001,
        ErrorMessage: "The player's currency doesn't exist.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    // Find the transaction
    const transaction = await SlotRSGModal.findOne(
      { uniquebetId: TransactionId },
      {
        uniquebetId: 1,
        createdAt: 1,
        depositamount: 1,
        withdrawamount: 1,
        settle: 1,
        bet: 1,
        username: 1,
        _id: 1,
      }
    ).lean();

    if (!transaction) {
      const errorResponse = {
        ErrorCode: 4009,
        ErrorMessage: "Transaction is not found.",
        Timestamp: Math.floor(Date.now() / 1000),
      };

      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );

      return res.status(200).send(encryptedResponse);
    }

    const action = transaction.bet && !transaction.settle ? 1 : 2;

    const amount =
      action === 1
        ? roundToTwoDecimals(transaction.depositamount || 0)
        : roundToTwoDecimals(transaction.withdrawamount || 0);

    const currentUser = await User.findOne(
      { gameId: UserId },
      { wallet: 1 }
    ).lean();

    const transactionTime = moment(transaction.createdAt).format(
      "YYYY-MM-DD HH:mm:ss"
    );

    const successResponse = {
      ErrorCode: 0,
      ErrorMessage: "OK",
      Timestamp: Math.floor(Date.now() / 1000),
      Data: {
        TransactionId: transaction.uniquebetId,
        TransactionTime: transactionTime,
        WebId: WebId,
        UserId: UserId,
        GameId: GameId,
        Currency: Currency,
        Action: action,
        Amount: amount,
        AfterBalance: roundToTwoDecimals(currentUser?.wallet || 0),
      },
    };

    // Encrypt the response
    const encryptedResponse = encryptDES(
      JSON.stringify(successResponse),
      rsgDesKey,
      rsgDesIV
    );

    return res.status(200).send(encryptedResponse);
  } catch (error) {
    console.error("RSG CheckTransaction error:", error);

    // Return system error
    const errorResponse = {
      ErrorCode: 1001,
      ErrorMessage: "Execute failed.",
      Timestamp: Math.floor(Date.now() / 1000),
    };

    try {
      const encryptedResponse = encryptDES(
        JSON.stringify(errorResponse),
        rsgDesKey,
        rsgDesIV
      );
      return res.status(200).send(encryptedResponse);
    } catch (encryptError) {
      console.error("RSG CheckTransaction encryption error:", encryptError);
      return res.status(500).send("System error");
    }
  }
});
module.exports = router;
