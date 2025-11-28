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
const { mega888CheckBalance } = require("./slot_mega888");
const GameWalletLog = require("../../models/gamewalletlog.model");

require("dotenv").config();

function roundToTwoDecimals(num) {
  return Math.round(Number(num) * 100) / 100;
}

const GAME_BALANCE_CHECKERS = [
  {
    name: "mnega888",
    key: "mega888Balance",
    checker: (user) => mega888CheckBalance(user),
    extractBalance: (result) => Number(result.balance),
    condition: (user) => !!user.mega888GameID,
  },

  // {
  //   name: "pg",
  //   key: "pgBalance",
  //   checker: PGCheckBalance,
  //   extractBalance: (result) => Number(result.data.balance),
  // },
  // {
  //   name: "pragmatic",
  //   key: "pragmaticBalance",
  //   checker: PragmaticCheckBalance,
  //   extractBalance: (result) => Number(result.balance),
  // },
];

router.post(
  "/api/game/checkallgamebalance",
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
            zh_hk: "搵唔到用戶，麻煩再試多次或者聯絡客服幫手。",
            id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      const availableGames = GAME_BALANCE_CHECKERS.filter((game) => {
        return game.condition ? game.condition(user) : true;
      });

      const balancePromises = availableGames.map(async (game) => {
        try {
          const result = await game.checker(user);

          if (result.success) {
            return {
              key: game.key,
              balance: game.extractBalance(result),
            };
          } else {
            console.error(`${game.name} balance check error:`, result);
            return {
              key: game.key,
              balance: 0,
            };
          }
        } catch (error) {
          console.error(`${game.name} balance check exception:`, error.message);
          return {
            key: game.key,
            balance: 0,
          };
        }
      });

      const balanceResults = await Promise.all(balancePromises);

      const balances = balanceResults.reduce((acc, result) => {
        acc[result.key] = result.balance;
        return acc;
      }, {});

      const totalBalance = Object.values(balances).reduce(
        (total, balance) => total + balance,
        0
      );

      return res.status(200).json({
        success: true,
        ...balances,
        totalBalance: roundToTwoDecimals(totalBalance),
        accountsChecked: availableGames.length,
        message: {
          en: "Balance retrieved successfully.",
          zh: "余额查询成功。",
          zh_hk: "餘額查詢成功。",
          ms: "Baki berjaya diperoleh.",
          id: "Saldo berhasil diambil.",
        },
      });
    } catch (error) {
      console.error("Error checking game balances:", error.message);

      const errorBalances = GAME_BALANCE_CHECKERS.reduce((acc, game) => {
        acc[game.key] = 0;
        return acc;
      }, {});

      return res.status(200).json({
        success: false,
        ...errorBalances,
        totalBalance: 0,
        message: {
          en: "An error occurred while checking balance. Please try again later.",
          zh: "查询余额时发生错误，请稍后重试。",
          zh_hk: "查詢餘額時發生錯誤，請稍後重試。",
          ms: "Ralat berlaku semasa menyemak baki. Sila cuba lagi kemudian.",
          id: "Terjadi kesalahan saat memeriksa saldo. Silakan coba lagi nanti.",
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

      const availableGames = GAME_BALANCE_CHECKERS.filter((game) => {
        return game.condition ? game.condition(user) : true;
      });

      const balancePromises = availableGames.map(async (game) => {
        try {
          const result = await game.checker(user);

          if (result.success) {
            return {
              key: game.key,
              balance: game.extractBalance(result),
            };
          } else {
            console.error(`${game.name} balance check error:`, result);
            return {
              key: game.key,
              balance: 0,
            };
          }
        } catch (error) {
          console.error(`${game.name} balance check exception:`, error.message);
          return {
            key: game.key,
            balance: 0,
          };
        }
      });

      const balanceResults = await Promise.all(balancePromises);

      const balances = balanceResults.reduce((acc, result) => {
        acc[result.key] = result.balance;
        return acc;
      }, {});

      const totalBalance = Object.values(balances).reduce(
        (total, balance) => total + balance,
        0
      );

      return res.status(200).json({
        success: true,
        ...balances,
        totalBalance: roundToTwoDecimals(totalBalance),
        accountsChecked: availableGames.length,
        message: {
          en: "Balance retrieved successfully.",
          zh: "余额查询成功。",
          zh_hk: "餘額查詢成功。",
          ms: "Baki berjaya diperoleh.",
          id: "Saldo berhasil diambil.",
        },
      });
    } catch (error) {
      console.error("admin Error checking game balances:", error.message);

      const errorBalances = GAME_BALANCE_CHECKERS.reduce((acc, game) => {
        acc[game.key] = 0;
        return acc;
      }, {});

      return res.status(200).json({
        success: false,
        ...errorBalances,
        totalBalance: 0,
        message: {
          en: "An error occurred while checking balance. Please try again later.",
          zh: "查询余额时发生错误，请稍后重试。",
          zh_hk: "查詢餘額時發生錯誤，請稍後重試。",
          ms: "Ralat berlaku semasa menyemak baki. Sila cuba lagi kemudian.",
          id: "Terjadi kesalahan saat memeriksa saldo. Silakan coba lagi nanti.",
        },
      });
    }
  }
);

module.exports = router;
