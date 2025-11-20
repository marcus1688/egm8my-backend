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
const EsportTfGamingModal = require("../../models/esport_tfgaming.model");
const Decimal = require("decimal.js");
const bodyParser = require("body-parser");

require("dotenv").config();

const tfGamingParnerId = "12433";
const tfGamingPublic = process.env.TFGAMING_PUBLICTOKEN;
const tfGamingPrivate = process.env.TFGAMING_PRIVATETOKEN;
const webURL = "https://www.bm8my.vip/";
const tfGamingAPIURL = "https://spi.r4espt.com/";
const tfGamingLaunchGameURL =
  "https://api-v4.tf-api-2013.com/api/v4/launch/url";

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

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

router.post("/api/tfgaming/launchGame", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found. Please try again or contact customer service for assistance.",
          zh: "用户未找到，请重试或联系客服以获取帮助。",
          ms: "Pengguna tidak ditemui, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "搵唔到用戶，麻煩再試多次或者聯絡客服幫手。",
          id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    if (user.gameLock.tfgaming.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
          zh_hk: "老闆你嘅遊戲訪問已經被鎖定咗，麻煩聯絡客服獲取進一步幫助。",
          id: "Akses permainan Anda telah dikunci. Silakan hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }

    const getUrlResponse = await axios.get(
      `${tfGamingLaunchGameURL}/?auth=${tfGamingPublic}`
    );

    let token = `${user.gameId}:${generateRandomCode()}`;

    const gameURL = `${getUrlResponse.data.launch_url}?auth=${tfGamingPublic}&token=${token}`;

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        tfGamingGameToken: token,
      },
      { new: true }
    );

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "TF GAMING"
    );

    return res.status(200).json({
      success: true,
      gameLobby: gameURL,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("TF GAMING error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "TF GAMING: Game launch failed. Please try again or customer service for assistance.",
        zh: "TF GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "TF GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "TF GAMING: 遊戲開唔到，老闆試多次或者搵客服幫手。",
        id: "TF GAMING: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/tfgaming/token/validate", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({});
    }

    const username = token.split(":")[0];
    const currentUser = await User.findOne(
      { gameId: username, tfGamingGameToken: token },
      { username: 1 }
    ).lean();

    if (!currentUser) {
      return res.status(400).json({});
    }
    return res.status(200).json({
      loginName: username,
    });
  } catch (error) {
    console.error("TF GAMING error in validate check:", error.message);
    return res.status(500).json({});
  }
});

router.get("/api/tfgaming/wallet", async (req, res) => {
  try {
    const { loginName } = req.query;

    const currentUser = await User.findOne(
      { gameId: loginName },
      { wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res
        .status(400)
        .json({ code: 3, description: "Unknown or invalid member id/code" });
    }

    return res.status(200).json({
      balance: roundToTwoDecimals(currentUser.wallet),
    });
  } catch (error) {
    console.error("TF GAMING error in validate check:", error.message);
    return res.status(500).json({ code: 1, description: "Undefined" });
  }
});

router.post("/api/tfgaming/transfer", async (req, res) => {
  try {
    const authorization = req.headers["authorization"];

    const { loginName, amount, placeBet, ticketNum, description } = req.body;

    if (authorization !== tfGamingPrivate) {
      return res
        .status(400)
        .json({ code: 1, description: "Invalid authorization" });
    }

    if (placeBet === true && description === "Place bet") {
      const [currentUser, existingBet] = await Promise.all([
        User.findOne(
          { gameId: loginName },
          { _id: 1, wallet: 1, "gameLock.tfgaming.lock": 1 }
        ).lean(),
        EsportTfGamingModal.findOne(
          { betId: ticketNum, bet: true },
          { _id: 1 }
        ).lean(),
      ]);

      if (!currentUser) {
        return res
          .status(400)
          .json({ code: 3, description: "Unknown or invalid member id/code" });
      }

      if (currentUser.gameLock?.tfgaming?.lock) {
        return res
          .status(400)
          .json({ code: 3, description: "Unknown or invalid member id/code" });
      }

      if (existingBet) {
        return res.status(200).json({
          balance: roundToTwoDecimals(currentUser.wallet),
        });
      }

      const updatedUserBalance = await User.findOneAndUpdate(
        {
          _id: currentUser._id,
          wallet: { $gte: roundToTwoDecimals(Math.abs(amount)) },
        },
        { $inc: { wallet: roundToTwoDecimals(amount) } },
        { new: true, projection: { wallet: 1 } }
      );

      if (!updatedUserBalance) {
        return res.status(400).json({});
      }

      await EsportTfGamingModal.create({
        username: loginName,
        betId: ticketNum,
        bet: true,
        betamount: roundToTwoDecimals(Math.abs(amount)),
      });

      return res.status(200).json({
        balance: roundToTwoDecimals(updatedUserBalance.wallet),
      });
    } else if (placeBet === false) {
      const splitTicket = ticketNum.split("_")[0];
      let actionType, queryField;

      if (description === "Settlement" || description === "Loss") {
        actionType = "settle";
        queryField = {
          $and: [
            { $or: [{ settle: true }, { cancel: true }] },
            { resettle: { $ne: true } },
          ],
        };
      } else if (description === "Unsettlement") {
        actionType = "resettle";
        queryField = { resettle: true };
      } else {
        console.log("unknow des");
        return res
          .status(400)
          .json({ code: 1, description: "Unknown operation" });
      }

      const [currentUser, existingBet, existingTransaction] = await Promise.all(
        [
          User.findOne({ gameId: loginName }, { _id: 1, wallet: 1 }).lean(),
          EsportTfGamingModal.findOne(
            { betId: splitTicket, bet: true },
            { _id: 1 }
          ).lean(),
          EsportTfGamingModal.findOne(
            { betId: splitTicket, ...queryField },
            { _id: 1 }
          ).lean(),
        ]
      );

      if (!currentUser) {
        return res
          .status(400)
          .json({ code: 3, description: "Unknown or invalid member id/code" });
      }

      if (!existingBet || existingTransaction) {
        console.log("hi");
        return res.status(200).json({
          balance: roundToTwoDecimals(currentUser.wallet),
        });
      }

      const betUpdateObject =
        actionType === "resettle"
          ? {
              $set: { [actionType]: true },
              $inc: { settleamount: roundToTwoDecimals(amount) },
            }
          : {
              $set: {
                [actionType]: true,
                settleamount: roundToTwoDecimals(amount),
                resettle: false,
              },
            };

      // Perform updates in parallel
      const [updatedUserBalance] = await Promise.all([
        User.findByIdAndUpdate(
          currentUser._id,
          { $inc: { wallet: roundToTwoDecimals(amount) } },
          { new: true, projection: { wallet: 1 } }
        ).lean(),
        EsportTfGamingModal.findOneAndUpdate(
          { betId: splitTicket },
          betUpdateObject
        ),
      ]);

      return res.status(200).json({
        balance: roundToTwoDecimals(updatedUserBalance.wallet),
      });
    }
    return res.status(400).json({ code: 1, description: "Unknown operation" });
  } catch (error) {
    console.error("TF GAMING error in validate check:", error.message);
    return res.status(500).json({ code: 1, description: "Undefined" });
  }
});

router.post("/api/tfgaming/rollback", async (req, res) => {
  try {
    const authorization = req.headers["authorization"];

    const { loginName, ticketNum } = req.body;

    if (authorization !== tfGamingPrivate) {
      return res
        .status(400)
        .json({ code: 1, description: "Invalid authorization" });
    }

    const [currentUser, existingBet, existingCancelBet] = await Promise.all([
      User.findOne({ gameId: loginName }, { _id: 1 }).lean(),
      EsportTfGamingModal.findOne(
        { betId: ticketNum, bet: true },
        { betamount: 1 }
      ).lean(),
      EsportTfGamingModal.findOne(
        { betId: ticketNum, $or: [{ settle: true }, { cancel: true }] },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res
        .status(400)
        .json({ code: 3, description: "Unknown or invalid member id/code" });
    }

    // Validations
    if (!existingBet || existingCancelBet) {
      return res.status(200).json({});
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { _id: currentUser._id },
        { $inc: { wallet: roundToTwoDecimals(existingBet.betamount) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      EsportTfGamingModal.updateOne(
        { betId: ticketNum },
        { $set: { cancel: true } }
      ),
    ]);

    return res.status(200).json({
      balance: roundToTwoDecimals(updatedUserBalance.wallet),
    });
  } catch (error) {
    console.error("TF GAMING error in validate check:", error.message);
    return res.status(500).json({ code: 1, description: "Undefined" });
  }
});

// ----------------
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

    console.log("TF_GAMING QUERYING TIME", startDate, endDate);

    const records = await EsportTfGamingModal.find({
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

      if (!playerSummary[actualUsername]) {
        playerSummary[actualUsername] = { turnover: 0, winloss: 0 };
      }

      playerSummary[actualUsername].turnover += record.betamount || 0;

      playerSummary[actualUsername].winloss +=
        (record.settleamount || 0) - (record.betamount || 0);
    });

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
        gamename: "TF GAMING",
        gamecategory: "E-Sports",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("TF_GAMING: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      error: "TF_GAMING: Failed to fetch win/loss report",
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

      const records = await EsportTfGamingModal.find({
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
          gamename: "TF GAMING",
          gamecategory: "E-Sports",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("TF_GAMING: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        error: "TF_GAMING: Failed to fetch win/loss report",
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
          const gamecat = Object.fromEntries(gameCategories["E-Sports"]);

          if (gamecat["TF GAMING"]) {
            totalTurnover += gamecat["TF GAMING"].turnover || 0;
            totalWinLoss += gamecat["TF GAMING"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "TF GAMING",
          gamecategory: "E-Sports",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("TF_GAMING: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        error: "TF_GAMING: Failed to fetch win/loss report",
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

      const records = await EsportTfGamingModal.find({
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

        totalWinLoss += (record.betamount || 0) - (record.settleamount || 0);
      });

      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      // Return the aggregated results
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "TF GAMING",
          gamecategory: "E-Sports",
          totalturnover: totalTurnover,
          totalwinloss: totalWinLoss,
        },
      });
    } catch (error) {
      console.log("TF_GAMING: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        error: "TF_GAMING: Failed to fetch win/loss report",
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
          const gamecat = Object.fromEntries(gameCategories["E-Sports"]);

          if (gamecat["TF GAMING"]) {
            totalTurnover += Number(gamecat["TF GAMING"].turnover || 0);
            totalWinLoss += Number(gamecat["TF GAMING"].winloss || 0);
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "TF GAMING",
          gamecategory: "E-Sports",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("TF_GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        error: "TF_GAMING: Failed to fetch win/loss report",
      });
    }
  }
);

module.exports = router;
