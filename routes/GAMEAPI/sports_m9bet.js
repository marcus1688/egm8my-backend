const express = require("express");
const router = express.Router();
const axios = require("axios");
const moment = require("moment");
const crypto = require("crypto");
const { authenticateToken } = require("../../auth/auth");
const { authenticateAdminToken } = require("../../auth/adminAuth");
const {
  User,
  adminUserWalletLog,
  GameDataLog,
} = require("../../models/users.model");
const { adminUser, adminLog } = require("../../models/adminuser.model");
const GameWalletLog = require("../../models/gamewalletlog.model");
const Decimal = require("decimal.js");
const SportM9BetModal = require("../../models/sport_m9bet.model");
require("dotenv").config();

const webURL = "http://egm8my.vip/";
const m9betAPIURL = "https://apid.mywinday.com";
const m9betAccount = "1jmegm8";
const m9betSecret = process.env.M9BET_SECRET;

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

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

async function registerM9BetUser(user) {
  try {
    const params = new URLSearchParams({
      action: "create",
      secret: m9betSecret,
      agent: m9betAccount,
      username: user.gameId,
    });

    const response = await axios.post(
      `${m9betAPIURL}/apijs.aspx?${params.toString()}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      }
    );
    if (response.data.errcode !== 0) {
      if (response.data.errcode === -1) {
        return {
          success: false,
          error: response.data.errtext,
          maintenance: true,
        };
      }

      return {
        success: false,
        error: response.data.errtext,
        maintenance: false,
      };
    }
    return {
      success: true,
      data: response.data,
      maintenance: false,
    };
  } catch (error) {
    return {
      success: false,
      error: error.response.data,
      maintenance: false,
    };
  }
}

router.post("/api/m9bet/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, clientPlatform } = req.body;
    const userId = req.user.userId;
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

    if (user.gameLock?.m9bet?.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
          zh_hk: "老闆你嘅遊戲訪問已經被鎖定咗，麻煩聯絡客服獲取進一步幫助。",
          id: "Akses permainan Anda telah dikunci. Silakan hubungi dukungan pelanggan untuk bantuan lebih lanjut.",
        },
      });
    }

    if (!user.m9betRegistered) {
      const registeredData = await registerM9BetUser(user);

      if (!registeredData.success) {
        console.log(`M9BET error in registering account ${registeredData}`);

        if (registeredData.maintenance) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Game under maintenance. Please try again later.",
              zh: "游戏正在维护中，请稍后再试。",
              ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
              zh_hk: "遊戲而家維護緊，老闆遲啲再試下。",
              id: "Permainan sedang dalam pemeliharaan. Silakan coba lagi nanti.",
            },
          });
        }

        return res.status(200).json({
          success: false,
          message: {
            en: "M9BET: Game launch failed. Please try again or customer service for assistance.",
            zh: "M9BET: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "M9BET: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "M9BET: 遊戲開唔到，老闆試多次或者搵客服幫手。",
            id: "M9BET: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      await User.findOneAndUpdate(
        { username: user.username },
        {
          $set: {
            m9betRegistered: true,
          },
        }
      );
    }

    let lang = "ZH-CN";

    if (gameLang === "en") {
      lang = "EN-US";
    } else if (gameLang === "zh") {
      lang = "ZH-CN";
    } else if (gameLang === "ms") {
      lang = "EN-US";
    } else if (gameLang === "id") {
      lang = "ID-ID";
    } else if (gameLang === "zh_hk") {
      lang = "ZH-CN";
    }

    const params = new URLSearchParams({
      action: "login",
      secret: m9betSecret,
      agent: m9betAccount,
      username: user.gameId,
      lang: lang,
      accType: "HK",
      timezoneid: "29",
      ref: webURL,
    });

    const response = await axios.post(
      `${m9betAPIURL}/apijs.aspx?${params.toString()}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      }
    );

    if (response.data.errcode !== 0) {
      if (response.data.errcode === -1) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Game under maintenance. Please try again later.",
            zh: "游戏正在维护中，请稍后再试。",
            ms: "Permainan sedang diselenggara, sila cuba lagi nanti.",
            zh_hk: "遊戲而家維護緊，老闆遲啲再試下。",
            id: "Permainan sedang dalam pemeliharaan. Silakan coba lagi nanti.",
          },
        });
      }

      return res.status(200).json({
        success: false,
        message: {
          en: "M9BET: Game launch failed. Please try again or customer service for assistance.",
          zh: "M9BET: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "M9BET: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "M9BET: 遊戲開唔到，老闆試多次或者搵客服幫手。",
          id: "M9BET: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "M9BET"
    );

    let platform = response.data.result.login.weburl;
    if (clientPlatform === "web") {
      platform = response.data.result.login.weburl;
    } else if (clientPlatform === "mobile") {
      platform = response.data.result.login.mobiurl;
    }

    return res.status(200).json({
      success: true,
      gameLobby: platform,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.error("M9BET login error:", error);
    return res.status(200).json({
      success: false,
      message: {
        en: "M9BET: Game launch failed. Please try again or customer service for assistance.",
        zh: "M9BET: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "M9BET: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "M9BET: 遊戲開唔到，老闆試多次或者搵客服幫手。",
        id: "M9BET: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.get("/api/m9bet", async (req, res) => {
  try {
    const { secret, action, userName, betId, amt } = req.query;

    if (!secret || !action || !userName) {
      return res.status(200).set("Content-Type", "application/xml")
        .send(`<?xml version="1.0" encoding="UTF-8"?>
  <response>
    <errcode>-100</errcode>
    <errtext>Missing required parameters</errtext>
    <result>0</result>
  </response>`);
    }

    if (secret !== m9betSecret) {
      return res.status(200).set("Content-Type", "application/xml")
        .send(`<?xml version="1.0" encoding="UTF-8"?>
  <response>
    <errcode>-2</errcode>
    <errtext>Invalid secret</errtext>
    <result>0</result>
  </response>`);
    }

    if (action === "getbalance") {
      const currentUser = await User.findOne(
        { gameId: userName },
        { wallet: 1, _id: 1 }
      ).lean();

      if (!currentUser) {
        return res.status(200).set("Content-Type", "application/xml")
          .send(`<?xml version="1.0" encoding="UTF-8"?>
    <response>
      <errcode>-4</errcode>
      <errtext>Invalid username</errtext>
      <result>0</result>
    </response>`);
      }
      return res.status(200).set("Content-Type", "application/xml")
        .send(`<?xml version="1.0" encoding="UTF-8"?>
<response>
  <errcode>0</errcode>
  <errtext></errtext>
  <result>${roundToTwoDecimals(currentUser.wallet)}</result>
</response>`);
    } else if (action === "placebet") {
      const [currentUser, existingTransaction] = await Promise.all([
        User.findOne(
          { gameId: userName },
          {
            wallet: 1,
            "gameLock.m9bet.lock": 1,
            _id: 1,
          }
        ).lean(),
        SportM9BetModal.findOne({ betId: betId }, { _id: 1 }).lean(),
      ]);

      if (!currentUser) {
        return res.status(200).set("Content-Type", "application/xml")
          .send(`<?xml version="1.0" encoding="UTF-8"?>
    <response>
      <errcode>-4</errcode>
      <errtext>Invalid username</errtext>
      <result>0</result>
    </response>`);
      }

      if (currentUser.gameLock?.m9bet?.lock) {
        return res.status(200).set("Content-Type", "application/xml")
          .send(`<?xml version="1.0" encoding="UTF-8"?>
    <response>
      <errcode>-99</errcode>
      <errtext>Player account banned</errtext>
      <result>0</result>
    </response>`);
      }

      if (existingTransaction) {
        return res.status(200).set("Content-Type", "application/xml")
          .send(`<?xml version="1.0" encoding="UTF-8"?>
<response>
  <errcode>0</errcode>
  <errtext></errtext>
  <result>${roundToTwoDecimals(currentUser.wallet)}</result>
</response>`);
      }

      const updatedUserBalance = await User.findOneAndUpdate(
        {
          gameId: userName,
          wallet: { $gte: roundToTwoDecimals(amt) },
        },
        { $inc: { wallet: -roundToTwoDecimals(amt) } },
        { new: true, projection: { wallet: 1 } }
      ).lean();

      if (!updatedUserBalance) {
        return res.status(200).set("Content-Type", "application/xml")
          .send(`<?xml version="1.0" encoding="UTF-8"?>
<response>
<errcode>-98</errcode>
<errtext>Insufficient Balance</errtext>
<result>${roundToTwoDecimals(currentUser.wallet)}</result>
</response>`);
      }

      await SportM9BetModal.create({
        username: userName,
        betId: betId,
        bet: true,
        betamount: roundToTwoDecimals(amt),
      });

      return res.status(200).set("Content-Type", "application/xml")
        .send(`<?xml version="1.0" encoding="UTF-8"?>
<response>
<errcode>0</errcode>
<errtext></errtext>
<result>${roundToTwoDecimals(updatedUserBalance.wallet)}</result>
</response>`);
    } else if (action === "rejectbet") {
      const [currentUser, existingTransaction] = await Promise.all([
        User.findOne(
          { gameId: userName },
          {
            wallet: 1,
            _id: 1,
          }
        ).lean(),
        SportM9BetModal.findOne(
          { betId: betId },
          { _id: 1, betamount: 1 }
        ).lean(),
      ]);

      if (!currentUser) {
        return res.status(200).set("Content-Type", "application/xml")
          .send(`<?xml version="1.0" encoding="UTF-8"?>
      <response>
        <errcode>-4</errcode>
        <errtext>Invalid username</errtext>
        <result>0</result>
      </response>`);
      }

      if (!existingTransaction) {
        return res.status(200).set("Content-Type", "application/xml")
          .send(`<?xml version="1.0" encoding="UTF-8"?>
  <response>
    <errcode>-97</errcode>
    <errtext>Bet not found</errtext>
    <result>${roundToTwoDecimals(currentUser.wallet)}</result>
  </response>`);
      }

      const [updatedUserBalance] = await Promise.all([
        User.findByIdAndUpdate(
          currentUser._id,
          {
            $inc: { wallet: roundToTwoDecimals(existingTransaction.betamount) },
          },
          { new: true, projection: { wallet: 1 } }
        ).lean(),

        SportM9BetModal.findOneAndUpdate(
          { betId: betId },
          { $set: { cancel: true } },
          { upsert: true, new: true }
        ),
      ]);

      return res.status(200).set("Content-Type", "application/xml")
        .send(`<?xml version="1.0" encoding="UTF-8"?>
  <response>
  <errcode>0</errcode>
  <errtext></errtext>
  <result>${roundToTwoDecimals(updatedUserBalance.wallet)}</result>
  </response>`);
    }

    return res.status(200).json({
      balance: balanceInCents,
      currency: "HKD",
      time: generateUnixTimestamp(),
    });
  } catch (error) {
    console.error("WE CASINO error in validate check:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
