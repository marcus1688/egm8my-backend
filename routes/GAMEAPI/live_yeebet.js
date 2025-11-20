const express = require("express");
const router = express.Router();
const axios = require("axios");
const moment = require("moment");
const crypto = require("crypto");
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
const LiveYeebetModal = require("../../models/live_yeebet.model");

require("dotenv").config();

const webURL = "https://www.bm8my.vip/";
const yeebetAPIURL = "https://api.yeebet.vip";
const yeebetSecret = process.env.YEEBET_SECRET;
const yeebetAppID = "EGM8MYR";
const yeebetLaunchAppID = "xtdYNVD83P50";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

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

function generateSignature(params, secretKey) {
  // Remove null/undefined/empty values
  const filtered = Object.entries(params).filter(
    ([_, v]) => v !== undefined && v !== ""
  );

  const sorted = filtered.sort(([a], [b]) => a.localeCompare(b));

  const paramString = sorted.map(([k, v]) => `${k}=${v}`).join("&");

  const finalString = `${paramString}&key=${secretKey}`;
  return crypto.createHash("md5").update(finalString).digest("hex");
}

router.post("/api/yeebet/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, clientPlatform } = req.body;
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

    if (user.gameLock.yeebet.lock) {
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

    let lang = 6;

    if (gameLang === "en") {
      lang = 2;
    } else if (gameLang === "zh") {
      lang = 1;
    } else if (gameLang === "zh_hk") {
      lang = 6;
    } else if (gameLang === "ms") {
      lang = 11;
    } else if (gameLang === "id") {
      lang = 11;
    }

    let platform = 1;
    if (clientPlatform === "web") {
      platform = 1;
    } else if (clientPlatform === "mobile") {
      platform = 2;
    }

    const params = {
      appid: yeebetLaunchAppID,
      username: user.gameId,
      nickname: user.username,
      iscreate: 1,
      clienttype: platform,
      language: lang,
      currency: "MYR",
      returnurl: webURL,
    };
    const sign = generateSignature(params, yeebetSecret);

    const fullParams = { ...params, sign };

    const query = new URLSearchParams(fullParams).toString();

    const response = await axios.post(`${yeebetAPIURL}/api/login?${query}`, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (response.data.result !== 0) {
      console.log("YEEBET error in launching game", response.data);

      return res.status(200).json({
        success: false,
        message: {
          en: "YEEBET: Game launch failed. Please try again or contact customer service for assistance.",
          zh: "YEEBET: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "YEEBET: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "YEEBET: 遊戲開唔到，老闆試多次或者搵客服幫手。",
          id: "YEEBET: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "YEEBET"
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data.openurl,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("YEEBET error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "YEEBET: Game launch failed. Please try again or customer service for assistance.",
        zh: "YEEBET: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "YEEBET: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "YEEBET: 遊戲開唔到，老闆試多次或者搵客服幫手。",
        id: "YEEBET: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.get("/api/yeebetmy/balance", async (req, res) => {
  try {
    const { appid, username, notifyid, sign } = req.query;
    if (!appid || !username || !sign) {
      return res.status(200).json({
        result: -1002,
        desc: "参数错误，请检查所传参数",
      });
    }
    if (appid !== yeebetAppID) {
      console.log("failed 2");
      return res.status(200).json({
        result: -1005,
        desc: "Appid错误",
      });
    }
    const paramsForSign = { ...req.query };
    delete paramsForSign.sign;
    const generatedSign = generateSignature(paramsForSign, yeebetSecret);

    if (sign !== generatedSign) {
      console.log("failed 1");
      return res.status(200).json({
        result: -1007,
        desc: "签名错误，请检查签名",
      });
    }

    const currentUser = await User.findOne(
      { gameId: username },
      { wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(200).json({
        result: -1012,
        desc: "用户不存在",
      });
    }

    return res.status(200).json({
      result: "0",
      desc: "OK",
      balance: roundToTwoDecimals(currentUser.wallet),
    });
  } catch (error) {
    console.error(
      "YEEBET: Error in game provider calling  getbalance api:",
      error.message
    );
    return res.status(200).json({
      result: -1000,
      desc: "系统未知异常，请联系客服处理",
    });
  }
});

router.post("/api/yeebetmy/withdraw", async (req, res) => {
  try {
    const {
      appid,
      username,
      amount,
      notifyid,
      type,
      serialnumber,
      sign,
      bets,
    } = req.body;

    if (
      !appid ||
      !username ||
      !notifyid ||
      !type ||
      !serialnumber ||
      !sign ||
      amount === undefined ||
      amount === null
    ) {
      return res.status(200).json({
        result: -1002,
        desc: "参数错误，请检查所传参数",
      });
    }

    if (appid !== yeebetAppID) {
      return res.status(200).json({
        result: -1005,
        desc: "Appid错误",
      });
    }

    const paramsForSign = { ...req.body };
    delete paramsForSign.sign;
    delete paramsForSign.bets;

    const generatedSign = generateSignature(paramsForSign, yeebetSecret);

    if (sign !== generatedSign) {
      return res.status(200).json({
        result: -1007,
        desc: "签名错误，请检查签名",
      });
    }

    const ourTransactionID = generateTransactionId();

    const [currentUser, existingBet] = await Promise.all([
      User.findOne(
        { gameId: username },
        { _id: 1, wallet: 1, "gameLock.yeebet.lock": 1, username: 1 }
      ).lean(),
      LiveYeebetModal.findOne(
        { tranId: notifyid, bet: true },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        result: -1012,
        desc: "用户不存在",
      });
    }

    if (currentUser.gameLock?.yeebet?.lock) {
      return res.status(200).json({
        result: -1001,
        desc: "账户已被封锁，请联系客服",
      });
    }

    if (existingBet) {
      return res.status(200).json({
        result: "0",
        desc: "OK",
        balance: roundToTwoDecimals(currentUser.wallet),
        serialnumber,
        orderno: ourTransactionID,
      });
    }

    const updatedUser = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: roundToTwoDecimals(Math.abs(amount)) },
      },
      {
        $inc: { wallet: roundToTwoDecimals(amount) }, // deductionAmount is already negative
      },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUser) {
      return res.status(200).json({
        result: -1030,
        desc: "扣款金额不足",
      });
    }

    await LiveYeebetModal.create({
      tranId: notifyid,
      username: username,
      betId: serialnumber,
      betamount: roundToTwoDecimals(Math.abs(amount)),
      bet: true,
    });

    return res.status(200).json({
      result: "0",
      desc: "OK",
      balance: roundToTwoDecimals(updatedUser.wallet),
      serialnumber,
      orderno: ourTransactionID,
    });
  } catch (error) {
    console.error(
      "YEEBET: Error in game provider calling  getbalance api:",
      error.message
    );
    return res.status(200).json({
      result: -1000,
      desc: "系统未知异常，请联系客服处理",
    });
  }
});

router.post("/api/yeebetmy/deposit", async (req, res) => {
  try {
    // Extract parameters from request body
    const {
      appid,
      username,
      amount,
      notifyid,
      type,
      serialnumber,
      sign,
      bets,
    } = req.body;
    if (
      !appid ||
      !username ||
      !notifyid ||
      !type ||
      !serialnumber ||
      !sign ||
      amount === undefined ||
      amount === null
    ) {
      return res.status(200).json({
        result: -1002,
        desc: "参数错误，请检查所传参数",
      });
    }

    if (appid !== yeebetAppID) {
      return res.status(200).json({
        result: -1005,
        desc: "Appid错误",
      });
    }

    const paramsForSign = { ...req.body };
    delete paramsForSign.sign;
    delete paramsForSign.bets;

    const generatedSign = generateSignature(paramsForSign, yeebetSecret);

    if (sign !== generatedSign) {
      return res.status(200).json({
        result: -1007,
        desc: "签名错误，请检查签名",
      });
    }

    const ourTransactionID = generateTransactionId();

    const [currentUser, existingSettle, existingBet] = await Promise.all([
      User.findOne({ gameId: username }, { _id: 1, wallet: 1 }).lean(),
      LiveYeebetModal.findOne({ tranId: notifyid }, { _id: 1 }).lean(),
      LiveYeebetModal.findOne({ betId: serialnumber }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        result: -1012,
        desc: "用户不存在",
      });
    }

    if (existingSettle) {
      return res.status(200).json({
        result: "0",
        desc: "OK",
        balance: roundToTwoDecimals(currentUser.wallet),
        orderno: ourTransactionID,
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        result: -1001,
        desc: "网络异常",
      });
    }

    let betsjson;
    try {
      betsjson = typeof bets === "string" ? JSON.parse(bets) : bets;
    } catch (e) {
      console.error("Failed to parse bets:", e);
      betsjson = null;
    }

    const updateObj = {
      settle: true,
      settleamount: roundToTwoDecimals(amount),
    };
    // Add betamount if bets.commamount exists
    if (
      betsjson &&
      betsjson.commamount !== undefined &&
      betsjson.commamount !== null
    ) {
      updateObj.betamount = roundToTwoDecimals(betsjson.commamount);
    }

    const [updatedUser] = await Promise.all([
      User.findOneAndUpdate(
        { _id: currentUser._id },
        { $inc: { wallet: roundToTwoDecimals(amount) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      LiveYeebetModal.updateOne({ betId: serialnumber }, { $set: updateObj }),
    ]);

    // Return successful response
    return res.status(200).json({
      result: "0",
      desc: "OK",
      balance: roundToTwoDecimals(updatedUser.wallet),
      orderno: ourTransactionID,
    });
  } catch (error) {
    console.error(
      "YEEBET: Error in game provider calling  getbalance api:",
      error.message
    );
    return res.status(200).json({
      result: -1000,
      desc: "系统未知异常，请联系客服处理",
    });
  }
});

router.post("/api/yeebetmy/rollback", async (req, res) => {
  try {
    const {
      appid,
      username,
      amount,
      notifyid,
      type,
      serialnumber,
      sign,
      bets,
    } = req.body;

    if (!appid || !username || !notifyid || !type || !serialnumber || !sign) {
      return res.status(200).json({
        result: -1002,
        desc: "参数错误，请检查所传参数",
      });
    }

    if (appid !== yeebetAppID) {
      return res.status(200).json({
        result: -1005,
        desc: "Appid错误",
      });
    }

    const paramsForSign = { ...req.body };
    delete paramsForSign.sign;

    const generatedSign = generateSignature(paramsForSign, yeebetSecret);

    if (sign !== generatedSign) {
      return res.status(200).json({
        result: -1007,
        desc: "签名错误，请检查签名",
      });
    }

    const currentUser = await User.findOne(
      { gameId: username },
      { _id: 1, wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(200).json({
        result: -1012,
        desc: "用户不存在",
      });
    }

    if (type === 1) {
      const existingWithdraw = await LiveYeebetModal.findOne(
        { betId: serialnumber, bet: true, cancel: { $ne: true } },
        { betamount: 1 }
      ).lean();

      if (!existingWithdraw) {
        return res.status(200).json({
          result: 0,
          desc: "OK",
          balance: roundToTwoDecimals(currentUser.wallet),
        });
      }

      const [updatedUser] = await Promise.all([
        User.findOneAndUpdate(
          { _id: currentUser._id },
          { $inc: { wallet: roundToTwoDecimals(existingWithdraw.betamount) } },
          { new: true, projection: { wallet: 1 } }
        ).lean(),

        LiveYeebetModal.updateOne(
          { betId: serialnumber },
          { $set: { cancel: true } }
        ),
      ]);

      return res.status(200).json({
        result: 0,
        desc: "OK",
        balance: roundToTwoDecimals(updatedUser.wallet),
      });
    } else if (type === 9) {
      const existingDeposit = await LiveYeebetModal.findOne(
        { betId: serialnumber, settle: true, cancel: { $ne: true } },
        { settleamount: 1 }
      ).lean();

      if (!existingDeposit) {
        return res.status(200).json({
          result: 0,
          desc: "OK",
          balance: roundToTwoDecimals(currentUser.wallet),
        });
      }

      const updatedUser = await User.findOneAndUpdate(
        {
          _id: currentUser._id,
          wallet: { $gte: roundToTwoDecimals(existingDeposit.settleamount) },
        },
        { $inc: { wallet: -roundToTwoDecimals(existingDeposit.settleamount) } },
        { new: true, projection: { wallet: 1 } }
      ).lean();

      if (!updatedUser) {
        return res.status(200).json({
          result: -1030,
          desc: "扣款金额不足",
        });
      }

      await LiveYeebetModal.updateOne(
        { betId: serialnumber },
        { $set: { cancel: true } }
      );
      return res.status(200).json({
        result: 0,
        desc: "OK",
        balance: roundToTwoDecimals(updatedUser.wallet),
      });
    }
  } catch (error) {
    console.error(
      "YEEBET: Error in game provider calling  getbalance api:",
      error.message
    );
    return res.status(200).json({
      result: -1000,
      desc: "系统未知异常，请联系",
    });
  }
});

// ----------------
router.post("/api/yeebet/getturnoverforrebate", async (req, res) => {
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

    console.log("YEEBET QUERYING TIME", startDate, endDate);

    const records = await LiveYeebetModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
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
        gamename: "YEEBET",
        gamecategory: "Live Casino",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("YEEBET: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      error: "YEEBET: Failed to fetch win/loss report",
    });
  }
});

router.get(
  "/admin/api/yeebet/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await LiveYeebetModal.find({
        username: user.gameId,
        createdAt: {
          $gte: startDate,
          $lt: endDate,
        },
        settle: true,
        cancel: { $ne: true },
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
          gamename: "YEEBET",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("YEEBET: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        error: "YEEBET: Failed to fetch win/loss report",
      });
    }
  }
);

router.get(
  "/admin/api/yeebet/:userId/gamedata",
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
          const gamecat = Object.fromEntries(gameCategories["Live Casino"]);

          if (gamecat["YEEBET"]) {
            totalTurnover += gamecat["YEEBET"].turnover || 0;
            totalWinLoss += gamecat["YEEBET"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "YEEBET",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("YEEBET: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        error: "YEEBET: Failed to fetch win/loss report",
      });
    }
  }
);

router.get(
  "/admin/api/yeebet/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await LiveYeebetModal.find({
        createdAt: {
          $gte: startDate,
          $lt: endDate,
        },
        settle: true,
        cancel: { $ne: true },
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;

        totalWinLoss += (record.betamount || 0) - (record.settleamount || 0);
      });

      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      // Return the aggregated results
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "YEEBET",
          gamecategory: "Live Casino",
          totalturnover: totalTurnover,
          totalwinloss: totalWinLoss,
        },
      });
    } catch (error) {
      console.log("YEEBET: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        error: "YEEBET: Failed to fetch win/loss report",
      });
    }
  }
);

router.get(
  "/admin/api/yeebet/kioskreport",
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
          const gamecat = Object.fromEntries(gameCategories["Live Casino"]);

          if (gamecat["YEEBET"]) {
            totalTurnover += Number(gamecat["YEEBET"].turnover || 0);
            totalWinLoss += Number(gamecat["YEEBET"].winloss || 0);
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "YEEBET",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("YEEBET: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        error: "YEEBET: Failed to fetch win/loss report",
      });
    }
  }
);

module.exports = router;
