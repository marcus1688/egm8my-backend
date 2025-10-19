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
const { v4: uuidv4 } = require("uuid");
const SlotSpadeGamingModal = require("../../models/slot_spadegaming.model");

const GameWalletLog = require("../../models/gamewalletlog.model");
const GameSpadeGamingGameModal = require("../../models/slot_spadegamingDatabase.model");
const spadeGamingMerchant = "OC7OC77";
const spadeGamingSecret = process.env.SPADEGAMING_SECRET;
const webURL = "https://www.oc7.me/";
const spadeGamingApiURL = "https://merchantapi.hugedolphin.com/api/";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateUniqueTransactionId(prefix) {
  const uuid = uuidv4().replace(/-/g, "");
  return `${prefix}-${uuid.substring(0, 16)}`;
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

let counter = 0;

function generateSerialNo() {
  const now = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const random = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");
  const uniquePart = crypto.randomBytes(4).toString("hex");

  // Ensure the counter doesn't exceed 999 and is always 3 digits
  counter = (counter + 1) % 1000;
  const counterPart = counter.toString().padStart(3, "0");

  return now + random + uniquePart + counterPart;
}

function generateMD5Hash(data, secretKey) {
  // Convert data object to JSON string
  const jsonString = JSON.stringify(data);

  // Remove all whitespace from the JSON string
  const cleanJsonString = jsonString.replace(/\s+/g, "");

  // Concatenate the JSON string with the secretKey
  const inputString = cleanJsonString + secretKey;

  // Generate MD5 hash using UTF-8 encoding
  const hash = crypto.createHash("md5");
  hash.update(Buffer.from(inputString, "utf-8"));

  // Return the hexadecimal representation of the hash
  return hash.digest("hex");
}

// router.post("/api/spadegaming/update-hot-games", async (req, res) => {
//   try {
//     // Your hot game IDs list in priority order (S-LK03 is #1/latest)
//     const hotGameIdsList = `S-LK03,S-RH02,S-CG02,S-FS01,S-FS02,S-RK02,S-BA01,S-MR02,S-JM01,S-DW01,S-RV01,S-GP03,S-LS03,S-WW02,S-HN01,S-CS02,S-PW03,S-GK01,S-GR01,S-CS03,S-RM01,S-GL02,S-TD01,S-FM03,S-RC01,S-GP04,S-GW03,S-HT02,S-FH04,S-SW02,S-MT01,S-FN01,S-FD01,S-ZE01,S-MG02,S-BK01,S-JT03,S-CP03,S-VB01,S-FM04`;

//     // Split and clean the game IDs
//     const hotGameIds = hotGameIdsList
//       .split(",")
//       .map((code) => code.trim())
//       .filter((code) => code.length > 0);

//     console.log(`Processing ${hotGameIds.length} hot SpadeGaming games...`);

//     // First, set all games hot = false
//     await GameSpadeGamingGameModal.updateMany({}, { $set: { hot: false } });

//     // Update each hot game with createdAt based on their position in the list
//     const updateResults = [];
//     const baseTime = new Date(); // Current time for the #1 game (S-LK03)

//     // Process all hot games
//     for (let i = 0; i < hotGameIds.length; i++) {
//       const gameId = hotGameIds[i];

//       // Calculate createdAt: #1 game (S-LK03) = latest time, each subsequent game is 30 minutes earlier
//       const createdAtTime = new Date(baseTime.getTime() - i * 30 * 60 * 1000);

//       try {
//         // Use MongoDB collection directly to bypass Mongoose timestamps
//         const updateResult =
//           await GameSpadeGamingGameModal.collection.updateOne(
//             { gameID: gameId },
//             {
//               $set: {
//                 hot: true,
//                 createdAt: createdAtTime,
//                 updatedAt: new Date(),
//               },
//             }
//           );

//         updateResults.push({
//           position: i + 1,
//           gameId: gameId,
//           createdAt: createdAtTime.toISOString(),
//           hot: true,
//           matched: updateResult.matchedCount > 0,
//           updated: updateResult.modifiedCount > 0,
//         });

//         console.log(
//           `#${i + 1} - ${gameId} - ${createdAtTime.toISOString()} - ${
//             updateResult.matchedCount > 0 ? "FOUND" : "NOT FOUND"
//           } - Hot: true`
//         );
//       } catch (error) {
//         console.error(`Error updating game ${gameId}:`, error);
//         updateResults.push({
//           position: i + 1,
//           gameId: gameId,
//           createdAt: createdAtTime.toISOString(),
//           hot: true,
//           matched: false,
//           updated: false,
//           error: error.message,
//         });
//       }
//     }

//     // Count results
//     const totalMatched = updateResults.filter((r) => r.matched).length;
//     const totalUpdated = updateResults.filter((r) => r.updated).length;
//     const notFound = updateResults.filter((r) => !r.matched);

//     console.log(
//       `Update complete: ${totalUpdated}/${hotGameIds.length} hot games updated`
//     );

//     return res.status(200).json({
//       success: true,
//       message: `Updated ${totalUpdated} SpadeGaming hot games with new createdAt times`,
//       summary: {
//         totalHotGames: hotGameIds.length,
//         totalFoundInDB: totalMatched,
//         totalUpdated: totalUpdated,
//         notFoundInDB: hotGameIds.length - totalMatched,
//         allOtherGamesSetToNotHot: true,
//       },
//       topResults: updateResults.slice(0, 10), // Show top 10 results
//       gamesNotFound: notFound.map((g) => ({
//         position: g.position,
//         gameId: g.gameId,
//       })),
//       timeRange: {
//         earliest: new Date(
//           baseTime.getTime() - (hotGameIds.length - 1) * 30 * 60 * 1000
//         ).toISOString(),
//         latest: baseTime.toISOString(),
//         intervalMinutes: 30,
//         latestGame: hotGameIds[0], // S-LK03
//         oldestHotGame: hotGameIds[hotGameIds.length - 1], // S-FM04
//       },
//     });
//   } catch (error) {
//     console.error("Update SpadeGaming hot games error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error updating SpadeGaming hot games",
//       error: error.message,
//     });
//   }
// });

// router.post("/api/spadegaming/comparegames", async (req, res) => {
//   try {
//     const { gameLang = "en" } = req.body;

//     // Prepare API request
//     let lang;
//     if (gameLang === "en") {
//       lang = "";
//     } else if (gameLang === "zh") {
//       lang = "zh_CN";
//     }

//     const serialNumber = generateSerialNo();
//     const data = {
//       merchantCode: spadeGamingMerchant,
//       language: lang,
//       currency: "MYR",
//       serialNo: serialNumber,
//     };

//     const digest = generateMD5Hash(data, spadeGamingSecret);

//     // Fetch API games and database games in parallel
//     const [apiResponse, dbGames] = await Promise.all([
//       axios.post(`${spadeGamingApiURL}/getGames`, data, {
//         headers: {
//           "Content-Type": "application/json",
//           Digest: digest,
//         },
//       }),
//       GameSpadeGamingGameModal.find(
//         {},
//         { gameID: 1, gameNameEN: 1, gameType: 1, _id: 0 }
//       ).lean(),
//     ]);

//     if (apiResponse.data.code !== 0) {
//       return res.status(200).json({
//         success: false,
//         message: "SpadeGaming API error",
//         error: `API returned code: ${apiResponse.data.code}, msg: ${apiResponse.data.msg}`,
//       });
//     }

//     // Extract game codes from API response
//     const apiGameCodes = new Set(
//       apiResponse.data.games.map((game) => game.gameCode)
//     );
//     const dbGameIDs = new Set(dbGames.map((game) => game.gameID));

//     // Find differences
//     const missingInDB = [...apiGameCodes].filter(
//       (code) => !dbGameIDs.has(code)
//     );
//     const extraInDB = [...dbGameIDs].filter((id) => !apiGameCodes.has(id));

//     console.log(
//       `SpadeGaming - API Games: ${apiGameCodes.size}, DB Games: ${dbGameIDs.size}`
//     );
//     console.log(
//       `Missing in DB: ${missingInDB.length}, Extra in DB: ${extraInDB.length}`
//     );

//     // Update maintenance status
//     const [setMaintenanceTrue, setMaintenanceFalse] = await Promise.all([
//       // Set maintenance = true for games NOT in API (extra in DB)
//       GameSpadeGamingGameModal.updateMany(
//         { gameID: { $in: extraInDB } },
//         { $set: { maintenance: true } }
//       ),
//       // Set maintenance = false for games that exist in API
//       GameSpadeGamingGameModal.updateMany(
//         { gameID: { $in: [...apiGameCodes] } },
//         { $set: { maintenance: false } }
//       ),
//     ]);

//     // Get details for missing games
//     const missingGamesDetails = apiResponse.data.games
//       .filter((game) => missingInDB.includes(game.gameCode))
//       .map((game) => ({
//         gameCode: game.gameCode,
//         gameName: game.gameName,
//         thumbnail: game.thumbnail,
//         screenshot: game.screenshot,
//       }));

//     // Get details for extra games
//     const extraGamesDetails = dbGames
//       .filter((game) => extraInDB.includes(game.gameID))
//       .map((game) => ({
//         gameID: game.gameID,
//         gameNameEN: game.gameNameEN,
//         gameType: game.gameType,
//       }));

//     return res.status(200).json({
//       success: true,
//       summary: {
//         totalAPIGames: apiGameCodes.size,
//         totalDBGames: dbGameIDs.size,
//         missingInDB: missingInDB.length,
//         extraInDB: extraInDB.length,
//         matching: apiGameCodes.size - missingInDB.length,
//         apiLanguage: lang || "en",
//       },
//       maintenanceUpdates: {
//         setToMaintenance: setMaintenanceTrue.modifiedCount,
//         setToActive: setMaintenanceFalse.modifiedCount,
//       },
//       missingInDatabase: missingGamesDetails,
//       extraInDatabase: extraGamesDetails,
//       apiInfo: {
//         serialNo: apiResponse.data.serialNo,
//         merchantCode: apiResponse.data.merchantCode,
//         msg: apiResponse.data.msg,
//       },
//     });
//   } catch (error) {
//     console.error("SpadeGaming compare games error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error comparing SpadeGaming games",
//       error: error.message,
//     });
//   }
// });

// router.post("/api/spadegaming/getprovidergamelist", async (req, res) => {
//   try {
//     const { gameLang } = req.body;

//     let lang;

//     if (gameLang === "en") {
//       lang = "";
//     } else if (gameLang === "zh") {
//       lang = "zh_CN";
//     }

//     const serialNumber = generateSerialNo();

//     const data = {
//       merchantCode: spadeGamingMerchant,
//       language: lang,
//       currency: "MYR",
//       serialNo: serialNumber,
//     };

//     const digest = generateMD5Hash(data, spadeGamingSecret);
//     const loginResponse = await axios.post(
//       `${spadeGamingApiURL}/getGames`,
//       data,
//       {
//         headers: {
//           "Content-Type": "application/json",
//           Digest: digest,
//         },
//       }
//     );

//     if (loginResponse.data.code !== 0) {
//       console.log("FASTSPIN ERROR IN GETTING GAME LIST", loginResponse.data);
//       return res.status(200).json({
//         success: false,
//         message: {
//           en: "FASTSPIN: Unable to retrieve game lists. Please contact customer service for assistance.",
//           zh: "FASTSPIN: 无法获取游戏列表，请联系客服以获取帮助。",
//         },
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       gamelist: loginResponse.data,
//     });
//   } catch (error) {
//     console.log("FASTSPIN Error fetching game list:", error.message);
//     return res.status(200).json({
//       success: false,
//       message: {
//         en: "FASTSPIN: Unable to retrieve game lists. Please contact customer service for assistance.",
//         zh: "FASTSPIN: 无法获取游戏列表，请联系客服以获取帮助。",
//       },
//     });
//   }
// });

router.post("/api/spadegaming/getgamelist", async (req, res) => {
  try {
    const games = await GameSpadeGamingGameModal.find({
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
        },
      });
    }

    const reformattedGamelist = games.map((game) => ({
      GameCode: game.gameID,
      GameNameEN: game.gameNameEN,
      GameNameZH: game.gameNameCN,
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
        en: "SPADE GAMING: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "SPADE GAMING: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "SPADE GAMING: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "SPADE GAMING: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
      },
    });
  }
});

router.post(
  "/api/spadegaming/launchGame",
  authenticateToken,
  async (req, res) => {
    try {
      // zh-CN or en_US
      const { gameLang, gameCode } = req.body;

      let lang = "en_US";

      if (gameLang === "en") {
        lang = "en_US";
      } else if (gameLang === "zh") {
        lang = "zh_CN";
      } else if (gameLang === "ms") {
        lang = "id_ID";
      }
      const token = req.headers.authorization.split(" ")[1];
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
          },
        });
      }

      if (user.gameLock.spadegaming.lock) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Your game access has been locked. Please contact customer support for further assistance.",
            zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
            ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
            zh_hk: "您的遊戲訪問已被鎖定，請聯絡客服以獲取進一步幫助。",
          },
        });
      }

      let clientIp = req.headers["x-forwarded-for"] || req.ip;
      clientIp = clientIp.split(",")[0].trim();

      const serialNumber = generateSerialNo();

      const data = {
        merchantCode: spadeGamingMerchant,
        acctInfo: {
          acctId: user.userServerId,
          userName: user.username,
          siteId: webURL,
          currency: "MYR",
        },
        language: lang,
        token: token,
        game: gameCode,
        acctIp: clientIp,
        serialNo: serialNumber,
      };

      const digest = generateMD5Hash(data, spadeGamingSecret);
      const loginResponse = await axios.post(
        `${spadeGamingApiURL}/getAuthorize`,
        data,
        {
          headers: {
            "Content-Type": "application/json",
            Digest: digest,
          },
        }
      );

      if (loginResponse.data.code !== 0) {
        if (loginResponse.data.code === 5003) {
          console.log("SPADE GAMING maintenance");
          return res.status(200).json({
            success: false,
            message: {
              en: "Game under maintenance. Please try again later.",
              zh: "游戏正在维护中，请稍后再试。",
              ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
              zh_hk: "遊戲正在維護中，請稍後再試。",
            },
          });
        }
        console.log(`SPADE GAMING error in launching: ${loginResponse.data}`);
        console.log(loginResponse.data);
        console.log(loginResponse);
        return res.status(200).json({
          success: false,
          message: {
            en: "SPADE GAMING: Game launch failed. Please try again or customer service for assistance.",
            zh: "SPADE GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "SPADE GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "SPADE GAMING: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          },
        });
      }

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "SPADE GAMING"
      );

      return res.status(200).json({
        success: true,
        gameLobby: loginResponse.data.gameUrl,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
          zh_hk: "遊戲啟動成功。",
        },
      });
    } catch (error) {
      console.log("SPADE GAMING error in launching game", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "SPADE GAMING: Game launch failed. Please try again or customer service for assistance.",
          zh: "SPADE GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "SPADE GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "SPADE GAMING: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        },
      });
    }
  }
);

router.post("/api/spadegaming", async (req, res) => {
  try {
    const {
      acctId,
      merchantCode,
      serialNo,
      type,
      amount,
      transferId,
      referenceId,
      gameCode,
      betAmount,
    } = req.body;

    const apiValue = req.headers.api;

    if (!acctId || !merchantCode) {
      return res.status(200).json({
        ...(apiValue === "getBalance"
          ? {
              acctInfo: {
                userName: null,
                currency: "MYR",
                acctId: null,
                balance: 0.0,
              },
              merchantCode: null,
              msg: "Invalid Request",
              code: 2,
              serialNo: generateSerialNo(),
            }
          : {
              transferId: transferId,
              merchantCode: null,
              merchantTxId: null,
              acctId: null,
              balance: 0.0,
              msg: "Invalid Request",
              code: 2,
              serialNo: generateSerialNo(),
            }),
      });
    }

    if (merchantCode !== spadeGamingMerchant) {
      return res.status(200).json({
        ...(apiValue === "getBalance"
          ? {
              acctInfo: {
                userName: null,
                currency: "MYR",
                acctId: null,
                balance: 0.0,
              },
              merchantCode: null,
              msg: "Merchant Not Found",
              code: 10113,
              serialNo: generateSerialNo(),
            }
          : {
              transferId: transferId,
              merchantCode: null,
              merchantTxId: null,
              acctId: null,
              balance: 0.0,
              msg: "Merchant Not Found",
              code: 10113,
              serialNo: generateSerialNo(),
            }),
      });
    }
    const normaliseId = acctId.toLowerCase();

    const user = await User.findOne(
      { userServerId: normaliseId },
      { username: 1, wallet: 1, gameLock: 1, _id: 1 }
    ).lean();

    const currentBalance = user.wallet;
    const reqAmount = roundToTwoDecimals(amount || 0);

    if (apiValue === "getBalance") {
      return res.status(200).json({
        acctInfo: {
          userName: user.username,
          currency: "MYR",
          acctId: acctId,
          balance: roundToTwoDecimals(currentBalance),
        },
        merchantCode: spadeGamingMerchant,
        msg: "Success",
        code: 0,
        serialNo: generateSerialNo(),
      });
    } else if (apiValue === "transfer") {
      const trxId = generateUniqueTransactionId("bet");

      if (type === 1) {
        if (user.gameLock?.spadegaming?.lock) {
          return res.status(200).json({
            transferId: transferId,
            merchantCode: spadeGamingMerchant,
            merchantTxId: null,
            acctId: acctId,
            balance: roundToTwoDecimals(currentBalance),
            msg: "Acct Suspend",
            code: 50103,
            serialNo: generateSerialNo(),
          });
        }

        const existingTransPromise = SlotSpadeGamingModal.findOne(
          { transferId },
          { _id: 1 }
        ).lean();
        const existingTrans = await existingTransPromise;

        if (existingTrans) {
          return res.status(200).json({
            transferId: transferId,
            merchantCode: spadeGamingMerchant,
            merchantTxId: trxId,
            acctId: acctId,
            balance: roundToTwoDecimals(currentBalance),
            msg: "Success",
            code: 0,
            serialNo: generateSerialNo(),
          });
        }

        const updatedUserBalance = await User.findOneAndUpdate(
          {
            userServerId: normaliseId,
            wallet: { $gte: reqAmount },
          },
          { $inc: { wallet: -reqAmount } },
          { new: true, projection: { wallet: 1, username: 1 } }
        ).lean();

        if (!updatedUserBalance) {
          const latestUser = await User.findOne(
            { userServerId: normaliseId },
            { username: 1, wallet: 1 }
          ).lean();

          return res.status(200).json({
            transferId: transferId,
            merchantCode: spadeGamingMerchant,
            merchantTxId: trxId,
            acctId,
            balance: roundToTwoDecimals(latestUser?.wallet || 0),
            msg: "Insufficient Balance",
            code: 50110,
            serialNo: generateSerialNo(),
          });
        }

        const createTransactionPromise = !gameCode.startsWith("F-")
          ? SlotSpadeGamingModal.create({
              transferId,
              betamount: reqAmount,
              bet: true,
              gametype: "SLOT",
              username: user.username,
            })
          : SlotSpadeGamingModal.create({
              transferId,
              depositamount: reqAmount,
              bet: true,
              gametype: "FISH",
              username: user.username,
            });

        await createTransactionPromise;

        return res.status(200).json({
          transferId: transferId,
          merchantCode: spadeGamingMerchant,
          merchantTxId: trxId,
          acctId: acctId,
          balance: roundToTwoDecimals(updatedUserBalance?.wallet || 0),
          msg: "Success",
          code: 0,
          serialNo: generateSerialNo(),
        });
      } else if (type === 2) {
        const existingReferrenceIdPromise = SlotSpadeGamingModal.findOne(
          {
            transferId: referenceId,
            $or: [{ cancel: true }, { settle: true }],
          },
          { _id: 1 }
        ).lean();
        const existingReferrenceId = await existingReferrenceIdPromise;

        if (!referenceId || existingReferrenceId) {
          return res.status(200).json({
            transferId: transferId,
            merchantCode: spadeGamingMerchant,
            merchantTxId: trxId,
            acctId,
            balance: roundToTwoDecimals(currentBalance),
            msg: "Success",
            code: 0,
            serialNo: generateSerialNo(),
          });
        }

        const [updatedUserBalance] = await Promise.all([
          // Update user balance
          User.findOneAndUpdate(
            { userServerId: normaliseId },
            { $inc: { wallet: reqAmount } },
            { new: true, projection: { wallet: 1 } }
          ).lean(),

          // Update transaction record
          SlotSpadeGamingModal.findOneAndUpdate(
            { transferId: referenceId },
            {
              $set: {
                cancelamount: reqAmount,
                cancel: true,
              },
            },
            { upsert: true, new: true }
          ),
        ]);

        return res.status(200).json({
          transferId: transferId,
          merchantCode: spadeGamingMerchant,
          merchantTxId: trxId,
          acctId,
          balance: roundToTwoDecimals(updatedUserBalance?.wallet || 0),
          msg: "Success",
          code: 0,
          serialNo: generateSerialNo(),
        });
      } else if (type === 4) {
        const existingTransPromise = SlotSpadeGamingModal.findOne(
          {
            settleId: transferId,
          },
          { _id: 1 }
        ).lean();

        const existingTrans = await existingTransPromise;

        if (existingTrans) {
          return res.status(200).json({
            transferId: transferId,
            merchantCode: spadeGamingMerchant,
            merchantTxId: trxId,
            acctId,
            balance: roundToTwoDecimals(currentBalance),
            msg: "Success",
            code: 0,
            serialNo: generateSerialNo(),
          });
        }

        const updatedUserBalancePromise = User.findOneAndUpdate(
          { userServerId: normaliseId },
          { $inc: { wallet: reqAmount } },
          { new: true, projection: { wallet: 1 } }
        ).lean();

        const updateTransactionPromise = !gameCode.startsWith("F-")
          ? SlotSpadeGamingModal.findOneAndUpdate(
              {
                transferId: referenceId,
                $or: [
                  { settleamount: { $exists: false } },
                  { settleamount: 0 },
                  { settleamount: null },
                ],
              },
              {
                $set: {
                  settleamount: reqAmount,
                  settle: true,
                  settleId: transferId,
                },
              },
              { new: true }
            )
          : SlotSpadeGamingModal.findOneAndUpdate(
              { transferId: referenceId },
              {
                $set: {
                  withdrawamount: reqAmount,
                  betamount: roundToTwoDecimals(betAmount),
                  settle: true,
                  settleId: transferId,
                },
              },
              { upsert: true, new: true }
            );

        // Execute promises in parallel
        const [updatedUserBalance, updatedTransaction] = await Promise.all([
          updatedUserBalancePromise,
          updateTransactionPromise,
        ]);

        if (!updatedTransaction) {
          await SlotSpadeGamingModal.create({
            transferId: referenceId,
            settleId: transferId,
            username: user.username,
            settleamount: reqAmount,
            settle: true,
            bet: true,
            betamount: 0,
            gametype: gameCode.startsWith("F-") ? "FISH" : "SLOT",
          });
        }

        return res.status(200).json({
          transferId: transferId,
          merchantCode: spadeGamingMerchant,
          merchantTxId: trxId,
          acctId,
          balance: roundToTwoDecimals(updatedUserBalance?.wallet || 0),
          msg: "Success",
          code: 0,
          serialNo: generateSerialNo(),
        });
      } else if (type === 7) {
        const existingTransPromise = SlotSpadeGamingModal.findOne(
          {
            transferId: referenceId,
            bonus: true,
          },
          { _id: 1 }
        ).lean();
        const existingTrans = await existingTransPromise;

        if (existingTrans) {
          return res.status(200).json({
            transferId: transferId,
            merchantCode: spadeGamingMerchant,
            merchantTxId: trxId,
            acctId,
            balance: roundToTwoDecimals(currentBalance),
            msg: "Success",
            code: 0,
            serialNo: generateSerialNo(),
          });
        }

        const [updatedUserBalance] = await Promise.all([
          // Update user balance
          User.findOneAndUpdate(
            { userServerId: normaliseId },
            { $inc: { wallet: reqAmount } },
            { new: true, projection: { wallet: 1 } }
          ).lean(),

          // Create bonus transaction
          SlotSpadeGamingModal.create({
            transferId: transferId,
            bonusamount: reqAmount,
            bonus: true,
            username: user.username,
          }),
        ]);

        return res.status(200).json({
          transferId: transferId,
          merchantCode: spadeGamingMerchant,
          merchantTxId: trxId,
          acctId: acctId,
          balance: roundToTwoDecimals(updatedUserBalance?.wallet || 0),
          msg: "Success",
          code: 0,
          serialNo: generateSerialNo(),
        });
      }
    }
  } catch (error) {
    console.error(
      "SpadeGaming: Error in game provider calling ae96 api:",
      error.message
    );
    return res.status(500).json({
      transferId: null,
      merchantCode: null,
      merchantTxId: null,
      acctId: null,
      balance: 0.0,
      msg: "System Error",
      code: 1,
      serialNo: generateSerialNo(),
    });
  }
});

router.post("/api/spadegamingslot/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotSpadeGamingModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "SLOT",
      cancel: { $ne: true },
      settle: true,
    });

    let playerSummary = {};

    records.forEach((record) => {
      const username = record.username.toLowerCase();

      if (!playerSummary[username]) {
        playerSummary[username] = { turnover: 0, winloss: 0 };
      }

      playerSummary[username].turnover += record.betamount || 0;

      playerSummary[username].winloss +=
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
        gamename: "SPADE GAMING",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log(
      "SPADE GAMING: Failed to fetch win/loss report:",
      error.message
    );
    return res.status(500).json({
      success: false,
      message: {
        en: "SPADE GAMING: Failed to fetch win/loss report",
        zh: "SPADE GAMING: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/spadegamingslot/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotSpadeGamingModal.find({
        username: user.username,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "SLOT",
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
          gamename: "SPADE GAMING",
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
        "SPADE GAMING: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "SPADE GAMING: Failed to fetch win/loss report",
          zh: "SPADE GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/spadegamingslot/:userId/gamedata",
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

          if (gameCat["SPADE GAMING"]) {
            totalTurnover += gameCat["SPADE GAMING"].turnover || 0;
            totalWinLoss += gameCat["SPADE GAMING"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "SPADE GAMING",
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
        "SPADE GAMING: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "SPADE GAMING: Failed to fetch win/loss report",
          zh: "SPADE GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/spadegamingslot/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotSpadeGamingModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "SLOT",
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
          gamename: "SPADE GAMING",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("SPADE GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "SPADE GAMING: Failed to fetch win/loss report",
          zh: "SPADE GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/spadegamingslot/kioskreport",
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

          if (gameCat["SPADE GAMING"]) {
            totalTurnover += Number(gameCat["SPADE GAMING"].turnover || 0);
            totalWinLoss += Number(gameCat["SPADE GAMING"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "SPADE GAMING",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("SPADE GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "SPADE GAMING: Failed to fetch win/loss report",
          zh: "SPADE GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ----------------
router.post("/api/spadegamingfish/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotSpadeGamingModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "FISH",
      cancel: { $ne: true },
      settle: true,
    });

    let playerSummary = {};

    records.forEach((record) => {
      const username = record.username.toLowerCase();

      if (!playerSummary[username]) {
        playerSummary[username] = { turnover: 0, winloss: 0 };
      }

      playerSummary[username].turnover += record.betamount || 0;

      playerSummary[username].winloss +=
        (record.withdrawamount || 0) - (record.depositamount || 0);
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
        gamename: "SPADE GAMING",
        gamecategory: "Fishing",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log(
      "SPADE GAMING: Failed to fetch win/loss report:",
      error.message
    );
    return res.status(500).json({
      success: false,
      message: {
        en: "SPADE GAMING: Failed to fetch win/loss report",
        zh: "SPADE GAMING: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/spadegamingfish/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotSpadeGamingModal.find({
        username: user.username,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "FISH",
        cancel: { $ne: true },
        settle: true,
      });

      // Aggregate turnover and win/loss for each player
      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;
        totalWinLoss +=
          (record.withdrawamount || 0) - (record.depositamount || 0);
      });

      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));
      // Return the aggregated results
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "SPADE GAMING",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log(
        "SPADE GAMING: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "SPADE GAMING: Failed to fetch win/loss report",
          zh: "SPADE GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/spadegamingfish/:userId/gamedata",
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

          if (gameCat["SPADE GAMING"]) {
            totalTurnover += gameCat["SPADE GAMING"].turnover || 0;
            totalWinLoss += gameCat["SPADE GAMING"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "SPADE GAMING",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log(
        "SPADE GAMING: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "SPADE GAMING: Failed to fetch win/loss report",
          zh: "SPADE GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/spadegamingfish/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotSpadeGamingModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "FISH",
        cancel: { $ne: true },
        settle: true,
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;

        totalWinLoss +=
          (record.depositamount || 0) - (record.withdrawamount || 0);
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "SPADE GAMING",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("SPADE GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "SPADE GAMING: Failed to fetch win/loss report",
          zh: "SPADE GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/spadegamingfish/kioskreport",
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

          if (gameCat["SPADE GAMING"]) {
            totalTurnover += Number(gameCat["SPADE GAMING"].turnover || 0);
            totalWinLoss += Number(gameCat["SPADE GAMING"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "SPADE GAMING",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("SPADE GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "SPADE GAMING: Failed to fetch win/loss report",
          zh: "SPADE GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

module.exports = router;
