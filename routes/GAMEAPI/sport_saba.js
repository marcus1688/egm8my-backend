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
const SportM9BetModal = require("../../models/sport_m9bet.model");
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

router.post("/api/sabasport/getbalance", async (req, res) => {
  try {
    const { key, message } = req.body;
    console.log(req.body, "hi");

    if (!key || !message) {
      return res.status(200).json({
        status: "101",
        msg: "Invalid request",
      });
    }
    if (key !== sabasportAccount) {
      return res.status(200).json({
        status: "311",
        msg: "Invalid key",
      });
    }

    const { action, userId } = message;

    const gameId = userId.replace(`${sabasportOperatorID}_`, "");

    if (!gameId) {
      return res.status(200).json({
        status: "101",
        msg: "Invalid userId format",
      });
    }

    const currentUser = await User.findOne(
      { gameId: gameId },
      { wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(200).json({
        status: "203",
        msg: "Account is not exist",
      });
    }

    return res.status(200).json({
      status: "0",
      userId,
      balance: roundToTwoDecimals(currentUser.wallet),
      balanceTs: generateBalanceTs(),
      msg: null,
    });
  } catch (error) {
    console.error(
      "SABASPORT: Error in game provider calling ae96 get balance api:",
      error.message
    );
    return res.status(200).json({
      status: "902",
      msg: "Internal Server Error",
    });
  }
});

module.exports = router;
