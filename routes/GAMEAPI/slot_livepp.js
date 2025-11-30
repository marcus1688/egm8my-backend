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
const jwt = require("jsonwebtoken");
const SlotLivePPModal = require("../../models/slot_live_pp.model");
const vip = require("../../models/vip.model");

const GameWalletLog = require("../../models/gamewalletlog.model");
const GamePPGameModal = require("../../models/slot_live_ppDatabase.model");

require("dotenv").config();

const ppSecureLogin = "jh_egm8myr";
const ppSecret = process.env.PP_SECRET;
const webURL = "https://www.bm8my.vip/";
const ppAPIURL =
  "https://api-2133.ppgames.net/IntegrationService/v3/http/CasinoGameAPI";
const cashierURL = "https://www.bm8my.vip/myaccount/deposit";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateSignature(fields, secretKey) {
  const data = [];
  for (const key in fields) {
    data.push(`${key}=${fields[key]}`);
  }
  data.sort();

  const rawData = data.join("&") + secretKey;

  const md5sum = crypto.createHash("md5");
  md5sum.update(rawData, "utf8");

  return md5sum.digest("hex").toUpperCase();
}

const generateRandomCode = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 4; i++) {
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

router.post("/api/pp/comparegames", async (req, res) => {
  try {
    const fields = {
      secureLogin: ppSecureLogin,
    };

    const hash = generateSignature(fields, ppSecret);

    const queryParams = new URLSearchParams({
      ...fields,
      hash,
    }).toString();

    console.log("Getting Pragmatic Play game list for comparison...");

    // Make API request to get current game list
    const response = await axios.post(
      `${ppAPIURL}/getCasinoGames`,
      queryParams,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    // Check if API returned successful response
    if (response.data.error !== "0") {
      console.error("Pragmatic Play API Error:", response.data.description);
      return res.status(400).json({
        success: false,
        error: {
          code: response.data.error,
          description: response.data.description,
        },
        message: {
          en: `Pragmatic Play API Error: ${
            response.data.description || "Unknown error"
          }`,
          zh: `Pragmatic Play API 错误: ${
            response.data.description || "未知错误"
          }`,
          ms: `Ralat API Pragmatic Play: ${
            response.data.description || "Ralat tidak diketahui"
          }`,
          zh_hk: `Pragmatic Play API 錯誤: ${
            response.data.description || "未知錯誤"
          }`,
          id: `Kesalahan API Pragmatic Play: ${
            response.data.description || "Kesalahan tidak diketahui"
          }`,
        },
      });
    }

    // Get all games from database
    const dbGames = await GamePPGameModal.find(
      {},
      {
        gameID: 1,
        gameNameEN: 1,
        gameNameCN: 1,
        maintenance: 1,
      }
    );

    // Extract game IDs from API response
    const apiGames = response.data.gameList || [];
    const apiGameIds = apiGames.map((game) => game.gameID);

    // Extract game IDs from database
    const dbGameIds = dbGames.map((game) => game.gameID);

    console.log("API Game IDs:", apiGameIds);
    console.log("Database Game IDs:", dbGameIds);

    // Find games that exist in database but not in API (these should be set to maintenance)
    const extraGamesInDb = dbGameIds.filter(
      (gameId) => !apiGameIds.includes(gameId)
    );

    // Find games that exist in API but not in database
    const missingGamesInDb = apiGameIds.filter(
      (gameId) => !dbGameIds.includes(gameId)
    );

    // Find games that exist in both (these should be set to active - maintenance: false)
    const activeGames = dbGameIds.filter((gameId) =>
      apiGameIds.includes(gameId)
    );

    console.log("Extra games in DB (will set to maintenance):", extraGamesInDb);
    console.log("Missing games in DB:", missingGamesInDb);
    console.log("Active games (will set maintenance to false):", activeGames);

    // Create detailed missing games info with API data
    const missingGamesDetails = missingGamesInDb.map((gameId) => {
      const apiGame = apiGames.find((game) => game.gameID === gameId);

      return {
        gameID: gameId,
        gameName: apiGame?.gameName || "Unknown",
        gameTypeID: apiGame?.gameTypeID || "Unknown",
        typeDescription: apiGame?.typeDescription || "Unknown",
        technology: apiGame?.technology || "Unknown",
        platform: apiGame?.platform || "Unknown",
        demoGameAvailable: apiGame?.demoGameAvailable || false,
        aspectRatio: apiGame?.aspectRatio || "Unknown",
        technologyID: apiGame?.technologyID || "Unknown",
        gameIdNumeric: apiGame?.gameIdNumeric || null,
        jurisdictions: apiGame?.jurisdictions || [],
      };
    });

    // Update maintenance status for extra games (set to true)
    let extraUpdateResult = { modifiedCount: 0 };
    if (extraGamesInDb.length > 0) {
      extraUpdateResult = await GamePPGameModal.updateMany(
        { gameID: { $in: extraGamesInDb } },
        { $set: { maintenance: true } }
      );
      console.log(
        `Updated ${extraUpdateResult.modifiedCount} games to maintenance mode`
      );
    }

    // Update maintenance status for active games (set to false)
    let activeUpdateResult = { modifiedCount: 0 };
    if (activeGames.length > 0) {
      activeUpdateResult = await GamePPGameModal.updateMany(
        { gameID: { $in: activeGames } },
        { $set: { maintenance: false } }
      );
      console.log(
        `Updated ${activeUpdateResult.modifiedCount} games to active mode`
      );
    }

    // Get details of extra games in DB
    const extraGamesDetails = await GamePPGameModal.find(
      { gameID: { $in: extraGamesInDb } },
      { gameID: 1, gameNameEN: 1, gameNameCN: 1, maintenance: 1 }
    );

    return res.status(200).json({
      success: true,
      data: {
        comparison: {
          totalApiGames: apiGameIds.length,
          totalDbGames: dbGameIds.length,
          extraGamesInDb: {
            count: extraGamesInDb.length,
            games: extraGamesDetails.map((game) => ({
              gameID: game.gameID,
              gameNameEN: game.gameNameEN,
              gameNameCN: game.gameNameCN,
              maintenance: game.maintenance,
            })),
            action: "Set to maintenance: true",
          },
          activeGames: {
            count: activeGames.length,
            games: activeGames,
            action: "Set to maintenance: false",
          },
          missingGamesInDb: {
            count: missingGamesInDb.length,
            games: missingGamesDetails,
            action:
              "No action taken - these games exist in API but not in database",
          },
        },
        updateResults: {
          extraGamesSetToMaintenance: extraUpdateResult.modifiedCount,
          activeGamesSetToActive: activeUpdateResult.modifiedCount,
          totalGamesUpdated:
            extraUpdateResult.modifiedCount + activeUpdateResult.modifiedCount,
        },
      },
      message: {
        en: "Pragmatic Play game comparison completed successfully.",
        zh: "Pragmatic Play游戏比较完成成功。",
        ms: "Perbandingan permainan Pragmatic Play berjaya diselesaikan.",
        zh_hk: "Pragmatic Play遊戲比較完成成功。",
        id: "Perbandingan permainan Pragmatic Play berhasil diselesaikan.",
      },
    });
  } catch (error) {
    console.log(
      "Pragmatic Play error in comparing games",
      error.response?.data || error.message
    );
    return res.status(500).json({
      success: false,
      error: error.message,
      message: {
        en: "Pragmatic Play: Game comparison failed. Please try again or contact customer service for assistance.",
        zh: "Pragmatic Play: 游戏比较失败，请重试或联系客服以获得帮助。",
        ms: "Pragmatic Play: Perbandingan permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "Pragmatic Play: 遊戲比較失敗，請重試或聯絡客服以獲得幫助。",
        id: "Pragmatic Play: Perbandingan permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

// router.post("/api/pp/getprovidergamelist", async (req, res) => {
//   const fields = {
//     secureLogin: ppSecureLogin,
//   };

//   const hash = generateSignature(fields, ppSecret);

//   const queryParams = new URLSearchParams({
//     ...fields,
//     hash,
//   }).toString();

//   try {
//     const response = await axios.post(
//       `${ppAPIURL}/getCasinoGames`,
//       queryParams,
//       {
//         headers: {
//           "Content-Type": "application/x-www-form-urlencoded",
//         },
//       }
//     );

//     return res.status(200).json({
//       success: true,
//       data: response.data,
//     });
//   } catch (error) {
//     console.log("PRAGMATIC PLAY Error creating user:", error.message);
//     return res.status(200).json({
//       success: false,
//       message: {
//         en: "PRAGMATIC PLAY: Game launch failed. Please try again or customer service for assistance.",
//         zh: "PRAGMATIC PLAY: 游戏启动失败，请重试或联系客服以获得帮助。",
//         ms: "PRAGMATIC PLAY: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
//       },
//     });
//   }
// });

router.post("/api/pp/register", authenticateToken, async (req, res) => {
  const user = await User.findById(req.user.userId);

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

  const normalisedUsername = user.username.toLowerCase();

  const fields = {
    secureLogin: ppSecureLogin,
    externalPlayerId: normalisedUsername,
    currency: "MYR",
  };

  const hash = generateSignature(fields, ppSecret);

  const queryParams = new URLSearchParams({
    ...fields,
    hash,
  }).toString();

  try {
    const response = await axios.post(
      `${ppAPIURL}/player/account/create`,
      queryParams,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (response.data.error !== "0") {
      console.log("PRAGMATIC PLAY: Error creating user", response.data);
      return res.status(200).json({
        success: false,
        message: {
          en: "PRAGMATIC PLAY: Game launch failed. Please try again or customer service for assistance.",
          zh: "PRAGMATIC PLAY: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "PRAGMATIC PLAY: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "PRAGMATIC PLAY: 遊戲開唔到，老闆試多次或者搵客服幫手。",
          id: "PRAGMATIC PLAY: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: {
        en: "User Registered Successfully",
        zh: "用户注册成功",
        ms: "Pendaftaran pengguna berjaya",
        zh_hk: "用戶註冊成功咗",
        id: "Pendaftaran pengguna berhasil",
      },
    });
  } catch (error) {
    console.log("PRAGMATIC PLAY Error creating user:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "PRAGMATIC PLAY: Game launch failed. Please try again or customer service for assistance.",
        zh: "PRAGMATIC PLAY: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "PRAGMATIC PLAY: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "PRAGMATIC PLAY: 遊戲開唔到，老闆試多次或者搵客服幫手。",
        id: "PRAGMATIC PLAY: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/pp/getgamelist", async (req, res) => {
  try {
    const games = await GamePPGameModal.find({
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
          id: "Tidak ada permainan ditemukan. Silakan coba lagi nanti.",
          zh_hk: "搵唔到遊戲。老闆麻煩再試下或者聯絡客服。",
        },
      });
    }

    const reformattedGamelist = games.map((game) => ({
      GameCode: game.gameID,
      GameNameEN: game.gameNameEN,
      GameNameZH: game.gameNameCN,
      GameType: game.gameType,
      GameImage: game.imageUrlEN || "",
      GameImageZH: game.imageUrlCN,
      Hot: game.hot,
      RTP: game.rtpRate,
    }));

    return res.status(200).json({
      success: true,
      gamelist: reformattedGamelist,
    });
  } catch (error) {
    console.error("Error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "PRAGMATIC PLAY: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "PRAGMATIC PLAY: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "PRAGMATIC PLAY: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "PRAGMATIC PLAY: 攞唔到遊戲清單，老闆麻煩聯絡客服幫手處理。",
        id: "PRAGMATIC PLAY: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/pplive/launchGame", authenticateToken, async (req, res) => {
  try {
    //en
    const { gameLang } = req.body;

    const user = await User.findById(req.user.userId);
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

    if (user.gameLock.pplive.lock) {
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

    const normalisedUsername = user.username.toLowerCase();

    // First, try to register the user
    const registrationFields = {
      secureLogin: ppSecureLogin,
      externalPlayerId: normalisedUsername,
      currency: "MYR",
    };

    const registrationHash = generateSignature(registrationFields, ppSecret);
    const registrationParams = new URLSearchParams({
      ...registrationFields,
      hash: registrationHash,
    }).toString();

    try {
      const registrationResponse = await axios.post(
        `${ppAPIURL}/player/account/create`,
        registrationParams,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      if (registrationResponse.data.error !== "0") {
        console.log(
          "PRAGMATIC PLAY: Error creating user",
          registrationResponse.data
        );
        return res.status(200).json({
          success: false,
          message: {
            en: "PRAGMATIC PLAY LIVE: Game launch failed. Please try again or customer service for assistance.",
            zh: "PRAGMATIC PLAY LIVE: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "PRAGMATIC PLAY LIVE: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk:
              "PRAGMATIC PLAY LIVE: 遊戲開唔到，老闆試多次或者搵客服幫手。",
            id: "PRAGMATIC PLAY LIVE: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }
    } catch (error) {
      console.log("PRAGMATIC PLAY LIVE Error creating user:", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "PRAGMATIC PLAY LIVE: Game launch failed. Please try again or customer service for assistance.",
          zh: "PRAGMATIC PLAY LIVE: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "PRAGMATIC PLAY LIVE: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "PRAGMATIC PLAY LIVE: 遊戲開唔到，老闆試多次或者搵客服幫手。",
          id: "PRAGMATIC PLAY LIVE: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    let lang = "zh";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "zh";
    } else if (gameLang === "zh_hk") {
      lang = "zh";
    } else if (gameLang === "ms") {
      lang = "id";
    } else if (gameLang === "id") {
      lang = "id";
    }

    let token = `${user.gameId}:${generateRandomCode()}`;

    const launchFields = {
      secureLogin: ppSecureLogin,
      symbol: "101",
      language: lang,
      token: token,
      externalPlayerId: normalisedUsername,
      currency: "MYR",
      cashierUrl: cashierURL,
      lobbyUrl: webURL,
    };

    const launchHash = generateSignature(launchFields, ppSecret);
    const launchParams = new URLSearchParams({
      ...launchFields,
      hash: launchHash,
    }).toString();

    const launchResponse = await axios.post(
      `${ppAPIURL}/game/url`,
      launchParams,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (launchResponse.data.error !== "0") {
      console.log(
        "PRAGMATIC PLAY LIVE error in launching game",
        launchResponse.data
      );
      return res.status(200).json({
        success: false,
        message: {
          en: "PRAGMATIC PLAY LIVE: Game launch failed. Please try again or customer service for assistance.",
          zh: "PRAGMATIC PLAY LIVE: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "PRAGMATIC PLAY LIVE: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "PRAGMATIC PLAY LIVE: 遊戲開唔到，老闆試多次或者搵客服幫手。",
          id: "PRAGMATIC PLAY LIVE: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        ppGameToken: token,
      },
      { new: true }
    );

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "PRAGMATIC PLAY LIVE"
    );

    return res.status(200).json({
      success: true,
      gameLobby: launchResponse.data.gameURL,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("PRAGMATIC PLAY LIVE error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "PRAGMATIC PLAY LIVE: Game launch failed. Please try again or customer service for assistance.",
        zh: "PRAGMATIC PLAY LIVE: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "PRAGMATIC PLAY LIVE: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "PRAGMATIC PLAY LIVE: 遊戲開唔到，老闆試多次或者搵客服幫手。",
        id: "PRAGMATIC PLAY LIVE: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/ppslot/launchGame", authenticateToken, async (req, res) => {
  try {
    //en zh
    const { gameLang, gameCode } = req.body;
    const user = await User.findById(req.user.userId);

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

    if (user.gameLock.ppslot.lock) {
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

    const normalisedUsername = user.username.toLowerCase();

    // First, try to register the user
    const registrationFields = {
      secureLogin: ppSecureLogin,
      externalPlayerId: normalisedUsername,
      currency: "MYR",
    };

    const registrationHash = generateSignature(registrationFields, ppSecret);

    const registrationParams = new URLSearchParams({
      ...registrationFields,
      hash: registrationHash,
    }).toString();
    try {
      const registrationResponse = await axios.post(
        `${ppAPIURL}/player/account/create`,
        registrationParams,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      if (registrationResponse.data.error !== "0") {
        // Error 1 typically means user already exists, which is fine
        console.log(
          "PRAGMATIC PLAY SLOT: Error creating user",
          registrationResponse.data
        );
        return res.status(200).json({
          success: false,
          message: {
            en: "PRAGMATIC PLAY SLOT: Game launch failed. Please try again or customer service for assistance.",
            zh: "PRAGMATIC PLAY SLOT: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "PRAGMATIC PLAY SLOT: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk:
              "PRAGMATIC PLAY SLOT: 遊戲開唔到，老闆試多次或者搵客服幫手。",
            id: "PRAGMATIC PLAY SLOT: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }
    } catch (error) {
      console.log("PRAGMATIC PLAY SLOT Error creating user:", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "PRAGMATIC PLAY SLOT: Game launch failed. Please try again or customer service for assistance.",
          zh: "PRAGMATIC PLAY SLOT: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "PRAGMATIC PLAY SLOT: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "PRAGMATIC PLAY SLOT: 遊戲開唔到，老闆試多次或者搵客服幫手。",
          id: "PRAGMATIC PLAY SLOT: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    let lang = "zh";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "zh";
    } else if (gameLang === "zh_hk") {
      lang = "zh";
    } else if (gameLang === "ms") {
      lang = "id";
    } else if (gameLang === "id") {
      lang = "id";
    }

    const token = `${user.gameId}:${generateRandomCode()}`;
    const launchFields = {
      secureLogin: ppSecureLogin,
      symbol: gameCode,
      language: lang,
      token: token,
      externalPlayerId: normalisedUsername,
      currency: "MYR",
      cashierUrl: cashierURL,
      lobbyUrl: webURL,
    };

    const launchHash = generateSignature(launchFields, ppSecret);
    const launchParams = new URLSearchParams({
      ...launchFields,
      hash: launchHash,
    }).toString();

    const launchResponse = await axios.post(
      `${ppAPIURL}/game/url`,
      launchParams,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (launchResponse.data.error !== "0") {
      console.log(
        "PRAGMATIC PLAY SLOT error in launching game",
        launchResponse.data
      );
      return res.status(200).json({
        success: false,
        message: {
          en: "PRAGMATIC PLAY SLOT: Game launch failed. Please try again or customer service for assistance.",
          zh: "PRAGMATIC PLAY SLOT: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "PRAGMATIC PLAY SLOT: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "PRAGMATIC PLAY SLOT: 遊戲開唔到，老闆試多次或者搵客服幫手。",
          id: "PRAGMATIC PLAY SLOT: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        ppGameToken: token,
      },
      { new: true }
    );

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "PRAGMATIC PLAY"
    );

    return res.status(200).json({
      success: true,
      gameLobby: launchResponse.data.gameURL,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("PRAGMATIC PLAY SLOT error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "PRAGMATIC PLAY SLOT: Game launch failed. Please try again or customer service for assistance.",
        zh: "PRAGMATIC PLAY SLOT: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "PRAGMATIC PLAY SLOT: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "PRAGMATIC PLAY SLOT: 遊戲開唔到，老闆試多次或者搵客服幫手。",
        id: "PRAGMATIC PLAY SLOT: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/pragmaticplay/auth", async (req, res) => {
  try {
    const { hash, token, providerId } = req.body;

    if (!token || !providerId) {
      return res.status(200).json({
        error: 7,
        description: "Bad param requested",
      });
    }

    const fields = {
      token: token,
      providerId: providerId,
    };
    let generatedHash = generateSignature(fields, ppSecret).toLowerCase();

    if (hash !== generatedHash) {
      return res.status(200).json({
        error: 5,
        description: "Invalid hash",
      });
    }

    const username = token.split(":")[0];

    const user = await User.findOne(
      { gameId: username },
      { username: 1, wallet: 1, gameId: 1, ppGameToken: 1 }
    ).lean();

    if (!user || user.ppGameToken !== token) {
      return res.status(200).json({
        error: 4,
        description: "Player not found",
      });
    }

    return res.status(200).json({
      userId: user.gameId,
      currency: "MYR",
      cash: roundToTwoDecimals(user.wallet),
      bonus: 0,
      token: token,
      country: "MY",
      error: 0,
      description: "Success",
    });
  } catch (error) {
    console.log(
      "PRAGMATIC PLAY Error in game provider calling ae96 api",
      error.message
    );
    return res.status(200).json({
      error: 120,
      description: "Internal Server Error",
    });
  }
});

router.post("/api/pragmaticplay/balance", async (req, res) => {
  try {
    const { hash, userId, providerId } = req.body;

    if (!userId || !providerId) {
      return res.status(200).json({
        error: 7,
        description: "Bad param requested",
      });
    }

    const fields = {
      userId: userId,
      providerId: providerId,
    };
    let generatedHash = generateSignature(fields, ppSecret).toLowerCase();

    if (hash !== generatedHash) {
      return res.status(200).json({
        error: 5,
        description: "Invalid hash",
      });
    }

    const currentUser = await User.findOne(
      { gameId: userId },
      { wallet: 1, gameId: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(200).json({
        error: 4,
        description: "Player not found",
      });
    }

    return res.status(200).json({
      currency: "MYR",
      cash: roundToTwoDecimals(currentUser.wallet),
      bonus: 0,
      error: 0,
      description: "Success",
    });
  } catch (error) {
    console.log(
      "PRAGMATIC PLAY Error in game provider calling ae96 balance api",
      error.message
    );
    return res.status(500).json({
      error: 120,
      description: "Internal Server Error",
    });
  }
});

router.post("/api/pragmaticplay/bet", async (req, res) => {
  try {
    const {
      hash,
      userId,
      gameId,
      roundId,
      amount,
      providerId,
      reference,
      timestamp,
      roundDetails,
      bonusCode,
    } = req.body;

    if (
      !userId ||
      !gameId ||
      !roundId ||
      !providerId ||
      !reference ||
      !timestamp ||
      !roundDetails
    ) {
      return res.status(200).json({
        error: 7,
        description: "Bad param requested",
      });
    }

    const generatedHash = generateSignature(
      {
        userId,
        gameId,
        roundId,
        amount,
        reference,
        providerId,
        timestamp,
        roundDetails,
        ...(bonusCode && { bonusCode }),
      },
      ppSecret
    ).toLowerCase();

    if (hash !== generatedHash) {
      return res.status(200).json({
        error: 5,
        description: "Invalid hash",
      });
    }

    const actualUpdateBalance = roundToTwoDecimals(parseFloat(amount));
    const gameType = gameId.startsWith("v")
      ? "Slot"
      : /^\d/.test(gameId)
      ? "Live"
      : "Slot";

    const lockField =
      gameType === "Live" ? "gameLock.pplive.lock" : "gameLock.ppslot.lock";

    const [currentUser, existingBet] = await Promise.all([
      User.findOne(
        { gameId: userId },
        { wallet: 1, [lockField]: 1, gameId: 1 }
      ).lean(),

      SlotLivePPModal.exists({
        betId: roundId,
        betreferenceId: reference,
      }),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        error: 4,
        description: "Player not found",
      });
    }

    const isLocked =
      gameType === "Live"
        ? currentUser.gameLock?.pplive?.lock
        : currentUser.gameLock?.ppslot?.lock;

    if (isLocked) {
      return res.status(200).json({
        error: 6,
        description: "Player is banned",
      });
    }

    if (existingBet) {
      return res.status(200).json({
        transactionId: reference,
        currency: "MYR",
        cash: roundToTwoDecimals(currentUser.wallet || 0),
        bonus: 0,
        usedPromo: 0,
        error: 0,
        description: "Success",
      });
    }

    const [updatedUserBalance, createdBet] = await Promise.all([
      User.findOneAndUpdate(
        {
          gameId: userId,
          wallet: { $gte: actualUpdateBalance },
        },
        { $inc: { wallet: -actualUpdateBalance } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
      SlotLivePPModal.create({
        username: currentUser.gameId,
        betamount: actualUpdateBalance,
        betId: roundId,
        betreferenceId: reference,
        gameType: gameType,
      }),
    ]);

    if (!updatedUserBalance) {
      await SlotLivePPModal.findByIdAndUpdate(createdBet._id, {
        settle: true,
        void: true,
        ended: true,
        betamount: 0,
        settleamount: 0,
      });

      return res.status(200).json({
        error: 1,
        description: "Insufficient balance",
      });
    }

    return res.status(200).json({
      transactionId: reference,
      currency: "MYR",
      cash: roundToTwoDecimals(updatedUserBalance.wallet || 0),
      bonus: 0,
      usedPromo: 0,
      error: 0,
      description: "Success",
    });
  } catch (error) {
    console.log(
      "PRAGMATIC PLAY Error in game provider calling ae96 bet api",
      error.message
    );
    return res.status(500).json({
      error: 120,
      description: "Internal Server Error",
    });
  }
});

router.post("/api/pragmaticplay/result", async (req, res) => {
  try {
    const {
      hash,
      userId,
      gameId,
      roundId,
      amount,
      reference,
      providerId,
      timestamp,
      roundDetails,
      bonusCode,
      promoCampaignType,
      promoCampaignID,
      promoWinReference,
      promoWinAmount,
    } = req.body;

    if (
      !userId ||
      !gameId ||
      !roundId ||
      !providerId ||
      !reference ||
      !timestamp ||
      !roundDetails
    ) {
      return res.status(200).json({
        error: 7,
        description: "Bad param requested",
      });
    }

    const generatedHash = generateSignature(
      {
        userId,
        gameId,
        roundId,
        amount,
        reference,
        providerId,
        timestamp,
        roundDetails,
        ...(bonusCode && { bonusCode }),
        ...(promoWinAmount && {
          promoCampaignType,
          promoCampaignID,
          promoWinReference,
          promoWinAmount,
        }),
      },
      ppSecret
    ).toLowerCase();

    if (hash !== generatedHash) {
      return res.status(200).json({
        error: 5,
        description: "Invalid hash",
      });
    }

    const toUpdateBalance = roundToTwoDecimals(
      (Number(amount) || 0) + (Number(promoWinAmount) || 0)
    );
    const actualUpdateBalance = parseFloat(toUpdateBalance);

    const [currentUser, existingBet, existingResult] = await Promise.all([
      User.findOne({ gameId: userId }, { wallet: 1, gameId: 1 }).lean(),
      SlotLivePPModal.exists({ betId: roundId }),
      SlotLivePPModal.exists({ settlereferenceId: reference }),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        error: 4,
        description: "Player not found",
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        transactionId: reference,
        currency: "MYR",
        cash: roundToTwoDecimals(currentUser.wallet),
        bonus: 0,
        error: 0,
        description: "Success",
      });
    }

    if (existingResult) {
      return res.status(200).json({
        transactionId: reference,
        currency: "MYR",
        cash: roundToTwoDecimals(currentUser.wallet),
        bonus: 0,
        error: 0,
        description: "Success",
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: userId },
        { $inc: { wallet: actualUpdateBalance } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotLivePPModal.updateOne(
        { betId: roundId },
        {
          $set: {
            settlereferenceId: reference,
            settleamount: actualUpdateBalance,
            ...(bonusCode && { bonuscode: bonusCode }),
          },
        }
      ),
    ]);

    return res.status(200).json({
      transactionId: reference,
      currency: "MYR",
      cash: roundToTwoDecimals(updatedUserBalance.wallet),
      bonus: 0,
      error: 0,
      description: "Success",
    });
  } catch (error) {
    console.log(
      "PRAGMATIC PLAY Error in game provider calling ae96 result api",
      error.message
    );
    return res.status(500).json({
      error: 120,
      description: "Internal Server Error",
    });
  }
});

router.post("/api/pragmaticplay/endRound", async (req, res) => {
  try {
    const { hash, userId, gameId, roundId, providerId } = req.body;

    if (!userId || !gameId || !roundId || !providerId) {
      return res.status(200).json({
        error: 7,
        description: "Bad param requested",
      });
    }

    const fields = {
      userId: userId,
      gameId: gameId,
      roundId: roundId,
      providerId: providerId,
    };

    let generatedHash = generateSignature(fields, ppSecret).toLowerCase();

    if (hash !== generatedHash) {
      return res.status(200).json({
        error: 5,
        description: "Invalid hash",
      });
    }

    const [currentUser, existingRecord] = await Promise.all([
      User.findOne({ gameId: userId }, { wallet: 1, gameId: 1 }).lean(),
      SlotLivePPModal.findOne(
        { betId: roundId, ended: true },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        error: 4,
        description: "Player not found",
      });
    }

    if (existingRecord) {
      return res.status(200).json({
        cash: roundToTwoDecimals(currentUser.wallet),
        bonus: 0,
        error: 0,
        description: "Success",
      });
    }

    await SlotLivePPModal.findOneAndUpdate(
      { betId: roundId },
      { $set: { ended: true } },
      { upsert: true }
    );

    return res.status(200).json({
      cash: roundToTwoDecimals(currentUser.wallet),
      bonus: 0,
      error: 0,
      description: "Success",
    });
  } catch (error) {
    console.log(
      "PRAGMATIC PLAY Error in game provider calling ae96 endround api",
      error.message
    );
    return res.status(500).json({
      error: 120,
      description: "Internal Server Error",
    });
  }
});

router.post("/api/pragmaticplay/refund", async (req, res) => {
  try {
    const { hash, userId, reference, providerId } = req.body;

    if (!userId || !providerId || !reference) {
      return res.status(200).json({
        error: 7,
        description: "Bad param requested",
      });
    }

    const fields = {
      userId: userId,
      reference: reference,
      providerId: providerId,
    };
    let generatedHash = generateSignature(fields, ppSecret).toLowerCase();

    if (hash !== generatedHash) {
      return res.status(200).json({
        error: 5,
        description: "Invalid hash",
      });
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne({ gameId: userId }, { wallet: 1 }).lean(),
      SlotLivePPModal.findOne(
        { betreferenceId: reference },
        { betamount: 1, refunded: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        error: 4,
        description: "Player not found",
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        transactionId: reference,
        error: 0,
        description: "No bet found",
      });
    }

    if (existingBet.refunded) {
      return res.status(200).json({
        transactionId: reference,
        error: 0,
        description: "Bet has already been refunded",
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: userId },
        { $inc: { wallet: roundToTwoDecimals(existingBet.betamount) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotLivePPModal.updateOne(
        { betreferenceId: reference },
        { $set: { refunded: true } }
      ),
    ]);

    return res.status(200).json({
      transactionId: reference,
      error: 0,
      description: "Success",
    });
  } catch (error) {
    console.log(
      "PRAGMATIC PLAY Error in game provider calling ae96 refund api",
      error.message
    );
    return res.status(500).json({
      error: 120,
      description: "Internal Server Error",
    });
  }
});

router.post("/api/pragmaticplay/bonusWin", async (req, res) => {
  try {
    const {
      hash,
      userId,
      amount,
      reference,
      providerId,
      timestamp,
      bonusCode,
      gameId,
      roundId,
    } = req.body;

    if (!userId || !providerId || !reference || !timestamp) {
      console.log(userId, providerId, reference, timestamp);
      return res.status(200).json({
        error: 7,
        description: "Bad param requested",
      });
    }

    const fields = {
      userId: userId,
      amount: amount,
      reference: reference,
      providerId: providerId,
      timestamp: timestamp,
    };

    if (bonusCode) {
      fields.bonusCode = bonusCode;
    }
    if (gameId) {
      fields.gameId = gameId;
    }
    if (roundId) {
      fields.roundId = roundId;
    }

    let generatedHash = generateSignature(fields, ppSecret).toLowerCase();

    if (hash !== generatedHash) {
      return res.status(200).json({
        error: 5,
        description: "Invalid hash",
      });
    }

    const currentUser = await User.findOne(
      { gameId: userId },
      { username: 1, wallet: 1, gameId: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(200).json({
        error: 4,
        description: "Player not found",
      });
    }

    const existingTrans = await SlotLivePPModal.findOne(
      {
        username: { $in: [currentUser.gameId] },
        bonusreferenceId: reference,
      },
      { _id: 1 }
    ).lean();

    if (existingTrans) {
      return res.status(200).json({
        transactionId: reference,
        currency: "MYR",
        cash: roundToTwoDecimals(currentUser.wallet),
        bonus: 0,
        error: 0,
        description: "Success",
      });
    }

    const actualUpdateBalance = parseFloat(amount);

    await SlotLivePPModal.findOneAndUpdate(
      {
        username: { $in: [currentUser.gameId] },
        bonuscode: bonusCode,
      },
      {
        $set: {
          bonusreferenceId: reference,
          settleamount: roundToTwoDecimals(actualUpdateBalance),
        },
      }
    );

    return res.status(200).json({
      transactionId: reference,
      currency: "MYR",
      cash: roundToTwoDecimals(currentUser.wallet),
      bonus: 0,
      error: 0,
      description: "Success",
    });
  } catch (error) {
    console.log(
      "PRAGMATIC PLAY Error in game provider calling ae96 bonus api",
      error.message
    );
    return res.status(500).json({
      error: 120,
      description: "Internal Server Error",
    });
  }
});

router.post("/api/pragmaticplay/jackpotWin", async (req, res) => {
  try {
    const {
      hash,
      providerId,
      timestamp,
      userId,
      gameId,
      roundId,
      jackpotId,
      amount,
      reference,
    } = req.body;

    if (
      !userId ||
      !gameId ||
      !roundId ||
      !providerId ||
      !reference ||
      !timestamp ||
      !jackpotId
    ) {
      return res.status(200).json({
        error: 7,
        description: "Bad param requested",
      });
    }

    const fields = {
      providerId: providerId,
      timestamp: timestamp,
      userId: userId,
      gameId: gameId,
      roundId: roundId,
      jackpotId: jackpotId,
      amount: amount,
      reference: reference,
    };
    let generatedHash = generateSignature(fields, ppSecret).toLowerCase();

    if (hash !== generatedHash) {
      return res.status(200).json({
        error: 5,
        description: "Invalid hash",
      });
    }

    const currentUser = await User.findOne(
      { gameId: userId },
      { username: 1, wallet: 1, gameId: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(200).json({
        error: 4,
        description: "Player not found",
      });
    }

    const existingTrans = await SlotLivePPModal.findOne(
      {
        username: { $in: [currentUser.gameId] },
        jackpotreferenceId: reference,
      },
      { _id: 1 }
    ).lean();

    if (existingTrans) {
      return res.status(200).json({
        transactionId: reference,
        currency: "MYR",
        cash: roundToTwoDecimals(currentUser.wallet),
        bonus: 0,
        error: 0,
        description: "Success",
      });
    }

    const formattedAmount = roundToTwoDecimals(amount);

    const actualUpdateBalance = parseFloat(formattedAmount);

    const gameType = gameId.startsWith("v")
      ? "Slot"
      : /^\d/.test(gameId)
      ? "Live"
      : "Slot";

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: userId },
        { $inc: { wallet: actualUpdateBalance } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotLivePPModal.updateOne(
        {
          username: { $in: [currentUser.gameId] },
          betId: roundId,
        },
        {
          $set: {
            jackpotreferenceId: reference,
            settleamount: actualUpdateBalance,
            gameType,
          },
        }
      ),
    ]);

    return res.status(200).json({
      transactionId: reference,
      currency: "MYR",
      cash: roundToTwoDecimals(updatedUserBalance.wallet),
      bonus: 0,
      error: 0,
      description: "Success",
    });
  } catch (error) {
    console.log(
      "PRAGMATIC PLAY Error in game provider calling ae96 jackpot api",
      error.message
    );
    return res.status(500).json({
      error: 120,
      description: "Internal Server Error",
    });
  }
});

router.post("/api/pragmaticplay/promoWin", async (req, res) => {
  try {
    const {
      hash,
      providerId,
      timestamp,
      userId,
      campaignId,
      campaignType,
      amount,
      currency,
      reference,
      gameId,
      roundId,
    } = req.body;

    if (
      !userId ||
      !campaignId ||
      !campaignType ||
      !currency ||
      !reference ||
      !providerId ||
      !timestamp
    ) {
      return res.status(200).json({
        error: 7,
        description: "Bad param requested",
      });
    }

    const fields = {
      providerId: providerId,
      timestamp: timestamp,
      userId: userId,
      campaignId: campaignId,
      campaignType: campaignType,
      amount: amount,
      currency: currency,
      reference: reference,
    };
    if (gameId) {
      fields.gameId = gameId;
    }
    if (roundId) {
      fields.roundId = roundId;
    }

    let generatedHash = generateSignature(fields, ppSecret).toLowerCase();

    if (hash !== generatedHash) {
      return res.status(200).json({
        error: 5,
        description: "Invalid hash",
      });
    }

    const currentUser = await User.findOne(
      { gameId: userId },
      { username: 1, wallet: 1, gameId: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(200).json({
        error: 4,
        description: "Player not found",
      });
    }

    const existingTrans = await SlotLivePPModal.findOne(
      {
        username: { $in: [currentUser.gameId] },
        promoreferenceId: reference,
      },
      { _id: 1 }
    ).lean();

    if (existingTrans) {
      return res.status(200).json({
        transactionId: reference,
        currency: "MYR",
        cash: roundToTwoDecimals(currentUser.wallet),
        bonus: 0,
        error: 0,
        description: "Success",
      });
    }

    const formattedAmount = roundToTwoDecimals(amount);

    const actualUpdateBalance = parseFloat(formattedAmount);

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: userId },
        { $inc: { wallet: actualUpdateBalance } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotLivePPModal.updateOne(
        {
          username: { $in: [currentUser.gameId] },
          betId: roundId,
        },
        {
          $set: {
            promoreferenceId: reference,
            settleamount: actualUpdateBalance,
          },
        }
      ),
    ]);

    return res.status(200).json({
      transactionId: reference,
      currency: "MYR",
      cash: roundToTwoDecimals(updatedUserBalance.wallet),
      bonus: 0,
      error: 0,
      description: "Success",
    });
  } catch (error) {
    console.log(
      "PRAGMATIC PLAY Error in game provider calling ae96 promo api",
      error.message
    );
    return res.status(500).json({
      error: 120,
      description: "Internal Server Error",
    });
  }
});

router.post("/api/pragmaticplay/adjustment", async (req, res) => {
  try {
    const {
      hash,
      userId,
      gameId,
      roundId,
      amount,
      providerId,
      reference,
      validBetAmount,
      timestamp,
    } = req.body;

    if (
      !userId ||
      !gameId ||
      !roundId ||
      !reference ||
      !providerId ||
      !timestamp
    ) {
      return res.status(200).json({
        error: 7,
        description: "Bad param requested",
      });
    }

    const fields = {
      userId: userId,
      gameId: gameId,
      roundId: roundId,
      amount: amount,
      reference: reference,
      providerId: providerId,
      validBetAmount: validBetAmount,
      timestamp: timestamp,
    };
    let generatedHash = generateSignature(fields, ppSecret).toLowerCase();

    if (hash !== generatedHash) {
      return res.status(200).json({
        error: 5,
        description: "Invalid hash",
      });
    }

    const currentUser = await User.findOne(
      { gameId: userId },
      { username: 1, wallet: 1, gameId: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(200).json({
        error: 4,
        description: "Player not found",
      });
    }

    const existingTrans = await SlotLivePPModal.findOne(
      {
        username: { $in: [currentUser.gameId] },
        adjustmentreferenceId: reference,
      },
      { _id: 1 }
    ).lean();

    if (existingTrans) {
      return res.status(200).json({
        transactionId: reference,
        currency: "MYR",
        cash: roundToTwoDecimals(currentUser.wallet),
        bonus: 0,
        error: 0,
        description: "Success",
      });
    }

    const actualUpdateBalance = parseFloat(amount);

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        gameId: userId,
        ...(actualUpdateBalance < 0 && {
          wallet: { $gte: Math.abs(actualUpdateBalance) },
        }),
      },
      { $inc: { wallet: roundToTwoDecimals(actualUpdateBalance) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res.status(200).json({
        error: 1,
        description: "Insufficient balance",
      });
    }

    const actualValidBet = parseFloat(validBetAmount);

    await SlotLivePPModal.updateOne(
      {
        username: { $in: [currentUser.gameId] },
        betId: roundId,
      },
      {
        $set: {
          adjustmentreferenceId: reference,
          betamount: roundToTwoDecimals(actualValidBet),
        },
      }
    );

    return res.status(200).json({
      transactionId: reference,
      currency: "MYR",
      cash: roundToTwoDecimals(updatedUserBalance.wallet),
      bonus: 0,
      error: 0,
      description: "Success",
    });
  } catch (error) {
    console.log(
      "PRAGMATIC PLAY Error in game provider calling ae96 adjustment api",
      error.message
    );
    return res.status(500).json({
      error: 120,
      description: "Internal Server Error",
    });
  }
});

router.post("/api/ppslot/getturnoverforrebate", async (req, res) => {
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

    console.log("PP SLOT QUERYING TIME", startDate, endDate);

    const records = await SlotLivePPModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      refunded: false,
      ended: true,
      gameType: "Slot",
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
        console.warn(`User not found for gameId: ${gameId}`);
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
        gamename: "PRAGMATIC PLAY SLOT",
        gamecategory: "Slot Games",
        users: playerSummary, // Return player summary for each user
      },
    });
  } catch (error) {
    console.log("PP SLOT: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "PP SLOT: Failed to fetch win/loss report",
        zh: "PP SLOT: 获取盈亏报告失败",
      },
    });
  }
});

router.post("/api/pplive/getturnoverforrebate", async (req, res) => {
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

    console.log("PP LIVE QUERYING TIME", startDate, endDate);

    const records = await SlotLivePPModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      refunded: false,
      ended: true,
      gameType: "Live",
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
        gamename: "PRAGMATIC PLAY LIVE",
        gamecategory: "Live Casino",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("PP LIVE: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "PP LIVE: Failed to fetch win/loss report",
        zh: "PP LIVE: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/pplive/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLivePPModal.find({
        username: user.gameId,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        refunded: false,
        ended: true,
        gameType: "Live",
      });

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
          gamename: "PRAGMATIC PLAY LIVE",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log(
        "PRAGMATIC PLAY LIVE: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "PP LIVE: Failed to fetch win/loss report",
          zh: "PP LIVE: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/pplive/:userId/gamedata",
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
          gameCategories["Live Casino"] &&
          gameCategories["Live Casino"] instanceof Map
        ) {
          const liveCasino = Object.fromEntries(gameCategories["Live Casino"]);

          if (liveCasino["PRAGMATIC PLAY LIVE"]) {
            totalTurnover += liveCasino["PRAGMATIC PLAY LIVE"].turnover || 0;
            totalWinLoss += liveCasino["PRAGMATIC PLAY LIVE"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PRAGMATIC PLAY LIVE",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log(
        "PRAGMATIC PLAY LIVE: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "PP LIVE: Failed to fetch win/loss report",
          zh: "PP LIVE: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/ppslot/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLivePPModal.find({
        username: user.gameId,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        refunded: false,
        ended: true,
        gameType: "Slot",
      });

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
          gamename: "PRAGMATIC PLAY SLOT",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log(
        "PRAGMATIC PLAY SLOT: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "PP SLOT: Failed to fetch win/loss report",
          zh: "PP SLOT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/ppslot/:userId/gamedata",
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

          if (slotGames["PRAGMATIC PLAY SLOT"]) {
            totalTurnover += slotGames["PRAGMATIC PLAY SLOT"].turnover || 0;
            totalWinLoss += slotGames["PRAGMATIC PLAY SLOT"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PRAGMATIC PLAY SLOT",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log(
        "PRAGMATIC PLAY SLOT: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "PP SLOT: Failed to fetch win/loss report",
          zh: "PP SLOT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/ppslot/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLivePPModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        refunded: false,
        ended: true,
        gameType: "Slot",
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;

        const winLoss = (record.betamount || 0) - (record.settleamount || 0);

        totalWinLoss += winLoss;
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PRAGMATIC PLAY SLOT",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error(
        "PRAGMATIC PLAY SLOT: Failed to fetch win/loss report:",
        error
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "PP SLOT: Failed to fetch win/loss report",
          zh: "PP SLOT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/pplive/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLivePPModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        refunded: false,
        ended: true,
        gameType: "Live",
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;

        const winLoss = (record.betamount || 0) - (record.settleamount || 0);

        totalWinLoss += winLoss;
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PRAGMATIC PLAY LIVE",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error(
        "PRAGMATIC PLAY LIVE: Failed to fetch win/loss report:",
        error
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "PP LIVE: Failed to fetch win/loss report",
          zh: "PP LIVE: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/ppslot/kioskreport",
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

          if (liveCasino["PRAGMATIC PLAY SLOT"]) {
            totalTurnover += Number(
              liveCasino["PRAGMATIC PLAY SLOT"].turnover || 0
            );
            totalWinLoss +=
              Number(liveCasino["PRAGMATIC PLAY SLOT"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PRAGMATIC PLAY SLOT",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error(
        "PRAGMATIC PLAY SLOT: Failed to fetch win/loss report:",
        error
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "PP SLOT: Failed to fetch win/loss report",
          zh: "PP SLOT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/pplive/kioskreport",
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
          gameCategories["Live Casino"] &&
          gameCategories["Live Casino"] instanceof Map
        ) {
          const liveCasino = Object.fromEntries(gameCategories["Live Casino"]);

          if (liveCasino["PRAGMATIC PLAY LIVE"]) {
            totalTurnover += Number(
              liveCasino["PRAGMATIC PLAY LIVE"].turnover || 0
            );
            totalWinLoss +=
              Number(liveCasino["PRAGMATIC PLAY LIVE"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PRAGMATIC PLAY LIVE",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error(
        "PRAGMATIC PLAY LIVE: Failed to fetch win/loss report:",
        error
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "PP LIVE: Failed to fetch win/loss report",
          zh: "PP LIVE: 获取盈亏报告失败",
        },
      });
    }
  }
);

module.exports = router;
