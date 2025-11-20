const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");
const moment = require("moment");
const { authenticateToken } = require("../../auth/auth");
const { authenticateAdminToken } = require("../../auth/adminAuth");
const {
  User,
  adminUserWalletLog,
  GameDataLog,
} = require("../../models/users.model");
const { v4: uuidv4 } = require("uuid");
const SlotFunkyModal = require("../../models/slot_funky.model");
const jwt = require("jsonwebtoken");
const GameWalletLog = require("../../models/gamewalletlog.model");
const GameFunkyGameModal = require("../../models/slot_funkyDatabase.model");

const funkyAgent = "1000300-EGM8MYR";
const funkySECRET = process.env.FUNKY_SECRET;
const webURL = "https://www.bm8my.vip/";
const funkyAPIURL = "https://cfbb7e4b9e25.funplayfky.com";

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

function generateXRequestId() {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(8).toString("hex");
  const userIdPart = crypto.randomBytes(4).toString("hex");

  // Combine parts and ensure total length is within 64 characters
  const xRequestId = `${timestamp}-${randomPart}-${userIdPart}`.slice(0, 64);

  return xRequestId;
}

router.post("/api/funky/comparegame", async (req, res) => {
  try {
    const xRequestId = generateXRequestId();

    const data = {
      language: "ZH_CN",
    };

    const loginResponse = await axios.post(
      `${funkyAPIURL}/Funky/Game/GetGameList`,
      data,
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": funkyAgent,
          Authentication: funkySECRET,
          "X-Request-ID": xRequestId,
        },
      }
    );

    // Check if API response is successful
    if (loginResponse.data.errorCode !== 0) {
      console.log("FUNKY error fetching game list:", loginResponse.data);
      return res.status(200).json({
        success: false,
        message: {
          en: "FUNKY: Unable to retrieve game lists. Please contact customer service for assistance.",
          zh: "FUNKY: 无法获取游戏列表，请联系客服以获取帮助。",
          ms: "FUNKY: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "FUNKY: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
          id: "FUNKY: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    // Get all games from database
    const dbGames = await GameFunkyGameModal.find({}, "gameID");

    // Extract game IDs from database
    const dbGameIds = new Set(dbGames.map((game) => game.gameID));

    // Extract games from API response
    const apiGames = loginResponse.data.gameList;
    const apiGameIds = new Set(apiGames.map((game) => game.gameCode));

    // Count totals
    const totalApiGames = apiGames.length;
    const totalDbGames = dbGames.length;

    // Find missing games (in API but not in database)
    const missingGames = apiGames.filter(
      (game) => !dbGameIds.has(game.gameCode)
    );

    // Find extra games (in database but not in API) and set maintenance to true
    const extraGameIds = [...dbGameIds].filter(
      (gameId) => !apiGameIds.has(gameId)
    );

    // Update extra games to maintenance: true
    if (extraGameIds.length > 0) {
      await GameFunkyGameModal.updateMany(
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
      await GameFunkyGameModal.updateMany(
        { gameID: { $in: activeGameIds } },
        { maintenance: false }
      );
      console.log(
        `Set maintenance: false for ${activeGameIds.length} games in API`
      );
    }

    // Return missing games with gameCode and gameType
    const missingGamesInfo = missingGames.map((game) => ({
      gameCode: game.gameCode,
      gameType: game.gameType,
      gameName: game.gameName,
      gameProvider: game.gameProvider,
      gameTypeDescription: game.gameTypeDescription,
      gameStatus: game.gameStatus,
      isNewGame: game.isNewGame,
      onLobby: game.onLobby,
      dashboardGameName: game.dashboardGameName,
      gameOrder: game.gameOrder,
    }));

    console.log("Missing games:", missingGamesInfo);
    console.log("Extra games set to maintenance:", extraGameIds.length);
    console.log(
      `Total API games: ${totalApiGames}, Total DB games: ${totalDbGames}`
    );

    return res.status(200).json({
      success: true,
      gameLobby: loginResponse.data,
      comparison: {
        missingGames: missingGamesInfo,
        extraGamesCount: extraGameIds.length,
        extraGameIds: extraGameIds,
        missingCount: missingGamesInfo.length,
        totalApiGames: totalApiGames,
        totalDbGames: totalDbGames,
      },
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("FUNKY error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "FUNKY: Game launch failed. Please try again or customer service for assistance.",
        zh: "FUNKY: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "FUNKY: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "FUNKY: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "FUNKY: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/funky/getprovidergame", async (req, res) => {
  try {
    const xRequestId = generateXRequestId();

    const data = {
      language: "ZH_CN",
    };

    const loginResponse = await axios.post(
      `${funkyAPIURL}/Funky/Game/GetGameList`,
      data,
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": funkyAgent,
          Authentication: funkySECRET,
          "X-Request-ID": xRequestId,
        },
      }
    );

    return res.status(200).json({
      success: true,
      gameLobby: loginResponse.data,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("FUNKY error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "FUNKY: Game launch failed. Please try again or customer service for assistance.",
        zh: "FUNKY: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "FUNKY: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "FUNKY: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "FUNKY: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/funky/getgamelist", async (req, res) => {
  try {
    const games = await GameFunkyGameModal.find({
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
          id: "Tidak ada permainan ditemukan. Silakan coba lagi nanti.",
          zh_hk: "未找到遊戲。請稍後再試。",
        },
      });
    }

    // Transform data into the desired format
    const reformattedGamelist = games.map((game) => ({
      GameCode: game.gameID,
      GameNameEN: game.gameNameEN,
      GameNameZH: game.gameNameCN,
      GameNameHK: game.gameNameHK,
      GameNameID: game.gameNameID,
      GameType: game.gameType,
      GameImage: game.imageUrlEN || "",
      GameImageZH: game.imageUrlCN || "",
      GameImageHK: game.imageUrlHK || "",
      GameImageID: game.imageUrlID || "",
      Hot: game.hot || false,
      RTP: game.rtpRate,
    }));

    return res.status(200).json({
      success: true,
      gamelist: reformattedGamelist,
    });
  } catch (error) {
    console.log("FUNKY error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "FUNKY: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "FUNKY: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "FUNKY: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "FUNKY: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "FUNKY: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/funky/launchGame", authenticateToken, async (req, res) => {
  try {
    // EN / ZH_CN
    const { gameLang, gameCode } = req.body;

    let lang = "EN";
    if (gameLang === "en") {
      lang = "EN";
    } else if (gameLang === "zh") {
      lang = "ZH_CN";
    } else if (gameLang === "zh_hk") {
      lang = "ZH_CN";
    } else if (gameLang === "ms") {
      lang = "MS_MY";
    } else if (gameLang === "id") {
      lang = "ID_ID";
    }

    const xRequestId = generateXRequestId();

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

    if (user.gameLock.funky.lock) {
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

    const normalisedUsername = user.username.toLowerCase();

    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();

    let sessionId = req.headers.authorization.split(" ")[1];
    sessionId = sessionId.slice(0, 100);

    const data = {
      currency: "MYR",
      disablePromotion: false,
      gameCode: gameCode,
      language: lang,
      playerId: user.gameId,
      playerIp: clientIp,
      redirectUrl: webURL,
      sessionId: sessionId,
      userName: normalisedUsername,
    };
    const loginResponse = await axios.post(
      `${funkyAPIURL}/Funky/Game/LaunchGame`,
      data,
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": funkyAgent,
          Authentication: funkySECRET,
          "X-Request-ID": xRequestId,
        },
      }
    );
    if (loginResponse.data.errorCode !== 0) {
      console.log(`FUNKY error in launching: ${loginResponse}`);
      return res.status(200).json({
        success: false,
        message: {
          en: "FUNKY: Game launch failed. Please try again or customer service for assistance.",
          zh: "FUNKY: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "FUNKY: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "FUNKY: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "FUNKY: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    const gameData = loginResponse.data.data;
    const fullGameUrl = `${gameData.gameUrl}?token=${gameData.token}`;

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "FUNKY"
    );

    return res.status(200).json({
      success: true,
      gameLobby: fullGameUrl,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("FUNKY error in launching game", error);
    return res.status(200).json({
      success: false,
      message: {
        en: "FUNKY: Game launch failed. Please try again or customer service for assistance.",
        zh: "FUNKY: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "FUNKY: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "FUNKY: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "FUNKY: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/funkygames/Funky/User/GetBalance", async (req, res) => {
  try {
    const { playerId, sessionId } = req.body;
    if (!playerId || !sessionId) {
      console.log("GetBalance invalid input");
      return res.status(200).json({
        errorCode: 400,
        errorMessage: "Invalid Input",
        data: {
          balance: 0,
        },
      });
    }

    const currentUser = await User.findOne(
      { gameId: playerId },
      { wallet: 1 }
    ).lean();

    if (!currentUser) {
      console.log("GetBalance not login");
      return res.status(200).json({
        errorCode: 401,
        errorMessage: "Player Not Login",
        data: {
          balance: 0,
        },
      });
    }

    return res.status(200).json({
      errorCode: 0,
      errorMessage: "Success",
      data: {
        balance: roundToTwoDecimals(currentUser.wallet),
      },
    });
  } catch (error) {
    console.error(
      "FUNKY: Error in game provider calling ae96 get balance api:",
      error.message
    );
    return res.status(200).json({
      errorCode: 9999,
      errorMessage: "Internal Server Error",
      data: {
        balance: 0,
      },
    });
  }
});

router.post("/api/funkygames/Funky/Bet/CheckBet", async (req, res) => {
  try {
    const { id, playerId } = req.body;

    const statementDate = moment.utc().format("YYYY-MM-DDTHH:mm:ssZ");

    if (!id || !playerId) {
      console.log("CheckBet invalid input");
      return res.status(200).json({
        errorCode: 400,
        errorMessage: "Invalid Input",
        data: {
          stake: 0,
          winAmount: 0,
          status: null,
          statementDate: statementDate,
        },
      });
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne({ gameId: playerId }, { _id: 1 }).lean(),
      SlotFunkyModal.findOne(
        { betId: id, username: playerId },
        { betamount: 1, settleamount: 1, status: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      console.log("CheckBet not login");
      return res.status(200).json({
        errorCode: 401,
        errorMessage: "Player Not Login",
        data: {
          stake: 0,
          winAmount: 0,
          status: null,
          statementDate: statementDate,
        },
      });
    }

    if (!existingBet) {
      console.log("CheckBet bet not found");
      return res.status(200).json({
        errorCode: 404,
        errorMessage: "Bet Was Not Found",
        data: {
          stake: 0,
          winAmount: 0,
          status: null,
          statementDate: statementDate,
        },
      });
    }

    let betAmount = existingBet.betamount;
    let settleAmount = existingBet.settleamount;

    return res.status(200).json({
      errorCode: 0,
      errorMessage: "Success",
      data: {
        stake: betAmount,
        winAmount: settleAmount,
        status: existingBet.status,
        statementDate: statementDate,
      },
    });
  } catch (error) {
    console.error(
      "FUNKY: Error in game provider calling ae96 check bet api:",
      error.message
    );
    return res.status(200).json({
      errorCode: 9999,
      errorMessage: "Internal Server Error",
      data: {
        balance: 0,
      },
    });
  }
});

router.post("/api/funkygames/Funky/Bet/PlaceBet", async (req, res) => {
  try {
    const { bet, playerIp, playerId, sessionId } = req.body;

    if (!bet || !playerIp || !playerId || !sessionId) {
      console.log("PlaceBet invalid input");
      return res.status(200).json({
        errorCode: 400,
        errorMessage: "Invalid Input",
        data: {
          balance: 0,
        },
      });
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne(
        { gameId: playerId },
        { _id: 1, wallet: 1, "gameLock.funky.lock": 1 }
      ).lean(),
      SlotFunkyModal.findOne(
        { betId: bet.refNo, username: playerId },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      console.log("PlaceBet not login");
      return res.status(200).json({
        errorCode: 401,
        errorMessage: "Player Not Login",
        data: {
          balance: 0,
        },
      });
    }

    if (currentUser.gameLock?.funky?.lock) {
      return res.status(200).json({
        errorCode: 405,
        errorMessage: "Player Locked",
        data: {
          balance: 0,
        },
      });
    }

    if (existingBet) {
      console.log("PlaceBet bet exists");
      return res.status(200).json({
        errorCode: 403,
        errorMessage: "Bet already exists",
        data: {
          balance: roundToTwoDecimals(currentUser.wallet),
        },
      });
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        gameId: playerId,
        wallet: { $gte: roundToTwoDecimals(bet.stake) },
      },
      { $inc: { wallet: -roundToTwoDecimals(bet.stake) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      const latestUser = await User.findOne(
        { gameId: playerId },
        { wallet: 1 }
      ).lean();

      console.log("PlaceBet not enough balance");
      return res.status(200).json({
        errorCode: 402,
        errorMessage: "Insufficient Balance",
        data: {
          balance: roundToTwoDecimals(latestUser?.wallet || 0),
        },
      });
    }

    await SlotFunkyModal.create({
      betId: bet.refNo,
      username: playerId,
      status: "R",
      betamount: roundToTwoDecimals(bet.stake),
      bet: true,
    });

    return res.status(200).json({
      errorCode: 0,
      errorMessage: "Success",
      data: {
        balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
    });
  } catch (error) {
    console.error(
      "FUNKY: Error in game provider calling ae96 place bet api:",
      error.message
    );
    return res.status(200).json({
      errorCode: 9999,
      errorMessage: "Internal Server Error",
      data: {
        balance: 0,
      },
    });
  }
});

router.post("/api/funkygames/Funky/Bet/SettleBet", async (req, res) => {
  try {
    const { betResultReq, refNo } = req.body;

    const statementDate = moment.utc().format("YYYY-MM-DDTHH:mm:ssZ");

    if (!betResultReq || !refNo) {
      console.log("settlebet invalid input");
      return res.status(200).json({
        errorCode: 400,
        errorMessage: "Invalid Input",
        data: {
          refNo: null,
          balance: 0,
          playerId: null,
          currency: "MYR",
          statementDate: statementDate,
        },
      });
    }

    const [currentUser, existingBet, gameInfo] = await Promise.all([
      User.findOne(
        { gameId: betResultReq.playerId },
        { _id: 1, wallet: 1 }
      ).lean(),
      SlotFunkyModal.findOne(
        { betId: refNo, username: betResultReq.playerId },
        { status: 1 }
      ).lean(),
      GameFunkyGameModal.findOne(
        { gameID: betResultReq.gameCode },
        { gameType: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      console.log("settlebet not login");
      return res.status(200).json({
        errorCode: 401,
        errorMessage: "Player Not Login",
        data: {
          refNo: refNo,
          balance: 0,
          playerId: null,
          currency: "MYR",
          statementDate: statementDate,
        },
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        errorCode: 404,
        errorMessage: "Bet Was Not Found",
        data: {
          refNo: refNo,
          balance: roundToTwoDecimals(currentUser.wallet),
          playerId: betResultReq.playerId,
          currency: "MYR",
          statementDate: statementDate,
        },
      });
    }

    if (existingBet.status !== "R") {
      return res.status(200).json({
        errorCode: 409,
        errorMessage: "Bet Already Settled",
        data: {
          refNo: refNo,
          balance: roundToTwoDecimals(currentUser.wallet),
          playerId: betResultReq.playerId,
          currency: "MYR",
          statementDate: statementDate,
        },
      });
    }

    const actualUpdateBalance = roundToTwoDecimals(betResultReq.winAmount);

    const actualeffectivestake = roundToTwoDecimals(
      betResultReq.effectiveStake
    );

    const actualstake = roundToTwoDecimals(betResultReq.stake);

    const winloss = actualUpdateBalance - actualstake + actualeffectivestake;

    const betStatus =
      actualUpdateBalance === actualstake
        ? "D"
        : actualUpdateBalance === 0 || actualstake > actualUpdateBalance
        ? "L"
        : "W";

    const gameTypeCode = gameInfo?.gameType === "Fishing" ? "FISH" : "SLOT";

    const [updatedUserBalance] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: actualUpdateBalance } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotFunkyModal.findOneAndUpdate(
        { betId: refNo },
        {
          $set: {
            betamount: actualeffectivestake,
            settleamount: winloss,
            status: betStatus,
            settle: true,
            gametype: gameTypeCode,
          },
        },
        { upsert: true, new: true }
      ),
    ]);

    return res.status(200).json({
      errorCode: 0,
      errorMessage: "Success",
      data: {
        refNo: refNo,
        balance: roundToTwoDecimals(updatedUserBalance.wallet),
        playerId: betResultReq.playerId,
        currency: "MYR",
        statementDate: statementDate,
      },
    });
  } catch (error) {
    console.error(
      "FUNKY: Error in game provider calling ae96 settle bet api:",
      error.message
    );
    return res.status(200).json({
      errorCode: 9999,
      errorMessage: "Internal Server Error",
      data: {
        refNo: null,
        balance: 0,
        playerId: null,
        currency: "MYR",
        statementDate: null,
      },
    });
  }
});

router.post("/api/funkygames/Funky/Bet/CancelBet", async (req, res) => {
  try {
    const { playerId, refNo } = req.body;

    if (!playerId || !refNo) {
      console.log("cancelbet invalid input");
      return res.status(200).json({
        errorCode: 400,
        errorMessage: "Invalid Input",
        data: {
          refNo: null,
        },
      });
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne({ gameId: playerId }, { _id: 1 }).lean(),
      SlotFunkyModal.findOne(
        { betId: refNo, username: playerId },
        { status: 1, betamount: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      console.log("cancelbet not login");
      return res.status(200).json({
        errorCode: 401,
        errorMessage: "Player Not Login",
        data: {
          refNo: refNo,
        },
      });
    }

    if (!existingBet) {
      console.log("cancelbet bet not found");
      return res.status(200).json({
        errorCode: 404,
        errorMessage: "Bet Was Not Found",
        data: {
          refNo: refNo,
        },
      });
    }

    if (existingBet.status !== "R") {
      console.log("cancelbet bet not R");
      return res.status(200).json({
        errorCode: 409,
        errorMessage: "Bet Already Settled",
        data: {
          refNo: refNo,
        },
      });
    }

    const amount = roundToTwoDecimals(existingBet.betamount);

    await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: amount } },
        { new: true }
      ),

      SlotFunkyModal.findOneAndUpdate(
        { betId: refNo },
        {
          $set: {
            status: "C",
            cancel: true,
          },
        },
        { upsert: true, new: true }
      ),
    ]);

    return res.status(200).json({
      errorCode: 0,
      errorMessage: "Success",
      data: {
        refNo: refNo,
      },
    });
  } catch (error) {
    console.error(
      "FUNKY: Error in game provider calling ae96 cancelled bet api:",
      error.message
    );
    return res.status(200).json({
      errorCode: 9999,
      errorMessage: "Internal Server Error",
      data: {
        refNo: null,
      },
    });
  }
});

router.post("/api/funkyslot/getturnoverforrebate", async (req, res) => {
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

    console.log("FUNKY SLOT QUERYING TIME", startDate, endDate);

    const records = await SlotFunkyModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "SLOT",
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

    // Aggregate turnover and win/loss for each player
    let playerSummary = {};

    records.forEach((record) => {
      const gameId = record.username;
      const actualUsername = gameIdToUsername[gameId];

      if (!actualUsername) {
        console.warn(`FUNKY User not found for gameId: ${gameId}`);
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
        gamename: "FUNKY",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("FUNKY: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "FUNKY: Failed to fetch win/loss report",
        zh: "FUNKY: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/funkyslot/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotFunkyModal.find({
        username: user.gameId,
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
          gamename: "FUNKY",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("FUNKY: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "FUNKY: Failed to fetch win/loss report",
          zh: "FUNKY: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/funkyslot/:userId/gamedata",
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

          if (gameCat["FUNKY"]) {
            totalTurnover += gameCat["FUNKY"].turnover || 0;
            totalWinLoss += gameCat["FUNKY"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "FUNKY",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("FUNKY: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "FUNKY: Failed to fetch win/loss report",
          zh: "FUNKY: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/funkyslot/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotFunkyModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "SLOT",
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
          gamename: "FUNKY",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("FUNKY: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "FUNKY: Failed to fetch win/loss report",
          zh: "FUNKY: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/funkyslot/kioskreport",
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

          if (gameCat["FUNKY"]) {
            totalTurnover += Number(gameCat["FUNKY"].turnover || 0);
            totalWinLoss += Number(gameCat["FUNKY"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "FUNKY",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("FUNKY: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "FUNKY: Failed to fetch win/loss report",
          zh: "FUNKY: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ----------------
router.post("/api/funkyfish/getturnoverforrebate", async (req, res) => {
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

    console.log("FUNKY FISH QUERYING TIME", startDate, endDate);

    const records = await SlotFunkyModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "FISH",
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
    // Aggregate turnover and win/loss for each player
    let playerSummary = {};

    records.forEach((record) => {
      const gameId = record.username;
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
        gamename: "FUNKY",
        gamecategory: "Fishing",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("FUNKY: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "FUNKY: Failed to fetch win/loss report",
        zh: "FUNKY: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/funkyfish/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotFunkyModal.find({
        username: user.gameId,
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
          gamename: "FUNKY",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("FUNKY: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "FUNKY: Failed to fetch win/loss report",
          zh: "FUNKY: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/funkyfish/:userId/gamedata",
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

          if (gameCat["FUNKY"]) {
            totalTurnover += gameCat["FUNKY"].turnover || 0;
            totalWinLoss += gameCat["FUNKY"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "FUNKY",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("FUNKY: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "FUNKY: Failed to fetch win/loss report",
          zh: "FUNKY: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/funkyfish/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotFunkyModal.find({
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
        totalWinLoss += (record.settleamount || 0) - (record.betamount || 0);
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "FUNKY",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("FUNKY: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "FUNKY: Failed to fetch win/loss report",
          zh: "FUNKY: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/funkyfish/kioskreport",
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

          if (gameCat["FUNKY"]) {
            totalTurnover += Number(gameCat["FUNKY"].turnover || 0);
            totalWinLoss += Number(gameCat["FUNKY"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "FUNKY",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("FUNKY: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "FUNKY: Failed to fetch win/loss report",
          zh: "FUNKY: 获取盈亏报告失败",
        },
      });
    }
  }
);
module.exports = router;
