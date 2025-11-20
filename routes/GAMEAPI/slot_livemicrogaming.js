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
const GameMicroGamingGameModal = require("../../models/slot_livemicrogamingDatabase.model");
const GameWalletLog = require("../../models/gamewalletlog.model");
const SlotLiveMicroGamingModal = require("../../models/slot_livemicrogaming.model");

require("dotenv").config();

const microGamingAgentCode = "ZBH1469_MYR_SW";
const microGamingSecret = process.env.MICROGAMING_SECRET;
const webURL = "https://www.bm8my.vip/";
const microGamingAPIURL = "https://api-superswansw.k2net.io";
const microGamingTokenURL = "https://sts-superswansw.k2net.io";
const cashierURL = "https://www.bm8my.vip/myaccount/deposit";

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

async function getAccessToken() {
  try {
    const response = await axios.post(
      `${microGamingTokenURL}/connect/token`,
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: microGamingAgentCode,
        client_secret: microGamingSecret, // Replace with your actual agent secret
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    // console.log(response.data);
    return response.data.access_token;
  } catch (error) {
    // console.error("Error getting access token:", error);
    throw new Error("Failed to get access token");
  }
}

// router.post("/api/microgaming/comparegame", async (req, res) => {
//   try {
//     const token = await getAccessToken();

//     const response = await axios.get(
//       `${microGamingAPIURL}/api/v1/agents/${microGamingAgentCode}/games`,
//       {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           "Content-Type": "application/x-www-form-urlencoded",
//         },
//       }
//     );

//     if (response.status !== 200 && response.status !== 201) {
//       console.log("MicroGaming error fetching game list", response.data);
//       return res.status(200).json({
//         success: false,
//         message: {
//           en: "MICRO GAMING: Unable to retrieve game lists. Please contact customer service for assistance.",
//           zh: "MICRO GAMING: 无法获取游戏列表，请联系客服以获取帮助。",
//           ms: "MICRO GAMING: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
//         },
//       });
//     }

//     // Get all games from database
//     const dbGames = await GameMicroGamingGameModal.find({}, "gameID");

//     // Extract game IDs from database
//     const dbGameIds = new Set(dbGames.map((game) => game.gameID));

//     // Extract games from API response
//     const apiGames = response.data;
//     const apiGameIds = new Set(apiGames.map((game) => game.gameCode));

//     // Count totals
//     const totalApiGames = apiGames.length;
//     const totalDbGames = dbGames.length;

//     // Find missing games (in API but not in database)
//     const missingGames = apiGames.filter(
//       (game) => !dbGameIds.has(game.gameCode)
//     );

//     // Find extra games (in database but not in API) and set maintenance to true
//     const extraGameIds = [...dbGameIds].filter(
//       (gameId) => !apiGameIds.has(gameId)
//     );

//     // Update extra games to maintenance: true
//     if (extraGameIds.length > 0) {
//       await GameMicroGamingGameModal.updateMany(
//         { gameID: { $in: extraGameIds } },
//         { maintenance: true }
//       );
//       console.log(
//         `Set maintenance: true for ${extraGameIds.length} games not in API`
//       );
//     }

//     // Set maintenance to false for games that are in API (not extra)
//     const activeGameIds = [...apiGameIds];
//     if (activeGameIds.length > 0) {
//       await GameMicroGamingGameModal.updateMany(
//         { gameID: { $in: activeGameIds } },
//         { maintenance: false }
//       );
//       console.log(
//         `Set maintenance: false for ${activeGameIds.length} games in API`
//       );
//     }

//     // Return missing games with gameName, gameCode, and gameCategoryCode
//     const missingGamesInfo = missingGames.map((game) => ({
//       gameName: game.gameName,
//       gameCode: game.gameCode,
//       gameCategoryCode: game.gameCategoryCode,
//       translatedGameName: game.translatedGameName,
//       channelCode: game.channelCode,
//       channelName: game.channelName,
//       gameCategoryName: game.gameCategoryName,
//       gameSubcategoryCode: game.gameSubcategoryCode,
//       gameSubcategoryName: game.gameSubcategoryName,
//       releaseDateUTC: game.releaseDateUTC,
//       platform: game.platform,
//       isDemoEnabled: game.isDemoEnabled,
//       rtp: game.rtp,
//       volatility: game.volatility,
//     }));

//     console.log("Missing games:", missingGamesInfo);
//     console.log("Extra games set to maintenance:", extraGameIds.length);
//     console.log(
//       `Total API games: ${totalApiGames}, Total DB games: ${totalDbGames}`
//     );

//     return res.status(200).json({
//       success: true,
//       gameLobby: response.data,
//       comparison: {
//         missingGames: missingGamesInfo,
//         extraGamesCount: extraGameIds.length,
//         extraGameIds: extraGameIds,
//         missingCount: missingGamesInfo.length,
//         totalApiGames: totalApiGames,
//         totalDbGames: totalDbGames,
//       },
//       message: {
//         en: "Game launched successfully.",
//         zh: "游戏启动成功。",
//         ms: "Permainan berjaya dimulakan.",
//       },
//     });
//   } catch (error) {
//     console.error("MicroGaming error:", error);
//     return res.status(200).json({
//       success: false,
//       message: {
//         en: "MICRO GAMING: Game launch failed. Please try again or contact customer service for assistance.",
//         zh: "MICRO GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
//         ms: "MICRO GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
//       },
//     });
//   }
// });

router.post(
  "/api/microgaming/getprovidergamelist",

  async (req, res) => {
    try {
      const token = await getAccessToken();

      const response = await axios.get(
        `${microGamingAPIURL}/api/v1/agents/${microGamingAgentCode}/games`,

        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
      if (response.status !== 200 && response.status !== 201) {
        console.log(
          "Miro Gaming fail to launch game with error",
          response.data
        );
        return res.status(200).json({
          success: false,
          message: {
            en: "MICRO GAMING: Game launch failed. Please try again or contact customer service for assistance.",
            zh: "MICRO GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "MICRO GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }

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
      console.error("Micro Gaming error launching game:", error);
      return res.status(200).json({
        success: false,
        message: {
          en: "MICRO GAMING: Game launch failed. Please try again or contact customer service for assistance.",
          zh: "MICRO GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "MICRO GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post("/api/microgaming/getgamelist", async (req, res) => {
  try {
    const games = await GameMicroGamingGameModal.find({
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
        en: "MICRO GAMING: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "MICRO GAMING: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "MICRO GAMING: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "MICRO GAMING: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "MICRO GAMING: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/api/microgamingslot/launchGame",
  authenticateToken,
  async (req, res) => {
    try {
      const token = await getAccessToken();

      const userId = req.user.userId;
      const user = await User.findById(userId);

      const { gameLang, gameCode, clientPlatform } = req.body;

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

      if (user.gameLock.microgamingslot.lock) {
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
      } else if (gameLang === "zh_hk") {
        lang = "zh-TW";
      } else if (gameLang === "ms") {
        lang = "ms-MY";
      } else if (gameLang === "id") {
        lang = "id-ID";
      }

      let platform = "Desktop";
      if (clientPlatform === "web") {
        platform = "Desktop";
      } else if (clientPlatform === "mobile") {
        platform = "Mobile";
      }

      let logintoken = `${user.gameId}:${generateRandomCode()}`;

      const payload = new URLSearchParams({
        contentCode: gameCode,
        platform,
        langCode: lang,
        homeUrl: webURL,
        bankUrl: cashierURL,
        operatorLoginToken: logintoken,
      });

      const response = await axios.post(
        `${microGamingAPIURL}/api/v1/agents/${microGamingAgentCode}/players/${user.gameId}/sessions`,
        payload.toString(),
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
      if (response.status !== 200 && response.status !== 201) {
        console.log(
          "Miro Gaming fail to launch game with error",
          response.data
        );
        return res.status(200).json({
          success: false,
          message: {
            en: "MICRO GAMING: Game launch failed. Please try again or contact customer service for assistance.",
            zh: "MICRO GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "MICRO GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "MICRO GAMING: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
            id: "MICRO GAMING: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      const updatedUser = await User.findOneAndUpdate(
        { _id: user._id },
        {
          microGamingGameToken: logintoken,
        },
        { new: true }
      );

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "MICRO GAMING SLOT"
      );

      return res.status(200).json({
        success: true,
        gameLobby: response.data.url,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
          zh_hk: "遊戲啟動成功。",
          id: "Permainan berhasil diluncurkan.",
        },
      });
    } catch (error) {
      console.error("Micro Gaming error launching game:", error);
      return res.status(200).json({
        success: false,
        message: {
          en: "MICRO GAMING: Game launch failed. Please try again or contact customer service for assistance.",
          zh: "MICRO GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "MICRO GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "MICRO GAMING: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "MICRO GAMING: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/api/microgaminglive/launchGame",
  authenticateToken,
  async (req, res) => {
    try {
      const token = await getAccessToken();

      const userId = req.user.userId;
      const user = await User.findById(userId);

      const { gameLang, clientPlatform } = req.body;

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

      if (user.gameLock.microgaminglive.lock) {
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
      } else if (gameLang === "zh_hk") {
        lang = "zh-TW";
      } else if (gameLang === "ms") {
        lang = "ms-MY";
      } else if (gameLang === "id") {
        lang = "id-ID";
      }

      let platform = "Desktop";
      if (clientPlatform === "web") {
        platform = "Desktop";
      } else if (clientPlatform === "mobile") {
        platform = "Mobile";
      }

      let logintoken = `${user.gameId}:${generateRandomCode()}`;

      const payload = new URLSearchParams({
        contentCode: "MGL_GRAND_LobbyAll",
        contentType: "Lobby",
        platform,
        langCode: lang,
        homeUrl: webURL,
        bankUrl: cashierURL,
        operatorLoginToken: logintoken,
      });

      const response = await axios.post(
        `${microGamingAPIURL}/api/v1/agents/${microGamingAgentCode}/players/${user.gameId}/sessions`,
        payload.toString(),
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
      if (response.status !== 200 && response.status !== 201) {
        console.log(
          "Miro Gaming fail to launch game with error",
          response.data
        );
        return res.status(200).json({
          success: false,
          message: {
            en: "MICRO GAMING: Game launch failed. Please try again or contact customer service for assistance.",
            zh: "MICRO GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "MICRO GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "MICRO GAMING: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
            id: "MICRO GAMING: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      const updatedUser = await User.findOneAndUpdate(
        { _id: user._id },
        {
          microGamingGameToken: logintoken,
        },
        { new: true }
      );

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "MICRO GAMING LIVE"
      );

      return res.status(200).json({
        success: true,
        gameLobby: response.data.url,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
          zh_hk: "遊戲啟動成功。",
          id: "Permainan berhasil diluncurkan.",
        },
      });
    } catch (error) {
      console.error("Micro Gaming error launching game:", error);
      return res.status(200).json({
        success: false,
        message: {
          en: "MICRO GAMING: Game launch failed. Please try again or contact customer service for assistance.",
          zh: "MICRO GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "MICRO GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "MICRO GAMING: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "MICRO GAMING: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post("/api/microgaming/login", async (req, res) => {
  const startTime = Date.now();
  try {
    const mgpReqId = req.headers["x-mgp-req-id"];
    const mgpRequestTime = req.headers["x-mgp-request-timems"];

    res.set("X-MGP-REQ-ID", mgpReqId || "no-request-id-provided");

    const { playerId, contentCode, operatorLoginToken } = req.body;
    if (!playerId) {
      res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
      return res.status(432).json({});
    }

    const user = await User.findOne(
      { gameId: playerId },
      { username: 1, wallet: 1, microGamingGameToken: 1 }
    ).lean();

    if (!user) {
      res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
      return res.status(401).json({});
    }

    if (operatorLoginToken) {
      if (user.microGamingGameToken !== operatorLoginToken) {
        res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
        return res.status(401).json({});
      }
    }

    res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
    return res.status(200).json({
      balance: roundToTwoDecimals(user.wallet),
      currency: "MYR",
    });
  } catch (error) {
    console.log(
      "MICRO GAMING Error in game provider calling ae96 api",
      error.message
    );
    res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
    return res.status(404).json({});
  }
});

router.post("/api/microgaming/getbalance", async (req, res) => {
  const startTime = Date.now();
  try {
    const mgpReqId = req.headers["x-mgp-req-id"];
    const mgpRequestTime = req.headers["x-mgp-request-timems"];

    res.set("X-MGP-REQ-ID", mgpReqId || "no-request-id-provided");

    const { playerId } = req.body;

    if (!playerId) {
      res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
      return res.status(401).json({});
    }

    const currentUser = await User.findOne(
      { gameId: playerId },
      { username: 1, wallet: 1 }
    ).lean();

    if (!currentUser) {
      res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
      return res.status(404).json({});
    }

    res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
    return res.status(200).json({
      currency: "MYR",
      balance: roundToTwoDecimals(currentUser.wallet),
    });
  } catch (error) {
    console.log(
      "MICRO GAMING Error in game provider calling ae96 balance api",
      error.message
    );
    res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
    return res.status(404).json({});
  }
});

function generateTransactionId(prefix = "") {
  const uuid = uuidv4().replace(/-/g, "").substring(0, 16);
  return prefix ? `${prefix}${uuid}` : uuid;
}

router.post("/api/microgaming/updatebalance", async (req, res) => {
  const startTime = Date.now();
  const extransId = generateTransactionId();

  try {
    const mgpReqId = req.headers["x-mgp-req-id"];
    const mgpRequestTime = req.headers["x-mgp-request-timems"];

    res.set("X-MGP-REQ-ID", mgpReqId || "no-request-id-provided");

    const {
      playerId,
      txnType,
      amount,
      txnId,
      betId,
      roundId,
      contentCode,
      completed,
    } = req.body;
    if (!playerId || !txnType || !txnId) {
      res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
      return res.status(400).json({
        extTxnId: extransId,
        balance: 0,
        currency: "MYR",
      });
    }
    const gameType = await (async () => {
      if (!contentCode) return "SLOT"; // Default if no contentCode

      const gameExists = await GameMicroGamingGameModal.findOne(
        { gameID: contentCode, gameType: "Slot" },
        { _id: 1 }
      ).lean();

      return gameExists ? "SLOT" : "LIVE";
    })();

    switch (txnType) {
      case "DEBIT":
        const [currentUserDebit, existingTransactionDebit] = await Promise.all([
          User.findOne(
            { gameId: playerId },
            {
              username: 1,
              wallet: 1,
              "gameLock.microgamingslot.lock": 1,
              "gameLock.microgaminglive.lock": 1,
              _id: 1,
            }
          ).lean(),
          SlotLiveMicroGamingModal.findOne(
            { tranId: txnId },
            { _id: 1 }
          ).lean(),
        ]);

        if (!currentUserDebit) {
          res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
          return res.status(404).json({
            extTxnId: extransId,
            balance: 0,
            currency: "MYR",
          });
        }

        const isLocked =
          gameType === "SLOT"
            ? currentUserDebit.gameLock?.microgamingslot?.lock
            : currentUserDebit.gameLock?.microgaminglive?.lock;
        if (isLocked) {
          res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
          return res.status(403).json({
            extTxnId: extransId,
            balance: 0,
            currency: "MYR",
          });
        }

        if (existingTransactionDebit) {
          res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
          return res.status(200).json({
            extTxnId: extransId,
            balance: roundToTwoDecimals(currentUserDebit.wallet),
            currency: "MYR",
          });
        }

        const updatedUserBalanceDebit = await User.findOneAndUpdate(
          {
            gameId: playerId,
            wallet: { $gte: roundToTwoDecimals(amount) },
          },
          { $inc: { wallet: -roundToTwoDecimals(amount) } },
          { new: true, projection: { wallet: 1 } }
        ).lean();

        if (!updatedUserBalanceDebit) {
          res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
          return res.status(402).json({
            extTxnId: extransId,
            balance: roundToTwoDecimals(currentUserDebit.wallet),
            currency: "MYR",
          });
        }

        await SlotLiveMicroGamingModal.create({
          username: playerId,
          betId: betId,
          tranId: txnId,
          bet: true,
          betamount: roundToTwoDecimals(amount),
          gameType: gameType,
          completed: completed !== undefined ? completed : true,
        });

        res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
        return res.status(200).json({
          extTxnId: extransId,
          balance: roundToTwoDecimals(updatedUserBalanceDebit.wallet),
          currency: "MYR",
        });

      case "CREDIT":
        const [
          currentUserCredit,
          existingTransactionCredit,
          existingSettledTransactionCredit,
        ] = await Promise.all([
          User.findOne(
            { gameId: playerId },
            { username: 1, wallet: 1, _id: 1 }
          ).lean(),
          SlotLiveMicroGamingModal.findOne({ betId: betId }, { _id: 1 }).lean(),
          SlotLiveMicroGamingModal.findOne(
            { settleId: txnId, $or: [{ settle: true }, { cancel: true }] },
            { _id: 1 }
          ).lean(),
        ]);

        if (!currentUserCredit) {
          res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
          return res.status(404).json({
            extTxnId: extransId,
            balance: 0,
            currency: "MYR",
          });
        }

        if (!existingTransactionCredit) {
          res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
          return res.status(400).json({
            extTxnId: extransId,
            balance: roundToTwoDecimals(currentUserCredit.wallet),
            currency: "MYR",
          });
        }

        if (existingSettledTransactionCredit) {
          res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
          return res.status(200).json({
            extTxnId: extransId,
            balance: roundToTwoDecimals(currentUserCredit.wallet),
            currency: "MYR",
          });
        }

        const [updatedUserBalanceCredit, settlementResult] = await Promise.all([
          User.findByIdAndUpdate(
            currentUserCredit._id,
            { $inc: { wallet: roundToTwoDecimals(amount) } },
            { new: true, projection: { wallet: 1 } }
          ).lean(),
          SlotLiveMicroGamingModal.findOneAndUpdate(
            { betId: betId, settle: { $ne: true } },
            {
              $set: {
                settle: true,
                settleamount: roundToTwoDecimals(amount),
                settleId: txnId,
                completed: completed !== undefined ? completed : true,
              },
            },
            { new: true }
          ).lean(),
        ]);

        if (!settlementResult) {
          SlotLiveMicroGamingModal.create({
            username: playerId,
            betId: betId,
            bet: true,
            betamount: 0,
            settle: true,
            settleamount: roundToTwoDecimals(amount),
            settleId: txnId,
            gameType: gameType,
            completed: completed !== undefined ? completed : true,
          }).catch((error) => {
            console.error(
              "MICROGAMING: Error creating additional settlement record:",
              {
                playerId,
                betId,
                txnId,
                error: error.message,
              }
            );
          });
        }

        if (completed === true) {
          SlotLiveMicroGamingModal.updateMany(
            { betId: betId },
            { $set: { completed: true } }
          ).catch((error) => {
            console.error(
              "MICROGAMING: Error updating all records to completed:",
              {
                playerId,
                betId,
                error: error.message,
              }
            );
          });
        }

        res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
        return res.status(200).json({
          extTxnId: extransId,
          balance: roundToTwoDecimals(updatedUserBalanceCredit.wallet),
          currency: "MYR",
        });

      default:
        res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
        return res.status(400).json({
          extTxnId: extransId,
          balance: 0,
          currency: "MYR",
        });
    }
  } catch (error) {
    console.error(
      "MICROGAMING: Error in game provider calling ae96 betninfo api:",
      error.message
    );
    res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
    return res.status(500).json({
      extTxnId: extransId,
      balance: 0,
      currency: "MYR",
    });
  }
});

router.post("/api/microgaming/rollback", async (req, res) => {
  const startTime = Date.now();
  try {
    const mgpReqId = req.headers["x-mgp-req-id"];
    const mgpRequestTime = req.headers["x-mgp-request-timems"];

    res.set("X-MGP-REQ-ID", mgpReqId || "no-request-id-provided");

    const { playerId, amount, txnId } = req.body;

    if (!playerId) {
      res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
      return res.status(500).json({
        balance: 0,
        currency: "MYR",
      });
    }

    const [
      currentUserCredit,
      existingTransactionCredit,
      existingSettledTransactionCredit,
    ] = await Promise.all([
      User.findOne(
        { gameId: playerId },
        { username: 1, wallet: 1, _id: 1 }
      ).lean(),
      SlotLiveMicroGamingModal.findOne(
        { betId: txnId },
        { _id: 1, settle: 1, bet: 1 }
      ).lean(),
      SlotLiveMicroGamingModal.findOne(
        { betId: txnId, $or: [{ cancel: true }] },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUserCredit) {
      res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
      return res.status(404).json({
        balance: 0,
        currency: "MYR",
      });
    }

    if (!existingTransactionCredit) {
      res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
      return res.status(400).json({
        balance: roundToTwoDecimals(currentUserCredit.wallet),
        currency: "MYR",
      });
    }

    if (existingSettledTransactionCredit) {
      res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
      return res.status(200).json({
        balance: roundToTwoDecimals(currentUserCredit.wallet),
        currency: "MYR",
      });
    }

    let walletAdjustment;
    if (existingTransactionCredit.settle === true) {
      walletAdjustment = -roundToTwoDecimals(amount);
    } else {
      walletAdjustment = roundToTwoDecimals(amount);
    }

    const [updatedUserBalanceCredit] = await Promise.all([
      User.findByIdAndUpdate(
        currentUserCredit._id,
        { $inc: { wallet: walletAdjustment } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
      SlotLiveMicroGamingModal.findOneAndUpdate(
        { betId: txnId },
        {
          $set: { cancel: true },
        },
        { upsert: true }
      ),
    ]);

    res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
    return res.status(200).json({
      balance: roundToTwoDecimals(updatedUserBalanceCredit.wallet),
      currency: "MYR",
    });
  } catch (error) {
    console.log(
      "MICRO GAMING Error in game provider calling ae96 balance api",
      error.message
    );
    res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
    return res.status(500).json({});
  }
});

router.get("/api/microgaming/monitor", async (req, res) => {
  const startTime = Date.now();
  try {
    const mgpReqId = req.headers["x-mgp-req-id"];
    const mgpRequestTime = req.headers["x-mgp-request-timems"];

    res.set("X-MGP-REQ-ID", mgpReqId || "no-request-id-provided");

    const { ping } = req.body;

    res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
    return res.status(200).json({
      pong: ping || "",
    });
  } catch (error) {
    console.log(
      "MICRO GAMING Error in game provider calling ae96 balance api",
      error.message
    );
    res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
    return res.status(500).json({});
  }
});

router.post("/api/microgamingslot/getturnoverforrebate", async (req, res) => {
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

    console.log("MICRO GAMING SLOT QUERYING TIME", startDate, endDate);

    const records = await SlotLiveMicroGamingModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      cancel: { $ne: true },
      settle: true,
      gameType: "SLOT",
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
        console.warn(`MICRO GAMING SLOT User not found for gameId: ${gameId}`);
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
    // Return the aggregated results
    return res.status(200).json({
      success: true,
      summary: {
        gamename: "MICRO GAMING",
        gamecategory: "Slot Games",
        users: playerSummary, // Return player summary for each user
      },
    });
  } catch (error) {
    console.log(
      "MICRO GAMING SLOT: Failed to fetch win/loss report:",
      error.message
    );
    return res.status(500).json({
      success: false,
      message: {
        en: "MICRO GAMING SLOT: Failed to fetch win/loss report",
        zh: "MICRO GAMING SLOT: 获取盈亏报告失败",
      },
    });
  }
});

router.post("/api/microgaminglive/getturnoverforrebate", async (req, res) => {
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

    console.log("MICRO GAMING LIVE QUERYING TIME", startDate, endDate);

    const records = await SlotLiveMicroGamingModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      cancel: { $ne: true },
      settle: true,
      gameType: "LIVE",
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
        console.warn(`MICRO GAMING LIVE User not found for gameId: ${gameId}`);
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
        gamename: "MICRO GAMING",
        gamecategory: "Live Casino",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log(
      "MICRO GAMING LIVE: Failed to fetch win/loss report:",
      error.message
    );
    return res.status(500).json({
      success: false,
      message: {
        en: "MICRO GAMING LIVE: Failed to fetch win/loss report",
        zh: "MICRO GAMING LIVE: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/microgaminglive/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLiveMicroGamingModal.find({
        username: user.gameId,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        settle: true,
        gameType: "LIVE",
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
          gamename: "MICRO GAMING",
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
        "MICRO GAMING LIVE: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "MICRO GAMING LIVE: Failed to fetch win/loss report",
          zh: "MICRO GAMING LIVE: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/microgaminglive/:userId/gamedata",
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

          if (liveCasino["MICRO GAMING"]) {
            totalTurnover += liveCasino["MICRO GAMING"].turnover || 0;
            totalWinLoss += liveCasino["MICRO GAMING"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "MICRO GAMING",
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
        "MICRO GAMING LIVE: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "MICRO GAMING LIVE: Failed to fetch win/loss report",
          zh: "MICRO GAMING LIVE: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/microgamingslot/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLiveMicroGamingModal.find({
        username: user.gameId,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        settle: true,
        gameType: "SLOT",
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
          gamename: "MICRO GAMING",
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
        "MICRO GAMING SLOT: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "MICRO GAMING SLOT: Failed to fetch win/loss report",
          zh: "MICRO GAMING SLOT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/microgamingslot/:userId/gamedata",
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

          if (slotGames["MICRO GAMING"]) {
            totalTurnover += slotGames["MICRO GAMING"].turnover || 0;
            totalWinLoss += slotGames["MICRO GAMING"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "MICRO GAMING",
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
        "MICRO GAMING: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "MICRO GAMING SLOT: Failed to fetch win/loss report",
          zh: "MICRO GAMING SLOT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/microgamingslot/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLiveMicroGamingModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        settle: true,
        gameType: "SLOT",
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
          gamename: "MICRO GAMING",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error(
        "MICRO GAMING SLOT: Failed to fetch win/loss report:",
        error
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "MICRO GAMING SLOT: Failed to fetch win/loss report",
          zh: "MICRO GAMING SLOT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/microgaminglive/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLiveMicroGamingModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        settle: true,
        gameType: "LIVE",
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
          gamename: "MICRO GAMING",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error(
        "MICRO GAMING LIVE: Failed to fetch win/loss report:",
        error
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "MICRO GAMING LIVE: Failed to fetch win/loss report",
          zh: "MICRO GAMING LIVE: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/microgamingslot/kioskreport",
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

          if (liveCasino["MICRO GAMING"]) {
            totalTurnover += Number(liveCasino["MICRO GAMING"].turnover || 0);
            totalWinLoss +=
              Number(liveCasino["MICRO GAMING"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "MICRO GAMING",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error(
        "MICRO GAMING SLOT: Failed to fetch win/loss report:",
        error
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "MICRO GAMING SLOT: Failed to fetch win/loss report",
          zh: "MICRO GAMING SLOT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/microgaminglive/kioskreport",
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

          if (liveCasino["MICRO GAMING"]) {
            totalTurnover += Number(liveCasino["MICRO GAMING"].turnover || 0);
            totalWinLoss +=
              Number(liveCasino["MICRO GAMING"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "MICRO GAMING",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error(
        "MICRO GAMING LIVE: Failed to fetch win/loss report:",
        error
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "MICRO GAMING LIVE: Failed to fetch win/loss report",
          zh: "MICRO GAMING LIVE: 获取盈亏报告失败",
        },
      });
    }
  }
);

module.exports = router;
