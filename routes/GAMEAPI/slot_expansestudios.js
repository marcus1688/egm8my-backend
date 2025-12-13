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
const SlotExpanseStudioModal = require("../../models/slot_expansestudio.model");
const GameExpansesStudiosGameModal = require("../../models/slot_expansestudioDatabase.model");
const Decimal = require("decimal.js");
require("dotenv").config();

const expansestudioID = "17568";
const expansestudioSecret = process.env.EXPANSESTUDIO_SECRET;
const webURL = "https://www.bm8my.vip/";
const expansestudioAPIURL = "https://api.vsr888.com/";
const expansestudioGeneralAPIURL = "https://data.vsr888.com/";
const expansestudioLaunchAPIURL = "https://game.gmhugegold.com/launcher";
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

const verifyExpanseStudioHash = (bodyParams, hashFromUrl, secretKey) => {
  const sortedKeys = Object.keys(bodyParams).sort();

  const paramString = sortedKeys
    .map((key) => {
      let value = bodyParams[key];
      if (typeof value === "object" && value !== null) {
        value = JSON.stringify(value);
      }
      return `${key}=${value}`;
    })
    .join("&");

  const stringToHash = paramString + secretKey;
  const generatedHash = crypto
    .createHash("md5")
    .update(stringToHash)
    .digest("hex");

  return generatedHash === hashFromUrl;
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

router.post("/api/expansestudio/getgamelist", async (req, res) => {
  try {
    const games = await GameExpansesStudiosGameModal.find({
      $and: [
        {
          $or: [{ maintenance: false }, { maintenance: { $exists: false } }],
        },
        {
          imageUrlEN: { $exists: true, $ne: null, $ne: "" },
        },
      ],
    }).sort({
      hot: -1,
      createdAt: -1,
    });

    if (!games || games.length === 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "No games found. Please try again later.",
          zh: "未找到游戏。请稍后再试。",
          ms: "Tiada permainan ditemui. Sila cuba lagi kemudian.",
          zh_hk: "未找到遊戲。請稍後再試。",
          id: "Tidak ada permainan ditemukan. Silakan coba lagi nanti.",
        },
      });
    }

    const reformattedGamelist = games.map((game) => ({
      GameCode: game.gameID,
      GameNameEN: game.gameNameEN,
      GameNameZH: game.gameNameCN,
      GameNameHK: game.gameNameHK,
      GameType: game.gameType,
      GameImage: game.imageUrlEN || "",
      Hot: game.hot,
      RTP: game.rtpRate,
    }));

    return res.status(200).json({
      success: true,
      gamelist: reformattedGamelist,
    });
  } catch (error) {
    console.error("EXPANSES STUDIO Error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "EXPANSES STUDIO: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "EXPANSES STUDIO: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "EXPANSES STUDIO: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "EXPANSES STUDIO: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "EXPANSES STUDIO: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
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

      const launchUrl = `${expansestudioLaunchAPIURL}?${queryString}`;

      const updatedUser = await User.findOneAndUpdate(
        { _id: user._id },
        {
          expansesStudioGameToken: token,
        },
        { new: true }
      );

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
      console.log("EXPANSES STUDIO error in launching game", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "EXPANSES STUDIO: Game launch failed. Please try again or customer service for assistance.",
          zh: "EXPANSES STUDIO: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "EXPANSES STUDIO: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "EXPANSES STUDIO: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "EXPANSES STUDIO: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post("/api/expansestudios/auth", async (req, res) => {
  try {
    const { requestId, brandId, token } = req.body;

    const hashFromUrl = req.query.hash;

    if (!requestId || !brandId || !token) {
      console.log("failed 1");
      return res.status(200).json({
        requestId: requestId || "",
        error: "P_01",
        message: "Invalid request.",
      });
    }

    if (String(brandId) !== expansestudioID) {
      return res.status(200).json({
        requestId,
        error: "P_03",
        message: "Invalid brandId.",
      });
    }

    if (!verifyExpanseStudioHash(req.body, hashFromUrl, expansestudioSecret)) {
      return res.status(200).json({
        requestId,
        error: "P_02",
        message: "Invalid hash",
      });
    }

    const tokenParts = token.split(":");

    const username = tokenParts[0];

    const currentUser = await User.findOne(
      { gameId: username },
      { wallet: 1, expansesStudioGameToken: 1, username: 1 }
    ).lean();
    if (!currentUser) {
      return res.status(200).json({
        requestId,
        error: "P_04",
        message: "Player not found",
      });
    }

    if (currentUser.expansesStudioGameToken !== token) {
      return res.status(200).json({
        requestId,
        error: "P_06",
        message: "Invalid token or token expired",
      });
    }
    const balance = new Decimal(Number(currentUser.wallet))
      .toDecimalPlaces(4)
      .toNumber();

    return res.status(200).json({
      requestId,
      playerId: username,
      playerName: currentUser.username,
      playerSessionId: token,
      currency: "MYR",
      country: "MY",
      balance,
      error: "0",
      message: "success",
    });
  } catch (error) {
    console.error(
      "EXPANSE STUDIO: Error in game provider calling get balance api:",
      error.message
    );
    return res.status(200).json({
      requestId,
      error: "P_00",
      message: "Server Error, internal server error.",
    });
  }
});

router.post("/api/expansestudios/balance", async (req, res) => {
  try {
    const { playerId, playerSessionId, brandId, requestId } = req.body;
    const hashFromUrl = req.query.hash;

    if (!requestId || !brandId || !playerSessionId) {
      return res.status(200).json({
        requestId: requestId || "",
        error: "P_01",
        message: "Invalid request.",
      });
    }

    if (String(brandId) !== expansestudioID) {
      return res.status(200).json({
        requestId,
        error: "P_03",
        message: "Invalid brandId.",
      });
    }

    if (!verifyExpanseStudioHash(req.body, hashFromUrl, expansestudioSecret)) {
      return res.status(200).json({
        requestId,
        error: "P_02",
        message: "Invalid hash",
      });
    }

    const tokenParts = playerSessionId.split(":");

    const username = tokenParts[0];

    const currentUser = await User.findOne(
      { gameId: username },
      { wallet: 1, expansesStudioGameToken: 1, username: 1 }
    ).lean();
    if (!currentUser) {
      return res.status(200).json({
        requestId,
        error: "P_04",
        message: "Player not found",
      });
    }

    if (currentUser.expansesStudioGameToken !== playerSessionId) {
      return res.status(200).json({
        requestId,
        error: "P_06",
        message: "Invalid token or token expired",
      });
    }

    const balance = new Decimal(Number(currentUser.wallet))
      .toDecimalPlaces(4)
      .toNumber();

    return res.status(200).json({
      requestId,
      currency: "MYR",
      balance,
      error: "0",
      message: "success",
    });
  } catch (error) {
    console.error(
      "EXPANSE STUDIO: Error in game provider calling get balance api:",
      error.message
    );
    return res.status(200).json({
      requestId,
      error: "P_00",
      message: "Server Error, internal server error.",
    });
  }
});

const TRANS_CONFIG = {
  bet: { field: "betUniqueID" },
  transIn: { field: "transInUniqueID" },
  win: { field: "winUniqueID" },
  transOut: { field: "transOutUniqueID" },
  cancel: { field: "cancelUniqueID" },
  amend: { field: "amendUniqueID" },
};

const toDecimal = (value) => new Decimal(Number(value) || 0).toDecimalPlaces(4);

router.post("/api/expansestudios/transaction", async (req, res) => {
  const { requestId, brandId, playerId, trans, gameType } = req.body;
  if (!requestId || !brandId || !playerId || !trans?.length) {
    return res.status(200).json({
      requestId: requestId || "",
      error: "P_01",
      message: "Invalid request.",
    });
  }

  if (String(brandId) !== expansestudioID) {
    return res
      .status(200)
      .json({ requestId, error: "P_03", message: "Invalid brandId." });
  }

  if (!verifyExpanseStudioHash(req.body, req.query.hash, expansestudioSecret)) {
    return res
      .status(200)
      .json({ requestId, error: "P_02", message: "Invalid hash" });
  }

  try {
    const len = trans.length;
    const sortedTrans =
      len > 1 ? trans.slice().sort((a, b) => a.seq - b.seq) : trans;

    const transIds = {};
    const roundIds = new Set();
    const hasType = {};

    for (let i = 0; i < len; i++) {
      const t = sortedTrans[i];
      const type = t.transType;

      if (TRANS_CONFIG[type]) {
        if (!transIds[type]) {
          transIds[type] = [];
          hasType[type] = true;
        }
        transIds[type].push(t.transId);
      }

      if (t.roundId) roundIds.add(t.roundId);
    }

    const needsRoundLookup =
      hasType.win || hasType.transOut || hasType.cancel || hasType.amend;

    const queryConditions = [];
    const projection = { _id: 1 };

    for (const type in hasType) {
      const field = TRANS_CONFIG[type].field;
      queryConditions.push({ [field]: { $in: transIds[type] } });
      projection[field] = 1;
    }

    if (needsRoundLookup && roundIds.size) {
      queryConditions.push({ roundId: { $in: [...roundIds] } });
      projection.roundId = 1;
      projection.createdAt = 1;
      projection.bet = 1;

      if (hasType.win) {
        projection.settleamount = 1;
        projection.depositamount = 1;
      }
      if (hasType.transOut) {
        projection.depositamount = 1;
        projection.withdrawamount = 1;
      }
      if (hasType.cancel) {
        projection.cancel = 1;
      }
    }

    // ✅ Parallel queries
    const [currentUser, existingTrans = []] = await Promise.all([
      User.findOne(
        { gameId: playerId },
        { _id: 1, wallet: 1, "gameLock.expansestudio.lock": 1 }
      ).lean(),
      queryConditions.length
        ? SlotExpanseStudioModal.find(
            { $or: queryConditions },
            projection
          ).lean()
        : Promise.resolve([]),
    ]);

    if (!currentUser) {
      return res
        .status(200)
        .json({ requestId, error: "P_04", message: "Player not found" });
    }

    const isLocked = currentUser.gameLock?.expansestudio?.lock;

    if (isLocked) {
      const hasOnlyDebit =
        !hasType.win && !hasType.transOut && !hasType.cancel && !hasType.amend;

      if (hasOnlyDebit) {
        return res
          .status(200)
          .json({ requestId, error: "P_07", message: "Player is inactive" });
      }

      delete hasType.bet;
      delete hasType.transIn;
    }

    const existingMaps = {};
    for (const type in hasType) {
      existingMaps[type] = new Set();
    }

    const recordsByRoundId = needsRoundLookup ? new Map() : null;

    for (let i = 0, el = existingTrans.length; i < el; i++) {
      const t = existingTrans[i];

      for (const type in existingMaps) {
        const val = t[TRANS_CONFIG[type].field];
        if (val) existingMaps[type].add(val);
      }

      if (recordsByRoundId && t.roundId) {
        const arr = recordsByRoundId.get(t.roundId);
        if (arr) arr.push(t);
        else recordsByRoundId.set(t.roundId, [t]);
      }
    }

    if (recordsByRoundId) {
      for (const [, recs] of recordsByRoundId) {
        if (recs.length > 1) recs.sort((a, b) => a.createdAt - b.createdAt);
      }
    }

    // ✅ Build request maps - store ALL bets/transIns per roundId as ARRAY
    let betReqMap = null;
    let transInReqMap = null;

    if (hasType.win && hasType.bet) betReqMap = new Map();
    if (hasType.transOut && hasType.transIn) transInReqMap = new Map();

    if (betReqMap || transInReqMap) {
      for (let i = 0; i < len; i++) {
        const t = sortedTrans[i];
        const rid = t.roundId;
        if (!rid) continue;

        if (betReqMap && t.transType === "bet") {
          if (!betReqMap.has(rid)) betReqMap.set(rid, []);
          betReqMap.get(rid).push(t);
        } else if (transInReqMap && t.transType === "transIn") {
          if (!transInReqMap.has(rid)) transInReqMap.set(rid, []);
          transInReqMap.get(rid).push(t);
        }
      }
    }

    let walletChange = new Decimal(0);
    const newRecords = [];
    const updateOps = [];

    for (let i = 0; i < len; i++) {
      const tr = sortedTrans[i];
      const { transId, amount, transType, roundId, validBet, validWin } = tr;
      const amt = toDecimal(amount);

      switch (transType) {
        case "bet": {
          if (isLocked) continue;
          if (existingMaps.bet.has(transId)) continue;
          walletChange = walletChange.minus(amt);
          newRecords.push({
            betId: roundId,
            betUniqueID: transId,
            username: playerId,
            betamount: amt.toNumber(),
            bet: true,
            roundId,
          });
          break;
        }

        case "transIn": {
          if (isLocked) continue;
          if (existingMaps.transIn.has(transId)) continue;
          walletChange = walletChange.minus(amt);
          newRecords.push({
            betId: roundId,
            transInUniqueID: transId,
            username: playerId,
            depositamount: amt.toNumber(),
            bet: true,
            roundId,
          });
          break;
        }

        case "win": {
          if (existingMaps.win.has(transId)) continue;

          const recs = recordsByRoundId?.get(roundId);
          const betReqs = betReqMap?.get(roundId);

          if (!recs?.length && !betReqs?.length) {
            return res
              .status(200)
              .json({ requestId, error: "R_02", message: "Invalid round" });
          }

          walletChange = walletChange.plus(amt);

          if (!recs?.length) {
            updateOps.push({
              updateOne: {
                filter: { betUniqueID: betReqs[0].transId },
                update: {
                  $set: {
                    settle: true,
                    settleamount: amt.toNumber(),
                    winUniqueID: transId,
                  },
                },
              },
            });

            if (betReqs.length > 1) {
              const otherBetIds = [];
              for (let j = 1; j < betReqs.length; j++) {
                otherBetIds.push(betReqs[j].transId);
              }
              updateOps.push({
                updateMany: {
                  filter: { betUniqueID: { $in: otherBetIds } },
                  update: { $set: { settle: true, winUniqueID: transId } },
                },
              });
            }
            break;
          }

          let target = null;
          const otherIds = [];

          for (let j = 0, rl = recs.length; j < rl; j++) {
            const r = recs[j];
            // ✅ FIXED - just check bet record (not transIn)
            if (r.bet && !r.depositamount) {
              if (!target && r.settleamount == null) target = r;
              else if (!r.winUniqueID) otherIds.push(r._id);
            }
          }

          if (target) {
            updateOps.push({
              updateOne: {
                filter: { _id: target._id },
                update: {
                  $set: {
                    settle: true,
                    settleamount: amt.toNumber(),
                    winUniqueID: transId,
                  },
                },
              },
            });
          } else if (betReqs?.length) {
            updateOps.push({
              updateOne: {
                filter: { betUniqueID: betReqs[0].transId },
                update: {
                  $set: {
                    settle: true,
                    settleamount: amt.toNumber(),
                    winUniqueID: transId,
                  },
                },
              },
            });
          }

          if (otherIds.length) {
            updateOps.push({
              updateMany: {
                filter: { _id: { $in: otherIds } },
                update: { $set: { settle: true, winUniqueID: transId } },
              },
            });
          }

          if (betReqs?.length) {
            const startIdx = target ? 0 : 1;
            if (betReqs.length > startIdx) {
              const reqBetIds = [];
              for (let j = startIdx; j < betReqs.length; j++) {
                reqBetIds.push(betReqs[j].transId);
              }
              updateOps.push({
                updateMany: {
                  filter: { betUniqueID: { $in: reqBetIds } },
                  update: { $set: { settle: true, winUniqueID: transId } },
                },
              });
            }
          }
          break;
        }

        case "transOut": {
          if (existingMaps.transOut.has(transId)) continue;

          const recs = recordsByRoundId?.get(roundId);
          const tiReqs = transInReqMap?.get(roundId);

          if (!recs?.length && !tiReqs?.length) {
            return res
              .status(200)
              .json({ requestId, error: "R_02", message: "Invalid round" });
          }

          walletChange = walletChange.plus(amt);

          const setObj = {
            settle: true,
            withdrawamount: amt.toNumber(),
            transOutUniqueID: transId,
          };
          if (validBet != null)
            setObj.transferbetamount = toDecimal(validBet).toNumber();
          if (validWin != null)
            setObj.transfersettleamount = toDecimal(validWin).toNumber();

          if (!recs?.length) {
            updateOps.push({
              updateOne: {
                filter: { transInUniqueID: tiReqs[0].transId },
                update: { $set: setObj },
              },
            });

            if (tiReqs.length > 1) {
              const otherTiIds = [];
              for (let j = 1; j < tiReqs.length; j++) {
                otherTiIds.push(tiReqs[j].transId);
              }
              updateOps.push({
                updateMany: {
                  filter: { transInUniqueID: { $in: otherTiIds } },
                  update: { $set: { settle: true, transOutUniqueID: transId } },
                },
              });
            }
            break;
          }

          let target = null;
          const otherIds = [];

          for (let j = 0, rl = recs.length; j < rl; j++) {
            const r = recs[j];
            // ✅ FIXED - just check transIn record (has depositamount)
            if (r.bet && r.depositamount) {
              if (!target && r.withdrawamount == null) target = r;
              else if (!r.transOutUniqueID) otherIds.push(r._id);
            }
          }

          if (target) {
            updateOps.push({
              updateOne: {
                filter: { _id: target._id },
                update: { $set: setObj },
              },
            });
          } else if (tiReqs?.length) {
            updateOps.push({
              updateOne: {
                filter: { transInUniqueID: tiReqs[0].transId },
                update: { $set: setObj },
              },
            });
          }

          if (otherIds.length) {
            updateOps.push({
              updateMany: {
                filter: { _id: { $in: otherIds } },
                update: { $set: { settle: true, transOutUniqueID: transId } },
              },
            });
          }

          if (tiReqs?.length) {
            const startIdx = target ? 0 : 1;
            if (tiReqs.length > startIdx) {
              const reqTiIds = [];
              for (let j = startIdx; j < tiReqs.length; j++) {
                reqTiIds.push(tiReqs[j].transId);
              }
              updateOps.push({
                updateMany: {
                  filter: { transInUniqueID: { $in: reqTiIds } },
                  update: { $set: { settle: true, transOutUniqueID: transId } },
                },
              });
            }
          }
          break;
        }

        case "cancel": {
          if (existingMaps.cancel.has(transId)) continue;

          const recs = recordsByRoundId?.get(roundId);
          if (!recs?.length) {
            return res.status(200).json({
              requestId,
              error: "T_03",
              message: "Transaction does not exist",
            });
          }

          walletChange = walletChange.plus(amt);

          const ids = [];
          for (let j = 0, rl = recs.length; j < rl; j++) {
            if (!recs[j].cancel) ids.push(recs[j]._id);
          }

          if (ids.length) {
            updateOps.push({
              updateMany: {
                filter: { _id: { $in: ids } },
                update: { $set: { cancel: true, cancelUniqueID: transId } },
              },
            });
          }
          break;
        }

        case "amend": {
          if (existingMaps.amend.has(transId)) continue;

          const recs = recordsByRoundId?.get(roundId);
          if (!recs?.length) {
            return res
              .status(200)
              .json({ requestId, error: "R_02", message: "Invalid round" });
          }

          walletChange = walletChange.plus(amt);

          let target = recs[0];
          for (let j = 0, rl = recs.length; j < rl; j++) {
            if (!recs[j].amendUniqueID) {
              target = recs[j];
              break;
            }
          }

          const incField =
            amount < 0
              ? { betamount: toDecimal(Math.abs(amount)).toNumber() }
              : { settleamount: amt.toNumber() };

          updateOps.push({
            updateOne: {
              filter: { _id: target._id },
              update: {
                $inc: incField,
                $set: { resettle: true, amendUniqueID: transId },
              },
            },
          });
          break;
        }
      }
    }

    const currentWallet = toDecimal(currentUser.wallet);
    const walletChangeNum = walletChange.toNumber();

    let updatedWallet = currentWallet;

    if (walletChangeNum !== 0) {
      const walletFilter = { gameId: playerId };

      if (walletChangeNum < 0) {
        walletFilter.wallet = { $gte: Math.abs(walletChangeNum) };
      }

      const walletUpdate = await User.findOneAndUpdate(
        walletFilter,
        { $inc: { wallet: walletChangeNum } },
        { new: true, projection: { wallet: 1 } }
      ).lean();

      if (!walletUpdate && walletChangeNum < 0) {
        return res.status(200).json({
          requestId,
          error: "T_01",
          message: "Player Insufficient Funds",
          balance: currentWallet.toNumber(),
        });
      }

      if (walletUpdate) {
        updatedWallet = toDecimal(walletUpdate.wallet);
      }
    }

    if (newRecords.length) {
      await SlotExpanseStudioModal.insertMany(newRecords, {
        ordered: false,
      }).catch((e) => {
        if (e.code !== 11000) console.error("Insert:", e.message);
      });
    }

    if (updateOps.length) {
      await SlotExpanseStudioModal.bulkWrite(updateOps, {
        ordered: false,
      }).catch((e) => {
        console.error("BulkWrite:", e.message);
      });
    }
    console.log("success");
    return res.status(200).json({
      requestId,
      error: "0",
      message: "success",
      currency: "MYR",
      balance: updatedWallet.toNumber(),
    });
  } catch (e) {
    console.error("ExpanseStudio Error:", e.message);
    return res.status(200).json({
      requestId,
      error: "P_00",
      message: "Server Error, internal server error.",
    });
  }
});

router.post("/api/expansestudios/payUp", async (req, res) => {
  try {
    const { requestId, brandId, playerId, transId, amount } = req.body;

    if (
      !requestId ||
      !brandId ||
      !playerId ||
      amount === undefined ||
      amount === null
    ) {
      return res.status(200).json({
        requestId: requestId || "",
        error: "P_01",
        message: "Invalid request.",
      });
    }

    if (String(brandId) !== expansestudioID) {
      return res
        .status(200)
        .json({ requestId, error: "P_03", message: "Invalid brandId." });
    }

    if (
      !verifyExpanseStudioHash(req.body, req.query.hash, expansestudioSecret)
    ) {
      return res
        .status(200)
        .json({ requestId, error: "P_02", message: "Invalid hash" });
    }

    const [currentUser, existingTrans] = await Promise.all([
      User.findOne(
        { gameId: playerId },
        { wallet: 1, _id: 1, username: 1 }
      ).lean(),
      SlotExpanseStudioModal.findOne({ betId: transId }, { _id: 1 }).lean(),
    ]);
    if (!currentUser) {
      return res
        .status(200)
        .json({ requestId, error: "P_04", message: "Player not found" });
    }

    if (existingTrans) {
      const currentBalance = new Decimal(
        Number(currentUser.wallet)
      ).toDecimalPlaces(4);

      return res.status(200).json({
        requestId,
        error: "0",
        message: "success",
        currency: "MYR",
        balance: currentBalance.toNumber(),
      });
    }

    const updateamount = new Decimal(Number(amount)).toDecimalPlaces(4);

    const [updatedUserBalance] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: updateamount.toNumber() } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotExpanseStudioModal.create({
        username: playerId,
        betId: transId,
        settle: true,
        bet: true,
        settleamount: updateamount.toNumber(),
      }),
    ]);

    const finalBalance = new Decimal(
      Number(updatedUserBalance.wallet)
    ).toDecimalPlaces(4);

    return res.status(200).json({
      requestId,
      error: "0",
      message: "success",
      currency: "MYR",
      balance: finalBalance.toNumber(),
    });
  } catch (error) {
    console.error("ExpanseStudio Error in payout:", e.message);
    return res.status(200).json({
      requestId,
      error: "P_00",
      message: "Server Error, internal server error.",
    });
  }
});

router.post("/api/expansestudio/getturnoverforrebate", async (req, res) => {
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

    console.log("EXPANSE STUDIO QUERYING TIME", startDate, endDate);

    const records = await SlotExpanseStudioModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      cancel: { $ne: true },
      settle: true,
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

      if (!actualUsername) {
        console.warn(`EXPANSE STUDIO User not found for gameId: ${gameId}`);
        return;
      }

      if (!playerSummary[actualUsername]) {
        playerSummary[actualUsername] = { turnover: 0, winloss: 0 };
      }

      playerSummary[actualUsername].turnover +=
        (record.betamount || 0) + (record.transferbetamount || 0);

      playerSummary[actualUsername].winloss +=
        (record.settleamount || 0) +
        (record.transfersettleamount || 0) -
        (record.betamount || 0) -
        (record.transferbetamount || 0);
    });
    // Format the turnover and win/loss for each player to two decimal places
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
        gamename: "EXPANSE STUDIO",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log(
      "EXPANSE STUDIO: Failed to fetch win/loss report:",
      error.message
    );
    return res.status(500).json({
      success: false,
      message: {
        en: "EXPANSE STUDIO: Failed to fetch win/loss report",
        zh: "EXPANSE STUDIO: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/expansestudio/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotExpanseStudioModal.find({
        username: user.gameId,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },

        settle: true,
      });

      // Aggregate turnover and win/loss for each player
      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover +=
          (record.betamount || 0) + (record.transferbetamount || 0);
        totalWinLoss +=
          (record.settleamount || 0) +
          (record.transfersettleamount || 0) -
          (record.betamount || 0) -
          (record.transferbetamount || 0);
      });

      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));
      // Return the aggregated results
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "EXPANSE STUDIO",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log(
        "EXPANSE STUDIO: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "EXPANSE STUDIO: Failed to fetch win/loss report",
          zh: "EXPANSE STUDIO: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/expansestudio/:userId/gamedata",
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

      // Sum up the values for EVOLUTION under Live Casino
      records.forEach((record) => {
        // Convert Mongoose Map to Plain Object
        const gameCategories =
          record.gameCategories instanceof Map
            ? Object.fromEntries(record.gameCategories)
            : record.gameCategories;

        if (
          gameCategories &&
          gameCategories["Slot Games"] &&
          gameCategories["Slot Games"] instanceof Map
        ) {
          const slotGames = Object.fromEntries(gameCategories["Slot Games"]);

          if (slotGames["EXPANSE STUDIO"]) {
            totalTurnover += slotGames["EXPANSE STUDIO"].turnover || 0;
            totalWinLoss += slotGames["EXPANSE STUDIO"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "EXPANSE STUDIO",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log(
        "EXPANSE STUDIO: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "EXPANSE STUDIO: Failed to fetch win/loss report",
          zh: "EXPANSE STUDIO: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/expansestudio/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotExpanseStudioModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        settle: true,
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover +=
          (record.betamount || 0) + (record.transferbetamount || 0);

        totalWinLoss +=
          (record.betamount || 0) +
          (record.transferbetamount || 0) -
          (record.settleamount || 0) -
          (record.transfersettleamount || 0);
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "EXPANSE STUDIO",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("EXPANSE STUDIO: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "EXPANSE STUDIO: Failed to fetch win/loss report",
          zh: "EXPANSE STUDIO: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/expansestudio/kioskreport",
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
          gameCategories["Slot Games"] &&
          gameCategories["Slot Games"] instanceof Map
        ) {
          const liveCasino = Object.fromEntries(gameCategories["Slot Games"]);

          if (liveCasino["EXPANSE STUDIO"]) {
            totalTurnover += Number(liveCasino["EXPANSE STUDIO"].turnover || 0);
            totalWinLoss +=
              Number(liveCasino["EXPANSE STUDIO"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "EXPANSE STUDIO",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("EXPANSE STUDIO: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "EXPANSE STUDIO: Failed to fetch win/loss report",
          zh: "EXPANSE STUDIO: 获取盈亏报告失败",
        },
      });
    }
  }
);
module.exports = router;
