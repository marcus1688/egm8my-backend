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
const GameJILIGameModal = require("../../models/slot_jiliDatabase.model");

require("dotenv").config();

const jiliAgentId = "TitanSW59MMK_OC7";
const jiliKey = process.env.JILI_SECRET;
const webURL = "https://www.oc7.me/";
const jiliAPIURL = "https://wb-api-2.jismk2u.com/api1";

function generateRandomText(length) {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
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

function generateSignature(fields, agentId, agentKey) {
  const now = moment.utc().subtract(4, "hours");
  const nowStr = now.format("YYMM") + parseInt(now.format("D"), 10);

  const keyG = crypto
    .createHash("md5")
    .update(nowStr + agentId + agentKey)
    .digest("hex");

  const queryString = Object.keys(fields)
    .map((key) => `${key}=${fields[key]}`)
    .join("&");

  const md5string = crypto
    .createHash("md5")
    .update(queryString + keyG)
    .digest("hex");

  const randomText1 = generateRandomText(6);
  const randomText2 = generateRandomText(6);

  const key = randomText1 + md5string + randomText2;

  return key;
}

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

router.post("/api/jili/syncgames", async (req, res) => {
  try {
    // First, get the current game list from JILI API
    const fields = {
      AgentId: jiliAgentId,
    };

    const hash = generateSignature(fields, jiliAgentId, jiliKey);

    const requestData = new URLSearchParams({
      ...fields,
      HomeUrl: webURL,
      Key: hash,
    }).toString();

    const response = await axios.post(
      `${jiliAPIURL}/GetGameList`,
      requestData,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (!response.data || response.data.ErrorCode !== 0) {
      return res.status(400).json({
        success: false,
        message: "Failed to fetch games from JILI API",
      });
    }

    // Extract game IDs from API response (convert to string for consistency)
    const apiGameIds = response.data.Data.map((game) => game.GameId.toString());

    // Get all games from database
    const dbGames = await GameJILIGameModal.find({}, "gameID");
    const dbGameIds = dbGames.map((game) => game.gameID);

    // Find games that are in database but not in API (extra in DB)
    const extraInDb = dbGameIds.filter(
      (gameId) => !apiGameIds.includes(gameId)
    );

    // Find games that are in API but not in database (missing in DB)
    const missingInDb = apiGameIds.filter(
      (gameId) => !dbGameIds.includes(gameId)
    );

    // Find games that exist in both (common games)
    const commonGames = dbGameIds.filter((gameId) =>
      apiGameIds.includes(gameId)
    );

    // Note: JILI schema doesn't have maintenance field, so we'll just report the differences
    // If you want to add maintenance field, you'll need to update your schema first

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          totalApiGames: apiGameIds.length,
          totalDbGames: dbGameIds.length,
          extraInDb: extraInDb.length,
          missingInDb: missingInDb.length,
          commonGames: commonGames.length,
        },
        extraInDb: extraInDb,
        missingInDb: missingInDb,
        missingGamesDetails: response.data.Data.filter((game) =>
          missingInDb.includes(game.GameId.toString())
        ),
        message: {
          en: `JILI sync completed. ${extraInDb.length} games extra in DB, ${missingInDb.length} games missing from database.`,
          zh: `JILI同步完成。数据库中多出${extraInDb.length}个游戏，缺失${missingInDb.length}个游戏。`,
          ms: `Sinkronisasi JILI selesai. ${extraInDb.length} permainan tambahan di DB, ${missingInDb.length} permainan hilang dari pangkalan data.`,
          zh_hk: `JILI同步完成。資料庫中多出${extraInDb.length}個遊戲，缺失${missingInDb.length}個遊戲。`,
          id: `Sinkronisasi JILI selesai. ${extraInDb.length} game ekstra di DB, ${missingInDb.length} game hilang dari database.`,
        },
      },
    });
  } catch (error) {
    console.log("JILI game sync error:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "JILI game synchronization failed. Please try again.",
        zh: "JILI游戏同步失败，请重试。",
        ms: "Sinkronisasi permainan JILI gagal. Sila cuba lagi.",
        zh_hk: "JILI遊戲同步失敗，請重試。",
        id: "Sinkronisasi game JILI gagal. Silakan coba lagi.",
      },
    });
  }
});
// router.post("/api/jili/getprovidergame", async (req, res) => {
//   try {
//     const fields = {
//       AgentId: jiliAgentId,
//     };

//     const hash = generateSignature(fields, jiliAgentId, jiliKey);

//     const requestData = new URLSearchParams({
//       ...fields,
//       HomeUrl: webURL,
//       Key: hash,
//     }).toString();

//     const response = await axios.post(
//       `${jiliAPIURL}/GetGameList`,
//       requestData,
//       {
//         headers: {
//           "Content-Type": "application/x-www-form-urlencoded",
//         },
//       }
//     );
//     console.log(response.data);

//     return res.status(200).json({
//       success: true,
//       gameLobby: response.data,
//       message: {
//         en: "Game launched successfully.",
//         zh: "游戏启动成功。",
//         ms: "Permainan berjaya dimulakan.",
//         zh_hk: "遊戲啟動成功。",
//         id: "Permainan berhasil diluncurkan.",
//       },
//     });
//   } catch (error) {
//     console.log("JILI error in launching game", error.message);
//     return res.status(200).json({
//       success: false,
//       message: {
//         en: "JILI: Game launch failed. Please try again or customer service for assistance.",
//         zh: "JILI: 游戏启动失败，请重试或联系客服以获得帮助。",
//         ms: "JILI: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
//         zh_hk: "JILI: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
//         id: "JILI: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
//       },
//     });
//   }
// });

router.post("/api/jili/getgamelist", async (req, res) => {
  try {
    // Fetch all games from the database (or add filters as needed)
    const games = await GameJILIGameModal.find({
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
        },
      });
    }

    // Transform data into the desired format
    const reformattedGamelist = games.map((game) => ({
      GameCode: game.gameID,
      GameNameEN: game.gameNameEN,
      GameNameZH: game.gameNameCN,
      GameNameMS: game.gameNameMS,
      GameNameHK: game.gameNameHK,
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
    console.log("JILI error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "JILI: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "JILI: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "JILI: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/jili/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, gameCode } = req.body;
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (user.gameLock.jili.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
        },
      });
    }

    let lang = "en-US";

    if (gameLang === "en") {
      lang = "en-US";
    } else if (gameLang === "zh") {
      lang = "zh-CN";
    } else if (gameLang === "ms") {
      lang = "ms-MY";
    }

    let token = req.body.gameToken;

    const fields = {
      Token: token,
      GameId: gameCode,
      Lang: lang,
      AgentId: jiliAgentId,
    };

    const hash = generateSignature(fields, jiliAgentId, jiliKey);

    const requestData = new URLSearchParams({
      ...fields,
      HomeUrl: webURL,
      Key: hash,
    }).toString();

    const response = await axios.post(
      `${jiliAPIURL}/singleWallet/LoginWithoutRedirect`,
      requestData,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (response.data.ErrorCode !== 0) {
      console.log("JILI error to launch game", response.data);
      return res.status(200).json({
        success: false,
        message: {
          en: "JILI: Game launch failed. Please try again or customer service for assistance.",
          zh: "JILI: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "JILI: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "JILI"
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data.Data,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
      },
    });
  } catch (error) {
    console.log("JILI error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "JILI: Game launch failed. Please try again or customer service for assistance.",
        zh: "JILI: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "JILI: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/api/jili/launchGameWlobby",
  authenticateToken,
  async (req, res) => {
    try {
      const { gameLang } = req.body;
      const userId = req.user.userId;
      const user = await User.findById(userId);

      if (user.gameLock.jili.lock) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Your game access has been locked. Please contact customer support for further assistance.",
            zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
            ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
          },
        });
      }

      let lang = "en-US";

      if (gameLang === "en") {
        lang = "en-US";
      } else if (gameLang === "zh") {
        lang = "zh-CN";
      } else if (gameLang === "ms") {
        lang = "ms-MY";
      }

      let token = req.body.gameToken;

      const fields = {
        Token: token,
        GameId: 80,
        Lang: lang,
        AgentId: jiliAgentId,
      };

      const hash = generateSignature(fields, jiliAgentId, jiliKey);

      const requestData = new URLSearchParams({
        ...fields,
        HomeUrl: webURL,
        Key: hash,
      }).toString();

      const response = await axios.post(
        `${jiliAPIURL}/singleWallet/LoginWithoutRedirect`,
        requestData,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      if (response.data.ErrorCode !== 0) {
        console.log("JILI error to launch game", response.data);
        return res.status(200).json({
          success: false,
          message: {
            en: "JILI: Game launch failed. Please try again or customer service for assistance.",
            zh: "JILI: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "JILI: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "JILI"
      );

      return res.status(200).json({
        success: true,
        gameLobby: response.data.Data,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
        },
      });
    } catch (error) {
      console.log("JILI error in launching game", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "JILI: Game launch failed. Please try again or customer service for assistance.",
          zh: "JILI: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "JILI: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post("/api/jili/auth", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(200).json({
        errorCode: 5,
        message: "Invalid parameter",
        username: null,
        currency: "MYR",
        balance: 0,
        token: null,
      });
    }

    const decodedToken = jwt.verify(token, process.env.JWT_GAME_SECRET);

    const currentUser = await User.findById(decodedToken.userId, {
      _id: 1,
      username: 1,
      wallet: 1,
    }).lean();

    if (!currentUser) {
      return res.status(200).json({
        errorCode: 4,
        message: "Token expired",
        username: null,
        currency: "MYR",
        balance: 0,
        token: null,
      });
    }

    const newToken = `${jiliAgentId}${
      currentUser.username
    }:${generateRandomCode()}`;

    const updatedUser = await User.findOneAndUpdate(
      { _id: currentUser._id },
      {
        jiliGameToken: newToken,
      },
      { new: true, projection: { wallet: 1, username: 1 } }
    ).lean();

    return res.status(200).json({
      errorCode: 0,
      message: "Success",
      username: currentUser.username,
      currency: "MYR",
      balance: roundToTwoDecimals(currentUser.wallet),
      token: newToken,
    });
  } catch (error) {
    console.error(
      "JILI: Error in game provider calling ae96 auth api:",
      error.message
    );
    return res.status(500).json({
      errorCode: 5,
      message: "Internal Server Error",
      username: null,
      currency: "MYR",
      balance: 0,
      token: null,
    });
  }
});

function mapGameCategory(categoryId) {
  const categoryMap = {
    1: "SLOT",
    2: "POKER",
    3: "LOBBY",
    5: "FISH",
    6: "CASINO",
  };

  return categoryMap[categoryId] || "SLOT";
}

router.post("/api/jili/bet", async (req, res) => {
  try {
    const { reqId, token, round, betAmount, winloseAmount, gameCategory } =
      req.body;

    if (!token) {
      return res.status(200).json({
        errorCode: 3,
        message: "Invalid parameter",
        username: null,
        currency: "MYR",
        balance: 0,
        txId: null,
        token: null,
      });
    }

    const firstFewCharacters = token.substring(0, jiliAgentId.length);

    if (firstFewCharacters !== jiliAgentId) {
      return res.status(200).json({
        errorCode: 5,
        message: "Invalid Agent",
        username: null,
        currency: "MYR",
        balance: 0,
        txId: null,
        token,
      });
    }

    const username = token.substring(
      firstFewCharacters.length,
      token.indexOf(":")
    );

    const [currentUser, existingTransaction] = await Promise.all([
      User.findOne(
        { username },
        {
          jiliGameToken: 1,
          gameLock: 1,
          wallet: 1,
          username: 1,
          _id: 1,
        }
      ).lean(),
      SlotJiliModal.findOne({ roundId: round, bet: true }, { _id: 1 }).lean(),
    ]);

    if (!currentUser || currentUser.jiliGameToken !== token) {
      return res.status(200).json({
        errorCode: 4,
        message: "Token expired",
        username: null,
        currency: "MYR",
        balance: 0,
        txId: null,
        token,
      });
    }
    if (currentUser.gameLock?.jili?.lock) {
      return res.status(200).json({
        errorCode: 5,
        message: "Play locked",
        username: null,
        currency: "MYR",
        balance: 0,
        txId: null,
        token,
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        errorCode: 1,
        message: "Already accepted",
        username: currentUser.username,
        currency: "MYR",
        balance: roundToTwoDecimals(currentUser.wallet),
        txId: round,
        token,
      });
    }

    const adjustedAmount = -betAmount + winloseAmount;

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        username: currentUser.username,
        wallet: { $gte: roundToTwoDecimals(betAmount || 0) },
      },
      { $inc: { wallet: roundToTwoDecimals(adjustedAmount || 0) } },
      { new: true, projection: { wallet: 1, username: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      const latestUser = await User.findOne(
        { username: currentUser.username },
        { wallet: 1, username: 1 }
      ).lean();

      return res.status(200).json({
        errorCode: 2,
        message: "Not enough balance",
        username: latestUser.username,
        currency: "MYR",
        balance: roundToTwoDecimals(latestUser.wallet),
        txId: round,
        token,
      });
    }

    const gameType = mapGameCategory(gameCategory);

    await SlotJiliModal.create({
      username: currentUser.username,
      roundId: round,
      bet: true,
      settle: true,
      betamount: roundToTwoDecimals(betAmount),
      settleamount: roundToTwoDecimals(winloseAmount),
      gametype: gameType,
    });

    return res.status(200).json({
      errorCode: 0,
      message: "Success",
      username: updatedUserBalance.username,
      currency: "MYR",
      balance: roundToTwoDecimals(updatedUserBalance.wallet),
      txId: round,
      token,
    });
  } catch (error) {
    console.error(
      "JILI: Error in game provider calling ae96 bet api:",
      error.message
    );
    return res.status(500).json({
      errorCode: 5,
      message: "Internal Server Error",
      username: null,
      currency: "MYR",
      balance: 0,
      txId: null,
      token: null,
    });
  }
});

router.post("/api/jili/cancelBet", async (req, res) => {
  try {
    const { reqId, token, round, betAmount, winloseAmount } = req.body;

    if (!token) {
      return res.status(200).json({
        errorCode: 3,
        message: "Invalid parameter",
        username: null,
        currency: "MYR",
        balance: 0,
        txId: null,
      });
    }

    const firstFewCharacters = token.substring(0, jiliAgentId.length);

    if (firstFewCharacters !== jiliAgentId) {
      return res.status(200).json({
        errorCode: 5,
        message: "Invalid Agent",
        username: null,
        currency: "MYR",
        balance: 0,
        txId: null,
        token,
      });
    }

    const username = token.substring(
      firstFewCharacters.length,
      token.indexOf(":")
    );

    const [currentUser, existingTransaction, existingCancelledTransaction] =
      await Promise.all([
        User.findOne(
          { username },
          { jiliGameToken: 1, wallet: 1, username: 1 }
        ).lean(),
        SlotJiliModal.findOne({ roundId: round, bet: true }, { _id: 1 }).lean(),
        SlotJiliModal.findOne(
          { roundId: round, cancel: true },
          { _id: 1 }
        ).lean(),
      ]);

    if (!currentUser || currentUser.jiliGameToken !== token) {
      return res.status(200).json({
        errorCode: 5,
        message: "Token expired",
        username: null,
        currency: "MYR",
        balance: 0,
        txId: null,
      });
    }

    if (!existingTransaction) {
      return res.status(200).json({
        errorCode: 2,
        message: "Round not found",
        username: currentUser.username,
        currency: "MYR",
        balance: roundToTwoDecimals(currentUser.wallet),
        txId: round,
      });
    }

    if (existingCancelledTransaction) {
      return res.status(200).json({
        errorCode: 1,
        message: "Already cancelled",
        username: currentUser.username,
        currency: "MYR",
        balance: roundToTwoDecimals(currentUser.wallet),
        txId: round,
      });
    }

    const adjustedAmount = betAmount - winloseAmount;

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        username: currentUser.username,
        wallet: { $gte: roundToTwoDecimals(adjustedAmount || 0) },
      },
      { $inc: { wallet: roundToTwoDecimals(adjustedAmount || 0) } },
      { new: true, projection: { wallet: 1, username: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      const latestUser = await User.findOne(
        { username: currentUser.username },
        { wallet: 1, username: 1 }
      ).lean();

      return res.status(200).json({
        errorCode: 6,
        message: "Not enough balance",
        username: latestUser.username,
        currency: "MYR",
        balance: roundToTwoDecimals(latestUser.wallet),
        txId: round,
      });
    }

    await SlotJiliModal.findOneAndUpdate(
      { roundId: round },
      { $set: { cancel: true } },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      errorCode: 0,
      message: "Success",
      username: updatedUserBalance.username,
      currency: "MYR",
      balance: roundToTwoDecimals(updatedUserBalance.wallet),
      txId: round,
    });
  } catch (error) {
    console.error(
      "JILI: Error in game provider calling ae96 cancel api:",
      error.message
    );
    return res.status(200).json({
      errorCode: 5,
      message: "Internal Server Error",
      username: null,
      currency: "MYR",
      balance: 0,
    });
  }
});

router.post("/api/jili/sessionBet", async (req, res) => {
  try {
    const {
      reqId,
      token,
      round,
      betAmount,
      winloseAmount,
      type,
      preserve,
      sessionId,
      turnover,
      gameCategory,
    } = req.body;

    if (!token) {
      return res.status(200).json({
        errorCode: 3,
        message: "Invalid parameter",
        username: null,
        currency: "MYR",
        balance: 0,
        txId: null,
        token: null,
      });
    }

    const firstFewCharacters = token.substring(0, jiliAgentId.length);

    if (firstFewCharacters !== jiliAgentId) {
      return res.status(200).json({
        errorCode: 5,
        message: "Invalid Agent",
        username: null,
        currency: "MYR",
        balance: 0,
        txId: null,
        token,
      });
    }
    const username = token.substring(
      firstFewCharacters.length,
      token.indexOf(":")
    );

    const [currentUser, existingTransaction] = await Promise.all([
      User.findOne(
        { username, jiliGameToken: token },
        { wallet: 1, gameLock: 1, username: 1 }
      ).lean(),
      type === 1 || type === 2
        ? SlotJiliModal.findOne({
            roundId: round,
            [type === 1 ? "bet" : "settle"]: true,
          }).lean()
        : null,
    ]);

    if (!currentUser) {
      return res.status(200).json({
        errorCode: 4,
        message: "Token expired",
        username: null,
        currency: "MYR",
        balance: 0,
        txId: null,
        token,
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        errorCode: 1,
        message: "Already accepted",
        username,
        currency: "MYR",
        balance: roundToTwoDecimals(currentUser.wallet),
        txId: round,
        token,
      });
    }

    let updatedUserBalance;
    let transactionPromise = Promise.resolve();
    const gameType = mapGameCategory(gameCategory);

    if (preserve === 0 || !preserve) {
      if (type === 1) {
        if (currentUser.gameLock?.jili?.lock) {
          return res.status(200).json({
            errorCode: 5,
            message: "Play locked",
            username: null,
            currency: "MYR",
            balance: 0,
            txId: null,
            token,
          });
        }

        updatedUserBalance = await User.findOneAndUpdate(
          {
            username: currentUser.username,
            wallet: { $gte: roundToTwoDecimals(betAmount || 0) },
          },
          { $inc: { wallet: -roundToTwoDecimals(betAmount || 0) } },
          { new: true, projection: { username: 1, wallet: 1 } }
        );

        if (!updatedUserBalance) {
          const latestUser = await User.findOne(
            { username },
            { wallet: 1 }
          ).lean();

          return res.status(200).json({
            errorCode: 2,
            message: "Not enough balance",
            username: currentUser.username,
            currency: "MYR",
            balance: roundToTwoDecimals(latestUser.wallet),
            txId: round,
            token,
          });
        }

        transactionPromise = SlotJiliModal.create({
          username,
          roundId: round,
          sessionRoundId: sessionId,
          bet: true,
          betamount: roundToTwoDecimals(betAmount),
          gametype: gameType,
        });
      } else if (type === 2) {
        updatedUserBalance = await User.findOneAndUpdate(
          { username: currentUser.username },
          { $inc: { wallet: roundToTwoDecimals(winloseAmount || 0) } },
          { new: true, projection: { username: 1, wallet: 1 } }
        );

        transactionPromise = SlotJiliModal.findOneAndUpdate(
          { roundId: round },
          {
            $set: {
              username,
              settle: true,
              settleamount: roundToTwoDecimals(winloseAmount),
            },
          },
          { upsert: true }
        );
      }
    } else {
      if (type === 1) {
        if (currentUser.gameLock?.jili?.lock) {
          return res.status(200).json({
            errorCode: 5,
            message: "Play locked",
            username: null,
            currency: "MYR",
            balance: 0,
            txId: null,
            token,
          });
        }

        updatedUserBalance = await User.findOneAndUpdate(
          {
            username: currentUser.username,
            wallet: { $gte: roundToTwoDecimals(preserve || 0) },
          },
          { $inc: { wallet: -roundToTwoDecimals(preserve || 0) } },
          { new: true, projection: { username: 1, wallet: 1 } }
        );

        if (!updatedUserBalance) {
          const latestUser = await User.findOne(
            { username },
            { wallet: 1 }
          ).lean();

          return res.status(200).json({
            errorCode: 2,
            message: "Not enough balance",
            username: currentUser.username,
            currency: "MYR",
            balance: roundToTwoDecimals(latestUser.wallet),
            txId: round,
            token,
          });
        }

        transactionPromise = SlotJiliModal.create({
          username,
          roundId: round,
          sessionRoundId: sessionId,
          bet: true,
          betamount: roundToTwoDecimals(preserve),
          gametype: gameType,
        });
      } else if (type === 2) {
        const adjustedAmount = preserve - betAmount + winloseAmount;
        updatedUserBalance = await User.findOneAndUpdate(
          { username: currentUser.username },
          { $inc: { wallet: roundToTwoDecimals(adjustedAmount || 0) } },
          { new: true, projection: { username: 1, wallet: 1 } }
        );

        transactionPromise = SlotJiliModal.findOneAndUpdate(
          { roundId: round },
          {
            $set: {
              username,
              settle: true,
              settleamount: roundToTwoDecimals(winloseAmount),
            },
          },
          { upsert: true }
        );
      }
    }

    transactionPromise.catch((err) =>
      console.error(
        "JILI: Failed to update transaction in sessionBet:",
        err.message
      )
    );

    return res.status(200).json({
      errorCode: 0,
      message: "Success",
      username: updatedUserBalance.username,
      currency: "MYR",
      balance: roundToTwoDecimals(updatedUserBalance.wallet),
      txId: round,
      token,
    });
  } catch (error) {
    console.error(
      "JILI: Error in game provider calling ae96 sessionbet api:",
      error.message
    );
    return res.status(200).json({
      errorCode: 5,
      message: "Internal Server Error",
      username: null,
      currency: "MYR",
      balance: 0,
    });
  }
});

router.post("/api/jili/cancelSessionBet", async (req, res) => {
  try {
    const {
      reqId,
      token,
      round,
      betAmount,
      winloseAmount,
      preserve,
      sessionId,
    } = req.body;

    if (!token) {
      return res.status(200).json({
        errorCode: 3,
        message: "Invalid parameter",
        username: null,
        currency: "MYR",
        balance: 0,
        txId: null,
      });
    }
    const firstFewCharacters = token.substring(0, jiliAgentId.length);

    if (firstFewCharacters !== jiliAgentId) {
      return res.status(200).json({
        errorCode: 5,
        message: "Invalid Agent",
        username: null,
        currency: "MYR",
        balance: 0,
        txId: null,
        token,
      });
    }
    const username = token.substring(
      firstFewCharacters.length,
      token.indexOf(":")
    );

    const [currentUser, existingTransaction, existingCancelledTransaction] =
      await Promise.all([
        User.findOne(
          { username, jiliGameToken: token },
          { wallet: 1, username: 1 }
        ).lean(),
        SlotJiliModal.findOne({ roundId: round, bet: true }).lean(),
        SlotJiliModal.findOne({ roundId: round, cancel: true }).lean(),
      ]);
    if (!currentUser) {
      return res.status(200).json({
        errorCode: 5,
        message: "Token expired",
        username: null,
        currency: "MYR",
        balance: 0,
        txId: null,
      });
    }

    if (!existingTransaction) {
      return res.status(200).json({
        errorCode: 2,
        message: "Round not found",
        username: currentUser.username,
        currency: "MYR",
        balance: roundToTwoDecimals(currentUser.wallet),
        txId: round,
      });
    }

    if (existingCancelledTransaction) {
      return res.status(200).json({
        errorCode: 1,
        message: "Already cancelled",
        username: currentUser.username,
        currency: "MYR",
        balance: roundToTwoDecimals(currentUser.wallet),
        txId: round,
      });
    }

    let updatedUserBalance;

    if (preserve === 0 || !preserve) {
      updatedUserBalance = await User.findOneAndUpdate(
        { username: currentUser.username },
        { $inc: { wallet: roundToTwoDecimals(betAmount || 0) } },
        { new: true }
      );
    } else {
      updatedUserBalance = await User.findOneAndUpdate(
        { username: currentUser.username },
        { $inc: { wallet: roundToTwoDecimals(preserve || 0) } },
        { new: true }
      );
    }

    await SlotJiliModal.findOneAndUpdate(
      { roundId: round },
      { $set: { cancel: true } },
      { upsert: true }
    );

    return res.status(200).json({
      errorCode: 0,
      message: "Success",
      username: updatedUserBalance.username,
      currency: "MYR",
      balance: roundToTwoDecimals(updatedUserBalance.wallet),
      txId: round,
    });
  } catch (error) {
    console.error("JILI: Error in cancelSessionBet:", error.message);
    return res.status(200).json({
      errorCode: 5,
      message: "Internal Server Error",
      username: null,
      currency: "MYR",
      balance: 0,
    });
  }
});

router.post("/api/jilislot/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotJiliModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      cancel: { $ne: true },
      gametype: "SLOT",

      settle: true,
    });

    // Aggregate turnover and win/loss for each player
    let playerSummary = {};

    records.forEach((record) => {
      const username = record.username;

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
        gamename: "JILI",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("JILI: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "JILI: Failed to fetch win/loss report",
        zh: "JILI: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/jilislot/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotJiliModal.find({
        username: user.username,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        gametype: "SLOT",
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
          gamename: "JILI",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("JILI: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JILI: Failed to fetch win/loss report",
          zh: "JILI: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jilislot/:userId/gamedata",
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

          if (slotGames["JILI"]) {
            totalTurnover += slotGames["JILI"].turnover || 0;
            totalWinLoss += slotGames["JILI"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JILI",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("JILI: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JILI: Failed to fetch win/loss report",
          zh: "JILI: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jilislot/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotJiliModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        gametype: "SLOT",
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
          gamename: "JILI",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("JILI: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "JILI: Failed to fetch win/loss report",
          zh: "JILI: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jilislot/kioskreport",
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

          if (liveCasino["JILI"]) {
            totalTurnover += Number(liveCasino["JILI"].turnover || 0);
            totalWinLoss += Number(liveCasino["JILI"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JILI",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("JILI: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "JILI: Failed to fetch win/loss report",
          zh: "JILI: 获取盈亏报告失败",
        },
      });
    }
  }
);

// -------------

router.post("/api/jilifish/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotJiliModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      cancel: { $ne: true },
      gametype: "FISH",

      settle: true,
    });

    // Aggregate turnover and win/loss for each player
    let playerSummary = {};

    records.forEach((record) => {
      const username = record.username;

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
        gamename: "JILI",
        gamecategory: "Fishing",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("JILI: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "JILI: Failed to fetch win/loss report",
        zh: "JILI: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/jilifish/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotJiliModal.find({
        username: user.username,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        gametype: "FISH",

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
          gamename: "JILI",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("JILI: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JILI: Failed to fetch win/loss report",
          zh: "JILI: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jilifish/:userId/gamedata",
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
          const slotGames = Object.fromEntries(gameCategories["Fishing"]);

          if (slotGames["JILI"]) {
            totalTurnover += slotGames["JILI"].turnover || 0;
            totalWinLoss += slotGames["JILI"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JILI",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("JILI: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JILI: Failed to fetch win/loss report",
          zh: "JILI: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jilifish/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotJiliModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        gametype: "FISH",

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
          gamename: "JILI",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("JILI: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "JILI: Failed to fetch win/loss report",
          zh: "JILI: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jilifish/kioskreport",
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
          const liveCasino = Object.fromEntries(gameCategories["Fishing"]);

          if (liveCasino["JILI"]) {
            totalTurnover += Number(liveCasino["JILI"].turnover || 0);
            totalWinLoss += Number(liveCasino["JILI"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JILI",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("JILI: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "JILI: Failed to fetch win/loss report",
          zh: "JILI: 获取盈亏报告失败",
        },
      });
    }
  }
);
module.exports = router;
