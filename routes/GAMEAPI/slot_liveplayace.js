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
const webURL = "https://www.bm8my.vip/";
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

// async function updatePlayAceManualOrderTimestamps() {
//   try {
//     // List of gameIDs in order (SC03 = latest, MJ02 = oldest)
//     const gameIds = [
//       "SC03",
//       "SB01",
//       "SB49",
//       "SB08",
//       "FRU",
//       "WH48",
//       "SB56",
//       "FRU2",
//       "SC07",
//       "VG01",
//       "SB57",
//       "SB02",
//       "SC05",
//       "WH62",
//       "SB64",
//       "SB58",
//       "SB28",
//       "SB45",
//       "SB06",
//       "SB72",
//       "SB66",
//       "SB62",
//       "SB67",
//       "EP03",
//       "SB59",
//       "EP02",
//       "SB30",
//       "WH28",
//       "SB50",
//       "SB68",
//       "SB47",
//       "AP02",
//       "SB33",
//       "MA08",
//       "SB07",
//       "SX02",
//       "SB60",
//       "WH31",
//       "AP15",
//       "WH44",
//       "SB11",
//       "WH40",
//       "WH12",
//       "SC06",
//       "MA31",
//       "WH56",
//       "WH10",
//       "WH22",
//       "WH11",
//       "SB34",
//       "WH06",
//       "WH58",
//       "WH07",
//       "WH42",
//       "SB51",
//       "WH30",
//       "PKBJ",
//       "SB70",
//       "WH20",
//       "WH01",
//       "WH26",
//       "XG02",
//       "WH52",
//       "WH54",
//       "SB37",
//       "SB55",
//       "WH35",
//       "WH23",
//       "WH38",
//       "SB73",
//       "SB10",
//       "WH24",
//       "WH25",
//       "WH17",
//       "WH65",
//       "WH21",
//       "MA27",
//       "WA01",
//       "WH49",
//       "WH34",
//       "WH36",
//       "SB63",
//       "MA51",
//       "WH55",
//       "PKBD",
//       "MA01",
//       "MA04",
//       "PKBB",
//       "VG02",
//       "XG01",
//       "WH19",
//       "MA16",
//       "WH03",
//       "WH18",
//       "WH32",
//       "WH29",
//       "SB09",
//       "WH04",
//       "MA15",
//       "MA22",
//       "WH27",
//       "WH02",
//       "SV41",
//       "XG06",
//       "MA33",
//       "XG05",
//       "MA06",
//       "XG03",
//       "XG04",
//       "XG16",
//       "XG13",
//       "XG12",
//       "XG11",
//       "XG09",
//       "XG08",
//       "XG10",
//       "XG07",
//       "MJ01",
//       "MJ02",
//     ];

//     // Start from current time + 5 months for the latest game (SC03)
//     const currentTime = new Date();
//     const startTime = new Date(
//       currentTime.getTime() + 5 * 30 * 24 * 60 * 60 * 1000
//     ); // Add 5 months (150 days)

//     console.log(`Starting PlayAce timestamp update...`);
//     console.log(`Total games to update: ${gameIds.length}`);
//     console.log(`Start time (latest game): ${startTime.toISOString()}`);

//     // Process each gameID with 30-minute intervals
//     for (let i = 0; i < gameIds.length; i++) {
//       const gameId = gameIds[i];

//       // Calculate timestamp: latest game gets start time (current + 5 months), each subsequent game is 30 minutes older
//       const timestamp = new Date(startTime.getTime() - i * 30 * 60 * 1000); // 30 minutes = 30 * 60 * 1000 milliseconds

//       // Update the document directly in the collection, bypassing schema timestamps
//       const result = await GamePlayAceGameModal.collection.updateOne(
//         { gameID: gameId },
//         {
//           $set: {
//             createdAt: timestamp,
//             updatedAt: new Date(),
//           },
//         }
//       );

//       if (result.matchedCount > 0) {
//         console.log(
//           `✅ Updated PlayAce gameID ${gameId} with timestamp: ${timestamp.toISOString()}`
//         );
//       } else {
//         console.log(`❌ PlayAce GameID ${gameId} not found in database`);
//       }
//     }

//     console.log("\n✅ PlayAce manual order timestamp update completed!");
//     console.log(
//       `Start time was set to: ${startTime.toISOString()} (current time + 5 months)`
//     );

//     // Verify the updates by fetching and displaying the results
//     const updatedGames = await GamePlayAceGameModal.find(
//       { gameID: { $in: gameIds } },
//       { gameID: 1, createdAt: 1, gameNameEN: 1, gameNameCN: 1, hot: 1 }
//     ).sort({ createdAt: -1 });

//     console.log(
//       "\n📊 Verification - PlayAce Games ordered by createdAt (newest first):"
//     );
//     updatedGames.forEach((game, index) => {
//       console.log(
//         `${index + 1}. GameID: ${game.gameID.padEnd(
//           6
//         )} | CreatedAt: ${game.createdAt.toISOString()} | Hot: ${
//           game.hot || false
//         } | Name: ${game.gameNameEN || game.gameNameCN || "N/A"}`
//       );
//     });

//     console.log(
//       `\n📈 Total games updated: ${updatedGames.length}/${gameIds.length}`
//     );

//     // Show games that were not found
//     const foundGameIds = updatedGames.map((g) => g.gameID);
//     const notFoundGameIds = gameIds.filter((id) => !foundGameIds.includes(id));

//     if (notFoundGameIds.length > 0) {
//       console.log(
//         `\n⚠️  Games not found in database (${notFoundGameIds.length}):`
//       );
//       notFoundGameIds.forEach((id) => console.log(`   - ${id}`));
//     }

//     // Display time range
//     if (updatedGames.length > 0) {
//       const oldestTimestamp = new Date(
//         startTime.getTime() - (gameIds.length - 1) * 30 * 60 * 1000
//       );
//       console.log(`\n⏰ Time range:`);
//       console.log(`   Latest (SC03): ${startTime.toISOString()}`);
//       console.log(`   Oldest (MJ02): ${oldestTimestamp.toISOString()}`);
//       console.log(
//         `   Total span: ${(gameIds.length - 1) * 30} minutes (${(
//           ((gameIds.length - 1) * 30) /
//           60
//         ).toFixed(1)} hours)`
//       );
//     }
//   } catch (error) {
//     console.error("❌ Error updating PlayAce manual order timestamps:", error);
//   }
// }

// // Call the function
// updatePlayAceManualOrderTimestamps();

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
    const sequence =
      Date.now().toString() + Math.floor(Math.random() * 1000).toString();
    const sid = `${playaceAgentCode}${sequence}`;

    const rawParams = `cagent=${playaceAgentCode}/\\\\/loginname=${user.gameId}/\\\\/actype=1/\\\\/password=${user.playaceGamePW}/\\\\/dm=${webURL}/\\\\/sid=${sid}/\\\\/lang=${lang}/\\\\/gameType=${gameCode}/\\\\/oddtype=A/\\\\/session_token=${token}/\\\\/cur=MYR/\\\\/mh5=${platform}`;
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

const sendResponse = (res, status, responseCode, balance = null) => {
  const xmlContent =
    balance !== null
      ? `<TransferResponse><ResponseCode>${responseCode}</ResponseCode><Balance>${balance}</Balance></TransferResponse>`
      : `<TransferResponse><ResponseCode>${responseCode}</ResponseCode></TransferResponse>`;

  const responseXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${xmlContent}`;

  res.set("Content-Type", "text/xml");
  res.set("X-Integration-API-host", "api-1.operator.com");
  return res.status(status).send(responseXml);
};

const parseXMLBody = (req) => {
  return new Promise((resolve, reject) => {
    let xmlData = "";
    req.on("data", (chunk) => {
      xmlData += chunk.toString();
    });
    req.on("end", () => {
      resolve(xmlData);
    });
    req.on("error", reject);
  });
};

router.post("/api/playacebonus", async (req, res) => {
  try {
    const xmlData = await parseXMLBody(req);
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
    ).lean();

    if (!currentUser) {
      return sendResponse(res, 403, "INCORRECT_SESSION_TYPE");
    }

    const transactionType = record.transactionType || "";

    if (transactionType === "WITHDRAW") {
      const transferAmount = new Decimal(record.amount || 0)
        .toDecimalPlaces(4)
        .toNumber();

      if (currentUser.gameLock.playace.lock) {
        return sendResponse(res, 500, "ERROR");
      }

      // Check for existing bet with projection
      const existingBet = await SlotLivePlayAceModal.findOne(
        { betId: record.transactionID, bet: true },
        { _id: 1 }
      ).lean();

      if (existingBet) {
        return sendResponse(
          res,
          200,
          "OK",
          roundToTwoDecimals(currentUser.wallet)
        );
      }

      const updatedUser = await User.findOneAndUpdate(
        {
          _id: currentUser._id,
          wallet: { $gte: transferAmount },
        },
        { $inc: { wallet: -transferAmount } },
        { new: true, projection: { wallet: 1 } }
      ).lean();

      // Check if update was successful (matched count > 0)
      if (result.matchedCount === 0) {
        return sendResponse(res, 409, "INSUFFICIENT_FUNDS");
      }

      await SlotLivePlayAceModal.create({
        username: username,
        betId: record.transactionID,
        bet: true,
        gametype: "EVENT",
        betamount: transferAmount,
        event: true,
      });

      return sendResponse(
        res,
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
        ).lean(),
        SlotLivePlayAceModal.findOne(
          {
            settleId: record.transactionID,
            $or: [{ settle: true }, { cancel: true }],
          },
          { _id: 1 }
        ).lean(),
      ]);

      if (!existingBet) {
        return sendResponse(res, 404, "INVALID_TRANSACTION");
      }

      if (existingTransaction) {
        return sendResponse(
          res,
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
      ).lean();

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
          username: username,
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
        res,
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

      const [existingBet, existingTransaction] = await Promise.all([
        SlotLivePlayAceModal.findOne(
          { betId: record.transactionID },
          { _id: 1 }
        ).lean(),
        SlotLivePlayAceModal.findOne(
          { settleId: record.transactionID, cancel: true },
          { _id: 1 }
        ).lean(),
      ]);

      if (!existingBet) {
        return sendResponse(res, 404, "INVALID_TRANSACTION");
      }

      if (existingTransaction) {
        return sendResponse(
          res,
          200,
          "OK",
          roundToTwoDecimals(currentUser.wallet)
        );
      }

      const [updatedUser] = await Promise.all([
        User.findOneAndUpdate(
          { _id: currentUser._id },
          { $inc: { wallet: transferAmount } },
          { new: true, projection: { wallet: 1 } }
        ).lean(),
        SlotLivePlayAceModal.findOneAndUpdate(
          { settleId: record.transactionID },
          {
            cancel: true,
          },
          { new: false }
        ),
      ]);

      return sendResponse(
        res,
        200,
        "OK",
        roundToTwoDecimals(updatedUser.wallet)
      );
    } else {
      return sendResponse(res, 400, "INVALID_DATA");
    }
  } catch (error) {
    console.error("LivePLAYACE API Error:", error);
    return sendResponse(res, 500, "ERROR");
  }
});

router.post("/api/playacelive", async (req, res) => {
  try {
    const xmlData = await parseXMLBody(req);
    const result = await parser.parseStringPromise(xmlData);
    const record = result.Data.Record;

    const trimmedCode = trimAfterUnderscore(playaceAgentCode);

    if (record.agentCode !== trimmedCode) {
      return sendResponse(res, 400, "INVALID_DATA");
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
      return sendResponse(res, 403, "INCORRECT_SESSION_TYPE");
    }

    const transactionType = record.transactionType || "";

    // Optimized BET transaction handling
    if (transactionType === "BET") {
      const transferAmount = new Decimal(record.value || 0)
        .toDecimalPlaces(4)
        .toNumber();

      if (currentUser.gameLock.playace.lock) {
        return sendResponse(res, 500, "ERROR");
      }

      // Check for existing bet with projection
      const existingBet = await SlotLivePlayAceModal.findOne(
        { betId: record.transactionID, bet: true },
        { _id: 1 }
      ).lean();

      if (existingBet) {
        return sendResponse(
          res,
          200,
          "OK",
          roundToTwoDecimals(currentUser.wallet)
        );
      }

      const updatedUser = await User.findOneAndUpdate(
        {
          _id: currentUser._id,
          wallet: { $gte: transferAmount },
        },
        { $inc: { wallet: -transferAmount } },
        { new: true, projection: { wallet: 1 } }
      ).lean();

      if (!updatedUser) {
        return sendResponse(res, 409, "INSUFFICIENT_FUNDS");
      }

      await SlotLivePlayAceModal.create({
        username: username,
        betId: record.transactionID,
        bet: true,
        gametype: "LIVE",
        betamount: transferAmount,
        roundId: record.gameCode || "",
      });

      return sendResponse(
        res,
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
        ).lean(),
        SlotLivePlayAceModal.findOne(
          {
            settleId: record.billNo,
            $or: [{ settle: true }, { cancel: true }],
          },
          { _id: 1 }
        ).lean(),
      ]);

      if (!existingBet) {
        return sendResponse(res, 404, "INVALID_TRANSACTION");
      }

      if (existingTransaction) {
        return sendResponse(
          res,
          200,
          "OK",
          roundToTwoDecimals(currentUser.wallet)
        );
      }

      const updatedUser = await User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: winAmount } },
        { new: true, projection: { wallet: 1 } }
      ).lean();

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
          username: username,
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
        res,
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
      ).lean();

      if (!existingBet) {
        return sendResponse(res, 404, "INVALID_TRANSACTION");
      }

      if (record.billNo) {
        const existingTransaction = await SlotLivePlayAceModal.findOne(
          { settleId: record.billNo, cancel: true },
          { _id: 1 }
        ).lean();

        if (existingTransaction) {
          return sendResponse(
            res,
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
        ).lean();

        if (!updatedUser) {
          return sendResponse(res, 409, "INSUFFICIENT_FUNDS");
        }

        await SlotLivePlayAceModal.updateOne(
          { settleId: record.billNo },
          { $set: { cancel: true } },
          { upsert: true }
        );

        return sendResponse(
          res,
          200,
          "OK",
          roundToTwoDecimals(updatedUser.wallet)
        );
      } else {
        const existingTransaction = await SlotLivePlayAceModal.findOne(
          { betId: record.transactionID, cancel: true },
          { _id: 1 }
        ).lean();

        if (existingTransaction) {
          return sendResponse(
            res,
            200,
            "OK",
            roundToTwoDecimals(currentUser.wallet)
          );
        }

        const [updatedUser] = await Promise.all([
          User.findOneAndUpdate(
            { _id: currentUser._id },
            { $inc: { wallet: transferAmount } },
            { new: true, projection: { wallet: 1 } }
          ).lean(),
          SlotLivePlayAceModal.findOneAndUpdate(
            { betId: record.transactionID },
            {
              $set: { cancel: true },
            },
            { new: false }
          ),
        ]);

        return sendResponse(
          res,
          200,
          "OK",
          roundToTwoDecimals(updatedUser.wallet)
        );
      }
    } else {
      return sendResponse(res, 400, "INVALID_DATA");
    }
  } catch (error) {
    console.error("LivePLAYACE API Error:", error);
    return sendResponse(res, 500, "ERROR");
  }
});

router.post("/api/playaceslot", async (req, res) => {
  try {
    const xmlData = await parseXMLBody(req);
    const result = await parser.parseStringPromise(xmlData);
    const record = result.Data.Record;

    if (!record.sessionToken || !record.playname || !record.transactionType) {
      return sendResponse(res, 400, "INVALID_DATA");
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
      return sendResponse(res, 403, "INCORRECT_SESSION_TYPE");
    }

    const transactionType = record.transactionType || "";

    if (transactionType === "BALANCE") {
      const balance = new Decimal(currentUser.wallet)
        .toDecimalPlaces(4)
        .toNumber();
      return sendResponse(res, 200, "OK", balance);
    } else if (transactionType === "WITHDRAW") {
      const transferAmount = new Decimal(record.amount)
        .toDecimalPlaces(4)
        .toNumber();

      if (currentUser.gameLock.playace.lock) {
        return sendResponse(res, 500, "ERROR");
      }

      // Check for existing bet with projection
      const existingBet = await SlotLivePlayAceModal.findOne(
        { betId: record.transactionID, bet: true },
        { _id: 1 }
      ).lean();

      if (existingBet) {
        return sendResponse(
          res,
          200,
          "OK",
          roundToTwoDecimals(currentUser.wallet)
        );
      }

      const updatedUser = await User.findOneAndUpdate(
        {
          _id: currentUser._id,
          wallet: { $gte: transferAmount },
        },
        { $inc: { wallet: -transferAmount } },
        { new: true, projection: { wallet: 1 } }
      ).lean();

      if (!updatedUser) {
        return sendResponse(res, 409, "INSUFFICIENT_FUNDS");
      }

      await SlotLivePlayAceModal.create({
        username: username,
        betId: record.transactionID,
        bet: true,
        betamount: transferAmount,
        gametype: "SLOT",
        billNo: record.billNo,
      });

      return sendResponse(
        res,
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
        ).lean(),
        SlotLivePlayAceModal.findOne(
          {
            settleId: record.transactionID,
          },
          { _id: 1 }
        ).lean(),
      ]);

      if (!existingBet) {
        return sendResponse(res, 404, "INVALID_TRANSACTION");
      }

      if (existingTransaction) {
        return sendResponse(
          res,
          200,
          "OK",
          roundToTwoDecimals(currentUser.wallet)
        );
      }

      const [updatedUser, existingBetRecord] = await Promise.all([
        User.findOneAndUpdate(
          { _id: currentUser._id },
          { $inc: { wallet: winAmount } },
          { new: true, projection: { wallet: 1 } }
        ).lean(),
        SlotLivePlayAceModal.findOne(
          { billNo: record.billNo, settle: true },
          { _id: 1 }
        ).lean(),
      ]);

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
          { upsert: true }
        );
      } else {
        const relatedWithdrawTxnId = record.transactionID.endsWith("P")
          ? record.transactionID.slice(0, -1)
          : null;

        if (relatedWithdrawTxnId) {
          await SlotLivePlayAceModal.findOneAndUpdate(
            { betId: relatedWithdrawTxnId },
            {
              $set: {
                settle: true,
                settleamount: winAmount,
                settleId: record.transactionID,
              },
            },
            { upsert: true }
          );
        }
      }

      return sendResponse(
        res,
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

      const [existingBet, existingTransaction] = await Promise.all([
        SlotLivePlayAceModal.findOne(
          { billNo: record.billNo },
          { _id: 1 }
        ).lean(),
        SlotLivePlayAceModal.findOne(
          { billNo: record.billNo, cancel: true },
          { _id: 1 }
        ).lean(),
      ]);

      if (!existingBet) {
        return sendResponse(res, 404, "INVALID_TRANSACTION");
      }

      if (existingTransaction) {
        return sendResponse(
          res,
          200,
          "OK",
          roundToTwoDecimals(currentUser.wallet)
        );
      }

      const [updatedUser] = await Promise.all([
        User.findOneAndUpdate(
          { _id: currentUser._id },
          { $inc: { wallet: transferAmount } },
          { new: true, projection: { wallet: 1 } }
        ).lean(),
        SlotLivePlayAceModal.findOneAndUpdate(
          { billNo: record.billNo },
          {
            cancel: true,
          },
          { new: false }
        ),
      ]);

      return sendResponse(
        res,
        200,
        "OK",
        roundToTwoDecimals(updatedUser.wallet)
      );
    } else {
      return sendResponse(res, 400, "INVALID_DATA");
    }
  } catch (error) {
    console.error("LivePLAYACE API Error:", error);
    return sendResponse(res, 500, "ERROR");
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
        console.warn(`PLAYACE User not found for gameId: ${gameId}`);
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
        console.warn(`PLAYACE LIVe User not found for gameId: ${gameId}`);
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
        username: user.gameId,
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
