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
const jwt = require("jsonwebtoken");
const moment = require("moment");
const GameWalletLog = require("../../models/gamewalletlog.model");
const SportSBOBETModal = require("../../models/sport_sbobet.model");
const Decimal = require("decimal.js");
require("dotenv").config();

const sbobetSecret = process.env.SBOBET_SECRET;
const webURL = "https://www.bm8my.vip/";
const sbobetAPIURL = "https://ex-api-yy2.ttbbyyllyy.com";
const sbobetCreatedAgent = "BM8MYRPROD";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

const generateRandomCode = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }

  return result;
};

const generatePassword = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 6; i++) {
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
  gamename
) {
  await GameWalletLog.create({
    username,
    transactiontype,
    remark: remark || "",
    amount,
    gamename: gamename,
  });
}

function generateTraceCode() {
  return uuidv4();
}

async function registerSBOBETAgent() {
  try {
    const requestData = {
      CompanyKey: sbobetSecret,
      ServerID: generateTraceCode(),
      Username: "BM8MYRPROD",
      Password: "Qwer1234",
      Currency: "MYR",
      Min: 10,
      Max: 50000,
      MaxPerMatch: 50000,
      CasinoTableLimit: 2,
      isTwoFAEnabled: false,
    };

    const response = await axios.post(
      `${sbobetAPIURL}/web-root/restricted/agent/register-agent.aspx`,
      requestData,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.error.id !== 0) {
      console.log("sbo response error register agent", response.data);

      return {
        success: false,
        error: response.data,
      };
    }

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.error(
      "Register Agent SBOBET error in creating member:",
      error.message
    );
    return {
      success: false,
      error: error.message,
    };
  }
}

async function registerSBOBETUser(user) {
  try {
    const requestData = {
      CompanyKey: sbobetSecret,
      ServerID: generateTraceCode(),
      Username: user.gameId,
      Agent: sbobetCreatedAgent,
      UserGroup: "c",
    };

    const response = await axios.post(
      `${sbobetAPIURL}/web-root/restricted/player/register-player.aspx`,
      requestData,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.error.id !== 0) {
      console.log("sbo response error register agent", response.data);

      return {
        success: false,
        error: response.data,
      };
    }

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.error("Register Player SBOBET:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

router.post("/api/sbobetother/getgamelist", async (req, res) => {
  try {
    const requestData = {
      CompanyKey: sbobetSecret,
      ServerID: generateTraceCode(),
      GpId: "14",
      IsGetAll: false,
    };

    const response = await axios.post(
      `${sbobetAPIURL}/web-root/restricted/information/get-game-list.aspx`,
      requestData,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.error.id !== 0) {
      console.log("SBOBET error in launching game", response.data);

      if (response.data.ErrorCode === 104) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Game under maintenance. Please try again later.",
            zh: "游戏正在维护中，请稍后再试。",
            ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
            zh_hk: "遊戲正在維護中，請稍後再試。",
            id: "Permainan sedang dalam pemeliharaan. Silakan coba lagi nanti.",
          },
        });
      }

      return res.status(200).json({
        success: false,
        message: {
          en: "SBOBET: Game launch failed. Please try again or customer service for assistance.",
          zh: "SBOBET: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "SBOBET: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "SBOBET: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "SBOBET: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    return res.status(200).json({
      success: true,
      gameLobby: response.data,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("SBOBET error in launching game", error);
    return res.status(200).json({
      success: false,
      message: {
        en: "SBOBET: Game launch failed. Please try again or customer service for assistance.",
        zh: "SBOBET: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "SBOBET: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "SBOBET: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "SBOBET: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/api/sbobetother/launchGame",
  authenticateToken,
  async (req, res) => {
    try {
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

      if (user.gameLock.sbobet.lock) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Your game access has been locked. Please contact customer support for further assistance.",
            zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
            ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
            zh_hk: "您的遊戲訪問已被鎖定，請聯絡客服以獲取進一步幫助。",
            id: "Akses permainan Anda telah dikunci. Silakan hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
          },
        });
      }

      if (!user.sbobetRegistered) {
        const registeredData = await registerSBOBETUser(user);

        if (!registeredData.success) {
          console.log(`SBOBET in registering account ${registeredData}`);

          return res.status(200).json({
            success: false,
            message: {
              en: "SBOBET: Game launch failed. Please try again or customer service for assistance.",
              zh: "SBOBET: 游戏启动失败，请重试或联系客服以获得帮助。",
              ms: "SBOBET: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
              zh_hk: "SBOBET: 遊戲開唔到，老闆試多次或者搵客服幫手。",
              id: "SBOBET: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
            },
          });
        }

        await User.findOneAndUpdate(
          { username: user.username },
          {
            $set: {
              sbobetRegistered: true,
            },
          }
        );
      }

      const { gameLang, clientPlatform } = req.body;

      let lang = "en";

      if (gameLang === "en") {
        lang = "en";
      } else if (gameLang === "zh") {
        lang = "zh-cn";
      } else if (gameLang === "ms") {
        lang = "en";
      } else if (gameLang === "id") {
        lang = "id-id";
      } else if (gameLang === "zh_hk") {
        lang = "zh-tw";
      }

      let platform = "m";
      if (clientPlatform === "web") {
        platform = "d";
      } else if (clientPlatform === "mobile") {
        platform = "m";
      }

      const requestData = {
        CompanyKey: sbobetSecret,
        ServerID: generateTraceCode(),
        Username: user.gameId,
        Portfolio: "Casino",
        // GpId: 1024,
        // GameId: 0,
        // Lang: lang,
        Device: platform,
        ProductId: 1029,
      };
      console.log(requestData);
      console.log(`${sbobetAPIURL}/web-root/restricted/player/v2/login.aspx`);
      const response = await axios.post(
        `${sbobetAPIURL}/web-root/restricted/player/v2/login.aspx`,
        requestData,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      console.log(response.data);

      if (response.data.error.id !== 0) {
        console.log("SBOBET error in launching game", response.data);

        if (response.data.ErrorCode === 104) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Game under maintenance. Please try again later.",
              zh: "游戏正在维护中，请稍后再试。",
              ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
              zh_hk: "遊戲正在維護中，請稍後再試。",
              id: "Permainan sedang dalam pemeliharaan. Silakan coba lagi nanti.",
            },
          });
        }

        return res.status(200).json({
          success: false,
          message: {
            en: "SBOBET: Game launch failed. Please try again or customer service for assistance.",
            zh: "SBOBET: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "SBOBET: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "SBOBET: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
            id: "SBOBET: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "SBOBET"
      );

      return res.status(200).json({
        success: true,
        gameLobby: response.data.url,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
          zh_hk: "遊戲啟動成功。",
          id: "Permainan berhasil diluncurkan.",
        },
      });
    } catch (error) {
      console.log("SBOBET error in launching game", error);
      return res.status(200).json({
        success: false,
        message: {
          en: "SBOBET: Game launch failed. Please try again or customer service for assistance.",
          zh: "SBOBET: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "SBOBET: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "SBOBET: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "SBOBET: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post("/api/sbobet/launchGame", authenticateToken, async (req, res) => {
  try {
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

    if (user.gameLock.sbobet.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
          zh_hk: "您的遊戲訪問已被鎖定，請聯絡客服以獲取進一步幫助。",
          id: "Akses permainan Anda telah dikunci. Silakan hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }

    if (!user.sbobetRegistered) {
      const registeredData = await registerSBOBETUser(user);

      if (!registeredData.success) {
        console.log(`SBOBET in registering account ${registeredData}`);

        return res.status(200).json({
          success: false,
          message: {
            en: "SBOBET: Game launch failed. Please try again or customer service for assistance.",
            zh: "SBOBET: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "SBOBET: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "SBOBET: 遊戲開唔到，老闆試多次或者搵客服幫手。",
            id: "SBOBET: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      await User.findOneAndUpdate(
        { username: user.username },
        {
          $set: {
            sbobetRegistered: true,
          },
        }
      );
    }

    const { gameLang, clientPlatform } = req.body;

    let lang = "en";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "zh-cn";
    } else if (gameLang === "ms") {
      lang = "en";
    } else if (gameLang === "id") {
      lang = "id-id";
    } else if (gameLang === "zh_hk") {
      lang = "zh-tw";
    }

    let platform = "m";
    if (clientPlatform === "web") {
      platform = "d";
    } else if (clientPlatform === "mobile") {
      platform = "m";
    }

    const requestData = {
      CompanyKey: sbobetSecret,
      ServerID: generateTraceCode(),
      Username: user.gameId,
      Portfolio: "SportsBook",
      Lang: lang,
      Device: platform,
      OddsMode: "double",
      Theme: "sbomain",
    };

    const response = await axios.post(
      `${sbobetAPIURL}/web-root/restricted/player/v2/login.aspx`,
      requestData,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.error.id !== 0) {
      console.log("SBOBET error in launching game", response.data);

      if (response.data.ErrorCode === 104) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Game under maintenance. Please try again later.",
            zh: "游戏正在维护中，请稍后再试。",
            ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
            zh_hk: "遊戲正在維護中，請稍後再試。",
            id: "Permainan sedang dalam pemeliharaan. Silakan coba lagi nanti.",
          },
        });
      }

      return res.status(200).json({
        success: false,
        message: {
          en: "SBOBET: Game launch failed. Please try again or customer service for assistance.",
          zh: "SBOBET: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "SBOBET: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "SBOBET: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "SBOBET: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "SBOBET"
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data.url,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("SBOBET error in launching game", error);
    return res.status(200).json({
      success: false,
      message: {
        en: "SBOBET: Game launch failed. Please try again or customer service for assistance.",
        zh: "SBOBET: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "SBOBET: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "SBOBET: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "SBOBET: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

const validateSBOBETRequest = (req, res, next) => {
  const { CompanyKey, Username } = req.body;

  if (!Username) {
    return res.status(200).json({
      ErrorCode: 3,
      ErrorMessage: "Username empty",
      Balance: 0,
    });
  }

  if (CompanyKey !== sbobetSecret) {
    return res.status(200).json({
      ErrorCode: 4,
      ErrorMessage: "CompanyKey Error",
      Balance: 0,
    });
  }

  next();
};

router.post(
  "/api/sbobet/getbalance",
  validateSBOBETRequest,
  async (req, res) => {
    try {
      const { Username } = req.body;

      const currentUser = await User.findOne(
        { gameId: Username },
        { wallet: 1, _id: 0 }
      ).lean();

      if (!currentUser) {
        return res.status(200).json({
          ErrorCode: 1,
          ErrorMessage: "Member not exist",
          Balance: 0,
        });
      }

      return res.status(200).json({
        AccountName: Username,
        Balance: roundToTwoDecimals(currentUser.wallet),
        ErrorCode: 0,
        ErrorMessage: "No Error",
      });
    } catch (error) {
      console.error("SBOBET: Error in getbalance:", error.message);
      return res.status(200).json({
        ErrorCode: 7,
        ErrorMessage: "Internal Error",
      });
    }
  }
);

router.post("/api/sbobet/deduct", validateSBOBETRequest, async (req, res) => {
  try {
    const { Amount, TransferCode, TransactionId, ProductType, Username } =
      req.body;
    const betAmount = roundToTwoDecimals(Amount);

    switch (ProductType) {
      case 3:
      case 7: {
        // Sports betting with potential raise
        const [currentUser, existingBets] = await Promise.all([
          User.findOne(
            { gameId: Username },
            { wallet: 1, "gameLock.sbobet.lock": 1, _id: 0 }
          ).lean(),
          SportSBOBETModal.find(
            { betId: TransferCode, username: Username },
            { betamount: 1, _id: 0 }
          )
            .sort({ createdAt: -1 })
            .limit(2)
            .lean(),
        ]);

        if (!currentUser || currentUser.gameLock?.sbobet?.lock) {
          return res.status(200).json({
            ErrorCode: 1,
            ErrorMessage: "Member not exist",
            Balance: 0,
          });
        }

        const deductCount = existingBets.length;

        if (deductCount >= 2) {
          return res.status(200).json({
            ErrorCode: 5003,
            ErrorMessage: "Bet With Same RefNo Exists",
            Balance: roundToTwoDecimals(currentUser.wallet),
          });
        }

        if (deductCount === 1) {
          const firstBetAmount = existingBets[0].betamount || 0;

          if (betAmount <= firstBetAmount) {
            return res.status(200).json({
              ErrorCode: 7,
              ErrorMessage: "2nd Deduct amount must be greater than 1st Deduct",
              Balance: roundToTwoDecimals(currentUser.wallet),
            });
          }

          const amountDifference = roundToTwoDecimals(
            betAmount - firstBetAmount
          );

          const updatedUserBalance = await User.findOneAndUpdate(
            {
              gameId: Username,
              wallet: { $gte: amountDifference },
            },
            { $inc: { wallet: -amountDifference } },
            { new: true, projection: { wallet: 1, _id: 0 } }
          ).lean();

          if (!updatedUserBalance) {
            return res.status(200).json({
              ErrorCode: 5,
              ErrorMessage: "Not enough balance",
              Balance: roundToTwoDecimals(currentUser.wallet),
            });
          }

          await SportSBOBETModal.create({
            betId: TransferCode,
            username: Username,
            producttype: ProductType,
            tranId: TransactionId,
            betamount: betAmount,
            raiseamount: amountDifference,
            bet: true,
          });

          return res.status(200).json({
            AccountName: Username,
            Balance: roundToTwoDecimals(updatedUserBalance.wallet),
            ErrorCode: 0,
            ErrorMessage: "No Error",
            BetAmount: betAmount,
          });
        }

        // First bet (deductCount === 0)
        const updatedUserBalance = await User.findOneAndUpdate(
          { gameId: Username, wallet: { $gte: betAmount } },
          { $inc: { wallet: -betAmount } },
          { new: true, projection: { wallet: 1, _id: 0 } }
        ).lean();

        if (!updatedUserBalance) {
          return res.status(200).json({
            ErrorCode: 5,
            ErrorMessage: "Not enough balance",
            Balance: roundToTwoDecimals(currentUser.wallet),
          });
        }

        await SportSBOBETModal.create({
          betId: TransferCode,
          username: Username,
          producttype: ProductType,
          tranId: TransactionId,
          betamount: betAmount,
          bet: true,
        });

        return res.status(200).json({
          AccountName: Username,
          Balance: roundToTwoDecimals(updatedUserBalance.wallet),
          ErrorCode: 0,
          ErrorMessage: "No Error",
          BetAmount: betAmount,
        });
      }

      case 9: {
        // Seamless - check with TransactionId
        const [currentUser, existingBet] = await Promise.all([
          User.findOne(
            { gameId: Username },
            { wallet: 1, "gameLock.sbobet.lock": 1, _id: 0 }
          ).lean(),
          SportSBOBETModal.exists({
            betId: TransferCode,
            tranId: TransactionId,
            username: Username,
          }),
        ]);

        if (!currentUser || currentUser.gameLock?.sbobet?.lock) {
          return res.status(200).json({
            ErrorCode: 1,
            ErrorMessage: "Member not exist",
            Balance: 0,
          });
        }

        if (existingBet) {
          return res.status(200).json({
            ErrorCode: 5003,
            ErrorMessage: "Bet With Same RefNo Exists",
            Balance: roundToTwoDecimals(currentUser.wallet),
          });
        }

        const updatedUserBalance = await User.findOneAndUpdate(
          { gameId: Username, wallet: { $gte: betAmount } },
          { $inc: { wallet: -betAmount } },
          { new: true, projection: { wallet: 1, _id: 0 } }
        ).lean();

        if (!updatedUserBalance) {
          return res.status(200).json({
            ErrorCode: 5,
            ErrorMessage: "Not enough balance",
            Balance: roundToTwoDecimals(currentUser.wallet),
          });
        }

        await SportSBOBETModal.create({
          betId: TransferCode,
          username: Username,
          producttype: ProductType,
          tranId: TransactionId,
          betamount: betAmount,
          bet: true,
        });

        return res.status(200).json({
          AccountName: Username,
          Balance: roundToTwoDecimals(updatedUserBalance.wallet),
          ErrorCode: 0,
          ErrorMessage: "No Error",
          BetAmount: betAmount,
        });
      }

      default: {
        // Other product types (Casino, RNG, etc.)
        const [currentUser, existingBet] = await Promise.all([
          User.findOne(
            { gameId: Username },
            { wallet: 1, "gameLock.sbobet.lock": 1, _id: 0 }
          ).lean(),
          SportSBOBETModal.exists({
            betId: TransferCode,
            username: Username,
          }),
        ]);

        if (!currentUser || currentUser.gameLock?.sbobet?.lock) {
          return res.status(200).json({
            ErrorCode: 1,
            ErrorMessage: "Member not exist",
            Balance: 0,
          });
        }

        if (existingBet) {
          return res.status(200).json({
            ErrorCode: 5003,
            ErrorMessage: "Bet With Same RefNo Exists",
            Balance: roundToTwoDecimals(currentUser.wallet),
          });
        }

        const updatedUserBalance = await User.findOneAndUpdate(
          { gameId: Username, wallet: { $gte: betAmount } },
          { $inc: { wallet: -betAmount } },
          { new: true, projection: { wallet: 1, _id: 0 } }
        ).lean();

        if (!updatedUserBalance) {
          return res.status(200).json({
            ErrorCode: 5,
            ErrorMessage: "Not enough balance",
            Balance: roundToTwoDecimals(currentUser.wallet),
          });
        }

        await SportSBOBETModal.create({
          betId: TransferCode,
          username: Username,
          producttype: ProductType,
          tranId: TransactionId,
          betamount: betAmount,
          bet: true,
        });

        return res.status(200).json({
          AccountName: Username,
          Balance: roundToTwoDecimals(updatedUserBalance.wallet),
          ErrorCode: 0,
          ErrorMessage: "No Error",
          BetAmount: betAmount,
        });
      }
    }
  } catch (error) {
    console.error("SBOBET: Error in deduct:", error.message);
    return res.status(200).json({
      ErrorCode: 7,
      ErrorMessage: "Internal Error",
    });
  }
});

router.post("/api/sbobet/settle", validateSBOBETRequest, async (req, res) => {
  try {
    const { Username, TransferCode, WinLoss } = req.body;

    const [currentUser, bets, hasAnySettled] = await Promise.all([
      User.findOne({ gameId: Username }, { wallet: 1, _id: 0 }).lean(),
      SportSBOBETModal.find({ betId: TransferCode }, { _id: 1, cancel: 1 })
        .sort({ createdAt: 1 })
        .lean(),
      SportSBOBETModal.exists({ betId: TransferCode, settle: true }),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        ErrorCode: 1,
        ErrorMessage: "Member not exist",
      });
    }

    if (!bets.length) {
      return res.status(200).json({
        ErrorCode: 6,
        ErrorMessage: "Bet not exists",
        Balance: roundToTwoDecimals(currentUser.wallet),
      });
    }

    const hasAnyRunning = bets.some((bet) => !bet.cancel);

    if (!hasAnyRunning) {
      return res.status(200).json({
        ErrorCode: 2002,
        ErrorMessage: "Bet Already Canceled",
        Balance: roundToTwoDecimals(currentUser.wallet),
      });
    }

    if (hasAnySettled) {
      return res.status(200).json({
        ErrorCode: 2001,
        ErrorMessage: "Bet Already Settled",
        Balance: roundToTwoDecimals(currentUser.wallet),
      });
    }

    const settleAmount = roundToTwoDecimals(WinLoss);
    const firstRunningIndex = bets.findIndex((bet) => !bet.cancel);

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: Username },
        { $inc: { wallet: settleAmount } },
        { new: true, projection: { wallet: 1, _id: 0 } }
      ).lean(),
      SportSBOBETModal.bulkWrite(
        bets.map((bet, index) => ({
          updateOne: {
            filter: { _id: bet._id },
            update: {
              $set: {
                settle: true,
                settleamount: index === firstRunningIndex ? settleAmount : 0,
              },
            },
          },
        }))
      ),
    ]);

    return res.status(200).json({
      AccountName: Username,
      Balance: roundToTwoDecimals(updatedUserBalance.wallet),
      ErrorCode: 0,
      ErrorMessage: "No Error",
    });
  } catch (error) {
    console.error("SBOBET: Error in settle:", error.message);
    return res.status(200).json({
      ErrorCode: 7,
      ErrorMessage: "Internal Error",
    });
  }
});

router.post("/api/sbobet/rollback", validateSBOBETRequest, async (req, res) => {
  try {
    const { Username, TransferCode } = req.body;

    const [currentUser, bets] = await Promise.all([
      User.findOne({ gameId: Username }, { wallet: 1, _id: 0 }).lean(),
      SportSBOBETModal.find(
        { betId: TransferCode },
        {
          settle: 1,
          cancel: 1,
          settleamount: 1,
          betamount: 1,
          producttype: 1,
          _id: 1,
        }
      )
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        ErrorCode: 1,
        ErrorMessage: "Member not exist",
        Balance: 0,
      });
    }

    if (!bets.length) {
      return res.status(200).json({
        ErrorCode: 6,
        ErrorMessage: "Bet not exists",
        Balance: roundToTwoDecimals(currentUser.wallet),
      });
    }

    const latestBet = bets[0];
    const hasBeenSettled = bets.some((bet) => bet.settle);
    const isRunning = !latestBet.settle && !latestBet.cancel;

    if (isRunning && !hasBeenSettled) {
      return res.status(200).json({
        ErrorCode: 2003,
        ErrorMessage: "Bet Already Rollback",
        Balance: roundToTwoDecimals(currentUser.wallet),
      });
    }

    let rollbackAmount = 0;

    if (latestBet.cancel) {
      rollbackAmount =
        latestBet.producttype === "9"
          ? -bets.reduce((sum, bet) => sum + (bet.betamount || 0), 0)
          : -(latestBet.betamount || 0);
    } else if (latestBet.settle) {
      const settledBet = bets.find((bet) => bet.settleamount > 0);
      rollbackAmount = -(settledBet?.settleamount || 0);
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: Username },
        { $inc: { wallet: roundToTwoDecimals(rollbackAmount) } },
        { new: true, projection: { wallet: 1, _id: 0 } }
      ).lean(),
      SportSBOBETModal.updateMany(
        { betId: TransferCode },
        { $set: { settle: false, settleamount: 0, cancel: false } }
      ),
    ]);

    return res.status(200).json({
      AccountName: Username,
      Balance: roundToTwoDecimals(updatedUserBalance.wallet),
      ErrorCode: 0,
      ErrorMessage: "No Error",
    });
  } catch (error) {
    console.error("SBOBET: Error in rollback:", error.message);
    return res.status(200).json({
      ErrorCode: 7,
      ErrorMessage: "Internal Error",
    });
  }
});

router.post("/api/sbobet/cancel", validateSBOBETRequest, async (req, res) => {
  try {
    const { Username, TransferCode, TransactionId, IsCancelAll } = req.body;

    const betFilter = IsCancelAll
      ? { betId: TransferCode, username: Username }
      : { betId: TransferCode, tranId: TransactionId, username: Username };

    const [currentUser, bets, alreadyCancelled] = await Promise.all([
      User.findOne({ gameId: Username }, { wallet: 1, _id: 0 }).lean(),
      SportSBOBETModal.find(betFilter, {
        settle: 1,
        settleamount: 1,
        betamount: 1,
        raiseamount: 1,
        _id: 0,
      }).lean(),
      SportSBOBETModal.exists({ ...betFilter, cancel: true }),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        ErrorCode: 1,
        ErrorMessage: "Member not exist",
        Balance: 0,
      });
    }

    if (!bets.length) {
      return res.status(200).json({
        ErrorCode: 6,
        ErrorMessage: "Bet not exists",
        Balance: roundToTwoDecimals(currentUser.wallet),
      });
    }

    if (alreadyCancelled) {
      return res.status(200).json({
        AccountName: Username,
        ErrorCode: 2002,
        ErrorMessage: "Bet Already Canceled",
        Balance: roundToTwoDecimals(currentUser.wallet),
      });
    }

    let totalRefund = 0;
    for (const bet of bets) {
      const raiseAmount = bet.raiseamount || 0;
      if (bet.settle) {
        totalRefund -= bet.settleamount || 0;
        totalRefund -= raiseAmount;
        totalRefund += bet.betamount || 0;
      } else {
        totalRefund += bet.betamount || 0;
        totalRefund -= raiseAmount;
      }
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: Username },
        { $inc: { wallet: roundToTwoDecimals(totalRefund) } },
        { new: true, projection: { wallet: 1, _id: 0 } }
      ).lean(),
      SportSBOBETModal.updateMany(betFilter, { $set: { cancel: true } }),
    ]);

    return res.status(200).json({
      AccountName: Username,
      Balance: roundToTwoDecimals(updatedUserBalance.wallet),
      ErrorCode: 0,
      ErrorMessage: "No Error",
    });
  } catch (error) {
    console.error("SBOBET: Error in cancel:", error.message);
    return res.status(200).json({
      ErrorCode: 7,
      ErrorMessage: "Internal Error",
    });
  }
});

router.post("/api/sbobet/bonus", validateSBOBETRequest, async (req, res) => {
  try {
    const { Username, Amount, TransferCode, TransactionId, ProductType } =
      req.body;

    const [currentUser, bonusExists] = await Promise.all([
      User.findOne({ gameId: Username }, { wallet: 1, _id: 0 }).lean(),
      SportSBOBETModal.exists({ betId: TransferCode }),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        ErrorCode: 1,
        ErrorMessage: "Member not exist",
        Balance: 0,
      });
    }

    if (bonusExists) {
      return res.status(200).json({
        ErrorCode: 5003,
        ErrorMessage: "Bonus With Same RefNo Exists",
        Balance: roundToTwoDecimals(currentUser.wallet),
      });
    }

    const bonusAmount = roundToTwoDecimals(Amount);

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: Username },
        { $inc: { wallet: bonusAmount } },
        { new: true, projection: { wallet: 1, _id: 0 } }
      ).lean(),
      SportSBOBETModal.create({
        betId: TransferCode,
        username: Username,
        producttype: ProductType,
        tranId: TransactionId,
        betamount: 0,
        bet: true,
        settle: true,
        settleamount: bonusAmount,
      }),
    ]);

    return res.status(200).json({
      AccountName: Username,
      Balance: roundToTwoDecimals(updatedUserBalance.wallet),
      ErrorCode: 0,
      ErrorMessage: "No Error",
    });
  } catch (error) {
    console.error("SBOBET: Error in bonus:", error.message);
    return res.status(200).json({
      ErrorCode: 7,
      ErrorMessage: "Internal Error",
    });
  }
});

router.post(
  "/api/sbobet/getbetstatus",
  validateSBOBETRequest,
  async (req, res) => {
    try {
      const { Username, TransferCode, TransactionId, ProductType } = req.body;

      const currentUser = await User.findOne(
        { gameId: Username },
        { _id: 1 }
      ).lean();

      if (!currentUser) {
        return res.status(200).json({
          ErrorCode: 1,
          ErrorMessage: "Member not exist",
        });
      }

      const betFilter =
        ProductType === 9
          ? { betId: TransferCode, tranId: TransactionId, username: Username }
          : { betId: TransferCode, username: Username };

      const bet = await SportSBOBETModal.findOne(betFilter, {
        betamount: 1,
        settleamount: 1,
        settle: 1,
        cancel: 1,
        _id: 0,
      })
        .sort({ createdAt: -1 })
        .lean();

      if (!bet) {
        return res.status(200).json({
          ErrorCode: 6,
          ErrorMessage: "Bet not exists",
        });
      }

      let status, winLoss;

      if (bet.cancel) {
        status = "void";
        winLoss = 0;
      } else if (bet.settle) {
        status = "settled";
        winLoss = roundToTwoDecimals(bet.settleamount || 0);
      } else {
        status = "running";
        winLoss = 0;
      }

      return res.status(200).json({
        TransferCode,
        TransactionId,
        Status: status,
        WinLoss: winLoss,
        Stake: roundToTwoDecimals(bet.betamount || 0),
        ErrorCode: 0,
        ErrorMessage: "No Error",
      });
    } catch (error) {
      console.error("SBOBET: Error in getbetstatus:", error.message);
      return res.status(200).json({
        ErrorCode: 7,
        ErrorMessage: "Internal Error",
      });
    }
  }
);

router.post("/api/sbobet/getturnoverforrebate", async (req, res) => {
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

    console.log("SBOBET QUERYING TIME", startDate, endDate);

    const records = await SportSBOBETModal.find({
      updatedAt: {
        $gte: startDate,
        $lt: endDate,
      },
      cancel: { $ne: true },
      settle: true,
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
        console.warn(`SBOBET User not found for gameId: ${gameId}`);
        return;
      }

      if (!playerSummary[actualUsername]) {
        playerSummary[actualUsername] = { turnover: 0, winloss: 0 };
      }

      playerSummary[actualUsername].turnover += record.betamount || 0;

      playerSummary[actualUsername].winloss +=
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
        gamename: "SBOBET",
        gamecategory: "Sports",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("SBOBET: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "SBOBET: Failed to fetch win/loss report",
        zh: "SBOBET: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/sbobet/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SportSBOBETModal.find({
        username: user.gameId,
        updatedAt: {
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
          gamename: "SBOBET",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("SBOBET: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "SBOBET: Failed to fetch win/loss report",
          zh: "SBOBET: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/sbobet/:userId/gamedata",
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

          if (slotGames["SBOBET"]) {
            totalTurnover += slotGames["SBOBET"].turnover || 0;
            totalWinLoss += slotGames["SBOBET"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "SBOBET",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("SBOBET: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "SBOBET: Failed to fetch win/loss report",
          zh: "SBOBET: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/sbobet/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SportSBOBETModal.find({
        updatedAt: {
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
          gamename: "SBOBET",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("SBOBET: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "SBOBET: Failed to fetch win/loss report",
          zh: "SBOBET: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/sbobet/kioskreport",
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

          if (liveCasino["SBOBET"]) {
            totalTurnover += Number(liveCasino["SBOBET"].turnover || 0);
            totalWinLoss += Number(liveCasino["SBOBET"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "SBOBET",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("SBOBET: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "SBOBET: Failed to fetch win/loss report",
          zh: "SBOBET: 获取盈亏报告失败",
        },
      });
    }
  }
);

module.exports = router;
