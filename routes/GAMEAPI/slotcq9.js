const express = require("express");
const router = express.Router();
const axios = require("axios");
const moment = require("moment");
const crypto = require("crypto");
const { authenticateToken } = require("../../auth/auth");
const { authenticateAdminToken } = require("../../auth/adminAuth");
const {
  User,
  adminUserWalletLog,
  GameDataLog,
} = require("../../models/users.model");
const { adminUser, adminLog } = require("../../models/adminuser.model");
const GameWalletLog = require("../../models/gamewalletlog.model");
const Decimal = require("decimal.js");
const SlotCQ9Modal = require("../../models/slot_cq9.model");
const GameCq9GameModal = require("../../models/slot_cq9Database.model");

require("dotenv").config();

const webURL = "https://www.oc7.me/";
const cq9APIURL = "https://apii.cqgame.cc";
const cq9API_KEY = process.env.CQ9_APIKEY;

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

function generateFormattedDateTime() {
  return moment.utc().add(8, "hours").format("YYYY-MM-DDTHH:mm:ss-04:00");
}

function isValidRFC3339DateTime(dateTimeString) {
  if (
    !dateTimeString ||
    typeof dateTimeString !== "string" ||
    dateTimeString.length > 35
  ) {
    return false;
  }

  // Use moment to validate the basic ISO format
  const isValidMoment = moment(dateTimeString, moment.ISO_8601, true).isValid();

  // RFC3339 requires timezone information - must end with 'Z' or timezone offset like '+05:00' or '-04:00'
  const hasRequiredTimezone = /[Z]$|[+-]\d{2}:\d{2}$/.test(dateTimeString);

  return isValidMoment && hasRequiredTimezone;
}

function errorResponse(code, message, currentTime) {
  return {
    data: null,
    status: {
      code,
      message,
      datetime: currentTime,
    },
  };
}

// router.post("/api/cq9/import-games", async (req, res) => {
//   try {
//     const fs = require("fs");
//     const path = require("path");

//     // Path to your exported JSON file
//     const filePath = path.join(__dirname, "../../public/cq9.json");

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
//     const deleteResult = await GameCq9GameModal.deleteMany({});
//     console.log(`Deleted ${deleteResult.deletedCount} existing games`);

//     const insertResult = await GameCq9GameModal.insertMany(cleanGames);
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

// router.post("/api/cq9/syncgames", async (req, res) => {
//   try {
//     const response = await axios.get(`${cq9APIURL}/gameboy/game/list/cq9`, {
//       headers: {
//         "Content-Type": "application/x-www-form-urlencoded",
//         Authorization: cq9API_KEY,
//       },
//     });

//     const apiGameIds = response.data.data.map((game) => game.gamecode);

//     // Get all games from database
//     const dbGames = await GameCq9GameModal.find({}, "gameID");
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
//       await GameCq9GameModal.updateMany(
//         { gameID: { $in: extraInDb } },
//         { $set: { maintenance: true } }
//       );
//     }

//     // Update maintenance status for common games (set to false)
//     if (commonGames.length > 0) {
//       await GameCq9GameModal.updateMany(
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

// router.post("/api/cq9/getprovidergamelist", async (req, res) => {
//   try {
//     const response = await axios.get(`${cq9APIURL}/gameboy/game/list/cq9`, {
//       headers: {
//         "Content-Type": "application/x-www-form-urlencoded",
//         Authorization: cq9API_KEY,
//       },
//     });

//     return res.status(200).json({
//       success: true,
//       gameLobby: response.data,
//     });
//   } catch (error) {
//     console.log("CQ9 error in launching game", error.message);
//     return res.status(200).json({
//       success: false,
//       message: {
//         en: "CQ9: Game launch failed. Please try again or customer service for assistance.",
//         zh: "CQ9: 游戏启动失败，请重试或联系客服以获得帮助。",
//         ms: "CQ9: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
//         zh_hk: "CQ9: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
//         id: "CQ9: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
//       },
//     });
//   }
// });

router.post("/api/cq9/getgamelist", async (req, res) => {
  try {
    // Fetch all games from the database (or add filters as needed)
    const games = await GameCq9GameModal.find({
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
      createdAt: -1, // Different sort order
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
    console.log("CQ9 error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "CQ9: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "CQ9: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "CQ9: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

// Route to launch IA session
router.post("/api/cq9/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, gameCode, clientPlatform } = req.body;
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (user.gameLock.cq9.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
        },
      });
    }

    let lang = "en";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "zh-cn";
    } else if (gameLang === "ms") {
      lang = "en";
    }

    let platform = "WEB";
    if (clientPlatform === "web") {
      platform = "WEB";
    } else if (clientPlatform === "mobile") {
      platform = "MOBILE";
    }

    const requestData = {
      account: user.username,
      gamehall: "cq9",
      gamecode: gameCode,
      gameplat: platform,
      lang,
      gamesite: webURL,
    };

    const response = await axios.post(
      `${cq9APIURL}/gameboy/player/sw/gamelink`,
      requestData,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: cq9API_KEY,
        },
      }
    );

    if (response.data.status.code !== "0") {
      console.log("CQ9 error in launching game", response.data);

      if (
        response.data.status.code === "23" ||
        response.data.status.code === "26"
      ) {
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
          en: "CQ9: Game launch failed. Please try again or contact customer service for assistance.",
          zh: "CQ9: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "CQ9: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "CQ9"
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data.data.url,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
      },
    });
  } catch (error) {
    console.log("CQ9 error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "CQ9: Game launch failed. Please try again or customer service for assistance.",
        zh: "CQ9: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "CQ9: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/api/cq9/launchGameWlobby",
  authenticateToken,
  async (req, res) => {
    try {
      const { gameLang } = req.body;
      const userId = req.user.userId;
      const user = await User.findById(userId);

      if (user.gameLock.cq9.lock) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Your game access has been locked. Please contact customer support for further assistance.",
            zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
            ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
          },
        });
      }

      let lang = "en";

      if (gameLang === "en") {
        lang = "en";
      } else if (gameLang === "zh") {
        lang = "zh-cn";
      } else if (gameLang === "ms") {
        lang = "en";
      }

      const requestData = {
        account: user.username,
        lang,
      };

      const response = await axios.post(
        `${cq9APIURL}/gameboy/player/sw/lobbylink`,
        requestData,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: cq9API_KEY,
          },
        }
      );

      if (response.data.status.code !== "0") {
        console.log("CQ9 error in launching game", response.data);

        if (
          response.data.status.code === "23" ||
          response.data.status.code === "26"
        ) {
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
            en: "CQ9: Game launch failed. Please try again or contact customer service for assistance.",
            zh: "CQ9: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "CQ9: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "CQ9"
      );

      return res.status(200).json({
        success: true,
        gameLobby: response.data.data.url,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
        },
      });
    } catch (error) {
      console.log("CQ9 error in launching game", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "CQ9: Game launch failed. Please try again or customer service for assistance.",
          zh: "CQ9: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "CQ9: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.get("/api/cq9//player/check/:playerId", async (req, res) => {
  try {
    const playerId = req.params.playerId;

    const currentTime = generateFormattedDateTime();

    if (!playerId) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    const currentUser = await User.findOne(
      { username: playerId },
      { _id: 1 }
    ).lean();

    return res.status(200).json({
      data: !!currentUser, // Convert to boolean
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.get("/api/cq9//transaction/balance/:playerId", async (req, res) => {
  try {
    const playerId = req.params.playerId;

    const currentTime = generateFormattedDateTime();

    if (!playerId) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    const currentUser = await User.findOne(
      { username: playerId },
      { wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    const walletValue = Number(currentUser.wallet);

    const currentBalance = new Decimal(walletValue).toDecimalPlaces(4);

    return res.status(200).json({
      data: {
        balance: currentBalance.toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    console.log(error.message);
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9//transaction/game/bet", async (req, res) => {
  try {
    const { account, eventTime, gamehall, gamecode, roundid, amount, mtcode } =
      req.body;

    const currentTime = generateFormattedDateTime();

    if (
      !account ||
      !roundid ||
      !mtcode ||
      !eventTime ||
      !gamehall ||
      !gamecode ||
      amount === null ||
      amount === undefined
    ) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    if (amount < 0) {
      return res
        .status(200)
        .json(
          errorResponse(
            "1003",
            "Invalid amount: negative values are not allowed.",
            currentTime
          )
        );
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!isValidRFC3339DateTime(eventTime)) {
      return res
        .status(200)
        .json(errorResponse("1004", "Time Format error.", currentTime));
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne(
        { username: account },
        { _id: 1, wallet: 1, "gameLock.cq9.lock": 1, username: 1 }
      ).lean(),

      SlotCQ9Modal.findOne({ betTranId: mtcode, bet: true }, { _id: 1 }).lean(),
    ]);
    if (!currentUser) {
      return res

        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (currentUser.gameLock?.cq9?.lock) {
      return res
        .status(200)
        .json(
          errorResponse("1006", "This player has been disable.", currentTime)
        );
    }

    if (existingBet) {
      const walletValue = Number(currentUser.wallet);

      const currentBalance = new Decimal(walletValue).toDecimalPlaces(4);

      return res.status(200).json({
        data: {
          balance: currentBalance.toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    const betAmount = new Decimal(Number(amount || 0)).toDecimalPlaces(4); // Keeps as Decimal

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: betAmount.toNumber() },
      },
      { $inc: { wallet: -betAmount.toNumber() } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res
        .status(200)
        .json(errorResponse("1005", "Insufficient balance.", currentTime));
    }

    await SlotCQ9Modal.create({
      username: currentUser.username,
      betId: roundid,
      bet: true,
      betamount: betAmount.toNumber(),
      betTranId: mtcode,
      gametype: "SLOT",
    });

    const updatewalletValue = Number(updatedUserBalance.wallet);

    const updatedBalance = new Decimal(updatewalletValue).toDecimalPlaces(4);
    return res.status(200).json({
      data: {
        balance: updatedBalance.toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    console.log("bet failed", error.message);
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9//transaction/game/endround", async (req, res) => {
  try {
    const {
      account,
      roundid,
      gamehall,
      gamecode,
      createTime,
      freeticket,
      data: checkedData,
    } = req.body;
    const currentTime = generateFormattedDateTime();

    if (
      !account ||
      !roundid ||
      !checkedData ||
      !gamehall ||
      !gamecode ||
      !createTime
    ) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    let data = req.body.data;

    data = JSON.parse(data);

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!isValidRFC3339DateTime(createTime)) {
      return res
        .status(200)
        .json(errorResponse("1004", "Time Format error.", currentTime));
    }

    for (const item of data) {
      if (item.amount < 0) {
        return res
          .status(200)
          .json(
            errorResponse(
              "1003",
              "Invalid amount: negative values are not allowed.",
              currentTime
            )
          );
      }
    }

    const totalAmount = data.reduce(
      (sum, item) => sum + (Number(item.amount) || 0),
      0
    );

    const [currentUser, existingBet] = await Promise.all([
      User.findOne({ username: account }, { _id: 1, wallet: 1 }).lean(),
      SlotCQ9Modal.findOne({ betId: roundid, bet: true }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!freeticket) {
      if (!existingBet) {
        return res
          .status(200)
          .json(
            errorResponse("1014", "Transaction record not found.", currentTime)
          );
      }
    }

    const mtcodes = data.map((item) => item.mtcode).filter(Boolean);

    const existingSettleBet = await SlotCQ9Modal.findOne(
      { settleTranId: { $in: mtcodes }, settle: true },
      { _id: 1, endroundbalanceattime: 1 }
    ).lean();

    if (existingSettleBet) {
      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(
            existingSettleBet.endroundbalanceattime !== null &&
            existingSettleBet.endroundbalanceattime !== undefined
              ? existingSettleBet.endroundbalanceattime
              : walletValue
          )
            .toDecimalPlaces(4)
            .toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    const winAmount = new Decimal(Number(totalAmount || 0)).toDecimalPlaces(4); // Keeps as Decimal

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { _id: currentUser._id },
        { $inc: { wallet: winAmount.toNumber() } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      freeticket
        ? SlotCQ9Modal.create({
            username: account,
            betId: roundid,
            bet: true,
            settle: true,
            betamount: 0,
            settleamount: winAmount.toNumber(),
            settleTranId: mtcodes,
            gametype: "SLOT",
          })
        : SlotCQ9Modal.updateOne(
            { betId: roundid },
            {
              $set: {
                settle: true,
                settleamount: winAmount.toNumber(),
                settleTranId: mtcodes,
              },
            }
          ),
    ]);

    const updatewalletValue = Number(updatedUserBalance.wallet);

    SlotCQ9Modal.updateMany(
      {
        betId: roundid,
      },
      {
        $set: {
          endroundbalanceattime: new Decimal(updatewalletValue)
            .toDecimalPlaces(4)
            .toNumber(),
          settle: true,
          settleTranId: mtcodes,
          username: account,
        },
      }
    ).catch((error) => {
      console.error("Error updating endroundbalanceattime:", error);
    });

    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9//transaction/game/rollout", async (req, res) => {
  try {
    const { account, roundid, amount, mtcode, eventTime, gamehall, gamecode } =
      req.body;

    const currentTime = generateFormattedDateTime();

    if (
      !account ||
      !roundid ||
      !eventTime ||
      !gamehall ||
      !gamecode ||
      !mtcode ||
      amount === null ||
      amount === undefined
    ) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!isValidRFC3339DateTime(eventTime)) {
      return res
        .status(200)
        .json(errorResponse("1004", "Time Format error.", currentTime));
    }

    if (amount < 0) {
      return res
        .status(200)
        .json(
          errorResponse(
            "1003",
            "Invalid amount: negative values are not allowed.",
            currentTime
          )
        );
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne(
        { username: account },
        { _id: 1, wallet: 1, "gameLock.cq9.lock": 1, username: 1 }
      ),
      SlotCQ9Modal.findOne(
        { rolloutTranId: mtcode, bet: true },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (currentUser.gameLock?.cq9?.lock) {
      return res
        .status(200)
        .json(
          errorResponse("1006", "This player has been disable.", currentTime)
        );
    }

    if (existingBet) {
      const walletValue = Number(currentUser.wallet);

      const currentBalance = new Decimal(walletValue).toDecimalPlaces(4);

      return res.status(200).json({
        data: {
          balance: currentBalance.toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    const betAmount = new Decimal(Number(amount || 0)).toDecimalPlaces(4); // Keeps as Decimal

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: betAmount.toNumber() },
      },
      { $inc: { wallet: -betAmount.toNumber() } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res
        .status(200)
        .json(errorResponse("1005", "Insufficient balance.", currentTime));
    }

    await SlotCQ9Modal.create({
      username: currentUser.username,
      betId: roundid,
      bet: true,
      depositamount: betAmount.toNumber(),
      rolloutTranId: mtcode,
    });

    const updatewalletValue = Number(updatedUserBalance.wallet);

    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9//transaction/game/takeall", async (req, res) => {
  try {
    const { account, roundid, mtcode, eventTime, gamehall, gamecode } =
      req.body;
    const currentTime = generateFormattedDateTime();

    if (
      !account ||
      !roundid ||
      !eventTime ||
      !gamehall ||
      !gamecode ||
      !mtcode
    ) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!isValidRFC3339DateTime(eventTime)) {
      return res
        .status(200)
        .json(errorResponse("1004", "Time Format error.", currentTime));
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne(
        { username: account },
        { _id: 1, wallet: 1, "gameLock.cq9.lock": 1, username: 1 }
      ).lean(),

      SlotCQ9Modal.findOne(
        { takeallTransId: mtcode, bet: true },
        { betamount: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (currentUser.gameLock?.cq9?.lock) {
      return res
        .status(200)
        .json(
          errorResponse("1006", "This player has been disable.", currentTime)
        );
    }

    if (existingBet) {
      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          amount: existingBet.betamount,
          balance: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    const freshUserData = await User.findById(currentUser._id, {
      wallet: 1,
    }).lean();
    const freshwalletValue = Number(freshUserData.wallet);

    const Allbalance = new Decimal(freshwalletValue || 0).toDecimalPlaces(4);
    const takeallAmount = Allbalance.toNumber();

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: takeallAmount },
      },
      { $inc: { wallet: -takeallAmount } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res
        .status(200)
        .json(errorResponse("1005", "Insufficient balance.", currentTime));
    }

    await SlotCQ9Modal.create({
      username: currentUser.username,
      betId: roundid,
      bet: true,
      depositamount: takeallAmount,
      takeallTransId: mtcode,
    });

    const updatewalletValue = Number(updatedUserBalance.wallet);

    return res.status(200).json({
      data: {
        amount: takeallAmount,
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9//transaction/game/rollin", async (req, res) => {
  try {
    // Extract parameters
    const {
      account,
      eventTime,
      gamehall,
      gamecode,
      roundid,
      validbet,
      bet,
      win,
      roomfee = 0,
      amount,
      mtcode,
      createTime,
      rake,
      gametype,
      tableid,
    } = req.body;

    const currentTime = generateFormattedDateTime();

    // Validate required parameters
    if (
      !account ||
      !eventTime ||
      !gamehall ||
      !gamecode ||
      !roundid ||
      bet === undefined ||
      win === undefined ||
      amount === undefined ||
      !mtcode ||
      !createTime ||
      rake === undefined ||
      !gametype
    ) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    if (amount < 0) {
      return res
        .status(200)
        .json(
          errorResponse(
            "1003",
            "Invalid amount: negative values are not allowed.",
            currentTime
          )
        );
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!isValidRFC3339DateTime(eventTime)) {
      return res
        .status(200)
        .json(errorResponse("1004", "Time Format error.", currentTime));
    }

    const [currentUser, existingBet, existingTransaction] = await Promise.all([
      User.findOne({ username: account }, { _id: 1, wallet: 1 }).lean(),
      SlotCQ9Modal.findOne({ betId: roundid, bet: true }, { _id: 1 }).lean(),
      SlotCQ9Modal.findOne(
        { rollinTransId: mtcode, settle: true },
        { _id: 1, rollinbalanceattime: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!existingBet) {
      return res
        .status(200)
        .json(
          errorResponse("1014", "Transaction record not found.", currentTime)
        );
    }

    if (existingTransaction) {
      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(
            existingTransaction.rollinbalanceattime !== null &&
            existingTransaction.rollinbalanceattime !== undefined
              ? existingTransaction.rollinbalanceattime
              : walletValue
          )
            .toDecimalPlaces(4)
            .toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    const rollinAmount = Number(amount);

    let betAmt = 0;
    if (["table", "live"].includes(gametype.toLowerCase())) {
      betAmt = validbet || 0;
    } else if (["fish", "arcade"].includes(gametype.toLowerCase())) {
      betAmt = bet || 0;
    }

    const finalBetAmount = new Decimal(Number(betAmt))
      .toDecimalPlaces(4)
      .toNumber();

    let winAmt = 0;
    if (win !== undefined && win !== "null") {
      if (new Decimal(win).greaterThanOrEqualTo(0)) {
        winAmt = new Decimal(win).toDecimalPlaces(4).toNumber();
      }
    }

    const finalWinAmount = new Decimal(Number(winAmt))
      .toDecimalPlaces(4)
      .toNumber();

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { _id: currentUser._id },
        {
          $inc: {
            wallet: new Decimal(rollinAmount || 0)
              .toDecimalPlaces(4)
              .toNumber(),
          },
        },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotCQ9Modal.updateOne(
        { betId: roundid },
        {
          $set: {
            settle: true,
            withdrawamount: new Decimal(rollinAmount || 0)
              .toDecimalPlaces(4)
              .toNumber(),
            betamount: finalBetAmount || 0,
            settleamount: finalWinAmount || 0,
            rollinTransId: mtcode,
            gametype: gametype.toUpperCase(),
          },
        }
      ),
    ]);

    const updatewalletValue = Number(updatedUserBalance.wallet);

    SlotCQ9Modal.updateMany(
      {
        betId: roundid,
      },
      {
        $set: {
          rollinbalanceattime: new Decimal(updatewalletValue)
            .toDecimalPlaces(4)
            .toNumber(),
          settle: true,
          rollinTransId: mtcode,
          gametype: gametype.toUpperCase(),
        },
      }
    ).catch((error) => {
      console.error("Error updating rollinbalanceattime:", error);
    });

    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    console.error("Error in CQ9 rollin:", error);
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9//transaction/game/debit", async (req, res) => {
  try {
    const { account, roundid, amount, mtcode, eventTime, gamehall, gamecode } =
      req.body;
    const currentTime = generateFormattedDateTime();

    if (
      !account ||
      !roundid ||
      !mtcode ||
      !eventTime ||
      !gamehall ||
      !gamecode ||
      amount === null ||
      amount === undefined
    ) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    if (amount < 0) {
      return res
        .status(200)
        .json(
          errorResponse(
            "1003",
            "Invalid amount: negative values are not allowed.",
            currentTime
          )
        );
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!isValidRFC3339DateTime(eventTime)) {
      return res
        .status(200)
        .json(errorResponse("1004", "Time Format error.", currentTime));
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne(
        { username: account },
        { _id: 1, wallet: 1, "gameLock.cq9.lock": 1, username: 1 }
      ).lean(),
      SlotCQ9Modal.findOne(
        { betTranId: mtcode, bet: true },
        { _id: 1, debitbalanceattime: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (currentUser.gameLock?.cq9?.lock) {
      return res
        .status(200)
        .json(
          errorResponse("1006", "This player has been disable.", currentTime)
        );
    }

    if (existingBet) {
      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(
            existingBet.debitbalanceattime !== null &&
            existingBet.debitbalanceattime !== undefined
              ? existingBet.debitbalanceattime
              : walletValue
          )
            .toDecimalPlaces(4)
            .toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    const betAmount = Number(amount || 0); // Keeps as Decimal

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: new Decimal(betAmount).toDecimalPlaces(4).toNumber() },
      },
      {
        $inc: { wallet: -new Decimal(betAmount).toDecimalPlaces(4).toNumber() },
      },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res
        .status(200)
        .json(errorResponse("1005", "Insufficient balance.", currentTime));
    }

    await SlotCQ9Modal.create({
      username: currentUser.username,
      betId: roundid,
      bet: true,
      betamount: new Decimal(betAmount).toDecimalPlaces(4).toNumber(),
      betTranId: mtcode,
      debitbalanceattime: new Decimal(Number(updatedUserBalance.wallet))
        .toDecimalPlaces(4)
        .toNumber(),
    });

    const updatewalletValue = Number(updatedUserBalance.wallet);

    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9//transaction/game/credit", async (req, res) => {
  try {
    const { account, roundid, amount, mtcode, eventTime, gamehall, gamecode } =
      req.body;
    const currentTime = generateFormattedDateTime();

    if (
      !account ||
      !roundid ||
      !eventTime ||
      !gamehall ||
      !gamecode ||
      !mtcode ||
      amount === null ||
      amount === undefined
    ) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    if (amount < 0) {
      return res
        .status(200)
        .json(
          errorResponse(
            "1003",
            "Invalid amount: negative values are not allowed.",
            currentTime
          )
        );
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!isValidRFC3339DateTime(eventTime)) {
      return res
        .status(200)
        .json(errorResponse("1004", "Time Format error.", currentTime));
    }

    const [currentUser, existingBet, existingSettleBet] = await Promise.all([
      User.findOne({ username: account }, { _id: 1, wallet: 1, username: 1 }),
      SlotCQ9Modal.findOne({ betId: roundid, bet: true }, { _id: 1 }).lean(),
      SlotCQ9Modal.findOne(
        { settleTranId: mtcode, settle: true },
        { _id: 1, creditbalanceattime: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!existingBet) {
      return res
        .status(200)
        .json(
          errorResponse("1014", "Transaction record not found.", currentTime)
        );
    }

    if (existingSettleBet) {
      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(
            existingSettleBet.creditbalanceattime !== null &&
            existingSettleBet.creditbalanceattime !== undefined
              ? existingSettleBet.creditbalanceattime
              : walletValue
          )
            .toDecimalPlaces(4)
            .toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    const winAmount = Number(amount || 0);

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { _id: currentUser._id },
        {
          $inc: {
            wallet: new Decimal(winAmount).toDecimalPlaces(4).toNumber(),
          },
        },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
      SlotCQ9Modal.findOneAndUpdate(
        { betId: roundid },
        {
          $set: {
            settle: true,
            settleamount: new Decimal(winAmount).toDecimalPlaces(4).toNumber(),
            settleTranId: mtcode,
          },
        },
        { upsert: true }
      ),
    ]);

    const updatewalletValue = Number(updatedUserBalance.wallet);

    SlotCQ9Modal.updateMany(
      {
        betId: roundid,
      },
      {
        $set: {
          creditbalanceattime: new Decimal(updatewalletValue)
            .toDecimalPlaces(4)
            .toNumber(),
          settleTranId: mtcode,
          settle: true,
        },
      }
    ).catch((error) => {
      console.error("Error updating creditbalanceattime:", error);
    });

    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9//transaction/user/payoff", async (req, res) => {
  try {
    const { account, mtcode, amount, eventTime } = req.body;
    const currentTime = generateFormattedDateTime();

    if (
      !account ||
      !eventTime ||
      !mtcode ||
      amount === null ||
      amount === undefined
    ) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    if (amount < 0) {
      return res
        .status(200)
        .json(
          errorResponse(
            "1003",
            "Invalid amount: negative values are not allowed.",
            currentTime
          )
        );
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!isValidRFC3339DateTime(eventTime)) {
      return res
        .status(200)
        .json(errorResponse("1004", "Time Format error.", currentTime));
    }

    const [currentUser, existingSettleBet] = await Promise.all([
      User.findOne(
        { username: account },
        { _id: 1, wallet: 1, username: 1 }
      ).lean(),
      SlotCQ9Modal.findOne({ promoTransId: mtcode }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (existingSettleBet) {
      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    const winAmount = Number(amount || 0);

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { _id: currentUser._id },
        {
          $inc: {
            wallet: new Decimal(winAmount).toDecimalPlaces(4).toNumber(),
          },
        },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
      SlotCQ9Modal.create({
        username: currentUser.username,
        promoTransId: mtcode,
        bet: true,
        settle: true,
        betamount: 0,
        settleamount: new Decimal(winAmount).toDecimalPlaces(4).toNumber(),
      }),
    ]);

    const updatewalletValue = Number(updatedUserBalance.wallet);

    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9//transaction/game/refund", async (req, res) => {
  try {
    const { account, mtcode } = req.body;
    const currentTime = generateFormattedDateTime();

    if (!account || !mtcode) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    const currentUser = await User.findOne(
      { username: account },
      { _id: 1, wallet: 1, username: 1 }
    ).lean();

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    const existingBet = await SlotCQ9Modal.findOne(
      {
        $or: [
          { betTranId: mtcode },
          { betId: mtcode },
          { takeallTransId: mtcode },
          { rolloutTranId: mtcode },
        ],
        bet: true,
      },
      { betamount: 1, depositamount: 1 }
    ).lean();

    if (!existingBet) {
      return res
        .status(200)
        .json(
          errorResponse("1014", "Transaction record not found.", currentTime)
        );
    }

    const existingCancelBet = await SlotCQ9Modal.findOne(
      {
        $or: [
          { betTranId: mtcode },
          { betId: mtcode },
          { takeallTransId: mtcode },
          { rolloutTranId: mtcode },
        ],
        refund: true,
      },
      { _id: 1, balanceattime: 1 }
    ).lean();

    if (existingCancelBet) {
      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(
            existingCancelBet.balanceattime !== null &&
            existingCancelBet.balanceattime !== undefined
              ? existingCancelBet.balanceattime
              : walletValue
          )
            .toDecimalPlaces(4)
            .toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    const isRolloutTransaction = await SlotCQ9Modal.findOne(
      {
        $or: [{ takeallTransId: mtcode }, { rolloutTranId: mtcode }],
        bet: true,
      },
      { _id: 1 }
    ).lean();

    let refundAmountValue;
    if (isRolloutTransaction) {
      refundAmountValue = Number(existingBet.depositamount || 0);
    } else {
      refundAmountValue = Number(existingBet.betamount || 0);
    }

    const refundAmount = new Decimal(refundAmountValue).toDecimalPlaces(4);

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { _id: currentUser._id },
        { $inc: { wallet: refundAmount.toNumber() } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
      SlotCQ9Modal.updateOne(
        {
          $or: [
            { betTranId: mtcode },
            { betId: mtcode },
            { takeallTransId: mtcode },
            { rolloutTranId: mtcode },
          ],
        },
        { $set: { refund: true, refundAmount: refundAmount.toNumber() } }
      ),
    ]);

    const updatewalletValue = Number(updatedUserBalance.wallet);

    SlotCQ9Modal.updateMany(
      {
        $or: [
          { betTranId: mtcode },
          { betId: mtcode },
          { takeallTransId: mtcode },
          { rolloutTranId: mtcode },
        ],
      },
      {
        $set: {
          balanceattime: new Decimal(updatewalletValue)
            .toDecimalPlaces(4)
            .toNumber(),
          refund: true,
        },
      }
    ).catch((error) => {
      console.error("Error updating balanceattime:", error);
    });

    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9//transaction/game/bets", async (req, res) => {
  try {
    // Extract parameters from request body
    const { account, gamehall, gamecode, data, createTime } = req.body;
    const currentTime = generateFormattedDateTime();

    // Validate required parameters
    if (
      !account ||
      !data ||
      !Array.isArray(data) ||
      !gamehall ||
      !gamecode ||
      !createTime
    ) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (!isValidRFC3339DateTime(createTime)) {
      return res
        .status(200)
        .json(errorResponse("1004", "Time Format error.", currentTime));
    }

    const currentUser = await User.findOne(
      { username: account },
      { _id: 1, wallet: 1, "gameLock.cq9.lock": 1, username: 1 }
    ).lean();

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (currentUser.gameLock?.cq9?.lock) {
      return res
        .status(200)
        .json(
          errorResponse("1006", "This player has been disable.", currentTime)
        );
    }

    const mtcodes = data.map((item) => item.mtcode);
    const existingTransactions = await SlotCQ9Modal.find(
      { betTranId: { $in: mtcodes }, bet: true },
      { _id: 1 }
    ).lean();

    // If any transactions already exist, return the current balance without deducting anything
    if (existingTransactions.length > 0) {
      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    // Calculate total amount to deduct
    let totalAmount = new Decimal(0);
    for (const item of data) {
      totalAmount = totalAmount.plus(new Decimal(item.amount || 0));
    }

    const toUpdateAmount = totalAmount.toDecimalPlaces(4);

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: toUpdateAmount.toNumber() },
      },
      { $inc: { wallet: -toUpdateAmount.toNumber() } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res
        .status(200)
        .json(errorResponse("1005", "Insufficient balance.", currentTime));
    }

    const betRecords = data.map((item) => ({
      username: account,
      betTranId: item.mtcode,
      bet: true,
      betamount: new Decimal(Number(item.amount)).toDecimalPlaces(4).toNumber(),
      betId: item.roundid,
    }));

    await SlotCQ9Modal.insertMany(betRecords);

    const updatewalletValue = Number(updatedUserBalance.wallet);

    // Return successful response
    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    console.error("Error in CQ9 batch bets:", error);
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9//transaction/game/refunds", async (req, res) => {
  try {
    const { mtcode } = req.body;
    const currentTime = generateFormattedDateTime();

    if (!mtcode || !Array.isArray(mtcode) || mtcode.length === 0) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    // Find all bet transactions with the provided mtcodes
    const betTransactions = await SlotCQ9Modal.find(
      { betTranId: { $in: mtcode }, bet: true },
      { username: 1, betamount: 1 }
    ).lean();

    // Check if all mtcodes were found
    if (betTransactions.length !== mtcode.length) {
      return res
        .status(200)
        .json(
          errorResponse("1014", "Transaction record not found.", currentTime)
        );
    }

    // Check if any transactions are already refunded
    const refundedTransactions = await SlotCQ9Modal.find(
      { betTranId: { $in: mtcode }, refund: true },
      { _id: 1 }
    ).lean();

    const username = betTransactions[0].username;

    if (refundedTransactions.length === mtcode.length) {
      const currentUser = await User.findOne(
        { username },
        { wallet: 1 }
      ).lean();

      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    // Calculate total amount to refund
    let totalAmount = new Decimal(0);
    for (const transaction of betTransactions) {
      totalAmount = totalAmount.plus(new Decimal(transaction.betamount || 0));
    }

    const currentUser = await User.findOne(
      { username },
      { _id: 1, wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { _id: currentUser._id },
        {
          $inc: {
            wallet: new Decimal(totalAmount).toDecimalPlaces(4).toNumber(),
          },
        },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotCQ9Modal.updateMany(
        { betTranId: { $in: mtcode } },
        { $set: { refund: true } }
      ),
    ]);

    const updatewalletValue = Number(updatedUserBalance.wallet);

    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    console.error("Error in CQ9 batch refunds:", error);
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

// Cancel Endpoint (for Sports and Lotto)
router.post("/api/cq9//transaction/game/cancel", async (req, res) => {
  try {
    // Extract parameters from request body
    const { mtcode } = req.body;
    const currentTime = generateFormattedDateTime();

    // Validate required parameters
    if (!mtcode || !Array.isArray(mtcode) || mtcode.length === 0) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    // Find all refund transactions with the provided mtcodes
    const refundTransactions = await SlotCQ9Modal.find(
      { betTranId: { $in: mtcode }, refund: true },
      { username: 1, refundAmount: 1, _id: 1 }
    ).lean();

    if (refundTransactions.length !== mtcode.length) {
      return res
        .status(200)
        .json(
          errorResponse("1014", "Transaction record not found.", currentTime)
        );
    }

    const cancelledTransactions = await SlotCQ9Modal.find(
      { betTranId: { $in: mtcode }, cancelRefund: true },
      { _id: 1 }
    ).lean();

    const username = refundTransactions[0].username;

    // If all refunds are already cancelled, return success without changing balance
    if (cancelledTransactions.length === mtcode.length) {
      const currentUser = await User.findOne(
        { username },
        { wallet: 1 }
      ).lean();

      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    // Calculate total amount to cancel (deduct from user again)
    let totalAmount = new Decimal(0);
    for (const transaction of refundTransactions) {
      totalAmount = totalAmount.plus(
        new Decimal(transaction.refundAmount || 0)
      );
    }

    const currentUser = await User.findOne(
      { username },
      { _id: 1, wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: {
          $gte: new Decimal(totalAmount).toDecimalPlaces(4).toNumber(),
        },
      },
      {
        $inc: {
          wallet: -new Decimal(totalAmount).toDecimalPlaces(4).toNumber(),
        },
      },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res
        .status(200)
        .json(errorResponse("1005", "Insufficient balance.", currentTime));
    }

    await SlotCQ9Modal.updateMany(
      { _id: { $in: refundTransactions.map((t) => t._id) } },
      {
        $set: {
          cancelRefund: true,
          refund: false,
        },
      }
    );

    const updatewalletValue = Number(updatedUserBalance.wallet);

    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    console.error("Error in CQ9 batch cancel:", error);
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9//transaction/game/wins", async (req, res) => {
  try {
    const { list } = req.body;
    const currentTime = generateFormattedDateTime();

    if (!list || !Array.isArray(list) || list.length === 0) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    const successResults = [];
    const failedResults = [];

    // Process each batch (user) in the list
    for (const batch of list) {
      const { account, ucode, event } = batch;

      if (!account || !ucode || !event || !Array.isArray(event)) {
        failedResults.push({
          account: account || "unknown",
          code: "1003",
          message: "Parameter error.",
          ucode: ucode || "unknown",
        });
        continue;
      }

      // Find the user
      const currentUser = await User.findOne(
        { username: account },
        { _id: 1, wallet: 1 }
      ).lean();
      if (!currentUser) {
        failedResults.push({
          account,
          code: "1006",
          message: "Player not found.",
          ucode,
        });
        continue;
      }

      // Collect all mtcodes to check for existing transactions
      const mtcodes = event.map((item) => item.mtcode);
      const existingTransactions = await SlotCQ9Modal.find(
        { betTranId: { $in: mtcodes }, settle: true },
        { _id: 1 }
      ).lean();

      // If all transactions already exist, return success without updating balance
      if (existingTransactions.length === event.length) {
        const walletValue = Number(currentUser.wallet);

        successResults.push({
          account,
          balance: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
          currency: "MYR",
          ucode,
        });
        continue;
      }

      // Calculate total amount to add
      let totalAmount = new Decimal(0);
      for (const item of event) {
        totalAmount = totalAmount.plus(new Decimal(item.amount || 0));
      }

      const toUpdateAmount = totalAmount.toDecimalPlaces(4);

      // Update user balance
      const updatedUserBalance = await User.findOneAndUpdate(
        { _id: currentUser._id },
        { $inc: { wallet: toUpdateAmount.toNumber() } },
        { new: true, projection: { wallet: 1 } }
      ).lean();

      const updatePromises = event.map((item) =>
        SlotCQ9Modal.updateOne(
          { betTranId: item.mtcode },
          {
            $set: {
              settle: true,
              settleamount: new Decimal(item.amount)
                .toDecimalPlaces(4)
                .toNumber(),
            },
          }
        )
      );
      await Promise.all(updatePromises);

      const updatewalletValue = Number(updatedUserBalance.wallet);

      successResults.push({
        account,
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
        ucode,
      });
    }

    return res.status(200).json({
      data: {
        success: successResults,
        failed: failedResults,
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    console.error("Error in CQ9 wins:", error);
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

// Route to handle batch amends (for multiple players)
router.post("/api/cq9//transaction/game/amends", async (req, res) => {
  try {
    const { list } = req.body;
    const currentTime = generateFormattedDateTime();

    if (!list || !Array.isArray(list) || list.length === 0) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    const verifyToken = req.headers.wtoken;

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    const successResults = [];
    const failedResults = [];

    // Process each batch (user) in the list
    for (const batch of list) {
      const { account, ucode, event, amount, action } = batch;

      if (
        !account ||
        !ucode ||
        !event ||
        !Array.isArray(event) ||
        amount === undefined ||
        !action
      ) {
        failedResults.push({
          account: account || "unknown",
          code: "1003",
          message: "Parameter error.",
          ucode: ucode || "unknown",
        });
        continue;
      }

      // Validate amount is not negative
      if (amount < 0) {
        failedResults.push({
          account,
          code: "1003",
          message: "Invalid amount: negative values are not allowed.",
          ucode,
        });
        continue;
      }

      // Find the user
      const currentUser = await User.findOne(
        { username: account },
        { _id: 1, wallet: 1 }
      ).lean();
      if (!currentUser) {
        failedResults.push({
          account,
          code: "1006",
          message: "Player not found.",
          ucode,
        });
        continue;
      }

      const mtcodes = event.map((item) => item.mtcode);
      // Check if this amend operation already exists
      const existingAmend = await SlotCQ9Modal.findOne(
        { betTranId: { $in: mtcodes }, amend: true },
        { _id: 1 }
      ).lean();

      const walletValue = Number(currentUser.wallet);

      if (existingAmend) {
        successResults.push({
          account,
          currency: "MYR",
          before: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
          balance: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
          ucode,
        });
        continue;
      }

      const toUpdateAmount = new Decimal(amount || 0).toDecimalPlaces(4);

      const balanceBefore = new Decimal(walletValue)
        .toDecimalPlaces(4)
        .toNumber();

      let updatedUserBalance;

      if (action.toLowerCase() === "debit") {
        // For debit, we need to ensure user has sufficient balance
        updatedUserBalance = await User.findOneAndUpdate(
          {
            _id: currentUser._id,
            wallet: { $gte: toUpdateAmount.toNumber() },
          },
          { $inc: { wallet: -toUpdateAmount.toNumber() } },
          { new: true, projection: { wallet: 1 } }
        ).lean();

        // If update failed, the user didn't have sufficient balance
        if (!updatedUserBalance) {
          failedResults.push({
            account,
            code: "1005",
            message: "Insufficient balance.",
            ucode,
          });
          continue;
        }
      } else if (action.toLowerCase() === "credit") {
        // For credit, no need to check balance
        updatedUserBalance = await User.findOneAndUpdate(
          { _id: currentUser._id },
          { $inc: { wallet: toUpdateAmount.toNumber() } },
          { new: true, projection: { wallet: 1 } }
        ).lean();
      }

      // Record each event item as a separate transaction and update existing records
      const updatePromises = event.map((item) => {
        const {
          mtcode,
          amount: itemAmount,
          action: itemAction,
          roundid,
          eventtime: itemEventTime,
          validbet,
          gamecode: itemGameCode,
        } = item;

        if (!mtcode || !itemAmount || !itemAction) {
          return Promise.resolve();
        }

        // Different updates based on action type
        if (itemAction.toLowerCase() === "credit") {
          return SlotCQ9Modal.updateMany(
            { betId: roundid },
            {
              $set: {
                settle: true,
                amend: true,
                settleamount: new Decimal(itemAmount)
                  .toDecimalPlaces(4)
                  .toNumber(),
              },
            }
          );
        } else if (itemAction.toLowerCase() === "debit") {
          return SlotCQ9Modal.updateMany(
            { betId: roundid },
            {
              $set: {
                bet: true,
                amend: true,
                betamount: new Decimal(itemAmount)
                  .toDecimalPlaces(4)
                  .toNumber(),
              },
            }
          );
        }

        return Promise.resolve();
      });

      await Promise.all(updatePromises);
      // Add to success results
      const updatewalletValue = Number(updatedUserBalance.wallet);

      successResults.push({
        account,
        currency: "MYR",
        before: balanceBefore,
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        ucode,
      });
    }

    return res.status(200).json({
      data: {
        success: successResults,
        failed: failedResults,
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    console.error("Error in CQ9 amends:", error);
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.post("/api/cq9//transaction/game/amend", async (req, res) => {
  try {
    const { account, action, amount, data } = req.body;
    const verifyToken = req.headers.wtoken;
    const currentTime = generateFormattedDateTime();

    // Early validation
    if (
      !account ||
      !action ||
      amount === undefined ||
      !data ||
      !Array.isArray(data)
    ) {
      return res
        .status(200)
        .json(errorResponse("1003", "Parameter error.", currentTime));
    }

    if (cq9API_KEY !== verifyToken) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    if (amount < 0) {
      return res
        .status(200)
        .json(
          errorResponse(
            "1003",
            "Invalid amount: negative values are not allowed.",
            currentTime
          )
        );
    }

    // Find the user
    const currentUser = await User.findOne(
      { username: account },
      { _id: 1, wallet: 1 }
    ).lean();
    if (!currentUser) {
      return res
        .status(200)
        .json(errorResponse("1006", "Player not found.", currentTime));
    }

    const mtcodes = data.map((item) => item.mtcode);
    const existingAmend = await SlotCQ9Modal.findOne(
      { betTranId: { $in: mtcodes }, amend: true },
      { _id: 1 }
    ).lean();

    if (existingAmend) {
      const walletValue = Number(currentUser.wallet);

      return res.status(200).json({
        data: {
          balance: new Decimal(walletValue).toDecimalPlaces(4).toNumber(),
          currency: "MYR",
        },
        status: {
          code: "0",
          message: "Success",
          datetime: currentTime,
        },
      });
    }

    const toUpdateAmount = new Decimal(amount).toDecimalPlaces(4);

    let updatedUserBalance;
    if (action.toLowerCase() === "debit") {
      updatedUserBalance = await User.findOneAndUpdate(
        {
          _id: currentUser._id,
          wallet: { $gte: toUpdateAmount.toNumber() },
        },
        { $inc: { wallet: -toUpdateAmount.toNumber() } },
        { new: true, projection: { wallet: 1 } }
      ).lean();

      // If update failed, the user didn't have sufficient balance
      if (!updatedUserBalance) {
        return res
          .status(200)
          .json(errorResponse("1005", "Insufficient balance.", currentTime));
      }
    } else if (action.toLowerCase() === "credit") {
      // For credit, no need to check balance
      updatedUserBalance = await User.findOneAndUpdate(
        { _id: currentUser._id },
        { $inc: { wallet: toUpdateAmount.toNumber() } },
        { new: true, projection: { wallet: 1 } }
      ).lean();
    }

    const updatePromises = data.map((item) => {
      const { mtcode, amount: itemAmount, action: itemAction, roundid } = item;

      if (!mtcode || !itemAmount || !itemAction) {
        return Promise.resolve();
      }

      // Different updates based on action type
      if (itemAction.toLowerCase() === "credit") {
        return SlotCQ9Modal.updateMany(
          { betTranId: mtcode },
          {
            $set: {
              settle: true,
              amend: true,
              settleamount: new Decimal(itemAmount)
                .toDecimalPlaces(4)
                .toNumber(),
            },
          }
        );
      } else if (itemAction.toLowerCase() === "debit") {
        return SlotCQ9Modal.updateMany(
          { betTranId: mtcode },
          {
            $set: {
              bet: true,
              amend: true,
              betamount: new Decimal(itemAmount).toDecimalPlaces(4).toNumber(),
            },
          }
        );
      }

      return Promise.resolve();
    });

    await Promise.all(updatePromises);
    // Return successful response
    const updatewalletValue = Number(updatedUserBalance.wallet);

    return res.status(200).json({
      data: {
        balance: new Decimal(updatewalletValue).toDecimalPlaces(4).toNumber(),
        currency: "MYR",
      },
      status: {
        code: "0",
        message: "Success",
        datetime: currentTime,
      },
    });
  } catch (error) {
    console.error("Error in CQ9 amend:", error);
    return res
      .status(200)
      .json(
        errorResponse("1100", "Server error.", generateFormattedDateTime())
      );
  }
});

router.all("/api/cq9//transaction/*", async (req, res) => {
  // Check if this is a valid route that should exist but has issues
  const path = req.path;
  console.log("Unmatched CQ9 route:", path, req.method);

  const currentTime = generateFormattedDateTime();
  return res
    .status(200)
    .json(errorResponse("1002", "Route not found.", currentTime));
});

// ----------------
router.post("/api/cq9slot/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotCQ9Modal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "SLOT",
      cancel: { $ne: true },
      refund: { $ne: true },
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
        gamename: "CQ9",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("CQ9: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "CQ9: Failed to fetch win/loss report",
        zh: "CQ9: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/cq9slot/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotCQ9Modal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "SLOT",
        cancel: { $ne: true },
        refund: { $ne: true },
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
          gamename: "CQ9",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("CQ9: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "CQ9: Failed to fetch win/loss report",
          zh: "CQ9: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/cq9slot/:userId/gamedata",
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

          if (gameCat["CQ9"]) {
            totalTurnover += gameCat["CQ9"].turnover || 0;
            totalWinLoss += gameCat["CQ9"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "CQ9",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("CQ9: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "CQ9: Failed to fetch win/loss report",
          zh: "CQ9: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/cq9slot/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotCQ9Modal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "SLOT",
        cancel: { $ne: true },
        refund: { $ne: true },
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
          gamename: "CQ9",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("CQ9: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "CQ9: Failed to fetch win/loss report",
          zh: "CQ9: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/cq9slot/kioskreport",
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

          if (gameCat["CQ9"]) {
            totalTurnover += Number(gameCat["CQ9"].turnover || 0);
            totalWinLoss += Number(gameCat["CQ9"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "CQ9",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("CQ9: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "CQ9: Failed to fetch win/loss report",
          zh: "CQ9: 获取盈亏报告失败",
        },
      });
    }
  }
);

// ----------------
router.post("/api/cq9fish/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotCQ9Modal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      gametype: "FISH",
      cancel: { $ne: true },
      refund: { $ne: true },
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
        gamename: "CQ9",
        gamecategory: "Fishing",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("CQ9: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "CQ9: Failed to fetch win/loss report",
        zh: "CQ9: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/cq9fish/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotCQ9Modal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "FISH",
        cancel: { $ne: true },
        refund: { $ne: true },
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
          gamename: "CQ9",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("CQ9: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "CQ9: Failed to fetch win/loss report",
          zh: "CQ9: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/cq9fish/:userId/gamedata",
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

          if (gameCat["CQ9"]) {
            totalTurnover += gameCat["CQ9"].turnover || 0;
            totalWinLoss += gameCat["CQ9"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "CQ9",
          gamecategory: "Fishing",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("CQ9: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "CQ9: Failed to fetch win/loss report",
          zh: "CQ9: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/cq9fish/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotCQ9Modal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        gametype: "FISH",
        cancel: { $ne: true },
        refund: { $ne: true },
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
          gamename: "CQ9",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("CQ9: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "CQ9: Failed to fetch win/loss report",
          zh: "CQ9: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/cq9fish/kioskreport",
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

          if (gameCat["CQ9"]) {
            totalTurnover += Number(gameCat["CQ9"].turnover || 0);
            totalWinLoss += Number(gameCat["CQ9"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "CQ9",
          gamecategory: "Fishing",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("CQ9: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "CQ9: Failed to fetch win/loss report",
          zh: "CQ9: 获取盈亏报告失败",
        },
      });
    }
  }
);
module.exports = router;
