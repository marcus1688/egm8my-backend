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

module.exports = router;
module.exports.kiss918CheckBalance = kiss918CheckBalance;
