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
const SlotYellowbatModal = require("../../models/slot_yellowbat.model");
const GameYellowBatGameModal = require("../../models/slot_yellowbatDatabase.model");
const Decimal = require("decimal.js");
const { HttpsProxyAgent } = require("https-proxy-agent");
require("dotenv").config();

const yellowbatDC = "TITANS";
const yellowbatIV = process.env.YELLOWBAT_IV;
const yellowbatKEY = process.env.YELLOWBAT_KEY;
const webURL = "https://www.bm8my.vip/";
const yellowbatAPIURL = "https://api.ybdigit.net";
const yellowbatParent = "egm8myr";

const PROXY_URL = process.env.PROXY_URL;
const proxyAgent = new HttpsProxyAgent(PROXY_URL);

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

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

const malaysiaAxios = axios.create({
  ...(proxyAgent && {
    httpsAgent: proxyAgent,
    httpAgent: proxyAgent,
  }),
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
  },
});

router.post("/api/yellowbat/getprovidergamelist", async (req, res) => {
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
      parent: yellowbatParent,
      lang: lang,
    };
    const encryptedPayload = AESEncrypt(
      JSON.stringify(data),
      yellowbatKEY,
      yellowbatIV
    );

    const response = await malaysiaAxios.post(
      `${yellowbatAPIURL}/apiRequest.do`,
      qs.stringify({ dc: yellowbatDC, x: encryptedPayload })
    );

    const responseData = response.data;

    if (responseData.status !== "0000") {
      console.log("YWLLOABAT error fetching game list:", responseData);
      return res.status(200).json({
        success: false,
        message: {
          en: "YWLLOABAT: Unable to retrieve game lists. Please contact customer service for assistance.",
          zh: "YWLLOABAT: 无法获取游戏列表，请联系客服以获取帮助。",
          ms: "YWLLOABAT: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
    const gameTypeMap = {
      1: "Slot",
      2: "Fishing",
      3: "Bingo",
      4: "Arcade",
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
    console.log("YWLLOABAT error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "YWLLOABAT: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "YWLLOABAT: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "YWLLOABAT: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/yellowbat/comparegame", async (req, res) => {
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
      parent: yellowbatParent,
      lang: lang,
    };

    const encryptedPayload = AESEncrypt(
      JSON.stringify(data),
      yellowbatKEY,
      yellowbatIV
    );
    const response = await malaysiaAxios.post(
      `${yellowbatAPIURL}/apiRequest.do`,
      qs.stringify({ dc: yellowbatDC, x: encryptedPayload })
    );

    const responseData = response.data;

    if (responseData.status !== "0000") {
      console.log("YELLOWBAT error fetching game list:", responseData);
      return res.status(200).json({
        success: false,
        message: {
          en: "YELLOWBAT: Unable to retrieve game lists. Please contact customer service for assistance.",
          zh: "YELLOWBAT: 无法获取游戏列表，请联系客服以获取帮助。",
          ms: "YELLOWBAT: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
    const gameTypeMap = {
      1: "Slot",
      2: "Fishing",
      3: "Bingo",
      4: "Arcade",
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
    const dbGames = await GameYellowBatGameModal.find({}, "gameID");

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
      await GameYellowBatGameModal.updateMany(
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
      await GameYellowBatGameModal.updateMany(
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
    console.log("YELLOWBAT error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "YELLOWBAT: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "YELLOWBAT: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "YELLOWBAT: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/yellowbat/getgamelist", async (req, res) => {
  try {
    const games = await GameYellowBatGameModal.find({
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
    console.log("YELLOWBAT error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "YELLOWBAT: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "YELLOWBAT: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "YELLOWBAT: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "YELLOWBAT: 攞唔到遊戲清單，老闆麻煩聯絡客服幫手處理。",
        id: "YELLOWBAT: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/api/yellowbat/launchGame",
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
            zh_hk: "搵唔到用戶，麻煩再試多次或者聯絡客服幫手。",
            id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      const { gameLang, gameCode, gameType } = req.body;

      const isLocked =
        gameType === "Fishing"
          ? user.gameLock?.yellowbatfish?.lock
          : user.gameLock?.yellowbatslot?.lock;

      if (isLocked) {
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

      let lang = "en";

      if (gameLang === "en") {
        lang = "en";
      } else if (gameLang === "zh") {
        lang = "zh";
      } else if (gameLang === "ms") {
        lang = "en";
      } else if (gameLang === "zh_hk") {
        lang = "zh-tw";
      } else if (gameLang === "id") {
        lang = "en";
      }

      const gameInfo = await GameYellowBatGameModal.findOne(
        { gameID: gameCode },
        { gameType: 1 }
      ).lean();

      let gType;
      switch (gameInfo.gameType.toLowerCase()) {
        case "slot":
          gType = "1";
          break;
        case "fishing":
          gType = "2";
          break;
        case "bingo":
          gType = "3";
          break;
        case "arcade":
          gType = "4";
          break;
        default:
          gType = "1";
      }
      const data = {
        action: 21,
        ts: getCurrentTimestamp(),
        parent: yellowbatParent,
        uid: user.gameId,
        lang: lang,
        gType,
        mType: gameCode,
        lobbyURL: webURL,
      };

      const encryptedPayload = AESEncrypt(
        JSON.stringify(data),
        yellowbatKEY,
        yellowbatIV
      );

      const response = await malaysiaAxios.post(
        `${yellowbatAPIURL}/apiRequest.do`,
        qs.stringify({ dc: yellowbatDC, x: encryptedPayload })
      );

      if (response.data.status !== "0000") {
        console.log("YELLOWBAT error in launching game", responseData);

        if (
          response.data.status === "9013" ||
          response.data.status === "9022"
        ) {
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
            en: "YELLOWBAT: Game launch failed. Please try again or customer service for assistance.",
            zh: "YELLOWBAT: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "YELLOWBAT: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "YELLOWBAT: 遊戲開唔到，老闆試多次或者搵客服幫手。",
            id: "YELLOWBAT: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "YELLOWBAT"
      );

      return res.status(200).json({
        success: true,
        gameLobby: response.data.path,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
          zh_hk: "遊戲啟動成功。",
          id: "Permainan berhasil diluncurkan.",
        },
      });
    } catch (error) {
      console.log("YELLOWBAT error in launching game", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "YELLOWBAT: Game launch failed. Please try again or customer service for assistance.",
          zh: "YELLOWBAT: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "YELLOWBAT: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "YELLOWBAT: 遊戲開唔到，老闆試多次或者搵客服幫手。",
          id: "YELLOWBAT: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post("/api/yellowbat", async (req, res) => {
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

    const decryptedData = AesDecrypt(x, yellowbatKEY, yellowbatIV);
    const requestData = JSON.parse(decryptedData);

    const { action, uid } = requestData;
    const actualGameId = uid.toUpperCase();

    // Find current user first
    currentUser = await User.findOne(
      { gameId: actualGameId },
      {
        gameId: 1,
        wallet: 1,
        _id: 1,
        "gameLock.yellowbatslot.lock": 1,
        "gameLock.yellowbatfish.lock": 1,
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
      3: handleBetPlacement,
      4: handleBetCancellation,
      6: handleBalanceCheck,
      8: handleBetSettlement,
      9: handleWalletUpdate,
      10: handleReward,
      101: handleusefreecard,
      102: handlefreecardresult,
      103: handlecancelfreecard,
    };

    const handler = actionHandlers[action];
    if (!handler) {
      return res.status(200).json({
        status: "9999",
        balance: 0,
        err_text: "Unknown action",
      });
    }

    return await handler(currentUser, requestData, res, actualGameId);
  } catch (error) {
    console.error(
      "YELLOWBAT: Error in game provider calling stash88 api:",
      error.message
    );
    return res.status(200).json({
      status: "9999",
      balance: currentUser ? roundToTwoDecimals(currentUser.wallet) : 0,
      err_text: "Server error",
    });
  }
});

async function handleBalanceCheck(currentUser, requestData, res, actualGameId) {
  return res.status(200).json({
    status: "0000",
    balance: roundToTwoDecimals(currentUser.wallet),
  });
}

async function handleWalletUpdate(
  currentUser,
  { netWin, uid, reqBet, transferId, totalBet, totalWin, gType },
  res,
  actualGameId
) {
  const gametype = gType === 2 ? "FISH" : "SLOT";

  const isLocked =
    gametype === "FISH"
      ? currentUser.gameLock?.yellowbatfish?.lock
      : currentUser.gameLock?.yellowbatslot?.lock;

  if (isLocked) {
    return res.status(200).json({
      status: "7503",
      err_text: "Player locked",
    });
  }

  const existingTransaction = await SlotYellowbatModal.findOne(
    { betId: transferId },
    { _id: 1 }
  ).lean();

  if (existingTransaction) {
    return res.status(200).json({
      status: "9011",
      err_text: "Duplicate transactions",
    });
  }

  const updatedUserBalance = await User.findOneAndUpdate(
    {
      gameId: actualGameId,
      wallet: { $gte: Math.abs(reqBet) },
    },
    { $inc: { wallet: roundToTwoDecimals(netWin) } },
    { new: true, projection: { wallet: 1 } }
  ).lean();

  if (!updatedUserBalance) {
    return res.status(200).json({
      status: "6006",
      err_text: "Player balance is insufficient",
    });
  }

  await SlotYellowbatModal.create({
    username: uid,
    betId: transferId,
    bet: true,
    settle: true,
    betamount: roundToTwoDecimals(Math.abs(totalBet)),
    settleamount: roundToTwoDecimals(totalWin),
    gametype,
  });

  return res.status(200).json({
    status: "0000",
    balance: roundToTwoDecimals(updatedUserBalance.wallet),
  });
}

async function handleBetPlacement(
  currentUser,
  { transferId, uid, bet, gType },
  res,
  actualGameId
) {
  const gametype = gType === 2 ? "FISH" : "SLOT";

  const isLocked =
    gametype === "FISH"
      ? currentUser.gameLock?.yellowbatfish?.lock
      : currentUser.gameLock?.yellowbatslot?.lock;

  if (isLocked) {
    return res.status(200).json({
      status: "7503",
      err_text: "Player locked",
    });
  }

  const existingTransaction = await SlotYellowbatModal.findOne(
    { betId: transferId },
    { _id: 1 }
  ).lean();

  if (existingTransaction) {
    return res.status(200).json({
      status: "9011",
      err_text: "Duplicate transactions.",
    });
  }

  const updatedUserBalance = await User.findOneAndUpdate(
    {
      gameId: actualGameId,
      wallet: { $gte: roundToTwoDecimals(bet) },
    },
    { $inc: { wallet: -roundToTwoDecimals(bet) } },
    { new: true, projection: { wallet: 1 } }
  ).lean();

  if (!updatedUserBalance) {
    return res.status(200).json({
      status: "6006",
      err_text: "Player balance is insufficient",
    });
  }

  await SlotYellowbatModal.create({
    username: currentUser.gameId,
    betId: transferId,
    bet: true,
    betamount: roundToTwoDecimals(bet),
    gametype,
  });

  return res.status(200).json({
    status: "0000",
    balance: roundToTwoDecimals(updatedUserBalance.wallet),
  });
}

async function handleBetSettlement(
  currentUser,
  { transferId, uid, win },
  res,
  actualGameId
) {
  const [existingBet, existingCancelBet, existingSettleBet] = await Promise.all(
    [
      SlotYellowbatModal.findOne({ betId: transferId }, { _id: 1 }).lean(),
      SlotYellowbatModal.findOne(
        { betId: transferId, cancel: true },
        { _id: 1 }
      ).lean(),
      SlotYellowbatModal.findOne(
        { betId: transferId, settle: true },
        { _id: 1 }
      ).lean(),
    ]
  );

  if (!existingBet) {
    return res.status(200).json({
      status: "9015",
      err_text: "Data does not exist.",
    });
  }

  if (existingCancelBet || existingSettleBet) {
    return res.status(200).json({
      status: "9011",
      err_text: "Duplicate transactions",
    });
  }

  const [updatedUserBalance] = await Promise.all([
    User.findOneAndUpdate(
      { gameId: actualGameId },
      { $inc: { wallet: roundToTwoDecimals(win) } },
      { new: true, projection: { wallet: 1 } }
    ).lean(),

    SlotYellowbatModal.findOneAndUpdate(
      { betId: transferId },
      { settle: true, settleamount: roundToTwoDecimals(win) },
      { new: false }
    ),
  ]);

  return res.status(200).json({
    status: "0000",
    balance: roundToTwoDecimals(updatedUserBalance.wallet),
  });
}

async function handleBetCancellation(
  currentUser,
  { transferId, uid },
  res,
  actualGameId
) {
  const [existingBet, existingSettleBet, existingCancelBet] = await Promise.all(
    [
      SlotYellowbatModal.findOne(
        { betId: transferId },
        { _id: 1, betamount: 1 }
      ).lean(),
      SlotYellowbatModal.findOne(
        { betId: transferId, settle: true },
        { _id: 1 }
      ).lean(),
      SlotYellowbatModal.findOne(
        { betId: transferId, cancel: true },
        { _id: 1 }
      ).lean(),
    ]
  );

  if (!existingBet) {
    return res.status(200).json({
      status: "9015",
      err_text: "Data does not exist.",
    });
  }

  if (existingSettleBet || existingCancelBet) {
    return res.status(200).json({
      status: "9011",
      err_text: "Duplicate transactions.",
    });
  }

  const [updatedUserBalance] = await Promise.all([
    User.findOneAndUpdate(
      { gameId: actualGameId },
      { $inc: { wallet: roundToTwoDecimals(existingBet.betamount || 0) } },
      { new: true, projection: { wallet: 1 } }
    ).lean(),

    SlotYellowbatModal.findOneAndUpdate(
      { betId: transferId },
      { cancel: true },
      { new: false }
    ),
  ]);

  return res.status(200).json({
    status: "0000",
    balance: roundToTwoDecimals(updatedUserBalance.wallet),
  });
}

async function handleReward(
  currentUser,
  { transferId, uid, awardAmount },
  res,
  actualGameId
) {
  const existingTransaction = await SlotYellowbatModal.findOne(
    { betId: transferId, reward: true },
    { _id: 1 }
  ).lean();

  if (existingTransaction) {
    return res.status(200).json({
      status: "0000",
      err_text: "Reward Existed",
    });
  }

  const [updatedUserBalance] = await Promise.all([
    User.findOneAndUpdate(
      { gameId: actualGameId },
      { $inc: { wallet: roundToTwoDecimals(awardAmount) } },
      { new: true, projection: { wallet: 1 } }
    ).lean(),

    SlotYellowbatModal.create({
      username: currentUser.gameId,
      betId: transferId,
      reward: true,
      settleamount: roundToTwoDecimals(awardAmount),
      settle: true,
      bet: true,
      gametype: "SLOT",
    }),
  ]);

  return res.status(200).json({
    status: "0000",
    balance: roundToTwoDecimals(updatedUserBalance.wallet),
  });
}

async function handleusefreecard(
  currentUser,
  { freeCardId, uid },
  res,
  actualGameId
) {
  const existingTransaction = await SlotYellowbatModal.findOne(
    { betId: freeCardId },
    { _id: 1 }
  ).lean();

  if (existingTransaction) {
    return res.status(200).json({
      status: "9011",
      err_text: "Duplicate transactions.",
    });
  }

  await SlotYellowbatModal.create({
    username: currentUser.gameId,
    betId: freeCardId,
    bet: true,
    betamount: 0,
    gametype: "SLOT",
  });

  return res.status(200).json({
    status: "0000",
  });
}

async function handlefreecardresult(
  currentUser,
  { freeCardId, uid, win },
  res,
  actualGameId
) {
  const [existingBet, existingCancelBet, existingSettleBet] = await Promise.all(
    [
      SlotYellowbatModal.findOne({ betId: freeCardId }, { _id: 1 }).lean(),
      SlotYellowbatModal.findOne(
        { betId: freeCardId, cancel: true },
        { _id: 1 }
      ).lean(),
      SlotYellowbatModal.findOne(
        { betId: freeCardId, settle: true },
        { _id: 1 }
      ).lean(),
    ]
  );

  if (!existingBet) {
    return res.status(200).json({
      status: "9015",
      err_text: "Data does not exist.",
    });
  }

  if (existingCancelBet || existingSettleBet) {
    return res.status(200).json({
      status: "9011",
      err_text: "Duplicate transactions",
    });
  }

  const [updatedUserBalance] = await Promise.all([
    User.findOneAndUpdate(
      { gameId: actualGameId },
      { $inc: { wallet: roundToTwoDecimals(win) } },
      { new: true, projection: { wallet: 1 } }
    ).lean(),

    SlotYellowbatModal.findOneAndUpdate(
      { betId: freeCardId },
      { settle: true, settleamount: roundToTwoDecimals(win) },
      { new: false }
    ),
  ]);

  return res.status(200).json({
    status: "0000",
    balance: roundToTwoDecimals(updatedUserBalance.wallet),
  });
}

async function handlecancelfreecard(
  currentUser,
  { freeCardId, uid },
  res,
  actualGameId
) {
  const [existingBet, existingSettleBet, existingCancelBet] = await Promise.all(
    [
      SlotYellowbatModal.findOne({ betId: freeCardId }, { _id: 1 }).lean(),
      SlotYellowbatModal.findOne(
        { betId: freeCardId, settle: true },
        { _id: 1 }
      ).lean(),
      SlotYellowbatModal.findOne(
        { betId: freeCardId, cancel: true },
        { _id: 1 }
      ).lean(),
    ]
  );

  if (!existingBet) {
    return res.status(200).json({
      status: "9015",
      err_text: "Data does not exist.",
    });
  }

  if (existingSettleBet || existingCancelBet) {
    return res.status(200).json({
      status: "9011",
      err_text: "Duplicate transactions.",
    });
  }

  await SlotYellowbatModal.findOneAndUpdate(
    { betId: freeCardId },
    { cancel: true },
    { new: false }
  );

  return res.status(200).json({
    status: "0000",
  });
}
module.exports = router;
