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
const LivePrettyGamingModal = require("../../models/live_prettygaming.model");
const Decimal = require("decimal.js");
require("dotenv").config();

const prettygamingAgent = "EGM8MYR";
const prettygamingSecret = process.env.PRETTYGAMING_SECRET;
const webURL = "https://www.bm8my.vip/";
const prettygamingAPIURL = "https://api-prod.aghippo168.com/apiRoute";

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

router.post(
  "/api/prettygaming/launchGame",
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

      if (user.gameLock.prettygaming.lock) {
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

      const { gameLang, clientPlatform } = req.body;

      let lang = "EN";

      if (gameLang === "en") {
        lang = "EN";
      } else if (gameLang === "zh") {
        lang = "CNM";
      } else if (gameLang === "ms") {
        lang = "MS";
      } else if (gameLang === "id") {
        lang = "ID";
      } else if (gameLang === "zh_hk") {
        lang = "CNC";
      }

      const requestBody = {
        agentUsername: prettygamingAgent,
        agentApiKey: prettygamingSecret,
        playerUsername: user.gameId,
        betLimit: [3001],
      };
      const response = await axios.post(
        `${prettygamingAPIURL}/member/loginRequest`,
        requestBody,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.code !== 0) {
        console.log("PRETTY GAMING error in launching game", response.data);

        return res.status(200).json({
          success: false,
          message: {
            en: "PRETTY GAMING: Game launch failed. Please try again or customer service for assistance.",
            zh: "PRETTY GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "PRETTY GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "PRETTY GAMING: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
            id: "PRETTY GAMING: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }
      let url = `${response.data.data.uriDesktop}&lang=${lang}`;
      if (clientPlatform === "web") {
        url = `${response.data.data.uriDesktop}&lang=${lang}`;
      } else if (clientPlatform === "mobile") {
        url = `${response.data.data.uriMobile}&lang=${lang}`;
      }

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "PRETTY GAMING"
      );

      return res.status(200).json({
        success: true,
        gameLobby: url,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
          zh_hk: "遊戲啟動成功。",
          id: "Permainan berhasil diluncurkan.",
        },
      });
    } catch (error) {
      console.log("PRETTY GAMING error in launching game", error);
      return res.status(200).json({
        success: false,
        message: {
          en: "PRETTY GAMING: Game launch failed. Please try again or customer service for assistance.",
          zh: "PRETTY GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "PRETTY GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "PRETTY GAMING: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "PRETTY GAMING: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post("/api/prettygaming", async (req, res) => {
  try {
    const { service, data } = req.body;

    if (!service || !data) {
      return res.status(200).json({ code: 911009 });
    }

    const { playerUsername, ticketId, totalBetAmt, totalPayOutAmt } = data;
    const gameId = playerUsername?.toUpperCase();

    switch (service) {
      case "GetUserBalance": {
        const currentUser = await User.findOne(
          { gameId },
          { wallet: 1 }
        ).lean();

        if (!currentUser) {
          return res.status(200).json({ code: 911008 });
        }

        return res.status(200).json({
          code: 0,
          balance: roundToTwoDecimals(currentUser.wallet),
        });
      }

      case "UserPlaceBet": {
        const [currentUser, existingBet] = await Promise.all([
          User.findOne(
            { gameId },
            { wallet: 1, "gameLock.prettygaming.lock": 1 }
          ).lean(),
          LivePrettyGamingModal.findOne({ betId: ticketId }, { _id: 1 }).lean(),
        ]);

        if (!currentUser) {
          return res.status(200).json({ code: 911008 });
        }

        if (currentUser.gameLock?.prettygaming?.lock) {
          return res.status(200).json({ code: 911002 });
        }

        if (existingBet) {
          return res.status(200).json({ code: 911005 });
        }

        const betAmount = roundToTwoDecimals(Math.abs(totalBetAmt));

        const updatedUserBalance = await User.findOneAndUpdate(
          { gameId, wallet: { $gte: betAmount } },
          { $inc: { wallet: -betAmount } },
          { new: true, projection: { wallet: 1 } }
        ).lean();

        if (!updatedUserBalance) {
          return res.status(200).json({ code: 911001 });
        }

        await LivePrettyGamingModal.create({
          username: gameId,
          betId: ticketId,
          bet: true,
          betamount: betAmount,
        });

        return res.status(200).json({ code: 0 });
      }

      case "UserPlaceBetCancel": {
        const existingBet = await LivePrettyGamingModal.findOne(
          { betId: ticketId },
          { cancel: 1, settle: 1, betamount: 1 }
        ).lean();

        if (!existingBet) {
          return res.status(200).json({ code: 51102 });
        }

        if (existingBet.cancel || existingBet.settle) {
          return res.status(200).json({ code: 51101 });
        }

        const refundAmount = roundToTwoDecimals(Math.abs(totalBetAmt));

        await Promise.all([
          User.updateOne({ gameId }, { $inc: { wallet: refundAmount } }),
          LivePrettyGamingModal.updateOne(
            { betId: ticketId, cancel: { $ne: true }, settle: { $ne: true } },
            { $set: { cancel: true } }
          ),
        ]);

        return res.status(200).json({ code: 0 });
      }

      case "UserPlacePayout": {
        const existingBet = await LivePrettyGamingModal.findOne(
          { betId: ticketId },
          { cancel: 1, settle: 1 }
        ).lean();

        if (!existingBet) {
          return res.status(200).json({ code: 51102 });
        }

        if (existingBet.cancel || existingBet.settle) {
          return res.status(200).json({ code: 51101 });
        }

        await Promise.all([
          User.updateOne(
            { gameId },
            { $inc: { wallet: roundToTwoDecimals(totalPayOutAmt) } }
          ),
          LivePrettyGamingModal.updateOne(
            { betId: ticketId },
            {
              $set: {
                settle: true,
                settleamount: roundToTwoDecimals(totalPayOutAmt),
              },
            }
          ),
        ]);

        return res.status(200).json({ code: 0 });
      }

      default: {
        return res.status(200).json({ code: 911009 });
      }
    }
  } catch (error) {
    console.error("Pretty Gaming callback error:", error.message);
    return res.status(200).json({ code: 911009 });
  }
});
module.exports = router;
