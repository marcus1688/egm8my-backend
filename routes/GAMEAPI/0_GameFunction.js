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
const {
  checkGW99Balance,
  transferOutGW99,
  transferOutAlipay,
  checkAlipayBalance,
  transferOutLionking,
  checkLionKingBalance,
} = require("../../services/game");
const GameWalletLog = require("../../models/gamewalletlog.model");
const { getYesterdayGameLogs } = require("../../services/gameData");

require("dotenv").config();

async function GameWalletLogAttempt(
  username,
  transactiontype,
  remark,
  amount,
  gamename,
  gamebalance,
  beforewalletbalance,
  afterwalletbalance
) {
  await GameWalletLog.create({
    username,
    transactiontype,
    remark: remark || "",
    amount,
    gamename: gamename,
    gamebalance,
    beforewalletbalance,
    afterwalletbalance,
  });
}

function roundToTwoDecimals(num) {
  return Math.round(Number(num) * 100) / 100;
}

router.post(
  "/api/game/checkallgamebalance",
  authenticateToken,
  async (req, res) => {
    try {
      const user = await User.findById(req.user.userId);

      const [GW99Result, AlipayResult, LionKingResult] = await Promise.all([
        checkGW99Balance(user.username),
        checkAlipayBalance(user.username),
        checkLionKingBalance(user.username),
      ]);

      const games = [
        { game: "GW99", balance: 0 },
        { game: "Alipay", balance: 0 },
        { game: "LionKing", balance: 0 },
      ];

      if (GW99Result.success && GW99Result.balance != null) {
        const index = games.findIndex((g) => g.game === "GW99");
        if (index !== -1) {
          games[index].balance = roundToTwoDecimals(Number(GW99Result.balance));
        }
      } else {
        console.error("GW99 balance check error:", GW99Result);
      }

      if (AlipayResult.success && AlipayResult.balance != null) {
        const index = games.findIndex((g) => g.game === "Alipay");
        if (index !== -1) {
          games[index].balance = roundToTwoDecimals(
            Number(AlipayResult.balance)
          );
        }
      } else {
        console.error("Alipay balance check error:", AlipayResult);
      }

      if (LionKingResult.success && LionKingResult.balance != null) {
        const index = games.findIndex((g) => g.game === "LionKing");
        if (index !== -1) {
          games[index].balance = roundToTwoDecimals(
            Number(LionKingResult.balance)
          );
        }
      } else {
        console.error("LionKing balance check error:", LionKingResult);
      }

      const totalBalance = games.reduce(
        (total, game) => total + game.balance,
        0
      );

      return res.status(200).json({
        success: true,
        games: games,
        totalBalance: roundToTwoDecimals(totalBalance),
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
        games: [
          { game: "GW99", balance: 0 },
          { game: "Alipay", balance: 0 },
          { game: "LionKing", balance: 0 },
        ],
        totalBalance: 0,
        message: {
          en: "An error occurred while checking balance. Please try again later.",
          zh: "查询余额时发生错误，请稍后重试。",
          ms: "Ralat berlaku semasa menyemak baki. Sila cuba lagi kemudian.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/game/:userId/checkallgamebalance",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      const [GW99Result, AlipayResult, LionKingResult] = await Promise.all([
        checkGW99Balance(user.username),
        checkAlipayBalance(user.username),
        checkLionKingBalance(user.username),
      ]);

      const balances = {
        gw99Balance: 0,
        alipayBalance: 0,
        lionkingBalance: 0,
      };

      if (GW99Result.success && GW99Result.balance != null) {
        balances.gw99Balance = Number(GW99Result.balance);
      } else {
        console.error("GW99 balance check error:", GW99Result);
      }

      if (AlipayResult.success && AlipayResult.balance != null) {
        balances.alipayBalance = Number(AlipayResult.balance);
      } else {
        console.error("Alipay balance check error:", AlipayResult);
      }

      if (LionKingResult.success && LionKingResult.balance != null) {
        balances.lionkingBalance = Number(LionKingResult.balance);
      } else {
        console.error("LionKing balance check error:", LionKingResult);
      }

      const totalBalance = Object.values(balances).reduce(
        (total, balance) => total + balance,
        0
      );

      return res.status(200).json({
        success: true,
        ...balances,
        totalBalance: roundToTwoDecimals(totalBalance),
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
        gw99Balance: 0,
        totalBalance: 0,
        message: {
          en: "An error occurred while checking balance. Please try again later.",
          zh: "查询余额时发生错误，请稍后重试。",
          ms: "Ralat berlaku semasa menyemak baki. Sila cuba lagi kemudian.",
        },
      });
    }
  }
);

router.post(
  "/api/game/transferout/all",
  authenticateToken,
  async (req, res) => {
    try {
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

      // Get current balances
      const [gw99Balance, alipayBalance, lionkingBalance] = await Promise.all([
        checkGW99Balance(user.username),
        checkAlipayBalance(user.username),
        checkLionKingBalance(user.username),
      ]);

      // Track successful transfers and amounts
      const transferResults = {
        gw99: { success: false, amount: 0 },
        alipay: { success: false, amount: 0 },
        lionking: { success: false, amount: 0 },
      };

      // Track total successfully transferred amount
      let totalSuccessAmount = 0;

      if (
        gw99Balance.balance <= 0 &&
        alipayBalance.balance <= 0 &&
        lionkingBalance.balance <= 0
      ) {
        return res.status(200).json({
          success: true,
          message: {
            en: "No balance to transfer",
            zh: "没有可转出的余额",
            ms: "Tiada baki untuk dipindahkan",
          },
        });
      }

      if (gw99Balance.success && gw99Balance.balance > 0) {
        try {
          const gw99Response = await transferOutGW99(user, gw99Balance.balance);

          // Check if GW99 transfer was successful
          if (gw99Response.result && gw99Response.result.code === "0") {
            transferResults.gw99 = {
              success: true,
              amount: Number(gw99Balance.balance),
            };
            totalSuccessAmount += Number(gw99Balance.balance);
          } else {
            transferResults.gw99 = {
              success: false,
              amount: 0,
              error: gw99Response.result
                ? gw99Response.result.message
                : "Unknown error",
            };
            console.log("GW99 transfer failed:", gw99Response);
          }
        } catch (err) {
          transferResults.gw99 = {
            success: false,
            amount: 0,
            error: err.message || "Unknown error",
          };
          console.error("GW99 transfer failed:", err);
        }
      }

      // Attempt Alipay transfer if there's a balance
      if (alipayBalance.success && alipayBalance.balance > 0) {
        try {
          const alipayResponse = await transferOutAlipay(
            user,
            alipayBalance.balance
          );

          // Check if Alipay transfer was successful
          if (alipayResponse.status.success) {
            transferResults.alipay = {
              success: true,
              amount: Number(alipayBalance.balance),
            };
            totalSuccessAmount += Number(alipayBalance.balance);
          } else {
            transferResults.alipay = {
              success: false,
              amount: 0,
              error: alipayResponse.message || "Unknown error",
            };
            console.log("Alipay transfer failed:", alipayResponse);
          }
        } catch (err) {
          transferResults.alipay = {
            success: false,
            amount: 0,
            error: err.message || "Unknown error",
          };
          console.error("Alipay transfer failed:", err);
        }
      }

      if (lionkingBalance.success && lionkingBalance.balance > 0) {
        try {
          const lionkingResponse = await transferOutLionking(
            user,
            lionkingBalance.balance
          );
          // Check if lionking transfer was successful
          if (lionkingResponse.code === "S100") {
            transferResults.lionking = {
              success: true,
              amount: Number(lionkingBalance.balance),
            };
            totalSuccessAmount += Number(lionkingBalance.balance);
          } else {
            transferResults.lionking = {
              success: false,
              amount: 0,
              error: lionkingResponse.message || "Unknown error",
            };
            console.log("LionKing transfer failed:", lionkingResponse);
          }
        } catch (err) {
          transferResults.lionking = {
            success: false,
            amount: 0,
            error: err.message || "Unknown error",
          };
          console.error("LionKing transfer failed:", err);
        }
      }

      if (
        !transferResults.gw99.success &&
        !transferResults.alipay.success &&
        !transferResults.lionking.success
      ) {
        return res.status(200).json({
          success: false,
          message: {
            en: "No balance successfully transferred",
            zh: "没有成功转出的余额",
            ms: "Tiada baki berjaya dipindahkan",
          },
          transferResults,
        });
      }

      if (totalSuccessAmount > 0) {
        const updatedUser = await User.findByIdAndUpdate(
          req.user.userId,
          { $inc: { wallet: roundToTwoDecimals(totalSuccessAmount) } },
          { new: true }
        );

        let currentWalletBalance = user.wallet;
        const logPromises = [];

        // Log only successful transfers
        if (transferResults.gw99.success) {
          const gw99Amount = transferResults.gw99.amount;
          const beforeBalance = currentWalletBalance;
          currentWalletBalance += gw99Amount;

          logPromises.push(
            GameWalletLogAttempt(
              user.username,
              "Transfer Out",
              "Transfer",
              roundToTwoDecimals(gw99Amount),
              "GW99",
              0,
              roundToTwoDecimals(beforeBalance),
              roundToTwoDecimals(currentWalletBalance)
            )
          );
        }

        if (transferResults.alipay.success) {
          const alipayAmount = transferResults.alipay.amount;
          const beforeBalance = currentWalletBalance;
          currentWalletBalance += alipayAmount;

          logPromises.push(
            GameWalletLogAttempt(
              user.username,
              "Transfer Out",
              "Transfer",
              roundToTwoDecimals(alipayAmount),
              "Alipay",
              0,
              roundToTwoDecimals(beforeBalance),
              roundToTwoDecimals(currentWalletBalance)
            )
          );
        }

        if (transferResults.lionking.success) {
          const lionKingAmount = transferResults.lionking.amount;
          const beforeBalance = currentWalletBalance;
          currentWalletBalance += lionKingAmount;

          logPromises.push(
            GameWalletLogAttempt(
              user.username,
              "Transfer Out",
              "Transfer",
              roundToTwoDecimals(lionKingAmount),
              "LionKing",
              0,
              roundToTwoDecimals(beforeBalance),
              roundToTwoDecimals(currentWalletBalance)
            )
          );
        }

        await Promise.all(logPromises);
      }

      return res.status(200).json({
        success: totalSuccessAmount > 0,
        transferred: {
          gw99: transferResults.gw99.success ? transferResults.gw99.amount : 0,
          alipay: transferResults.alipay.success
            ? transferResults.alipay.amount
            : 0,
          lionking: transferResults.lionking.success
            ? transferResults.lionking.amount
            : 0,
          total: roundToTwoDecimals(totalSuccessAmount),
        },
        message: {
          en:
            totalSuccessAmount > 0
              ? "Transfer out completed"
              : "Transfer out failed for all games",
          zh: totalSuccessAmount > 0 ? "转出完成" : "所有游戏转出失败",
          ms:
            totalSuccessAmount > 0
              ? "Pemindahan keluar berjaya"
              : "Pemindahan keluar gagal untuk semua permainan",
        },
        transferResults,
      });
    } catch (error) {
      console.error("Error in transfer out all:", error);
      return res.status(200).json({
        success: false,
        message: {
          en: "Transfer out failed. Please try again.",
          zh: "转出失败。请重试。",
          ms: "Pemindahan keluar gagal. Sila cuba lagi.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/game/:userId/transferout/all",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);
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

      // Get current balances
      const [gw99Balance, alipayBalance, lionkingBalance] = await Promise.all([
        checkGW99Balance(user.username),
        checkAlipayBalance(user.username),
        checkLionKingBalance(user.username),
      ]);

      const transferResults = {
        gw99: { success: false, amount: 0 },
        alipay: { success: false, amount: 0 },
        lionking: { success: false, amount: 0 },
      };

      // Track total successfully transferred amount
      let totalSuccessAmount = 0;

      if (
        gw99Balance.balance <= 0 &&
        alipayBalance.balance <= 0 &&
        lionkingBalance.balance <= 0
      ) {
        return res.status(200).json({
          success: true,
          message: {
            en: "No balance to transfer",
            zh: "没有可转出的余额",
            ms: "Tiada baki untuk dipindahkan",
          },
        });
      }

      if (gw99Balance.success && gw99Balance.balance > 0) {
        try {
          const gw99Response = await transferOutGW99(user, gw99Balance.balance);

          // Check if GW99 transfer was successful
          if (gw99Response.result && gw99Response.result.code === "0") {
            transferResults.gw99 = {
              success: true,
              amount: Number(gw99Balance.balance),
            };
            totalSuccessAmount += Number(gw99Balance.balance);
          } else {
            transferResults.gw99 = {
              success: false,
              amount: 0,
              error: gw99Response.result
                ? gw99Response.result.message
                : "Unknown error",
            };
            console.log("GW99 transfer failed:", gw99Response);
          }
        } catch (err) {
          transferResults.gw99 = {
            success: false,
            amount: 0,
            error: err.message || "Unknown error",
          };
          console.error("GW99 transfer failed:", err);
        }
      }

      if (alipayBalance.success && alipayBalance.balance > 0) {
        try {
          const alipayResponse = await transferOutAlipay(
            user,
            alipayBalance.balance
          );

          // Check if Alipay transfer was successful
          if (alipayResponse.status.success) {
            transferResults.alipay = {
              success: true,
              amount: Number(alipayBalance.balance),
            };
            totalSuccessAmount += Number(alipayBalance.balance);
          } else {
            transferResults.alipay = {
              success: false,
              amount: 0,
              error: alipayResponse.message || "Unknown error",
            };
            console.log("Alipay transfer failed:", alipayResponse);
          }
        } catch (err) {
          transferResults.alipay = {
            success: false,
            amount: 0,
            error: err.message || "Unknown error",
          };
          console.error("Alipay transfer failed:", err);
        }
      }

      if (lionkingBalance.success && lionkingBalance.balance > 0) {
        try {
          const lionkingResponse = await transferOutLionking(
            user,
            lionkingBalance.balance
          );

          // Check if lionking transfer was successful
          if (lionkingResponse.code === "S100") {
            transferResults.lionking = {
              success: true,
              amount: Number(lionkingBalance.balance),
            };
            totalSuccessAmount += Number(lionkingBalance.balance);
          } else {
            transferResults.lionking = {
              success: false,
              amount: 0,
              error: lionkingResponse.message || "Unknown error",
            };
            console.log("LionKing transfer failed:", lionkingResponse);
          }
        } catch (err) {
          transferResults.lionking = {
            success: false,
            amount: 0,
            error: err.message || "Unknown error",
          };
          console.error("LionKing transfer failed:", err);
        }
      }

      if (
        !transferResults.gw99.success &&
        !transferResults.alipay.success &&
        !transferResults.lionking.success
      ) {
        return res.status(200).json({
          success: false,
          message: {
            en: "No balance successfully transferred",
            zh: "没有成功转出的余额",
            ms: "Tiada baki berjaya dipindahkan",
          },
          transferResults,
        });
      }

      if (totalSuccessAmount > 0) {
        const updatedUser = await User.findByIdAndUpdate(
          userId,
          { $inc: { wallet: roundToTwoDecimals(totalSuccessAmount) } },
          { new: true }
        );

        let currentWalletBalance = user.wallet;
        const logPromises = [];

        // Log only successful transfers
        if (transferResults.gw99.success) {
          const gw99Amount = transferResults.gw99.amount;
          const beforeBalance = currentWalletBalance;
          currentWalletBalance += gw99Amount;

          logPromises.push(
            GameWalletLogAttempt(
              user.username,
              "Transfer Out",
              "Transfer",
              roundToTwoDecimals(gw99Amount),
              "GW99",
              0,
              roundToTwoDecimals(beforeBalance),
              roundToTwoDecimals(currentWalletBalance)
            )
          );
        }

        if (transferResults.alipay.success) {
          const alipayAmount = transferResults.alipay.amount;
          const beforeBalance = currentWalletBalance;
          currentWalletBalance += alipayAmount;

          logPromises.push(
            GameWalletLogAttempt(
              user.username,
              "Transfer Out",
              "Transfer",
              roundToTwoDecimals(alipayAmount),
              "Alipay",
              0,
              roundToTwoDecimals(beforeBalance),
              roundToTwoDecimals(currentWalletBalance)
            )
          );
        }

        if (transferResults.lionking.success) {
          const lionkingAmount = transferResults.lionking.amount;
          const beforeBalance = currentWalletBalance;
          currentWalletBalance += lionkingAmount;

          logPromises.push(
            GameWalletLogAttempt(
              user.username,
              "Transfer Out",
              "Transfer",
              roundToTwoDecimals(lionkingAmount),
              "LionKing",
              0,
              roundToTwoDecimals(beforeBalance),
              roundToTwoDecimals(currentWalletBalance)
            )
          );
        }

        await Promise.all(logPromises);
      }

      return res.status(200).json({
        success: totalSuccessAmount > 0,
        transferred: {
          gw99: transferResults.gw99.success ? transferResults.gw99.amount : 0,
          alipay: transferResults.alipay.success
            ? transferResults.alipay.amount
            : 0,
          lionking: transferResults.lionking.success
            ? transferResults.lionking.amount
            : 0,
          total: roundToTwoDecimals(totalSuccessAmount),
        },
        message: {
          en:
            totalSuccessAmount > 0
              ? "Transfer out completed"
              : "Transfer out failed for all games",
          zh: totalSuccessAmount > 0 ? "转出完成" : "所有游戏转出失败",
          ms:
            totalSuccessAmount > 0
              ? "Pemindahan keluar berjaya"
              : "Pemindahan keluar gagal untuk semua permainan",
        },
        transferResults,
      });
    } catch (error) {
      console.error("Error in transfer out all:", error);
      return res.status(200).json({
        success: false,
        message: {
          en: "Transfer out failed. Please try again.",
          zh: "转出失败。请重试。",
          ms: "Pemindahan keluar gagal. Sila cuba lagi.",
        },
      });
    }
  }
);

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

const PUBLIC_APIURL = process.env.API_URL;

router.post("/admin/api/getAllTurnoverForRebate", async (req, res) => {
  try {
    const { date } = req.body;
    const allGamesData = [];

    const routes = [
      {
        url: `${PUBLIC_APIURL}api/wmcasino/getturnoverforrebate`,
        name: "WM CASINO",
      },
      {
        url: `${PUBLIC_APIURL}api/yeebet/getturnoverforrebate`,
        name: "YEEBET",
      },
      {
        url: `${PUBLIC_APIURL}api/sexybcrt/getturnoverforrebate`,
        name: "SEXYBCRT",
      },
      {
        url: `${PUBLIC_APIURL}api/dreamgaming/getturnoverforrebate`,
        name: "DREAM GAMING",
      },
      {
        url: `${PUBLIC_APIURL}api/evolution/getturnoverforrebate`,
        name: "EVOLUTION",
      },
      {
        url: `${PUBLIC_APIURL}api/nolimit/getturnoverforrebate`,
        name: "NOLIMIT",
      },
      {
        url: `${PUBLIC_APIURL}api/jdbslot/getturnoverforrebate`,
        name: "JDB",
      },
      {
        url: `${PUBLIC_APIURL}api/jdbfish/getturnoverforrebate`,
        name: "JDB",
      },
      {
        url: `${PUBLIC_APIURL}api/redtiger/getturnoverforrebate`,
        name: "RED TIGER",
      },
      {
        url: `${PUBLIC_APIURL}api/netent/getturnoverforrebate`,
        name: "NETENT",
      },
      {
        url: `${PUBLIC_APIURL}api/tfgaming/getturnoverforrebate`,
        name: "TFGAMING",
      },
      {
        url: `${PUBLIC_APIURL}api/ct855/getturnoverforrebate`,
        name: "CT855",
      },
      {
        url: `${PUBLIC_APIURL}api/joker/getturnoverforrebate`,
        name: "JOKER",
      },
      {
        url: `${PUBLIC_APIURL}api/agslot/getturnoverforrebate`,
        name: "ASIA GAMING",
      },
      {
        url: `${PUBLIC_APIURL}api/aglive/getturnoverforrebate`,
        name: "ASIA GAMING",
      },
      {
        url: `${PUBLIC_APIURL}api/ppslot/getturnoverforrebate`,
        name: "PPSLOT",
      },
      {
        url: `${PUBLIC_APIURL}api/pplive/getturnoverforrebate`,
        name: "PPLIVE",
      },
      {
        url: `${PUBLIC_APIURL}api/joker/getturnoverforrebate`,
        name: "JOKER",
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
        url: `${PUBLIC_APIURL}api/jilislot/getturnoverforrebate`,
        name: "JILI",
      },
      {
        url: `${PUBLIC_APIURL}api/jilifish/getturnoverforrebate`,
        name: "JILI",
      },
      {
        url: `${PUBLIC_APIURL}api/918kissh5/getturnoverforrebate`,
        name: "918KISSH5",
      },
      {
        url: `${PUBLIC_APIURL}api/live22/getturnoverforrebate`,
        name: "LIVE22",
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
        url: `${PUBLIC_APIURL}api/nextspin/getturnoverforrebate`,
        name: "NEXTSPIN",
      },
      {
        url: `${PUBLIC_APIURL}api/lfc888/getturnoverforrebate`,
        name: "LFC888",
      },
      {
        url: `${PUBLIC_APIURL}api/uuslot/getturnoverforrebate`,
        name: "UU SLOT",
      },
      {
        url: `${PUBLIC_APIURL}api/mega888h5/getturnoverforrebate`,
        name: "MEGA888H5",
      },
      {
        url: `${PUBLIC_APIURL}api/gw99/getturnoverforrebate`,
        name: "GW99",
      },
      {
        url: `${PUBLIC_APIURL}api/alipay/getturnoverforrebate`,
        name: "ALIPAY",
      },
      {
        url: `${PUBLIC_APIURL}api/lionking/getturnoverforrebate`,
        name: "LIONKING",
      },
      {
        url: `${PUBLIC_APIURL}api/sagaming/getturnoverforrebate`,
        name: "SA GAMING",
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
        url: `${PUBLIC_APIURL}api/hacksaw/getturnoverforrebate`,
        name: "HACKSAW",
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
    console.error("Error in getAllTurnoverForRebate:", error.message);
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
module.exports = router;
