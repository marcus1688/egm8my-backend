const moment = require("moment");
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
const GameWalletLog = require("../../models/gamewalletlog.model");
const SlotPlaytechModal = require("../../models/slot_playtech.model");
const GamePlaytechGameModal = require("../../models/slot_playtechDatabase.model");

require("dotenv").config();

//Staging
const playtechKioskKey = process.env.PLAYTECH_SECRET;
const playtechKioskName = "SJ82_EGM8MYR";
const playtechPrefix = "EG8MY";
const playtechServerName = "AGCASINO";
const webURL = "https://www.bm8my.vip/";
const playtechApiURL = "https://api.agmidway.com";
const cashierURL = "https://www.bm8my.vip/myaccount/deposit";

const errorResponses = {
  playerNotFound: (requestId) => ({
    requestId,
    error: {
      code: "ERR_PLAYER_NOT_FOUND",
      description: null,
    },
  }),
  authFailed: (requestId) => ({
    requestId,
    error: {
      code: "ERR_AUTHENTICATION_FAILED",
    },
  }),
  insufficientFunds: (requestId) => ({
    requestId,
    error: {
      code: "ERR_INSUFFICIENT_FUNDS",
    },
  }),
  systemError: (requestId) => ({
    requestId: requestId || "",
    error: {
      code: "INTERNAL_ERROR",
    },
  }),
};

// async function updateBTGamingManualOrderTimestampsPlus() {
//   try {
//     // List of gameIDs in order (AB1541 = latest, AB1501 = oldest)
//     const gameIds = [
//       "pop_001378cc_qsp",
//       "pop_df0ef2b4_qsp",
//       "gpas_bufbcc_pop",
//       "pop_dab02c60_qsp",
//       "pop_356b244b_qsp",
//       "pop_c8bbebef_qsp",
//       "pop_e889d9ed_qsp",
//       "pop_c31025fb_qsp",
//       "pop_340fe252_qsp",
//       "pop_f6d36d30_qsp",
//       "pop_e77bbaaf_qsp",
//       "pop_d2c001cd_qsp",
//       "pop_bfb58dd2_qsp",
//       "pop_89191489_qsp",
//       "pop_9d921557_qsp",
//       "pop_e5856c4b_qsp",
//       "pop_db8e20f2_qsp",
//       "pop_92790dc4_qsp",
//       "pop_68f6f2e6_qsp",
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
//       const result = await GamePlaytechGameModal.collection.updateOne(
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
//     const updatedGames = await GamePlaytechGameModal.find(
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

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

const validateAndExtractUsername = (fullUsername) => {
  if (!fullUsername.startsWith(playtechPrefix)) return fullUsername;
  return fullUsername.slice(playtechPrefix.length + 1);
};

function generateTransactionId(length = 8, prefix = "") {
  // Ensure length doesn't exceed 10 characters
  const maxLength = 10;
  const actualLength = Math.min(length, maxLength);

  // Characters to use in the transaction ID (alphanumeric)
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  // Generate random characters
  for (let i = 0; i < actualLength; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }

  // If a prefix is provided, make sure the total length doesn't exceed 10
  let finalId = prefix + result;
  if (finalId.length > maxLength) {
    // Truncate the random part to ensure total length is 10
    finalId = prefix + result.substring(0, maxLength - prefix.length);
  }

  return finalId;
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

const generateRandomCode = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }

  return result;
};

function getFormattedGMTTime(date) {
  const momentDate = date ? moment(date) : moment();

  return momentDate.utc().format("YYYY-MM-DD HH:mm:ss.SSS");
}

router.post("/api/playtech/getgamelist", async (req, res) => {
  try {
    const games = await GamePlaytechGameModal.find({
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
    console.error("PLAYTECH Error fetching game list:", error);
    return res.status(200).json({
      success: false,
      message: {
        en: "PLAYTECH: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "PLAYTECH: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "PLAYTECH: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "PLAYTECH: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "PLAYTECH: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/playtech/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameCode, clientPlatform, gameLang } = req.body;
    const user = await User.findById(req.user.userId);

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

    if (user.gameLock.playtechslot.lock) {
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

    let lang = "en";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "zh";
    } else if (gameLang === "ms") {
      lang = "ms";
    } else if (gameLang === "id") {
      lang = "en";
    } else if (gameLang === "zh_hk") {
      lang = "zh";
    }

    let platform = "web";
    if (clientPlatform === "web") {
      platform = "web";
    } else if (clientPlatform === "mobile") {
      platform = "mobile";
    }

    const requestId = uuidv4();

    const externalToken = `${playtechPrefix}_${generateRandomCode()}`;
    const requestBody = {
      requestId,
      serverName: playtechServerName,
      username: `${playtechPrefix}_${user.gameId}`,
      gameCodeName: gameCode,
      clientPlatform: platform,
      externalToken,
      language: lang,
      lobbyUrl: webURL,
    };
    const headers = {
      "Content-Type": "application/json",
      "x-auth-kiosk-key": playtechKioskKey,
    };

    const response = await axios.post(
      `${playtechApiURL}/from-operator/getGameLaunchUrl`,
      requestBody,
      { headers }
    );

    if (response.data.code !== 200) {
      console.log("PLAYTECH error to launch game", response.data);
      return res.status(200).json({
        success: false,
        message: {
          en: "PLAYTECH: Game launch failed. Please try again or customer service for assistance.",
          zh: "PLAYTECH: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "PLAYTECH: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "PLAYTECH: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "PLAYTECH: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "PLAYTECH SLOT"
    );

    const updatedUser = await User.findOneAndUpdate(
      { _id: req.user.userId },
      {
        playtechGameToken: externalToken,
      },
      { new: true }
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
    console.log("PLAYTECH error to launch game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "PLAYTECH: Game launch failed. Please try again or customer service for assistance.",
        zh: "PLAYTECH: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "PLAYTECH: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "PLAYTECH: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "PLAYTECH: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/api/playtechlive/launchGame",
  authenticateToken,
  async (req, res) => {
    try {
      const { clientPlatform, gameLang } = req.body;
      const user = await User.findById(req.user.userId);

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

      if (user.gameLock.playtechlive.lock) {
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

      let lang = "en";

      if (gameLang === "en") {
        lang = "en";
      } else if (gameLang === "zh") {
        lang = "zh";
      } else if (gameLang === "ms") {
        lang = "ms";
      } else if (gameLang === "id") {
        lang = "en";
      } else if (gameLang === "zh_hk") {
        lang = "zh";
      }

      let platform = "web";
      if (clientPlatform === "web") {
        platform = "web";
      } else if (clientPlatform === "mobile") {
        platform = "mobile";
      }

      const requestId = uuidv4();

      const externalToken = `${playtechPrefix}_${generateRandomCode()}`;

      const requestBody = {
        requestId,
        serverName: playtechServerName,
        username: `${playtechPrefix}_${user.gameId}`,
        gameCodeName: "bjl",
        clientPlatform: platform,
        externalToken,
        language: lang,
        lobbyUrl: webURL,
        depositUrl: cashierURL,
      };

      const headers = {
        "Content-Type": "application/json",
        "x-auth-kiosk-key": playtechKioskKey,
      };

      const response = await axios.post(
        `${playtechApiURL}/from-operator/getGameLaunchUrl`,
        requestBody,
        { headers }
      );

      if (response.data.code !== 200) {
        console.log("PLAYTECH error to launch game", response.data);
        return res.status(200).json({
          success: false,
          message: {
            en: "PLAYTECH: Game launch failed. Please try again or customer service for assistance.",
            zh: "PLAYTECH: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "PLAYTECH: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "PLAYTECH: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
            id: "PLAYTECH: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "PLAYTECH LIVE"
      );

      const updatedUser = await User.findOneAndUpdate(
        { _id: req.user.userId },
        {
          playtechGameToken: externalToken,
        },
        { new: true }
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
      console.log("PLAYTECH error to launch game", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "PLAYTECH: Game launch failed. Please try again or customer service for assistance.",
          zh: "PLAYTECH: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "PLAYTECH: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "PLAYTECH: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "PLAYTECH: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post("/api/playtech/healthcheck", async (req, res) => {
  return res.status(200).json({});
});

router.post("/api/playtech/auth", async (req, res) => {
  const { requestId, username, externalToken } = req.body;

  try {
    const actualUsername = validateAndExtractUsername(username);

    const user = await User.findOne(
      { gameId: actualUsername },
      { _id: 1, playtechGameToken: 1 }
    ).lean();

    if (!user || user.playtechGameToken !== externalToken) {
      console.log("fail auth 1");
      return res
        .status(200)
        .json(
          !user
            ? errorResponses.playerNotFound(requestId)
            : errorResponses.authFailed(requestId)
        );
    }

    return res.status(200).json({
      requestId: requestId,
      username: `${playtechPrefix}_${actualUsername}`,
      permanentExternalToken: externalToken,
      currencyCode: "MYR",
      countryCode: "MY",
    });
  } catch (error) {
    console.error(
      "PLAYTECH: Error in game provider calling pw66 auth api:",
      error.message
    );
    return res.status(200).json(errorResponses.systemError(requestId));
  }
});

router.post("/api/playtech/getbalance", async (req, res) => {
  const { requestId, username, externalToken } = req.body;
  try {
    const actualUsername = validateAndExtractUsername(username);

    const user = await User.findOne(
      { gameId: actualUsername },
      { playtechGameToken: 1, wallet: 1 }
    ).lean();

    if (!user || user.playtechGameToken !== externalToken) {
      console.log("fail getbalance 1");
      return res
        .status(200)
        .json(
          !user
            ? errorResponses.playerNotFound(requestId)
            : errorResponses.authFailed(requestId)
        );
    }

    return res.status(200).json({
      requestId: requestId,
      balance: {
        real: roundToTwoDecimals(user.wallet),
        timestamp: getFormattedGMTTime(),
      },
    });
  } catch (error) {
    console.error(
      "PLAYTECH: Error in game provider calling pw66 getbalance api:",
      error.message
    );
    return res.status(200).json(errorResponses.systemError(requestId));
  }
});

router.post("/api/playtech/logout", async (req, res) => {
  const { requestId, username, externalToken } = req.body;

  try {
    const actualUsername = validateAndExtractUsername(username);

    const user = await User.findOne(
      { gameId: actualUsername },
      { playtechGameToken: 1, _id: 1 }
    ).lean();

    if (!user || user.playtechGameToken !== externalToken) {
      return res
        .status(200)
        .json(
          !user
            ? errorResponses.playerNotFound(requestId)
            : errorResponses.authFailed(requestId)
        );
    }

    await User.updateOne(
      { _id: user._id },
      { $set: { playtechGameToken: null } }
    );

    return res.status(200).json({
      requestId: requestId,
    });
  } catch (error) {
    console.error(
      "PLAYTECH: Error in game provider calling pw66 getbalance api:",
      error.message
    );
    return res.status(200).json(errorResponses.systemError(requestId));
  }
});

router.post("/api/playtech/keepalive", async (req, res) => {
  const { requestId, username, externalToken } = req.body;

  try {
    const actualUsername = validateAndExtractUsername(username);

    const user = await User.findOne(
      { gameId: actualUsername },
      { _id: 1, playtechGameToken: 1 }
    ).lean();

    if (!user || user.playtechGameToken !== externalToken) {
      return res
        .status(200)
        .json(
          !user
            ? errorResponses.playerNotFound(requestId)
            : errorResponses.authFailed(requestId)
        );
    }

    return res.status(200).json({
      requestId: requestId,
    });
  } catch (error) {
    console.error(
      "PLAYTECH: Error in game provider calling pw66 keepalive api:",
      error.message
    );
    return res.status(200).json(errorResponses.systemError(requestId));
  }
});

router.post("/api/playtech/bet", async (req, res) => {
  const {
    requestId,
    username,
    externalToken,
    gameRoundCode,
    transactionCode,
    gameCodeName,
    amount,
  } = req.body;

  try {
    const actualUsername = validateAndExtractUsername(username);

    const [user, existingTransaction, existingGameRound, gameInfo] =
      await Promise.all([
        // User query
        User.findOne(
          { gameId: actualUsername },
          {
            playtechGameToken: 1,
            wallet: 1,
            "gameLock.playtechslot.lock": 1,
            "gameLock.playtechlive.lock": 1,
          }
        ).lean(),

        // Existing transaction check
        SlotPlaytechModal.findOne(
          { transactionCode, bet: true },
          { externalTransactionCode: 1 }
        ).lean(),

        SlotPlaytechModal.findOne({ gameRoundCode }, { _id: 1 }).lean(),

        GamePlaytechGameModal.findOne(
          { gameID: gameCodeName },
          { _id: 1 }
        ).lean(),
      ]);

    const isSlotGame = gameInfo !== null;
    const gameType = isSlotGame ? "SLOT" : "LIVE";
    const isLocked = isSlotGame
      ? user?.gameLock?.playtechslot?.lock
      : user?.gameLock?.playtechlive?.lock;

    if (!user || user.playtechGameToken !== externalToken || isLocked) {
      return res
        .status(200)
        .json(
          !user
            ? errorResponses.playerNotFound(requestId)
            : errorResponses.authFailed(requestId)
        );
    }

    const formattedTime = getFormattedGMTTime();

    if (existingTransaction) {
      return res.status(200).json({
        requestId: requestId,
        externalTransactionCode: existingTransaction.externalTransactionCode,
        externalTransactionDate: formattedTime,
        balance: {
          real: roundToTwoDecimals(user.wallet),
          timestamp: formattedTime,
        },
      });
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        gameId: actualUsername,
        wallet: { $gte: roundToTwoDecimals(amount || 0) },
      },
      { $inc: { wallet: -roundToTwoDecimals(amount || 0) } },
      { new: true, lean: true, projection: { wallet: 1 } }
    );

    if (!updatedUserBalance) {
      return res.status(200).json(errorResponses.insufficientFunds(requestId));
    }

    const ourTransactionID = generateTransactionId();

    await SlotPlaytechModal.create({
      username: actualUsername,
      transactionCode,
      externalTransactionCode: ourTransactionID,
      bet: true,
      ...(existingGameRound && { settle: true, settleAmount: 0 }),
      betamount: roundToTwoDecimals(amount || 0),
      gameRoundCode,
      gametype: gameType,
    });

    return res.status(200).json({
      requestId: requestId,
      externalTransactionCode: ourTransactionID,
      externalTransactionDate: formattedTime,
      balance: {
        real: roundToTwoDecimals(updatedUserBalance.wallet),
        timestamp: formattedTime,
      },
    });
  } catch (error) {
    console.error(
      "Error processing bet playtech calling from game provider:",
      error
    );
    return res.status(200).json(errorResponses.systemError(requestId));
  }
});

// GAMEROUNDRESULT endpoint
router.post("/api/playtech/gameround", async (req, res) => {
  const { requestId, username, externalToken, gameRoundCode, pay } = req.body;

  try {
    const actualUsername = validateAndExtractUsername(username);

    const ourTransactionID = generateTransactionId();
    const formattedTime = getFormattedGMTTime();

    const user = await User.findOne(
      { gameId: actualUsername },
      { _id: 1, playtechGameToken: 1, wallet: 1 }
    ).lean();

    if (!user || user.playtechGameToken !== externalToken) {
      return res
        .status(200)
        .json(
          !user
            ? errorResponses.playerNotFound(requestId)
            : errorResponses.authFailed(requestId)
        );
    }

    // Process GAMEROUNDRESULT without pay (just a result with no win)
    if (!pay) {
      await SlotPlaytechModal.updateMany(
        {
          gameRoundCode,
          username: actualUsername,
        },
        {
          $set: {
            settle: true,
            settleamount: 0,
            externalSettleTransactionCode: ourTransactionID,
          },
        }
      );

      return res.status(200).json({
        requestId: requestId,
        externalTransactionCode: ourTransactionID,
        externalTransactionDate: formattedTime,
        balance: {
          real: roundToTwoDecimals(user.wallet),
          timestamp: formattedTime,
        },
      });
    }

    const { transactionCode, amount, type } = pay;

    const existingTransaction = await SlotPlaytechModal.findOne({
      settleTransactionCode: transactionCode,
      settle: true,
    }).lean();

    if (existingTransaction) {
      return res.status(200).json({
        requestId: requestId,
        externalTransactionCode: ourTransactionID,
        externalTransactionDate: formattedTime,
        balance: {
          real: roundToTwoDecimals(user.wallet),
          timestamp: formattedTime,
        },
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: actualUsername },
        { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
        { new: true, lean: true, projection: { wallet: 1 } }
      ),

      SlotPlaytechModal.findOneAndUpdate(
        { gameRoundCode, username: actualUsername, settle: { $ne: true } },
        {
          $set: {
            settle: true,
            settleamount: roundToTwoDecimals(amount || 0),
            settleTransactionCode: transactionCode,
            externalSettleTransactionCode: ourTransactionID,
            ...(type === "REFUND" && { cancel: true }),
          },
          $setOnInsert: {
            gameRoundCode,
            username: actualUsername,
            bet: true,
            betamount: 0,
          },
        },
        {
          upsert: true,
        }
      ),
    ]);

    return res.status(200).json({
      requestId: requestId,
      externalTransactionCode: ourTransactionID,
      externalTransactionDate: formattedTime,
      balance: {
        real: roundToTwoDecimals(updatedUserBalance.wallet),
        timestamp: formattedTime,
      },
    });
  } catch (error) {
    console.error("Error processing game round result:", error);
    return res.status(200).json(errorResponses.systemError(requestId));
  }
});

router.post("/api/playtech/transferfund", async (req, res) => {
  const { requestId, username, transactionCode, amount } = req.body;

  try {
    const actualUsername = validateAndExtractUsername(username);
    const ourTransactionID = generateTransactionId();
    const formattedTime = getFormattedGMTTime();

    const [user, existingTransaction] = await Promise.all([
      // Get user data
      User.findOne({ gameId: actualUsername }, { _id: 1, wallet: 1 }).lean(),

      SlotPlaytechModal.findOne(
        { bonusTransactionCode: transactionCode, bonus: true },
        { _id: 1 }
      ).lean(),
    ]);

    if (!user) {
      return res.status(200).json(errorResponses.playerNotFound(requestId));
    }

    if (existingTransaction) {
      return res.status(200).json({
        requestId: requestId,
        externalTransactionCode: ourTransactionID,
        externalTransactionDate: formattedTime,
        balance: {
          real: roundToTwoDecimals(user.wallet),
          timestamp: formattedTime,
        },
      });
    }

    const [updatedUserBalance] = await Promise.all([
      // Update user balance
      User.findOneAndUpdate(
        { gameId: actualUsername },
        { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
        { new: true, lean: true, projection: { wallet: 1 } }
      ),

      SlotPlaytechModal.create({
        username: actualUsername,
        bonus: true,
        settleamount: roundToTwoDecimals(amount || 0),
        bonusTransactionCode: transactionCode,
        externalBonusTransactionCode: ourTransactionID,
      }),
    ]);

    return res.status(200).json({
      requestId: requestId,
      externalTransactionCode: ourTransactionID,
      externalTransactionDate: formattedTime,
      balance: {
        real: roundToTwoDecimals(updatedUserBalance.wallet),
        timestamp: formattedTime,
      },
    });
  } catch (error) {
    console.error("Error processing game round result:", error);
    return res.status(200).json({
      requestId: req.body.requestId || "",
      error: {
        code: "SYSTEM_ERROR",
        message: "Internal server error",
      },
    });
  }
});

router.post("/api/playtech/notifybonus", async (req, res) => {
  const {
    requestId,
    username,
    remoteBonusCode,
    bonusInstanceCode,
    resultingStatus,
    date,
    bonusBalanceChange,
    freeSpinsChange,
    goldenChipsChange,
    bonusTemplateId,
    freeSpinValue,
  } = req.body;

  try {
    const actualUsername = validateAndExtractUsername(username);

    const [user, existingBonusEvent] = await Promise.all([
      // Get user data
      User.findOne({ gameId: actualUsername }, { _id: 1 }).lean(),

      // Check if this bonus event was already processed
      SlotPlaytechModal.findOne(
        {
          bonusEvent: true,
          bonusInstanceCode,
          remoteBonusCode,
          resultingStatus,
        },
        { _id: 1 }
      ).lean(), // Only fetch ID for efficiency
    ]);

    if (!user) {
      return res.status(200).json(errorResponses.playerNotFound(requestId));
    }

    if (existingBonusEvent) {
      return res.status(200).json({
        requestId: requestId,
      });
    }

    const promises = [
      SlotPlaytechModal.create({
        username: actualUsername,
        bonusEvent: true,
        remoteBonusCode,
        bonusInstanceCode,
        resultingStatus,
        eventDate: new Date(date),
        bonusBalanceChange: roundToTwoDecimals(bonusBalanceChange || 0),
        freeSpinsChange,
        goldenChipsChange,
        bonusTemplateId,
        freeSpinValue: roundToTwoDecimals(freeSpinValue || 0),
        gametype: "SLOT",
      }),
    ];

    await Promise.all(promises);

    // Return success response
    return res.status(200).json({
      requestId: requestId,
    });
  } catch (error) {
    return res.status(200).json(errorResponses.systemError(requestId));
  }
});

// ----------------
router.post("/api/playtechslot/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotPlaytechModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      $or: [{ gametype: "SLOT" }, { gametype: { $exists: false } }],
      settle: true,
      cancel: { $ne: true },
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
        console.warn(`Playtech User not found for gameId: ${gameId}`);
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
        gamename: "PLAYTECH",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("PLAYTECH: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "PLAYTECH: Failed to fetch win/loss report",
        zh: "PLAYTECH: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/playtechslot/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotPlaytechModal.find({
        username: user.gameId,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        $or: [{ gametype: "SLOT" }, { gametype: { $exists: false } }],
        settle: true,
        cancel: { $ne: true },
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
          gamename: "PLAYTECH",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("PLAYTECH: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "PLAYTECH: Failed to fetch win/loss report",
          zh: "PLAYTECH: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/playtechslot/:userId/gamedata",
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

          if (gameCat["PLAYTECH"]) {
            totalTurnover += gameCat["PLAYTECH"].turnover || 0;
            totalWinLoss += gameCat["PLAYTECH"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PLAYTECH",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("PLAYTECH: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "PLAYTECH: Failed to fetch win/loss report",
          zh: "PLAYTECH: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/playtechslot/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotPlaytechModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        $or: [{ gametype: "SLOT" }, { gametype: { $exists: false } }],
        settle: true,
        cancel: { $ne: true },
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
          gamename: "PLAYTECH",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("PLAYTECH: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "PLAYTECH: Failed to fetch win/loss report",
          zh: "PLAYTECH: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/playtechslot/kioskreport",
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

          if (gameCat["PLAYTECH"]) {
            totalTurnover += Number(gameCat["PLAYTECH"].turnover || 0);
            totalWinLoss += Number(gameCat["PLAYTECH"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PLAYTECH",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("PLAYTECH: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "PLAYTECH: Failed to fetch win/loss report",
          zh: "PLAYTECH: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ----------------
router.post("/api/playtechlive/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotPlaytechModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "LIVE",
      settle: true,
      cancel: { $ne: true },
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
        console.warn(`Playtech Live User not found for gameId: ${gameId}`);
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
        gamename: "PLAYTECH",
        gamecategory: "Live Casino",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("PLAYTECH: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "PLAYTECH: Failed to fetch win/loss report",
        zh: "PLAYTECH: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/playtechlive/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotPlaytechModal.find({
        username: user.gameId,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "LIVE",
        settle: true,
        cancel: { $ne: true },
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
          gamename: "PLAYTECH",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("PLAYTECH: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "PLAYTECH: Failed to fetch win/loss report",
          zh: "PLAYTECH: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/playtechlive/:userId/gamedata",
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
          const gameCat = Object.fromEntries(gameCategories["Live Casino"]);

          if (gameCat["PLAYTECH"]) {
            totalTurnover += gameCat["PLAYTECH"].turnover || 0;
            totalWinLoss += gameCat["PLAYTECH"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PLAYTECH",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("PLAYTECH: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "PLAYTECH: Failed to fetch win/loss report",
          zh: "PLAYTECH: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/playtechlive/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotPlaytechModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "LIVE",
        settle: true,
        cancel: { $ne: true },
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
          gamename: "PLAYTECH",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("PLAYTECH: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "PLAYTECH: Failed to fetch win/loss report",
          zh: "PLAYTECH: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/playtechlive/kioskreport",
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
          const gameCat = Object.fromEntries(gameCategories["Live Casino"]);

          if (gameCat["PLAYTECH"]) {
            totalTurnover += Number(gameCat["PLAYTECH"].turnover || 0);
            totalWinLoss += Number(gameCat["PLAYTECH"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PLAYTECH",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("PLAYTECH: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "PLAYTECH: Failed to fetch win/loss report",
          zh: "PLAYTECH: 获取盈亏报告失败",
        },
      });
    }
  }
);

module.exports = router;
