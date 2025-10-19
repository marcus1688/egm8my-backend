const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

const { User, GameDataLog } = require("../../models/users.model");
const SlotJokerModal = require("../../models/slot_joker.model");
const axios = require("axios");
const moment = require("moment");
const { authenticateToken } = require("../../auth/auth");
const { authenticateAdminToken } = require("../../auth/adminAuth");
const crypto = require("crypto");
const querystring = require("querystring");
const GameWalletLog = require("../../models/gamewalletlog.model");
const GameJokerGameModal = require("../../models/slot_jokerDatabase.model");

require("dotenv").config();

//Staging
const jokerAppID = "FQQS";
const jokerSecret = process.env.JOKER_SECRET;
const webURL = "https://www.oc7.me/";
const jokerApiURL = "https://w.apiext88.net/seamless";
const jokerGameURL = "https://www.weimen99f.net";

function getCurrentTimestamp() {
  return moment().unix();
}

function generateSignature(fields, secretKey) {
  // Sort the keys in alphabetical order and convert them to lowercase
  const sortedKeys = Object.keys(fields).sort();
  const sortedFields = sortedKeys.map((key) => {
    const value = fields[key];
    return `${key.toLowerCase()}=${value}`;
  });

  // Join the sorted key-value pairs and append the secretKey
  const rawData = sortedFields.join("&") + secretKey;

  const hash = crypto.createHash("md5").update(rawData).digest("hex");
  return hash;
}

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function roundToTwoDecimalsForHashing(num) {
  return (Math.round(num * 100) / 100).toFixed(2);
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

router.post("/api/joker/update-hot-games", async (req, res) => {
  try {
    // Get games from API
    const config = {
      appId: jokerAppID,
      secretKey: jokerSecret,
    };

    const timestamp = Math.floor(Date.now() / 1000);
    const params = {
      AppID: config.appId,
      Timestamp: timestamp,
    };

    const hash = generateSignature(params, config.secretKey);
    params.Hash = hash;

    // Fetch games from API
    const apiResponse = await axios.post(`${jokerApiURL}/list-games`, params, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
    });

    if (apiResponse.data.Error !== "0") {
      return res.status(200).json({
        success: false,
        message: "API error",
        error: apiResponse.data.Description,
      });
    }

    // Sort ALL games by order (lowest order = most popular)
    const sortedGames = apiResponse.data.ListGames.sort((a, b) => {
      const orderA = parseInt(a.Order) || 999999;
      const orderB = parseInt(b.Order) || 999999;
      return orderA - orderB;
    });

    console.log(`Processing ${sortedGames.length} games...`);

    // First, set all games hot = false
    await GameJokerGameModal.updateMany({}, { $set: { hot: false } });

    // Get top 10 for hot status
    const top10Games = sortedGames.slice(0, 10);
    const top10GameCodes = top10Games.map((game) => game.GameCode);

    // Update ALL games with createdAt based on their order
    const updateResults = [];
    const baseTime = new Date(); // Current time for the #1 game

    // Process all games
    for (let i = 0; i < sortedGames.length; i++) {
      const game = sortedGames[i];
      const gameCode = game.GameCode;
      const isTop10 = i < 10; // First 10 games are top 10

      // Calculate createdAt: #1 game = latest time, each subsequent game is 30 minutes earlier
      const createdAtTime = new Date(baseTime.getTime() - i * 30 * 60 * 1000);

      try {
        // Use MongoDB collection directly to bypass Mongoose timestamps
        const updateResult = await GameJokerGameModal.collection.updateOne(
          { gameID: gameCode },
          {
            $set: {
              hot: isTop10, // Only top 10 are hot
              createdAt: createdAtTime,
              updatedAt: new Date(),
            },
          }
        );

        updateResults.push({
          order: game.Order,
          gameCode: gameCode,
          gameName: game.GameName,
          createdAt: createdAtTime.toISOString(),
          isTop10: isTop10,
          hot: isTop10,
          matched: updateResult.matchedCount > 0,
          updated: updateResult.modifiedCount > 0,
        });

        if (i < 20 || updateResult.matchedCount === 0) {
          // Log first 20 and any not found
          console.log(
            `#${i + 1} - Order ${game.Order}: ${
              game.GameName
            } (${gameCode}) - ${createdAtTime.toISOString()} - ${
              updateResult.matchedCount > 0 ? "FOUND" : "NOT FOUND"
            } - Hot: ${isTop10}`
          );
        }
      } catch (error) {
        console.error(`Error updating game ${gameCode}:`, error);
        updateResults.push({
          order: game.Order,
          gameCode: gameCode,
          gameName: game.GameName,
          createdAt: createdAtTime.toISOString(),
          isTop10: isTop10,
          hot: isTop10,
          matched: false,
          updated: false,
          error: error.message,
        });
      }
    }

    // Count results
    const totalMatched = updateResults.filter((r) => r.matched).length;
    const totalUpdated = updateResults.filter((r) => r.updated).length;
    const top10Matched = updateResults.filter(
      (r) => r.isTop10 && r.matched
    ).length;
    const notFound = updateResults.filter((r) => !r.matched);

    console.log(
      `Update complete: ${totalUpdated}/${sortedGames.length} games updated, ${top10Matched}/10 top games found`
    );

    return res.status(200).json({
      success: true,
      message: `Updated ${totalUpdated} games with new createdAt times and ${top10Matched} hot games`,
      summary: {
        totalAPIGames: sortedGames.length,
        totalFoundInDB: totalMatched,
        totalUpdated: totalUpdated,
        top10HotGames: top10Matched,
        notFoundInDB: sortedGames.length - totalMatched,
        allGamesSetToNotHot: true,
      },
      top10Results: updateResults.slice(0, 10), // Show top 10 results
      totalNotFound: notFound.length,
      sampleNotFound: notFound.slice(0, 5).map((g) => ({
        gameCode: g.gameCode,
        gameName: g.gameName,
        order: g.order,
      })),
    });
  } catch (error) {
    console.error("Update hot games error:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating hot games",
      error: error.message,
    });
  }
});

router.post("/api/joker/import-games", async (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");

    // Path to your exported JSON file
    const filePath = path.join(__dirname, "../../public/joker.json");

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message:
          "joker.json file not found. Please ensure the file exists in public folder.",
      });
    }

    // Read the JSON file
    const fileContent = fs.readFileSync(filePath, "utf8");
    const gameData = JSON.parse(fileContent);

    // Validate that it's an array
    if (!Array.isArray(gameData)) {
      return res.status(400).json({
        success: false,
        message: "Invalid JSON format. Expected an array of games.",
      });
    }

    // Clean the games data - remove MongoDB specific fields
    const cleanGames = gameData.map((game) => {
      const cleanGame = { ...game };

      // Remove MongoDB specific fields
      delete cleanGame._id;
      delete cleanGame.__v;
      delete cleanGame.createdAt;
      delete cleanGame.updatedAt;

      return cleanGame;
    });

    console.log(`Preparing to import ${cleanGames.length} games...`);

    // Delete all existing games and insert new ones
    const deleteResult = await GameJokerGameModal.deleteMany({});
    console.log(`Deleted ${deleteResult.deletedCount} existing games`);

    const insertResult = await GameJokerGameModal.insertMany(cleanGames);
    console.log(`Successfully imported ${insertResult.length} games`);

    return res.status(200).json({
      success: true,
      message: {
        en: `Successfully imported ${insertResult.length} games.`,
        zh: `成功导入 ${insertResult.length} 个游戏。`,
        ms: `Berjaya mengimport ${insertResult.length} permainan.`,
      },
      details: {
        totalImported: insertResult.length,
        deletedExisting: deleteResult.deletedCount,
        filePath: filePath,
      },
    });
  } catch (error) {
    console.error("Error importing joker games:", error.message);

    // Handle specific error types
    if (error instanceof SyntaxError) {
      return res.status(400).json({
        success: false,
        message: "Invalid JSON format in joker.json file.",
        error: error.message,
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Duplicate key error during import.",
        error: "Some games have duplicate gameID values.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to import joker games.",
      error: error.message,
    });
  }
});

router.post("/api/joker/getprovidergamelist", async (req, res) => {
  try {
    // Configuration - replace with your actual values
    const config = {
      appId: jokerAppID,
      secretKey: jokerSecret,
    };

    const timestamp = Math.floor(Date.now() / 1000);

    const params = {
      AppID: config.appId,
      Timestamp: timestamp,
    };

    // Generate hash signature
    const hash = generateSignature(params, config.secretKey);

    if (!hash) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate signature hash",
      });
    }

    // Add hash to parameters
    params.Hash = hash;

    // Make API request
    const response = await axios.post(`${jokerApiURL}/list-games`, params, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000, // 30 second timeout
    });

    console.log("📥 API Response status:", response.status);
    console.log(
      "📥 API Response data:",
      JSON.stringify(response.data, null, 2)
    );

    // Check if the API returned an error
    if (response.data.Error !== "0") {
      console.error("❌ API returned error:", response.data.Description);
      return res.status(200).json({
        success: false,
        message: "Game provider API returned an error",
        error: {
          code: response.data.Error,
          description: response.data.Description,
        },
      });
    }

    // Process the games list
    const gamesList = response.data.ListGames || [];
    console.log(`✅ Retrieved ${gamesList.length} games`);

    // Sort games by Order (lower values first - more popular games)
    const sortedGames = gamesList.sort((a, b) => {
      const orderA = parseInt(a.Order) || 999999;
      const orderB = parseInt(b.Order) || 999999;
      return orderA - orderB;
    });

    // Log sample games
    if (sortedGames.length > 0) {
      console.log("🎯 Top 3 games (by Order):");
      sortedGames.slice(0, 3).forEach((game, index) => {
        console.log(
          `  ${index + 1}. ${game.GameName} (Order: ${game.Order}, Code: ${
            game.GameCode
          })`
        );
      });
    }

    // Categorize games by type and specials
    const gameStats = {
      total: sortedGames.length,
      byType: {},
      withSpecials: {
        hot: 0,
        new: 0,
        hotAndNew: 0,
      },
    };

    sortedGames.forEach((game) => {
      // Count by game type
      const gameType = game.GameType || "Unknown";
      gameStats.byType[gameType] = (gameStats.byType[gameType] || 0) + 1;

      // Count specials
      const specials = (game.Specials || "").toLowerCase();
      if (specials.includes("hot") && specials.includes("new")) {
        gameStats.withSpecials.hotAndNew++;
      } else if (specials.includes("hot")) {
        gameStats.withSpecials.hot++;
      } else if (specials.includes("new")) {
        gameStats.withSpecials.new++;
      }
    });

    console.log("📊 Game statistics:", gameStats);

    return res.status(200).json({
      success: true,
      message: `Successfully retrieved ${gamesList.length} games`,
      timestamp: new Date().toISOString(),
      data: {
        games: sortedGames,
        statistics: gameStats,
        requestInfo: {
          appId: config.appId,
          timestamp: timestamp,
          hash: hash,
          totalGames: sortedGames.length,
        },
      },
    });
  } catch (error) {
    console.error("❌ List games error:", error.message);

    // Handle specific error types
    if (error.response) {
      // API responded with error status
      console.error("API Error Response:", error.response.data);
      return res.status(200).json({
        success: false,
        message: "Game provider API error",
        error: {
          status: error.response.status,
          data: error.response.data,
        },
      });
    } else if (error.request) {
      // Request timeout or network error
      console.error("Network Error:", error.request);
      return res.status(200).json({
        success: false,
        message: "Network error when calling game provider API",
        error: "NETWORK_ERROR",
      });
    } else {
      // Other error
      return res.status(500).json({
        success: false,
        message: "Internal server error while fetching games list",
        error: error.message,
      });
    }
  }
});

router.post("/api/joker/authenticate-token", async (req, res) => {
  try {
    const { appid, hash, ip, timestamp, token } = req.body;

    if (!appid || !hash || !token || appid !== jokerAppID) {
      return res.status(200).json({
        Username: null,
        Balance: 0.0,
        Message:
          !appid || !hash || !token ? "Invalid parameters" : "Invalid AppID",
        Status: !appid || !hash || !token ? 4 : 2,
      });
    }

    const generatedHash = generateSignature(
      {
        appid: jokerAppID,
        ip,
        timestamp,
        token,
      },
      jokerSecret
    );

    if (hash !== generatedHash) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "InvalidSignature",
        Status: 5,
        Username: null,
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "InvalidToken",
        Status: 3,
        Username: null,
      });
    }

    const userId = decoded.userId;
    const user = await User.findById(userId, { username: 1, wallet: 1 }).lean();

    if (!user) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid Username or Password",
        Status: 7,
        Username: null,
      });
    }

    const toLowerCaseUsername = user.username.toLowerCase();

    return res.status(200).json({
      Username: toLowerCaseUsername,
      Balance: roundToTwoDecimals(user.wallet),
      Message: "Success",
      Status: 0,
    });
  } catch (error) {
    console.log("joker authenticate-token", error.message);
    if (error.message === "jwt expired" || error.message === "invalid token") {
      return res.status(200).json({
        Balance: 0.0,
        Message: "InvalidToken",
        Status: 3,
        Username: null,
      });
    } else {
      return res.status(500).json({
        Username: null,
        Balance: 0.0,
        Message: "Other",
        Status: 1000,
      });
    }
  }
});

router.post("/api/joker/balance", async (req, res) => {
  try {
    const { appid, hash, timestamp, username } = req.body;

    if (!appid || !hash || !username || appid !== jokerAppID) {
      return res.status(200).json({
        Balance: 0.0,
        Message:
          !appid || !hash || !username ? "Invalid parameters" : "Invalid AppID",
        Status: !appid || !hash || !username ? 4 : 2,
      });
    }

    const generatedHash = generateSignature(
      {
        appid: jokerAppID,
        timestamp,
        username,
      },
      jokerSecret
    );

    if (hash !== generatedHash) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "InvalidSignature",
        Status: 5,
      });
    }

    const toLowerCaseUsername = username.toLowerCase();
    const user = await User.findOne(
      { username: toLowerCaseUsername },
      { wallet: 1 }
    ).lean();

    if (!user) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid Username or Password",
        Status: 7,
      });
    }

    return res.status(200).json({
      Balance: roundToTwoDecimals(user.wallet),
      Message: "Success",
      Status: 0,
    });
  } catch (error) {
    console.log("joker balance", error.message);
    return res.status(500).json({
      Balance: 0.0,
      Message: "Other",
      Status: 1000,
    });
  }
});

router.post("/api/joker/bet", async (req, res) => {
  try {
    const { appid, hash, id, amount, username, timestamp, gamecode, roundid } =
      req.body;

    if (
      !appid ||
      !hash ||
      amount === undefined ||
      amount === null ||
      !username ||
      !roundid ||
      appid !== jokerAppID
    ) {
      return res.status(200).json({
        Balance: 0.0,
        Message: appid !== jokerAppID ? "Invalid AppID" : "Invalid parameters",
        Status: appid !== jokerAppID ? 2 : 4,
      });
    }

    const formattedAmountForHashing = roundToTwoDecimalsForHashing(amount);

    const generatedHash = generateSignature(
      {
        amount: formattedAmountForHashing,
        appid: jokerAppID,
        gamecode,
        id,
        roundid,
        timestamp,
        username,
      },
      jokerSecret
    );

    if (hash !== generatedHash) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "InvalidSignature",
        Status: 5,
      });
    }

    const toLowerCaseUsername = username.toLowerCase();

    const [user, existingBet] = await Promise.all([
      User.findOne(
        { username: toLowerCaseUsername },
        { username: 1, wallet: 1, "gameLock.joker.lock": 1 }
      ).lean(),
      SlotJokerModal.findOne(
        {
          username: toLowerCaseUsername,
          betId: id,
          $or: [{ bet: true }, { cancel: true }],
        },
        { _id: 1 }
      ).lean(),
    ]);

    if (!user) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid Username or Password",
        Status: 7,
      });
    }

    if (user.gameLock?.joker?.lock) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Player locked",
        Status: 1000,
      });
    }

    if (existingBet) {
      return res.status(200).json({
        Balance: roundToTwoDecimals(user.wallet),
        Message: "Bet existed",
        Status: 0,
      });
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        username: toLowerCaseUsername,
        wallet: { $gte: roundToTwoDecimals(amount) },
      },
      { $inc: { wallet: -roundToTwoDecimals(amount || 0) } },
      { new: true, projection: { wallet: 1 } }
    );

    if (!updatedUserBalance) {
      const latestUser = await User.findOne(
        { username: toLowerCaseUsername },
        { wallet: 1 }
      ).lean();
      return res.status(200).json({
        Balance: roundToTwoDecimals(latestUser?.wallet || 0),
        Message: "Insufficient fund",
        Status: 100,
      });
    }

    await SlotJokerModal.create({
      username: user.username,
      betId: id,
      roundId: roundid,
      bet: true,
      betamount: roundToTwoDecimals(amount),
    });

    return res.status(200).json({
      Balance: roundToTwoDecimals(updatedUserBalance.wallet),
      Message: "Success",
      Status: 0,
    });
  } catch (error) {
    console.log("joker bet", error.message);
    return res.status(500).json({
      Balance: 0.0,
      Message: "Other",
      Status: 1000,
    });
  }
});

router.post("/api/joker/settle-bet", async (req, res) => {
  try {
    const {
      appid,
      hash,
      id,
      amount,
      username,
      timestamp,
      gamecode,
      roundid,
      description,
      type,
    } = req.body;

    if (
      !appid ||
      !hash ||
      !amount ||
      !username ||
      !roundid ||
      appid !== jokerAppID
    ) {
      return res.status(200).json({
        Balance: 0.0,
        Message:
          !appid || !hash || !amount || !username || !roundid
            ? "Invalid parameters"
            : "Invalid AppID",
        Status: !appid || !hash || !amount || !username || !roundid ? 4 : 2,
      });
    }

    const formattedAmountForHashing = roundToTwoDecimalsForHashing(amount);

    const generatedHash = generateSignature(
      {
        amount: formattedAmountForHashing,
        appid: jokerAppID,
        description,
        gamecode,
        id,
        roundid,
        timestamp,
        type,
        username,
      },
      jokerSecret
    );

    if (hash !== generatedHash) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "InvalidSignature",
        Status: 5,
      });
    }
    const toLowerCaseUsername = username.toLowerCase();

    const [user, bets, existingCancelBet] = await Promise.all([
      User.findOne({ username: toLowerCaseUsername }, { wallet: 1 }).lean(),
      SlotJokerModal.find(
        { roundId: roundid, bet: true },
        { _id: 1, betamount: 1 }
      ).lean(),
      SlotJokerModal.findOne({ settleId: id }, { _id: 1 }).lean(),
    ]);

    if (!user) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid Username or Password",
        Status: 7,
      });
    }

    if (!bets.length) {
      return res.status(200).json({
        Balance: roundToTwoDecimals(user.wallet),
        Message: "Bet not found",
        Status: 0,
      });
    }

    if (existingCancelBet) {
      return res.status(200).json({
        Balance: roundToTwoDecimals(user.wallet),
        Message: "Bet cancelled or settled",
        Status: 0,
      });
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      { username: toLowerCaseUsername },
      { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
      { new: true, projection: { wallet: 1 } }
    );

    const updatePromises = bets.map((bet, i) =>
      SlotJokerModal.findOneAndUpdate(
        { _id: bet._id },
        {
          $set: {
            settle: true,
            settleamount: i === 0 ? roundToTwoDecimals(amount) : 0,
            settleId: id,
          },
        }
      )
    );

    await Promise.all(updatePromises);

    return res.status(200).json({
      Balance: roundToTwoDecimals(updatedUserBalance.wallet),
      Message: "Success",
      Status: 0,
    });
  } catch (error) {
    console.log("joker settle-bet", error.message);
    return res.status(500).json({
      Balance: 0.0,
      Message: "Other",
      Status: 1000,
    });
  }
});

router.post("/api/joker/cancel-bet", async (req, res) => {
  try {
    const { appid, hash, id, username, timestamp, gamecode, roundid, betid } =
      req.body;

    if (!appid || !hash || !username || !id || !betid || appid !== jokerAppID) {
      return res.status(200).json({
        Balance: 0.0,
        Message:
          !appid || !hash || !username || !id || !betid
            ? "Invalid parameters"
            : "Invalid AppID",
        Status: !appid || !hash || !username || !id || !betid ? 4 : 2,
      });
    }

    const generatedHash = generateSignature(
      {
        appid: jokerAppID,
        betid,
        gamecode,
        id,
        roundid,
        timestamp,
        username,
      },
      jokerSecret
    );

    if (hash !== generatedHash) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "InvalidSignature",
        Status: 5,
      });
    }

    const toLowerCaseUsername = username.toLowerCase();

    const [user, betToCancel, existingCancelBet] = await Promise.all([
      User.findOne({ username: toLowerCaseUsername }, { wallet: 1 }).lean(),
      SlotJokerModal.findOne(
        {
          roundId: roundid,
          bet: true,
          betId: betid,
        },
        { _id: 1, betamount: 1 }
      ).lean(),
      SlotJokerModal.findOne({ cancelId: id }, { _id: 1 }).lean(),
    ]);

    if (!user) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid Username or Password",
        Status: 7,
      });
    }

    if (!betToCancel) {
      await SlotJokerModal.create({
        username: toLowerCaseUsername,
        betId: betid,
        cancelId: id,
        roundId: roundid,
        cancel: true,
      });

      return res.status(200).json({
        Balance: roundToTwoDecimals(user.wallet),
        Message: "Bet not found or already cancelled",
        Status: 0,
      });
    }

    if (existingCancelBet) {
      return res.status(200).json({
        Balance: roundToTwoDecimals(user.wallet),
        Message: "Bet cancelled or settled",
        Status: 0,
      });
    }

    // Refund the bet amount regardless of settlement status
    const refundAmount = betToCancel.betamount || 0;

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { username: toLowerCaseUsername },
        { $inc: { wallet: roundToTwoDecimals(refundAmount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ),
      SlotJokerModal.findOneAndUpdate(
        { _id: betToCancel._id },
        {
          $set: {
            cancel: true,
            cancelId: id,
          },
        }
      ),
    ]);

    return res.status(200).json({
      Balance: roundToTwoDecimals(updatedUserBalance.wallet),
      Message: "Success",
      Status: 0,
    });
  } catch (error) {
    console.log("cancel-bet", error.message);
    return res.status(500).json({
      Balance: 0.0,
      Message: "Other",
      Status: 1000,
    });
  }
});

router.post("/api/joker/bonus-win", async (req, res) => {
  try {
    const {
      appid,
      hash,
      id,
      amount,
      username,
      timestamp,
      gamecode,
      roundid,
      description,
      type,
    } = req.body;

    if (
      !appid ||
      !hash ||
      !amount ||
      !username ||
      !roundid ||
      appid !== jokerAppID
    ) {
      return res.status(200).json({
        Balance: 0.0,
        Message:
          !appid || !hash || !amount || !username || !roundid
            ? "Invalid parameters"
            : "Invalid AppID",
        Status: !appid || !hash || !amount || !username || !roundid ? 4 : 2,
      });
    }

    const formattedAmountForHashing = roundToTwoDecimalsForHashing(amount);

    const generatedHash = generateSignature(
      {
        amount: formattedAmountForHashing,
        appid: jokerAppID,
        description,
        gamecode,
        id,
        roundid,
        timestamp,
        type,
        username,
      },
      jokerSecret
    );

    if (hash !== generatedHash) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid signature",
        Status: 5,
      });
    }

    const toLowerCaseUsername = username.toLowerCase();

    const [user, existingBonus] = await Promise.all([
      User.findOne({ username: toLowerCaseUsername }, { wallet: 1 }).lean(),
      SlotJokerModal.findOne({ bonusId: id }, { _id: 1 }).lean(),
    ]);

    if (!user) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid Username or Password",
        Status: 7,
      });
    }

    if (existingBonus) {
      return res.status(200).json({
        Balance: roundToTwoDecimals(user.wallet),
        Message: "Bonus existed",
        Status: 0,
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { username: toLowerCaseUsername },
        { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ),
      SlotJokerModal.create({
        username: toLowerCaseUsername,
        bonusId: id,
        roundId: roundid,
        bonus: true,
        bet: true,
        settle: true,
        settleamount: roundToTwoDecimals(amount),
      }),
    ]);

    return res.status(200).json({
      Balance: roundToTwoDecimals(updatedUserBalance.wallet),
      Message: "Success",
      Status: 0,
    });
  } catch (error) {
    console.log("bonus-win", error.message);
    return res.status(500).json({
      Balance: 0.0,
      Message: "Other",
      Status: 1000,
    });
  }
});

router.post("/api/joker/jackpot-win", async (req, res) => {
  try {
    const {
      appid,
      hash,
      id,
      amount,
      username,
      timestamp,
      gamecode,
      roundid,
      description,
      type,
    } = req.body;

    if (
      !appid ||
      !hash ||
      !amount ||
      !username ||
      !roundid ||
      appid !== jokerAppID
    ) {
      return res.status(200).json({
        Balance: 0.0,
        Message:
          !appid || !hash || !amount || !username || !roundid
            ? "Invalid parameters"
            : "Invalid AppID",
        Status: !appid || !hash || !amount || !username || !roundid ? 4 : 2,
      });
    }
    const formattedAmountForHashing = roundToTwoDecimalsForHashing(amount);

    const generatedHash = generateSignature(
      {
        amount: formattedAmountForHashing,
        appid: jokerAppID,
        description,
        gamecode,
        id,
        roundid,
        timestamp,
        type,
        username,
      },
      jokerSecret
    );

    if (hash !== generatedHash) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid signature",
        Status: 5,
      });
    }

    const toLowerCaseUsername = username.toLowerCase();

    const [user, existingJackpot] = await Promise.all([
      User.findOne({ username: toLowerCaseUsername }, { wallet: 1 }).lean(),
      SlotJokerModal.findOne({ jackpotId: id }, { _id: 1 }).lean(),
    ]);

    if (!user) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid Username or Password",
        Status: 7,
      });
    }

    if (existingJackpot) {
      return res.status(200).json({
        Balance: roundToTwoDecimals(user.wallet),
        Message: "Jackpot existed",
        Status: 0,
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { username: toLowerCaseUsername },
        { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ),
      SlotJokerModal.create({
        username: user.username,
        jackpotId: id,
        betId: id,
        roundId: roundid,
        jackpot: true,
        settle: true,
        settleamount: roundToTwoDecimals(amount),
      }),
    ]);

    return res.status(200).json({
      Balance: roundToTwoDecimals(updatedUserBalance.wallet),
      Message: "Success",
      Status: 0,
    });
  } catch (error) {
    console.log("jackpot-win", error.message);
    return res.status(500).json({
      Balance: 0.0,
      Message: "Other",
      Status: 1000,
    });
  }
});

router.post("/api/joker/transaction", async (req, res) => {
  try {
    const {
      appid,
      hash,
      id,
      amount,
      result,
      username,
      timestamp,
      gamecode,
      roundid,
      description,
      type,
      startbalance,
      endbalance,
    } = req.body;

    if (!appid || !hash || !amount || !username || !roundid) {
      return res.status(200).json({
        Username: null,
        Balance: 0.0,
        Message: "Invalid parameters",
        Status: 4,
      });
    }

    if (appid !== jokerAppID) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid AppID",
        Status: 2,
      });
    }
    const formattedAmountForHashing = roundToTwoDecimalsForHashing(amount);

    const formattedEndBalanceForHashing =
      roundToTwoDecimalsForHashing(endbalance);
    const formattedStartBalanceForHashing =
      roundToTwoDecimalsForHashing(startbalance);
    const formattedResultForHashing = roundToTwoDecimalsForHashing(result);

    const fields = {
      amount: formattedAmountForHashing,
      appid: jokerAppID,
      description: description,
      endbalance: formattedEndBalanceForHashing,
      gamecode: gamecode,
      id: id,
      result: formattedResultForHashing,
      roundid: roundid,
      startbalance: formattedStartBalanceForHashing,
      timestamp: timestamp,
      type: type,
      username: username,
    };

    const secretkey = jokerSecret;

    const generatedHash = generateSignature(fields, secretkey);

    if (hash !== generatedHash) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid signature",
        Status: 5,
      });
    }

    const toLowerCaseUsername = username.toLowerCase();
    const [user, existingTrans] = await Promise.all([
      User.findOne({ username: toLowerCaseUsername }, { wallet: 1 }).lean(),
      SlotJokerModal.findOne({ betId: id }, { _id: 1 }).lean(),
    ]);

    if (!user) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid Username or Password",
        Status: 7,
      });
    }

    if (existingTrans) {
      return res.status(200).json({
        Balance: roundToTwoDecimals(user.wallet),
        Message: "Success",
        Status: 0,
      });
    }

    const winLossAmount = endbalance - startbalance;

    await SlotJokerModal.create({
      username: user.username,
      betId: id,
      fishTurnover: roundToTwoDecimals(amount),
      fishWinLoss: roundToTwoDecimals(winLossAmount),
      settle: true,
      bet: true,
    });

    return res.status(200).json({
      Balance: roundToTwoDecimals(user.wallet),
      Message: "Success",
      Status: 0,
    });
  } catch (error) {
    console.log("transaction", error.message);
    return res.status(500).json({
      Balance: 0.0,
      Message: "Other",
      Status: 1000,
    });
  }
});

router.post("/api/joker/withdraw", async (req, res) => {
  try {
    const { appid, hash, id, amount, username, timestamp } = req.body;

    if (!appid || !hash || !amount || !username || !id) {
      return res.status(200).json({
        Username: null,
        Balance: 0.0,
        Message: "Invalid parameters",
        Status: 4,
      });
    }

    if (appid !== jokerAppID) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid AppID",
        Status: 2,
      });
    }

    const formattedAmountForHashing = roundToTwoDecimalsForHashing(amount);

    const fields = {
      amount: formattedAmountForHashing,
      appid: jokerAppID,
      id: id,
      timestamp: timestamp,
      username: username,
    };

    const secretkey = jokerSecret;

    const generatedHash = generateSignature(fields, secretkey);

    if (hash !== generatedHash) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid signature",
        Status: 5,
      });
    }

    const toLowerCaseUsername = username.toLowerCase();
    const [user, existingWithdraw] = await Promise.all([
      User.findOne(
        { username: toLowerCaseUsername },
        { wallet: 1, "gameLock.joker.lock": 1 }
      ).lean(),
      SlotJokerModal.findOne({ betId: id, deposit: true }, { _id: 1 }).lean(),
    ]);
    if (!user) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid Username or Password",
        Status: 7,
      });
    }

    if (user.gameLock?.joker?.lock) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Player locked",
        Status: 1000,
      });
    }

    if (existingWithdraw) {
      return res.status(200).json({
        Balance: roundToTwoDecimals(user.wallet),
        Message: "Success",
        Status: 0,
      });
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        username: toLowerCaseUsername,
        wallet: { $gte: roundToTwoDecimals(amount) },
      },
      { $inc: { wallet: -roundToTwoDecimals(amount || 0) } },
      { new: true, projection: { wallet: 1 } }
    );

    if (!updatedUserBalance) {
      const latestUser = await User.findOne(
        { username: toLowerCaseUsername },
        { wallet: 1 }
      ).lean();
      return res.status(200).json({
        Balance: roundToTwoDecimals(latestUser?.wallet || 0),
        Message: "Insufficient fund",
        Status: 100,
      });
    }

    await SlotJokerModal.create({
      username: user.username,
      betId: id,
      deposit: true,
      depositAmount: roundToTwoDecimals(amount),
    });

    return res.status(200).json({
      Balance: roundToTwoDecimals(updatedUserBalance.wallet),
      Message: "Success",
      Status: 0,
    });
  } catch (error) {
    console.log("withdraw", error.message);
    return res.status(500).json({
      Balance: 0.0,
      Message: "Other",
      Status: 1000,
    });
  }
});

router.post("/api/joker/deposit", async (req, res) => {
  try {
    const { appid, hash, id, amount, username, timestamp } = req.body;

    if (!appid || !hash || !amount || !username || !id) {
      return res.status(200).json({
        Username: null,
        Balance: 0.0,
        Message: "Invalid parameters",
        Status: 4,
      });
    }

    if (appid !== jokerAppID) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid AppID",
        Status: 2,
      });
    }

    const formattedAmountForHashing = roundToTwoDecimalsForHashing(amount);

    const fields = {
      amount: formattedAmountForHashing,
      appid: jokerAppID,
      id: id,
      timestamp: timestamp,
      username: username,
    };

    const secretkey = jokerSecret;

    const generatedHash = generateSignature(fields, secretkey);

    if (hash !== generatedHash) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid signature",
        Status: 5,
      });
    }

    const toLowerCaseUsername = username.toLowerCase();
    const [user, existingDeposit] = await Promise.all([
      User.findOne({ username: toLowerCaseUsername }, { wallet: 1 }).lean(),
      SlotJokerModal.findOne({ betId: id, withdraw: true }, { _id: 1 }).lean(),
    ]);
    if (!user) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid Username or Password",
        Status: 7,
      });
    }

    if (existingDeposit) {
      return res.status(200).json({
        Balance: roundToTwoDecimals(user.wallet),
        Message: "Success",
        Status: 0,
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { username: toLowerCaseUsername },
        { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ),
      SlotJokerModal.create({
        username: user.username,
        betId: id,
        withdraw: true,
        withdrawAmount: roundToTwoDecimals(amount),
      }),
    ]);

    return res.status(200).json({
      Balance: roundToTwoDecimals(updatedUserBalance.wallet),
      Message: "Success",
      Status: 0,
    });
  } catch (error) {
    console.log("deposit", error.message);
    return res.status(500).json({
      Balance: 0.0,
      Message: "Other",
      Status: 1000,
    });
  }
});

router.post("/api/joker/join-tournament", async (req, res) => {
  try {
    const {
      appid,
      hash,
      id,
      tournamentid,
      amount,
      username,
      timestamp,
      extendedinfo,
    } = req.body;

    if (!appid || !hash || !amount || !username || !id) {
      return res.status(200).json({
        Username: null,
        Balance: 0.0,
        Message: "Invalid parameters",
        Status: 4,
      });
    }

    if (appid !== jokerAppID) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid AppID",
        Status: 2,
      });
    }

    const formattedAmountForHashing = roundToTwoDecimalsForHashing(amount);

    const fields = {
      amount: formattedAmountForHashing,
      appid: jokerAppID,
      id: id,
      timestamp: timestamp,
      tournamentid: tournamentid,
      username: username,
    };

    const secretkey = jokerSecret;

    const generatedHash = generateSignature(fields, secretkey);

    if (hash !== generatedHash) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid signature",
        Status: 5,
      });
    }

    const toLowerCaseUsername = username.toLowerCase();
    const [user, existingTournament] = await Promise.all([
      User.findOne({ username: toLowerCaseUsername }, { wallet: 1 }).lean(),
      SlotJokerModal.findOne(
        { username: toLowerCaseUsername, tournamentId: id, tournament: true },
        { _id: 1 }
      ).lean(),
    ]);

    if (!user) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid Username or Password",
        Status: 7,
      });
    }

    if (existingTournament) {
      return res.status(200).json({
        Balance: roundToTwoDecimals(user.wallet),
        Message: "Join Tournament already existed",
        Status: 0,
      });
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        username: toLowerCaseUsername,
        wallet: { $gte: roundToTwoDecimals(amount) },
      },
      { $inc: { wallet: -roundToTwoDecimals(amount || 0) } },
      { new: true }
    );

    if (!updatedUserBalance) {
      const latestUser = await User.findOne({ username: toLowerCaseUsername });

      return res.status(200).json({
        Balance: roundToTwoDecimals(latestUser?.wallet || 0),
        Message: "Insufficient fund",
        Status: 100,
      });
    }

    await SlotJokerModal.create({
      username: user.username,
      betId: tournamentid,
      tournament: true,
      tournamentId: id,
      betamount: roundToTwoDecimals(amount),
    });

    return res.status(200).json({
      Balance: roundToTwoDecimals(updatedUserBalance.wallet),
      Message: "Success",
      Status: 0,
    });
  } catch (error) {
    console.log("join-tournament", error.message);
    return res.status(500).json({
      Balance: 0.0,
      Message: "Other",
      Status: 1000,
    });
  }
});

router.post("/api/joker/cancel-join-tournament", async (req, res) => {
  try {
    const {
      appid,
      hash,
      id,
      jointournamentid,
      username,
      timestamp,
      extendedinfo,
    } = req.body;

    if (!appid || !hash || !username || !id) {
      return res.status(200).json({
        Username: null,
        Balance: 0.0,
        Message: "Invalid parameters",
        Status: 4,
      });
    }

    if (appid !== jokerAppID) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid AppID",
        Status: 2,
      });
    }

    const fields = {
      appid: jokerAppID,
      id: id,
      jointournamentid: jointournamentid,
      timestamp: timestamp,
      username: username,
    };

    const secretkey = jokerSecret;

    const generatedHash = generateSignature(fields, secretkey);

    if (hash !== generatedHash) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid signature",
        Status: 5,
      });
    }

    const toLowerCaseUsername = username.toLowerCase();
    const [user, existingTournament, existingCancelTournament] =
      await Promise.all([
        User.findOne({ username: toLowerCaseUsername }, { wallet: 1 }).lean(),
        SlotJokerModal.findOne({
          betId: jointournamentid,
          tournament: true,
        }).lean(),
        SlotJokerModal.findOne({ cancelTournamentId: id }, { _id: 1 }).lean(),
      ]);
    if (!user) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid Username or Password",
        Status: 7,
      });
    }

    if (!existingTournament) {
      return res.status(200).json({
        Balance: roundToTwoDecimals(user.wallet),
        Message: "Join Tournament not found",
        Status: 0,
      });
    }

    if (existingCancelTournament) {
      return res.status(200).json({
        Balance: roundToTwoDecimals(user.wallet),
        Message: "Join Tournament has been cancelled or settled",
        Status: 0,
      });
    }

    const refundAmount = existingTournament.betamount || 0;

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { username: toLowerCaseUsername },
        { $inc: { wallet: roundToTwoDecimals(refundAmount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ),
      SlotJokerModal.findOneAndUpdate(
        { betId: jointournamentid },
        {
          $set: {
            canceltournament: true,
            cancelTournamentId: id,
          },
        },
        { new: true }
      ),
    ]);

    return res.status(200).json({
      Balance: roundToTwoDecimals(updatedUserBalance.wallet),
      Message: "Success",
      Status: 0,
    });
  } catch (error) {
    console.log("cancel-join-tournament", error.message);
    return res.status(500).json({
      Balance: 0.0,
      Message: "Other",
      Status: 1000,
    });
  }
});

router.post("/api/joker/win-tournament", async (req, res) => {
  try {
    const {
      appid,
      hash,
      id,
      tournamentid,
      username,
      amount,
      timestamp,
      extendedinfo,
    } = req.body;

    if (!appid || !hash || !amount || !username || !id) {
      return res.status(200).json({
        Username: null,
        Balance: 0.0,
        Message: "Invalid parameters",
        Status: 4,
      });
    }
    if (appid !== jokerAppID) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid AppID",
        Status: 2,
      });
    }

    const formattedAmountForHashing = roundToTwoDecimalsForHashing(amount);

    const fields = {
      amount: formattedAmountForHashing,
      appid: jokerAppID,
      id: id,
      timestamp: timestamp,
      tournamentid: tournamentid,
      username: username,
    };

    const secretkey = jokerSecret;

    const generatedHash = generateSignature(fields, secretkey);

    if (hash !== generatedHash) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid signature",
        Status: 5,
      });
    }

    const toLowerCaseUsername = username.toLowerCase();
    const [user, existingSettleWinTournament] = await Promise.all([
      User.findOne({ username: toLowerCaseUsername }, { wallet: 1 }).lean(),
      SlotJokerModal.findOne(
        {
          username: toLowerCaseUsername,
          settleTournamentId: id,
        },
        { _id: 1 }
      ).lean(),
    ]);

    if (!user) {
      return res.status(200).json({
        Balance: 0.0,
        Message: "Invalid Username or Password",
        Status: 7,
      });
    }

    if (existingSettleWinTournament) {
      return res.status(200).json({
        Balance: roundToTwoDecimals(user.wallet),
        Message: "Join Tournament has been cancelled or settled",
        Status: 0,
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { username: toLowerCaseUsername },
        { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ),
      SlotJokerModal.findOneAndUpdate(
        { username: toLowerCaseUsername, betId: tournamentid },
        {
          $set: {
            settletournament: true,
            settleamount: roundToTwoDecimals(amount),
            settleTournamentId: id,
          },
        },
        { upsert: true, new: true }
      ),
    ]);

    return res.status(200).json({
      Balance: roundToTwoDecimals(updatedUserBalance.wallet),
      Message: "Success",
      Status: 0,
    });
  } catch (error) {
    console.log("win-tournament", error.message);
    return res.status(500).json({
      Balance: 0.0,
      Message: "Other",
      Status: 1000,
    });
  }
});

router.post("/api/joker/launchGame", authenticateToken, async (req, res) => {
  try {
    // zh or en
    const { gameLang, gameCode } = req.body;
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (user.gameLock.joker.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
        },
      });
    }

    let lang = "en";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "zh";
    } else if (gameLang === "ms") {
      lang = "ms";
    }
    // if want lobby just leave gamecode empty

    const token = req.headers.authorization.split(" ")[1];
    const mobile = false;
    const queryParams = querystring.stringify({
      token: token,
      appID: jokerAppID,
      gameCode: gameCode,
      language: lang,
      mobile: mobile,
      redirectUrl: webURL,
    });
    const apiUrl = `${jokerGameURL}/playGame?${queryParams}`;

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "JOKER"
    );

    return res.status(200).json({
      success: true,
      gameLobby: apiUrl,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
      },
    });
  } catch (error) {
    console.log("JOKER error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "JOKER: Game launch failed. Please try again or customer service for assistance.",
        zh: "JOKER: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "JOKER: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/joker/getgamelist", async (req, res) => {
  try {
    const games = await GameJokerGameModal.find({
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
    console.error("Error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "JOKER: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "JOKER: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "JOKER: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "JOKER: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "JOKER: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

// router.post("/api/joker/getgamelist", async (req, res) => {
//   try {
//     const timestamp = getCurrentTimestamp();

//     const fields = {
//       AppID: jokerAppID,
//       Timestamp: timestamp,
//     };

//     const hash = generateSignature(fields, jokerSecret);

//     const payload = {
//       AppID: jokerAppID,
//       Hash: hash,
//       Timestamp: timestamp,
//     };

//     const response = await axios.post(`${jokerApiURL}/list-games`, payload, {
//       headers: {
//         "Content-Type": "application/json",
//       },
//     });

//     if (response.data.Error !== "0") {
//       console.log("JOKER ERROR IN GETTING GAME LIST", response.data);
//       return res.status(200).json({
//         success: false,
//         message: {
//           en: "JOKER: Unable to retrieve game lists. Please contact customer service for assistance.",
//           zh: "JOKER: 无法获取游戏列表，请联系客服以获取帮助。",
//           ms: "JOKER: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
//         },
//       });
//     }

//     const games = response.data.ListGames.map((game) => {
//       // Extract English and Chinese names from Localizations
//       const gameNameEN = game.Localizations.find(
//         (loc) => loc.Language === "en"
//       )?.Name;
//       const gameNameZH = game.Localizations.find(
//         (loc) => loc.Language === "zh"
//       )?.Name;

//       // If no English name, use Chinese name, if no Chinese name, use English name, else "N/A"
//       const finalGameNameEN = gameNameEN || gameNameZH || "JOKER";
//       const finalGameNameZH = gameNameZH || gameNameEN || "JOKER";

//       return {
//         GameType: game.GameType,
//         GameCode: game.GameCode,
//         GameImage: game.Image1,
//         GameNameEN: finalGameNameEN,
//         GameNameZH: finalGameNameZH,
//       };
//     });

//     return res.status(200).json({
//       success: true,
//       gamelist: games,
//     });
//   } catch (error) {
//     console.error("JOKER Error fetching game list:", error.message);
//     return res.status(200).json({
//       success: false,
//       message: {
//         en: "JOKER: Unable to retrieve game lists. Please contact customer service for assistance.",
//         zh: "JOKER: 无法获取游戏列表，请联系客服以获取帮助。",
//         ms: "JOKER: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
//       },
//     });
//   }
// });

router.post("/api/joker/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotJokerModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      cancel: { $ne: true },

      settle: true,
    });

    // Aggregate turnover and win/loss for each player
    let playerSummary = {};

    records.forEach((record) => {
      if (!record.username) {
        console.log("Skipping record with missing username:", record._id);
        return; // Skip this record
      }
      const username = record.username.toLowerCase();

      if (!playerSummary[username]) {
        playerSummary[username] = { turnover: 0, winloss: 0 };
      }

      playerSummary[username].turnover +=
        record.betamount || 0 + record.fishTurnover || 0;

      playerSummary[username].winloss +=
        (record.settleamount || 0) -
        (record.betamount || 0) +
        (record.fishWinLoss || 0);
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
        gamename: "JOKER",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("JOKER: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "JOKER: Failed to fetch win/loss report",
        zh: "JOKER: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/joker/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotJokerModal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
      });

      // Aggregate turnover and win/loss for each player
      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0 + record.fishTurnover || 0;
        totalWinLoss +=
          (record.settleamount || 0) -
          (record.betamount || 0) +
          (record.fishWinLoss || 0);
      });

      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));
      // Return the aggregated results
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JOKER",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("JOKER: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JOKER: Failed to fetch win/loss report",
          zh: "JOKER: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/joker/:userId/gamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await GameDataLog.find({
        username: user.username.toLowerCase(),
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

          if (slotGames["JOKER"]) {
            totalTurnover += slotGames["JOKER"].turnover || 0;
            totalWinLoss += slotGames["JOKER"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JOKER",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("JOKER: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JOKER: Failed to fetch win/loss report",
          zh: "JOKER: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/joker/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotJokerModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0 + record.fishTurnover || 0;

        const userWinLoss =
          (record.settleamount || 0) -
          (record.betamount || 0) +
          (record.fishWinLoss || 0);

        totalWinLoss += userWinLoss * -1;
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JOKER",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("JOKER: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "JOKER: Failed to fetch win/loss report",
          zh: "JOKER: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/joker/kioskreport",
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

          if (liveCasino["JOKER"]) {
            totalTurnover += Number(liveCasino["JOKER"].turnover || 0);
            totalWinLoss += Number(liveCasino["JOKER"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JOKER",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("JOKER: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "JOKER: Failed to fetch win/loss report",
          zh: "JOKER: 获取盈亏报告失败",
        },
      });
    }
  }
);
module.exports = router;
