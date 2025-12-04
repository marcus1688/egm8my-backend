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
const { mega888CheckBalance, mega888Withdraw } = require("./slot_mega888");
const GameWalletLog = require("../../models/gamewalletlog.model");
const { kiss918CheckBalance, kiss918Withdraw } = require("./slot_918kiss");
const { huaweiCheckBalance, huaweiWithdraw } = require("./other_huaweilottery");

require("dotenv").config();

function roundToTwoDecimals(num) {
  return Math.round(Number(num) * 100) / 100;
}

const GAME_CONFIG = [
  {
    name: "Mega888",
    key: "mega888",
    balanceKey: "mega888Balance",
    checker: (user) => mega888CheckBalance(user),
    withdraw: (user, amount) => mega888Withdraw(user, amount),
    extractBalance: (result) => Number(result.balance),
    isSuccess: (result) => result.success,
    condition: (user) => !!user.mega888GameID,
  },
  {
    name: "918Kiss",
    key: "kiss918",
    balanceKey: "kiss918Balance",
    checker: (user) => kiss918CheckBalance(user),
    withdraw: (user, amount) => kiss918Withdraw(user, amount),
    extractBalance: (result) => Number(result.balance),
    isSuccess: (result) => result.success,
    condition: (user) => !!user.kiss918GameID,
  },
  {
    name: "Grand Dragon",
    key: "granddragon",
    balanceKey: "granddragonBalance",
    checker: (user) => huaweiCheckBalance(user),
    withdraw: (user, amount) => huaweiWithdraw(user, amount),
    extractBalance: (result) => Number(result.balance),
    isSuccess: (result) => result.success,
    condition: (user) => !!user.huaweiGameID,
  },
];

// Helper function to check all balances
const checkAllGameBalances = async (user) => {
  const availableGames = GAME_CONFIG.filter((game) =>
    game.condition ? game.condition(user) : true
  );

  const balancePromises = availableGames.map(async (game) => {
    try {
      const result = await game.checker(user);
      return {
        key: game.key,
        balanceKey: game.balanceKey,
        name: game.name,
        balance: result.success ? game.extractBalance(result) : 0,
        success: result.success,
        game,
      };
    } catch (error) {
      console.error(`${game.name} balance check error:`, error.message);
      return {
        key: game.key,
        balanceKey: game.balanceKey,
        name: game.name,
        balance: 0,
        success: false,
        game,
      };
    }
  });

  return Promise.all(balancePromises);
};

const transferOutFromGame = async (user, gameConfig, balance) => {
  try {
    const result = await gameConfig.withdraw(user, balance);
    if (gameConfig.isSuccess(result)) {
      return { success: true, amount: balance };
    }
    return {
      success: false,
      amount: 0,
      error: result.message || "Transfer failed",
    };
  } catch (error) {
    console.error(`${gameConfig.name} transfer error:`, error.message);
    return { success: false, amount: 0, error: error.message };
  }
};

const createWalletLog = (
  username,
  amount,
  gameName,
  beforeBalance,
  afterBalance
) => {
  return GameWalletLog.create({
    username,
    transactionType: "Transfer Out",
    type: "Transfer",
    amount: roundToTwoDecimals(amount),
    gameName,
    gameBalance: 0,
    beforeBalance: roundToTwoDecimals(beforeBalance),
    afterBalance: roundToTwoDecimals(afterBalance),
  });
};

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

      const balanceResults = await checkAllGameBalances(user);

      const games = balanceResults.map((result) => ({
        game: result.name,
        balance: roundToTwoDecimals(result.balance),
      }));

      const balances = balanceResults.reduce((acc, result) => {
        acc[result.balanceKey] = result.balance;
        return acc;
      }, {});

      const totalBalance = balanceResults.reduce(
        (total, result) => total + result.balance,
        0
      );

      return res.status(200).json({
        success: true,
        games,
        ...balances,
        totalBalance: roundToTwoDecimals(totalBalance),
        accountsChecked: balanceResults.length,
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

      return res.status(200).json({
        success: false,
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

      const balanceResults = await checkAllGameBalances(user);

      const games = balanceResults.map((result) => ({
        game: result.name,
        balance: roundToTwoDecimals(result.balance),
      }));

      const balances = balanceResults.reduce((acc, result) => {
        acc[result.balanceKey] = result.balance;
        return acc;
      }, {});

      const totalBalance = balanceResults.reduce(
        (total, result) => total + result.balance,
        0
      );

      return res.status(200).json({
        success: true,
        games,
        ...balances,
        totalBalance: roundToTwoDecimals(totalBalance),
        accountsChecked: balanceResults.length,
        message: {
          en: "Balance retrieved successfully.",
          zh: "余额查询成功。",
          zh_hk: "餘額查詢成功。",
          ms: "Baki berjaya diperoleh.",
          id: "Saldo berhasil diambil.",
        },
      });
    } catch (error) {
      console.error("Admin Error checking game balances:", error.message);

      return res.status(200).json({
        success: false,
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
            zh_hk: "搵唔到用戶，麻煩再試多次或者聯絡客服幫手。",
            id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      const balanceResults = await checkAllGameBalances(user);

      const hasBalance = balanceResults.some((r) => r.success && r.balance > 0);
      if (!hasBalance) {
        return res.status(200).json({
          success: true,
          message: {
            en: "No balance to transfer",
            zh: "没有可转出的余额",
            ms: "Tiada baki untuk dipindahkan",
            zh_hk: "冇餘額可以轉出",
            id: "Tidak ada saldo untuk ditransfer",
          },
        });
      }

      const transferPromises = balanceResults
        .filter((r) => r.success && r.balance > 0)
        .map(async (r) => {
          const result = await transferOutFromGame(user, r.game, r.balance);
          return { ...result, key: r.key, name: r.name };
        });

      const transferResults = await Promise.all(transferPromises);

      const totalSuccessAmount = transferResults
        .filter((r) => r.success)
        .reduce((sum, r) => sum + r.amount, 0);

      const transferResultsObj = {};
      for (const game of GAME_CONFIG) {
        const result = transferResults.find((r) => r.key === game.key);
        transferResultsObj[game.key] = result
          ? {
              success: result.success,
              amount: result.amount,
              error: result.error,
            }
          : { success: false, amount: 0 };
      }

      if (totalSuccessAmount === 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "No balance successfully transferred",
            zh: "没有成功转出的余额",
            ms: "Tiada baki berjaya dipindahkan",
            zh_hk: "冇餘額成功轉出",
            id: "Tidak ada saldo yang berhasil ditransfer",
          },
          transferResults: transferResultsObj,
        });
      }

      await User.findByIdAndUpdate(
        req.user.userId,
        { $inc: { wallet: roundToTwoDecimals(totalSuccessAmount) } },
        { new: true }
      );

      let currentBalance = user.wallet;
      const logPromises = transferResults
        .filter((r) => r.success)
        .map((r) => {
          const beforeBalance = currentBalance;
          currentBalance += r.amount;
          return createWalletLog(
            user.username,
            r.amount,
            r.name,
            beforeBalance,
            currentBalance
          );
        });

      await Promise.all(logPromises);

      const transferred = { total: roundToTwoDecimals(totalSuccessAmount) };
      for (const game of GAME_CONFIG) {
        const result = transferResults.find((r) => r.key === game.key);
        transferred[game.key] = result?.success ? result.amount : 0;
      }

      return res.status(200).json({
        success: true,
        transferred,
        message: {
          en: "Transfer out completed",
          zh: "转出完成",
          ms: "Pemindahan keluar berjaya",
          zh_hk: "轉出完成",
          id: "Transfer keluar selesai",
        },
        transferResults: transferResultsObj,
      });
    } catch (error) {
      console.error("Error in transfer out all:", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "Transfer out failed. Please try again.",
          zh: "转出失败。请重试。",
          ms: "Pemindahan keluar gagal. Sila cuba lagi.",
          zh_hk: "轉出失敗。請重試。",
          id: "Transfer keluar gagal. Silakan coba lagi.",
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
            zh_hk: "搵唔到用戶，麻煩再試多次或者聯絡客服幫手。",
            id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      const balanceResults = await checkAllGameBalances(user);

      const hasBalance = balanceResults.some((r) => r.success && r.balance > 0);
      if (!hasBalance) {
        return res.status(200).json({
          success: true,
          message: {
            en: "No balance to transfer",
            zh: "没有可转出的余额",
            ms: "Tiada baki untuk dipindahkan",
            zh_hk: "冇餘額可以轉出",
            id: "Tidak ada saldo untuk ditransfer",
          },
        });
      }

      const transferPromises = balanceResults
        .filter((r) => r.success && r.balance > 0)
        .map(async (r) => {
          const result = await transferOutFromGame(user, r.game, r.balance);
          return { ...result, key: r.key, name: r.name };
        });

      const transferResults = await Promise.all(transferPromises);

      const totalSuccessAmount = transferResults
        .filter((r) => r.success)
        .reduce((sum, r) => sum + r.amount, 0);

      const transferResultsObj = {};
      for (const game of GAME_CONFIG) {
        const result = transferResults.find((r) => r.key === game.key);
        transferResultsObj[game.key] = result
          ? {
              success: result.success,
              amount: result.amount,
              error: result.error,
            }
          : { success: false, amount: 0 };
      }

      if (totalSuccessAmount === 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "No balance successfully transferred",
            zh: "没有成功转出的余额",
            ms: "Tiada baki berjaya dipindahkan",
            zh_hk: "冇餘額成功轉出",
            id: "Tidak ada saldo yang berhasil ditransfer",
          },
          transferResults: transferResultsObj,
        });
      }

      await User.findByIdAndUpdate(
        userId,
        { $inc: { wallet: roundToTwoDecimals(totalSuccessAmount) } },
        { new: true }
      );

      let currentBalance = user.wallet;
      const logPromises = transferResults
        .filter((r) => r.success)
        .map((r) => {
          const beforeBalance = currentBalance;
          currentBalance += r.amount;
          return createWalletLog(
            user.username,
            r.amount,
            r.name,
            beforeBalance,
            currentBalance
          );
        });

      await Promise.all(logPromises);

      const transferred = { total: roundToTwoDecimals(totalSuccessAmount) };
      for (const game of GAME_CONFIG) {
        const result = transferResults.find((r) => r.key === game.key);
        transferred[game.key] = result?.success ? result.amount : 0;
      }

      return res.status(200).json({
        success: true,
        transferred,
        message: {
          en: "Transfer out completed",
          zh: "转出完成",
          ms: "Pemindahan keluar berjaya",
          zh_hk: "轉出完成",
          id: "Transfer keluar selesai",
        },
        transferResults: transferResultsObj,
      });
    } catch (error) {
      console.error("Admin Error in transfer out all:", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "Transfer out failed. Please try again.",
          zh: "转出失败。请重试。",
          ms: "Pemindahan keluar gagal. Sila cuba lagi.",
          zh_hk: "轉出失敗。請重試。",
          id: "Transfer keluar gagal. Silakan coba lagi.",
        },
      });
    }
  }
);

module.exports = router;
