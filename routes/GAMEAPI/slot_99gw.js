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
const slotGW99Modal = require("../../models/slot_gw99.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const qs = require("querystring");
const GameWalletLog = require("../../models/gamewalletlog.model");

require("dotenv").config();

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
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

const gw99AgentName = "JKL_BB12001";
const gw99SecretKey = process.env.GW99_SECRET;
const webURL = "https://www.oc7.me/";
const gw99APIURL = "https://gw99api.com";

function generateUniqueTransactionId(prefix) {
  const uuid = uuidv4().replace(/-/g, "");
  return `${prefix}-${uuid.substring(0, 8)}`;
}

function generateSignature(params) {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  // Correctly add &PrivateKey=xxx
  const signString = `${sortedParams}&PrivateKey=${gw99SecretKey}`;

  const hash = crypto.createHash("sha256").update(signString, "utf8").digest();
  const signature = Buffer.from(hash).toString("base64");

  return signature;
}

function generateRandomPassword() {
  const randomNumber = crypto.randomInt(1000, 10000);

  return `oc7${randomNumber}`;
}

function generateCustomerId() {
  const validChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  let customerId = "";

  // Add 5 random characters
  for (let i = 0; i < 5; i++) {
    // Get random index into validChars
    const randomIndex = crypto.randomInt(0, validChars.length);

    // Add the random character to the ID
    customerId += validChars.charAt(randomIndex);
  }

  return customerId;
}

async function generateUniqueCustomerId() {
  let customerId;
  let isUnique = false;

  while (!isUnique) {
    customerId = generateCustomerId();

    const existingUser = await User.findOne({ customerId });

    if (!existingUser) {
      isUnique = true;
    }
  }

  return customerId;
}

async function registerGw99User(user) {
  try {
    if (user.gw99GameID) {
      return {
        success: true,
        userData: {
          userId: user.gw99GameID,
          password: user.gw99GamePW,
        },
      };
    }

    if (!user.customerId) {
      const customerId = generateCustomerId();

      const existingUser = await User.findOne({ customerId });

      if (existingUser) {
        let isUnique = false;
        let newCustomerId;

        while (!isUnique) {
          newCustomerId = generateCustomerId();
          const checkUser = await User.findOne({ customerId: newCustomerId });
          if (!checkUser) {
            isUnique = true;
          }
        }

        await User.findByIdAndUpdate(user._id, { customerId: newCustomerId });
      } else {
        await User.findByIdAndUpdate(user._id, { customerId });
      }
      user = await User.findById(user._id);
    }

    const randomPass = generateRandomPassword();

    const requestBody = {
      Agent: gw99AgentName,
      Password: randomPass,
      PlayerAccount: user.customerId,
    };

    const signature = generateSignature(requestBody);

    const response = await axios.post(
      `${gw99APIURL}/Api/IGame/Player/Create`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json",
          merchantName: gw99AgentName,
          signature: signature,
        },
      }
    );

    if (response.data.result.code === 0) {
      // Store previous game ID if exists
      if (user.gw99GameID) {
        user.pastGw99GameID.push(user.gw99GameID);
        user.pastGw99GamePW.push(user.gw99GamePW);
      }

      // Update with new game credentials
      user.gw99GameID = `${gw99AgentName}${user.customerId}`;
      user.gw99GamePW = randomPass;

      await user.save();

      return {
        success: true,
        message: {
          en: "User Registered Successfully",
          zh: "用户注册成功",
          ms: "Pendaftaran pengguna berjaya",
        },
        userData: {
          userId: `${gw99AgentName}${user.customerId}`,
          password: randomPass,
        },
      };
    } else {
      console.log(response.data, "GW99 Registration Failed");
      return {
        success: false,
        message: {
          en: "GW99: Registration failed. Please try again or contact customer service for assistance.",
          zh: "GW99: 注册失败，请重试或联系客服以获得帮助。",
          ms: "GW99: Pendaftaran gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      };
    }
  } catch (error) {
    console.log("GW99 error in registering user", error.message);
    return {
      success: false,
      message: {
        en: "GW99: Registration failed. Please try again or contact customer service for assistance.",
        zh: "GW99: 注册失败，请重试或联系客服以获得帮助。",
        ms: "GW99: Pendaftaran gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    };
  }
}

async function checkGW99Balance(user) {
  try {
    if (!user.gw99GameID) {
      return {
        success: true,
        balance: 0,
        response: "",
      };
    }

    const requestBody = {
      PlayerAccount: user.gw99GameID,
    };

    const signature = generateSignature(requestBody);

    const response = await axios.post(
      `${gw99APIURL}/Api/IGame/Player/Info`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json",
          merchantName: gw99AgentName,
          signature: signature,
        },
      }
    );

    return {
      success: response.data.result.code === 0,
      balance: response.data.data.balance || 0,
      response: response.data,
    };
  } catch (error) {
    console.error("GW99 error checking user balance", error.message);
    return { success: false, balance: 0 };
  }
}

router.post(
  "/admin/api/gw99/:userId/transferoutfixed",
  authenticateAdminToken,
  async (req, res) => {
    let formattedWithdrawAmount = 0;
    try {
      const { transferAmount } = req.body;
      formattedWithdrawAmount = roundToTwoDecimals(transferAmount);

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

      if (!user.gw99GameID) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User has not registered yet. Please register before proceeding.",
            zh: "用户尚未注册，请先完成注册后再继续操作。",
            ms: "Pengguna belum berdaftar. Sila daftar terlebih dahulu sebelum meneruskan.",
          },
        });
      }

      const txId = generateUniqueTransactionId("withdraw");

      const requestBody = {
        PlayerAccount: user.gw99GameID,
        Amount: -formattedWithdrawAmount,
        ExternalTransactionId: txId,
      };
      const signature = generateSignature(requestBody);

      const response = await axios.post(
        `${gw99APIURL}/Api/IGame/Transaction/Create`,
        requestBody,
        {
          headers: {
            "Content-Type": "application/json",
            merchantName: gw99AgentName,
            signature: signature,
          },
        }
      );

      if (response.data.result.code !== "0") {
        console.log("GW99 transferout failed", response.data);

        if (response.data.result.code === "-90618") {
          return res.status(200).json({
            success: false,
            message: {
              en: "Please wait 15 seconds before retrying to avoid spamming.",
              zh: "请等待15秒后再重试，以避免重复提交。",
              ms: "Sila tunggu 15 saat sebelum mencuba semula untuk mengelakkan spam.",
            },
          });
        }

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

      const gameBalance = await checkGW99Balance(updatedUser);

      if (gameBalance.success) {
        await GameWalletLogAttempt(
          updatedUser.username,
          "Transfer Out",
          "Transfer",
          roundToTwoDecimals(formattedWithdrawAmount),
          "GW99",
          roundToTwoDecimals(gameBalance.balance),
          roundToTwoDecimals(beforeUser.wallet),
          roundToTwoDecimals(updatedUser.wallet)
        );
      } else {
        await GameWalletLogAttempt(
          updatedUser.username,
          "Transfer Out",
          "Transfer",
          roundToTwoDecimals(gameBalance.balance),
          "GW99",
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
      console.log("GW99 error in transferout", error.message);
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
  "/admin/api/gw99/:userId/transferout",
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

      if (!user.gw99GameID) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User has not registered yet. Please register before proceeding.",
            zh: "用户尚未注册，请先完成注册后再继续操作。",
            ms: "Pengguna belum berdaftar. Sila daftar terlebih dahulu sebelum meneruskan.",
          },
        });
      }

      const gameBalance = await checkGW99Balance(user);

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

        const txId = generateUniqueTransactionId("withdraw");

        const requestBody = {
          PlayerAccount: user.gw99GameID,
          Amount: -gameBalance.balance,
          ExternalTransactionId: txId,
        };

        const signature = generateSignature(requestBody);

        const response = await axios.post(
          `${gw99APIURL}/Api/IGame/Transaction/Create`,
          requestBody,
          {
            headers: {
              "Content-Type": "application/json",
              merchantName: gw99AgentName,
              signature: signature,
            },
          }
        );

        if (response.data.result.code !== "0") {
          console.log("GW99 transferout failed", response.data);

          if (response.data.result.code === "-90618") {
            return res.status(200).json({
              success: false,
              message: {
                en: "Please wait 15 seconds before retrying to avoid spamming.",
                zh: "请等待15秒后再重试，以避免重复提交。",
                ms: "Sila tunggu 15 saat sebelum mencuba semula untuk mengelakkan spam.",
              },
            });
          }

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
          "GW99",
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
        console.log("admin transfer out error GW99", gameBalance);
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
      console.log("GW99 error in transferout", error.message);
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

// Route: Create New Player
router.post("/api/gw99/register", authenticateToken, async (req, res) => {
  try {
    let user = await User.findById(req.user.userId);

    if (user.gw99GameID) {
      return res.status(200).json({
        success: true,
        userData: {
          userId: user.gw99GameID,
          password: user.gw99GamePW,
        },
      });
    }

    if (!user.customerId) {
      const customerId = generateCustomerId();

      const existingUser = await User.findOne({ customerId });

      if (existingUser) {
        let isUnique = false;
        let newCustomerId;

        while (!isUnique) {
          newCustomerId = generateCustomerId();
          const checkUser = await User.findOne({ customerId: newCustomerId });
          if (!checkUser) {
            isUnique = true;
          }
        }

        await User.findByIdAndUpdate(user._id, { customerId: newCustomerId });
      } else {
        await User.findByIdAndUpdate(user._id, { customerId });
      }
      user = await User.findById(user._id);
    }

    const randomPass = generateRandomPassword();

    // Prepare parameters
    const requestBody = {
      Agent: gw99AgentName,
      Password: randomPass,
      PlayerAccount: user.customerId,
    };

    // Generate signature
    const signature = generateSignature(requestBody);

    // Make API request
    const response = await axios.post(
      `${gw99APIURL}/Api/IGame/Player/Create`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json",
          merchantName: gw99AgentName,
          signature: signature,
        },
      }
    );

    if (response.data.result.code === 0) {
      // Store previous game ID if exists
      if (user.gw99GameID) {
        user.pastGw99GameID = user.pastGw99GameID || [];
        user.pastGw99GameID.push(user.gw99GameID);

        user.pastGw99GamePW = user.pastGw99GamePW || [];
        user.pastGw99GamePW.push(user.gw99GamePW);
      }

      // Update with new game credentials
      user.gw99GameID = `${gw99AgentName}${user.customerId}`;
      user.gw99GamePW = randomPass;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: "User Registered Successfully",
          zh: "用户注册成功",
          ms: "Pendaftaran pengguna berjaya",
        },
        userData: {
          userId: `${gw99AgentName}${user.customerId}`,
          password: randomPass,
        },
      });
    } else {
      console.log(response.data, "GW99 Registration Failed");

      return res.status(200).json({
        success: false,
        message: {
          en: "GW99: Registration failed. Please try again or contact customer service for assistance.",
          zh: "GW99: 注册失败，请重试或联系客服以获得帮助。",
          ms: "GW99: Pendaftaran gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
  } catch (error) {
    console.log("GW99 error in registering user", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "GW99: Registration failed. Please try again or contact customer service for assistance.",
        zh: "GW99: 注册失败，请重试或联系客服以获得帮助。",
        ms: "GW99: Pendaftaran gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/gw99/transferin", authenticateToken, async (req, res) => {
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

    if (!beforeUser.gw99GameID) {
      const registrationResult = await registerGw99User(beforeUser);

      if (!registrationResult.success) {
        return res.status(200).json(registrationResult);
      }

      beforeUser = await User.findById(req.user.userId);
    }

    if (beforeUser.gameStatus.gw99.transferInStatus) {
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

    const txId = generateUniqueTransactionId("deposit");

    const requestBody = {
      PlayerAccount: updatedUser.gw99GameID,
      Amount: formattedDepositAmount,
      ExternalTransactionId: txId,
    };
    const signature = generateSignature(requestBody);

    const response = await axios.post(
      `${gw99APIURL}/Api/IGame/Transaction/Create`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json",
          merchantName: gw99AgentName,
          signature: signature,
        },
      }
    );

    if (response.data.result.code !== "0") {
      console.log("GW99 transferin failed", response.data);
      await User.findOneAndUpdate(
        { _id: req.user.userId },
        { $inc: { wallet: formattedDepositAmount } }
      );

      if (response.data.result.code === "-90618") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Please wait 15 seconds before retrying to avoid spamming.",
            zh: "请等待15秒后再重试，以避免重复提交。",
            ms: "Sila tunggu 15 saat sebelum mencuba semula untuk mengelakkan spam.",
          },
        });
      }

      return res.status(200).json({
        success: false,
        message: {
          en: "Deposit unsuccessful. Please try again or customer service for assistance.",
          zh: "存款失败。请重试或联系客服以获得帮助。",
          ms: "Deposit tidak berjaya. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    const gameBalance = await checkGW99Balance(updatedUser);

    await GameWalletLogAttempt(
      updatedUser.username,
      "Transfer In",
      "Transfer",
      roundToTwoDecimals(formattedDepositAmount),
      "GW99",
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
        console.log("GW99 Rollback failed:", rollbackError.message);
      }
    }

    console.log("GW99 error in transferin", error.message);
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

router.post("/api/gw99/transferout", authenticateToken, async (req, res) => {
  let formattedWithdrawAmount = 0;
  try {
    const { transferAmount } = req.body;
    formattedWithdrawAmount = roundToTwoDecimals(transferAmount);

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

    if (!user.gw99GameID) {
      const registrationResult = await registerGw99User(user);

      if (!registrationResult.success) {
        console.log(registrationResult);
        console.log(
          `GW99 error in registering account ${registrationResult.error}`
        );
        return res.status(200).json({
          success: false,
          message: {
            en: "GW99: Registration failed. Please try again or contact customer service for assistance.",
            zh: "GW99: 注册失败，请重试或联系客服以获得帮助。",
            ms: "GW99: Pendaftaran gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }
    }

    if (user.gameStatus.gw99.transferOutStatus) {
      return res.status(200).json({
        success: false,
        message: {
          en: "The transfer status is locked. Please contact customer support for further assistance.",
          zh: "转账状态已锁定，请联系客服以获取进一步帮助。",
          ms: "Status pemindahan telah dikunci. Sila hubungi sokongan pelanggan untuk bantuan lanjut.",
        },
      });
    }

    const txId = generateUniqueTransactionId("withdraw");

    const requestBody = {
      PlayerAccount: user.gw99GameID,
      Amount: -formattedWithdrawAmount,
      ExternalTransactionId: txId,
    };
    const signature = generateSignature(requestBody);

    const response = await axios.post(
      `${gw99APIURL}/Api/IGame/Transaction/Create`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json",
          merchantName: gw99AgentName,
          signature: signature,
        },
      }
    );

    if (response.data.result.code !== "0") {
      console.log("GW99 transferout failed", response.data);

      if (response.data.result.code === "-90618") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Please wait 15 seconds before retrying to avoid spamming.",
            zh: "请等待15秒后再重试，以避免重复提交。",
            ms: "Sila tunggu 15 saat sebelum mencuba semula untuk mengelakkan spam.",
          },
        });
      }

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
      { $inc: { wallet: formattedWithdrawAmount } },
      { new: true }
    );

    const gameBalance = await checkGW99Balance(updatedUser);

    await GameWalletLogAttempt(
      updatedUser.username,
      "Transfer Out",
      "Transfer",
      roundToTwoDecimals(formattedWithdrawAmount),
      "GW99",
      roundToTwoDecimals(gameBalance.balance),
      roundToTwoDecimals(beforeUser.wallet),
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
    console.log("GW99 error in transferout", error.message);
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

router.post("/api/gw99/checkbalance", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user.gw99GameID) {
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

    const requestBody = {
      PlayerAccount: user.gw99GameID,
    };

    const signature = generateSignature(requestBody);

    const response = await axios.post(
      `${gw99APIURL}/Api/IGame/Player/Info`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json",
          merchantName: gw99AgentName,
          signature: signature,
        },
      }
    );

    if (response.data.result.code !== 0) {
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
      balance: roundToTwoDecimals(response.data.data.balance),
      message: {
        en: "Balance retrieved successfully.",
        zh: "余额查询成功。",
        ms: "Baki berjaya diperoleh.",
      },
    });
  } catch (error) {
    console.error("GW99 error checking user balance", error.message);
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

router.post(
  "/admin/api/gw99/:userId/checkbalance",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gw99GameID) {
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

      const requestBody = {
        PlayerAccount: user.gw99GameID,
      };

      const signature = generateSignature(requestBody);

      const response = await axios.post(
        `${gw99APIURL}/Api/IGame/Player/Info`,
        requestBody,
        {
          headers: {
            "Content-Type": "application/json",
            merchantName: gw99AgentName,
            signature: signature,
          },
        }
      );

      if (response.data.result.code !== 0) {
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
        balance: roundToTwoDecimals(response.data.data.balance),
        message: {
          en: "Balance retrieved successfully.",
          zh: "余额查询成功。",
          ms: "Baki berjaya diperoleh.",
        },
      });
    } catch (error) {
      console.error("GW99 error checking user balance", error.message);
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

router.post(
  "/admin/api/gw99/setAsMain",
  authenticateAdminToken,
  async (req, res) => {
    const { selectedGameId, selectedPassword } = req.body;

    try {
      const user = await User.findOne({
        pastGw99GameID: { $in: [selectedGameId] },
      });

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
      if (user.gw99GameID && user.gw99GamePW) {
        user.pastGw99GameID.push(user.gw99GameID);
        user.pastGw99GamePW.push(user.gw99GamePW);
      }

      const indexToRemove = user.pastGw99GameID.indexOf(selectedGameId);
      if (indexToRemove > -1) {
        user.pastGw99GameID.splice(indexToRemove, 1);
        user.pastGw99GamePW.splice(indexToRemove, 1);
      }

      user.gw99GameID = selectedGameId;
      user.gw99GamePW = selectedPassword;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: "GW99 ID and password set as main successfully.",
          zh: "GW99账号和密码已成功设置为主账号。",
          ms: "ID dan kata laluan GW99 berjaya ditetapkan sebagai utama.",
        },
      });
    } catch (error) {
      console.error("Error occurred while setting main GW99 ID:", error);
      return res.status(200).json({
        success: false,
        message: {
          en: "Internal server error. Please try again later.",
          zh: "内部服务器错误。请稍后再试。",
          ms: "Ralat pelayan dalaman. Sila cuba lagi nanti.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/gw99/:userId/registeradmin",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      let user = await User.findById(userId);

      if (!user.customerId) {
        const customerId = generateCustomerId();

        const existingUser = await User.findOne({ customerId });

        if (existingUser) {
          let isUnique = false;
          let newCustomerId;

          while (!isUnique) {
            newCustomerId = generateCustomerId();
            const checkUser = await User.findOne({ customerId: newCustomerId });
            if (!checkUser) {
              isUnique = true;
            }
          }

          await User.findByIdAndUpdate(user._id, { customerId: newCustomerId });
        } else {
          await User.findByIdAndUpdate(user._id, { customerId });
        }
        user = await User.findById(user._id);
      }

      const randomPass = generateRandomPassword();

      const requestBody = {
        Agent: gw99AgentName,
        Password: randomPass,
        PlayerAccount: user.customerId,
      };

      // Generate signature
      const signature = generateSignature(requestBody);

      user.pastGw99GameID = user.pastGw99GameID || [];
      user.pastGw99GamePW = user.pastGw99GamePW || [];

      const response = await axios.post(
        `${gw99APIURL}/Api/IGame/Player/Create`,
        requestBody,
        {
          headers: {
            "Content-Type": "application/json",
            merchantName: gw99AgentName,
            signature: signature,
          },
        }
      );

      if (response.data.result.code === 0) {
        if (user.gw99GameID) {
          user.pastGw99GameID = user.pastGw99GameID || [];
          user.pastGw99GameID.push(user.gw99GameID);

          user.pastGw99GamePW = user.pastGw99GamePW || [];
          user.pastGw99GamePW.push(user.gw99GamePW);
        }

        user.gw99GameID = `${gw99AgentName}${user.customerId}`;
        user.gw99GamePW = randomPass;

        await user.save();

        return res.status(200).json({
          success: true,
          message: {
            en: "User Registered Successfully",
            zh: "用户注册成功",
            ms: "Pendaftaran pengguna berjaya",
          },
          userData: {
            userId: `${gw99AgentName}${user.customerId}`,
            password: randomPass,
          },
        });
      } else {
        console.log(response.data, "GW99 Registration Failed");
        return res.status(200).json({
          success: false,
          message: {
            en: "GW99: Registration failed. Please try again or contact customer service for assistance.",
            zh: "GW99: 注册失败，请重试或联系客服以获得帮助。",
            ms: "GW99: Pendaftaran gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }
    } catch (error) {
      console.log("GW99 error in registering user", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "GW99: Registration failed. Please try again or contact customer service for assistance.",
          zh: "GW99: 注册失败，请重试或联系客服以获得帮助。",
          ms: "GW99: Pendaftaran gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post("/api/gw99/getturnoverforrebate", async (req, res) => {
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

    const records = await slotGW99Modal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      settle: true,
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
        gamename: "GW99",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("GW99: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "GW99: Failed to fetch win/loss report",
        zh: "GW99: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/gw99/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await slotGW99Modal.find({
        username: user.username,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },

        settle: true,
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
          gamename: "GW99",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("GW99: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "GW99: Failed to fetch win/loss report",
          zh: "GW99: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/gw99/:userId/gamedata",
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

          if (slotGames["GW99"]) {
            totalTurnover += slotGames["GW99"].turnover || 0;
            totalWinLoss += slotGames["GW99"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "GW99",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("GW99: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "GW99: Failed to fetch win/loss report",
          zh: "GW99: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/gw99/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await slotGW99Modal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },

        settle: true,
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
          gamename: "GW99",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("GW99: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "GW99: Failed to fetch win/loss report",
          zh: "GW99: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/gw99/kioskreport",
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

          if (liveCasino["GW99"]) {
            totalTurnover += Number(liveCasino["GW99"].turnover || 0);
            totalWinLoss += Number(liveCasino["GW99"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "GW99",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("GW99: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "GW99: Failed to fetch win/loss report",
          zh: "GW99: 获取盈亏报告失败",
        },
      });
    }
  }
);

const fetchGW99Last5Minutes = async () => {
  try {
    // Get current time in UTC+8 and calculate 5-minute window
    const now = moment().utc().add(8, "hours");
    const endTime = now.clone();
    const startTime = now.clone().subtract(15, "minutes");

    // Format with milliseconds as required by API
    const startDate = startTime.format("YYYY-MM-DD HH:mm:ss.SSS");
    const endDate = endTime.format("YYYY-MM-DD HH:mm:ss.SSS");

    let allData = [];
    let pageNumber = 1;
    let hasMoreData = true;
    let totalRecords = 0;

    // Loop through all pages for this 5-minute window
    while (hasMoreData) {
      const requestBody = {
        Agent: gw99AgentName, // or your gw99AgentName variable
        StartDate: startDate,
        EndDate: endDate,
        PageNumber: pageNumber,
      };

      // Generate signature
      const signature = generateSignature(requestBody);

      try {
        const response = await axios.post(
          `${gw99APIURL}/Api/IGame/Game/Log/Agent`, // or your gw99APIURL
          requestBody,
          {
            headers: {
              "Content-Type": "application/json",
              merchantName: gw99AgentName, // or your gw99AgentName
              signature: signature,
            },
          }
        );
        console.log(response.data);
        if (response.data.result && response.data.result.success === true) {
          const data = response.data.data?.record || [];
          if (data.length === 0) {
            hasMoreData = false;
          } else {
            allData = [...allData, ...data];
            totalRecords += data.length;

            pageNumber++;

            // Small delay between requests to be API-friendly
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } else {
          console.error(
            `❌ API Error: ${response.data.result?.message || "Unknown error"}`
          );
          hasMoreData = false;
        }
      } catch (apiError) {
        console.error(
          `❌ Request failed for page ${pageNumber}:`,
          apiError.message
        );
        hasMoreData = false;
      }
    }

    // Return the results
    return {
      success: true,
      data: allData,
      totalRecords: totalRecords,
      timeRange: {
        startDate,
        endDate,
        startTime: startTime.format("YYYY-MM-DD HH:mm:ss"),
        endTime: endTime.format("YYYY-MM-DD HH:mm:ss"),
      },
      message: `Successfully fetched ${totalRecords} records from last 5 minutes`,
    };
  } catch (error) {
    console.error("❌ Error in fetchGW99Last5Minutes:", error.message);
    return {
      success: false,
      error: error.message,
      data: [],
      totalRecords: 0,
      message: "Failed to fetch GW99 data",
    };
  }
};
// Optional: Function to process/save the fetched data
const processGW99Data = async (gameData) => {
  try {
    if (gameData.length === 0) {
      return true;
    }

    // Get all unique usernames from the game data
    const uniqueUserNames = [
      ...new Set(gameData.map((record) => record.userName.toUpperCase())),
    ];

    // Batch query users to find matching gw99GameID

    const users = await User.find({
      gw99GameID: { $in: uniqueUserNames },
    })
      .select("username gw99GameID")
      .lean();

    // Create mapping from gw99GameID to username
    const gw99GameIDToUsernameMap = new Map(
      users.map((user) => [user.gw99GameID, user.username])
    );

    // Get all existing tranIds to avoid duplicates
    const gameSerialIds = gameData.map((record) => record.gameSerialId);

    const existingRecords = await slotGW99Modal
      .find({
        tranId: { $in: gameSerialIds },
      })
      .select("tranId")
      .lean();

    const existingTranIds = new Set(
      existingRecords.map((record) => record.tranId)
    );

    let newRecordsCount = 0;
    let skippedRecordsCount = 0;
    let userNotFoundCount = 0;

    // Prepare new records
    const newRecords = [];

    for (const record of gameData) {
      // Skip if record already exists
      if (existingTranIds.has(record.gameSerialId)) {
        skippedRecordsCount++;
        continue;
      }

      // Find username using gw99GameID
      const username = gw99GameIDToUsernameMap.get(
        record.userName.toUpperCase()
      );

      if (!username) {
        userNotFoundCount++;
        continue;
      }

      // Prepare new record
      const newRecord = {
        tranId: record.gameSerialId, // gameSerialId as unique tranId
        betamount: record.betCoin || 0, // betCoin as betamount
        settleamount: record.winAmount || 0, // winAmount as settleamount
        username: username, // Found username from User schema
        bet: true, // Always true
        settle: true, // Always true
        betDate: new Date(record.createTime), // createTime as betDate
      };

      newRecords.push(newRecord);
    }

    // Batch insert new records
    if (newRecords.length > 0) {
      try {
        const insertResult = await slotGW99Modal.insertMany(newRecords, {
          ordered: false, // Continue inserting even if some fail
        });
        newRecordsCount = insertResult.length;
      } catch (insertError) {
        if (insertError.code === 11000) {
          // Handle duplicate key errors
          const insertedCount = insertError.insertedDocs
            ? insertError.insertedDocs.length
            : 0;
          newRecordsCount = insertedCount;
        } else {
          console.error(
            `❌ Error inserting GW99 records:`,
            insertError.message
          );
          return false;
        }
      }
    }

    return true;
  } catch (error) {
    console.error("❌ Error processing GW99 data:", error.message);
    return false;
  }
};

// Main function that fetches and processes data
const fetchAndProcessGW99Data = async () => {
  try {
    console.log("🚀 Starting GW99 data fetch and process...");

    // Fetch the data
    const result = await fetchGW99Last5Minutes();

    if (result.success && result.data.length > 0) {
      // Process the data
      const processed = await processGW99Data(result.data);

      if (processed) {
        console.log(`🎉 Successfully completed GW99 data fetch and processing`);
        return {
          success: true,
          ...result,
          processed: true,
        };
      } else {
        console.log(`⚠️ Data fetched but processing failed`);
        return {
          ...result,
          processed: false,
        };
      }
    } else if (result.success && result.data.length === 0) {
      console.log(`ℹ️ No new data found in last 5 minutes`);
      return result;
    } else {
      console.log(`❌ Failed to fetch data: ${result.message}`);
      return result;
    }
  } catch (error) {
    console.error("❌ Error in fetchAndProcessGW99Data:", error.message);
    return {
      success: false,
      error: error.message,
      message: "Failed to fetch and process GW99 data",
    };
  }
};

// const startGW99Cron = () => {
//   const cron = require("node-cron");

//   cron.schedule("*/5 * * * *", async () => {
//     console.log("🎰 Running GW99 5-minute data fetch...");

//     try {
//       const result = await fetchAndProcessGW99Data();

//       if (result.success) {
//         console.log(`✅ GW99 Cron: ${result.totalRecords} records processed`);
//       } else {
//         console.log(`❌ GW99 Cron failed: ${result.message}`);
//       }
//     } catch (error) {
//       console.error("❌ GW99 Cron error:", error.message);
//     }
//   });
// };

module.exports = router;
// module.exports.startGW99Cron = startGW99Cron;
