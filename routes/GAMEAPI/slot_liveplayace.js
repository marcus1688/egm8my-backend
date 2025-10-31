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
const SlotLivePlayAceModal = require("../../models/slot_liveplayace.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const qs = require("querystring");
const GameWalletLog = require("../../models/gamewalletlog.model");
const xml2js = require("xml2js");
const parser = new xml2js.Parser({ explicitArray: false });
const Decimal = require("decimal.js");
const GamePlayAceGameModal = require("../../models/slot_liveplayaceDatabase.model");
require("dotenv").config();

const playaceProductId = "NS8";
const playaceAgentCode = "NS8_PA";
const playaceMD = process.env.PLAYACE_MD5KEY;
const playaceDES = process.env.PLAYACE_DESKEY;
const webURL = "http://egm8my.vip/";
const playaceAPIURL = "https://gi.playacestaging.com";
const playaceAPIURL2 = "https://gci.playacestaging.com";
const playaceCreateSessionAPIURL =
  "https://swapi.etwlt.com/resource/player-tickets.ucs";

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

const generatePassword = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }

  return result;
};

function encryptParams(params) {
  const encrypted = CryptoJS.DES.encrypt(
    params,
    CryptoJS.enc.Utf8.parse(playaceDES),
    {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }
  );
  return CryptoJS.enc.Base64.stringify(encrypted.ciphertext);
}

function generateMD5Key(encryptedParams) {
  return CryptoJS.MD5(encryptedParams + playaceMD).toString();
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

router.post("/api/playace/getgamelist", async (req, res) => {
  try {
    const games = await GamePlayAceGameModal.find({
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
    console.log("PLAYACE error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "PLAYACE: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "PLAYACE: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "PLAYACE: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "PLAYACE: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "PLAYACE: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

async function registerAGUser(username) {
  try {
    const registerPassword = generatePassword();

    const rawParams = `cagent=${playaceAgentCode}/\\\\/loginname=${username}/\\\\/method=lg/\\\\/actype=1/\\\\/password=${registerPassword}/\\\\/oddtype=A/\\\\/cur=MYR`;

    const encryptedParams = encryptParams(rawParams);
    const key = generateMD5Key(encryptedParams);

    const apiUrl = `${playaceAPIURL}/doBusiness.do?params=${encodeURIComponent(
      encryptedParams
    )}&key=${key}`;

    const response = await axios.get(apiUrl);

    const xmlResult = response.data;

    const infoMatch = xmlResult.match(/info="([^"]+)"/);
    const msgMatch = xmlResult.match(/msg="([^"]*)"/);

    const info = infoMatch ? infoMatch[1] : null;
    const msg = msgMatch ? msgMatch[1] : null;

    if (info === "0") {
      await User.findOneAndUpdate(
        { gameId: username },
        {
          $set: {
            playaceGamePW: registerPassword,
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
    console.error("PlayAce error in creating member:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function createAGPlayerSession(username, token, wallet) {
  try {
    const requestURL = `${playaceCreateSessionAPIURL}?productid=${playaceProductId}&username=${username}&session_token=${token}&credit=${roundToTwoDecimals(
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

router.post("/api/playace/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, gameCode, clientPlatform } = req.body;

    const userId = req.user.userId;
    let user = await User.findById(userId);

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

    if (user.gameLock.playace.lock) {
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

    if (!user.playaceGamePW) {
      const registration = await registerAGUser(user.gameId);

      if (!registration.success) {
        console.log(
          "PLAYACE registration failed:",
          registration.data || registration.error
        );

        return res.status(200).json({
          success: false,
          message: {
            en: "PLAYACE: Game launch failed. Please try again or customer service for assistance.",
            zh: "PLAYACE: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "PLAYACE: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "PLAYACE: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
            id: "PLAYACE: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      user = await User.findById(userId);
    }
    let token = `${user.username}:${generateRandomCode()}`;

    const createSession = await createAGPlayerSession(
      user.gameId,
      token,
      user.wallet
    );

    if (!createSession.success) {
      console.log(
        "PLAYACE create session failed:",
        createSession.data || createSession.error
      );

      return res.status(200).json({
        success: false,
        message: {
          en: "PLAYACE: Game launch failed. Please try again or customer service for assistance.",
          zh: "PLAYACE: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "PLAYACE: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "PLAYACE: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "PLAYACE: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    let lang = "3";

    if (gameLang === "en") {
      lang = "3";
    } else if (gameLang === "zh") {
      lang = "1";
    } else if (gameLang === "zh_hk") {
      lang = "2";
    } else if (gameLang === "ms") {
      lang = "3";
    } else if (gameLang === "id") {
      lang = "11";
    }

    let platform = "n";
    if (clientPlatform === "web") {
      platform = "n";
    } else if (clientPlatform === "mobile") {
      platform = "y";
    }
    console.log(process.env.PLAYACE_DESKEY);
    const sequence =
      Date.now().toString() + Math.floor(Math.random() * 1000).toString();
    const sid = `${playaceAgentCode}${sequence}`;

    const rawParams = `cagent=${playaceAgentCode}/\\\\/loginname=${user.gameId}/\\\\/actype=1/\\\\/password=${user.playaceGamePW}/\\\\/dm=${webURL}/\\\\/sid=${sid}/\\\\/lang=${lang}/\\\\/gameType=${gameCode}/\\\\/oddtype=A/\\\\/session_token=${token}/\\\\/cur=MYR/\\\\/mh5=${platform}`;
    console.log(rawParams);
    const encryptedParams = encryptParams(rawParams);
    const key = generateMD5Key(encryptedParams);

    const gameUrl = `${playaceAPIURL2}/forwardGame.do?params=${encodeURIComponent(
      encryptedParams
    )}&key=${key}`;
    console.log(gameUrl);
    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        playaceGameToken: token,
      },
      { new: true }
    );

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "PLAYACE SLOT"
    );

    // Return the game URL
    return res.status(200).json({
      success: true,
      gameLobby: gameUrl,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("PLAYACE error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "PLAYACE: Game launch failed. Please try again or customer service for assistance.",
        zh: "PLAYACE: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "PLAYACE: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "PLAYACE: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "PLAYACE: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/api/playacelive/launchGame",
  authenticateToken,
  async (req, res) => {
    try {
      const { gameLang, clientPlatform } = req.body;

      const userId = req.user.userId;
      let user = await User.findById(userId);

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

      if (user.gameLock.playace.lock) {
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

      if (!user.playaceGamePW) {
        const registration = await registerAGUser(user.gameId);

        if (!registration.success) {
          console.log(
            "PLAYACE registration failed:",
            registration.data || registration.error
          );

          return res.status(200).json({
            success: false,
            message: {
              en: "PLAYACE: Game launch failed. Please try again or customer service for assistance.",
              zh: "PLAYACE: 游戏启动失败，请重试或联系客服以获得帮助。",
              ms: "PLAYACE: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
              zh_hk: "PLAYACE: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
              id: "PLAYACE: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
            },
          });
        }

        user = await User.findById(userId);
      }
      let token = `${user.username}:${generateRandomCode()}`;

      const createSession = await createAGPlayerSession(
        user.gameId,
        token,
        user.wallet
      );

      if (!createSession.success) {
        console.log(
          "PLAYACE create session failed:",
          createSession.data || createSession.error
        );

        return res.status(200).json({
          success: false,
          message: {
            en: "PLAYACE: Game launch failed. Please try again or customer service for assistance.",
            zh: "PLAYACE: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "PLAYACE: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "PLAYACE: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
            id: "PLAYACE: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      let lang = "3";

      if (gameLang === "en") {
        lang = "3";
      } else if (gameLang === "zh") {
        lang = "1";
      } else if (gameLang === "zh_hk") {
        lang = "2";
      } else if (gameLang === "ms") {
        lang = "3";
      } else if (gameLang === "id") {
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
      const sid = `${playaceAgentCode}${sequence}`;

      const rawParams = `cagent=${playaceAgentCode}/\\\\/loginname=${user.gameId}/\\\\/actype=1/\\\\/password=${user.playaceGamePW}/\\\\/dm=${webURL}/\\\\/sid=${sid}/\\\\/lang=${lang}/\\\\/gameType=0/\\\\/oddtype=A/\\\\/cur=MYR
        /\\\\/mh5=${platform}`;

      const encryptedParams = encryptParams(rawParams);
      const key = generateMD5Key(encryptedParams);

      const gameUrl = `${playaceAPIURL2}/forwardGame.do?params=${encodeURIComponent(
        encryptedParams
      )}&key=${key}`;

      const updatedUser = await User.findOneAndUpdate(
        { _id: user._id },
        {
          playaceGameToken: token,
        },
        { new: true }
      );

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "PLAYACE LIVE"
      );

      // Return the game URL
      return res.status(200).json({
        success: true,
        gameLobby: gameUrl,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
          zh_hk: "遊戲啟動成功。",
          id: "Permainan berhasil diluncurkan.",
        },
      });
    } catch (error) {
      console.log("PLAYACE error in launching game", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "PLAYACE: Game launch failed. Please try again or customer service for assistance.",
          zh: "PLAYACE: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "PLAYACE: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "PLAYACE: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "PLAYACE: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post("/api/playacebonus", async (req, res) => {
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

        const trimmedCode = trimAfterUnderscore(playaceAgentCode);

        const username = extractPlayerName(record.playname, trimmedCode);

        // Get user in one efficient query with projection
        const currentUser = await User.findOne(
          {
            gameId: username,
            playaceGameToken: record.sessionToken,
          },
          {
            _id: 1,
            wallet: 1,
            username: 1,
            "gameLock.playace.lock": 1,
            playaceGameToken: 1,
            gameId: 1,
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

          if (currentUser.gameLock.playace.lock) {
            return sendResponse(500, "ERROR");
          }

          // Check for existing bet with projection
          const existingBet = await SlotLivePlayAceModal.findOne(
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
            SlotLivePlayAceModal.create({
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
            SlotLivePlayAceModal.findOne(
              { betId: record.transactionID },
              { settleId: 1, _id: 1 }
            ),
            SlotLivePlayAceModal.findOne(
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
            await SlotLivePlayAceModal.updateOne(
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
            await SlotLivePlayAceModal.create({
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

          const existingBet = await SlotLivePlayAceModal.findOne(
            { betId: record.transactionID },
            { _id: 1 }
          );

          if (!existingBet) {
            return sendResponse(404, "INVALID_TRANSACTION");
          }

          const existingTransaction = await SlotLivePlayAceModal.findOne(
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

          await SlotLivePlayAceModal.updateOne(
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
    console.error("LivePLAYACE API Error:", error);
    return sendResponse(500, "ERROR");
  }
});

router.post("/api/playacelive", async (req, res) => {
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

        const trimmedCode = trimAfterUnderscore(playaceAgentCode);

        // Validate agent code
        if (record.agentCode !== trimmedCode) {
          return sendResponse(400, "INVALID_DATA");
        }

        const username = extractPlayerName(record.playname, trimmedCode);

        // Get user in one efficient query with projection
        const currentUser = await User.findOne(
          {
            gameId: username,
            playaceGameToken: record.sessionToken,
          },
          {
            _id: 1,
            wallet: 1,
            username: 1,
            "gameLock.playace.lock": 1,
            playaceGameToken: 1,
            gameId: 1,
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

          if (currentUser.gameLock.playace.lock) {
            return sendResponse(500, "ERROR");
          }

          // Check for existing bet with projection
          const existingBet = await SlotLivePlayAceModal.findOne(
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
            SlotLivePlayAceModal.create({
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
            SlotLivePlayAceModal.findOne(
              { betId: record.transactionID },
              { settleId: 1 }
            ),
            SlotLivePlayAceModal.findOne(
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
            await SlotLivePlayAceModal.updateOne(
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
            await SlotLivePlayAceModal.create({
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

          const existingBet = await SlotLivePlayAceModal.findOne(
            { betId: record.transactionID },
            { _id: 1 }
          );

          if (!existingBet) {
            return sendResponse(404, "INVALID_TRANSACTION");
          }

          if (record.billNo) {
            const existingTransaction = await SlotLivePlayAceModal.findOne(
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

            await SlotLivePlayAceModal.updateOne(
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
            const existingTransaction = await SlotLivePlayAceModal.findOne(
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

            await SlotLivePlayAceModal.updateOne(
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
    console.error("LivePLAYACE API Error:", error);
    return sendResponse(500, "ERROR");
  }
});

router.post("/api/playaceslot", async (req, res) => {
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

        const trimmedCode = trimAfterUnderscore(playaceAgentCode);

        const username = extractPlayerName(record.playname, trimmedCode);

        // Get user in one efficient query with projection
        const currentUser = await User.findOne(
          {
            gameId: username,
            playaceGameToken: record.sessionToken,
          },
          {
            _id: 1,
            wallet: 1,
            username: 1,
            "gameLock.playace.lock": 1,
            playaceGameToken: 1,
            gameId: 1,
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

          if (currentUser.gameLock.playace.lock) {
            return sendResponse(500, "ERROR");
          }

          // Check for existing bet with projection
          const existingBet = await SlotLivePlayAceModal.findOne(
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
            SlotLivePlayAceModal.create({
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
            SlotLivePlayAceModal.findOne(
              { billNo: record.billNo },
              { settleId: 1 }
            ),
            SlotLivePlayAceModal.findOne(
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

          const existingBetRecord = await SlotLivePlayAceModal.findOne({
            billNo: record.billNo,
            settle: true,
          });

          // // Then update or create bet record as needed
          if (!existingBetRecord) {
            await SlotLivePlayAceModal.findOneAndUpdate(
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

            await SlotLivePlayAceModal.findOneAndUpdate(
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

          const existingBet = await SlotLivePlayAceModal.findOne(
            { billNo: record.billNo },
            { _id: 1 }
          );

          if (!existingBet) {
            return sendResponse(404, "INVALID_TRANSACTION");
          }

          const existingTransaction = await SlotLivePlayAceModal.findOne(
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

          await SlotLivePlayAceModal.updateOne(
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
    console.error("LivePLAYACE API Error:", error);
    return sendResponse(500, "ERROR");
  }
});

// ----------------
router.post("/api/playaceslot/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLivePlayAceModal.find({
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
        gamename: "PLAYACE",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("PLAYACE: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "PLAYACE: Failed to fetch win/loss report",
        zh: "PLAYACE: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/playaceslot/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLivePlayAceModal.find({
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
          gamename: "PLAYACE",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("PLAYACE: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "PLAYACE: Failed to fetch win/loss report",
          zh: "PLAYACE: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/playaceslot/:userId/gamedata",
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

          if (gameCat["PLAYACE"]) {
            totalTurnover += gameCat["PLAYACE"].turnover || 0;
            totalWinLoss += gameCat["PLAYACE"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PLAYACE",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("PLAYACE: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "PLAYACE: Failed to fetch win/loss report",
          zh: "PLAYACE: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/playaceslot/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLivePlayAceModal.find({
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
          gamename: "PLAYACE",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("PLAYACE: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "PLAYACE: Failed to fetch win/loss report",
          zh: "PLAYACE: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/playaceslot/kioskreport",
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

          if (gameCat["PLAYACE"]) {
            totalTurnover += Number(gameCat["PLAYACE"].turnover || 0);
            totalWinLoss += Number(gameCat["PLAYACE"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PLAYACE",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("PLAYACE: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "PLAYACE: Failed to fetch win/loss report",
          zh: "PLAYACE: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ----------------
router.post("/api/playacelive/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLivePlayAceModal.find({
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
        gamename: "PLAYACE",
        gamecategory: "Live Casino",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("PLAYACE: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "PLAYACE: Failed to fetch win/loss report",
        zh: "PLAYACE: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/playacelive/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLivePlayAceModal.find({
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
          gamename: "PLAYACE",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("PLAYACE: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "PLAYACE: Failed to fetch win/loss report",
          zh: "PLAYACE: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/playacelive/:userId/gamedata",
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

          if (gameCat["PLAYACE"]) {
            totalTurnover += gameCat["PLAYACE"].turnover || 0;
            totalWinLoss += gameCat["PLAYACE"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PLAYACE",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("PLAYACE: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "PLAYACE: Failed to fetch win/loss report",
          zh: "PLAYACE: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/playacelive/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLivePlayAceModal.find({
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
          gamename: "PLAYACE",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("PLAYACE: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "PLAYACE: Failed to fetch win/loss report",
          zh: "PLAYACE: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/playacelive/kioskreport",
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

          if (gameCat["PLAYACE"]) {
            totalTurnover += Number(gameCat["PLAYACE"].turnover || 0);
            totalWinLoss += Number(gameCat["PLAYACE"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PLAYACE",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("PLAYACE: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "PLAYACE: Failed to fetch win/loss report",
          zh: "PLAYACE: 获取盈亏报告失败",
        },
      });
    }
  }
);
module.exports = router;
