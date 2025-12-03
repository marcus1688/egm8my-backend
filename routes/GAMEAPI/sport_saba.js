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
const { v4: uuidv4 } = require("uuid");
const { adminUser, adminLog } = require("../../models/adminuser.model");
const GameWalletLog = require("../../models/gamewalletlog.model");
const Decimal = require("decimal.js");
const SportSabaSportModal = require("../../models/sport_sabasport.model");
const cron = require("node-cron");
const { HttpsProxyAgent } = require("https-proxy-agent");
require("dotenv").config();

const webURL = "https://www.bm8my.vip/";
const sabasportAPIURL = "http://u5r2tsa.bw6688.com/api";
const sabasportAccount = "b1d8s62lkw";
const sabasportOperatorID = "EGM8MYR";

const PROXY_URL = process.env.PROXY_URL;
const proxyAgent = new HttpsProxyAgent(PROXY_URL);

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

function generateTransactionId(prefix = "") {
  const uuid = uuidv4().replace(/-/g, "").substring(0, 12);
  return prefix ? `${prefix}${uuid}` : uuid;
}

function generateBalanceTs() {
  return moment().utcOffset(-4).format("YYYY-MM-DDTHH:mm:ss.SSS") + "-04:00";
}

const sabaAxios = axios.create({
  httpsAgent: proxyAgent,
  httpAgent: proxyAgent,
});

async function registerSabaSportUser(user) {
  try {
    const formData = new URLSearchParams();
    formData.append("vendor_id", sabasportAccount);
    formData.append(
      "vendor_member_id",
      `${sabasportOperatorID}_${user.gameId}`
    );
    formData.append("operatorId", sabasportOperatorID);
    formData.append("username", `${sabasportOperatorID}_${user.gameId}`);
    formData.append("oddstype", 3);
    formData.append("currency", 20);
    formData.append("maxtransfer", 99999999);
    formData.append("mintransfer", 0);
    formData.append("custominfo1", user.username);

    const response = await sabaAxios.post(
      `${sabasportAPIURL}/CreateMember`,
      formData.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (response.data.error_code !== 0) {
      if (response.data.error_code === 10) {
        return {
          success: false,
          error: response.data.message,
          maintenance: true,
        };
      }

      return {
        success: false,
        error: response.data.message,
        maintenance: false,
      };
    }
    return {
      success: true,
      data: response.data,
      maintenance: false,
    };
  } catch (error) {
    return {
      success: false,
      error: error.response.data,
      maintenance: false,
    };
  }
}

router.post(
  "/api/sabasport/launchGame",
  authenticateToken,
  async (req, res) => {
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
            zh_hk: "用戶未找到，請重試或聯絡客服以獲取幫助。",
            id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      if (user.gameLock.sabasport.lock) {
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

      let sabaGameID = user.sabasportGameID;
      if (!sabaGameID) {
        const registeredData = await registerSabaSportUser(user);

        if (!registeredData.success) {
          console.log(`SABASPORT error in registering account`);
          console.log(registeredData);

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
              en: "SABASPORT: Game launch failed. Please try again or customer service for assistance.",
              zh: "SABASPORT: 游戏启动失败，请重试或联系客服以获得帮助。",
              ms: "SABASPORT: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
              zh_hk: "SABASPORT: 遊戲開唔到，老闆試多次或者搵客服幫手。",
              id: "SABASPORT: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
            },
          });
        }
        sabaGameID = `${sabasportOperatorID}_${user.gameId}`;

        await User.findOneAndUpdate(
          { username: user.username },
          {
            $set: {
              sabasportGameID: sabaGameID,
            },
          }
        );
      }

      let platform = 1;
      if (clientPlatform === "web") {
        platform = 1;
      } else if (clientPlatform === "mobile") {
        platform = 2;
      }

      let lang = "en";

      if (gameLang === "en") {
        lang = "en";
      } else if (gameLang === "zh") {
        lang = "cs";
      } else if (gameLang === "ms") {
        lang = "msa";
      } else if (gameLang === "id") {
        lang = "id";
      } else if (gameLang === "zh_hk") {
        lang = "ch";
      }

      const deepLinkContent = JSON.stringify({
        lang: lang,
        OType: 3,
      });

      const formData = new URLSearchParams();
      formData.append("vendor_id", sabasportAccount);
      formData.append("vendor_member_id", sabaGameID);
      formData.append("platform", platform);
      formData.append("skin_mode", "3");
      formData.append("deep_link_content", deepLinkContent);
      console.log(formData);
      console.log(`${sabasportAPIURL}/GetSabaUrl`);
      const response = await sabaAxios.post(
        `${sabasportAPIURL}/GetSabaUrl`,
        formData.toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
      if (response.data.error_code !== 0) {
        console.log(response.data, "sabasport launch failed");
        if (response.data.error_code === 10) {
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
            en: "SABASPORT: Game launch failed. Please try again or customer service for assistance.",
            zh: "SABASPORT: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "SABASPORT: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "SABASPORT: 遊戲開唔到，老闆試多次或者搵客服幫手。",
            id: "SABASPORT: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }
      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "SABASPORT"
      );

      return res.status(200).json({
        success: true,
        gameLobby: response.data.Data,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
          zh_hk: "遊戲啟動成功。",
          id: "Permainan berhasil diluncurkan.",
        },
      });
    } catch (error) {
      console.error("SABASPORT GetSabaUrl Error:", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "SABASPORT: Game launch failed. Please try again or customer service for assistance.",
          zh: "SABASPORT: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "SABASPORT: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "SABASPORT: 遊戲開唔到，老闆試多次或者搵客服幫手。",
          id: "SABASPORT: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

const extractGameId = (userId) =>
  userId?.replace(`${sabasportOperatorID}_`, "") || "";

// ============================================
// GET BALANCE
// ============================================
router.post("/api/sabasport/getbalance", async (req, res) => {
  try {
    const { key, message } = req.body;

    if (!key || !message) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }
    if (key !== sabasportAccount) {
      return res.status(200).json({ status: "311", msg: "Invalid key" });
    }

    const gameId = extractGameId(message.userId);
    if (!gameId) {
      return res
        .status(200)
        .json({ status: "101", msg: "Invalid userId format" });
    }

    const user = await User.findOne({ gameId }, { wallet: 1 }).lean();
    if (!user) {
      return res
        .status(200)
        .json({ status: "203", msg: "Account is not exist" });
    }

    return res.status(200).json({
      status: "0",
      userId: message.userId,
      balance: roundToTwoDecimals(user.wallet),
      balanceTs: generateBalanceTs(),
      msg: null,
    });
  } catch (error) {
    console.error("SABASPORT getbalance error:", error.message);
    return res
      .status(200)
      .json({ status: "902", msg: "Internal Server Error" });
  }
});

// ============================================
// PLACE BET
// ============================================
router.post("/api/sabasport/placebet", async (req, res) => {
  try {
    const { key, message } = req.body;

    if (!key || !message) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }
    if (key !== sabasportAccount) {
      return res.status(200).json({ status: "311", msg: "Invalid key" });
    }

    const { operationId, userId, matchId, refId, creditAmount, debitAmount } =
      message;
    console.log("placebet", message);
    const gameId = extractGameId(userId);
    if (!gameId) {
      return res
        .status(200)
        .json({ status: "101", msg: "Invalid userId format" });
    }

    const [user, existingBet] = await Promise.all([
      User.findOne(
        { gameId },
        { wallet: 1, "gameLock.sabasport.lock": 1 }
      ).lean(),
      SportSabaSportModal.findOne({ betId: operationId }, { _id: 1 }).lean(),
    ]);

    if (!user) {
      return res
        .status(200)
        .json({ status: "203", msg: "Account is not exist" });
    }
    if (user.gameLock?.sabasport?.lock) {
      return res.status(200).json({ status: "202", msg: "Account is lock" });
    }
    if (existingBet) {
      return res.status(200).json({ status: "1", msg: "bet existed" });
    }

    const toDeduct = (creditAmount || 0) - (debitAmount || 0);

    const updated = await User.findOneAndUpdate(
      { gameId, wallet: { $gte: roundToTwoDecimals(toDeduct) } },
      { $inc: { wallet: roundToTwoDecimals(-toDeduct) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updated) {
      return res
        .status(200)
        .json({ status: "502", msg: "Insufficient Balance" });
    }

    const licenseeTxId = generateTransactionId();

    await SportSabaSportModal.create({
      betId: operationId,
      username: gameId,
      bet: true,
      betamount: roundToTwoDecimals(toDeduct),
      tranId: refId || "",
      matchId: matchId || "",
      licenseeTxId,
    });

    return res.status(200).json({ status: "0", refId, licenseeTxId });
  } catch (error) {
    console.error("SABASPORT placebet error:", error.message);
    return res
      .status(200)
      .json({ status: "902", msg: "Internal Server Error" });
  }
});

// ============================================
// CONFIRM BET
// ============================================
router.post("/api/sabasport/confirmbet", async (req, res) => {
  try {
    const { key, message } = req.body;

    if (!key || !message) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }
    if (key !== sabasportAccount) {
      return res.status(200).json({ status: "311", msg: "Invalid key" });
    }

    const { operationId, userId, creditAmount, debitAmount } = message;
    console.log("confirmbet", message);
    const gameId = extractGameId(userId);
    if (!gameId) {
      return res
        .status(200)
        .json({ status: "101", msg: "Invalid userId format" });
    }

    const [user, existingConfirm] = await Promise.all([
      User.findOne({ gameId }, { wallet: 1 }).lean(),
      SportSabaSportModal.findOne(
        { betId: operationId, confirmbet: true },
        { _id: 1 }
      ).lean(),
    ]);

    if (!user) {
      return res
        .status(200)
        .json({ status: "203", msg: "Account is not exist" });
    }
    if (existingConfirm) {
      return res
        .status(200)
        .json({ status: "0", balance: roundToTwoDecimals(user.wallet) });
    }

    const toDeduct = (creditAmount || 0) - (debitAmount || 0);
    let finalBalance = user.wallet;

    const updated = await User.findOneAndUpdate(
      { gameId, wallet: { $gte: roundToTwoDecimals(toDeduct) } },
      { $inc: { wallet: roundToTwoDecimals(-toDeduct) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updated) {
      return res
        .status(200)
        .json({ status: "502", msg: "Insufficient Balance" });
    }
    finalBalance = updated.wallet;

    SportSabaSportModal.updateOne(
      { betId: operationId },
      { $set: { confirmbet: true } }
    ).catch((err) =>
      console.error("SABASPORT confirmbet update error:", err.message)
    );

    return res
      .status(200)
      .json({ status: "0", balance: roundToTwoDecimals(finalBalance) });
  } catch (error) {
    console.error("SABASPORT confirmbet error:", error.message);
    return res
      .status(200)
      .json({ status: "902", msg: "Internal Server Error" });
  }
});

// ============================================
// CANCEL BET
// ============================================
router.post("/api/sabasport/cancelbet", async (req, res) => {
  try {
    const { key, message } = req.body;

    if (!key || !message) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }
    if (key !== sabasportAccount) {
      return res.status(200).json({ status: "311", msg: "Invalid key" });
    }

    const { operationId, userId, txns } = message;
    const gameId = extractGameId(userId);
    if (!gameId) {
      return res
        .status(200)
        .json({ status: "101", msg: "Invalid userId format" });
    }

    const [user, existingCancel] = await Promise.all([
      User.findOne({ gameId }, { wallet: 1 }).lean(),
      SportSabaSportModal.findOne(
        { cancelOperationId: operationId },
        { _id: 1 }
      ).lean(),
    ]);

    if (!user) {
      return res
        .status(200)
        .json({ status: "203", msg: "Account is not exist" });
    }
    if (existingCancel) {
      return res
        .status(200)
        .json({ status: "0", balance: roundToTwoDecimals(user.wallet) });
    }

    let totalRefund = 0;
    const refIds = [];
    for (const txn of txns) {
      totalRefund += (txn.creditAmount || 0) - (txn.debitAmount || 0);
      refIds.push(txn.refId);
    }

    const [updated] = await Promise.all([
      User.findOneAndUpdate(
        { gameId },
        { $inc: { wallet: roundToTwoDecimals(totalRefund) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
      SportSabaSportModal.updateMany(
        { tranId: { $in: refIds } },
        { $set: { cancel: true, cancelOperationId: operationId } }
      ),
    ]);

    return res
      .status(200)
      .json({ status: "0", balance: roundToTwoDecimals(updated.wallet) });
  } catch (error) {
    console.error("SABASPORT cancelbet error:", error.message);
    return res
      .status(200)
      .json({ status: "902", msg: "Internal Server Error" });
  }
});

// ============================================
// SETTLE
// ============================================
router.post("/api/sabasport/settle", async (req, res) => {
  try {
    const { key, message } = req.body;

    if (!key || !message) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }
    if (key !== sabasportAccount) {
      return res.status(200).json({ status: "311", msg: "Invalid key" });
    }

    const { operationId, txns } = message;
    if (!txns?.length) {
      return res.status(200).json({ status: "101", msg: "Invalid txns" });
    }

    const existingSettle = await SportSabaSportModal.findOne(
      { settleOperationId: operationId },
      { _id: 1 }
    ).lean();
    if (existingSettle) {
      return res.status(200).json({ status: "0" });
    }

    const userChanges = {};
    const bulkBetOps = [];

    for (const txn of txns) {
      const gameId = extractGameId(txn.userId);
      const change = (txn.creditAmount || 0) - (txn.debitAmount || 0);

      userChanges[gameId] = (userChanges[gameId] || 0) + change;

      bulkBetOps.push({
        updateOne: {
          filter: { tranId: txn.refId },
          update: {
            $set: {
              settle: true,
              settleOperationId: operationId,
              txId: txn.txId,
              status: txn.status,
              payout: roundToTwoDecimals(txn.payout || 0),
              creditAmount: roundToTwoDecimals(txn.creditAmount || 0),
              debitAmount: roundToTwoDecimals(txn.debitAmount || 0),
              winlostDate: txn.winlostDate,
              extraStatus: txn.extraStatus || "",
              settlementTime: txn.settlementTime,
            },
          },
        },
      });
    }

    const bulkUserOps = Object.entries(userChanges)
      .filter(([, change]) => change !== 0)
      .map(([gameId, change]) => ({
        updateOne: {
          filter: { gameId },
          update: { $inc: { wallet: roundToTwoDecimals(change) } },
        },
      }));

    const promises = [];
    if (bulkUserOps.length) {
      promises.push(User.bulkWrite(bulkUserOps));
    }
    if (bulkBetOps.length) {
      promises.push(SportSabaSportModal.bulkWrite(bulkBetOps));
    }
    await Promise.all(promises);

    return res.status(200).json({ status: "0" });
  } catch (error) {
    console.error("SABASPORT settle error:", error.message);
    return res
      .status(200)
      .json({ status: "902", msg: "Internal Server Error" });
  }
});

// ============================================
// UNSETTLE
// ============================================
router.post("/api/sabasport/unsettle", async (req, res) => {
  try {
    const { key, message } = req.body;

    if (!key || !message) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }
    if (key !== sabasportAccount) {
      return res.status(200).json({ status: "311", msg: "Invalid key" });
    }

    const { operationId, txns } = message;
    if (!txns?.length) {
      return res.status(200).json({ status: "101", msg: "Invalid txns" });
    }

    const existing = await SportSabaSportModal.findOne(
      { unsettleOperationId: operationId },
      { _id: 1 }
    ).lean();
    if (existing) {
      return res.status(200).json({ status: "0" });
    }

    const userChanges = {};
    const bulkBetOps = [];

    for (const txn of txns) {
      const gameId = extractGameId(txn.userId);
      const change = (txn.creditAmount || 0) - (txn.debitAmount || 0);
      userChanges[gameId] = (userChanges[gameId] || 0) + change;

      bulkBetOps.push({
        updateOne: {
          filter: { tranId: txn.refId },
          update: {
            $set: {
              unsettle: true,
              unsettleOperationId: operationId,
              settle: false,
              extraStatus: txn.extraStatus || "",
            },
          },
        },
      });
    }

    const bulkUserOps = Object.entries(userChanges)
      .filter(([, change]) => change !== 0)
      .map(([gameId, change]) => ({
        updateOne: {
          filter: { gameId },
          update: { $inc: { wallet: roundToTwoDecimals(change) } },
        },
      }));

    const promises = [];
    if (bulkUserOps.length) {
      promises.push(User.bulkWrite(bulkUserOps));
    }
    if (bulkBetOps.length) {
      promises.push(SportSabaSportModal.bulkWrite(bulkBetOps));
    }
    await Promise.all(promises);

    return res.status(200).json({ status: "0" });
  } catch (error) {
    console.error("SABASPORT unsettle error:", error.message);
    return res
      .status(200)
      .json({ status: "902", msg: "Internal Server Error" });
  }
});

// ============================================
// RESETTLE
// ============================================
router.post("/api/sabasport/resettle", async (req, res) => {
  try {
    const { key, message } = req.body;

    if (!key || !message) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }
    if (key !== sabasportAccount) {
      return res.status(200).json({ status: "311", msg: "Invalid key" });
    }

    const { operationId, txns } = message;
    if (!txns?.length) {
      return res.status(200).json({ status: "101", msg: "Invalid txns" });
    }

    const existing = await SportSabaSportModal.findOne(
      { resettleOperationId: operationId },
      { _id: 1 }
    ).lean();
    if (existing) {
      return res.status(200).json({ status: "0" });
    }

    const userChanges = {};
    const bulkBetOps = [];

    for (const txn of txns) {
      const gameId = extractGameId(txn.userId);

      if (!txn.extraInfo?.isOnlyWinlostDateChanged) {
        const change = (txn.creditAmount || 0) - (txn.debitAmount || 0);
        userChanges[gameId] = (userChanges[gameId] || 0) + change;
      }

      bulkBetOps.push({
        updateOne: {
          filter: { tranId: txn.refId },
          update: {
            $set: {
              resettle: true,
              resettleOperationId: operationId,
              status: txn.status,
              payout: roundToTwoDecimals(txn.payout || 0),
              creditAmount: roundToTwoDecimals(txn.creditAmount || 0),
              debitAmount: roundToTwoDecimals(txn.debitAmount || 0),
              winlostDate: txn.winlostDate,
              extraStatus: txn.extraStatus || "",
              settlementTime: txn.settlementTime,
            },
          },
        },
      });
    }

    const bulkUserOps = Object.entries(userChanges)
      .filter(([, change]) => change !== 0)
      .map(([gameId, change]) => ({
        updateOne: {
          filter: { gameId },
          update: { $inc: { wallet: roundToTwoDecimals(change) } },
        },
      }));

    const promises = [];
    if (bulkUserOps.length) {
      promises.push(User.bulkWrite(bulkUserOps));
    }
    if (bulkBetOps.length) {
      promises.push(SportSabaSportModal.bulkWrite(bulkBetOps));
    }
    await Promise.all(promises);

    return res.status(200).json({ status: "0" });
  } catch (error) {
    console.error("SABASPORT resettle error:", error.message);
    return res
      .status(200)
      .json({ status: "902", msg: "Internal Server Error" });
  }
});

// ============================================
// PLACE BET PARLAY
// ============================================
router.post("/api/sabasport/placebetparlay", async (req, res) => {
  try {
    const { key, message } = req.body;

    if (!key || !message) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }
    if (key !== sabasportAccount) {
      return res.status(200).json({ status: "311", msg: "Invalid key" });
    }

    const {
      operationId,
      userId,
      betTime,
      IP,
      txns,
      ticketDetail,
      creditAmount,
      debitAmount,
    } = message;
    const gameId = extractGameId(userId);
    if (!gameId) {
      return res
        .status(200)
        .json({ status: "101", msg: "Invalid userId format" });
    }

    const [user, existing] = await Promise.all([
      User.findOne(
        { gameId },
        { wallet: 1, "gameLock.sabasport.lock": 1 }
      ).lean(),
      SportSabaSportModal.findOne(
        { operationId },
        { tranId: 1, licenseeTxId: 1 }
      ).lean(),
    ]);

    if (!user) {
      return res
        .status(200)
        .json({ status: "203", msg: "Account is not exist" });
    }
    if (user.gameLock?.sabasport?.lock) {
      return res.status(200).json({ status: "202", msg: "Account is lock" });
    }

    if (existing) {
      const existingTxns = await SportSabaSportModal.find(
        { operationId },
        { tranId: 1, licenseeTxId: 1 }
      ).lean();
      return res.status(200).json({
        status: "0",
        txns: existingTxns.map((t) => ({
          refId: t.tranId,
          licenseeTxId: t.licenseeTxId,
        })),
      });
    }

    const toDeduct = (debitAmount || 0) - (creditAmount || 0);

    const updated = await User.findOneAndUpdate(
      { gameId, wallet: { $gte: toDeduct } },
      { $inc: { wallet: -toDeduct } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updated) {
      return res
        .status(200)
        .json({ status: "502", msg: "Insufficient Balance" });
    }

    const txnsResponse = [];
    const betRecords = txns.map((txn) => {
      const licenseeTxId = generateTransactionId();
      txnsResponse.push({ refId: txn.refId, licenseeTxId });
      return {
        betId: operationId,
        operationId,
        username: gameId,
        bet: true,
        betType: "parlay",
        parlayType: txn.parlayType,
        betamount: roundToTwoDecimals(txn.betAmount || 0),
        tranId: txn.refId,
        licenseeTxId,
        creditAmount: roundToTwoDecimals(txn.creditAmount || 0),
        debitAmount: roundToTwoDecimals(txn.debitAmount || 0),
        betTime: betTime,
        IP,
        ticketDetail: JSON.stringify(ticketDetail),
        detail: JSON.stringify(txn.detail),
      };
    });

    SportSabaSportModal.insertMany(betRecords).catch((err) =>
      console.error("SABASPORT placebetparlay insert error:", err.message)
    );

    return res.status(200).json({ status: "0", txns: txnsResponse });
  } catch (error) {
    console.error("SABASPORT placebetparlay error:", error.message);
    return res
      .status(200)
      .json({ status: "902", msg: "Internal Server Error" });
  }
});

// ============================================
// CONFIRM BET PARLAY
// ============================================
router.post("/api/sabasport/confirmbetparlay", async (req, res) => {
  try {
    const { key, message } = req.body;

    if (!key || !message) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }
    if (key !== sabasportAccount) {
      return res.status(200).json({ status: "311", msg: "Invalid key" });
    }

    const { userId, creditAmount, debitAmount, txns, transactionTime } =
      message;
    const gameId = extractGameId(userId);
    if (!gameId) {
      return res
        .status(200)
        .json({ status: "101", msg: "Invalid userId format" });
    }

    const user = await User.findOne({ gameId }, { wallet: 1 }).lean();
    if (!user) {
      return res
        .status(200)
        .json({ status: "203", msg: "Account is not exist" });
    }

    const toChange = (creditAmount || 0) - (debitAmount || 0);

    const bulkBetOps = txns.map((txn) => ({
      updateOne: {
        filter: { tranId: txn.refId },
        update: {
          $set: {
            confirmed: true,
            txId: txn.txId,
            actualAmount: roundToTwoDecimals(txn.actualAmount || 0),
            isOddsChanged: txn.isOddsChanged || false,
            winlostDate: txn.winlostDate,
            odds: txn.odds || 0,
            transactionTime,
          },
        },
      },
    }));

    const promises = [SportSabaSportModal.bulkWrite(bulkBetOps)];
    let finalBalance = user.wallet;

    if (toChange !== 0) {
      const updated = await User.findOneAndUpdate(
        { gameId },
        { $inc: { wallet: roundToTwoDecimals(toChange) } },
        { new: true, projection: { wallet: 1 } }
      ).lean();
      finalBalance = updated.wallet;
    }

    await Promise.all(promises);

    return res
      .status(200)
      .json({ status: "0", balance: roundToTwoDecimals(finalBalance) });
  } catch (error) {
    console.error("SABASPORT confirmbetparlay error:", error.message);
    return res
      .status(200)
      .json({ status: "902", msg: "Internal Server Error" });
  }
});

// ============================================
// PLACE BET 3RD
// ============================================
router.post("/api/sabasport/placebet3rd", async (req, res) => {
  try {
    const { key, message } = req.body;

    if (!key || !message) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }
    if (key !== sabasportAccount) {
      return res.status(200).json({ status: "311", msg: "Invalid key" });
    }

    const {
      operationId,
      userId,
      productId,
      ticketList,
      betTime,
      IP,
      productName_en,
      gameName_en,
      creditAmount,
      debitAmount,
    } = message;
    const gameId = extractGameId(userId);
    if (!gameId) {
      return res
        .status(200)
        .json({ status: "101", msg: "Invalid userId format" });
    }

    const [user, existing] = await Promise.all([
      User.findOne(
        { gameId },
        { wallet: 1, "gameLock.sabasport.lock": 1 }
      ).lean(),
      SportSabaSportModal.findOne({ operationId }, { _id: 1 }).lean(),
    ]);

    if (!user) {
      return res
        .status(200)
        .json({ status: "203", msg: "Account is not exist" });
    }
    if (user.gameLock?.sabasport?.lock) {
      return res.status(200).json({ status: "202", msg: "Account is lock" });
    }

    if (existing) {
      const existingTxns = await SportSabaSportModal.find(
        { operationId },
        { tranId: 1, licenseeTxId: 1 }
      ).lean();
      return res.status(200).json({
        status: "0",
        balance: roundToTwoDecimals(user.wallet),
        txns: existingTxns.map((t) => ({
          refId: t.tranId,
          licenseeTxId: t.licenseeTxId,
        })),
      });
    }

    const toDeduct = (debitAmount || 0) - (creditAmount || 0);

    const updated = await User.findOneAndUpdate(
      { gameId, wallet: { $gte: toDeduct } },
      { $inc: { wallet: -toDeduct } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updated) {
      return res
        .status(200)
        .json({ status: "502", msg: "Insufficient Balance" });
    }

    const txnsResponse = [];
    const betRecords = ticketList.map((ticket) => {
      const licenseeTxId = generateTransactionId();
      txnsResponse.push({ refId: ticket.refId, licenseeTxId });
      return {
        betId: operationId,
        operationId,
        username: gameId,
        bet: true,
        betType: "3rd",
        productId,
        productName: productName_en,
        gameName: gameName_en,
        betamount: roundToTwoDecimals(ticket.betAmount || 0),
        actualAmount: roundToTwoDecimals(ticket.actualAmount || 0),
        tranId: ticket.refId,
        licenseeTxId,
        odds: ticket.odds || 0,
        oddsType: ticket.oddsType,
        betChoice: ticket.betChoice_en,
        extra: JSON.stringify(ticket.extra || {}),
        creditAmount: roundToTwoDecimals(ticket.creditAmount || 0),
        debitAmount: roundToTwoDecimals(ticket.debitAmount || 0),
        betTime,
        IP,
      };
    });

    SportSabaSportModal.insertMany(betRecords).catch((err) =>
      console.error("SABASPORT placebet3rd insert error:", err.message)
    );

    return res.status(200).json({
      status: "0",
      balance: roundToTwoDecimals(updated.wallet),
      txns: txnsResponse,
    });
  } catch (error) {
    console.error("SABASPORT placebet3rd error:", error.message);
    return res
      .status(200)
      .json({ status: "902", msg: "Internal Server Error" });
  }
});

// ============================================
// CONFIRM BET 3RD
// ============================================
router.post("/api/sabasport/confirmbet3rd", async (req, res) => {
  try {
    const { key, message } = req.body;

    if (!key || !message) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }
    if (key !== sabasportAccount) {
      return res.status(200).json({ status: "311", msg: "Invalid key" });
    }

    const { userId, txns, transactionTime, creditAmount, debitAmount } =
      message;
    const gameId = extractGameId(userId);
    if (!gameId) {
      return res
        .status(200)
        .json({ status: "101", msg: "Invalid userId format" });
    }

    const user = await User.findOne({ gameId }, { wallet: 1 }).lean();
    if (!user) {
      return res
        .status(200)
        .json({ status: "203", msg: "Account is not exist" });
    }

    const toChange = (creditAmount || 0) - (debitAmount || 0);

    const bulkBetOps = txns.map((txn) => ({
      updateOne: {
        filter: { tranId: txn.refId },
        update: {
          $set: {
            confirmed: true,
            txId: txn.txId,
            winlostDate: txn.winlostDate,
            transactionTime,
          },
        },
      },
    }));

    let finalBalance = user.wallet;

    const promises = [SportSabaSportModal.bulkWrite(bulkBetOps)];
    if (toChange !== 0) {
      promises.push(
        User.findOneAndUpdate(
          { gameId },
          { $inc: { wallet: roundToTwoDecimals(toChange) } },
          { new: true, projection: { wallet: 1 } }
        ).lean()
      );
    }

    const results = await Promise.all(promises);
    if (results[1]) {
      finalBalance = results[1].wallet;
    }

    return res
      .status(200)
      .json({ status: "0", balance: roundToTwoDecimals(finalBalance) });
  } catch (error) {
    console.error("SABASPORT confirmbet3rd error:", error.message);
    return res
      .status(200)
      .json({ status: "902", msg: "Internal Server Error" });
  }
});

// ============================================
// PLACE BET ENT
// ============================================
router.post("/api/sabasport/placebetent", async (req, res) => {
  try {
    const { key, message } = req.body;

    if (!key || !message) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }
    if (key !== sabasportAccount) {
      return res.status(200).json({ status: "311", msg: "Invalid key" });
    }

    const {
      userId,
      productId,
      ticketList,
      betTime,
      IP,
      productName_en,
      gameName_en,
      roundId,
      creditAmount,
      debitAmount,
    } = message;
    const gameId = extractGameId(userId);
    if (!gameId) {
      return res
        .status(200)
        .json({ status: "101", msg: "Invalid userId format" });
    }

    const [user, existing] = await Promise.all([
      User.findOne(
        { gameId },
        { wallet: 1, "gameLock.sabasport.lock": 1 }
      ).lean(),
      SportSabaSportModal.findOne(
        { tranId: ticketList[0]?.refId },
        { licenseeTxId: 1 }
      ).lean(),
    ]);

    if (!user) {
      return res
        .status(200)
        .json({ status: "203", msg: "Account is not exist" });
    }
    if (user.gameLock?.sabasport?.lock) {
      return res.status(200).json({ status: "202", msg: "Account is lock" });
    }

    if (existing) {
      return res.status(200).json({
        status: "0",
        userId,
        balance: roundToTwoDecimals(user.wallet),
        ticketList: ticketList.map((t) => ({
          refId: t.refId,
          licenseeTxId: existing.licenseeTxId,
        })),
      });
    }

    const toDeduct = (debitAmount || 0) - (creditAmount || 0);

    const updated = await User.findOneAndUpdate(
      { gameId, wallet: { $gte: toDeduct } },
      { $inc: { wallet: -toDeduct } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updated) {
      return res
        .status(200)
        .json({ status: "502", msg: "Insufficient Balance" });
    }

    const ticketListResponse = [];
    const betRecords = ticketList.map((ticket) => {
      const licenseeTxId = generateTransactionId();
      ticketListResponse.push({ refId: ticket.refId, licenseeTxId });
      return {
        username: gameId,
        bet: true,
        betType: "ent",
        productId,
        productName: productName_en,
        gameName: gameName_en,
        roundId,
        betamount: roundToTwoDecimals(ticket.stake || 0),
        actualAmount: roundToTwoDecimals(ticket.actualStake || 0),
        tranId: ticket.refId,
        licenseeTxId,
        betChoice: ticket.betChoice_en || "",
        extra: JSON.stringify(ticket.extra || {}),
        betTime,
        IP,
      };
    });

    SportSabaSportModal.insertMany(betRecords).catch((err) =>
      console.error("SABASPORT placebetent insert error:", err.message)
    );

    return res.status(200).json({
      status: "0",
      msg: "Success",
      userId,
      balance: roundToTwoDecimals(updated.wallet),
      ticketList: ticketListResponse,
    });
  } catch (error) {
    console.error("SABASPORT placebetent error:", error.message);
    return res
      .status(200)
      .json({ status: "902", msg: "Internal Server Error" });
  }
});

// ============================================
// SETTLE ENT
// ============================================
router.post("/api/sabasport/settleent", async (req, res) => {
  try {
    const { key, message } = req.body;

    if (!key || !message) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }
    if (key !== sabasportAccount) {
      return res.status(200).json({ status: "311", msg: "Invalid key" });
    }

    const {
      userId,
      refId,
      status,
      actualStake,
      netStake,
      winLostDate,
      creditAmount,
      debitAmount,
      winlostAmount,
      txIds,
    } = message;
    const gameId = extractGameId(userId);
    if (!gameId) {
      return res
        .status(200)
        .json({ status: "101", msg: "Invalid userId format" });
    }

    const [user, existing] = await Promise.all([
      User.findOne({ gameId }, { wallet: 1 }).lean(),
      SportSabaSportModal.findOne(
        { tranId: refId, settle: true, txId: { $in: txIds } },
        { _id: 1 }
      ).lean(),
    ]);

    if (!user) {
      return res
        .status(200)
        .json({ status: "203", msg: "Account is not exist" });
    }
    if (existing) {
      return res.status(200).json({ status: "0" });
    }

    const toChange = (creditAmount || 0) - (debitAmount || 0);

    const promises = [
      SportSabaSportModal.updateOne(
        { tranId: refId },
        {
          $set: {
            settle: true,
            status,
            actualAmount: roundToTwoDecimals(actualStake || 0),
            netStake: roundToTwoDecimals(netStake || 0),
            payout: roundToTwoDecimals(creditAmount || 0),
            winlostAmount: roundToTwoDecimals(winlostAmount || 0),
            winlostDate: winLostDate,
            txId: txIds[0],
            creditAmount: roundToTwoDecimals(creditAmount || 0),
            debitAmount: roundToTwoDecimals(debitAmount || 0),
          },
        }
      ),
    ];

    if (toChange !== 0) {
      promises.push(
        User.updateOne(
          { gameId },
          { $inc: { wallet: roundToTwoDecimals(toChange) } }
        )
      );
    }

    await Promise.all(promises);

    return res.status(200).json({ status: "0" });
  } catch (error) {
    console.error("SABASPORT settleent error:", error.message);
    return res
      .status(200)
      .json({ status: "902", msg: "Internal Server Error" });
  }
});

// ============================================
// CANCEL BET ENT
// ============================================
router.post("/api/sabasport/cancelbetent", async (req, res) => {
  try {
    const { key, message } = req.body;

    if (!key || !message) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }
    if (key !== sabasportAccount) {
      return res.status(200).json({ status: "311", msg: "Invalid key" });
    }

    const {
      userId,
      refId,
      winLostDate,
      creditAmount,
      debitAmount,
      winlostAmount,
      txIds,
    } = message;
    const gameId = extractGameId(userId);
    if (!gameId) {
      return res
        .status(200)
        .json({ status: "101", msg: "Invalid userId format" });
    }

    const [user, existing] = await Promise.all([
      User.findOne({ gameId }, { wallet: 1 }).lean(),
      SportSabaSportModal.findOne(
        { tranId: refId, cancel: true },
        { _id: 1 }
      ).lean(),
    ]);

    if (!user) {
      return res
        .status(200)
        .json({ status: "203", msg: "Account is not exist" });
    }
    if (existing) {
      return res.status(200).json({ status: "0" });
    }

    const toChange = (creditAmount || 0) - (debitAmount || 0);

    const promises = [
      SportSabaSportModal.updateOne(
        { tranId: refId },
        {
          $set: {
            cancel: true,
            winlostDate: winLostDate,
            txId: txIds[0],
            creditAmount: roundToTwoDecimals(creditAmount || 0),
            debitAmount: roundToTwoDecimals(debitAmount || 0),
            winlostAmount: roundToTwoDecimals(winlostAmount || 0),
          },
        }
      ),
    ];

    if (toChange !== 0) {
      promises.push(
        User.updateOne(
          { gameId },
          { $inc: { wallet: roundToTwoDecimals(toChange) } }
        )
      );
    }

    await Promise.all(promises);

    return res.status(200).json({ status: "0" });
  } catch (error) {
    console.error("SABASPORT cancelbetent error:", error.message);
    return res
      .status(200)
      .json({ status: "902", msg: "Internal Server Error" });
  }
});

// ============================================
// GET TICKET INFO
// ============================================
router.post("/api/sabasport/getticketinfo", async (req, res) => {
  try {
    const { key, message } = req.body;

    if (!key || !message) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }
    if (key !== sabasportAccount) {
      return res.status(200).json({ status: "311", msg: "Invalid key" });
    }

    const { userId, refId } = message;
    const gameId = extractGameId(userId);
    if (!gameId) {
      return res
        .status(200)
        .json({ status: "101", msg: "Invalid userId format" });
    }

    const ticket = await SportSabaSportModal.findOne(
      { tranId: refId, username: gameId },
      { status: 1, actualAmount: 1, winlostAmount: 1, settle: 1, cancel: 1 }
    ).lean();

    if (!ticket) {
      return res.status(200).json({ status: "203", msg: "Ticket not found" });
    }

    let ticketStatus = "running";
    if (ticket.cancel) {
      ticketStatus = "void";
    } else if (ticket.settle) {
      ticketStatus = ticket.status?.toLowerCase() || "running";
    }

    return res.status(200).json({
      status: "0",
      msg: "Success",
      ticketStatus,
      actualStake: roundToTwoDecimals(ticket.actualAmount || 0),
      winlostAmount: roundToTwoDecimals(ticket.winlostAmount || 0),
    });
  } catch (error) {
    console.error("SABASPORT getticketinfo error:", error.message);
    return res.status(200).json({ status: "904", msg: "Request Timeout" });
  }
});

// ============================================
// HEALTH CHECK
// ============================================
router.post("/api/sabasport/healthcheck", async (req, res) => {
  try {
    const { key, message } = req.body;

    if (!key || !message) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }
    if (key !== sabasportAccount) {
      return res.status(200).json({ status: "311", msg: "Invalid key" });
    }

    return res.status(200).json({ status: "0" });
  } catch (error) {
    console.error("SABASPORT healthcheck error:", error.message);
    return res.status(200).json({ status: "904", msg: "Request Timeout" });
  }
});

// ============================================
// ADJUST BALANCE
// ============================================
router.post("/api/sabasport/adjustbalance", async (req, res) => {
  try {
    const { key, message } = req.body;

    if (!key || !message) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }
    if (key !== sabasportAccount) {
      return res.status(200).json({ status: "311", msg: "Invalid key" });
    }

    const {
      time,
      userId,
      txId,
      refNo,
      refId,
      operationId,
      betType,
      betTypeName,
      winlostDate,
      balanceInfo,
    } = message;
    const gameId = extractGameId(userId);
    if (!gameId) {
      return res
        .status(200)
        .json({ status: "101", msg: "Invalid userId format" });
    }

    const [user, existing] = await Promise.all([
      User.findOne({ gameId }, { wallet: 1 }).lean(),
      SportSabaSportModal.findOne(
        { adjustOperationId: operationId },
        { _id: 1 }
      ).lean(),
    ]);

    if (!user) {
      return res
        .status(200)
        .json({ status: "203", msg: "Account is not exist" });
    }
    if (existing) {
      return res.status(200).json({ status: "0" });
    }

    const { creditAmount, debitAmount } = balanceInfo;
    const toChange = (creditAmount || 0) - (debitAmount || 0);

    const promises = [
      SportSabaSportModal.create({
        username: gameId,
        betType: "adjust",
        adjustOperationId: operationId,
        tranId: refId,
        txId,
        refNo: refNo || 0,
        sabaBetType: betType,
        betTypeName,
        winlostDate,
        creditAmount: roundToTwoDecimals(creditAmount || 0),
        debitAmount: roundToTwoDecimals(debitAmount || 0),
        adjustTime: time,
      }),
    ];

    if (toChange !== 0) {
      promises.push(
        User.updateOne(
          { gameId },
          { $inc: { wallet: roundToTwoDecimals(toChange) } }
        )
      );
    }

    await Promise.all(promises);

    return res.status(200).json({ status: "0" });
  } catch (error) {
    console.error("SABASPORT adjustbalance error:", error.message);
    return res
      .status(200)
      .json({ status: "902", msg: "Internal Server Error" });
  }
});
module.exports = router;
