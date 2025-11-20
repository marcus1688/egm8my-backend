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
const SlotJiliModal = require("../../models/slot_jili.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const qs = require("querystring");
const GameWalletLog = require("../../models/gamewalletlog.model");
const GameJILIGameModal = require("../../models/slot_jiliDatabase.model");

require("dotenv").config();

const jiliAgentId = "TitanSW59MMK_EGM8MYR";
const jiliKey = process.env.JILI_SECRET;
const webURL = "https://www.bm8my.vip/";
const jiliAPIURL = "https://wb-api-2.jismk2u.com/api1";

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

router.post("/api/jili/comparegame", async (req, res) => {
  try {
    const fields = {
      AgentId: jiliAgentId,
    };

    const hash = generateSignature(fields, jiliAgentId, jiliKey);

    const requestData = new URLSearchParams({
      ...fields,
      HomeUrl: webURL,
      Key: hash,
    }).toString();

    const response = await axios.post(
      `${jiliAPIURL}/GetGameList`,
      requestData,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    console.log(response.data);

    // Check if API response is successful
    if (response.data.ErrorCode !== 0) {
      console.log("JILI error fetching game list:", response.data);
      return res.status(200).json({
        success: false,
        message: {
          en: "JILI: Unable to retrieve game lists. Please contact customer service for assistance.",
          zh: "JILI: 无法获取游戏列表，请联系客服以获取帮助。",
          ms: "JILI: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "JILI: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
          id: "JILI: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    // Get all games from database
    const dbGames = await GameJILIGameModal.find({}, "gameID");

    // Extract game IDs from database
    const dbGameIds = new Set(dbGames.map((game) => game.gameID));

    // Extract games from API response - convert GameId to string for comparison
    const apiGames = response.data.Data;
    const apiGameIds = new Set(apiGames.map((game) => game.GameId.toString()));

    // Count totals
    const totalApiGames = apiGames.length;
    const totalDbGames = dbGames.length;

    // Find missing games (in API but not in database)
    const missingGames = apiGames.filter(
      (game) => !dbGameIds.has(game.GameId.toString())
    );

    // Find extra games (in database but not in API) and set maintenance to true
    const extraGameIds = [...dbGameIds].filter(
      (gameId) => !apiGameIds.has(gameId)
    );

    // Update extra games to maintenance: true
    if (extraGameIds.length > 0) {
      await GameJILIGameModal.updateMany(
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
      await GameJILIGameModal.updateMany(
        { gameID: { $in: activeGameIds } },
        { maintenance: false }
      );
      console.log(
        `Set maintenance: false for ${activeGameIds.length} games in API`
      );
    }

    // Return missing games with GameId and game details
    const missingGamesInfo = missingGames.map((game) => ({
      GameId: game.GameId,
      name: game.name,
      GameCategoryId: game.GameCategoryId,
      lobbyGameType: game.lobbyGameType,
      JP: game.JP,
      Freespin: game.Freespin,
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
    console.log("JILI error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "JILI: Game launch failed. Please try again or customer service for assistance.",
        zh: "JILI: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "JILI: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "JILI: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "JILI: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/jili/getprovidergame", async (req, res) => {
  try {
    const fields = {
      AgentId: jiliAgentId,
    };

    const hash = generateSignature(fields, jiliAgentId, jiliKey);

    const requestData = new URLSearchParams({
      ...fields,
      HomeUrl: webURL,
      Key: hash,
    }).toString();

    const response = await axios.post(
      `${jiliAPIURL}/GetGameList`,
      requestData,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    console.log(response.data);

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
    console.log("JILI error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "JILI: Game launch failed. Please try again or customer service for assistance.",
        zh: "JILI: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "JILI: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "JILI: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "JILI: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

// async function updateJILIGamingManualOrderTimestamps() {
//   try {
//     // List of game names in order (Royal Fishing = latest, Cash Coin = oldest)
//     const gameNames = [
//       "Royal Fishing",
//       "Bombing Fishing",
//       "Dinosaur Tycoon",
//       "Jackpot Fishing",
//       "Dragon Fortune",
//       "Mega Fishing",
//       "Boom Legend",
//       "Happy Fishing",
//       "All-star Fishing",
//       "Dinosaur Tycoon II",
//       "Ocean King Jackpot",
//       "Fortune King Jackpot",
//       "FORTUNE ZOMBIE",
//       "Chin Shi Huang",
//       "War Of Dragons",
//       "Fortune Tree",
//       "Lucky Ball",
//       "Hyper Burst",
//       "Shanghai Beauty",
//       "Fa Fa Fa",
//       "God Of Martial",
//       "SevenSevenSeven",
//       "Crazy777",
//       "Bubble Beauty",
//       "Night City",
//       "Bao boon chin",
//       "Crazy FaFaFa",
//       "XiYangYang",
//       "FortunePig",
//       "Diamond Party",
//       "Candy Baby",
//       "Hawaii Beauty",
//       "Fengshen",
//       "Golden Bank",
//       "Lucky Goldbricks",
//       "Dragon Treasure",
//       "Charge Buffalo",
//       "Super Ace",
//       "Golden Queen",
//       "Money Coming",
//       "Jungle King",
//       "Boxing King",
//       "Secret Treasure",
//       "Pharaoh Treasure",
//       "Lucky Coming",
//       "Super Rich",
//       "Roma X",
//       "Golden Empire",
//       "Fortune Gems",
//       "Crazy Hunter",
//       "Party Night",
//       "Magic Lamp",
//       "Agent Ace",
//       "TWIN WINS",
//       "Ali Baba",
//       "Mega Ace",
//       "Lucky Lady",
//       "Medusa",
//       "Book of Gold",
//       "Thor X",
//       "Happy Taxi",
//       "Gold Rush",
//       "Mayan Empire",
//       "Crazy Pusher",
//       "Bone Fortune",
//       "JILI CAISHEN",
//       "Bonus Hunter",
//       "World Cup",
//       "Samba",
//       "Neko Fortune",
//       "Wild Racer",
//       "Pirate Queen",
//       "Golden Joker",
//       "Wild Ace",
//       "Master Tiger",
//       "Fortune Gems 2",
//       "Sweet Land",
//       "Cricket King 18",
//       "Irish Elf",
//       "Cricket Sah 75",
//       "Golden Temple",
//       "Devil Fire",
//       "Bangla Beauty",
//       "Aztec Priestess",
//       "Fortune Monkey",
//       "Dabanggg",
//       "Sin City",
//       "King Arthur",
//       "Charge Buffalo Ascent",
//       "Witches Night",
//       "Arena Fighter",
//       "Trial of Phoenix",
//       "Devil Fire 2",
//       "Zeus",
//       "Jackpot Joker",
//       "Fortune Gems 3",
//       "3 Coin Treasures",
//       "Potion Wizard",
//       "Crazy Hunter 2",
//       "The Pig House",
//       "Legacy of Egypt",
//       "Super Ace Deluxe",
//       "Money Coming Expanded Bets",
//       "Party Star",
//       "Egypt's Glow",
//       "3 Lucky Piggy",
//       "Poseidon",
//       "3 Pot Dragons",
//       "Money Pot",
//       "Nightfall Hunting",
//       "Shōgun",
//       "Lucky Jaguar",
//       "Lucky Doggy",
//       "Golden Bank 2",
//       "Fruity Wheel",
//       "Safari Mystery",
//       "Treasure Quest",
//       "Coin Tree",
//       "3 Coin Wild Horse",
//       "Roma X Deluxe",
//       "Super Ace Joker",
//       "Fortune Coins",
//       "Golden Empire 2",
//       "Super Ace 2",
//       "3 LUCKY LION",
//       "Money Coming 2",
//       "Circus Joker 4096",
//       "Crazy777 2",
//       "Sweet Magic",
//       "Crystal 777 DELUXE",
//       "Jackpot Joker FEVER",
//       "Safari King",
//       "ROMA X 10000",
//       "Cash Coin",
//     ];

//     // Helper function to normalize game names for comparison
//     const normalizeGameName = (name) => {
//       return name.toLowerCase().replace(/[^a-z0-9]/g, ""); // Remove spaces and special characters, convert to lowercase
//     };

//     // Start from current time + 1 month for the latest game (Royal Fishing)
//     const currentTime = new Date();
//     const startTime = new Date(
//       currentTime.getTime() + 30 * 24 * 60 * 60 * 1000
//     ); // Add 30 days (1 month)

//     let updatedCount = 0;
//     let notFoundCount = 0;
//     const notFoundGames = [];

//     // Process each game name with 30-minute intervals
//     for (let i = 0; i < gameNames.length; i++) {
//       const gameName = gameNames[i];
//       const normalizedName = normalizeGameName(gameName);

//       // Calculate timestamp: latest game gets start time (current + 1 month), each subsequent game is 30 minutes older
//       const timestamp = new Date(startTime.getTime() - i * 30 * 60 * 1000); // 30 minutes = 30 * 60 * 1000 milliseconds

//       // Find all games from database to match against
//       const allGames = await GameJILIGameModal.find(
//         {},
//         { gameNameEN: 1, _id: 1 }
//       );

//       // Find matching game by normalizing database names
//       let matchedGame = null;
//       for (const dbGame of allGames) {
//         if (
//           dbGame.gameNameEN &&
//           normalizeGameName(dbGame.gameNameEN) === normalizedName
//         ) {
//           matchedGame = dbGame;
//           break;
//         }
//       }

//       if (matchedGame) {
//         // Update the document directly in the collection, bypassing schema timestamps
//         const result = await GameJILIGameModal.collection.updateOne(
//           { _id: matchedGame._id },
//           {
//             $set: {
//               createdAt: timestamp,
//               updatedAt: timestamp,
//             },
//           }
//         );

//         if (result.matchedCount > 0) {
//           updatedCount++;
//           console.log(
//             `✓ Updated JILI game "${gameName}" with timestamp: ${timestamp.toISOString()}`
//           );
//         }
//       } else {
//         notFoundCount++;
//         notFoundGames.push(gameName);
//         console.log(`✗ JILI Game "${gameName}" not found in database`);
//       }
//     }

//     console.log("\n" + "=".repeat(60));
//     console.log("JILI Gaming manual order timestamp update completed!");
//     console.log("=".repeat(60));
//     console.log(
//       `Start time was set to: ${startTime.toISOString()} (current time + 1 month)`
//     );
//     console.log(`Total games processed: ${gameNames.length}`);
//     console.log(`Successfully updated: ${updatedCount}`);
//     console.log(`Not found: ${notFoundCount}`);

//     if (notFoundGames.length > 0) {
//       console.log("\nGames not found in database:");
//       notFoundGames.forEach((game, index) => {
//         console.log(`  ${index + 1}. ${game}`);
//       });
//     }

//     // Verify the updates by fetching and displaying the results
//     const updatedGames = await GameJILIGameModal.find(
//       {},
//       { gameNameEN: 1, createdAt: 1, hot: 1, gameID: 1 }
//     )
//       .sort({ createdAt: -1 })
//       .limit(20); // Show top 20 newest games

//     console.log("\n" + "=".repeat(60));
//     console.log(
//       "Verification - Top 20 JILI Games ordered by createdAt (newest first):"
//     );
//     console.log("=".repeat(60));
//     updatedGames.forEach((game, index) => {
//       console.log(
//         `${index + 1}. ${game.gameNameEN?.padEnd(
//           30
//         )} | CreatedAt: ${game.createdAt.toISOString()} | Hot: ${game.hot}`
//       );
//     });

//     return {
//       success: true,
//       totalProcessed: gameNames.length,
//       updated: updatedCount,
//       notFound: notFoundCount,
//       notFoundGames: notFoundGames,
//     };
//   } catch (error) {
//     console.error("Error updating JILI Gaming manual order timestamps:", error);
//     return {
//       success: false,
//       error: error.message,
//     };
//   }
// }

// // Call the function
// updateJILIGamingManualOrderTimestamps();

router.post("/api/jili/getgamelist", async (req, res) => {
  try {
    const games = await GameJILIGameModal.find({
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
    console.log(games.length);
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
    console.log("JILI error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "JILI: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "JILI: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "JILI: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "JILI: 攞唔到遊戲清單，老闆麻煩聯絡客服幫手處理。",
        id: "JILI: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/jili/launchGame", authenticateToken, async (req, res) => {
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
        ? user.gameLock?.jilifish?.lock
        : user.gameLock?.jilislot?.lock;

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

    let lang = "zh-CN";

    if (gameLang === "en") {
      lang = "en-US";
    } else if (gameLang === "zh") {
      lang = "zh-CN";
    } else if (gameLang === "ms") {
      lang = "ms-MY";
    } else if (gameLang === "id") {
      lang = "id-ID";
    } else if (gameLang === "zh_hk") {
      lang = "zh-CN";
    }

    const token = `${user.gameId}:${generateRandomCode()}`;

    const fields = {
      Token: token,
      GameId: gameCode,
      Lang: lang,
      AgentId: jiliAgentId,
    };

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        jiliGameToken: token,
      },
      { new: true }
    );

    const hash = generateSignature(fields, jiliAgentId, jiliKey);
    const requestData = new URLSearchParams({
      ...fields,
      HomeUrl: webURL,
      Key: hash,
    }).toString();

    const response = await axios.post(
      `${jiliAPIURL}/singleWallet/LoginWithoutRedirect`,
      requestData,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    if (response.data.ErrorCode !== 0) {
      console.log("JILI error to launch game", response.data);
      return res.status(200).json({
        success: false,
        message: {
          en: "JILI: Game launch failed. Please try again or customer service for assistance.",
          zh: "JILI: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "JILI: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "JILI: 遊戲開唔到，老闆試多次或者搵客服幫手。",
          id: "JILI: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "JILI"
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
    console.log("JILI error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "JILI: Game launch failed. Please try again or customer service for assistance.",
        zh: "JILI: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "JILI: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "JILI: 遊戲開唔到，老闆試多次或者搵客服幫手。",
        id: "JILI: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/jili/auth", async (req, res) => {
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
      { wallet: 1, jiliGameToken: 1 }
    ).lean();

    if (!currentUser || currentUser.jiliGameToken !== token) {
      return res.status(200).json({
        errorCode: 4,
        message: "Token expired",
      });
    }

    return res.status(200).json({
      errorCode: 0,
      message: "Success",
      username: username,
      currency: "MYR",
      balance: roundToTwoDecimals(currentUser.wallet),
      token: token,
    });
  } catch (error) {
    console.error(
      "JILI: Error in game provider calling ae96 auth api:",
      error.message
    );
    return res.status(500).json({
      errorCode: 5,
      message: "Internal Server Error",
    });
  }
});

function mapGameCategory(categoryId) {
  const categoryMap = {
    1: "SLOT",
    2: "POKER",
    3: "LOBBY",
    5: "FISH",
    6: "CASINO",
  };

  return categoryMap[categoryId] || "SLOT";
}

router.post("/api/jili/bet", async (req, res) => {
  try {
    const { reqId, token, round, betAmount, winloseAmount, gameCategory } =
      req.body;

    if (!token) {
      return res.status(200).json({
        errorCode: 3,
        message: "Invalid parameter",
      });
    }

    const tokenParts = token.split(":");

    const username = tokenParts[0];

    const [currentUser, existingTransaction] = await Promise.all([
      User.findOne(
        { gameId: username },
        {
          jiliGameToken: 1,
          "gameLock.jilifish.lock": 1,
          "gameLock.jilislot.lock": 1,
          wallet: 1,
          _id: 1,
        }
      ).lean(),
      SlotJiliModal.findOne({ roundId: round, bet: true }, { _id: 1 }).lean(),
    ]);

    if (!currentUser || currentUser.jiliGameToken !== token) {
      return res.status(200).json({
        errorCode: 4,
        message: "Token expired",
      });
    }

    const isLocked =
      gameCategory === 5
        ? currentUser.gameLock?.jilifish?.lock
        : currentUser.gameLock?.jilislot?.lock;

    if (isLocked) {
      return res.status(200).json({
        errorCode: 5,
        message: "Play locked",
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        errorCode: 1,
        message: "Already accepted",
        username: username,
        currency: "MYR",
        balance: roundToTwoDecimals(currentUser.wallet),
        txId: round,
        token,
      });
    }

    const adjustedAmount = -betAmount + winloseAmount;

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        gameId: username,
        wallet: { $gte: roundToTwoDecimals(betAmount) },
      },
      { $inc: { wallet: roundToTwoDecimals(adjustedAmount) } },
      { new: true, projection: { wallet: 1, username: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      const latestUser = await User.findOne(
        { gameId: username },
        { wallet: 1, _id: 1 }
      ).lean();

      return res.status(200).json({
        errorCode: 2,
        message: "Not enough balance",
        username: username,
        currency: "MYR",
        balance: roundToTwoDecimals(latestUser?.wallet || 0),
        txId: round,
        token,
      });
    }

    const gameType = mapGameCategory(gameCategory);

    await SlotJiliModal.create({
      username: username,
      roundId: round,
      bet: true,
      settle: true,
      betamount: roundToTwoDecimals(betAmount),
      settleamount: roundToTwoDecimals(winloseAmount),
      gametype: gameType,
    });

    return res.status(200).json({
      errorCode: 0,
      message: "Success",
      username: username,
      currency: "MYR",
      balance: roundToTwoDecimals(updatedUserBalance.wallet),
      txId: round,
      token,
    });
  } catch (error) {
    console.error(
      "JILI: Error in game provider calling ae96 bet api:",
      error.message
    );
    return res.status(500).json({
      errorCode: 5,
      message: "Internal Server Error",
    });
  }
});

router.post("/api/jili/cancelBet", async (req, res) => {
  try {
    const { reqId, token, round, betAmount, winloseAmount } = req.body;

    if (!token) {
      return res.status(200).json({
        errorCode: 3,
        message: "Invalid parameter",
      });
    }

    const tokenParts = token.split(":");

    const username = tokenParts[0];

    const [currentUser, existingTransaction, existingCancelledTransaction] =
      await Promise.all([
        User.findOne(
          { gameId: username },
          { jiliGameToken: 1, wallet: 1, _id: 1 }
        ).lean(),
        SlotJiliModal.findOne({ roundId: round, bet: true }, { _id: 1 }).lean(),
        SlotJiliModal.findOne(
          { roundId: round, cancel: true },
          { _id: 1 }
        ).lean(),
      ]);

    if (!currentUser || currentUser.jiliGameToken !== token) {
      return res.status(200).json({
        errorCode: 5,
        message: "Token expired",
      });
    }

    if (!existingTransaction) {
      return res.status(200).json({
        errorCode: 2,
        message: "Round not found",
        username: username,
        currency: "MYR",
        balance: roundToTwoDecimals(currentUser.wallet),
        txId: round,
      });
    }

    if (existingCancelledTransaction) {
      return res.status(200).json({
        errorCode: 1,
        message: "Already cancelled",
        username: username,
        currency: "MYR",
        balance: roundToTwoDecimals(currentUser.wallet),
        txId: round,
      });
    }

    const adjustedAmount = betAmount - winloseAmount;

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        gameId: username,
        wallet: { $gte: roundToTwoDecimals(adjustedAmount) },
      },
      { $inc: { wallet: roundToTwoDecimals(adjustedAmount) } },
      { new: true, projection: { wallet: 1, username: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      const latestUser = await User.findOne(
        { gameId: username },
        { wallet: 1, _id: 1 }
      ).lean();

      return res.status(200).json({
        errorCode: 6,
        message: "Not enough balance",
        username: username,
        currency: "MYR",
        balance: roundToTwoDecimals(latestUser?.wallet || 0),
        txId: round,
      });
    }

    await SlotJiliModal.findOneAndUpdate(
      { roundId: round },
      { $set: { cancel: true } },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      errorCode: 0,
      message: "Success",
      username: username,
      currency: "MYR",
      balance: roundToTwoDecimals(updatedUserBalance.wallet),
      txId: round,
    });
  } catch (error) {
    console.error(
      "JILI: Error in game provider calling ae96 cancel api:",
      error.message
    );
    return res.status(200).json({
      errorCode: 5,
      message: "Internal Server Error",
    });
  }
});

router.post("/api/jili/sessionBet", async (req, res) => {
  try {
    const {
      reqId,
      token,
      round,
      betAmount,
      winloseAmount,
      type,
      preserve,
      sessionId,
      turnover,
      gameCategory,
    } = req.body;

    if (!token) {
      return res.status(200).json({
        errorCode: 3,
        message: "Invalid parameter",
      });
    }
    const tokenParts = token.split(":");

    const username = tokenParts[0];

    const [currentUser, existingTransaction] = await Promise.all([
      User.findOne(
        { gameId: username, jiliGameToken: token },
        {
          wallet: 1,
          "gameLock.jilifish.lock": 1,
          "gameLock.jilislot.lock": 1,
          _id: 1,
        }
      ).lean(),
      type === 1 || type === 2
        ? SlotJiliModal.findOne({
            roundId: round,
            [type === 1 ? "bet" : "settle"]: true,
          }).lean()
        : null,
    ]);

    if (!currentUser) {
      return res.status(200).json({
        errorCode: 4,
        message: "Token expired",
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        errorCode: 1,
        message: "Already accepted",
        username,
        currency: "MYR",
        balance: roundToTwoDecimals(currentUser.wallet),
        txId: round,
        token,
      });
    }

    let updatedUserBalance;
    let transactionPromise = Promise.resolve();
    const gameType = mapGameCategory(gameCategory);

    if (preserve === 0 || !preserve) {
      if (type === 1) {
        const isLocked =
          gameCategory === 5
            ? currentUser.gameLock?.jilifish?.lock
            : currentUser.gameLock?.jilislot?.lock;

        if (isLocked) {
          return res.status(200).json({
            errorCode: 5,
            message: "Play locked",
          });
        }

        updatedUserBalance = await User.findOneAndUpdate(
          {
            gameId: username,
            wallet: { $gte: roundToTwoDecimals(betAmount) },
          },
          { $inc: { wallet: -roundToTwoDecimals(betAmount) } },
          { new: true, projection: { username: 1, wallet: 1 } }
        );

        if (!updatedUserBalance) {
          const latestUser = await User.findOne(
            { gameId: username },
            { wallet: 1 }
          ).lean();

          return res.status(200).json({
            errorCode: 2,
            message: "Not enough balance",
            username: username,
            currency: "MYR",
            balance: roundToTwoDecimals(latestUser?.wallet || 0),
            txId: round,
            token,
          });
        }

        transactionPromise = SlotJiliModal.create({
          username,
          roundId: round,
          sessionRoundId: sessionId,
          bet: true,
          betamount: roundToTwoDecimals(betAmount),
          gametype: gameType,
        });
      } else if (type === 2) {
        updatedUserBalance = await User.findOneAndUpdate(
          { gameId: username },
          { $inc: { wallet: roundToTwoDecimals(winloseAmount) } },
          { new: true, projection: { username: 1, wallet: 1 } }
        );

        transactionPromise = SlotJiliModal.findOneAndUpdate(
          { roundId: round },
          {
            $set: {
              username,
              settle: true,
              settleamount: roundToTwoDecimals(winloseAmount),
            },
          },
          { upsert: true }
        );
      }
    } else {
      if (type === 1) {
        const isLocked =
          gameCategory === 5
            ? currentUser.gameLock?.jilifish?.lock
            : currentUser.gameLock?.jilislot?.lock;

        if (isLocked) {
          return res.status(200).json({
            errorCode: 5,
            message: "Play locked",
          });
        }

        updatedUserBalance = await User.findOneAndUpdate(
          {
            gameId: username,
            wallet: { $gte: roundToTwoDecimals(preserve) },
          },
          { $inc: { wallet: -roundToTwoDecimals(preserve) } },
          { new: true, projection: { username: 1, wallet: 1 } }
        );

        if (!updatedUserBalance) {
          const latestUser = await User.findOne(
            { gameId: username },
            { wallet: 1 }
          ).lean();

          return res.status(200).json({
            errorCode: 2,
            message: "Not enough balance",
            username: username,
            currency: "MYR",
            balance: roundToTwoDecimals(latestUser?.wallet || 0),
            txId: round,
            token,
          });
        }

        transactionPromise = SlotJiliModal.create({
          username,
          roundId: round,
          sessionRoundId: sessionId,
          bet: true,
          betamount: roundToTwoDecimals(preserve),
          gametype: gameType,
        });
      } else if (type === 2) {
        const adjustedAmount = preserve - betAmount + winloseAmount;

        updatedUserBalance = await User.findOneAndUpdate(
          { gameId: username },
          { $inc: { wallet: roundToTwoDecimals(adjustedAmount) } },
          { new: true, projection: { username: 1, wallet: 1 } }
        );

        transactionPromise = SlotJiliModal.findOneAndUpdate(
          { roundId: round },
          {
            $set: {
              username,
              settle: true,
              settleamount: roundToTwoDecimals(winloseAmount),
            },
          },
          { upsert: true }
        );
      }
    }

    transactionPromise.catch((err) =>
      console.error(
        "JILI: Failed to update transaction in sessionBet:",
        err.message
      )
    );

    return res.status(200).json({
      errorCode: 0,
      message: "Success",
      username: username,
      currency: "MYR",
      balance: roundToTwoDecimals(updatedUserBalance.wallet),
      txId: round,
      token,
    });
  } catch (error) {
    console.error(
      "JILI: Error in game provider calling ae96 sessionbet api:",
      error.message
    );
    return res.status(200).json({
      errorCode: 5,
      message: "Internal Server Error",
    });
  }
});

router.post("/api/jili/cancelSessionBet", async (req, res) => {
  try {
    const {
      reqId,
      token,
      round,
      betAmount,
      winloseAmount,
      preserve,
      sessionId,
    } = req.body;

    if (!token) {
      return res.status(200).json({
        errorCode: 3,
        message: "Invalid parameter",
      });
    }
    const tokenParts = token.split(":");

    const username = tokenParts[0];

    const [currentUser, existingTransaction, existingCancelledTransaction] =
      await Promise.all([
        User.findOne(
          { gameId: username, jiliGameToken: token },
          { wallet: 1, _id: 1 }
        ).lean(),
        SlotJiliModal.findOne({ roundId: round, bet: true }).lean(),
        SlotJiliModal.findOne({ roundId: round, cancel: true }).lean(),
      ]);

    if (!currentUser) {
      return res.status(200).json({
        errorCode: 5,
        message: "Token expired",
      });
    }

    if (!existingTransaction) {
      return res.status(200).json({
        errorCode: 2,
        message: "Round not found",
        username: username,
        currency: "MYR",
        balance: roundToTwoDecimals(currentUser.wallet),
        txId: round,
      });
    }

    if (existingCancelledTransaction) {
      return res.status(200).json({
        errorCode: 1,
        message: "Already cancelled",
        username: username,
        currency: "MYR",
        balance: roundToTwoDecimals(currentUser.wallet),
        txId: round,
      });
    }

    let updatedUserBalance;

    if (preserve === 0 || !preserve) {
      updatedUserBalance = await User.findOneAndUpdate(
        { gameId: username },
        { $inc: { wallet: roundToTwoDecimals(betAmount) } },
        { new: true }
      );
    } else {
      updatedUserBalance = await User.findOneAndUpdate(
        { gameId: username },
        { $inc: { wallet: roundToTwoDecimals(preserve) } },
        { new: true }
      );
    }

    await SlotJiliModal.findOneAndUpdate(
      { roundId: round },
      { $set: { cancel: true } },
      { upsert: true }
    );

    return res.status(200).json({
      errorCode: 0,
      message: "Success",
      username: username,
      currency: "MYR",
      balance: roundToTwoDecimals(updatedUserBalance?.wallet || 0),
      txId: round,
    });
  } catch (error) {
    console.error("JILI: Error in cancelSessionBet:", error.message);
    return res.status(200).json({
      errorCode: 5,
      message: "Internal Server Error",
    });
  }
});

router.post("/api/jilislot/getturnoverforrebate", async (req, res) => {
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

    console.log("JILI SLOT QUERYING TIME", startDate, endDate);

    const records = await SlotJiliModal.find({
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
        console.warn(`JILI User not found for gameId: ${gameId}`);
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
        gamename: "JILI",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("JILI: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "JILI: Failed to fetch win/loss report",
        zh: "JILI: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/jilislot/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotJiliModal.find({
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
          gamename: "JILI",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("JILI: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JILI: Failed to fetch win/loss report",
          zh: "JILI: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jilislot/:userId/gamedata",
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

          if (slotGames["JILI"]) {
            totalTurnover += slotGames["JILI"].turnover || 0;
            totalWinLoss += slotGames["JILI"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JILI",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("JILI: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JILI: Failed to fetch win/loss report",
          zh: "JILI: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jilislot/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotJiliModal.find({
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
          gamename: "JILI",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("JILI: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "JILI: Failed to fetch win/loss report",
          zh: "JILI: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jilislot/kioskreport",
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

          if (liveCasino["JILI"]) {
            totalTurnover += Number(liveCasino["JILI"].turnover || 0);
            totalWinLoss += Number(liveCasino["JILI"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JILI",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("JILI: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "JILI: Failed to fetch win/loss report",
          zh: "JILI: 获取盈亏报告失败",
        },
      });
    }
  }
);

// -------------

router.post("/api/jilifish/getturnoverforrebate", async (req, res) => {
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

    console.log("JILI FISH QUERYING TIME", startDate, endDate);

    const records = await SlotJiliModal.find({
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
        console.warn(`JILI User not found for gameId: ${gameId}`);
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
        gamename: "JILI",
        gamecategory: "Fishing",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("JILI: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "JILI: Failed to fetch win/loss report",
        zh: "JILI: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/jilifish/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotJiliModal.find({
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
          gamename: "JILI",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("JILI: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JILI: Failed to fetch win/loss report",
          zh: "JILI: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jilifish/:userId/gamedata",
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

          if (slotGames["JILI"]) {
            totalTurnover += slotGames["JILI"].turnover || 0;
            totalWinLoss += slotGames["JILI"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JILI",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("JILI: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JILI: Failed to fetch win/loss report",
          zh: "JILI: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jilifish/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotJiliModal.find({
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
          gamename: "JILI",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("JILI: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "JILI: Failed to fetch win/loss report",
          zh: "JILI: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jilifish/kioskreport",
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

          if (liveCasino["JILI"]) {
            totalTurnover += Number(liveCasino["JILI"].turnover || 0);
            totalWinLoss += Number(liveCasino["JILI"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JILI",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("JILI: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "JILI: Failed to fetch win/loss report",
          zh: "JILI: 获取盈亏报告失败",
        },
      });
    }
  }
);

module.exports = router;
