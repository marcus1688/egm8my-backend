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
const PlaytechDataGameModal = require("../../models/slot_playtechDatabase.model");
const GameWalletLog = require("../../models/gamewalletlog.model");
const PlaytechGameModal = require("../../models/slot_playtech.model");

require("dotenv").config();

//Staging
const playtechKioskKey = process.env.PLAYTECH_SECRET;
const playtechKioskName = "7OC7_OC7SL";
const playtechPrefix = "OC77";
const playtechServerName = "AGCASINO";
const webURL = "https://www.oc7.me/";
const playtechApiURL = "https://api.agmidway.com";
const cashierURL = "https://www.oc7.me/myaccount/deposit";

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

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

const validateAndExtractUsername = (fullUsername) => {
  const prefix = fullUsername.slice(0, 4);

  if (prefix !== playtechPrefix || fullUsername.length <= 6) {
    return fullUsername;
  }

  return fullUsername.replace(`${playtechPrefix}_`, "");
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
    const games = await PlaytechDataGameModal.find({}).sort({
      hot: -1,
      createdAt: 1,
    });

    if (!games || games.length === 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "No games found. Please try again later.",
          zh: "未找到游戏。请稍后再试。",
          ms: "Tiada permainan ditemui. Sila cuba lagi kemudian.",
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
        },
      });
    }

    if (user.gameLock.playtech.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
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
    }

    let platform = "web";
    if (clientPlatform === "web") {
      platform = "web";
    } else if (clientPlatform === "mobile") {
      platform = "mobile";
    }

    const requestId = uuidv4();

    const externalToken = `${playtechPrefix}_${generateRandomCode()}`;

    const loginUsername = user.username.toUpperCase();

    const username = `${playtechPrefix}_${loginUsername}`;

    const requestBody = {
      requestId,
      serverName: playtechServerName,
      username,
      gameCodeName: gameCode,
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
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "PLAYTECH"
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
          },
        });
      }

      if (user.gameLock.playtech.lock) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Your game access has been locked. Please contact customer support for further assistance.",
            zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
            ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
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
      }

      let platform = "web";
      if (clientPlatform === "web") {
        platform = "web";
      } else if (clientPlatform === "mobile") {
        platform = "mobile";
      }

      const requestId = uuidv4();

      const externalToken = `${playtechPrefix}_${generateRandomCode()}`;

      const loginUsername = user.username.toUpperCase();

      const username = `${playtechPrefix}_${loginUsername}`;

      const requestBody = {
        requestId,
        serverName: playtechServerName,
        username,
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
          },
        });
      }

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "PLAYTECH"
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
        },
      });
    }
  }
);

router.post("/api/playtech/healthCheck", async (req, res) => {
  return res.status(200).json({});
});

router.post("/api/playtech/auth", async (req, res) => {
  const { requestId, username, externalToken } = req.body;

  try {
    const actualUsername = validateAndExtractUsername(username);

    const actualLowerCaseUsername = actualUsername.toLowerCase();

    const user = await User.findOne(
      { username: actualLowerCaseUsername },
      { username: 1, playtechGameToken: 1 }
    ).lean();

    if (!user) {
      console.log("failed");
      return res.status(200).json(errorResponses.playerNotFound(requestId));
    }

    if (user.playtechGameToken !== externalToken) {
      console.log("failed1");
      return res.status(200).json(errorResponses.authFailed(requestId));
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

router.post("/api/playtech/getBalance", async (req, res) => {
  const { requestId, username, externalToken } = req.body;
  try {
    const actualUsername = validateAndExtractUsername(username);

    const actualLowerCaseUsername = actualUsername.toLowerCase();

    const user = await User.findOne(
      { username: actualLowerCaseUsername },
      { playtechGameToken: 1, wallet: 1 }
    ).lean();

    if (!user) {
      return res.status(200).json(errorResponses.playerNotFound(requestId));
    }

    if (user.playtechGameToken !== externalToken) {
      return res.status(200).json(errorResponses.authFailed(requestId));
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

    const actualLowerCaseUsername = actualUsername.toLowerCase();

    const user = await User.findOne(
      { username: actualLowerCaseUsername },
      { playtechGameToken: 1, _id: 1 }
    ).lean();

    if (!user) {
      return res.status(200).json(errorResponses.playerNotFound(requestId));
    }

    if (user.playtechGameToken !== externalToken) {
      return res.status(200).json(errorResponses.authFailed(requestId));
    }

    await User.updateOne({ _id: user._id }, { playtechGameToken: null });

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

router.post("/api/playtech/keepAlive", async (req, res) => {
  const { requestId, username, externalToken } = req.body;

  try {
    const actualUsername = validateAndExtractUsername(username);

    const actualLowerCaseUsername = actualUsername.toLowerCase();

    const user = await User.findOne(
      { username: actualLowerCaseUsername },
      { playtechGameToken: 1 }
    ).lean();

    if (!user) {
      return res.status(200).json(errorResponses.playerNotFound(requestId));
    }

    if (user.playtechGameToken !== externalToken) {
      return res.status(200).json(errorResponses.authFailed(requestId));
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

    const actualLowerCaseUsername = actualUsername.toLowerCase();

    const betAmount = roundToTwoDecimals(amount);
    const ourTransactionID = generateTransactionId();

    const [user, existingTransaction, existingGameRound, gameInfo] =
      await Promise.all([
        // User query
        User.findOne(
          { username: actualLowerCaseUsername },
          {
            username: 1,
            playtechGameToken: 1,
            wallet: 1,
            "gameLock.playtech.lock": 1,
          }
        ).lean(),

        // Existing transaction check
        PlaytechGameModal.findOne(
          { transactionCode, bet: true },
          { externalTransactionCode: 1 }
        ).lean(),

        PlaytechGameModal.findOne({ gameRoundCode }, { _id: 1 }).lean(),

        PlaytechDataGameModal.findOne(
          { gameID: gameCodeName },
          { gameType: 1 }
        ).lean(),
      ]);

    if (!user) {
      return res.status(200).json(errorResponses.playerNotFound(requestId));
    }

    if (
      user.playtechGameToken !== externalToken ||
      user.gameLock?.playtech?.lock
    ) {
      return res.status(200).json(errorResponses.authFailed(requestId));
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
        username: user.username,
        wallet: { $gte: roundToTwoDecimals(betAmount || 0) },
      },
      { $inc: { wallet: -roundToTwoDecimals(betAmount || 0) } },
      { new: true, lean: true }
    );

    if (!updatedUserBalance) {
      return res.status(200).json(errorResponses.insufficientFunds(requestId));
    }

    let newTransaction;
    const gameType = gameInfo ? "SLOT" : "LIVE";

    // If there's an existing game round, create a settlement transaction
    if (existingGameRound) {
      newTransaction = new PlaytechGameModal({
        username: user.username,
        transactionCode,
        externalTransactionCode: ourTransactionID,
        bet: true,
        settle: true,
        settleAmount: 0,
        betAmount: roundToTwoDecimals(betAmount),
        gameRoundCode,
        gametype: gameType,
      });
    } else {
      // Create a normal bet transaction
      newTransaction = new PlaytechGameModal({
        username: user.username,
        transactionCode,
        externalTransactionCode: ourTransactionID,
        bet: true,
        betAmount: roundToTwoDecimals(betAmount),
        gameRoundCode,
        gametype: gameType,
      });
    }

    await newTransaction.save();

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
router.post("/api/playtech/gameRound", async (req, res) => {
  const { requestId, username, externalToken, gameRoundCode, pay } = req.body;

  try {
    const actualUsername = validateAndExtractUsername(username);
    const actualLowerCaseUsername = actualUsername.toLowerCase();

    const ourTransactionID = generateTransactionId();
    const formattedTime = getFormattedGMTTime();

    const user = await User.findOne(
      { username: actualLowerCaseUsername },
      { username: 1, playtechGameToken: 1, wallet: 1 }
    ).lean();

    if (!user) {
      return res.status(200).json(errorResponses.playerNotFound(requestId));
    }

    if (user.playtechGameToken !== externalToken) {
      return res.status(200).json(errorResponses.authFailed(requestId));
    }

    // Process GAMEROUNDRESULT without pay (just a result with no win)
    if (!pay) {
      await PlaytechGameModal.updateMany(
        {
          gameRoundCode,
          username: user.username,
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

    const { transactionCode, transactionDate, amount, type } = pay;

    const existingTransaction = await PlaytechGameModal.findOne({
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

    const [updatedUserBalance, _] = await Promise.all([
      // Update user balance
      User.findOneAndUpdate(
        { username: user.username },
        { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
        { new: true, lean: true, projection: { wallet: 1 } }
      ),

      // Update transaction record simultaneously
      PlaytechGameModal.findOneAndUpdate(
        { gameRoundCode, username: user.username, settle: { $ne: true } },
        {
          $set: {
            settle: true,
            settleamount: roundToTwoDecimals(amount),
            settleTransactionCode: transactionCode,
            externalSettleTransactionCode: ourTransactionID,
            ...(type === "REFUND" && { cancel: true }),
          },
          $setOnInsert: {
            gameRoundCode,
            username: user.username,
            bet: true,
            betAmount: 0,
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

router.post("/api/playtech/transferFunds", async (req, res) => {
  const { requestId, username, transactionCode, amount, type, bonusInfo } =
    req.body;

  try {
    const actualUsername = validateAndExtractUsername(username);
    const actualLowerCaseUsername = actualUsername.toLowerCase();
    const ourTransactionID = generateTransactionId();
    const formattedTime = getFormattedGMTTime();

    const [user, existingTransaction] = await Promise.all([
      // Get user data
      User.findOne({ username: actualLowerCaseUsername }, { wallet: 1 }).lean(),

      // Check for existing transaction
      PlaytechGameModal.findOne(
        { bonusTransactionCode: transactionCode, bonus: true },
        { externalBonusTransactionCode: 1 }
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

    const [updatedUserBalance, _] = await Promise.all([
      // Update user balance
      User.findOneAndUpdate(
        { username: user.username },
        { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
        { new: true, lean: true, projection: { wallet: 1 } }
      ),

      // Create transaction record
      PlaytechGameModal.findOneAndUpdate(
        { transactionCode, username: user.username },
        {
          $set: {
            bonus: true,
            settleamount: roundToTwoDecimals(amount),
            bonusTransactionCode: transactionCode,
            externalBonusTransactionCode: ourTransactionID,
          },
        },
        { upsert: true }
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
    return res.status(200).json({
      requestId: req.body.requestId || "",
      error: {
        code: "SYSTEM_ERROR",
        message: "Internal server error",
      },
    });
  }
});

router.post("/api/playtech/notifyBonusEvent", async (req, res) => {
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
    const actualLowerCaseUsername = actualUsername.toLowerCase();

    const [user, existingBonusEvent] = await Promise.all([
      // Get user data
      User.findOne(
        { username: actualLowerCaseUsername },
        { username: 1 }
      ).lean(),

      // Check if this bonus event was already processed
      PlaytechGameModal.findOne(
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

    // Process the bonus event based on status
    if (resultingStatus === "ACCEPTED") {
      // Handle bonus acceptance

      // For bonus balance, we might need to update the user's balance
      if (bonusBalanceChange > 0) {
        await User.findOneAndUpdate(
          { username: user.username },
          { $inc: { wallet: roundToTwoDecimals(bonusBalanceChange || 0) } }
        );
      }
    } else if (resultingStatus === "REMOVED") {
      // For bonus balance removal, we might need to update the user's balance
      if (bonusBalanceChange < 0) {
        await User.findOneAndUpdate(
          { username: user.username },
          { $inc: { wallet: roundToTwoDecimals(bonusBalanceChange || 0) } }
        );
      }
    }

    // Record the bonus event
    const newBonusEvent = new PlaytechGameModal({
      username: user.username,
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
    });
    await newBonusEvent.save();

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

    const records = await PlaytechGameModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      $or: [{ gametype: "SLOT" }, { gametype: { $exists: false } }],
      settle: true,
      cancel: { $ne: true },
    });

    // Aggregate turnover and win/loss for each player
    let playerSummary = {};

    records.forEach((record) => {
      const username = record.username.toLowerCase();

      if (!playerSummary[username]) {
        playerSummary[username] = { turnover: 0, winloss: 0 };
      }

      playerSummary[username].turnover += record.betAmount || 0;

      playerSummary[username].winloss +=
        (record.settleamount || 0) - (record.betAmount || 0);
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

      const records = await PlaytechGameModal.find({
        username: user.username.toLowerCase(),
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
        totalTurnover += record.betAmount || 0;
        totalWinLoss += (record.settleamount || 0) - (record.betAmount || 0);
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
        username: user.username.toLowerCase(),
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

      const records = await PlaytechGameModal.find({
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
        totalTurnover += record.betAmount || 0;

        totalWinLoss += (record.betAmount || 0) - (record.settleamount || 0);
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

    const records = await PlaytechGameModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "LIVE",
      settle: true,
      cancel: { $ne: true },
    });

    // Aggregate turnover and win/loss for each player
    let playerSummary = {};

    records.forEach((record) => {
      const username = record.username.toLowerCase();

      if (!playerSummary[username]) {
        playerSummary[username] = { turnover: 0, winloss: 0 };
      }

      playerSummary[username].turnover += record.betAmount || 0;

      playerSummary[username].winloss +=
        (record.settleamount || 0) - (record.betAmount || 0);
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

      const records = await PlaytechGameModal.find({
        username: user.username.toLowerCase(),
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
        totalTurnover += record.betAmount || 0;
        totalWinLoss += (record.settleamount || 0) - (record.betAmount || 0);
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
        username: user.username.toLowerCase(),
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

      const records = await PlaytechGameModal.find({
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
        totalTurnover += record.betAmount || 0;

        totalWinLoss += (record.betAmount || 0) - (record.settleamount || 0);
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
