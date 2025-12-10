const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");
const CryptoJS = require("crypto-js");
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
const GameSyncLog = require("../../models/game_syncdata.model");
const slot918KissModal = require("../../models/slot_918kiss.model");
const cron = require("node-cron");
require("dotenv").config();

//Staging
const kiss918Secret = process.env.KISS918_SECRET;
const kiss918AgentId = "918EGM8MYR";
const webURL = "https://www.bm8my.vip/";
const kiss918APIURL = "https://s2.777minion.com/";
const kiss918Provider = "918KISS";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateRandomPassword() {
  const randomNumber = crypto.randomInt(1000, 10000);

  return `bm8${randomNumber}`;
}

function generateMD5Hash(data) {
  return crypto.createHash("md5").update(data.toLowerCase()).digest("hex");
}

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

const kiss918RegisterUser = async (user) => {
  try {
    const hashString = `${kiss918AgentId}${kiss918Provider}${kiss918Secret}`;
    const digest = generateMD5Hash(hashString);

    const payload = {
      agentID: kiss918AgentId,
      provider: kiss918Provider,
      secretKey: kiss918Secret,
      hash: digest,
    };

    const response = await axios.post(
      `${kiss918APIURL}player/create/`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        maxRedirects: 0,
      }
    );

    if (response.data.error === 0) {
      const generatedLoginId = response.data.playerID;
      const generatedPassword = response.data.playerPwd;

      const updateFields = {
        $set: {
          kiss918GameID: generatedLoginId,
          kiss918GamePW: generatedPassword,
        },
      };

      if (user.kiss918GameID && user.kiss918GamePW) {
        updateFields.$push = {
          pastKiss918GameID: user.kiss918GameID,
          pastKiss918GamePW: user.kiss918GamePW,
        };
      }

      await User.findByIdAndUpdate(user._id, updateFields, { new: true });

      return {
        success: true,
        userData: {
          userId: generatedLoginId,
          password: generatedPassword,
        },
      };
    } else {
      console.log(response.data, "918KISS Registration Failed");
      return {
        success: false,
        error: response.data,
      };
    }
  } catch (error) {
    console.log("918KISS error in registering user", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

const kiss918CheckBalance = async (user) => {
  try {
    if (!user.kiss918GameID) {
      return {
        success: true,
        balance: 0,
      };
    }

    const hashString = `${kiss918AgentId}${user.kiss918GameID}${kiss918Provider}${kiss918Secret}`;
    const digest = generateMD5Hash(hashString);

    const payload = {
      agentID: kiss918AgentId,
      playerID: user.kiss918GameID,
      provider: kiss918Provider,
      secretKey: kiss918Secret,
      hash: digest,
    };

    const response = await axios.post(
      `${kiss918APIURL}player/player_info/`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        maxRedirects: 0,
      }
    );

    return {
      success: response.data.error === 0,
      balance: response.data.playerBalance || 0,
      response: response.data,
    };
  } catch (error) {
    console.error("918KISS error checking user balance", error.message);
    return { success: false, balance: 0 };
  }
};

async function kiss918Deposit(user, trfamount) {
  try {
    const formattedAmount = parseFloat(trfamount).toFixed(2);

    const hashString = `${kiss918AgentId}${user.kiss918GameID}${kiss918Provider}${formattedAmount}${kiss918Secret}`;
    const digest = generateMD5Hash(hashString);

    const payload = {
      agentID: kiss918AgentId,
      playerID: user.kiss918GameID,
      provider: kiss918Provider,
      amount: parseFloat(formattedAmount),
      secretKey: kiss918Secret,
      hash: digest,
    };

    const response = await axios.post(
      `${kiss918APIURL}player/deposit/`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        maxRedirects: 0,
      }
    );

    if (response.data.error !== 0) {
      return {
        success: false,
        error: response.data,
      };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error("918KISS error in deposit:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function kiss918Withdraw(user, trfamount) {
  try {
    const formattedAmount = parseFloat(-trfamount).toFixed(2);

    const hashString = `${kiss918AgentId}${user.kiss918GameID}${kiss918Provider}${formattedAmount}${kiss918Secret}`;
    const digest = generateMD5Hash(hashString);

    const payload = {
      agentID: kiss918AgentId,
      playerID: user.kiss918GameID,
      provider: kiss918Provider,
      amount: parseFloat(formattedAmount),
      secretKey: kiss918Secret,
      hash: digest,
    };

    const response = await axios.post(
      `${kiss918APIURL}player/withdraw/`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        maxRedirects: 0,
      }
    );

    if (response.data.error !== 0) {
      return {
        success: false,
        error: response.data,
      };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error("918KISS error in withdraw:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

router.post("/api/918kiss/register", authenticateToken, async (req, res) => {
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

    if (user.kiss918GameID && user.kiss918GamePW) {
      return res.status(200).json({
        success: true,
        message: {
          en: "918KISS: Account registered successfully.",
          zh: "918KISS: 账户注册成功。",
          ms: "918KISS: Akaun berjaya didaftarkan.",
          zh_hk: "918KISS: 帳戶註冊成功。",
          id: "918KISS: Akun berhasil didaftarkan.",
        },
        userData: {
          userId: user.kiss918GameID,
          password: user.kiss918GamePW,
        },
      });
    }

    const registerResponse = await kiss918RegisterUser(user);
    if (!registerResponse.success) {
      return res.status(200).json({
        success: false,
        message: {
          en: "918KISS: Registration failed. Please try again or contact customer support for further assistance.",
          zh: "918KISS: 注册失败。请重试或联系客服寻求进一步帮助。",
          ms: "918KISS: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
          zh_hk: "918KISS: 註冊失敗。請重試或聯絡客服尋求進一步協助。",
          id: "918KISS: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: {
        en: "918KISS: Account registered successfully.",
        zh: "918KISS: 账户注册成功。",
        ms: "918KISS: Akaun berjaya didaftarkan.",
        zh_hk: "918KISS: 帳戶註冊成功。",
        id: "918KISS: Akun berhasil didaftarkan.",
      },
      userData: {
        userId: registerResponse.userData.userId,
        password: registerResponse.userData.password,
      },
    });
  } catch (error) {
    console.log("918KISS error in registering user", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "918KISS: Registration failed. Please try again or contact customer support for assistance.",
        zh: "918KISS: 注册失败。请重试或联系客服寻求帮助。",
        ms: "918KISS: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
        zh_hk: "918KISS: 註冊失敗。請重試或聯絡客服尋求協助。",
        id: "918KISS: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/admin/api/918kiss/:userId/registeradmin",
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

      const registerResponse = await kiss918RegisterUser(user);
      if (!registerResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "918KISS: Registration failed. Please try again or contact customer support for further assistance.",
            zh: "918KISS: 注册失败。请重试或联系客服寻求进一步帮助。",
            ms: "918KISS: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
            zh_hk: "918KISS: 註冊失敗。請重試或聯絡客服尋求進一步協助。",
            id: "918KISS: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "918KISS: Account registered successfully.",
          zh: "918KISS: 账户注册成功。",
          ms: "918KISS: Akaun berjaya didaftarkan.",
          zh_hk: "918KISS: 帳戶註冊成功。",
          id: "918KISS: Akun berhasil didaftarkan.",
        },
        userData: {
          userId: registerResponse.userData.userId,
          password: registerResponse.userData.password,
        },
      });
    } catch (error) {
      console.log("918KISS error in registering user", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "918KISS: Registration failed. Please try again or contact customer support for assistance.",
          zh: "918KISS: 注册失败。请重试或联系客服寻求帮助。",
          ms: "918KISS: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
          zh_hk: "918KISS: 註冊失敗。請重試或聯絡客服尋求協助。",
          id: "918KISS: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/918kiss/:userId/checkbalance",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
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

      const balanceResponse = await kiss918CheckBalance(user);

      if (!balanceResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "918KISS: Failed to retrieve balance. Please try again.",
            zh: "918KISS: 获取余额失败。请重试。",
            ms: "918KISS: Gagal mendapatkan baki. Sila cuba lagi.",
            zh_hk: "918KISS: 獲取餘額失敗。請重試。",
            id: "918KISS: Gagal mengambil saldo. Silakan coba lagi.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        balance: balanceResponse.balance,
        message: {
          en: "Balance retrieved successfully.",
          zh: "余额查询成功。",
          ms: "Baki berjaya diperoleh.",
          zh_hk: "餘額查詢成功。",
          id: "Saldo berhasil diambil.",
        },
      });
    } catch (error) {
      console.error("918KISS error checking user balance", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "918KISS: Failed to retrieve balance. Please try again.",
          zh: "918KISS: 获取余额失败。请重试。",
          ms: "918KISS: Gagal mendapatkan baki. Sila cuba lagi.",
          zh_hk: "918KISS: 獲取餘額失敗。請重試。",
          id: "918KISS: Gagal mengambil saldo. Silakan coba lagi.",
        },
      });
    }
  }
);

router.post(
  "/api/918kiss/checkbalance",
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
      const balanceResponse = await kiss918CheckBalance(user);

      if (!balanceResponse.success) {
        console.log("918kiss faileed to fget balance");
        console.log(balanceResponse);
        return res.status(200).json({
          success: false,
          message: {
            en: "918KISS: Failed to retrieve balance. Please try again.",
            zh: "918KISS: 获取余额失败。请重试。",
            ms: "918KISS: Gagal mendapatkan baki. Sila cuba lagi.",
            zh_hk: "918KISS: 獲取餘額失敗。請重試。",
            id: "918KISS: Gagal mengambil saldo. Silakan coba lagi.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        balance: balanceResponse.balance,
        message: {
          en: "Balance retrieved successfully.",
          zh: "余额查询成功。",
          ms: "Baki berjaya diperoleh.",
          zh_hk: "餘額查詢成功。",
          id: "Saldo berhasil diambil.",
        },
      });
    } catch (error) {
      console.error("918KISS error checking user balance", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "918KISS: Failed to retrieve balance. Please try again.",
          zh: "918KISS: 获取余额失败。请重试。",
          ms: "918KISS: Gagal mendapatkan baki. Sila cuba lagi.",
          zh_hk: "918KISS: 獲取餘額失敗。請重試。",
          id: "918KISS: Gagal mengambil saldo. Silakan coba lagi.",
        },
      });
    }
  }
);

router.post("/api/918kiss/deposit", authenticateToken, async (req, res) => {
  let formattedDepositAmount = 0;
  let user = null;
  let walletDeducted = false;
  try {
    user = await User.findById(req.user.userId);

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

    if (!user.kiss918GameID) {
      return res.status(200).json({
        success: false,
        message: {
          en: "918KISS: Game account not registered. Please register an account first to proceed.",
          zh: "918KISS: 游戏账户未注册。请先注册账户以继续。",
          ms: "918KISS: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
          zh_hk: "918KISS: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
          id: "918KISS: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
        },
      });
    }

    const { transferAmount } = req.body;
    formattedDepositAmount = roundToTwoDecimals(transferAmount);

    if (isNaN(formattedDepositAmount) || formattedDepositAmount <= 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Deposit amount must be a positive number greater than 0.",
          zh: "存款金额必须为正数且大于0。",
          ms: "Jumlah deposit mestilah nombor positif dan lebih besar daripada 0.",
          zh_hk: "存款金額必須為正數且大於0。",
          id: "Jumlah deposit harus berupa angka positif dan lebih besar dari 0.",
        },
      });
    }

    if (user.gameStatus.kiss918.transferInStatus) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Transfer is temporarily locked. Please contact customer support for assistance.",
          zh: "转账暂时锁定。请联系客服寻求帮助。",
          ms: "Pemindahan dikunci buat sementara. Sila hubungi sokongan pelanggan untuk bantuan.",
          zh_hk: "轉帳暫時鎖定。請聯絡客服尋求協助。",
          id: "Transfer terkunci sementara. Silakan hubungi dukungan pelanggan untuk bantuan.",
        },
      });
    }

    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        wallet: { $gte: formattedDepositAmount },
      },
      {
        $inc: { wallet: -formattedDepositAmount },
      },
      { new: true, projection: { wallet: 1, _id: 1 } }
    ).lean();

    if (!updatedUser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Insufficient balance to complete the transaction.",
          zh: "余额不足，无法完成交易。",
          ms: "Baki tidak mencukupi untuk melengkapkan transaksi.",
          zh_hk: "餘額不足，無法完成交易。",
          id: "Saldo tidak mencukupi untuk menyelesaikan transaksi.",
        },
      });
    }

    walletDeducted = true;

    const depositResponse = await kiss918Deposit(user, formattedDepositAmount);

    if (!depositResponse.success) {
      await User.findByIdAndUpdate(user._id, {
        $inc: { wallet: formattedDepositAmount },
      });
      walletDeducted = false;

      console.error("918KISS: Deposit failed -", depositResponse.error);

      return res.status(200).json({
        success: false,
        message: {
          en: "918KISS: Deposit failed. Please try again or contact customer support for further assistance.",
          zh: "918KISS: 存款失败。请重试或联系客服寻求进一步帮助。",
          ms: "918KISS: Deposit gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
          zh_hk: "918KISS: 存款失敗。請重試或聯絡客服尋求進一步協助。",
          id: "918KISS: Deposit gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }

    try {
      const gameBalance = await kiss918CheckBalance(user);

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Transfer",
        roundToTwoDecimals(formattedDepositAmount),
        "918KISS",
        roundToTwoDecimals(gameBalance?.balance ?? 0),
        roundToTwoDecimals(user.wallet),
        roundToTwoDecimals(updatedUser.wallet)
      );
    } catch (logError) {
      console.error("918KISS: Failed to log transaction:", logError.message);
    }

    return res.status(200).json({
      success: true,
      message: {
        en: "Deposit completed successfully.",
        zh: "存款成功完成。",
        ms: "Deposit berjaya diselesaikan.",
        zh_hk: "存款成功完成。",
        id: "Deposit berhasil diselesaikan.",
      },
    });
  } catch (error) {
    console.log("918KISS error in deposit", error.message);

    if (walletDeducted && user) {
      try {
        await User.findByIdAndUpdate(user._id, {
          $inc: { wallet: formattedDepositAmount },
        });
        console.log("918KISS: Wallet rollback successful");
      } catch (rollbackError) {
        console.error(
          "918KISS: CRITICAL - Rollback failed:",
          rollbackError.message
        );
      }
    }

    return res.status(200).json({
      success: false,
      message: {
        en: "918KISS: Deposit failed. Please try again or contact customer support for further assistance.",
        zh: "918KISS: 存款失败。请重试或联系客服寻求进一步帮助。",
        ms: "918KISS: Deposit gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
        zh_hk: "918KISS: 存款失敗。請重試或聯絡客服尋求進一步協助。",
        id: "918KISS: Deposit gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
      },
    });
  }
});

router.post("/api/918kiss/withdraw", authenticateToken, async (req, res) => {
  let formattedWithdrawAmount = 0;
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

    if (!user.kiss918GameID) {
      return res.status(200).json({
        success: false,
        message: {
          en: "918KISS: Game account not registered. Please register an account first to proceed.",
          zh: "918KISS: 游戏账户未注册。请先注册账户以继续。",
          ms: "918KISS: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
          zh_hk: "918KISS: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
          id: "918KISS: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
        },
      });
    }

    const { transferAmount } = req.body;
    formattedWithdrawAmount = roundToTwoDecimals(transferAmount);

    if (isNaN(formattedWithdrawAmount) || formattedWithdrawAmount <= 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Withdrawal amount must be a positive number greater than 0.",
          zh: "提款金额必须为正数且大于0。",
          ms: "Jumlah pengeluaran mestilah nombor positif dan lebih besar daripada 0.",
          zh_hk: "提款金額必須為正數且大於0。",
          id: "Jumlah penarikan harus berupa angka positif dan lebih besar dari 0.",
        },
      });
    }

    if (user.gameStatus.kiss918.transferOutStatus) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Transfer is temporarily locked. Please contact customer support for assistance.",
          zh: "转账暂时锁定。请联系客服寻求帮助。",
          ms: "Pemindahan dikunci buat sementara. Sila hubungi sokongan pelanggan untuk bantuan.",
          zh_hk: "轉帳暫時鎖定。請聯絡客服尋求協助。",
          id: "Transfer terkunci sementara. Silakan hubungi dukungan pelanggan untuk bantuan.",
        },
      });
    }

    const withdrawResponse = await kiss918Withdraw(
      user,
      formattedWithdrawAmount
    );

    if (!withdrawResponse.success) {
      console.error("918KISS: Withdraw failed -", withdrawResponse.error);

      if (withdrawResponse.error.error.code === "37123") {
        return res.status(200).json({
          success: false,
          message: {
            en: "918KISS: Insufficient game balance to complete withdrawal.",
            zh: "918KISS: 游戏余额不足，无法完成提款。",
            ms: "918KISS: Baki permainan tidak mencukupi untuk melengkapkan pengeluaran.",
            zh_hk: "918KISS: 遊戲餘額不足，無法完成提款。",
            id: "918KISS: Saldo permainan tidak mencukupi untuk menyelesaikan penarikan.",
          },
        });
      }

      return res.status(200).json({
        success: false,
        message: {
          en: "918KISS: Withdrawal failed. Please try again or contact customer support for further assistance.",
          zh: "918KISS: 提款失败。请重试或联系客服寻求进一步帮助。",
          ms: "918KISS: Pengeluaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
          zh_hk: "918KISS: 提款失敗。請重試或聯絡客服尋求進一步協助。",
          id: "918KISS: Penarikan gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }

    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
      },
      {
        $inc: { wallet: formattedWithdrawAmount },
      },
      { new: true, projection: { wallet: 1, _id: 1 } }
    ).lean();

    try {
      const gameBalance = await kiss918CheckBalance(user);

      await GameWalletLogAttempt(
        user.username,
        "Transfer Out",
        "Transfer",
        roundToTwoDecimals(formattedWithdrawAmount),
        "918KISS",
        roundToTwoDecimals(gameBalance?.balance ?? 0),
        roundToTwoDecimals(user.wallet),
        roundToTwoDecimals(updatedUser.wallet)
      );
    } catch (logError) {
      console.error("918KISS: Failed to log transaction:", logError.message);
    }

    return res.status(200).json({
      success: true,
      message: {
        en: "Withdrawal completed successfully.",
        zh: "提款成功完成。",
        ms: "Pengeluaran berjaya diselesaikan.",
        zh_hk: "提款成功完成。",
        id: "Penarikan berhasil diselesaikan.",
      },
    });
  } catch (error) {
    console.log("918KISS error in withdraw", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "918KISS: Withdrawal failed. Please try again or contact customer support for further assistance.",
        zh: "918KISS: 提款失败。请重试或联系客服寻求进一步帮助。",
        ms: "918KISS: Pengeluaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
        zh_hk: "918KISS: 提款失敗。請重試或聯絡客服尋求進一步協助。",
        id: "918KISS: Penarikan gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
      },
    });
  }
});

router.post(
  "/admin/api/918kiss/:userId/withdrawall",
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

      if (!user.kiss918GameID) {
        return res.status(200).json({
          success: false,
          message: {
            en: "918KISS: Game account not registered. Please register an account first to proceed.",
            zh: "918KISS: 游戏账户未注册。请先注册账户以继续。",
            ms: "918KISS: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
            zh_hk: "918KISS: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
            id: "918KISS: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
          },
        });
      }

      const gameBalance = await kiss918CheckBalance(user);

      if (!gameBalance.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Failed to check game balance. Please try again later.",
            zh: "无法检查游戏余额。请稍后重试。",
            zh_hk: "無法檢查遊戲餘額。請稍後重試。",
            ms: "Gagal menyemak baki permainan. Sila cuba lagi kemudian.",
            id: "Gagal memeriksa saldo permainan. Silakan coba lagi nanti.",
          },
        });
      }

      if (gameBalance.balance <= 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "No funds available for withdrawal.",
            zh: "没有可供提款的资金。",
            zh_hk: "沒有可供提款的資金。",
            ms: "Tiada dana tersedia untuk pengeluaran.",
            id: "Tidak ada dana tersedia untuk penarikan.",
          },
        });
      }

      const withdrawResponse = await kiss918Withdraw(user, gameBalance.balance);

      if (!withdrawResponse.success) {
        console.log("918KISS withdrw fail", withdrawResponse);

        if (withdrawResponse.error.error.code === "37123") {
          return res.status(200).json({
            success: false,
            message: {
              en: "Insufficient game balance to complete withdrawal.",
              zh: "游戏余额不足，无法完成提款。",
              ms: "Baki permainan tidak mencukupi untuk melengkapkan pengeluaran.",
              zh_hk: "遊戲餘額不足，無法完成提款。",
              id: "Saldo permainan tidak mencukupi untuk menyelesaikan penarikan.",
            },
          });
        }

        return res.status(200).json({
          success: false,
          message: {
            en: "Withdrawal failed. Please try again or contact customer service for assistance.",
            zh: "提款失败。请重试或联系客服以获取帮助。",
            zh_hk: "提款失敗。請重試或聯絡客服以獲取幫助。",
            ms: "Pengeluaran gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            id: "Penarikan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      const withdrawAmount = roundToTwoDecimals(gameBalance.balance);
      const previousWallet = roundToTwoDecimals(user.wallet);

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $inc: { wallet: withdrawAmount } },
        { new: true, projection: { wallet: 1, _id: 1, username: 1 } }
      ).lean();

      await GameWalletLogAttempt(
        updatedUser.username,
        "Transfer Out",
        "Transfer",
        withdrawAmount,
        "918KISS",
        "0",
        previousWallet,
        roundToTwoDecimals(updatedUser.wallet)
      );

      return res.status(200).json({
        success: true,
        message: {
          en: "Withdrawal completed successfully.",
          zh: "提款成功完成。",
          ms: "Pengeluaran berjaya diselesaikan.",
          zh_hk: "提款成功完成。",
          id: "Penarikan berhasil diselesaikan.",
        },
      });
    } catch (error) {
      console.log("918KISS error in transferout", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "Withdrawal failed. Please try again or contact customer service for assistance.",
          zh: "提款失败。请重试或联系客服以获取帮助。",
          zh_hk: "提款失敗。請重試或聯絡客服以獲取幫助。",
          ms: "Pengeluaran gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          id: "Penarikan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/918kiss/:userId/withdraw",
  authenticateAdminToken,
  async (req, res) => {
    let formattedWithdrawAmount = 0;
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

      if (!user.kiss918GameID) {
        return res.status(200).json({
          success: false,
          message: {
            en: "918KISS: Game account not registered. Please register an account first to proceed.",
            zh: "918KISS: 游戏账户未注册。请先注册账户以继续。",
            ms: "918KISS: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
            zh_hk: "918KISS: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
            id: "918KISS: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
          },
        });
      }

      const { transferAmount } = req.body;
      formattedWithdrawAmount = roundToTwoDecimals(transferAmount);

      if (isNaN(formattedWithdrawAmount) || formattedWithdrawAmount <= 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Withdrawal amount must be a positive number greater than 0.",
            zh: "提款金额必须为正数且大于0。",
            ms: "Jumlah pengeluaran mestilah nombor positif dan lebih besar daripada 0.",
            zh_hk: "提款金額必須為正數且大於0。",
            id: "Jumlah penarikan harus berupa angka positif dan lebih besar dari 0.",
          },
        });
      }

      const withdrawResponse = await kiss918Withdraw(
        user,
        formattedWithdrawAmount
      );

      if (!withdrawResponse.success) {
        console.error("918KISS: Withdraw failed -", withdrawResponse.error);

        if (withdrawResponse.error.error.code === "37123") {
          return res.status(200).json({
            success: false,
            message: {
              en: "Insufficient game balance to complete withdrawal.",
              zh: "游戏余额不足，无法完成提款。",
              ms: "Baki permainan tidak mencukupi untuk melengkapkan pengeluaran.",
              zh_hk: "遊戲餘額不足，無法完成提款。",
              id: "Saldo permainan tidak mencukupi untuk menyelesaikan penarikan.",
            },
          });
        }

        return res.status(200).json({
          success: false,
          message: {
            en: "Withdrawal failed. Please try again or contact customer service for assistance.",
            zh: "提款失败。请重试或联系客服以获取帮助。",
            zh_hk: "提款失敗。請重試或聯絡客服以獲取幫助。",
            ms: "Pengeluaran gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            id: "Penarikan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      const updatedUser = await User.findOneAndUpdate(
        {
          _id: user._id,
        },
        {
          $inc: { wallet: formattedWithdrawAmount },
        },
        { new: true, projection: { wallet: 1, _id: 1 } }
      ).lean();

      try {
        const gameBalance = await kiss918CheckBalance(user);

        await GameWalletLogAttempt(
          user.username,
          "Transfer Out",
          "Transfer",
          roundToTwoDecimals(formattedWithdrawAmount),
          "918KISS",
          roundToTwoDecimals(gameBalance?.balance ?? 0),
          roundToTwoDecimals(user.wallet),
          roundToTwoDecimals(updatedUser.wallet)
        );
      } catch (logError) {
        console.error("918KISS: Failed to log transaction:", logError.message);
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "Withdrawal completed successfully.",
          zh: "提款成功完成。",
          ms: "Pengeluaran berjaya diselesaikan.",
          zh_hk: "提款成功完成。",
          id: "Penarikan berhasil diselesaikan.",
        },
      });
    } catch (error) {
      console.log("918KISS error in transferout", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "Withdrawal failed. Please try again or contact customer service for assistance.",
          zh: "提款失败。请重试或联系客服以获取帮助。",
          zh_hk: "提款失敗。請重試或聯絡客服以獲取幫助。",
          ms: "Pengeluaran gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          id: "Penarikan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/918kiss/deposit/:userId",
  authenticateAdminToken,
  async (req, res) => {
    let formattedDepositAmount = 0;
    let user = null;
    let walletDeducted = false;
    try {
      const userId = req.params.userId;
      user = await User.findById(userId);

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

      if (!user.kiss918GameID) {
        return res.status(200).json({
          success: false,
          message: {
            en: "918KISS: Game account not registered. Please register an account first to proceed.",
            zh: "918KISS: 游戏账户未注册。请先注册账户以继续。",
            ms: "918KISS: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
            zh_hk: "918KISS: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
            id: "918KISS: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
          },
        });
      }

      const { transferAmount } = req.body;
      formattedDepositAmount = roundToTwoDecimals(transferAmount);

      if (isNaN(formattedDepositAmount) || formattedDepositAmount <= 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Deposit amount must be a positive number greater than 0.",
            zh: "存款金额必须为正数且大于0。",
            ms: "Jumlah deposit mestilah nombor positif dan lebih besar daripada 0.",
            zh_hk: "存款金額必須為正數且大於0。",
            id: "Jumlah deposit harus berupa angka positif dan lebih besar dari 0.",
          },
        });
      }

      const updatedUser = await User.findOneAndUpdate(
        {
          _id: user._id,
          wallet: { $gte: formattedDepositAmount },
        },
        {
          $inc: { wallet: -formattedDepositAmount },
        },
        { new: true, projection: { wallet: 1, _id: 1 } }
      ).lean();

      if (!updatedUser) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Insufficient balance to complete the transaction.",
            zh: "余额不足，无法完成交易。",
            ms: "Baki tidak mencukupi untuk melengkapkan transaksi.",
            zh_hk: "餘額不足，無法完成交易。",
            id: "Saldo tidak mencukupi untuk menyelesaikan transaksi.",
          },
        });
      }

      walletDeducted = true;

      const depositResponse = await kiss918Deposit(
        user,
        formattedDepositAmount
      );

      if (!depositResponse.success) {
        await User.findByIdAndUpdate(user._id, {
          $inc: { wallet: formattedDepositAmount },
        });
        walletDeducted = false;

        console.error("918KISS: Deposit failed -", depositResponse.error);

        return res.status(200).json({
          success: false,
          message: {
            en: "918KISS: Deposit failed. Please try again or contact customer support for further assistance.",
            zh: "918KISS: 存款失败。请重试或联系客服寻求进一步帮助。",
            ms: "918KISS: Deposit gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
            zh_hk: "918KISS: 存款失敗。請重試或聯絡客服尋求進一步協助。",
            id: "918KISS: Deposit gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
          },
        });
      }

      try {
        const gameBalance = await kiss918CheckBalance(user);

        await GameWalletLogAttempt(
          user.username,
          "Transfer In",
          "Transfer",
          roundToTwoDecimals(formattedDepositAmount),
          "918KISS",
          roundToTwoDecimals(gameBalance?.balance ?? 0),
          roundToTwoDecimals(user.wallet),
          roundToTwoDecimals(updatedUser.wallet)
        );
      } catch (logError) {
        console.error("918KISS: Failed to log transaction:", logError.message);
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "Deposit completed successfully.",
          zh: "存款成功完成。",
          ms: "Deposit berjaya diselesaikan.",
          zh_hk: "存款成功完成。",
          id: "Deposit berhasil diselesaikan.",
        },
      });
    } catch (error) {
      console.log("918KISS error in deposit", error.message);

      if (walletDeducted && user) {
        try {
          await User.findByIdAndUpdate(user._id, {
            $inc: { wallet: formattedDepositAmount },
          });
          console.log("918KISS: Wallet rollback successful");
        } catch (rollbackError) {
          console.error(
            "918KISS: CRITICAL - Rollback failed:",
            rollbackError.message
          );
        }
      }

      return res.status(200).json({
        success: false,
        message: {
          en: "918KISS: Deposit failed. Please try again or contact customer support for further assistance.",
          zh: "918KISS: 存款失败。请重试或联系客服寻求进一步帮助。",
          ms: "918KISS: Deposit gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
          zh_hk: "918KISS: 存款失敗。請重試或聯絡客服尋求進一步協助。",
          id: "918KISS: Deposit gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/918kiss/setAsMain",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { selectedGameId, selectedPassword } = req.body;

      if (!selectedGameId || !selectedPassword) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Game ID and password are required.",
            zh: "游戏ID和密码为必填项。",
            zh_hk: "遊戲ID和密碼為必填項。",
            ms: "ID permainan dan kata laluan diperlukan.",
            id: "ID permainan dan kata sandi diperlukan.",
          },
        });
      }

      const user = await User.findOne({
        pastKiss918GameID: selectedGameId,
      }).lean();

      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found. Please try again or contact customer service for assistance.",
            zh: "用户未找到，请重试或联系客服以获取帮助。",
            zh_hk: "用戶未找到，請重試或聯絡客服以獲取幫助。",
            ms: "Pengguna tidak ditemui, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      const indexToRemove = user.pastKiss918GameID.indexOf(selectedGameId);

      let newPastGameIDs = [...user.pastKiss918GameID];
      let newPastGamePWs = [...user.pastKiss918GamePW];

      if (indexToRemove > -1) {
        newPastGameIDs.splice(indexToRemove, 1);
        newPastGamePWs.splice(indexToRemove, 1);
      }

      if (user.kiss918GameID && user.kiss918GamePW) {
        newPastGameIDs.push(user.kiss918GameID);
        newPastGamePWs.push(user.kiss918GamePW);
      }

      await User.findByIdAndUpdate(user._id, {
        $set: {
          kiss918GameID: selectedGameId,
          kiss918GamePW: selectedPassword,
          pastKiss918GameID: newPastGameIDs,
          pastKiss918GamePW: newPastGamePWs,
        },
      });

      return res.status(200).json({
        success: true,
        message: {
          en: "918KISS ID and password set as main successfully.",
          zh: "918KISS账号和密码已成功设置为主账号。",
          zh_hk: "918KISS帳號和密碼已成功設置為主帳號。",
          ms: "ID dan kata laluan 918KISS berjaya ditetapkan sebagai utama.",
          id: "ID dan kata sandi 918KISS berhasil ditetapkan sebagai utama.",
        },
      });
    } catch (error) {
      console.error("Error occurred while setting main 918KISS ID:", error);
      return res.status(200).json({
        success: false,
        message: {
          en: "Internal server error. Please try again later.",
          zh: "内部服务器错误，请稍后再试。",
          zh_hk: "內部伺服器錯誤，請稍後再試。",
          ms: "Ralat pelayan dalaman. Sila cuba lagi nanti.",
          id: "Kesalahan server internal. Silakan coba lagi nanti.",
        },
      });
    }
  }
);

// router.post("/api/918kiss/getturnoverforrebate", async (req, res) => {
//   try {
//     const { date } = req.body;

//     let startDate, endDate;
//     if (date === "today") {
//       startDate = moment
//         .utc()
//         .add(8, "hours")
//         .startOf("day")
//         .subtract(8, "hours")
//         .format("YYYY-MM-DD");
//       endDate = moment
//         .utc()
//         .add(8, "hours")
//         .endOf("day")
//         .subtract(8, "hours")
//         .format("YYYY-MM-DD");
//     } else if (date === "yesterday") {
//       startDate = moment
//         .utc()
//         .add(8, "hours")
//         .subtract(1, "days")
//         .startOf("day")
//         .subtract(8, "hours")
//         .format("YYYY-MM-DD");

//       endDate = moment
//         .utc()
//         .add(8, "hours")
//         .subtract(1, "days")
//         .endOf("day")
//         .subtract(8, "hours")
//         .format("YYYY-MM-DD");
//     }

//     console.log("918KISS QUERYING TIME", startDate, endDate);

//     const gameID = "01854540936";

//     const hashString = `${kiss918AgentId}${gameID}${kiss918Provider}${endDate}${kiss918Secret}`;
//     const digest = generateMD5Hash(hashString);

//     const payload = {
//       agentID: kiss918AgentId,
//       playerID: gameID,
//       provider: kiss918Provider,
//       date: endDate,
//       secretKey: kiss918Secret,
//       hash: digest,
//     };

//     const response = await axios.post(
//       `${kiss918APIURL}player/game_record/`,
//       payload,
//       {
//         headers: {
//           "Content-Type": "application/json",
//           Accept: "application/json",
//         },
//         maxRedirects: 0,
//       }
//     );

//     console.log(response.data);
//     return;
//     const records = await slot918KissModal.find({
//       betTime: {
//         $gte: startDate,
//         $lt: endDate,
//       },
//     });

//     let playerSummary = {};

//     records.forEach((record) => {
//       const username = record.username;

//       if (!playerSummary[username]) {
//         playerSummary[username] = { turnover: 0, winloss: 0 };
//       }

//       playerSummary[username].turnover += record.betamount || 0;

//       playerSummary[username].winloss +=
//         (record.settleamount || 0) - (record.betamount || 0);
//     });

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
//         gamename: "918KISS",
//         gamecategory: "Slot Games",
//         users: playerSummary,
//       },
//     });
//   } catch (error) {
//     console.log("918KISS: Failed to fetch win/loss report:", error.message);
//     return res.status(500).json({
//       success: false,
//       message: {
//         en: "918KISS: Failed to fetch win/loss report",
//         zh: "918KISS: 获取盈亏报告失败",
//       },
//     });
//   }
// });

router.post("/api/918kiss/getturnoverforrebate", async (req, res) => {
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

    console.log("918KISS QUERYING TIME", startDate, endDate);

    const records = await slot918KissModal.find({
      betTime: {
        $gte: startDate,
        $lt: endDate,
      },
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

      if (!actualUsername) {
        console.warn(`918KISS User not found for gameId: ${gameId}`);
        return;
      }
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
    return res.status(200).json({
      success: true,
      summary: {
        gamename: "918KISS",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("918KISS: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "918KISS: Failed to fetch win/loss report",
        zh: "918KISS: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/918kiss/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await slot918KissModal.find({
        username: user.gameId,
        betTime: {
          $gte: startDate,
          $lt: endDate,
        },
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
          gamename: "918KISS",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("918KISS: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "918KISS: Failed to fetch win/loss report",
          zh: "918KISS: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/918kiss/:userId/gamedata",
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
          gameCategories["Slot Games"] &&
          gameCategories["Slot Games"] instanceof Map
        ) {
          const slotGames = Object.fromEntries(gameCategories["Slot Games"]);

          if (slotGames["918KISS"]) {
            totalTurnover += slotGames["918KISS"].turnover || 0;
            totalWinLoss += slotGames["918KISS"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "918KISS",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("918KISS: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "918KISS: Failed to fetch win/loss report",
          zh: "918KISS: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/918kiss/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await slot918KissModal.find({
        betTime: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
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
          gamename: "918KISS",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("918KISS: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "918KISS: Failed to fetch win/loss report",
          zh: "918KISS: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/918kiss/kioskreport",
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

          if (liveCasino["918KISS"]) {
            totalTurnover += Number(liveCasino["918KISS"].turnover || 0);
            totalWinLoss += Number(liveCasino["918KISS"].winloss || 0);
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "918KISS",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("918KISS: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "918KISS: Failed to fetch win/loss report",
          zh: "918KISS: 获取盈亏报告失败",
        },
      });
    }
  }
);

async function fetch918KissGameRecords(user, date) {
  try {
    if (!user.kiss918GameID) {
      return {
        success: false,
        error: "User does not have 918KISS game ID",
        recordsSaved: 0,
      };
    }

    const formattedDate = moment(date).format("YYYY-MM-DD");
    const hashString = `${kiss918AgentId}${user.kiss918GameID}${kiss918Provider}${formattedDate}${kiss918Secret}`;
    const digest = generateMD5Hash(hashString.toLowerCase());

    const payload = {
      agentID: kiss918AgentId,
      playerID: user.kiss918GameID,
      provider: kiss918Provider,
      date: formattedDate,
      secretKey: kiss918Secret,
      hash: digest,
    };

    console.log(
      `📡 Fetching 918KISS records for ${user.username} (${user.kiss918GameID}) - Date: ${formattedDate}`
    );

    const response = await axios.post(
      `${kiss918APIURL}player/game_record/`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        maxRedirects: 0,
      }
    );

    if (response.data.error !== 0 && response.data.code !== 0) {
      return {
        success: false,
        error: response.data.message || "API returned error",
        recordsSaved: 0,
      };
    }

    const records = response.data.result || [];

    if (records.length === 0) {
      console.log(`   ℹ️  No records found for ${user.username}`);
      return {
        success: true,
        recordsSaved: 0,
        skipped: 0,
      };
    }

    const cutoffTime = moment.tz("Asia/Kuala_Lumpur").subtract(24, "hours");

    let savedCount = 0;
    let skippedCount = 0;
    let duplicateCount = 0;

    for (const record of records) {
      try {
        const betTimeUTC8 = moment.tz(
          record.CreateTime,
          "YYYY-MM-DD HH:mm:ss",
          "Asia/Kuala_Lumpur"
        );
        const betTimeUTC = betTimeUTC8.utc().toDate();
        // Skip if bet is older than 24 hours
        if (betTimeUTC8.isBefore(cutoffTime)) {
          skippedCount++;
          continue;
        }

        // Check if betId (uuid) already exists
        const existingBet = await slot918KissModal.findOne({
          betId: record.uuid,
        });
        if (existingBet) {
          duplicateCount++;
          continue;
        }

        const newRecord = new slot918KissModal({
          betId: record.uuid,
          betamount: parseFloat(record.bet) || 0,
          settleamount: parseFloat(record.Win) || 0,
          username: user.gameId,
          bet: true,
          settle: true,
          betTime: betTimeUTC,
        });

        await newRecord.save();
        savedCount++;
      } catch (err) {
        console.error(`   ❌ Error saving record ${record.uuid}:`, err.message);
      }
    }

    return {
      success: true,
      recordsSaved: savedCount,
      skipped: skippedCount,
      duplicates: duplicateCount,
      totalRecords: records.length,
    };
  } catch (error) {
    console.error(
      `   ❌ Error fetching records for ${user.username}:`,
      error.message
    );
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      recordsSaved: 0,
    };
  }
}

async function sync918KissGameRecords(daysBack = 5) {
  try {
    const startTime = Date.now();

    const endDate = moment.utc();
    const startDate = moment.utc().subtract(daysBack, "days");

    // Find users who have deposit/withdraw in 918KISS in the last N days
    const gameWalletLogs = await GameWalletLog.find({
      gamename: { $regex: /^918kiss$/i },
      remark: "Transfer",
      createdAt: { $gte: startDate.toDate() },
    })
      .select("username")
      .lean();

    // Get unique usernames
    const uniqueUsernames = [
      ...new Set(gameWalletLogs.map((log) => log.username)),
    ];

    if (uniqueUsernames.length === 0) {
      console.log("ℹ️  No active 918KISS players found");
      return {
        success: true,
        totalPlayers: 0,
        totalRecordsSaved: 0,
      };
    }

    // Get user details with kiss918GameID
    const users = await User.find({
      username: { $in: uniqueUsernames },
      kiss918GameID: { $exists: true, $ne: null },
    })
      .select("username kiss918GameID gameId")
      .lean();

    // Sync records for each user for each date
    const results = {
      totalPlayers: users.length,
      totalRecordsSaved: 0,
      totalSkipped: 0,
      totalDuplicates: 0,
      successfulPlayers: 0,
      failedPlayers: 0,
      errors: [],
    };

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      console.log(`[${i + 1}/${users.length}] Processing ${user.username}...`);

      let playerSuccess = false;
      let playerRecordsSaved = 0;

      // Fetch records for each date in the range
      for (
        let date = moment(endDate);
        date.isSameOrAfter(startDate, "day");
        date.subtract(1, "day")
      ) {
        try {
          const result = await fetch918KissGameRecords(user, date.toDate());

          if (result.success) {
            playerSuccess = true;
            playerRecordsSaved += result.recordsSaved;
            results.totalRecordsSaved += result.recordsSaved;
            results.totalSkipped += result.skipped || 0;
            results.totalDuplicates += result.duplicates || 0;
          } else {
            results.errors.push({
              username: user.username,
              date: date.format("YYYY-MM-DD"),
              error: result.error,
            });
          }

          // Add 100ms delay between API calls
          if (i < users.length - 1 || !date.isSame(startDate, "day")) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error(
            `   ❌ Error for ${user.username} on ${date.format("YYYY-MM-DD")}:`,
            error.message
          );
          results.errors.push({
            username: user.username,
            date: date.format("YYYY-MM-DD"),
            error: error.message,
          });
        }
      }

      if (playerSuccess && playerRecordsSaved > 0) {
        results.successfulPlayers++;
      } else if (!playerSuccess) {
        results.failedPlayers++;
      }

      console.log(
        `   📊 Total saved for ${user.username}: ${playerRecordsSaved} records\n`
      );
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log("=".repeat(70));
    console.log("📊 918KISS SYNC SUMMARY");
    console.log("=".repeat(70));
    console.log(`⏱️  Duration:              ${duration}s`);
    console.log(`👥 Total Players:         ${results.totalPlayers}`);
    console.log(`✅ Successful Players:    ${results.successfulPlayers}`);
    console.log(`❌ Failed Players:        ${results.failedPlayers}`);
    console.log(`💾 Total Records Saved:   ${results.totalRecordsSaved}`);
    console.log(`⏭️  Skipped (old):         ${results.totalSkipped}`);
    console.log(`🔄 Duplicates:            ${results.totalDuplicates}`);
    console.log(`⚠️  Errors:                ${results.errors.length}`);
    console.log("=".repeat(70) + "\n");

    return {
      success: true,
      ...results,
      duration,
    };
  } catch (error) {
    console.error("❌ Sync error:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = router;
module.exports.kiss918CheckBalance = kiss918CheckBalance;
module.exports.sync918KissGameRecords = sync918KissGameRecords;
module.exports.kiss918Withdraw = kiss918Withdraw;
