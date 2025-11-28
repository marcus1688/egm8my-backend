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
const GameBTGamingGameModal = require("../../models/slot_btgamingDatabase.model");
const SlotBTGamingModal = require("../../models/slot_btgaming.model");

require("dotenv").config();

const btGamingAccount = "989334120989965";
const webURL = "https://www.bm8my.vip/";
const btGamingApiURL = "https://game.stgkg.btgame777.com/v2_2";
const btGamingSecret = process.env.BTGAMING_SECRET;
const btGamingMD5 = process.env.BTGAMING_MD5;

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

function generateRFC3339DateTime() {
  return moment().utcOffset(-4).format("YYYY-MM-DDTHH:mm:ssZ");
}

function generateCheckCode(params = {}) {
  let stringToHash = `security_code=${btGamingSecret}`;

  for (const [key, value] of Object.entries(params)) {
    if (key !== "check_code" && value !== undefined && value !== null) {
      stringToHash += `&${key}=${value}`;
    }
  }

  return crypto.createHash("md5").update(stringToHash).digest("hex");
}

function generateAuthCode(requestBody, md5Key) {
  try {
    // Step 1: Remove auth_code, trans_details, and betform_details from params
    const filteredParams = {};

    Object.keys(requestBody).forEach((key) => {
      if (
        key !== "auth_code" &&
        key !== "trans_details" &&
        key !== "betform_details"
      ) {
        filteredParams[key] = requestBody[key];
      }
    });

    // Step 2: Sort parameters alphabetically
    const sortedKeys = Object.keys(filteredParams).sort();

    // Step 3: Create params_string in format key=value&key=value
    const paramsString = sortedKeys
      .map((key) => `${key}=${filteredParams[key]}`)
      .join("&");

    // Step 4: Append md5_key
    const stringToHash = `${paramsString}&${md5Key}`;

    // Step 5: Generate MD5 hash
    const authCode = crypto
      .createHash("md5")
      .update(stringToHash)
      .digest("hex");

    return authCode;
  } catch (error) {
    console.error("Error generating auth code:", error);
    return null;
  }
}

// Fixed verification function
function verifyAuthorization(requestBody, md5Key) {
  try {
    if (!requestBody || !md5Key) {
      console.log(
        "❌ Missing required parameters for authorization verification"
      );
      return false;
    }

    // Extract auth_code from request body
    const receivedAuthCode = requestBody.auth_code;

    if (!receivedAuthCode) {
      console.log("❌ No auth_code found in request body");
      return false;
    }

    // Generate expected auth_code
    const expectedAuthCode = generateAuthCode(requestBody, md5Key);

    if (!expectedAuthCode) {
      console.log("❌ Failed to generate expected auth_code");
      return false;
    }

    const isValid =
      expectedAuthCode.toLowerCase() === receivedAuthCode.toLowerCase();

    if (!isValid) {
      console.log("❌ Authorization verification failed");
      console.log("Expected auth_code:", expectedAuthCode);
      console.log("Received auth_code:", receivedAuthCode);
    }
    return isValid;
  } catch (error) {
    console.error("❌ Error verifying authorization:", error);
    return false;
  }
}

// async function updateBTGamingManualOrderTimestampsPlus() {
//   try {
//     // List of gameIDs in order (AB1541 = latest, AB1501 = oldest)
//     const gameIds = [
//       "AB1541",
//       "AB1531",
//       "AB1529",
//       "AB1522",
//       "VGPHOENIX",
//       "AB1523",
//       "AB1537",
//       "AB1530",
//       "AB1527",
//       "VG0007",
//       "AB1521",
//       "AB1533",
//       "AB1528",
//       "AB1548",
//       "AB1054",
//       "AB1520",
//       "AB1546",
//       "VG0003",
//       "AB1539",
//       "AB1516",
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
//       const result = await GameBTGamingGameModal.collection.updateOne(
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
//     const updatedGames = await GameBTGamingGameModal.find(
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

router.post("/api/btgaming/comparegame", async (req, res) => {
  try {
    const check_code = generateCheckCode({ account_id: btGamingAccount });

    const payload = {
      account_id: btGamingAccount,
      check_code: check_code,
    };

    console.log("BT GAMING GetGameList Request:", payload);

    // Make the API request to
    const response = await axios.post(
      `${btGamingApiURL}/agent/get_gamelist`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("BT GAMING GetGameList Response:", response.data);

    // Check if API response is successful
    if (response.data.status.code !== 1000) {
      console.log("BTGAMING error fetching game list:", response.data);
      return res.status(200).json({
        success: false,
        message: {
          en: "BTGAMING: Unable to retrieve game lists. Please contact customer service for assistance.",
          zh: "BTGAMING: 无法获取游戏列表，请联系客服以获取帮助。",
          ms: "BTGAMING: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    // Get all games from database
    const dbGames = await GameBTGamingGameModal.find({}, "gameID");

    // Extract game IDs from database
    const dbGameIds = new Set(dbGames.map((game) => game.gameID));

    // Extract all games from API response across all game types
    const gameData = response.data.data;
    const allApiGames = [];

    // Process each game type (fish, table, slot, arcade, p2p)
    Object.keys(gameData).forEach((gameType) => {
      gameData[gameType].forEach((game) => {
        allApiGames.push({
          game_code: game.game_code,
          gameType: gameType,
          game_vendor_name: game.game_vendor_name,
          en: game.en,
          tw: game.tw,
          cn: game.cn,
          vi: game.vi,
          th: game.th,
          ja: game.ja,
          my: game.my,
          maintain: game.maintain,
        });
      });
    });

    // Extract game IDs from API response
    const apiGameIds = new Set(allApiGames.map((game) => game.game_code));

    // Count totals
    const totalApiGames = allApiGames.length;
    const totalDbGames = dbGames.length;

    // Find missing games (in API but not in database)
    const missingGames = allApiGames.filter(
      (game) => !dbGameIds.has(game.game_code)
    );

    // Find extra games (in database but not in API) and set maintenance to true
    const extraGameIds = [...dbGameIds].filter(
      (gameId) => !apiGameIds.has(gameId)
    );

    // Update extra games to maintenance: true
    if (extraGameIds.length > 0) {
      await GameBTGamingGameModal.updateMany(
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
      await GameBTGamingGameModal.updateMany(
        { gameID: { $in: activeGameIds } },
        { maintenance: false }
      );
      console.log(
        `Set maintenance: false for ${activeGameIds.length} games in API`
      );
    }

    // Return missing games with game_code and gameType
    const missingGamesInfo = missingGames.map((game) => ({
      game_code: game.game_code,
      gameType: game.gameType,
      game_vendor_name: game.game_vendor_name,
      en: game.en,
      tw: game.tw,
      cn: game.cn,
      vi: game.vi,
      th: game.th,
      ja: game.ja,
      my: game.my,
      maintain: game.maintain,
    }));

    console.log("Missing games:", missingGamesInfo);
    console.log("Extra games set to maintenance:", extraGameIds.length);
    console.log(
      `Total API games: ${totalApiGames}, Total DB games: ${totalDbGames}`
    );

    return res.status(200).json({
      success: true,
      gameList: response.data,
      comparison: {
        missingGames: missingGamesInfo,
        extraGamesCount: extraGameIds.length,
        extraGameIds: extraGameIds,
        missingCount: missingGamesInfo.length,
        totalApiGames: totalApiGames,
        totalDbGames: totalDbGames,
      },
      message: {
        en: "Game list retrieved successfully.",
        zh: "游戏列表获取成功。",
        ms: "Senarai permainan berjaya diambil.",
      },
    });
  } catch (error) {
    console.log("BTGAMING error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "BTGAMING: Game launch failed. Please try again or contact customer service for assistance.",
        zh: "BTGAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "BTGAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/btgaming/getprovidergamelist", async (req, res) => {
  try {
    const check_code = generateCheckCode({ account_id: btGamingAccount });

    const payload = {
      account_id: btGamingAccount,
      check_code: check_code,
    };

    console.log("BT GAMING GetGameList Request:", payload);

    // Make the API request to
    const response = await axios.post(
      `${btGamingApiURL}/agent/get_gamelist`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("BT GAMING GetGameList Response:", response.data);

    return res.status(200).json({
      success: true,
      gameList: response.data,
      message: {
        en: "Game list retrieved successfully.",
        zh: "游戏列表获取成功。",
        ms: "Senarai permainan berjaya diambil.",
      },
    });
  } catch (error) {
    console.log("SLOT4D error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "SLOT4D: Game launch failed. Please try again or customer service for assistance.",
        zh: "SLOT4D: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "SLOT4D: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/btgaming/getgamelist", async (req, res) => {
  try {
    const games = await GameBTGamingGameModal.find({
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

    // Transform data into the desired format
    const reformattedGamelist = games.map((game) => ({
      GameCode: game.gameID,
      GameNameEN: game.gameNameEN,
      GameNameZH: game.gameNameCN,
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
    console.log("BT GAMING error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "BT GAMING: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "BT GAMING: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "BT GAMING: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "BT GAMING: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "BT GAMING: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/btgaming/launchGame", authenticateToken, async (req, res) => {
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

    if (user.gameLock.btgaming.lock) {
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

    const { gameLang, gameCode } = req.body;

    let lang = "en";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "zh-cn";
    } else if (gameLang === "ms") {
      lang = "id";
    } else if (gameLang === "id") {
      lang = "id";
    } else if (gameLang === "zh_hk") {
      lang = "zh-tw";
    }

    const gameParams = {
      account_id: btGamingAccount,
      back_url: webURL,
      cur_type: 1,
      game_code: gameCode,
      lang: lang,
      username: user.gameId,
    };

    const check_code = generateCheckCode(gameParams);

    const payload = {
      ...gameParams,
      check_code: check_code,
    };

    const response = await axios.post(
      `${btGamingApiURL}/agent/user_login`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (response.data.status.code !== 1000) {
      console.log("BT GAMING error in launching game", response.data);

      if (response.data.status.code === 4001) {
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
          en: "BT GAMING: Game launch failed. Please try again or customer service for assistance.",
          zh: "BT GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "BT GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "BT GAMING: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "BT GAMING: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "BT GAMING"
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
    console.log("BT GAMING error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "BT GAMING: Game launch failed. Please try again or customer service for assistance.",
        zh: "BT GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "BT GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "BT GAMING: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "BT GAMING: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/directbtgstag//get_user_balance", async (req, res) => {
  try {
    const { tran_id, username, currency } = req.body;
    const isAuthValid = verifyAuthorization(req.body, btGamingMD5);

    if (!isAuthValid) {
      return res.status(200).json({
        status: {
          code: 5001,
          message: `Authorization invalid.`,
          datetime: generateRFC3339DateTime(),
        },
      });
    }

    if (!tran_id || !username) {
      const missingParams = [];
      if (!tran_id) missingParams.push("tran_id");
      if (!username) missingParams.push("username");

      const missingParamsString = missingParams.join(", ");

      return res.status(200).json({
        status: {
          code: 5002,
          message: `Bad format parameters ( ${missingParamsString} )`,
          datetime: generateRFC3339DateTime(),
        },
      });
    }

    if (currency !== "MYR") {
      return res.status(200).json({
        status: {
          code: 5002,
          message: `Bad format parameters (currency)`,
          datetime: generateRFC3339DateTime(),
        },
      });
    }

    const currentUser = await User.findOne(
      { gameId: username },
      { wallet: 1 }
    ).lean();
    if (!currentUser) {
      return res.status(200).json({
        status: {
          code: 5002,
          message: `Bad format parameters (username)`,
          datetime: generateRFC3339DateTime(),
        },
      });
    }

    const walletValue = Number(currentUser.wallet);

    const newBalance = new Decimal(walletValue).toDecimalPlaces(4);
    return res.status(200).json({
      status: {
        code: 1000,
        message: `Success.`,
        datetime: generateRFC3339DateTime(),
      },
      data: {
        balance: newBalance.toNumber(),
        currency: "MYR",
        tran_id,
      },
    });
  } catch (error) {
    console.error(
      "BT GAMING: Error in game provider calling ae96 get balance api:",
      error.message
    );
    return res.status(200).json({
      status: {
        code: 5201,
        message: `Something wrong.`,
        datetime: generateRFC3339DateTime(),
      },
    });
  }
});

router.post("/api/directbtgstag//transfer", async (req, res) => {
  try {
    const {
      tran_id,
      username,
      amount,
      transfer_type,
      betform_details,
      currency,
    } = req.body;
    const trans_details = JSON.parse(req.body.trans_details);

    const missingParams = [];
    if (!tran_id) missingParams.push("tran_id");
    if (!username) missingParams.push("username");
    if (!transfer_type) missingParams.push("transfer_type");
    if (!trans_details) missingParams.push("trans_details");

    if (missingParams.length > 0) {
      return res.status(200).json({
        status: {
          code: 5002,
          message: `Bad format parameters ( ${missingParams.join(", ")} )`,
          datetime: generateRFC3339DateTime(),
        },
      });
    }

    if (currency !== "MYR") {
      return res.status(200).json({
        status: {
          code: 5002,
          message: `Bad format parameters (currency)`,
          datetime: generateRFC3339DateTime(),
        },
      });
    }

    const [currentUser] = await Promise.all([
      // Get only fields we need, no lean()
      User.findOne(
        { gameId: username },
        {
          wallet: 1,
          "gameLock.btgaming.lock": 1,
          _id: 1,
          username: 1,
        }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        status: {
          code: 5002,
          message: `Bad format parameters (username)`,
          datetime: generateRFC3339DateTime(),
        },
      });
    }

    const TRANSFER_TYPES = {
      START: "start", // Bet operations
      END: "end", // Win/Settlement operations
      REFUND: "refund", // Refund operations
    };

    const transferTypeNum = transfer_type;

    if (TRANSFER_TYPES.START.includes(transferTypeNum)) {
      const isAuthValid = verifyAuthorization(req.body, btGamingMD5);

      if (!isAuthValid) {
        return res.status(200).json({
          status: {
            code: 5001,
            message: `Authorization invalid.`,
            datetime: generateRFC3339DateTime(),
          },
        });
      }

      if (currentUser.gameLock?.btgaming?.lock) {
        return res.status(200).json({
          status: {
            code: 5103,
            message: `Player account is suspended.`,
            datetime: generateRFC3339DateTime(),
          },
        });
      }

      const [existingBet, existingTransaction] = await Promise.all([
        SlotBTGamingModal.findOne(
          { tranId: trans_details.order_id },
          { _id: 1 }
        ).lean(),
        SlotBTGamingModal.findOne(
          { uniqueStartId: tran_id },
          { _id: 1 }
        ).lean(),
      ]);

      if (existingTransaction) {
        console.log("Duplicate transaction found");
        return res.status(200).json({
          status: {
            code: 5107,
            message: `Duplicate tran_id.`,
            datetime: generateRFC3339DateTime(),
          },
        });
      }
      if (existingBet) {
        console.log("Duplicate transaction found");
        return res.status(200).json({
          status: {
            code: 5106,
            message: `The transction was settled`,
            datetime: generateRFC3339DateTime(),
          },
        });
      }

      const betAmount = new Decimal(Number(amount)).toDecimalPlaces(4);
      const inData = betAmount.toNumber();

      const updatedUserBalance = await User.findOneAndUpdate(
        {
          _id: currentUser._id,
          wallet: { $gte: Math.abs(inData) },
        },
        { $inc: { wallet: inData } },
        { new: true, projection: { wallet: 1 } }
      ).lean();

      if (!updatedUserBalance) {
        return res.status(200).json({
          status: {
            code: 5101,
            message: `Insufficient balance.`,
            datetime: generateRFC3339DateTime(),
          },
        });
      }

      await SlotBTGamingModal.create({
        username,
        betId: trans_details.round_id,
        tranId: trans_details.order_id,
        bet: true,
        betamount: Math.abs(inData),
        uniqueStartId: tran_id,
      });

      // Return success response
      const newBalance = new Decimal(
        Number(updatedUserBalance.wallet)
      ).toDecimalPlaces(4);
      return res.status(200).json({
        status: {
          code: 1000,
          message: `Success.`,
          datetime: generateRFC3339DateTime(),
        },
        data: {
          balance: newBalance.toNumber(),
          currency: "MYR",
          tran_id,
        },
      });
    } else if (TRANSFER_TYPES.END.includes(transferTypeNum)) {
      const [existingBet, existingTransaction] = await Promise.all([
        SlotBTGamingModal.findOne(
          { tranId: trans_details.order_id },
          { _id: 1 }
        ).lean(),
        SlotBTGamingModal.findOne(
          {
            tranId: trans_details.order_id,
            $or: [{ settle: true }, { cancel: true }],
          },
          { _id: 1 }
        ).lean(),
      ]);

      if (!existingBet) {
        return res.status(200).json({
          status: {
            code: 5105,
            message: `Transaction do not exist.`,
            datetime: generateRFC3339DateTime(),
          },
        });
      }

      if (existingTransaction) {
        return res.status(200).json({
          status: {
            code: 5106,
            message: `The transction was settled.`,
            datetime: generateRFC3339DateTime(),
          },
        });
      }

      // Process win amount
      const winAmount = new Decimal(Number(amount)).toDecimalPlaces(4);
      const inData = winAmount.toNumber();

      // Update wallet and settle bet
      const [updatedUserBalance] = await Promise.all([
        User.findByIdAndUpdate(
          currentUser._id,
          { $inc: { wallet: inData } },
          { new: true, projection: { wallet: 1 } }
        ).lean(),
        SlotBTGamingModal.findOneAndUpdate(
          { tranId: trans_details.order_id },
          { $set: { settle: true, settleamount: inData } },
          { upsert: true }
        ),
      ]);

      const newBalance = new Decimal(
        Number(updatedUserBalance.wallet)
      ).toDecimalPlaces(4);
      return res.status(200).json({
        status: {
          code: 1000,
          message: `Success.`,
          datetime: generateRFC3339DateTime(),
        },
        data: {
          balance: newBalance.toNumber(),
          currency: "MYR",
          tran_id,
        },
      });
    } else if (TRANSFER_TYPES.REFUND.includes(transferTypeNum)) {
      const [existingBet, existingTransaction] = await Promise.all([
        SlotBTGamingModal.findOne(
          { tranId: trans_details.order_id },
          { _id: 1 }
        ).lean(),
        SlotBTGamingModal.findOne(
          {
            tranId: trans_details.order_id,
            $or: [{ settle: true }, { cancel: true }],
          },
          { _id: 1 }
        ).lean(),
      ]);

      if (!existingBet) {
        return res.status(200).json({
          status: {
            code: 5105,
            message: `Transaction do not exist.`,
            datetime: generateRFC3339DateTime(),
          },
        });
      }

      if (existingTransaction) {
        return res.status(200).json({
          status: {
            code: 5106,
            message: `The transction was settled.`,
            datetime: generateRFC3339DateTime(),
          },
        });
      }

      // Process refund amount
      const refundAmount = new Decimal(Number(amount)).toDecimalPlaces(4);
      const inData = refundAmount.toNumber();

      const [updatedUserBalance] = await Promise.all([
        User.findByIdAndUpdate(
          currentUser._id,
          { $inc: { wallet: inData } },
          { new: true, projection: { wallet: 1 } }
        ).lean(),
        SlotBTGamingModal.findOneAndUpdate(
          { tranId: trans_details.order_id },
          { $set: { cancel: true } },
          { upsert: true }
        ),
      ]);

      const newBalance = new Decimal(
        Number(updatedUserBalance.wallet)
      ).toDecimalPlaces(4);
      return res.status(200).json({
        status: {
          code: 1000,
          message: `Success.`,
          datetime: generateRFC3339DateTime(),
        },
        data: {
          balance: newBalance.toNumber(),
          currency: "MYR",
          tran_id,
        },
      });
    } else {
      return res.status(200).json({
        status: {
          code: 5002,
          message: `Bad format parameters: ${transfer_type}`,
          datetime: generateRFC3339DateTime(),
        },
      });
    }
  } catch (error) {
    console.error(
      "BT GAMING: Error in game provider calling ae96 get bet api:",
      error
    );
    return res.status(200).json({
      status: {
        code: 5201,
        message: `Something wrong.`,
        datetime: generateRFC3339DateTime(),
      },
    });
  }
});

router.post("/api/btgaming/getturnoverforrebate", async (req, res) => {
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

    console.log("BT GAMING QUERYING TIME", startDate, endDate);

    const records = await SlotBTGamingModal.find({
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
        console.warn(`BT GAMING User not found for gameId: ${gameId}`);
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
        gamename: "BT GAMING",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("BT GAMING: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "BT GAMING: Failed to fetch win/loss report",
        zh: "BT GAMING: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/btgaming/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotBTGamingModal.find({
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
          gamename: "BT GAMING",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("BT GAMING: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "BT GAMING: Failed to fetch win/loss report",
          zh: "BT GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/btgaming/:userId/gamedata",
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

          if (slotGames["BT GAMING"]) {
            totalTurnover += slotGames["BT GAMING"].turnover || 0;
            totalWinLoss += slotGames["BT GAMING"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "BT GAMING",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("BT GAMING: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "BT GAMING: Failed to fetch win/loss report",
          zh: "BT GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/btgaming/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotBTGamingModal.find({
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
          gamename: "BT GAMING",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("BT GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "BT GAMING: Failed to fetch win/loss report",
          zh: "BT GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/btgaming/kioskreport",
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

          if (liveCasino["BT GAMING"]) {
            totalTurnover += Number(liveCasino["BT GAMING"].turnover || 0);
            totalWinLoss += Number(liveCasino["BT GAMING"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "BT GAMING",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("BT GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "BT GAMING: Failed to fetch win/loss report",
          zh: "BT GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

module.exports = router;
