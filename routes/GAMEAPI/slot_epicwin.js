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
const SlotEpicWinModal = require("../../models/slot_epicwin.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const GameWalletLog = require("../../models/gamewalletlog.model");
const Decimal = require("decimal.js");
const GameEpicWinGameModal = require("../../models/slot_epicwinDatabase.model");

require("dotenv").config();

const epicWinOperatorID = "epwnEGM8MYRMYR";
const epicWinSecret = process.env.EPICWIN_SECRET;
const webURL = "https://www.bm8my.vip/";
const epicWinAPIURL = "https://smapi.eptech88.com/api/opgateway/v1/op/";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateSignature(...inputs) {
  // Filter out undefined or null inputs
  const validInputs = inputs.filter(
    (input) => input !== undefined && input !== null
  );

  // Join the valid inputs into a single string
  const stringToHash = validInputs.join("");

  return crypto.createHash("md5").update(stringToHash).digest("hex");
}

function getCurrentFormattedDate() {
  return moment.utc().format("YYYY-MM-DD HH:mm:ss");
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

// async function updateEpicWinApiRouteTimestamps() {
//   try {
//     // Make API call to get all games in route order
//     const functionName = "GetGameList";
//     const requestDateTime = getCurrentFormattedDate();
//     const signature = generateSignature(
//       functionName,
//       requestDateTime,
//       epicWinOperatorID,
//       epicWinSecret
//     );

//     const payload = {
//       OperatorId: epicWinOperatorID,
//       RequestDateTime: requestDateTime,
//       Signature: signature,
//     };

//     const response = await axios.post(`${epicWinAPIURL}GetGameList`, payload, {
//       headers: {
//         "Content-Type": "application/json",
//       },
//     });

//     if (response.data.Description !== "Success") {
//       console.log("EPICWIN ERROR IN GETTING GAME LIST", response.data);
//       throw new Error("Failed to fetch games from API");
//     }

//     // Extract games from API response in order
//     const apiGames = response.data.Game;
//     const gameIds = apiGames.map((game) => game.GameCode);

//     console.log(`Found ${gameIds.length} games from API in order:`, gameIds);

//     // Start from current time for the first game
//     const startTime = new Date();

//     // Process each gameID with 30-minute intervals
//     for (let i = 0; i < gameIds.length; i++) {
//       const gameId = gameIds[i];

//       // Calculate timestamp: first game gets current time, each subsequent game is 30 minutes older
//       const timestamp = new Date(startTime.getTime() - i * 30 * 60 * 1000); // 30 minutes = 30 * 60 * 1000 milliseconds

//       // Update the document directly in the collection, bypassing schema timestamps
//       const result = await GameEpicWinGameModal.collection.updateOne(
//         { gameID: gameId },
//         {
//           $set: {
//             createdAt: timestamp,
//             updatedAt: timestamp,
//           },
//         }
//       );

//       if (result.matchedCount > 0) {
//         const correspondingApiGame = apiGames.find(
//           (game) => game.GameCode === gameId
//         );
//         console.log(
//           `Updated EpicWin gameID ${gameId} (${
//             correspondingApiGame?.GameName
//           }) with timestamp: ${timestamp.toISOString()}`
//         );
//       } else {
//         console.log(`EpicWin GameID ${gameId} not found in database`);
//       }
//     }

//     console.log("EpicWin API route timestamp update completed!");

//     // Verify the updates by fetching and displaying the results
//     const updatedGames = await GameEpicWinGameModal.find(
//       { gameID: { $in: gameIds } },
//       { gameID: 1, createdAt: 1, gameNameEN: 1, hot: 1 }
//     ).sort({ createdAt: -1 });

//     console.log(
//       "\nVerification - EpicWin Games ordered by createdAt (newest first):"
//     );
//     updatedGames.forEach((game, index) => {
//       const correspondingApiGame = apiGames.find(
//         (apiGame) => apiGame.GameCode === game.gameID
//       );
//       console.log(
//         `${index + 1}. GameID: ${
//           game.gameID
//         }, CreatedAt: ${game.createdAt.toISOString()}, Hot: ${
//           game.hot
//         }, API Name: ${correspondingApiGame?.GameName || "N/A"}, DB Name: ${
//           game.gameNameEN
//         }`
//       );
//     });

//     console.log(
//       `\nTotal games updated: ${updatedGames.length}/${gameIds.length}`
//     );
//   } catch (error) {
//     console.error("Error updating EpicWin API route timestamps:", error);
//   }
// }

// // Call the function
// updateEpicWinApiRouteTimestamps();

router.post("/api/epicwin/comparegame", async (req, res) => {
  try {
    const functionName = "GetGameList";

    const requestDateTime = getCurrentFormattedDate();

    const signature = generateSignature(
      functionName,
      requestDateTime,
      epicWinOperatorID,
      epicWinSecret
    );

    const payload = {
      OperatorId: epicWinOperatorID,
      RequestDateTime: requestDateTime,
      Signature: signature,
    };

    // Make the API request
    const response = await axios.post(`${epicWinAPIURL}GetGameList`, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log(response.data);

    if (response.data.Description !== "Success") {
      console.log(
        "EPICWIN error in fetching game list",
        response.data,
        response.data.Description
      );
      return res.status(200).json({
        success: false,
        message: {
          en: "EPICWIN: Unable to retrieve game lists. Please contact customer service for assistance.",
          zh: "EPICWIN: 无法获取游戏列表，请联系客服以获取帮助。",
          ms: "EPICWIN: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "EPICWIN: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
          id: "EPICWIN: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    // Get all games from database
    const dbGames = await GameEpicWinGameModal.find({}, "gameID");

    // Extract game IDs from database
    const dbGameIds = new Set(dbGames.map((game) => game.gameID));

    // Extract games from API response
    const apiGames = response.data.Game;
    const apiGameIds = new Set(apiGames.map((game) => game.GameCode));

    // Count totals
    const totalApiGames = apiGames.length;
    const totalDbGames = dbGames.length;

    // Find missing games (in API but not in database)
    const missingGames = apiGames.filter(
      (game) => !dbGameIds.has(game.GameCode)
    );

    // Find extra games (in database but not in API) and set maintenance to true
    const extraGameIds = [...dbGameIds].filter(
      (gameId) => !apiGameIds.has(gameId)
    );

    // Update extra games to maintenance: true
    if (extraGameIds.length > 0) {
      await GameEpicWinGameModal.updateMany(
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
      await GameEpicWinGameModal.updateMany(
        { gameID: { $in: activeGameIds } },
        { maintenance: false }
      );
      console.log(
        `Set maintenance: false for ${activeGameIds.length} games in API`
      );
    }

    // Return missing games with GameCode and GameName
    const missingGamesInfo = missingGames.map((game) => ({
      gameCode: game.GameCode,
      gameName: game.GameName,
      gameType: game.GameType,
      method: game.Method,
      imageUrl: game.ImageUrl,
      isH5Support: game.IsH5Support,
      hasDemo: game.HasDemo,
      sequence: game.Sequence,
      gameProvideCode: game.GameProvideCode,
      gameProvideName: game.GameProvideName,
      isActive: game.IsActive,
      otherName: game.OtherName,
    }));

    console.log("Missing games:", missingGamesInfo);
    console.log("Extra games set to maintenance:", extraGameIds.length);
    console.log(
      `Total API games: ${totalApiGames}, Total DB games: ${totalDbGames}`
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data,
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
});

router.post("/api/epicwin/getprovidergamelist", async (req, res) => {
  try {
    const functionName = "GetGameList";

    const requestDateTime = getCurrentFormattedDate();

    const signature = generateSignature(
      functionName,
      requestDateTime,
      epicWinOperatorID,
      epicWinSecret
    );

    const payload = {
      OperatorId: epicWinOperatorID,
      RequestDateTime: requestDateTime,
      Signature: signature,
    };

    // Make the API request
    const response = await axios.post(`${epicWinAPIURL}GetGameList`, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });
    console.log(response.data);
    if (response.data.Description !== "Success") {
      console.log(
        "EPICWIN error in launching game",
        response.data,
        response.data.Description
      );
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

    return res.status(200).json({
      success: true,
      gameLobby: response.data,
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
});

router.post("/api/epicwin/getgamelist", async (req, res) => {
  try {
    const games = await GameEpicWinGameModal.find({
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
      GameImageZH: game.imageUrlCN,
      Hot: game.hot,
      RTP: game.rtpRate,
    }));

    return res.status(200).json({
      success: true,
      gamelist: reformattedGamelist,
    });
  } catch (error) {
    console.error("EPICWIN Error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "EPICWIN: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "EPICWIN: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "EPICWIN: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "EPICWIN: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "EPICWIN: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

//to login to game
router.post("/api/epicwin/launchGame", authenticateToken, async (req, res) => {
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

    if (user.gameLock.epicwin.lock) {
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

    let token = `${user.gameId}:${generateRandomCode()}`;

    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();

    let lang = "en-us";

    if (gameLang === "en") {
      lang = "en-us";
    } else if (gameLang === "zh") {
      lang = "zh-cn";
    } else if (gameLang === "zh_hk") {
      lang = "zh-tw";
    } else if (gameLang === "ms") {
      lang = "ml-my";
    } else if (gameLang === "id") {
      lang = "id-id";
    }

    const functionName = "GameLogin";

    const requestDateTime = getCurrentFormattedDate();

    const signature = generateSignature(
      functionName,
      requestDateTime,
      epicWinOperatorID,
      epicWinSecret,
      user.gameId
    );

    const payload = {
      OperatorId: epicWinOperatorID,
      RequestDateTime: requestDateTime,
      Signature: signature,
      PlayerId: user.gameId,
      Ip: clientIp,
      GameCode: gameCode,
      Currency: "MYR",
      Lang: lang,
      RedirectUrl: webURL,
      AuthToken: token,
    };
    // Make the API request
    const response = await axios.post(`${epicWinAPIURL}GameLogin`, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.data.Description !== "Success") {
      console.log(
        "EPICWIN error in launching game",
        response.data,
        response.data.Description
      );
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

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        epicwinGameToken: token,
      },
      { new: true }
    );

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "EPICWIN"
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data.Url,
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
});

router.post("/api/epicwins/GetBalance", async (req, res) => {
  try {
    const { OperatorId, Signature, PlayerId, AuthToken, RequestDateTime } =
      req.body;

    if (
      !OperatorId ||
      !Signature ||
      !PlayerId ||
      !AuthToken ||
      !RequestDateTime
    ) {
      return res.status(200).json({
        Status: 900406,
        Description: "Incoming Request Info Incomplete",
        ResponseDateTime: RequestDateTime,
        Balance: 0,
      });
    }

    if (OperatorId !== epicWinOperatorID) {
      return res.status(200).json({
        Status: 900405,
        Description: "Operator ID Error",
        ResponseDateTime: RequestDateTime,
        Balance: 0,
      });
    }

    const functionName = "GetBalance";

    const signature = generateSignature(
      functionName,
      RequestDateTime,
      epicWinOperatorID,
      epicWinSecret,
      PlayerId
    );
    if (signature !== Signature) {
      return res.status(200).json({
        Status: 900407,
        Description: "Invalid Signature",
        ResponseDateTime: RequestDateTime,
        Balance: 0,
      });
    }

    const tokenParts = AuthToken.split(":");

    const username = tokenParts[0];

    const currentUser = await User.findOne(
      { gameId: username },
      { wallet: 1, epicwinGameToken: 1 }
    ).lean();
    if (!currentUser || currentUser.epicwinGameToken !== AuthToken) {
      return res.status(200).json({
        Status: 900500,
        Description: "Internal Server Error",
        ResponseDateTime: RequestDateTime,
        Balance: 0,
      });
    }

    const walletValue = Number(currentUser.wallet);

    const finalBalance = new Decimal(walletValue).toDecimalPlaces(4);

    return res.status(200).json({
      Status: 200,
      Description: "OK",
      ResponseDateTime: RequestDateTime,
      Balance: finalBalance.toNumber(),
    });
  } catch (error) {
    console.error(
      "EPICWIN: Error in game provider calling ae96 get balance api:",
      error.message
    );
    if (
      error.message === "jwt expired" ||
      error.message === "invalid token" ||
      error.message === "jwt malformed"
    ) {
      return res.status(200).json({
        Status: 900500,
        Description: "Internal Server Error",
        ResponseDateTime: getCurrentFormattedDate(),
        Balance: 0,
      });
    } else {
      return res.status(200).json({
        Status: 900500,
        Description: "Internal Server Error",
        ResponseDateTime: getCurrentFormattedDate(),
        Balance: 0,
      });
    }
  }
});

router.post("/api/epicwins/Bet", async (req, res) => {
  try {
    const {
      OperatorId,
      Signature,
      PlayerId,
      BetId,
      RequestDateTime,
      BetAmount,
      AuthToken,
      RoundId,
    } = req.body;

    if (
      !OperatorId ||
      !Signature ||
      !PlayerId ||
      !BetId ||
      !RequestDateTime ||
      !AuthToken ||
      BetAmount === null ||
      BetAmount === undefined
    ) {
      return res.status(200).json({
        Status: 900406,
        Description: "Incoming Request Info Incomplete",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (OperatorId !== epicWinOperatorID) {
      return res.status(200).json({
        Status: 900405,
        Description: "Operator ID Error",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const functionName = "Bet";

    const signature = generateSignature(
      functionName,
      BetId,
      RequestDateTime,
      epicWinOperatorID,
      epicWinSecret,
      PlayerId
    );

    if (signature !== Signature) {
      return res.status(200).json({
        Status: 900407,
        Description: "Invalid Signature",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const tokenParts = AuthToken.split(":");

    const username = tokenParts[0];

    const [currentUser, existingBet] = await Promise.all([
      // Get only fields we need, no lean()
      User.findOne(
        { gameId: username },
        {
          wallet: 1,
          epicwinGameToken: 1,
          "gameLock.epicwin.lock": 1,
          _id: 1,
          username: 1,
        }
      ).lean(),
      SlotEpicWinModal.findOne({ betId: BetId, bet: true }, { _id: 1 }).lean(),
    ]);

    if (!currentUser || currentUser.epicwinGameToken !== AuthToken) {
      return res.status(200).json({
        Status: 900500,
        Description: "Internal Server Error",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (currentUser.gameLock?.epicwin?.lock) {
      return res.status(200).json({
        Status: 900416,
        Description: "Player Inactive",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (existingBet) {
      return res.status(200).json({
        Status: 900409,
        Description: "Duplicate Transaction",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    // const amount = roundToTwoDecimals(BetAmount);
    const amount = new Decimal(Number(BetAmount)).toDecimalPlaces(4); // Keeps as Decimal

    const finalOldBalance = new Decimal(
      Number(currentUser.wallet)
    ).toDecimalPlaces(4);

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: amount.toNumber() },
      },
      { $inc: { wallet: -amount.toNumber() } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res.status(200).json({
        Status: 900605,
        Description: "Insufficient Balance",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    await SlotEpicWinModal.create({
      username: username,
      betId: BetId,
      bet: true,
      betamount: amount.toNumber(),
    });

    const finalBalance = new Decimal(
      Number(updatedUserBalance.wallet)
    ).toDecimalPlaces(4);

    return res.status(200).json({
      Status: 200,
      Description: "OK",
      ResponseDateTime: RequestDateTime,
      OldBalance: finalOldBalance.toNumber(),
      NewBalance: finalBalance.toNumber(),
    });
  } catch (error) {
    console.error(
      "EPICWIN: Error in game provider calling ae96 get bet api:",
      error.message
    );
    return res.status(200).json({
      Status: 900500,
      Description: "Internal Server Error",
      ResponseDateTime: getCurrentFormattedDate(),
      OldBalance: 0,
      NewBalance: 0,
    });
  }
});

router.post("/api/epicwins/GameResult", async (req, res) => {
  try {
    const {
      OperatorId,
      Signature,
      PlayerId,
      BetId,
      RequestDateTime,
      BetAmount,
      ResultId,
      Payout,
    } = req.body;

    if (
      !OperatorId ||
      !Signature ||
      !PlayerId ||
      !BetId ||
      !RequestDateTime ||
      !ResultId ||
      Payout === null ||
      Payout === undefined ||
      BetAmount === null ||
      BetAmount === undefined
    ) {
      return res.status(200).json({
        Status: 900406,
        Description: "Incoming Request Info Incomplete",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (OperatorId !== epicWinOperatorID) {
      return res.status(200).json({
        Status: 900405,
        Description: "Operator ID Error",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const functionName = "GameResult";

    const signature = generateSignature(
      functionName,
      ResultId,
      RequestDateTime,
      epicWinOperatorID,
      epicWinSecret,
      PlayerId
    );

    if (signature !== Signature) {
      return res.status(200).json({
        Status: 900407,
        Description: "Invalid Signature",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const [currentUser, existingBet, existingTransaction] = await Promise.all([
      User.findOne({ gameId: PlayerId }, { wallet: 1, _id: 1 }).lean(),
      SlotEpicWinModal.findOne({ betId: BetId, bet: true }, { _id: 1 }).lean(),
      SlotEpicWinModal.findOne(
        { betId: BetId, $or: [{ settle: true }, { cancel: true }] },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        Status: 900404,
        Description: "Invalid player / password. Please try again",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        Status: 900415,
        Description: "Bet Transaction Not Found",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        Status: 900409,
        Description: "Duplicate Transaction",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const amount = new Decimal(Number(Payout)).toDecimalPlaces(4); // Keep as Decimal (not string)

    const finalOldBalance = new Decimal(
      Number(currentUser.wallet)
    ).toDecimalPlaces(4);

    const [updatedUserBalance] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: amount.toNumber() } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotEpicWinModal.findOneAndUpdate(
        { betId: BetId },
        { $set: { settle: true, settleamount: amount.toNumber() } },
        { upsert: true }
      ),
    ]);

    const finalBalance = new Decimal(
      Number(updatedUserBalance.wallet)
    ).toDecimalPlaces(4);

    return res.status(200).json({
      Status: 200,
      Description: "OK",
      ResponseDateTime: RequestDateTime,
      OldBalance: finalOldBalance.toNumber(),
      NewBalance: finalBalance.toNumber(),
    });
  } catch (error) {
    console.error(
      "EPICWIN: Error in game provider calling ae96 get game result api:",
      error.message
    );
    return res.status(200).json({
      Status: 900500,
      Description: "Internal Server Error",
      ResponseDateTime: getCurrentFormattedDate(),
      OldBalance: 0,
      NewBalance: 0,
    });
  }
});

router.post("/api/epicwins/Rollback", async (req, res) => {
  try {
    const {
      OperatorId,
      Signature,
      PlayerId,
      BetId,
      RequestDateTime,
      BetAmount,
    } = req.body;

    if (
      !OperatorId ||
      !Signature ||
      !PlayerId ||
      !BetId ||
      !RequestDateTime ||
      BetAmount === null ||
      BetAmount === undefined
    ) {
      return res.status(200).json({
        Status: 900406,
        Description: "Incoming Request Info Incomplete",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (OperatorId !== epicWinOperatorID) {
      return res.status(200).json({
        Status: 900405,
        Description: "Operator ID Error",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const functionName = "Rollback";

    const signature = generateSignature(
      functionName,
      BetId,
      RequestDateTime,
      epicWinOperatorID,
      epicWinSecret,
      PlayerId
    );

    if (signature !== Signature) {
      return res.status(200).json({
        Status: 900407,
        Description: "Invalid Signature",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const [currentUser, existingBet, existingTransaction] = await Promise.all([
      User.findOne({ gameId: PlayerId }, { wallet: 1, _id: 1 }).lean(),
      SlotEpicWinModal.findOne({ betId: BetId, bet: true }, { _id: 1 }).lean(),
      SlotEpicWinModal.findOne(
        { betId: BetId, $or: [{ settle: true }, { cancel: true }] },
        { _id: 1 }
      ).lean(),
    ]);
    if (!currentUser) {
      return res.status(200).json({
        Status: 900404,
        Description: "Invalid player / password. Please try again",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        Status: 900415,
        Description: "Bet Transaction Not Found",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        Status: 900409,
        Description: "Duplicate Transaction",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const amount = new Decimal(Number(BetAmount)).toDecimalPlaces(4); // Keeps as Decimal

    const finalOldBalance = new Decimal(
      Number(currentUser.wallet)
    ).toDecimalPlaces(4);

    const [updatedUserBalance] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: amount.toNumber() } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotEpicWinModal.findOneAndUpdate(
        { betId: BetId },
        { $set: { cancel: true } },
        { upsert: true, new: true }
      ),
    ]);

    const finalBalance = new Decimal(
      Number(updatedUserBalance.wallet)
    ).toDecimalPlaces(4);

    return res.status(200).json({
      Status: 200,
      Description: "OK",
      ResponseDateTime: RequestDateTime,
      OldBalance: finalOldBalance.toNumber(),
      NewBalance: finalBalance.toNumber(),
    });
  } catch (error) {
    console.error(
      "EPICWIN: Error in game provider calling ae96 get rollback api:",
      error.message
    );
    return res.status(200).json({
      Status: 900500,
      Description: "Internal Server Error",
      ResponseDateTime: getCurrentFormattedDate(),
      OldBalance: 0,
      NewBalance: 0,
    });
  }
});

router.post("/api/epicwins/CashBonus", async (req, res) => {
  try {
    const { OperatorId, Signature, PlayerId, RequestDateTime, Payout, TranId } =
      req.body;

    if (
      !OperatorId ||
      !Signature ||
      !PlayerId ||
      !RequestDateTime ||
      !TranId ||
      Payout === null ||
      Payout === undefined
    ) {
      return res.status(200).json({
        Status: 900406,
        Description: "Incoming Request Info Incomplete",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (OperatorId !== epicWinOperatorID) {
      return res.status(200).json({
        Status: 900405,
        Description: "Operator ID Error",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const functionName = "CashBonus";

    const signature = generateSignature(
      functionName,
      TranId,
      RequestDateTime,
      epicWinOperatorID,
      epicWinSecret,
      PlayerId
    );

    if (signature !== Signature) {
      return res.status(200).json({
        Status: 900407,
        Description: "Invalid Signature",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const [currentUser, existingTrans] = await Promise.all([
      User.findOne(
        { gameId: PlayerId },
        { wallet: 1, _id: 1, username: 1 }
      ).lean(),
      SlotEpicWinModal.findOne({ tranId: TranId }, { _id: 1 }).lean(),
    ]);
    if (!currentUser) {
      return res.status(200).json({
        Status: 900404,
        Description: "Invalid player / password. Please try again",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (existingTrans) {
      return res.status(200).json({
        Status: 900409,
        Description: "Duplicate Transaction",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const amount = new Decimal(Number(Payout)).toDecimalPlaces(4); // Ensures Decimal format

    const finalOldBalance = new Decimal(
      Number(currentUser.wallet)
    ).toDecimalPlaces(4);

    const [updatedUserBalance] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: amount.toNumber() } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotEpicWinModal.create({
        username: PlayerId,
        tranId: TranId,
        settle: true,
        bet: true,
        settleamount: amount.toNumber(),
      }),
    ]);

    const finalBalance = new Decimal(
      Number(updatedUserBalance.wallet)
    ).toDecimalPlaces(4);

    return res.status(200).json({
      Status: 200,
      Description: "OK",
      ResponseDateTime: RequestDateTime,
      OldBalance: finalOldBalance.toNumber(),
      NewBalance: finalBalance.toNumber(),
    });
  } catch (error) {
    console.error(
      "EPICWIN: Error in game provider calling ae96 get cashbonus api:",
      error.message
    );
    return res.status(200).json({
      Status: 900500,
      Description: "Internal Server Error",
      ResponseDateTime: getCurrentFormattedDate(),
      OldBalance: 0,
      NewBalance: 0,
    });
  }
});

router.post("/api/epicwins/Jackpot", async (req, res) => {
  try {
    const { OperatorId, Signature, PlayerId, RequestDateTime, Payout, TranId } =
      req.body;

    if (
      !OperatorId ||
      !Signature ||
      !PlayerId ||
      !RequestDateTime ||
      !TranId ||
      Payout === null ||
      Payout === undefined
    ) {
      return res.status(200).json({
        Status: 900406,
        Description: "Incoming Request Info Incomplete",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (OperatorId !== epicWinOperatorID) {
      return res.status(200).json({
        Status: 900405,
        Description: "Operator ID Error",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const functionName = "Jackpot";

    const signature = generateSignature(
      functionName,
      TranId,
      RequestDateTime,
      epicWinOperatorID,
      epicWinSecret,
      PlayerId
    );

    if (signature !== Signature) {
      return res.status(200).json({
        Status: 900407,
        Description: "Invalid Signature",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const [currentUser, existingTrans] = await Promise.all([
      User.findOne(
        { gameId: PlayerId },
        { wallet: 1, _id: 1, username: 1 }
      ).lean(),
      SlotEpicWinModal.findOne({ tranId: TranId }, { _id: 1 }).lean(),
    ]);
    if (!currentUser) {
      return res.status(200).json({
        Status: 900404,
        Description: "Invalid player / password. Please try again",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (existingTrans) {
      return res.status(200).json({
        Status: 900409,
        Description: "Duplicate Transaction",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const amount = new Decimal(Number(Payout)).toDecimalPlaces(4); // Ensures Decimal format

    const finalOldBalance = new Decimal(
      Number(currentUser.wallet)
    ).toDecimalPlaces(4);

    const [updatedUserBalance] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: amount.toNumber() } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotEpicWinModal.create({
        username: PlayerId,
        tranId: TranId,
        settle: true,
        bet: true,
        settleamount: amount.toNumber(),
      }),
    ]);

    const finalBalance = new Decimal(
      Number(updatedUserBalance.wallet)
    ).toDecimalPlaces(4);

    return res.status(200).json({
      Status: 200,
      Description: "OK",
      ResponseDateTime: RequestDateTime,
      OldBalance: finalOldBalance.toNumber(),
      NewBalance: finalBalance.toNumber(),
    });
  } catch (error) {
    console.error(
      "EPICWIN: Error in game provider calling ae96 get jackpot api:",
      error.message
    );
    return res.status(200).json({
      Status: 900500,
      Description: "Internal Server Error",
      ResponseDateTime: getCurrentFormattedDate(),
      OldBalance: 0,
      NewBalance: 0,
    });
  }
});

router.post("/api/epicwin/getturnoverforrebate", async (req, res) => {
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

    console.log("EPICWIN QUERYING TIME", startDate, endDate);

    const records = await SlotEpicWinModal.find({
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
        console.warn(`EPICwin User not found for gameId: ${gameId}`);
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
        gamename: "EPICWIN",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("EPICWIN: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "EPICWIN: Failed to fetch win/loss report",
        zh: "EPICWIN: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/epicwin/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotEpicWinModal.find({
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
        totalTurnover += record.betamount || 0;
        totalWinLoss += (record.settleamount || 0) - (record.betamount || 0);
      });

      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));
      // Return the aggregated results
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "EPICWIN",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("EPICWIN: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "EPICWIN: Failed to fetch win/loss report",
          zh: "EPICWIN: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/epicwin/:userId/gamedata",
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

          if (slotGames["EPICWIN"]) {
            totalTurnover += slotGames["EPICWIN"].turnover || 0;
            totalWinLoss += slotGames["EPICWIN"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "EPICWIN",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("EPICWIN: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "EPICWIN: Failed to fetch win/loss report",
          zh: "EPICWIN: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/epicwin/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotEpicWinModal.find({
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
        totalTurnover += record.betamount || 0;

        totalWinLoss += (record.betamount || 0) - (record.settleamount || 0);
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "EPICWIN",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("EPICWIN: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "EPICWIN: Failed to fetch win/loss report",
          zh: "EPICWIN: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/epicwin/kioskreport",
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

          if (liveCasino["EPICWIN"]) {
            totalTurnover += Number(liveCasino["EPICWIN"].turnover || 0);
            totalWinLoss += Number(liveCasino["EPICWIN"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "EPICWIN",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("EPICWIN: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "EPICWIN: Failed to fetch win/loss report",
          zh: "EPICWIN: 获取盈亏报告失败",
        },
      });
    }
  }
);

module.exports = router;
