const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");
const CryptoJS = require("crypto-js");
const { authenticateToken } = require("../../auth/auth");
const { authenticateAdminToken } = require("../../auth/adminAuth");
const {
  User,
  adminUserWalletLog,
  GameDataLog,
} = require("../../models/users.model");
const SlotRich88Modal = require("../../models/slot_rich88.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const qs = require("querystring");
const GameWalletLog = require("../../models/gamewalletlog.model");
const GameRich88GameModal = require("../../models/slot_rich88Database.model");
const GameRich88GeneralGameModal = require("../../models/slot_rich88General.model");
const Decimal = require("decimal.js");
require("dotenv").config();

const ibexOperatorToken = process.env.IBEX_OPERATORTOKEN;
const ibexSecret = process.env.IBEX_SECRET;
const webURL = "https://www.bm8my.vip/";
const ibexAPIURL = "https://pgf-thek60.com";
const ibexHost = "pgf-thek60.com";
const ibexGameURL = "https://pgf-thek60.com/gameredirect";

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

function generateIBEXAuthHeaders(bodyString) {
  const xDate = moment.utc().format("YYYYMMDD");

  const xContentSha256 = crypto
    .createHash("sha256")
    .update(bodyString)
    .digest("hex");

  const stringToSign = ibexHost + xContentSha256 + xDate;
  const signature = crypto
    .createHmac("sha256", ibexSecret)
    .update(stringToSign)
    .digest("hex");

  const authorization = `PWS-HMAC-SHA256 Credential=${xDate}/${ibexOperatorToken}/pws/v1,SignedHeaders=host;x-content-sha256;x-date,Signature=${signature}`;

  return {
    "Content-Type": "application/x-www-form-urlencoded",
    Host: ibexHost,
    "x-date": xDate,
    "x-content-sha256": xContentSha256,
    Authorization: authorization,
  };
}

router.post("/api/ibex/getprovidergamelist", async (req, res) => {
  try {
    const { gameLang, currency = "MYR", status = 1 } = req.body;

    let language = "en-us";
    if (gameLang === "zh" || gameLang === "zh_hk") {
      language = "zh-cn";
    }

    const traceId = uuidv4();

    const bodyParams = {
      operator_token: ibexOperatorToken,
      secret_key: ibexSecret,
      currency,
      language,
      status,
    };

    const bodyString = qs.stringify(bodyParams);

    // Generate auth headers (optional - remove if not using hash auth)
    const headers = generateIBEXAuthHeaders(bodyString);

    const response = await axios.post(
      `${ibexAPIURL}/Game/v2/Get?trace_id=${traceId}`,
      bodyString,
      { headers }
    );

    // Check for error
    if (response.data.error) {
      console.log("IBEX error:", response.data.error);
      return res.status(200).json({
        success: false,
        message: {
          en: "IBEX: Unable to retrieve game list. Please contact customer service for assistance.",
          zh: "IBEX: 无法获取游戏列表，请联系客服以获取帮助。",
          ms: "IBEX: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "IBEX: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
          id: "IBEX: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    return res.status(200).json({
      success: true,
      gamelist: response.data,
      message: {
        en: "Game list retrieved successfully.",
        zh: "游戏列表获取成功。",
        ms: "Senarai permainan berjaya diperoleh.",
        zh_hk: "遊戲列表獲取成功。",
        id: "Daftar permainan berhasil diambil.",
      },
    });
  } catch (error) {
    console.log("IBEX error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "IBEX: Unable to retrieve game list. Please contact customer service for assistance.",
        zh: "IBEX: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "IBEX: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "IBEX: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "IBEX: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/ibex/launchGame", authenticateToken, async (req, res) => {
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

    if (user.gameLock.ibex.lock) {
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

    const { gameCode, gameLang } = req.body;

    let lang = "en";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "zh";
    } else if (gameLang === "zh_hk") {
      lang = "zh";
    } else if (gameLang === "ms") {
      lang = "en";
    } else if (gameLang === "id") {
      lang = "id";
    }

    const token = `${user.gameId}:${generateRandomCode()}`;

    const exitUrl = encodeURIComponent(webURL);

    const queryParams = new URLSearchParams({
      btt: 1,
      ot: ibexOperatorToken,
      ops: token,
      l: lang,
      f: exitUrl,
    });

    const gameLaunchUrl = `${ibexGameURL}/${gameCode}/index.html?${queryParams.toString()}`;

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        ibexGameToken: token,
      },
      { new: true }
    );

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "IBEX"
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
    console.log("IBEX error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "IBEX: Game launch failed. Please try again or contact customer service for assistance.",
        zh: "IBEX: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "IBEX: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "IBEX: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "IBEX: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/ibex", async (req, res) => {
  try {
    const { operator_token, secret_key, operator_player_session } = req.body;

    if (!operator_token || !secret_key || !operator_player_session) {
      return res.status(200).json({
        data: null,
        error: {
          code: "1034",
          message: "Invalid request",
        },
      });
    }

    if (operator_token !== ibexOperatorToken || secret_key !== ibexSecret) {
      return res.status(200).json({
        data: null,
        error: {
          code: "1034",
          message: "Invalid request",
        },
      });
    }

    const tokenParts = operator_player_session.split(":");

    const username = tokenParts[0];

    const currentUser = await User.findOne(
      { gameId: username },
      { wallet: 1, ibexGameToken: 1, username: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(200).json({
        data: null,
        error: {
          code: "1305",
          message: "Invalid player",
        },
      });
    }

    if (currentUser.ibexGameToken !== operator_player_session) {
      return res.status(200).json({
        data: null,
        error: {
          code: "1300",
          message: "Invalid player session",
        },
      });
    }

    return res.status(200).json({
      data: {
        player_name: username,
        nickname: currentUser.username,
        currency: "MYR",
      },
      error: null,
    });
  } catch (error) {
    console.error(
      "IBEX: Error in game provider calling ae96 get balance api:",
      error.message
    );
    return res.status(200).json({
      data: null,
      error: {
        code: "1303",
        message: "Server error occurs",
      },
    });
  }
});

module.exports = router;
