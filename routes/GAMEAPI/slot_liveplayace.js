const express = require("express");
const router = express.Router();
const axios = require("axios");

const CryptoJS = require("crypto-js");
const crypto = require("crypto");
const { authenticateToken } = require("../../auth/auth");
const { authenticateAdminToken } = require("../../auth/adminAuth");
const {
  User,
  adminUserWalletLog,
  GameDataLog,
} = require("../../models/users.model");
const { adminUser, adminLog } = require("../../models/adminuser.model");
const SlotLiveAGModal = require("../../models/slot_live_ag.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const qs = require("querystring");
const GameWalletLog = require("../../models/gamewalletlog.model");
const xml2js = require("xml2js");
const parser = new xml2js.Parser({ explicitArray: false });
const Decimal = require("decimal.js");
const GameAsiaGamingGameModal = require("../../models/slot_asiagamingDatabase.model");

require("dotenv").config();

const agAgentCode = "NB6_AGIN";
const agMD = process.env.AG_MD;
const agDES = process.env.AG_DES;
const webURL = "www.oc7.me";
const agAPIURL = "https://gi.oc7.me";
const agAPIURL2 = "https://gci.oc7.me";
const agCreateSessionAPIURL =
  "https://swapi.playacegame.com/resource/player-tickets.ucs";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function trimAfterUnderscore(input) {
  const underscoreIndex = input.indexOf("_");

  if (underscoreIndex === -1) {
    return input;
  }

  return input.substring(0, underscoreIndex);
}

function extractPlayerName(playname, agentCode) {
  if (playname.startsWith(agentCode)) {
    return playname.substring(agentCode.length);
  }

  return playname;
}

function generateRandomPassword() {
  const randomNumber = crypto.randomInt(1000, 10000);

  return `OC7${randomNumber}`;
}

function encryptParams(params) {
  const encrypted = CryptoJS.DES.encrypt(
    params,
    CryptoJS.enc.Utf8.parse(agDES),
    {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }
  );
  return CryptoJS.enc.Base64.stringify(encrypted.ciphertext);
}

function generateMD5Key(encryptedParams) {
  return CryptoJS.MD5(encryptedParams + agMD).toString();
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

router.post("/api/asiagaming/getgamelist", async (req, res) => {
  try {
    // Fetch all games from the database (or add filters as needed)
    const games = await GameAsiaGamingGameModal.find({}).sort({
      hot: -1,
      createdAt: 1,
    });

    if (!games || games.length === 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "No games found. Please try again later.",
          zh: "未找到游戏。请稍后再试。",
          ms: "Tiada permainan ditemui. Sila cuba lagi kemudian.",
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
    console.log("ASIA GAMING error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "ASIA GAMING: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "ASIA GAMING: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "ASIA GAMING: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

async function registerAGUser(username) {
  try {
    const registerPassword = generateRandomPassword();

    const rawParams = `cagent=${agAgentCode}/\\\\/loginname=${username}/\\\\/method=lg/\\\\/actype=1/\\\\/password=${registerPassword}/\\\\/oddtype=A/\\\\/cur=MYR`;

    const encryptedParams = encryptParams(rawParams);
    const key = generateMD5Key(encryptedParams);

    const apiUrl = `${agAPIURL}/doBusiness.do?params=${encodeURIComponent(
      encryptedParams
    )}&key=${key}`;

    const response = await axios.get(apiUrl);

    const xmlResult = response.data;

    const infoMatch = xmlResult.match(/info="([^"]+)"/);
    const msgMatch = xmlResult.match(/msg="([^"]*)"/);

    const info = infoMatch ? infoMatch[1] : null;
    const msg = msgMatch ? msgMatch[1] : null;

    if (info && info !== 0) {
      await User.findOneAndUpdate(
        { customerId: username },
        {
          $set: {
            AsiaGamingGamePW: registerPassword,
          },
        }
      );
      return { success: true };
    }

    return {
      success: false,
      data: `Info ${info}, Msg ${msg}`,
    };
  } catch (error) {
    console.error("AG error in creating member:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function createAGPlayerSession(username, token, wallet) {
  try {
    // Build the API request URL
    const requestURL = `${agCreateSessionAPIURL}?productid=NB6&username=${username}&session_token=${token}&credit=${roundToTwoDecimals(
      wallet
    )}`;

    // Make the API request
    const response = await axios.get(requestURL);

    const xmlData = response.data;
    const responseCodeMatch = xmlData.match(
      /<ResponseCode>([^<]+)<\/ResponseCode>/
    );
    const messageMatch = xmlData.match(/<message>([^<]+)<\/message>/);

    const jsonResponse = {
      responseCode: responseCodeMatch ? responseCodeMatch[1] : null,
      responseMessage: messageMatch ? messageMatch[1] : null,
    };

    if (jsonResponse.responseCode === "OK") {
      return { success: true };
    }

    return {
      success: false,
      data: jsonResponse,
    };
  } catch (error) {
    console.error("AG error in creating session:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

router.post(
  "/api/asiagaming/launchGame",
  authenticateToken,
  async (req, res) => {
    try {
      const { gameLang, gameCode, clientPlatform } = req.body;

      const userId = req.user.userId;
      let user = await User.findById(userId);

      if (user.gameLock.asiagaming.lock) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Your game access has been locked. Please contact customer support for further assistance.",
            zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
            ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
          },
        });
      }

      if (!user.AsiaGamingGamePW) {
        const registration = await registerAGUser(user.customerId);

        if (!registration.success) {
          console.log(
            "ASIA_GAMING registration failed:",
            registration.data || registration.error
          );

          if (registration.maintenance) {
            return res.status(200).json({
              success: false,
              message: {
                en: "Game under maintenance. Please try again later.",
                zh: "游戏正在维护中，请稍后再试。",
                ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
              },
            });
          }

          return res.status(200).json({
            success: false,
            message: {
              en: "ASIA GAMING: Game launch failed. Please try again or customer service for assistance.",
              zh: "ASIA GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
              ms: "ASIA GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            },
          });
        }

        user = await User.findById(userId);
      }
      let token = `${user.username}:${generateRandomCode()}`;

      const createSession = await createAGPlayerSession(
        user.customerId,
        token,
        user.wallet
      );

      if (!createSession.success) {
        console.log(
          "ASIA_GAMING create session failed:",
          createSession.data || createSession.error
        );

        return res.status(200).json({
          success: false,
          message: {
            en: "ASIA GAMING: Game launch failed. Please try again or customer service for assistance.",
            zh: "ASIA GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "ASIA GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }

      let lang = "3";

      if (gameLang === "en") {
        lang = "3";
      } else if (gameLang === "zh") {
        lang = "1";
      } else if (gameLang === "ms") {
        lang = "11";
      }

      let platform = "n";
      if (clientPlatform === "web") {
        platform = "n";
      } else if (clientPlatform === "mobile") {
        platform = "y";
      }

      const sequence =
        Date.now().toString() + Math.floor(Math.random() * 1000).toString();
      const sid = `${agAgentCode}${sequence}`;

      const rawParams = `cagent=${agAgentCode}/\\\\/loginname=${user.customerId}/\\\\/actype=1/\\\\/password=${user.AsiaGamingGamePW}/\\\\/dm=${webURL}/\\\\/sid=${sid}/\\\\/lang=${lang}/\\\\/gameType=${gameCode}/\\\\/oddtype=A/\\\\/session_token=${token}/\\\\/cur=MYR/\\\\/mh5=${platform}`;

      const encryptedParams = encryptParams(rawParams);
      const key = generateMD5Key(encryptedParams);

      const gameUrl = `${agAPIURL2}/forwardGame.do?params=${encodeURIComponent(
        encryptedParams
      )}&key=${key}`;

      const updatedUser = await User.findOneAndUpdate(
        { _id: user._id },
        {
          AsiaGamingGameToken: token,
        },
        { new: true }
      );

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "PLAYACE"
      );

      // Return the game URL
      return res.status(200).json({
        success: true,
        gameLobby: gameUrl,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
        },
      });
    } catch (error) {
      console.log("ASIA GAMING error in launching game", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "ASIA GAMING: Game launch failed. Please try again or customer service for assistance.",
          zh: "ASIA GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "ASIA GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/api/asiagaminglive/launchGame",
  authenticateToken,
  async (req, res) => {
    try {
      const { gameLang, clientPlatform } = req.body;

      const userId = req.user.userId;
      let user = await User.findById(userId);

      if (user.gameLock.asiagaming.lock) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Your game access has been locked. Please contact customer support for further assistance.",
            zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
            ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
          },
        });
      }

      if (!user.AsiaGamingGamePW) {
        const registration = await registerAGUser(user.customerId);

        if (!registration.success) {
          console.log(
            "ASIA_GAMING registration failed:",
            registration.data || registration.error
          );

          if (registration.maintenance) {
            return res.status(200).json({
              success: false,
              message: {
                en: "Game under maintenance. Please try again later.",
                zh: "游戏正在维护中，请稍后再试。",
                ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
              },
            });
          }

          return res.status(200).json({
            success: false,
            message: {
              en: "ASIA GAMING: Game launch failed. Please try again or customer service for assistance.",
              zh: "ASIA GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
              ms: "ASIA GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            },
          });
        }

        user = await User.findById(userId);
      }
      let token = `${user.username}:${generateRandomCode()}`;

      const createSession = await createAGPlayerSession(
        user.customerId,
        token,
        user.wallet
      );

      if (!createSession.success) {
        console.log(
          "ASIA_GAMING create session failed:",
          createSession.data || createSession.error
        );

        return res.status(200).json({
          success: false,
          message: {
            en: "ASIA GAMING: Game launch failed. Please try again or customer service for assistance.",
            zh: "ASIA GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "ASIA GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }

      let lang = "3";

      if (gameLang === "en") {
        lang = "3";
      } else if (gameLang === "zh") {
        lang = "1";
      } else if (gameLang === "ms") {
        lang = "11";
      }

      let platform = "n";
      if (clientPlatform === "web") {
        platform = "n";
      } else if (clientPlatform === "mobile") {
        platform = "y";
      }

      const sequence =
        Date.now().toString() + Math.floor(Math.random() * 1000).toString();
      const sid = `${agAgentCode}${sequence}`;

      const rawParams = `cagent=${agAgentCode}/\\\\/loginname=${user.customerId}/\\\\/actype=1/\\\\/password=${user.AsiaGamingGamePW}/\\\\/dm=${webURL}/\\\\/sid=${sid}/\\\\/lang=${lang}/\\\\/gameType=0/\\\\/oddtype=A/\\\\/cur=MYR
        /\\\\/mh5=${platform}`;

      const encryptedParams = encryptParams(rawParams);
      const key = generateMD5Key(encryptedParams);

      const gameUrl = `${agAPIURL2}/forwardGame.do?params=${encodeURIComponent(
        encryptedParams
      )}&key=${key}`;

      const updatedUser = await User.findOneAndUpdate(
        { _id: user._id },
        {
          AsiaGamingGameToken: token,
        },
        { new: true }
      );

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "PLAYACE"
      );

      // Return the game URL
      return res.status(200).json({
        success: true,
        gameLobby: gameUrl,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
        },
      });
    } catch (error) {
      console.log("ASIA GAMING error in launching game", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "ASIA GAMING: Game launch failed. Please try again or customer service for assistance.",
          zh: "ASIA GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "ASIA GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
  }
);

// router.post("/api/liveasiagaming", async (req, res) => {
//   try {
//     // Get the raw XML body
//     let xmlData = "";

//     // Collect data chunks
//     req.on("data", (chunk) => {
//       xmlData += chunk.toString();
//     });

//     // Process the complete request
//     req.on("end", async () => {
//       try {
//         // Parse the XML to JSON
//         const result = await parser.parseStringPromise(xmlData);

//         const trimmedCode = trimAfterUnderscore(agAgentCode);

//         if (result.Data.Record.agentCode !== trimmedCode) {
//           const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
//           <TransferResponse><ResponseCode>INVALID_DATA</ResponseCode></TransferResponse>`;

//           res.set("Content-Type", "text/xml");
//           res.set("X-Integration-API-host", "api-1.operator.com");
//           return res.status(400).send(responseXml);
//         }

//         const username = extractPlayerName(
//           result.Data.Record.playname,
//           trimmedCode
//         );

//         const currentUser = await User.findOne({ username });

//         if (
//           !currentUser ||
//           currentUser.AsiaGamingGameToken !== result.Data.Record.sessionToken
//         ) {
//           const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
//           <TransferResponse><ResponseCode>INCORRECT_SESSION_TYPE</ResponseCode></TransferResponse>`;

//           res.set("Content-Type", "text/xml");
//           res.set("X-Integration-API-host", "api-1.operator.com");
//           return res.status(403).send(responseXml);
//         }

//         const transactionType = result.Data.Record.transactionType || "";

//         if (transactionType === "BET") {
//           const transferAmount = new Decimal(result.Data.Record.value)
//             .toDecimalPlaces(4)
//             .toNumber();

//           if (currentUser.gameLock.asiagaming.lock) {
//             const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
//             <TransferResponse><ResponseCode>ERROR</ResponseCode></TransferResponse>`;

//             res.set("Content-Type", "text/xml");
//             res.set("X-Integration-API-host", "api-1.operator.com");
//             return res.status(500).send(responseXml);
//           }

//           const existingBet = await SlotLiveAGModal.findOne({
//             betId: result.Data.Record.transactionID,
//             bet: true,
//           });

//           if (existingBet) {
//             const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
//             <TransferResponse><ResponseCode>OK</ResponseCode><Balance>${roundToTwoDecimals(
//               currentUser.wallet
//             )}</Balance></TransferResponse>`;

//             // Set headers as specified in the documentation
//             res.set("Content-Type", "text/xml");
//             res.set("X-Integration-API-host", "api-1.operator.com");
//             return res.status(200).send(responseXml);
//           }

//           const updatedUserBalance = await User.findOneAndUpdate(
//             {
//               _id: currentUser._id,
//               wallet: { $gte: transferAmount },
//             },
//             { $inc: { wallet: -transferAmount } },
//             { new: true }
//           );

//           if (!updatedUserBalance) {
//             const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
//             <TransferResponse><ResponseCode>INSUFFICIENT_FUNDS</ResponseCode></TransferResponse>`;

//             res.set("Content-Type", "text/xml");
//             res.set("X-Integration-API-host", "api-1.operator.com");
//             return res.status(409).send(responseXml);
//           }

//           await SlotLiveAGModal.create({
//             username: currentUser.username,
//             betId: result.Data.Record.transactionID,
//             bet: true,
//             betamount: transferAmount,
//           });

//           const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
//           <TransferResponse><ResponseCode>OK</ResponseCode><Balance>${roundToTwoDecimals(
//             updatedUserBalance.wallet
//           )}</Balance></TransferResponse>`;

//           // Set headers as specified in the documentation
//           res.set("Content-Type", "text/xml");
//           res.set("X-Integration-API-host", "api-1.operator.com");
//           return res.status(200).send(responseXml);
//         } else if (transactionType === "WIN" || transactionType === "LOSE") {
//           const netAmount = new Decimal(result.Data.Record.netAmount)
//             .toDecimalPlaces(4)
//             .toNumber();

//           const betAmount = new Decimal(result.Data.Record.validBetAmount)
//             .toDecimalPlaces(4)
//             .toNumber();

//           const TotalTrfAmt = netAmount + betAmount;

//           const winAmount = new Decimal(TotalTrfAmt)
//             .toDecimalPlaces(4)
//             .toNumber();

//           const existingBet = await SlotLiveAGModal.findOne({
//             betId: result.Data.Record.transactionID,
//           });

//           if (!existingBet) {
//             const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
//             <TransferResponse><ResponseCode>INVALID_TRANSACTION</ResponseCode></TransferResponse>`;

//             res.set("Content-Type", "text/xml");
//             res.set("X-Integration-API-host", "api-1.operator.com");
//             return res.status(404).send(responseXml);
//           }

//           const existingTransaction = await SlotLiveAGModal.findOne({
//             settleId: result.Data.Record.billNo,
//             $or: [{ settle: true }, { cancel: true }],
//           });

//           if (existingTransaction) {
//             const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
//             <TransferResponse><ResponseCode>OK</ResponseCode><Balance>${roundToTwoDecimals(
//               currentUser.wallet
//             )}</Balance></TransferResponse>`;

//             res.set("Content-Type", "text/xml");
//             res.set("X-Integration-API-host", "api-1.operator.com");
//             return res.status(200).send(responseXml);
//           }

//           const updatedUserBalance = await User.findByIdAndUpdate(
//             currentUser._id,
//             { $inc: { wallet: winAmount } },
//             { new: true }
//           );

//           const existingBetRecord = await SlotLiveAGModal.findOne({
//             betId: result.Data.Record.transactionID,
//           });

//           if (existingBetRecord && !existingBetRecord.settleId) {
//             // Update existing record if it doesn't have a settleId
//             await SlotLiveAGModal.findOneAndUpdate(
//               {
//                 betId: result.Data.Record.transactionID,
//               },
//               {
//                 $set: {
//                   settleId: result.Data.Record.billNo,
//                   settle: true,
//                   settleamount: winAmount,
//                   betamount: betAmount,
//                 },
//               }
//             );
//           } else {
//             // Create a new record if the existing record already has a settleId
//             await SlotLiveAGModal.create({
//               username: currentUser.username,
//               betId: result.Data.Record.transactionID,
//               settleId: result.Data.Record.billNo,
//               settle: true,
//               settleamount: winAmount,
//               bet: true,
//               betamount: betAmount,
//             });
//           }

//           const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
//           <TransferResponse><ResponseCode>OK</ResponseCode><Balance>${roundToTwoDecimals(
//             updatedUserBalance.wallet
//           )}</Balance></TransferResponse>`;

//           res.set("Content-Type", "text/xml");
//           res.set("X-Integration-API-host", "api-1.operator.com");
//           return res.status(200).send(responseXml);
//         } else if (transactionType === "REFUND") {
//           const transferAmount = new Decimal(result.Data.Record.value)
//             .toDecimalPlaces(4)
//             .toNumber();

//           const existingBet = await SlotLiveAGModal.findOne({
//             betId: result.Data.Record.transactionID,
//           });

//           if (!existingBet) {
//             const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
//             <TransferResponse><ResponseCode>INVALID_TRANSACTION</ResponseCode></TransferResponse>`;

//             res.set("Content-Type", "text/xml");
//             res.set("X-Integration-API-host", "api-1.operator.com");
//             return res.status(404).send(responseXml);
//           }

//           if (result.Data.Record.billNo) {
//             const existingTransaction = await SlotLiveAGModal.findOne({
//               settleId: result.Data.Record.billNo,
//               cancel: true,
//             });

//             if (existingTransaction) {
//               const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
//               <TransferResponse><ResponseCode>OK</ResponseCode><Balance>${roundToTwoDecimals(
//                 currentUser.wallet
//               )}</Balance></TransferResponse>`;

//               res.set("Content-Type", "text/xml");
//               res.set("X-Integration-API-host", "api-1.operator.com");
//               return res.status(200).send(responseXml);
//             }

//             const updatedUserBalance = await User.findOneAndUpdate(
//               {
//                 _id: currentUser._id,
//                 wallet: { $gte: transferAmount },
//               },
//               { $inc: { wallet: -transferAmount } },
//               { new: true }
//             );

//             if (!updatedUserBalance) {
//               const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
//               <TransferResponse><ResponseCode>INSUFFICIENT_FUNDS</ResponseCode></TransferResponse>`;

//               res.set("Content-Type", "text/xml");
//               res.set("X-Integration-API-host", "api-1.operator.com");
//               return res.status(409).send(responseXml);
//             }

//             await SlotLiveAGModal.findOneAndUpdate(
//               { settleId: result.Data.Record.billNo },
//               {
//                 $set: {
//                   cancel: true,
//                 },
//               },
//               { upsert: true, new: true }
//             );

//             const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
//           <TransferResponse><ResponseCode>OK</ResponseCode><Balance>${roundToTwoDecimals(
//             updatedUserBalance.wallet
//           )}</Balance></TransferResponse>`;

//             res.set("Content-Type", "text/xml");
//             res.set("X-Integration-API-host", "api-1.operator.com");
//             return res.status(200).send(responseXml);
//           } else {
//             const existingTransaction = await SlotLiveAGModal.findOne({
//               betId: result.Data.Record.transactionID,
//               cancel: true,
//             });

//             if (existingTransaction) {
//               const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
//               <TransferResponse><ResponseCode>OK</ResponseCode><Balance>${roundToTwoDecimals(
//                 currentUser.wallet
//               )}</Balance></TransferResponse>`;

//               res.set("Content-Type", "text/xml");
//               res.set("X-Integration-API-host", "api-1.operator.com");
//               return res.status(200).send(responseXml);
//             }

//             const updatedUserBalance = await User.findByIdAndUpdate(
//               currentUser._id,
//               { $inc: { wallet: transferAmount } },
//               { new: true }
//             );

//             await SlotLiveAGModal.findOneAndUpdate(
//               { betId: result.Data.Record.transactionID },
//               {
//                 $set: {
//                   cancel: true,
//                 },
//               },
//               { upsert: true, new: true }
//             );

//             const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
//             <TransferResponse><ResponseCode>OK</ResponseCode><Balance>${roundToTwoDecimals(
//               updatedUserBalance.wallet
//             )}</Balance></TransferResponse>`;

//             res.set("Content-Type", "text/xml");
//             res.set("X-Integration-API-host", "api-1.operator.com");
//             return res.status(200).send(responseXml);
//           }
//         } else {
//           console.error("Error parsing XML:", parseError);
//           const errorXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
//   <Response><ResponseCode>INVALID_DATA</ResponseCode></Response>`;

//           res.set("Content-Type", "text/xml");
//           res.set("X-Integration-API-host", "api-1.operator.com");
//           res.status(400).send(errorXml);
//         }
//       } catch (parseError) {
//         console.error("Error parsing XML:", parseError);
//         const errorXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
// <Response><ResponseCode>INVALID_DATA</ResponseCode></Response>`;

//         res.set("Content-Type", "text/xml");
//         res.set("X-Integration-API-host", "api-1.operator.com");
//         res.status(400).send(errorXml);
//       }
//     });
//   } catch (error) {
//     console.error("LiveAsia Gaming API Error:", error);
//     const errorXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
// <Response><ResponseCode>ERROR</ResponseCode></Response>`;

//     res.set("Content-Type", "text/xml");
//     res.set("X-Integration-API-host", "api-1.operator.com");
//     res.status(500).send(errorXml);
//   }
// });

router.post("/api/eventasiagaming", async (req, res) => {
  // Helper function for standard responses
  const sendResponse = (status, responseCode, balance = null) => {
    const xmlContent =
      balance !== null
        ? `<TransferResponse><ResponseCode>${responseCode}</ResponseCode><Balance>${balance}</Balance></TransferResponse>`
        : `<TransferResponse><ResponseCode>${responseCode}</ResponseCode></TransferResponse>`;

    const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${xmlContent}`;

    res.set("Content-Type", "text/xml");
    res.set("X-Integration-API-host", "api-1.operator.com");
    return res.status(status).send(responseXml);
  };

  try {
    // Get the raw XML body
    let xmlData = "";

    req.on("data", (chunk) => {
      xmlData += chunk.toString();
    });

    req.on("end", async () => {
      try {
        // Parse the XML to JSON
        const result = await parser.parseStringPromise(xmlData);
        const record = result.Data.Record;

        const trimmedCode = trimAfterUnderscore(agAgentCode);

        const username = extractPlayerName(record.playname, trimmedCode);

        // Get user in one efficient query with projection
        const currentUser = await User.findOne(
          {
            customerId: username,
            AsiaGamingGameToken: record.sessionToken,
          },
          {
            _id: 1,
            wallet: 1,
            username: 1,
            "gameLock.asiagaming.lock": 1,
            AsiaGamingGameToken: 1,
            customerId: 1,
          }
        );

        if (!currentUser) {
          return sendResponse(403, "INCORRECT_SESSION_TYPE");
        }

        const transactionType = record.transactionType || "";

        // Optimized BET transaction handling
        if (transactionType === "WITHDRAW") {
          const transferAmount = new Decimal(record.amount || 0)
            .toDecimalPlaces(4)
            .toNumber();

          if (currentUser.gameLock.asiagaming.lock) {
            return sendResponse(500, "ERROR");
          }

          // Check for existing bet with projection
          const existingBet = await SlotLiveAGModal.findOne(
            { betId: record.transactionID, bet: true },
            { _id: 1 }
          );

          if (existingBet) {
            return sendResponse(
              200,
              "OK",
              roundToTwoDecimals(currentUser.wallet)
            );
          }

          // Use bulkWrite for better performance
          const bulkOps = [
            {
              updateOne: {
                filter: {
                  _id: currentUser._id,
                  wallet: { $gte: transferAmount },
                },
                update: { $inc: { wallet: -transferAmount } },
                upsert: false,
              },
            },
          ];

          const result = await User.bulkWrite(bulkOps);

          // Check if update was successful (matched count > 0)
          if (result.matchedCount === 0) {
            return sendResponse(409, "INSUFFICIENT_FUNDS");
          }

          // Create bet record and get updated user in parallel
          const [newBet, updatedUser] = await Promise.all([
            SlotLiveAGModal.create({
              username: currentUser.username,
              betId: record.transactionID,
              bet: true,
              gametype: "EVENT",
              betamount: transferAmount,
              event: true,
            }),
            User.findById(currentUser._id, { wallet: 1 }),
          ]);

          return sendResponse(
            200,
            "OK",
            roundToTwoDecimals(updatedUser.wallet)
          );
        }
        // Optimized WIN/LOSE transaction handling
        else if (transactionType === "DEPOSIT") {
          const winAmount = new Decimal(record.amount || 0)
            .toDecimalPlaces(4)
            .toNumber();

          // Run these checks in parallel
          const [existingBet, existingTransaction] = await Promise.all([
            SlotLiveAGModal.findOne(
              { betId: record.transactionID },
              { settleId: 1, _id: 1 }
            ),
            SlotLiveAGModal.findOne(
              {
                settleId: record.transactionID,
                $or: [{ settle: true }, { cancel: true }],
              },
              { _id: 1 }
            ),
          ]);

          if (!existingBet) {
            return sendResponse(404, "INVALID_TRANSACTION");
          }

          if (existingTransaction) {
            return sendResponse(
              200,
              "OK",
              roundToTwoDecimals(currentUser.wallet)
            );
          }

          // Update user balance first
          const updatedUser = await User.findByIdAndUpdate(
            currentUser._id,
            { $inc: { wallet: winAmount } },
            { new: true, projection: { wallet: 1 } }
          );

          // Then update or create bet record as needed
          if (!existingBet.settleId) {
            await SlotLiveAGModal.updateOne(
              { betId: record.transactionID },
              {
                $set: {
                  settleId: record.eventID,
                  settle: true,
                  settleamount: winAmount,
                },
              }
            );
          } else {
            await SlotLiveAGModal.create({
              username: currentUser.username,
              betId: record.transactionID,
              settleId: record.eventID,
              settle: true,
              settleamount: winAmount,
              bet: true,
              gametype: "EVENT",
              event: true,
              betamount: 0,
            });
          }

          return sendResponse(
            200,
            "OK",
            roundToTwoDecimals(updatedUser.wallet)
          );
        }
        // Optimized REFUND transaction handling
        else if (transactionType === "ROLLBACK") {
          const transferAmount = new Decimal(record.amount || 0)
            .toDecimalPlaces(4)
            .toNumber();

          const existingBet = await SlotLiveAGModal.findOne(
            { betId: record.transactionID },
            { _id: 1 }
          );

          if (!existingBet) {
            return sendResponse(404, "INVALID_TRANSACTION");
          }

          const existingTransaction = await SlotLiveAGModal.findOne(
            { settleId: record.transactionID, cancel: true },
            { _id: 1 }
          );

          if (existingTransaction) {
            return sendResponse(
              200,
              "OK",
              roundToTwoDecimals(currentUser.wallet)
            );
          }

          // Use findOneAndUpdate with conditions to handle insufficient funds
          const updatedUser = await User.findOneAndUpdate(
            {
              _id: currentUser._id,
            },
            { $inc: { wallet: transferAmount } },
            { new: true, projection: { wallet: 1 } }
          );

          await SlotLiveAGModal.updateOne(
            { settleId: record.transactionID },
            { $set: { cancel: true } },
            { upsert: true }
          );

          return sendResponse(
            200,
            "OK",
            roundToTwoDecimals(updatedUser.wallet)
          );
        } else {
          return sendResponse(400, "INVALID_DATA");
        }
      } catch (parseError) {
        console.error("Error parsing XML:", parseError);
        return sendResponse(400, "INVALID_DATA");
      }
    });
  } catch (error) {
    console.error("LiveAsia Gaming API Error:", error);
    return sendResponse(500, "ERROR");
  }
});

router.post("/api/liveasiagaming", async (req, res) => {
  // Helper function for standard responses
  const sendResponse = (status, responseCode, balance = null) => {
    const xmlContent =
      balance !== null
        ? `<TransferResponse><ResponseCode>${responseCode}</ResponseCode><Balance>${balance}</Balance></TransferResponse>`
        : `<TransferResponse><ResponseCode>${responseCode}</ResponseCode></TransferResponse>`;

    const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${xmlContent}`;

    res.set("Content-Type", "text/xml");
    res.set("X-Integration-API-host", "api-1.operator.com");
    return res.status(status).send(responseXml);
  };

  try {
    // Get the raw XML body
    let xmlData = "";

    req.on("data", (chunk) => {
      xmlData += chunk.toString();
    });

    req.on("end", async () => {
      try {
        // Parse the XML to JSON
        const result = await parser.parseStringPromise(xmlData);
        const record = result.Data.Record;

        const trimmedCode = trimAfterUnderscore(agAgentCode);

        // Validate agent code
        if (record.agentCode !== trimmedCode) {
          return sendResponse(400, "INVALID_DATA");
        }

        const username = extractPlayerName(record.playname, trimmedCode);

        // Get user in one efficient query with projection
        const currentUser = await User.findOne(
          {
            customerId: username,
            AsiaGamingGameToken: record.sessionToken,
          },
          {
            _id: 1,
            wallet: 1,
            username: 1,
            "gameLock.asiagaming.lock": 1,
            AsiaGamingGameToken: 1,
            customerId: 1,
          }
        );

        if (!currentUser) {
          return sendResponse(403, "INCORRECT_SESSION_TYPE");
        }

        const transactionType = record.transactionType || "";

        // Optimized BET transaction handling
        if (transactionType === "BET") {
          const transferAmount = new Decimal(record.value || 0)
            .toDecimalPlaces(4)
            .toNumber();

          if (currentUser.gameLock.asiagaming.lock) {
            return sendResponse(500, "ERROR");
          }

          // Check for existing bet with projection
          const existingBet = await SlotLiveAGModal.findOne(
            { betId: record.transactionID, bet: true },
            { _id: 1 }
          );

          if (existingBet) {
            return sendResponse(
              200,
              "OK",
              roundToTwoDecimals(currentUser.wallet)
            );
          }

          // Use bulkWrite for better performance
          const bulkOps = [
            {
              updateOne: {
                filter: {
                  _id: currentUser._id,
                  wallet: { $gte: transferAmount },
                },
                update: { $inc: { wallet: -transferAmount } },
                upsert: false,
              },
            },
          ];

          const result = await User.bulkWrite(bulkOps);

          // Check if update was successful (matched count > 0)
          if (result.matchedCount === 0) {
            return sendResponse(409, "INSUFFICIENT_FUNDS");
          }

          // Create bet record and get updated user in parallel
          const [newBet, updatedUser] = await Promise.all([
            SlotLiveAGModal.create({
              username: currentUser.username,
              betId: record.transactionID,
              bet: true,
              gametype: "LIVE",
              betamount: transferAmount,
              roundId: record.gameCode || "",
            }),
            User.findById(currentUser._id, { wallet: 1 }),
          ]);

          return sendResponse(
            200,
            "OK",
            roundToTwoDecimals(updatedUser.wallet)
          );
        }
        // Optimized WIN/LOSE transaction handling
        else if (transactionType === "WIN" || transactionType === "LOSE") {
          const netAmount = new Decimal(record.netAmount || 0)
            .toDecimalPlaces(4)
            .toNumber();
          const betAmount = new Decimal(record.validBetAmount || 0)
            .toDecimalPlaces(4)
            .toNumber();
          const winAmount = new Decimal(netAmount + betAmount)
            .toDecimalPlaces(4)
            .toNumber();

          // Run these checks in parallel
          const [existingBet, existingTransaction] = await Promise.all([
            SlotLiveAGModal.findOne(
              { betId: record.transactionID },
              { settleId: 1 }
            ),
            SlotLiveAGModal.findOne(
              {
                settleId: record.billNo,
                $or: [{ settle: true }, { cancel: true }],
              },
              { _id: 1 }
            ),
          ]);

          if (!existingBet) {
            return sendResponse(404, "INVALID_TRANSACTION");
          }

          if (existingTransaction) {
            return sendResponse(
              200,
              "OK",
              roundToTwoDecimals(currentUser.wallet)
            );
          }

          // Update user balance first
          const updatedUser = await User.findByIdAndUpdate(
            currentUser._id,
            { $inc: { wallet: winAmount } },
            { new: true, projection: { wallet: 1 } }
          );

          // Then update or create bet record as needed
          if (!existingBet.settleId) {
            await SlotLiveAGModal.updateOne(
              { betId: record.transactionID },
              {
                $set: {
                  settleId: record.billNo,
                  settle: true,
                  settleamount: winAmount,
                  betamount: betAmount,
                },
              }
            );
          } else {
            await SlotLiveAGModal.create({
              username: currentUser.username,
              betId: record.transactionID,
              settleId: record.billNo,
              settle: true,
              settleamount: winAmount,
              bet: true,
              gametype: "LIVE",
              betamount: betAmount,
            });
          }

          return sendResponse(
            200,
            "OK",
            roundToTwoDecimals(updatedUser.wallet)
          );
        }
        // Optimized REFUND transaction handling
        else if (transactionType === "REFUND") {
          const transferAmount = new Decimal(record.value || 0)
            .toDecimalPlaces(4)
            .toNumber();

          const existingBet = await SlotLiveAGModal.findOne(
            { betId: record.transactionID },
            { _id: 1 }
          );

          if (!existingBet) {
            return sendResponse(404, "INVALID_TRANSACTION");
          }

          if (record.billNo) {
            const existingTransaction = await SlotLiveAGModal.findOne(
              { settleId: record.billNo, cancel: true },
              { _id: 1 }
            );

            if (existingTransaction) {
              return sendResponse(
                200,
                "OK",
                roundToTwoDecimals(currentUser.wallet)
              );
            }

            // Use findOneAndUpdate with conditions to handle insufficient funds
            const updatedUser = await User.findOneAndUpdate(
              {
                _id: currentUser._id,
                wallet: { $gte: transferAmount },
              },
              { $inc: { wallet: -transferAmount } },
              { new: true, projection: { wallet: 1 } }
            );

            if (!updatedUser) {
              return sendResponse(409, "INSUFFICIENT_FUNDS");
            }

            await SlotLiveAGModal.updateOne(
              { settleId: record.billNo },
              { $set: { cancel: true } },
              { upsert: true }
            );

            return sendResponse(
              200,
              "OK",
              roundToTwoDecimals(updatedUser.wallet)
            );
          } else {
            const existingTransaction = await SlotLiveAGModal.findOne(
              { betId: record.transactionID, cancel: true },
              { _id: 1 }
            );

            if (existingTransaction) {
              return sendResponse(
                200,
                "OK",
                roundToTwoDecimals(currentUser.wallet)
              );
            }

            // Process refund
            const updatedUser = await User.findByIdAndUpdate(
              currentUser._id,
              { $inc: { wallet: transferAmount } },
              { new: true, projection: { wallet: 1 } }
            );

            await SlotLiveAGModal.updateOne(
              { betId: record.transactionID },
              { $set: { cancel: true } },
              { upsert: true }
            );

            return sendResponse(
              200,
              "OK",
              roundToTwoDecimals(updatedUser.wallet)
            );
          }
        } else {
          return sendResponse(400, "INVALID_DATA");
        }
      } catch (parseError) {
        console.error("Error parsing XML:", parseError);
        return sendResponse(400, "INVALID_DATA");
      }
    });
  } catch (error) {
    console.error("LiveAsia Gaming API Error:", error);
    return sendResponse(500, "ERROR");
  }
});

router.post("/api/slotasiagaming", async (req, res) => {
  // Helper function for standard responses
  const sendResponse = (status, responseCode, balance = null) => {
    const xmlContent =
      balance !== null
        ? `<TransferResponse><ResponseCode>${responseCode}</ResponseCode><Balance>${balance}</Balance></TransferResponse>`
        : `<TransferResponse><ResponseCode>${responseCode}</ResponseCode></TransferResponse>`;

    const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${xmlContent}`;

    res.set("Content-Type", "text/xml");
    res.set("X-Integration-API-host", "api-1.operator.com");
    return res.status(status).send(responseXml);
  };

  try {
    // Get the raw XML body
    let xmlData = "";

    req.on("data", (chunk) => {
      xmlData += chunk.toString();
    });

    req.on("end", async () => {
      try {
        // Parse the XML to JSON
        const result = await parser.parseStringPromise(xmlData);

        const record = result.Data.Record;
        if (
          !record.sessionToken ||
          !record.playname ||
          !record.transactionType
        ) {
          return sendResponse(400, "INVALID_DATA");
        }

        const trimmedCode = trimAfterUnderscore(agAgentCode);

        const username = extractPlayerName(record.playname, trimmedCode);

        // Get user in one efficient query with projection
        const currentUser = await User.findOne(
          {
            customerId: username,
            AsiaGamingGameToken: record.sessionToken,
          },
          {
            _id: 1,
            wallet: 1,
            username: 1,
            "gameLock.asiagaming.lock": 1,
            AsiaGamingGameToken: 1,
            customerId: 1,
          }
        );

        if (!currentUser) {
          return sendResponse(403, "INCORRECT_SESSION_TYPE");
        }

        const transactionType = record.transactionType || "";

        if (transactionType === "BALANCE") {
          const newBalance = new Decimal(currentUser.wallet).toDecimalPlaces(4);

          return sendResponse(200, "OK", newBalance.toNumber());
        } else if (transactionType === "WITHDRAW") {
          const transferAmount = new Decimal(record.amount)
            .toDecimalPlaces(4)
            .toNumber();

          if (currentUser.gameLock.asiagaming.lock) {
            return sendResponse(500, "ERROR");
          }

          // Check for existing bet with projection
          const existingBet = await SlotLiveAGModal.findOne(
            { betId: record.transactionID, bet: true },
            { _id: 1 }
          );

          if (existingBet) {
            return sendResponse(
              200,
              "OK",
              roundToTwoDecimals(currentUser.wallet)
            );
          }

          // Use bulkWrite for better performance
          const bulkOps = [
            {
              updateOne: {
                filter: {
                  _id: currentUser._id,
                  wallet: { $gte: transferAmount },
                },
                update: { $inc: { wallet: -transferAmount } },
                upsert: false,
              },
            },
          ];

          const result = await User.bulkWrite(bulkOps);

          // Check if update was successful (matched count > 0)
          if (result.matchedCount === 0) {
            return sendResponse(409, "INSUFFICIENT_FUNDS");
          }

          // Create bet record and get updated user in parallel
          const [newBet, updatedUser] = await Promise.all([
            SlotLiveAGModal.create({
              username: currentUser.username,
              betId: record.transactionID,
              bet: true,
              betamount: transferAmount,
              gametype: "SLOT",
              billNo: record.billNo,
            }),
            User.findById(currentUser._id, { wallet: 1 }),
          ]);

          return sendResponse(
            200,
            "OK",
            roundToTwoDecimals(updatedUser.wallet)
          );
        } else if (transactionType === "DEPOSIT") {
          const winAmount = new Decimal(record.amount || 0)
            .toDecimalPlaces(4)
            .toNumber();

          // Run these checks in parallel
          const [existingBet, existingTransaction] = await Promise.all([
            SlotLiveAGModal.findOne({ billNo: record.billNo }, { settleId: 1 }),
            SlotLiveAGModal.findOne(
              {
                settleId: record.transactionID,
              },
              { _id: 1 }
            ),
          ]);

          if (!existingBet) {
            return sendResponse(404, "INVALID_TRANSACTION");
          }

          if (existingTransaction) {
            return sendResponse(
              200,
              "OK",
              roundToTwoDecimals(currentUser.wallet)
            );
          }

          // Update user balance first
          const updatedUser = await User.findByIdAndUpdate(
            currentUser._id,
            { $inc: { wallet: winAmount } },
            { new: true, projection: { wallet: 1 } }
          );

          const existingBetRecord = await SlotLiveAGModal.findOne({
            billNo: record.billNo,
            settle: true,
          });

          // // Then update or create bet record as needed
          if (!existingBetRecord) {
            await SlotLiveAGModal.findOneAndUpdate(
              { billNo: record.billNo },
              {
                $set: {
                  settle: true,
                  settleamount: winAmount,
                  settleId: record.transactionID,
                },
              },
              { upsert: true, new: true }
            );
          } else {
            const relatedWithdrawTxnId = record.transactionID.endsWith("P")
              ? record.transactionID.slice(0, -1)
              : null;

            await SlotLiveAGModal.findOneAndUpdate(
              { betId: relatedWithdrawTxnId },
              {
                $set: {
                  settle: true,
                  settleamount: winAmount,
                  settleId: record.transactionID,
                },
              },
              { upsert: true, new: true }
            );
          }

          return sendResponse(
            200,
            "OK",
            roundToTwoDecimals(updatedUser.wallet)
          );
        }
        // Optimized REFUND transaction handling
        else if (transactionType === "ROLLBACK") {
          const transferAmount = new Decimal(record.amount || 0)
            .toDecimalPlaces(4)
            .toNumber();

          const existingBet = await SlotLiveAGModal.findOne(
            { billNo: record.billNo },
            { _id: 1 }
          );

          if (!existingBet) {
            return sendResponse(404, "INVALID_TRANSACTION");
          }

          const existingTransaction = await SlotLiveAGModal.findOne(
            { billNo: record.billNo, cancel: true },
            { _id: 1 }
          );

          if (existingTransaction) {
            return sendResponse(
              200,
              "OK",
              roundToTwoDecimals(currentUser.wallet)
            );
          }

          // Use findOneAndUpdate with conditions to handle insufficient funds
          const updatedUser = await User.findOneAndUpdate(
            {
              _id: currentUser._id,
            },
            { $inc: { wallet: transferAmount } },
            { new: true, projection: { wallet: 1 } }
          );

          await SlotLiveAGModal.updateOne(
            { billNo: record.billNo },
            { $set: { cancel: true } },
            { upsert: true }
          );

          return sendResponse(
            200,
            "OK",
            roundToTwoDecimals(updatedUser.wallet)
          );
        } else {
          return sendResponse(400, "INVALID_DATA");
        }
      } catch (parseError) {
        console.error("Error parsing XML:", parseError);
        return sendResponse(400, "INVALID_DATA");
      }
    });
  } catch (error) {
    console.error("LiveAsia Gaming API Error:", error);
    return sendResponse(500, "ERROR");
  }
});

// ----------------
router.post("/api/agslot/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLiveAGModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "SLOT",
      cancel: { $ne: true },
      settle: true,
    });

    // Aggregate turnover and win/loss for each player
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
        gamename: "ASIA GAMING",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("ASIA GAMING: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "ASIA GAMING: Failed to fetch win/loss report",
        zh: "ASIA GAMING: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/agslot/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLiveAGModal.find({
        username: user.username.toLowerCase(),
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
          gamename: "ASIA GAMING",
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
        "ASIA GAMING: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "ASIA GAMING: Failed to fetch win/loss report",
          zh: "ASIA GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/agslot/:userId/gamedata",
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
          const gameCat = Object.fromEntries(gameCategories["Slot Games"]);

          if (gameCat["ASIA GAMING"]) {
            totalTurnover += gameCat["ASIA GAMING"].turnover || 0;
            totalWinLoss += gameCat["ASIA GAMING"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "ASIA GAMING",
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
        "ASIA GAMING: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "ASIA GAMING: Failed to fetch win/loss report",
          zh: "ASIA GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/agslot/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLiveAGModal.find({
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
          gamename: "ASIA GAMING",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("ASIA GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "ASIA GAMING: Failed to fetch win/loss report",
          zh: "ASIA GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/agslot/kioskreport",
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

          if (gameCat["ASIA GAMING"]) {
            totalTurnover += Number(gameCat["ASIA GAMING"].turnover || 0);
            totalWinLoss += Number(gameCat["ASIA GAMING"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "ASIA GAMING",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("ASIA GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "ASIA GAMING: Failed to fetch win/loss report",
          zh: "ASIA GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ----------------
router.post("/api/aglive/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLiveAGModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "LIVE",
      cancel: { $ne: true },
      settle: true,
    });

    // Aggregate turnover and win/loss for each player
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
        gamename: "ASIA GAMING",
        gamecategory: "Live Casino",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("ASIA GAMING: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "ASIA GAMING: Failed to fetch win/loss report",
        zh: "ASIA GAMING: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/aglive/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLiveAGModal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "LIVE",
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
          gamename: "ASIA GAMING",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log(
        "ASIA GAMING: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "ASIA GAMING: Failed to fetch win/loss report",
          zh: "ASIA GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/aglive/:userId/gamedata",
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
          gameCategories["Live Casino"] &&
          gameCategories["Live Casino"] instanceof Map
        ) {
          const gameCat = Object.fromEntries(gameCategories["Live Casino"]);

          if (gameCat["ASIA GAMING"]) {
            totalTurnover += gameCat["ASIA GAMING"].turnover || 0;
            totalWinLoss += gameCat["ASIA GAMING"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "ASIA GAMING",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log(
        "ASIA GAMING: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "ASIA GAMING: Failed to fetch win/loss report",
          zh: "ASIA GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/aglive/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLiveAGModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "LIVE",
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
          gamename: "ASIA GAMING",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("ASIA GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "ASIA GAMING: Failed to fetch win/loss report",
          zh: "ASIA GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/aglive/kioskreport",
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
          gameCategories["Live Casino"] &&
          gameCategories["Live Casino"] instanceof Map
        ) {
          const gameCat = Object.fromEntries(gameCategories["Live Casino"]);

          if (gameCat["ASIA GAMING"]) {
            totalTurnover += Number(gameCat["ASIA GAMING"].turnover || 0);
            totalWinLoss += Number(gameCat["ASIA GAMING"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "ASIA GAMING",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("ASIA GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "ASIA GAMING: Failed to fetch win/loss report",
          zh: "ASIA GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);
module.exports = router;
