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
const jwt = require("jsonwebtoken");
const moment = require("moment");
const GameWalletLog = require("../../models/gamewalletlog.model");
const Decimal = require("decimal.js");
require("dotenv").config();

const oncasinoSecret = process.env.ONCASINO_SECRET;
const webURL = "https://www.bm8my.vip/";
const oncasinoAPIURL = "https://third-api.ongames.info";
const oncasinoAgent = "EGM8MYRUAT";

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

const generatePassword = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }

  return result;
};

function generateOnCasinoSign(params, secret) {
  const sortedKeys = Object.keys(params)
    .filter((key) => key !== "sign")
    .sort();

  const paramString = sortedKeys
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const stringToSign = paramString + secret;

  return crypto.createHash("md5").update(stringToSign).digest("hex");
}

function generateNonceStr() {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 5; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }
  return result;
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

function generateTraceCode() {
  return uuidv4();
}

router.post("/api/oncasino/launchGame", authenticateToken, async (req, res) => {
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

    if (user.gameLock.sbobet.lock) {
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

    const { gameLang, clientPlatform } = req.body;

    let lang = "en";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "zh-CN";
    } else if (gameLang === "ms") {
      lang = "en";
    } else if (gameLang === "id") {
      lang = "id-ID";
    } else if (gameLang === "zh_hk") {
      lang = "zh-TW";
    }

    let platform = 1;
    if (clientPlatform === "web") {
      platform = 0;
    } else if (clientPlatform === "mobile") {
      platform = 1;
    }

    const nonceStr = generateNonceStr();
    const timestamp = Date.now();

    const requestBody = {
      lang,
      userName: user.gameId,
      loginSrc: platform,
      agent: oncasinoAgent,
      nickName: user.username,
      backUrl: webURL,
      testFlag: 0,
      nonceStr,
      timestamp,
    };

    const sign = generateOnCasinoSign(requestBody, oncasinoSecret);
    requestBody.sign = sign;

    console.log("OnCasino request body:", requestBody);

    const response = await axios.post(
      `${oncasinoAPIURL}/api/game-center/login`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          "x-session-platform-code": "IG",
          "x-lang": lang,
        },
      }
    );

    if (response.data.error.id !== 0) {
      console.log("SBOBET error in launching game", response.data);

      if (response.data.ErrorCode === 104) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Game under maintenance. Please try again later.",
            zh: "游戏正在维护中，请稍后再试。",
            ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
            zh_hk: "遊戲正在維護中，請稍後再試。",
            id: "Permainan sedang dalam pemeliharaan. Silakan coba lagi nanti.",
          },
        });
      }

      return res.status(200).json({
        success: false,
        message: {
          en: "SBOBET: Game launch failed. Please try again or customer service for assistance.",
          zh: "SBOBET: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "SBOBET: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "SBOBET: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "SBOBET: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "SBOBET"
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
    console.log("SBOBET error in launching game", error);
    return res.status(200).json({
      success: false,
      message: {
        en: "SBOBET: Game launch failed. Please try again or customer service for assistance.",
        zh: "SBOBET: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "SBOBET: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "SBOBET: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "SBOBET: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

module.exports = router;
