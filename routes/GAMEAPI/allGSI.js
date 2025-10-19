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
const SlotLiveGSCModal = require("../../models/slot_live_gsc.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const qs = require("querystring");
const GameWalletLog = require("../../models/gamewalletlog.model");
const GameNetentGameModal = require("../../models/slot_nententDatabase.model");
const GameJDBGameModal = require("../../models/slot_jdbDatabase.model");
const GameRedTigerGameModal = require("../../models/slot_redtigerDatabase.model");
const GameNoLimitGameModal = require("../../models/slot_nolimitDatabase.model");
const GameBigGamingGameModal = require("../../models/slot_biggamingDatabase.model");

require("dotenv").config();

const gsiOPCode = "J714";
const gsiSecret = process.env.GSI_SECRET;
const webURL = "https://www.oc7.me/";
const gsiAPIURL = "https://production.gsimw.com/";

function generateSignature(requestTime, method) {
  const raw = `${requestTime}${gsiSecret}${method}${gsiOPCode}`;

  return crypto.createHash("md5").update(raw).digest("hex");
}

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateCallbackSignature(requestTime, method) {
  const raw = `${gsiOPCode}${requestTime}${method}${gsiSecret}`;

  return crypto.createHash("md5").update(raw).digest("hex");
}

function generateRandomPassword() {
  const randomNumber = crypto.randomInt(1000, 10000);

  return `OC7${randomNumber}`;
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

router.post("/api/gsc/sync-redtiger", async (req, res) => {
  try {
    // 1) Call provider API
    const requestTime = moment.utc().unix();
    const sign = generateSignature(requestTime, "gamelist");

    const response = await axios.get(
      `${gsiAPIURL}api/operators/provider-games`,
      {
        params: {
          product_code: "1169",
          operator_code: gsiOPCode,
          sign,
          request_time: requestTime,
        },
        timeout: 15000,
      }
    );

    if (response.data.code !== 0) {
      console.log("RedTiger ERROR IN GETTING GAME LIST", response.data);
      return res.status(200).json({
        success: false,
        message: {
          en: "RedTiger: Unable to retrieve game lists. Please contact customer service for assistance.",
          zh: "RedTiger: 无法获取游戏列表，请联系客服以获取帮助。",
          ms: "RedTiger: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    // 2) Reformat + only activated
    const apiGames = (response.data.provider_games || [])
      .filter((g) => g.status === "ACTIVATED")
      .map((g) => ({
        GameCode: g.game_code,
        GameNameEN: g.game_name,
        GameType:
          g.game_type === "SLOT"
            ? "Slot"
            : g.game_type === "FISHING"
            ? "Fishing"
            : g.game_type, // keep as-is for others
        GameImage: g.image_url,
      }));

    // Sets for fast lookup
    const apiCodesSet = new Set(apiGames.map((g) => String(g.GameCode)));

    // 3) Pull all existing DB games (include gameNameEN for extra games reporting)
    const dbGames = await GameRedTigerGameModal.find(
      {},
      { gameID: 1, gameNameEN: 1, maintenance: 1 }
    ).lean();
    const dbIdsSet = new Set(dbGames.map((d) => String(d.gameID)));

    // 4) Compute missing games (in API but not in DB)
    const missingGames = apiGames
      .filter((g) => !dbIdsSet.has(String(g.GameCode)))
      .map((g) => ({
        GameCode: g.GameCode,
        GameType: g.GameType,
        GameNameEN: g.GameNameEN,
      }));

    // 5) Compute extra games (in DB but not in API)
    const extraGames = dbGames
      .filter((d) => !apiCodesSet.has(String(d.gameID)))
      .map((d) => ({
        GameCode: d.gameID,
        GameNameEN: d.gameNameEN,
      }));

    // 6) Compute the two update groups for maintenance flag
    //    - present in API => maintenance: false
    //    - not in API but in DB => maintenance: true
    const apiCodesArray = Array.from(apiCodesSet);

    // Bulk updates—guard against empty arrays
    const bulkOps = [];

    if (apiCodesArray.length > 0) {
      bulkOps.push({
        updateMany: {
          filter: { gameID: { $in: apiCodesArray } },
          update: { $set: { maintenance: false } },
        },
      });
    }

    // Find DB gameIDs not present in API
    if (dbGames.length > 0) {
      const dbOnlyIds = dbGames
        .map((d) => String(d.gameID))
        .filter((id) => !apiCodesSet.has(id));
      if (dbOnlyIds.length > 0) {
        bulkOps.push({
          updateMany: {
            filter: { gameID: { $in: dbOnlyIds } },
            update: { $set: { maintenance: true } },
          },
        });
      }
    }

    if (bulkOps.length > 0) {
      await GameRedTigerGameModal.bulkWrite(bulkOps, { ordered: false });
    }

    return res.status(200).json({
      success: true,
      summary: {
        apiCount: apiGames.length,
        dbCount: dbGames.length,
        missingCount: missingGames.length,
        extraCount: extraGames.length,
      },
      missingGames, // list of games present in API but absent in DB
      extraGames, // list of games present in DB but absent in API
    });
  } catch (error) {
    console.log("RedTiger sync error:", error?.response?.data || error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "RedTiger: Unable to sync game lists. Please contact customer service for assistance.",
        zh: "RedTiger: 无法同步游戏列表，请联系客服以获取帮助。",
        ms: "RedTiger: Tidak dapat menyegerakkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

// Create Player route
router.post("/api/gsc/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, gameCode, gameType, clientPlatform } = req.body;
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (user.gameLock.gsi.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
        },
      });
    }

    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();

    let lang = "0";

    if (gameLang === "en") {
      lang = "0";
    } else if (gameLang === "zh") {
      lang = "2";
    } else if (gameLang === "ms") {
      lang = "36";
    }

    let platform = "WEB";
    if (clientPlatform === "web") {
      platform = "WEB";
    } else if (clientPlatform === "mobile") {
      platform = "MOBILE";
    }

    let gamename;
    if (gameCode === 1016) {
      gamename = "YEEBET";
    } else if (gameCode === 1020) {
      gamename = "WM CASINO";
    } else if (gameCode === 1022) {
      gamename = "SEXYBCRT";
    } else if (gameCode === 1002) {
      gamename = "EVOLUTION";
    } else if (gameCode === 1052) {
      gamename = "DREAM GAMING";
    } else if (gameCode === 1222) {
      gamename = "TF GAMING";
    } else if (gameCode === 1004) {
      gamename = "BIG GAMING";
    } else {
      gamename = "GSC";
    }

    const requestTime = moment.utc().unix();
    const sign = generateSignature(requestTime, "launchgame");

    const normalisedUsername = user.username.toLowerCase();
    const randomPass = generateRandomPassword();

    const fields = {
      operator_code: gsiOPCode,
      member_account: normalisedUsername,
      password: randomPass,
      nickname: normalisedUsername,
      currency: "MYR",
      product_code: gameCode,
      game_type: gameType,
      language_code: lang,
      ip: clientIp,
      platform,
      sign,
      request_time: requestTime,
      operator_lobby_url: webURL,
    };

    const response = await axios.post(
      `${gsiAPIURL}api/operators/launch-game`,
      fields,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.code !== 200) {
      console.log(`${gamename} error to launch game`, response.data);

      if (response.data.code === 2000) {
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
          en: `${gamename}: Game launch failed. Please try again or customer service for assistance.`,
          zh: `${gamename}: 游戏启动失败，请重试或联系客服以获得帮助。`,
          ms: `${gamename}: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.`,
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      gamename
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data.url,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
      },
    });
  } catch (error) {
    console.log("GSC error in launching game", error.response.data);

    return res.status(200).json({
      success: false,
      message: {
        en: "GSC: Game launch failed. Please try again or customer service for assistance.",
        zh: "GSC: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "GSC: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/gsc/getProductList", async (req, res) => {
  try {
    const requestTime = moment.utc().unix();
    const sign = generateSignature(requestTime, "productlist");

    const response = await axios.get(
      `${gsiAPIURL}api/operators/available-products`,
      {
        params: {
          operator_code: gsiOPCode,
          sign,
          request_time: requestTime,
        },
      }
    );

    return res.status(200).json({
      success: true,
      product: response.data,
    });
  } catch (error) {
    console.log("GSC error in launching game", error.response.data);
    return res.status(200).json({
      success: false,
    });
  }
});

router.post("/api/jdb/getgamelist", async (req, res) => {
  try {
    const games = await GameJDBGameModal.find({ maintenance: false }).sort({
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
    console.log("JDB error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "JDB: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "JDB: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "JDB: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/jdb/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, gameCode, gameType, clientPlatform } = req.body;
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (user.gameLock.gsi.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
        },
      });
    }

    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();

    let lang = "0";

    if (gameLang === "en") {
      lang = "0";
    } else if (gameLang === "zh") {
      lang = "2";
    } else if (gameLang === "ms") {
      lang = "36";
    }

    let platform = "WEB";
    if (clientPlatform === "web") {
      platform = "WEB";
    } else if (clientPlatform === "mobile") {
      platform = "MOBILE";
    }

    const requestTime = moment.utc().unix();
    const sign = generateSignature(requestTime, "launchgame");

    const normalisedUsername = user.username.toLowerCase();
    const randomPass = generateRandomPassword();

    const fields = {
      operator_code: gsiOPCode,
      member_account: normalisedUsername,
      password: randomPass,
      nickname: normalisedUsername,
      currency: "MYR",
      game_code: gameCode,
      product_code: "1085",
      game_type: gameType,
      language_code: lang,
      ip: clientIp,
      platform,
      sign,
      request_time: requestTime,
      operator_lobby_url: webURL,
    };

    const response = await axios.post(
      `${gsiAPIURL}api/operators/launch-game`,
      fields,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.code !== 200) {
      console.log(`JDB error to launch game`, response.data);

      if (response.data.code === 2000) {
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
          en: `JDB: Game launch failed. Please try again or customer service for assistance.`,
          zh: `JDB: 游戏启动失败，请重试或联系客服以获得帮助。`,
          ms: `JDB: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.`,
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "JDB"
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data.url,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
      },
    });
  } catch (error) {
    console.log("JDB error in launching game", error.response.data);

    return res.status(200).json({
      success: false,
      message: {
        en: "JDB: Game launch failed. Please try again or customer service for assistance.",
        zh: "JDB: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "JDB: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/biggaming/getgamelist", async (req, res) => {
  try {
    const games = await GameBigGamingGameModal.find({
      maintenance: false,
    }).sort({
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

    const reformattedGamelist = games.map((game) => ({
      GameCode: game.gameID,
      GameNameEN: game.gameNameEN,
      GameNameZH: game.gameNameCN,
      GameType: game.gameType,
      GameImage: game.imageUrlEN || "",
      GameImageZH: game.imageUrlCN,
      Hot: game.hot,
    }));

    return res.status(200).json({
      success: true,
      gamelist: reformattedGamelist,
    });
  } catch (error) {
    console.log("BIG GAMING error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "BIG GAMING: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "BIG GAMING: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "BIG GAMING: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/api/biggaming/launchGame",
  authenticateToken,
  async (req, res) => {
    try {
      const { gameLang, gameCode, clientPlatform } = req.body;
      const userId = req.user.userId;
      const user = await User.findById(userId);

      if (user.gameLock.gsi.lock) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Your game access has been locked. Please contact customer support for further assistance.",
            zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
            ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
          },
        });
      }

      let clientIp = req.headers["x-forwarded-for"] || req.ip;
      clientIp = clientIp.split(",")[0].trim();

      let lang = "0";

      if (gameLang === "en") {
        lang = "0";
      } else if (gameLang === "zh") {
        lang = "2";
      } else if (gameLang === "ms") {
        lang = "36";
      }

      let platform = "WEB";
      if (clientPlatform === "web") {
        platform = "WEB";
      } else if (clientPlatform === "mobile") {
        platform = "MOBILE";
      }

      const requestTime = moment.utc().unix();
      const sign = generateSignature(requestTime, "launchgame");

      const normalisedUsername = user.username.toLowerCase();
      const randomPass = generateRandomPassword();

      const fields = {
        operator_code: gsiOPCode,
        member_account: normalisedUsername,
        password: randomPass,
        nickname: normalisedUsername,
        currency: "MYR",
        game_code: gameCode,
        product_code: "1004",
        game_type: "FISHING",
        language_code: lang,
        ip: clientIp,
        platform,
        sign,
        request_time: requestTime,
        operator_lobby_url: webURL,
      };

      const response = await axios.post(
        `${gsiAPIURL}api/operators/launch-game`,
        fields,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.code !== 200) {
        console.log(`BIG GAMING error to launch game`, response.data);

        if (response.data.code === 2000) {
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
            en: `BIG GAMING: Game launch failed. Please try again or customer service for assistance.`,
            zh: `BIG GAMING: 游戏启动失败，请重试或联系客服以获得帮助。`,
            ms: `BIG GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.`,
          },
        });
      }

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "BIG GAMING"
      );

      return res.status(200).json({
        success: true,
        gameLobby: response.data.url,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
        },
      });
    } catch (error) {
      console.log("BIG GAMING error in launching game", error.response.data);

      return res.status(200).json({
        success: false,
        message: {
          en: "BIG GAMING: Game launch failed. Please try again or customer service for assistance.",
          zh: "BIG GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "BIG GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
  }
);
// router.post("/api/test/comparegames", async (req, res) => {
//   try {
//     // Get games from API
//     const requestTime = moment.utc().unix();
//     const sign = generateSignature(requestTime, "gamelist");

//     // Fetch API games and database games in parallel
//     const [apiResponse, dbGames] = await Promise.all([
//       axios.get(`${gsiAPIURL}api/operators/provider-games`, {
//         params: {
//           product_code: "1166",
//           operator_code: gsiOPCode,
//           sign,
//           request_time: requestTime,
//         },
//       }),
//       GameNoLimitGameModal.find(
//         {},
//         { gameID: 1, gameNameEN: 1, _id: 0 }
//       ).lean(),
//     ]);

//     // Extract game codes/IDs
//     const apiGameCodes = new Set(
//       apiResponse.data.provider_games.map((game) => game.game_code)
//     );
//     const dbGameIDs = new Set(dbGames.map((game) => game.gameID));

//     // Find differences
//     const missingInDB = [...apiGameCodes].filter(
//       (code) => !dbGameIDs.has(code)
//     );
//     const extraInDB = [...dbGameIDs].filter((id) => !apiGameCodes.has(id));

//     // Update maintenance status
//     const [setMaintenanceTrue, setMaintenanceFalse] = await Promise.all([
//       // Set maintenance = true for games NOT in API (extra in DB)
//       GameNoLimitGameModal.updateMany(
//         { gameID: { $in: extraInDB } },
//         { $set: { maintenance: true } }
//       ),
//       // Set maintenance = false for games that exist in API
//       GameNoLimitGameModal.updateMany(
//         { gameID: { $in: [...apiGameCodes] } },
//         { $set: { maintenance: false } }
//       ),
//     ]);

//     // Get details for missing games
//     const missingGamesDetails = apiResponse.data.provider_games
//       .filter((game) => missingInDB.includes(game.game_code))
//       .map((game) => ({
//         gameCode: game.GameCode,
//         gameName: game.GameName,
//         gameType: game.GameType,
//         order: game.Order,
//       }));

//     // Get details for extra games
//     const extraGamesDetails = dbGames
//       .filter((game) => extraInDB.includes(game.gameID))
//       .map((game) => ({
//         gameID: game.gameID,
//         gameNameEN: game.gameNameEN,
//       }));

//     return res.status(200).json({
//       success: true,
//       summary: {
//         totalAPIGames: apiGameCodes.size,
//         totalDBGames: dbGameIDs.size,
//         missingInDB: missingInDB.length,
//         extraInDB: extraInDB.length,
//         matching: apiGameCodes.size - missingInDB.length,
//       },
//       maintenanceUpdates: {
//         setToMaintenance: setMaintenanceTrue.modifiedCount,
//         setToActive: setMaintenanceFalse.modifiedCount,
//       },
//       missingInDatabase: missingGamesDetails,
//       extraInDatabase: extraGamesDetails,
//     });
//   } catch (error) {
//     console.error("Compare games error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error comparing games",
//       error: error.message,
//     });
//   }
// });

// router.post("/api/test/getgamelist", async (req, res) => {
//   try {
//     const requestTime = moment.utc().unix();
//     const sign = generateSignature(requestTime, "gamelist");

//     const response = await axios.get(
//       `${gsiAPIURL}api/operators/provider-games`,
//       {
//         params: {
//           product_code: "1169",
//           operator_code: gsiOPCode,
//           sign,
//           request_time: requestTime,
//         },
//       }
//     );

//     if (response.data.code !== 0) {
//       console.log("NETENT ERROR IN GETTING GAME LIST", response.data);
//       return res.status(200).json({
//         success: false,
//         message: {
//           en: "NETENT: Unable to retrieve game lists. Please contact customer service for assistance.",
//           zh: "NETENT: 无法获取游戏列表，请联系客服以获取帮助。",
//           ms: "NETENT: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
//         },
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       gamelist: response.data,
//     });
//   } catch (error) {
//     console.log("NETENT error fetching game list:", error.message);
//     return res.status(200).json({
//       success: false,
//       message: {
//         en: "NETENT: Unable to retrieve game lists. Please contact customer service for assistance.",
//         zh: "NETENT: 无法获取游戏列表，请联系客服以获取帮助。",
//         ms: "NETENT: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
//       },
//     });
//   }
// });

router.post("/api/netent/getgamelist", async (req, res) => {
  try {
    const games = await GameNetentGameModal.find({ maintenance: false }).sort({
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

    const reformattedGamelist = games.map((game) => ({
      GameCode: game.gameID,
      GameNameEN: game.gameNameEN,
      GameNameZH: game.gameNameCN,
      GameNameMS: game.gameNameMS,
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
    console.log("NETENT error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "NETENT: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "NETENT: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "NETENT: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});
router.post("/api/netent/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, gameCode, clientPlatform } = req.body;
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (user.gameLock.gsi.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
        },
      });
    }

    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();

    let lang = "0";

    if (gameLang === "en") {
      lang = "0";
    } else if (gameLang === "zh") {
      lang = "2";
    } else if (gameLang === "ms") {
      lang = "36";
    }

    let platform = "WEB";
    if (clientPlatform === "web") {
      platform = "WEB";
    } else if (clientPlatform === "mobile") {
      platform = "MOBILE";
    }

    const requestTime = moment.utc().unix();
    const sign = generateSignature(requestTime, "launchgame");

    const normalisedUsername = user.username.toLowerCase();
    const randomPass = generateRandomPassword();

    const fields = {
      operator_code: gsiOPCode,
      member_account: normalisedUsername,
      password: randomPass,
      nickname: normalisedUsername,
      currency: "MYR",
      game_code: gameCode,
      product_code: "1168",
      game_type: "SLOT",
      language_code: lang,
      ip: clientIp,
      platform,
      sign,
      request_time: requestTime,
      operator_lobby_url: webURL,
    };

    const response = await axios.post(
      `${gsiAPIURL}api/operators/launch-game`,
      fields,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.code !== 200) {
      console.log(`NETENT error to launch game`, response.data);

      if (response.data.code === 2000) {
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
          en: `NETENT: Game launch failed. Please try again or customer service for assistance.`,
          zh: `NETENT: 游戏启动失败，请重试或联系客服以获得帮助。`,
          ms: `NETENT: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.`,
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "NETENT"
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data.url,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
      },
    });
  } catch (error) {
    console.log("NETENT error in launching game", error.response.data);

    return res.status(200).json({
      success: false,
      message: {
        en: "NETENT: Game launch failed. Please try again or customer service for assistance.",
        zh: "NETENT: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "NETENT: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/nolimit/getgamelist", async (req, res) => {
  try {
    const games = await GameNoLimitGameModal.find({ maintenance: false }).sort({
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

    const reformattedGamelist = games.map((game) => ({
      GameCode: game.gameID,
      GameNameEN: game.gameNameEN,
      GameNameZH: game.gameNameCN,
      GameNameMS: game.gameNameMS,
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
    console.log("NOLIMIT error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "NOLIMIT: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "NOLIMIT: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "NOLIMIT: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/nolimit/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, gameCode, clientPlatform } = req.body;
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (user.gameLock.gsi.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
        },
      });
    }

    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();

    let lang = "0";

    if (gameLang === "en") {
      lang = "0";
    } else if (gameLang === "zh") {
      lang = "2";
    } else if (gameLang === "ms") {
      lang = "36";
    }

    let platform = "WEB";
    if (clientPlatform === "web") {
      platform = "WEB";
    } else if (clientPlatform === "mobile") {
      platform = "MOBILE";
    }

    const requestTime = moment.utc().unix();
    const sign = generateSignature(requestTime, "launchgame");

    const normalisedUsername = user.username.toLowerCase();
    const randomPass = generateRandomPassword();

    const fields = {
      operator_code: gsiOPCode,
      member_account: normalisedUsername,
      password: randomPass,
      nickname: normalisedUsername,
      currency: "MYR",
      game_code: gameCode,
      product_code: "1166",
      game_type: "SLOT",
      language_code: lang,
      ip: clientIp,
      platform,
      sign,
      request_time: requestTime,
      operator_lobby_url: webURL,
    };

    const response = await axios.post(
      `${gsiAPIURL}api/operators/launch-game`,
      fields,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.code !== 200) {
      console.log(`NOLIMIT error to launch game`, response.data);

      if (response.data.code === 2000) {
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
          en: `NOLIMIT: Game launch failed. Please try again or customer service for assistance.`,
          zh: `NOLIMIT: 游戏启动失败，请重试或联系客服以获得帮助。`,
          ms: `NOLIMIT: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.`,
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "NOLIMIT"
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data.url,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
      },
    });
  } catch (error) {
    console.log("NOLIMIT error in launching game", error.response.data);

    return res.status(200).json({
      success: false,
      message: {
        en: "NOLIMIT: Game launch failed. Please try again or customer service for assistance.",
        zh: "NOLIMIT: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "NOLIMIT: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/redtiger/getgamelist", async (req, res) => {
  try {
    const games = await GameRedTigerGameModal.find({ maintenance: false }).sort(
      {
        hot: -1,
        createdAt: -1,
      }
    );

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

    const reformattedGamelist = games.map((game) => ({
      GameCode: game.gameID,
      GameNameEN: game.gameNameEN,
      GameNameZH: game.gameNameCN,
      GameNameMS: game.gameNameMS,
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
    console.log("RED_TIGER error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "RED TIGER: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "RED TIGER: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "RED TIGER: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/redtiger/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, gameCode, clientPlatform } = req.body;
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (user.gameLock.gsi.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
        },
      });
    }

    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();

    let lang = "0";

    if (gameLang === "en") {
      lang = "0";
    } else if (gameLang === "zh") {
      lang = "2";
    } else if (gameLang === "ms") {
      lang = "36";
    }

    let platform = "WEB";
    if (clientPlatform === "web") {
      platform = "WEB";
    } else if (clientPlatform === "mobile") {
      platform = "MOBILE";
    }

    const requestTime = moment.utc().unix();
    const sign = generateSignature(requestTime, "launchgame");

    const normalisedUsername = user.username.toLowerCase();
    const randomPass = generateRandomPassword();

    const fields = {
      operator_code: gsiOPCode,
      member_account: normalisedUsername,
      password: randomPass,
      nickname: normalisedUsername,
      currency: "MYR",
      game_code: gameCode,
      product_code: "1169",
      game_type: "SLOT",
      language_code: lang,
      ip: clientIp,
      platform,
      sign,
      request_time: requestTime,
      operator_lobby_url: webURL,
    };

    const response = await axios.post(
      `${gsiAPIURL}api/operators/launch-game`,
      fields,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.code !== 200) {
      console.log(`REDTIGER error to launch game`, response.data);

      if (response.data.code === 2000) {
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
          en: `RED TIGER: Game launch failed. Please try again or customer service for assistance.`,
          zh: `RED TIGER: 游戏启动失败，请重试或联系客服以获得帮助。`,
          ms: `RED TIGER: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.`,
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "RED TIGER"
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data.url,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
      },
    });
  } catch (error) {
    console.log("RED TIGER error in launching game", error.response.data);

    return res.status(200).json({
      success: false,
      message: {
        en: "RED TIGER: Game launch failed. Please try again or customer service for assistance.",
        zh: "RED TIGER: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "RED TIGER: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/allgsi//v1/api/seamless/balance", async (req, res) => {
  try {
    const { batch_requests, operator_code, currency, sign, request_time } =
      req.body;

    // Early validation - combine all checks for faster failure
    if (operator_code !== gsiOPCode) {
      return res.status(200).json({
        data: batch_requests.map((req) => ({
          member_account: req.member_account || "",
          product_code: req.product_code || 0,
          balance: 0,
          code: 1002,
          message: "proxykeyerror",
        })),
      });
    }

    // Currency validation
    const allowedCurrencies = ["MYR"];
    if (!allowedCurrencies.includes(currency)) {
      return res.status(200).json({
        data: batch_requests.map((req) => ({
          member_account: req.member_account || "",
          product_code: req.product_code || 0,
          balance: 0,
          code: 1002,
          message: "Currency not supported",
        })),
      });
    }

    // Signature validation
    const generatedSign = generateCallbackSignature(request_time, "getbalance");
    if (sign !== generatedSign) {
      return res.status(200).json({
        data: batch_requests.map((req) => ({
          member_account: req.member_account || "",
          product_code: req.product_code || 0,
          balance: 0,
          code: 1004,
          message: "Invalid signature",
        })),
      });
    }

    // Prepare error response template for reuse
    const createErrorResponse = (code, message) => {
      return batch_requests.map((req) => ({
        member_account: req.member_account || "",
        product_code: req.product_code || 0,
        balance: 0,
        code,
        message,
      }));
    };

    // Get unique member accounts efficiently
    const memberAccountSet = new Set();
    for (const req of batch_requests) {
      if (req.member_account) memberAccountSet.add(req.member_account);
    }
    const memberAccounts = Array.from(memberAccountSet);

    // Skip DB query if no valid accounts
    if (memberAccounts.length === 0) {
      return res.status(200).json({
        data: createErrorResponse(1000, "Member does not exist"),
      });
    }

    // Fetch all users in one database query with lean
    const users = await User.find(
      { username: { $in: memberAccounts } },
      { username: 1, wallet: 1 }
    ).lean();

    // Create a map for faster lookups
    const userMap = {};
    for (const user of users) {
      userMap[user.username] = user;
    }

    // Process all requests using the user map (no need for Promise.all)
    const data = batch_requests.map((request) => {
      const { member_account, product_code } = request;
      if (!member_account) {
        return {
          member_account: "",
          product_code: product_code || 0,
          balance: 0,
          code: 1000,
          message: "Member does not exist",
        };
      }

      const user = userMap[member_account];
      if (!user) {
        return {
          member_account,
          product_code: product_code || 0,
          balance: 0,
          code: 1000,
          message: "Member does not exist",
        };
      }

      // Calculate balance with currency conversion if needed
      const balance = roundToTwoDecimals(user.wallet || 0);

      return {
        member_account,
        product_code: product_code || 0,
        balance,
        code: 0,
        message: "",
      };
    });

    return res.status(200).json({ data });
  } catch (error) {
    console.log("GSI error in balance API:", error);

    // Reuse the batch requests array if available, otherwise create an empty array
    const errorData = (req.body?.batch_requests || []).map((req) => ({
      member_account: req.member_account || "",
      product_code: req.product_code || 0,
      balance: 0,
      code: 999,
      message: "Internal server error",
    }));

    return res.status(200).json({ data: errorData });
  }
});
router.post("/api/allgsi//v1/api/seamless/withdraw", async (req, res) => {
  try {
    const { batch_requests, operator_code, currency, sign, request_time } =
      req.body;

    // Validate operator code
    if (operator_code !== gsiOPCode) {
      return res.status(200).json({
        data: batch_requests.map((req) => ({
          member_account: req.member_account,
          product_code: req.product_code,
          before_balance: 0,
          balance: 0,
          code: 1002,
          message: "proxykeyerror",
        })),
      });
    }

    const allowedCurrencies = ["MYR"];
    if (!allowedCurrencies.includes(currency)) {
      return res.status(200).json({
        data: batch_requests.map((req) => ({
          member_account: req.member_account,
          product_code: req.product_code,
          before_balance: 0,
          balance: 0,
          code: 1002,
          message: "Currency not supported",
        })),
      });
    }

    // Validate signature
    const generatedSign = generateCallbackSignature(request_time, "withdraw");
    if (sign !== generatedSign) {
      return res.status(200).json({
        data: batch_requests.map((req) => ({
          member_account: req.member_account,
          product_code: req.product_code,
          before_balance: 0,
          balance: 0,
          code: 1004,
          message: "Invalid signature",
        })),
      });
    }

    const allTransactionIds = [];
    batch_requests.forEach((request) => {
      if (request.transactions && Array.isArray(request.transactions)) {
        request.transactions.forEach((transaction) => {
          if (transaction.id) {
            allTransactionIds.push(transaction.id);
          }
        });
      }
    });

    const existingTransactions =
      allTransactionIds.length > 0
        ? await SlotLiveGSCModal.find(
            { tranId: { $in: allTransactionIds } },
            { tranId: 1, username: 1 }
          ).lean()
        : [];

    const existingTransactionMap = {};
    existingTransactions.forEach((tx) => {
      existingTransactionMap[tx.tranId] = tx;
    });

    const memberAccounts = [
      ...new Set(batch_requests.map((req) => req.member_account)),
    ];

    // Fetch all users in a single query
    const users = await User.find(
      { username: { $in: memberAccounts } },
      { username: 1, wallet: 1, _id: 1, "gameLock.gsi.lock": 1 }
    ).lean();

    // Create user lookup map
    const userMap = {};
    users.forEach((user) => {
      userMap[user.username] = user;
    });

    const validDeductionActions = [
      "BET",
      "FREEBET",
      "SETTLED",
      "ROLLBACK",
      "CANCEL",
      "ADJUSTMENT",
      "JACKPOT",
      "BONUS",
      "TIP",
      "PROMO",
      "LEADERBOARD",
      "BET_PRESERVE",
      "PRESERVE_REFUND",
    ];

    // Process each request in batch
    const data = await Promise.all(
      batch_requests.map(async (request) => {
        const { member_account, product_code, game_type, transactions } =
          request;
        // Find user from map
        const user = userMap[member_account];
        if (!user) {
          return {
            member_account,
            product_code,
            before_balance: 0,
            balance: 0,
            code: 1000,
            message: "Member does not exist",
          };
        }

        // Check if user is blocked
        if (user.gameLock && user.gameLock.gsi && user.gameLock.gsi.lock) {
          return {
            member_account,
            product_code,
            before_balance: roundToTwoDecimals(user.wallet || 0),
            balance: roundToTwoDecimals(user.wallet || 0),
            code: 999,
            message: "Member is blocked",
          };
        }

        // Store initial balance
        const beforeBalance = roundToTwoDecimals(user.wallet || 0);

        let transactionSuccess = true;
        let errorMessage = "";
        let exCode = 0;

        // Group database operations
        const updateOperations = [];
        const createOperations = [];

        // Process transactions
        for (const transaction of transactions) {
          try {
            const {
              id,
              wager_code,
              amount,
              valid_bet_amount,
              action,
              round_id,
            } = transaction;

            // Check for duplicate transaction
            if (existingTransactionMap[id]) {
              transactionSuccess = false;
              errorMessage = "DuplicateAPI transactions";
              exCode = 1003;
              break;
            }

            // Validate action type
            if (!validDeductionActions.includes(action)) {
              transactionSuccess = false;
              errorMessage = `Invalid action type for withdraw: ${action}`;
              exCode = 1002;
              break;
            }

            // Prepare update operation
            updateOperations.push({
              updateOne: {
                filter: {
                  _id: user._id,
                  wallet: { $gte: roundToTwoDecimals(Math.abs(amount)) },
                },
                update: { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
              },
            });

            // Prepare create operation
            createOperations.push({
              tranId: id,
              betId: wager_code,
              username: member_account,
              platform: product_code,
              betamount: valid_bet_amount,
              action: action,
              bet: true,
              gametype: game_type,
              roundId: round_id || "",
            });
          } catch (err) {
            console.error("GSI withdraw transaction error:", err);
            transactionSuccess = false;
            errorMessage = "Transaction processing error";
            exCode = 999;
            break;
          }
        }

        // Return early if transaction failed
        if (!transactionSuccess) {
          return {
            member_account,
            product_code,
            before_balance: beforeBalance,
            balance: beforeBalance,
            code: exCode,
            message: errorMessage,
          };
        }

        // Execute bulk update if there are operations
        if (updateOperations.length > 0) {
          const bulkUpdateResult = await User.bulkWrite(updateOperations);

          // Check for update failure
          if (
            !bulkUpdateResult ||
            bulkUpdateResult.modifiedCount !== updateOperations.length
          ) {
            return {
              member_account,
              product_code,
              before_balance: beforeBalance,
              balance: beforeBalance,
              code: 1001,
              message: "Insufficient balance",
            };
          }
        }

        // Execute bulk create if there are operations
        if (createOperations.length > 0) {
          await SlotLiveGSCModal.insertMany(createOperations);
        }

        // Get final balance
        const finalUser = await User.findOne(
          { username: member_account },
          { wallet: 1 }
        ).lean();

        return {
          member_account,
          product_code,
          before_balance: beforeBalance,
          balance: roundToTwoDecimals(finalUser.wallet || 0),
          code: 0,
          message: "",
        };
      })
    );

    return res.status(200).json({ data });
  } catch (error) {
    console.error("GSI withdraw error:", error);

    return res.status(200).json({
      data: (req.body?.batch_requests || []).map((req) => ({
        member_account: req.member_account || "",
        product_code: req.product_code || 0,
        before_balance: 0,
        balance: 0,
        code: 999,
        message: "Internal server error",
      })),
    });
  }
});

router.post("/api/allgsi//v1/api/seamless/deposit", async (req, res) => {
  try {
    const { batch_requests, operator_code, currency, sign, request_time } =
      req.body;

    // Validate operator code
    if (operator_code !== gsiOPCode) {
      return res.status(200).json({
        data: batch_requests.map((req) => ({
          member_account: req.member_account,
          product_code: req.product_code,
          before_balance: 0,
          balance: 0,
          code: 1002,
          message: "proxykeyerror",
        })),
      });
    }

    // Validate signature
    const generatedSign = generateCallbackSignature(request_time, "deposit");
    if (sign !== generatedSign) {
      return res.status(200).json({
        data: batch_requests.map((req) => ({
          member_account: req.member_account,
          product_code: req.product_code,
          before_balance: 0,
          balance: 0,
          code: 1004,
          message: "Invalid signature",
        })),
      });
    }

    const allTransactionIds = [];
    const allWagerCodes = [];

    batch_requests.forEach((request) => {
      if (request.transactions && Array.isArray(request.transactions)) {
        request.transactions.forEach((transaction) => {
          if (transaction.id) allTransactionIds.push(transaction.id);
          if (transaction.wager_code)
            allWagerCodes.push(transaction.wager_code);
        });
      }
    });

    // Check for existing transactions and bets in a single query each
    const [existingTransactions, existingBets, settledBets] = await Promise.all(
      [
        SlotLiveGSCModal.find(
          { tranId: { $in: allTransactionIds } },
          { tranId: 1, username: 1 }
        ).lean(),

        SlotLiveGSCModal.find(
          { betId: { $in: allWagerCodes } },
          { betId: 1, username: 1 }
        ).lean(),

        // New query to find already settled wagers
        SlotLiveGSCModal.find(
          { betId: { $in: allWagerCodes }, settle: true },
          { betId: 1, username: 1 }
        ).lean(),
      ]
    );

    // Create lookup maps
    const existingTransactionMap = {};
    existingTransactions.forEach((tx) => {
      existingTransactionMap[tx.tranId] = tx;
    });

    const existingBetMap = {};
    existingBets.forEach((bet) => {
      existingBetMap[bet.betId] = bet;
    });

    const settledBetMap = {};
    settledBets.forEach((bet) => {
      settledBetMap[bet.betId] = bet;
    });

    // Extract unique member accounts
    const memberAccounts = [
      ...new Set(batch_requests.map((req) => req.member_account)),
    ];

    // Fetch all users in a single query
    const users = await User.find(
      { username: { $in: memberAccounts } },
      { username: 1, wallet: 1, _id: 1 }
    ).lean();

    // Create a map for quick user lookups
    const userMap = {};
    users.forEach((user) => {
      userMap[user.username] = user;
    });

    // Process each request in batch
    const data = await Promise.all(
      batch_requests.map(async (request) => {
        const { member_account, product_code, game_type, transactions } =
          request;
        // Find user from our pre-loaded map
        const user = userMap[member_account];
        if (!user) {
          return {
            member_account,
            product_code,
            before_balance: 0,
            balance: 0,
            code: 1000,
            message: "Member does not exist",
          };
        }
        let beforeBalance = roundToTwoDecimals(user.wallet || 0);
        let transactionSuccess = true;
        let errorMessage = "";
        let exCode = 0;

        // Group database operations
        const updateUserOperations = [];
        const updateBetOperations = [];

        // Process all transactions for this user
        for (const transaction of transactions) {
          try {
            const { id, wager_code, amount, action } = transaction;
            // Check if transaction already exists
            if (existingTransactionMap[id]) {
              transactionSuccess = false;
              errorMessage = "DuplicateAPI transactions";
              exCode = 1003;
              break;
            }

            // Check if bet exists
            if (!existingBetMap[wager_code]) {
              transactionSuccess = false;
              errorMessage = "bet does not exist";
              exCode = 1006;
              break;
            }

            if (settledBetMap[wager_code]) {
              transactionSuccess = false;
              errorMessage = "DuplicateAPI transactions";
              exCode = 1003;
              break;
            }
            // Prepare user balance update
            updateUserOperations.push({
              updateOne: {
                filter: { _id: user._id },
                update: { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
              },
            });

            if (action === "CANCEL" || action === "ROLLBACK") {
              updateBetOperations.push({
                updateOne: {
                  filter: { betId: wager_code },
                  update: {
                    $set: {
                      settle: true,
                      settleamount: roundToTwoDecimals(amount),
                      cancel: true,
                    },
                  },
                  upsert: true,
                },
              });
            }
            updateBetOperations.push({
              updateOne: {
                filter: { betId: wager_code },
                update: {
                  $set: {
                    settle: true,
                    settleamount: roundToTwoDecimals(amount),
                  },
                },
                upsert: true,
              },
            });
          } catch (err) {
            console.error("GSI deposit transaction error:", err);
            transactionSuccess = false;
            errorMessage = "Transaction processing error";
            exCode = 999;
            break;
          }
        }

        // If any transaction failed, return error
        if (!transactionSuccess) {
          return {
            member_account,
            product_code,
            before_balance: beforeBalance,
            balance: beforeBalance,
            code: exCode,
            message: errorMessage,
          };
        }

        // Execute all operations in parallel
        if (updateUserOperations.length > 0 && updateBetOperations.length > 0) {
          await Promise.all([
            User.bulkWrite(updateUserOperations),
            SlotLiveGSCModal.bulkWrite(updateBetOperations),
          ]);
        }

        // Get final user balance
        const finalUser = await User.findOne(
          { username: member_account },
          { wallet: 1 }
        ).lean();

        return {
          member_account,
          product_code,
          before_balance: beforeBalance,
          balance: roundToTwoDecimals(finalUser.wallet),
          code: 0,
          message: "",
        };
      })
    );

    return res.status(200).json({ data });
  } catch (error) {
    console.error("GSI deposit error:", error);

    return res.status(200).json({
      data: (req.body?.batch_requests || []).map((req) => ({
        member_account: req.member_account || "",
        product_code: req.product_code || 0,
        before_balance: 0,
        balance: 0,
        code: 999,
        message: "Internal server error",
      })),
    });
  }
});
// 2.4 PushBetData - Synchronize all data and status of bets, no amount change
router.post("/api/allgsi//v1/api/seamless/pushbetdata", async (req, res) => {
  try {
    const { operator_code, currency, transactions, sign, request_time } =
      req.body;

    // Validate operator code
    if (operator_code !== gsiOPCode) {
      return res.status(200).json({
        code: 1002,
        message: "proxykeyerror",
      });
    }

    // Validate signature
    const generatedSign = generateCallbackSignature(
      request_time,
      "pushbetdata"
    );
    if (sign !== generatedSign) {
      return res.status(200).json({
        code: 1004,
        message: "Invalid signature",
      });
    }

    const memberAccounts = [
      ...new Set(transactions.map((tx) => tx.member_account)),
    ];

    // Fetch all users in a single query
    const users = await User.find(
      { username: { $in: memberAccounts } },
      { username: 1 }
    ).lean();

    // Create a map for quick lookups
    const userMap = {};
    users.forEach((user) => {
      userMap[user.username] = true;
    });

    // Check if all users exist
    for (const transaction of transactions) {
      const { member_account } = transaction;
      if (!userMap[member_account]) {
        return res.status(200).json({
          code: 1000,
          message: "Member does not exist",
        });
      }
    }

    // Prepare bulk operations
    const bulkOperations = transactions.map((transaction) => {
      const { member_account, wager_code, valid_bet_amount, prize_amount } =
        transaction;

      return {
        updateOne: {
          filter: { username: member_account, betId: wager_code },
          update: {
            $set: {
              betamount: parseFloat(valid_bet_amount || 0),
              settleamount: parseFloat(prize_amount || 0),
            },
          },
          upsert: true,
        },
      };
    });

    // Execute all updates in a single operation
    if (bulkOperations.length > 0) {
      await SlotLiveGSCModal.bulkWrite(bulkOperations);
    }

    // All transactions processed successfully
    return res.status(200).json({
      code: 0,
      message: "",
    });
  } catch (error) {
    console.error("GSI pushbetdata error:", error);
    return res.status(200).json({
      code: 999,
      message: "Internal server error",
    });
  }
});

router.post("/api/wmcasino/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLiveGSCModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      platform: "1020",
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
        gamename: "WM CASINO",
        gamecategory: "Live Casino",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("WM CASINO: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "WM CASINO: Failed to fetch win/loss report",
        zh: "WM CASINO: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/wmcasino/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLiveGSCModal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1020",
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
          gamename: "WM CASINO",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("WM CASINO: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "WM CASINO: Failed to fetch win/loss report",
          zh: "WM CASINO: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/wmcasino/:userId/gamedata",
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

          if (gameCat["WM CASINO"]) {
            totalTurnover += gameCat["WM CASINO"].turnover || 0;
            totalWinLoss += gameCat["WM CASINO"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "WM CASINO",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("WM CASINO: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "WM CASINO: Failed to fetch win/loss report",
          zh: "WM CASINO: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/wmcasino/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLiveGSCModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1020",
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
          gamename: "WM CASINO",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("WM CASINO: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "WM CASINO: Failed to fetch win/loss report",
          zh: "WM CASINO: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/wmcasino/kioskreport",
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

          if (gameCat["WM CASINO"]) {
            totalTurnover += Number(gameCat["WM CASINO"].turnover || 0);
            totalWinLoss += Number(gameCat["WM CASINO"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "WM CASINO",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("WM CASINO: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "WM CASINO: Failed to fetch win/loss report",
          zh: "WM CASINO: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ----------------
router.post("/api/yeebet/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLiveGSCModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      platform: "1016",
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
        gamename: "YEEBET",
        gamecategory: "Live Casino",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("YEEBET: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "YEEBET: Failed to fetch win/loss report",
        zh: "YEEBET: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/yeebet/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLiveGSCModal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1016",
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
          gamename: "YEEBET",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("YEEBET: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "YEEBET: Failed to fetch win/loss report",
          zh: "YEEBET: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/yeebet/:userId/gamedata",
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

          if (gameCat["YEEBET"]) {
            totalTurnover += gameCat["YEEBET"].turnover || 0;
            totalWinLoss += gameCat["YEEBET"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "YEEBET",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("YEEBET: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "YEEBET: Failed to fetch win/loss report",
          zh: "YEEBET: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/yeebet/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLiveGSCModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1016",
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
          gamename: "YEEBET",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("YEEBET: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "YEEBET: Failed to fetch win/loss report",
          zh: "YEEBET: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/yeebet/kioskreport",
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

          if (gameCat["YEEBET"]) {
            totalTurnover += Number(gameCat["YEEBET"].turnover || 0);
            totalWinLoss += Number(gameCat["YEEBET"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "YEEBET",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("YEEBET: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "YEEBET: Failed to fetch win/loss report",
          zh: "YEEBET: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ----------------
router.post("/api/sexybcrt/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLiveGSCModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      platform: "1022",
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
        gamename: "SEXYBCRT",
        gamecategory: "Live Casino",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("SEXYBCRT: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "SEXYBCRT: Failed to fetch win/loss report",
        zh: "SEXYBCRT: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/sexybcrt/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLiveGSCModal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1022",
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
          gamename: "SEXYBCRT",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("SEXYBCRT: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "SEXYBCRT: Failed to fetch win/loss report",
          zh: "SEXYBCRT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/sexybcrt/:userId/gamedata",
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

          if (gameCat["SEXYBCRT"]) {
            totalTurnover += gameCat["SEXYBCRT"].turnover || 0;
            totalWinLoss += gameCat["SEXYBCRT"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "SEXYBCRT",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("SEXYBCRT: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "SEXYBCRT: Failed to fetch win/loss report",
          zh: "SEXYBCRT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/sexybcrt/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLiveGSCModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1022",
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
          gamename: "SEXYBCRT",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("SEXYBCRT: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "SEXYBCRT: Failed to fetch win/loss report",
          zh: "SEXYBCRT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/sexybcrt/kioskreport",
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

          if (gameCat["SEXYBCRT"]) {
            totalTurnover += Number(gameCat["SEXYBCRT"].turnover || 0);
            totalWinLoss += Number(gameCat["SEXYBCRT"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "SEXYBCRT",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("SEXYBCRT: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "SEXYBCRT: Failed to fetch win/loss report",
          zh: "SEXYBCRT: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ----------------
router.post("/api/dreamgaming/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLiveGSCModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      platform: "1052",
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
        gamename: "DREAM GAMING",
        gamecategory: "Live Casino",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log(
      "DREAM GAMING: Failed to fetch win/loss report:",
      error.message
    );
    return res.status(500).json({
      success: false,
      message: {
        en: "DREAM GAMING: Failed to fetch win/loss report",
        zh: "DREAM GAMING: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/dreamgaming/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLiveGSCModal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1052",
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
          gamename: "DREAM GAMING",
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
        "DREAM GAMING: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "DREAM GAMING: Failed to fetch win/loss report",
          zh: "DREAM GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/dreamgaming/:userId/gamedata",
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

          if (gameCat["DREAM GAMING"]) {
            totalTurnover += gameCat["DREAM GAMING"].turnover || 0;
            totalWinLoss += gameCat["DREAM GAMING"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "DREAM GAMING",
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
        "DREAM GAMING: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "DREAM GAMING: Failed to fetch win/loss report",
          zh: "DREAM GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/dreamgaming/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLiveGSCModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1052",
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
          gamename: "DREAM GAMING",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("DREAM GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "DREAM GAMING: Failed to fetch win/loss report",
          zh: "DREAM GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/dreamgaming/kioskreport",
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

          if (gameCat["DREAM GAMING"]) {
            totalTurnover += Number(gameCat["DREAM GAMING"].turnover || 0);
            totalWinLoss += Number(gameCat["DREAM GAMING"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "DREAM GAMING",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("DREAM GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "DREAM GAMING: Failed to fetch win/loss report",
          zh: "DREAM GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ----------------
router.post("/api/evolution/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLiveGSCModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      platform: "1002",
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
        gamename: "EVOLUTION",
        gamecategory: "Live Casino",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("EVOLUTION: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "EVOLUTION: Failed to fetch win/loss report",
        zh: "EVOLUTION: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/evolution/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLiveGSCModal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1002",
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
          gamename: "EVOLUTION",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("EVOLUTION: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "EVOLUTION: Failed to fetch win/loss report",
          zh: "EVOLUTION: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/evolution/:userId/gamedata",
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

          if (gameCat["EVOLUTION"]) {
            totalTurnover += gameCat["EVOLUTION"].turnover || 0;
            totalWinLoss += gameCat["EVOLUTION"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "EVOLUTION",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("EVOLUTION: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "EVOLUTION: Failed to fetch win/loss report",
          zh: "EVOLUTION: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/evolution/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLiveGSCModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1002",
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
          gamename: "EVOLUTION",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("EVOLUTION: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "EVOLUTION: Failed to fetch win/loss report",
          zh: "EVOLUTION: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/evolution/kioskreport",
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

          if (gameCat["EVOLUTION"]) {
            totalTurnover += Number(gameCat["EVOLUTION"].turnover || 0);
            totalWinLoss += Number(gameCat["EVOLUTION"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "EVOLUTION",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("EVOLUTION: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "EVOLUTION: Failed to fetch win/loss report",
          zh: "EVOLUTION: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ----------------
router.post("/api/nolimit/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLiveGSCModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      platform: "1166",
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
        gamename: "NOLIMIT",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("NOLIMIT: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "NOLIMIT: Failed to fetch win/loss report",
        zh: "NOLIMIT: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/nolimit/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLiveGSCModal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1166",
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
          gamename: "NOLIMIT",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("NOLIMIT: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "NOLIMIT: Failed to fetch win/loss report",
          zh: "NOLIMIT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/nolimit/:userId/gamedata",
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

          if (gameCat["NOLIMIT"]) {
            totalTurnover += gameCat["NOLIMIT"].turnover || 0;
            totalWinLoss += gameCat["NOLIMIT"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "NOLIMIT",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("NOLIMIT: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "NOLIMIT: Failed to fetch win/loss report",
          zh: "NOLIMIT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/nolimit/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLiveGSCModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1166",
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
          gamename: "NOLIMIT",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("NOLIMIT: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "NOLIMIT: Failed to fetch win/loss report",
          zh: "NOLIMIT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/nolimit/kioskreport",
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

          if (gameCat["NOLIMIT"]) {
            totalTurnover += Number(gameCat["NOLIMIT"].turnover || 0);
            totalWinLoss += Number(gameCat["NOLIMIT"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "NOLIMIT",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("NOLIMIT: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "NOLIMIT: Failed to fetch win/loss report",
          zh: "NOLIMIT: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ----------------
router.post("/api/jdbslot/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLiveGSCModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      platform: "1085",
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
        gamename: "JDB",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("JDB: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "JDB: Failed to fetch win/loss report",
        zh: "JDB: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/jdbslot/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLiveGSCModal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1085",
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
          gamename: "JDB",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("JDB: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JDB: Failed to fetch win/loss report",
          zh: "JDB: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jdbslot/:userId/gamedata",
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

          if (gameCat["JDB"]) {
            totalTurnover += gameCat["JDB"].turnover || 0;
            totalWinLoss += gameCat["JDB"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JDB",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("JDB: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JDB: Failed to fetch win/loss report",
          zh: "JDB: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jdbslot/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLiveGSCModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1085",
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
          gamename: "JDB",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("JDB: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "JDB: Failed to fetch win/loss report",
          zh: "JDB: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jdbslot/kioskreport",
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

          if (gameCat["JDB"]) {
            totalTurnover += Number(gameCat["JDB"].turnover || 0);
            totalWinLoss += Number(gameCat["JDB"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JDB",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("JDB: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "JDB: Failed to fetch win/loss report",
          zh: "JDB: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ----------------
router.post("/api/jdbfish/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLiveGSCModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      platform: "1085",
      gametype: "FISHING",
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
        gamename: "JDB",
        gamecategory: "Fishing",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("JDB: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "JDB: Failed to fetch win/loss report",
        zh: "JDB: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/jdbfish/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLiveGSCModal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1085",
        gametype: "FISHING",
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
          gamename: "JDB",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("JDB: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JDB: Failed to fetch win/loss report",
          zh: "JDB: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jdbfish/:userId/gamedata",
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
          gameCategories["Fishing"] &&
          gameCategories["Fishing"] instanceof Map
        ) {
          const gameCat = Object.fromEntries(gameCategories["Fishing"]);

          if (gameCat["JDB"]) {
            totalTurnover += gameCat["JDB"].turnover || 0;
            totalWinLoss += gameCat["JDB"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JDB",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("JDB: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "JDB: Failed to fetch win/loss report",
          zh: "JDB: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jdbfish/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLiveGSCModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1085",
        gametype: "FISHING",
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
          gamename: "JDB",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("JDB: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "JDB: Failed to fetch win/loss report",
          zh: "JDB: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/jdbfish/kioskreport",
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

          if (gameCat["JDB"]) {
            totalTurnover += Number(gameCat["JDB"].turnover || 0);
            totalWinLoss += Number(gameCat["JDB"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "JDB",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("JDB: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "JDB: Failed to fetch win/loss report",
          zh: "JDB: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ----------------
router.post("/api/redtiger/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLiveGSCModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      platform: "1169",
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
        gamename: "RED TIGER",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("RED TIGER: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "RED TIGER: Failed to fetch win/loss report",
        zh: "RED TIGER: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/redtiger/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLiveGSCModal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1169",
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
          gamename: "RED TIGER",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("RED TIGER: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "RED TIGER: Failed to fetch win/loss report",
          zh: "RED TIGER: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/redtiger/:userId/gamedata",
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

          if (gameCat["RED TIGER"]) {
            totalTurnover += gameCat["RED TIGER"].turnover || 0;
            totalWinLoss += gameCat["RED TIGER"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "RED TIGER",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("RED TIGER: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "RED TIGER: Failed to fetch win/loss report",
          zh: "RED TIGER: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/redtiger/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLiveGSCModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1169",
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
          gamename: "RED TIGER",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("RED TIGER: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "RED TIGER: Failed to fetch win/loss report",
          zh: "RED TIGER: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/redtiger/kioskreport",
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

          if (gameCat["RED TIGER"]) {
            totalTurnover += Number(gameCat["RED TIGER"].turnover || 0);
            totalWinLoss += Number(gameCat["RED TIGER"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "RED TIGER",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("RED TIGER: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "RED TIGER: Failed to fetch win/loss report",
          zh: "RED TIGER: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ----------------
router.post("/api/netent/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLiveGSCModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      platform: "1168",
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
        gamename: "NETENT",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("NETENT: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "NETENT: Failed to fetch win/loss report",
        zh: "NETENT: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/netent/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLiveGSCModal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1168",
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
          gamename: "NETENT",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("NETENT: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "NETENT: Failed to fetch win/loss report",
          zh: "NETENT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/netent/:userId/gamedata",
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

          if (gameCat["NETENT"]) {
            totalTurnover += gameCat["NETENT"].turnover || 0;
            totalWinLoss += gameCat["NETENT"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "NETENT",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("NETENT: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "NETENT: Failed to fetch win/loss report",
          zh: "NETENT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/netent/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLiveGSCModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1168",
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
          gamename: "NETENT",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("NETENT: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "NETENT: Failed to fetch win/loss report",
          zh: "NETENT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/netent/kioskreport",
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

          if (gameCat["NETENT"]) {
            totalTurnover += Number(gameCat["NETENT"].turnover || 0);
            totalWinLoss += Number(gameCat["NETENT"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "NETENT",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("NETENT: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "NETENT: Failed to fetch win/loss report",
          zh: "NETENT: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ------------------------

router.post("/api/tfgaming/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLiveGSCModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      platform: "1222",
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
        gamename: "TFGAMING",
        gamecategory: "E-Sports",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("TFGAMING: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "TFGAMING: Failed to fetch win/loss report",
        zh: "TFGAMING: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/tfgaming/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLiveGSCModal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1222",
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
          gamename: "TFGAMING",
          gamecategory: "E-Sports",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("TFGAMING: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "TFGAMING: Failed to fetch win/loss report",
          zh: "TFGAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/tfgaming/:userId/gamedata",
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
          gameCategories["E-Sports"] &&
          gameCategories["E-Sports"] instanceof Map
        ) {
          const gameCat = Object.fromEntries(gameCategories["E-Sports"]);

          if (gameCat["TFGAMING"]) {
            totalTurnover += gameCat["TFGAMING"].turnover || 0;
            totalWinLoss += gameCat["TFGAMING"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "TFGAMING",
          gamecategory: "E-Sports",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("TFGAMING: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "TFGAMING: Failed to fetch win/loss report",
          zh: "TFGAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/tfgaming/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLiveGSCModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1222",
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
          gamename: "TFGAMING",
          gamecategory: "E-Sports",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("TFGAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "TFGAMING: Failed to fetch win/loss report",
          zh: "TFGAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/tfgaming/kioskreport",
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
          gameCategories["E-Sports"] &&
          gameCategories["E-Sports"] instanceof Map
        ) {
          const gameCat = Object.fromEntries(gameCategories["E-Sports"]);

          if (gameCat["TFGAMING"]) {
            totalTurnover += Number(gameCat["TFGAMING"].turnover || 0);
            totalWinLoss += Number(gameCat["TFGAMING"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "TFGAMING",
          gamecategory: "E-Sports",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("TFGAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "TFGAMING: Failed to fetch win/loss report",
          zh: "TFGAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ----------------
router.post("/api/biggaminglive/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLiveGSCModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      platform: "1004",
      gametype: "LIVE_CASINO",
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
        gamename: "BIG GAMING",
        gamecategory: "Live Casino",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("BIG GAMING: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "BIG GAMING: Failed to fetch win/loss report",
        zh: "BIG GAMING: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/biggaminglive/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLiveGSCModal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1004",
        gametype: "LIVE_CASINO",
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
          gamename: "BIG GAMING",
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
        "BIG GAMING: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "BIG GAMING: Failed to fetch win/loss report",
          zh: "BIG GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/biggaminglive/:userId/gamedata",
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

          if (gameCat["BIG GAMING"]) {
            totalTurnover += gameCat["BIG GAMING"].turnover || 0;
            totalWinLoss += gameCat["BIG GAMING"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "BIG GAMING",
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
        "BIG GAMING: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "BIG GAMING: Failed to fetch win/loss report",
          zh: "BIG GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/biggaminglive/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLiveGSCModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1004",
        gametype: "LIVE_CASINO",
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
          gamename: "BIG GAMING",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("BIG GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "BIG GAMING: Failed to fetch win/loss report",
          zh: "BIG GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/biggaminglive/kioskreport",
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

          if (gameCat["BIG GAMING"]) {
            totalTurnover += Number(gameCat["BIG GAMING"].turnover || 0);
            totalWinLoss += Number(gameCat["BIG GAMING"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "BIG GAMING",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("BIG GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "BIG GAMING: Failed to fetch win/loss report",
          zh: "BIG GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ----------------
router.post("/api/biggamingfish/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLiveGSCModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      platform: "1004",
      gametype: "FISHING",
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
        gamename: "BIG GAMING",
        gamecategory: "Fishing",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("BIG GAMING: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "BIG GAMING: Failed to fetch win/loss report",
        zh: "BIG GAMING: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/biggamingfish/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLiveGSCModal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1004",
        gametype: "FISHING",
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
          gamename: "BIG GAMING",
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
        "BIG GAMING: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "BIG GAMING: Failed to fetch win/loss report",
          zh: "BIG GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/biggamingfish/:userId/gamedata",
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
          gameCategories["Fishing"] &&
          gameCategories["Fishing"] instanceof Map
        ) {
          const gameCat = Object.fromEntries(gameCategories["Fishing"]);

          if (gameCat["BIG GAMING"]) {
            totalTurnover += gameCat["BIG GAMING"].turnover || 0;
            totalWinLoss += gameCat["BIG GAMING"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "BIG GAMING",
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
        "BIG GAMING: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "BIG GAMING: Failed to fetch win/loss report",
          zh: "BIG GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/biggamingfish/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLiveGSCModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        platform: "1004",
        gametype: "FISHING",
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
          gamename: "BIG GAMING",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("BIG GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "BIG GAMING: Failed to fetch win/loss report",
          zh: "BIG GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/biggamingfish/kioskreport",
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

          if (gameCat["BIG GAMING"]) {
            totalTurnover += Number(gameCat["BIG GAMING"].turnover || 0);
            totalWinLoss += Number(gameCat["BIG GAMING"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "BIG GAMING",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("BIG GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "BIG GAMING: Failed to fetch win/loss report",
          zh: "BIG GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);
module.exports = router;
