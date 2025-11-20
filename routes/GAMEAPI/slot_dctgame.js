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
const { adminUser, adminLog } = require("../../models/adminuser.model");
const { v4: uuidv4 } = require("uuid");
const GameWalletLog = require("../../models/gamewalletlog.model");
const GameHacksawGameModal = require("../../models/slot_dcthacksawDatabase.model");
const GameRelaxGamingGameModal = require("../../models/slot_dctrelaxDatabase.model");
const SlotDCTGameModal = require("../../models/slot_dctgame.model");

require("dotenv").config();

const dctGameBrandID = "S010217";
const dctGameKey = process.env.DCTGAME_SECRET;
const webURL = "https://www.bm8my.vip/";
const dctGameAPIURL = "https://gaming.dcgames.asia";

const generateRandomCode = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 10; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }

  return result;
};

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateSignature(options) {
  const { params = [], brandId, apiKey } = options;

  // Start with brandId if it exists
  let message = brandId || "";

  // Add all parameters in order
  if (params && params.length > 0) {
    message += params.join("");
  }

  // Add API key at the end
  message += apiKey;
  // Generate MD5 hash and return in uppercase
  return crypto.createHash("md5").update(message).digest("hex").toUpperCase();
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

const validateHacksawToken = async (brand_uid, token, lockType = null) => {
  const projection = {
    wallet: 1,
    hacksawGameToken: 1,
    relaxgamingGameToken: 1,
    _id: 1,
  };

  if (lockType) {
    projection[`gameLock.${lockType}.lock`] = 1;
  }

  const user = await User.findOne(
    {
      gameId: brand_uid,
      $or: [{ hacksawGameToken: token }, { relaxgamingGameToken: token }],
    },
    projection
  ).lean();

  if (!user) {
    const tokenExists = await User.exists({
      $or: [{ hacksawGameToken: token }, { relaxgamingGameToken: token }],
    });

    if (tokenExists) {
      return {
        valid: false,
        code: 5013,
        msg: "Session authentication failed, token does not match with player",
      };
    }

    return {
      valid: false,
      code: 5009,
      msg: "Player's account or token does not exist",
    };
  }

  return { valid: true, user };
};

// async function updateBTGamingManualOrderTimestampsPlus() {
//   try {
//     // List of gameIDs in order (AB1541 = latest, AB1501 = oldest)
//     const gameIds = [
//       "Temple Tumble",
//       "Temple Tumble 2",
//       "Dead Riders Trail",
//       "Beast Mode",
//       "Net Gains",
//       "Ancient Tumble",
//       "Money Train 3",
//       "Bill & Coin 2",
//       "Money Train 4",
//       "Templar Tumble",
//       "Banana Town",
//       "Space Miners",
//       "The Great Pigsby",
//       "Sloth Tumble",
//       "Dead Man's Trail",
//       "Conquer Babylon",
//       "Money Train 2",
//       "Wild Yield",
//       "Bill & Coin",
//       "Book of 99",
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
//       const result = await GameRelaxGamingGameModal.collection.updateOne(
//         { gameNameEN: gameId },
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
//     const updatedGames = await GameRelaxGamingGameModal.find(
//       { gameNameEN: { $in: gameIds } },
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

router.post("/api/dct/updategameid", async (req, res) => {
  try {
    const sign = generateSignature({
      brandId: dctGameBrandID,
      apiKey: dctGameKey,
    });

    const payload = {
      brand_id: dctGameBrandID,
      sign,
      provider: "hs",
    };

    const response = await axios.post(
      `${dctGameAPIURL}/dcs/getGameList`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    // Helper function to normalize strings for comparison
    const normalizeString = (str) => {
      return str.toLowerCase().replace(/[^a-z0-9]/g, ""); // Remove spaces and special characters
    };

    // Get all games from database
    const dbGames = await GameHacksawGameModal.find({}).lean();

    // Step 1: Compare by game_id
    const apiGameIds = new Set(
      response.data.data.map((game) => game.game_id.toString())
    );
    const dbGameIds = new Set(dbGames.map((game) => game.gameID));

    // Find games missing by ID (in API but not in DB by ID)
    const missingByIdGames = response.data.data.filter(
      (game) => !dbGameIds.has(game.game_id.toString())
    );

    // Step 2: For games missing by ID, check if game name matches
    const updatePromises = [];
    const matchedByName = [];
    const trulyMissingGames = [];

    // Create a map of normalized game names to db games for quick lookup
    const dbGameNameMap = new Map();
    dbGames.forEach((dbGame) => {
      if (dbGame.gameNameEN) {
        const normalizedName = normalizeString(dbGame.gameNameEN);
        dbGameNameMap.set(normalizedName, dbGame);
      }
    });

    missingByIdGames.forEach((apiGame) => {
      const normalizedApiName = normalizeString(apiGame.game_name);
      const matchingDbGame = dbGameNameMap.get(normalizedApiName);

      if (matchingDbGame) {
        // Game name matches - update the gameID in database
        matchedByName.push({
          old_game_id: matchingDbGame.gameID,
          new_game_id: apiGame.game_id.toString(),
          game_name: apiGame.game_name,
          db_game_name: matchingDbGame.gameNameEN,
        });

        updatePromises.push(
          GameHacksawGameModal.updateOne(
            { _id: matchingDbGame._id },
            { $set: { gameID: apiGame.game_id.toString() } }
          )
        );
      } else {
        // Truly missing game - not in DB by ID or name
        trulyMissingGames.push({
          game_id: apiGame.game_id,
          game_name: apiGame.game_name,
          provider: apiGame.provider,
          game_name_cn: apiGame.game_name_cn,
          game_icon: apiGame.game_icon,
          rtp: apiGame.rtp,
        });
      }
    });

    // Execute all updates
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    return res.status(200).json({
      success: true,
      comparison: {
        matchedByName: matchedByName,
        matchedByNameCount: matchedByName.length,
        trulyMissingGames: trulyMissingGames,
        trulyMissingCount: trulyMissingGames.length,
        totalProcessed: missingByIdGames.length,
      },
      message: {
        en: "Game comparison and update completed successfully.",
        zh: "游戏比较和更新成功完成。",
        ms: "Perbandingan dan kemas kini permainan berjaya diselesaikan.",
        zh_hk: "遊戲比較和更新成功完成。",
        id: "Perbandingan dan pembaruan permainan berhasil diselesaikan.",
      },
    });
  } catch (error) {
    console.error("HACKSAW error comparing game names:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "HACKSAW: Game comparison failed. Please try again or contact customer service for assistance.",
        zh: "HACKSAW: 游戏比较失败，请重试或联系客服以获得帮助。",
        ms: "HACKSAW: Perbandingan permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "HACKSAW: 遊戲比較失敗，請重試或聯絡客服以獲得幫助。",
        id: "HACKSAW: Perbandingan permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/dct/comparegamenames", async (req, res) => {
  try {
    const sign = generateSignature({
      brandId: dctGameBrandID,
      apiKey: dctGameKey,
    });

    const payload = {
      brand_id: dctGameBrandID,
      sign,
      provider: "hs",
    };

    const response = await axios.post(
      `${dctGameAPIURL}/dcs/getGameList`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    // Get all games from database
    const dbGames = await GameHacksawGameModal.find({}).lean();

    // Extract game names from API response
    const apiGameNames = new Set(
      response.data.data.map((game) => game.game_name)
    );

    // Extract game names from database
    const dbGameNames = new Set(dbGames.map((game) => game.gameNameEN));

    // Find missing games (in API but not in DB)
    const missingGames = response.data.data.filter(
      (game) => !dbGameNames.has(game.game_name)
    );

    // Find extra games (in DB but not in API) - just for info
    const extraGames = dbGames.filter(
      (game) => !apiGameNames.has(game.gameNameEN)
    );

    // Format missing games for response
    const missingGamesFormatted = missingGames.map((game) => ({
      game_id: game.game_id,
      game_name: game.game_name,
      provider: game.provider,
      game_name_cn: game.game_name_cn,
      game_icon: game.game_icon,
      rtp: game.rtp,
    }));

    // Format extra games for response
    const extraGamesFormatted = extraGames.map((game) => ({
      game_id: game.gameID,
      game_name: game.gameNameEN,
      game_name_cn: game.gameNameCN,
    }));

    return res.status(200).json({
      success: true,
      comparison: {
        missingGames: missingGamesFormatted,
        missingCount: missingGames.length,
        extraGames: extraGamesFormatted,
        extraCount: extraGames.length,
      },
      message: {
        en: "Game name comparison completed successfully.",
        zh: "游戏名称比较成功完成。",
        ms: "Perbandingan nama permainan berjaya diselesaikan.",
        zh_hk: "遊戲名稱比較成功完成。",
        id: "Perbandingan nama permainan berhasil diselesaikan.",
      },
    });
  } catch (error) {
    console.error("HACKSAW error comparing game names:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "HACKSAW: Game name comparison failed. Please try again or contact customer service for assistance.",
        zh: "HACKSAW: 游戏名称比较失败，请重试或联系客服以获得帮助。",
        ms: "HACKSAW: Perbandingan nama permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "HACKSAW: 遊戲名稱比較失敗，請重試或聯絡客服以獲得幫助。",
        id: "HACKSAW: Perbandingan nama permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/dct/comparegame", async (req, res) => {
  try {
    const sign = generateSignature({
      brandId: dctGameBrandID,
      apiKey: dctGameKey,
    });

    const payload = {
      brand_id: dctGameBrandID,
      sign,
      provider: "relax",
    };

    const response = await axios.post(
      `${dctGameAPIURL}/dcs/getGameList`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    // Get all games from database
    const dbGames = await GameRelaxGamingGameModal.find({}).lean();

    // Extract game IDs from API response
    const apiGameIds = new Set(
      response.data.data.map((game) => game.game_id.toString())
    );

    // Extract game IDs from database
    const dbGameIds = new Set(dbGames.map((game) => game.gameID));

    // Find missing games (in API but not in DB)
    const missingGames = response.data.data.filter(
      (game) => !dbGameIds.has(game.game_id.toString())
    );

    // Find extra games (in DB but not in API) and set maintenance to true
    const extraGameIds = dbGames
      .filter((game) => !apiGameIds.has(game.gameID))
      .map((game) => game._id);

    // Find active games (in both DB and API) and set maintenance to false
    const activeGameIds = dbGames
      .filter((game) => apiGameIds.has(game.gameID))
      .map((game) => game._id);

    console.log(`Extra games (setting to maintenance): ${extraGameIds.length}`);
    console.log(`Active games (setting to active): ${activeGameIds.length}`);

    // Update extra games to maintenance mode
    let extraGamesUpdated = 0;
    if (extraGameIds.length > 0) {
      const extraResult = await GameRelaxGamingGameModal.updateMany(
        { _id: { $in: extraGameIds } },
        { $set: { maintenance: true } }
      );
      extraGamesUpdated = extraResult.modifiedCount;
      console.log(`✅ Set ${extraGamesUpdated} games to maintenance`);
    }

    // Update active games to set maintenance to false
    let activeGamesUpdated = 0;
    if (activeGameIds.length > 0) {
      const activeResult = await GameRelaxGamingGameModal.updateMany(
        { _id: { $in: activeGameIds } },
        { $set: { maintenance: false } }
      );
      activeGamesUpdated = activeResult.modifiedCount;
      console.log(`✅ Set ${activeGamesUpdated} games to active`);
    }

    // Format missing games for response
    const missingGamesFormatted = missingGames.map((game) => ({
      game_id: game.game_id,
      game_name: game.game_name,
      provider: game.provider,
      game_name_cn: game.game_name_cn,
      game_icon: game.game_icon,
      rtp: game.rtp,
    }));

    return res.status(200).json({
      success: true,
      gameLobby: response.data,
      comparison: {
        missingGames: missingGamesFormatted,
        missingCount: missingGames.length,
        extraGamesSetToMaintenance: extraGamesUpdated,
        activeGamesSetToActive: activeGamesUpdated,
        totalApiGames: response.data.data.length,
        totalDbGames: dbGames.length,
      },
      message: {
        en: "Game list retrieved successfully.",
        zh: "游戏列表检索成功。",
        ms: "Senarai permainan berjaya diambil.",
        zh_hk: "遊戲列表檢索成功。",
        id: "Daftar permainan berhasil diambil.",
      },
    });
  } catch (error) {
    console.error("HACKSAW error launching game:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "HACKSAW: Game launch failed. Please try again or customer service for assistance.",
        zh: "HACKSAW: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "HACKSAW: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "HACKSAW: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "HACKSAW: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/dct/getprovidergamelist", async (req, res) => {
  try {
    const sign = generateSignature({
      brandId: dctGameBrandID,
      apiKey: dctGameKey,
    });

    const payload = {
      brand_id: dctGameBrandID,
      sign,
      provider: "hs",
    };

    const response = await axios.post(
      `${dctGameAPIURL}/dcs/getGameList`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    console.log(response.data.data.length);
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
    console.error("HACKSAW error launching game:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "HACKSAW: Game launch failed. Please try again or customer service for assistance.",
        zh: "HACKSAW: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "HACKSAW: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "HACKSAW: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "HACKSAW: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/hacksaw/getgamelist", async (req, res) => {
  try {
    const games = await GameHacksawGameModal.find({
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
    console.error("HACKSAW Error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "HACKSAW: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "HACKSAW: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "HACKSAW: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "HACKSAW: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "HACKSAW: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/relaxgaming/getgamelist", async (req, res) => {
  try {
    const games = await GameRelaxGamingGameModal.find({
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
    console.error("RELAX GAMING Error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "RELAX GAMING: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "RELAX GAMING: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "RELAX GAMING: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "RELAX GAMING: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "RELAX GAMING: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/hacksaw/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, gameCode, clientPlatform } = req.body;

    const user = await User.findById(req.user.userId);

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

    if (user.gameLock.hacksaw.lock) {
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
      lang = "zh_hans";
    } else if (gameLang === "zh_hk") {
      lang = "zh_hant";
    } else if (gameLang === "ms") {
      lang = "en";
    } else if (gameLang === "id") {
      lang = "id";
    }

    let platform = "pc";
    if (clientPlatform === "web") {
      platform = "pc";
    } else if (clientPlatform === "mobile") {
      platform = "mobile";
    }

    const sign = generateSignature({
      brandId: dctGameBrandID,
      params: [user.gameId],
      apiKey: dctGameKey,
    });

    let logintoken = `${user.gameId}:${generateRandomCode()}`;

    const payload = {
      brand_id: dctGameBrandID,
      sign,
      brand_uid: user.gameId,
      token: logintoken,
      game_id: parseInt(gameCode),
      currency: "MYR",
      language: lang,
      channel: platform,
      country_code: "MY",
      return_url: webURL,
    };

    const response = await axios.post(
      `${dctGameAPIURL}/dcs/loginGame`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.code !== 1000) {
      console.log("HACKSAW fail to launch game with error", response.data);

      return res.status(200).json({
        success: false,
        message: {
          en: "HACKSAW: Game launch failed. Please try again or customer service for assistance.",
          zh: "HACKSAW: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "HACKSAW: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "HACKSAW: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "HACKSAW: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }
    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        hacksawGameToken: logintoken,
      },
      { new: true }
    );

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "HACKSAW"
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data.data.game_url,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.error("HACKSAW error launching game:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "HACKSAW: Game launch failed. Please try again or customer service for assistance.",
        zh: "HACKSAW: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "HACKSAW: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "HACKSAW: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "HACKSAW: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/api/relaxgaming/launchGame",
  authenticateToken,
  async (req, res) => {
    try {
      const { gameLang, gameCode, clientPlatform } = req.body;

      const user = await User.findById(req.user.userId);

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

      if (user.gameLock.relaxgaming.lock) {
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
        lang = "zh_hans";
      } else if (gameLang === "zh_hk") {
        lang = "zh_hant";
      } else if (gameLang === "ms") {
        lang = "en";
      } else if (gameLang === "id") {
        lang = "id";
      }

      let platform = "pc";
      if (clientPlatform === "web") {
        platform = "pc";
      } else if (clientPlatform === "mobile") {
        platform = "mobile";
      }

      const sign = generateSignature({
        brandId: dctGameBrandID,
        params: [user.gameId],
        apiKey: dctGameKey,
      });

      let logintoken = `${user.gameId}:${generateRandomCode()}`;

      const payload = {
        brand_id: dctGameBrandID,
        sign,
        brand_uid: user.gameId,
        token: logintoken,
        game_id: parseInt(gameCode),
        currency: "MYR",
        language: lang,
        channel: platform,
        country_code: "MY",
        return_url: webURL,
      };

      const response = await axios.post(
        `${dctGameAPIURL}/dcs/loginGame`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.code !== 1000) {
        console.log(
          "RELAX GAMING fail to launch game with error",
          response.data
        );

        return res.status(200).json({
          success: false,
          message: {
            en: "RELAX GAMING: Game launch failed. Please try again or customer service for assistance.",
            zh: "RELAX GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "RELAX GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "RELAX GAMING: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
            id: "RELAX GAMING: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }
      const updatedUser = await User.findOneAndUpdate(
        { _id: user._id },
        {
          relaxgamingGameToken: logintoken,
        },
        { new: true }
      );

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "RELAX GAMING"
      );

      return res.status(200).json({
        success: true,
        gameLobby: response.data.data.game_url,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
          zh_hk: "遊戲啟動成功。",
          id: "Permainan berhasil diluncurkan.",
        },
      });
    } catch (error) {
      console.error("RELAX error launching game:", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "RELAX GAMING: Game launch failed. Please try again or customer service for assistance.",
          zh: "RELAX GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "RELAX GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "RELAX GAMING: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "RELAX GAMING: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post("/api/hacksaw/login", async (req, res) => {
  try {
    const { brand_id, sign, token, brand_uid } = req.body;
    if (!token || !sign || !brand_uid || !brand_id) {
      console.log("token failed");
      return res.status(200).json({
        code: 5001,
        msg: "Request parameter error",
      });
    }

    const generatedsign = generateSignature({
      brandId: brand_id,
      params: [token],
      apiKey: dctGameKey,
    });

    if (sign !== generatedsign) {
      console.log("sign validate failed");
      return res.status(200).json({
        code: 5000,
        msg: "Verification code error",
      });
    }

    const validation = await validateHacksawToken(brand_uid, token);

    if (!validation.valid) {
      return res.status(200).json({
        code: validation.code,
        msg: validation.msg,
      });
    }

    return res.status(200).json({
      code: 1000,
      msg: "Success",
      data: {
        brand_uid: brand_uid,
        currency: "MYR",
        balance: roundToTwoDecimals(validation.user.wallet),
      },
    });
  } catch (error) {
    console.log(
      "Hacksaw Error in game provider calling ae96 api",
      error.message
    );
    return res.status(200).json({
      code: 1001,
      msg: "System error",
    });
  }
});

router.post("/api/hacksaw/getBalance", async (req, res) => {
  try {
    const { brand_id, sign, token, brand_uid } = req.body;

    if (!token || !sign || !brand_uid || !brand_id) {
      return res.status(200).json({
        code: 5001,
        msg: "Request parameter error",
      });
    }

    const generatedsign = generateSignature({
      brandId: brand_id,
      params: [token],
      apiKey: dctGameKey,
    });

    if (sign !== generatedsign) {
      console.log("sign validate failed");
      return res.status(200).json({
        code: 5000,
        msg: "Verification code error",
      });
    }

    const validation = await validateHacksawToken(brand_uid, token);

    if (!validation.valid) {
      return res.status(200).json({
        code: validation.code,
        msg: validation.msg,
      });
    }
    return res.status(200).json({
      code: 1000,
      msg: "Success",
      data: {
        brand_uid: brand_uid,
        currency: "MYR",
        balance: roundToTwoDecimals(validation.user.wallet),
      },
    });
  } catch (error) {
    console.log(
      "Hacksaw Error in game provider calling ae96 api",
      error.message
    );
    return res.status(200).json({
      code: 1001,
      msg: "System error",
    });
  }
});

router.post("/api/hacksaw/wager", async (req, res) => {
  try {
    const {
      brand_id,
      sign,
      token,
      brand_uid,
      amount,
      round_id,
      wager_id,
      is_endround,
      currency,
      provider,
    } = req.body;

    if (!token || !sign || !brand_uid || !brand_id) {
      return res.status(200).json({
        code: 5001,
        msg: "Request parameter error",
      });
    }

    const providerMap = {
      hs: { lock: "hacksaw", name: "HACKSAW" },
      relax: { lock: "relaxgaming", name: "RELAXGAMING" },
    };

    const providerInfo = providerMap[provider];

    if (!providerInfo) {
      return res.status(200).json({
        code: 5015,
        msg: "Invalid provider",
      });
    }

    const generatedsign = generateSignature({
      brandId: brand_id,
      params: [wager_id],
      apiKey: dctGameKey,
    });

    if (sign !== generatedsign) {
      return res.status(200).json({
        code: 5000,
        msg: "Verification code error",
      });
    }

    const [validation, existingBet] = await Promise.all([
      validateHacksawToken(brand_uid, token, providerInfo.lock),
      SlotDCTGameModal.findOne(
        { betId: wager_id, tranId: round_id },
        { _id: 1 }
      ).lean(),
    ]);

    if (!validation.valid) {
      return res.status(200).json({
        code: validation.code,
        msg: validation.msg,
      });
    }

    const isLocked = validation.user.gameLock?.[providerInfo.lock]?.lock;

    if (isLocked) {
      return res.status(200).json({
        code: 5010,
        msg: "Player blocked",
      });
    }

    if (existingBet) {
      return res.status(200).json({
        code: 5043,
        msg: "Bet record is duplicated/identical",
        data: {
          brand_uid: brand_uid,
          currency: currency,
          balance: roundToTwoDecimals(validation.user.wallet),
        },
      });
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        gameId: brand_uid,
        wallet: { $gte: roundToTwoDecimals(amount || 0) },
      },
      { $inc: { wallet: -roundToTwoDecimals(amount || 0) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res.status(200).json({
        code: 5003,
        msg: "Insufficient balance",
        data: {
          brand_uid: brand_uid,
          currency: currency,
          balance: roundToTwoDecimals(validation.user.wallet),
        },
      });
    }

    await SlotDCTGameModal.create({
      username: brand_uid,
      betamount: roundToTwoDecimals(amount || 0),
      betId: wager_id,
      tranId: round_id,
      bet: true,
      provider: providerInfo.name,
    });

    return res.status(200).json({
      code: 1000,
      msg: "Success",
      data: {
        brand_uid: brand_uid,
        currency: currency,
        balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
    });
  } catch (error) {
    console.log(
      "Hacksaw Error in game provider calling ae96 bet api",
      error.message
    );
    return res.status(200).json({
      code: 1001,
      msg: "System error",
    });
  }
});

router.post("/api/hacksaw/cancelWager", async (req, res) => {
  try {
    const { brand_id, sign, brand_uid, round_id, wager_id, currency } =
      req.body;

    if (!sign || !brand_uid || !brand_id) {
      return res.status(200).json({
        code: 5001,
        msg: "Request parameter error",
      });
    }

    const generatedsign = generateSignature({
      brandId: brand_id,
      params: [wager_id],
      apiKey: dctGameKey,
    });

    if (sign !== generatedsign) {
      return res.status(200).json({
        code: 5000,
        msg: "Verification code error",
      });
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne({ gameId: brand_uid }, { wallet: 1, _id: 1 }).lean(),
      SlotDCTGameModal.findOne(
        { tranId: round_id, betId: wager_id },
        { cancel: 1, betamount: 1, _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        code: 5009,
        msg: "Player's account or token does not exist",
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        code: 5042,
        msg: "Bet record does not exist.",
        data: {
          brand_uid: brand_uid,
          currency: currency,
          balance: roundToTwoDecimals(currentUser.wallet),
        },
      });
    }

    if (existingBet.cancel) {
      return res.status(200).json({
        code: 5043,
        msg: "Bet record is duplicated/identical",
        data: {
          brand_uid: brand_uid,
          currency: currency,
          balance: roundToTwoDecimals(currentUser.wallet),
        },
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: roundToTwoDecimals(existingBet.betamount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotDCTGameModal.updateOne(
        { tranId: round_id, betId: wager_id },
        { $set: { cancel: true, cancelId: wager_id } }
      ),
    ]);

    return res.status(200).json({
      code: 1000,
      msg: "Success",
      data: {
        brand_uid: brand_uid,
        currency: currency,
        balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
    });
  } catch (error) {
    console.log(
      "Hacksaw Error in game provider calling ae96 refund api",
      error.message
    );
    return res.status(200).json({
      code: 1001,
      msg: "System error",
    });
  }
});

router.post("/api/hacksaw/appendWager", async (req, res) => {
  try {
    const { brand_id, sign, brand_uid, round_id, amount, wager_id, currency } =
      req.body;

    if (!sign || !brand_uid || !brand_id) {
      return res.status(200).json({
        code: 5001,
        msg: "Request parameter error",
      });
    }

    const generatedsign = generateSignature({
      brandId: brand_id,
      params: [wager_id],
      apiKey: dctGameKey,
    });

    if (sign !== generatedsign) {
      return res.status(200).json({
        code: 5000,
        msg: "Verification code error",
      });
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne({ gameId: brand_uid }, { wallet: 1, _id: 1 }).lean(),
      SlotDCTGameModal.findOne({ appendId: wager_id }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        code: 5009,
        msg: "Player's account or token does not exist",
      });
    }
    if (existingBet) {
      return res.status(200).json({
        code: 5043,
        msg: "Bet record is duplicated/identical",
        data: {
          brand_uid: brand_uid,
          currency: currency,
          balance: roundToTwoDecimals(currentUser.wallet),
        },
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotDCTGameModal.updateOne(
        { tranId: round_id },
        {
          $set: {
            settle: true,
            settleamount: roundToTwoDecimals(amount),
            tranId: round_id,
            appendId: wager_id,
          },
        }
      ),
    ]);

    return res.status(200).json({
      code: 1000,
      msg: "Success",
      data: {
        brand_uid: brand_uid,
        currency: currency,
        balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
    });
  } catch (error) {
    console.log(
      "HACKSAW Error in game provider calling ae96 result api",
      error.message
    );
    return res.status(200).json({
      code: 1001,
      msg: "System error",
    });
  }
});

router.post("/api/hacksaw/endWager", async (req, res) => {
  try {
    const { brand_id, sign, brand_uid, round_id, amount, wager_id, currency } =
      req.body;
    if (!sign || !brand_uid || !brand_id) {
      return res.status(200).json({
        code: 5001,
        msg: "Request parameter error",
      });
    }

    const generatedsign = generateSignature({
      brandId: brand_id,
      params: [wager_id],
      apiKey: dctGameKey,
    });

    if (sign !== generatedsign) {
      return res.status(200).json({
        code: 5000,
        msg: "Verification code error",
      });
    }

    const [currentUser, existingBet, duplicateWager] = await Promise.all([
      User.findOne({ gameId: brand_uid }, { wallet: 1, _id: 1 }).lean(),
      SlotDCTGameModal.findOne(
        { tranId: round_id },
        { _id: 1, settle: 1, settleId: 1, settleamount: 1 }
      ).lean(),
      SlotDCTGameModal.findOne({ settleId: wager_id }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        code: 5009,
        msg: "Player's account or token does not exist",
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        code: 5042,
        msg: "Bet record does not exist.",
        data: {
          brand_uid: brand_uid,
          currency: currency,
          balance: roundToTwoDecimals(currentUser.wallet),
        },
      });
    }

    if (duplicateWager) {
      return res.status(200).json({
        code: 5043,
        msg: "Bet record is duplicated/identical",
        data: {
          brand_uid: brand_uid,
          currency: currency,
          balance: roundToTwoDecimals(currentUser.wallet),
        },
      });
    }

    const updateQuery = {
      $set: {
        settle: true,
        settleamount: roundToTwoDecimals(amount),
        settleId: wager_id,
        ...(existingBet.settle && { tranId: round_id }),
      },
    };

    const [updatedUserBalance] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotDCTGameModal.updateOne({ tranId: round_id }, updateQuery),
    ]);

    return res.status(200).json({
      code: 1000,
      msg: "Success",
      data: {
        brand_uid: brand_uid,
        currency: currency,
        balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
    });
  } catch (error) {
    console.log(
      "HACKSAW Error in game provider calling ae96 result api",
      error.message
    );
    return res.status(200).json({
      code: 1001,
      msg: "System error",
    });
  }
});

router.post("/api/hacksaw/freeSpinResult", async (req, res) => {
  try {
    const {
      brand_id,
      sign,
      brand_uid,
      round_id,
      amount,
      wager_id,
      currency,
      provider,
    } = req.body;

    if (!sign || !brand_uid || !brand_id) {
      return res.status(200).json({
        code: 5001,
        msg: "Request parameter error",
      });
    }

    const generatedsign = generateSignature({
      brandId: brand_id,
      params: [wager_id],
      apiKey: dctGameKey,
    });

    if (sign !== generatedsign) {
      return res.status(200).json({
        code: 5000,
        msg: "Verification code error",
      });
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne({ gameId: brand_uid }, { wallet: 1, _id: 1 }).lean(),
      SlotDCTGameModal.findOne({ freespinId: wager_id }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        code: 5009,
        msg: "Player's account or token does not exist",
      });
    }

    if (existingBet) {
      return res.status(200).json({
        code: 5043,
        msg: "Bet record is duplicated/identical",
        data: {
          brand_uid: brand_uid,
          currency: currency,
          balance: roundToTwoDecimals(currentUser.wallet),
        },
      });
    }

    const providerMap = {
      hs: { lock: "hacksaw", name: "HACKSAW" },
      relax: { lock: "relaxgaming", name: "RELAXGAMING" },
    };

    const providerInfo = providerMap[provider];

    if (!providerInfo) {
      return res.status(200).json({
        code: 5015,
        msg: "Invalid provider",
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotDCTGameModal.updateOne(
        { tranId: round_id },
        {
          $set: {
            settle: true,
            settleamount: roundToTwoDecimals(amount),
            tranId: round_id,
            freespinId: wager_id,
            provider: providerInfo.name,
          },
        },
        { upsert: true }
      ),
    ]);

    return res.status(200).json({
      code: 1000,
      msg: "Success",
      data: {
        brand_uid: brand_uid,
        currency: currency,
        balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
    });
  } catch (error) {
    console.log(
      "HACKSAW Error in game provider calling ae96 result api",
      error.message
    );
    return res.status(200).json({
      code: 1001,
      msg: "System error",
    });
  }
});

router.post("/api/hacksaw/promoPayout", async (req, res) => {
  try {
    const {
      brand_id,
      sign,
      brand_uid,
      trans_id,
      amount,
      promotion_id,
      currency,
      provider,
    } = req.body;

    if (!sign || !brand_uid || !brand_id) {
      return res.status(200).json({
        code: 5001,
        msg: "Request parameter error",
      });
    }

    const generatedsign = generateSignature({
      brandId: brand_id,
      params: [promotion_id, trans_id],
      apiKey: dctGameKey,
    });

    if (sign !== generatedsign) {
      return res.status(200).json({
        code: 5000,
        msg: "Verification code error",
      });
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne({ gameId: brand_uid }, { wallet: 1, _id: 1 }).lean(),
      SlotDCTGameModal.findOne(
        { betId: promotion_id, tranId: trans_id },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        code: 5009,
        msg: "Player's account or token does not exist",
      });
    }

    if (existingBet) {
      return res.status(200).json({
        code: 5043,
        msg: "Bet record is duplicated/identical",
        data: {
          brand_uid: brand_uid,
          currency: currency,
          balance: roundToTwoDecimals(currentUser.wallet),
        },
      });
    }

    const providerMap = {
      hs: { lock: "hacksaw", name: "HACKSAW" },
      relax: { lock: "relaxgaming", name: "RELAXGAMING" },
    };

    const providerInfo = providerMap[provider];

    if (!providerInfo) {
      return res.status(200).json({
        code: 5015,
        msg: "Invalid provider",
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
      SlotDCTGameModal.create({
        username: brand_uid,
        betamount: 0,
        settleamount: roundToTwoDecimals(amount),
        betId: promotion_id,
        tranId: trans_id,
        bet: true,
        settle: true,
        provider: providerInfo.name,
      }),
    ]);

    return res.status(200).json({
      code: 1000,
      msg: "Success",
      data: {
        brand_uid: brand_uid,
        currency: currency,
        balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
    });
  } catch (error) {
    console.log(
      "HACKSAW Error in game provider calling ae96 result api",
      error.message
    );
    return res.status(200).json({
      code: 1001,
      msg: "System error",
    });
  }
});

router.post("/api/hacksaw/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotDCTGameModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      cancel: { $ne: true },
      settle: true,
      provider: "HACKSAW",
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
        console.warn(`Hacksaw User not found for gameId: ${gameId}`);
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
        gamename: "HACKSAW",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("HACKSAW: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "HACKSAW: Failed to fetch win/loss report",
        zh: "HACKSAW: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/hacksaw/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotDCTGameModal.find({
        username: user.gameId,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        settle: true,
        provider: "HACKSAW",
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
          gamename: "HACKSAW",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("HACKSAW: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "HACKSAW: Failed to fetch win/loss report",
          zh: "HACKSAW: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/hacksaw/:userId/gamedata",
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

          if (gameCat["HACKSAW"]) {
            totalTurnover += gameCat["HACKSAW"].turnover || 0;
            totalWinLoss += gameCat["HACKSAW"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "HACKSAW",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("HACKSAW: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "HACKSAW: Failed to fetch win/loss report",
          zh: "HACKSAW: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/hacksaw/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotDCTGameModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        settle: true,
        provider: "HACKSAW",
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
          gamename: "HACKSAW",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("HACKSAW: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "HACKSAW: Failed to fetch win/loss report",
          zh: "HACKSAW: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/hacksaw/kioskreport",
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

          if (gameCat["HACKSAW"]) {
            totalTurnover += Number(gameCat["HACKSAW"].turnover || 0);
            totalWinLoss += Number(gameCat["HACKSAW"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "HACKSAW",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("HACKSAW: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "HACKSAW: Failed to fetch win/loss report",
          zh: "HACKSAW: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.post("/api/relaxgaming/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotDCTGameModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      cancel: { $ne: true },
      settle: true,
      provider: "RELAXGAMING",
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
        console.warn(`Relax GAming User not found for gameId: ${gameId}`);
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
        gamename: "RELAX GAMING",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log(
      "RELAX GAMING: Failed to fetch win/loss report:",
      error.message
    );
    return res.status(500).json({
      success: false,
      message: {
        en: "RELAX GAMING: Failed to fetch win/loss report",
        zh: "RELAX GAMING: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/relaxgaming/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotDCTGameModal.find({
        username: user.gameId,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        settle: true,
        provider: "RELAXGAMING",
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
          gamename: "RELAX GAMING",
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
        "RELAX GAMING: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "RELAX GAMING: Failed to fetch win/loss report",
          zh: "RELAX GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/relaxgaming/:userId/gamedata",
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

          if (gameCat["RELAX GAMING"]) {
            totalTurnover += gameCat["RELAX GAMING"].turnover || 0;
            totalWinLoss += gameCat["RELAX GAMING"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "RELAX GAMING",
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
        "RELAX GAMING: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "RELAX GAMING: Failed to fetch win/loss report",
          zh: "RELAX GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/relaxgaming/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotDCTGameModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        settle: true,
        provider: "RELAXGAMING",
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
          gamename: "RELAX GAMING",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("RELAX GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "RELAX GAMING: Failed to fetch win/loss report",
          zh: "RELAX GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/relaxgaming/kioskreport",
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

          if (gameCat["RELAX GAMING"]) {
            totalTurnover += Number(gameCat["RELAX GAMING"].turnover || 0);
            totalWinLoss += Number(gameCat["RELAX GAMING"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "RELAX GAMING",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("RELAX GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "RELAX GAMING: Failed to fetch win/loss report",
          zh: "RELAX GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);
module.exports = router;
