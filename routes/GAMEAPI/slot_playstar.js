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
const SlotPlayStarModal = require("../../models/slot_playstar.model");
const GamePlayStarGameModal = require("../../models/slot_playstarDatabase.model");
require("dotenv").config();

const webURL = "https://www.bm8my.vip/";
const playstarAPIURL = "https://api-sg3-g2.egdoebdg.com";
const playstarHostId = process.env.PLAYSTAR_SECRET;

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
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

// async function updateBTGamingManualOrderTimestampsPlus() {
//   try {
//     // List of gameIDs in order (AB1541 = latest, AB1501 = oldest)
//     const gameIds = [
//       "PSS-ON-00166",
//       "PSS-ON-00165",
//       "PSS-ON-00163",
//       "PSS-ON-00156",
//       "PSS-ON-00146",
//       "PSS-ON-00159",
//       "PSS-ON-00091",
//       "PSS-ON-00127",
//       "PSS-ON-00160",
//       "PSS-ON-00141",
//       "PSS-ON-00161",
//       "PSS-ON-00147",
//       "PSS-ON-00151",
//       "PSS-ON-00107",
//       "PSS-ON-00148",
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
//       const result = await GamePlayStarGameModal.collection.updateOne(
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
//     const updatedGames = await GamePlayStarGameModal.find(
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

router.post("/api/playstar/compare-and-sync-games", async (req, res) => {
  try {
    console.log("🔄 Starting PlayStar games comparison and sync...");

    // Get games from PlayStar API
    const response = await axios.get(
      `${playstarAPIURL}/feed/gamelist?host_id=${playstarHostId}&order=1`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const apiGames = response.data;

    // Validate response format
    if (!Array.isArray(apiGames)) {
      throw new Error("Invalid response format from PlayStar API");
    }

    console.log(`📊 Found ${apiGames.length} games from PlayStar API`);

    // Get all games from your database
    const dbGames = await GamePlayStarGameModal.find(
      {},
      {
        gameID: 1,
        gameNameEN: 1,
        maintenance: 1,
        hot: 1,
        _id: 1,
      }
    );

    console.log(`📊 Found ${dbGames.length} games in database`);

    // Create sets for comparison
    const apiGameIds = new Set(apiGames.map((game) => game.game_id));
    const dbGameIds = new Set(dbGames.map((game) => game.gameID));

    console.log(
      `🎯 API Game IDs:`,
      Array.from(apiGameIds).slice(0, 10).join(", "),
      "..."
    );
    console.log(
      `🎯 DB Game IDs:`,
      Array.from(dbGameIds).slice(0, 10).join(", "),
      "..."
    );

    // Find missing games (in API but not in DB)
    const missingGames = apiGames.filter(
      (apiGame) => !dbGameIds.has(apiGame.game_id)
    );

    // Find extra games (in DB but not in API)
    const extraGames = dbGames.filter(
      (dbGame) => !apiGameIds.has(dbGame.gameID)
    );

    // Find existing games (in both API and DB)
    const existingGames = dbGames.filter((dbGame) =>
      apiGameIds.has(dbGame.gameID)
    );

    console.log(`📈 Missing games (in API, not in DB): ${missingGames.length}`);
    console.log(`📉 Extra games (in DB, not in API): ${extraGames.length}`);
    console.log(`✅ Existing games (in both): ${existingGames.length}`);

    const updatePromises = [];
    const results = {
      missingGames: [],
      extraGamesUpdated: [],
      existingGamesUpdated: [],
      errors: [],
    };

    // Handle extra games - set maintenance = true
    console.log("\n🔧 Processing extra games (setting maintenance = true)...");
    for (const extraGame of extraGames) {
      if (!extraGame.maintenance) {
        // Only update if maintenance is currently false
        console.log(
          `  🔧 Setting maintenance=true for: ${extraGame.gameID} - ${extraGame.gameNameEN}`
        );

        updatePromises.push(
          GamePlayStarGameModal.findByIdAndUpdate(
            extraGame._id,
            { $set: { maintenance: true } },
            { new: true }
          )
            .then((updated) => {
              if (updated) {
                results.extraGamesUpdated.push({
                  gameID: extraGame.gameID,
                  gameName: extraGame.gameNameEN,
                  action: "Set maintenance = true",
                  reason: "Game not found in PlayStar API",
                });
              }
              return updated;
            })
            .catch((error) => {
              results.errors.push({
                gameID: extraGame.gameID,
                error: error.message,
                action: "Failed to set maintenance = true",
              });
              return null;
            })
        );
      } else {
        console.log(
          `  ⏭️ Already in maintenance: ${extraGame.gameID} - ${extraGame.gameNameEN}`
        );
        results.extraGamesUpdated.push({
          gameID: extraGame.gameID,
          gameName: extraGame.gameNameEN,
          action: "Already in maintenance",
          reason: "Game not found in PlayStar API",
        });
      }
    }

    // Handle existing games - set maintenance = false
    console.log(
      "\n✅ Processing existing games (setting maintenance = false)..."
    );
    for (const existingGame of existingGames) {
      if (existingGame.maintenance) {
        // Only update if maintenance is currently true
        console.log(
          `  ✅ Setting maintenance=false for: ${existingGame.gameID} - ${existingGame.gameNameEN}`
        );

        updatePromises.push(
          GamePlayStarGameModal.findByIdAndUpdate(
            existingGame._id,
            { $set: { maintenance: false } },
            { new: true }
          )
            .then((updated) => {
              if (updated) {
                results.existingGamesUpdated.push({
                  gameID: existingGame.gameID,
                  gameName: existingGame.gameNameEN,
                  action: "Set maintenance = false",
                  reason: "Game found in PlayStar API",
                });
              }
              return updated;
            })
            .catch((error) => {
              results.errors.push({
                gameID: existingGame.gameID,
                error: error.message,
                action: "Failed to set maintenance = false",
              });
              return null;
            })
        );
      } else {
        console.log(
          `  ⏭️ Already active: ${existingGame.gameID} - ${existingGame.gameNameEN}`
        );
      }
    }

    // Process missing games - just collect for return
    console.log("\n📝 Processing missing games...");
    for (const missingGame of missingGames) {
      console.log(
        `  📝 Missing: ${missingGame.game_id} - ${missingGame.game_name["en-US"]}`
      );
      results.missingGames.push({
        gameID: missingGame.game_id,
        gameName: {
          en: missingGame.game_name["en-US"] || "",
          zh: missingGame.game_name["zh-CN"] || "",
          zh_hk: missingGame.game_name["zh-TW"] || "",
          th: missingGame.game_name["th-TH"] || "",
        },
        type: missingGame.type,
        category: missingGame.category,
        volatility: missingGame.volatility,
        feature: missingGame.feature,
        minBet: missingGame.min_bet,
        maxBet: missingGame.max_bet,
        jackpotGroup: missingGame.jackpot_group,
        order: missingGame.order,
        reason: "Game found in PlayStar API but not in database",
      });
    }

    // Execute all updates
    console.log(`\n🚀 Executing ${updatePromises.length} database updates...`);
    const updateResults = await Promise.all(updatePromises);
    const successfulUpdates = updateResults.filter((result) => result !== null);

    console.log(`\n📊 SYNC RESULTS:`);
    console.log(`📝 Missing games to add: ${results.missingGames.length}`);
    console.log(
      `🔧 Extra games set to maintenance: ${results.extraGamesUpdated.length}`
    );
    console.log(
      `✅ Existing games activated: ${results.existingGamesUpdated.length}`
    );
    console.log(`❌ Update errors: ${results.errors.length}`);
    console.log(`🔄 Total database updates: ${successfulUpdates.length}`);

    return res.status(200).json({
      success: true,
      message: `Successfully compared ${apiGames.length} API games with ${dbGames.length} database games. Updated ${successfulUpdates.length} games and found ${results.missingGames.length} missing games.`,
      summary: {
        totalApiGames: apiGames.length,
        totalDbGames: dbGames.length,
        missingGamesCount: results.missingGames.length,
        extraGamesCount: extraGames.length,
        existingGamesCount: existingGames.length,
        updatesExecuted: successfulUpdates.length,
        errors: results.errors.length,
      },
      results: {
        // Games that exist in API but not in DB - these need to be added
        missingGames: results.missingGames,

        // Games that exist in DB but not in API - these were set to maintenance=true
        extraGamesUpdated: results.extraGamesUpdated,

        // Games that exist in both - these were set to maintenance=false
        existingGamesUpdated: results.existingGamesUpdated,

        // Any errors that occurred during updates
        errors: results.errors,
      },
      recommendations: {
        action:
          "Review missing games and consider adding them to your database",
        missingGamesNote:
          results.missingGames.length > 0
            ? "The missing games list contains all the data needed to create new database entries"
            : "No missing games found - database is in sync with API",
        maintenanceNote: `${results.extraGamesUpdated.length} games were set to maintenance mode because they're not available in the API`,
        activeNote: `${results.existingGamesUpdated.length} games were activated because they're available in the API`,
      },
    });
  } catch (error) {
    console.error("❌ Error in PlayStar games comparison:", error);
    return res.status(500).json({
      success: false,
      message: {
        en: "Failed to compare and sync PlayStar games",
        zh: "PlayStar游戏比较和同步失败",
        ms: "Gagal membandingkan dan menyegerakkan permainan PlayStar",
        zh_hk: "PlayStar遊戲比較和同步失敗",
        id: "Gagal membandingkan dan menyinkronkan permainan PlayStar",
      },
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});
// router.post("/api/playstar/getprovidergamelist", async (req, res) => {
//   try {
//     // Make request to PlayStar API
//     const response = await axios.get(
//       `${playstarAPIURL}/feed/gamelist?host_id=${playstarHostId}&order=0`,
//       {
//         headers: {
//           "Content-Type": "application/json",
//         },
//       }
//     );
//     console.log(response.data);

//     const games = response.data;

//     // Validate response format
//     if (!Array.isArray(games)) {
//       throw new Error("Invalid response format from PlayStar API");
//     }

//     return res.status(200).json({
//       success: true,
//       data: response.data,
//       message: {
//         en: "Games list retrieved successfully.",
//         zh: "游戏列表检索成功。",
//         ms: "Senarai permainan berjaya diambil.",
//         zh_hk: "遊戲列表檢索成功。",
//         id: "Daftar permainan berhasil diambil.",
//       },
//     });
//   } catch (error) {
//     console.log("PlayStar games list error:", error.message);

//     return res.status(200).json({
//       success: false,
//       message: {
//         en: "PlayStar: Game launch failed. Please try again or customer service for assistance.",
//         zh: "PlayStar: 游戏启动失败，请重试或联系客服以获得帮助。",
//         ms: "PlayStar: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
//       },
//     });
//   }
// });

// router.post("/api/playstar/update-createdat-by-order", async (req, res) => {
//   try {
//     console.log("🔄 Starting PlayStar createdAt update by order...");

//     // Get games from PlayStar API
//     const response = await axios.get(
//       `${playstarAPIURL}/feed/gamelist?host_id=${playstarHostId}&order=0`,
//       {
//         headers: {
//           "Content-Type": "application/json",
//         },
//         timeout: 30000,
//       }
//     );

//     const apiGames = response.data;

//     // Validate response format
//     if (!Array.isArray(apiGames)) {
//       throw new Error("Invalid response format from PlayStar API");
//     }

//     console.log(`📊 Found ${apiGames.length} games from PlayStar API`);

//     // Sort games by order (ascending - lower order = earlier createdAt)
//     const sortedApiGames = apiGames.sort(
//       (a, b) => (a.order || 0) - (b.order || 0)
//     );

//     console.log(
//       `📈 Games sorted by order - Range: ${sortedApiGames[0]?.order || 0} to ${
//         sortedApiGames[sortedApiGames.length - 1]?.order || 0
//       }`
//     );

//     // Get all games from database that exist in the API
//     const apiGameIds = sortedApiGames.map((game) => game.game_id);
//     const dbGames = await GamePlayStarGameModal.find(
//       {
//         gameID: { $in: apiGameIds },
//       },
//       {
//         gameID: 1,
//         gameNameEN: 1,
//         createdAt: 1,
//         _id: 1,
//       }
//     );

//     console.log(`📊 Found ${dbGames.length} matching games in database`);

//     // Create a map for quick lookup
//     const dbGameMap = {};
//     dbGames.forEach((game) => {
//       dbGameMap[game.gameID] = game;
//     });

//     // Calculate new createdAt timestamps based on order
//     const bulkOperations = [];
//     const results = {
//       updated: [],
//       notFound: [],
//       errors: [],
//       skipped: [],
//     };

//     // Base timestamp - start from a reasonable date in the past
//     const baseTimestamp = new Date("2020-01-01T00:00:00.000Z");
//     const intervalMinutes = 30; // 30 minutes interval between games

//     console.log(
//       `\n🕒 Processing games with base timestamp: ${baseTimestamp.toISOString()}`
//     );
//     console.log(
//       `⏰ Using ${intervalMinutes} minute interval between games based on order`
//     );

//     for (let i = 0; i < sortedApiGames.length; i++) {
//       const apiGame = sortedApiGames[i];
//       const dbGame = dbGameMap[apiGame.game_id];

//       if (!dbGame) {
//         console.log(`  ❌ Game not found in DB: ${apiGame.game_id}`);
//         results.notFound.push({
//           gameID: apiGame.game_id,
//           gameName: apiGame.game_name["en-US"] || "Unknown",
//           order: apiGame.order,
//           reason: "Game exists in API but not in database",
//         });
//         continue;
//       }

//       // Calculate new createdAt based on order position
//       const newCreatedAt = new Date(
//         baseTimestamp.getTime() + i * intervalMinutes * 60 * 1000
//       );

//       console.log(
//         `  🔄 ${apiGame.game_id} (order: ${
//           apiGame.order
//         }) -> ${newCreatedAt.toISOString()}`
//       );

//       // Only update if the createdAt is different (allow 1 second tolerance for comparison)
//       const timeDifference = Math.abs(
//         dbGame.createdAt.getTime() - newCreatedAt.getTime()
//       );
//       if (timeDifference > 1000) {
//         // More than 1 second difference
//         bulkOperations.push({
//           updateOne: {
//             filter: { _id: dbGame._id },
//             update: {
//               $set: {
//                 createdAt: newCreatedAt,
//                 updatedAt: new Date(), // Also update updatedAt
//               },
//             },
//           },
//         });

//         results.updated.push({
//           gameID: apiGame.game_id,
//           gameName: dbGame.gameNameEN,
//           order: apiGame.order,
//           oldCreatedAt: dbGame.createdAt.toISOString(),
//           newCreatedAt: newCreatedAt.toISOString(),
//           position: i + 1,
//         });
//       } else {
//         console.log(
//           `  ⏭️ Skipping ${apiGame.game_id} - createdAt already matches`
//         );
//         results.skipped.push({
//           gameID: apiGame.game_id,
//           gameName: dbGame.gameNameEN,
//           order: apiGame.order,
//           reason: "createdAt already matches calculated timestamp",
//         });
//       }
//     }

//     // Execute bulk update to bypass mongoose timestamps
//     let successfulUpdates = 0;
//     if (bulkOperations.length > 0) {
//       console.log(
//         `\n🚀 Executing bulk update for ${bulkOperations.length} games...`
//       );

//       try {
//         const bulkResult = await GamePlayStarGameModal.collection.bulkWrite(
//           bulkOperations,
//           {
//             ordered: false, // Continue even if some operations fail
//           }
//         );

//         successfulUpdates = bulkResult.modifiedCount;
//         console.log(`✅ Successfully updated ${successfulUpdates} games`);

//         if (bulkResult.writeErrors && bulkResult.writeErrors.length > 0) {
//           console.log(
//             `❌ ${bulkResult.writeErrors.length} errors occurred during bulk update`
//           );
//           bulkResult.writeErrors.forEach((error) => {
//             results.errors.push({
//               error: error.errmsg,
//               operation: error.op,
//             });
//           });
//         }
//       } catch (error) {
//         console.error(`❌ Bulk update failed:`, error);
//         results.errors.push({
//           error: error.message,
//           operation: "bulk update",
//         });
//       }
//     }

//     // Sort results by order for better readability
//     results.updated.sort((a, b) => (a.order || 0) - (b.order || 0));
//     results.notFound.sort((a, b) => (a.order || 0) - (b.order || 0));

//     console.log(`\n📊 UPDATE RESULTS:`);
//     console.log(`✅ Games processed for update: ${results.updated.length}`);
//     console.log(`✅ Games successfully updated: ${successfulUpdates}`);
//     console.log(`❌ Games not found in DB: ${results.notFound.length}`);
//     console.log(
//       `⏭️ Games skipped (no change needed): ${results.skipped.length}`
//     );
//     console.log(`❌ Update errors: ${results.errors.length}`);

//     // Show some examples of the ordering
//     const exampleUpdates = results.updated.slice(0, 5);
//     if (exampleUpdates.length > 0) {
//       console.log(`\n📝 Example updates (first 5):`);
//       exampleUpdates.forEach((update) => {
//         console.log(
//           `  ${update.gameID} (order: ${update.order}) -> ${update.newCreatedAt}`
//         );
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       message: `Successfully updated createdAt timestamps for ${successfulUpdates} PlayStar games based on their order values using 30-minute intervals.`,
//       summary: {
//         totalApiGames: apiGames.length,
//         totalDbGames: dbGames.length,
//         gamesProcessedForUpdate: results.updated.length,
//         gamesSuccessfullyUpdated: successfulUpdates,
//         gamesSkipped: results.skipped.length,
//         gamesNotFound: results.notFound.length,
//         updateErrors: results.errors.length,
//       },
//       orderInfo: {
//         baseTimestamp: baseTimestamp.toISOString(),
//         intervalMinutes: intervalMinutes,
//         orderRange: {
//           lowest: sortedApiGames[0]?.order || 0,
//           highest: sortedApiGames[sortedApiGames.length - 1]?.order || 0,
//         },
//         timestampRange: {
//           earliest: baseTimestamp.toISOString(),
//           latest: new Date(
//             baseTimestamp.getTime() +
//               (sortedApiGames.length - 1) * intervalMinutes * 60 * 1000
//           ).toISOString(),
//         },
//       },
//       results: {
//         // Games that were successfully processed for update
//         updated: results.updated.slice(0, 50), // Limit to first 50 for response size

//         // Games that didn't need updating
//         skipped: results.skipped.slice(0, 20),

//         // Games in API but not in database
//         notFound: results.notFound.slice(0, 20),

//         // Any errors that occurred
//         errors: results.errors,
//       },
//       usage: {
//         queryExample:
//           "db.gameplaystargamemodals.find().sort({ createdAt: 1 }) // Will now return games in PlayStar order",
//         explanation:
//           "Games with lower order values now have earlier createdAt timestamps (30-minute intervals)",
//         note: "Used direct MongoDB bulk operations to bypass Mongoose timestamps",
//       },
//     });
//   } catch (error) {
//     console.error("❌ Error in PlayStar createdAt update:", error);
//     return res.status(500).json({
//       success: false,
//       message: {
//         en: "Failed to update createdAt timestamps by order",
//         zh: "根据顺序更新创建时间失败",
//         ms: "Gagal mengemas kini cap masa dicipta mengikut susunan",
//         zh_hk: "根據順序更新創建時間失敗",
//         id: "Gagal memperbarui timestamp createdAt berdasarkan urutan",
//       },
//       error: process.env.NODE_ENV === "development" ? error.message : undefined,
//     });
//   }
// });

router.post("/api/playstar/getgamelist", async (req, res) => {
  try {
    const games = await GamePlayStarGameModal.find({
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
    console.error("PLAYSTAR Error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "PLAYSTAR: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "PLAYSTAR: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "PLAYSTAR: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "PLAYSTAR: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "PLAYSTAR: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/playstar/launchGame", authenticateToken, async (req, res) => {
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

    if (user.gameLock.playstar.lock) {
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

    let lang = "en-US";

    if (gameLang === "en") {
      lang = "en-US";
    } else if (gameLang === "zh") {
      lang = "zh-CN";
    } else if (gameLang === "zh_hk") {
      lang = "zh-TW";
    } else if (gameLang === "ms") {
      lang = "ms-MY";
    } else if (gameLang === "id") {
      lang = "id-ID";
    }

    let token = `${user.gameId}:${generateRandomCode()}`;

    const launchParams = new URLSearchParams({
      host_id: playstarHostId,
      game_id: gameCode,
      lang: lang,
      access_token: token,
      return_url: webURL,
    });

    const launchUrl = `${playstarAPIURL}/launch/?${launchParams.toString()}`;

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        playstarGameToken: token,
      },
      { new: true }
    );

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "PLAYSTAR"
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
    console.log("PLAYSTAR error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "PLAYSTAR: Game launch failed. Please try again or customer service for assistance.",
        zh: "PLAYSTAR: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "PLAYSTAR: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "PLAYSTAR: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "PLAYSTAR: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.get("/api/playstar/auth", async (req, res) => {
  try {
    const { access_token } = req.query;

    if (!access_token) {
      return res.status(200).json({
        status_code: 1,
      });
    }

    const username = access_token.split(":")[0];

    const currentUser = await User.findOne(
      { gameId: username },
      { username: 1, wallet: 1, playstarGameToken: 1 }
    ).lean();

    if (!currentUser || currentUser.playstarGameToken !== access_token) {
      return res.status(200).json({
        status_code: 1,
      });
    }
    const walletValue = Number(currentUser.wallet);

    const balanceInCents = new Decimal(walletValue).mul(100).round().toNumber();

    return res.status(200).json({
      status_code: 0,
      member_id: username,
      member_name: currentUser.username,
      balance: balanceInCents,
    });
  } catch (error) {
    console.error(
      "PLAYSTAR: Error in game provider calling auth api:",
      error.message
    );
    return res.status(200).json({
      status_code: 1,
    });
  }
});

router.get("/api/playstar/logout", async (req, res) => {
  try {
    const { access_token } = req.query;

    if (!access_token) {
      return res.status(200).json({
        status_code: 1,
      });
    }

    const username = access_token.split(":")[0];

    const currentUser = await User.findOne(
      { gameId: username },
      { username: 1, playstarGameToken: 1 }
    ).lean();

    if (!currentUser || currentUser.playstarGameToken !== access_token) {
      return res.status(200).json({
        status_code: 1,
      });
    }

    return res.status(200).json({
      status_code: 0,
    });
  } catch (error) {
    console.error(
      "PLAYSTAR: Error in game provider calling auth api:",
      error.message
    );
    return res.status(200).json({
      status_code: 1,
    });
  }
});

router.get("/api/playstar/bet", async (req, res) => {
  try {
    const { access_token, txn_id, total_bet } = req.query;

    if (!access_token) {
      return res.status(200).json({
        status_code: 1,
      });
    }

    const totalBetRM = new Decimal(total_bet).div(100).toNumber();

    const username = access_token.split(":")[0];

    const [currentUser, existingBet] = await Promise.all([
      User.findOne(
        { gameId: username },
        {
          _id: 1,
          username: 1,
          wallet: 1,
          playstarGameToken: 1,
          "gameLock.playstar.lock": 1,
        }
      ).lean(),

      SlotPlayStarModal.findOne({ betId: txn_id }, { _id: 1 }).lean(),
    ]);

    if (!currentUser || currentUser.playstarGameToken !== access_token) {
      return res.status(200).json({
        status_code: 1,
      });
    }

    if (currentUser.gameLock?.playstar?.lock) {
      return res.status(200).json({
        status_code: 1,
      });
    }

    if (existingBet) {
      const walletValue = Number(currentUser.wallet);

      const balanceInCents = new Decimal(walletValue)
        .mul(100)
        .round()
        .toNumber();

      return res.status(200).json({
        status_code: 0,
        balance: balanceInCents,
      });
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: totalBetRM },
      },
      { $inc: { wallet: -totalBetRM } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res.status(200).json({
        status_code: 3,
      });
    }

    await SlotPlayStarModal.create({
      username: username,
      betId: txn_id,
      bet: true,
      betamount: totalBetRM,
    });

    const updatewalletValue = Number(updatedUserBalance.wallet);

    const balanceInCentsAfter = new Decimal(updatewalletValue)
      .mul(100)
      .round()
      .toNumber();

    return res.status(200).json({
      status_code: 0,
      balance: balanceInCentsAfter,
    });
  } catch (error) {
    console.error(
      "PLAYSTAR: Error in game provider calling ae96 get bet api:",
      error.message
    );
    return res.status(200).json({
      status_code: 5,
    });
  }
});

router.get("/api/playstar/result", async (req, res) => {
  try {
    const { member_id, txn_id, total_win } = req.query;

    if (!member_id) {
      return res.status(200).json({
        status_code: 1,
      });
    }

    const totalWinRM = new Decimal(total_win).div(100).toNumber();

    const [currentUser, existingBet, existingTransaction] = await Promise.all([
      User.findOne({ gameId: member_id }, { _id: 1, wallet: 1 }).lean(),

      SlotPlayStarModal.findOne(
        { betId: txn_id, bet: true },
        { _id: 1 }
      ).lean(),

      SlotPlayStarModal.findOne(
        {
          betId: txn_id,
          $or: [{ settle: true }, { cancel: true }],
        },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        status_code: 1,
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        status_code: 2,
      });
    }

    if (existingTransaction) {
      const walletValue = Number(currentUser.wallet);

      const balanceInCents = new Decimal(walletValue)
        .mul(100)
        .round()
        .toNumber();

      return res.status(200).json({
        status_code: 0,
        balance: balanceInCents,
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: totalWinRM } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotPlayStarModal.updateOne(
        { betId: txn_id },
        { $set: { settle: true, settleamount: totalWinRM } }
      ),
    ]);

    const updatewalletValue = Number(updatedUserBalance.wallet);

    const balanceInCentsAfter = new Decimal(updatewalletValue)
      .mul(100)
      .round()
      .toNumber();

    return res.status(200).json({
      status_code: 0,
      balance: balanceInCentsAfter,
    });
  } catch (error) {
    console.error(
      "PLAYSTAR: Error in game provider calling  get game result api:",
      error.message
    );
    return res.status(200).json({
      status_code: 5,
    });
  }
});

router.get("/api/playstar/refund", async (req, res) => {
  try {
    const { txn_id, member_id } = req.query;

    if (!member_id) {
      return res.status(200).json({
        status_code: 1,
      });
    }

    const [currentUser, existingBet, existingTransaction] = await Promise.all([
      User.findOne({ gameId: member_id }, { _id: 1, wallet: 1 }).lean(),

      SlotPlayStarModal.findOne(
        { betId: txn_id, bet: true },
        { betamount: 1, _id: 1 }
      ).lean(),

      SlotPlayStarModal.findOne(
        {
          betId: txn_id,
          $or: [{ settle: true }, { cancel: true }],
        },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        status_code: 1,
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        status_code: 2,
      });
    }

    if (existingTransaction) {
      const walletValue = Number(currentUser.wallet);

      const balanceInCents = new Decimal(walletValue)
        .mul(100)
        .round()
        .toNumber();

      return res.status(200).json({
        status_code: 0,
        balance: balanceInCents,
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: existingBet.betamount } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotPlayStarModal.updateOne(
        { betId: txn_id },
        { $set: { cancel: true } }
      ),
    ]);

    const updatewalletValue = Number(updatedUserBalance.wallet);

    const balanceInCentsAfter = new Decimal(updatewalletValue)
      .mul(100)
      .round()
      .toNumber();

    return res.status(200).json({
      status_code: 0,
      balance: balanceInCentsAfter,
    });
  } catch (error) {
    console.error(
      "PLAYSTAR: Error in game provider calling  get game result api:",
      error.message
    );
    return res.status(200).json({
      status_code: 5,
    });
  }
});

router.get("/api/playstar/bonusaward", async (req, res) => {
  try {
    const { member_id, bonus_id, bonus_reward, txn_id } = req.query;

    if (!member_id) {
      return res.status(200).json({
        status_code: 1,
      });
    }

    const totalWinRM = new Decimal(bonus_reward).div(100).toNumber();

    const [currentUser, existingBet, existingTransaction] = await Promise.all([
      User.findOne({ gameId: member_id }, { _id: 1, wallet: 1 }).lean(),

      SlotPlayStarModal.findOne(
        { betId: txn_id, bet: true },
        { _id: 1 }
      ).lean(),

      SlotPlayStarModal.findOne(
        {
          tranId: bonus_id,
        },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        status_code: 1,
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        status_code: 2,
      });
    }

    if (existingTransaction) {
      const walletValue = Number(currentUser.wallet);

      const balanceInCents = new Decimal(walletValue)
        .mul(100)
        .round()
        .toNumber();

      return res.status(200).json({
        status_code: 0,
        balance: balanceInCents,
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: totalWinRM } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotPlayStarModal.create({
        username: member_id,
        betId: txn_id,
        bet: true,
        settle: true,
        betamount: 0,
        settleamount: totalWinRM,
        tranId: bonus_id,
      }),
    ]);

    const updatewalletValue = Number(updatedUserBalance.wallet);

    const balanceInCentsAfter = new Decimal(updatewalletValue)
      .mul(100)
      .round()
      .toNumber();

    return res.status(200).json({
      status_code: 0,
      balance: balanceInCentsAfter,
    });
  } catch (error) {
    console.error(
      "PLAYSTAR: Error in game provider calling  get game result api:",
      error.message
    );
    return res.status(200).json({
      status_code: 5,
    });
  }
});

router.get("/api/playstar/getbalance", async (req, res) => {
  try {
    const { access_token, member_id } = req.query;

    if (!access_token) {
      return res.status(200).json({
        status_code: 1,
      });
    }

    const username = access_token.split(":")[0];

    const currentUser = await User.findOne(
      { gameId: username },
      { username: 1, wallet: 1, playstarGameToken: 1 }
    ).lean();

    if (!currentUser || currentUser.playstarGameToken !== access_token) {
      return res.status(200).json({
        status_code: 1,
      });
    }
    const walletValue = Number(currentUser.wallet);

    const balanceInCents = new Decimal(walletValue).mul(100).round().toNumber();

    return res.status(200).json({
      status_code: 0,
      balance: balanceInCents,
    });
  } catch (error) {
    console.error(
      "PLAYSTAR: Error in game provider calling auth api:",
      error.message
    );
    return res.status(200).json({
      status_code: 5,
    });
  }
});

router.post("/api/playstar/getturnoverforrebate", async (req, res) => {
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

    console.log("PLAYSTAR QUERYING TIME", startDate, endDate);

    const records = await SlotPlayStarModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      settle: true,
      cancel: { $ne: true },
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
        console.warn(`PLAYSTAR User not found for gameId: ${gameId}`);
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
    // Return the aggregated results
    return res.status(200).json({
      success: true,
      summary: {
        gamename: "PLAYSTAR",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("PLAYSTAR: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "PLAYSTAR: Failed to fetch win/loss report",
        zh: "PLAYSTAR: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/playstar/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotPlayStarModal.find({
        username: user.gameId,
        createdAt: {
          $gte: startDate,
          $lt: endDate,
        },
        settle: true,
        cancel: { $ne: true },
      });

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
          gamename: "PLAYSTAR",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("PLAYSTAR: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "PLAYSTAR: Failed to fetch win/loss report",
          zh: "PLAYSTAR: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/playstar/:userId/gamedata",
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
          const gamecat = Object.fromEntries(gameCategories["Slot Games"]);

          if (gamecat["PLAYSTAR"]) {
            totalTurnover += gamecat["PLAYSTAR"].turnover || 0;
            totalWinLoss += gamecat["PLAYSTAR"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PLAYSTAR",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("PLAYSTAR: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "PLAYSTAR: Failed to fetch win/loss report",
          zh: "PLAYSTAR: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/playstar/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotPlayStarModal.find({
        createdAt: {
          $gte: startDate,
          $lt: endDate,
        },
        settle: true,
        cancel: { $ne: true },
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;

        totalWinLoss += (record.betamount || 0) - (record.settleamount || 0);
      });

      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      // Return the aggregated results
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PLAYSTAR",
          gamecategory: "Slot Games",
          totalturnover: totalTurnover,
          totalwinloss: totalWinLoss,
        },
      });
    } catch (error) {
      console.log("PLAYSTAR: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "PLAYSTAR: Failed to fetch win/loss report",
          zh: "PLAYSTAR: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/playstar/kioskreport",
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
          const gamecat = Object.fromEntries(gameCategories["Slot Games"]);

          if (gamecat["PLAYSTAR"]) {
            totalTurnover += Number(gamecat["PLAYSTAR"].turnover || 0);
            totalWinLoss += Number(gamecat["PLAYSTAR"].winloss || 0);
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PLAYSTAR",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("PLAYSTAR: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "PLAYSTAR: Failed to fetch win/loss report",
          zh: "PLAYSTAR: 获取盈亏报告失败",
        },
      });
    }
  }
);
module.exports = router;
