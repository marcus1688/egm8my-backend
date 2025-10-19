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
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const qs = require("querystring");
const GameWalletLog = require("../../models/gamewalletlog.model");
const SlotLFC888Modal = require("../../models/slot_lfc888.model");
const Decimal = require("decimal.js");
const GameLFC888GameModal = require("../../models/slot_lfc888Database.model");

require("dotenv").config();

const lfc888MD5KEY = process.env.LFC888_MD;
const lfc888Secret = process.env.LFC888_SECURITY;
const lfc888AccountID = "376144357763024";
const webURL = "www.oc7.me";
const lfc888APIURL = "https://api.lfc888.net/v2";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateSignature(params = {}, secretKey) {
  // Include the secret key at the top
  const orderedKeys = [
    "security_code",
    "tran_id",
    "account_id",
    "username",
    "password",
    "currency",
    "game_code",
    "lang",
    "back_url",
    "routing",
    "cur_type",
    "home_url",
    "demo",
    "device",
  ];

  // Inject the secret key as the first param
  const fullParams = { security_code: secretKey, ...params };

  // Build the query string in the required order
  const queryString = orderedKeys
    .filter((key) => fullParams[key] !== undefined)
    .map((key) => `${key}=${fullParams[key]}`)
    .join("&");

  return crypto.createHash("md5").update(queryString).digest("hex");
}

function generateDateTime() {
  return moment.utc().subtract(4, "hours").format(); // -240 minutes = UTC-4
}

function generateCallbackSignature(params, md5Key) {
  // Create a copy of the params
  const paramsCopy = { ...params };
  delete paramsCopy.auth_code;
  // First stringify the object
  let jsonString = JSON.stringify(paramsCopy);

  // If amount is a whole number, manually replace its representation in the JSON string
  if (
    paramsCopy.amount !== undefined &&
    Number.isInteger(Number(paramsCopy.amount))
  ) {
    // Generate the pattern to search for - exact number with no decimal
    const pattern = `"amount":${paramsCopy.amount}`;
    // Replace with the decimal version
    const replacement = `"amount":${paramsCopy.amount}.0`;
    jsonString = jsonString.replace(pattern, replacement);
  }

  const combined = `${jsonString}&${md5Key}`;

  return crypto.createHash("md5").update(combined).digest("hex");
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

// router.post("/api/lfc888/sync-gamelist", async (req, res) => {
//   try {
//     const checkCode = generateSignature(
//       { account_id: lfc888AccountID },
//       lfc888Secret
//     );

//     const fields = {
//       account_id: lfc888AccountID,
//       check_code: checkCode,
//     };

//     const response = await axios.post(
//       `${lfc888APIURL}/agent/get_gamelist`,
//       fields,
//       { headers: { "Content-Type": "application/json" } }
//     );

//     if (response.data.status.code !== 1000) {
//       return res.status(200).json({
//         success: false,
//         message: "Failed to fetch provider game list",
//         raw: response.data,
//       });
//     }

//     // flatten all categories into one list
//     const categories = ["fish", "slot", "arcade", "table", "p2p"];
//     const providerIDs = [];
//     categories.forEach((cat) => {
//       if (Array.isArray(response.data.data[cat])) {
//         response.data.data[cat].forEach((g) => {
//           if (g.game_code) providerIDs.push(g.game_code);
//         });
//       }
//     });

//     // get all db game IDs
//     const dbGames = await GameLFC888GameModal.find({}, { gameID: 1 }).lean();
//     const dbIDs = dbGames.map((g) => g.gameID);

//     // figure out missing/extra
//     const missingInDB = providerIDs.filter((id) => !dbIDs.includes(id));
//     const extraInDB = dbIDs.filter((id) => !providerIDs.includes(id));

//     // update maintenance flags
//     await GameLFC888GameModal.updateMany(
//       { gameID: { $in: providerIDs } },
//       { $set: { maintenance: false } }
//     );

//     await GameLFC888GameModal.updateMany(
//       { gameID: { $in: extraInDB } },
//       { $set: { maintenance: true } }
//     );

//     return res.status(200).json({
//       success: true,
//       message: "Sync complete",
//       summary: {
//         providerCount: providerIDs.length,
//         dbCount: dbIDs.length,
//         missingInDBCount: missingInDB.length,
//         extraInDBCount: extraInDB.length,
//       },
//       missingInDB, // provider has but db missing
//       extraInDB, // db has but provider doesn’t (now marked maintenance: true)
//     });
//   } catch (error) {
//     console.error("LFC888 sync error:", error.message);
//     return res.status(200).json({
//       success: false,
//       message: "LFC888 sync failed",
//       error: error.message,
//     });
//   }
// });

// router.post("/api/lfc888/import-games", async (req, res) => {
//   try {
//     const fs = require("fs");
//     const path = require("path");

//     // Path to your exported JSON file
//     const filePath = path.join(__dirname, "../../public/lfc888.json");

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
//     const deleteResult = await GameLFC888GameModal.deleteMany({});
//     console.log(`Deleted ${deleteResult.deletedCount} existing games`);

//     const insertResult = await GameLFC888GameModal.insertMany(cleanGames);
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

// router.post("/api/lfc888/getprovidergamelist", async (req, res) => {
//   try {
//     const checkCode = generateSignature(
//       {
//         account_id: lfc888AccountID,
//       },
//       lfc888Secret
//     );

//     const fields = {
//       account_id: lfc888AccountID,

//       check_code: checkCode,
//     };

//     const response = await axios.post(
//       `${lfc888APIURL}/agent/get_gamelist`,
//       fields,
//       {
//         headers: {
//           "Content-Type": "application/json",
//         },
//       }
//     );

//     if (response.data.status.code !== 1000) {
//       console.log("LFC888 error to launch game", response.data);

//       if (response.data.status.code === 4001) {
//         return res.status(200).json({
//           success: false,
//           message: {
//             en: "Game under maintenance. Please try again later.",
//             zh: "游戏正在维护中，请稍后再试。",
//             ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
//           },
//         });
//       }
//       return res.status(200).json({
//         success: false,
//         message: {
//           en: "LFC888: Game launch failed. Please try again or customer service for assistance.",
//           zh: "LFC888: 游戏启动失败，请重试或联系客服以获得帮助。",
//           ms: "LFC888: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
//         },
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       gameLobby: response.data,
//       message: {
//         en: "Game launched successfully.",
//         zh: "游戏启动成功。",
//         ms: "Permainan berjaya dimulakan.",
//       },
//     });
//   } catch (error) {
//     console.log("LFC888 error in launching game", error.message);
//     return res.status(200).json({
//       success: false,
//       message: {
//         en: "LFC888: Game launch failed. Please try again or customer service for assistance.",
//         zh: "LFC888: 游戏启动失败，请重试或联系客服以获得帮助。",
//         ms: "LFC888: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
//       },
//     });
//   }
// });

router.post("/api/lfc888/getgamelist", async (req, res) => {
  try {
    const games = await GameLFC888GameModal.find({
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
      GameType: game.gameType,
      GameImage: game.imageUrlEN || "",
      GameImageZH: game.imageUrlCN || "",
      GameImageMS: game.imageUrlMS || "",
      Hot: game.hot || false,
      RTP: game.rtpRate,
    }));

    return res.status(200).json({
      success: true,
      gamelist: reformattedGamelist,
    });
  } catch (error) {
    console.log("LFC888 error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "LFC888: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "LFC888: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "LFC888: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

async function registerLFC888User(username) {
  try {
    const registerPassword = generatePassword();

    const checkCode = generateSignature(
      {
        account_id: lfc888AccountID,
        username: username,
        password: registerPassword,
      },
      lfc888Secret
    );

    const fields = {
      account_id: lfc888AccountID,
      username: username,
      password: registerPassword,
      check_code: checkCode,
    };

    const response = await axios.post(
      `${lfc888APIURL}/agent/create_user`,
      fields,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (
      response.data.status.code === 1000 ||
      response.data.status.code === 4203
    ) {
      await User.findOneAndUpdate(
        { username },
        {
          $set: {
            LFC888GamePW: registerPassword,
          },
        }
      );
      return { success: true };
    } else if (response.data.status.code === 4001) {
      return { success: false, maintenance: true, data: response.data };
    }

    return {
      success: false,
      data: response.data,
    };
  } catch (error) {
    console.error("LFC888 error in creating member:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

router.post("/api/lfc888/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, clientPlatform, gameCode } = req.body;
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (user.gameLock.lfc888.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
        },
      });
    }

    const playerName = user.username.toLowerCase();

    if (!user.LFC888GamePW) {
      const registration = await registerLFC888User(playerName);

      if (!registration.success) {
        console.log(
          "LFC888 registration failed:",
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
            en: "LFC888: Game launch failed. Please try again or customer service for assistance.",
            zh: "LFC888: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "LFC888: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }
    }

    let lang = "en";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "zh-cn";
    } else if (gameLang === "ms") {
      lang = "id";
    }

    let platform = "desktop";
    if (clientPlatform === "web") {
      platform = "desktop";
    } else if (clientPlatform === "mobile") {
      platform = "mobile";
    }

    const checkCode = generateSignature(
      {
        account_id: lfc888AccountID,
        username: playerName,
        password: user.LFC888GamePW,
        game_code: gameCode,
        lang: lang,
        back_url: webURL,

        cur_type: 0,

        device: platform,
      },
      lfc888Secret
    );

    const fields = {
      account_id: lfc888AccountID,
      username: playerName,
      password: user.LFC888GamePW,
      game_code: gameCode,
      lang: lang,
      back_url: webURL,

      cur_type: 0,

      device: platform,
      check_code: checkCode,
    };

    const response = await axios.post(
      `${lfc888APIURL}/agent/user_login`,
      fields,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.status.code !== 1000) {
      console.log("LFC888 error to launch game", response.data);

      if (response.data.status.code === 4001) {
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
          en: "LFC888: Game launch failed. Please try again or customer service for assistance.",
          zh: "LFC888: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "LFC888: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "LFC888"
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data.data.game_url,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
      },
    });
  } catch (error) {
    console.log("LFC888 error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "LFC888: Game launch failed. Please try again or customer service for assistance.",
        zh: "LFC888: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "LFC888: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/api/lfc888/launchGameWlobby",
  authenticateToken,
  async (req, res) => {
    try {
      const { gameLang, clientPlatform } = req.body;
      const userId = req.user.userId;
      const user = await User.findById(userId);

      if (user.gameLock.lfc888.lock) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Your game access has been locked. Please contact customer support for further assistance.",
            zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
            ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
          },
        });
      }

      const playerName = user.username.toLowerCase();

      if (!user.LFC888GamePW) {
        const registration = await registerLFC888User(playerName);

        if (!registration.success) {
          console.log(
            "LFC888 registration failed:",
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
              en: "LFC888: Game launch failed. Please try again or customer service for assistance.",
              zh: "LFC888: 游戏启动失败，请重试或联系客服以获得帮助。",
              ms: "LFC888: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            },
          });
        }
      }

      let lang = "en";

      if (gameLang === "en") {
        lang = "en";
      } else if (gameLang === "zh") {
        lang = "zh-cn";
      } else if (gameLang === "ms") {
        lang = "id";
      }

      let platform = "desktop";
      if (clientPlatform === "web") {
        platform = "desktop";
      } else if (clientPlatform === "mobile") {
        platform = "mobile";
      }

      const checkCode = generateSignature(
        {
          account_id: lfc888AccountID,
          username: playerName,
          lang: lang,
          cur_type: 0,
          home_url: webURL,
          device: platform,
        },
        lfc888Secret
      );

      const fields = {
        account_id: lfc888AccountID,
        username: playerName,
        lang: lang,
        cur_type: 0,
        home_url: webURL,
        device: platform,
        check_code: checkCode,
      };

      const response = await axios.post(
        `${lfc888APIURL}/agent/lobby_login`,
        fields,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.status.code !== 1000) {
        console.log("LFC888 error to launch game", response.data);

        if (response.data.status.code === 4001) {
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
            en: "LFC888: Game launch failed. Please try again or customer service for assistance.",
            zh: "LFC888: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "LFC888: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "LFC888"
      );

      return res.status(200).json({
        success: true,
        gameLobby: response.data.data.lobby_url,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
        },
      });
    } catch (error) {
      console.log("LFC888 error in launching game", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "LFC888: Game launch failed. Please try again or customer service for assistance.",
          zh: "LFC888: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "LFC888: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post("/api/lfc888/get_user_balance", async (req, res) => {
  const dateTime = generateDateTime();
  try {
    const authHeader = req.headers["authorization"];

    const { tran_id, username, currency } = req.body;

    const missingFields = [];
    if (!tran_id) missingFields.push("tran_id");
    if (!username) missingFields.push("username");
    if (!currency) missingFields.push("currency");

    if (missingFields.length > 0) {
      return res.status(200).json({
        status: {
          code: 5002,
          message: `Bad format parameters (${missingFields.join(", ")})`,
          datetime: dateTime,
        },
      });
    }

    if (!tran_id || !username || !currency || currency !== "MYR") {
      const missingFields = [];
      if (!tran_id) missingFields.push("tran_id");
      if (!username) missingFields.push("username");
      if (!currency) missingFields.push("currency");
      if (currency && currency !== "MYR") missingFields.push("currency");

      return res.status(200).json({
        status: {
          code: 5002,
          message: `Bad format parameters (${missingFields.join(", ")})`,
          datetime: dateTime,
        },
      });
    }

    const signature = generateCallbackSignature(req.body, lfc888MD5KEY);

    if (authHeader !== signature) {
      return res.status(200).json({
        status: {
          code: 5001,
          message: `Authorization invalid.`,
          datetime: dateTime,
        },
      });
    }

    const currentUser = await User.findOne({ username }, { wallet: 1 }).lean();
    if (!currentUser) {
      return res.status(200).json({
        status: {
          code: 5002,
          message: `Bad format parameters (username)`,
          datetime: dateTime,
        },
      });
    }

    return res.status(200).json({
      status: {
        code: 1000,
        message: `Success.`,
        datetime: dateTime,
      },
      data: {
        balance: roundToTwoDecimals(currentUser.wallet),
        currency: "MYR",
        tran_id,
      },
    });
  } catch (error) {
    console.error(
      "LFC888: Error in game provider calling oc7 get balance api:",
      error.message
    );

    return res.status(200).json({
      status: {
        code: 5201,
        message: `Internal server error`,
        datetime: dateTime,
      },
    });
  }
});

router.post("/api/lfc888/transfer", async (req, res) => {
  const dateTime = generateDateTime();
  try {
    const authHeader = req.headers["authorization"];
    const {
      tran_id,
      username,
      currency,
      amount,
      transfer_type,
      game_code,
      trans_details,
      betform_details,
    } = req.body;

    // Fast-fail validation
    const requiredFields = {
      tran_id,
      username,
      currency,
      transfer_type,
      game_code,
      trans_details,
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([key, value]) => value === undefined)
      .map(([key]) => key);

    if (missingFields.length > 0 || currency !== "MYR") {
      return res.status(200).json({
        status: {
          code: 5002,
          message: `Bad format parameters (${
            missingFields.length > 0 ? missingFields.join(", ") : "currency"
          })`,
          datetime: dateTime,
        },
      });
    }

    // Validate signature
    const signature = generateCallbackSignature(req.body, lfc888MD5KEY);

    if (authHeader !== signature) {
      return res.status(200).json({
        status: {
          code: 5001,
          message: `Authorization invalid.`,
          datetime: dateTime,
        },
      });
    }

    // Parse transaction details early to avoid doing it multiple times
    let transDetails;
    try {
      transDetails = JSON.parse(trans_details);
    } catch (e) {
      return res.status(200).json({
        status: {
          code: 5002,
          message: `Bad format parameters (trans_details)`,
          datetime: dateTime,
        },
      });
    }

    let betFormDetails = {};
    if (betform_details) {
      try {
        betFormDetails = JSON.parse(betform_details);
      } catch (e) {
        return res.status(200).json({
          status: {
            code: 5002,
            message: `Bad format parameters (betform_details)`,
            datetime: dateTime,
          },
        });
      }
    }

    // Find user and check for duplicate transaction in parallel
    const [currentUser, existingTransaction] = await Promise.all([
      User.findOne({ username }, { _id: 1, username: 1, wallet: 1 }).lean(),
      SlotLFC888Modal.findOne({ tranId: tran_id, username }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        status: {
          code: 5002,
          message: `Bad format parameters (username)`,
          datetime: dateTime,
        },
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        status: {
          code: 5107,
          message: `Duplicate tran_id.`,
          datetime: dateTime,
        },
        data: {
          balance: roundToTwoDecimals(currentUser.wallet),
          currency: "MYR",
          tran_id,
        },
      });
    }

    const transferTypeInt = parseInt(transfer_type);
    let updatedUserBalance;

    // Handle bet transactions
    if ([10, 20, 30, 40, 60].includes(transferTypeInt)) {
      // Check for existing bet transaction
      const existingBetTransaction = await SlotLFC888Modal.findOne(
        {
          betId: transDetails.order_id,
          username,
        },
        { _id: 1 }
      ).lean();

      if (existingBetTransaction) {
        return res.status(200).json({
          status: {
            code: 5106,
            message: `The transction was settled.`,
            datetime: dateTime,
          },
        });
      }

      // Process bet - need to run these operations sequentially
      updatedUserBalance = await User.findOneAndUpdate(
        {
          _id: currentUser._id,
          wallet: { $gte: roundToTwoDecimals(Math.abs(amount || 0)) },
        },
        { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ).lean();

      if (!updatedUserBalance) {
        return res.status(200).json({
          status: {
            code: 5101,
            message: `Insufficient balance.`,
            datetime: dateTime,
          },
        });
      }

      await SlotLFC888Modal.create({
        username: currentUser.username,
        tranId: tran_id,
        betId: transDetails.order_id,
        bet: true,
        betamount: roundToTwoDecimals(Math.abs(amount)),
      });
    } else {
      // For all other transaction types, check if bet transaction exists
      const [existingSettleTransaction, existingBetTransaction] =
        await Promise.all([
          SlotLFC888Modal.findOne(
            {
              betId: transDetails.order_id,
              username,
              $or: [{ cancel: true }, { settle: true }],
            },
            { _id: 1 }
          ).lean(),

          SlotLFC888Modal.findOne(
            {
              betId: transDetails.order_id,
              username,
            },
            { _id: 1 }
          ).lean(),
        ]);

      if (existingSettleTransaction) {
        return res.status(200).json({
          status: {
            code: 5106,
            message: `The transction was settled.`,
            datetime: dateTime,
          },
        });
      }

      if (!existingBetTransaction) {
        return res.status(200).json({
          status: {
            code: 5105,
            message: `Transactions do not exist.`,
            datetime: dateTime,
          },
        });
      }

      // Process settlement, cancel, reward operations
      if ([11, 21, 31, 41, 61].includes(transferTypeInt)) {
        // Settlement operation - can run in parallel
        const [updatedBalance, _] = await Promise.all([
          User.findOneAndUpdate(
            { _id: currentUser._id },
            { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
            { new: true, projection: { wallet: 1 } }
          ).lean(),

          SlotLFC888Modal.findOneAndUpdate(
            { betId: transDetails.order_id },
            {
              $set: {
                settle: true,
                settleamount: roundToTwoDecimals(Math.abs(betFormDetails.win)),
                betamount: roundToTwoDecimals(betFormDetails.valid_bet),
              },
            },
            { upsert: true }
          ),
        ]);

        updatedUserBalance = updatedBalance;
      } else if ([12, 22, 32, 42, 62].includes(transferTypeInt)) {
        // Cancel operation
        updatedUserBalance = await User.findOneAndUpdate(
          { _id: currentUser._id },
          { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
          { new: true, projection: { wallet: 1 } }
        ).lean();

        if (!updatedUserBalance) {
          return res.status(200).json({
            status: {
              code: 5101,
              message: `Insufficient balance.`,
              datetime: dateTime,
            },
          });
        }

        await SlotLFC888Modal.findOneAndUpdate(
          { betId: transDetails.order_id },
          {
            $set: {
              cancel: true,
              refundamount: roundToTwoDecimals(amount),
            },
          },
          { upsert: true }
        );
      } else if ([14, 24, 34, 44, 64].includes(transferTypeInt)) {
        // Reward operation - can run in parallel
        const [updatedBalance, _] = await Promise.all([
          User.findOneAndUpdate(
            { _id: currentUser._id },
            { $inc: { wallet: roundToTwoDecimals(Math.abs(amount || 0)) } },
            { new: true, projection: { wallet: 1 } }
          ).lean(),

          SlotLFC888Modal.findOneAndUpdate(
            { betId: transDetails.order_id },
            {
              $set: {
                settle: true,
                rewardamount: roundToTwoDecimals(amount),
              },
            },
            { upsert: true }
          ),
        ]);

        updatedUserBalance = updatedBalance;
      }
    }

    // If we have an updated balance, use it. Otherwise, get the current balance.
    const finalBalance = updatedUserBalance
      ? roundToTwoDecimals(updatedUserBalance.wallet)
      : roundToTwoDecimals(
          (await User.findOne({ _id: currentUser._id }, { wallet: 1 }).lean())
            .wallet
        );

    return res.status(200).json({
      status: {
        code: 1000,
        message: `Success.`,
        datetime: dateTime,
      },
      data: {
        balance: finalBalance,
        currency: "MYR",
        tran_id,
      },
    });
  } catch (error) {
    console.error(
      "LFC888: Error in game provider transfer api:",
      error.message
    );

    return res.status(200).json({
      status: {
        code: 5201,
        message: `Internal server error`,
        datetime: dateTime,
      },
    });
  }
});

router.post("/api/lfc888/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLFC888Modal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      settle: true,
      cancel: { $ne: true },
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
        (record.rewardamount || 0) +
        (record.settleamount || 0) -
        (record.betamount || 0);
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
        gamename: "LFC888",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("LFC888: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      error: "LFC888: Failed to fetch win/loss report",
    });
  }
});

router.get(
  "/admin/api/lfc888/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLFC888Modal.find({
        username: user.username.toLowerCase(),
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
        totalWinLoss +=
          (record.rewardamount || 0) +
          (record.settleamount || 0) -
          (record.betamount || 0);
      });

      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      // Return the aggregated results
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "LFC888",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("LFC888: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        error: "LFC888: Failed to fetch win/loss report",
      });
    }
  }
);

router.get(
  "/admin/api/lfc888/:userId/gamedata",
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

          if (slotGames["LFC888"]) {
            totalTurnover += slotGames["LFC888"].turnover || 0;
            totalWinLoss += slotGames["LFC888"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "LFC888",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("LFC888: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        error: "LFC888: Failed to fetch win/loss report",
      });
    }
  }
);

router.get(
  "/admin/api/lfc888/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLFC888Modal.find({
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

        totalWinLoss +=
          (record.betamount || 0) -
          (record.settleamount || 0) -
          (record.rewardamount || 0);
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "LFC888",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("LFC888: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        error: "LFC888: Failed to fetch win/loss report",
      });
    }
  }
);

router.get(
  "/admin/api/lfc888/kioskreport",
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

          if (liveCasino["LFC888"]) {
            totalTurnover += Number(liveCasino["LFC888"].turnover || 0);
            totalWinLoss += Number(liveCasino["LFC888"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "LFC888",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("LFC888: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        error: "LFC888: Failed to fetch win/loss report",
      });
    }
  }
);
module.exports = router;
