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
const LiveWeCasinoModal = require("../../models/live_wecasino.model");
require("dotenv").config();

const webURL = "https://www.bm8my.vip/";
const weCasinoAPIURL = "https://nc-ugs-weop.ms16618.com";
const weCasinoSecret = process.env.WECASINO_SECRET;
const weCasinoOperatorID = "egm8myrwenV3";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

const generateUnixTimestamp = () => {
  return Math.floor(Date.now() / 1000);
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

function generateWESignature(appSecret, requestTime) {
  const signatureString = appSecret + requestTime;
  return crypto.createHash("sha256").update(signatureString).digest("hex");
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

router.post("/api/wecasino/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, clientPlatform } = req.body;

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

    if (user.gameLock?.wecasino?.lock) {
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

    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();

    const requestTime = Math.floor(Date.now() / 1000);

    const signature = generateWESignature(weCasinoSecret, requestTime);

    const playerToken = `${user.gameId}:${generateRandomCode()}`;

    let platform = "Desktop";
    if (clientPlatform === "web") {
      platform = "Desktop";
    } else if (clientPlatform === "mobile") {
      platform = "Mobile";
    }

    let lang = "zh";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "cn";
    } else if (gameLang === "zh_hk") {
      lang = "zh";
    } else if (gameLang === "ms") {
      lang = "en";
    } else if (gameLang === "id") {
      lang = "en";
    }

    const requestData = {
      operatorID: weCasinoOperatorID,
      requestTime: requestTime,
      playerID: user.gameId,
      clientIP: clientIp,
      category: "Live",
      token: playerToken,
      platform: platform,
      lang: lang,
      redirectUrl: webURL,
    };

    const response = await axios.post(
      `${weCasinoAPIURL}/player/launch`,
      new URLSearchParams(requestData).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          signature: signature,
        },
      }
    );

    if (!response.data.url) {
      console.log(
        "WE CASINO error in launching game",
        response.data,
        response.data.Description
      );
      return res.status(200).json({
        success: false,
        message: {
          en: "WE CASINO: Game launch failed. Please try again or customer service for assistance.",
          zh: "WE CASINO: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "WE CASINO: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "WE CASINO: 遊戲開唔到，老闆試多次或者搵客服幫手。",
          id: "WE CASINO: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        weCasinoGameToken: playerToken,
      },
      { new: true }
    );

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "WE CASINO"
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
    console.error(
      "WE CASINO Error launching game message:",
      error,
      error.response.data.detail
    );

    if (error.response.data.detail === "10010: 系統維護中") {
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
    } else {
      return res.status(200).json({
        success: false,
        message: {
          en: "WE CASINO: Game launch failed. Please try again or customer service for assistance.",
          zh: "WE CASINO: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "WE CASINO: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "WE CASINO: 遊戲開唔到，老闆試多次或者搵客服幫手。",
          id: "WE CASINO: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }
  }
});

router.post("/api/wecasino/validate", async (req, res) => {
  try {
    const { token, operatorID, appSecret } = req.body;

    if (!token || !operatorID || !appSecret) {
      return res.status(400).json({ error: "Bad Request" });
    }

    if (weCasinoSecret !== appSecret) {
      return res.status(401).json({ error: "Incorrect appSecret" });
    }

    const username = token.split(":")[0];

    const currentUser = await User.findOne(
      { gameId: username, weCasinoGameToken: token },
      { username: 1, wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(404).json({ error: "Invalid Token" });
    }
    const balanceInCents = currentUser.wallet * 100;

    return res.status(200).json({
      playerID: username,
      nickname: currentUser.username,
      currency: "MYR",
      time: generateUnixTimestamp(),
      balance: balanceInCents,
      betlimit: ["A1", "A3", "A8"],
    });
  } catch (error) {
    console.error("WE CASINO error in validate check:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/api/wecasino/balance", async (req, res) => {
  try {
    const { playerID, token, operatorID, appSecret } = req.body;

    if (!token || !operatorID || !appSecret || !playerID) {
      return res.status(400).json({ error: "Bad Request" });
    }

    if (weCasinoSecret !== appSecret) {
      return res.status(401).json({ error: "Incorrect appSecret" });
    }

    const currentUser = await User.findOne(
      { gameId: playerID },
      { username: 1, wallet: 1, weCasinoGameToken: 1 }
    ).lean();

    if (!currentUser || currentUser.weCasinoGameToken !== token) {
      return res.status(404).json({ error: "Invalid Token" });
    }
    const balanceInCents = currentUser.wallet * 100;

    return res.status(200).json({
      balance: balanceInCents,
      currency: "MYR",
      time: generateUnixTimestamp(),
    });
  } catch (error) {
    console.error("WE CASINO error in validate check:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/api/wecasino/debit", async (req, res) => {
  try {
    const { playerID, token, operatorID, appSecret, gameID, betID, amount } =
      req.body;
    if (!token || !operatorID || !appSecret || !playerID) {
      return res.status(400).json({ error: "Bad Request" });
    }

    if (weCasinoSecret !== appSecret) {
      return res.status(401).json({ error: "Incorrect appSecret" });
    }

    const [currentUser, existingTransaction] = await Promise.all([
      User.findOne(
        { gameId: playerID },
        {
          username: 1,
          wallet: 1,
          "gameLock.wecasino.lock": 1,
          _id: 1,
          weCasinoGameToken: 1,
        }
      ).lean(),
      LiveWeCasinoModal.findOne({ betId: betID }, { _id: 1 }).lean(),
    ]);

    if (!currentUser || currentUser.weCasinoGameToken !== token) {
      return res.status(404).json({ error: "Invalid Token" });
    }

    if (currentUser.gameLock?.wecasino?.lock) {
      return res.status(500).json({
        errorcode: 11013,
        error: "User account locked",
      });
    }

    if (existingTransaction) {
      return res.status(409).json({ error: "Duplicate transaction" });
    }

    const totalBet = parseFloat(amount) / 100;

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        gameId: playerID,
        wallet: { $gte: totalBet },
      },
      { $inc: { wallet: -totalBet } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res.status(402).json({ error: "Insufficient balance" });
    }

    LiveWeCasinoModal.create({
      betId: betID,
      bet: true,
      username: playerID,
      betamount: totalBet,
    }).catch((error) => {
      console.error("Error creating APOLLO transaction:", error.message);
    });

    const finalBalance = updatedUserBalance.wallet * 100;

    const ourTransactionID = generateTransactionId();

    return res.status(200).json({
      balance: finalBalance,
      currency: "MYR",
      time: generateUnixTimestamp(),
      refID: ourTransactionID,
    });
  } catch (error) {
    console.error("WE CASINO error in validate check:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/api/wecasino/credit", async (req, res) => {
  try {
    const { data } = req.body;

    const creditData = typeof data === "string" ? JSON.parse(data) : data;

    if (!Array.isArray(creditData) || creditData.length === 0) {
      return res.status(400).json({ error: "Bad Request" });
    }
    const firstItem = creditData[0];
    const { operatorID, appSecret, playerID } = firstItem;

    if (!operatorID || !appSecret || !playerID) {
      return res
        .status(400)
        .json({ error: "Bad Request - Missing required fields" });
    }

    if (weCasinoSecret !== appSecret) {
      return res.status(401).json({ error: "Incorrect appSecret" });
    }

    const allBetIds = creditData.map((item) => item.betID).filter(Boolean);

    if (allBetIds.length === 0) {
      return res.status(400).json({ error: "Bad Request" });
    }

    const existingBets = await LiveWeCasinoModal.find(
      { betId: { $in: allBetIds } },
      { betId: 1 }
    ).lean();

    const existingBetIds = new Set(existingBets.map((bet) => bet.betId));
    const missingBetIds = allBetIds.filter(
      (betId) => !existingBetIds.has(betId)
    );

    if (missingBetIds.length > 0) {
      return res.status(410).json({ error: "Can't credit" });
    }

    const existingTransactions = await LiveWeCasinoModal.find(
      { betId: { $in: allBetIds }, settle: true },
      { betId: 1 }
    ).lean();

    if (existingTransactions.length > 0) {
      return res.status(409).json({ error: "Duplicate transaction" });
    }

    const currentUser = await User.findOne(
      { gameId: playerID },
      { gameId: 1, username: 1, wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(410).json({ error: "Can't credit" });
    }

    let totalCreditAmount = 0;
    const transactionOps = [];

    creditData.forEach((item) => {
      const {
        amount,
        betID,
        gameID,
        validBetAmount,
        gameStatus,
        gameResult,
        currency,
        type,
        time,
        odds,
        jpWinRank,
        jpWinAmt,
      } = item;

      const amountInDollars = parseFloat(amount || 0) / 100;
      totalCreditAmount += amountInDollars;

      transactionOps.push({
        betId: betID,
        gameId: gameID,
        credit: true,
        username: currentUser.username,
        winamount: amountInDollars,
        validBetAmount: parseFloat(validBetAmount || 0) / 100,
        gameStatus,
        gameResult,
        currency,
        type,
        time,
        odds,
        jpWinRank: parseInt(jpWinRank || 0),
        jpWinAmt: parseFloat(jpWinAmt || 0) / 100,
      });
    });

    const bulkUpdateOps = creditData.map((item) => {
      const amountInDollars = parseFloat(item.amount || 0) / 100;
      const validBetAmountInDollars =
        parseFloat(item.validBetAmount || 0) / 100;

      return {
        updateOne: {
          filter: { betId: item.betID },
          update: {
            $set: {
              settle: true,
              settleamount: amountInDollars,
              validbetamount: validBetAmountInDollars,
            },
          },
        },
      };
    });

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: playerID },
        { $inc: { wallet: totalCreditAmount } },
        { new: true, projection: { wallet: 1 } }
      ),
      LiveWeCasinoModal.bulkWrite(bulkUpdateOps),
    ]);

    const finalBalance = updatedUserBalance.wallet * 100;

    const ourTransactionID = generateTransactionId();

    return res.status(200).json({
      balance: finalBalance,
      currency: "MYR",
      time: generateUnixTimestamp(),
      refID: ourTransactionID,
    });
  } catch (error) {
    console.error("WE CASINO error in validate check:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/api/wecasino/rollback", async (req, res) => {
  try {
    const { playerID, operatorID, appSecret, gameID, betID, amount } = req.body;

    if (!operatorID || !appSecret || !playerID) {
      return res.status(400).json({ error: "Bad Request" });
    }

    if (weCasinoSecret !== appSecret) {
      return res.status(401).json({ error: "Incorrect appSecret" });
    }

    const [existingBet, currentUser, existingTransaction] = await Promise.all([
      LiveWeCasinoModal.findOne({ betId: betID }, { _id: 1 }).lean(),
      User.findOne(
        { gameId: playerID },
        {
          username: 1,
          wallet: 1,
          _id: 1,
          weCasinoGameToken: 1,
        }
      ).lean(),
      LiveWeCasinoModal.findOne(
        { betId: betID, cancel: true },
        { _id: 1 }
      ).lean(),
    ]);

    if (!existingBet) {
      return res.status(410).json({ error: "Can't credit" });
    }

    if (!currentUser) {
      return res.status(404).json({ error: "Invalid Token" });
    }

    if (existingTransaction) {
      return res.status(409).json({ error: "Duplicate transaction" });
    }

    const rollbackAmount = parseFloat(amount) / 100;

    let updatedUser;

    if (rollbackAmount < 0) {
      const deductAmount = Math.abs(rollbackAmount);

      updatedUser = await User.findOneAndUpdate(
        {
          gameId: playerID,
          wallet: { $gte: deductAmount },
        },
        { $inc: { wallet: rollbackAmount } },
        { new: true, projection: { wallet: 1 } }
      ).lean();

      if (!updatedUser) {
        return res.status(402).json({ error: "Insufficient balance" });
      }
    } else {
      updatedUser = await User.findOneAndUpdate(
        { gameId: playerID },
        { $inc: { wallet: rollbackAmount } },
        { new: true, projection: { wallet: 1 } }
      ).lean();

      if (!updatedUser) {
        return res.status(410).json({ error: "Can't credit" });
      }
    }

    await LiveWeCasinoModal.findOneAndUpdate(
      { betId: betID },
      {
        $set: {
          cancel: true,
        },
      }
    );

    const finalBalance = updatedUser.wallet * 100;

    const ourTransactionID = generateTransactionId();

    return res.status(200).json({
      balance: finalBalance,
      currency: "MYR",
      time: generateUnixTimestamp(),
      refID: ourTransactionID,
    });
  } catch (error) {
    console.error("WE CASINO error in validate check:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/api/wecasino/resettlement", async (req, res) => {
  try {
    const { data } = req.body;

    const resettlementData = typeof data === "string" ? JSON.parse(data) : data;

    if (!Array.isArray(resettlementData) || resettlementData.length === 0) {
      return res.status(400).json({ error: "Bad Request" });
    }

    const firstItem = resettlementData[0];
    const { operatorID, appSecret, playerID } = firstItem;

    if (!operatorID || !appSecret || !playerID) {
      return res.status(400).json({ error: "Bad Request" });
    }

    if (weCasinoSecret !== appSecret) {
      return res.status(401).json({ error: "Incorrect appSecret" });
    }

    const allBetIds = resettlementData
      .map((item) => item.betID)
      .filter(Boolean);

    if (allBetIds.length === 0) {
      return res.status(400).json({ error: "Bad Request" });
    }

    const existingResettlements = await LiveWeCasinoModal.find(
      { betId: { $in: allBetIds }, resettlement: true },
      { betId: 1 }
    ).lean();

    if (existingResettlements.length > 0) {
      return res.status(409).json({ error: "Duplicate transaction" });
    }

    const currentUser = await User.findOne(
      { gameId: playerID },
      { gameId: 1, username: 1, wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(410).json({ error: "Can't credit" });
    }

    let totalAdjustmentAmount = 0;

    resettlementData.forEach((item) => {
      const { resettleAmount } = item;
      const adjustmentInDollars = parseFloat(resettleAmount || 0) / 100;
      totalAdjustmentAmount += adjustmentInDollars;
    });

    const bulkUpdateOps = resettlementData.map((item) => {
      const {
        betID,
        amount,
        resettleAmount,
        validBetAmount,
        gameStatus,
        gameResult,
        currency,
        type,
        time,
        odds,
        resettleTime,
      } = item;

      const newTotalAmount = parseFloat(amount || 0) / 100; // Latest total amount
      const adjustmentAmount = parseFloat(resettleAmount || 0) / 100; // Adjustment amount

      return {
        updateOne: {
          filter: { betId: betID },
          update: {
            $set: {
              resettlement: true, // ✅ Mark as resettled
              settleamount: adjustmentAmount, // ✅ Store adjustment amount
              validbetamount: parseFloat(validBetAmount || 0) / 100,
            },
          },
        },
      };
    });

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: playerID },
        { $inc: { wallet: totalAdjustmentAmount } },
        { new: true, projection: { wallet: 1 } }
      ),
      LiveWeCasinoModal.bulkWrite(bulkUpdateOps),
    ]);

    const finalBalance = updatedUserBalance.wallet * 100;

    const ourTransactionID = generateTransactionId();

    return res.status(200).json({
      balance: finalBalance,
      currency: "MYR",
      time: generateUnixTimestamp(),
      refID: ourTransactionID,
    });
  } catch (error) {
    console.error("WE CASINO error in validate check:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/api/wecasino/netcheck", async (req, res) => {
  try {
    return res.status(200).json({
      operatorID: weCasinoOperatorID,
    });
  } catch (error) {
    console.error("WE CASINO error in validate check:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// ----------------
router.post("/api/wecasino/getturnoverforrebate", async (req, res) => {
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

    console.log("WECASINO QUERYING TIME", startDate, endDate);

    const records = await LiveWeCasinoModal.find({
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

      playerSummary[actualUsername].turnover += record.validbetamount || 0;

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
        gamename: "WE CASINO",
        gamecategory: "Live Casino",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("WE CASINO: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      error: "WE CASINO: Failed to fetch win/loss report",
    });
  }
});

router.get(
  "/admin/api/wecasino/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await LiveWeCasinoModal.find({
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
        totalTurnover += record.validbetamount || 0;

        totalWinLoss += (record.settleamount || 0) - (record.betamount || 0);
      });

      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      // Return the aggregated results
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "WE CASINO",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("WE CASINO: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        error: "WE CASINO: Failed to fetch win/loss report",
      });
    }
  }
);

router.get(
  "/admin/api/wecasino/:userId/gamedata",
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

          if (gamecat["WE CASINO"]) {
            totalTurnover += gamecat["WE CASINO"].turnover || 0;
            totalWinLoss += gamecat["WE CASINO"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "WE CASINO",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("WE CASINO: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        error: "WE CASINO: Failed to fetch win/loss report",
      });
    }
  }
);

router.get(
  "/admin/api/wecasino/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await LiveWeCasinoModal.find({
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
        totalTurnover += record.validbetamount || 0;
        totalWinLoss += (record.betamount || 0) - (record.settleamount || 0);
      });

      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      // Return the aggregated results
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "WE CASINO",
          gamecategory: "Live Casino",
          totalturnover: totalTurnover,
          totalwinloss: totalWinLoss,
        },
      });
    } catch (error) {
      console.log("WE CASINO: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        error: "WE CASINO: Failed to fetch win/loss report",
      });
    }
  }
);

router.get(
  "/admin/api/wecasino/kioskreport",
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

          if (gamecat["WE CASINO"]) {
            totalTurnover += Number(gamecat["WE CASINO"].turnover || 0);
            totalWinLoss += Number(gamecat["WE CASINO"].winloss || 0);
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "WE CASINO",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("WE CASINO: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        error: "WE CASINO: Failed to fetch win/loss report",
      });
    }
  }
);

module.exports = router;
