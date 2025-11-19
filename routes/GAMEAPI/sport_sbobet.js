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
const webURL = "http://egm8my.vip/";
const sbobetAPIURL = "https://ex-api-yy.xxttgg.com";
const sbobetAgent = "EGM8MYR";
const sbobetCreatedAgent = "EGM8MYRAM";

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

// async function registerSBOBETAgent() {
//   try {
//     const requestData = {
//       CompanyKey: sbobetSecret,
//       ServerID: generateTraceCode(),
//       Username: "EGM8MYRAM",
//       Password: "Qwer1234",
//       Currency: "MYR",
//       Min: 10,
//       Max: 50000,
//       MaxPerMatch: 50000,
//       CasinoTableLimit: 2,
//       isTwoFAEnabled: false,
//     };

//     const response = await axios.post(
//       `${sbobetAPIURL}/web-root/restricted/agent/register-agent.aspx`,
//       requestData,
//       {
//         headers: {
//           "Content-Type": "application/json",
//         },
//       }
//     );

//     if (response.data.error.id !== 0) {
//       console.log("sbo response error register agent", response.data);

//       return {
//         success: false,
//         error: response.data,
//       };
//     }

//     return {
//       success: true,
//       data: response.data,
//     };
//   } catch (error) {
//     console.error(
//       "Register Agent SBOBET error in creating member:",
//       error.message
//     );
//     return {
//       success: false,
//       error: error.message,
//     };
//   }
// }
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

router.post("/api/sbobet/getbalance", async (req, res) => {
  try {
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

    const currentUser = await User.findOne(
      { gameId: Username },
      { wallet: 1 }
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
    console.error(
      "SBOBET: Error in game provider calling get balance api:",
      error.message
    );
    return res.status(200).json({
      ErrorCode: 7,
      ErrorMessage: "Internal Error",
    });
  }
});

router.post("/api/sbobet/deduct", async (req, res) => {
  try {
    const {
      Amount,
      TransferCode,
      TransactionId,
      CompanyKey,
      ProductType,
      Username,
    } = req.body;

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

    const betAmount = roundToTwoDecimals(Amount);

    if (ProductType === 3 || ProductType === 7) {
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

        const amountDifference = betAmount - firstBetAmount;

        const updatedUserBalance = await User.findOneAndUpdate(
          {
            gameId: Username,
            wallet: { $gte: roundToTwoDecimals(amountDifference) },
          },
          { $inc: { wallet: -roundToTwoDecimals(amountDifference) } },
          { new: true, projection: { wallet: 1 } }
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
          BetAmount: Amount,
        });
      }

      const [updatedUserBalance, createdBet] = await Promise.all([
        User.findOneAndUpdate(
          { gameId: Username, wallet: { $gte: betAmount } },
          { $inc: { wallet: -betAmount } },
          { new: true, projection: { wallet: 1, _id: 0 } }
        ).lean(),

        SportSBOBETModal.create({
          betId: TransferCode,
          username: Username,
          producttype: ProductType,
          tranId: TransactionId,
          betamount: betAmount,
          bet: true,
        }),
      ]);

      if (!updatedUserBalance) {
        SportSBOBETModal.findByIdAndDelete(createdBet._id).catch(() => {});

        console.log("PlaceBet not enough balance");
        return res.status(200).json({
          ErrorCode: 5,
          ErrorMessage: "Not enough balance",
          Balance: roundToTwoDecimals(currentUser.wallet),
        });
      }

      return res.status(200).json({
        AccountName: Username,
        Balance: roundToTwoDecimals(updatedUserBalance.wallet),
        ErrorCode: 0,
        ErrorMessage: "No Error",
        BetAmount: betAmount,
      });
    } else if (ProductType === 9) {
      const [currentUser, existingBet] = await Promise.all([
        User.findOne(
          { gameId: Username },
          { _id: 1, wallet: 1, "gameLock.sbobet.lock": 1 }
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
        {
          gameId: Username,
          wallet: { $gte: betAmount },
        },
        { $inc: { wallet: -betAmount } },
        { new: true, projection: { wallet: 1 } }
      ).lean();

      if (!updatedUserBalance) {
        console.log("PlaceBet not enough balance");
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
    } else {
      const [currentUser, existingBet] = await Promise.all([
        User.findOne(
          { gameId: Username },
          { _id: 1, wallet: 1, "gameLock.sbobet.lock": 1 }
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

      const [updatedUserBalance, createdBet] = await Promise.all([
        User.findOneAndUpdate(
          {
            gameId: Username,
            wallet: { $gte: betAmount },
          },
          { $inc: { wallet: -betAmount } },
          { new: true, projection: { wallet: 1 } }
        ).lean(),

        SportSBOBETModal.create({
          betId: TransferCode,
          username: Username,
          producttype: ProductType,
          tranId: TransactionId,
          betamount: betAmount,
          bet: true,
        }),
      ]);

      if (!updatedUserBalance) {
        SportSBOBETModal.findByIdAndDelete(createdBet._id).catch(() => {});

        return res.status(200).json({
          ErrorCode: 5,
          ErrorMessage: "Not enough balance",
          Balance: roundToTwoDecimals(currentUser.wallet),
        });
      }

      return res.status(200).json({
        AccountName: Username,
        Balance: roundToTwoDecimals(updatedUserBalance.wallet),
        ErrorCode: 0,
        ErrorMessage: "No Error",
        BetAmount: Amount,
      });
    }
  } catch (error) {
    console.error(
      "SBOBET: Error in game provider calling place bet api:",
      error.message
    );
    return res.status(200).json({
      ErrorCode: 7,
      ErrorMessage: "Internal Error",
    });
  }
});

router.post("/api/sbobet/settle", async (req, res) => {
  try {
    const { CompanyKey, Username, TransferCode, WinLoss, IsCashOut } = req.body;

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

    const [currentUser, bets, alreadyCancelled, alreadySettled] = // ✅ Swapped order
      await Promise.all([
        User.findOne({ gameId: Username }, { wallet: 1, _id: 0 }).lean(),
        SportSBOBETModal.find({ betId: TransferCode }, { _id: 1 })
          .sort({ createdAt: 1 })
          .lean(),
        SportSBOBETModal.exists({ betId: TransferCode, cancel: true }), // ✅ Check cancel first
        SportSBOBETModal.exists({ betId: TransferCode, settle: true }),
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
        ErrorCode: 2002,
        ErrorMessage: "Bet Already Canceled",
        Balance: roundToTwoDecimals(currentUser.wallet),
      });
    }

    if (alreadySettled) {
      return res.status(200).json({
        ErrorCode: 2001,
        ErrorMessage: "Bet Already Settled",
        Balance: roundToTwoDecimals(currentUser.wallet),
      });
    }
    const settleAmount = roundToTwoDecimals(WinLoss);

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
                settleamount: index === 0 ? settleAmount : 0,
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
    console.error(
      "SBOBET: Error in game provider calling settle api:",
      error.message
    );
    return res.status(200).json({
      ErrorCode: 7,
      ErrorMessage: "Internal Error",
    });
  }
});

router.post("/api/sbobet/rollback", async (req, res) => {
  try {
    const { CompanyKey, Username, TransferCode } = req.body;

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

    const [currentUser, bets] = await Promise.all([
      User.findOne({ gameId: Username }, { wallet: 1, _id: 0 }).lean(),
      SportSBOBETModal.find(
        { betId: TransferCode },
        { settle: 1, cancel: 1, settleamount: 1, betamount: 1, _id: 1 }
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
    const isCancelled = latestBet.cancel;
    const isRunning = !latestBet.settle && !latestBet.cancel;

    if (isRunning && !hasBeenSettled) {
      return res.status(200).json({
        ErrorCode: 2003,
        ErrorMessage: "Bet Already Rollback",
        Balance: roundToTwoDecimals(currentUser.wallet),
      });
    }

    let rollbackAmount = 0;

    if (isCancelled) {
      rollbackAmount = -(latestBet.betamount || 0);
    } else if (latestBet.settle) {
      rollbackAmount = -(latestBet.settleamount || 0);
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: Username },
        { $inc: { wallet: roundToTwoDecimals(rollbackAmount) } },
        { new: true, projection: { wallet: 1 } }
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
    console.error(
      "SBOBET: Error in game provider calling rollback api:",
      error.message
    );
    return res.status(200).json({
      ErrorCode: 7,
      ErrorMessage: "Internal Error",
    });
  }
});

router.post("/api/sbobet/cancel", async (req, res) => {
  try {
    const { CompanyKey, Username, TransferCode, TransactionId, IsCancelAll } =
      req.body;

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

    const betFilter = IsCancelAll
      ? { betId: TransferCode, username: Username }
      : { betId: TransferCode, tranId: TransactionId, username: Username };

    const [currentUser, bets, alreadyCancelled] = await Promise.all([
      User.findOne({ gameId: Username }, { wallet: 1, _id: 0 }).lean(),
      SportSBOBETModal.find(betFilter, {
        settle: 1,
        settleamount: 1,
        betamount: 1,
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
        ErrorCode: 2002,
        ErrorMessage: "Bet Already Canceled",
        Balance: roundToTwoDecimals(currentUser.wallet),
      });
    }

    let totalRefund = 0;
    for (const bet of bets) {
      if (bet.settle) {
        totalRefund -= bet.settleamount || 0;
        totalRefund += bet.betamount || 0;
      } else {
        totalRefund += bet.betamount || 0;
      }
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { gameId: Username },
        { $inc: { wallet: roundToTwoDecimals(totalRefund) } },
        { new: true, projection: { wallet: 1 } }
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
    console.error(
      "SBOBET: Error in game provider calling rollback api:",
      error.message
    );
    return res.status(200).json({
      ErrorCode: 7,
      ErrorMessage: "Internal Error",
    });
  }
});

router.post("/api/sbobet/bonus", async (req, res) => {
  try {
    const {
      CompanyKey,
      Username,
      Amount,
      TransferCode,
      TransactionId,
      ProductType,
    } = req.body;

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

    const [currentUser, bonusExists] = await Promise.all([
      User.findOne({ gameId: Username }, { wallet: 1, _id: 1 }).lean(),
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
        { $inc: { wallet: roundToTwoDecimals(Amount) } },
        { new: true, projection: { wallet: 1 } }
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
    console.error(
      "SBOBET: Error in game provider calling settle api:",
      error.message
    );
    return res.status(200).json({
      ErrorCode: 7,
      ErrorMessage: "Internal Error",
    });
  }
});

router.post("/api/sbobet/getbetstatus", async (req, res) => {
  try {
    const { CompanyKey, Username, TransferCode, TransactionId, ProductType } =
      req.body;

    if (!Username) {
      return res.status(200).json({
        ErrorCode: 3,
        ErrorMessage: "Username empty",
      });
    }

    if (CompanyKey !== sbobetSecret) {
      return res.status(200).json({
        ErrorCode: 4,
        ErrorMessage: "CompanyKey Error",
      });
    }

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

    let bet;
    if (ProductType === 9) {
      bet = await SportSBOBETModal.findOne(
        {
          betId: TransferCode,
          tranId: TransactionId,
          username: Username,
        },
        {
          betamount: 1,
          settleamount: 1,
          settle: 1,
          cancel: 1,
          _id: 0,
        }
      )
        .sort({ createdAt: -1 })
        .lean();
    } else {
      bet = await SportSBOBETModal.findOne(
        {
          betId: TransferCode,
          username: Username,
        },
        {
          betamount: 1,
          settleamount: 1,
          settle: 1,
          cancel: 1,
          _id: 0,
        }
      )
        .sort({ createdAt: -1 })
        .lean();
    }

    if (!bet) {
      return res.status(200).json({
        ErrorCode: 6,
        ErrorMessage: "Bet not exists",
      });
    }

    let status;
    let winLoss = 0;
    let stake = roundToTwoDecimals(bet.betamount || 0);

    if (bet.cancel) {
      // Bet is voided/cancelled
      status = "void";
      winLoss = 0;
    } else if (bet.settle) {
      // Bet is settled
      status = "settled";
      winLoss = roundToTwoDecimals(bet.settleamount || 0);
    } else {
      // Bet is still running
      status = "running";
      winLoss = 0;
    }

    return res.status(200).json({
      TransferCode: TransferCode,
      TransactionId: TransactionId,
      Status: status,
      WinLoss: winLoss,
      Stake: stake,
      ErrorCode: 0,
      ErrorMessage: "No Error",
    });
  } catch (error) {
    console.error("SBOBET getbetstatus error:", error);
    return res.status(200).json({
      ErrorCode: 7,
      ErrorMessage: "Internal Error",
    });
  }
});
module.exports = router;
