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
      { gameId, wallet: { $gte: roundToTwoDecimals(Math.abs(toDeduct)) } },
      { $inc: { wallet: roundToTwoDecimals(toDeduct) } },
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
      betamount: roundToTwoDecimals(Math.abs(toDeduct)),
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

    const { operationId, userId, txns } = message;
    console.log("confirmbet", message);

    const gameId = extractGameId(userId);
    if (!gameId) {
      return res
        .status(200)
        .json({ status: "101", msg: "Invalid userId format" });
    }

    const refIds = txns.map((txn) => txn.refId);

    const [user, existingBets] = await Promise.all([
      User.findOne({ gameId }, { wallet: 1 }).lean(),
      SportSabaSportModal.find(
        { tranId: { $in: refIds } },
        { tranId: 1, confirmbet: 1 }
      ).lean(),
    ]);

    if (!user) {
      return res
        .status(200)
        .json({ status: "203", msg: "Account is not exist" });
    }

    const foundRefIds = new Set(existingBets.map((bet) => bet.tranId));
    const confirmedRefIds = new Set(
      existingBets.filter((bet) => bet.confirmbet).map((bet) => bet.tranId)
    );

    const missingRefIds = refIds.filter((refId) => !foundRefIds.has(refId));
    if (missingRefIds.length) {
      return res.status(200).json({
        status: "504",
        msg: `Bet not found: ${missingRefIds.join(", ")}`,
      });
    }

    let totalChange = 0;
    const bulkBetOps = [];

    for (const txn of txns) {
      if (confirmedRefIds.has(txn.refId)) continue;

      const change = (txn.creditAmount || 0) - (txn.debitAmount || 0);
      totalChange += change;

      bulkBetOps.push({
        updateOne: {
          filter: { tranId: txn.refId },
          update:
            change < 0
              ? {
                  $set: {
                    confirmbet: true,
                    confirmbetId: operationId,
                    isOddsChanged: txn.isOddsChanged || false,
                  },
                  $inc: { betamount: roundToTwoDecimals(-change) },
                }
              : {
                  $set: {
                    confirmbet: true,
                    confirmbetId: operationId,
                    isOddsChanged: txn.isOddsChanged || false,
                  },
                },
        },
      });
    }

    if (!bulkBetOps.length) {
      return res
        .status(200)
        .json({ status: "0", balance: roundToTwoDecimals(user.wallet) });
    }

    const walletQuery =
      totalChange < 0
        ? {
            gameId,
            wallet: { $gte: roundToTwoDecimals(totalChange) },
          }
        : { gameId };

    const [updated] = await Promise.all([
      totalChange !== 0
        ? User.findOneAndUpdate(
            walletQuery,
            { $inc: { wallet: roundToTwoDecimals(totalChange) } },
            { new: true, projection: { wallet: 1 } }
          ).lean()
        : Promise.resolve(user),
      SportSabaSportModal.bulkWrite(bulkBetOps),
    ]);

    if (totalChange < 0 && !updated) {
      return res
        .status(200)
        .json({ status: "502", msg: "Insufficient Balance" });
    }

    return res
      .status(200)
      .json({ status: "0", balance: roundToTwoDecimals(updated.wallet) });
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
              settleamount: roundToTwoDecimals(change || 0),
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

    const refIds = txns.map((txn) => txn.refId);

    const [existing, existingBets] = await Promise.all([
      SportSabaSportModal.findOne(
        { unsettleOperationId: operationId },
        { _id: 1 }
      ).lean(),
      SportSabaSportModal.find(
        { tranId: { $in: refIds } },
        { tranId: 1, settle: 1 }
      ).lean(),
    ]);

    if (existing) {
      return res.status(200).json({ status: "0" });
    }

    const settledRefIds = new Set(
      existingBets.filter((bet) => bet.settle).map((bet) => bet.tranId)
    );

    const settledTxns = txns.filter((txn) => settledRefIds.has(txn.refId));

    if (!settledTxns.length) {
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
              unsettleOperationId: operationId,
              settle: false,
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

      const change = (txn.creditAmount || 0) - (txn.debitAmount || 0);
      userChanges[gameId] = (userChanges[gameId] || 0) + change;

      bulkBetOps.push({
        updateOne: {
          filter: { tranId: txn.refId },
          update: {
            $set: {
              resettleOperationId: operationId,
              status: txn.status,
              resettleamount: roundToTwoDecimals(change || 0),
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
    if (!gameId || !txns?.length) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }

    const [user, existing] = await Promise.all([
      User.findOne(
        { gameId },
        { wallet: 1, "gameLock.sabasport.lock": 1 }
      ).lean(),
      SportSabaSportModal.find(
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
    if (existing.length) {
      return res.status(200).json({
        status: "0",
        txns: existing.map((t) => ({
          refId: t.tranId,
          licenseeTxId: t.licenseeTxId,
        })),
      });
    }

    const totalChange = (creditAmount || 0) - (debitAmount || 0);

    const walletQuery =
      totalChange < 0
        ? {
            gameId,
            wallet: { $gte: roundToTwoDecimals(totalChange) },
          }
        : { gameId };

    const updated = await User.findOneAndUpdate(
      walletQuery,
      { $inc: { wallet: roundToTwoDecimals(totalChange) } },
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
      const totalChangeForEach =
        (txn.creditAmount || 0) - (txn.debitAmount || 0);
      txnsResponse.push({ refId: txn.refId, licenseeTxId });
      return {
        operationId: operationId,
        username: gameId,
        bet: true,
        betamount: roundToTwoDecimals(Math.abs(totalChangeForEach) || 0),
        tranId: txn.refId,
      };
    });

    await SportSabaSportModal.insertMany(betRecords);

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

    const { operationId, userId, updateTime, transactionTime, txns } = message;
    console.log("confirmbetparlay", message);

    const gameId = extractGameId(userId);
    if (!gameId || !txns?.length) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }

    const refIds = txns.map((txn) => txn.refId);

    const [user, existingBets] = await Promise.all([
      User.findOne({ gameId }, { wallet: 1 }).lean(),
      SportSabaSportModal.find(
        { tranId: { $in: refIds } },
        { tranId: 1, confirmed: 1 }
      ).lean(),
    ]);

    if (!user) {
      return res
        .status(200)
        .json({ status: "203", msg: "Account is not exist" });
    }

    // Use Set for O(1) lookup
    const foundRefIds = new Set(existingBets.map((bet) => bet.tranId));
    const confirmedRefIds = new Set(
      existingBets.filter((bet) => bet.confirmed).map((bet) => bet.tranId)
    );

    // Check missing
    const missingRefIds = refIds.filter((refId) => !foundRefIds.has(refId));
    if (missingRefIds.length) {
      return res.status(200).json({
        status: "504",
        msg: `Bet not found: ${missingRefIds.join(", ")}`,
      });
    }

    // Filter pending and build bulk ops in one loop
    let totalChange = 0;
    const bulkBetOps = [];

    for (const txn of txns) {
      if (confirmedRefIds.has(txn.refId)) continue;

      const change = (txn.creditAmount || 0) - (txn.debitAmount || 0);
      totalChange += change;

      bulkBetOps.push({
        updateOne: {
          filter: { tranId: txn.refId },
          update:
            change < 0
              ? {
                  $set: {
                    confirmed: true,
                    confirmedOperationId: operationId,
                    licenseeTxId: txn.licenseeTxId,
                    isOddsChanged: txn.isOddsChanged || false,
                  },
                  $inc: { betamount: roundToTwoDecimals(Math.abs(change)) },
                }
              : {
                  $set: {
                    confirmed: true,
                    confirmedOperationId: operationId,
                    licenseeTxId: txn.licenseeTxId,
                    isOddsChanged: txn.isOddsChanged || false,
                  },
                },
        },
      });
    }

    // All already confirmed
    if (!bulkBetOps.length) {
      return res
        .status(200)
        .json({ status: "0", balance: roundToTwoDecimals(user.wallet) });
    }

    // Build wallet query - check balance only if deducting
    const walletQuery =
      totalChange < 0
        ? {
            gameId,
            wallet: { $gte: roundToTwoDecimals(Math.abs(totalChange)) },
          }
        : { gameId };

    // Execute wallet update and bulk ops in parallel
    const [updated] = await Promise.all([
      totalChange !== 0
        ? User.findOneAndUpdate(
            walletQuery,
            { $inc: { wallet: roundToTwoDecimals(totalChange) } },
            { new: true, projection: { wallet: 1 } }
          ).lean()
        : Promise.resolve(user),
      SportSabaSportModal.bulkWrite(bulkBetOps),
    ]);

    // Check if insufficient balance (only when deducting)
    if (totalChange < 0 && !updated) {
      return res
        .status(200)
        .json({ status: "502", msg: "Insufficient Balance" });
    }

    return res
      .status(200)
      .json({ status: "0", balance: roundToTwoDecimals(updated.wallet) });
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

    const { operationId, userId, ticketList, creditAmount, debitAmount } =
      message;
    const gameId = extractGameId(userId);
    if (!gameId || !ticketList?.length) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }

    const [user, existing] = await Promise.all([
      User.findOne(
        { gameId },
        { wallet: 1, "gameLock.sabasport.lock": 1 }
      ).lean(),
      SportSabaSportModal.find(
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

    if (existing.length) {
      return res.status(200).json({
        status: "0",
        balance: roundToTwoDecimals(user.wallet),
        txns: existing.map((t) => ({
          refId: t.tranId,
          licenseeTxId: t.licenseeTxId,
        })),
      });
    }

    const totalChange = (creditAmount || 0) - (debitAmount || 0);

    const walletQuery =
      totalChange < 0
        ? {
            gameId,
            wallet: { $gte: roundToTwoDecimals(Math.abs(totalChange)) },
          }
        : { gameId };

    const updated = await User.findOneAndUpdate(
      walletQuery,
      { $inc: { wallet: roundToTwoDecimals(totalChange) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (totalChange < 0 && !updated) {
      return res
        .status(200)
        .json({ status: "502", msg: "Insufficient Balance" });
    }

    const txnsResponse = [];
    const betRecords = ticketList.map((ticket) => {
      const licenseeTxId = generateTransactionId();
      const ticketChange =
        (ticket.creditAmount || 0) - (ticket.debitAmount || 0);
      txnsResponse.push({ refId: ticket.refId, licenseeTxId });
      return {
        operationId,
        username: gameId,
        bet: true,
        tranId: ticket.refId,
        licenseeTxId,
        betamount: roundToTwoDecimals(Math.abs(ticketChange)),
      };
    });

    await SportSabaSportModal.insertMany(betRecords);

    return res.status(200).json({
      status: "0",
      balance: roundToTwoDecimals(updated?.wallet || user.wallet),
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

    const { operationId, userId, txns, creditAmount, debitAmount } = message;
    console.log("confirmbet3rd", message);

    const gameId = extractGameId(userId);
    if (!gameId || !txns?.length) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
    }

    const refIds = txns.map((txn) => txn.refId);

    const [user, existingBets] = await Promise.all([
      User.findOne({ gameId }, { wallet: 1 }).lean(),
      SportSabaSportModal.find(
        { tranId: { $in: refIds } },
        { tranId: 1, confirmbet: 1 }
      ).lean(),
    ]);

    if (!user) {
      return res
        .status(200)
        .json({ status: "203", msg: "Account is not exist" });
    }

    const foundRefIds = new Set(existingBets.map((bet) => bet.tranId));
    const confirmedRefIds = new Set(
      existingBets.filter((bet) => bet.confirmbet).map((bet) => bet.tranId)
    );

    const missingRefIds = refIds.filter((refId) => !foundRefIds.has(refId));
    if (missingRefIds.length) {
      return res.status(200).json({
        status: "504",
        msg: `Bet not found: ${missingRefIds.join(", ")}`,
      });
    }

    let totalChange = 0;
    const bulkBetOps = [];

    for (const txn of txns) {
      if (confirmedRefIds.has(txn.refId)) continue;

      const change = (txn.creditAmount || 0) - (txn.debitAmount || 0);
      totalChange += change;

      bulkBetOps.push({
        updateOne: {
          filter: { tranId: txn.refId },
          update:
            change < 0
              ? {
                  $set: {
                    confirmbet: true,
                    confirmbetId: operationId,
                  },
                  $inc: { betamount: roundToTwoDecimals(Math.abs(change)) },
                }
              : {
                  $set: {
                    confirmbet: true,
                    confirmbetId: operationId,
                  },
                },
        },
      });
    }

    if (!bulkBetOps.length) {
      return res
        .status(200)
        .json({ status: "0", balance: roundToTwoDecimals(user.wallet) });
    }

    const walletQuery =
      totalChange < 0
        ? {
            gameId,
            wallet: { $gte: roundToTwoDecimals(Math.abs(totalChange)) },
          }
        : { gameId };

    const [updated] = await Promise.all([
      totalChange !== 0
        ? User.findOneAndUpdate(
            walletQuery,
            { $inc: { wallet: roundToTwoDecimals(totalChange) } },
            { new: true, projection: { wallet: 1 } }
          ).lean()
        : Promise.resolve(user),
      SportSabaSportModal.bulkWrite(bulkBetOps),
    ]);

    if (totalChange < 0 && !updated) {
      return res
        .status(200)
        .json({ status: "502", msg: "Insufficient Balance" });
    }

    return res
      .status(200)
      .json({ status: "0", balance: roundToTwoDecimals(updated.wallet) });
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

    const { userId, ticketList, creditAmount, debitAmount } = message;
    const gameId = extractGameId(userId);
    if (!gameId || !ticketList?.length) {
      return res.status(200).json({ status: "101", msg: "Invalid request" });
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

    // Return existing if same refId already processed
    if (existing) {
      return res.status(200).json({
        status: "0",
        msg: "Success",
        userId,
        balance: roundToTwoDecimals(user.wallet),
        ticketList: ticketList.map((t) => ({
          refId: t.refId,
          licenseeTxId: existing.licenseeTxId,
        })),
      });
    }

    const totalChange = (creditAmount || 0) - (debitAmount || 0);

    const walletQuery =
      totalChange < 0
        ? {
            gameId,
            wallet: { $gte: roundToTwoDecimals(Math.abs(totalChange)) },
          }
        : { gameId };

    const updated = await User.findOneAndUpdate(
      walletQuery,
      { $inc: { wallet: roundToTwoDecimals(totalChange) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (totalChange < 0 && !updated) {
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
        tranId: ticket.refId,
        licenseeTxId,
        betamount: roundToTwoDecimals(ticket.actualStake || 0),
      };
    });

    await SportSabaSportModal.insertMany(betRecords);

    return res.status(200).json({
      status: "0",
      msg: "Success",
      userId,
      balance: roundToTwoDecimals(updated?.wallet || user.wallet),
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

    const { userId, refId, creditAmount, debitAmount, txIds } = message;
    const gameId = extractGameId(userId);
    if (!gameId) {
      return res
        .status(200)
        .json({ status: "101", msg: "Invalid userId format" });
    }

    const [user, existing] = await Promise.all([
      User.findOne({ gameId }, { wallet: 1 }).lean(),
      SportSabaSportModal.findOne(
        {
          tranId: refId,
          settle: true,
          settleOperationId: txIds?.[0]?.toString(),
        },
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

    const totalChange = (creditAmount || 0) - (debitAmount || 0);

    await Promise.all([
      SportSabaSportModal.updateOne(
        { tranId: refId },
        {
          $set: {
            settle: true,
            settleOperationId: txIds?.[0]?.toString() || "",
            settleamount: roundToTwoDecimals(totalChange),
          },
        }
      ),
      totalChange !== 0
        ? User.updateOne(
            { gameId },
            { $inc: { wallet: roundToTwoDecimals(totalChange) } }
          )
        : Promise.resolve(),
    ]);

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

    const { userId, refId, creditAmount, debitAmount, txIds } = message;
    const gameId = extractGameId(userId);
    if (!gameId) {
      return res
        .status(200)
        .json({ status: "101", msg: "Invalid userId format" });
    }

    const [user, existing] = await Promise.all([
      User.findOne({ gameId }, { wallet: 1 }).lean(),
      SportSabaSportModal.findOne(
        {
          tranId: refId,
          cancel: true,
          cancelOperationId: txIds?.[0]?.toString(),
        },
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

    const totalChange = (creditAmount || 0) - (debitAmount || 0);

    await Promise.all([
      SportSabaSportModal.updateOne(
        { tranId: refId },
        {
          $set: {
            cancel: true,
            cancelOperationId: txIds?.[0]?.toString() || "",
          },
        }
      ),
      totalChange !== 0
        ? User.updateOne(
            { gameId },
            { $inc: { wallet: roundToTwoDecimals(totalChange) } }
          )
        : Promise.resolve(),
    ]);

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
      { betamount: 1, settleamount: 1, settle: 1, cancel: 1 }
    ).lean();

    if (!ticket) {
      return res.status(200).json({ status: "203", msg: "Ticket not found" });
    }

    let ticketStatus = "running";
    if (ticket.cancel) {
      ticketStatus = "void";
    } else if (ticket.settle) {
      ticketStatus = "won"; // Default to won if settled, adjust based on settleamount
      if ((ticket.settleamount || 0) < 0) {
        ticketStatus = "lose";
      } else if ((ticket.settleamount || 0) === 0) {
        ticketStatus = "draw";
      }
    }

    return res.status(200).json({
      status: "0",
      msg: "Success",
      ticketStatus,
      actualStake: roundToTwoDecimals(ticket.betamount || 0),
      winlostAmount: roundToTwoDecimals(ticket.settleamount || 0),
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

    const { userId, refId, operationId, balanceInfo } = message;
    const gameId = extractGameId(userId);
    if (!gameId) {
      return res
        .status(200)
        .json({ status: "101", msg: "Invalid userId format" });
    }

    const [user, existing] = await Promise.all([
      User.findOne({ gameId }, { wallet: 1 }).lean(),
      SportSabaSportModal.findOne({ operationId }, { _id: 1 }).lean(),
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
    const totalChange = (creditAmount || 0) - (debitAmount || 0);
    const roundedChange = roundToTwoDecimals(totalChange);

    const record = {
      username: gameId,
      operationId,
      tranId: refId,
      settle: true,
      bet: true,
    };

    if (totalChange < 0) {
      record.betamount = roundToTwoDecimals(Math.abs(totalChange));
    } else if (totalChange > 0) {
      record.settleamount = roundedChange;
    }

    if (totalChange !== 0) {
      if (totalChange < 0) {
        const walletUpdate = await User.findOneAndUpdate(
          { gameId, wallet: { $gte: Math.abs(roundedChange) } },
          { $inc: { wallet: roundedChange } },
          { new: true, projection: { wallet: 1 } }
        ).lean();

        if (!walletUpdate) {
          return res
            .status(200)
            .json({ status: "502", msg: "Insufficient Balance" });
        }
      } else {
        await User.updateOne({ gameId }, { $inc: { wallet: roundedChange } });
      }
    }

    await SportSabaSportModal.create(record);

    return res.status(200).json({ status: "0" });
  } catch (error) {
    console.error("SABASPORT adjustbalance error:", error.message);
    return res
      .status(200)
      .json({ status: "902", msg: "Internal Server Error" });
  }
});
module.exports = router;
