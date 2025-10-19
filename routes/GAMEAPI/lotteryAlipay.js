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
const LotteryAP95Modal = require("../../models/lottery_ap95.mode");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const GameWalletLog = require("../../models/gamewalletlog.model");
const Decimal = require("decimal.js");
const cron = require("node-cron");
require("dotenv").config();

const webURL = "https://www.oc7.me/";
const alipayAPIURL = "https://api.ap95.org/api/";
const alipayUsername = "oc7api";
const alipayPassword = process.env.ALIPAY_PASS;

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function getCurrentFormattedDate() {
  return moment.utc().format("YYYY-MM-DD HH:mm:ss");
}

const generateRandomCode = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 18; i++) {
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

async function registerAlipayUser(user) {
  try {
    const generatedToken = generateRandomCode();

    const payload = {
      name: user.username,
      token: generatedToken,
      commission_lvl: 0.0,
      mid: alipayUsername,
      pw: alipayPassword,
    };

    const response = await axios.post(
      `${alipayAPIURL}wallet_member_create`,
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
      data: response.data,
      alipayusername: response.data.member.mid,
      alipaytoken: response.data.member.token,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

const checkAlipayBalance = async (username) => {
  try {
    const user = await User.findOne({ username });

    if (!user.alipayGameID) {
      return {
        success: true,
        balance: 0,
        response: "",
      };
    }

    if (!user) {
      return { success: false, balance: 0 };
    }

    const payload = {
      target_mid: user.alipayGameID,
      mid: alipayUsername,
      pw: alipayPassword,
    };

    const response = await axios.post(
      `${alipayAPIURL}wallet_member_query`,
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
    console.error("Alipay error checking user balance", error.message);
    return { success: false, balance: 0 };
  }
};

router.post("/api/alipay/register", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user.alipayGameID) {
      const registerData = await registerAlipayUser(user);

      if (!registerData.success) {
        console.log(
          `ALIPAY error in registering account ${registerData.error}`
        );
        return res.status(200).json({
          success: false,
          en: "ALIPAY: Account registration failed. Please try again or contact customer service for assistance.",
          zh: "ALIPAY：账户注册失败，请重试或联系客服以获取帮助。",
          ms: "ALIPAY: Pendaftaran akaun gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        });
      }

      await User.findOneAndUpdate(
        { username: user.username },
        {
          $set: {
            alipayGameID: registerData.alipayusername,
            alipayGameToken: registerData.alipaytoken,
          },
        }
      );
    }

    return res.status(200).json({
      success: true,
      message: {
        en: "ALIPAY: Account registered successfully.",
        zh: "ALIPAY：账户注册成功。",
        ms: "ALIPAY: Akaun berjaya didaftarkan.",
      },
    });
  } catch (error) {
    console.log("ALIPAY error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "ALIPAY: Account registration failed. Please try again or contact customer service for assistance.",
        zh: "ALIPAY：账户注册失败，请重试或联系客服以获取帮助。",
        ms: "ALIPAY: Pendaftaran akaun gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/alipay/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang } = req.body;
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (user.gameStatus.alipay.transferInStatus) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
        },
      });
    }

    if (!user.alipayGameID) {
      return res.status(200).json({
        success: false,
        message: {
          en: "ALIPAY: No account found. Please register to continue.",
          zh: "ALIPAY：未找到账户。请先注册以继续。",
          ms: "ALIPAY: Akaun tidak dijumpai. Sila daftar untuk meneruskan.",
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
    }

    const payload = {
      token: user.alipayGameToken,
      return_url: webURL,
      target_mid: user.alipayGameID,
      mid: alipayUsername,
      pw: alipayPassword,
    };

    const launchGameResponse = await axios.post(
      `${alipayAPIURL}wallet_member_gen_launch_url/${lang}`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (launchGameResponse.data.status.success !== true) {
      console.log("ALIPAY error in launching game", launchGameResponse.data);
      return res.status(200).json({
        success: false,
        message: {
          en: "ALIPAY: Game launch failed. Please try again or contact customer service for assistance.",
          zh: "ALIPAY: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "ALIPAY: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
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
      },
    });
  } catch (error) {
    console.log("ALIPAY error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "ALIPAY: Game launch failed. Please try again or customer service for assistance.",
        zh: "ALIPAY: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "ALIPAY: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/alipay/checkbalance", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user.alipayGameID) {
      return res.status(200).json({
        success: true,
        balance: 0,
        message: {
          en: "Balance retrieved successfully.",
          zh: "余额查询成功。",
          ms: "Baki berjaya diperoleh.",
        },
      });
    }

    const payload = {
      target_mid: user.alipayGameID,
      mid: alipayUsername,
      pw: alipayPassword,
    };

    const response = await axios.post(
      `${alipayAPIURL}wallet_member_query`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.status.success !== true) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Balance check unsuccessful. Please try again or contact customer service for assistance.",
          zh: "查询余额失败。请重试或联系客服以获得帮助。",
          ms: "Semakan baki tidak berjaya. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    return res.status(200).json({
      success: true,
      balance: roundToTwoDecimals(response.data.member.credit_available),
      message: {
        en: "Balance retrieved successfully.",
        zh: "余额查询成功。",
        ms: "Baki berjaya diperoleh.",
      },
    });
  } catch (error) {
    console.error("Alipay error checking user balance", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "An error occurred while checking balance. Please try again later.",
        zh: "查询余额时发生错误，请稍后重试。",
        ms: "Ralat berlaku semasa menyemak baki. Sila cuba lagi kemudian.",
      },
    });
  }
});

router.post("/api/alipay/transferin", authenticateToken, async (req, res) => {
  let formattedDepositAmount = 0;
  try {
    const { transferAmount } = req.body;
    formattedDepositAmount = roundToTwoDecimals(transferAmount);

    if (isNaN(formattedDepositAmount) || formattedDepositAmount <= 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Deposit amount must be a positive number or greater than 0.",
          zh: "存款金额必须为正数且大于0。",
          ms: "Jumlah deposit mestilah nombor positif dan lebih besar daripada 0.",
        },
      });
    }

    let beforeUser = await User.findById(req.user.userId);

    if (!beforeUser.alipayGameID) {
      const registrationResult = await registerAlipayUser(beforeUser);

      if (!registrationResult.success) {
        console.log(registrationResult);
        console.log(
          `ALIPAY error in registering account ${registrationResult.error}`
        );
        return res.status(200).json({
          success: false,
          message: {
            en: "ALIPAY: Registration failed. Please try again or contact customer service for assistance.",
            zh: "ALIPAY: 注册失败，请重试或联系客服以获得帮助。",
            ms: "ALIPAY: Pendaftaran gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }

      await User.findOneAndUpdate(
        { username: beforeUser.username },
        {
          $set: {
            alipayGameID: registrationResult.alipayusername,
            alipayGameToken: registrationResult.alipaytoken,
          },
        }
      );
    }

    if (beforeUser.gameStatus.alipay.transferInStatus) {
      return res.status(200).json({
        success: false,
        message: {
          en: "The transfer status is locked. Please contact customer support for further assistance.",
          zh: "转账状态已锁定，请联系客服以获取进一步帮助。",
          ms: "Status pemindahan telah dikunci. Sila hubungi sokongan pelanggan untuk bantuan lanjut.",
        },
      });
    }

    const updatedUser = await User.findOneAndUpdate(
      {
        _id: req.user.userId,
        wallet: { $gte: formattedDepositAmount },
      },
      {
        $inc: { wallet: -formattedDepositAmount },
      },
      {
        new: true,
      }
    );

    if (!updatedUser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Insufficient balance to complete the transaction.",
          zh: "余额不足，无法完成交易。",
          ms: "Baki tidak mencukupi untuk melengkapkan transaksi.",
        },
      });
    }

    const payload = {
      topup_amount: formattedDepositAmount,
      target_mid: updatedUser.alipayGameID,
      mid: alipayUsername,
      pw: alipayPassword,
    };

    const response = await axios.post(
      `${alipayAPIURL}wallet_member_topup/en`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.status.success !== true) {
      console.log("ALIPAY transferin failed", response.data);

      await User.findOneAndUpdate(
        { _id: req.user.userId },
        { $inc: { wallet: formattedDepositAmount } }
      );

      return res.status(200).json({
        success: false,
        message: {
          en: "Deposit unsuccessful. Please try again or customer service for assistance.",
          zh: "存款失败。请重试或联系客服以获得帮助。",
          ms: "Deposit tidak berjaya. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    const gameBalance = await checkAlipayBalance(updatedUser.username);

    await GameWalletLogAttempt(
      updatedUser.username,
      "Transfer In",
      "Transfer",
      roundToTwoDecimals(formattedDepositAmount),
      "ALIPAY",
      roundToTwoDecimals(gameBalance.balance),
      roundToTwoDecimals(beforeUser.wallet),
      roundToTwoDecimals(updatedUser.wallet)
    );

    return res.status(200).json({
      success: true,
      message: {
        en: "Deposit completed successfully.",
        zh: "存款成功。",
        ms: "Deposit berjaya dilakukan.",
      },
    });
  } catch (error) {
    if (formattedDepositAmount > 0) {
      try {
        await User.findOneAndUpdate(
          { _id: req.user.userId },
          { $inc: { wallet: formattedDepositAmount } }
        );
      } catch (rollbackError) {
        console.log("Alipay Rollback failed:", rollbackError.message);
      }
    }

    console.log("Alipay error in transferin", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "Deposit unsuccessful. Please try again or customer service for assistance.",
        zh: "存款失败。请重试或联系客服以获得帮助。",
        ms: "Deposit tidak berjaya. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/admin/api/alipay/:userId/transferoutfixed",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { transferAmount } = req.body;
      let formattedWithdrawAmount = roundToTwoDecimals(transferAmount);

      if (isNaN(formattedWithdrawAmount) || formattedWithdrawAmount <= 0) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Withdraw amount must be a positive number or greater than 0.",
            zh: "提款金额必须为正数且大于0。",
            ms: "Jumlah pengeluaran mestilah nombor positif dan lebih besar daripada 0.",
          },
        });
      }

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

      if (!user.alipayGameID) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User has not registered yet. Please register before proceeding.",
            zh: "用户尚未注册，请先完成注册后再继续操作。",
            ms: "Pengguna belum berdaftar. Sila daftar terlebih dahulu sebelum meneruskan.",
          },
        });
      }

      const payload = {
        withdraw_amount: formattedWithdrawAmount,
        target_mid: user.alipayGameID,
        mid: alipayUsername,
        pw: alipayPassword,
      };

      const response = await axios.post(
        `${alipayAPIURL}wallet_member_withdraw/en`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.status.success !== true) {
        console.log("ALIPAY transferout failed", response.data);
        return res.status(200).json({
          success: false,
          message: {
            en: "Withdraw unsuccessful. Please try again or customer service for assistance.",
            zh: "提款失败。请重试或联系客服以获得帮助。",
            ms: "Pengeluaran tidak berjaya. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }

      const updatedUser = await User.findOneAndUpdate(
        { _id: userId },
        { $inc: { wallet: formattedWithdrawAmount } },
        { new: true }
      );

      const gameBalance = await checkAlipayBalance(user.username);

      if (gameBalance.success) {
        await GameWalletLogAttempt(
          updatedUser.username,
          "Transfer Out",
          "Transfer",
          roundToTwoDecimals(formattedWithdrawAmount),
          "ALIPAY",
          roundToTwoDecimals(gameBalance.balance),
          roundToTwoDecimals(user.wallet),
          roundToTwoDecimals(updatedUser.wallet)
        );
      } else {
        await GameWalletLogAttempt(
          updatedUser.username,
          "Transfer Out",
          "Transfer",
          roundToTwoDecimals(gameBalance.balance),
          "ALIPAY",
          "0",
          roundToTwoDecimals(user.wallet),
          roundToTwoDecimals(updatedUser.wallet)
        );
      }

      return res.status(200).json({
        success: true,
        message: {
          en: "Withdraw completed successfully.",
          zh: "提款成功。",
          ms: "Pengeluaran berjaya dilakukan.",
        },
      });
    } catch (error) {
      console.log("Alipay error in transferout", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "Withdraw unsuccessful. Please try again or customer service for assistance.",
          zh: "提款失败。请重试或联系客服以获得帮助。",
          ms: "Pengeluaran tidak berjaya. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/alipay/:userId/transferout",
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

      if (!user.alipayGameID) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User has not registered yet. Please register before proceeding.",
            zh: "用户尚未注册，请先完成注册后再继续操作。",
            ms: "Pengguna belum berdaftar. Sila daftar terlebih dahulu sebelum meneruskan.",
          },
        });
      }

      const gameBalance = await checkAlipayBalance(user.username);

      if (gameBalance.success) {
        if (gameBalance.balance === 0) {
          return res.status(200).json({
            success: false,
            message: {
              en: "No balance available to withdraw.",
              zh: "没有可提款的余额。",
              ms: "Tiada baki tersedia untuk pengeluaran.",
            },
          });
        }

        const payload = {
          withdraw_amount: gameBalance.balance,
          target_mid: user.alipayGameID,
          mid: alipayUsername,
          pw: alipayPassword,
        };

        const response = await axios.post(
          `${alipayAPIURL}wallet_member_withdraw/en`,
          payload,
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (response.data.status.success !== true) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Withdraw unsuccessful. Please try again or customer service for assistance.",
              zh: "提款失败。请重试或联系客服以获得帮助。",
              ms: "Pengeluaran tidak berjaya. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            },
          });
        }

        const updatedUser = await User.findOneAndUpdate(
          { _id: userId },
          { $inc: { wallet: gameBalance.balance } },
          { new: true }
        );

        await GameWalletLogAttempt(
          updatedUser.username,
          "Transfer Out",
          "Transfer",
          roundToTwoDecimals(gameBalance.balance),
          "ALIPAY",
          "0",
          roundToTwoDecimals(user.wallet),
          roundToTwoDecimals(updatedUser.wallet)
        );

        return res.status(200).json({
          success: true,
          message: {
            en: "Withdraw completed successfully.",
            zh: "提款成功。",
            ms: "Pengeluaran berjaya dilakukan.",
          },
        });
      } else {
        console.log("admin transfer out error Alipay", gameBalance);
        return res.status(200).json({
          success: false,
          message: {
            en: "Withdraw unsuccessful. Please try again or customer service for assistance.",
            zh: "提款失败。请重试或联系客服以获得帮助。",
            ms: "Pengeluaran tidak berjaya. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }
    } catch (error) {
      console.log("Alipay error in transferout", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "Withdraw unsuccessful. Please try again or customer service for assistance.",
          zh: "提款失败。请重试或联系客服以获得帮助。",
          ms: "Pengeluaran tidak berjaya. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post("/api/alipay/transferout", authenticateToken, async (req, res) => {
  try {
    const { transferAmount } = req.body;
    let formattedWithdrawAmount = roundToTwoDecimals(transferAmount);

    if (isNaN(formattedWithdrawAmount) || formattedWithdrawAmount <= 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Withdraw amount must be a positive number or greater than 0.",
          zh: "提款金额必须为正数且大于0。",
          ms: "Jumlah pengeluaran mestilah nombor positif dan lebih besar daripada 0.",
        },
      });
    }

    let user = await User.findById(req.user.userId);
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

    if (!user.alipayGameID) {
      const registrationResult = await registerAlipayUser(user);

      if (!registrationResult.success) {
        console.log(registrationResult);
        console.log(
          `ALIPAY error in registering account ${registrationResult.error}`
        );
        return res.status(200).json({
          success: false,
          message: {
            en: "ALIPAY: Registration failed. Please try again or contact customer service for assistance.",
            zh: "ALIPAY: 注册失败，请重试或联系客服以获得帮助。",
            ms: "ALIPAY: Pendaftaran gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }
      await User.findOneAndUpdate(
        { username: user.username },
        {
          $set: {
            alipayGameID: registrationResult.alipayusername,
            alipayGameToken: registrationResult.alipaytoken,
          },
        }
      );
    }

    if (user.gameStatus.alipay.transferOutStatus) {
      return res.status(200).json({
        success: false,
        message: {
          en: "The transfer status is locked. Please contact customer support for further assistance.",
          zh: "转账状态已锁定，请联系客服以获取进一步帮助。",
          ms: "Status pemindahan telah dikunci. Sila hubungi sokongan pelanggan untuk bantuan lanjut.",
        },
      });
    }

    const payload = {
      withdraw_amount: formattedWithdrawAmount,
      target_mid: user.alipayGameID,
      mid: alipayUsername,
      pw: alipayPassword,
    };

    const response = await axios.post(
      `${alipayAPIURL}wallet_member_withdraw/en`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.status.success !== true) {
      console.log("ALIPAY transferout failed", response.data);

      return res.status(200).json({
        success: false,
        message: {
          en: "Withdraw unsuccessful. Please try again or customer service for assistance.",
          zh: "提款失败。请重试或联系客服以获得帮助。",
          ms: "Pengeluaran tidak berjaya. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: req.user.userId },
      { $inc: { wallet: formattedWithdrawAmount } }
    );

    const gameBalance = await checkAlipayBalance(updatedUser.username);

    await GameWalletLogAttempt(
      updatedUser.username,
      "Transfer Out",
      "Transfer",
      roundToTwoDecimals(formattedWithdrawAmount),
      "ALIPAY",
      roundToTwoDecimals(gameBalance.balance),
      roundToTwoDecimals(user.wallet),
      roundToTwoDecimals(updatedUser.wallet)
    );

    return res.status(200).json({
      success: true,
      message: {
        en: "Withdraw completed successfully.",
        zh: "提款成功。",
        ms: "Pengeluaran berjaya dilakukan.",
      },
    });
  } catch (error) {
    console.log("Alipay error in transferout", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "Withdraw unsuccessful. Please try again or customer service for assistance.",
        zh: "提款失败。请重试或联系客服以获得帮助。",
        ms: "Pengeluaran tidak berjaya. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/admin/api/alipay/:userId/checkbalance",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.alipayGameID) {
        return res.status(200).json({
          success: true,
          balance: 0,
          message: {
            en: "Balance retrieved successfully.",
            zh: "余额查询成功。",
            ms: "Baki berjaya diperoleh.",
          },
        });
      }

      const payload = {
        target_mid: user.alipayGameID,
        mid: alipayUsername,
        pw: alipayPassword,
      };

      const response = await axios.post(
        `${alipayAPIURL}wallet_member_query`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.status.success !== true) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Balance check unsuccessful. Please try again or contact customer service for assistance.",
            zh: "查询余额失败。请重试或联系客服以获得帮助。",
            ms: "Semakan baki tidak berjaya. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        balance: roundToTwoDecimals(response.data.member.credit_available),
        message: {
          en: "Balance retrieved successfully.",
          zh: "余额查询成功。",
          ms: "Baki berjaya diperoleh.",
        },
      });
    } catch (error) {
      console.error("Alipay error checking user balance", error.message);
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

    const records = await LotteryAP95Modal.find({
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

      const records = await LotteryAP95Modal.find({
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

      const records = await LotteryAP95Modal.find({
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
//         mid: alipayUsername,
//         pw: alipayPassword,
//       };

//       const response = await axios.post(
//         `${alipayAPIURL}wallet_member_query_bet_detail`,
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
//         const existingBets = await LotteryAP95Modal.find({
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
//             const insertResult = await LotteryAP95Modal.insertMany(
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

//           const updatedBet = await LotteryAP95Modal.findOneAndUpdate(
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
//               const newSettledBet = new LotteryAP95Modal({
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
