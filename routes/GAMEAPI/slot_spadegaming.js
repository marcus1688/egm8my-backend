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
const spadeGamingMerchant = "EGM8MYR";
const spadeGamingSecret = process.env.SPADEGAMING_SECRET;
const webURL = "https://www.bm8my.vip/";
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

// async function updateBTGamingManualOrderTimestampsPlus() {
//   try {
//     // List of gameIDs in order (AB1541 = latest, AB1501 = oldest)
//     const gameIds = [
//       "S-LK03",
//       "S-RH02",
//       "S-FS01",
//       "S-FS02",
//       "S-CG02",
//       "S-RK02",
//       "S-BA01",
//       "S-MR02",
//       "S-MC01",
//       "S-RV01",
//       "S-GP03",
//       "S-DW01",
//       "S-CS02",
//       "S-LR01",
//       "S-GP04",
//       "S-GK01",
//       "S-WW02",
//       "S-PW03",
//       "S-LS03",
//       "S-GL02",
//       "S-CS03",
//       "S-JM01",
//       "S-HN01",
//       "S-RM01",
//       "S-TD01",
//       "S-GR01",
//       "S-FH04",
//       "S-RC01",
//       "S-FM03",
//       "S-HT02",
//       "S-JT03",
//       "S-GW03",
//       "S-MT01",
//       "S-MG02",
//       "S-FD01",
//       "S-SW02",
//       "S-FF01",
//       "S-CG01",
//       "S-VB01",
//       "S-ZE01",
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
//       const result = await GameSpadeGamingGameModal.collection.updateOne(
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
//     const updatedGames = await GameSpadeGamingGameModal.find(
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

router.post("/api/spadegaming/comparegame", async (req, res) => {
  try {
    const { gameLang } = req.body;

    let lang;

    if (gameLang === "en") {
      lang = "";
    } else if (gameLang === "zh") {
      lang = "zh_CN";
    }

    const serialNumber = generateSerialNo();

    const data = {
      merchantCode: spadeGamingMerchant,
      language: lang,
      currency: "MYR",
      serialNo: serialNumber,
    };

    const digest = generateMD5Hash(data, spadeGamingSecret);
    const loginResponse = await axios.post(
      `${spadeGamingApiURL}/getGames`,
      data,
      {
        headers: {
          "Content-Type": "application/json",
          Digest: digest,
        },
      }
    );

    if (loginResponse.data.code !== 0) {
      console.log("SPADEGAMING ERROR IN GETTING GAME LIST", loginResponse.data);
      return res.status(200).json({
        success: false,
        message: {
          en: "SPADEGAMING: Unable to retrieve game lists. Please contact customer service for assistance.",
          zh: "SPADEGAMING: 无法获取游戏列表，请联系客服以获取帮助。",
        },
      });
    }

    // Get all games from database
    const dbGames = await GameSpadeGamingGameModal.find({}, "gameID");

    // Extract game IDs from database
    const dbGameIds = new Set(dbGames.map((game) => game.gameID));

    // Extract games from API response
    const apiGames = loginResponse.data.games;
    const apiGameIds = new Set(apiGames.map((game) => game.gameCode));

    // Count totals
    const totalApiGames = apiGames.length;
    const totalDbGames = dbGames.length;

    // Find missing games (in API but not in database)
    const missingGames = apiGames.filter(
      (game) => !dbGameIds.has(game.gameCode)
    );

    // Find extra games (in database but not in API) and set maintenance to true
    const extraGameIds = [...dbGameIds].filter(
      (gameId) => !apiGameIds.has(gameId)
    );

    // Update extra games to maintenance: true
    if (extraGameIds.length > 0) {
      await GameSpadeGamingGameModal.updateMany(
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
      await GameSpadeGamingGameModal.updateMany(
        { gameID: { $in: activeGameIds } },
        { maintenance: false }
      );
      console.log(
        `Set maintenance: false for ${activeGameIds.length} games in API`
      );
    }

    // Return missing games with gameCode and gameName
    const missingGamesInfo = missingGames.map((game) => ({
      gameCode: game.gameCode,
      gameName: game.gameName,
      thumbnail: game.thumbnail,
      screenshot: game.screenshot,
    }));

    console.log("Missing games:", missingGamesInfo);
    console.log("Extra games set to maintenance:", extraGameIds.length);
    console.log(
      `Total API games: ${totalApiGames}, Total DB games: ${totalDbGames}`
    );

    return res.status(200).json({
      success: true,
      gamelist: loginResponse.data,
      comparison: {
        missingGames: missingGamesInfo,
        extraGamesCount: extraGameIds.length,
        extraGameIds: extraGameIds,
        missingCount: missingGamesInfo.length,
        totalApiGames: totalApiGames,
        totalDbGames: totalDbGames,
      },
    });
  } catch (error) {
    console.log("SPADEGAMING Error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "SPADEGAMING: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "SPADEGAMING: 无法获取游戏列表，请联系客服以获取帮助。",
      },
    });
  }
});

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
          id: "Tidak ada permainan ditemukan. Silakan coba lagi nanti.",
          zh_hk: "搵唔到遊戲。老闆麻煩再試下或者聯絡客服。",
        },
      });
    }

    const reformattedGamelist = games.map((game) => ({
      GameCode: game.gameID,
      GameNameEN: game.gameNameEN,
      GameNameZH: game.gameNameCN,
      GameNameHK: game.gameNameHK,
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
        zh_hk: "SPADE GAMING: 攞唔到遊戲清單，老闆麻煩聯絡客服幫手處理。",
        id: "SPADE GAMING: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/api/spadegaming/launchGame",
  authenticateToken,
  async (req, res) => {
    try {
      const { gameLang, gameCode, gameType } = req.body;

      let lang = "en_US";

      if (gameLang === "en") {
        lang = "en_US";
      } else if (gameLang === "zh") {
        lang = "zh_CN";
      } else if (gameLang === "zh_hk") {
        lang = "zh_CN";
      } else if (gameLang === "ms") {
        lang = "id_ID";
      } else if (gameLang === "id") {
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
            zh_hk: "搵唔到用戶，麻煩再試多次或者聯絡客服幫手。",
            id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      const isLocked =
        gameType === "Fishing"
          ? user.gameLock?.spadegamingfish?.lock
          : user.gameLock?.spadegamingslot?.lock;

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

      let clientIp = req.headers["x-forwarded-for"] || req.ip;
      clientIp = clientIp.split(",")[0].trim();

      const serialNumber = generateSerialNo();

      const data = {
        merchantCode: spadeGamingMerchant,
        acctInfo: {
          acctId: user.gameId,
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
              zh_hk: "遊戲而家維護緊，老闆遲啲再試下。",
              id: "Permainan sedang dalam pemeliharaan. Silakan coba lagi nanti.",
            },
          });
        }
        console.log(`SPADE GAMING error in launching: ${loginResponse.data}`);
        return res.status(200).json({
          success: false,
          message: {
            en: "SPADE GAMING: Game launch failed. Please try again or customer service for assistance.",
            zh: "SPADE GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "SPADE GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "SPADE GAMING: 遊戲開唔到，老闆試多次或者搵客服幫手。",
            id: "SPADE GAMING: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
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
          id: "Permainan berhasil diluncurkan.",
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
          zh_hk: "SPADE GAMING: 遊戲開唔到，老闆試多次或者搵客服幫手。",
          id: "SPADE GAMING: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
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

    const user = await User.findOne(
      { gameId: acctId },
      {
        username: 1,
        wallet: 1,
        "gameLock.spadegamingfish.lock": 1,
        "gameLock.spadegamingslot.lock": 1,
        _id: 1,
      }
    ).lean();

    const reqAmount = roundToTwoDecimals(amount);

    if (apiValue === "getBalance") {
      return res.status(200).json({
        acctInfo: {
          userName: user.username,
          currency: "MYR",
          acctId: acctId,
          balance: roundToTwoDecimals(user.wallet),
        },
        merchantCode: spadeGamingMerchant,
        msg: "Success",
        code: 0,
        serialNo: generateSerialNo(),
      });
    } else if (apiValue === "transfer") {
      const trxId = generateUniqueTransactionId("bet");

      const isFishingGame = gameCode?.startsWith("F-");

      const isLocked = isFishingGame
        ? user.gameLock?.spadegamingfish?.lock
        : user.gameLock?.spadegamingslot?.lock;

      if (type === 1) {
        if (isLocked) {
          return res.status(200).json({
            transferId: transferId,
            merchantCode: spadeGamingMerchant,
            merchantTxId: null,
            acctId: acctId,
            balance: roundToTwoDecimals(user.wallet),
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
            balance: roundToTwoDecimals(user.wallet),
            msg: "Success",
            code: 0,
            serialNo: generateSerialNo(),
          });
        }

        const updatedUserBalance = await User.findOneAndUpdate(
          {
            gameId: acctId,
            wallet: { $gte: reqAmount },
          },
          { $inc: { wallet: -reqAmount } },
          { new: true, projection: { wallet: 1, username: 1 } }
        ).lean();

        if (!updatedUserBalance) {
          const latestUser = await User.findOne(
            { gameId: acctId },
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
              username: acctId,
            })
          : SlotSpadeGamingModal.create({
              transferId,
              depositamount: reqAmount,
              bet: true,
              gametype: "FISH",
              username: acctId,
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
            balance: roundToTwoDecimals(user.wallet),
            msg: "Success",
            code: 0,
            serialNo: generateSerialNo(),
          });
        }

        const [updatedUserBalance] = await Promise.all([
          // Update user balance
          User.findOneAndUpdate(
            { gameId: acctId },
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
            balance: roundToTwoDecimals(user.wallet),
            msg: "Success",
            code: 0,
            serialNo: generateSerialNo(),
          });
        }

        const updatedUserBalancePromise = User.findOneAndUpdate(
          { gameId: acctId },
          { $inc: { wallet: reqAmount } },
          { new: true, projection: { wallet: 1 } }
        ).lean();

        const actualbetAmount = gameCode.startsWith("F-")
          ? roundToTwoDecimals(betAmount)
          : undefined;

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
                  betamount: actualbetAmount || 0,
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
            username: acctId,
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
            balance: roundToTwoDecimals(user.wallet),
            msg: "Success",
            code: 0,
            serialNo: generateSerialNo(),
          });
        }

        const [updatedUserBalance] = await Promise.all([
          // Update user balance
          User.findOneAndUpdate(
            { gameId: acctId },
            { $inc: { wallet: reqAmount } },
            { new: true, projection: { wallet: 1 } }
          ).lean(),

          // Create bonus transaction
          SlotSpadeGamingModal.create({
            transferId: transferId,
            bonusamount: reqAmount,
            bonus: true,
            username: acctId,
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

    console.log("SPADE GAMING SLOT QUERYING TIME", startDate, endDate);

    const records = await SlotSpadeGamingModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "SLOT",
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

    // Aggregate turnover and win/loss for each player
    let playerSummary = {};

    records.forEach((record) => {
      const gameId = record.username;
      const actualUsername = gameIdToUsername[gameId];

      if (!actualUsername) {
        console.warn(`SPADEGAMING User not found for gameId: ${gameId}`);
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
        username: user.gameId,
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

    console.log("SPADE GAMING FISH QUERYING TIME", startDate, endDate);

    const records = await SlotSpadeGamingModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "FISH",
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
    // Aggregate turnover and win/loss for each player
    let playerSummary = {};

    records.forEach((record) => {
      const gameId = record.username;
      const actualUsername = gameIdToUsername[gameId];

      if (!playerSummary[actualUsername]) {
        playerSummary[actualUsername] = { turnover: 0, winloss: 0 };
      }

      playerSummary[actualUsername].turnover += record.betamount || 0;

      playerSummary[actualUsername].winloss +=
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
        username: user.gameId,
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
