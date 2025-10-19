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
const querystring = require("querystring");
const moment = require("moment");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");

const GameAsiaGamingGameModal = require("../../models/slot_asiagamingDatabase.model");
const GameBigGamingGameModal = require("../../models/slot_biggamingDatabase.model");
const GameCq9GameModal = require("../../models/slot_cq9Database.model");
const GameFachaiGameModal = require("../../models/slot_fachaiDatabase.model");
const GameHabaneroGameModal = require("../../models/slot_habaneroDatabase.model");
const GameHacksawGameModal = require("../../models/slot_hacksawDatabase.model");
const GameJDBGameModal = require("../../models/slot_jdbDatabase.model");
const GameJILIGameModal = require("../../models/slot_jiliDatabase.model");
const GameJokerGameModal = require("../../models/slot_jokerDatabase.model");
const GameKiss918GameModal = require("../../models/slot_kiss918Database.model");
const GameLFC888GameModal = require("../../models/slot_lfc888Database.model");
const GamePPGameModal = require("../../models/slot_live_ppDatabase.model");
const GameLive22GameModal = require("../../models/slot_live22Database.model");
const GameMega888H5GameModal = require("../../models/slot_mega888h5Database.model");
const GameMicroGamingGameModal = require("../../models/slot_microgamingDatabase.model");
const GameNetentGameModal = require("../../models/slot_nententDatabase.model");
const GameNextSpinGameModal = require("../../models/slot_nextspinDatabase.model");
const GameNoLimitGameModal = require("../../models/slot_nolimitDatabase.model");
const PlaytechDataGameModal = require("../../models/slot_playtechDatabase.model");
const GameRedTigerGameModal = require("../../models/slot_redtigerDatabase.model");
const GameSpadeGamingGameModal = require("../../models/slot_spadegamingDatabase.model");

const GameWalletLog = require("../../models/gamewalletlog.model");
const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const multer = require("multer");

require("dotenv").config();

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

function normalizeGameType(typeFromExcel) {
  if (!typeFromExcel) return null;

  const type = typeFromExcel.toLowerCase();
  if (type.includes("slot")) return "Slot";
  if (type.includes("fish")) return "Fishing";
  if (type.includes("3")) return "Table";
  if (type.includes("2")) return "Arcade";
  if (type.includes("other")) return "Other";
  if (type.includes("poker")) return "Poker";
  return null; // Not recognized
}

function parseRTP(rtpRaw) {
  if (typeof rtpRaw === "number") {
    return (rtpRaw * 100).toFixed(2) + "%";
  }

  if (typeof rtpRaw === "string") {
    const trimmed = rtpRaw.trim();
    if (trimmed.endsWith("%")) {
      return trimmed;
    } else if (!isNaN(trimmed)) {
      return parseFloat(trimmed).toFixed(2) + "%";
    }
  }

  return null;
}

router.post("/api/importGameList/168168", async (req, res) => {
  try {
    const filePath = path.join(
      __dirname,
      "../../public/Game_Import_Template.xlsx"
    );
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet);

    const games = [];

    for (const row of rows) {
      const normalizedType = normalizeGameType(row["Game Type"]);
      if (!normalizedType) {
        console.log("Skipping invalid game type:", row["Game Type"]);
        continue;
      }

      const rtpValue = parseRTP(
        row["RTP "] || row["RTP\n"] || row["RTP \n返還率"]
      );

      games.push({
        gameNameEN: row["Game Name"],
        gameNameCN: row["Simplified Chinese"],
        gameID: row["Game Code"],
        gameType: normalizedType,
        rtpRate: rtpValue,
      });
    }

    if (games.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No valid games to import." });
    }

    await GameHacksawGameModal.insertMany(games);
    res.status(200).json({
      success: true,
      imported: games.length,
      message: "CQ9 games imported successfully",
    });
  } catch (error) {
    console.error("Import CQ9 Games Error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error importing CQ9 games" });
  }
});

// router.post("/api/importImgUrl/168168", async (req, res) => {
//   try {
//     const bucket = "allgameassets";
//     const basePathEN = "habanero/en/";
//     const basePathCN = "habanero/zh/";

//     // Get all games from the database
//     const allGames = await GameHabaneroGameModal.find(
//       {
//         $or: [
//           { imageUrlEN: { $exists: false } },
//           { imageUrlEN: "" },
//           { imageUrlCN: { $exists: false } },
//           { imageUrlCN: "" },
//         ],
//       },
//       { gameID: 1 }
//     );

//     if (!allGames.length) {
//       return res.status(404).json({
//         success: false,
//         message: "No games found in database to sync",
//       });
//     }

//     // Get all objects from S3 for both EN and CN paths using AWS SDK v3
//     const [enObjectsResult, cnObjectsResult] = await Promise.all([
//       s3Client.send(
//         new ListObjectsV2Command({
//           Bucket: bucket,
//           Prefix: basePathEN,
//         })
//       ),
//       s3Client.send(
//         new ListObjectsV2Command({
//           Bucket: bucket,
//           Prefix: basePathCN,
//         })
//       ),
//     ]);

//     // Extract just the filenames and create lookup maps
//     const enImageMap = {};
//     const cnImageMap = {};

//     // Process EN images
//     enObjectsResult.Contents.forEach((object) => {
//       const filename = object.Key.split("/").pop(); // Get filename without path
//       const gameId = filename.split("_")[0]; // Extract gameId part

//       if (gameId) {
//         enImageMap[
//           gameId
//         ] = `https://${bucket}.s3.ap-southeast-1.amazonaws.com/${object.Key}`;
//       }
//     });

//     // Process CN images
//     cnObjectsResult.Contents.forEach((object) => {
//       const filename = object.Key.split("/").pop(); // Get filename without path
//       const gameId = filename.split("_")[0]; // Extract gameId part

//       if (gameId) {
//         cnImageMap[
//           gameId
//         ] = `https://${bucket}.s3.ap-southeast-1.amazonaws.com/${object.Key}`;
//       }
//     });

//     // Update each game document with the corresponding image URLs
//     const updatePromises = allGames.map(async (game) => {
//       const gameId = game.gameID;
//       const updates = {};

//       if (enImageMap[gameId]) {
//         updates.imageUrlEN = enImageMap[gameId];
//       }

//       if (cnImageMap[gameId]) {
//         updates.imageUrlCN = cnImageMap[gameId];
//       }

//       // Only update if we found at least one matching image
//       if (Object.keys(updates).length > 0) {
//         return GameHabaneroGameModal.findByIdAndUpdate(
//           game._id,
//           { $set: updates },
//           { new: true }
//         );
//       }
//       return null;
//     });

//     // Execute all updates
//     const results = await Promise.all(updatePromises);

//     // Count successful updates (non-null results)
//     const updatedCount = results.filter((result) => result !== null).length;

//     return res.status(200).json({
//       success: true,
//       message: `Successfully synced images for ${updatedCount} games`,
//       totalGames: allGames.length,
//       updatedGames: updatedCount,
//     });
//   } catch (error) {
//     console.error("Error syncing Kiss918 game images:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to sync game images",
//       error: error.message,
//     });
//   }
// });
router.post("/api/importImgUrl/168168", async (req, res) => {
  try {
    const bucket = "allgameassets";
    const basePathEN = "hacksaw/en/";

    console.log("Starting image URL sync for Hacksaw games...");

    // Get all games from the database that need image URLs
    const allGames = await GameHacksawGameModal.find(
      {
        $or: [
          { imageUrlEN: { $exists: false } },
          { imageUrlEN: "" },
          { imageUrlEN: null },
        ],
      },
      { gameID: 1, gameNameEN: 1 }
    );

    if (!allGames.length) {
      return res.status(404).json({
        success: false,
        message: "No games found in database that need image URLs",
      });
    }

    console.log(`Found ${allGames.length} games that need image URLs`);

    // Get all objects from S3 for EN path
    const enObjectsResult = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: basePathEN,
      })
    );

    if (!enObjectsResult.Contents || enObjectsResult.Contents.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No images found in S3 bucket",
      });
    }

    console.log(`Found ${enObjectsResult.Contents.length} images in S3`);

    // Create lookup map for EN images
    const enImageMap = {};

    // Function to extract gameID from filename (everything before first underscore)
    function extractGameIdFromFilename(filename) {
      const match = filename.match(/^(\d+)_/); // Match digits before first underscore
      return match ? match[1] : null;
    }

    // Process EN images and create mapping
    enObjectsResult.Contents.forEach((object) => {
      const filename = object.Key.split("/").pop(); // Get filename from full path
      const gameId = extractGameIdFromFilename(filename);

      if (gameId) {
        const imageUrl = `https://${bucket}.s3.ap-southeast-1.amazonaws.com/${object.Key}`;
        enImageMap[gameId] = imageUrl;
        console.log(`Mapped gameID ${gameId} to ${filename}`);
      }
    });

    console.log(`Created mapping for ${Object.keys(enImageMap).length} images`);

    // Update games with matching image URLs
    const updatePromises = [];
    const matchedGames = [];
    const unmatchedGames = [];

    allGames.forEach((game) => {
      const gameId = game.gameID;

      if (enImageMap[gameId]) {
        // Found matching image
        matchedGames.push({
          gameID: gameId,
          gameName: game.gameNameEN,
          imageUrl: enImageMap[gameId],
        });

        updatePromises.push(
          GameHacksawGameModal.findByIdAndUpdate(
            game._id,
            {
              $set: {
                imageUrlEN: enImageMap[gameId],
                imageUrlCN: enImageMap[gameId], // Use same image for CN since only EN available
              },
            },
            { new: true }
          )
        );
      } else {
        // No matching image found
        unmatchedGames.push({
          gameID: gameId,
          gameName: game.gameNameEN,
        });
      }
    });

    // Execute all updates
    console.log(`Updating ${updatePromises.length} games with image URLs...`);
    const results = await Promise.all(updatePromises);

    // Log results
    console.log("=== IMAGE SYNC COMPLETED ===");
    console.log(`Total games processed: ${allGames.length}`);
    console.log(`Games updated with images: ${results.length}`);
    console.log(`Games without matching images: ${unmatchedGames.length}`);

    if (matchedGames.length > 0) {
      console.log("\n=== SUCCESSFULLY UPDATED GAMES ===");
      matchedGames.forEach((game) => {
        console.log(`✅ ${game.gameID}: ${game.gameName}`);
      });
    }

    if (unmatchedGames.length > 0) {
      console.log("\n=== GAMES WITHOUT MATCHING IMAGES ===");
      unmatchedGames.forEach((game) => {
        console.log(`❌ ${game.gameID}: ${game.gameName}`);
      });
    }

    return res.status(200).json({
      success: true,
      message: `Successfully synced images for ${results.length} games`,
      summary: {
        totalGamesProcessed: allGames.length,
        imagesFoundInS3: Object.keys(enImageMap).length,
        gamesUpdated: results.length,
        gamesUnmatched: unmatchedGames.length,
      },
      details: {
        updatedGames: matchedGames,
        unmatchedGames: unmatchedGames,
      },
    });
  } catch (error) {
    console.error("Error syncing Hacksaw game images:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to sync game images",
      error: error.message,
    });
  }
});

// Additional route to check current image status
router.get("/api/checkImageStatus/hacksaw", async (req, res) => {
  try {
    const totalGames = await GameHacksawGameModal.countDocuments();

    const gamesWithImages = await GameHacksawGameModal.countDocuments({
      $and: [{ imageUrlEN: { $exists: true, $ne: "", $ne: null } }],
    });

    const gamesWithoutImages = await GameHacksawGameModal.countDocuments({
      $or: [
        { imageUrlEN: { $exists: false } },
        { imageUrlEN: "" },
        { imageUrlEN: null },
      ],
    });

    // Get some examples of games without images
    const sampleGamesWithoutImages = await GameHacksawGameModal.find(
      {
        $or: [
          { imageUrlEN: { $exists: false } },
          { imageUrlEN: "" },
          { imageUrlEN: null },
        ],
      },
      { gameID: 1, gameNameEN: 1, imageUrlEN: 1 }
    ).limit(10);

    return res.status(200).json({
      success: true,
      statistics: {
        totalGames: totalGames,
        gamesWithImages: gamesWithImages,
        gamesWithoutImages: gamesWithoutImages,
        completionPercentage: Math.round((gamesWithImages / totalGames) * 100),
      },
      sampleGamesWithoutImages: sampleGamesWithoutImages,
    });
  } catch (error) {
    console.error("Error checking image status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check image status",
      error: error.message,
    });
  }
});

// Add this route to your existing file

router.post("/api/cleanupGameImages/168168", async (req, res) => {
  try {
    // Base directory containing game folders (update this path to match your structure)
    const baseDirectory = path.join(__dirname, "../../public/games");

    let totalGameFolders = 0;
    let totalFilesScanned = 0;
    let filesDeleted = 0;
    let filesKept = 0;
    let errors = [];

    // Check if base directory exists
    if (!fs.existsSync(baseDirectory)) {
      return res.status(404).json({
        success: false,
        message: `Base directory not found: ${baseDirectory}`,
      });
    }

    // Get all game folders
    const gameFolders = fs
      .readdirSync(baseDirectory, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    totalGameFolders = gameFolders.length;

    // Process each game folder
    for (const gameFolder of gameFolders) {
      const gamePath = path.join(baseDirectory, gameFolder);

      // Read all files in the game folder
      const files = fs.readdirSync(gamePath);
      totalFilesScanned += files.length;

      // Process each file
      for (const file of files) {
        // Only process image files
        if (
          file.endsWith(".png") ||
          file.endsWith(".jpg") ||
          file.endsWith(".jpeg")
        ) {
          const filePath = path.join(gamePath, file);

          // Keep files ending with en_square.png or cn_square.png
          if (
            file.endsWith("en_square.png") ||
            file.endsWith("cn_square.png")
          ) {
            filesKept++;
          } else {
            try {
              // Delete other image files
              fs.unlinkSync(filePath);
              filesDeleted++;
            } catch (err) {
              console.error(`Error deleting file ${filePath}:`, err);
              errors.push({ file: filePath, error: err.message });
            }
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: "Game images cleanup completed successfully",
      details: {
        totalGameFolders,
        totalFilesScanned,
        filesKept,
        filesDeleted,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    console.error("Error cleaning up game images:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to clean up game images",
      error: error.message,
    });
  }
});

router.post("/api/separateLanguageImages/168168", async (req, res) => {
  try {
    // Source directory containing all images
    const sourceDirectory = path.join(__dirname, "../../public/hi");

    // Destination directories
    const enDestDirectory = path.join(__dirname, "../../public/images/en");
    const zhDestDirectory = path.join(__dirname, "../../public/images/zh");

    // Create destination directories if they don't exist
    if (!fs.existsSync(enDestDirectory)) {
      fs.mkdirSync(enDestDirectory, { recursive: true });
    }

    if (!fs.existsSync(zhDestDirectory)) {
      fs.mkdirSync(zhDestDirectory, { recursive: true });
    }

    // Statistics for reporting
    let totalFilesProcessed = 0;
    let enFilesCount = 0;
    let zhFilesCount = 0;
    let errors = [];

    // Check if source directory exists
    if (!fs.existsSync(sourceDirectory)) {
      return res.status(404).json({
        success: false,
        message: `Source directory not found: ${sourceDirectory}`,
      });
    }

    // Get all files in the source directory
    const files = fs.readdirSync(sourceDirectory);

    // Process each file
    for (const file of files) {
      // Skip directories
      const filePath = path.join(sourceDirectory, file);
      if (fs.statSync(filePath).isDirectory()) {
        continue;
      }

      // Process only image files
      if (
        file.endsWith(".png") ||
        file.endsWith(".jpg") ||
        file.endsWith(".jpeg")
      ) {
        totalFilesProcessed++;

        try {
          if (file.includes("cn")) {
            // Chinese image
            const destPath = path.join(zhDestDirectory, file);
            fs.copyFileSync(filePath, destPath);
            fs.unlinkSync(filePath); // Remove from source
            zhFilesCount++;
          } else if (file.includes("en")) {
            // English image
            const destPath = path.join(enDestDirectory, file);
            fs.copyFileSync(filePath, destPath);
            fs.unlinkSync(filePath); // Remove from source
            enFilesCount++;
          } else {
            // Skip files without 'en' or 'cn' in name
            console.log(`Skipping non-language image file: ${file}`);
            continue;
          }
        } catch (err) {
          console.error(`Error processing file ${file}:`, err);
          errors.push({ file, error: err.message });
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: "Images separated successfully",
      details: {
        totalFilesProcessed,
        enFilesCount,
        zhFilesCount,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    console.error("Error separating language images:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to separate language images",
      error: error.message,
    });
  }
});

router.post("/api/jili/updateMalayName", async (req, res) => {
  try {
    const filePath = path.join(
      __dirname,
      "../../public/Game_Import_Template.xlsx"
    );
    if (!fs.existsSync(filePath)) {
      return res
        .status(404)
        .json({ success: false, message: "Excel file not found." });
    }

    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    let updatedCount = 0;

    for (const row of rows) {
      const gameName = String(row["Game Name"] || "").trim();
      const malayName = String(row["Malay Name"] || "").trim();

      if (!gameName || !malayName) continue;

      const updated = await GameJILIGameModal.findOneAndUpdate(
        { gameNameEN: gameName },
        { $set: { gameNameMS: malayName } }
      );

      if (updated) updatedCount++;
    }

    res.status(200).json({
      success: true,
      updated: updatedCount,
      message: `${updatedCount} gameNameMS fields updated successfully.`,
    });
  } catch (error) {
    console.error("Error updating Malay Names:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Failed to update database." });
  }
});

router.post("/api/jili/getgamelistMissing", async (req, res) => {
  try {
    // Fetch all games from the database (or add filters as needed)
    const missingImageGames = await GameHacksawGameModal.find({
      $or: [{ imageUrlEN: { $exists: false } }, { imageUrlEN: "" }],
    });
    console.log(missingImageGames.length);
    return res.status(200).json({
      success: true,
      gamelist: missingImageGames,
    });
  } catch (error) {
    console.log("CQ9 error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "CQ9: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "CQ9: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "CQ9: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/playtech/export-games", async (req, res) => {
  try {
    const allGames = await GameLFC888GameModal.find().lean(); // lean() for plain JS objects

    if (!allGames || allGames.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No game data found to export.",
      });
    }

    // Create a temporary file
    const exportFilePath = path.join(__dirname, "../../exports/lfc777.json");

    // Ensure export directory exists
    const exportDir = path.dirname(exportFilePath);
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    fs.writeFileSync(exportFilePath, JSON.stringify(allGames, null, 2), "utf8");

    // Send file for download
    res.download(exportFilePath, "playtech_games_export.json", (err) => {
      if (err) {
        console.error("Error sending file:", err);
        res.status(500).json({
          success: false,
          message: "Failed to export file.",
        });
      } else {
        console.log("Playtech game data exported successfully.");
      }
    });
  } catch (error) {
    console.error("Error exporting Playtech game data:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to export game data.",
      error: error.message,
    });
  }
});

router.post("/api/hacksaw/import-games", async (req, res) => {
  try {
    // Path to your exported JSON file
    const filePath = path.join(__dirname, "../../public/habanero.json");

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "Export file not found. Please export the games first.",
      });
    }

    // Read the JSON file
    const fileContent = fs.readFileSync(filePath, "utf8");
    const gameData = JSON.parse(fileContent);

    // Clear existing games and insert new ones
    await GameHabaneroGameModal.deleteMany({});
    const result = await GameHabaneroGameModal.insertMany(gameData);

    console.log(`Successfully imported ${result.length} games`);

    return res.status(200).json({
      success: true,
      message: {
        en: `Successfully imported ${result.length} games.`,
        zh: `成功导入 ${result.length} 个游戏。`,
        ms: `Berjaya mengimport ${result.length} permainan.`,
      },
      totalImported: result.length,
    });
  } catch (error) {
    console.error("Error importing games:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to import games.",
      error: error.message,
    });
  }
});

router.post("/api/playtech/import-games", async (req, res) => {
  try {
    const importFilePath = path.join(
      __dirname,
      "../../public/playtechupdate.json"
    );
    await PlaytechDataGameModal.deleteMany({});
    // Check if file exists
    if (!fs.existsSync(importFilePath)) {
      return res.status(404).json({
        success: false,
        message: "Import file not found.",
      });
    }

    // Read and parse the JSON file
    const fileData = fs.readFileSync(importFilePath, "utf8");
    const parsedData = JSON.parse(fileData);
    const gameList = parsedData.gameList;
    if (!gameList || !Array.isArray(gameList) || gameList.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Import file is empty or invalid.",
      });
    }

    // Insert into MongoDB
    await PlaytechDataGameModal.insertMany(gameList);

    return res.status(200).json({
      success: true,
      message: `${gameList.length} game records imported successfully.`,
    });
  } catch (error) {
    console.error("Error importing Playtech game data:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to import game data.",
      error: error.message,
    });
  }
});

router.post("/admin/api/replace-s3-with-cloudfront", async (req, res) => {
  try {
    const CLOUDFRONT_BASE_URL = "https://d2bdzvbz2cmjb8.cloudfront.net";
    const S3_PREFIX = "https://allgameslist.s3.ap-southeast-1.amazonaws.com";

    const modelsToUpdate = [
      GameAsiaGamingGameModal,
      GameBigGamingGameModal,
      GameCq9GameModal,
      GameFachaiGameModal,
      GameHabaneroGameModal,
      GameHacksawGameModal,
      GameJDBGameModal,
      GameJILIGameModal,
      GameJokerGameModal,
      GameKiss918GameModal,
      GameLFC888GameModal,
      GamePPGameModal,
      GameLive22GameModal,
      GameMega888H5GameModal,
      GameMicroGamingGameModal,
      GameNetentGameModal,
      GameNextSpinGameModal,
      GameNoLimitGameModal,
      PlaytechDataGameModal,
      GameRedTigerGameModal,
      GameSpadeGamingGameModal,
    ];

    let totalUpdated = 0;
    let updatedDocs = [];
    let nonS3Urls = [];

    for (const Model of modelsToUpdate) {
      const records = await Model.find();

      for (const record of records) {
        let changed = false;

        const fields = [
          "imageUrlEN",
          "imageUrlCN",
          "imageUrlID",
          "imageUrlHK",
          "imageUrlMS",
        ];

        for (const field of fields) {
          const currentUrl = record[field];
          if (currentUrl && currentUrl.startsWith(S3_PREFIX)) {
            record[field] = currentUrl.replace(S3_PREFIX, CLOUDFRONT_BASE_URL);
            changed = true;
          } else if (
            currentUrl &&
            !currentUrl.startsWith(CLOUDFRONT_BASE_URL)
          ) {
            // Not using S3 or CloudFront — log it
            nonS3Urls.push({
              id: record._id,
              gameID: record.gameID,
              field: field,
              currentUrl,
            });
          }
        }

        if (changed) {
          await record.save();
          totalUpdated++;
          updatedDocs.push({
            id: record._id,
            gameID: record.gameID,
            imageUrlEN: record.imageUrlEN,
            imageUrlCN: record.imageUrlCN,
            imageUrlID: record.imageUrlID,
            imageUrlHK: record.imageUrlHK,
            imageUrlMS: record.imageUrlMS,
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `Updated ${totalUpdated} game documents.`,
      updatedSample: updatedDocs.slice(0, 10),
      nonS3UrlsSample: nonS3Urls, // show sample of entries not using S3 or CloudFront
      nonS3UrlsTotal: nonS3Urls.length,
    });
  } catch (error) {
    console.error("Error replacing S3 URLs with CloudFront:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update image URLs",
      error: error.message,
    });
  }
});
module.exports = router;
