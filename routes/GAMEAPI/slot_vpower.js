const express = require("express");
const router = express.Router();
const axios = require("axios");
const moment = require("moment");
const crypto = require("crypto");
const { authenticateToken } = require("../../auth/auth");
const { authenticateAdminToken } = require("../../auth/adminAuth");
const querystring = require("querystring");
const {
  User,
  adminUserWalletLog,
  GameDataLog,
} = require("../../models/users.model");
const { adminUser, adminLog } = require("../../models/adminuser.model");
const GameWalletLog = require("../../models/gamewalletlog.model");
const Decimal = require("decimal.js");
const SlotVPowerModal = require("../../models/slot_vpower.model");
const GameVPowerGameModal = require("../../models/slot_vpowerDatabase.model");
require("dotenv").config();

const webURL = "https://www.bm8my.vip/";
const vpowerAPIURL = "https://sg.kldss223.com/api/v2/ext";
const vpowerGameURL = "https://sg.kldss223.com/api/v2/ext/player/openGame";
const vpowerAPPID = process.env.VPOWER_APPID;
const vpowerAPPSecret = process.env.VPOWER_SECRET;

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

function generateSignature(params, secretKey) {
  const sortedKeys = Object.keys(params)
    .filter((key) => key !== "sign")
    .sort();

  const paramString = sortedKeys
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const stringToSign = paramString + secretKey;
  return crypto.createHash("md5").update(stringToSign).digest("hex");
}

function generateSignatureJSON(
  params,
  secret,
  numericKeys = new Set(["userId"])
) {
  const keys = Object.keys(params);
  let json = "{";
  let first = true;

  for (const k of keys) {
    if (k === "sign") continue;

    const v = params[k];
    if (!first) json += ",";
    json += JSON.stringify(k) + ":";

    if (
      numericKeys.has(k) &&
      (typeof v === "string" || typeof v === "number" || typeof v === "bigint")
    ) {
      json += BigInt(v).toString();
    } else {
      json += JSON.stringify(v);
    }

    first = false;
  }
  json += "}";
  return crypto
    .createHash("md5")
    .update(json + secret)
    .digest("hex");
}
async function registerVpower(user) {
  try {
    const timestamp = Date.now();

    const requestParams = {
      appId: vpowerAPPID,
      timestamp: timestamp,
      username: user.gameId,
    };

    const signature = generateSignature(requestParams, vpowerAPPSecret);
    requestParams.sign = signature;

    const response = await axios.post(
      `${vpowerAPIURL}/createAccount`,
      requestParams,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response?.data?.code === 200) {
      await User.findOneAndUpdate(
        { username: user.username },
        {
          $set: {
            vpowerGameID: String(response.data.data.uid),
          },
        }
      );

      return { success: true };
    }
    console.log("Error Registering VPower", response.data);
    return {
      success: false,
      error: response.data,
    };
  } catch (error) {
    console.error("VPower error in creating member:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function loginVpower(user) {
  try {
    const timestamp = Date.now();

    const requestParams = {
      appId: vpowerAPPID,
      timestamp: timestamp,
      username: user.gameId,
    };

    const signature = generateSignature(requestParams, vpowerAPPSecret);
    requestParams.sign = signature;

    const response = await axios.post(
      `${vpowerAPIURL}/player/login`,
      requestParams,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response?.data?.code === 200) {
      return { success: true, token: response.data.data.token };
    }

    console.log("Error Login VPower", response.data);
    return {
      success: false,
      error: response.data,
    };
  } catch (error) {
    console.error("VPOWER error in creating member:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

router.post("/api/vpower/sync-games", async (req, res) => {
  try {
    const timestamp = Date.now();

    const requestParams = {
      appId: vpowerAPPID,
      timestamp: timestamp,
    };

    const signature = generateSignature(requestParams, vpowerAPPSecret);
    requestParams.sign = signature;

    // Get games from API
    const response = await axios.post(
      `${vpowerAPIURL}/gameExtList`,
      requestParams,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const apiGames = response.data?.data || [];

    // Get all games from database
    const dbGames = await GameVPowerGameModal.find(
      {},
      { gameID: 1, _id: 1 }
    ).lean();

    // Create sets for efficient comparison
    const apiGameIds = new Set(apiGames.map((game) => game.id.toString()));
    const dbGameIds = new Set(dbGames.map((game) => game.gameID));

    // Find missing games (in DB but not in API)
    const missingGameIds = [];
    dbGames.forEach((dbGame) => {
      if (!apiGameIds.has(dbGame.gameID)) {
        missingGameIds.push(dbGame.gameID);
      }
    });

    // Update maintenance status
    const bulkOps = [];

    // Set maintenance = false for games that exist in API
    apiGames.forEach((apiGame) => {
      if (dbGameIds.has(apiGame.id.toString())) {
        bulkOps.push({
          updateOne: {
            filter: { gameID: apiGame.id.toString() },
            update: {
              maintenance: apiGame.isMaintained === 1,
              hot: apiGame.isHot === 1,
            },
          },
        });
      }
    });

    // Set maintenance = true for games missing from API
    missingGameIds.forEach((gameId) => {
      bulkOps.push({
        updateOne: {
          filter: { gameID: gameId },
          update: { maintenance: true },
        },
      });
    });

    // Execute bulk update
    let updateResult = null;
    if (bulkOps.length > 0) {
      updateResult = await GameVPowerGameModal.bulkWrite(bulkOps);
    }

    return res.status(200).json({
      success: true,
      data: {
        totalApiGames: apiGames.length,
        totalDbGames: dbGames.length,
        missingGames: missingGameIds,
        updatedGames: updateResult?.modifiedCount || 0,
      },
      message: {
        en: "Games synchronized successfully.",
        zh: "游戏同步成功。",
        zh_hk: "遊戲同步成功。",
        ms: "Permainan berjaya disegerakkan.",
        id: "Game berhasil disinkronkan.",
      },
    });
  } catch (error) {
    console.error("Error syncing VPower games:", error);
    return res.status(500).json({
      success: false,
      message: {
        en: "Failed to sync games. Please try again.",
        zh: "同步游戏失败，请重试。",
        zh_hk: "同步遊戲失敗，請重試。",
        ms: "Gagal menyegerakkan permainan. Sila cuba lagi.",
        id: "Gagal menyinkronkan game. Silakan coba lagi.",
      },
    });
  }
});

router.post("/api/vpower/getprovidergamelist", async (req, res) => {
  try {
    const timestamp = Date.now();

    const requestParams = {
      appId: vpowerAPPID,
      timestamp: timestamp,
    };

    // Generate signature (exclude sign field from signature generation)
    const signature = generateSignature(requestParams, vpowerAPPSecret);
    requestParams.sign = signature;

    console.log("Request params:", requestParams);
    console.log(`${vpowerAPIURL}/gameExtList`);

    const response = await axios.post(
      `${vpowerAPIURL}/gameExtList`,
      requestParams,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`📊 API Response Status: ${response.status}`);
    console.log(`📊 API Response:`, response.data);

    return res.status(200).json({
      success: true,
      data: response.data,
      message: {
        en: "Games list retrieved successfully.",
        zh: "游戏列表检索成功。",
        ms: "Senarai permainan berjaya diambil.",
        zh_hk: "遊戲列表檢索成功。",
        id: "Daftar permainan berhasil diambil.",
      },
    });
  } catch (error) {
    return res.status(200).json({
      success: false,
      message: {
        en: "VPOWER: Game launch failed. Please try again or customer service for assistance.",
        zh: "VPOWER: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "VPOWER: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/vpower/getgamelist", async (req, res) => {
  try {
    const games = await GameVPowerGameModal.find({
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
      GameType: game.gameType,
      GameImage: game.imageUrlEN || "",
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
        en: "VPOWER: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "VPOWER: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "VPOWER: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "VPOWER: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "VPOWER: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/vpower/launchGame", authenticateToken, async (req, res) => {
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

    if (user.gameLock.vpower.lock) {
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
    if (!user.vpowerGameID) {
      const registration = await registerVpower(user);

      if (!registration.success) {
        console.log(
          "VPOWER registration failed:",
          registration.data || registration.error
        );

        return res.status(200).json({
          success: false,
          message: {
            en: "VPOWER: Game launch failed. Please try again or contact customer service for assistance.",
            zh: "VPOWER: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "VPOWER: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "VPOWER: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
            id: "VPOWER: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }
    }

    const loginToken = await loginVpower(user);

    if (!loginToken.success) {
      console.log(
        "VPOWER registration failed:",
        loginToken.data || loginToken.error
      );

      return res.status(200).json({
        success: false,
        message: {
          en: "VPOWER: Game launch failed. Please try again or contact customer service for assistance.",
          zh: "VPOWER: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "VPOWER: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "VPOWER: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "VPOWER: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    const { gameCode, gameLang } = req.body;

    let lang = "en";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "cn";
    } else if (gameLang === "zh_hk") {
      lang = "zh";
    } else if (gameLang === "ms") {
      lang = "my";
    } else if (gameLang === "id") {
      lang = "ida";
    }

    const timestamp = Date.now();

    const encodedBackUrl = Buffer.from(webURL).toString("base64");

    const requestParams = {
      appId: vpowerAPPID,
      timestamp: timestamp,
      back: encodedBackUrl,
      token: loginToken.token,
      id: gameCode,
      lang: lang,
      closeBack: 0,
      currencyDisplay: false,
    };

    const signature = generateSignature(requestParams, vpowerAPPSecret);
    requestParams.sign = signature;

    const queryParams = new URLSearchParams(requestParams).toString();
    const gameLaunchUrl = `${vpowerGameURL}?${queryParams}`;

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "VPOWER"
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
    console.log("VPOWER error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "VPOWER: Game launch failed. Please try again or contact customer service for assistance.",
        zh: "VPOWER: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "VPOWER: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "VPOWER: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "VPOWER: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/vpower/getbalance", async (req, res) => {
  try {
    const { userId, username, timestamp } = req.body;
    console.log(req.body, "getbalance");
    if (!userId || !username || !timestamp) {
      console.log("failed 1");
      return res.status(200).json({
        code: 6,
        balance: "0",
      });
    }

    const mysign = generateSignatureJSON(req.body, vpowerAPPSecret);

    if (req.headers["x-sign"] !== mysign) {
      console.log(
        "sign validate failed",
        req.headers["x-sign"],
        mysign,
        req.body
      );
      return res.status(200).json({
        code: 4,
        balance: "0",
      });
    }

    const currentUser = await User.findOne(
      { gameId: username },
      { wallet: 1, _id: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(200).json({
        code: 1,
        balance: "0",
      });
    }

    const walletValue = Number(currentUser.wallet);

    const newBalance = new Decimal(walletValue).toDecimalPlaces(4);

    return res.status(200).json({
      code: 0,
      balance: newBalance,
    });
  } catch (error) {
    console.error(
      "VPOWER: Error in game provider calling ae96 get balance api:",
      error.message
    );
    return res.status(200).json({
      code: 2,
      balance: "0",
    });
  }
});

router.post("/api/vpower/bet", async (req, res) => {
  try {
    const {
      username,
      transactionId,
      gameId,
      gameRoundId,
      completed,
      balance,
      type,
    } = req.body;
    if (
      !username ||
      !transactionId ||
      balance === null ||
      balance === undefined
    ) {
      return res.status(200).json({
        code: 6,
        balance: "0",
      });
    }

    const mysign = generateSignatureJSON(req.body, vpowerAPPSecret);

    if (req.headers["x-sign"] !== mysign) {
      console.log(
        "sign validate failed",
        req.headers["x-sign"],
        mysign,
        req.body
      );
      return res.status(200).json({
        code: 4,
        balance: "0",
      });
    }

    const [currentUser, existingBet] = await Promise.all([
      // Get only fields we need, no lean()
      User.findOne(
        { gameId: username },
        {
          wallet: 1,
          "gameLock.vpower.lock": 1,
          _id: 1,
          username: 1,
        }
      ).lean(),
      SlotVPowerModal.findOne(
        { betId: transactionId, bet: true },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        code: 1,
        balance: "0",
      });
    }

    if (currentUser.gameLock?.vpower?.lock) {
      return res.status(200).json({
        code: 5,
        balance: "0",
      });
    }

    if (existingBet) {
      const newBalance = new Decimal(
        Number(currentUser.wallet)
      ).toDecimalPlaces(4);

      return res.status(200).json({
        code: 9,
        balance: newBalance,
      });
    }

    const amount = new Decimal(Number(balance)).toDecimalPlaces(4);

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: amount.toNumber() },
      },
      { $inc: { wallet: -amount.toNumber() } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      const newBalance = new Decimal(
        Number(currentUser.wallet)
      ).toDecimalPlaces(4);

      return res.status(200).json({
        code: 26,
        balance: newBalance,
      });
    }

    await SlotVPowerModal.create({
      username,
      betId: transactionId,
      roundId: gameRoundId,
      bet: true,
      betamount: amount.toNumber(),
    });

    const newBalance = new Decimal(
      Number(updatedUserBalance.wallet)
    ).toDecimalPlaces(4);

    return res.status(200).json({
      code: 0,
      balance: newBalance,
    });
  } catch (error) {
    console.error(
      "VPOWER: Error in game provider calling ae96 get bet api:",
      error
    );
    return res.status(200).json({
      code: 2,
      balance: "0",
    });
  }
});

router.post("/api/vpower/settlement", async (req, res) => {
  try {
    const { username, transactionId, balance, gameRoundId, type } = req.body;
    if (
      !username ||
      !transactionId ||
      balance === null ||
      balance === undefined
    ) {
      return res.status(200).json({
        code: 6,
        balance: "0",
      });
    }

    const mysign = generateSignatureJSON(req.body, vpowerAPPSecret);

    if (req.headers["x-sign"] !== mysign) {
      console.log(
        "sign validate failed",
        req.headers["x-sign"],
        mysign,
        req.body
      );
      return res.status(200).json({
        code: 4,
        balance: "0",
      });
    }

    const [currentUser, existingBet, existingTransaction] = await Promise.all([
      User.findOne({ gameId: username }, { wallet: 1, _id: 1 }).lean(),
      SlotVPowerModal.findOne(
        { roundId: gameRoundId, bet: true },
        { _id: 1 }
      ).lean(),
      SlotVPowerModal.findOne({ settleId: transactionId }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        code: 1,
        balance: "0",
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        code: 7,
        balance: "0",
      });
    }

    if (existingTransaction) {
      const newBalance = new Decimal(
        Number(currentUser.wallet)
      ).toDecimalPlaces(4);

      return res.status(200).json({
        code: 9,
        balance: newBalance,
      });
    }

    const amount = new Decimal(Number(balance)).toDecimalPlaces(4); // Keep as Decimal (not string)

    const [updatedUserBalance] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: amount.toNumber() } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotVPowerModal.findOneAndUpdate(
        { roundId: gameRoundId },
        {
          $set: {
            settle: true,
            settleamount: amount.toNumber(),
            settleId: transactionId,
          },
        },
        { upsert: true }
      ),
    ]);

    const newBalance = new Decimal(
      Number(updatedUserBalance.wallet)
    ).toDecimalPlaces(4);

    return res.status(200).json({
      code: 0,
      balance: newBalance,
    });
  } catch (error) {
    console.error(
      "VPOWER: Error in game provider calling ae96 get game result api:",
      error.message
    );
    return res.status(200).json({
      code: 2,
      balance: "0",
    });
  }
});

router.post("/api/vpower/getturnoverforrebate", async (req, res) => {
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

    console.log("VPOWER QUERYING TIME", startDate, endDate);

    const records = await SlotVPowerModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
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
        console.warn(`VPOWER User not found for gameId: ${gameId}`);
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
        gamename: "VPOWER",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("VPOWER: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "VPOWER: Failed to fetch win/loss report",
        zh: "VPOWER: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/vpower/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotVPowerModal.find({
        username: user.gameId,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
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
          gamename: "VPOWER",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("VPOWER: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "VPOWER: Failed to fetch win/loss report",
          zh: "VPOWER: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/vpower/:userId/gamedata",
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

          if (slotGames["VPOWER"]) {
            totalTurnover += slotGames["VPOWER"].turnover || 0;
            totalWinLoss += slotGames["VPOWER"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "VPOWER",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("VPOWER: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "VPOWER: Failed to fetch win/loss report",
          zh: "VPOWER: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/vpower/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotVPowerModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
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
          gamename: "VPOWER",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("VPOWER: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "VPOWER: Failed to fetch win/loss report",
          zh: "VPOWER: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/vpower/kioskreport",
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

          if (liveCasino["VPOWER"]) {
            totalTurnover += Number(liveCasino["VPOWER"].turnover || 0);
            totalWinLoss += Number(liveCasino["VPOWER"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "VPOWER",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("VPOWER: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "VPOWER: Failed to fetch win/loss report",
          zh: "VPOWER: 获取盈亏报告失败",
        },
      });
    }
  }
);

module.exports = router;
