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
const { adminUser, adminLog } = require("../../models/adminuser.model");
const { v4: uuidv4 } = require("uuid");
const GameWalletLog = require("../../models/gamewalletlog.model");
const SlotHabaneroModal = require("../../models/slot_habanero.model");
const GameHabaneroGameModal = require("../../models/slot_habaneroDatabase.model");

require("dotenv").config();

const habaneroBrandID = process.env.HABANERO_BRANDID;
const habaneroKey = process.env.HABANERO_APIKEY;
const webURL = "https://www.oc7.me/";
const habaneroAPIURL = "https://ws-a.insvr.com/jsonapi/";
const habaneroGameAPIURL = "https://app-a.insvr.com/go.ashx";

const generateRandomCode = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 10; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }

  return result;
};

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

// router.post("/api/habanero/getprovidergamelist", async (req, res) => {
//   try {
//     const requestPayload = {
//       BrandId: habaneroBrandID,
//       APIKey: habaneroKey,
//     };

//     // Make API call to Habanero GetGames endpoint
//     const response = await axios.post(
//       `${habaneroAPIURL}GetGames`,
//       requestPayload,
//       {
//         headers: {
//           "Content-Type": "application/json",
//         },
//       }
//     );

//     return res.status(200).json({
//       success: true,
//       data: response.data,
//     });
//   } catch (error) {
//     console.log("HABANERO error in launching game", error.message);
//     return res.status(200).json({
//       success: false,
//       message: {
//         en: "HABANERO: Game launch failed. Please try again or customer service for assistance.",
//         zh: "HABANERO: 游戏启动失败，请重试或联系客服以获得帮助。",
//         ms: "HABANERO: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
//         zh_hk: "HABANERO: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
//         id: "HABANERO: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
//       },
//     });
//   }
// });
router.post("/api/habanero/comparegame", async (req, res) => {
  try {
    const requestPayload = {
      BrandId: habaneroBrandID,
      APIKey: habaneroKey,
    };

    // Make API call to Habanero GetGames endpoint
    const response = await axios.post(
      `${habaneroAPIURL}GetGames`,
      requestPayload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    // Get all games from database
    const dbGames = await GameHabaneroGameModal.find({}, "gameID");

    // Extract game IDs from database
    const dbGameIds = new Set(dbGames.map((game) => game.gameID));

    // Extract games from API response
    const apiGames = response.data.Games;
    const apiGameIds = new Set(apiGames.map((game) => game.KeyName));

    // Count totals
    const totalApiGames = apiGames.length;
    const totalDbGames = dbGames.length;

    // Find missing games (in API but not in database)
    const missingGames = apiGames.filter(
      (game) => !dbGameIds.has(game.KeyName)
    );

    // Find extra games (in database but not in API) and set maintenance to true
    const extraGameIds = [...dbGameIds].filter(
      (gameId) => !apiGameIds.has(gameId)
    );

    // Update extra games to maintenance: true
    if (extraGameIds.length > 0) {
      await GameHabaneroGameModal.updateMany(
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
      await GameHabaneroGameModal.updateMany(
        { gameID: { $in: activeGameIds } },
        { maintenance: false }
      );
      console.log(
        `Set maintenance: false for ${activeGameIds.length} games in API`
      );
    }

    // Return missing games with gameName
    const missingGamesInfo = missingGames.map((game) => ({
      keyName: game.KeyName,
      gameName: game.Name,
      gameType: game.GameTypeName,
      gameTypeDisplayName: game.GameTypeDisplayName,
      isNew: game.IsNew,
      mobileCapable: game.MobileCapable,
      rtp: game.RTP,
      reportName: game.ReportName,
      dtAdded: game.DtAdded,
      dtUpdated: game.DtUpdated,
    }));

    console.log("Missing games:", missingGamesInfo);
    console.log("Extra games set to maintenance:", extraGameIds.length);
    console.log(
      `Total API games: ${totalApiGames}, Total DB games: ${totalDbGames}`
    );

    return res.status(200).json({
      success: true,
      data: response.data,
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
    console.log("HABANERO error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "HABANERO: Game launch failed. Please try again or customer service for assistance.",
        zh: "HABANERO: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "HABANERO: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "HABANERO: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "HABANERO: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/habanero/getgamelist", async (req, res) => {
  try {
    const games = await GameHabaneroGameModal.find({
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
    console.log("HABANERO error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "HABANERO: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "HABANERO: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "HABANERO: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/habanero/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, gameCode } = req.body;
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (user.gameLock.habanero.lock) {
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
      lang = "zh-CN";
    } else if (gameLang === "ms") {
      lang = "ms";
    }

    let token = `${user.username}:${generateRandomCode()}`;

    const lobbyURL = `${habaneroGameAPIURL}?brandid=${habaneroBrandID}&keyname=${gameCode}&token=${token}&mode=real&locale=${lang}&lobbyurl=${encodeURIComponent(
      `${webURL}`
    )}`;

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        habaneroGameToken: token,
      },
      { new: true }
    );

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "HABANERO"
    );

    return res.status(200).json({
      success: true,
      gameLobby: lobbyURL,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
      },
    });
  } catch (error) {
    console.log("HABANERO error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "HABANERO: Game launch failed. Please try again or customer service for assistance.",
        zh: "HABANERO: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "HABANERO: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/api/habanero/launchGameWlobby",
  authenticateToken,
  async (req, res) => {
    try {
      const { gameLang } = req.body;
      const userId = req.user.userId;
      const user = await User.findById(userId);

      if (user.gameLock.habanero.lock) {
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
        lang = "zh-CN";
      } else if (gameLang === "ms") {
        lang = "ms";
      }

      let token = `${user.username}:${generateRandomCode()}`;

      const lobbyURL = `${habaneroGameAPIURL}?brandid=${habaneroBrandID}&keyname=HBGAMELOBBY&token=${token}&mode=real&locale=${lang}&lobbyurl=${encodeURIComponent(
        `${webURL}`
      )}`;

      const updatedUser = await User.findOneAndUpdate(
        { _id: user._id },
        {
          habaneroGameToken: token,
        },
        { new: true }
      );

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "HABANERO"
      );

      return res.status(200).json({
        success: true,
        gameLobby: lobbyURL,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
        },
      });
    } catch (error) {
      console.log("HABANERO error in launching game", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "HABANERO: Game launch failed. Please try again or customer service for assistance.",
          zh: "HABANERO: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "HABANERO: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post("/api/habanero/auth", async (req, res) => {
  try {
    const { auth, playerdetailrequest } = req.body;

    if (!auth || !playerdetailrequest || auth.brandid !== habaneroBrandID) {
      return res.status(200).json({
        playerdetailresponse: {
          status: {
            success: false,
            autherror: true,
            message:
              !auth || !playerdetailrequest
                ? "Incomplete request"
                : "Invalid authentication",
          },
        },
      });
    }

    const token = playerdetailrequest.token;

    const username = token.split(":")[0];

    const currentUser = await User.findOne(
      { username, habaneroGameToken: token },
      { username: 1, wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(200).json({
        playerdetailresponse: {
          status: {
            success: false,
            autherror: true,
            message: "Invalid user",
          },
        },
      });
    }

    return res.status(200).json({
      playerdetailresponse: {
        status: {
          success: true,
          autherror: false,
          message: "",
        },
        accountid: currentUser.username,
        balance: roundToTwoDecimals(currentUser.wallet),
        currencycode: "MYR",
      },
    });
  } catch (error) {
    return res.status(200).json({
      playerdetailresponse: {
        status: {
          success: false,
          autherror: true,
          message: "Internal server error",
        },
      },
    });
  }
});

const updateFreeSpinStatus = async (
  transactionInfo,
  username,
  gameinstanceid
) => {
  const {
    buyfeatureid,
    gameinfeature,
    featureno,
    gamestatemode,
    initialdebittransferid,
  } = transactionInfo;

  // Determine free spin status
  const isFreeSpinPurchase = buyfeatureid && !gameinfeature; // Initial purchase
  const isFreeSpinActive = gameinfeature && featureno; // Ongoing free spins
  const isFreeSpinEnd = gamestatemode === 2 && gameinfeature; // Last spin

  const freeSpinOngoing =
    isFreeSpinPurchase || (isFreeSpinActive && !isFreeSpinEnd);

  // If this is the end of free spins, mark all related spins as completed
  if (isFreeSpinEnd && initialdebittransferid) {
    await SlotHabaneroModal.updateMany(
      {
        username,
        uniqueId: transactionInfo.initialdebittransferid,
        freeSpinOngoing: true,
      },
      {
        $set: { freeSpinOngoing: false },
      }
    );
  }

  return {
    buyfeatureid,
    freeSpinOngoing,
  };
};

router.post("/api/habanero/tx", async (req, res) => {
  try {
    const { auth, fundtransferrequest } = req.body;

    if (!auth || !fundtransferrequest || auth.brandid !== habaneroBrandID) {
      return res.status(200).json({
        fundtransferresponse: {
          status: {
            success: false,
            autherror: true,
          },
        },
      });
    }

    const token = fundtransferrequest.token;
    const username = token.split(":")[0];

    // Handle refund requests - this is a separate flow
    if (fundtransferrequest.isrefund === true) {
      const refundInfo = fundtransferrequest.funds.refund;
      const accountId = fundtransferrequest.accountid;
      const originalTransferId = refundInfo.originaltransferid;
      const refundTransferId = refundInfo.transferid;

      // Use lean() for faster queries
      const refundUser = await User.findOne(
        { username: accountId },
        { wallet: 1 }
      ).lean();

      if (!refundUser) {
        return res.status(200).json({
          fundtransferresponse: {
            status: {
              success: false,
              autherror: true,
            },
          },
        });
      }

      // Check if refund was already processed
      const existingRefund = await SlotHabaneroModal.findOne(
        { refunduniqueId: refundTransferId },
        { _id: 1 }
      ).lean();

      if (existingRefund) {
        return res.status(200).json({
          fundtransferresponse: {
            status: {
              success: true,
              refundstatus: 1,
            },
            balance: roundToTwoDecimals(refundUser.wallet),
            currencycode: "MYR",
          },
        });
      }

      // Check if original transaction exists
      const originalTransaction = await SlotHabaneroModal.findOne(
        { uniqueId: originalTransferId },
        { _id: 1 }
      ).lean();

      if (originalTransaction) {
        // Original debit was processed, we need to refund
        const refundAmount = Math.abs(refundInfo.amount);

        // Execute refund operations in parallel
        const [updatedUser] = await Promise.all([
          User.findOneAndUpdate(
            { username: accountId },
            { $inc: { wallet: roundToTwoDecimals(refundAmount || 0) } },
            { new: true, projection: { wallet: 1 } }
          ),
          SlotHabaneroModal.findOneAndUpdate(
            {
              uniqueId: originalTransferId,
              username: accountId,
            },
            {
              $set: {
                refund: true,
                refunduniqueId: refundTransferId,
              },
            },
            { upsert: true }
          ),
        ]);

        return res.status(200).json({
          fundtransferresponse: {
            status: {
              success: true,
              refundstatus: 1,
            },
            balance: roundToTwoDecimals(updatedUser.wallet),
            currencycode: "MYR",
          },
        });
      } else {
        return res.status(200).json({
          fundtransferresponse: {
            status: {
              success: true,
              refundstatus: 2,
            },
            balance: roundToTwoDecimals(refundUser.wallet),
            currencycode: "MYR",
          },
        });
      }
    }

    // Get user with minimal projection and lean() for faster query
    const currentUser = await User.findOne(
      { username, habaneroGameToken: token },
      { username: 1, wallet: 1, "gameLock.habanero.lock": 1 }
    ).lean();

    // Validate user and game lock status
    if (!currentUser) {
      return res.status(200).json({
        fundtransferresponse: {
          status: {
            success: false,
            autherror: true,
          },
        },
      });
    }

    const { debitandcredit, fundinfo } = fundtransferrequest.funds;
    const gameinstanceid = fundtransferrequest.gameinstanceid;

    // Handle recredit requests
    if (fundtransferrequest.isrecredit === true) {
      const creditInfo = fundinfo[0]; // In re-credit, there is only one fundinfo element
      const transferId = creditInfo.transferid;

      // Check if credit was already processed
      const existingCredit = await SlotHabaneroModal.findOne(
        {
          $or: [{ uniqueId: transferId }, { settleuniqueId: transferId }],
        },
        { _id: 1 }
      ).lean();

      if (existingCredit) {
        return res.status(200).json({
          fundtransferresponse: {
            status: {
              success: true,
            },
            balance: roundToTwoDecimals(currentUser.wallet),
            currencycode: "MYR",
          },
        });
      }

      // Process credit in parallel operations
      const creditAmount = creditInfo.amount;
      const [updatedUser] = await Promise.all([
        User.findOneAndUpdate(
          { username: currentUser.username },
          { $inc: { wallet: roundToTwoDecimals(creditAmount || 0) } },
          { new: true, projection: { wallet: 1 } }
        ),
        SlotHabaneroModal.findOneAndUpdate(
          {
            roundId: gameinstanceid,
            username: currentUser.username,
          },
          {
            $set: {
              username: currentUser.username,
              settleuniqueId: transferId,
              roundId: gameinstanceid,
              settleamount: roundToTwoDecimals(creditAmount),
              bet: true,
              settle: true,
              recredit: true,
            },
          },
          { upsert: true }
        ),
      ]);

      return res.status(200).json({
        fundtransferresponse: {
          status: {
            success: true,
          },
          balance: roundToTwoDecimals(updatedUser.wallet),
          currencycode: "MYR",
        },
      });
    }

    // Handle bonus transactions
    if (fundinfo[0].isbonus === true) {
      const transactionInfo = fundinfo[0];
      const bonusAmount = transactionInfo.bonusamount || 0;
      const transactionAmount = transactionInfo.amount || 0;

      // Check if this is a retry
      if (fundtransferrequest.isretry) {
        const existingTransaction = await SlotHabaneroModal.findOne(
          { uniqueId: transactionInfo.transferid },
          { _id: 1 }
        ).lean();

        if (existingTransaction) {
          return res.status(200).json({
            fundtransferresponse: {
              status: {
                success: true,
              },
              balance: roundToTwoDecimals(currentUser.wallet),
              currencycode: "MYR",
            },
          });
        }
      }

      // For bonus debit (negative amount)
      if (bonusAmount < 0) {
        await SlotHabaneroModal.findOneAndUpdate(
          {
            roundId: gameinstanceid,
            username: currentUser.username,
          },
          {
            $setOnInsert: {
              username: currentUser.username,
              uniqueId: transactionInfo.transferid,
              roundId: gameinstanceid,
              settleamount: roundToTwoDecimals(Math.abs(bonusAmount)),
              settle: true,
              bet: true,
            },
          },
          { upsert: true }
        );

        return res.status(200).json({
          fundtransferresponse: {
            status: {
              success: true,
            },
            balance: roundToTwoDecimals(currentUser.wallet),
            currencycode: "MYR",
          },
        });
      } else {
        const amountToAdd = bonusAmount > 0 ? bonusAmount : transactionAmount;

        // Execute operations in parallel
        const [updatedUser] = await Promise.all([
          User.findOneAndUpdate(
            { username: currentUser.username },
            { $inc: { wallet: roundToTwoDecimals(amountToAdd || 0) } },
            { new: true, projection: { wallet: 1 } }
          ),
          SlotHabaneroModal.create({
            username: currentUser.username,
            uniqueId: transactionInfo.transferid,
            roundId: gameinstanceid,
            betamount: 0,
            bet: true,
            settleamount: roundToTwoDecimals(amountToAdd),
            settle: true,
          }),
        ]);

        return res.status(200).json({
          fundtransferresponse: {
            status: {
              success: true,
            },
            balance: roundToTwoDecimals(updatedUser.wallet),
            currencycode: "MYR",
          },
        });
      }
    }

    // Handle debit and credit in single transaction
    if (debitandcredit === true) {
      const debitInfo = fundinfo[0];
      const creditInfo = fundinfo[1];

      const freeSpinData = await updateFreeSpinStatus(
        creditInfo,
        currentUser.username,
        gameinstanceid
      );

      // Check if this is a retry and handle accordingly
      if (fundtransferrequest.isretry) {
        // Use Promise.all for parallel queries
        const [existingDebit, existingCredit] = await Promise.all([
          SlotHabaneroModal.findOne(
            { uniqueId: debitInfo.transferid },
            { _id: 1 }
          ).lean(),
          SlotHabaneroModal.findOne(
            { uniqueId: creditInfo.transferid },
            { _id: 1 }
          ).lean(),
        ]);

        // If both exist, return success
        if (existingDebit && existingCredit) {
          return res.status(200).json({
            fundtransferresponse: {
              status: {
                success: true,
                successdebit: true,
                successcredit: true,
              },
              balance: roundToTwoDecimals(currentUser.wallet),
              currencycode: "MYR",
            },
          });
        }

        // If only debit exists, process only credit
        if (existingDebit && !existingCredit) {
          const [updatedUserBalance] = await Promise.all([
            User.findOneAndUpdate(
              { username: currentUser.username },
              { $inc: { wallet: roundToTwoDecimals(creditInfo.amount || 0) } },
              { new: true, projection: { wallet: 1 } }
            ),
            SlotHabaneroModal.findOneAndUpdate(
              {
                username: currentUser.username,
                roundId: gameinstanceid,
              },
              {
                $set: {
                  username: currentUser.username,
                  uniqueId: creditInfo.transferid,
                  settleamount: roundToTwoDecimals(creditInfo.amount),
                  settle: true,
                },
              },
              { upsert: true }
            ),
          ]);

          return res.status(200).json({
            fundtransferresponse: {
              status: {
                success: true,
                successdebit: true,
                successcredit: true,
              },
              balance: roundToTwoDecimals(updatedUserBalance.wallet),
              currencycode: "MYR",
            },
          });
        }
      }

      // Normal processing (not a retry)
      const debitAmount = debitInfo.amount;
      const creditAmount = creditInfo.amount;
      const resultBalance = roundToTwoDecimals(debitAmount + creditAmount);

      // Update wallet and create transaction record in parallel
      try {
        const [updatedUser, transaction] = await Promise.all([
          User.findOneAndUpdate(
            {
              username: currentUser.username,
              wallet: {
                $gte: roundToTwoDecimals(Math.abs(debitInfo.amount || 0)),
              },
            },
            { $inc: { wallet: roundToTwoDecimals(resultBalance || 0) } },
            { new: true, projection: { wallet: 1 } }
          ),
          SlotHabaneroModal.create({
            username: currentUser.username,
            uniqueId: debitInfo.transferid,
            roundId: gameinstanceid,
            betamount: roundToTwoDecimals(Math.abs(debitInfo.amount)),
            bet: true,
            settleamount: roundToTwoDecimals(creditInfo.amount),
            settle: true,
            settleuniqueId: creditInfo.transferid,
            ...freeSpinData,
          }),
        ]);

        if (!updatedUser) {
          return res.status(200).json({
            fundtransferresponse: {
              status: {
                success: false,
                nofunds: true,
              },
              balance: roundToTwoDecimals(currentUser.wallet),
              currencycode: "MYR",
            },
          });
        }

        return res.status(200).json({
          fundtransferresponse: {
            status: {
              success: true,
              successdebit: true,
              successcredit: true,
            },
            balance: roundToTwoDecimals(updatedUser.wallet),
            currencycode: "MYR",
          },
        });
      } catch (error) {
        // Handle insufficient funds error
        if (error.message.includes("insufficient") || error.code === 11000) {
          return res.status(200).json({
            fundtransferresponse: {
              status: {
                success: false,
                nofunds: true,
              },
              balance: roundToTwoDecimals(currentUser.wallet),
              currencycode: "MYR",
            },
          });
        }
        throw error;
      }
    }

    // Handle single transaction (either debit or credit)
    const transactionInfo = fundinfo[0];
    const transactionAmount = transactionInfo.amount;

    const freeSpinData = await updateFreeSpinStatus(
      transactionInfo,
      currentUser.username,
      gameinstanceid
    );

    // Check if this is a retry
    if (fundtransferrequest.isretry) {
      const existingTransaction = await SlotHabaneroModal.findOne(
        {
          $or: [
            { uniqueId: transactionInfo.transferid },
            { settleuniqueId: transactionInfo.transferid },
          ],
        },
        { _id: 1 }
      ).lean();

      if (existingTransaction) {
        return res.status(200).json({
          fundtransferresponse: {
            status: {
              success: true,
            },
            balance: roundToTwoDecimals(currentUser.wallet),
            currencycode: "MYR",
          },
        });
      }
    }

    // For debit transactions (negative amount)
    if (transactionAmount < 0) {
      try {
        // Update wallet and check if transaction exists
        const [updatedUser, firstTransaction] = await Promise.all([
          User.findOneAndUpdate(
            {
              username: currentUser.username,
              wallet: {
                $gte: roundToTwoDecimals(Math.abs(transactionAmount || 0)),
              },
            },
            { $inc: { wallet: roundToTwoDecimals(transactionAmount || 0) } },
            { new: true, projection: { wallet: 1 } }
          ),
          SlotHabaneroModal.findOne(
            {
              uniqueId: transactionInfo.initialdebittransferid,
              username: currentUser.username,
            },
            { _id: 1 }
          ).lean(),
        ]);

        if (!updatedUser) {
          return res.status(200).json({
            fundtransferresponse: {
              status: {
                success: false,
                nofunds: true,
              },
              balance: roundToTwoDecimals(currentUser.wallet),
              currencycode: "MYR",
            },
          });
        }

        // Create transaction record
        if (firstTransaction) {
          await SlotHabaneroModal.create({
            username: currentUser.username,
            roundId: gameinstanceid,
            uniqueId: transactionInfo.transferid,
            betamount: roundToTwoDecimals(Math.abs(transactionAmount)),
            bet: true,
            settleamount: 0,
            settle: true,
          });
        } else {
          await SlotHabaneroModal.findOneAndUpdate(
            {
              roundId: gameinstanceid,
              username: currentUser.username,
            },
            {
              $set: {
                username: currentUser.username,
                uniqueId: transactionInfo.transferid,
                roundId: gameinstanceid,
                betamount: roundToTwoDecimals(Math.abs(transactionAmount)),
                bet: true,
              },
            },
            { upsert: true }
          );
        }

        return res.status(200).json({
          fundtransferresponse: {
            status: {
              success: true,
            },
            balance: roundToTwoDecimals(updatedUser.wallet),
            currencycode: "MYR",
          },
        });
      } catch (error) {
        if (error.message.includes("insufficient") || error.code === 11000) {
          return res.status(200).json({
            fundtransferresponse: {
              status: {
                success: false,
                nofunds: true,
              },
              balance: roundToTwoDecimals(currentUser.wallet),
              currencycode: "MYR",
            },
          });
        }
        throw error;
      }
    } else {
      // For credit transactions (positive amount)
      // Update wallet and check if transaction exists
      const [updatedUser, firstTransaction] = await Promise.all([
        User.findOneAndUpdate(
          { username: currentUser.username },
          { $inc: { wallet: roundToTwoDecimals(transactionAmount || 0) } },
          { new: true, projection: { wallet: 1 } }
        ),
        SlotHabaneroModal.findOne(
          {
            uniqueId: transactionInfo.initialdebittransferid,
            username: currentUser.username,
            settle: false,
          },
          { _id: 1 }
        ).lean(),
      ]);

      // Update transaction record
      if (firstTransaction) {
        await SlotHabaneroModal.findOneAndUpdate(
          {
            uniqueId: transactionInfo.initialdebittransferid,
            username: currentUser.username,
          },
          {
            $set: {
              settleuniqueId: transactionInfo.transferid,
              roundId: gameinstanceid,
              settleamount: roundToTwoDecimals(transactionAmount),
              settle: true,
              ...freeSpinData,
            },
          },
          { upsert: true }
        );
      } else {
        await SlotHabaneroModal.create({
          username: currentUser.username,
          settleuniqueId: transactionInfo.transferid,
          roundId: gameinstanceid,
          betamount: 0,
          bet: true,
          settleamount: roundToTwoDecimals(transactionAmount),
          settle: true,
          uniqueId: transactionInfo.initialdebittransferid,
          ...freeSpinData,
        });
      }

      return res.status(200).json({
        fundtransferresponse: {
          status: {
            success: true,
          },
          balance: roundToTwoDecimals(updatedUser.wallet),
          currencycode: "MYR",
        },
      });
    }
  } catch (error) {
    console.error("Habanero Fund Transfer Error:", error.message);
    return res.status(200).json({
      fundtransferresponse: {
        status: {
          success: false,
        },
      },
    });
  }
});

router.post("/api/habanero/altcredit", async (req, res) => {
  try {
    const { auth, altfundsrequest } = req.body;

    if (!auth || !altfundsrequest || auth.brandid !== habaneroBrandID) {
      return res.status(200).json({
        altfundsresponse: {
          status: {
            success: false,
          },
        },
      });
    }
    // Extract necessary information
    const {
      accountid,
      altcredittype,
      amount,
      currencycode,
      transferid,
      description,
      tournamentdetails,
      partnerprizetext,
      partnerprizecode,
    } = altfundsrequest;

    // Check if this is a duplicate transaction (for retry handling)
    const existingTransaction = await SlotHabaneroModal.findOne(
      { uniqueId: transferid },
      { _id: 1 }
    ).lean();

    if (existingTransaction) {
      const user = await User.findOne(
        { username: accountid },
        { wallet: 1 }
      ).lean();

      return res.status(200).json({
        altfundsresponse: {
          status: {
            success: true,
          },
          balance: roundToTwoDecimals(user ? user.wallet : 0),
          currencycode: currencycode,
        },
      });
    }

    const [updatedUser] = await Promise.all([
      User.findOneAndUpdate(
        { username: accountid },
        { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ),
      SlotHabaneroModal.create({
        username: accountid,
        uniqueId: transferid,
        betamount: 0,
        bet: true,
        settle: true,
        settleamount: roundToTwoDecimals(amount),
      }),
    ]);

    if (!updatedUser) {
      return res.status(200).json({
        altfundsresponse: {
          status: {
            success: false,
          },
        },
      });
    }

    return res.status(200).json({
      altfundsresponse: {
        status: {
          success: true,
        },
        balance: roundToTwoDecimals(updatedUser.wallet),
        currencycode: currencycode,
      },
    });
  } catch (error) {
    console.error("Habanero Alternative Funds Request Error:", error.message);

    return res.status(200).json({
      altfundsresponse: {
        status: {
          success: false,
        },
      },
    });
  }
});

router.post("/api/habanero/query", async (req, res) => {
  try {
    const { auth, queryrequest } = req.body;

    if (!auth || !queryrequest || auth.brandid !== habaneroBrandID) {
      return res.status(200).json({
        fundtransferresponse: {
          status: {
            success: false,
          },
        },
      });
    }

    const { transferid, queryamount } = queryrequest;

    const transaction = await SlotHabaneroModal.findOne(
      { $or: [{ uniqueId: transferid }, { settleuniqueId: transferid }] },
      { _id: 1 }
    ).lean();

    if (transaction) {
      return res.status(200).json({
        fundtransferresponse: {
          status: {
            success: true,
          },
        },
      });
    }

    // If checking for a credit and it doesn't exist, we'll need to check if the debit exists
    // This could be used to determine if we need to process a re-credit
    if (queryamount > 0) {
      const debitTransaction = await SlotHabaneroModal.findOne(
        { roundId: gameinstanceid, bet: true },
        { _id: 1 }
      ).lean();

      // If debit exists but credit doesn't, Habanero will send a re-credit request
      if (debitTransaction) {
        return res.status(200).json({
          fundtransferresponse: {
            status: {
              success: false, // Credit wasn't processed
            },
          },
        });
      }
    }

    return res.status(200).json({
      fundtransferresponse: {
        status: {
          success: false,
        },
      },
    });
  } catch (error) {
    console.error("Habanero Query Request Error:", error.message);

    // If there's a transaction lock or other issue requiring a retry,
    // return 503 as specified in the API docs
    if (error.message.includes("lock") || error.name === "TransactionError") {
      return res.status(503).send("Transaction processing, please retry");
    }

    // For other errors, return a normal error response
    return res.status(200).json({
      fundtransferresponse: {
        status: {
          success: false,
        },
      },
    });
  }
});

router.post("/api/habanero/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotHabaneroModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      refund: { $ne: true },

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
        gamename: "HABANERO",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("HABANERO: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "HABANERO: Failed to fetch win/loss report",
        zh: "HABANERO: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/habanero/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotHabaneroModal.find({
        username: user.username,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
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
          gamename: "HABANERO",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("HABANERO: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "HABANERO: Failed to fetch win/loss report",
          zh: "HABANERO: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/habanero/:userId/gamedata",
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

          if (slotGames["HABANERO"]) {
            totalTurnover += slotGames["HABANERO"].turnover || 0;
            totalWinLoss += slotGames["HABANERO"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "HABANERO",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("HABANERO: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "HABANERO: Failed to fetch win/loss report",
          zh: "HABANERO: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/habanero/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotHabaneroModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
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
          gamename: "HABANERO",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("HABANERO: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "HABANERO: Failed to fetch win/loss report",
          zh: "HABANERO: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/habanero/kioskreport",
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

          if (liveCasino["HABANERO"]) {
            totalTurnover += Number(liveCasino["HABANERO"].turnover || 0);
            totalWinLoss += Number(liveCasino["HABANERO"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "HABANERO",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("HABANERO: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "HABANERO: Failed to fetch win/loss report",
          zh: "HABANERO: 获取盈亏报告失败",
        },
      });
    }
  }
);
module.exports = router;
