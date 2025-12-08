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

const GameWalletLog = require("../../models/gamewalletlog.model");

const GameEpicWinGameModal = require("../../models/slot_epicwinDatabase.model");
const GameFachaiGameModal = require("../../models/slot_fachaiDatabase.model");
const GamePlayAceGameModal = require("../../models/slot_liveplayaceDatabase.model");
const GameBNGGameModal = require("../../models/slot_bngDatabase.model");
const GameHacksawGameModal = require("../../models/slot_dcthacksawDatabase.model");
const GameRelaxGamingGameModal = require("../../models/slot_dctrelaxDatabase.model");
const GameJILIGameModal = require("../../models/slot_jiliDatabase.model");
const GameFastSpinGameModal = require("../../models/slot_fastspinDatabase.model");
const GameYGRGameModal = require("../../models/slot_yesgetrichDatabase.model");
const GameJokerGameModal = require("../../models/slot_jokerDatabase.model");
const GameMicroGamingGameModal = require("../../models/slot_livemicrogamingDatabase.model");
const GameFunkyGameModal = require("../../models/slot_funkyDatabase.model");
const GameHabaneroGameModal = require("../../models/slot_habaneroDatabase.model");
const GameCq9GameModal = require("../../models/slot_cq9Database.model");
const GameBTGamingGameModal = require("../../models/slot_btgamingDatabase.model");
const GameNextSpinGameModal = require("../../models/slot_nextspinDatabase.model");
const GamePlayStarGameModal = require("../../models/slot_playstarDatabase.model");
const GamePlaytechGameModal = require("../../models/slot_playtechDatabase.model");
const GameVPowerGameModal = require("../../models/slot_vpowerDatabase.model");
const GameRich88GameModal = require("../../models/slot_rich88Database.model");
const GameRSGGameModal = require("../../models/slot_rsgDatabase.model");
const GameAceWinGameModal = require("../../models/slot_acewinDatabase.model");
const GameSpadeGamingGameModal = require("../../models/slot_spadegamingDatabase.model");
const GamePPGameModal = require("../../models/slot_live_ppDatabase.model");
const GameYellowBatGameModal = require("../../models/slot_yellowbatDatabase.model");
const GameYGGDrasilGameModal = require("../../models/slot_dctyggdrasilDatabase.model");
const GameIBexGameModal = require("../../models/slot_ibexDatabase.model");
const GameExpansesStudiosGameModal = require("../../models/slot_expansestudioDatabase.model");

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
  if (type.includes("table")) return "Table";
  if (type.includes("arcade")) return "Arcade";
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

router.post("/api/playtech/import-games", async (req, res) => {
  try {
    const importFilePath = path.join(__dirname, "../../public/fastspin.json");
    console.log(importFilePath);

    // Check if file exists
    if (!fs.existsSync(importFilePath)) {
      return res.status(404).json({
        success: false,
        message: "Import file not found.",
      });
    }

    // Read and parse the JSON file
    const fileData = fs.readFileSync(importFilePath, "utf8");
    const parsedData = JSON.parse(fileData); // Parse the JSON first

    const gameList = parsedData; // Then access the games property

    if (!gameList || !Array.isArray(gameList) || gameList.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Import file is empty or invalid.",
      });
    }

    console.log("pass");
    console.log(`Found ${gameList.length} games to import`);
    await GameFastSpinGameModal.deleteMany();
    // Insert into MongoDB
    await GameFastSpinGameModal.insertMany(gameList);

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

// compare playtech excel list see which game missing insert it only add missing game
router.post("/api/playtechuseonly/168168", async (req, res) => {
  try {
    const filePath = path.join(
      __dirname,
      "../../public/Game_Import_Template.xlsx"
    );
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet);

    const excelGames = [];

    for (const row of rows) {
      const normalizedType = normalizeGameType(row["Game Type"]);
      if (!normalizedType) {
        console.log("Skipping invalid game type:", row["Game Type"]);
        continue;
      }

      const rtpValue = parseRTP(
        row["RTP "] || row["RTP\n"] || row["RTP \n返還率"]
      );

      excelGames.push({
        gameNameEN: row["Game Name"],
        gameNameCN: row["Simplified Chinese"],
        gameNameHK: row["Traditional Chinese"],
        gameNameID: row["Indonesia"],
        gameNameMS: row["Malay"],
        gameID: row["Game Code"],
        gameType: normalizedType,
        rtpRate: rtpValue,
      });
    }

    if (excelGames.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No valid games in Excel file." });
    }

    // Get all games from database
    const dbGames = await GamePlaytechGameModal.find({}).lean();

    // Extract game codes from Excel
    const excelGameCodes = new Set(
      excelGames.map((game) => game.gameID?.toString())
    );

    // Extract game IDs from database
    const dbGameIds = new Set(dbGames.map((game) => game.gameID?.toString()));

    // Find missing games (in Excel but not in DB)
    const missingGames = excelGames.filter(
      (game) => !dbGameIds.has(game.gameID?.toString())
    );

    // Find extra games (in DB but not in Excel)
    const extraGameIds = dbGames
      .filter((game) => !excelGameCodes.has(game.gameID?.toString()))
      .map((game) => game._id);

    // Insert missing games
    let insertedCount = 0;
    if (missingGames.length > 0) {
      const insertResult = await GamePlaytechGameModal.insertMany(missingGames);
      insertedCount = insertResult.length;
    }

    // Set maintenance to true for extra games
    let maintenanceUpdatedCount = 0;
    if (extraGameIds.length > 0) {
      const updateResult = await GamePlaytechGameModal.updateMany(
        { _id: { $in: extraGameIds } },
        { $set: { maintenance: true } }
      );
      maintenanceUpdatedCount = updateResult.modifiedCount;
    }

    // Format results
    const missingGamesFormatted = missingGames.map((game) => ({
      gameCode: game.gameID,
      gameName: game.gameNameEN,
      gameNameCN: game.gameNameCN,
      gameType: game.gameType,
      rtpRate: game.rtpRate,
    }));

    res.status(200).json({
      success: true,
      summary: {
        excelTotal: excelGames.length,
        databaseTotal: dbGames.length,
        missingGamesInserted: insertedCount,
        extraGamesSetToMaintenance: maintenanceUpdatedCount,
      },
      details: {
        insertedGames: missingGamesFormatted,
        maintenanceCount: extraGameIds.length,
      },
      message: "Game import and maintenance update completed successfully",
    });
  } catch (error) {
    console.error("Import Games Error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error importing games" });
  }
});

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
        gameNameHK: row["Traditional Chinese"],
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

    await GameExpansesStudiosGameModal.insertMany(games);
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

router.post("/api/importImgUrl/expansesstudios", async (req, res) => {
  try {
    const bucket = "allgameslist";
    const basePathEN = "expansesstudio/en/";

    // Get all games from the database that need images
    const allGames = await GameExpansesStudiosGameModal.find(
      {
        $or: [
          { imageUrlEN: { $exists: false } },
          { imageUrlEN: "" },
          { imageUrlEN: null },
        ],
        gameNameEN: { $exists: true, $ne: "" },
      },
      { gameID: 1, gameNameEN: 1, _id: 1 }
    ).lean();

    if (!allGames.length) {
      return res.status(200).json({
        success: true,
        message: "No games found needing image sync",
      });
    }

    console.log(`Found ${allGames.length} games needing image sync`);

    /**
     * Normalize string: lowercase, remove spaces and special characters
     * Example: "Wild West Gold!" -> "wildwestgold"
     */
    const normalizeString = (str) => {
      if (!str) return "";
      return str
        .toLowerCase()
        .replace(/\s+/g, "") // Remove spaces
        .replace(/[^a-z0-9]/g, ""); // Remove special characters, keep only letters and numbers
    };

    /**
     * Extract game name from filename and normalize it
     * Format: "Wild West Gold.png" -> "wildwestgold"
     */
    const extractGameNameFromFilename = (filename) => {
      // Remove file extension
      const nameWithoutExt = filename.replace(
        /\.(jpg|jpeg|png|gif|webp)$/i,
        ""
      );
      return normalizeString(nameWithoutExt);
    };

    // Get all objects from S3 - EN
    const enObjectsResult = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: basePathEN,
      })
    );

    // Create lookup map based on normalized game name
    const enImageMap = {};

    console.log("\n=== Processing EN Images ===");
    if (enObjectsResult.Contents) {
      enObjectsResult.Contents.forEach((object) => {
        const filename = object.Key.split("/").pop();

        // Only process image files
        if (!filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          return;
        }

        const normalizedName = extractGameNameFromFilename(filename);

        if (normalizedName) {
          const imageUrl = `https://${bucket}.s3.ap-southeast-1.amazonaws.com/${object.Key}`;
          enImageMap[normalizedName] = {
            url: imageUrl,
            originalFilename: filename,
          };
        }
      });
    }
    console.log(`EN Image Map: ${Object.keys(enImageMap).length} entries`);

    // Build bulk operations
    const bulkOps = [];
    const matchedGames = [];
    const unmatchedGames = [];

    for (const game of allGames) {
      const normalizedGameName = normalizeString(game.gameNameEN);

      // Match normalized names
      const enImage = enImageMap[normalizedGameName];

      if (enImage) {
        bulkOps.push({
          updateOne: {
            filter: { _id: game._id },
            update: { $set: { imageUrlEN: enImage.url } },
          },
        });

        matchedGames.push({
          gameID: game.gameID,
          gameNameEN: game.gameNameEN,
          normalizedName: normalizedGameName,
          matchedFilename: enImage.originalFilename,
          imageUrlEN: enImage.url,
        });

        console.log(
          `✅ Matched: "${game.gameNameEN}" (${normalizedGameName}) -> ${enImage.originalFilename}`
        );
      } else {
        unmatchedGames.push({
          gameID: game.gameID,
          gameNameEN: game.gameNameEN,
          normalizedName: normalizedGameName,
        });

        console.log(
          `❌ No match for: "${game.gameNameEN}" (${normalizedGameName})`
        );
      }
    }

    // Execute bulk update
    let updatedCount = 0;
    if (bulkOps.length) {
      const result = await GameExpansesStudiosGameModal.bulkWrite(bulkOps);
      updatedCount = result.modifiedCount;
    }

    // Log available S3 images for debugging (first 10)
    const availableS3Images = Object.entries(enImageMap)
      .slice(0, 10)
      .map(([normalized, data]) => ({
        normalizedName: normalized,
        originalFilename: data.originalFilename,
      }));

    return res.status(200).json({
      success: true,
      message: `Successfully synced images for ${updatedCount} games`,
      totalGames: allGames.length,
      updatedGames: updatedCount,
      matchedCount: bulkOps.length,
      unmatchedCount: allGames.length - bulkOps.length,
      enImagesAvailable: Object.keys(enImageMap).length,
      matchedExamples: matchedGames.slice(0, 10),
      unmatchedExamples: unmatchedGames.slice(0, 10),
      availableS3ImagesExamples: availableS3Images,
    });
  } catch (error) {
    console.error("Error syncing Expanses Studios images:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to sync game images",
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
    const missingImageGames = await GameExpansesStudiosGameModal.find({
      $or: [{ imageUrlEN: { $exists: false } }, { imageUrlEN: "" }],
      maintenance: false,
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
    const allGames = await GameIBexGameModal.find().lean(); // lean() for plain JS objects

    if (!allGames || allGames.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No game data found to export.",
      });
    }

    // Create a temporary file
    const exportFilePath = path.join(__dirname, "../../exports/ibex.json");

    // Ensure export directory exists
    const exportDir = path.dirname(exportFilePath);
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    fs.writeFileSync(exportFilePath, JSON.stringify(allGames, null, 2), "utf8");

    // Send file for download
    res.download(exportFilePath, "megah5.json", (err) => {
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

router.post("/admin/api/replace-s3-with-cloudfront", async (req, res) => {
  try {
    const CLOUDFRONT_BASE_URL = "https://d2bdzvbz2cmjb8.cloudfront.net";
    const S3_PREFIX = "https://allgameslist.s3.ap-southeast-1.amazonaws.com";

    const modelsToUpdate = [
      // GameApolloGameModal,
      // GameClotPlayGameModal,
      // GameCq9GameModal,
      // GameEpicWinGameModal,
      // GameFachaiGameModal,
      // GameJILIGameModal,
      // GameMicroGamingGameModal,
      // GamePPGameModal,
      // GameLive22GameModal,
      // GameMegah5GameModal,
      // GameNinjaGameModal,
      // GamePlaytechGameModal,
      // GameSimplePlayGameModal,
      // GameUUSLOTGameModal,
      // GameVaGamingGameModal,
      // GameRichGamingGameModal,
      // GameWfGamingGameModal,
      // GameRich88GameModal,
      // GameDragoonSoftGameModal,
      // GameDragonGamingGameModal,
      // GameYLGamingGameModal,
      // GameYGRGameModal,
      // GameHacksawGameModal,
      // GameRelaxGamingGameModal,
      GameIBexGameModal,
      // GameYellowBatGameModal,
      // GamePlaytechGameModal,
      // GamePegasusGameModal,
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
          "imageUrlTH",
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
