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
const { adminUser, adminLog } = require("../../models/adminuser.model");
const SlotJiliModal = require("../../models/slot_jili.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const qs = require("querystring");
const GameWalletLog = require("../../models/gamewalletlog.model");
const GameNextSpinGameModal = require("../../models/slot_nextspinDatabase.model");
const SlotNextSpinModal = require("../../models/slot_nextspin.model");

require("dotenv").config();

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
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

const nextSpinMC = "ZBH1472";
const nextSpinSecret = process.env.NEXTSPIN_SECRET;
const webURL = "https://www.bm8my.vip/";
const nextSpinAPIURL = "https://merchantapi.ns-api-cy2-tokyo01.com/api";
const nextSpinGameURL = "https://lobby.d1mquqjm.com";
const nextSpinCustomBrand = "EGM8";

function generateSignature(id, method, sn, playerCode) {
  const rawString = `${id}${method}${sn}${playerCode}${lionKingSecret}`;
  return crypto.createHash("md5").update(rawString).digest("hex");
}

function generateTransactionId(length = 8, prefix = "") {
  // Ensure length doesn't exceed 10 characters
  const maxLength = 10;
  const actualLength = Math.min(length, maxLength);

  // Characters to use in the transaction ID (alphanumeric)
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  // Generate random characters
  for (let i = 0; i < actualLength; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }

  // If a prefix is provided, make sure the total length doesn't exceed 10
  let finalId = prefix + result;
  if (finalId.length > maxLength) {
    // Truncate the random part to ensure total length is 10
    finalId = prefix + result.substring(0, maxLength - prefix.length);
  }

  return finalId;
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

function generateSerialNo() {
  const timestamp = moment().format("YYYYMMDDHHmmss");
  const randomStr = crypto.randomBytes(4).toString("hex"); // 8 characters
  return `${timestamp}${randomStr}`;
}

function generateDigest(body) {
  const json = JSON.stringify(body);
  return crypto.createHash("md5").update(json).digest("hex");
}

async function getLatestLaunchGameUrl() {
  try {
    const serialNo = generateSerialNo();

    const requestBody = {
      merchantCode: nextSpinMC,
      serialNo,
    };

    const digest = generateDigest(requestBody);

    const response = await axios.post(`${nextSpinAPIURL}`, requestBody, {
      headers: {
        "Content-Type": "application/json",
        API: "getDomainList",
        DataType: "JSON",
        Digest: digest,
        "Accept-Encoding": "gzip, deflate",
        "Accept-Language": "en_US",
      },
    });

    if (response.data.code !== 0) {
      return {
        success: false,
        error: response.data.msg,
      };
    }
    return {
      success: true,
      data: response.data,
      url: response.data.domains[0],
    };
  } catch (error) {
    console.log("error getting game url nextspin", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}
// async function updateBTGamingManualOrderTimestampsPlus() {
//   try {
//     // List of gameIDs in order (AB1541 = latest, AB1501 = oldest)
//     const gameIds = [
//       "sHG0002",
//       "s80434365",
//       "sTreaAtlan",
//       "sRoyalGem",
//       "sWinX2Neko",
//       "sProsSnake",
//       "sZeus",
//       "sHG0001",
//       "sGuanGong",
//       "sCleopaFor",
//       "sAztecGolT",
//       "sMahPhe",
//       "sRoma",
//       "sMahDrg",
//       "sRomaII",
//       "sLongX3",
//       "sLightnDrg",
//       "sCaiShen",
//       "sClaFruit7",
//       "s7Dragons",
//       "sBuffK",
//       "sGolWest",
//       "s5ForStar",
//       "sProsDrg",
//       "sSweetLava",
//       "sCandyBona",
//       "sPrincessR",
//       "sHotSmash",
//       "sForToad",
//       "sLightnWmn",
//       "sGoldenFa",
//       "sGoldenWar",
//       "sDiamond7",
//       "sCandyXmas",
//       "sHighwayB",
//       "sTaiga88",
//       "sShkThaiX2",
//       "sDrgBlitz",
//       "sTriMnky",
//       "sMayaQuest",
//       "sHoney888",
//       "sCrazyMkDx",
//       "sHolyGoat",
//       "sLuckyGems",
//       "sEternalFi",
//       "sJokerKing",
//       "sOceanChes",
//       "sCrazyMnky",
//       "sShkBoomX2",
//       "aDonkiKong",
//       "sRickyTyco",
//       "sSuperFor",
//       "sTwinkleIc",
//       "sDolphDive",
//       "sSoccerK",
//       "sPrinCrime",
//       "sTriKfMnky",
//       "sFruitTyc",
//       "sForestSec",
//       "sDblMnky",
//       "sMrHippo",
//       "aMnkyJump",
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
//       const result = await GameNextSpinGameModal.collection.updateOne(
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
//     const updatedGames = await GameNextSpinGameModal.find(
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

router.post("/api/nextspin/comparegame", async (req, res) => {
  try {
    const serialNo = generateSerialNo();

    const requestBody = {
      merchantCode: nextSpinMC,
      serialNo,
    };
    const digest = generateDigest(requestBody);

    const response = await axios.post(`${nextSpinAPIURL}`, requestBody, {
      headers: {
        "Content-Type": "application/json",
        API: "getGames",
        DataType: "JSON",
        Digest: digest,
        "Accept-Encoding": "gzip, deflate",
        "Accept-Language": "en_US",
      },
    });

    // Get all games from database
    const dbGames = await GameNextSpinGameModal.find({}).lean();

    // Extract game codes from API response
    const apiGameCodes = new Set(
      response.data.games.map((game) => game.gameCode)
    );

    // Extract game IDs from database
    const dbGameIds = new Set(dbGames.map((game) => game.gameID));

    // Find missing games (in API but not in DB)
    const missingGames = response.data.games.filter(
      (game) => !dbGameIds.has(game.gameCode)
    );

    // Find extra games (in DB but not in API) and set maintenance to true
    const extraGameIds = dbGames
      .filter((game) => !apiGameCodes.has(game.gameID))
      .map((game) => game._id);

    // Update extra games to maintenance mode
    if (extraGameIds.length > 0) {
      await GameNextSpinGameModal.updateMany(
        { _id: { $in: extraGameIds } },
        { $set: { maintenance: true } }
      );
    }

    // Format missing games for response
    const missingGamesFormatted = missingGames.map((game) => ({
      gameCode: game.gameCode,
      gameName: game.gameName,
      gameNameCN: game.cnName,
      category: game.category,
    }));

    return res.status(200).json({
      success: true,
      gameLobby: response.data,
      comparison: {
        missingGames: missingGamesFormatted,
        missingCount: missingGames.length,
        extraGamesSetToMaintenance: extraGameIds.length,
      },
      message: {
        en: "Game list retrieved successfully.",
        zh: "游戏列表检索成功。",
        ms: "Senarai permainan berjaya diambil.",
      },
    });
  } catch (error) {
    console.log("NEXTSPIN error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "NEXTSPIN: Game launch failed. Please try again or customer service for assistance.",
        zh: "NEXTSPIN: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "NEXTSPIN: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/nextspin/getprovidergamelist", async (req, res) => {
  try {
    const serialNo = generateSerialNo();

    const requestBody = {
      merchantCode: nextSpinMC,
      serialNo,
    };
    const digest = generateDigest(requestBody);

    const response = await axios.post(`${nextSpinAPIURL}`, requestBody, {
      headers: {
        "Content-Type": "application/json",
        API: "getGames",
        DataType: "JSON",
        Digest: digest,
        "Accept-Encoding": "gzip, deflate",
        "Accept-Language": "en_US",
      },
    });

    return res.status(200).json({
      success: true,
      gameLobby: response.data,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
      },
    });
  } catch (error) {
    console.log("NEXTSPIN error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "NEXTSPIN: Game launch failed. Please try again or customer service for assistance.",
        zh: "NEXTSPIN: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "NEXTSPIN: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/nextspin/getgamelist", async (req, res) => {
  try {
    const games = await GameNextSpinGameModal.find({
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
      Hot: game.hot || false,
      RTP: game.rtpRate,
    }));

    return res.status(200).json({
      success: true,
      gamelist: reformattedGamelist,
    });
  } catch (error) {
    console.error("NEXTSPIN Error fetching game list:", error);
    return res.status(200).json({
      success: false,
      message: {
        en: "NEXTSPIN: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "NEXTSPIN: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "NEXTSPIN: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "NEXTSPIN: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "NEXTSPIN: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/nextspin/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, gameCode } = req.body;
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

    if (user.gameLock.nextspin.lock) {
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

    let lang = "en_US";

    if (gameLang === "en") {
      lang = "en_US";
    } else if (gameLang === "zh") {
      lang = "zh_CN";
    } else if (gameLang === "zh_hk") {
      lang = "zh_TW";
    } else if (gameLang === "ms") {
      lang = "en_US";
    } else if (gameLang === "id") {
      lang = "id_ID";
    }

    let token = `${user.gameId}:${generateRandomCode()}`;

    const redirectURL = `${nextSpinGameURL}/${nextSpinMC}/auth/?acctId=${user.gameId}&language=${lang}&token=${token}&game=${gameCode}&brand=${nextSpinCustomBrand}`;

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        nextspinGameToken: token,
      },
      { new: true }
    );

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "NEXTSPIN"
    );

    return res.status(200).json({
      success: true,
      gameLobby: redirectURL,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("NEXTSPIN error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "NEXTSPIN: Game launch failed. Please try again or customer service for assistance.",
        zh: "NEXTSPIN: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "NEXTSPIN: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "NEXTSPIN: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "NEXTSPIN: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/nextspin", async (req, res) => {
  try {
    const {
      merchantCode,
      acctId,
      token,
      serialNo,
      transferId,
      amount,
      type,
      ticketId,
      referenceId,
      specialGame,
      gameCode,
    } = req.body;
    const APIRequested = req.headers["api"];
    const digestReceived = req.headers["digest"];

    if (merchantCode !== nextSpinMC) {
      console.log("[NEXTSPIN] Wrong merchantCode:", {
        received: merchantCode,
        expected: nextSpinMC,
      });
      return res.status(200).json({
        merchantCode: nextSpinMC,
        msg: "Invalid Parameters",
        code: 106,
        serialNo: serialNo || "",
      });
    }

    if (APIRequested === "authorize" || APIRequested === "getBalance") {
      if (digestReceived !== generateDigest(req.body)) {
        console.log("[NEXTSPIN] Digest validation failed:", digestReceived);
        return res.status(200).json({
          merchantCode: nextSpinMC,
          msg: "Token Validation Failed",
          code: 50104,
          serialNo: serialNo || "",
        });
      }
    }

    // Handle different APIs
    switch (APIRequested) {
      case "authorize": {
        const currentUser = await User.findOne(
          { gameId: acctId, nextspinGameToken: token },
          { username: 1, _id: 1 }
        ).lean();

        if (!currentUser) {
          console.log("[NEXTSPIN] User not found or token mismatch");
          return res.status(200).json({
            merchantCode: nextSpinMC,
            msg: "Acct Not Found",
            code: 50100,
            serialNo: serialNo || "",
          });
        }

        return res.status(200).json({
          acctInfo: {
            acctId: acctId,
            balance: 0,
            userName: currentUser.username,
            currency: "MYR",
          },
          merchantCode: nextSpinMC,
          msg: "success",
          code: 0,
          serialNo: serialNo || "",
        });
      }

      case "getBalance": {
        const currentUser = await User.findOne(
          { gameId: acctId },
          { username: 1, wallet: 1 }
        ).lean();

        if (!currentUser) {
          console.log("[NEXTSPIN] User not found:", acctId);
          return res.status(200).json({
            merchantCode: nextSpinMC,
            msg: "Acct Not Found",
            code: 50100,
            serialNo: serialNo || "",
          });
        }

        return res.status(200).json({
          acctInfo: {
            userName: currentUser.username,
            currency: "MYR",
            acctId: acctId,
            balance: roundToTwoDecimals(currentUser.wallet),
          },
          merchantCode: nextSpinMC,
          msg: "success",
          code: 0,
          serialNo: serialNo || "",
        });
      }

      case "transfer": {
        const roundedAmount = roundToTwoDecimals(amount || 0);

        const currentUser = await User.findOne(
          { gameId: acctId },
          {
            _id: 1,
            wallet: 1,
            "gameLock.nextspin.lock": 1,
          }
        ).lean();

        if (!currentUser) {
          return res.status(200).json({
            merchantCode: nextSpinMC,
            msg: "Acct Not Found",
            code: 50100,
            serialNo: serialNo || "",
          });
        }

        const createSuccessResponse = (userBalance) => ({
          transferId,
          merchantTxId: generateTransactionId(),
          merchantCode: nextSpinMC,
          acctId: acctId,
          balance: roundToTwoDecimals(userBalance),
          msg: "success",
          code: 0,
          serialNo: serialNo || "",
        });

        switch (type) {
          case 1: {
            if (currentUser.gameLock?.nextspin?.lock) {
              console.log("[NEXTSPIN] Account locked for betting");
              return res.status(200).json({
                merchantCode: nextSpinMC,
                msg: "Acct Locked",
                code: 50102,
                serialNo: serialNo || "",
              });
            }

            const existingBet = await SlotNextSpinModal.findOne(
              { tranId: transferId, bet: true },
              { _id: 1 }
            ).lean();

            if (existingBet) {
              console.log("[NEXTSPIN] Existing bet found:", transferId);
              return res.status(200).json({
                merchantCode: nextSpinMC,
                msg: "Transaction Settled",
                code: 109,
                serialNo: serialNo || "",
              });
            }

            const updatedUserBalance = await User.findOneAndUpdate(
              {
                _id: currentUser._id,
                wallet: { $gte: roundedAmount },
              },
              { $inc: { wallet: -roundedAmount } },
              { new: true, projection: { wallet: 1 } }
            ).lean();

            if (!updatedUserBalance) {
              console.log("[NEXTSPIN] Insufficient balance for bet");
              return res.status(200).json({
                merchantCode: nextSpinMC,
                msg: "Insufficient Balance",
                code: 50110,
                serialNo: serialNo || "",
              });
            }

            await SlotNextSpinModal.create({
              tranId: transferId,
              username: acctId,
              bet: true,
              betamount: roundedAmount,
            });

            return res
              .status(200)
              .json(createSuccessResponse(updatedUserBalance.wallet));
          }

          case 2: {
            const [existingBet, existingCancel] = await Promise.all([
              SlotNextSpinModal.findOne(
                { tranId: referenceId, bet: true },
                { _id: 1 }
              ).lean(),
              SlotNextSpinModal.findOne(
                { canceltranId: transferId },
                { _id: 1 }
              ).lean(),
            ]);

            if (!existingBet) {
              console.log("[NEXTSPIN] Original bet not found:", referenceId);
              return res.status(200).json({
                merchantCode: nextSpinMC,
                msg: "Bet not found",
                code: 109,
                serialNo: serialNo || "",
              });
            }

            if (existingCancel) {
              console.log("[NEXTSPIN] Already cancelled:", transferId);
              return res.status(200).json({
                merchantCode: nextSpinMC,
                msg: "Transaction Cancelled",
                code: 109,
                serialNo: serialNo || "",
              });
            }

            const [updatedUserBalance] = await Promise.all([
              User.findOneAndUpdate(
                { _id: currentUser._id },
                { $inc: { wallet: roundedAmount } },
                { new: true, projection: { wallet: 1 } }
              ).lean(),

              SlotNextSpinModal.findOneAndUpdate(
                { tranId: referenceId },
                { $set: { cancel: true, canceltranId: transferId } }
              ),
            ]);

            return res
              .status(200)
              .json(createSuccessResponse(updatedUserBalance.wallet));
          }

          case 4:
          case 6: {
            const isJackpot = type === 6;
            const tranIdField = isJackpot ? "jackpottranId" : "settletranId";
            const amountField = isJackpot ? "jackpotamount" : "settleamount";
            const statusField = isJackpot ? "jackpot" : "settle";
            const queryStatus = isJackpot
              ? { jackpot: true }
              : { $or: [{ settle: true }, { cancel: true }] };

            const [existingBet, existingTransaction] = await Promise.all([
              SlotNextSpinModal.findOne(
                { tranId: referenceId, bet: true },
                { _id: 1 }
              ).lean(),

              SlotNextSpinModal.findOne(
                {
                  [tranIdField]: transferId,
                  ...queryStatus,
                },
                { _id: 1 }
              ).lean(),
            ]);
            if (!existingBet) {
              console.log(
                "[NEXTSPIN] Bet not found for settlement:",
                referenceId
              );
              return res.status(200).json({
                merchantCode: nextSpinMC,
                msg: "Bet not found",
                code: 109,
                serialNo: serialNo || "",
              });
            }

            if (existingTransaction) {
              console.log("[NEXTSPIN] Settlement already done:", transferId);
              return res.status(200).json({
                merchantCode: nextSpinMC,
                msg: "Transaction Settled",
                code: 109,
                serialNo: serialNo || "",
              });
            }

            const settlementData = {
              [statusField]: true,
              [tranIdField]: transferId,
              [amountField]: roundedAmount,
            };

            if (specialGame?.count && specialGame.sequence !== undefined) {
              const { count, sequence } = specialGame;
              const isLastFreeSpin = sequence >= count;
              Object.assign(settlementData, {
                gameCode: gameCode,
                freeSpinCount: count,
                freeSpinSequence: sequence,
                freeSpinOngoing: !isLastFreeSpin,
              });
            }

            const updatePromises = [
              User.findOneAndUpdate(
                { _id: currentUser._id },
                { $inc: { wallet: roundedAmount } },
                { new: true, projection: { wallet: 1 } }
              ).lean(),
              SlotNextSpinModal.findOneAndUpdate(
                { tranId: referenceId },
                { $set: settlementData },
                { upsert: true }
              ),
            ];

            if (
              specialGame &&
              specialGame.sequence >= specialGame.count &&
              gameCode
            ) {
              updatePromises.push(
                SlotNextSpinModal.updateMany(
                  {
                    username: acctId,
                    gameCode: gameCode,
                    freeSpinOngoing: true,
                  },
                  { $set: { freeSpinOngoing: false } }
                )
              );
            }

            const [updatedUserBalance] = await Promise.all(updatePromises);

            return res
              .status(200)
              .json(createSuccessResponse(updatedUserBalance.wallet));
          }

          default:
            return res.status(200).json({
              merchantCode: nextSpinMC,
              msg: "Invalid Transfer Type",
              code: 106,
              serialNo: serialNo || "",
            });
        }
      }

      default:
        return res.status(200).json({
          merchantCode: nextSpinMC,
          msg: "Invalid API Request",
          code: 106,
          serialNo: serialNo || "",
        });
    }
  } catch (error) {
    console.error("[NEXTSPIN] System error:", error.message);
    return res.status(200).json({
      merchantCode: nextSpinMC,
      msg: "System Error",
      code: 1,
      serialNo: req.body?.serialNo || "",
    });
  }
});

router.post("/api/nextspin/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotNextSpinModal.find({
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
        console.warn(`NEXTSPIN User not found for gameId: ${gameId}`);
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
        gamename: "NEXTSPIN",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("NEXTSPIN: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "NEXTSPIN: Failed to fetch win/loss report",
        zh: "NEXTSPIN: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/nextspin/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotNextSpinModal.find({
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
          gamename: "NEXTSPIN",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("NEXTSPIN: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "NEXTSPIN: Failed to fetch win/loss report",
          zh: "NEXTSPIN: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/nextspin/:userId/gamedata",
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

          if (slotGames["NEXTSPIN"]) {
            totalTurnover += slotGames["NEXTSPIN"].turnover || 0;
            totalWinLoss += slotGames["NEXTSPIN"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "NEXTSPIN",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("NEXTSPIN: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "NEXTSPIN: Failed to fetch win/loss report",
          zh: "NEXTSPIN: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/nextspin/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotNextSpinModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
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

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "NEXTSPIN",
          gamecategory: "Slot Games",
          totalturnover: totalTurnover,
          totalwinloss: totalWinLoss,
        },
      });
    } catch (error) {
      console.error("NEXTSPIN: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "NEXTSPIN: Failed to fetch win/loss report",
          zh: "NEXTSPIN: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/nextspin/kioskreport",
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

          if (liveCasino["NEXTSPIN"]) {
            totalTurnover += Number(liveCasino["NEXTSPIN"].turnover || 0);
            totalWinLoss += Number(liveCasino["NEXTSPIN"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "NEXTSPIN",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("NEXTSPIN: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "NEXTSPIN: Failed to fetch win/loss report",
          zh: "NEXTSPIN: 获取盈亏报告失败",
        },
      });
    }
  }
);

module.exports = router;
