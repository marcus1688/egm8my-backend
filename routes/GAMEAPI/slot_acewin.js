const express = require("express");
const router = express.Router();
const axios = require("axios");
const moment = require("moment");
const crypto = require("crypto");
const { authenticateToken } = require("../../auth/auth");
const { authenticateAdminToken } = require("../../auth/adminAuth");
const querystring = require("querystring");
const {
  User,
  adminUserWalletLog,
  GameDataLog,
} = require("../../models/users.model");
const { adminUser, adminLog } = require("../../models/adminuser.model");
const GameWalletLog = require("../../models/gamewalletlog.model");
const Decimal = require("decimal.js");
const GameAceWinGameModal = require("../../models/slot_acewinDatabase.model");
const SlotAceWinModal = require("../../models/slot_acewin.model");
require("dotenv").config();

const webURL = "https://www.bm8my.vip/";
const acewinAPIURL = "https://macross-platform-ag-prod.acewinplusfafafa.com";
const acewinSecret = process.env.ACEWIN_SECRET;
const acewinAgentId = "infi688awsl_egm8myr_myr";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateRandomText(length) {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
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

function generateSignature(fields, agentId, agentKey) {
  const now = moment.utc().subtract(4, "hours");
  const nowStr = now.format("YYMM") + parseInt(now.format("D"), 10);

  const keyG = crypto
    .createHash("md5")
    .update(nowStr + agentId + agentKey)
    .digest("hex");

  const queryString = Object.keys(fields)
    .map((key) => `${key}=${fields[key]}`)
    .join("&");

  const md5string = crypto
    .createHash("md5")
    .update(queryString + keyG)
    .digest("hex");

  const randomText1 = generateRandomText(6);
  const randomText2 = generateRandomText(6);

  const key = randomText1 + md5string + randomText2;

  return key;
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

// async function updateBTGamingManualOrderTimestampsPlus() {
//   try {
//     // List of gameIDs in order (AB1541 = latest, AB1501 = oldest)
//     const gameIds = [
//       "5280",
//       "1002",
//       "5271",
//       "1021",
//       "5292",
//       "1003",
//       "1005",
//       "1001",
//       "5290",
//       "5713",
//       "5285",
//       "5714",
//       "5296",
//       "5711",
//       "5281",
//       "5272",
//       "5284",
//       "5707",
//       "5288",
//       "5283",
//       "5279",
//       "5710",
//       "5282",
//       "5274",
//       "5709",
//       "5708",
//       "5278",
//       "5268",
//       "5270",
//       "5703",
//       "5266",
//       "5706",
//       "5705",
//       "5267",
//       "53",
//       "55",
//       "52",
//       "46",
//       "17",
//       "33",
//       "40",
//       "51",
//       "44",
//       "9",
//       "4",
//       "45",
//       "13",
//       "26",
//       "42",
//       "24",
//       "16",
//       "22",
//       "32",
//       "41",
//       "47",
//       "15",
//       "1",
//       "8",
//       "5501",
//     ];

//     // Start from current time + 1 month for the latest game (AB1541)
//     const currentTime = new Date();
//     const startTime = new Date(
//       currentTime.getTime() + 30 * 24 * 60 * 60 * 1000
//     ); // Add 30 days (1 month)

//     // Process each gameID with 30-minute intervals
//     for (let i = 0; i < gameIds.length; i++) {
//       const gameId = gameIds[i];

//       // Calculate timestamp: latest game gets start time (current + 1 month), each subsequent game is 30 minutes older
//       const timestamp = new Date(startTime.getTime() - i * 30 * 60 * 1000); // 30 minutes = 30 * 60 * 1000 milliseconds

//       // Update the document directly in the collection, bypassing schema timestamps
//       const result = await GameAceWinGameModal.collection.updateOne(
//         { gameID: gameId },
//         {
//           $set: {
//             createdAt: timestamp,
//             updatedAt: timestamp,
//           },
//         }
//       );

//       if (result.matchedCount > 0) {
//         console.log(
//           `Updated BTGaming gameID ${gameId} with timestamp: ${timestamp.toISOString()}`
//         );
//       } else {
//         console.log(`BTGaming GameID ${gameId} not found in database`);
//       }
//     }

//     console.log("BTGaming manual order timestamp update completed!");
//     console.log(
//       `Start time was set to: ${startTime.toISOString()} (current time + 1 month)`
//     );

//     // Verify the updates by fetching and displaying the results
//     const updatedGames = await GameAceWinGameModal.find(
//       { gameID: { $in: gameIds } },
//       { gameID: 1, createdAt: 1, gameNameEN: 1, hot: 1 }
//     ).sort({ createdAt: -1 });

//     console.log(
//       "\nVerification - BTGaming Games ordered by createdAt (newest first):"
//     );
//     updatedGames.forEach((game, index) => {
//       console.log(
//         `${index + 1}. GameID: ${
//           game.gameID
//         }, CreatedAt: ${game.createdAt.toISOString()}, Hot: ${
//           game.hot
//         }, Name: ${game.gameNameEN}`
//       );
//     });

//     console.log(
//       `\nTotal games updated: ${updatedGames.length}/${gameIds.length}`
//     );
//   } catch (error) {
//     console.error("Error updating BTGaming manual order timestamps:", error);
//   }
// }

// // Call the function
// updateBTGamingManualOrderTimestampsPlus();

router.post("/api/acewin/comparegame", async (req, res) => {
  try {
    const fields = {
      AgentId: acewinAgentId,
    };

    const hash = generateSignature(fields, acewinAgentId, acewinSecret);

    const requestData = new URLSearchParams({
      ...fields,
      Key: hash,
    }).toString();

    const response = await axios.post(
      `${acewinAPIURL}/api2/GetGameList`,
      requestData,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (response.data.ErrorCode !== 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: `AceWin: ${response.data.Message}`,
          zh: `AceWin: ${response.data.Message}`,
        },
      });
    }

    const providerGames = response.data.Data || [];

    // Get all games from database
    const dbGames = await GameAceWinGameModal.find(
      {},
      { gameID: 1, gameNameEN: 1, maintenance: 1, _id: 1 }
    ).lean();

    // Create sets for comparison
    const providerGameIds = new Set(
      providerGames.map((game) => game.GameId.toString())
    );
    const dbGameIds = new Set(dbGames.map((game) => game.gameID));

    // Find missing games (in provider but not in database)
    const missingGames = providerGames
      .filter((game) => !dbGameIds.has(game.GameId.toString()))
      .map((game) => ({
        gameId: game.GameId,
        gameNameEN: game.name["en-US"],
        gameNameCN: game.name["zh-CN"],
        gameNameHK: game.name["zh-TW"],
        gameCategoryId: game.GameCategoryId,
        hasJackpot: game.JP,
      }));

    // Find extra games (in database but not in provider) - set maintenance to true
    const extraGameIds = Array.from(dbGameIds).filter(
      (id) => !providerGameIds.has(id)
    );

    // Update extra games to maintenance mode
    if (extraGameIds.length > 0) {
      await GameAceWinGameModal.updateMany(
        { gameID: { $in: extraGameIds } },
        { $set: { maintenance: true } }
      );
    }

    // Get details of extra games for response
    const extraGames = dbGames
      .filter((game) => extraGameIds.includes(game.gameID))
      .map((game) => ({
        gameId: game.gameID,
        gameNameEN: game.gameNameEN,
        maintenanceSet: true,
      }));

    return res.status(200).json({
      success: true,
      summary: {
        totalProviderGames: providerGames.length,
        totalDbGames: dbGames.length,
        missingInDb: missingGames.length,
        extraInDb: extraGames.length,
        maintenanceUpdated: extraGames.length,
      },
      missingGames: missingGames,
      extraGames: extraGames,
      message: {
        en: `Game list retrieved successfully. ${missingGames.length} games missing in database, ${extraGames.length} games set to maintenance.`,
        zh: `游戏列表检索成功。数据库中缺少 ${missingGames.length} 个游戏，${extraGames.length} 个游戏已设置为维护模式。`,
      },
    });
  } catch (error) {
    console.error("AceWin get game list error:", error);
    return res.status(500).json({
      success: false,
      message: {
        en: "AceWin: Game list retrieval failed. Please try again or contact customer service for assistance.",
        zh: "AceWin: 游戏列表检索失败，请重试或联系客服以获得帮助。",
      },
    });
  }
});

router.post("/api/acewin/getprovidergamelist", async (req, res) => {
  try {
    const fields = {
      AgentId: acewinAgentId,
    };

    const hash = generateSignature(fields, acewinAgentId, acewinSecret);

    const requestData = new URLSearchParams({
      ...fields,
      Key: hash,
    }).toString();

    const response = await axios.post(
      `${acewinAPIURL}/api2/GetGameList`,
      requestData,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return res.status(200).json({
      success: true,
      data: response.data,
      message: {
        en: "Games list retrieved successfully.",
        zh: "游戏列表检索成功。",
        ms: "Senarai permainan berjaya diambil.",
        zh_hk: "遊戲列表檢索成功。",
        id: "Daftar permainan berhasil diambil.",
      },
    });
  } catch (error) {
    console.log("acewin error", error);
    return res.status(200).json({
      success: false,
      message: {
        en: "VPOWER: Game launch failed. Please try again or customer service for assistance.",
        zh: "VPOWER: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "VPOWER: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/acewin/getgamelist", async (req, res) => {
  try {
    const games = await GameAceWinGameModal.find({
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
      GameImageZH: game.imageUrlCN || "",
      Hot: game.hot || false,
      RTP: game.rtpRate,
    }));

    return res.status(200).json({
      success: true,
      gamelist: reformattedGamelist,
    });
  } catch (error) {
    console.error("Error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "ACEWIN: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "ACEWIN: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "ACEWIN: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "ACEWIN: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "ACEWIN: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/acewin/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, gameCode, gameType } = req.body;
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

    const isLocked =
      gameType === "Fishing"
        ? user.gameLock?.acewinfish?.lock
        : user.gameLock?.acewinslot?.lock;

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

    let lang = "en-us";

    if (gameLang === "en") {
      lang = "en-us";
    } else if (gameLang === "zh") {
      lang = "zh-cn";
    } else if (gameLang === "ms") {
      lang = "ms-my";
    } else if (gameLang === "id") {
      lang = "en-us";
    } else if (gameLang === "zh_hk") {
      lang = "zh-cn";
    }

    const token = `${user.gameId}:${generateRandomCode()}`;

    const fields = {
      Token: token,
      GameId: gameCode,
      Lang: lang,
      AgentId: acewinAgentId,
    };

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        acewinGameToken: token,
      },
      { new: true }
    );

    const hash = generateSignature(fields, acewinAgentId, acewinSecret);
    const requestData = new URLSearchParams({
      ...fields,
      HomeUrl: webURL,
      Key: hash,
    }).toString();

    const response = await axios.post(
      `${acewinAPIURL}/singleWallet/LoginWithoutRedirect`,
      requestData,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    if (response.data.ErrorCode !== 0) {
      console.log("ACEWIN error to launch game", response.data);
      return res.status(200).json({
        success: false,
        message: {
          en: "ACEWIN: Game launch failed. Please try again or customer service for assistance.",
          zh: "ACEWIN: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "ACEWIN: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "ACEWIN: 遊戲開唔到，老闆試多次或者搵客服幫手。",
          id: "ACEWIN: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "ACEWIN"
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
    console.log("ACEWIN error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "ACEWIN: Game launch failed. Please try again or customer service for assistance.",
        zh: "ACEWIN: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "ACEWIN: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "ACEWIN: 遊戲開唔到，老闆試多次或者搵客服幫手。",
        id: "ACEWIN: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/acewin/auth", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(200).json({
        errorCode: 5,
        message: "Invalid parameter",
      });
    }

    const tokenParts = token.split(":");

    const username = tokenParts[0];

    const currentUser = await User.findOne(
      { gameId: username },
      { wallet: 1, acewinGameToken: 1 }
    ).lean();

    if (!currentUser || currentUser.acewinGameToken !== token) {
      return res.status(200).json({
        errorCode: 4,
        message: "Token expired",
      });
    }

    const currentBalance = new Decimal(
      Number(currentUser.wallet)
    ).toDecimalPlaces(4);

    return res.status(200).json({
      errorCode: 0,
      message: "Success",
      username: username,
      currency: "MYR",
      balance: currentBalance.toNumber(),
      token: token,
    });
  } catch (error) {
    console.error(
      "ACEWIN: Error in game provider calling ae96 auth api:",
      error.message
    );
    return res.status(500).json({
      errorCode: 5,
      message: "Internal Server Error",
    });
  }
});

router.post("/api/acewin/bet", async (req, res) => {
  try {
    const { reqId, token, round, betAmount, winloseAmount, game } = req.body;

    if (
      !token ||
      !game ||
      !round ||
      betAmount === undefined ||
      betAmount === null ||
      winloseAmount === undefined ||
      winloseAmount === null
    ) {
      return res.status(200).json({
        errorCode: 3,
        message: "Invalid parameter",
      });
    }

    const username = token.split(":")[0];

    const betAmountDecimal = new Decimal(Number(betAmount)).toDecimalPlaces(4);
    const winloseAmountDecimal = new Decimal(
      Number(winloseAmount)
    ).toDecimalPlaces(4);

    const [currentUser, existingTransaction, gameInfo] = await Promise.all([
      User.findOne(
        { gameId: username },
        {
          acewinGameToken: 1,
          "gameLock.acewinfish.lock": 1,
          "gameLock.acewinslot.lock": 1,
          wallet: 1,
          _id: 1,
        }
      ).lean(),
      SlotAceWinModal.findOne({ roundId: round, bet: true }, { _id: 1 }).lean(),
      GameAceWinGameModal.findOne({ gameID: game }, { gameType: 1 }).lean(),
    ]);

    if (!currentUser || currentUser.acewinGameToken !== token) {
      return res.status(200).json({
        errorCode: 4,
        message: "Token expired",
      });
    }

    const gameTypeCode = gameInfo?.gameType === "Fishing" ? "FISH" : "SLOT";

    const isLocked =
      gameTypeCode === "FISH"
        ? currentUser.gameLock?.acewinfish?.lock
        : currentUser.gameLock?.acewinslot?.lock;

    if (isLocked) {
      return res.status(200).json({
        errorCode: 5,
        message: "Play locked",
      });
    }

    if (existingTransaction) {
      const currentBalance = new Decimal(
        Number(currentUser.wallet)
      ).toDecimalPlaces(4);
      return res.status(200).json({
        errorCode: 1,
        message: "Already accepted",
        username: username,
        currency: "MYR",
        balance: currentBalance.toNumber(),
        txId: round,
        token,
      });
    }

    const adjustedAmount = betAmountDecimal
      .neg()
      .plus(winloseAmountDecimal)
      .toDecimalPlaces(4);

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        gameId: username,
        wallet: { $gte: betAmountDecimal.toNumber() },
      },
      { $inc: { wallet: adjustedAmount.toNumber() } },
      { new: true, projection: { wallet: 1, username: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      const latestUser = await User.findOne(
        { gameId: username },
        { wallet: 1, _id: 1 }
      ).lean();

      const latestBalance = new Decimal(
        Number(latestUser?.wallet || 0)
      ).toDecimalPlaces(4);

      return res.status(200).json({
        errorCode: 2,
        message: "Not enough balance",
        username: username,
        currency: "MYR",
        balance: latestBalance.toNumber(),
        txId: round,
        token,
      });
    }

    await SlotAceWinModal.create({
      username: username,
      roundId: round,
      bet: true,
      settle: true,
      betamount: betAmountDecimal.toNumber(),
      settleamount: winloseAmountDecimal.toNumber(),
      gametype: gameTypeCode,
    });

    const finalBalance = new Decimal(
      Number(updatedUserBalance.wallet)
    ).toDecimalPlaces(4);

    return res.status(200).json({
      errorCode: 0,
      message: "Success",
      username: username,
      currency: "MYR",
      balance: finalBalance.toNumber(),
      txId: round,
      token,
    });
  } catch (error) {
    console.error(
      "ACEWIN: Error in game provider calling ae96 bet api:",
      error.message
    );
    return res.status(500).json({
      errorCode: 5,
      message: "Internal Server Error",
    });
  }
});

router.post("/api/acewin/cancelBet", async (req, res) => {
  try {
    const { reqId, userId, round, betAmount, winloseAmount } = req.body;

    if (!userId || !round || betAmount == null || winloseAmount == null) {
      return res.status(200).json({
        errorCode: 3,
        message: "Invalid parameter",
      });
    }

    const betAmountDecimal = new Decimal(Number(betAmount)).toDecimalPlaces(4);
    const winloseAmountDecimal = new Decimal(
      Number(winloseAmount)
    ).toDecimalPlaces(4);

    const [currentUser, existingTransaction, existingCancelledTransaction] =
      await Promise.all([
        User.findOne({ gameId: userId }, { wallet: 1, _id: 1 }).lean(),
        SlotAceWinModal.findOne(
          { roundId: round, bet: true },
          { _id: 1 }
        ).lean(),
        SlotAceWinModal.findOne(
          { roundId: round, cancel: true },
          { _id: 1 }
        ).lean(),
      ]);

    if (!currentUser) {
      return res.status(200).json({
        errorCode: 4,
        message: "Token expired",
      });
    }

    if (!existingTransaction) {
      const currentBalance = new Decimal(
        Number(currentUser.wallet)
      ).toDecimalPlaces(4);

      return res.status(200).json({
        errorCode: 2,
        message: "Round not found",
        username: username,
        currency: "MYR",
        balance: currentBalance.toNumber(),
        txId: round,
      });
    }

    if (existingCancelledTransaction) {
      const currentBalance = new Decimal(
        Number(currentUser.wallet)
      ).toDecimalPlaces(4);

      return res.status(200).json({
        errorCode: 1,
        message: "Already cancelled",
        username: username,
        currency: "MYR",
        balance: currentBalance.toNumber(),
        txId: round,
      });
    }

    const adjustedAmount = betAmountDecimal
      .minus(winloseAmountDecimal)
      .toDecimalPlaces(4);

    let updatedUserBalance;

    if (adjustedAmount.greaterThan(0)) {
      updatedUserBalance = await User.findOneAndUpdate(
        { gameId: userId },
        { $inc: { wallet: adjustedAmount.toNumber() } },
        { new: true, projection: { wallet: 1, username: 1 } }
      ).lean();
    } else if (adjustedAmount.lessThan(0)) {
      updatedUserBalance = await User.findOneAndUpdate(
        {
          gameId: userId,
          wallet: { $gte: adjustedAmount.abs().toNumber() },
        },
        { $inc: { wallet: adjustedAmount.toNumber() } },
        { new: true, projection: { wallet: 1, username: 1 } }
      ).lean();

      if (!updatedUserBalance) {
        const latestUser = await User.findOne(
          { gameId: userId },
          { wallet: 1, username: 1 }
        ).lean();

        const latestBalance = new Decimal(
          Number(latestUser?.wallet || 0)
        ).toDecimalPlaces(4);

        return res.status(200).json({
          errorCode: 5,
          message: "Not enough balance",
          username: latestUser?.username || userId,
          currency: "MYR",
          balance: latestBalance.toNumber(),
          txId: round,
        });
      }
    } else {
      updatedUserBalance = currentUser;
    }

    await SlotAceWinModal.findOneAndUpdate(
      { roundId: round },
      { $set: { cancel: true } },
      { upsert: true, new: true }
    );

    const finalBalance = new Decimal(
      Number(updatedUserBalance.wallet)
    ).toDecimalPlaces(4);

    return res.status(200).json({
      errorCode: 0,
      message: "Success",
      username: username,
      currency: "MYR",
      balance: finalBalance.toNumber(),
      txId: round,
    });
  } catch (error) {
    console.error(
      "ACEWIN: Error in game provider calling ae96 cancel api:",
      error.message
    );
    return res.status(200).json({
      errorCode: 5,
      message: "Internal Server Error",
    });
  }
});

router.post("/api/acewinslot/getturnoverforrebate", async (req, res) => {
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

    console.log("ACEWIN SLOT QUERYING TIME", startDate, endDate);

    const records = await SlotAceWinModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      cancel: { $ne: true },
      gametype: "SLOT",
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
        console.warn(`ACEWIN User not found for gameId: ${gameId}`);
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
        gamename: "ACEWIN",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("ACEWIN: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "ACEWIN: Failed to fetch win/loss report",
        zh: "ACEWIN: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/acewinslot/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotAceWinModal.find({
        username: user.gameId,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        gametype: "SLOT",
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
          gamename: "ACEWIN",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("ACEWIN: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "ACEWIN: Failed to fetch win/loss report",
          zh: "ACEWIN: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/acewinslot/:userId/gamedata",
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

          if (slotGames["ACEWIN"]) {
            totalTurnover += slotGames["ACEWIN"].turnover || 0;
            totalWinLoss += slotGames["ACEWIN"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "ACEWIN",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("ACEWIN: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "ACEWIN: Failed to fetch win/loss report",
          zh: "ACEWIN: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/acewinslot/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotAceWinModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        gametype: "SLOT",
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
          gamename: "ACEWIN",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("ACEWIN: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "ACEWIN: Failed to fetch win/loss report",
          zh: "ACEWIN: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/acewinslot/kioskreport",
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

          if (liveCasino["ACEWIN"]) {
            totalTurnover += Number(liveCasino["ACEWIN"].turnover || 0);
            totalWinLoss += Number(liveCasino["ACEWIN"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "ACEWIN",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("ACEWIN: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "ACEWIN: Failed to fetch win/loss report",
          zh: "ACEWIN: 获取盈亏报告失败",
        },
      });
    }
  }
);

// -------------

router.post("/api/acewinfish/getturnoverforrebate", async (req, res) => {
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

    console.log("ACEWIN FISH QUERYING TIME", startDate, endDate);

    const records = await SlotAceWinModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      cancel: { $ne: true },
      gametype: "FISH",

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
        console.warn(`ACEWIN User not found for gameId: ${gameId}`);
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
        gamename: "ACEWIN",
        gamecategory: "Fishing",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("ACEWIN: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "ACEWIN: Failed to fetch win/loss report",
        zh: "ACEWIN: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/acewinfish/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotAceWinModal.find({
        username: user.gameId,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        gametype: "FISH",

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
          gamename: "ACEWIN",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("ACEWIN: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "ACEWIN: Failed to fetch win/loss report",
          zh: "ACEWIN: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/acewinfish/:userId/gamedata",
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
          const slotGames = Object.fromEntries(gameCategories["Fishing"]);

          if (slotGames["ACEWIN"]) {
            totalTurnover += slotGames["ACEWIN"].turnover || 0;
            totalWinLoss += slotGames["ACEWIN"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "ACEWIN",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("ACEWIN: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "ACEWIN: Failed to fetch win/loss report",
          zh: "ACEWIN: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/acewinfish/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotAceWinModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        gametype: "FISH",

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
          gamename: "ACEWIN",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("ACEWIN: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "ACEWIN: Failed to fetch win/loss report",
          zh: "ACEWIN: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/acewinfish/kioskreport",
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
          const liveCasino = Object.fromEntries(gameCategories["Fishing"]);

          if (liveCasino["ACEWIN"]) {
            totalTurnover += Number(liveCasino["ACEWIN"].turnover || 0);
            totalWinLoss += Number(liveCasino["ACEWIN"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "ACEWIN",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("ACEWIN: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "ACEWIN: Failed to fetch win/loss report",
          zh: "ACEWIN: 获取盈亏报告失败",
        },
      });
    }
  }
);

module.exports = router;
