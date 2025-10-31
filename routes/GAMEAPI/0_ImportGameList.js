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
    const importFilePath = path.join(__dirname, "../../public/bng.json");
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
    await GameBNGGameModal.deleteMany();
    // Insert into MongoDB
    await GameBNGGameModal.insertMany(gameList);

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
        gameNameID: row["Indonesia"],
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

    await GameYGRGameModal.insertMany(games);
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

router.post("/api/importImgUrl/yesgetrich", async (req, res) => {
  try {
    const bucket = "allgameslist";
    const basePathEN = "yesgetrich/en/";
    const basePathCN = "yesgetrich/zh/";
    const basePathHK = "yesgetrich/hk/";
    const basePathID = "yesgetrich/id/";

    // Get all games from the database that need images
    const allGames = await GameYGRGameModal.find(
      {
        $or: [
          { imageUrlEN: { $exists: false } },
          { imageUrlEN: "" },
          { imageUrlCN: { $exists: false } },
          { imageUrlCN: "" },
          { imageUrlHK: { $exists: false } },
          { imageUrlHK: "" },
          { imageUrlID: { $exists: false } },
          { imageUrlID: "" },
        ],
        gameID: { $exists: true, $ne: "" },
      },
      { gameID: 1, gameNameEN: 1, _id: 1 }
    );

    if (!allGames.length) {
      return res.status(404).json({
        success: false,
        message: "No games found in database to sync",
      });
    }

    console.log(`Found ${allGames.length} games needing image sync`);

    /**
     * Extract game ID from AWS filename
     * Format: "Y_001_500x500_04_en.png" or "Y_002_500x500_04_zh.png"
     * Returns: "1" (removes leading zeros)
     */
    const extractGameIDFromFilename = (filename) => {
      console.log(`  Processing filename: ${filename}`);

      // Match pattern: Y_{gameID}_500x500_{number}_{lang}.{ext}
      const match = filename.match(
        /^Y_(\d+)_500x500_\d+_(en|zh|hk|id|cn|tw)\.(jpg|jpeg|png|gif|webp)$/i
      );

      if (match) {
        const gameIDWithZeros = match[1]; // e.g., "001"
        const gameID = String(parseInt(gameIDWithZeros, 10)); // Convert to "1" (remove leading zeros)
        console.log(`  Extracted game ID: ${gameIDWithZeros} -> ${gameID}`);
        return gameID;
      }

      console.log(`  ❌ Could not extract game ID from filename`);
      return null;
    };

    // Get all objects from S3 for all language paths
    const [enObjectsResult, cnObjectsResult, hkObjectsResult, idObjectsResult] =
      await Promise.all([
        s3Client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: basePathEN,
          })
        ),
        s3Client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: basePathCN,
          })
        ),
        s3Client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: basePathHK,
          })
        ),
        s3Client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: basePathID,
          })
        ),
      ]);

    // Create lookup maps based on game ID
    const enImageMap = {};
    const cnImageMap = {};
    const hkImageMap = {};
    const idImageMap = {};

    console.log("\n=== Processing EN Images ===");
    // Process EN images
    if (enObjectsResult.Contents) {
      enObjectsResult.Contents.forEach((object) => {
        const filename = object.Key.split("/").pop(); // Get filename without path

        // Only process files matching pattern: Y_{number}_500x500_{number}_en.{ext}
        if (
          !filename.match(/^Y_\d+_500x500_\d+_en\.(jpg|jpeg|png|gif|webp)$/i)
        ) {
          console.log(`  Skipping non-matching file: ${filename}`);
          return;
        }

        const gameID = extractGameIDFromFilename(filename);

        if (gameID) {
          const imageUrl = `https://${bucket}.s3.ap-southeast-1.amazonaws.com/${object.Key}`;
          enImageMap[gameID] = imageUrl;
          console.log(`  ✅ Mapped gameID ${gameID} -> ${imageUrl}`);
        }
      });
    }

    console.log("\n=== Processing CN Images ===");
    // Process CN images
    if (cnObjectsResult.Contents) {
      cnObjectsResult.Contents.forEach((object) => {
        const filename = object.Key.split("/").pop();

        // Only process files matching pattern: Y_{number}_500x500_{number}_zh.{ext}
        if (
          !filename.match(/^Y_\d+_500x500_\d+_cn\.(jpg|jpeg|png|gif|webp)$/i)
        ) {
          console.log(`  Skipping non-matching file: ${filename}`);
          return;
        }

        const gameID = extractGameIDFromFilename(filename);

        if (gameID) {
          const imageUrl = `https://${bucket}.s3.ap-southeast-1.amazonaws.com/${object.Key}`;
          cnImageMap[gameID] = imageUrl;
          console.log(`  ✅ Mapped gameID ${gameID} -> ${imageUrl}`);
        }
      });
    }

    console.log("\n=== Processing HK Images ===");
    // Process HK images
    if (hkObjectsResult.Contents) {
      hkObjectsResult.Contents.forEach((object) => {
        const filename = object.Key.split("/").pop();

        // Only process files matching pattern: Y_{number}_500x500_{number}_hk.{ext}
        if (
          !filename.match(/^Y_\d+_500x500_\d+_tw\.(jpg|jpeg|png|gif|webp)$/i)
        ) {
          console.log(`  Skipping non-matching file: ${filename}`);
          return;
        }

        const gameID = extractGameIDFromFilename(filename);

        if (gameID) {
          const imageUrl = `https://${bucket}.s3.ap-southeast-1.amazonaws.com/${object.Key}`;
          hkImageMap[gameID] = imageUrl;
          console.log(`  ✅ Mapped gameID ${gameID} -> ${imageUrl}`);
        }
      });
    }

    console.log("\n=== Processing ID Images ===");
    // Process ID images
    if (idObjectsResult.Contents) {
      idObjectsResult.Contents.forEach((object) => {
        const filename = object.Key.split("/").pop();

        // Only process files matching pattern: Y_{number}_500x500_{number}_id.{ext}
        if (
          !filename.match(/^Y_\d+_500x500_\d+_id\.(jpg|jpeg|png|gif|webp)$/i)
        ) {
          console.log(`  Skipping non-matching file: ${filename}`);
          return;
        }

        const gameID = extractGameIDFromFilename(filename);

        if (gameID) {
          const imageUrl = `https://${bucket}.s3.ap-southeast-1.amazonaws.com/${object.Key}`;
          idImageMap[gameID] = imageUrl;
          console.log(`  ✅ Mapped gameID ${gameID} -> ${imageUrl}`);
        }
      });
    }

    console.log(
      `\nEN Image Map created with ${Object.keys(enImageMap).length} entries`
    );
    console.log(
      `CN Image Map created with ${Object.keys(cnImageMap).length} entries`
    );
    console.log(
      `HK Image Map created with ${Object.keys(hkImageMap).length} entries`
    );
    console.log(
      `ID Image Map created with ${Object.keys(idImageMap).length} entries`
    );

    // Update each game document with the corresponding image URLs
    const updatePromises = allGames.map(async (game) => {
      const updates = {};

      // Debug logging for each game
      console.log(
        `\nProcessing game: gameID="${game.gameID}", name="${game.gameNameEN}"`
      );

      // Match images using game ID (exact match)
      if (enImageMap[game.gameID]) {
        updates.imageUrlEN = enImageMap[game.gameID];
        console.log(`  ✅ EN image found: ${enImageMap[game.gameID]}`);
      } else {
        console.log(`  ❌ EN image NOT found for gameID: ${game.gameID}`);
      }

      if (cnImageMap[game.gameID]) {
        updates.imageUrlCN = cnImageMap[game.gameID];
        console.log(`  ✅ CN image found: ${cnImageMap[game.gameID]}`);
      } else {
        console.log(`  ❌ CN image NOT found for gameID: ${game.gameID}`);
      }

      if (hkImageMap[game.gameID]) {
        updates.imageUrlHK = hkImageMap[game.gameID];
        console.log(`  ✅ HK image found: ${hkImageMap[game.gameID]}`);
      } else {
        console.log(`  ❌ HK image NOT found for gameID: ${game.gameID}`);
      }

      if (idImageMap[game.gameID]) {
        updates.imageUrlID = idImageMap[game.gameID];
        console.log(`  ✅ ID image found: ${idImageMap[game.gameID]}`);
      } else {
        console.log(`  ❌ ID image NOT found for gameID: ${game.gameID}`);
      }

      // Only update if we found at least one matching image
      if (Object.keys(updates).length > 0) {
        console.log(`  ✅ Updating game ${game.gameID} with images`);
        return GameYGRGameModal.findByIdAndUpdate(
          game._id,
          { $set: updates },
          { new: true }
        );
      } else {
        console.log(`  ⚠️ No images found for game ${game.gameID}`);
      }

      return null;
    });

    // Execute all updates
    const results = await Promise.all(updatePromises);

    // Count successful updates (non-null results)
    const updatedCount = results.filter((result) => result !== null).length;

    // Get examples of unmatched games for debugging
    const unmatchedGames = allGames
      .filter((game, index) => results[index] === null)
      .slice(0, 10)
      .map((game) => ({
        gameNameEN: game.gameNameEN,
        gameID: game.gameID,
      }));

    // Get examples of matched games
    const matchedGames = results
      .filter((result) => result !== null)
      .slice(0, 5)
      .map((game) => ({
        gameID: game.gameID,
        gameNameEN: game.gameNameEN,
        imageUrlEN: game.imageUrlEN || "Not set",
        imageUrlCN: game.imageUrlCN || "Not set",
        imageUrlHK: game.imageUrlHK || "Not set",
        imageUrlID: game.imageUrlID || "Not set",
      }));

    return res.status(200).json({
      success: true,
      message: `Successfully synced images for ${updatedCount} games`,
      totalGames: allGames.length,
      updatedGames: updatedCount,
      unmatchedGames: allGames.length - updatedCount,
      enImagesAvailable: Object.keys(enImageMap).length,
      cnImagesAvailable: Object.keys(cnImageMap).length,
      hkImagesAvailable: Object.keys(hkImageMap).length,
      idImagesAvailable: Object.keys(idImageMap).length,
      matchedExamples: matchedGames,
      unmatchedExamples: unmatchedGames,
    });
  } catch (error) {
    console.error("Error syncing YesGetRich images:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to sync game images",
      error: error.message,
      stack: error.stack,
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
    const missingImageGames = await GameYGRGameModal.find({
      $or: [
        { imageUrlEN: { $exists: false } },
        { imageUrlEN: "" },
        { imageUrlCN: { $exists: false } },
        { imageUrlCN: "" },
        { imageUrlHK: { $exists: false } },
        { imageUrlHK: "" },
        { imageUrlID: { $exists: false } },
        { imageUrlID: "" },
      ],
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
    const allGames = await GamePlayAceGameModal.find().lean(); // lean() for plain JS objects

    if (!allGames || allGames.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No game data found to export.",
      });
    }

    // Create a temporary file
    const exportFilePath = path.join(__dirname, "../../exports/playace.json");

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
      GameYLGamingGameModal,
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
