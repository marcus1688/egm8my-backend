const express = require("express");
const router = express.Router();
const axios = require("axios");
const moment = require("moment");
const crypto = require("crypto");
const { authenticateToken } = require("../../auth/auth");
const { authenticateAdminToken } = require("../../auth/adminAuth");
const {
  User,
  adminUserWalletLog,
  GameDataLog,
} = require("../../models/users.model");
const { adminUser, adminLog } = require("../../models/adminuser.model");
const GameWalletLog = require("../../models/gamewalletlog.model");
const Decimal = require("decimal.js");
const SlotCQ9Modal = require("../../models/slot_cq9.model");
const GameCq9GameModal = require("../../models/slot_cq9Database.model");
const fs = require("fs");
const path = require("path");

require("dotenv").config();

const webURL = "https://www.bm8my.vip/";
const cq9APIURL = "https://apii.cqgame.cc";
const cq9API_KEY = process.env.CQ9_APIKEY;

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

function generateFormattedDateTime() {
  return moment.utc().add(8, "hours").format("YYYY-MM-DDTHH:mm:ss-04:00");
}

function isValidRFC3339DateTime(dateTimeString) {
  if (
    !dateTimeString ||
    typeof dateTimeString !== "string" ||
    dateTimeString.length > 35
  ) {
    return false;
  }

  // Use moment to validate the basic ISO format
  const isValidMoment = moment(dateTimeString, moment.ISO_8601, true).isValid();

  // RFC3339 requires timezone information - must end with 'Z' or timezone offset like '+05:00' or '-04:00'
  const hasRequiredTimezone = /[Z]$|[+-]\d{2}:\d{2}$/.test(dateTimeString);

  return isValidMoment && hasRequiredTimezone;
}

function errorResponse(code, message, currentTime) {
  return {
    data: null,
    status: {
      code,
      message,
      datetime: currentTime,
    },
  };
}

// async function updateBTGamingManualOrderTimestampsPlus() {
//   try {
//     // List of gameIDs in order (AB1541 = latest, AB1501 = oldest)
//     const gameIds = [
//       "52",
//       "7",
//       "AT01",
//       "133",
//       "31",
//       "179",
//       "AB3",
//       "105",
//       "GO06",
//       "137",
//       "64",
//       "181",
//       "111",
//       "10",
//       "99",
//       "127",
//       "50",
//       "208",
//       "117",
//       "160",
//       "109",
//       "AT05",
//       "GO02",
//       "207",
//       "GO05",
//       "188",
//       "89",
//       "BU01",
//       "108",
//       "180",
//       "69",
//       "242",
//       "138",
//       "113",
//       "140",
//       "123",
//       "246",
//       "9",
//       "205",
//       "241",
//       "116",
//       "147",
//       "158",
//       "182",
//       "BT03",
//       "152",
//       "74",
//       "230",
//       "5007",
//       "5008",
//       "GB11",
//       "183",
//       "173",
//       "15",
//       "24",
//       "79",
//       "8",
//       "124",
//       "GB14",
//       "153",
//       "186",
//       "54",
//       "227",
//       "161",
//       "216",
//       "115",
//       "131",
//       "201",
//       "224",
//       "125",
//       "177",
//       "58",
//       "29",
//       "83",
//       "60",
//       "16",
//       "229",
//       "157",
//       "225",
//       "143",
//       "203",
//       "BT02",
//       "142",
//       "68",
//       "196",
//       "33",
//       "1010",
//       "252",
//       "185",
//       "19",
//       "187",
//       "57",
//       "112",
//       "26",
//       "5009",
//       "128",
//       "202",
//       "154",
//       "39",
//       "163",
//       "228",
//       "GB13",
//       "139",
//       "5",
//       "231",
//       "194",
//       "150",
//       "70",
//       "197",
//       "121",
//       "219",
//       "GB9",
//       "72",
//       "209",
//       "146",
//       "220",
//       "67",
//       "GB16",
//       "211",
//       "GB6",
//       "171",
//       "195",
//       "GB12",
//       "148",
//       "223",
//       "135",
//       "61",
//       "12",
//       "253",
//       "129",
//       "3",
//       "46",
//       "1074",
//       "1",
//       "GB5",
//       "206",
//       "136",
//       "78",
//       "38",
//       "4",
//       "144",
//       "42",
//       "GB8",
//       "20",
//       "66",
//       "226",
//       "184",
//       "2",
//       "213",
//       "86",
//       "23",
//       "243",
//       "217",
//       "98",
//       "17",
//       "AR14",
//       "215",
//       "GB7",
//       "118",
//       "122",
//       "59",
//       "77",
//       "130",
//       "GO01",
//       "210",
//       "GO03",
//       "221",
//       "104",
//       "132",
//       "GB15",
//       "212",
//       "81",
//       "103",
//       "55",
//       "27",
//       "214",
//       "44",
//       "76",
//       "51",
//       "96",
//       "BU23",
//       "35",
//       "47",
//       "222",
//       "BU16",
//       "AR39",
//       "BU18",
//       "102",
//       "80",
//       "AR02",
//       "204",
//       "32",
//       "13",
//       "GB3",
//       "34",
//       "AR120",
//       "199",
//       "218",
//       "AR80",
//       "BU14",
//       "BU07",
//       "GB1",
//       "AR12",
//       "1067",
//       "92",
//       "49",
//       "141",
//       "21",
//       "AR11",
//       "GB10",
//       "BU04",
//       "CC15",
//       "BU03",
//       "AR81",
//       "22",
//       "BU12",
//       "AR16",
//       "AS10",
//       "CC01",
//       "GB2",
//       "AR107",
//       "AS04",
//       "AR01",
//       "AR03",
//       "BU05",
//       "95",
//       "BU26",
//       "AS33",
//       "BU19",
//       "BU02",
//       "AR24",
//       "BU31",
//       "AR33",
//       "AR09",
//       "AR23",
//       "AR17",
//       "BU32",
//       "AR28",
//       "AS01",
//       "AR29",
//       "AR13",
//       "36",
//       "BU08",
//       "AR20",
//       "CC09",
//       "BU24",
//       "AR08",
//       "AR05",
//       "CC07",
//       "AR22",
//       "BU22",
//       "CC03",
//       "GB198",
//       "BU27",
//       "BU21",
//       "AS18",
//       "AR25",
//       "1200",
//       "200",
//       "AR41",
//       "BU15",
//       "BU29",
//       "AR15",
//       "AR04",
//       "AR07",
//       "AR21",
//       "BU09",
//       "AR18",
//       "AS17",
//       "BU06",
//       "AR06",
//       "AS03",
//       "BU11",
//       "AS08",
//       "GO169",
//       "AR26",
//       "AS09",
//       "BU10",
//       "AS20",
//       "BU30",
//       "CC08",
//       "BU20",
//       "AS19",
//       "BU28",
//       "BU25",
//       "CC02",
//       "BU13",
//       "AR37",
//       "AS02",
//       "CA01",
//       "CE09",
//       "CE02",
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
//       const result = await GameCq9GameModal.collection.updateOne(
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
//     const updatedGames = await GameCq9GameModal.find(
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

router.post("/api/cq9/comparegame", async (req, res) => {
  try {
    const response = await axios.get(`${cq9APIURL}/gameboy/game/list/cq9`, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: cq9API_KEY,
      },
    });
    console.log(`${cq9APIURL}/gameboy/game/list/cq9`);
    console.log("Authorization", cq9API_KEY);
    console.log("hello", response.data);
    // Check if API response is successful
    if (!response.data || !response.data.data) {
      console.log("CQ9 error fetching game list:", response.data);
      return res.status(200).json({
        success: false,
        message: {
          en: "CQ9: Unable to retrieve game lists. Please contact customer service for assistance.",
          zh: "CQ9: 无法获取游戏列表，请联系客服以获取帮助。",
          ms: "CQ9: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "CQ9: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
          id: "CQ9: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    // Get all games from database
    const dbGames = await GameCq9GameModal.find({}, "gameID");

    // Extract game IDs from database
    const dbGameIds = new Set(dbGames.map((game) => game.gameID));

    // Extract games from API response
    const apiGames = response.data.data;
    const apiGameIds = new Set(apiGames.map((game) => game.gamecode));

    // Count totals
    const totalApiGames = apiGames.length;
    const totalDbGames = dbGames.length;

    // Find missing games (in API but not in database)
    const missingGames = apiGames.filter(
      (game) => !dbGameIds.has(game.gamecode)
    );

    // Find extra games (in database but not in API) and set maintenance to true
    const extraGameIds = [...dbGameIds].filter(
      (gameId) => !apiGameIds.has(gameId)
    );

    // Update extra games to maintenance: true
    if (extraGameIds.length > 0) {
      await GameCq9GameModal.updateMany(
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
      await GameCq9GameModal.updateMany(
        { gameID: { $in: activeGameIds } },
        { maintenance: false }
      );
      console.log(
        `Set maintenance: false for ${activeGameIds.length} games in API`
      );
    }

    // Return missing games with gametype and gamecode
    const missingGamesInfo = missingGames.map((game) => ({
      gamecode: game.gamecode,
      gametype: game.gametype,
      gamename: game.gamename,
      gamehall: game.gamehall,
      gametech: game.gametech,
      status: game.status,
      maintain: game.maintain,
      nameset: game.nameset,
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
    });
  } catch (error) {
    console.log("CQ9 error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "CQ9: Game launch failed. Please try again or customer service for assistance.",
        zh: "CQ9: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "CQ9: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "CQ9: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "CQ9: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/cq9/getprovidergamelist", async (req, res) => {
  try {
    const response = await axios.get(`${cq9APIURL}/gameboy/game/list/cq9`, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: cq9API_KEY,
      },
    });

    return res.status(200).json({
      success: true,
      gameLobby: response.data,
    });
  } catch (error) {
    console.log("CQ9 error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "CQ9: Game launch failed. Please try again or customer service for assistance.",
        zh: "CQ9: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "CQ9: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "CQ9: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "CQ9: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/cq9/getgamelist", async (req, res) => {
  try {
    const games = await GameCq9GameModal.find({
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
    console.error("Error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "CQ9: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "CQ9: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "CQ9: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "CQ9: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "CQ9: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/cq9/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, gameCode, clientPlatform, gameType } = req.body;

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

    const isLocked =
      gameType === "Fishing"
        ? user.gameLock?.cq9fish?.lock
        : user.gameLock?.cq9slot?.lock;

    if (isLocked) {
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

    let lang = "en";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "zh-cn";
    } else if (gameLang === "zh_hk") {
      lang = "zh-cn";
    } else if (gameLang === "ms") {
      lang = "id";
    } else if (gameLang === "id") {
      lang = "id";
    }

    let platform = "WEB";
    if (clientPlatform === "web") {
      platform = "WEB";
    } else if (clientPlatform === "mobile") {
      platform = "MOBILE";
    }

    const requestData = {
      account: user.gameId,
      gamehall: "cq9",
      gamecode: gameCode,
      gameplat: platform,
      lang,
      gamesite: webURL,
    };

    const response = await axios.post(
      `${cq9APIURL}/gameboy/player/sw/gamelink`,
      requestData,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: cq9API_KEY,
        },
      }
    );
    if (response.data.status.code !== "0") {
      console.log("CQ9 error in launching game", response.data);

      if (
        response.data.status.code === "23" ||
        response.data.status.code === "26"
      ) {
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
          en: "CQ9: Game launch failed. Please try again or contact customer service for assistance.",
          zh: "CQ9: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "CQ9: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "CQ9: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "CQ9: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "CQ9"
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data.data.url,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("CQ9 error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "CQ9: Game launch failed. Please try again or customer service for assistance.",
        zh: "CQ9: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "CQ9: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "CQ9: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "CQ9: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.get("/api/cq9my/player/check/:playerId", async (req, res) => {
  try {
    const playerId = req.params.playerId;

    const currentTime = generateFormattedDateTime();
    if (!playerId) {
      console.log("failed 1");
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }
    const verifyToken = req.headers.wtoken;
    if (cq9API_KEY !== verifyToken) {
      console.log("failed 2");
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }
    const currentUser = await User.findOne(
      { gameId: playerId },
      { _id: 1 }
    ).lean();
    return res.status(200).json({
      data: !!currentUser, // Convert to boolean
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.get("/api/cq9my/transaction/balance/:playerId", async (req, res) => {
  try {
    const playerId = req.params.playerId;

    const currentTime = generateFormattedDateTime();

    if (!playerId) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    const currentUser = await User.findOne(
      { gameId: playerId },
      { wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    const walletValue = Number(currentUser.wallet);

    return res.status(200).json({
      data: {
        balance: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    console.log(error.message);
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9my/transaction/game/bet", async (req, res) => {
  try {
    const { account, eventTime, gamehall, gamecode, roundid, amount, mtcode } =
      req.body;

    const currentTime = generateFormattedDateTime();

    if (
      !account ||
      !roundid ||
      !mtcode ||
      !eventTime ||
      !gamehall ||
      !gamecode ||
      amount === null ||
      amount === undefined
    ) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    if (amount < 0) {
      return res
        .status(200)
        .json(
          errorResponse(
            "1003",
            "Invalid amount: negative values are not allowed.",
            currentTime
          )
        );
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!isValidRFC3339DateTime(eventTime)) {
      return res
        .status(200)
        .json(errorResponse("1004", "Time Format error.", currentTime));
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne(
        { gameId: account },
        {
          _id: 1,
          wallet: 1,
          "gameLock.cq9slot.lock": 1,
          username: 1,
          gameId: 1,
        }
      ).lean(),

      SlotCQ9Modal.findOne({ betTranId: mtcode, bet: true }, { _id: 1 }).lean(),
    ]);
    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (currentUser.gameLock?.cq9slot?.lock) {
      return res
        .status(200)
        .json(
          errorResponse("1006", "This player has been disable.", currentTime)
        );
    }

    if (existingBet) {
      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    const betAmount = Number(amount); // Keeps as Decimal

    const toUpdateAmount = new Decimal(betAmount).toDecimalPlaces(4);

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: toUpdateAmount.toNumber() },
      },
      {
        $inc: { wallet: -toUpdateAmount.toNumber() },
      },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res
        .status(200)
        .json(errorResponse("1005", "Insufficient balance.", currentTime));
    }

    await SlotCQ9Modal.create({
      username: currentUser.gameId,
      betId: roundid,
      bet: true,
      betamount: toUpdateAmount.toNumber(),
      betTranId: mtcode,
      gametype: "SLOT",
    });

    const updatewalletValue = Number(updatedUserBalance.wallet);

    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    console.log("bet failed", error.message);
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9my/transaction/game/endround", async (req, res) => {
  try {
    const {
      account,
      roundid,
      gamehall,
      gamecode,
      createTime,
      freeticket,
      data: checkedData,
    } = req.body;
    const currentTime = generateFormattedDateTime();

    if (
      !account ||
      !roundid ||
      !checkedData ||
      !gamehall ||
      !gamecode ||
      !createTime
    ) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    let data = req.body.data;

    data = JSON.parse(data);

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!isValidRFC3339DateTime(createTime)) {
      return res
        .status(200)
        .json(errorResponse("1004", "Time Format error.", currentTime));
    }

    for (const item of data) {
      if (item.amount < 0) {
        return res
          .status(200)
          .json(
            errorResponse(
              "1003",
              "Invalid amount: negative values are not allowed.",
              currentTime
            )
          );
      }
    }

    const totalAmount = data.reduce(
      (sum, item) => sum + (Number(item.amount) || 0),
      0
    );

    const [currentUser, existingBet] = await Promise.all([
      User.findOne({ gameId: account }, { _id: 1, wallet: 1 }).lean(),
      SlotCQ9Modal.findOne({ betId: roundid, bet: true }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!freeticket) {
      if (!existingBet) {
        return res
          .status(200)
          .json(
            errorResponse("1014", "Transaction record not found.", currentTime)
          );
      }
    }

    const mtcodes = data.map((item) => item.mtcode).filter(Boolean);

    const existingSettleBet = await SlotCQ9Modal.findOne(
      { settleTranId: { $in: mtcodes }, settle: true },
      { _id: 1, endroundbalanceattime: 1 }
    ).lean();

    if (existingSettleBet) {
      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(
            existingSettleBet.endroundbalanceattime !== null &&
            existingSettleBet.endroundbalanceattime !== undefined
              ? existingSettleBet.endroundbalanceattime
              : walletValue
          )
            .toDecimalPlaces(4)
            .toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    const winAmount = Number(totalAmount); // Keeps as Decimal

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { _id: currentUser._id },
        {
          $inc: {
            wallet: new Decimal(winAmount).toDecimalPlaces(4).toNumber(),
          },
        },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      freeticket
        ? SlotCQ9Modal.create({
            username: currentUser.gameId,
            betId: roundid,
            bet: true,
            settle: true,
            betamount: 0,
            settleamount: new Decimal(winAmount).toDecimalPlaces(4).toNumber(),
            settleTranId: mtcodes,
            gametype: "SLOT",
          })
        : SlotCQ9Modal.updateOne(
            { betId: roundid },
            {
              $set: {
                settle: true,
                settleamount: new Decimal(winAmount)
                  .toDecimalPlaces(4)
                  .toNumber(),
                settleTranId: mtcodes,
              },
            }
          ),
    ]);

    const updatewalletValue = Number(updatedUserBalance.wallet);

    SlotCQ9Modal.updateMany(
      {
        betId: roundid,
      },
      {
        $set: {
          endroundbalanceattime: new Decimal(updatewalletValue)
            .toDecimalPlaces(4)
            .toNumber(),
          settle: true,
          settleTranId: mtcodes,
          username: account,
        },
      }
    ).catch((error) => {
      console.error("Error updating endroundbalanceattime:", error);
    });

    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9my/transaction/game/rollout", async (req, res) => {
  try {
    const { account, roundid, amount, mtcode, eventTime, gamehall, gamecode } =
      req.body;

    const currentTime = generateFormattedDateTime();

    if (
      !account ||
      !roundid ||
      !eventTime ||
      !gamehall ||
      !gamecode ||
      !mtcode ||
      amount === null ||
      amount === undefined
    ) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!isValidRFC3339DateTime(eventTime)) {
      return res
        .status(200)
        .json(errorResponse("1004", "Time Format error.", currentTime));
    }

    if (amount < 0) {
      return res
        .status(200)
        .json(
          errorResponse(
            "1003",
            "Invalid amount: negative values are not allowed.",
            currentTime
          )
        );
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne(
        { gameId: account },
        {
          _id: 1,
          wallet: 1,
          "gameLock.cq9fish.lock": 1,
          username: 1,
          gameId: 1,
        }
      ),
      SlotCQ9Modal.findOne(
        { rolloutTranId: mtcode, bet: true },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (currentUser.gameLock?.cq9fish?.lock) {
      return res
        .status(200)
        .json(
          errorResponse("1006", "This player has been disable.", currentTime)
        );
    }

    if (existingBet) {
      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    const betAmount = Number(amount); // Keeps as Decimal

    const toUpdateAmount = new Decimal(betAmount).toDecimalPlaces(4);

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: toUpdateAmount.toNumber() },
      },
      { $inc: { wallet: -toUpdateAmount.toNumber() } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res
        .status(200)
        .json(errorResponse("1005", "Insufficient balance.", currentTime));
    }

    await SlotCQ9Modal.create({
      username: currentUser.gameId,
      betId: roundid,
      bet: true,
      depositamount: toUpdateAmount.toNumber(),
      rolloutTranId: mtcode,
    });

    const updatewalletValue = Number(updatedUserBalance.wallet);

    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9my/transaction/game/takeall", async (req, res) => {
  try {
    const { account, roundid, mtcode, eventTime, gamehall, gamecode } =
      req.body;
    const currentTime = generateFormattedDateTime();

    if (
      !account ||
      !roundid ||
      !eventTime ||
      !gamehall ||
      !gamecode ||
      !mtcode
    ) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!isValidRFC3339DateTime(eventTime)) {
      return res
        .status(200)
        .json(errorResponse("1004", "Time Format error.", currentTime));
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne(
        { gameId: account },
        {
          _id: 1,
          wallet: 1,
          "gameLock.cq9fish.lock": 1,
          username: 1,
          gameId: 1,
        }
      ).lean(),

      SlotCQ9Modal.findOne(
        { takeallTransId: mtcode, bet: true },
        { betamount: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (currentUser.gameLock?.cq9fish?.lock) {
      return res
        .status(200)
        .json(
          errorResponse("1006", "This player has been disable.", currentTime)
        );
    }

    if (existingBet) {
      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          amount: existingBet.betamount,
          balance: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    const freshUserData = await User.findById(currentUser._id, {
      wallet: 1,
    }).lean();
    const freshwalletValue = Number(freshUserData.wallet);

    const Allbalance = new Decimal(freshwalletValue).toDecimalPlaces(4);
    const takeallAmount = Allbalance.toNumber();

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: takeallAmount },
      },
      { $inc: { wallet: -takeallAmount } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res
        .status(200)
        .json(errorResponse("1005", "Insufficient balance.", currentTime));
    }

    await SlotCQ9Modal.create({
      username: currentUser.gameId,
      betId: roundid,
      bet: true,
      depositamount: takeallAmount,
      takeallTransId: mtcode,
    });

    const updatewalletValue = Number(updatedUserBalance.wallet);

    return res.status(200).json({
      data: {
        amount: takeallAmount,
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9my/transaction/game/rollin", async (req, res) => {
  try {
    // Extract parameters
    const {
      account,
      eventTime,
      gamehall,
      gamecode,
      roundid,
      validbet,
      bet,
      win,
      roomfee = 0,
      amount,
      mtcode,
      createTime,
      rake,
      gametype,
      tableid,
    } = req.body;

    const currentTime = generateFormattedDateTime();

    // Validate required parameters
    if (
      !account ||
      !eventTime ||
      !gamehall ||
      !gamecode ||
      !roundid ||
      bet === undefined ||
      win === undefined ||
      amount === undefined ||
      !mtcode ||
      !createTime ||
      rake === undefined ||
      !gametype
    ) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    if (amount < 0) {
      return res
        .status(200)
        .json(
          errorResponse(
            "1003",
            "Invalid amount: negative values are not allowed.",
            currentTime
          )
        );
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!isValidRFC3339DateTime(eventTime)) {
      return res
        .status(200)
        .json(errorResponse("1004", "Time Format error.", currentTime));
    }

    const [currentUser, existingBet, existingTransaction] = await Promise.all([
      User.findOne({ gameId: account }, { _id: 1, wallet: 1 }).lean(),
      SlotCQ9Modal.findOne({ betId: roundid, bet: true }, { _id: 1 }).lean(),
      SlotCQ9Modal.findOne(
        { rollinTransId: mtcode, settle: true },
        { _id: 1, rollinbalanceattime: 1 }
      ).lean(),
    ]);
    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!existingBet) {
      return res
        .status(200)
        .json(
          errorResponse("1014", "Transaction record not found.", currentTime)
        );
    }

    if (existingTransaction) {
      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(
            existingTransaction.rollinbalanceattime !== null &&
            existingTransaction.rollinbalanceattime !== undefined
              ? existingTransaction.rollinbalanceattime
              : walletValue
          )
            .toDecimalPlaces(4)
            .toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }
    const rollinAmount = Number(amount);

    let betAmt = 0;
    if (["table", "live"].includes(gametype.toLowerCase())) {
      betAmt = validbet || 0;
    } else if (["fish", "arcade"].includes(gametype.toLowerCase())) {
      betAmt = bet || 0;
    }

    const finalBetAmount = new Decimal(Number(betAmt))
      .toDecimalPlaces(4)
      .toNumber();

    let winAmt = 0;
    if (win !== undefined && win !== "null") {
      if (new Decimal(win).greaterThanOrEqualTo(0)) {
        winAmt = new Decimal(win).toDecimalPlaces(4).toNumber();
      }
    }

    const finalWinAmount = new Decimal(Number(winAmt))
      .toDecimalPlaces(4)
      .toNumber();

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { _id: currentUser._id },
        {
          $inc: {
            wallet: new Decimal(rollinAmount || 0)
              .toDecimalPlaces(4)
              .toNumber(),
          },
        },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotCQ9Modal.updateOne(
        { betId: roundid },
        {
          $set: {
            settle: true,
            withdrawamount: new Decimal(rollinAmount || 0)
              .toDecimalPlaces(4)
              .toNumber(),
            betamount: finalBetAmount || 0,
            settleamount: finalWinAmount || 0,
            rollinTransId: mtcode,
            gametype: gametype.toUpperCase(),
          },
        }
      ),
    ]);

    const updatewalletValue = Number(updatedUserBalance.wallet);

    SlotCQ9Modal.updateMany(
      {
        betId: roundid,
      },
      {
        $set: {
          rollinbalanceattime: new Decimal(updatewalletValue)
            .toDecimalPlaces(4)
            .toNumber(),
          settle: true,
          rollinTransId: mtcode,
          gametype: gametype.toUpperCase(),
        },
      }
    ).catch((error) => {
      console.error("Error updating rollinbalanceattime:", error);
    });

    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    console.error("Error in CQ9 rollin:", error);
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9my/transaction/game/debit", async (req, res) => {
  try {
    const { account, roundid, amount, mtcode, eventTime, gamehall, gamecode } =
      req.body;
    const currentTime = generateFormattedDateTime();

    if (
      !account ||
      !roundid ||
      !mtcode ||
      !eventTime ||
      !gamehall ||
      !gamecode ||
      amount === null ||
      amount === undefined
    ) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    if (amount < 0) {
      return res
        .status(200)
        .json(
          errorResponse(
            "1003",
            "Invalid amount: negative values are not allowed.",
            currentTime
          )
        );
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!isValidRFC3339DateTime(eventTime)) {
      return res
        .status(200)
        .json(errorResponse("1004", "Time Format error.", currentTime));
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne(
        { gameId: account },
        { _id: 1, wallet: 1, username: 1, gameId: 1 }
      ).lean(),
      SlotCQ9Modal.findOne(
        { betTranId: mtcode, bet: true },
        { _id: 1, debitbalanceattime: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    // if (currentUser.gameLock?.cq9?.lock) {
    //   return res
    //     .status(200)
    //     .json(
    //       errorResponse("1006", "This player has been disable.", currentTime)
    //     );
    // }

    if (existingBet) {
      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(
            existingBet.debitbalanceattime !== null &&
            existingBet.debitbalanceattime !== undefined
              ? existingBet.debitbalanceattime
              : walletValue
          )
            .toDecimalPlaces(4)
            .toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    const betAmount = Number(amount); // Keeps as Decimal

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: new Decimal(betAmount).toDecimalPlaces(4).toNumber() },
      },
      {
        $inc: { wallet: -new Decimal(betAmount).toDecimalPlaces(4).toNumber() },
      },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res
        .status(200)
        .json(errorResponse("1005", "Insufficient balance.", currentTime));
    }

    await SlotCQ9Modal.create({
      username: currentUser.gameId,
      betId: roundid,
      bet: true,
      betamount: new Decimal(betAmount).toDecimalPlaces(4).toNumber(),
      betTranId: mtcode,
      debitbalanceattime: new Decimal(Number(updatedUserBalance.wallet))
        .toDecimalPlaces(4)
        .toNumber(),
    });

    const updatewalletValue = Number(updatedUserBalance.wallet);

    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9my/transaction/game/credit", async (req, res) => {
  try {
    const { account, roundid, amount, mtcode, eventTime, gamehall, gamecode } =
      req.body;
    const currentTime = generateFormattedDateTime();

    if (
      !account ||
      !roundid ||
      !eventTime ||
      !gamehall ||
      !gamecode ||
      !mtcode ||
      amount === null ||
      amount === undefined
    ) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    if (amount < 0) {
      return res
        .status(200)
        .json(
          errorResponse(
            "1003",
            "Invalid amount: negative values are not allowed.",
            currentTime
          )
        );
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!isValidRFC3339DateTime(eventTime)) {
      return res
        .status(200)
        .json(errorResponse("1004", "Time Format error.", currentTime));
    }

    const [currentUser, existingBet, existingSettleBet] = await Promise.all([
      User.findOne({ gameId: account }, { _id: 1, wallet: 1, username: 1 }),
      SlotCQ9Modal.findOne({ betId: roundid, bet: true }, { _id: 1 }).lean(),
      SlotCQ9Modal.findOne(
        { settleTranId: mtcode, settle: true },
        { _id: 1, creditbalanceattime: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!existingBet) {
      return res
        .status(200)
        .json(
          errorResponse("1014", "Transaction record not found.", currentTime)
        );
    }

    if (existingSettleBet) {
      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(
            existingSettleBet.creditbalanceattime !== null &&
            existingSettleBet.creditbalanceattime !== undefined
              ? existingSettleBet.creditbalanceattime
              : walletValue
          )
            .toDecimalPlaces(4)
            .toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    const winAmount = Number(amount);

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { _id: currentUser._id },
        {
          $inc: {
            wallet: new Decimal(winAmount).toDecimalPlaces(4).toNumber(),
          },
        },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
      SlotCQ9Modal.findOneAndUpdate(
        { betId: roundid },
        {
          $set: {
            settle: true,
            settleamount: new Decimal(winAmount).toDecimalPlaces(4).toNumber(),
            settleTranId: mtcode,
          },
        },
        { upsert: true }
      ),
    ]);

    const updatewalletValue = Number(updatedUserBalance.wallet);

    SlotCQ9Modal.updateMany(
      {
        betId: roundid,
      },
      {
        $set: {
          creditbalanceattime: new Decimal(updatewalletValue)
            .toDecimalPlaces(4)
            .toNumber(),
          settleTranId: mtcode,
          settle: true,
        },
      }
    ).catch((error) => {
      console.error("Error updating creditbalanceattime:", error);
    });

    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9my/transaction/user/payoff", async (req, res) => {
  try {
    const { account, mtcode, amount, eventTime } = req.body;
    const currentTime = generateFormattedDateTime();
    if (
      !account ||
      !eventTime ||
      !mtcode ||
      amount === null ||
      amount === undefined
    ) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }
    if (amount < 0) {
      return res
        .status(200)
        .json(
          errorResponse(
            "1003",
            "Invalid amount: negative values are not allowed.",
            currentTime
          )
        );
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!isValidRFC3339DateTime(eventTime)) {
      return res
        .status(200)
        .json(errorResponse("1004", "Time Format error.", currentTime));
    }

    const [currentUser, existingSettleBet] = await Promise.all([
      User.findOne(
        { gameId: account },
        { _id: 1, wallet: 1, username: 1, gameId: 1 }
      ).lean(),
      SlotCQ9Modal.findOne({ promoTransId: mtcode }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (existingSettleBet) {
      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    const winAmount = Number(amount);

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { _id: currentUser._id },
        {
          $inc: {
            wallet: new Decimal(winAmount).toDecimalPlaces(4).toNumber(),
          },
        },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
      SlotCQ9Modal.create({
        username: currentUser.gameId,
        promoTransId: mtcode,
        bet: true,
        settle: true,
        betamount: 0,
        settleamount: new Decimal(winAmount).toDecimalPlaces(4).toNumber(),
      }),
    ]);

    const updatewalletValue = Number(updatedUserBalance.wallet);

    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    console.log(error);
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9my/transaction/game/refund", async (req, res) => {
  try {
    const { account, mtcode } = req.body;
    const currentTime = generateFormattedDateTime();

    if (!account || !mtcode) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    const currentUser = await User.findOne(
      { gameId: account },
      { _id: 1, wallet: 1, username: 1 }
    ).lean();

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    const existingBet = await SlotCQ9Modal.findOne(
      {
        $or: [
          { betTranId: mtcode },
          { betId: mtcode },
          { takeallTransId: mtcode },
          { rolloutTranId: mtcode },
        ],
        bet: true,
      },
      { betamount: 1, depositamount: 1 }
    ).lean();

    if (!existingBet) {
      return res
        .status(200)
        .json(
          errorResponse("1014", "Transaction record not found.", currentTime)
        );
    }

    const existingCancelBet = await SlotCQ9Modal.findOne(
      {
        $or: [
          { betTranId: mtcode },
          { betId: mtcode },
          { takeallTransId: mtcode },
          { rolloutTranId: mtcode },
        ],
        refund: true,
      },
      { _id: 1, balanceattime: 1 }
    ).lean();

    if (existingCancelBet) {
      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(
            existingCancelBet.balanceattime !== null &&
            existingCancelBet.balanceattime !== undefined
              ? existingCancelBet.balanceattime
              : walletValue
          )
            .toDecimalPlaces(4)
            .toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    const isRolloutTransaction = await SlotCQ9Modal.findOne(
      {
        $or: [{ takeallTransId: mtcode }, { rolloutTranId: mtcode }],
        bet: true,
      },
      { _id: 1 }
    ).lean();

    let refundAmountValue;
    if (isRolloutTransaction) {
      // If found by rolloutTranId, use depositamount
      refundAmountValue = Number(existingBet.depositamount || 0);
    } else {
      // Otherwise, use betamount
      refundAmountValue = Number(existingBet.betamount || 0);
    }

    const refundAmount = new Decimal(refundAmountValue).toDecimalPlaces(4);

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { _id: currentUser._id },
        { $inc: { wallet: refundAmount.toNumber() } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
      SlotCQ9Modal.updateOne(
        {
          $or: [
            { betTranId: mtcode },
            { betId: mtcode },
            { takeallTransId: mtcode },
            { rolloutTranId: mtcode },
          ],
        },
        { $set: { refund: true, refundAmount: refundAmount.toNumber() } }
      ),
    ]);

    const updatewalletValue = Number(updatedUserBalance.wallet);

    SlotCQ9Modal.updateMany(
      {
        $or: [
          { betTranId: mtcode },
          { betId: mtcode },
          { takeallTransId: mtcode },
          { rolloutTranId: mtcode },
        ],
      },
      {
        $set: {
          balanceattime: new Decimal(updatewalletValue)
            .toDecimalPlaces(4)
            .toNumber(),
          refund: true,
        },
      }
    ).catch((error) => {
      console.error("Error updating balanceattime:", error);
    });

    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9my/transaction/game/bets", async (req, res) => {
  try {
    // Extract parameters from request body
    const { account, gamehall, gamecode, data, createTime } = req.body;
    const currentTime = generateFormattedDateTime();

    // Validate required parameters
    if (
      !account ||
      !data ||
      !Array.isArray(data) ||
      !gamehall ||
      !gamecode ||
      !createTime
    ) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!isValidRFC3339DateTime(createTime)) {
      return res
        .status(200)
        .json(errorResponse("1004", "Time Format error.", currentTime));
    }

    const currentUser = await User.findOne(
      { gameId: account },
      { _id: 1, wallet: 1, "gameLock.cq9slot.lock": 1, username: 1, gameId: 1 }
    ).lean();

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (currentUser.gameLock?.cq9slot?.lock) {
      return res
        .status(200)
        .json(
          errorResponse("1006", "This player has been disable.", currentTime)
        );
    }

    const mtcodes = data.map((item) => item.mtcode);
    const existingTransactions = await SlotCQ9Modal.find(
      { betTranId: { $in: mtcodes }, bet: true },
      { _id: 1 }
    ).lean();

    // If any transactions already exist, return the current balance without deducting anything
    if (existingTransactions.length > 0) {
      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    // Calculate total amount to deduct
    let totalAmount = new Decimal(0);
    for (const item of data) {
      totalAmount = totalAmount.plus(new Decimal(item.amount));
    }

    const toUpdateAmount = totalAmount.toDecimalPlaces(4);

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: toUpdateAmount.toNumber() },
      },
      { $inc: { wallet: -toUpdateAmount.toNumber() } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res
        .status(200)
        .json(errorResponse("1005", "Insufficient balance.", currentTime));
    }

    const betRecords = data.map((item) => ({
      username: account,
      betTranId: item.mtcode,
      bet: true,
      betamount: new Decimal(Number(item.amount)).toDecimalPlaces(4).toNumber(),
      betId: item.roundid,
    }));

    await SlotCQ9Modal.insertMany(betRecords);

    const updatewalletValue = Number(updatedUserBalance.wallet);

    // Return successful response
    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    console.error("Error in CQ9 batch bets:", error);
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9my/transaction/game/refunds", async (req, res) => {
  try {
    const { mtcode } = req.body;
    const currentTime = generateFormattedDateTime();

    if (!mtcode || !Array.isArray(mtcode) || mtcode.length === 0) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    // Find all bet transactions with the provided mtcodes
    const betTransactions = await SlotCQ9Modal.find(
      { betTranId: { $in: mtcode }, bet: true },
      { username: 1, betamount: 1 }
    ).lean();

    // Check if all mtcodes were found
    if (betTransactions.length !== mtcode.length) {
      return res
        .status(200)
        .json(
          errorResponse("1014", "Transaction record not found.", currentTime)
        );
    }

    // Check if any transactions are already refunded
    const refundedTransactions = await SlotCQ9Modal.find(
      { betTranId: { $in: mtcode }, refund: true },
      { _id: 1 }
    ).lean();

    const username = betTransactions[0].username;

    // If all transactions are already refunded, return success without changing balance
    if (refundedTransactions.length === mtcode.length) {
      const currentUser = await User.findOne(
        { gameId: username },
        { wallet: 1 }
      ).lean();

      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    // Calculate total amount to refund
    let totalAmount = new Decimal(0);
    for (const transaction of betTransactions) {
      totalAmount = totalAmount.plus(new Decimal(transaction.betamount || 0));
    }

    const currentUser = await User.findOne(
      { gameId: username },
      { _id: 1, wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { _id: currentUser._id },
        {
          $inc: {
            wallet: new Decimal(totalAmount).toDecimalPlaces(4).toNumber(),
          },
        },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotCQ9Modal.updateMany(
        { betTranId: { $in: mtcode } },
        { $set: { refund: true } }
      ),
    ]);

    const updatewalletValue = Number(updatedUserBalance.wallet);

    // Return successful response
    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    console.error("Error in CQ9 batch refunds:", error);
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

// Cancel Endpoint (for Sports and Lotto)
router.post("/api/cq9my/transaction/game/cancel", async (req, res) => {
  try {
    // Extract parameters from request body
    const { mtcode } = req.body;
    const currentTime = generateFormattedDateTime();

    // Validate required parameters
    if (!mtcode || !Array.isArray(mtcode) || mtcode.length === 0) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    // Find all refund transactions with the provided mtcodes
    const refundTransactions = await SlotCQ9Modal.find(
      { betTranId: { $in: mtcode }, refund: true },
      { username: 1, refundAmount: 1, _id: 1 }
    ).lean();

    if (refundTransactions.length !== mtcode.length) {
      return res
        .status(200)
        .json(
          errorResponse("1014", "Transaction record not found.", currentTime)
        );
    }

    const cancelledTransactions = await SlotCQ9Modal.find(
      { betTranId: { $in: mtcode }, cancelRefund: true },
      { _id: 1 }
    ).lean();

    const username = refundTransactions[0].username;

    // If all refunds are already cancelled, return success without changing balance
    if (cancelledTransactions.length === mtcode.length) {
      const currentUser = await User.findOne(
        { gameId: username },
        { wallet: 1 }
      ).lean();

      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    // Calculate total amount to cancel (deduct from user again)
    let totalAmount = new Decimal(0);
    for (const transaction of refundTransactions) {
      totalAmount = totalAmount.plus(
        new Decimal(transaction.refundAmount || 0)
      );
    }

    const currentUser = await User.findOne(
      { gameId: username },
      { _id: 1, wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: {
          $gte: new Decimal(totalAmount).toDecimalPlaces(4).toNumber(),
        },
      },
      {
        $inc: {
          wallet: -new Decimal(totalAmount).toDecimalPlaces(4).toNumber(),
        },
      },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res
        .status(200)
        .json(errorResponse("1005", "Insufficient balance.", currentTime));
    }

    await SlotCQ9Modal.updateMany(
      { _id: { $in: refundTransactions.map((t) => t._id) } },
      {
        $set: {
          cancelRefund: true,
          refund: false,
        },
      }
    );

    const updatewalletValue = Number(updatedUserBalance.wallet);

    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    console.error("Error in CQ9 batch cancel:", error);
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9my/transaction/game/wins", async (req, res) => {
  try {
    const { list } = req.body;
    const currentTime = generateFormattedDateTime();

    if (!list || !Array.isArray(list) || list.length === 0) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    const successResults = [];
    const failedResults = [];

    // Process each batch (user) in the list
    for (const batch of list) {
      const { account, ucode, event } = batch;

      if (!account || !ucode || !event || !Array.isArray(event)) {
        failedResults.push({
          account: account || "unknown",
          code: "1003",
          message: "Parameter error.",
          ucode: ucode || "unknown",
        });
        continue;
      }

      // Find the user
      const currentUser = await User.findOne(
        { gameId: account },
        { _id: 1, wallet: 1 }
      ).lean();
      if (!currentUser) {
        failedResults.push({
          account,
          code: "1006",
          message: "Player not found.",
          ucode,
        });
        continue;
      }

      // Collect all mtcodes to check for existing transactions
      const mtcodes = event.map((item) => item.mtcode);
      const existingTransactions = await SlotCQ9Modal.find(
        { betTranId: { $in: mtcodes }, settle: true },
        { _id: 1 }
      ).lean();

      // If all transactions already exist, return success without updating balance
      if (existingTransactions.length === event.length) {
        const walletValue = Number(currentUser.wallet);

        successResults.push({
          account,
          balance: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
          currency: "MYR",
          ucode,
        });
        continue;
      }

      // Calculate total amount to add
      let totalAmount = new Decimal(0);
      for (const item of event) {
        totalAmount = totalAmount.plus(new Decimal(item.amount || 0));
      }

      const toUpdateAmount = totalAmount.toDecimalPlaces(4);

      // Update user balance
      const updatedUserBalance = await User.findOneAndUpdate(
        { _id: currentUser._id },
        { $inc: { wallet: toUpdateAmount.toNumber() } },
        { new: true, projection: { wallet: 1 } }
      ).lean();

      const updatePromises = event.map((item) =>
        SlotCQ9Modal.updateOne(
          { betTranId: item.mtcode },
          {
            $set: {
              settle: true,
              settleamount: new Decimal(Number(item.amount))
                .toDecimalPlaces(4)
                .toNumber(),
            },
          }
        )
      );
      await Promise.all(updatePromises);

      const updatewalletValue = Number(updatedUserBalance.wallet);

      successResults.push({
        account,
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
        ucode,
      });
    }

    return res.status(200).json({
      data: {
        success: successResults,
        failed: failedResults,
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    console.error("Error in CQ9 wins:", error);
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

// Route to handle batch amends (for multiple players)
router.post("/api/cq9my/transaction/game/amends", async (req, res) => {
  try {
    const { list } = req.body;
    const currentTime = generateFormattedDateTime();

    if (!list || !Array.isArray(list) || list.length === 0) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    const successResults = [];
    const failedResults = [];

    // Process each batch (user) in the list
    for (const batch of list) {
      const { account, ucode, event, amount, action } = batch;

      if (
        !account ||
        !ucode ||
        !event ||
        !Array.isArray(event) ||
        amount === undefined ||
        !action
      ) {
        failedResults.push({
          account: account || "unknown",
          code: "1003",
          message: "Parameter error.",
          ucode: ucode || "unknown",
        });
        continue;
      }

      // Validate amount is not negative
      if (amount < 0) {
        failedResults.push({
          account,
          code: "1003",
          message: "Invalid amount: negative values are not allowed.",
          ucode,
        });
        continue;
      }

      // Find the user
      const currentUser = await User.findOne(
        { gameId: account },
        { _id: 1, wallet: 1 }
      ).lean();
      if (!currentUser) {
        failedResults.push({
          account,
          code: "1006",
          message: "Player not found.",
          ucode,
        });
        continue;
      }

      const mtcodes = event.map((item) => item.mtcode);
      // Check if this amend operation already exists
      const existingAmend = await SlotCQ9Modal.findOne(
        { betTranId: { $in: mtcodes }, amend: true },
        { _id: 1 }
      ).lean();

      const walletValue = Number(currentUser.wallet);

      if (existingAmend) {
        successResults.push({
          account,
          currency: "MYR",
          before: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
          balance: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
          ucode,
        });
        continue;
      }

      const toUpdateAmount = new Decimal(amount).toDecimalPlaces(4);

      const balanceBefore = new Decimal(walletValue)
        .toDecimalPlaces(4)
        .toNumber();

      let updatedUserBalance;

      if (action.toLowerCase() === "debit") {
        // For debit, we need to ensure user has sufficient balance
        updatedUserBalance = await User.findOneAndUpdate(
          {
            _id: currentUser._id,
            wallet: { $gte: toUpdateAmount.toNumber() },
          },
          { $inc: { wallet: -toUpdateAmount.toNumber() } },
          { new: true, projection: { wallet: 1 } }
        ).lean();

        // If update failed, the user didn't have sufficient balance
        if (!updatedUserBalance) {
          failedResults.push({
            account,
            code: "1005",
            message: "Insufficient balance.",
            ucode,
          });
          continue;
        }
      } else if (action.toLowerCase() === "credit") {
        // For credit, no need to check balance
        updatedUserBalance = await User.findOneAndUpdate(
          { _id: currentUser._id },
          { $inc: { wallet: toUpdateAmount.toNumber() } },
          { new: true, projection: { wallet: 1 } }
        ).lean();
      }

      // Record each event item as a separate transaction and update existing records
      const updatePromises = event.map((item) => {
        const {
          mtcode,
          amount: itemAmount,
          action: itemAction,
          roundid,
          eventtime: itemEventTime,
          validbet,
          gamecode: itemGameCode,
        } = item;

        if (!mtcode || !itemAmount || !itemAction) {
          return Promise.resolve();
        }

        // Different updates based on action type
        if (itemAction.toLowerCase() === "credit") {
          return SlotCQ9Modal.updateMany(
            { betId: roundid },
            {
              $set: {
                settle: true,
                amend: true,
                settleamount: new Decimal(itemAmount)
                  .toDecimalPlaces(4)
                  .toNumber(),
              },
            }
          );
        } else if (itemAction.toLowerCase() === "debit") {
          return SlotCQ9Modal.updateMany(
            { betId: roundid },
            {
              $set: {
                bet: true,
                amend: true,
                betamount: new Decimal(itemAmount)
                  .toDecimalPlaces(4)
                  .toNumber(),
              },
            }
          );
        }

        return Promise.resolve();
      });

      await Promise.all(updatePromises);
      // Add to success results
      const updatewalletValue = Number(updatedUserBalance.wallet);

      successResults.push({
        account,
        currency: "MYR",
        before: balanceBefore,
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        ucode,
      });
    }

    return res.status(200).json({
      data: {
        success: successResults,
        failed: failedResults,
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    console.error("Error in CQ9 amends:", error);
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9my/transaction/game/amend", async (req, res) => {
  try {
    const { account, action, amount, data } = req.body;
    const verifyToken = req.headers.wtoken;
    const currentTime = generateFormattedDateTime();

    // Early validation
    if (
      !account ||
      !action ||
      amount === undefined ||
      !data ||
      !Array.isArray(data)
    ) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (amount < 0) {
      return res
        .status(200)
        .json(
          errorResponse(
            "1003",
            "Invalid amount: negative values are not allowed.",
            currentTime
          )
        );
    }

    // Find the user
    const currentUser = await User.findOne(
      { gameId: account },
      { _id: 1, wallet: 1 }
    ).lean();
    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    const mtcodes = data.map((item) => item.mtcode);
    const existingAmend = await SlotCQ9Modal.findOne(
      { betTranId: { $in: mtcodes }, amend: true },
      { _id: 1 }
    ).lean();

    if (existingAmend) {
      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    const toUpdateAmount = new Decimal(amount).toDecimalPlaces(4);

    let updatedUserBalance;
    if (action.toLowerCase() === "debit") {
      updatedUserBalance = await User.findOneAndUpdate(
        {
          _id: currentUser._id,
          wallet: { $gte: toUpdateAmount.toNumber() },
        },
        { $inc: { wallet: -toUpdateAmount.toNumber() } },
        { new: true, projection: { wallet: 1 } }
      ).lean();

      // If update failed, the user didn't have sufficient balance
      if (!updatedUserBalance) {
        return res
          .status(200)
          .json(errorResponse("1005", "Insufficient balance.", currentTime));
      }
    } else if (action.toLowerCase() === "credit") {
      // For credit, no need to check balance
      updatedUserBalance = await User.findOneAndUpdate(
        { _id: currentUser._id },
        { $inc: { wallet: toUpdateAmount.toNumber() } },
        { new: true, projection: { wallet: 1 } }
      ).lean();
    }

    const updatePromises = data.map((item) => {
      const { mtcode, amount: itemAmount, action: itemAction, roundid } = item;

      if (!mtcode || !itemAmount || !itemAction) {
        return Promise.resolve();
      }

      // Different updates based on action type
      if (itemAction.toLowerCase() === "credit") {
        return SlotCQ9Modal.updateMany(
          { betTranId: mtcode },
          {
            $set: {
              settle: true,
              amend: true,
              settleamount: new Decimal(itemAmount)
                .toDecimalPlaces(4)
                .toNumber(),
            },
          }
        );
      } else if (itemAction.toLowerCase() === "debit") {
        return SlotCQ9Modal.updateMany(
          { betTranId: mtcode },
          {
            $set: {
              bet: true,
              amend: true,
              betamount: new Decimal(itemAmount).toDecimalPlaces(4).toNumber(),
            },
          }
        );
      }

      return Promise.resolve();
    });

    await Promise.all(updatePromises);
    const updatewalletValue = Number(updatedUserBalance.wallet);

    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    console.error("Error in CQ9 amend:", error);
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.all("/api/cq9my/transaction/*", async (req, res) => {
  // Check if this is a valid route that should exist but has issues
  const path = req.path;
  console.log("Unmatched CQ9 route:", path, req.method);

  const currentTime = generateFormattedDateTime();
  return res
    .status(200)
    .json(errorResponse("1002", "Route not found.", currentTime));
});

// ----------------
router.post("/api/cq9slot/getturnoverforrebate", async (req, res) => {
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

    console.log("CQ9 SLOT QUERYING TIME", startDate, endDate);

    const records = await SlotCQ9Modal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "SLOT",
      cancel: { $ne: true },
      refund: { $ne: true },
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
        console.warn(`CQ9 User not found for gameId: ${gameId}`);
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
        gamename: "CQ9",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("CQ9: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "CQ9: Failed to fetch win/loss report",
        zh: "CQ9: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/cq9slot/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotCQ9Modal.find({
        username: user.gameId,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "SLOT",
        cancel: { $ne: true },
        refund: { $ne: true },
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
          gamename: "CQ9",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("CQ9: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "CQ9: Failed to fetch win/loss report",
          zh: "CQ9: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/cq9slot/:userId/gamedata",
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

          if (gameCat["CQ9"]) {
            totalTurnover += gameCat["CQ9"].turnover || 0;
            totalWinLoss += gameCat["CQ9"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "CQ9",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("CQ9: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "CQ9: Failed to fetch win/loss report",
          zh: "CQ9: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/cq9slot/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotCQ9Modal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "SLOT",
        cancel: { $ne: true },
        refund: { $ne: true },
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
          gamename: "CQ9",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("CQ9: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "CQ9: Failed to fetch win/loss report",
          zh: "CQ9: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/cq9slot/kioskreport",
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

          if (gameCat["CQ9"]) {
            totalTurnover += Number(gameCat["CQ9"].turnover || 0);
            totalWinLoss += Number(gameCat["CQ9"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "CQ9",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("CQ9: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "CQ9: Failed to fetch win/loss report",
          zh: "CQ9: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ----------------
router.post("/api/cq9fish/getturnoverforrebate", async (req, res) => {
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

    console.log("CQ9 FISH QUERYING TIME", startDate, endDate);

    const records = await SlotCQ9Modal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "FISH",
      cancel: { $ne: true },
      refund: { $ne: true },
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
        gamename: "CQ9",
        gamecategory: "Fishing",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("CQ9: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "CQ9: Failed to fetch win/loss report",
        zh: "CQ9: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/cq9fish/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotCQ9Modal.find({
        username: user.gameId,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "FISH",
        cancel: { $ne: true },
        refund: { $ne: true },
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
          gamename: "CQ9",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("CQ9: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "CQ9: Failed to fetch win/loss report",
          zh: "CQ9: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/cq9fish/:userId/gamedata",
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

          if (gameCat["CQ9"]) {
            totalTurnover += gameCat["CQ9"].turnover || 0;
            totalWinLoss += gameCat["CQ9"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "CQ9",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("CQ9: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "CQ9: Failed to fetch win/loss report",
          zh: "CQ9: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/cq9fish/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotCQ9Modal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "FISH",
        cancel: { $ne: true },
        refund: { $ne: true },
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
          gamename: "CQ9",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("CQ9: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "CQ9: Failed to fetch win/loss report",
          zh: "CQ9: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/cq9fish/kioskreport",
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

          if (gameCat["CQ9"]) {
            totalTurnover += Number(gameCat["CQ9"].turnover || 0);
            totalWinLoss += Number(gameCat["CQ9"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "CQ9",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("CQ9: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "CQ9: Failed to fetch win/loss report",
          zh: "CQ9: 获取盈亏报告失败",
        },
      });
    }
  }
);
module.exports = router;
