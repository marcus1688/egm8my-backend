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
const { adminUser, adminLog } = require("../../models/adminuser.model");
const SlotJiliModal = require("../../models/slot_jili.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const qs = require("querystring");
const GameWalletLog = require("../../models/gamewalletlog.model");
const slotLionKingModal = require("../../models/slot_lionking.model");

require("dotenv").config();

const lionKingSN = process.env.LIONKING_SN;
const lionKingSecret = process.env.LIONKING_SECRET;
const webURL = "https://www.oc7.me/";
const lionKingAPIURL = "https://api.lk888.info/";
const returnCallbackUrl = "https://api.oc7.me/api/lionking";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateSignature(id, method, sn, playerCode) {
  const rawString = `${id}${method}${sn}${playerCode}${lionKingSecret}`;
  return crypto.createHash("md5").update(rawString).digest("hex");
}

function generateSignatureForReport(id, method, sn, startTime, endTime) {
  const rawString = `${id}${method}${sn}${startTime}${endTime}${lionKingSecret}`;
  return crypto.createHash("md5").update(rawString).digest("hex");
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

async function registerLionkingUser(user) {
  try {
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

    const id = uuidv4().replace(/-/g, "");
    const method = "CreatePlayer";

    const signature = generateSignature(
      id,
      method,
      lionKingSN,
      user.customerId
    );

    const payload = {
      ID: id,
      Method: method,
      SN: lionKingSN,
      PlayerCode: user.customerId,
      PlayerName: user.username,
      Signature: signature,
    };

    const response = await axios.post(
      `${lionKingAPIURL}UserInfo/CreatePlayer`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.code !== "S100") {
      return {
        success: false,
        error: response.data,
      };
    }
    return {
      success: true,
      data: response.data,
      lionkingusername: response.data.data.playerCode,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

const checkLionKingBalance = async (username) => {
  try {
    const user = await User.findOne({ username });

    if (!user.lionKingGameID) {
      return {
        success: true,
        balance: 0,
        response: "",
      };
    }

    if (!user) {
      return { success: false, balance: 0 };
    }

    const id = uuidv4().replace(/-/g, "");
    const method = "GetBalance";

    const signature = generateSignature(
      id,
      method,
      lionKingSN,
      user.lionKingGameID
    );

    const payload = {
      ID: id,
      Method: method,
      SN: lionKingSN,
      LoginId: user.lionKingGameID,
      Signature: signature,
    };

    const response = await axios.post(
      `${lionKingAPIURL}Account/GetBalance`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return {
      success: response.data.code === "S100",
      balance: response.data.data.result || 0,
      response: response.data,
    };
  } catch (error) {
    console.error("LIONKING error checking user balance", error.message);
    return { success: false, balance: 0 };
  }
};

router.post("/api/lionking/register", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user.lionKingGameID) {
      const registerData = await registerLionkingUser(user);

      if (!registerData.success) {
        console.log(
          `LIONKING error in registering account ${registerData.error}`
        );

        if (registerData.error.code === "M0001") {
          return res.status(200).json({
            success: false,
            message: {
              en: "Game under maintenance. Please try again later.",
              zh: "游戏正在维护中，请稍后再试。",
              ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
            },
          });
        }

        return res.status(200).json({
          success: false,
          en: "LIONKING: Account registration failed. Please try again or contact customer service for assistance.",
          zh: "LIONKING：账户注册失败，请重试或联系客服以获取帮助。",
          ms: "LIONKING: Pendaftaran akaun gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        });
      }

      await User.findOneAndUpdate(
        { username: user.username },
        {
          $set: {
            lionKingGameID: registerData.lionkingusername,
          },
        }
      );
    }

    return res.status(200).json({
      success: true,
      message: {
        en: "LIONKING: Account registered successfully.",
        zh: "LIONKING：账户注册成功。",
        ms: "LIONKING: Akaun berjaya didaftarkan.",
      },
    });
  } catch (error) {
    console.log("LIONKING error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "LIONKING: Account registration failed. Please try again or contact customer service for assistance.",
        zh: "LIONKING：账户注册失败，请重试或联系客服以获取帮助。",
        ms: "LIONKING: Pendaftaran akaun gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/lionking/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang } = req.body;
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (user.gameStatus.lionking.transferInStatus) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
        },
      });
    }

    if (!user.lionKingGameID) {
      return res.status(200).json({
        success: false,
        message: {
          en: "LIONKING: No account found. Please register to continue.",
          zh: "LIONKING：未找到账户。请先注册以继续。",
          ms: "LIONKING: Akaun tidak dijumpai. Sila daftar untuk meneruskan.",
        },
      });
    }

    let lang = "En-us";

    if (gameLang === "en") {
      lang = "En-us";
    } else if (gameLang === "zh") {
      lang = "Zh-cn";
    } else if (gameLang === "ms") {
      lang = "En-us";
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();

    const schemeData = {
      SN: lionKingSN,
      Guid: uuidv4().replace(/-/g, ""),
      Method: "GetLoginTokenApp",
      UserCode: user.lionKingGameID,
      Password: lionKingSecret,
      CallBackUrl: returnCallbackUrl,
      Scheme: "jqk://",
      Language: lang,
      TimeStamp: timestamp,
      PackageName: "jqk://", // 你的应用包名
    };

    const schemeDataJson = JSON.stringify(schemeData);
    const base64String = Buffer.from(schemeDataJson).toString("base64");

    // const decodedCheck = JSON.parse(
    //   Buffer.from(base64String, "base64").toString()
    // );

    const launchUrl = `jqk://${base64String}`;

    return res.status(200).json({
      success: true,
      gameLobby: launchUrl,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
      },
    });
  } catch (error) {
    console.log("LIONKING error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "LIONKING: Game launch failed. Please try again or customer service for assistance.",
        zh: "LIONKING: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "LIONKING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/api/lionking/checkbalance",
  authenticateToken,
  async (req, res) => {
    try {
      const user = await User.findById(req.user.userId);

      if (!user.lionKingGameID) {
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

      const id = uuidv4().replace(/-/g, "");
      const method = "GetBalance";

      const signature = generateSignature(
        id,
        method,
        lionKingSN,
        user.lionKingGameID
      );

      const payload = {
        ID: id,
        Method: method,
        SN: lionKingSN,
        LoginId: user.lionKingGameID,
        Signature: signature,
      };

      const response = await axios.post(
        `${lionKingAPIURL}Account/GetBalance`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.code !== "S100") {
        if (response.data.code === "M0001") {
          return res.status(200).json({
            success: false,
            message: {
              en: "Game under maintenance. Please try again later.",
              zh: "游戏正在维护中，请稍后再试。",
              ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
            },
          });
        }

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
        balance: roundToTwoDecimals(response.data.data.result),
        message: {
          en: "Balance retrieved successfully.",
          zh: "余额查询成功。",
          ms: "Baki berjaya diperoleh.",
        },
      });
    } catch (error) {
      console.error("LIONKING error checking user balance", error.message);
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

router.post("/api/lionking/transferin", authenticateToken, async (req, res) => {
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

    if (!beforeUser.lionKingGameID) {
      const registrationResult = await registerLionkingUser(beforeUser);

      if (!registrationResult.success) {
        console.log(
          `LIONKING error in registering account ${registrationResult.error}`
        );

        if (registrationResult.error.code === "M0001") {
          return res.status(200).json({
            success: false,
            message: {
              en: "Game under maintenance. Please try again later.",
              zh: "游戏正在维护中，请稍后再试。",
              ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
            },
          });
        }

        return res.status(200).json({
          success: false,
          message: {
            en: "LIONKING: Registration failed. Please try again or contact customer service for assistance.",
            zh: "LIONKING: 注册失败，请重试或联系客服以获得帮助。",
            ms: "LIONKING: Pendaftaran gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }

      await User.findOneAndUpdate(
        { username: beforeUser.username },
        {
          $set: {
            lionKingGameID: registrationResult.lionkingusername,
          },
        }
      );
    }

    if (beforeUser.gameStatus.lionking.transferInStatus) {
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

    const id = uuidv4().replace(/-/g, "");
    const method = "SetBalanceTransfer";

    const signature = generateSignature(
      id,
      method,
      lionKingSN,
      updatedUser.lionKingGameID
    );

    const payload = {
      ID: id,
      Method: method,
      SN: lionKingSN,
      LoginId: updatedUser.lionKingGameID,
      Amount: formattedDepositAmount,
      Signature: signature,
    };

    const response = await axios.post(
      `${lionKingAPIURL}Account/SetBalanceTransfer`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.code !== "S100") {
      console.log("LIONKING transferin failed", response.data);

      await User.findOneAndUpdate(
        { _id: req.user.userId },
        { $inc: { wallet: formattedDepositAmount } }
      );

      if (response.data.code === "M0001") {
        return res.status(200).json({
          success: false,
          message: {
            en: "Game under maintenance. Please try again later.",
            zh: "游戏正在维护中，请稍后再试。",
            ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
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

    const gameBalance = await checkLionKingBalance(updatedUser.username);

    await GameWalletLogAttempt(
      updatedUser.username,
      "Transfer In",
      "Transfer",
      roundToTwoDecimals(formattedDepositAmount),
      "LIONKING",
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
        console.log("LIONKING Rollback failed:", rollbackError.message);
      }
    }

    console.log("LIONKING error in transferin", error.message);
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
  "/admin/api/lionking/:userId/transferoutfixed",
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

      if (!user.lionKingGameID) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User has not registered yet. Please register before proceeding.",
            zh: "用户尚未注册，请先完成注册后再继续操作。",
            ms: "Pengguna belum berdaftar. Sila daftar terlebih dahulu sebelum meneruskan.",
          },
        });
      }

      const id = uuidv4().replace(/-/g, "");
      const method = "SetBalanceTransfer";

      const signature = generateSignature(
        id,
        method,
        lionKingSN,
        user.lionKingGameID
      );

      const payload = {
        ID: id,
        Method: method,
        SN: lionKingSN,
        LoginId: user.lionKingGameID,
        Amount: -formattedWithdrawAmount,
        Signature: signature,
      };

      const response = await axios.post(
        `${lionKingAPIURL}Account/SetBalanceTransfer`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.code !== "S100") {
        console.log("LIONKING transferout failed", response.data);

        if (response.data.code === "M0001") {
          return res.status(200).json({
            success: false,
            message: {
              en: "Game under maintenance. Please try again later.",
              zh: "游戏正在维护中，请稍后再试。",
              ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
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

      const gameBalance = await checkLionKingBalance(user.username);

      if (gameBalance.success) {
        await GameWalletLogAttempt(
          updatedUser.username,
          "Transfer Out",
          "Transfer",
          roundToTwoDecimals(formattedWithdrawAmount),
          "LIONKING",
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
          "LIONKING",
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
      console.log("LIONKING error in transferout", error.message);
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
  "/admin/api/lionking/:userId/transferout",
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

      if (!user.lionKingGameID) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User has not registered yet. Please register before proceeding.",
            zh: "用户尚未注册，请先完成注册后再继续操作。",
            ms: "Pengguna belum berdaftar. Sila daftar terlebih dahulu sebelum meneruskan.",
          },
        });
      }

      const gameBalance = await checkLionKingBalance(user.username);

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

        const id = uuidv4().replace(/-/g, "");
        const method = "SetBalanceTransfer";

        const signature = generateSignature(
          id,
          method,
          lionKingSN,
          user.lionKingGameID
        );

        const payload = {
          ID: id,
          Method: method,
          SN: lionKingSN,
          LoginId: user.lionKingGameID,
          Amount: -gameBalance.balance,
          Signature: signature,
        };

        const response = await axios.post(
          `${lionKingAPIURL}Account/SetBalanceTransfer`,
          payload,
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (response.data.code !== "S100") {
          if (response.data.code === "M0001") {
            return res.status(200).json({
              success: false,
              message: {
                en: "Game under maintenance. Please try again later.",
                zh: "游戏正在维护中，请稍后再试。",
                ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
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
          "LIONKING",
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
        console.log("admin transfer out error LIONKING", gameBalance);
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
      console.log("LIONKING error in transferout", error.message);
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
  "/api/lionking/transferout",
  authenticateToken,
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

      if (!user.lionKingGameID) {
        const registrationResult = await registerLionkingUser(user);

        if (!registrationResult.success) {
          console.log(
            `LIONKING error in registering account ${registrationResult.error}`
          );

          if (registrationResult.error.code === "M0001") {
            return res.status(200).json({
              success: false,
              message: {
                en: "Game under maintenance. Please try again later.",
                zh: "游戏正在维护中，请稍后再试。",
                ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
              },
            });
          }
          return res.status(200).json({
            success: false,
            message: {
              en: "LIONKING: Registration failed. Please try again or contact customer service for assistance.",
              zh: "LIONKING: 注册失败，请重试或联系客服以获得帮助。",
              ms: "LIONKING: Pendaftaran gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            },
          });
        }
        await User.findOneAndUpdate(
          { username: user.username },
          {
            $set: {
              lionKingGameID: registrationResult.lionkingusername,
            },
          }
        );
      }

      if (user.gameStatus.lionking.transferOutStatus) {
        return res.status(200).json({
          success: false,
          message: {
            en: "The transfer status is locked. Please contact customer support for further assistance.",
            zh: "转账状态已锁定，请联系客服以获取进一步帮助。",
            ms: "Status pemindahan telah dikunci. Sila hubungi sokongan pelanggan untuk bantuan lanjut.",
          },
        });
      }

      const id = uuidv4().replace(/-/g, "");
      const method = "SetBalanceTransfer";

      const signature = generateSignature(
        id,
        method,
        lionKingSN,
        user.lionKingGameID
      );

      const payload = {
        ID: id,
        Method: method,
        SN: lionKingSN,
        LoginId: user.lionKingGameID,
        Amount: -formattedWithdrawAmount,
        Signature: signature,
      };

      const response = await axios.post(
        `${lionKingAPIURL}Account/SetBalanceTransfer`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.code !== "S100") {
        console.log("LIONKING transferout failed", response.data);

        if (response.data.code === "M0001") {
          return res.status(200).json({
            success: false,
            message: {
              en: "Game under maintenance. Please try again later.",
              zh: "游戏正在维护中，请稍后再试。",
              ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
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
        { $inc: { wallet: formattedWithdrawAmount } }
      );

      const gameBalance = await checkLionKingBalance(updatedUser.username);

      await GameWalletLogAttempt(
        updatedUser.username,
        "Transfer Out",
        "Transfer",
        roundToTwoDecimals(formattedWithdrawAmount),
        "LIONKING",
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
      console.log("LIONKING error in transferout", error.message);
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
  "/admin/api/lionking/:userId/checkbalance",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.lionKingGameID) {
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

      const id = uuidv4().replace(/-/g, "");
      const method = "GetBalance";

      const signature = generateSignature(
        id,
        method,
        lionKingSN,
        user.lionKingGameID
      );

      const payload = {
        ID: id,
        Method: method,
        SN: lionKingSN,
        LoginId: user.lionKingGameID,
        Signature: signature,
      };

      const response = await axios.post(
        `${lionKingAPIURL}Account/GetBalance`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.code !== "S100") {
        if (response.data.code === "M0001") {
          return res.status(200).json({
            success: false,
            message: {
              en: "Game under maintenance. Please try again later.",
              zh: "游戏正在维护中，请稍后再试。",
              ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
            },
          });
        }

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
        balance: roundToTwoDecimals(response.data.data.result),
        message: {
          en: "Balance retrieved successfully.",
          zh: "余额查询成功。",
          ms: "Baki berjaya diperoleh.",
        },
      });
    } catch (error) {
      console.error("LIONKING error checking user balance", error.message);
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

router.post("/api/lionking/getturnoverforrebate", async (req, res) => {
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

    const records = await slotLionKingModal.find({
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
        gamename: "LIONKING",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("LIONKING: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "LIONKING: Failed to fetch win/loss report",
        zh: "LIONKING: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/lionking/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await slotLionKingModal.find({
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
          gamename: "LIONKING",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("LIONKING: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "LIONKING: Failed to fetch win/loss report",
          zh: "LIONKING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/lionking/:userId/gamedata",
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

          if (slotGames["LIONKING"]) {
            totalTurnover += slotGames["LIONKING"].turnover || 0;
            totalWinLoss += slotGames["LIONKING"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "LIONKING",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("LIONKING: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "LIONKING: Failed to fetch win/loss report",
          zh: "LIONKING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/lionking/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await slotLionKingModal.find({
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
          gamename: "LIONKING",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("LIONKING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "LIONKING: Failed to fetch win/loss report",
          zh: "LIONKING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/lionking/kioskreport",
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

          if (liveCasino["LIONKING"]) {
            totalTurnover += Number(liveCasino["LIONKING"].turnover || 0);
            totalWinLoss += Number(liveCasino["LIONKING"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "LIONKING",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("LIONKING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "LIONKING: Failed to fetch win/loss report",
          zh: "LIONKING: 获取盈亏报告失败",
        },
      });
    }
  }
);

const fetchLionKingLast5Minutes = async () => {
  try {
    const now = moment().utc().add(8, "hours");
    const endTime = now.clone();
    const startTime = now.clone().subtract(15, "minutes");

    const startDate = startTime.format("YYYY-MM-DD HH:mm:ss");
    const endDate = endTime.format("YYYY-MM-DD HH:mm:ss");

    let allData = [];
    let pageNumber = 1;
    let totalPages = 1;
    let totalRecords = 0;

    const id = uuidv4().replace(/-/g, "");
    const method = "GetGameRecordByTime";

    while (pageNumber <= totalPages) {
      const signature = generateSignatureForReport(
        id,
        method,
        lionKingSN,
        startDate,
        endDate
      );

      const requestBody = {
        SN: lionKingSN,
        ID: id,
        Method: method,
        StartTime: startDate,
        EndTime: endDate,
        PageSize: 2000,
        PageIndex: pageNumber,
        Signature: signature,
      };

      try {
        const response = await axios.post(
          `${lionKingAPIURL}Game/GetGameRecordByTime`,
          requestBody,
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (response.data.code === "S100" && response.data.data) {
          const responseData = response.data.data;

          if (pageNumber === 1) {
            totalPages = responseData.totalPage || 1;
          }

          const pageItems = responseData.item || [];

          if (pageItems.length > 0) {
            allData = [...allData, ...pageItems];
            totalRecords += pageItems.length;
          }

          pageNumber++;

          if (pageNumber <= totalPages) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } else {
          console.error(
            `❌ API Error: ${response.data.result?.message || "Unknown error"}`
          );
          break;
        }
      } catch (apiError) {
        console.error(
          `❌ Request failed for page ${pageNumber}:`,
          apiError.message
        );
        break;
      }
    }

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
      message: `Successfully fetched ${totalRecords} records from ${
        pageNumber - 1
      } pages`,
    };
  } catch (error) {
    console.error("❌ Error in fetchLionKingLast5Minutes:", error.message);
    return {
      success: false,
      error: error.message,
      data: [],
      totalRecords: 0,
      message: "Failed to fetch LionKing data",
    };
  }
};

const processLionKingData = async (gameData) => {
  try {
    if (gameData.length === 0) {
      return true;
    }

    // Get all unique usernames from the game data
    const uniqueUserNames = [
      ...new Set(gameData.map((record) => record.loginId)),
    ];

    // Batch query users to find matching gw99GameID

    const users = await User.find({
      lionKingGameID: { $in: uniqueUserNames },
    })
      .select("username lionKingGameID")
      .lean();

    // Create mapping from gw99GameID to username
    const lionKingGameIDToUsernameMap = new Map(
      users.map((user) => [user.lionKingGameID, user.username])
    );

    // Get all existing tranIds to avoid duplicates
    const gameSerialIds = gameData.map((record) => record.orderCode);

    const existingRecords = await slotLionKingModal
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
      if (existingTranIds.has(record.orderCode)) {
        skippedRecordsCount++;
        continue;
      }

      // Find username using gw99GameID
      const username = lionKingGameIDToUsernameMap.get(record.loginId);

      if (!username) {
        userNotFoundCount++;
        continue;
      }

      // Prepare new record
      const newRecord = {
        tranId: record.orderCode, // gameSerialId as unique tranId
        betamount: record.validBet || 0, // betCoin as betamount
        settleamount: record.validWin || 0, // winAmount as settleamount
        username: username, // Found username from User schema
        bet: true, // Always true
        settle: true, // Always true
        betDate: new Date(record.actionDate),
      };

      newRecords.push(newRecord);
    }

    // Batch insert new records
    if (newRecords.length > 0) {
      try {
        const insertResult = await slotLionKingModal.insertMany(newRecords, {
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
            `❌ Error inserting LIONKING records:`,
            insertError.message
          );
          return false;
        }
      }
    }

    return true;
  } catch (error) {
    console.error("❌ Error processing LIONKING data:", error.message);
    return false;
  }
};

const fetchAndProcessLionKingData = async () => {
  try {
    // Fetch the data
    const result = await fetchLionKingLast5Minutes();

    if (result.success && result.data.length > 0) {
      // Process the data
      const processed = await processLionKingData(result.data);

      if (processed) {
        return {
          success: true,
          ...result,
          processed: true,
        };
      } else {
        return {
          ...result,
          processed: false,
        };
      }
    } else if (result.success && result.data.length === 0) {
      return result;
    } else {
      return result;
    }
  } catch (error) {
    console.error("❌ Error in fetchAndProcessLionKingData:", error.message);
    return {
      success: false,
      error: error.message,
      message: "Failed to fetch and process LIONKING data",
    };
  }
};

// const startLionKingCron = () => {
//   const cron = require("node-cron");

//   cron.schedule("*/5 * * * *", async () => {
//     try {
//       const result = await fetchAndProcessLionKingData();

//       if (result.success) {
//       } else {
//         console.log(`❌ LionKing Cron failed: ${result.message}`);
//       }
//     } catch (error) {
//       console.error("❌ LionKing Cron error:", error.message);
//     }
//   });
// };

module.exports = router;
// module.exports.startLionKingCron = startLionKingCron;
