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
const slotPussy888Modal = require("../../models/slot_pussy888.model");
const cron = require("node-cron");
const https = require("https");

require("dotenv").config();

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const pussy888Secret = process.env.PUSSY888_SECRET;
const pusy888Auth = process.env.PUSSY888_AUTH;
const pussy888AgentId = "BM8MYR_MY";
const webURL = "https://www.bm8my.vip/";
const pussy888APIURL = "https://api.pussy888.com/ashx";
const pussy888DataAPIURL = "https://api2.pussy888.com/ashx";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateRandomPassword() {
  const randomNumber = crypto.randomInt(1000, 10000);

  return `bm8${randomNumber}`;
}

function generateSimpleSignature(authcode, userName, time, secretKey) {
  const data = `${authcode}${userName}${time}${secretKey}`.toLowerCase();

  return crypto.createHash("md5").update(data).digest("hex").toUpperCase();
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

const pussy888GenerateRandomUsername = async () => {
  try {
    const time = moment().valueOf();

    const sign = generateSimpleSignature(
      pusy888Auth,
      pussy888AgentId,
      time,
      pussy888Secret
    );
    const response = await axios.get(`${pussy888APIURL}/account/account.ashx`, {
      params: {
        action: "RandomUserName",
        userName: pussy888AgentId,
        UserAreaId: 0,
        time: time,
        authcode: pusy888Auth,
        sign: sign,
      },
      httpsAgent,
    });

    if (response.data.code === 0) {
      return {
        success: true,
        data: response.data.account,
      };
    } else {
      console.log(response.data, "PUSSY888 Registration Failed");
      return {
        success: false,
        error: response.data,
      };
    }
  } catch (error) {
    console.log("PUSSY888 error in registering user", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

const pussy888RegisterUser = async (user) => {
  try {
    const pussyName = await pussy888GenerateRandomUsername();

    if (!pussyName.success) {
      console.log(pussyName, "PUSSY888 get name Failed");
      return {
        success: false,
        error: pussyName.error,
      };
    }

    const time = moment().valueOf();
    const randomPass = generateRandomPassword();

    const sign = generateSimpleSignature(
      pusy888Auth,
      pussyName.data,
      time,
      pussy888Secret
    );

    const response = await axios.get(
      `${pussy888APIURL}/account/account.ashx?action=addUser`,
      {
        params: {
          action: "addUser",
          agent: pussy888AgentId,
          PassWd: randomPass,
          userName: pussyName.data,
          Name: user.username,
          Tel: "0123",
          Memo: "Prod",
          UserType: "1",
          time: time,
          authcode: pusy888Auth,
          sign: sign,
          pwdtype: "1",
        },
        httpsAgent,
      }
    );

    if (response.data.code === 0) {
      const updateFields = {
        $set: {
          pussy888GameID: pussyName.data,
          pussy888GamePW: randomPass,
        },
      };

      if (user.pussy888GameID && user.pussy888GamePW) {
        updateFields.$push = {
          pastPussy888GameID: user.pussy888GameID,
          pastPussy888GamePW: user.pussy888GamePW,
        };
      }

      await User.findByIdAndUpdate(user._id, updateFields, { new: true });

      return {
        success: true,
        userData: {
          userId: pussyName.data,
          password: randomPass,
        },
      };
    } else {
      console.log(response.data, "PUSSY888 Registration Failed");
      return {
        success: false,
        error: response.data,
      };
    }
  } catch (error) {
    console.log("PUSSY888 error in registering user", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

const pussy888CheckBalance = async (user) => {
  try {
    if (!user.pussy888GameID) {
      return {
        success: true,
        balance: 0,
      };
    }

    const time = moment().valueOf();

    const sign = generateSimpleSignature(
      pusy888Auth,
      user.pussy888GameID,
      time,
      pussy888Secret
    );

    const response = await axios.get(
      `${pussy888APIURL}/account/account.ashx?action=getSearchUserInfo&userName=${user.pussy888GameID}`,
      {
        params: {
          action: "getSearchUserInfo",
          userName: user.pussy888GameID,
          time: time,
          authcode: pusy888Auth,
          sign: sign,
        },
        httpsAgent,
      }
    );
    if (response.data.success !== true) {
      console.log("failed to retrieve pussy888 balance", response.data);
    }

    return {
      success: response.data.success,
      balance: parseFloat(response.data.results?.[0]?.ScoreNum) || 0,
      response: response.data,
    };
  } catch (error) {
    console.error("PUSSY888 error checking user balance", error.message);
    return { success: false, balance: 0 };
  }
};

async function pussy888Deposit(user, trfamount, ip, adminname) {
  try {
    const time = moment().valueOf();

    const sign = generateSimpleSignature(
      pusy888Auth,
      user.pussy888GameID,
      time,
      pussy888Secret
    );

    const response = await axios.get(
      `${pussy888APIURL}/account/setScore.ashx`,
      {
        params: {
          action: "setServerScore",
          scoreNum: trfamount,
          userName: user.pussy888GameID,
          ActionUser: adminname || "system",
          ActionIp: ip,
          time: time,
          authcode: pusy888Auth,
          sign: sign,
        },
        httpsAgent,
      }
    );

    if (response.data.success !== true) {
      return {
        success: false,
        error: response.data,
      };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error("PUSSY888 error in deposit:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function pussy888Withdraw(user, trfamount, ip, adminname) {
  try {
    const time = moment().valueOf();

    const sign = generateSimpleSignature(
      pusy888Auth,
      user.pussy888GameID,
      time,
      pussy888Secret
    );

    const response = await axios.get(
      `${pussy888APIURL}/account/setScore.ashx`,
      {
        params: {
          action: "setServerScore",
          scoreNum: -trfamount,
          userName: user.pussy888GameID,
          ActionUser: adminname || "system",
          ActionIp: ip,
          time: time,
          authcode: pusy888Auth,
          sign: sign,
        },
        httpsAgent,
      }
    );

    if (response.data.success !== true) {
      return {
        success: false,
        error: response.data,
      };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error("PUSSY888 error in withdraw:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

router.post("/api/pussy888/register", authenticateToken, async (req, res) => {
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

    if (user.pussy888GameID && user.pussy888GamePW) {
      return res.status(200).json({
        success: true,
        message: {
          en: "PUSSY888: Account registered successfully.",
          zh: "PUSSY888: 账户注册成功。",
          ms: "PUSSY888: Akaun berjaya didaftarkan.",
          zh_hk: "PUSSY888: 帳戶註冊成功。",
          id: "PUSSY888: Akun berhasil didaftarkan.",
        },
        userData: {
          userId: user.pussy888GameID,
          password: user.pussy888GamePW,
        },
      });
    }

    const registerResponse = await pussy888RegisterUser(user);
    if (!registerResponse.success) {
      return res.status(200).json({
        success: false,
        message: {
          en: "PUSSY888: Registration failed. Please try again or contact customer support for further assistance.",
          zh: "PUSSY888: 注册失败。请重试或联系客服寻求进一步帮助。",
          ms: "PUSSY888: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
          zh_hk: "PUSSY888: 註冊失敗。請重試或聯絡客服尋求進一步協助。",
          id: "PUSSY888: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: {
        en: "PUSSY888: Account registered successfully.",
        zh: "PUSSY888: 账户注册成功。",
        ms: "PUSSY888: Akaun berjaya didaftarkan.",
        zh_hk: "PUSSY888: 帳戶註冊成功。",
        id: "PUSSY888: Akun berhasil didaftarkan.",
      },
      userData: {
        userId: registerResponse.userData.userId,
        password: registerResponse.userData.password,
      },
    });
  } catch (error) {
    console.log("PUSSY888 error in registering user", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "PUSSY888: Registration failed. Please try again or contact customer support for assistance.",
        zh: "PUSSY888: 注册失败。请重试或联系客服寻求帮助。",
        ms: "PUSSY888: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
        zh_hk: "PUSSY888: 註冊失敗。請重試或聯絡客服尋求協助。",
        id: "PUSSY888: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/admin/api/pussy888/:userId/registeradmin",
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

      const registerResponse = await pussy888RegisterUser(user);
      if (!registerResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "PUSSY888: Registration failed. Please try again or contact customer support for further assistance.",
            zh: "PUSSY888: 注册失败。请重试或联系客服寻求进一步帮助。",
            ms: "PUSSY888: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
            zh_hk: "PUSSY888: 註冊失敗。請重試或聯絡客服尋求進一步協助。",
            id: "PUSSY888: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "PUSSY888: Account registered successfully.",
          zh: "PUSSY888: 账户注册成功。",
          ms: "PUSSY888: Akaun berjaya didaftarkan.",
          zh_hk: "PUSSY888: 帳戶註冊成功。",
          id: "PUSSY888: Akun berhasil didaftarkan.",
        },
        userData: {
          userId: registerResponse.userData.userId,
          password: registerResponse.userData.password,
        },
      });
    } catch (error) {
      console.log("PUSSY888 error in registering user", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "PUSSY888: Registration failed. Please try again or contact customer support for assistance.",
          zh: "PUSSY888: 注册失败。请重试或联系客服寻求帮助。",
          ms: "PUSSY888: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan.",
          zh_hk: "PUSSY888: 註冊失敗。請重試或聯絡客服尋求協助。",
          id: "PUSSY888: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/pussy888/:userId/checkbalance",
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

      const balanceResponse = await pussy888CheckBalance(user);

      if (!balanceResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "PUSSY888: Failed to retrieve balance. Please try again.",
            zh: "PUSSY888: 获取余额失败。请重试。",
            ms: "PUSSY888: Gagal mendapatkan baki. Sila cuba lagi.",
            zh_hk: "PUSSY888: 獲取餘額失敗。請重試。",
            id: "PUSSY888: Gagal mengambil saldo. Silakan coba lagi.",
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
      console.error("PUSSY888 error checking user balance", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "PUSSY888: Failed to retrieve balance. Please try again.",
          zh: "PUSSY888: 获取余额失败。请重试。",
          ms: "PUSSY888: Gagal mendapatkan baki. Sila cuba lagi.",
          zh_hk: "PUSSY888: 獲取餘額失敗。請重試。",
          id: "PUSSY888: Gagal mengambil saldo. Silakan coba lagi.",
        },
      });
    }
  }
);

router.post(
  "/api/pussy888/checkbalance",
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
      const balanceResponse = await pussy888CheckBalance(user);

      if (!balanceResponse.success) {
        console.log("failed to retriefve balance", balanceResponse);
        return res.status(200).json({
          success: false,
          message: {
            en: "PUSSY888: Failed to retrieve balance. Please try again.",
            zh: "PUSSY888: 获取余额失败。请重试。",
            ms: "PUSSY888: Gagal mendapatkan baki. Sila cuba lagi.",
            zh_hk: "PUSSY888: 獲取餘額失敗。請重試。",
            id: "PUSSY888: Gagal mengambil saldo. Silakan coba lagi.",
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
      console.error("PUSSY888 error checking user balance", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "PUSSY888: Failed to retrieve balance. Please try again.",
          zh: "PUSSY888: 获取余额失败。请重试。",
          ms: "PUSSY888: Gagal mendapatkan baki. Sila cuba lagi.",
          zh_hk: "PUSSY888: 獲取餘額失敗。請重試。",
          id: "PUSSY888: Gagal mengambil saldo. Silakan coba lagi.",
        },
      });
    }
  }
);

router.post("/api/pussy888/deposit", authenticateToken, async (req, res) => {
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

    if (!user.pussy888GameID) {
      return res.status(200).json({
        success: false,
        message: {
          en: "PUSSY888: Game account not registered. Please register an account first to proceed.",
          zh: "PUSSY888: 游戏账户未注册。请先注册账户以继续。",
          ms: "PUSSY888: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
          zh_hk: "PUSSY888: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
          id: "PUSSY888: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
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

    if (user.gameStatus.pussy888.transferInStatus) {
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

    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();

    const depositResponse = await pussy888Deposit(
      user,
      formattedDepositAmount,
      clientIp,
      "player"
    );

    if (!depositResponse.success) {
      await User.findByIdAndUpdate(user._id, {
        $inc: { wallet: formattedDepositAmount },
      });
      walletDeducted = false;

      console.error("PUSSY888: Deposit failed -", depositResponse.error);

      return res.status(200).json({
        success: false,
        message: {
          en: "PUSSY888: Deposit failed. Please try again or contact customer support for further assistance.",
          zh: "PUSSY888: 存款失败。请重试或联系客服寻求进一步帮助。",
          ms: "PUSSY888: Deposit gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
          zh_hk: "PUSSY888: 存款失敗。請重試或聯絡客服尋求進一步協助。",
          id: "PUSSY888: Deposit gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }

    try {
      const gameBalance = await pussy888CheckBalance(user);

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Transfer",
        roundToTwoDecimals(formattedDepositAmount),
        "PUSSY888",
        roundToTwoDecimals(gameBalance?.balance ?? 0),
        roundToTwoDecimals(user.wallet),
        roundToTwoDecimals(updatedUser.wallet)
      );
    } catch (logError) {
      console.error("PUSSY888: Failed to log transaction:", logError.message);
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
    console.log("PUSSY888 error in deposit", error.message);

    if (walletDeducted && user) {
      try {
        await User.findByIdAndUpdate(user._id, {
          $inc: { wallet: formattedDepositAmount },
        });
        console.log("PUSSY888: Wallet rollback successful");
      } catch (rollbackError) {
        console.error(
          "PUSSY888: CRITICAL - Rollback failed:",
          rollbackError.message
        );
      }
    }

    return res.status(200).json({
      success: false,
      message: {
        en: "PUSSY888: Deposit failed. Please try again or contact customer support for further assistance.",
        zh: "PUSSY888: 存款失败。请重试或联系客服寻求进一步帮助。",
        ms: "PUSSY888: Deposit gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
        zh_hk: "PUSSY888: 存款失敗。請重試或聯絡客服尋求進一步協助。",
        id: "PUSSY888: Deposit gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
      },
    });
  }
});

router.post("/api/pussy888/withdraw", authenticateToken, async (req, res) => {
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

    if (!user.pussy888GameID) {
      return res.status(200).json({
        success: false,
        message: {
          en: "PUSSY888: Game account not registered. Please register an account first to proceed.",
          zh: "PUSSY888: 游戏账户未注册。请先注册账户以继续。",
          ms: "PUSSY888: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
          zh_hk: "PUSSY888: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
          id: "PUSSY888: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
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

    if (user.gameStatus.pussy888.transferOutStatus) {
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
    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();

    const withdrawResponse = await pussy888Withdraw(
      user,
      formattedWithdrawAmount,
      clientIp,
      "player"
    );

    if (!withdrawResponse.success) {
      console.error("PUSSY888: Withdraw failed -", withdrawResponse.error);

      if (withdrawResponse.error.code === -8) {
        return res.status(200).json({
          success: false,
          message: {
            en: "PUSSY888: Insufficient game balance to complete withdrawal.",
            zh: "PUSSY888: 游戏余额不足，无法完成提款。",
            ms: "PUSSY888: Baki permainan tidak mencukupi untuk melengkapkan pengeluaran.",
            zh_hk: "PUSSY888: 遊戲餘額不足，無法完成提款。",
            id: "PUSSY888: Saldo permainan tidak mencukupi untuk menyelesaikan penarikan.",
          },
        });
      }

      return res.status(200).json({
        success: false,
        message: {
          en: "PUSSY888: Withdrawal failed. Please try again or contact customer support for further assistance.",
          zh: "PUSSY888: 提款失败。请重试或联系客服寻求进一步帮助。",
          ms: "PUSSY888: Pengeluaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
          zh_hk: "PUSSY888: 提款失敗。請重試或聯絡客服尋求進一步協助。",
          id: "PUSSY888: Penarikan gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
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
      const gameBalance = await pussy888CheckBalance(user);

      await GameWalletLogAttempt(
        user.username,
        "Transfer Out",
        "Transfer",
        roundToTwoDecimals(formattedWithdrawAmount),
        "PUSSY888",
        roundToTwoDecimals(gameBalance?.balance ?? 0),
        roundToTwoDecimals(user.wallet),
        roundToTwoDecimals(updatedUser.wallet)
      );
    } catch (logError) {
      console.error("PUSSY888: Failed to log transaction:", logError.message);
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
    console.log("PUSSY888 error in withdraw", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "PUSSY888: Withdrawal failed. Please try again or contact customer support for further assistance.",
        zh: "PUSSY888: 提款失败。请重试或联系客服寻求进一步帮助。",
        ms: "PUSSY888: Pengeluaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
        zh_hk: "PUSSY888: 提款失敗。請重試或聯絡客服尋求進一步協助。",
        id: "PUSSY888: Penarikan gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
      },
    });
  }
});

router.post(
  "/admin/api/pussy888/:userId/withdrawall",
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

      if (!user.pussy888GameID) {
        return res.status(200).json({
          success: false,
          message: {
            en: "PUSSY888: Game account not registered. Please register an account first to proceed.",
            zh: "PUSSY888: 游戏账户未注册。请先注册账户以继续。",
            ms: "PUSSY888: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
            zh_hk: "PUSSY888: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
            id: "PUSSY888: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
          },
        });
      }

      const gameBalance = await pussy888CheckBalance(user);

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

      let clientIp = req.headers["x-forwarded-for"] || req.ip;
      clientIp = clientIp.split(",")[0].trim();

      const withdrawResponse = await pussy888Withdraw(
        user,
        gameBalance.balance,
        clientIp,
        "admin"
      );

      if (!withdrawResponse.success) {
        console.log("PUSSY888 withdrw fail", withdrawResponse);

        if (withdrawResponse.error.code === -8) {
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
        "PUSSY888",
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
      console.log("PUSSY888 error in transferout", error.message);
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
  "/admin/api/pussy888/:userId/withdraw",
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

      if (!user.pussy888GameID) {
        return res.status(200).json({
          success: false,
          message: {
            en: "PUSSY888: Game account not registered. Please register an account first to proceed.",
            zh: "PUSSY888: 游戏账户未注册。请先注册账户以继续。",
            ms: "PUSSY888: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
            zh_hk: "PUSSY888: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
            id: "PUSSY888: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
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

      let clientIp = req.headers["x-forwarded-for"] || req.ip;
      clientIp = clientIp.split(",")[0].trim();

      const withdrawResponse = await pussy888Withdraw(
        user,
        formattedWithdrawAmount,
        clientIp,
        "admin"
      );

      if (!withdrawResponse.success) {
        console.error("PUSSY888: Withdraw failed -", withdrawResponse.error);

        if (withdrawResponse.error.code === -8) {
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
        const gameBalance = await pussy888CheckBalance(user);

        await GameWalletLogAttempt(
          user.username,
          "Transfer Out",
          "Transfer",
          roundToTwoDecimals(formattedWithdrawAmount),
          "PUSSY888",
          roundToTwoDecimals(gameBalance?.balance ?? 0),
          roundToTwoDecimals(user.wallet),
          roundToTwoDecimals(updatedUser.wallet)
        );
      } catch (logError) {
        console.error("PUSSY888: Failed to log transaction:", logError.message);
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
      console.log("PUSSY888 error in transferout", error.message);
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
  "/admin/api/pussy888/setAsMain",
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
        pastPussy888GameID: selectedGameId,
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

      const indexToRemove = user.pastPussy888GameID.indexOf(selectedGameId);

      let newPastGameIDs = [...user.pastPussy888GameID];
      let newPastGamePWs = [...user.pastPussy888GamePW];

      if (indexToRemove > -1) {
        newPastGameIDs.splice(indexToRemove, 1);
        newPastGamePWs.splice(indexToRemove, 1);
      }

      if (user.pussy888GameID && user.pussy888GamePW) {
        newPastGameIDs.push(user.pussy888GameID);
        newPastGamePWs.push(user.pussy888GamePW);
      }

      await User.findByIdAndUpdate(user._id, {
        $set: {
          pussy888GameID: selectedGameId,
          pussy888GamePW: selectedPassword,
          pastPussy888GameID: newPastGameIDs,
          pastPussy888GamePW: newPastGamePWs,
        },
      });

      return res.status(200).json({
        success: true,
        message: {
          en: "PUSSY888 ID and password set as main successfully.",
          zh: "PUSSY888账号和密码已成功设置为主账号。",
          zh_hk: "PUSSY888帳號和密碼已成功設置為主帳號。",
          ms: "ID dan kata laluan PUSSY888 berjaya ditetapkan sebagai utama.",
          id: "ID dan kata sandi PUSSY888 berhasil ditetapkan sebagai utama.",
        },
      });
    } catch (error) {
      console.error("Error occurred while setting main PUSSY888 ID:", error);
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

// router.post(
//   "/api/pussy888/playertotalreport",

//   async (req, res) => {
//     try {
//       const start = moment()
//         .utc()
//         .add(8, "hours")
//         .startOf("day")
//         .format("YYYY-MM-DD HH:mm:ss");
//       const end = moment()
//         .utc()
//         .add(8, "hours")
//         .endOf("day")
//         .format("YYYY-MM-DD HH:mm:ss");

//       const startDate = moment()
//         .utc()
//         .add(8, "hours")
//         .startOf("day")
//         .format("YYYY-MM-DD");
//       const endDate = moment()
//         .utc()
//         .add(8, "hours")
//         .endOf("day")
//         .format("YYYY-MM-DD");

//       const time = moment().valueOf(); // This generates a 13-digit timestamp

//       const sign = generateSimpleSignature(
//         pusy888Auth,
//         pussy888AgentId,
//         time,
//         pussy888Secret
//       );

//       // const selectedDate = "2024-09-23 21:43:00";

//       const gameLogResponse = await axios.get(
//         `https://api2.pussy888.com/ashx/AgentTotalReport.ashx?sDate=${startDate}&eDate=${endDate}&userName=${pussy888AgentId}&Type=ServerTotalReport`,
//         {
//           params: {
//             userName: pussy888AgentId,
//             sDate: start,
//             eDate: end,
//             Type: "ServerTotalReport",
//             time: time,
//             authcode: pusy888Auth,
//             sign: sign,
//           },
//           httpsAgent,
//         }
//       );
//       console.log(gameLogResponse.data);
//       return;
//       if (gameLogResponse.data.success) {
//         const results = gameLogResponse.data.results;

//         // Sum up all the win values
//         const totalWinLoss = results.reduce((sum, entry) => {
//           return sum + parseFloat(entry.win); // Convert win to float and sum it up
//         }, 0);

//         return res.status(200).json({
//           authorized: true,
//           summary: {
//             gamename: "PUSSY888",
//             gamecategory: "SLOT",
//             turnover: "0.00", // As requested, turnover is set to 0
//             winloss: totalWinLoss.toFixed(2), // Winloss as the sum of all win values
//           },
//         });
//       } else {
//         // Return the raw game log response data if not successful
//         return res.status(200).json(gameLogResponse.data);
//       }
//     } catch (error) {
//       console.log("Error occurred while fetching game logs:", error);
//       return res.status(500).json({
//         authorized: false,
//         error: `Internal server error ${error.message}`,
//       });
//     }
//   }
// );

// router.post("/api/pussy888/getturnoverforrebatetest", async (req, res) => {
//   try {
//     const time = moment().valueOf();

//     const sign = generateSimpleSignature(
//       pusy888Auth,
//       "my045515112",
//       time,
//       pussy888Secret
//     );

//     const today = moment.utc().add(8, "hours").format("YYYY-MM-DD");
//     const yesterday = moment
//       .utc()
//       .add(8, "hours")
//       .subtract(1, "days")
//       .format("YYYY-MM-DD");

//     const { date } = req.body;
//     let start, end;

//     if (date === "today") {
//       startDate = moment(today)
//         .utc()
//         .add(8, "hours")
//         .startOf("day")
//         .format("YYYY-MM-DD HH:mm:ss");
//       endDate = moment(today)
//         .utc()
//         .add(8, "hours")
//         .endOf("day")
//         .format("YYYY-MM-DD HH:mm:ss");
//     } else if (date === "yesterday") {
//       startDate = moment(yesterday)
//         .utc()
//         .add(8, "hours")
//         .startOf("day")
//         .format("YYYY-MM-DD HH:mm:ss");
//       endDate = moment(yesterday)
//         .utc()
//         .add(8, "hours")
//         .endOf("day")
//         .format("YYYY-MM-DD HH:mm:ss");
//     }
//     let allResults = [];
//     let pageIndex = 1;
//     let totalPages = 1;

//     do {
//       // Introduce a delay before each request
//       await delay(1000); // Delay for 1 second (1000 milliseconds) between each request

//       const gameLogResponse = await axios.get(
//         `https://api2.pussy888.com/ashx/GameLog.ashx?sDate=${startDate}&eDate=${endDate}&userName=my045515112&pageIndex=${pageIndex}`,
//         {
//           params: {
//             userName: "my045515112",
//             pageIndex: pageIndex,
//             sDate: startDate,
//             eDate: endDate,
//             time: time,
//             authcode: pusy888Auth,
//             sign: sign,
//           },
//           httpsAgent,
//         }
//       );

//       const responseData = gameLogResponse.data;

//       if (responseData.success !== true) {
//         return res.status(400).json({ error: "Failed to retrieve game logs" });
//       }

//       // Add the current page of results to allResults
//       allResults = [...allResults, ...responseData.results];

//       // Update pagination data
//       pageIndex = responseData.pageindex + 1; // Increment to the next page
//       totalPages = Math.ceil(responseData.total / responseData.pagesize); // Calculate total pages based on total and pagesize
//     } while (pageIndex <= totalPages);

//     return res.status(200).json({
//       success: true,
//       data: allResults,
//     });
//   } catch (error) {
//     console.log("PUSSY888: Failed to fetch win/loss report:", error.message);
//     return res.status(500).json({
//       success: false,
//       message: {
//         en: "PUSSY888: Failed to fetch win/loss report",
//         zh: "PUSSY888: 获取盈亏报告失败",
//       },
//     });
//   }
// });

router.post("/api/pussy888/getturnoverforrebate", async (req, res) => {
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

    console.log("PUSSY888 QUERYING TIME", startDate, endDate);

    const records = await slotPussy888Modal.find({
      betTime: {
        $gte: startDate,
        $lt: endDate,
      },
    });

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
        gamename: "PUSSY888",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("PUSSY888: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "PUSSY888: Failed to fetch win/loss report",
        zh: "PUSSY888: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/pussy888/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await slotPussy888Modal.find({
        username: user.username,
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
          gamename: "PUSSY888",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("PUSSY888: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "PUSSY888: Failed to fetch win/loss report",
          zh: "PUSSY888: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/pussy888/:userId/gamedata",
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

          if (slotGames["PUSSY888"]) {
            totalTurnover += slotGames["PUSSY888"].turnover || 0;
            totalWinLoss += slotGames["PUSSY888"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PUSSY888",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("PUSSY888: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "PUSSY888: Failed to fetch win/loss report",
          zh: "PUSSY888: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/pussy888/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await slotPussy888Modal.find({
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
          gamename: "PUSSY888",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("PUSSY888: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "PUSSY888: Failed to fetch win/loss report",
          zh: "PUSSY888: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/pussy888/kioskreport",
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

          if (liveCasino["PUSSY888"]) {
            totalTurnover += Number(liveCasino["PUSSY888"].turnover || 0);
            totalWinLoss += Number(liveCasino["PUSSY888"].winloss || 0);
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "PUSSY888",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("PUSSY888: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "PUSSY888: Failed to fetch win/loss report",
          zh: "PUSSY888: 获取盈亏报告失败",
        },
      });
    }
  }
);

const getPussy888LastSyncTime = async () => {
  const syncLog = await GameSyncLog.findOne({ provider: "pussy888" }).lean();
  return syncLog?.syncTime || null;
};

const updatePussy888LastSyncTime = async (time) => {
  await GameSyncLog.findOneAndUpdate(
    { provider: "pussy888" },
    { $set: { syncTime: time.toDate() } },
    { upsert: true }
  );
};

const fetchPussy888TotalReport = async (startDate, endDate) => {
  const time = moment().valueOf();

  const sign = generateSimpleSignature(
    pusy888Auth,
    pussy888AgentId,
    time,
    pussy888Secret
  );

  console.log(
    `[Pussy888 API] Fetching total report: ${startDate} to ${endDate}`
  );

  const response = await axios.get(
    `${pussy888DataAPIURL}/AgentTotalReport.ashx`,
    {
      params: {
        userName: pussy888AgentId,
        sDate: startDate,
        eDate: endDate,
        Type: "ServerTotalReport",
        time: time,
        authcode: pusy888Auth,
        sign: sign,
      },
      httpsAgent,
    }
  );

  if (response.data.success !== true) {
    throw new Error(response.data.msg || "Failed to get total report");
  }

  const results = response.data.results || [];
  console.log(`[Pussy888 API] Total report returned ${results.length} players`);

  return results;
};

const getUsernameFromPussy888GameID = async (gameId) => {
  const user = await User.findOne(
    {
      $or: [{ pussy888GameID: gameId }, { pastPussy888GameID: gameId }],
    },
    { gameId: 1 }
  ).lean();

  return user?.gameId || null;
};

const fetchPussy888DetailedGameHistory = async (gameId, startDate, endDate) => {
  const time = moment().valueOf();

  const sign = generateSimpleSignature(
    pusy888Auth,
    gameId,
    time,
    pussy888Secret
  );

  let allResults = [];
  let pageIndex = 1;
  let totalPages = 1;

  do {
    // Delay between pages (except first page)
    if (pageIndex > 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const response = await axios.get(`${pussy888DataAPIURL}/GameLog.ashx`, {
      params: {
        userName: gameId,
        pageIndex: pageIndex,
        sDate: startDate,
        eDate: endDate,
        time: time,
        authcode: pusy888Auth,
        sign: sign,
      },
      httpsAgent,
    });

    if (response.data.success !== true) {
      throw new Error(response.data.msg || "Failed to get game logs");
    }

    allResults = [...allResults, ...response.data.results];

    pageIndex = response.data.pageindex + 1;
    totalPages = Math.ceil(response.data.total / response.data.pagesize);

    console.log(
      `[Pussy888 Detail] ${gameId}: Page ${pageIndex - 1}/${totalPages} - ${
        response.data.results.length
      } items`
    );
  } while (pageIndex <= totalPages);

  return allResults;
};

const parseBetAmountFromLogDataStr = (logDataStr) => {
  if (!logDataStr) return 0;
  const parts = logDataStr.split(",");
  return parseFloat(parts[0]) || 0;
};

const fetchAndStorePussy888GameHistory = async (
  gameId,
  username,
  startDate,
  endDate
) => {
  try {
    console.log(
      `[Pussy888 Detail] Fetching ${gameId} (${username}): ${startDate} to ${endDate}`
    );

    const allItems = await fetchPussy888DetailedGameHistory(
      gameId,
      startDate,
      endDate
    );

    if (!allItems.length) {
      console.log(`[Pussy888 Detail] No records for ${username}`);
      return { totalRecords: 0, newRecords: 0, skipped: 0 };
    }

    console.log(
      `[Pussy888 Detail] ${username}: Fetched ${allItems.length} total items`
    );

    const betIds = allItems.map((item) => String(item.uuid));
    const existingBetIds = new Set(
      (
        await slotPussy888Modal
          .find({ betId: { $in: betIds } })
          .select("betId")
          .lean()
      ).map((r) => r.betId)
    );

    const startDateObj = moment(startDate, "YYYY-MM-DD HH:mm:ss").toDate();
    const endDateObj = moment(endDate, "YYYY-MM-DD HH:mm:ss").toDate();

    const newRecords = allItems
      .filter((item) => !existingBetIds.has(String(item.uuid)))
      .map((item) => ({
        betId: String(item.uuid),
        username: username,
        betamount: parseBetAmountFromLogDataStr(item.LogDataStr),
        settleamount: parseFloat(item.Win || 0),
        bet: true,
        settle: true,
        startDate: startDateObj,
        endDate: endDateObj,
        claimed: false,
        betTime: item.CreateTime
          ? moment
              .tz(item.CreateTime, "YYYY-MM-DD HH:mm:ss", "Asia/Kuala_Lumpur")
              .utc()
              .toDate()
          : moment.utc().toDate(),
      }));

    console.log(
      `[Pussy888 Detail] ${username}: New=${newRecords.length}, Skipped=${
        allItems.length - newRecords.length
      }`
    );

    // Batch insert new records
    if (newRecords.length > 0) {
      await slotPussy888Modal.insertMany(newRecords, { ordered: false });
      console.log(
        `[Pussy888 Detail] ${username}: Inserted ${newRecords.length} records`
      );
    }

    return {
      totalRecords: allItems.length,
      newRecords: newRecords.length,
      skipped: allItems.length - newRecords.length,
    };
  } catch (error) {
    console.error(`[Pussy888 Detail] Error for ${username}:`, error.message);
    throw error;
  }
};

// Sync Pussy888 for a single day
const syncPussy888ForSingleDay = async (date) => {
  try {
    const startDate = moment(date).format("YYYY-MM-DD");
    const endDate = moment(date).format("YYYY-MM-DD");

    const start = moment(date).startOf("day").format("YYYY-MM-DD HH:mm:ss");
    const end = moment(date).endOf("day").format("YYYY-MM-DD HH:mm:ss");

    console.log(`[Pussy888 Sync Day] Syncing ${date}: ${start} to ${end}`);

    const activePlayers = await fetchPussy888TotalReport(startDate, endDate);

    if (!activePlayers || activePlayers.length === 0) {
      console.log(`[Pussy888 Sync Day] No active players for ${date}`);
      return {
        date: date,
        totalPlayers: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        playerDetails: [],
      };
    }

    console.log(
      `[Pussy888 Sync Day] Found ${activePlayers.length} active players for ${date}`
    );

    let syncResults = {
      date: date,
      totalPlayers: activePlayers.length,
      successful: 0,
      failed: 0,
      skipped: 0,
      playerDetails: [],
    };

    // Step 2: For each active player, get detailed game history
    for (const player of activePlayers) {
      const gameId = player.Account;

      try {
        // Get username from database
        const username = await getUsernameFromPussy888GameID(gameId);

        if (!username) {
          console.log(
            `[Pussy888 Sync Day] ${date} - No user found for gameId: ${gameId}`
          );
          syncResults.skipped++;
          syncResults.playerDetails.push({
            gameId: gameId,
            status: "skipped",
            reason: "User not found in database",
          });
          continue;
        }

        console.log(
          `[Pussy888 Sync Day] ${date} - Syncing ${username} (${gameId})`
        );

        const result = await fetchAndStorePussy888GameHistory(
          gameId,
          username,
          start,
          end
        );

        syncResults.successful++;
        syncResults.playerDetails.push({
          gameId: gameId,
          username: username,
          status: "success",
          ...result,
        });

        // Rate limiting: 300ms delay between players
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (error) {
        console.error(
          `[Pussy888 Sync Day] ${date} - Failed ${gameId}:`,
          error.message
        );
        syncResults.failed++;
        syncResults.playerDetails.push({
          gameId: gameId,
          status: "failed",
          error: error.message,
        });
      }
    }

    console.log(
      `[Pussy888 Sync Day] ${date} - Completed: ${syncResults.successful} successful, ${syncResults.failed} failed, ${syncResults.skipped} skipped`
    );

    return syncResults;
  } catch (error) {
    console.error(`[Pussy888 Sync Day] Error for ${date}:`, error.message);
    throw error;
  }
};

// Main sync function
const syncPussy888GameHistory = async () => {
  try {
    console.log(
      `[Pussy888 Sync] Starting sync at ${moment().format(
        "YYYY-MM-DD HH:mm:ss"
      )}`
    );

    const now = moment().utc().add(8, "hours");

    // Get last sync time
    const lastSyncTime = await getPussy888LastSyncTime();

    const daysToSync = [];

    if (!lastSyncTime) {
      // First run: sync last 7 days
      for (let i = 0; i < 7; i++) {
        const date = now.clone().subtract(i, "days").format("YYYY-MM-DD");
        daysToSync.push(date);
      }
    } else {
      const lastSyncMoment = moment(lastSyncTime).utc().add(8, "hours");
      const daysSinceLastSync = now.diff(lastSyncMoment, "days");

      // Sync today + any missed days (max 7 days back)
      const daysBack = Math.min(daysSinceLastSync + 1, 7);
      for (let i = 0; i < daysBack; i++) {
        const date = now.clone().subtract(i, "days").format("YYYY-MM-DD");
        daysToSync.push(date);
      }
    }

    console.log(`[Pussy888 Sync] Days to sync: ${daysToSync.join(", ")}`);

    let totalSyncResults = {
      totalDays: daysToSync.length,
      daysProcessed: 0,
      totalPlayers: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      details: [],
    };

    for (const date of daysToSync) {
      try {
        console.log(`\n[Pussy888 Sync] ======== Processing ${date} ========`);

        const dayResult = await syncPussy888ForSingleDay(date);

        totalSyncResults.daysProcessed++;
        totalSyncResults.totalPlayers += dayResult.totalPlayers;
        totalSyncResults.successful += dayResult.successful;
        totalSyncResults.failed += dayResult.failed;
        totalSyncResults.skipped += dayResult.skipped || 0;
        totalSyncResults.details.push({
          date: date,
          ...dayResult,
        });

        // Delay between days
        if (daysToSync.indexOf(date) < daysToSync.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`[Pussy888 Sync] Failed to sync ${date}:`, error.message);
        totalSyncResults.details.push({
          date: date,
          status: "failed",
          error: error.message,
        });
      }
    }

    // Update last sync time
    await updatePussy888LastSyncTime(now);

    console.log(`\n[Pussy888 Sync] ======== SUMMARY ========`);
    console.log(
      `Days processed: ${totalSyncResults.daysProcessed}/${totalSyncResults.totalDays}`
    );
    console.log(
      `Players synced: ${totalSyncResults.successful} successful, ${totalSyncResults.failed} failed, ${totalSyncResults.skipped} skipped`
    );

    return {
      success: true,
      syncTime: now.format("YYYY-MM-DD HH:mm:ss"),
      ...totalSyncResults,
    };
  } catch (error) {
    console.error("[Pussy888 Sync] Fatal error:", error.message);
    throw error;
  }
};

module.exports = router;
module.exports.pussy888CheckBalance = pussy888CheckBalance;
module.exports.pussy888Withdraw = pussy888Withdraw;
module.exports.syncPussy888GameHistory = syncPussy888GameHistory;
