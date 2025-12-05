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
const oncasinoAgent = "EGM8MYR";

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

function generateOnCasinoSign(params, secret) {
  const sortedKeys = Object.keys(params)
    .filter((key) => {
      if (key === "sign") return false;
      const value = params[key];
      return value !== null && value !== undefined && value !== "";
    })
    .sort();

  const paramString = sortedKeys
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const stringToSign = paramString + "&key=" + secret;

  return crypto.createHash("md5").update(stringToSign).digest("hex");
}

function verifyOnCasinoSign(params, secret) {
  const { agent, userName, taskNo, nonceStr } = params;

  const signParams = { agent, userName, taskNo, nonceStr };

  const sortedKeys = Object.keys(signParams)
    .filter((key) => signParams[key] !== null && signParams[key] !== undefined)
    .sort();

  const paramString = sortedKeys
    .map((key) => `${key}=${signParams[key]}`)
    .join("&");

  const stringToSign = paramString + "&key=" + secret;

  return crypto.createHash("md5").update(stringToSign).digest("hex");
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

    if (user.gameLock.oncasino.lock) {
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

    let platform = 0;
    if (clientPlatform === "web") {
      platform = 0;
    } else if (clientPlatform === "mobile") {
      platform = 1;
    }

    const token = `${user.gameId}:${generateRandomCode()}`;

    const nonceStr = generateNonceStr();

    const requestBody = {
      lang,
      userName: user.gameId,
      loginSrc: platform,
      agent: oncasinoAgent,
      nickName: user.username,
      backUrl: webURL,
      testFlag: 0,
      nonceStr,
    };

    const sign = generateOnCasinoSign(requestBody, oncasinoSecret);
    requestBody.sign = sign;

    const response = await axios.post(
      `${oncasinoAPIURL}/api/game-center/login`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          "x-session-platform-code": "WE88",
          "x-plat-token": token,
        },
      }
    );

    if (response.data.code !== 0) {
      console.log("ON CASINO error in launching game", response.data);

      return res.status(200).json({
        success: false,
        message: {
          en: "ON CASINO: Game launch failed. Please try again or customer service for assistance.",
          zh: "ON CASINO: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "ON CASINO: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "ON CASINO: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "ON CASINO: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        oncasinoGameToken: token,
      },
      { new: true }
    );

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "ON CASINO"
    );

    const gameUrl = `${response.data.t.domain}${response.data.t.token}`;

    return res.status(200).json({
      success: true,
      gameLobby: gameUrl,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("ON CASINO error in launching game", error);
    return res.status(200).json({
      success: false,
      message: {
        en: "ON CASINO: Game launch failed. Please try again or customer service for assistance.",
        zh: "ON CASINO: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "ON CASINO: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "ON CASINO: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "ON CASINO: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/oncasino/getBalance", async (req, res) => {
  try {
    const sessiontoken = req.headers["x-plat-token"];

    const { agent, userName, taskNo, sign, nonceStr } = req.body;

    const expectedSign = verifyOnCasinoSign(
      { agent, userName, taskNo, nonceStr },
      oncasinoSecret
    );
    if (sign !== expectedSign) {
      return res.status(200).json({
        success: false,
        msg: "Invalid Sign",
        code: 500,
      });
    }

    const currentUser = await User.findOne(
      { gameId: userName },
      { wallet: 1, oncasinoGameToken: 1 }
    ).lean();

    if (!currentUser || currentUser.oncasinoGameToken !== sessiontoken) {
      return res.status(200).json({
        success: false,
        msg: "Invalid User",
        code: 8050,
      });
    }

    return res.status(200).json({
      success: true,
      msg: "Success",
      code: 0,
      t: {
        balance: roundToTwoDecimals(currentUser.wallet),
        currency: "MYR",
      },
    });
  } catch (error) {
    console.error(
      "ONCASINO: Error in game provider calling ae96 get balance api:",
      error.message
    );
    return res.status(200).json({
      success: false,
      msg: "Internal Server Error",
      code: 500,
    });
  }
});

module.exports = router;
