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
const LotteryHuaweiModal = require("../../models/other_huaweilottery.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const GameWalletLog = require("../../models/gamewalletlog.model");
const Decimal = require("decimal.js");
const cron = require("node-cron");
require("dotenv").config();

const webURL = "https://www.bm8my.vip/";
const huaweiAPIURL = "https://api.huawei88.org/api/";
const huaweiUsername = "EGM8MY";
const huaweiPassword = process.env.HUAWEI_SECRET;

function generateRandomPassword() {
  const randomNumber = crypto.randomInt(1000, 10000);

  return `bm8${randomNumber}`;
}
function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function getCurrentFormattedDate() {
  return moment.utc().format("YYYY-MM-DD HH:mm:ss");
}

const generateRandomCode = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 36; i++) {
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

const huaweiRegisterUser = async (user) => {
  try {
    const generatedToken = generateRandomCode();

    const payload = {
      name: user.username,
      token: generatedToken,
      commission_lvl: 0.0,
      mid: huaweiUsername,
      pw: huaweiPassword,
    };

    const response = await axios.post(
      `${huaweiAPIURL}wallet_member_create`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.status.success !== true) {
      return {
        success: false,
        error: response.data.status.messages,
      };
    }

    return {
      success: true,
      userData: {
        userId: response.data.member.mid,
        password: response.data.member.token,
      },
    };
  } catch (error) {
    console.log("HUAWEI4D error in registering user", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

const huaweiCheckBalance = async (user) => {
  try {
    if (!user.huaweiGameID) {
      return {
        success: true,
        balance: 0,
      };
    }

    const payload = {
      target_mid: user.huaweiGameID,
      mid: huaweiUsername,
      pw: huaweiPassword,
    };

    const response = await axios.post(
      `${huaweiAPIURL}wallet_member_query`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return {
      success: response.data.status.success === true,
      balance: response.data.member.credit_available || 0,
      response: response.data,
    };
  } catch (error) {
    console.error("GRAND DRAGON error checking user balance", error.message);
    return { success: false, balance: 0 };
  }
};

async function huaweiDeposit(user, trfamount) {
  try {
    const payload = {
      topup_amount: trfamount,
      target_mid: user.huaweiGameID,
      mid: huaweiUsername,
      pw: huaweiPassword,
    };

    const response = await axios.post(
      `${huaweiAPIURL}wallet_member_topup/en`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.status.success !== true) {
      return {
        success: false,
        error: response.data,
      };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error("GRAND DRAGON error depositing", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function huaweiWithdraw(user, trfamount) {
  try {
    const payload = {
      withdraw_amount: trfamount,
      target_mid: user.huaweiGameID,
      mid: huaweiUsername,
      pw: huaweiPassword,
    };

    const response = await axios.post(
      `${huaweiAPIURL}wallet_member_withdraw/en`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.status.success !== true) {
      return {
        success: false,
        error: response.data,
      };
    }

    return { success: true, data: response.data };
  } catch (error) {
    console.error("GRAND DRAGON error withdrawing", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

router.post("/api/huawei/register", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user.alipayGameID) {
      const registerData = await huaweiRegisterUser(user);

      if (!registerData.success) {
        console.log(
          `GRAND DRAGON error in registering account ${registerData.error}`
        );

        return res.status(200).json({
          success: false,
          message: {
            en: "GRAND DRAGON: Registration failed. Please try again or contact customer support for further assistance.",
            zh: "GRAND DRAGON: 注册失败。请重试或联系客服寻求进一步帮助。",
            ms: "GRAND DRAGON: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
            zh_hk: "GRAND DRAGON: 註冊失敗。請重試或聯絡客服尋求進一步協助。",
            id: "GRAND DRAGON: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
          },
        });
      }

      await User.findOneAndUpdate(
        { username: user.username },
        {
          $set: {
            huaweiGameID: registerData.userData.userId,
            huaweiGamePW: registerData.userData.password,
          },
        }
      );
    }

    return res.status(200).json({
      success: true,
      message: {
        en: "GRAND DRAGON: Account registered successfully.",
        zh: "GRAND DRAGON: 账户注册成功。",
        ms: "GRAND DRAGON: Akaun berjaya didaftarkan.",
        zh_hk: "GRAND DRAGON: 帳戶註冊成功。",
        id: "GRAND DRAGON: Akun berhasil didaftarkan.",
      },
    });
  } catch (error) {
    console.log("GRAND DRAGON error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "GRAND DRAGON: Registration failed. Please try again or contact customer support for further assistance.",
        zh: "GRAND DRAGON: 注册失败。请重试或联系客服寻求进一步帮助。",
        ms: "GRAND DRAGON: Pendaftaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
        zh_hk: "GRAND DRAGON: 註冊失敗。請重試或聯絡客服尋求進一步協助。",
        id: "GRAND DRAGON: Pendaftaran gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
      },
    });
  }
});

router.post("/api/huawei/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang } = req.body;
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found. Please try again or contact customer service for assistance.",
          zh: "用户未找到，请重试或联系客服以获取帮助。",
          ms: "Pengguna tidak ditemui, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "用戶未找到，請重試或聯絡客服以獲取幫助。",
          id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    if (user.gameStatus.granddragon.transferInStatus) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          zh_hk: "您的遊戲訪問已被鎖定，請聯絡客服以獲取進一步幫助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
          id: "Akses permainan Anda telah dikunci. Silakan hubungi layanan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }

    if (!user.huaweiGameID) {
      return res.status(200).json({
        success: false,
        message: {
          en: "GRAND DRAGON: No account found. Please register to continue.",
          zh: "GRAND DRAGON：未找到账户。请先注册以继续。",
          zh_hk: "GRAND DRAGON：未找到帳戶。請先註冊以繼續。",
          ms: "GRAND DRAGON: Akaun tidak dijumpai. Sila daftar untuk meneruskan.",
          id: "GRAND DRAGON: Akun tidak ditemukan. Silakan daftar untuk melanjutkan.",
        },
      });
    }

    let lang = "en";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "zh";
    } else if (gameLang === "ms") {
      lang = "en";
    } else if (gameLang === "id") {
      lang = "en";
    } else if (gameLang === "zh_hk") {
      lang = "zh";
    }

    const payload = {
      token: user.huaweiGamePW,
      return_url: webURL,
      target_mid: user.huaweiGameID,
      mid: huaweiUsername,
      pw: huaweiPassword,
    };

    const launchGameResponse = await axios.post(
      `${huaweiAPIURL}wallet_member_gen_launch_url/${lang}`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (launchGameResponse.data.status.success !== true) {
      console.log(
        "GRAND DRAGON error in launching game",
        launchGameResponse.data
      );
      return res.status(200).json({
        success: false,
        message: {
          en: "GRAND DRAGON: Game launch failed. Please try again or customer service for assistance.",
          zh: "GRAND DRAGON: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "GRAND DRAGON: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "GRAND DRAGON: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "GRAND DRAGON: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    return res.status(200).json({
      success: true,
      gameLobby: launchGameResponse.data.launch_url,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("GRAND DRAGON error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "GRAND DRAGON: Game launch failed. Please try again or customer service for assistance.",
        zh: "GRAND DRAGON: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "GRAND DRAGON: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "GRAND DRAGON: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "GRAND DRAGON: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/huawei/checkbalance", authenticateToken, async (req, res) => {
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

    const balanceResponse = await huaweiCheckBalance(user);

    if (!balanceResponse.success) {
      return res.status(200).json({
        success: false,
        message: {
          en: "GRAND DRAGON: Failed to retrieve balance. Please try again.",
          zh: "GRAND DRAGON: 获取余额失败。请重试。",
          ms: "GRAND DRAGON: Gagal mendapatkan baki. Sila cuba lagi.",
          zh_hk: "GRAND DRAGON: 獲取餘額失敗。請重試。",
          id: "GRAND DRAGON: Gagal mengambil saldo. Silakan coba lagi.",
        },
      });
    }

    return res.status(200).json({
      success: true,
      balance: roundToTwoDecimals(balanceResponse.balance),
      message: {
        en: "Balance retrieved successfully.",
        zh: "余额查询成功。",
        ms: "Baki berjaya diperoleh.",
        zh_hk: "餘額查詢成功。",
        id: "Saldo berhasil diambil.",
      },
    });
  } catch (error) {
    console.error("GRAND DRAGON error checking user balance", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "GRAND DRAGON: Failed to retrieve balance. Please try again.",
        zh: "GRAND DRAGON: 获取余额失败。请重试。",
        ms: "GRAND DRAGON: Gagal mendapatkan baki. Sila cuba lagi.",
        zh_hk: "GRAND DRAGON: 獲取餘額失敗。請重試。",
        id: "GRAND DRAGON: Gagal mengambil saldo. Silakan coba lagi.",
      },
    });
  }
});

router.post("/api/huawei/deposit", authenticateToken, async (req, res) => {
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

    if (!user.huaweiGameID) {
      return res.status(200).json({
        success: false,
        message: {
          en: "GRAND DRAGON: Game account not registered. Please register an account first to proceed.",
          zh: "GRAND DRAGON: 游戏账户未注册。请先注册账户以继续。",
          ms: "GRAND DRAGON: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
          zh_hk: "GRAND DRAGON: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
          id: "GRAND DRAGON: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
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

    if (user.gameStatus.granddragon.transferInStatus) {
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

    const depositResponse = await huaweiDeposit(user, formattedDepositAmount);

    if (!depositResponse.success) {
      await User.findByIdAndUpdate(user._id, {
        $inc: { wallet: formattedDepositAmount },
      });
      walletDeducted = false;

      console.error("GRAND DRAGON: Deposit failed -", depositResponse.error);

      return res.status(200).json({
        success: false,
        message: {
          en: "GRAND DRAGON: Deposit failed. Please try again or contact customer support for further assistance.",
          zh: "GRAND DRAGON: 存款失败。请重试或联系客服寻求进一步帮助。",
          ms: "GRAND DRAGON: Deposit gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
          zh_hk: "GRAND DRAGON: 存款失敗。請重試或聯絡客服尋求進一步協助。",
          id: "GRAND DRAGON: Deposit gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }

    try {
      const gameBalance = await huaweiCheckBalance(user);

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Transfer",
        roundToTwoDecimals(formattedDepositAmount),
        "GRAND DRAGON",
        roundToTwoDecimals(gameBalance?.balance ?? 0),
        roundToTwoDecimals(user.wallet),
        roundToTwoDecimals(updatedUser.wallet)
      );
    } catch (logError) {
      console.error(
        "GRAND DRAGON: Failed to log transaction:",
        logError.message
      );
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
    console.log("GRAND DRAGON error in deposit", error.message);

    if (walletDeducted && user) {
      try {
        await User.findByIdAndUpdate(user._id, {
          $inc: { wallet: formattedDepositAmount },
        });
        console.log("GRAND DRAGON: Wallet rollback successful");
      } catch (rollbackError) {
        console.error(
          "GRAND DRAGON: CRITICAL - Rollback failed:",
          rollbackError.message
        );
      }
    }

    return res.status(200).json({
      success: false,
      message: {
        en: "GRAND DRAGON: Deposit failed. Please try again or contact customer support for further assistance.",
        zh: "GRAND DRAGON: 存款失败。请重试或联系客服寻求进一步帮助。",
        ms: "GRAND DRAGON: Deposit gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
        zh_hk: "GRAND DRAGON: 存款失敗。請重試或聯絡客服尋求進一步協助。",
        id: "GRAND DRAGON: Deposit gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
      },
    });
  }
});

router.post("/api/huawei/withdraw", authenticateToken, async (req, res) => {
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

    if (!user.huaweiGameID) {
      return res.status(200).json({
        success: false,
        message: {
          en: "GRAND DRAGON: Game account not registered. Please register an account first to proceed.",
          zh: "GRAND DRAGON: 游戏账户未注册。请先注册账户以继续。",
          ms: "GRAND DRAGON: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
          zh_hk: "GRAND DRAGON: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
          id: "GRAND DRAGON: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
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

    if (user.gameStatus.granddragon.transferOutStatus) {
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
    const withdrawResponse = await huaweiWithdraw(
      user,
      formattedWithdrawAmount
    );

    if (!withdrawResponse.success) {
      console.error("GRAND DRRAGON: Withdraw failed -", withdrawResponse.error);

      // if (withdrawResponse.error.error.code === "37123") {
      //   return res.status(200).json({
      //     success: false,
      //     message: {
      //       en: "GRAND DRRAGON: Insufficient game balance to complete withdrawal.",
      //       zh: "GRAND DRRAGON: 游戏余额不足，无法完成提款。",
      //       ms: "GRAND DRRAGON: Baki permainan tidak mencukupi untuk melengkapkan pengeluaran.",
      //       zh_hk: "GRAND DRRAGON: 遊戲餘額不足，無法完成提款。",
      //       id: "GRAND DRRAGON: Saldo permainan tidak mencukupi untuk menyelesaikan penarikan.",
      //     },
      //   });
      // }

      return res.status(200).json({
        success: false,
        message: {
          en: "GRAND DRRAGON: Withdrawal failed. Please try again or contact customer support for further assistance.",
          zh: "GRAND DRRAGON: 提款失败。请重试或联系客服寻求进一步帮助。",
          ms: "GRAND DRRAGON: Pengeluaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
          zh_hk: "GRAND DRRAGON: 提款失敗。請重試或聯絡客服尋求進一步協助。",
          id: "GRAND DRRAGON: Penarikan gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
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
      const gameBalance = await huaweiCheckBalance(user);

      await GameWalletLogAttempt(
        user.username,
        "Transfer Out",
        "Transfer",
        roundToTwoDecimals(formattedWithdrawAmount),
        "GRAND DRAGON",
        roundToTwoDecimals(gameBalance?.balance ?? 0),
        roundToTwoDecimals(user.wallet),
        roundToTwoDecimals(updatedUser.wallet)
      );
    } catch (logError) {
      console.error(
        "GRAND DRAGON: Failed to log transaction:",
        logError.message
      );
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
    console.log("GRAND DRAGON error in withdraw", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "GRAND DRAGON: Withdrawal failed. Please try again or contact customer support for further assistance.",
        zh: "GRAND DRAGON: 提款失败。请重试或联系客服寻求进一步帮助。",
        ms: "GRAND DRAGON: Pengeluaran gagal. Sila cuba lagi atau hubungi sokongan pelanggan untuk bantuan lanjut.",
        zh_hk: "GRAND DRAGON: 提款失敗。請重試或聯絡客服尋求進一步協助。",
        id: "GRAND DRAGON: Penarikan gagal. Silakan coba lagi atau hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
      },
    });
  }
});

router.post(
  "/admin/api/huawei/:userId/withdrawall",
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

      if (!user.huaweiGameID) {
        return res.status(200).json({
          success: false,
          message: {
            en: "GRAND DRAGON: Game account not registered. Please register an account first to proceed.",
            zh: "GRAND DRAGON: 游戏账户未注册。请先注册账户以继续。",
            ms: "GRAND DRAGON: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
            zh_hk: "GRAND DRAGON: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
            id: "GRAND DRAGON: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
          },
        });
      }

      const gameBalance = await huaweiCheckBalance(user);

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

      const withdrawResponse = await huaweiWithdraw(user, gameBalance.balance);

      if (!withdrawResponse.success) {
        console.log("GRAND DRAGON withdrw fail", withdrawResponse);

        // if (withdrawResponse.error.error.code === "37123") {
        //   return res.status(200).json({
        //     success: false,
        //     message: {
        //       en: "Insufficient game balance to complete withdrawal.",
        //       zh: "游戏余额不足，无法完成提款。",
        //       ms: "Baki permainan tidak mencukupi untuk melengkapkan pengeluaran.",
        //       zh_hk: "遊戲餘額不足，無法完成提款。",
        //       id: "Saldo permainan tidak mencukupi untuk menyelesaikan penarikan.",
        //     },
        //   });
        // }

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
        "GRAND DRAGON",
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
      console.log("GRAND DRAGON error in transferout", error.message);
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
  "/admin/api/huawei/:userId/withdraw",
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

      if (!user.huaweiGameID) {
        return res.status(200).json({
          success: false,
          message: {
            en: "GRAND DRAGON: Game account not registered. Please register an account first to proceed.",
            zh: "GRAND DRAGON: 游戏账户未注册。请先注册账户以继续。",
            ms: "GRAND DRAGON: Akaun permainan tidak berdaftar. Sila daftar akaun terlebih dahulu untuk meneruskan.",
            zh_hk: "GRAND DRAGON: 遊戲帳戶未註冊。請先註冊帳戶以繼續。",
            id: "GRAND DRAGON: Akun permainan belum terdaftar. Silakan daftar akun terlebih dahulu untuk melanjutkan.",
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
      const withdrawResponse = await huaweiWithdraw(
        user,
        formattedWithdrawAmount
      );

      if (!withdrawResponse.success) {
        console.error(
          "GRAND DRAGON: Withdraw failed -",
          withdrawResponse.error
        );

        // if (withdrawResponse.error.error.code === "37123") {
        //   return res.status(200).json({
        //     success: false,
        //     message: {
        //       en: "Insufficient game balance to complete withdrawal.",
        //       zh: "游戏余额不足，无法完成提款。",
        //       ms: "Baki permainan tidak mencukupi untuk melengkapkan pengeluaran.",
        //       zh_hk: "遊戲餘額不足，無法完成提款。",
        //       id: "Saldo permainan tidak mencukupi untuk menyelesaikan penarikan.",
        //     },
        //   });
        // }

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
        const gameBalance = await huaweiCheckBalance(user);

        await GameWalletLogAttempt(
          user.username,
          "Transfer Out",
          "Transfer",
          roundToTwoDecimals(formattedWithdrawAmount),
          "GRAND DRAGON",
          roundToTwoDecimals(gameBalance?.balance ?? 0),
          roundToTwoDecimals(user.wallet),
          roundToTwoDecimals(updatedUser.wallet)
        );
      } catch (logError) {
        console.error(
          "GRAND DRAGON: Failed to log transaction:",
          logError.message
        );
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
      console.log("GRAND RAGON error in transferout", error.message);
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
  "/admin/api/huawei/:userId/checkbalance",
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

      const balanceResponse = await huaweiCheckBalance(user);

      if (!balanceResponse.success) {
        return res.status(200).json({
          success: false,
          message: {
            en: "GRAND DRAGON: Failed to retrieve balance. Please try again.",
            zh: "GRAND DRAGON: 获取余额失败。请重试。",
            ms: "GRAND DRAGON: Gagal mendapatkan baki. Sila cuba lagi.",
            zh_hk: "GRAND DRAGON: 獲取餘額失敗。請重試。",
            id: "GRAND DRAGON: Gagal mengambil saldo. Silakan coba lagi.",
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
      console.error("GRAND DRAGON error checking user balance", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "GRAND DRAGON: Failed to retrieve balance. Please try again.",
          zh: "GRAND DRAGON: 获取余额失败。请重试。",
          ms: "GRAND DRAGON: Gagal mendapatkan baki. Sila cuba lagi.",
          zh_hk: "GRAND DRAGON: 獲取餘額失敗。請重試。",
          id: "GRAND DRAGON: Gagal mengambil saldo. Silakan coba lagi.",
        },
      });
    }
  }
);

router.post("/api/alipay/getturnoverforrebate", async (req, res) => {
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

    const records = await LotteryHuaweiModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
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
        gamename: "ALIPAY",
        gamecategory: "Lottery",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("ALIPAY: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "ALIPAY: Failed to fetch win/loss report",
        zh: "ALIPAY: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/alipay/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await LotteryHuaweiModal.find({
        username: user.username,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
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
          gamename: "ALIPAY",
          gamecategory: "Lottery",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("ALIPAY: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "ALIPAY: Failed to fetch win/loss report",
          zh: "ALIPAY: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/alipay/:userId/gamedata",
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
          gameCategories["Lottery"] &&
          gameCategories["Lottery"] instanceof Map
        ) {
          const slotGames = Object.fromEntries(gameCategories["Lottery"]);

          if (slotGames["ALIPAY"]) {
            totalTurnover += slotGames["ALIPAY"].turnover || 0;
            totalWinLoss += slotGames["ALIPAY"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "ALIPAY",
          gamecategory: "Lottery",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("ALIPAY: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "ALIPAY: Failed to fetch win/loss report",
          zh: "ALIPAY: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/alipay/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await LotteryHuaweiModal.find({
        createdAt: {
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
          gamename: "ALIPAY",
          gamecategory: "Lottery",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("ALIPAY: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "ALIPAY: Failed to fetch win/loss report",
          zh: "ALIPAY: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/alipay/kioskreport",
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
          gameCategories["Lottery"] &&
          gameCategories["Lottery"] instanceof Map
        ) {
          const liveCasino = Object.fromEntries(gameCategories["Lottery"]);

          if (liveCasino["ALIPAY"]) {
            totalTurnover += Number(liveCasino["ALIPAY"].turnover || 0);
            totalWinLoss += Number(liveCasino["ALIPAY"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "ALIPAY",
          gamecategory: "Lottery",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("ALIPAY: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "ALIPAY: Failed to fetch win/loss report",
          zh: "ALIPAY: 获取盈亏报告失败",
        },
      });
    }
  }
);

// const fetchAcceptedBetsCron = () => {
//   cron.schedule("*/1 * * * *", async () => {
//     try {
//       const today = moment
//         .utc()
//         .add(8, "hours")
//         .startOf("day")
//         .format("YYYY-MM-DD");
//       const yesterday = moment
//         .utc()
//         .add(8, "hours")
//         .subtract(1, "days")
//         .startOf("day")
//         .format("YYYY-MM-DD");

//       // Get data from last 3 days to ensure we catch all settled bets
//       const threeDaysAgo = moment
//         .utc()
//         .add(8, "hours")
//         .subtract(7, "days")
//         .startOf("day")
//         .format("YYYY-MM-DD");

//       const payload = {
//         betting_dates: {
//           from: threeDaysAgo,
//           to: today,
//         },
//         mid: huaweiUsername,
//         pw: huaweiPassword,
//       };

//       const response = await axios.post(
//         `${huaweiAPIURL}wallet_member_query_bet_detail`,
//         payload,
//         {
//           headers: {
//             "Content-Type": "application/json",
//           },
//         }
//       );

//       if (response.data.status.success !== true) {
//         console.error("❌ Failed to fetch betting data from AP95");
//         return;
//       }

//       const bets = response.data.bets || [];

//       if (bets.length === 0) {
//         return;
//       }

//       // Separate bets by status
//       const acceptedBets = bets.filter((bet) => bet.status === "A");
//       const settledBets = bets.filter((bet) => bet.status === "P");

//       // Get unique mids for user lookup
//       const allMids = [...new Set(bets.map((bet) => bet.mid))];

//       // Batch query users
//       const users = await User.find({
//         alipayGameID: { $in: allMids },
//       })
//         .select("username alipayGameID")
//         .lean();

//       const midToUsernameMap = new Map(
//         users.map((user) => [user.alipayGameID, user.username])
//       );

//       let newBetsCount = 0;
//       let updatedBetsCount = 0;
//       let skippedBetsCount = 0;

//       // PART 1: Process ACCEPTED bets (status = 'A') - Create new records
//       if (acceptedBets.length > 0) {
//         // Batch check for existing tranIds to improve performance
//         const acceptedTranIds = acceptedBets.map((bet) => bet.bd_id.toString());
//         const existingBets = await LotteryHuaweiModal.find({
//           tranId: { $in: acceptedTranIds },
//         })
//           .select("tranId")
//           .lean();

//         const existingTranIdsSet = new Set(
//           existingBets.map((bet) => bet.tranId)
//         );

//         // Prepare new bet records
//         const newBetRecords = [];

//         for (const bet of acceptedBets) {
//           const username = midToUsernameMap.get(bet.mid);

//           if (!username) {
//             continue;
//           }

//           // Check if bet already exists using tranId (bd_id)
//           if (existingTranIdsSet.has(bet.bd_id.toString())) {
//             skippedBetsCount++;
//             continue; // Skip if already exists
//           }

//           // Prepare new bet record
//           const newBetRecord = {
//             tranId: bet.bd_id.toString(), // bd_id as tranId (unique)
//             betamount: bet.accepted_amount || 0, // accepted_amount
//             settleamount: 0, // Will be updated when settled
//             username: username, // Found from User schema
//             bet: true, // Always true
//             resultDate: new Date(bet.result_date), // result_date
//             betDate: new Date(bet.betting_date), // betting_date
//           };

//           newBetRecords.push(newBetRecord);
//         }

//         // Batch insert new bet records
//         if (newBetRecords.length > 0) {
//           try {
//             const insertResult = await LotteryHuaweiModal.insertMany(
//               newBetRecords,
//               {
//                 ordered: false, // Continue inserting even if some fail due to duplicates
//               }
//             );
//             newBetsCount = insertResult.length;
//           } catch (insertError) {
//             // Handle duplicate key errors gracefully
//             if (insertError.code === 11000) {
//               // Some bets were inserted, some were duplicates
//               const insertedCount = insertError.insertedDocs
//                 ? insertError.insertedDocs.length
//                 : 0;
//               newBetsCount = insertedCount;
//             } else {
//               console.error(`❌ Error inserting bets:`, insertError.message);
//             }
//           }
//         }
//       }

//       // PART 2: Process SETTLED bets (status = 'P') - Update existing records
//       if (settledBets.length > 0) {
//         for (const bet of settledBets) {
//           const username = midToUsernameMap.get(bet.mid);

//           if (!username) {
//             continue;
//           }

//           const updatedBet = await LotteryHuaweiModal.findOneAndUpdate(
//             {
//               tranId: bet.bd_id.toString(),
//             },
//             {
//               $set: {
//                 settleamount: bet.winning_amount || 0, // winning_amount
//                 settle: true, // Set settle to true when status = 'P'
//               },
//             },
//             {
//               new: true, // Return updated document
//             }
//           );

//           if (updatedBet) {
//             updatedBetsCount++;
//           } else {
//             try {
//               const newSettledBet = new LotteryHuaweiModal({
//                 tranId: bet.bd_id.toString(),
//                 betamount: bet.accepted_amount || 0, // Use accepted_amount from settled bet data
//                 settleamount: bet.winning_amount || 0, // winning_amount
//                 username: username,
//                 bet: true,
//                 settle: true, // Mark as settled since status = 'P'
//                 resultDate: new Date(bet.result_date),
//                 betDate: new Date(bet.betting_date),
//               });

//               await newSettledBet.save();
//               newBetsCount++; // Count as new bet
//             } catch (saveError) {
//               if (saveError.code === 11000) {
//               } else {
//                 console.error(
//                   `❌ Error creating settled bet ${bet.bd_id}:`,
//                   saveError.message
//                 );
//               }
//             }
//           }
//         }
//       }
//     } catch (error) {
//       console.error("❌ Error in complete lottery cron:", error.message);
//     }
//   });
// };
module.exports = router;

// module.exports.fetchAcceptedBetsCron = fetchAcceptedBetsCron;
