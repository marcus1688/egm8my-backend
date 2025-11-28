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
const slotMega888Modal = require("../../models/slot_mega888.model");
require("dotenv").config();

//Staging
const mega888Secret = process.env.MEGA888_SECRET;
const mega888AgentId = "Mega1-6123";
const mega888SN = "ld00";
const webURL = "https://www.bm8my.vip/";
const mega888APIURL = "https://mgapi-ali.yidaiyiluclub.com/mega-cloud/api/";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateRandomPassword() {
  const randomNumber = crypto.randomInt(1000, 10000);

  return `bm8${randomNumber}`;
}

function generateMD5Hash(data) {
  return crypto.createHash("md5").update(data).digest("hex");
}

function buildParams(postData, method) {
  return {
    jsonrpc: "2.0",
    method: method,
    params: postData,
    id: uuidv4(),
  };
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

const mega888RegisterUser = async (user) => {
  try {
    const randomPass = generateRandomPassword();
    const random = String(Date.now());
    const digest = generateMD5Hash(random + mega888SN + mega888Secret);

    const payload = buildParams(
      {
        nickname: user.username,
        sn: mega888SN,
        agentLoginId: mega888AgentId,
        random: random,
        digest: digest,
      },
      "open.mega.user.create"
    );

    const response = await axios.post(mega888APIURL, payload);

    if (response.data && response.data.result && response.data.result.success) {
      const generatedLoginId = response.data.result.loginId;

      const updateFields = {
        $set: {
          mega888GameID: generatedLoginId,
          mega888GamePW: randomPass,
        },
      };

      if (user.mega888GameID && user.mega888GamePW) {
        updateFields.$push = {
          pastMega888GameID: user.mega888GameID,
          pastMega888GamePW: user.mega888GamePW,
        };
      }

      await User.findByIdAndUpdate(user._id, updateFields, { new: true });

      return {
        success: true,
        userData: {
          userId: generatedLoginId,
          password: randomPass,
        },
      };
    } else {
      console.log(response.data, "MEGA888 Registration Failed");
      return {
        success: false,
        error: response.data,
      };
    }
  } catch (error) {
    console.log("MEGA888 error in registering user", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

const mega888CheckBalance = async (user) => {
  try {
    if (!user.mega888GameID) {
      return {
        success: true,
        balance: 0,
      };
    }

    const random = String(Date.now());
    const digest = generateMD5Hash(
      random + mega888SN + user.mega888GameID + mega888Secret
    );

    const payload = buildParams(
      {
        loginId: user.mega888GameID,
        sn: mega888SN,
        random: random,
        digest: digest,
      },
      "open.mega.balance.get"
    );
    const response = await axios.post(mega888APIURL, payload);

    return {
      success: !response.data.error,
      balance: response.data.result || 0,
      response: response.data,
    };
  } catch (error) {
    console.error("MEGA888 error checking user balance", error.message);
    return { success: false, balance: 0 };
  }
};

async function mega888Deposit(user, trfamount) {
  try {
    const random = String(Date.now());
    const digest = generateMD5Hash(
      random + mega888SN + user.mega888GameID + trfamount + mega888Secret
    );

    const payload = buildParams(
      {
        loginId: user.mega888GameID,
        sn: mega888SN,
        random: random,
        digest: digest,
        amount: trfamount,
      },
      "open.mega.balance.transfer"
    );

    const response = await axios.post(mega888APIURL, payload);

    if (response.data.error) {
      return {
        success: false,
        error: response.data,
      };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error("MEGA888 error in deposit:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function mega888Withdraw(user, trfamount) {
  try {
    const random = String(Date.now());
    const digest = generateMD5Hash(
      random + mega888SN + user.mega888GameID + -trfamount + mega888Secret
    );

    const payload = buildParams(
      {
        loginId: user.mega888GameID,
        sn: mega888SN,
        random: random,
        digest: digest,
        amount: -trfamount,
      },
      "open.mega.balance.transfer"
    );

    const response = await axios.post(mega888APIURL, payload);
    if (response.data.error) {
      return {
        success: false,
        error: response.data,
      };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error("MEGA888 error in withdraw:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

router.post("/api/mega888/register", authenticateToken, async (req, res) => {
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

    if (user.mega888GameID && user.mega888GamePW) {
      return res.status(200).json({
        success: true,
        message: {
          en: "MEGA888: Account registered successfully.",
          zh: "MEGA888: 账户注册成功。",
          ms: "MEGA888: Akaun berjaya didaftarkan.",
          zh_hk: "MEGA888: 帳戶註冊成功。",
          id: "MEGA888: Akun berhasil didaftarkan.",
        },
        userData: {
          userId: user.mega888GameID,
          password: user.mega888GamePW,
        },
      });
    }

    const registerResponse = await mega888RegisterUser(user);
    if (!registerResponse.success) {
      return res.status(200).json({
        success: false,
        message: {
          en: "MEGA888: Registration failed. Please try again or contact customer support for further assistance.",
          zh: "MEGA888: 注册失败。请重试或联系客服寻求进一步帮助。",
          ms: "MEGA888: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
          zh_hk: "MEGA888: 註冊失敗。請重試或聯絡客服尋求進一步協助。",
          id: "MEGA888: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: {
        en: "MEGA888: Account registered successfully.",
        zh: "MEGA888: 账户注册成功。",
        ms: "MEGA888: Akaun berjaya didaftarkan.",
        zh_hk: "MEGA888: 帳戶註冊成功。",
        id: "MEGA888: Akun berhasil didaftarkan.",
      },
      userData: {
        userId: registerResponse.userData.userId,
        password: registerResponse.userData.password,
      },
    });
  } catch (error) {
    console.log("MEGA888 error in registering user", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "MEGA888: Registration failed. Please try again or contact customer support for assistance.",
        zh: "MEGA888: 注册失败。请重试或联系客服寻求帮助。",
        ms: "MEGA888: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
        zh_hk: "MEGA888: 註冊失敗。請重試或聯絡客服尋求協助。",
        id: "MEGA888: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/admin/api/mega888/:userId/registeradmin",
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

      const registerResponse = await mega888RegisterUser(user);
      if (!registerResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "MEGA888: Registration failed. Please try again or contact customer support for further assistance.",
            zh: "MEGA888: 注册失败。请重试或联系客服寻求进一步帮助。",
            ms: "MEGA888: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
            zh_hk: "MEGA888: 註冊失敗。請重試或聯絡客服尋求進一步協助。",
            id: "MEGA888: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "MEGA888: Account registered successfully.",
          zh: "MEGA888: 账户注册成功。",
          ms: "MEGA888: Akaun berjaya didaftarkan.",
          zh_hk: "MEGA888: 帳戶註冊成功。",
          id: "MEGA888: Akun berhasil didaftarkan.",
        },
        userData: {
          userId: registerResponse.userData.userId,
          password: registerResponse.userData.password,
        },
      });
    } catch (error) {
      console.log("MEGA888 error in registering user", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "MEGA888: Registration failed. Please try again or contact customer support for assistance.",
          zh: "MEGA888: 注册失败。请重试或联系客服寻求帮助。",
          ms: "MEGA888: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
          zh_hk: "MEGA888: 註冊失敗。請重試或聯絡客服尋求協助。",
          id: "MEGA888: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/mega888/:userId/checkbalance",
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

      const balanceResponse = await mega888CheckBalance(user);

      if (!balanceResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "MEGA888: Failed to retrieve balance. Please try again.",
            zh: "MEGA888: 获取余额失败。请重试。",
            ms: "MEGA888: Gagal mendapatkan baki. Sila cuba lagi.",
            zh_hk: "MEGA888: 獲取餘額失敗。請重試。",
            id: "MEGA888: Gagal mengambil saldo. Silakan coba lagi.",
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
      console.error("MEGA888 error checking user balance", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "MEGA888: Failed to retrieve balance. Please try again.",
          zh: "MEGA888: 获取余额失败。请重试。",
          ms: "MEGA888: Gagal mendapatkan baki. Sila cuba lagi.",
          zh_hk: "MEGA888: 獲取餘額失敗。請重試。",
          id: "MEGA888: Gagal mengambil saldo. Silakan coba lagi.",
        },
      });
    }
  }
);

router.post(
  "/api/mega888/checkbalance",
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
      const balanceResponse = await mega888CheckBalance(user);

      if (!balanceResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "MEGA888: Failed to retrieve balance. Please try again.",
            zh: "MEGA888: 获取余额失败。请重试。",
            ms: "MEGA888: Gagal mendapatkan baki. Sila cuba lagi.",
            zh_hk: "MEGA888: 獲取餘額失敗。請重試。",
            id: "MEGA888: Gagal mengambil saldo. Silakan coba lagi.",
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
      console.error("MEGA888 error checking user balance", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "MEGA888: Failed to retrieve balance. Please try again.",
          zh: "MEGA888: 获取余额失败。请重试。",
          ms: "MEGA888: Gagal mendapatkan baki. Sila cuba lagi.",
          zh_hk: "MEGA888: 獲取餘額失敗。請重試。",
          id: "MEGA888: Gagal mengambil saldo. Silakan coba lagi.",
        },
      });
    }
  }
);

router.post("/api/mega888/deposit", authenticateToken, async (req, res) => {
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

    if (!user.mega888GameID) {
      return res.status(200).json({
        success: false,
        message: {
          en: "MEGA888: Game account not registered. Please register an account first to proceed.",
          zh: "MEGA888: 游戏账户未注册。请先注册账户以继续。",
          ms: "MEGA888: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
          zh_hk: "MEGA888: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
          id: "MEGA888: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
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

    if (user.gameStatus.mega888.transferInStatus) {
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

    const depositResponse = await mega888Deposit(user, formattedDepositAmount);

    if (!depositResponse.success) {
      await User.findByIdAndUpdate(user._id, {
        $inc: { wallet: formattedDepositAmount },
      });
      walletDeducted = false;

      console.error("MEGA888: Deposit failed -", depositResponse.error);

      return res.status(200).json({
        success: false,
        message: {
          en: "MEGA888: Deposit failed. Please try again or contact customer support for further assistance.",
          zh: "MEGA888: 存款失败。请重试或联系客服寻求进一步帮助。",
          ms: "MEGA888: Deposit gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
          zh_hk: "MEGA888: 存款失敗。請重試或聯絡客服尋求進一步協助。",
          id: "MEGA888: Deposit gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }

    try {
      const gameBalance = await mega888CheckBalance(user);

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Transfer",
        roundToTwoDecimals(formattedDepositAmount),
        "MEGA888",
        roundToTwoDecimals(gameBalance?.balance ?? 0),
        roundToTwoDecimals(user.wallet),
        roundToTwoDecimals(updatedUser.wallet)
      );
    } catch (logError) {
      console.error("MEGA888: Failed to log transaction:", logError.message);
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
    console.log("MEGA888 error in deposit", error.message);

    if (walletDeducted && user) {
      try {
        await User.findByIdAndUpdate(user._id, {
          $inc: { wallet: formattedDepositAmount },
        });
        console.log("MEGA888: Wallet rollback successful");
      } catch (rollbackError) {
        console.error(
          "MEGA888: CRITICAL - Rollback failed:",
          rollbackError.message
        );
      }
    }

    return res.status(200).json({
      success: false,
      message: {
        en: "MEGA888: Deposit failed. Please try again or contact customer support for further assistance.",
        zh: "MEGA888: 存款失败。请重试或联系客服寻求进一步帮助。",
        ms: "MEGA888: Deposit gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
        zh_hk: "MEGA888: 存款失敗。請重試或聯絡客服尋求進一步協助。",
        id: "MEGA888: Deposit gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
      },
    });
  }
});

router.post("/api/mega888/withdraw", authenticateToken, async (req, res) => {
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

    if (!user.mega888GameID) {
      return res.status(200).json({
        success: false,
        message: {
          en: "MEGA888: Game account not registered. Please register an account first to proceed.",
          zh: "MEGA888: 游戏账户未注册。请先注册账户以继续。",
          ms: "MEGA888: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
          zh_hk: "MEGA888: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
          id: "MEGA888: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
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

    if (user.gameStatus.mega888.transferOutStatus) {
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

    const withdrawResponse = await mega888Withdraw(
      user,
      formattedWithdrawAmount
    );

    if (!withdrawResponse.success) {
      console.error("MEGA888: Withdraw failed -", withdrawResponse.error);

      if (withdrawResponse.error.error.code === "37123") {
        return res.status(200).json({
          success: false,
          message: {
            en: "MEGA888: Insufficient game balance to complete withdrawal.",
            zh: "MEGA888: 游戏余额不足，无法完成提款。",
            ms: "MEGA888: Baki permainan tidak mencukupi untuk melengkapkan pengeluaran.",
            zh_hk: "MEGA888: 遊戲餘額不足，無法完成提款。",
            id: "MEGA888: Saldo permainan tidak mencukupi untuk menyelesaikan penarikan.",
          },
        });
      }

      return res.status(200).json({
        success: false,
        message: {
          en: "MEGA888: Withdrawal failed. Please try again or contact customer support for further assistance.",
          zh: "MEGA888: 提款失败。请重试或联系客服寻求进一步帮助。",
          ms: "MEGA888: Pengeluaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
          zh_hk: "MEGA888: 提款失敗。請重試或聯絡客服尋求進一步協助。",
          id: "MEGA888: Penarikan gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
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
      const gameBalance = await mega888CheckBalance(user);

      await GameWalletLogAttempt(
        user.username,
        "Transfer Out",
        "Transfer",
        roundToTwoDecimals(formattedWithdrawAmount),
        "MEGA888",
        roundToTwoDecimals(gameBalance?.balance ?? 0),
        roundToTwoDecimals(user.wallet),
        roundToTwoDecimals(updatedUser.wallet)
      );
    } catch (logError) {
      console.error("MEGA888: Failed to log transaction:", logError.message);
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
    console.log("MEGA888 error in withdraw", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "MEGA888: Withdrawal failed. Please try again or contact customer support for further assistance.",
        zh: "MEGA888: 提款失败。请重试或联系客服寻求进一步帮助。",
        ms: "MEGA888: Pengeluaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
        zh_hk: "MEGA888: 提款失敗。請重試或聯絡客服尋求進一步協助。",
        id: "MEGA888: Penarikan gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
      },
    });
  }
});

router.post(
  "/admin/api/mega888/:userId/withdrawall",
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

      if (!user.mega888GameID) {
        return res.status(200).json({
          success: false,
          message: {
            en: "MEGA888: Game account not registered. Please register an account first to proceed.",
            zh: "MEGA888: 游戏账户未注册。请先注册账户以继续。",
            ms: "MEGA888: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
            zh_hk: "MEGA888: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
            id: "MEGA888: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
          },
        });
      }

      const gameBalance = await mega888CheckBalance(user);

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

      const withdrawResponse = await mega888Withdraw(user, gameBalance.balance);

      if (!withdrawResponse.success) {
        console.log("mega888 withdrw fail", withdrawResponse);

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
        "MEGA888",
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
      console.log("MEGA888 error in transferout", error.message);
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
  "/admin/api/mega888/:userId/withdraw",
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

      if (!user.mega888GameID) {
        return res.status(200).json({
          success: false,
          message: {
            en: "MEGA888: Game account not registered. Please register an account first to proceed.",
            zh: "MEGA888: 游戏账户未注册。请先注册账户以继续。",
            ms: "MEGA888: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
            zh_hk: "MEGA888: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
            id: "MEGA888: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
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

      const withdrawResponse = await mega888Withdraw(
        user,
        formattedWithdrawAmount
      );

      if (!withdrawResponse.success) {
        console.error("MEGA888: Withdraw failed -", withdrawResponse.error);

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
        const gameBalance = await mega888CheckBalance(user);

        await GameWalletLogAttempt(
          user.username,
          "Transfer Out",
          "Transfer",
          roundToTwoDecimals(formattedWithdrawAmount),
          "MEGA888",
          roundToTwoDecimals(gameBalance?.balance ?? 0),
          roundToTwoDecimals(user.wallet),
          roundToTwoDecimals(updatedUser.wallet)
        );
      } catch (logError) {
        console.error("MEGA888: Failed to log transaction:", logError.message);
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
      console.log("MEGA888 error in transferout", error.message);
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
  "/admin/api/mega888/setAsMain",
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
        pastMega888GameID: selectedGameId,
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

      const indexToRemove = user.pastMega888GameID.indexOf(selectedGameId);

      let newPastGameIDs = [...user.pastMega888GameID];
      let newPastGamePWs = [...user.pastMega888GamePW];

      if (indexToRemove > -1) {
        newPastGameIDs.splice(indexToRemove, 1);
        newPastGamePWs.splice(indexToRemove, 1);
      }

      if (user.mega888GameID && user.mega888GamePW) {
        newPastGameIDs.push(user.mega888GameID);
        newPastGamePWs.push(user.mega888GamePW);
      }

      await User.findByIdAndUpdate(user._id, {
        $set: {
          mega888GameID: selectedGameId,
          mega888GamePW: selectedPassword,
          pastMega888GameID: newPastGameIDs,
          pastMega888GamePW: newPastGamePWs,
        },
      });

      return res.status(200).json({
        success: true,
        message: {
          en: "MEGA888 ID and password set as main successfully.",
          zh: "MEGA888账号和密码已成功设置为主账号。",
          zh_hk: "MEGA888帳號和密碼已成功設置為主帳號。",
          ms: "ID dan kata laluan MEGA888 berjaya ditetapkan sebagai utama.",
          id: "ID dan kata sandi MEGA888 berhasil ditetapkan sebagai utama.",
        },
      });
    } catch (error) {
      console.error("Error occurred while setting main MEGA888 ID:", error);
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

router.post("/api/mega888/getturnoverforrebate", async (req, res) => {
  const today = moment.utc().add(8, "hours").format("YYYY-MM-DD");
  const yesterday = moment
    .utc()
    .add(8, "hours")
    .subtract(1, "days")
    .format("YYYY-MM-DD");

  const { date } = req.body;
  let start, end;

  if (date === "today") {
    start = moment(today)
      .utc()
      .add(8, "hours")
      .startOf("day")
      .format("YYYY-MM-DD HH:mm:ss");
    end = moment(today)
      .utc()
      .add(8, "hours")
      .endOf("day")
      .format("YYYY-MM-DD HH:mm:ss");
  } else if (date === "yesterday") {
    start = moment(yesterday)
      .utc()
      .add(8, "hours")
      .startOf("day")
      .format("YYYY-MM-DD HH:mm:ss");
    end = moment(yesterday)
      .utc()
      .add(8, "hours")
      .endOf("day")
      .format("YYYY-MM-DD HH:mm:ss");
  }

  const random = String(Date.now());
  // Generate digest using MD5 hash
  const digest = generateMD5Hash(
    random + mega888SN + mega888AgentId + mega888Secret
  );

  // Build request payload
  const payload = buildParams(
    {
      sn: mega888SN,
      random: random,
      agentLoginId: mega888AgentId,
      digest: digest,
      type: 1,
      startTime: start,
      endTime: end,
    },
    "open.mega.player.total.report"
  );

  try {
    const response = await axios.post(mega888APIURL, payload);
    console.log(response.data);
    if (response.data.error) {
      return res.status(500).json({
        success: false,
        error: response.data.error.message,
      });
    }

    const results = response.data.result;

    // Sum up the total turnover (bet) and win/loss
    const playerSummaries = {};

    // Loop through each result entry
    for (const entry of results) {
      const { loginId, bet, win } = entry;

      // Find the user in the database by the mega888GameId
      const user = await User.findOne({ mega888GameID: loginId });

      if (user) {
        const username = user.username;

        // If the user is not yet in the playerSummaries object, initialize their summary
        if (!playerSummaries[username]) {
          playerSummaries[username] = {
            turnover: 0,
            winloss: 0,
          };
        }

        // Update the user's turnover and win/loss
        playerSummaries[username].turnover += parseFloat(bet || 0);
        playerSummaries[username].winloss -= parseFloat(win || 0);
      }
    }

    Object.keys(playerSummaries).forEach((username) => {
      playerSummaries[username].turnover = Number(
        playerSummaries[username].turnover.toFixed(2)
      );
      playerSummaries[username].winloss = Number(
        playerSummaries[username].winloss.toFixed(2)
      );
    });

    return res.status(200).json({
      success: true,
      summary: {
        gamename: "MEGA888",
        gamecategory: "Slot Games",
        users: playerSummaries,
      },
    });
  } catch (error) {
    console.log("MEGA888: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "MEGA888: Failed to fetch win/loss report",
        zh: "MEGA888: 获取盈亏报告失败",
      },
    });
  }
});

router.get("/admin/api/mega888/:userId/dailygamedata", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.params.userId;

    // Validate inputs
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const user = await User.findById(userId, {
      username: 1,
      mega888GameID: 1,
    }).lean();

    if (!user || !user.mega888GameID) {
      return res.status(404).json({
        success: false,
        message: "User not found or no Mega888 account",
      });
    }

    const loginId = user.mega888GameID;

    // Format dates
    const start = moment
      .utc(new Date(startDate))
      .add(8, "hours")
      .format("YYYY-MM-DD HH:mm:ss");
    const end = moment
      .utc(new Date(endDate))
      .add(8, "hours")
      .format("YYYY-MM-DD HH:mm:ss");

    console.log(
      `[Mega888 Daily Data] Fetching for ${user.username} from ${start} to ${end}`
    );

    // Function to fetch a single page
    const fetchPage = async (pageIndex) => {
      const random = String(Date.now() + pageIndex);
      const digest = generateMD5Hash(
        random + mega888SN + loginId + mega888Secret
      );

      const payload = buildParams(
        {
          sn: mega888SN,
          random: random,
          loginId: loginId,
          digest: digest,
          startTime: start,
          endTime: end,
          pageIndex: pageIndex,
          pageSize: 100,
        },
        "open.mega.game.order.page"
      );
      console.log(payload);
      const response = await axios.post(mega888APIURL, payload);
      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      return response.data.result;
    };

    // Fetch first page
    const firstPage = await fetchPage(1);

    if (!firstPage?.items?.length) {
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "MEGA888",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: 0,
            winloss: 0,
          },
        },
      });
    }

    let allItems = [...firstPage.items];

    // Fetch remaining pages in parallel if multiple pages exist
    if (firstPage.hasNextPage && firstPage.totalPage > 1) {
      const totalPages = Math.min(firstPage.totalPage, 100); // Safety limit
      const pagePromises = [];

      for (let page = 2; page <= totalPages; page++) {
        pagePromises.push(fetchPage(page));
      }

      const results = await Promise.allSettled(pagePromises);

      results.forEach((result, index) => {
        if (result.status === "fulfilled" && result.value?.items?.length) {
          allItems = allItems.concat(result.value.items);
          console.log(
            `[Mega888 Daily Data] Page ${index + 2}/${totalPages} - ${
              result.value.items.length
            } items`
          );
        }
      });
    }

    // Calculate totals
    const { totalTurnover, totalWinLoss } = allItems.reduce(
      (acc, item) => ({
        totalTurnover: acc.totalTurnover + parseFloat(item.bet || 0),
        totalWinLoss:
          acc.totalWinLoss +
          parseFloat(item.win || 0) -
          parseFloat(item.bet || 0),
      }),
      { totalTurnover: 0, totalWinLoss: 0 }
    );

    return res.status(200).json({
      success: true,
      summary: {
        gamename: "MEGA888",
        gamecategory: "Slot Games",
        user: {
          username: user.username,
          turnover: Number(totalTurnover.toFixed(2)),
          winloss: Number(totalWinLoss.toFixed(2)),
        },
      },
    });
  } catch (error) {
    console.error("MEGA888: Failed to fetch daily game data:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "MEGA888: Failed to fetch daily game data",
        zh: "MEGA888: 获取每日游戏数据失败",
      },
      error: error.message,
    });
  }
});

router.get(
  "/admin/api/mega888/:userId/gamedata",
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

          if (slotGames["MEGA888"]) {
            totalTurnover += slotGames["MEGA888"].turnover || 0;
            totalWinLoss += slotGames["MEGA888"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "MEGA888",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("MEGA888: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "MEGA888: Failed to fetch win/loss report",
          zh: "MEGA888: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/mega888/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      let startD = moment.utc(new Date(startDate).toISOString());
      let endD = moment.utc(new Date(endDate).toISOString());

      const start = startD.format("YYYY-MM-DD HH:mm:ss");
      const end = endD.format("YYYY-MM-DD HH:mm:ss");

      const random = String(Date.now());

      // Generate digest using MD5 hash
      const digest = generateMD5Hash(
        random + mega888SN + mega888AgentId + mega888Secret
      );

      const payload = buildParams(
        {
          sn: mega888SN,
          random: random,
          agentLoginId: mega888AgentId,
          digest: digest,
          type: 1,
          startTime: start,
          endTime: end,
        },
        "open.mega.player.total.report"
      );
      const response = await axios.post(mega888APIURL, payload);

      if (response.data.error) {
        return res.status(500).json({
          success: false,
          error: response.data.error.message,
        });
      }

      // Calculate totals for all records
      const totals = response.data.result.reduce(
        (acc, entry) => {
          acc.turnover += parseFloat(entry.bet || 0);
          acc.winloss -= parseFloat(entry.win || 0); // Negative of win
          return acc;
        },
        { turnover: 0, winloss: 0 }
      );

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "MEGA888",
          gamecategory: "Slot Games",
          totalturnover: Number(totals.turnover.toFixed(2)),
          totalwinloss: Number(totals.winloss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("MEGA888: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "MEGA888: Failed to fetch win/loss report",
          zh: "MEGA888: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/mega888/kioskreport",
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

          if (liveCasino["MEGA888"]) {
            totalTurnover += Number(liveCasino["MEGA888"].turnover || 0);
            totalWinLoss += Number(liveCasino["MEGA888"].winloss || 0);
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "MEGA888",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("MEGA888: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "MEGA888: Failed to fetch win/loss report",
          zh: "MEGA888: 获取盈亏报告失败",
        },
      });
    }
  }
);

const fetchAndStoreMega888GameHistory = async (username) => {
  try {
    console.log(`[Mega888 Game History] Fetching for ${username}`);

    // Parallel execution - fetch user and latest record simultaneously
    const [user, latestRecord] = await Promise.all([
      User.findOne({ username }, { mega888GameID: 1 }).lean(),
      slotMega888ClaimRebateModal
        .findOne({ username })
        .sort({ startDate: -1 })
        .select("startDate")
        .lean(),
    ]);

    if (!user || !user.mega888GameID) {
      throw new Error("User not found or no Mega888 account");
    }
    const loginId = user.mega888GameID;
    const currentTime = moment().utc().add(8, "hours");

    // Calculate initial date range
    const startMoment = latestRecord?.startDate
      ? moment(latestRecord.startDate).add(1, "second")
      : moment().utc().add(8, "hours").subtract(7, "days"); // Default: last 7 days

    const endMoment = currentTime;
    if (startMoment.isSameOrAfter(endMoment)) {
      console.log(`[Mega888 Game History] No new data for ${username}`);
      return {
        success: true,
        message: "No new data to fetch",
        totalBet: 0,
        totalWin: 0,
        totalRecords: 0,
      };
    }

    // ✅ NEW: Split date range into daily chunks
    const dateChunks = [];
    let currentDate = startMoment.clone().startOf("day");
    const finalDate = endMoment.clone().endOf("day");

    while (currentDate.isBefore(finalDate)) {
      const chunkStart = currentDate.clone();
      const chunkEnd = currentDate.clone().endOf("day");

      // Don't go beyond the final end date
      if (chunkEnd.isAfter(finalDate)) {
        chunkEnd.set({
          hour: finalDate.hour(),
          minute: finalDate.minute(),
          second: finalDate.second(),
        });
      }

      dateChunks.push({
        start: chunkStart.format("YYYY-MM-DD HH:mm:ss"),
        end: chunkEnd.format("YYYY-MM-DD HH:mm:ss"),
      });

      currentDate.add(1, "day");
    }

    console.log(
      `[Mega888 Game History] Split into ${dateChunks.length} daily chunks`
    );

    // Fetch page function with delay
    const fetchPage = async (pageIndex, dateRange, addDelay = false) => {
      // Add 200ms delay before each call (except the first one)
      if (addDelay) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      const random = String(Date.now() + pageIndex);
      const digest = generateMD5Hash(
        random + mega888SN + loginId + mega888Secret
      );

      const payload = buildParams(
        {
          sn: mega888SN,
          random: random,
          loginId: loginId,
          digest: digest,
          startTime: dateRange.start,
          endTime: dateRange.end,
          pageIndex: pageIndex,
          pageSize: 100,
        },
        "open.mega.game.order.page"
      );

      const response = await axios.post(mega888APIURL, payload);
      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      return response.data.result;
    };

    // ✅ NEW: Fetch data for each date chunk
    let allItems = [];
    let totalInserted = 0;
    let totalSkipped = 0;

    for (const [index, dateChunk] of dateChunks.entries()) {
      console.log(
        `[Mega888 Game History] Processing chunk ${index + 1}/${
          dateChunks.length
        }: ${dateChunk.start} to ${dateChunk.end}`
      );

      try {
        // Fetch first page for this date range (no delay for first page)
        const firstPage = await fetchPage(1, dateChunk, false);

        if (!firstPage?.items?.length) {
          console.log(
            `[Mega888 Game History] No records for chunk ${index + 1}`
          );
          continue;
        }

        let chunkItems = [...firstPage.items];

        // If multiple pages, fetch remaining pages sequentially with delays
        if (firstPage.hasNextPage && firstPage.totalPage > 1) {
          const totalPages = Math.min(firstPage.totalPage, 100); // Safety limit

          console.log(
            `[Mega888 Game History] Chunk ${index + 1}: ${totalPages} pages`
          );

          for (let page = 2; page <= totalPages; page++) {
            try {
              const pageResult = await fetchPage(page, dateChunk, true); // addDelay = true

              if (pageResult?.items?.length) {
                chunkItems = chunkItems.concat(pageResult.items);
                console.log(
                  `[Mega888 Game History] Chunk ${
                    index + 1
                  }, Page ${page}/${totalPages} - ${
                    pageResult.items.length
                  } items`
                );
              }
            } catch (error) {
              console.error(
                `[Mega888 Game History] Chunk ${
                  index + 1
                }, Failed to fetch page ${page}:`,
                error.message
              );
              // Continue with next page
            }
          }
        }

        console.log(
          `[Mega888 Game History] Chunk ${index + 1}: Fetched ${
            chunkItems.length
          } items`
        );

        // Check for existing betIds for this chunk
        const betIds = chunkItems.map((item) => String(item.id));
        const existingBetIds = new Set(
          (
            await slotMega888ClaimRebateModal
              .find({ betId: { $in: betIds } })
              .select("betId")
              .lean()
          ).map((r) => r.betId)
        );

        // Filter and prepare new records
        const startDateObj = new Date(dateChunk.start);
        const endDateObj = new Date(dateChunk.end);

        const newRecords = chunkItems
          .filter((item) => !existingBetIds.has(String(item.id)))
          .map((item) => ({
            betId: String(item.id),
            username: username,
            betamount: parseFloat(item.bet || 0),
            settleamount: parseFloat(item.win || 0),
            bet: true,
            settle: true,
            startDate: startDateObj,
            endDate: endDateObj,
            claimed: false,

            betTime: item.CreateTime
              ? moment(item.CreateTime, "YYYY-MM-DD HH:mm:ss")
                  .subtract(8, "hours")
                  .toDate()
              : new Date(),
          }));

        console.log(
          `[Mega888 Game History] Chunk ${index + 1}: New records: ${
            newRecords.length
          }, Skipped: ${chunkItems.length - newRecords.length}`
        );

        // Batch insert new records
        if (newRecords.length > 0) {
          await slotMega888ClaimRebateModal.insertMany(newRecords, {
            ordered: false,
          });
          console.log(
            `[Mega888 Game History] Chunk ${index + 1}: Inserted ${
              newRecords.length
            } records`
          );
        }

        totalInserted += newRecords.length;
        totalSkipped += chunkItems.length - newRecords.length;

        // Add to all items for final calculation
        allItems = allItems.concat(chunkItems);

        // Add delay between chunks to avoid rate limiting
        if (index < dateChunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 200)); // 200ms delay
        }
      } catch (error) {
        console.error(
          `[Mega888 Game History] Error processing chunk ${index + 1}:`,
          error.message
        );
        // Continue with next chunk even if this one fails
        continue;
      }
    }

    console.log(
      `[Mega888 Game History] Total items fetched: ${allItems.length}`
    );

    return {
      success: true,
      username: username,
      dateRange: {
        start: startMoment.format("YYYY-MM-DD HH:mm:ss"),
        end: endMoment.format("YYYY-MM-DD HH:mm:ss"),
      },
    };
  } catch (error) {
    console.error(
      `[Mega888 Game History] Error for ${username}:`,
      error.message
    );
    throw error;
  }
};

// const syncMega888Data = async () => {
//   try {
//     console.log("[Mega888 Sync] Starting sync process...");

//     // Find the latest endDate from existing records
//     const latestRecord = await slotMega888TransferModal
//       .findOne()
//       .sort({ endDate: -1 })
//       .select("endDate")
//       .lean();

//     let startTime;
//     const currentTime = moment().utc().add(8, "hours");
//     const endTime = currentTime.format("YYYY-MM-DD HH:mm:ss");

//     if (latestRecord && latestRecord.endDate) {
//       startTime = moment(latestRecord.endDate)
//         .add(1, "second")
//         .format("YYYY-MM-DD HH:mm:ss");
//     } else {
//       startTime = moment()
//         .utc()
//         .add(8, "hours")
//         .subtract(24, "hours")
//         .format("YYYY-MM-DD HH:mm:ss");
//     }

//     if (moment(startTime).isSameOrAfter(moment(endTime))) {
//       console.log("[Mega888 Sync] No new data to sync");
//       return;
//     }

//     console.log(`[Mega888 Sync] Syncing from ${startTime} to ${endTime}`);

//     // Build API request
//     const random = String(Date.now());
//     const digest = generateMD5Hash(
//       random + mega888SN + mega888AgentId + mega888Secret
//     );

//     const payload = buildParams(
//       {
//         sn: mega888SN,
//         random: random,
//         agentLoginId: mega888AgentId,
//         digest: digest,
//         type: 1,
//         startTime: startTime,
//         endTime: endTime,
//       },
//       "open.mega.player.total.report"
//     );
//     console.log(payload);
//     // Call API
//     const response = await axios.post(mega888APIURL, payload);
//     console.log(response.data);
//     if (response.data.error) {
//       throw new Error(response.data.error.message);
//     }

//     const results = response.data.result || [];

//     if (results.length === 0) {
//       console.log("[Mega888 Sync] No new records received");
//       return;
//     }

//     console.log(`[Mega888 Sync] Processing ${results.length} records...`);

//     // Fetch all users at once for efficiency
//     const loginIds = results.map((r) => r.loginId).filter(Boolean);
//     const users = await User.find(
//       { mega888GameID: { $in: loginIds } },
//       { username: 1, mega888GameID: 1 }
//     ).lean();

//     // Create lookup map
//     const userMap = {};
//     users.forEach((user) => {
//       userMap[user.mega888GameID] = user.username;
//     });

//     // Store start and end dates
//     const startDateObj = new Date(startTime);
//     const endDateObj = new Date(endTime);

//     // Prepare bulk operations
//     const bulkOps = [];

//     for (const entry of results) {
//       const { loginId, bet, win } = entry;
//       const username = userMap[loginId];

//       if (!username) {
//         console.log(`[Mega888 Sync] User not found for loginId: ${loginId}`);
//         continue;
//       }

//       bulkOps.push({
//         updateOne: {
//           filter: {
//             username: username,
//             startDate: startDateObj,
//             endDate: endDateObj,
//           },
//           update: {
//             $set: {
//               betamount: parseFloat(bet || 0),
//               settleamount: parseFloat(-win || 0),
//               bet: true,
//               settle: true,
//               claimed: false,
//             },
//           },
//           upsert: true,
//         },
//       });
//     }

//     // Execute bulk operations
//     if (bulkOps.length > 0) {
//       const result = await slotMega888TransferModal.bulkWrite(bulkOps, {
//         ordered: false,
//       });

//       console.log(
//         `[Mega888 Sync] Successfully synced - Inserted: ${result.upsertedCount}, Updated: ${result.modifiedCount}`
//       );
//     }

//     console.log("[Mega888 Sync] Sync completed successfully");
//   } catch (error) {
//     console.error("[Mega888 Sync] Error:", error.message);

//     // Log the error but don't crash - will retry on next cron run
//     if (error.code === 11000) {
//       console.log("[Mega888 Sync] Duplicate entry detected, skipping...");
//     }
//   }
// };

const getMega888TurnoverForRebate = async (startDate, endDate) => {
  try {
    console.log(
      `[Mega888 Rebate] Fetching data from ${startDate} to ${endDate}`
    );

    const random = String(Date.now());
    const digest = generateMD5Hash(
      random + mega888SN + mega888AgentId + mega888Secret
    );

    const payload = buildParams(
      {
        sn: mega888SN,
        random: random,
        agentLoginId: mega888AgentId,
        digest: digest,
        type: 1,
        startTime: startDate,
        endTime: endDate,
      },
      "open.mega.player.total.report"
    );

    const response = await axios.post(mega888APIURL, payload);

    if (response.data.error) {
      throw new Error(response.data.error.message);
    }

    const results = response.data.result || [];

    if (results.length === 0) {
      console.log("[Mega888 Rebate] No records found");
      return {};
    }

    const loginIds = results.map((r) => r.loginId).filter(Boolean);
    const users = await User.find(
      { mega888GameID: { $in: loginIds } },
      { username: 1, mega888GameID: 1 }
    ).lean();

    const userMap = {};
    users.forEach((user) => {
      userMap[user.mega888GameID] = user.username;
    });

    const playerSummaries = {};

    results.forEach((entry) => {
      const { loginId, bet, win } = entry;
      const username = userMap[loginId];

      if (username) {
        if (!playerSummaries[username]) {
          playerSummaries[username] = {
            turnover: 0,
            winloss: 0,
          };
        }

        playerSummaries[username].turnover += parseFloat(bet || 0);
        playerSummaries[username].winloss -= parseFloat(win || 0);
      }
    });

    Object.keys(playerSummaries).forEach((username) => {
      playerSummaries[username].turnover = Number(
        playerSummaries[username].turnover.toFixed(2)
      );
      playerSummaries[username].winloss = Number(
        playerSummaries[username].winloss.toFixed(2)
      );
    });

    console.log(
      `[Mega888 Rebate] Processed ${Object.keys(playerSummaries).length} users`
    );

    return playerSummaries;
  } catch (error) {
    console.error("[Mega888 Rebate] Error:", error.message);
    // Return empty object instead of throwing - allows other games to continue
    return {};
  }
};
module.exports = router;
module.exports.fetchAndStoreMega888GameHistory =
  fetchAndStoreMega888GameHistory;
module.exports.getMega888TurnoverForRebate = getMega888TurnoverForRebate;
module.exports.mega888CheckBalance = mega888CheckBalance;
