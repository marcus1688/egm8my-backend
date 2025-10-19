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
const LiveCT855Modal = require("../../models/live_ct855.model");
const Decimal = require("decimal.js");

require("dotenv").config();

const webURL = "https://www.oc7.me/";
const ctAPIURL = "http://api.ct-888.com";
const ctSecret = process.env.CT855_SECRET;
const ctAgent = "CT0106AO09";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateRandomString(length = 16) {
  return crypto.randomBytes(length).toString("hex");
}

function generateSign(agentName, apiKey, randomStr) {
  return crypto
    .createHash("md5")
    .update(agentName + apiKey + randomStr)
    .digest("hex");
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

async function registerCT855User(username) {
  try {
    const random = generateRandomString(8);
    const sign = generateSign(ctAgent, ctSecret, random);

    const registerPassword = generatePassword();

    const requestData = {
      token: sign,
      random: random,
      data: "G",
      member: {
        username: username,
        password: registerPassword,
        currencyName: "MYR",
        winLimit: 0,
      },
    };

    const response = await axios.post(
      `${ctAPIURL}/api/signup/${ctAgent}`,
      requestData,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.codeId === 0) {
      await User.findOneAndUpdate(
        { userServerId: username },
        {
          $set: {
            CT855GamePW: registerPassword,
          },
        }
      );

      return { success: true };
    }

    return {
      success: false,
      data: response.data,
    };
  } catch (error) {
    console.error("CT855 error in creating member:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

router.post("/api/ct855/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, clientPlatform = "web" } = req.body;
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (user.gameLock.ct855.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
        },
      });
    }

    if (!user.CT855GamePW) {
      const registration = await registerCT855User(user.userServerId);

      if (!registration.success) {
        console.log(
          "CT855 registration failed:",
          registration.data || registration.error
        );
        return res.status(200).json({
          success: false,
          message: {
            en: "CT855: Game launch failed. Please try again or customer service for assistance.",
            zh: "CT855: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "CT855: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }
    }

    let lang = "en";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "cn";
    } else if (gameLang === "ms") {
      lang = "en";
    }

    const random = generateRandomString(8);
    const sign = generateSign(ctAgent, ctSecret, random);

    const requestData = {
      token: sign,
      random: random,
      lang,
      member: {
        username: user.userServerId,
        password: user.CT855GamePW,
      },
    };

    const response = await axios.post(
      `${ctAPIURL}/api/login/${ctAgent}`,
      requestData,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.codeId !== 406 && response.data.codeId !== 0) {
      console.log("CT855 error in launching game", response.data);

      if (response.data.codeId === 300) {
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
          en: "CT855: Game launch failed. Please try again or contact customer service for assistance.",
          zh: "CT855: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "CT855: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    let platform;
    if (clientPlatform === "web") {
      platform = response.data.list[0];
    } else if (clientPlatform === "mobile") {
      platform = response.data.list[1];
    }

    const gameUrl = `${platform}${response.data.token}&language=${lang}`;

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "CT855"
    );

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
    console.log("CT855 error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "CT855: Game launch failed. Please try again or customer service for assistance.",
        zh: "CT855: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "CT855: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/ct855/getturnoverforrebate", async (req, res) => {
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

    const records = await LiveCT855Modal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      cancel: { $ne: true },
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
        gamename: "CT855",
        gamecategory: "Live Casino",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("CT855: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "CT855: Failed to fetch win/loss report",
        zh: "CT855: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/ct855/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await LiveCT855Modal.find({
        username: user.username,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
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
          gamename: "CT855",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("CT855: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "CT855: Failed to fetch win/loss report",
          zh: "CT855: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/ct855/:userId/gamedata",
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
          const slotGames = Object.fromEntries(gameCategories["Live Casino"]);

          if (slotGames["CT855"]) {
            totalTurnover += slotGames["CT855"].turnover || 0;
            totalWinLoss += slotGames["CT855"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "CT855",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("CT855: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "CT855: Failed to fetch win/loss report",
          zh: "CT855: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/ct855/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await LiveCT855Modal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        settle: true,
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;

        totalWinLoss += (record.settleamount || 0) - (record.betamount || 0);
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "CT855",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("CT855 : Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "CT855: Failed to fetch win/loss report",
          zh: "CT855: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/ct855/kioskreport",
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

          if (liveCasino["CT855"]) {
            totalTurnover += Number(liveCasino["CT855"].turnover || 0);
            totalWinLoss += Number(liveCasino["CT855"].winloss || 0);
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "CT855",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("CT855: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "CT855: Failed to fetch win/loss report",
          zh: "CT855: 获取盈亏报告失败",
        },
      });
    }
  }
);

module.exports = router;
