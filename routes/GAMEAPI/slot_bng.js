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
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const GameWalletLog = require("../../models/gamewalletlog.model");
const Decimal = require("decimal.js");
const GameBNGGameModal = require("../../models/slot_bngDatabase.model");
const SlotBNGModal = require("../../models/slot_bng.model");

require("dotenv").config();

const webURL = "https://www.bm8my.vip/";
const bngAPIURL = "https://gate.c3.bng.games/op/";
const bngSecret = process.env.BNG_SECRET;
const bngProjectName = "egm8myr";
const cashierURL = "https://www.bm8my.vip/myaccount/deposit";
const brandName = "egm8my";
const bngTitle = "EGM8MY";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
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

router.post("/api/bng/comparegamelist", async (req, res) => {
  try {
    console.log("🔍 Starting BNG game list comparison...");

    // Step 1: Fetch games from BNG API
    const requestPayload = {
      api_token: bngSecret,
    };

    const response = await axios.post(
      `${bngAPIURL}/${bngProjectName}/api/v1/game/list/`,
      requestPayload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.data || !response.data.items) {
      return res.status(200).json({
        success: false,
        message: {
          en: "BNG: No game data received from provider.",
          zh: "BNG: 未从提供商处接收到游戏数据。",
          ms: "BNG: Tiada data permainan diterima daripada pembekal.",
          zh_hk: "BNG: 未從提供商處接收到遊戲數據。",
          id: "BNG: Tidak ada data permainan yang diterima dari penyedia.",
        },
      });
    }

    const apiGames = response.data.items;
    console.log(`📊 Found ${apiGames.length} games from BNG API`);

    // Step 2: Fetch all games from database
    const dbGames = await GameBNGGameModal.find({});
    console.log(`💾 Found ${dbGames.length} games in database`);

    // Step 3: Create maps for comparison
    const apiGameMap = new Map();
    apiGames.forEach((game) => {
      apiGameMap.set(game.game_id, game);
    });

    const dbGameMap = new Map();
    dbGames.forEach((game) => {
      dbGameMap.set(game.gameID, game);
    });

    // Step 4: Find missing games (in API but not in DB)
    const missingGames = [];
    apiGames.forEach((apiGame) => {
      if (!dbGameMap.has(apiGame.game_id)) {
        missingGames.push({
          game_id: apiGame.game_id,
          game_name: apiGame.game_name,
          type: apiGame.type,
          provider_name: apiGame.provider_name,
          title_en: apiGame.i18n?.en?.title || "N/A",
          title_zh: apiGame.i18n?.zh?.title || "N/A",
          banner_en: apiGame.i18n?.en?.banner_path || "N/A",
          release_date: apiGame.release_date,
        });
      }
    });

    // Step 5: Find extra games (in DB but not in API) and set maintenance to true
    const extraGames = [];
    const updatePromises = [];

    for (const dbGame of dbGames) {
      if (!apiGameMap.has(dbGame.gameID)) {
        extraGames.push({
          game_id: dbGame.gameID,
          game_name_en: dbGame.gameNameEN,
          game_name_cn: dbGame.gameNameCN,
          type: dbGame.gameType,
          current_maintenance: dbGame.maintenance,
        });

        // Set maintenance to true for games not in API
        if (!dbGame.maintenance) {
          updatePromises.push(
            GameBNGGameModal.findByIdAndUpdate(
              dbGame._id,
              { maintenance: true },
              { new: true }
            )
          );
        }
      }
    }

    // Execute all maintenance updates
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
      console.log(`🔧 Set ${updatePromises.length} games to maintenance mode`);
    }

    // Step 6: Summary statistics
    const summary = {
      totalApiGames: apiGames.length,
      totalDbGames: dbGames.length,
      missingCount: missingGames.length,
      extraCount: extraGames.length,
      matchingCount: apiGames.length - missingGames.length,
      updatedMaintenanceCount: updatePromises.length,
    };

    console.log("📈 Comparison Summary:", summary);

    return res.status(200).json({
      success: true,
      summary: summary,
      missingGames: missingGames,
      extraGames: extraGames,
      message: {
        en: `Comparison complete. Found ${missingGames.length} missing games and ${extraGames.length} extra games.`,
        zh: `比较完成。发现 ${missingGames.length} 个缺失游戏和 ${extraGames.length} 个额外游戏。`,
        ms: `Perbandingan selesai. Menemui ${missingGames.length} permainan hilang dan ${extraGames.length} permainan tambahan.`,
        zh_hk: `比較完成。發現 ${missingGames.length} 個缺失遊戲和 ${extraGames.length} 個額外遊戲。`,
        id: `Perbandingan selesai. Menemukan ${missingGames.length} game yang hilang dan ${extraGames.length} game tambahan.`,
      },
    });
  } catch (error) {
    console.error("❌ BNG error in comparing game list:", error);
    if (error.response) {
      console.error("BNG API Error Response:", error.response.data);
    }

    return res.status(200).json({
      success: false,
      message: {
        en: "BNG: Failed to compare game lists. Please try again or contact customer service for assistance.",
        zh: "BNG: 比较游戏列表失败，请重试或联系客服以获得帮助。",
        ms: "BNG: Gagal membandingkan senarai permainan. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "BNG: 比較遊戲列表失敗，請重試或聯絡客服以獲得幫助。",
        id: "BNG: Gagal membandingkan daftar permainan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

// async function updateBNGManualOrderTimestamps() {
//   try {
//     // List of gameIDs in order (460 = latest, 151 = oldest)
//     const gameIds = [
//       "460",
//       "774",
//       "461",
//       "770",
//       "768",
//       "530",
//       "769",
//       "698",
//       "659",
//       "661",
//       "696",
//       "456",
//       "458",
//       "451",
//       "658",
//       "447",
//       "495",
//       "450",
//       "449",
//       "448",
//       "446",
//       "445",
//       "699",
//       "497",
//       "496",
//       "589",
//       "695",
//       "657",
//       "570",
//       "596",
//       "586",
//       "569",
//       "607",
//       "594",
//       "587",
//       "583",
//       "585",
//       "611",
//       "568",
//       "574",
//       "610",
//       "595",
//       "620",
//       "563",
//       "571",
//       "580",
//       "603",
//       "593",
//       "609",
//       "369",
//       "437",
//       "616",
//       "252",
//       "454",
//       "395",
//       "168",
//       "567",
//       "621",
//       "584",
//       "588",
//       "592",
//       "579",
//       "617",
//       "619",
//       "614",
//       "566",
//       "618",
//       "602",
//       "576",
//       "605",
//       "582",
//       "581",
//       "572",
//       "166",
//       "442",
//       "372",
//       "285",
//       "384",
//       "355",
//       "459",
//       "457",
//       "453",
//       "444",
//       "441",
//       "436",
//       "433",
//       "400",
//       "396",
//       "391",
//       "387",
//       "385",
//       "382",
//       "381",
//       "379",
//       "377",
//       "376",
//       "370",
//       "368",
//       "318",
//       "360",
//       "317",
//       "359",
//       "356",
//       "316",
//       "305",
//       "313",
//       "309",
//       "315",
//       "312",
//       "308",
//       "300",
//       "302",
//       "296",
//       "301",
//       "297",
//       "288",
//       "292",
//       "287",
//       "291",
//       "286",
//       "283",
//       "280",
//       "278",
//       "276",
//       "274",
//       "272",
//       "270",
//       "266",
//       "262",
//       "259",
//       "261",
//       "256",
//       "254",
//       "250",
//       "249",
//       "242",
//       "237",
//       "236",
//       "231",
//       "228",
//       "219",
//       "216",
//       "212",
//       "209",
//       "202",
//       "201",
//       "200",
//       "197",
//       "187",
//       "183",
//       "181",
//       "178",
//       "173",
//       "157",
//       "151",
//     ];

//     // Start from current time + 5 months for the latest game (460)
//     const currentTime = new Date();
//     const startTime = new Date(
//       currentTime.getTime() + 5 * 30 * 24 * 60 * 60 * 1000
//     ); // Add 5 months (150 days)

//     console.log(`Starting BNG timestamp update...`);
//     console.log(`Total games to update: ${gameIds.length}`);
//     console.log(`Start time (latest game): ${startTime.toISOString()}`);

//     // Process each gameID with 30-minute intervals
//     for (let i = 0; i < gameIds.length; i++) {
//       const gameId = gameIds[i];

//       // Calculate timestamp: latest game gets start time (current + 5 months), each subsequent game is 30 minutes older
//       const timestamp = new Date(startTime.getTime() - i * 30 * 60 * 1000); // 30 minutes = 30 * 60 * 1000 milliseconds

//       // Update the document directly in the collection, bypassing schema timestamps
//       const result = await GameBNGGameModal.collection.updateOne(
//         { gameID: gameId },
//         {
//           $set: {
//             createdAt: timestamp,
//             updatedAt: new Date(),
//           },
//         }
//       );

//       if (result.matchedCount > 0) {
//         console.log(
//           `✅ Updated BNG gameID ${gameId} with timestamp: ${timestamp.toISOString()}`
//         );
//       } else {
//         console.log(`❌ BNG GameID ${gameId} not found in database`);
//       }
//     }

//     console.log("\n✅ BNG manual order timestamp update completed!");
//     console.log(
//       `Start time was set to: ${startTime.toISOString()} (current time + 5 months)`
//     );

//     // Verify the updates by fetching and displaying the results
//     const updatedGames = await GameBNGGameModal.find(
//       { gameID: { $in: gameIds } },
//       {
//         gameID: 1,
//         createdAt: 1,
//         gameNameEN: 1,
//         gameNameCN: 1,
//         hot: 1,
//         maintenance: 1,
//       }
//     ).sort({ createdAt: -1 });

//     console.log(
//       "\n📊 Verification - BNG Games ordered by createdAt (newest first):"
//     );
//     updatedGames.forEach((game, index) => {
//       console.log(
//         `${index + 1}. GameID: ${game.gameID.padEnd(
//           4
//         )} | CreatedAt: ${game.createdAt.toISOString()} | Hot: ${
//           game.hot || false
//         } | Maintenance: ${game.maintenance || false} | Name: ${
//           game.gameNameEN || game.gameNameCN || "N/A"
//         }`
//       );
//     });

//     console.log(
//       `\n📈 Total games updated: ${updatedGames.length}/${gameIds.length}`
//     );

//     // Show games that were not found
//     const foundGameIds = updatedGames.map((g) => g.gameID);
//     const notFoundGameIds = gameIds.filter((id) => !foundGameIds.includes(id));

//     if (notFoundGameIds.length > 0) {
//       console.log(
//         `\n⚠️  Games not found in database (${notFoundGameIds.length}):`
//       );
//       notFoundGameIds.forEach((id) => console.log(`   - ${id}`));
//     }

//     // Display time range
//     if (updatedGames.length > 0) {
//       const oldestTimestamp = new Date(
//         startTime.getTime() - (gameIds.length - 1) * 30 * 60 * 1000
//       );
//       console.log(`\n⏰ Time range:`);
//       console.log(`   Latest (460): ${startTime.toISOString()}`);
//       console.log(`   Oldest (151): ${oldestTimestamp.toISOString()}`);
//       console.log(
//         `   Total span: ${(gameIds.length - 1) * 30} minutes (${(
//           ((gameIds.length - 1) * 30) /
//           60
//         ).toFixed(1)} hours)`
//       );
//     }
//   } catch (error) {
//     console.error("❌ Error updating BNG manual order timestamps:", error);
//   }
// }

// // Call the function
// updateBNGManualOrderTimestamps();

router.post("/api/bng/getprovidergamelist", async (req, res) => {
  try {
    const { provider_id } = req.body; // Optional provider_id filter

    console.log("🎮 BNG GetGameList Request:", {
      provider_id: provider_id || "all",
    });

    // Prepare request payload according to BNG API documentation
    const requestPayload = {
      api_token: bngSecret, // Using BNG_SECRET as API_TOKEN
    };

    // Add provider_id if specified
    // if (provider_id) {
    //   requestPayload.provider_id = provider_id;
    // }

    console.log("📤 BNG API Request Payload:", requestPayload);

    // Make API request to BNG
    const response = await axios.post(
      `${bngAPIURL}/${bngProjectName}/api/v1/game/list/`,
      requestPayload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("📥 BNG API Response received");
    console.log("Response data:", response.data);

    // Check if response has items
    if (!response.data || !response.data.items) {
      return res.status(200).json({
        success: false,
        message: {
          en: "BNG: No game data received from provider.",
          zh: "BNG: 未从提供商处接收到游戏数据。",
          ms: "BNG: Tiada data permainan diterima daripada pembekal.",
          zh_hk: "BNG: 未從提供商處接收到遊戲數據。",
          id: "BNG: Tidak ada data permainan yang diterima dari penyedia.",
        },
      });
    }

    const gameItems = response.data.items;
    console.log(`📊 Received ${gameItems.length} games from BNG API`);

    return res.status(200).json({
      success: true,
      gameList: response.data,
      message: {
        en: "Game list retrieved successfully.",
        zh: "游戏列表获取成功。",
        ms: "Senarai permainan berjaya diambil.",
        zh_hk: "遊戲列表獲取成功。",
        id: "Daftar permainan berhasil diambil.",
      },
    });
  } catch (error) {
    console.error("❌ BNG error in getting game list:", error);
    if (error.response) {
      console.error("BNG API Error Response:", error.response.data);
    }

    return res.status(200).json({
      success: false,
      message: {
        en: "BNG: Failed to retrieve game list. Please try again or contact customer service for assistance.",
        zh: "BNG: 获取游戏列表失败，请重试或联系客服以获得帮助。",
        ms: "BNG: Gagal mengambil senarai permainan. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "BNG: 獲取遊戲列表失敗，請重試或聯絡客服以獲得幫助。",
        id: "BNG: Gagal mengambil daftar permainan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/bng/getgamelist", async (req, res) => {
  try {
    const games = await GameBNGGameModal.find({
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
      GameImageZH: game.imageUrlCN || "",
      Hot: game.hot,
      RTP: game.rtpRate,
    }));

    return res.status(200).json({
      success: true,
      gamelist: reformattedGamelist,
    });
  } catch (error) {
    console.error("BNG Error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "BNG: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "BNG: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "BNG: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "BNG: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "BNG: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/bng/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameCode, gameLang, clientPlatform } = req.body;
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

    if (user.gameLock.bng.lock) {
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
      lang = "zh";
    } else if (gameLang === "ms") {
      lang = "en";
    } else if (gameLang === "id") {
      lang = "id";
    } else if (gameLang === "zh_hk") {
      lang = "zh-hant";
    }

    let platform = "desktop";
    if (clientPlatform === "web") {
      platform = "desktop";
    } else if (clientPlatform === "mobile") {
      platform = "mobile";
    }

    let logintoken = `${user.gameId}_${generateRandomCode()}`;

    const timestamp = Date.now();

    const gameRunnerParams = new URLSearchParams({
      token: logintoken,
      game: gameCode,
      ts: timestamp.toString(),
      platform: platform,
      lang: lang,
      title: bngTitle,
      exit_url: webURL,
      cashier_url: cashierURL,
    });

    const response = await axios.get(
      `${bngAPIURL}/${bngProjectName}/game/url/?${gameRunnerParams.toString()}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Game-Launcher/1.0)",
        },
      }
    );

    if (!response.data.url) {
      console.log("BNG fail to launch game with error", response.data);
      return res.status(200).json({
        success: false,
        message: {
          en: "BNG: Game launch failed. Please try again or customer service for assistance.",
          zh: "BNG: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "BNG: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "BNG: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "BNG: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000);

    await User.findByIdAndUpdate(
      user._id,
      {
        $push: {
          bngGameTokens: {
            token: logintoken,
            createdAt: now,
            expiresAt: expiresAt,
          },
        },
      },
      { new: true }
    );

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "BNG"
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data.url,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("BNG error in launching game", error);
    return res.status(200).json({
      success: false,
      message: {
        en: "BNG: Game launch failed. Please try again or customer service for assistance.",
        zh: "BNG: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "BNG: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "BNG: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "BNG: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/bngprod", async (req, res) => {
  try {
    const {
      name,
      token,
      uid,
      session,
      game_id,
      game_name,
      provider_id,
      provider_name,
      c_at,
      sent_at,
      args,
    } = req.body;

    if (!name || !uid) {
      return res.status(200).json({
        uid: uid || "",
        error: { code: "INVALID_TOKEN" },
      });
    }

    switch (name) {
      case "login": {
        if (!token || !session || !game_id) {
          return res.status(200).json({
            uid: uid,
            error: { code: "INVALID_TOKEN" },
          });
        }

        const tokenParts = token.split("_");
        const username = tokenParts[0];

        const currentUser = await User.findOne(
          { gameId: username },
          {
            wallet: 1,
            bngGameTokens: 1,
            gameId: 1,
            bngbalanceVersion: 1,
            _id: 1,
          }
        );

        if (!currentUser) {
          console.log("❌ User not found:", username);
          return res.status(200).json({
            uid: uid,
            error: { code: "INVALID_TOKEN" },
          });
        }

        const validToken = currentUser.bngGameTokens?.find(
          (t) => t.token === token
        );

        if (!validToken) {
          console.log("❌ Token not found");
          return res.status(200).json({
            uid: uid,
            error: { code: "EXPIRED_TOKEN" },
          });
        }

        const newBalanceVersion = (currentUser.bngbalanceVersion || 0) + 1;

        await User.findByIdAndUpdate(currentUser._id, {
          $set: { bngbalanceVersion: newBalanceVersion },
        });

        return res.status(200).json({
          uid,
          player: {
            id: username,
            brand: brandName,
            currency: "MYR",
            mode: "REAL",
            is_test: false,
          },
          balance: {
            value: roundToTwoDecimals(currentUser.wallet).toString(),
            version: newBalanceVersion,
          },
          tag: "",
        });
      }

      case "transaction": {
        const tokenParts = token.split("_");
        const username = tokenParts[0];

        if (
          !token ||
          !session ||
          !args ||
          typeof args.round_id === "undefined"
        ) {
          return res.status(200).json({
            uid: uid,
            error: { code: "INVALID_TOKEN" },
          });
        }

        // Check for duplicate transaction using UID
        const existingTransaction = await SlotBNGModal.findOne(
          {
            tranId: uid,
          },
          {
            _id: 1,
          }
        ).lean();

        const currentUser = await User.findOne(
          { gameId: username },
          {
            wallet: 1,
            "gameLock.bng.lock": 1,
            bngGameTokens: 1,
            bngbalanceVersion: 1,
            _id: 1,
          }
        );
        const newBalanceVersion = (currentUser.bngbalanceVersion || 0) + 1;

        if (existingTransaction) {
          await User.findByIdAndUpdate(currentUser._id, {
            $set: { bngbalanceVersion: newBalanceVersion },
          });

          return res.status(200).json({
            uid,
            balance: {
              value: roundToTwoDecimals(currentUser.wallet).toString(),
              version: newBalanceVersion || 0,
            },
          });
        }

        if (!currentUser) {
          console.log("❌ User not found in transaction:", username);
          return res.status(200).json({
            uid: uid,
            error: { code: "SESSION_CLOSED" },
          });
        }

        const validToken = currentUser.bngGameTokens?.find(
          (t) => t.token === token
        );

        if (!validToken) {
          console.log("❌ Invalid token in transaction");
          return res.status(200).json({
            uid: uid,
            balance: {
              value: roundToTwoDecimals(currentUser.wallet).toString(),
              version: currentUser.bngbalanceVersion || 0,
            },
            error: { code: "SESSION_CLOSED" },
          });
        }

        if (currentUser.gameLock?.bng?.lock) {
          console.log("❌ User game locked");
          return res.status(200).json({
            uid: uid,
            balance: {
              value: roundToTwoDecimals(currentUser.wallet).toString(),
              version: currentUser.bngbalanceVersion || 0,
            },
            error: { code: "SESSION_CLOSED" },
          });
        }

        const betAmount = args.bonus ? 0 : args.bet ? parseFloat(args.bet) : 0;
        const winAmount = args.win ? parseFloat(args.win) : 0;

        const netAmount = winAmount - betAmount;

        const updatedUserBalance = await User.findOneAndUpdate(
          {
            gameId: username,
            wallet: { $gte: roundToTwoDecimals(betAmount || 0) },
          },
          {
            $inc: { wallet: roundToTwoDecimals(netAmount) },
            $set: {
              bngbalanceVersion: newBalanceVersion,
            },
          },
          { new: true, projection: { wallet: 1, bngbalanceVersion: 1 } }
        ).lean();

        if (!updatedUserBalance) {
          await User.findByIdAndUpdate(currentUser._id, {
            $set: { bngbalanceVersion: newBalanceVersion },
          });

          return res.status(200).json({
            uid: uid,
            balance: {
              value: roundToTwoDecimals(currentUser.wallet).toString(),
              version: newBalanceVersion || 0,
            },
            error: { code: "FUNDS_EXCEED" },
          });
        }

        const result = await SlotBNGModal.findOneAndUpdate(
          {
            betId: args.round_id,
            settleamount: 0,
            betamount: 0,
          },
          {
            $set: {
              settleamount: winAmount,
              betamount: betAmount,
              settle: true,
              bet: true,
            },
          },
          {
            new: true,
            lean: true,
          }
        );

        if (!result) {
          await SlotBNGModal.create({
            tranId: uid,
            username: username,
            betamount: betAmount,
            settleamount: winAmount,
            betId: args.round_id,
            settle: true,
            bet: true,
          });
        }

        return res.status(200).json({
          uid,
          balance: {
            value: roundToTwoDecimals(updatedUserBalance.wallet).toString(),
            version: updatedUserBalance.bngbalanceVersion,
          },
        });
      }

      case "getbalance": {
        const tokenParts = token.split("_");
        const username = tokenParts[0];

        const currentUser = await User.findOne(
          { gameId: username },
          { wallet: 1, bngbalanceVersion: 1 }
        ).lean();

        const newBalanceVersion = (currentUser.bngbalanceVersion || 0) + 1;

        await User.findByIdAndUpdate(currentUser._id, {
          $set: { bngbalanceVersion: newBalanceVersion },
        });

        return res.status(200).json({
          uid,
          balance: {
            value: roundToTwoDecimals(currentUser.wallet).toString(),
            version: newBalanceVersion || 0,
          },
        });
      }

      case "rollback": {
        const currentUser = await User.findOne(
          { gameId: args.player.id },
          { wallet: 1, bngbalanceVersion: 1, _id: 1 }
        ).lean();

        const betAmount = args.bet ? parseFloat(args.bet) : 0;
        const winAmount = args.win ? parseFloat(args.win) : 0;

        const originalTransaction = await SlotBNGModal.findOne(
          { tranId: args.transaction_uid },
          { cancel: 1, betamount: 1 }
        ).lean();

        const newBalanceVersion = (currentUser.bngbalanceVersion || 0) + 1;

        if (!originalTransaction) {
          await SlotBNGModal.create({
            tranId: args.transaction_uid,
            username: args.player.id,
            betamount: betAmount,
            settleamount: winAmount,
            betId: args.round_id,
            settle: true,
            bet: true,
            cancel: true,
          });

          await User.findByIdAndUpdate(currentUser._id, {
            $set: { bngbalanceVersion: newBalanceVersion },
          });

          return res.status(200).json({
            uid,
            balance: {
              value: roundToTwoDecimals(currentUser.wallet).toString(),
              version: newBalanceVersion,
            },
          });
        }

        if (originalTransaction.cancel) {
          await User.findByIdAndUpdate(currentUser._id, {
            $set: { bngbalanceVersion: newBalanceVersion },
          });

          return res.status(200).json({
            uid,
            balance: {
              value: roundToTwoDecimals(currentUser.wallet).toString(),
              version: newBalanceVersion,
            },
          });
        }

        const netAmount = betAmount - winAmount;

        const [updatedUserBalance] = await Promise.all([
          User.findOneAndUpdate(
            { gameId: args.player.id },
            {
              $inc: { wallet: roundToTwoDecimals(netAmount) },
              $set: {
                bngbalanceVersion: newBalanceVersion,
              },
            },
            { new: true, projection: { wallet: 1, bngbalanceVersion: 1 } }
          ).lean(),

          SlotBNGModal.updateMany(
            { betId: args.round_id },
            { $set: { cancel: true } }
          ),
        ]);

        return res.status(200).json({
          uid,
          balance: {
            value: roundToTwoDecimals(updatedUserBalance.wallet).toString(),
            version: updatedUserBalance.bngbalanceVersion,
          },
        });
      }

      case "logout": {
        return res.status(200).json({
          uid,
        });
      }

      default: {
        return res.status(500).json({
          msg: `Invalid Name ${uid}`,
        });
      }
    }
  } catch (error) {
    console.error("❌ BNG API Error:", error.message);

    return res.status(500).json({
      msg: `Internal Server Error`,
    });
  }
});

router.post("/api/bng/getturnoverforrebate", async (req, res) => {
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

    console.log("BNG QUERYING TIME", startDate, endDate);

    const records = await SlotBNGModal.find({
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
        console.warn(`BNG User not found for gameId: ${gameId}`);
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
        gamename: "BNG",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("BNG: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "BNG: Failed to fetch win/loss report",
        zh: "BNG: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/bng/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotBNGModal.find({
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
          gamename: "BNG",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("BNG: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "BNG: Failed to fetch win/loss report",
          zh: "BNG: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/bng/:userId/gamedata",
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

          if (slotGames["BNG"]) {
            totalTurnover += slotGames["BNG"].turnover || 0;
            totalWinLoss += slotGames["BNG"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "BNG",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("BNG: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "BNG: Failed to fetch win/loss report",
          zh: "BNG: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/bng/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotBNGModal.find({
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
          gamename: "BNG",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("BNG: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "BNG: Failed to fetch win/loss report",
          zh: "BNG: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/bng/kioskreport",
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

          if (liveCasino["BNG"]) {
            totalTurnover += Number(liveCasino["BNG"].turnover || 0);
            totalWinLoss += Number(liveCasino["BNG"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "BNG",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("BNG: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "BNG: Failed to fetch win/loss report",
          zh: "BNG: 获取盈亏报告失败",
        },
      });
    }
  }
);

module.exports = router;
