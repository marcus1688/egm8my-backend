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
const querystring = require("querystring");
const moment = require("moment");
const jwt = require("jsonwebtoken");
const SlotLivePPModal = require("../../models/slot_live_pp.model");
const vip = require("../../models/vip.model");
const GamePPGameModal = require("../../models/slot_live_ppDatabase.model");
const GameWalletLog = require("../../models/gamewalletlog.model");

require("dotenv").config();

const ppSecureLogin = "jh_oc7";
const ppSecret = process.env.PP_SECRET;
const webURL = "https://www.oc7.me/";
const ppOriAPIURL = "https://api-2133.ppgames.net/IntegrationService/v3";
const ppAPIURL =
  "https://api-2133.ppgames.net/IntegrationService/v3/http/CasinoGameAPI";
const cashierURL = "https://www.oc7.me/myaccount/deposit";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateSignature(fields, secretKey) {
  const data = [];
  for (const key in fields) {
    data.push(`${key}=${fields[key]}`);
  }
  data.sort();

  const rawData = data.join("&") + secretKey;

  const md5sum = crypto.createHash("md5");
  md5sum.update(rawData, "utf8");

  return md5sum.digest("hex").toUpperCase();
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

// router.post("/api/pp/import-games", async (req, res) => {
//   try {
//     const fs = require("fs");
//     const path = require("path");

//     // Path to your exported JSON file
//     const filePath = path.join(__dirname, "../../public/pp.json");

//     // Check if file exists
//     if (!fs.existsSync(filePath)) {
//       return res.status(404).json({
//         success: false,
//         message:
//           "joker.json file not found. Please ensure the file exists in public folder.",
//       });
//     }

//     // Read the JSON file
//     const fileContent = fs.readFileSync(filePath, "utf8");
//     const gameData = JSON.parse(fileContent);

//     // Validate that it's an array
//     if (!Array.isArray(gameData)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid JSON format. Expected an array of games.",
//       });
//     }

//     // Clean the games data - remove MongoDB specific fields
//     const cleanGames = gameData.map((game) => {
//       const cleanGame = { ...game };

//       return cleanGame;
//     });

//     console.log(`Preparing to import ${cleanGames.length} games...`);

//     // Delete all existing games and insert new ones
//     const deleteResult = await GamePPGameModal.deleteMany({});
//     console.log(`Deleted ${deleteResult.deletedCount} existing games`);

//     const insertResult = await GamePPGameModal.insertMany(cleanGames);
//     console.log(`Successfully imported ${insertResult.length} games`);

//     return res.status(200).json({
//       success: true,
//       message: {
//         en: `Successfully imported ${insertResult.length} games.`,
//         zh: `成功导入 ${insertResult.length} 个游戏。`,
//         ms: `Berjaya mengimport ${insertResult.length} permainan.`,
//       },
//       details: {
//         totalImported: insertResult.length,
//         deletedExisting: deleteResult.deletedCount,
//         filePath: filePath,
//       },
//     });
//   } catch (error) {
//     console.error("Error importing joker games:", error.message);

//     // Handle specific error types
//     if (error instanceof SyntaxError) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid JSON format in joker.json file.",
//         error: error.message,
//       });
//     }

//     if (error.code === 11000) {
//       return res.status(400).json({
//         success: false,
//         message: "Duplicate key error during import.",
//         error: "Some games have duplicate gameID values.",
//       });
//     }

//     return res.status(500).json({
//       success: false,
//       message: "Failed to import joker games.",
//       error: error.message,
//     });
//   }
// });

// router.post("/api/pp/syncgames", async (req, res) => {
//   try {
//     // First, get the current game list from Pragmatic Play API
//     const fields = {
//       secureLogin: ppSecureLogin,
//     };

//     const hash = generateSignature(fields, ppSecret);
//     const queryParams = new URLSearchParams({
//       ...fields,
//       hash,
//     }).toString();

//     const response = await axios.post(
//       `${ppAPIURL}/getCasinoGames`,
//       queryParams,
//       {
//         headers: {
//           "Content-Type": "application/x-www-form-urlencoded",
//         },
//       }
//     );

//     if (!response.data || response.data.error !== "0") {
//       return res.status(400).json({
//         success: false,
//         message: "Failed to fetch games from Pragmatic Play API",
//       });
//     }

//     const apiGameIds = response.data.gameList.map((game) => game.gameID);

//     // Get all games from database
//     const dbGames = await GamePPGameModal.find({}, "gameID");
//     const dbGameIds = dbGames.map((game) => game.gameID);

//     // Find games that are in database but not in API (these should be set to maintenance: true)
//     const extraInDb = dbGameIds.filter(
//       (gameId) => !apiGameIds.includes(gameId)
//     );

//     // Find games that are in API but not in database (missing games)
//     const missingInDb = apiGameIds.filter(
//       (gameId) => !dbGameIds.includes(gameId)
//     );

//     // Find games that exist in both (these should be set to maintenance: false)
//     const commonGames = dbGameIds.filter((gameId) =>
//       apiGameIds.includes(gameId)
//     );

//     // Update maintenance status for extra games (set to true)
//     if (extraInDb.length > 0) {
//       await GamePPGameModal.updateMany(
//         { gameID: { $in: extraInDb } },
//         { $set: { maintenance: true } }
//       );
//     }

//     // Update maintenance status for common games (set to false)
//     if (commonGames.length > 0) {
//       await GamePPGameModal.updateMany(
//         { gameID: { $in: commonGames } },
//         { $set: { maintenance: false } }
//       );
//     }

//     return res.status(200).json({
//       success: true,
//       data: {
//         summary: {
//           totalApiGames: apiGameIds.length,
//           totalDbGames: dbGameIds.length,
//           extraInDb: extraInDb.length,
//           missingInDb: missingInDb.length,
//           commonGames: commonGames.length,
//         },
//         extraInDb: extraInDb,
//         missingInDb: missingInDb,
//         message: {
//           en: `Sync completed. ${extraInDb.length} games set to maintenance, ${commonGames.length} games activated, ${missingInDb.length} games missing from database.`,
//           zh: `同步完成。${extraInDb.length} 个游戏设置为维护状态，${commonGames.length} 个游戏已激活，${missingInDb.length} 个游戏在数据库中缺失。`,
//           ms: `Sinkronisasi selesai. ${extraInDb.length} permainan ditetapkan untuk penyelenggaraan, ${commonGames.length} permainan diaktifkan, ${missingInDb.length} permainan hilang dari pangkalan data.`,
//         },
//       },
//     });
//   } catch (error) {
//     console.log("Game sync error:", error.message);
//     return res.status(500).json({
//       success: false,
//       message: {
//         en: "Game synchronization failed. Please try again.",
//         zh: "游戏同步失败，请重试。",
//         ms: "Sinkronisasi permainan gagal. Sila cuba lagi.",
//       },
//     });
//   }
// });

// router.post("/api/pp/getprovidergamelist", async (req, res) => {
//   const fields = {
//     secureLogin: ppSecureLogin,
//   };

//   const hash = generateSignature(fields, ppSecret);

//   const queryParams = new URLSearchParams({
//     ...fields,
//     hash,
//   }).toString();

//   try {
//     const response = await axios.post(
//       `${ppAPIURL}/getCasinoGames`,
//       queryParams,
//       {
//         headers: {
//           "Content-Type": "application/x-www-form-urlencoded",
//         },
//       }
//     );

//     return res.status(200).json({
//       success: true,
//       data: response.data,
//     });
//   } catch (error) {
//     console.log("PRAGMATIC PLAY Error creating user:", error.message);
//     return res.status(200).json({
//       success: false,
//       message: {
//         en: "PRAGMATIC PLAY: Game launch failed. Please try again or customer service for assistance.",
//         zh: "PRAGMATIC PLAY: 游戏启动失败，请重试或联系客服以获得帮助。",
//         ms: "PRAGMATIC PLAY: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
//       },
//     });
//   }
// });

router.post("/api/pp/register", authenticateToken, async (req, res) => {
  const user = await User.findById(req.user.userId);

  if (!user) {
    return res.status(200).json({
      success: false,
      message: {
        en: "User not found. Please try again or contact customer service for assistance.",
        zh: "用户未找到，请重试或联系客服以获取帮助。",
        ms: "Pengguna tidak ditemui, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }

  const normalisedUsername = user.username.toLowerCase();

  const fields = {
    secureLogin: ppSecureLogin,
    externalPlayerId: normalisedUsername,
    currency: "MYR",
  };

  const hash = generateSignature(fields, ppSecret);

  const queryParams = new URLSearchParams({
    ...fields,
    hash,
  }).toString();

  try {
    const response = await axios.post(
      `${ppAPIURL}/player/account/create`,
      queryParams,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (response.data.error !== "0") {
      console.log("PRAGMATIC PLAY: Error creating user", response.data);
      return res.status(200).json({
        success: false,
        message: {
          en: "PRAGMATIC PLAY: Game launch failed. Please try again or customer service for assistance.",
          zh: "PRAGMATIC PLAY: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "PRAGMATIC PLAY: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: {
        en: "User Registered Successfully",
        zh: "用户注册成功",
        ms: "Pendaftaran pengguna berjaya",
      },
    });
  } catch (error) {
    console.log("PRAGMATIC PLAY Error creating user:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "PRAGMATIC PLAY: Game launch failed. Please try again or customer service for assistance.",
        zh: "PRAGMATIC PLAY: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "PRAGMATIC PLAY: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/pp/getgamelist", async (req, res) => {
  try {
    const games = await GamePPGameModal.find({
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
        en: "PRAGMATIC PLAY: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "PRAGMATIC PLAY: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "PRAGMATIC PLAY: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

// router.post("/api/pp/getgamelist", async (req, res) => {
//   const fields = {
//     secureLogin: ppSecureLogin,
//     categories: "all",
//     country: "MY",
//   };

//   const hash = generateSignature(fields, ppSecret);

//   const queryParams = new URLSearchParams({
//     ...fields,
//     hash,
//   }).toString();

//   try {
//     const response = await axios.post(
//       `${ppAPIURL}/getLobbyGames`,
//       queryParams,
//       {
//         headers: {
//           "Content-Type": "application/x-www-form-urlencoded",
//         },
//       }
//     );

//     const gameTypeMap = {
//       vs: "Slot",
//       bj: "Blackjack",
//       rl: "Roulette",
//       cs: "Slot",
//       bc: "Baccarat",
//       bn: "Baccarat",
//     };

//     const games = response.data.games.all.map((game) => ({
//       GameCode: game.gameID,
//       GameNameEN: game.gameName,
//       GameImage: `https://49762968e7.puajflzrfe.net/game_pic/square/200/${game.gameID}.png`, // Added the full URL as requested
//       GameType: gameTypeMap[game.gameTypeID] || "PP", // Map GameType or return "Unknown"
//     }));

//     return res.status(200).json({
//       success: true,
//       gamelist: games,
//     });
//   } catch (error) {
//     console.error("Error fetching game list:", error.message);
//     return res.status(200).json({
//       success: false,
//       message: {
//         en: "PRAGMATIC PLAY: Unable to retrieve game lists. Please contact customer service for assistance.",
//         zh: "PRAGMATIC PLAY: 无法获取游戏列表，请联系客服以获取帮助。",
//         ms: "PRAGMATIC PLAY: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
//       },
//     });
//   }
// });

router.post("/api/pplive/launchGame", authenticateToken, async (req, res) => {
  try {
    //en
    const { gameLang } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found. Please try again or contact customer service for assistance.",
          zh: "用户未找到，请重试或联系客服以获取帮助。",
          ms: "Pengguna tidak ditemui, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    if (user.gameLock.pp.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
        },
      });
    }

    const normalisedUsername = user.username.toLowerCase();

    // First, try to register the user
    const registrationFields = {
      secureLogin: ppSecureLogin,
      externalPlayerId: normalisedUsername,
      currency: "MYR",
    };

    const registrationHash = generateSignature(registrationFields, ppSecret);
    const registrationParams = new URLSearchParams({
      ...registrationFields,
      hash: registrationHash,
    }).toString();

    try {
      const registrationResponse = await axios.post(
        `${ppAPIURL}/player/account/create`,
        registrationParams,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      if (registrationResponse.data.error !== "0") {
        console.log(
          "PRAGMATIC PLAY: Error creating user",
          registrationResponse.data
        );
        return res.status(200).json({
          success: false,
          message: {
            en: "PRAGMATIC PLAY LIVE: Game launch failed. Please try again or customer service for assistance.",
            zh: "PRAGMATIC PLAY LIVE: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "PRAGMATIC PLAY LIVE: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }
    } catch (error) {
      console.log("PRAGMATIC PLAY LIVE Error creating user:", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "PRAGMATIC PLAY LIVE: Game launch failed. Please try again or customer service for assistance.",
          zh: "PRAGMATIC PLAY LIVE: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "PRAGMATIC PLAY LIVE: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    let lang = "en";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "zh";
    } else if (gameLang === "ms") {
      lang = "id";
    }

    let token = `${user.username}:${generateRandomCode()}`;

    const launchFields = {
      secureLogin: ppSecureLogin,
      symbol: "101",
      language: lang,
      token: token,
      externalPlayerId: normalisedUsername,
      currency: "MYR",
      cashierUrl: cashierURL,
      lobbyUrl: webURL,
    };

    const launchHash = generateSignature(launchFields, ppSecret);
    const launchParams = new URLSearchParams({
      ...launchFields,
      hash: launchHash,
    }).toString();

    const launchResponse = await axios.post(
      `${ppAPIURL}/game/url`,
      launchParams,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (launchResponse.data.error !== "0") {
      console.log(
        "PRAGMATIC PLAY LIVE error in launching game",
        launchResponse.data
      );
      return res.status(200).json({
        success: false,
        message: {
          en: "PRAGMATIC PLAY LIVE: Game launch failed. Please try again or customer service for assistance.",
          zh: "PRAGMATIC PLAY LIVE: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "PRAGMATIC PLAY LIVE: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        ppliveGameToken: token,
      },
      { new: true }
    );

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "PRAGMATIC PLAY"
    );

    return res.status(200).json({
      success: true,
      gameLobby: launchResponse.data.gameURL,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
      },
    });
  } catch (error) {
    console.log("PRAGMATIC PLAY LIVE error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "PRAGMATIC PLAY LIVE: Game launch failed. Please try again or customer service for assistance.",
        zh: "PRAGMATIC PLAY LIVE: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "PRAGMATIC PLAY LIVE: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/ppslot/launchGame", authenticateToken, async (req, res) => {
  try {
    //en zh
    const { gameLang, gameCode } = req.body;

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found. Please try again or contact customer service for assistance.",
          zh: "用户未找到，请重试或联系客服以获取帮助。",
          ms: "Pengguna tidak ditemui, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    if (user.gameLock.pp.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
        },
      });
    }

    const normalisedUsername = user.username.toLowerCase();

    // First, try to register the user
    const registrationFields = {
      secureLogin: ppSecureLogin,
      externalPlayerId: normalisedUsername,
      currency: "MYR",
    };

    const registrationHash = generateSignature(registrationFields, ppSecret);

    const registrationParams = new URLSearchParams({
      ...registrationFields,
      hash: registrationHash,
    }).toString();
    try {
      const registrationResponse = await axios.post(
        `${ppAPIURL}/player/account/create`,
        registrationParams,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      if (registrationResponse.data.error !== "0") {
        // Error 1 typically means user already exists, which is fine
        console.log(
          "PRAGMATIC PLAY SLOT: Error creating user",
          registrationResponse.data
        );
        return res.status(200).json({
          success: false,
          message: {
            en: "PRAGMATIC PLAY SLOT: Game launch failed. Please try again or customer service for assistance.",
            zh: "PRAGMATIC PLAY SLOT: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "PRAGMATIC PLAY SLOT: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }
    } catch (error) {
      console.log("PRAGMATIC PLAY SLOT Error creating user:", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "PRAGMATIC PLAY SLOT: Game launch failed. Please try again or customer service for assistance.",
          zh: "PRAGMATIC PLAY SLOT: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "PRAGMATIC PLAY SLOT: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    let lang = "en";
    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "zh";
    } else if (gameLang === "ms") {
      lang = "id";
    }

    let token = `${user.username}:${generateRandomCode()}`;

    const launchFields = {
      secureLogin: ppSecureLogin,
      symbol: gameCode,
      language: lang,
      token: token,
      externalPlayerId: normalisedUsername,
      currency: "MYR",
      cashierUrl: cashierURL,
      lobbyUrl: webURL,
    };

    const launchHash = generateSignature(launchFields, ppSecret);
    const launchParams = new URLSearchParams({
      ...launchFields,
      hash: launchHash,
    }).toString();

    const launchResponse = await axios.post(
      `${ppAPIURL}/game/url`,
      launchParams,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (launchResponse.data.error !== "0") {
      console.log(
        "PRAGMATIC PLAY SLOT error in launching game",
        launchResponse.data
      );
      return res.status(200).json({
        success: false,
        message: {
          en: "PRAGMATIC PLAY SLOT: Game launch failed. Please try again or customer service for assistance.",
          zh: "PRAGMATIC PLAY SLOT: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "PRAGMATIC PLAY SLOT: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        ppslotGameToken: token,
      },
      { new: true }
    );

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "PRAGMATIC PLAY"
    );

    return res.status(200).json({
      success: true,
      gameLobby: launchResponse.data.gameURL,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
      },
    });
  } catch (error) {
    console.log("PRAGMATIC PLAY SLOT error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "PRAGMATIC PLAY SLOT: Game launch failed. Please try again or customer service for assistance.",
        zh: "PRAGMATIC PLAY SLOT: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "PRAGMATIC PLAY SLOT: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/pp/authenticate", async (req, res) => {
  try {
    const { hash, token, providerId } = req.body;

    if (!token || !providerId) {
      return res.status(200).json({
        error: 7,
        description: "Bad param requested",
      });
    }

    const fields = {
      token: token,
      providerId: providerId,
    };
    let generatedHash = generateSignature(fields, ppSecret).toLowerCase();

    if (hash !== generatedHash) {
      return res.status(200).json({
        error: 5,
        description: "Invalid hash",
      });
    }

    const username = token.split(":")[0];

    const user = await User.findOne(
      { username },
      { username: 1, wallet: 1 }
    ).lean();

    if (!user) {
      return res.status(200).json({
        error: 4,
        description: "Player not found",
      });
    }

    return res.status(200).json({
      userId: user.username.toLowerCase(),
      currency: "MYR",
      cash: roundToTwoDecimals(user.wallet),
      bonus: 0,
      token: token,
      country: "AU",
      error: 0,
      description: "Success",
    });
  } catch (error) {
    console.log(
      "PRAGMATIC PLAY Error in game provider calling ae96 api",
      error.message
    );
    return res.status(200).json({
      error: 120,
      description: "Internal Server Error",
    });
  }
});

router.post("/api/pp/balance", async (req, res) => {
  try {
    const { hash, userId, providerId } = req.body;

    if (!userId || !providerId) {
      return res.status(200).json({
        error: 7,
        description: "Bad param requested",
      });
    }

    const fields = {
      userId: userId,
      providerId: providerId,
    };
    let generatedHash = generateSignature(fields, ppSecret).toLowerCase();

    if (hash !== generatedHash) {
      return res.status(200).json({
        error: 5,
        description: "Invalid hash",
      });
    }

    const currentUser = await User.findOne(
      { username: userId },
      { wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(200).json({
        error: 4,
        description: "Player not found",
      });
    }

    return res.status(200).json({
      currency: "MYR",
      cash: roundToTwoDecimals(currentUser.wallet),
      bonus: 0,
      error: 0,
      description: "Success",
    });
  } catch (error) {
    console.log(
      "PRAGMATIC PLAY Error in game provider calling ae96 balance api",
      error.message
    );
    return res.status(500).json({
      error: 120,
      description: "Internal Server Error",
    });
  }
});

router.post("/api/pp/bet", async (req, res) => {
  try {
    const {
      hash,
      userId,
      gameId,
      roundId,
      amount,
      providerId,
      reference,
      timestamp,
      roundDetails,
      bonusCode,
    } = req.body;

    if (
      !userId ||
      !gameId ||
      !roundId ||
      !providerId ||
      !reference ||
      !timestamp ||
      !roundDetails
    ) {
      return res.status(200).json({
        error: 7,
        description: "Bad param requested",
      });
    }

    const fields = {
      userId: userId,
      gameId: gameId,
      roundId: roundId,
      amount: amount,
      reference: reference,
      providerId: providerId,
      timestamp: timestamp,
      roundDetails: roundDetails,
    };

    if (bonusCode) fields.bonusCode = bonusCode;

    let generatedHash = generateSignature(fields, ppSecret).toLowerCase();

    if (hash !== generatedHash) {
      return res.status(200).json({
        error: 5,
        description: "Invalid hash",
      });
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne(
        { username: userId },
        { username: 1, wallet: 1, "gameLock.pp.lock": 1 }
      ).lean(),

      SlotLivePPModal.findOne(
        { betId: roundId, betreferenceId: reference },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        error: 4,
        description: "Player not found",
      });
    }

    if (currentUser.gameLock?.pp?.lock) {
      return res.status(200).json({
        error: 6,
        description: "Player is banned",
      });
    }

    if (existingBet) {
      return res.status(200).json({
        transactionId: reference,
        currency: "MYR",
        cash: roundToTwoDecimals(currentUser.wallet),
        bonus: 0,
        usedPromo: 0,
        error: 0,
        description: "Success",
      });
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        username: userId,
        wallet: { $gte: roundToTwoDecimals(amount || 0) },
      },
      { $inc: { wallet: -roundToTwoDecimals(amount || 0) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res.status(200).json({
        error: 1,
        description: "Insufficient balance",
      });
    }

    let gameType = "Slot";
    if (gameId.startsWith("v")) {
      gameType = "Slot";
    } else if (/^\d/.test(gameId)) {
      gameType = "Live";
    }

    await SlotLivePPModal.create({
      username: currentUser.username,
      betamount: roundToTwoDecimals(amount),
      betId: roundId,
      betreferenceId: reference,
      gameType: gameType,
    });

    return res.status(200).json({
      transactionId: reference,
      currency: "MYR",
      cash: roundToTwoDecimals(updatedUserBalance.wallet),
      bonus: 0,
      usedPromo: 0,
      error: 0,
      description: "Success",
    });
  } catch (error) {
    console.log(
      "PRAGMATIC PLAY Error in game provider calling ae96 bet api",
      error.message
    );
    return res.status(500).json({
      error: 120,
      description: "Internal Server Error",
    });
  }
});

router.post("/api/pp/result", async (req, res) => {
  try {
    const {
      hash,
      userId,
      gameId,
      roundId,
      amount,
      reference,
      providerId,
      timestamp,
      roundDetails,
      bonusCode,
      promoCampaignType,
      promoCampaignID,
      promoWinReference,
      promoWinAmount,
    } = req.body;

    if (
      !userId ||
      !gameId ||
      !roundId ||
      !providerId ||
      !reference ||
      !timestamp ||
      !roundDetails
    ) {
      return res.status(200).json({
        error: 7,
        description: "Bad param requested",
      });
    }

    const fields = {
      userId: userId,
      gameId: gameId,
      roundId: roundId,
      amount: amount,
      reference: reference,
      providerId: providerId,
      timestamp: timestamp,
      roundDetails: roundDetails,
    };

    if (bonusCode) fields.bonusCode = bonusCode;
    if (promoWinAmount) {
      fields.promoCampaignType = promoCampaignType;
      fields.promoCampaignID = promoCampaignID;
      fields.promoWinReference = promoWinReference;
      fields.promoWinAmount = promoWinAmount;
    }

    let generatedHash = generateSignature(fields, ppSecret).toLowerCase();

    if (hash !== generatedHash) {
      return res.status(200).json({
        error: 5,
        description: "Invalid hash",
      });
    }

    const [currentUser, existingBet, existingResult] = await Promise.all([
      User.findOne({ username: userId }, { wallet: 1 }).lean(),
      SlotLivePPModal.findOne({ betId: roundId }, { _id: 1 }).lean(),
      SlotLivePPModal.findOne(
        { settlereferenceId: reference },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        error: 4,
        description: "Player not found",
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        transactionId: reference,
        currency: "MYR",
        cash: roundToTwoDecimals(currentUser.wallet),
        bonus: 0,
        error: 0,
        description: "Success",
      });
    }

    if (existingResult) {
      return res.status(200).json({
        transactionId: reference,
        currency: "MYR",
        cash: roundToTwoDecimals(currentUser.wallet),
        bonus: 0,
        error: 0,
        description: "Success",
      });
    }

    const toUpdateBalance = roundToTwoDecimals(
      (Number(amount) || 0) + (Number(promoWinAmount) || 0)
    );

    const updateFields = {
      $set: {
        settlereferenceId: reference,
        settleamount: toUpdateBalance,
      },
    };

    if (bonusCode) {
      updateFields.$set.bonuscode = bonusCode;
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { username: userId },
        { $inc: { wallet: toUpdateBalance } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotLivePPModal.updateOne({ betId: roundId }, updateFields),
    ]);

    return res.status(200).json({
      transactionId: reference,
      currency: "MYR",
      cash: roundToTwoDecimals(updatedUserBalance.wallet),
      bonus: 0,
      error: 0,
      description: "Success",
    });
  } catch (error) {
    console.log(
      "PRAGMATIC PLAY Error in game provider calling ae96 result api",
      error.message
    );
    return res.status(500).json({
      error: 120,
      description: "Internal Server Error",
    });
  }
});

router.post("/api/pp/endround", async (req, res) => {
  try {
    const { hash, userId, gameId, roundId, providerId } = req.body;

    if (!userId || !gameId || !roundId || !providerId) {
      return res.status(200).json({
        error: 7,
        description: "Bad param requested",
      });
    }

    const fields = {
      userId: userId,
      gameId: gameId,
      roundId: roundId,
      providerId: providerId,
    };

    let generatedHash = generateSignature(fields, ppSecret).toLowerCase();

    if (hash !== generatedHash) {
      return res.status(200).json({
        error: 5,
        description: "Invalid hash",
      });
    }

    const [currentUser, existingRecord] = await Promise.all([
      User.findOne({ username: userId }, { wallet: 1 }).lean(),
      SlotLivePPModal.findOne(
        { betId: roundId, ended: true },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        error: 4,
        description: "Player not found",
      });
    }

    if (existingRecord) {
      return res.status(200).json({
        cash: roundToTwoDecimals(currentUser.wallet),
        bonus: 0,
        error: 0,
        description: "Success",
      });
    }

    await SlotLivePPModal.findOneAndUpdate(
      { betId: roundId },
      { $set: { ended: true } },
      { upsert: true }
    );

    return res.status(200).json({
      cash: roundToTwoDecimals(currentUser.wallet),
      bonus: 0,
      error: 0,
      description: "Success",
    });
  } catch (error) {
    console.log(
      "PRAGMATIC PLAY Error in game provider calling ae96 endround api",
      error.message
    );
    return res.status(500).json({
      error: 120,
      description: "Internal Server Error",
    });
  }
});

router.post("/api/pp/refund", async (req, res) => {
  try {
    const { hash, userId, reference, providerId } = req.body;

    if (!userId || !providerId || !reference) {
      return res.status(200).json({
        error: 7,
        description: "Bad param requested",
      });
    }

    const fields = {
      userId: userId,
      reference: reference,
      providerId: providerId,
    };
    let generatedHash = generateSignature(fields, ppSecret).toLowerCase();

    if (hash !== generatedHash) {
      return res.status(200).json({
        error: 5,
        description: "Invalid hash",
      });
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne({ username: userId }, { wallet: 1 }).lean(),
      SlotLivePPModal.findOne(
        { betreferenceId: reference },
        { betamount: 1, refunded: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        error: 4,
        description: "Player not found",
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        transactionId: reference,
        error: 0,
        description: "No bet found",
      });
    }

    if (existingBet.refunded) {
      return res.status(200).json({
        transactionId: reference,
        error: 0,
        description: "Bet has already been refunded",
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { username: userId },
        { $inc: { wallet: roundToTwoDecimals(existingBet.betamount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotLivePPModal.updateOne(
        { betreferenceId: reference },
        { $set: { refunded: true } }
      ),
    ]);

    return res.status(200).json({
      transactionId: reference,
      error: 0,
      description: "Success",
    });
  } catch (error) {
    console.log(
      "PRAGMATIC PLAY Error in game provider calling ae96 refund api",
      error.message
    );
    return res.status(500).json({
      error: 120,
      description: "Internal Server Error",
    });
  }
});

router.post("/api/pp/bonuswin", async (req, res) => {
  try {
    const {
      hash,
      userId,
      amount,
      reference,
      providerId,
      timestamp,
      bonusCode,
      gameId,
      roundId,
    } = req.body;

    if (!userId || !providerId || !reference || !timestamp) {
      console.log(userId, providerId, reference, timestamp);
      return res.status(200).json({
        error: 7,
        description: "Bad param requested",
      });
    }

    const fields = {
      userId: userId,
      amount: amount,
      reference: reference,
      providerId: providerId,
      timestamp: timestamp,
    };

    if (bonusCode) {
      fields.bonusCode = bonusCode;
    }
    if (gameId) {
      fields.gameId = gameId;
    }
    if (roundId) {
      fields.roundId = roundId;
    }

    let generatedHash = generateSignature(fields, ppSecret).toLowerCase();

    if (hash !== generatedHash) {
      return res.status(200).json({
        error: 5,
        description: "Invalid hash",
      });
    }

    const currentUser = await User.findOne(
      { username: userId },
      { username: 1, wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(200).json({
        error: 4,
        description: "Player not found",
      });
    }

    const existingTrans = await SlotLivePPModal.findOne(
      { username: currentUser.username, bonusreferenceId: reference },
      { _id: 1 }
    ).lean();

    if (existingTrans) {
      return res.status(200).json({
        transactionId: reference,
        currency: "MYR",
        cash: roundToTwoDecimals(currentUser.wallet),
        bonus: 0,
        error: 0,
        description: "Success",
      });
    }

    await SlotLivePPModal.findOneAndUpdate(
      {
        username: currentUser.username,
        bonuscode: bonusCode,
      },
      {
        $set: {
          bonusreferenceId: reference,
          settleamount: roundToTwoDecimals(amount),
        },
      }
    );

    return res.status(200).json({
      transactionId: reference,
      currency: "MYR",
      cash: roundToTwoDecimals(currentUser.wallet),
      bonus: 0,
      error: 0,
      description: "Success",
    });
  } catch (error) {
    console.log(
      "PRAGMATIC PLAY Error in game provider calling ae96 bonus api",
      error.message
    );
    return res.status(500).json({
      error: 120,
      description: "Internal Server Error",
    });
  }
});

router.post("/api/pp/jackpotwin", async (req, res) => {
  try {
    const {
      hash,
      providerId,
      timestamp,
      userId,
      gameId,
      roundId,
      jackpotId,
      amount,
      reference,
    } = req.body;

    if (
      !userId ||
      !gameId ||
      !roundId ||
      !providerId ||
      !reference ||
      !timestamp ||
      !jackpotId
    ) {
      return res.status(200).json({
        error: 7,
        description: "Bad param requested",
      });
    }

    const fields = {
      providerId: providerId,
      timestamp: timestamp,
      userId: userId,
      gameId: gameId,
      roundId: roundId,
      jackpotId: jackpotId,
      amount: amount,
      reference: reference,
    };
    let generatedHash = generateSignature(fields, ppSecret).toLowerCase();

    if (hash !== generatedHash) {
      return res.status(200).json({
        error: 5,
        description: "Invalid hash",
      });
    }

    const currentUser = await User.findOne(
      { username: userId },
      { username: 1, wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(200).json({
        error: 4,
        description: "Player not found",
      });
    }

    const existingTrans = await SlotLivePPModal.findOne(
      { username: currentUser.username, jackpotreferenceId: reference },
      { _id: 1 }
    ).lean();

    if (existingTrans) {
      return res.status(200).json({
        transactionId: reference,
        currency: "MYR",
        cash: roundToTwoDecimals(currentUser.wallet),
        bonus: 0,
        error: 0,
        description: "Success",
      });
    }

    const formattedAmount = roundToTwoDecimals(amount || 0);

    const gameType = gameId.startsWith("v")
      ? "Slot"
      : /^\d/.test(gameId)
      ? "Live"
      : "Slot";

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { username: userId },
        { $inc: { wallet: formattedAmount } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotLivePPModal.updateOne(
        {
          username: currentUser.username,
          betId: roundId,
        },
        {
          $set: {
            jackpotreferenceId: reference,
            settleamount: formattedAmount,
            gameType,
          },
        }
      ),
    ]);

    return res.status(200).json({
      transactionId: reference,
      currency: "MYR",
      cash: roundToTwoDecimals(updatedUserBalance.wallet),
      bonus: 0,
      error: 0,
      description: "Success",
    });
  } catch (error) {
    console.log(
      "PRAGMATIC PLAY Error in game provider calling ae96 jackpot api",
      error.message
    );
    return res.status(500).json({
      error: 120,
      description: "Internal Server Error",
    });
  }
});

router.post("/api/pp/promowin", async (req, res) => {
  try {
    const {
      hash,
      providerId,
      timestamp,
      userId,
      campaignId,
      campaignType,
      amount,
      currency,
      reference,
      gameId,
      roundId,
    } = req.body;

    if (
      !userId ||
      !campaignId ||
      !campaignType ||
      !currency ||
      !reference ||
      !providerId ||
      !timestamp
    ) {
      return res.status(200).json({
        error: 7,
        description: "Bad param requested",
      });
    }

    const fields = {
      providerId: providerId,
      timestamp: timestamp,
      userId: userId,
      campaignId: campaignId,
      campaignType: campaignType,
      amount: amount,
      currency: currency,
      reference: reference,
    };
    if (gameId) {
      fields.gameId = gameId;
    }
    if (roundId) {
      fields.roundId = roundId;
    }

    let generatedHash = generateSignature(fields, ppSecret).toLowerCase();

    if (hash !== generatedHash) {
      return res.status(200).json({
        error: 5,
        description: "Invalid hash",
      });
    }

    const currentUser = await User.findOne(
      { username: userId },
      { username: 1, wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(200).json({
        error: 4,
        description: "Player not found",
      });
    }

    const existingTrans = await SlotLivePPModal.findOne(
      { username: userId, promoreferenceId: reference },
      { _id: 1 }
    ).lean();

    if (existingTrans) {
      return res.status(200).json({
        transactionId: reference,
        currency: "MYR",
        cash: roundToTwoDecimals(currentUser.wallet),
        bonus: 0,
        error: 0,
        description: "Success",
      });
    }

    const formattedAmount = roundToTwoDecimals(amount || 0);

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { username: userId },
        { $inc: { wallet: formattedAmount } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotLivePPModal.updateOne(
        {
          username: currentUser.username,
          betId: roundId,
        },
        {
          $set: {
            promoreferenceId: reference,
            settleamount: formattedAmount,
          },
        }
      ),
    ]);

    return res.status(200).json({
      transactionId: reference,
      currency: "MYR",
      cash: roundToTwoDecimals(updatedUserBalance.wallet),
      bonus: 0,
      error: 0,
      description: "Success",
    });
  } catch (error) {
    console.log(
      "PRAGMATIC PLAY Error in game provider calling ae96 promo api",
      error.message
    );
    return res.status(500).json({
      error: 120,
      description: "Internal Server Error",
    });
  }
});

router.post("/api/pp/adjustment", async (req, res) => {
  try {
    const {
      hash,
      userId,
      gameId,
      roundId,
      amount,
      providerId,
      reference,
      validBetAmount,
      timestamp,
    } = req.body;

    if (
      !userId ||
      !gameId ||
      !roundId ||
      !reference ||
      !providerId ||
      !timestamp
    ) {
      return res.status(200).json({
        error: 7,
        description: "Bad param requested",
      });
    }

    const fields = {
      userId: userId,
      gameId: gameId,
      roundId: roundId,
      amount: amount,
      reference: reference,
      providerId: providerId,
      validBetAmount: validBetAmount,
      timestamp: timestamp,
    };
    let generatedHash = generateSignature(fields, ppSecret).toLowerCase();

    if (hash !== generatedHash) {
      return res.status(200).json({
        error: 5,
        description: "Invalid hash",
      });
    }
    const currentUser = await User.findOne(
      { username: userId },
      { username: 1, wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(200).json({
        error: 4,
        description: "Player not found",
      });
    }

    const existingTrans = await SlotLivePPModal.findOne(
      { username: currentUser.username, adjustmentreferenceId: reference },
      { _id: 1 }
    ).lean();

    if (existingTrans) {
      return res.status(200).json({
        transactionId: reference,
        currency: "MYR",
        cash: roundToTwoDecimals(currentUser.wallet),
        bonus: 0,
        error: 0,
        description: "Success",
      });
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        username: userId,
        ...(amount < 0 && { wallet: { $gte: Math.abs(amount) } }),
      },
      { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res.status(200).json({
        error: 1,
        description: "Insufficient balance",
      });
    }

    await SlotLivePPModal.updateOne(
      {
        username: currentUser.username,
        betId: roundId,
      },
      {
        $set: {
          adjustmentreferenceId: reference,
          betamount: roundToTwoDecimals(validBetAmount),
        },
      }
    );

    return res.status(200).json({
      transactionId: reference,
      currency: "MYR",
      cash: roundToTwoDecimals(updatedUserBalance.wallet),
      bonus: 0,
      error: 0,
      description: "Success",
    });
  } catch (error) {
    console.log(
      "PRAGMATIC PLAY Error in game provider calling ae96 adjustment api",
      error.message
    );
    return res.status(500).json({
      error: 120,
      description: "Internal Server Error",
    });
  }
});

// router.post("/api/ppslot/getturnoverforrebate", async (req, res) => {
//   try {
//     const { date } = req.body;

//     let start;
//     if (date === "today") {
//       start = moment
//         .utc()
//         .add(8, "hours")
//         .startOf("day")
//         .subtract(8, "hours")
//         .valueOf();
//     } else if (date === "yesterday") {
//       start = moment
//         .utc()
//         .add(8, "hours")
//         .subtract(1, "days")
//         .startOf("day")
//         .subtract(8, "hours")
//         .valueOf();
//     } else {
//       console.log(date, "PPSLOT: Invalid date");
//       return res.status(400).json({
//         error: "No Date value being pass in",
//       });
//     }

//     const end = moment(start).add(1, "day").valueOf();
//     const interval = 10 * 60 * 1000;

//     console.log("PPSLOT QUERYING TIME", start, end);

//     // Generate all timepoints first
//     const timepoints = [];
//     let currentTime = start;
//     while (currentTime < end) {
//       timepoints.push(currentTime);
//       currentTime += interval;
//     }

//     // Function to fetch data for a single timepoint with retry
//     const fetchDataWithRetry = async (timepoint, maxRetries = 5) => {
//       const fields = {
//         login: ppSecureLogin,
//         password: ppSecret,
//         timepoint: timepoint,
//         dataType: "RNG",
//       };
//       const queryParams = new URLSearchParams(fields).toString();

//       for (let attempt = 1; attempt <= maxRetries; attempt++) {
//         try {
//           const response = await axios.get(
//             `${ppOriAPIURL}/DataFeeds/gamerounds/?${queryParams}`,
//             {
//               headers: {
//                 "Content-Type": "application/x-www-form-urlencoded",
//               },
//             }
//           );
//           return response.data;
//         } catch (error) {
//           console.log(
//             `Attempt ${attempt} failed for timepoint ${timepoint}: ${error.message}`
//           );
//           if (attempt === maxRetries) throw error;
//           await new Promise((resolve) => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
//         }
//       }
//     };

//     // Fetch data in parallel with batching
//     const batchSize = 10; // Process 10 timepoints at once
//     const results = [];

//     for (let i = 0; i < timepoints.length; i += batchSize) {
//       const batch = timepoints.slice(i, i + batchSize);
//       const batchPromises = batch.map((timepoint) =>
//         fetchDataWithRetry(timepoint).catch((error) => {
//           console.error(
//             `Failed to fetch data for timepoint ${timepoint}:`,
//             error
//           );
//           return null; // Return null for failed requests
//         })
//       );

//       const batchResults = await Promise.all(batchPromises);
//       results.push(...batchResults.filter((result) => result !== null));

//       // Add a small delay between batches to avoid overwhelming the API
//       if (i + batchSize < timepoints.length) {
//         await new Promise((resolve) => setTimeout(resolve, 1000));
//       }
//     }

//     // Process results
//     let playerSummary = {};
//     results.forEach((result) => {
//       if (!result) return; // Skip null results

//       const lines = result.split("\n");
//       const headers = lines[1]?.split(",");
//       if (!headers) return;

//       lines.slice(2).forEach((line) => {
//         const values = line.split(",");
//         if (values.length === headers.length) {
//           const row = headers.reduce((obj, header, index) => {
//             obj[header.trim()] = values[index].trim();
//             return obj;
//           }, {});

//           const playerId = row.extPlayerID.toLowerCase();
//           const turnover = parseFloat(row.bet) || 0;
//           const win = parseFloat(row.win) || 0;

//           if (!playerSummary[playerId]) {
//             playerSummary[playerId] = { turnover: 0, winloss: 0 };
//           }

//           playerSummary[playerId].turnover += turnover;
//           playerSummary[playerId].winloss += win - turnover;
//         }
//       });
//     });

//     // Format the results
//     Object.keys(playerSummary).forEach((playerId) => {
//       playerSummary[playerId].turnover = Number(
//         playerSummary[playerId].turnover.toFixed(2)
//       );
//       playerSummary[playerId].winloss = Number(
//         playerSummary[playerId].winloss.toFixed(2)
//       );
//     });

//     return res.status(200).json({
//       success: true,
//       summary: {
//         gamename: "PRAGMATIC PLAY SLOT",
//         gamecategory: "Slot Games",
//         users: playerSummary,
//       },
//     });
//   } catch (error) {
//     console.log(
//       "PRAGMATIC PLAY SLOT: Failed to fetch win/loss report:",
//       error.message
//     );
//     return res.status(500).json({
//       error: "PRAGMATIC PLAY SLOT: Failed to fetch win/loss report",
//     });
//   }
// });

// router.post("/api/pplive/getturnoverforrebate", async (req, res) => {
//   try {
//     const { date } = req.body;

//     let start;

//     if (date === "today") {
//       start = moment
//         .utc()
//         .add(8, "hours")
//         .startOf("day")
//         .subtract(8, "hours")
//         .valueOf();
//     } else if (date === "yesterday") {
//       start = moment
//         .utc()
//         .add(8, "hours")
//         .subtract(1, "days")
//         .startOf("day")
//         .subtract(8, "hours")
//         .valueOf();
//     } else {
//       console.log(date, "PPSLOT: Invalid date");
//       return res.status(400).json({
//         error: "No Date value being pass in",
//       });
//     }

//     const end = moment(start).add(1, "day").valueOf(); // End of the day in milliseconds
//     const interval = 10 * 60 * 1000; // 10 minutes in milliseconds

//     console.log("PPLIVE QUERYING TIME", start, end);

//     let results = [];

//     while (start < end) {
//       // console.log(`Calling data for timepoint: ${start}`);

//       const fields = {
//         login: ppSecureLogin,
//         password: ppSecret,
//         timepoint: start,
//         dataType: "LC",
//       };

//       const queryParams = new URLSearchParams(fields).toString();
//       const fetchData = async (attempt = 1) => {
//         try {
//           const response = await axios.get(
//             `${ppOriAPIURL}/DataFeeds/gamerounds/?${queryParams}`,
//             {
//               headers: {
//                 "Content-Type": "application/x-www-form-urlencoded",
//               },
//             }
//           );

//           return response.data;
//         } catch (error) {
//           console.log(
//             `Attempt ${attempt} failed: ${error.message}. Retrying...`
//           );
//           if (attempt < 5) {
//             return await fetchData(attempt + 1); // Retry the request
//           } else {
//             throw new Error(`Failed after 5 attempts: ${error.message}`);
//           }
//         }
//       };

//       const result = await fetchData();

//       results.push(result);

//       // Add 10 minutes to the start time
//       start += interval;
//     }

//     // Parse and process the CSV data manually
//     let playerSummary = {};

//     results.forEach((result) => {
//       const lines = result.split("\n");
//       const headers = lines[1].split(",");

//       lines.slice(2).forEach((line) => {
//         const values = line.split(",");
//         if (values.length === headers.length) {
//           const row = headers.reduce((obj, header, index) => {
//             obj[header.trim()] = values[index].trim();
//             return obj;
//           }, {});

//           const playerId = row.extPlayerID.toLowerCase();
//           const turnover = parseFloat(row.bet) || 0;
//           const win = parseFloat(row.win) || 0;

//           if (!playerSummary[playerId]) {
//             playerSummary[playerId] = { turnover: 0, winloss: 0 };
//           }

//           playerSummary[playerId].turnover += turnover;
//           playerSummary[playerId].winloss += win - turnover;
//         }
//       });
//     });

//     // Format the turnover and winloss for each player to two decimal places
//     Object.keys(playerSummary).forEach((playerId) => {
//       playerSummary[playerId].turnover = Number(
//         playerSummary[playerId].turnover.toFixed(2)
//       );
//       playerSummary[playerId].winloss = Number(
//         playerSummary[playerId].winloss.toFixed(2)
//       );
//     });

//     return res.status(200).json({
//       success: true,
//       summary: {
//         gamename: "PRAGMATIC PLAY LIVE",
//         gamecategory: "Live Casino",
//         users: playerSummary, // Return player summary
//       },
//     });
//   } catch (error) {
//     console.log(
//       "PRAGMATIC PLAY LIVE: Failed to fetch win/loss report:",
//       error.message
//     );
//     return res.status(500).json({
//       error: "PRAGMATIC PLAY LIVE: Failed to fetch win/loss report",
//     });
//   }
// });

router.post("/api/ppslot/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLivePPModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      refunded: false,
      ended: true,
      gameType: "Slot",
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
        gamename: "PPSLOT",
        gamecategory: "Slot Games",
        users: playerSummary, // Return player summary for each user
      },
    });
  } catch (error) {
    console.log("PP SLOT: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "PP SLOT: Failed to fetch win/loss report",
        zh: "PP SLOT: 获取盈亏报告失败",
      },
    });
  }
});

router.post("/api/pplive/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLivePPModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      refunded: false,
      ended: true,
      gameType: "Live",
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
        gamename: "PPLIVE",
        gamecategory: "Live Casino",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("PP LIVE: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "PP LIVE: Failed to fetch win/loss report",
        zh: "PP LIVE: 获取盈亏报告失败",
      },
    });
  }
});

// router.get(
//   "/admin/api/pplive/:userId/dailygamedata",
//   authenticateAdminToken,
//   async (req, res) => {
//     try {
//       const { startDate, endDate } = req.query;

//       const userId = req.params.userId;

//       const user = await User.findById(userId);

//       let startD = moment.utc(new Date(startDate).toISOString());
//       let endD = moment.utc(new Date(endDate).toISOString());
//       // Get the timestamps
//       let start = startD.startOf("day").subtract(8, "hours").valueOf();
//       let end = endD.endOf("day").subtract(8, "hours").valueOf();

//       const interval = 10 * 60 * 1000; // 10 minutes in milliseconds

//       let results = [];

//       while (start < end) {
//         // console.log(`Calling data for timepoint: ${start}`);

//         const fields = {
//           login: ppSecureLogin,
//           password: ppSecret,
//           timepoint: start,
//           dataType: "LC",
//         };

//         const queryParams = new URLSearchParams(fields).toString();
//         const fetchData = async (attempt = 1) => {
//           try {
//             const response = await axios.get(
//               `${ppOriAPIURL}/DataFeeds/gamerounds/?${queryParams}`,
//               {
//                 headers: {
//                   "Content-Type": "application/x-www-form-urlencoded",
//                 },
//               }
//             );

//             return response.data;
//           } catch (error) {
//             console.log(
//               `Attempt ${attempt} failed: ${error.message}. Retrying...`
//             );
//             if (attempt < 5) {
//               return await fetchData(attempt + 1); // Retry the request
//             } else {
//               throw new Error(`Failed after 5 attempts: ${error.message}`);
//             }
//           }
//         };

//         const result = await fetchData();

//         results.push(result);

//         // Add 10 minutes to the start time
//         start += interval;
//       }

//       // Parse and process the CSV data manually
//       let totalTurnover = 0;
//       let totalWinLoss = 0;

//       results.forEach((result) => {
//         const lines = result.split("\n");
//         const headers = lines[1].split(",");

//         lines.slice(2).forEach((line) => {
//           const values = line.split(",");
//           if (values.length === headers.length) {
//             const row = headers.reduce((obj, header, index) => {
//               obj[header.trim()] = values[index].trim();
//               return obj;
//             }, {});

//             const playerId = row.extPlayerID.toLowerCase();
//             if (playerId === user.username.toLowerCase()) {
//               const turnover = parseFloat(row.bet) || 0;
//               const win = parseFloat(row.win) || 0;

//               totalTurnover += turnover;
//               totalWinLoss += win - turnover;
//             }
//           }
//         });
//       });

//       // Format the total values to two decimal places
//       totalTurnover = Number(totalTurnover.toFixed(2));
//       totalWinLoss = Number(totalWinLoss.toFixed(2));

//       return res.status(200).json({
//         success: true,
//         summary: {
//           gamename: "PRAGMATIC PLAY LIVE",
//           gamecategory: "Live Casino",
//           user: {
//             username: user.username,
//             turnover: totalTurnover,
//             winloss: totalWinLoss,
//           },
//         },
//       });
//     } catch (error) {
//       console.log(
//         "PRAGMATIC PLAY LIVE: Failed to fetch win/loss report:",
//         error.message
//       );
//       return res.status(500).json({
//         error: "PRAGMATIC PLAY LIVE: Failed to fetch win/loss report",
//       });
//     }
//   }
// );

router.get(
  "/admin/api/pplive/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLivePPModal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        refunded: false,
        ended: true,
        gameType: "Live",
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
          gamename: "PRAGMATIC PLAY LIVE",
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
        "PRAGMATIC PLAY LIVE: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "PP LIVE: Failed to fetch win/loss report",
          zh: "PP LIVE: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/pplive/:userId/gamedata",
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
          const liveCasino = Object.fromEntries(gameCategories["Live Casino"]);

          if (liveCasino["PPLIVE"]) {
            totalTurnover += liveCasino["PPLIVE"].turnover || 0;
            totalWinLoss += liveCasino["PPLIVE"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PRAGMATIC PLAY LIVE",
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
        "PRAGMATIC PLAY LIVE: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "PP LIVE: Failed to fetch win/loss report",
          zh: "PP LIVE: 获取盈亏报告失败",
        },
      });
    }
  }
);

// router.get(
//   "/admin/api/ppslot/:userId/dailygamedata",
//   authenticateAdminToken,
//   async (req, res) => {
//     try {
//       const { startDate, endDate } = req.query;

//       const userId = req.params.userId;

//       const user = await User.findById(userId);

//       let startD = moment.utc(new Date(startDate).toISOString());
//       let endD = moment.utc(new Date(endDate).toISOString());
//       // Get the timestamps
//       let start = startD.startOf("day").subtract(8, "hours").valueOf();
//       let end = endD.endOf("day").subtract(8, "hours").valueOf();

//       const interval = 10 * 60 * 1000;

//       // Generate all timepoints first
//       const timepoints = [];
//       let currentTime = start;
//       while (currentTime < end) {
//         timepoints.push(currentTime);
//         currentTime += interval;
//       }

//       // Function to fetch data for a single timepoint with retry
//       const fetchDataWithRetry = async (timepoint, maxRetries = 5) => {
//         const fields = {
//           login: ppSecureLogin,
//           password: ppSecret,
//           timepoint: timepoint,
//           dataType: "RNG",
//         };
//         const queryParams = new URLSearchParams(fields).toString();

//         for (let attempt = 1; attempt <= maxRetries; attempt++) {
//           try {
//             const response = await axios.get(
//               `${ppOriAPIURL}/DataFeeds/gamerounds/?${queryParams}`,
//               {
//                 headers: {
//                   "Content-Type": "application/x-www-form-urlencoded",
//                 },
//               }
//             );
//             return response.data;
//           } catch (error) {
//             console.log(
//               `Attempt ${attempt} failed for timepoint ${timepoint}: ${error.message}`
//             );
//             if (attempt === maxRetries) throw error;
//             await new Promise((resolve) => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
//           }
//         }
//       };

//       // Fetch data in parallel with batching
//       const batchSize = 10; // Process 10 timepoints at once
//       const results = [];

//       for (let i = 0; i < timepoints.length; i += batchSize) {
//         const batch = timepoints.slice(i, i + batchSize);
//         const batchPromises = batch.map((timepoint) =>
//           fetchDataWithRetry(timepoint).catch((error) => {
//             console.error(
//               `Failed to fetch data for timepoint ${timepoint}:`,
//               error
//             );
//             return null; // Return null for failed requests
//           })
//         );

//         const batchResults = await Promise.all(batchPromises);
//         results.push(...batchResults.filter((result) => result !== null));

//         // Add a small delay between batches to avoid overwhelming the API
//         if (i + batchSize < timepoints.length) {
//           await new Promise((resolve) => setTimeout(resolve, 1000));
//         }
//       }

//       // Process results
//       let playerSummary = {};
//       results.forEach((result) => {
//         if (!result) return; // Skip null results

//         const lines = result.split("\n");
//         const headers = lines[1]?.split(",");
//         if (!headers) return;

//         lines.slice(2).forEach((line) => {
//           const values = line.split(",");
//           if (values.length === headers.length) {
//             const row = headers.reduce((obj, header, index) => {
//               obj[header.trim()] = values[index].trim();
//               return obj;
//             }, {});

//             const playerId = row.extPlayerID.toLowerCase();
//             const turnover = parseFloat(row.bet) || 0;
//             const win = parseFloat(row.win) || 0;

//             if (!playerSummary[playerId]) {
//               playerSummary[playerId] = { turnover: 0, winloss: 0 };
//             }

//             playerSummary[playerId].turnover += turnover;
//             playerSummary[playerId].winloss += win - turnover;
//           }
//         });
//       });

//       // Format the results
//       Object.keys(playerSummary).forEach((playerId) => {
//         playerSummary[playerId].turnover = Number(
//           playerSummary[playerId].turnover.toFixed(2)
//         );
//         playerSummary[playerId].winloss = Number(
//           playerSummary[playerId].winloss.toFixed(2)
//         );
//       });

//       const userSummary = playerSummary[user.username.toLowerCase()] || {
//         turnover: 0,
//         winloss: 0,
//       };

//       return res.status(200).json({
//         success: true,
//         summary: {
//           gamename: "PRAGMATIC PLAY SLOT",
//           gamecategory: "Slot Games",
//           user: {
//             username: user.username,
//             turnover: userSummary.turnover,
//             winloss: userSummary.winloss,
//           },
//         },
//       });
//     } catch (error) {
//       console.log(
//         "PRAGMATIC PLAY SLOT: Failed to fetch win/loss report:",
//         error.message
//       );
//       return res.status(500).json({
//         error: "PRAGMATIC PLAY SLOT: Failed to fetch win/loss report",
//       });
//     }
//   }
// );

router.get(
  "/admin/api/ppslot/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLivePPModal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        refunded: false,
        ended: true,
        gameType: "Slot",
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
          gamename: "PRAGMATIC PLAY SLOT",
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
        "PRAGMATIC PLAY SLOT: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "PP SLOT: Failed to fetch win/loss report",
          zh: "PP SLOT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/ppslot/:userId/gamedata",
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

          if (slotGames["PPSLOT"]) {
            totalTurnover += slotGames["PPSLOT"].turnover || 0;
            totalWinLoss += slotGames["PPSLOT"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PRAGMATIC PLAY SLOT",
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
        "PRAGMATIC PLAY SLOT: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "PP SLOT: Failed to fetch win/loss report",
          zh: "PP SLOT: 获取盈亏报告失败",
        },
      });
    }
  }
);

// router.get(
//   "/admin/api/ppslot/dailykioskreport",
//   authenticateAdminToken,
//   async (req, res) => {
//     try {
//       const { startDate, endDate } = req.query;

//       let startD = moment.utc(new Date(startDate).toISOString());
//       let endD = moment.utc(new Date(endDate).toISOString());

//       let start = startD.startOf("day").subtract(8, "hours").valueOf();
//       let end = endD.endOf("day").subtract(8, "hours").valueOf();

//       const interval = 10 * 60 * 1000;
//       const timepoints = [];
//       let currentTime = start;

//       while (currentTime < end) {
//         timepoints.push(currentTime);
//         currentTime += interval;
//       }

//       // Keep the same fetchDataWithRetry function
//       const fetchDataWithRetry = async (timepoint, maxRetries = 5) => {
//         const fields = {
//           login: ppSecureLogin,
//           password: ppSecret,
//           timepoint: timepoint,
//           dataType: "RNG",
//         };
//         const queryParams = new URLSearchParams(fields).toString();

//         for (let attempt = 1; attempt <= maxRetries; attempt++) {
//           try {
//             const response = await axios.get(
//               `${ppOriAPIURL}/DataFeeds/gamerounds/?${queryParams}`,
//               {
//                 headers: {
//                   "Content-Type": "application/x-www-form-urlencoded",
//                 },
//               }
//             );
//             return response.data;
//           } catch (error) {
//             console.log(
//               `Attempt ${attempt} failed for timepoint ${timepoint}: ${error.message}`
//             );
//             if (attempt === maxRetries) throw error;
//             await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
//           }
//         }
//       };

//       // Fetch data in parallel with batching
//       const batchSize = 10;
//       const results = [];

//       for (let i = 0; i < timepoints.length; i += batchSize) {
//         const batch = timepoints.slice(i, i + batchSize);
//         const batchPromises = batch.map((timepoint) =>
//           fetchDataWithRetry(timepoint).catch((error) => {
//             console.error(
//               `Failed to fetch data for timepoint ${timepoint}:`,
//               error
//             );
//             return null;
//           })
//         );

//         const batchResults = await Promise.all(batchPromises);
//         results.push(...batchResults.filter((result) => result !== null));

//         if (i + batchSize < timepoints.length) {
//           await new Promise((resolve) => setTimeout(resolve, 1000));
//         }
//       }

//       // Calculate totals
//       let totalTurnover = 0;
//       let totalWinLoss = 0;

//       results.forEach((result) => {
//         if (!result) return;

//         const lines = result.split("\n");
//         const headers = lines[1]?.split(",");
//         if (!headers) return;

//         lines.slice(2).forEach((line) => {
//           const values = line.split(",");
//           if (values.length === headers.length) {
//             const row = headers.reduce((obj, header, index) => {
//               obj[header.trim()] = values[index].trim();
//               return obj;
//             }, {});

//             const turnover = parseFloat(row.bet) || 0;
//             const win = parseFloat(row.win) || 0;

//             totalTurnover += turnover;
//             totalWinLoss += win - turnover;
//           }
//         });
//       });

//       return res.status(200).json({
//         success: true,
//         summary: {
//           gamename: "PRAGMATIC PLAY SLOT",
//           gamecategory: "Slot Games",
//           totalturnover: Number(totalTurnover.toFixed(2)),
//           totalwinloss: Number(totalWinLoss.toFixed(2)),
//         },
//       });
//     } catch (error) {
//       console.error(
//         "PRAGMATIC PLAY SLOT: Failed to fetch win/loss report:",
//         error
//       );
//       return res.status(500).json({
//         success: false,
//         error: "PRAGMATIC PLAY SLOT: Failed to fetch win/loss report",
//       });
//     }
//   }
// );

router.get(
  "/admin/api/ppslot/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLivePPModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        refunded: false,
        ended: true,
        gameType: "Slot",
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;

        const winLoss = (record.betamount || 0) - (record.settleamount || 0);

        totalWinLoss += winLoss;
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PRAGMATIC PLAY SLOT",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error(
        "PRAGMATIC PLAY SLOT: Failed to fetch win/loss report:",
        error
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "PP SLOT: Failed to fetch win/loss report",
          zh: "PP SLOT: 获取盈亏报告失败",
        },
      });
    }
  }
);

// router.get(
//   "/admin/api/pplive/dailykioskreport",
//   authenticateAdminToken,
//   async (req, res) => {
//     try {
//       const { startDate, endDate } = req.query;

//       let startD = moment.utc(new Date(startDate).toISOString());
//       let endD = moment.utc(new Date(endDate).toISOString());

//       let start = startD.startOf("day").subtract(8, "hours").valueOf();
//       let end = endD.endOf("day").subtract(8, "hours").valueOf();

//       const interval = 10 * 60 * 1000;
//       let results = [];

//       while (start < end) {
//         const fields = {
//           login: ppSecureLogin,
//           password: ppSecret,
//           timepoint: start,
//           dataType: "LC",
//         };

//         const queryParams = new URLSearchParams(fields).toString();
//         const fetchData = async (attempt = 1) => {
//           try {
//             const response = await axios.get(
//               `${ppOriAPIURL}/DataFeeds/gamerounds/?${queryParams}`,
//               {
//                 headers: {
//                   "Content-Type": "application/x-www-form-urlencoded",
//                 },
//               }
//             );
//             return response.data;
//           } catch (error) {
//             if (attempt < 5) {
//               await new Promise((resolve) =>
//                 setTimeout(resolve, 1000 * attempt)
//               );
//               return await fetchData(attempt + 1);
//             }
//             throw new Error(`Failed after 5 attempts: ${error.message}`);
//           }
//         };

//         const result = await fetchData();
//         results.push(result);
//         start += interval;
//       }

//       let totalTurnover = 0;
//       let totalWinLoss = 0;

//       results.forEach((result) => {
//         const lines = result.split("\n");
//         const headers = lines[1]?.split(",");
//         if (!headers) return;

//         lines.slice(2).forEach((line) => {
//           const values = line.split(",");
//           if (values.length === headers.length) {
//             const row = headers.reduce((obj, header, index) => {
//               obj[header.trim()] = values[index].trim();
//               return obj;
//             }, {});

//             const turnover = parseFloat(row.bet) || 0;
//             const win = parseFloat(row.win) || 0;

//             totalTurnover += turnover;
//             totalWinLoss += win - turnover;
//           }
//         });
//       });

//       return res.status(200).json({
//         success: true,
//         summary: {
//           gamename: "PRAGMATIC PLAY LIVE",
//           gamecategory: "Live Casino",
//           totalturnover: Number(totalTurnover.toFixed(2)),
//           totalwinloss: Number(totalWinLoss.toFixed(2)),
//         },
//       });
//     } catch (error) {
//       console.error(
//         "PRAGMATIC PLAY LIVE: Failed to fetch win/loss report:",
//         error
//       );
//       return res.status(500).json({
//         success: false,
//         error: "PRAGMATIC PLAY LIVE: Failed to fetch win/loss report",
//       });
//     }
//   }
// );

router.get(
  "/admin/api/pplive/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLivePPModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        refunded: false,
        ended: true,
        gameType: "Live",
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;

        const winLoss = (record.betamount || 0) - (record.settleamount || 0);

        totalWinLoss += winLoss;
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PRAGMATIC PLAY LIVE",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error(
        "PRAGMATIC PLAY LIVE: Failed to fetch win/loss report:",
        error
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "PP LIVE: Failed to fetch win/loss report",
          zh: "PP LIVE: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/ppslot/kioskreport",
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

          if (liveCasino["PPSLOT"]) {
            totalTurnover += Number(liveCasino["PPSLOT"].turnover || 0);
            totalWinLoss += Number(liveCasino["PPSLOT"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PRAGMATIC PLAY SLOT",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error(
        "PRAGMATIC PLAY SLOT: Failed to fetch win/loss report:",
        error
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "PP SLOT: Failed to fetch win/loss report",
          zh: "PP SLOT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/pplive/kioskreport",
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
          const liveCasino = Object.fromEntries(gameCategories["Live Casino"]);

          if (liveCasino["PPLIVE"]) {
            totalTurnover += Number(liveCasino["PPLIVE"].turnover || 0);
            totalWinLoss += Number(liveCasino["PPLIVE"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PRAGMATIC PLAY LIVE",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error(
        "PRAGMATIC PLAY LIVE: Failed to fetch win/loss report:",
        error
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "PP LIVE: Failed to fetch win/loss report",
          zh: "PP LIVE: 获取盈亏报告失败",
        },
      });
    }
  }
);
module.exports = router;
