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

const GameWalletLog = require("../../models/gamewalletlog.model");

require("dotenv").config();

function roundToTwoDecimals(num) {
  return Math.round(Number(num) * 100) / 100;
}

async function fetchRouteWithRetry(
  route,
  date,
  retryCount = 3,
  delayMinutes = 2
) {
  for (let i = 0; i < retryCount; i++) {
    try {
      const response = await axios.post(route.url, { date });
      if (response.data.success) {
        return response.data.summary;
      }
    } catch (error) {
      console.error(
        `Attempt ${i + 1} failed for ${route.name}:`,
        error.message
      );
      if (i < retryCount - 1) {
        console.log(`Retrying ${route.name} in ${delayMinutes} minutes...`);
        await new Promise((resolve) =>
          setTimeout(resolve, delayMinutes * 60 * 1000)
        );
      } else {
        console.error(
          `All retries failed for ${route.name}. Last error:`,
          error.response?.data || error.message
        );
      }
    }
  }
  return null;
}

const PUBLIC_APIURL = process.env.BASE_URL;

router.post("/admin/api/getAllTurnoverForRebate", async (req, res) => {
  try {
    const { date, pass } = req.body;
    const allGamesData = [];

    // if (pass !== process.env.SERVER_SECRET) {
    //   console.error(
    //     "Error in getAllTurnoverForRebate: Invalid Secret Key",
    //     error.message
    //   );
    //   return res.status(500).json({
    //     success: false,
    //     error: "Failed to fetch combined turnover data",
    //   });
    // }

    const routes = [
      {
        url: `${PUBLIC_APIURL}api/epicwin/getturnoverforrebate`,
        name: "EPICWIN",
      },
      {
        url: `${PUBLIC_APIURL}api/fachaislot/getturnoverforrebate`,
        name: "FACHAI",
      },
      {
        url: `${PUBLIC_APIURL}api/fachaifish/getturnoverforrebate`,
        name: "FACHAI",
      },
      {
        url: `${PUBLIC_APIURL}api/playaceslot/getturnoverforrebate`,
        name: "PLAYACE",
      },
      {
        url: `${PUBLIC_APIURL}api/playacelive/getturnoverforrebate`,
        name: "PLAYACE",
      },
      {
        url: `${PUBLIC_APIURL}api/jilislot/getturnoverforrebate`,
        name: "JILI",
      },
      {
        url: `${PUBLIC_APIURL}api/jilifish/getturnoverforrebate`,
        name: "JILI",
      },
      {
        url: `${PUBLIC_APIURL}api/yesgetrichslot/getturnoverforrebate`,
        name: "YGR",
      },
      {
        url: `${PUBLIC_APIURL}api/yesgetrichfish/getturnoverforrebate`,
        name: "YGR",
      },
      {
        url: `${PUBLIC_APIURL}api/jokerslot/getturnoverforrebate`,
        name: "JOKER",
      },
      {
        url: `${PUBLIC_APIURL}api/jokerfish/getturnoverforrebate`,
        name: "JOKER",
      },
      {
        url: `${PUBLIC_APIURL}api/microgamingslot/getturnoverforrebate`,
        name: "MICRO GAMING",
      },
      {
        url: `${PUBLIC_APIURL}api/microgaminglive/getturnoverforrebate`,
        name: "MICRO GAMING",
      },
      {
        url: `${PUBLIC_APIURL}api/funkyslot/getturnoverforrebate`,
        name: "FUNKY",
      },
      {
        url: `${PUBLIC_APIURL}api/funkyfish/getturnoverforrebate`,
        name: "FUNKY",
      },
      {
        url: `${PUBLIC_APIURL}api/tfgaming/getturnoverforrebate`,
        name: "TF GAMING",
      },
      {
        url: `${PUBLIC_APIURL}api/sagaming/getturnoverforrebate`,
        name: "SA GAMING",
      },
      {
        url: `${PUBLIC_APIURL}api/yeebet/getturnoverforrebate`,
        name: "YEEBET",
      },
      {
        url: `${PUBLIC_APIURL}api/wecasino/getturnoverforrebate`,
        name: "WE CASINO",
      },
      {
        url: `${PUBLIC_APIURL}api/cq9slot/getturnoverforrebate`,
        name: "CQ9",
      },
      {
        url: `${PUBLIC_APIURL}api/cq9fish/getturnoverforrebate`,
        name: "CQ9",
      },
      {
        url: `${PUBLIC_APIURL}api/habanero/getturnoverforrebate`,
        name: "HABANERO",
      },
      {
        url: `${PUBLIC_APIURL}api/bng/getturnoverforrebate`,
        name: "BNG",
      },
      {
        url: `${PUBLIC_APIURL}api/playstar/getturnoverforrebate`,
        name: "PLAYSTAR",
      },
      {
        url: `${PUBLIC_APIURL}api/vpower/getturnoverforrebate`,
        name: "VPOWER",
      },
      {
        url: `${PUBLIC_APIURL}api/nextspin/getturnoverforrebate`,
        name: "NEXTSPIN",
      },
      {
        url: `${PUBLIC_APIURL}api/hacksaw/getturnoverforrebate`,
        name: "HACKSAW",
      },
      {
        url: `${PUBLIC_APIURL}api/relaxgaming/getturnoverforrebate`,
        name: "RELAX GAMING",
      },
      {
        url: `${PUBLIC_APIURL}api/playtechslot/getturnoverforrebate`,
        name: "PLAYTECH",
      },
      {
        url: `${PUBLIC_APIURL}api/playtechlive/getturnoverforrebate`,
        name: "PLAYTECH",
      },
      {
        url: `${PUBLIC_APIURL}api/fastspinslot/getturnoverforrebate`,
        name: "FASTSPIN",
      },
      {
        url: `${PUBLIC_APIURL}api/fastspinfish/getturnoverforrebate`,
        name: "FASTSPIN",
      },
      {
        url: `${PUBLIC_APIURL}api/rich88/getturnoverforrebate`,
        name: "RICH88",
      },
    ];

    const routePromises = routes.map((route) =>
      fetchRouteWithRetry(route, date)
    );
    const results = await Promise.all(routePromises);

    results.forEach((result) => {
      if (result) allGamesData.push(result);
    });

    const combinedUserData = {};

    allGamesData.forEach((gameData) => {
      const { gamename, gamecategory, users } = gameData;

      Object.entries(users).forEach(([username, data]) => {
        if (!combinedUserData[username]) {
          combinedUserData[username] = {};
        }

        if (!combinedUserData[username][gamecategory]) {
          combinedUserData[username][gamecategory] = {};
        }

        combinedUserData[username][gamecategory][gamename] = {
          turnover: data.turnover,
          winloss: data.winloss,
        };
      });
    });

    const yesterday = moment
      .utc()
      .add(8, "hours")
      .subtract(1, "days")
      .format("YYYY-MM-DD");

    for (const [username, categories] of Object.entries(combinedUserData)) {
      const gameCategories = new Map();

      for (const [category, games] of Object.entries(categories)) {
        gameCategories.set(category, new Map(Object.entries(games)));
      }

      await GameDataLog.findOneAndUpdate(
        { username, date: yesterday },
        {
          username,
          date: yesterday,
          gameCategories,
        },
        { upsert: true, new: true }
      );
    }

    return res.status(200).json({
      success: true,
      data: combinedUserData,
    });
  } catch (error) {
    console.error("Error in getAllTurnoverForRebate:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch combined turnover data",
    });
  }
});

router.patch("/admin/api/updateseamlessstatus/:userId", async (req, res) => {
  try {
    const { gamename } = req.body;

    const userId = req.params.userId;

    const user = await User.findById(userId);

    if (!user.gameLock.hasOwnProperty(gamename)) {
      console.log("Error updating seamless game status:", gamename, "gamename");
      return res.status(200).json({
        success: false,
        message: {
          en: "Internal Server Error. Please contact IT support for further assistance.",
          zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
        },
      });
    }

    user.gameLock[gamename].lock = !user.gameLock[gamename].lock;

    await user.save();

    return res.status(200).json({
      success: true,
      message: {
        en: `Game lock status for ${gamename} updated successfully.`,
        zh: `${gamename} 的游戏锁定状态更新成功。`,
      },
      gameLock: user.gameLock[gamename],
    });
  } catch (error) {
    console.error("Error updating seamless game status:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "Internal Server Error. Please contact IT support for further assistance.",
        zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
      },
    });
  }
});

router.patch(
  "/admin/api/updatetransferstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { gamename, action } = req.body;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameStatus.hasOwnProperty(gamename)) {
        console.log(
          "Error updating transfer game status:",
          gamename,
          "gamename"
        );
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
          },
        });
      }

      if (action === "transferIn") {
        user.gameStatus[gamename].transferInStatus =
          !user.gameStatus[gamename].transferInStatus;
      } else if (action === "transferOut") {
        user.gameStatus[gamename].transferOutStatus =
          !user.gameStatus[gamename].transferOutStatus;
      } else {
        return res.status(400).json({
          success: false,
          message: {
            en: "Invalid action type. Please select either 'transferIn' or 'transferOut'.",
            zh: "无效的操作类型。请选择 'transferIn' 或 'transferOut'。",
          },
        });
      }

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game ${action} status for ${gamename} updated successfully.`,
          zh: `${gamename} 的 ${
            action === "transferIn" ? "转入状态" : "转出状态"
          } 更新成功。`,
        },
        gameStatus: user.gameStatus[gamename],
      });
    } catch (error) {
      console.error("Error updating transfer game status:", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "Internal Server Error. Please contact IT support for further assistance.",
          zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
        },
      });
    }
  }
);

router.post(
  "/admin/api/revertgamewallet/:logId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const gameWalletLog = await GameWalletLog.findById(req.params.logId);

      if (!gameWalletLog) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Game wallet log not found",
            zh: "游戏钱包日志未找到",
          },
        });
      }

      if (gameWalletLog.reverted) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Transaction already reverted",
            zh: "交易已被撤销",
          },
        });
      }

      if (gameWalletLog.remark !== "Seamless") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Reverting only allowed in seamless game",
            zh: "仅可撤销无缝游戏",
          },
        });
      }

      const updatedUser = await User.findOneAndUpdate(
        { username: gameWalletLog.username },
        { $inc: { wallet: roundToTwoDecimals(gameWalletLog.amount) } },
        { new: true }
      );

      if (!updatedUser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "用户未找到",
          },
        });
      }

      await GameWalletLog.findByIdAndUpdate(req.params.logId, {
        reverted: true,
      });

      res.status(200).json({
        success: true,
        message: {
          en: `Transaction successfully reverted.\nUsername: ${updatedUser.username}\nCurrent Wallet: ${updatedUser.wallet}\nReverted Amount: ${gameWalletLog.amount}`,
          zh: `交易已成功撤销。\n用户名: ${updatedUser.username}\n当前钱包: ${updatedUser.wallet}\n撤销金额: ${gameWalletLog.amount}`,
        },
        data: {
          username: updatedUser.username,
          currentWallet: updatedUser.wallet,
          revertedAmount: gameWalletLog.amount,
        },
      });
    } catch (error) {
      console.error("Error in reverting game wallet:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error in reverting game wallet",
          zh: "撤销此日志时发生错误",
        },
        error: error.message,
      });
    }
  }
);

router.post(
  "/admin/api/game/:userId/checkallgamebalance",
  authenticateAdminToken,
  async (req, res) => {
    try {
      return res.status(200).json({
        success: true,
        totalBalance: 0,
        message: {
          en: "Balance retrieved successfully.",
          zh: "余额查询成功。",
          ms: "Baki berjaya diperoleh.",
        },
      });
    } catch (error) {
      console.error("Error checking game balances:", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "An error occurred while checking balance. Please try again later.",
          zh: "查询余额时发生错误，请稍后重试。",
          ms: "Ralat berlaku semasa menyemak baki. Sila cuba lagi kemudian.",
        },
      });
    }
  }
);

module.exports = router;
