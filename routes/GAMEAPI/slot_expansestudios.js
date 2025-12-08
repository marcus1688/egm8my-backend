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
const GameExpansesStudiosGameModal = require("../../models/slot_expansestudioDatabase.model");
const Decimal = require("decimal.js");
require("dotenv").config();

const expansestudioID = "17568";
const expansestudioSecret = process.env.EXPANSESTUDIO_SECRET;
const webURL = "https://www.bm8my.vip/";
const expansestudioAPIURL = "https://api.vsr888.com/";
const expansestudioGeneralAPIURL = "https://data.vsr888.com/";
const cashierUrl = "https://www.bm8my.vip/myaccount/deposit";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

const generateExpanseStudioHash = (params, secretKey) => {
  const sortedKeys = Object.keys(params).sort();

  const paramString = sortedKeys
    .map((key) => {
      let value = params[key];
      if (typeof value === "object" && value !== null) {
        value = JSON.stringify(value);
      }
      return `${key}=${value}`;
    })
    .join("&");

  const stringToHash = paramString + secretKey;

  console.log("Hash String:", stringToHash);

  return crypto.createHash("md5").update(stringToHash).digest("hex");
};

const generateLaunchHash = (brandId, playerId, gameCode, secretKey) => {
  const hashString = `${brandId}${playerId}${gameCode}${secretKey}`;
  return crypto.createHash("md5").update(hashString).digest("hex");
};

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

router.post("/api/expansestudio/syncgamelist", async (req, res) => {
  try {
    const { providerCode, gameType, page = 1, size = 1000 } = req.body;

    const requestId = uuidv4();

    // Build request parameters
    const params = {
      requestId,
      brandId: expansestudioID,
      page,
      size,
    };

    if (providerCode) {
      params.providerCode = providerCode;
    }
    if (gameType) {
      params.gameType = gameType;
    }

    // Generate hash
    const hash = generateExpanseStudioHash(params, expansestudioSecret);

    // Make API request
    const response = await axios.post(
      `${expansestudioGeneralAPIURL}game/list?hash=${hash}`,
      params,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.error !== "0") {
      return res.status(200).json({
        success: false,
        message: response.data.message || "Failed to get game list",
        error: response.data.error,
      });
    }

    const apiGames = response.data.records || [];
    const apiGameCodes = apiGames.map((game) => game.gameCode);
    const apiGameCodeSet = new Set(apiGameCodes);

    console.log(`\n=== ExpanseStudio Game Sync ===`);
    console.log(`API returned ${apiGames.length} games`);

    // Get all games from database
    const dbGames = await GameExpansesStudiosGameModal.find(
      {},
      { gameID: 1, gameNameEN: 1, maintenance: 1, _id: 1 }
    ).lean();

    const dbGameIdSet = new Set(dbGames.map((game) => game.gameID));

    console.log(`Database has ${dbGames.length} games`);

    // Find missing games (in API but not in DB)
    const missingGames = apiGames.filter(
      (game) => !dbGameIdSet.has(game.gameCode)
    );

    // Find extra games (in DB but not in API)
    const extraGames = dbGames.filter(
      (game) => !apiGameCodeSet.has(game.gameID)
    );

    // Log missing games
    if (missingGames.length > 0) {
      console.log(
        `\n❌ MISSING GAMES (${missingGames.length}) - In API but NOT in Database:`
      );
      missingGames.forEach((game) => {
        console.log(
          `   - ${game.gameCode} | ${game.enName} | ${game.gameType}`
        );
      });
    } else {
      console.log(`\n✅ No missing games`);
    }

    // Log and update extra games
    if (extraGames.length > 0) {
      console.log(
        `\n⚠️ EXTRA GAMES (${extraGames.length}) - In Database but NOT in API (setting maintenance: true):`
      );
      extraGames.forEach((game) => {
        console.log(`   - ${game.gameID} | ${game.gameNameEN}`);
      });

      // Set maintenance to true for extra games
      const extraGameIds = extraGames.map((game) => game._id);
      await GameExpansesStudiosGameModal.updateMany(
        { _id: { $in: extraGameIds } },
        { $set: { maintenance: true } }
      );

      console.log(
        `\n✅ Set maintenance: true for ${extraGames.length} extra games`
      );
    } else {
      console.log(`\n✅ No extra games`);
    }

    // Find matched games
    const matchedGames = dbGames.filter((game) =>
      apiGameCodeSet.has(game.gameID)
    );

    return res.status(200).json({
      success: true,
      summary: {
        apiGamesCount: apiGames.length,
        dbGamesCount: dbGames.length,
        matchedCount: matchedGames.length,
        missingCount: missingGames.length,
        extraCount: extraGames.length,
      },
      missingGames: missingGames.map((game) => ({
        gameCode: game.gameCode,
        enName: game.enName,
        cnName: game.cnName,
        gameType: game.gameType,
        rtp: game.rtp,
        imgDefault: game.imgDefault,
      })),
      extraGames: extraGames.map((game) => ({
        gameID: game.gameID,
        gameNameEN: game.gameNameEN,
        maintenanceUpdated: true,
      })),
      matchedGames: matchedGames.slice(0, 10).map((game) => ({
        gameID: game.gameID,
        gameNameEN: game.gameNameEN,
      })),
    });
  } catch (error) {
    console.error("ExpanseStudio syncGameList error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to sync game list",
      error: error.message,
    });
  }
});

router.post("/api/expansestudio/getprovideergamelist", async (req, res) => {
  try {
    const { providerCode, gameType, page = 1, size = 1000 } = req.body;

    const requestId = uuidv4();

    // Build request parameters
    const params = {
      requestId,
      brandId: expansestudioID,
      page,
      size,
    };

    // Add optional parameters if provided
    if (providerCode) {
      params.providerCode = providerCode;
    }
    if (gameType) {
      params.gameType = gameType;
    }

    // Generate hash
    const hash = generateExpanseStudioHash(params, expansestudioSecret);

    console.log("=== ExpanseStudio GetGameList ===");
    console.log("Request Params:", params);
    console.log("Hash:", hash);
    console.log(`${expansestudioAPIURL}game/list?hash=${hash}`);
    // Make API request
    const response = await axios.post(
      `${expansestudioGeneralAPIURL}game/list?hash=${hash}`,
      params,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Response:", response.data);

    if (response.data.error !== "0") {
      return res.status(200).json({
        success: false,
        message: response.data.message || "Failed to get game list",
        error: response.data.error,
      });
    }

    return res.status(200).json({
      success: true,
      total: response.data.total,
      current: response.data.current,
      pages: response.data.pages,
      size: response.data.size,
      records: response.data.records,
    });
  } catch (error) {
    console.error("ExpanseStudio getGameList error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to get game list",
      error: error.message,
    });
  }
});

router.post(
  "/api/expansestudio/launchGame",
  authenticateToken,
  async (req, res) => {
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

      if (user.gameLock.expansesstudio.lock) {
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

      const { gameCode, gameLang, clientPlatform } = req.body;

      let token = `${user.gameId}:${generateRandomCode()}`;

      let clientIp = req.headers["x-forwarded-for"] || req.ip;
      clientIp = clientIp.split(",")[0].trim();

      let lang = "EN";

      if (gameLang === "en") {
        lang = "EN";
      } else if (gameLang === "zh") {
        lang = "ZH-CN";
      } else if (gameLang === "zh_hk") {
        lang = "CH";
      } else if (gameLang === "ms") {
        lang = "MS";
      } else if (gameLang === "id") {
        lang = "EN";
      }

      let platform = "mobile";
      if (clientPlatform === "web") {
        platform = "web";
      } else if (clientPlatform === "mobile") {
        platform = "mobile";
      }

      const launchHash = generateLaunchHash(
        expansestudioID,
        user.gameId,
        gameCode,
        expansestudioSecret
      );

      const payload = {
        gameCode: gameCode,
        token: token,
        platform: platform,
        language: lang,
        playerId: user.gameId,
        brandId: expansestudioID,
        backUrl: encodeURIComponent(webURL),
        cashierUrl: encodeURIComponent(cashierUrl),
        currency: "MYR",
        hash: launchHash,
      };

      const queryString = new URLSearchParams(payload).toString();

      const launchUrl = `${expansestudioAPIURL}launcher?${queryString}`;

      // const updatedUser = await User.findOneAndUpdate(
      //   { _id: user._id },
      //   {
      //     epicwinGameToken: token,
      //   },
      //   { new: true }
      // );

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "EXPANSES STUDIO"
      );

      return res.status(200).json({
        success: true,
        gameLobby: launchUrl,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
          zh_hk: "遊戲啟動成功。",
          id: "Permainan berhasil diluncurkan.",
        },
      });
    } catch (error) {
      console.log("EPICWIN error in launching game", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "EPICWIN: Game launch failed. Please try again or customer service for assistance.",
          zh: "EPICWIN: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "EPICWIN: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "EPICWIN: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "EPICWIN: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }
  }
);
module.exports = router;
