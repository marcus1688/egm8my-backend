const express = require("express");
const router = express.Router();
const axios = require("axios");

const CryptoJS = require("crypto-js");
const { authenticateToken } = require("../../auth/auth");
const { authenticateAdminToken } = require("../../auth/adminAuth");
const {
  User,
  adminUserWalletLog,
  GameDataLog,
} = require("../../models/users.model");
const { adminUser, adminLog } = require("../../models/adminuser.model");
const SlotJDBModal = require("../../models/slot_jdb.model");
const { v4: uuidv4 } = require("uuid");
const GameJDBGameModal = require("../../models/slot_jdbDatabase.model");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const qs = require("querystring");
const GameWalletLog = require("../../models/gamewalletlog.model");

require("dotenv").config();

const iv = process.env.JDB_IV;
const jdbDC = "GSSW";
const key = process.env.JDB_KEY;
const webURL = "https://www.bm8my.vip/";
const jdbAPIURL = "https://api.datgeni2e47.net";
const jdbParent = "jcegm8myr";

function getCurrentTimestamp() {
  return moment.utc().valueOf(); // Returns the current timestamp in milliseconds (UTC)
}

function base64EncodeUrl(str) {
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

//To encrypt
function AESEncrypt(data, aesKey, aesIv) {
  const key = CryptoJS.enc.Utf8.parse(aesKey);
  const iv = CryptoJS.enc.Utf8.parse(aesIv);
  const encrypted = CryptoJS.AES.encrypt(data.trim(), key, {
    iv,
    padding: CryptoJS.pad.ZeroPadding,
  }).toString();
  return base64EncodeUrl(encrypted);
}

//To decrypt
function AesDecrypt(encryptedString, aesKey, aesIv) {
  const key = CryptoJS.enc.Utf8.parse(aesKey);
  const iv = CryptoJS.enc.Utf8.parse(aesIv);
  const decrypted = CryptoJS.AES.decrypt(
    base64DecodeUrl(encryptedString.trim()),
    key,
    {
      iv,
      padding: CryptoJS.pad.ZeroPadding,
    }
  );
  return CryptoJS.enc.Utf8.stringify(decrypted);
}

function base64DecodeUrl(str) {
  str = (str + "===").slice(0, str.length + (str.length % 4));
  return str.replace(/-/g, "+").replace(/_/g, "/");
}

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

//use to generate unique transaction id

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

router.post("/api/jdb/comparegame", async (req, res) => {
  try {
    //en or cn
    console.log("hi");
    const { gameLang } = req.body;

    let lang = "en";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "cn";
    }

    const data = {
      action: 49,
      ts: getCurrentTimestamp(),
      parent: jdbParent,
      lang: lang,
    };
    console.log(data);
    console.log(`${jdbAPIURL}/apiRequest.do`);
    console.log(key);
    console.log(iv);
    // Encrypt payload
    const encryptedPayload = AESEncrypt(JSON.stringify(data), key, iv);

    const axiosInstance = axios.create({
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    console.log(encryptedPayload, "hi");
    const response = await axiosInstance.post(
      `${jdbAPIURL}/apiRequest.do`,
      qs.stringify({ dc: jdbDC, x: encryptedPayload })
    );

    const responseData = response.data;

    if (responseData.status !== "0000") {
      console.log("JDB error fetching game list:", responseData);
      return res.status(200).json({
        success: false,
        message: {
          en: "JDB: Unable to retrieve game lists. Please contact customer service for assistance.",
          zh: "JDB: 无法获取游戏列表，请联系客服以获取帮助。",
          ms: "JDB: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
    const gameTypeMap = {
      0: "Slot",
      7: "Fishing",
      9: "Arcade",
      12: "Lottery",
      18: "Card",
      50: "Slot",
    };

    // Transform the response data and filter only the allowed GameType
    const formattedGames = responseData.data.flatMap((game) =>
      game.list.map((gameItem) => ({
        GameCode: gameItem.mType,
        GameImage: gameItem.image,
        GameNameEN: gameItem.name,
        GameType: gameTypeMap[game.gType] || null, // Convert gType to text or ignore
      }))
    );

    // Filtering out invalid game types
    const filteredGames = formattedGames.filter(
      (game) => game.GameType !== null
    );

    // Get all games from database
    const dbGames = await GameJDBGameModal.find({}, "gameID");

    // Extract game IDs from database
    const dbGameIds = new Set(dbGames.map((game) => game.gameID));

    // Extract games from API response - convert GameCode to string for comparison
    const apiGames = filteredGames;
    const apiGameIds = new Set(
      apiGames.map((game) => game.GameCode.toString())
    );

    // Count totals
    const totalApiGames = apiGames.length;
    const totalDbGames = dbGames.length;

    // Find missing games (in API but not in database)
    const missingGames = apiGames.filter(
      (game) => !dbGameIds.has(game.GameCode.toString())
    );

    // Find extra games (in database but not in API) and set maintenance to true
    const extraGameIds = [...dbGameIds].filter(
      (gameId) => !apiGameIds.has(gameId)
    );

    // Update extra games to maintenance: true
    if (extraGameIds.length > 0) {
      await GameJDBGameModal.updateMany(
        { gameID: { $in: extraGameIds } },
        { maintenance: true }
      );
      console.log(
        `Set maintenance: true for ${extraGameIds.length} games not in API`
      );
    }

    // Set maintenance to false for games that are in API (not extra)
    const activeGameIds = [...apiGameIds];
    if (activeGameIds.length > 0) {
      await GameJDBGameModal.updateMany(
        { gameID: { $in: activeGameIds } },
        { maintenance: false }
      );
      console.log(
        `Set maintenance: false for ${activeGameIds.length} games in API`
      );
    }

    // Return missing games with GameCode and GameType
    const missingGamesInfo = missingGames.map((game) => ({
      GameCode: game.GameCode,
      GameType: game.GameType,
      GameNameEN: game.GameNameEN,
      GameImage: game.GameImage,
    }));

    console.log("Missing games:", missingGamesInfo);
    console.log("Extra games set to maintenance:", extraGameIds.length);
    console.log(
      `Total API games: ${totalApiGames}, Total DB games: ${totalDbGames}`
    );

    return res.status(200).json({
      success: true,
      gamelist: filteredGames,
      comparison: {
        missingGames: missingGamesInfo,
        extraGamesCount: extraGameIds.length,
        extraGameIds: extraGameIds,
        missingCount: missingGamesInfo.length,
        totalApiGames: totalApiGames,
        totalDbGames: totalDbGames,
      },
    });
  } catch (error) {
    console.log("JDB error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "JDB: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "JDB: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "JDB: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/jdb/getprovidergamelist", async (req, res) => {
  try {
    //en or cn
    console.log("hi");
    const { gameLang } = req.body;

    let lang;

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "cn";
    }

    const data = {
      action: 49,
      ts: getCurrentTimestamp(),
      parent: jdbParent,
      lang: lang,
    };
    console.log(data);
    console.log(`${jdbAPIURL}/apiRequest.do`);
    console.log(key);
    console.log(iv);
    // Encrypt payload
    const encryptedPayload = AESEncrypt(JSON.stringify(data), key, iv);

    const axiosInstance = axios.create({
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const response = await axiosInstance.post(
      `${jdbAPIURL}/apiRequest.do`,
      qs.stringify({ dc: jdbDC, x: encryptedPayload })
    );

    const responseData = response.data;

    if (responseData.status !== "0000") {
      console.log("JDB error fetching game list:", responseData);
      return res.status(200).json({
        success: false,
        message: {
          en: "JDB: Unable to retrieve game lists. Please contact customer service for assistance.",
          zh: "JDB: 无法获取游戏列表，请联系客服以获取帮助。",
          ms: "JDB: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
    const gameTypeMap = {
      0: "Slot",
      7: "Fishing",
      9: "Arcade",
      12: "Lottery",
      18: "Card",
      50: "Slot",
    };

    // Transform the response data and filter only the allowed GameType
    const formattedGames = responseData.data.flatMap((game) =>
      game.list.map((gameItem) => ({
        GameCode: gameItem.mType,
        GameImage: gameItem.image,
        GameNameEN: gameItem.name,
        GameType: gameTypeMap[game.gType] || null, // Convert gType to text or ignore
      }))
    );

    // Filtering out invalid game types
    const filteredGames = formattedGames.filter(
      (game) => game.GameType !== null
    );

    return res.status(200).json({
      success: true,
      gamelist: filteredGames,
    });
  } catch (error) {
    console.log("JDB error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "JDB: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "JDB: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "JDB: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/jdb/getgamelist", async (req, res) => {
  try {
    const games = await GameJDBGameModal.find({
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
          zh_hk: "搵唔到遊戲。老闆麻煩再試下或者聯絡客服。",
          id: "Tidak ada permainan ditemukan. Silakan coba lagi nanti.",
        },
      });
    }

    // Transform data into the desired format
    const reformattedGamelist = games.map((game) => ({
      GameCode: game.gameID,
      GameNameEN: game.gameNameEN,
      GameNameZH: game.gameNameCN,
      GameNameHK: game.gameNameHK,
      GameType: game.gameType,
      GameImage: game.imageUrlEN || "",
      GameImageZH: game.imageUrlCN || "",
      Hot: game.hot || false,
      RTP: game.rtpRate,
    }));

    return res.status(200).json({
      success: true,
      gamelist: reformattedGamelist,
    });
  } catch (error) {
    console.log("JDB error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "JDB: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "JDB: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "JDB: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "JDB: 攞唔到遊戲清單，老闆麻煩聯絡客服幫手處理。",
        id: "JDB: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/jdb/launchGame", authenticateToken, async (req, res) => {
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
          zh_hk: "搵唔到用戶，麻煩再試多次或者聯絡客服幫手。",
          id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    if (user.gameLock.jdb.lock) {
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
    const { gameLang, gameCode, isDouble } = req.body;

    let lang = "cn";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "cn";
    } else if (gameLang === "ms") {
      lang = "id";
    } else if (gameLang === "zh_hk") {
      lang = "cn";
    } else if (gameLang === "id") {
      lang = "id";
    }

    const gameusername =
      isDouble === true ? `${user.gameId}2X` : `${user.gameId}`;

    const gameInfo = await GameJDBGameModal.findOne(
      { gameID: gameCode },
      { gameType: 1 }
    ).lean();

    let gType;
    switch (gameInfo.gameType.toLowerCase()) {
      case "slot":
        gType = "0";
        break;
      case "fishing":
        gType = "7";
        break;
      case "arcade":
        gType = "9";
        break;
      default:
        gType = "0";
    }
    const data = {
      action: 21,
      ts: getCurrentTimestamp(),
      parent: jdbParent,
      uid: gameusername,
      lang: lang,
      gType,
      mType: gameCode,
      lobbyURL: webURL,
    };

    // Encrypt payload
    const encryptedPayload = AESEncrypt(JSON.stringify(data), key, iv);

    const axiosInstance = axios.create({
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const response = await axiosInstance.post(
      `${jdbAPIURL}/apiRequest.do`,
      qs.stringify({ dc: jdbDC, x: encryptedPayload })
    );

    const responseData = response.data;

    if (responseData.status === "9013" || responseData.status === "9022") {
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

    if (responseData.status !== "0000") {
      console.log("JDB error in launching game", responseData);
      return res.status(200).json({
        success: false,
        message: {
          en: "JDB: Game launch failed. Please try again or customer service for assistance.",
          zh: "JDB: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "JDB: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "JDB: 遊戲開唔到，老闆試多次或者搵客服幫手。",
          id: "JDB: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    const gameName = isDouble === true ? "JDB 2X" : "JDB";

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      gameName
    );

    return res.status(200).json({
      success: true,
      gameLobby: responseData.path,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("JDB error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "JDB: Game launch failed. Please try again or customer service for assistance.",
        zh: "JDB: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "JDB: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "JDB: 遊戲開唔到，老闆試多次或者搵客服幫手。",
        id: "JDB: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/jdb", async (req, res) => {
  let currentUser = null;
  try {
    const { x } = req.body;

    if (!x) {
      return res.status(200).json({
        status: "9999",
        balance: 0,
        err_text: "Missing encryption payload",
      });
    }

    const decryptedData = AesDecrypt(x, key, iv);
    const requestData = JSON.parse(decryptedData);

    const { action, uid } = requestData;
    const isDoubleBetting = uid.endsWith("2x");
    const actualGameId = isDoubleBetting
      ? uid.slice(0, -2).toUpperCase()
      : uid.toUpperCase();

    // Find current user first
    const currentUser = await User.findOne(
      { gameId: actualGameId },
      {
        gameId: 1,
        wallet: 1,
        _id: 1,
        "gameLock.jdb.lock": 1,
      }
    ).lean();

    if (!currentUser) {
      console.log("no use rfound");
      return res.status(200).json({
        status: "9999",
        balance: 0,
        err_text: "Invalid login details",
      });
    }
    // Action handler map
    const actionHandlers = {
      6: handleBalanceCheck,
      8: handleWalletUpdate,
      4: handleRecoveringGame,
      9: handleBetPlacement,
      10: handleBetSettlement,
      11: handleBetCancellation,
      12: handleReward,
      13: handleDeposit,
      14: handleWithdraw,
      15: handleDepositCancellation,
      16: handleFreeSpinReward,
    };

    const handler = actionHandlers[action];
    if (!handler) {
      return res.status(200).json({
        status: "9999",
        balance: 0,
        err_text: "Unknown action",
      });
    }

    return await handler(
      currentUser,
      requestData,
      res,
      isDoubleBetting,
      actualGameId
    );
  } catch (error) {
    console.error(
      "JDB: Error in game provider calling stash88 api:",
      error.message
    );
    return res.status(200).json({
      status: "9999",
      balance: currentUser ? roundToTwoDecimals(currentUser.wallet) : 0,
      err_text: "Server error",
    });
  }
});

async function handleBalanceCheck(
  currentUser,
  requestData,
  res,
  isDoubleBetting,
  actualGameId
) {
  const walletMultiplier = isDoubleBetting ? 0.5 : 1;

  return res.status(200).json({
    status: "0000",
    balance: roundToTwoDecimals(currentUser.wallet * walletMultiplier),
    err_text: "",
  });
}

async function handleWalletUpdate(
  currentUser,
  { netWin, uid, mb, transferId, bet, win, gType },
  res,
  isDoubleBetting,
  actualGameId
) {
  const multiplier = isDoubleBetting ? 2 : 1;
  const walletMultiplier = isDoubleBetting ? 0.5 : 1;

  if (currentUser.gameLock?.jdb?.lock) {
    return res.status(200).json({
      status: "1001",
      balance: roundToTwoDecimals(
        (currentUser?.wallet || 0) * walletMultiplier
      ),
      err_text: "Player locked",
    });
  }

  const existingTransaction = await SlotJDBModal.findOne(
    { betId: transferId },
    { _id: 1 }
  ).lean();

  if (existingTransaction) {
    return res.status(200).json({
      status: "0000",
      balance: roundToTwoDecimals(
        (currentUser?.wallet || 0) * walletMultiplier
      ),
      err_text: "Bet and Settled Existed",
    });
  }

  const actualRequiredAmt = Math.abs(mb) * multiplier;
  const actualUpdateBalance = roundToTwoDecimals(netWin) * multiplier;

  const updatedUserBalance = await User.findOneAndUpdate(
    {
      gameId: actualGameId,
      wallet: { $gte: actualRequiredAmt },
    },
    { $inc: { wallet: actualUpdateBalance } },
    { new: true, projection: { wallet: 1 } }
  ).lean();

  if (!updatedUserBalance) {
    const latestUser = await User.findOne(
      { gameId: actualGameId },
      { wallet: 1 }
    ).lean();

    return res.status(200).json({
      status: "6006",
      balance: roundToTwoDecimals((latestUser?.wallet || 0) * walletMultiplier),
      err_text: "Player balance is insufficient",
    });
  }

  const actualBetAmt = roundToTwoDecimals(Math.abs(bet)) * multiplier;
  const actualWinAmt = roundToTwoDecimals(win) * multiplier;
  const gametype = gType === 7 ? "FISH" : "SLOT";

  await SlotJDBModal.create({
    username: uid,
    betId: transferId,
    bet: true,
    settle: true,
    betamount: actualBetAmt,
    settleamount: actualWinAmt,
    gametype,
  });

  return res.status(200).json({
    status: "0000",
    balance: roundToTwoDecimals(updatedUserBalance.wallet * walletMultiplier),
    err_text: "",
  });
}

async function handleRecoveringGame(
  currentUser,
  { transferId },
  res,
  isDoubleBetting,
  actualGameId
) {
  const walletMultiplier = isDoubleBetting ? 0.5 : 1;

  const existingTransaction = await SlotJDBModal.findOne(
    { betId: transferId, cancel: true },
    { _id: 1 }
  ).lean();

  if (existingTransaction) {
    return res.status(200).json({
      status: "0000",
      balance: roundToTwoDecimals(currentUser.wallet * walletMultiplier),
      err_text: "",
    });
  }

  await SlotJDBModal.create({
    username: currentUser.gameId,
    betId: transferId,
    attemptcancel: true,
  });

  return res.status(200).json({
    status: "6101",
    balance: roundToTwoDecimals(currentUser.wallet * walletMultiplier),
    err_text: "Can not cancel, transaction need to be settled",
  });
}

async function handleBetPlacement(
  currentUser,
  { transferId, uid, amount, gType },
  res,
  isDoubleBetting,
  actualGameId
) {
  const multiplier = isDoubleBetting ? 2 : 1;
  const walletMultiplier = isDoubleBetting ? 0.5 : 1;

  if (currentUser.gameLock?.jdb?.lock) {
    return res.status(200).json({
      status: "1001",
      balance: roundToTwoDecimals(
        (currentUser?.wallet || 0) * walletMultiplier
      ),
      err_text: "Player locked",
    });
  }

  const existingTransaction = await SlotJDBModal.findOne(
    { betId: transferId },
    { _id: 1 }
  ).lean();

  if (existingTransaction) {
    return res.status(200).json({
      status: "0000",
      balance: roundToTwoDecimals(currentUser.wallet * walletMultiplier),
      err_text: "Bet Existed",
    });
  }

  const actualUpdateBalance = roundToTwoDecimals(amount) * multiplier;

  const updatedUserBalance = await User.findOneAndUpdate(
    {
      gameId: actualGameId,
      wallet: { $gte: actualUpdateBalance },
    },
    { $inc: { wallet: -actualUpdateBalance } },
    { new: true, projection: { wallet: 1 } }
  ).lean();

  if (!updatedUserBalance) {
    const latestUser = await User.findOne(
      { gameId: actualGameId },
      { wallet: 1 }
    ).lean();

    return res.status(200).json({
      status: "6006",
      balance: roundToTwoDecimals((latestUser?.wallet || 0) * walletMultiplier),
      err_text: "Player balance is insufficient",
    });
  }

  const gametype = gType === 7 ? "FISH" : "SLOT";

  await SlotJDBModal.create({
    username: currentUser.gameId,
    betId: transferId,
    bet: true,
    betamount: actualUpdateBalance,
    gametype,
  });

  return res.status(200).json({
    status: "0000",
    balance: roundToTwoDecimals(updatedUserBalance.wallet * walletMultiplier),
    err_text: "",
  });
}

async function handleBetSettlement(
  currentUser,
  { refTransferIds, uid, amount },
  res,
  isDoubleBetting,
  actualGameId
) {
  const multiplier = isDoubleBetting ? 2 : 1;
  const walletMultiplier = isDoubleBetting ? 0.5 : 1;

  const [existingBet, existingCancelBet, existingSettleBet] = await Promise.all(
    [
      SlotJDBModal.findOne({ betId: refTransferIds }, { _id: 1 }).lean(),
      SlotJDBModal.findOne(
        { betId: refTransferIds, cancel: true },
        { _id: 1 }
      ).lean(),
      SlotJDBModal.findOne(
        { betId: refTransferIds, settle: true },
        { _id: 1 }
      ).lean(),
    ]
  );

  if (!existingBet) {
    return res.status(200).json({
      status: "9999",
      balance: roundToTwoDecimals(currentUser.wallet * walletMultiplier),
      err_text: "No Bet Found",
    });
  }

  if (existingCancelBet) {
    return res.status(200).json({
      status: "0000",
      balance: roundToTwoDecimals(currentUser.wallet * walletMultiplier),
      err_text: "Bet has already been cancelled",
    });
  }

  if (existingSettleBet) {
    return res.status(200).json({
      status: "0000",
      balance: roundToTwoDecimals(currentUser.wallet * walletMultiplier),
      err_text: "Bet has already been settled",
    });
  }

  const actualUpdateBalance = roundToTwoDecimals(amount) * multiplier;

  const [updatedUserBalance] = await Promise.all([
    User.findOneAndUpdate(
      { gameId: actualGameId },
      { $inc: { wallet: actualUpdateBalance } },
      { new: true, projection: { wallet: 1 } }
    ).lean(),

    SlotJDBModal.findOneAndUpdate(
      { betId: refTransferIds },
      { settle: true, settleamount: actualUpdateBalance },
      { new: false }
    ),
  ]);

  return res.status(200).json({
    status: "0000",
    balance: roundToTwoDecimals(updatedUserBalance.wallet * walletMultiplier),
    err_text: "",
  });
}

async function handleBetCancellation(
  currentUser,
  { refTransferIds, uid, amount },
  res,
  isDoubleBetting,
  actualGameId
) {
  const [existingBet, existingSettleBet, existingCancelBet] = await Promise.all(
    [
      SlotJDBModal.findOne({ betId: refTransferIds }, { _id: 1 }).lean(),
      SlotJDBModal.findOne(
        { betId: refTransferIds, settle: true },
        { _id: 1 }
      ).lean(),
      SlotJDBModal.findOne(
        { betId: refTransferIds, cancel: true },
        { _id: 1 }
      ).lean(),
    ]
  );

  if (!existingBet) {
    const actualAmount = isDoubleBetting
      ? currentUser.wallet * 0.5
      : currentUser.wallet;

    return res.status(200).json({
      status: "9999",
      balance: roundToTwoDecimals(actualAmount),
      err_text: "No Bet Found",
    });
  }

  if (existingSettleBet) {
    const actualAmount = isDoubleBetting
      ? currentUser.wallet * 0.5
      : currentUser.wallet;

    return res.status(200).json({
      status: "0000",
      balance: roundToTwoDecimals(actualAmount),
      err_text: "Bet has already been settled",
    });
  }

  if (existingCancelBet) {
    const actualAmount = isDoubleBetting
      ? currentUser.wallet * 0.5
      : currentUser.wallet;

    return res.status(200).json({
      status: "0000",
      balance: roundToTwoDecimals(actualAmount),
      err_text: "Bet has already been cancelled",
    });
  }

  const actualUpdateBalance = isDoubleBetting
    ? roundToTwoDecimals(amount) * 2
    : roundToTwoDecimals(amount);

  const [updatedUserBalance] = await Promise.all([
    User.findOneAndUpdate(
      { gameId: actualGameId },
      { $inc: { wallet: actualUpdateBalance } },
      { new: true, projection: { wallet: 1 } }
    ).lean(),

    SlotJDBModal.findOneAndUpdate(
      { betId: refTransferIds },
      { cancel: true },
      { new: false }
    ),
  ]);

  const finalActualAmount = isDoubleBetting
    ? updatedUserBalance.wallet * 0.5
    : updatedUserBalance.wallet;

  return res.status(200).json({
    status: "0000",
    balance: roundToTwoDecimals(finalActualAmount),
    err_text: "",
  });
}

async function handleReward(
  currentUser,
  { transferId, uid, amount },
  res,
  isDoubleBetting,
  actualGameId
) {
  const existingTransaction = await SlotJDBModal.findOne(
    { betId: transferId, reward: true },
    { _id: 1 }
  ).lean();

  if (existingTransaction) {
    const actualAmount = isDoubleBetting
      ? currentUser.wallet * 0.5
      : currentUser.wallet;

    return res.status(200).json({
      status: "0000",
      balance: roundToTwoDecimals(actualAmount),
      err_text: "Reward Existed",
    });
  }
  const actualUpdateBalance = isDoubleBetting
    ? roundToTwoDecimals(amount) * 2
    : roundToTwoDecimals(amount);

  const [updatedUserBalance] = await Promise.all([
    User.findOneAndUpdate(
      { gameId: actualGameId },
      { $inc: { wallet: actualUpdateBalance } },
      { new: true, projection: { wallet: 1 } }
    ).lean(),

    SlotJDBModal.create({
      username: currentUser.gameId,
      betId: transferId,
      reward: true,
      settleamount: actualUpdateBalance,
      settle: true,
      bet: true,
      gametype: "SLOT",
    }),
  ]);

  const finalActualAmount = isDoubleBetting
    ? updatedUserBalance.wallet * 0.5
    : updatedUserBalance.wallet;

  return res.status(200).json({
    status: "0000",
    balance: roundToTwoDecimals(finalActualAmount),
    err_text: "",
  });
}

async function handleDeposit(
  currentUser,
  { transferId, uid, amount, gType },
  res,
  isDoubleBetting,
  actualGameId
) {
  if (currentUser.gameLock?.jdb?.lock) {
    const actualAmount = isDoubleBetting
      ? (currentUser?.wallet || 0) * 0.5
      : currentUser?.wallet || 0;

    return res.status(200).json({
      status: "1001",
      balance: roundToTwoDecimals(actualAmount),
      err_text: "Player locked",
    });
  }

  const existingTransaction = await SlotJDBModal.findOne(
    { betId: transferId },
    { _id: 1 }
  ).lean();

  if (existingTransaction) {
    const actualAmount = isDoubleBetting
      ? currentUser.wallet * 0.5
      : currentUser.wallet;

    return res.status(200).json({
      status: "0000",
      balance: roundToTwoDecimals(actualAmount),
      err_text: "Deposit Existed",
    });
  }

  const actualUpdateBalance = isDoubleBetting
    ? roundToTwoDecimals(amount) * 2
    : roundToTwoDecimals(amount);

  const updatedUserBalance = await User.findOneAndUpdate(
    {
      gameId: actualGameId,
      wallet: { $gte: actualUpdateBalance },
    },
    { $inc: { wallet: -actualUpdateBalance } },
    { new: true, projection: { wallet: 1 } }
  ).lean();
  if (!updatedUserBalance) {
    const latestUser = await User.findOne(
      { gameId: actualGameId },
      { wallet: 1 }
    ).lean();

    const actualAmount = isDoubleBetting
      ? (latestUser?.wallet || 0) * 0.5
      : latestUser?.wallet || 0;

    return res.status(200).json({
      status: "6006",
      balance: roundToTwoDecimals(actualAmount),
      err_text: "Player balance is insufficient",
    });
  }

  const gametype = gType === 7 ? "FISH" : "SLOT";

  await SlotJDBModal.create({
    username: currentUser.gameId,
    betId: transferId,
    bet: true,
    gametype,
  });

  const finalActualAmount = isDoubleBetting
    ? updatedUserBalance.wallet * 0.5
    : updatedUserBalance.wallet;

  return res.status(200).json({
    status: "0000",
    balance: roundToTwoDecimals(finalActualAmount),
    err_text: "",
  });
}

async function handleWithdraw(
  currentUser,
  { refTransferIds, uid, amount, totalBet, totalWin },
  res,
  isDoubleBetting,
  actualGameId
) {
  const [existingDeposit, existingCancelDeposit, existingWithdraw] =
    await Promise.all([
      SlotJDBModal.findOne({ betId: refTransferIds }, { _id: 1 }).lean(),
      SlotJDBModal.findOne(
        { betId: refTransferIds, cancel: true },
        { _id: 1 }
      ).lean(),
      SlotJDBModal.findOne(
        { betId: refTransferIds, settle: true },
        { _id: 1 }
      ).lean(),
    ]);

  if (!existingDeposit) {
    const actualAmount = isDoubleBetting
      ? currentUser.wallet * 0.5
      : currentUser.wallet;

    return res.status(200).json({
      status: "9999",
      balance: roundToTwoDecimals(actualAmount),
      err_text: "No Deposit Found",
    });
  }

  if (existingCancelDeposit) {
    const actualAmount = isDoubleBetting
      ? currentUser.wallet * 0.5
      : currentUser.wallet;

    return res.status(200).json({
      status: "0000",
      balance: roundToTwoDecimals(actualAmount),
      err_text: "Deposit has already been cancelled",
    });
  }

  if (existingWithdraw) {
    const actualAmount = isDoubleBetting
      ? currentUser.wallet * 0.5
      : currentUser.wallet;

    return res.status(200).json({
      status: "0000",
      balance: roundToTwoDecimals(actualAmount),
      err_text: "Withdrawal has already been completed",
    });
  }
  const actualUpdateBalance = isDoubleBetting
    ? roundToTwoDecimals(amount) * 2
    : roundToTwoDecimals(amount);

  const actualTotalBet = isDoubleBetting
    ? roundToTwoDecimals(Math.abs(totalBet)) * 2
    : roundToTwoDecimals(Math.abs(totalBet));

  const actualTotalWin = isDoubleBetting
    ? roundToTwoDecimals(totalWin) * 2
    : roundToTwoDecimals(totalWin);

  const [updatedUserBalance] = await Promise.all([
    User.findOneAndUpdate(
      { gameId: actualGameId },
      { $inc: { wallet: actualUpdateBalance } },
      { new: true, projection: { wallet: 1 } }
    ).lean(),

    SlotJDBModal.findOneAndUpdate(
      { betId: refTransferIds },
      {
        settle: true,
        betamount: actualTotalBet,
        settleamount: actualTotalWin,
      },
      { new: false }
    ),
  ]);

  const finalActualAmount = isDoubleBetting
    ? updatedUserBalance.wallet * 0.5
    : updatedUserBalance.wallet;

  return res.status(200).json({
    status: "0000",
    balance: roundToTwoDecimals(finalActualAmount),
    err_text: "",
  });
}

async function handleDepositCancellation(
  currentUser,
  { refTransferIds, uid, amount },
  res,
  isDoubleBetting,
  actualGameId
) {
  const [existingDeposit, existingWithdraw, existingCancelDeposit] =
    await Promise.all([
      SlotJDBModal.findOne({ betId: refTransferIds }, { _id: 1 }).lean(),
      SlotJDBModal.findOne(
        { betId: refTransferIds, settle: true },
        { _id: 1 }
      ).lean(),
      SlotJDBModal.findOne(
        { betId: refTransferIds, cancel: true },
        { _id: 1 }
      ).lean(),
    ]);

  if (!existingDeposit) {
    const actualAmount = isDoubleBetting
      ? currentUser.wallet * 0.5
      : currentUser.wallet;

    return res.status(200).json({
      status: "9999",
      balance: roundToTwoDecimals(actualAmount),
      err_text: "No Deposit Found",
    });
  }

  if (existingWithdraw) {
    const actualAmount = isDoubleBetting
      ? currentUser.wallet * 0.5
      : currentUser.wallet;

    return res.status(200).json({
      status: "0000",
      balance: roundToTwoDecimals(actualAmount),
      err_text: "Withdrawal has already been completed",
    });
  }

  if (existingCancelDeposit) {
    const actualAmount = isDoubleBetting
      ? currentUser.wallet * 0.5
      : currentUser.wallet;

    return res.status(200).json({
      status: "0000",
      balance: roundToTwoDecimals(actualAmount),
      err_text: "Deposit has already been cancelled",
    });
  }

  const actualUpdateBalance = isDoubleBetting
    ? roundToTwoDecimals(amount) * 2
    : roundToTwoDecimals(amount);

  const [updatedUserBalance] = await Promise.all([
    User.findOneAndUpdate(
      { gameId: actualGameId },
      { $inc: { wallet: actualUpdateBalance } },
      { new: true, projection: { wallet: 1 } }
    ).lean(),

    SlotJDBModal.findOneAndUpdate(
      { betId: refTransferIds },
      { cancel: true },
      { new: false }
    ),
  ]);

  const finalActualAmount = isDoubleBetting
    ? updatedUserBalance.wallet * 0.5
    : updatedUserBalance.wallet;

  return res.status(200).json({
    status: "0000",
    balance: roundToTwoDecimals(finalActualAmount),
    err_text: "",
  });
}

async function handleFreeSpinReward(
  currentUser,
  { transferId, uid, amount },
  res,
  isDoubleBetting,
  actualGameId
) {
  const existingTransaction = await SlotJDBModal.findOne(
    { betId: transferId, reward: true },
    { _id: 1 }
  ).lean();

  if (existingTransaction) {
    const actualAmount = isDoubleBetting
      ? currentUser.wallet * 0.5
      : currentUser.wallet;

    return res.status(200).json({
      status: "0000",
      balance: roundToTwoDecimals(actualAmount),
      err_text: "Free Spin Reward Existed",
    });
  }

  const actualUpdateBalance = isDoubleBetting
    ? roundToTwoDecimals(amount) * 2
    : roundToTwoDecimals(amount);

  const [updatedUserBalance] = await Promise.all([
    User.findOneAndUpdate(
      { gameId: actualGameId },
      { $inc: { wallet: actualUpdateBalance } },
      { new: true, projection: { wallet: 1 } }
    ).lean(),

    SlotJDBModal.create({
      username: currentUser.gameId,
      betId: transferId,
      reward: true,
      settle: true,
      bet: true,
      settleamount: actualUpdateBalance,
      gametype: "SLOT",
    }),
  ]);

  const finalActualAmount = isDoubleBetting
    ? updatedUserBalance.wallet * 0.5
    : updatedUserBalance.wallet;

  return res.status(200).json({
    status: "0000",
    balance: roundToTwoDecimals(finalActualAmount),
    err_text: "",
  });
}

router.post("/api/jdbslot/getturnoverforrebate", async (req, res) => {
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

    console.log("JDB SLOT QUERYING TIME", startDate, endDate);

    const records = await SlotJDBModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "SLOT",
      cancel: { $ne: true },
      settle: true,
      username: { $not: /2[xX]$/i },
    });

    const uniqueGameIds = [
      ...new Set(records.map((record) => record.username.toUpperCase())),
    ];
    const users = await User.find(
      { gameId: { $in: uniqueGameIds } },
      { gameId: 1, username: 1 }
    ).lean();

    const gameIdToUsername = {};
    users.forEach((user) => {
      gameIdToUsername[user.gameId] = user.username;
    });

    // Aggregate turnover and win/loss for each player
    let playerSummary = {};

    records.forEach((record) => {
      const gameId = record.username.toUpperCase();
      const actualUsername = gameIdToUsername[gameId];

      if (!actualUsername) {
        console.warn(`JDB User not found for gameId: ${gameId}`);
        return;
      }

      if (!playerSummary[actualUsername]) {
        playerSummary[actualUsername] = { turnover: 0, winloss: 0 };
      }

      playerSummary[actualUsername].turnover += record.betamount || 0;

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
    return res.status(200).json({
      success: true,
      summary: {
        gamename: "JDB",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("JDB: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "JDB: Failed to fetch win/loss report",
        zh: "JDB: 获取盈亏报告失败",
      },
    });
  }
});

router.post("/api/jdbslot2x/getturnoverforrebate", async (req, res) => {
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

    console.log("JDB SLOT QUERYING TIME", startDate, endDate);

    const records = await SlotJDBModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "SLOT",
      cancel: { $ne: true },
      settle: true,
      username: /2[xX]$/,
    });

    const uniqueGameIds = [
      ...new Set(
        records.map((record) => record.username.slice(0, -2).toUpperCase())
      ),
    ];

    const users = await User.find(
      { gameId: { $in: uniqueGameIds } },
      { gameId: 1, username: 1 }
    ).lean();

    const gameIdToUsername = {};
    users.forEach((user) => {
      gameIdToUsername[user.gameId] = user.username;
    });

    // Aggregate turnover and win/loss for each player
    let playerSummary = {};

    records.forEach((record) => {
      const gameId = record.username.slice(0, -2).toUpperCase();
      const actualUsername = gameIdToUsername[gameId];

      if (!actualUsername) {
        console.warn(`JDB2X User not found for gameId: ${gameId}`);
        return;
      }

      if (!playerSummary[actualUsername]) {
        playerSummary[actualUsername] = { turnover: 0, winloss: 0 };
      }

      playerSummary[actualUsername].turnover += record.betamount || 0;

      playerSummary[actualUsername].winloss +=
        (record.settleamount || 0) - (record.betamount || 0);
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
        gamename: "JDB2X",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("JDB: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "JDB: Failed to fetch win/loss report",
        zh: "JDB: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/jdbslot/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotJDBModal.find({
        username: new RegExp(`^${user.gameId}$`, "i"),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "SLOT",
        cancel: { $ne: true },
        settle: true,
      });

      // Aggregate turnover and win/loss for each player
      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;
        totalWinLoss += (record.settleamount || 0) - (record.betamount || 0);
      });

      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));
      // Return the aggregated results
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JDB",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("JDB: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JDB: Failed to fetch win/loss report",
          zh: "JDB: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jdbslot2x/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotJDBModal.find({
        username: new RegExp(`^${user.gameId}2X$`, "i"),
        // username: `${user.gameId}2X`,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "SLOT",
        cancel: { $ne: true },
        settle: true,
      });

      // Aggregate turnover and win/loss for each player
      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;
        totalWinLoss += (record.settleamount || 0) - (record.betamount || 0);
      });

      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));
      // Return the aggregated results
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JDB2X",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("JDB: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JDB: Failed to fetch win/loss report",
          zh: "JDB: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jdbslot/:userId/gamedata",
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
          const gameCat = Object.fromEntries(gameCategories["Slot Games"]);

          if (gameCat["JDB"]) {
            totalTurnover += gameCat["JDB"].turnover || 0;
            totalWinLoss += gameCat["JDB"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JDB",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("JDB: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JDB: Failed to fetch win/loss report",
          zh: "JDB: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jdbslot2x/:userId/gamedata",
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
          const gameCat = Object.fromEntries(gameCategories["Slot Games"]);

          if (gameCat["JDB2X"]) {
            totalTurnover += gameCat["JDB2X"].turnover || 0;
            totalWinLoss += gameCat["JDB2X"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JDB2X",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("JDB: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JDB: Failed to fetch win/loss report",
          zh: "JDB: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jdbslot/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotJDBModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "SLOT",
        cancel: { $ne: true },
        settle: true,
        username: { $not: /2[xX]$/i },
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;

        totalWinLoss += (record.betamount || 0) - (record.settleamount || 0);
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JDB",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("JDB: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "JDB: Failed to fetch win/loss report",
          zh: "JDB: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jdbslot2x/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotJDBModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "SLOT",
        cancel: { $ne: true },
        refund: { $ne: true },
        settle: true,
        username: /2[xX]$/,
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;

        totalWinLoss += (record.betamount || 0) - (record.settleamount || 0);
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JDB2X",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("JDB: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "JDB: Failed to fetch win/loss report",
          zh: "JDB: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jdbslot/kioskreport",
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
          const gameCat = Object.fromEntries(gameCategories["Slot Games"]);

          if (gameCat["JDB"]) {
            totalTurnover += Number(gameCat["JDB"].turnover || 0);
            totalWinLoss += Number(gameCat["JDB"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JDB",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("JDB: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "JDB: Failed to fetch win/loss report",
          zh: "JDB: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jdbslot2x/kioskreport",
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
          const gameCat = Object.fromEntries(gameCategories["Slot Games"]);

          if (gameCat["JDB2X"]) {
            totalTurnover += Number(gameCat["JDB2X"].turnover || 0);
            totalWinLoss += Number(gameCat["JDB2X"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JDB2X",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("JDB: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "JDB: Failed to fetch win/loss report",
          zh: "JDB: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ----------------
router.post("/api/jdbfish/getturnoverforrebate", async (req, res) => {
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

    console.log("JDB FISH QUERYING TIME", startDate, endDate);

    const records = await SlotJDBModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "FISH",
      cancel: { $ne: true },
      settle: true,
    });

    const uniqueGameIds = [
      ...new Set(records.map((record) => record.username.toUpperCase())),
    ];

    const users = await User.find(
      { gameId: { $in: uniqueGameIds } },
      { gameId: 1, username: 1 }
    ).lean();

    const gameIdToUsername = {};
    users.forEach((user) => {
      gameIdToUsername[user.gameId] = user.username;
    });
    // Aggregate turnover and win/loss for each player
    let playerSummary = {};

    records.forEach((record) => {
      const gameId = record.username.toUpperCase();
      const actualUsername = gameIdToUsername[gameId];

      if (!playerSummary[actualUsername]) {
        playerSummary[actualUsername] = { turnover: 0, winloss: 0 };
      }

      playerSummary[actualUsername].turnover += record.betamount || 0;

      playerSummary[actualUsername].winloss +=
        (record.settleamount || 0) - (record.betamount || 0);
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
        gamename: "JDB",
        gamecategory: "Fishing",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("JDB: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "JDB: Failed to fetch win/loss report",
        zh: "JDB: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/jdbfish/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotJDBModal.find({
        username: new RegExp(`^${user.gameId}$`, "i"),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "FISH",
        cancel: { $ne: true },
        settle: true,
      });

      // Aggregate turnover and win/loss for each player
      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;
        totalWinLoss += (record.settleamount || 0) - (record.betamount || 0);
      });

      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));
      // Return the aggregated results
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JDB",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("JDB: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JDB: Failed to fetch win/loss report",
          zh: "JDB: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jdbfish/:userId/gamedata",
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
          gameCategories["Fishing"] &&
          gameCategories["Fishing"] instanceof Map
        ) {
          const gameCat = Object.fromEntries(gameCategories["Fishing"]);

          if (gameCat["JDB"]) {
            totalTurnover += gameCat["JDB"].turnover || 0;
            totalWinLoss += gameCat["JDB"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JDB",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("JDB: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JDB: Failed to fetch win/loss report",
          zh: "JDB: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jdbfish/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotJDBModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "FISH",
        cancel: { $ne: true },
        settle: true,
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;

        totalWinLoss += (record.betamount || 0) - (record.settleamount || 0);
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JDB",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("JDB: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "JDB: Failed to fetch win/loss report",
          zh: "JDB: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jdbfish/kioskreport",
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
          gameCategories["Fishing"] &&
          gameCategories["Fishing"] instanceof Map
        ) {
          const gameCat = Object.fromEntries(gameCategories["Fishing"]);

          if (gameCat["JDB"]) {
            totalTurnover += Number(gameCat["JDB"].turnover || 0);
            totalWinLoss += Number(gameCat["JDB"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JDB",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("JDB: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "JDB: Failed to fetch win/loss report",
          zh: "JDB: 获取盈亏报告失败",
        },
      });
    }
  }
);

module.exports = router;
