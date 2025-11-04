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

const sbobetSecret = process.env.SBOBET_SECRET;
const webURL = "http://egm8my.vip/";
const sbobetAPIURL = "https://ex-api-yy.xxttgg.com";
const sbobetAgent = "EGM8MYR";

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

async function registerSBOBETUser(user) {
  try {
    console.log("hi");
    const requestData = {
      CompanyKey: sbobetSecret,
      ServerID: generateTraceCode(),
      //   Username: user.gameId,
      Username: "test",
      Agent: sbobetAgent,
      UserGroup: "b",
    };
    console.log(requestData);
    console.log(
      `${sbobetAPIURL}/web-root/restricted/player/register-player.aspx`
    );
    const response = await axios.post(
      `${sbobetAPIURL}/restricted/player/register-player.aspx`,
      requestData,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    console.log("sbo response", response.data);
    return {
      success: false,
      data: `Info ${info}, Msg ${msg}`,
    };
  } catch (error) {
    console.error("PlayAce error in creating member:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

router.post("/api/sbobet/launchGame", authenticateToken, async (req, res) => {
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

    const registerPlayer = await registerSBOBETUser(user);
    console.log("hi", registerPlayer);
    return;

    if (user.gameLock.yesgetrich.lock) {
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

    const { gameLang, gameCode } = req.body;

    let lang = "en-US";

    if (gameLang === "en") {
      lang = "en-US";
    } else if (gameLang === "zh") {
      lang = "zh-CN";
    } else if (gameLang === "ms") {
      lang = "en-US";
    } else if (gameLang === "id") {
      lang = "id-ID";
    } else if (gameLang === "zh_hk") {
      lang = "zh-TW";
    }

    let token = `${user.gameId}:${gameCode}:${generateRandomCode()}`;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000);

    await User.findByIdAndUpdate(
      user._id,
      {
        $push: {
          ygrGameTokens: {
            token: token,
            createdAt: now,
            expiresAt: expiresAt,
          },
        },
      },
      { new: true }
    );

    const response = await axios.get(
      `${ygrLaunchAPIURL}/launch?token=${token}&language=${lang}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: ygrHeaders,
          Supplier: ygrHeaders,
        },
      }
    );

    if (response.data.ErrorCode !== 0) {
      console.log("YGR error in launching game", response.data);

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
          en: "YGR: Game launch failed. Please try again or customer service for assistance.",
          zh: "YGR: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "YGR: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "YGR: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "YGR: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "YGR"
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data.Data.Url,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("YGR error in launching game", error);
    return res.status(200).json({
      success: false,
      message: {
        en: "YGR: Game launch failed. Please try again or customer service for assistance.",
        zh: "YGR: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "YGR: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "YGR: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "YGR: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

module.exports = router;
