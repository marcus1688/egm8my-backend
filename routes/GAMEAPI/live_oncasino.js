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
const LiveOnCasinoModal = require("../../models/live_oncasino.model");
const Decimal = require("decimal.js");
require("dotenv").config();

const oncasinoSecret = process.env.ONCASINO_SECRET;
const webURL = "https://www.bm8my.vip/";
const oncasinoAPIURL = "https://third-api.ongames.info";
const oncasinoAgent = "EGM8MYR";

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

function generateNonceStr() {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 5; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }
  return result;
}

function generateOnCasinoSign(params, secret) {
  const sortedKeys = Object.keys(params)
    .filter((key) => {
      if (key === "sign") return false;
      const value = params[key];
      return value !== null && value !== undefined && value !== "";
    })
    .sort();

  const paramString = sortedKeys
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const stringToSign = paramString + "&key=" + secret;

  return crypto.createHash("md5").update(stringToSign).digest("hex");
}

function verifyOnCasinoSign(params, secret) {
  const { agent, userName, taskNo, nonceStr } = params;

  const signParams = { agent, userName, taskNo, nonceStr };

  const sortedKeys = Object.keys(signParams)
    .filter((key) => signParams[key] !== null && signParams[key] !== undefined)
    .sort();

  const paramString = sortedKeys
    .map((key) => `${key}=${signParams[key]}`)
    .join("&");

  const stringToSign = paramString + "&key=" + secret;

  return crypto.createHash("md5").update(stringToSign).digest("hex");
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

function generateTraceCode() {
  return uuidv4();
}

router.post("/api/oncasino/launchGame", authenticateToken, async (req, res) => {
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

    if (user.gameLock.oncasino.lock) {
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

    let lang = "en";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "zh-CN";
    } else if (gameLang === "ms") {
      lang = "en";
    } else if (gameLang === "id") {
      lang = "id-ID";
    } else if (gameLang === "zh_hk") {
      lang = "zh-TW";
    }

    let platform = 0;
    if (clientPlatform === "web") {
      platform = 0;
    } else if (clientPlatform === "mobile") {
      platform = 1;
    }

    const token = `${user.gameId}:${generateRandomCode()}`;

    const nonceStr = generateNonceStr();

    const requestBody = {
      lang,
      userName: user.gameId,
      loginSrc: platform,
      agent: oncasinoAgent,
      nickName: user.username,
      backUrl: webURL,
      testFlag: 0,
      nonceStr,
    };

    const sign = generateOnCasinoSign(requestBody, oncasinoSecret);
    requestBody.sign = sign;

    const response = await axios.post(
      `${oncasinoAPIURL}/api/game-center/login`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          "x-session-platform-code": "WE88",
          "x-plat-token": token,
        },
      }
    );

    if (response.data.code !== 0) {
      console.log("ON CASINO error in launching game", response.data);

      return res.status(200).json({
        success: false,
        message: {
          en: "ON CASINO: Game launch failed. Please try again or customer service for assistance.",
          zh: "ON CASINO: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "ON CASINO: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "ON CASINO: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "ON CASINO: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        oncasinoGameToken: token,
      },
      { new: true }
    );

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "ON CASINO"
    );

    const gameUrl = `${response.data.t.domain}${response.data.t.token}`;

    return res.status(200).json({
      success: true,
      gameLobby: gameUrl,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("ON CASINO error in launching game", error);
    return res.status(200).json({
      success: false,
      message: {
        en: "ON CASINO: Game launch failed. Please try again or customer service for assistance.",
        zh: "ON CASINO: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "ON CASINO: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "ON CASINO: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "ON CASINO: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/oncasino/getBalance", async (req, res) => {
  try {
    const { agent, userName, taskNo, sign, nonceStr } = req.body;

    if (
      sign !==
      verifyOnCasinoSign({ agent, userName, taskNo, nonceStr }, oncasinoSecret)
    ) {
      return res
        .status(200)
        .json({ success: false, msg: "Invalid Sign", code: 500 });
    }

    const currentUser = await User.findOne(
      { gameId: userName, oncasinoGameToken: req.headers["x-plat-token"] },
      { wallet: 1 }
    ).lean();

    if (!currentUser) {
      return res
        .status(200)
        .json({ success: false, msg: "Invalid User", code: 8050 });
    }

    return res.status(200).json({
      success: true,
      msg: "ok",
      code: 0,
      t: { balance: roundToTwoDecimals(currentUser.wallet), currency: "MYR" },
    });
  } catch (error) {
    console.error("OnCasino getBalance error:", error.message);
    return res
      .status(200)
      .json({ success: false, msg: "Internal Server Error", code: 500 });
  }
});

router.post("/api/oncasino/placeBet", async (req, res) => {
  try {
    const {
      agent,
      userName,
      taskNo,
      sign,
      nonceStr,
      totalChangeMoney,
      betInfos,
    } = req.body;

    if (
      sign !==
      verifyOnCasinoSign({ agent, userName, taskNo, nonceStr }, oncasinoSecret)
    ) {
      return res
        .status(200)
        .json({ success: false, msg: "Invalid Sign", code: 500 });
    }
    const sessiontoken = req.headers["x-plat-token"];
    const orderNos = betInfos.map((info) => info.betRecord.orderNo);

    const [currentUser, existingCount] = await Promise.all([
      User.findOne(
        { gameId: userName },
        { wallet: 1, oncasinoGameToken: 1, "gameLock.oncasino.lock": 1 }
      ).lean(),
      LiveOnCasinoModal.countDocuments({ betId: { $in: orderNos } }),
    ]);

    if (!currentUser || currentUser.oncasinoGameToken !== sessiontoken) {
      return res
        .status(200)
        .json({ success: false, msg: "Invalid User", code: 8050 });
    }

    if (currentUser.gameLock?.oncasino?.lock) {
      return res
        .status(200)
        .json({ success: false, msg: "User account disabled", code: 8051 });
    }

    if (existingCount > 0) {
      return res
        .status(200)
        .json({ success: false, msg: "Duplicate Bet", code: 8053 });
    }

    const updatedUser = await User.findOneAndUpdate(
      {
        gameId: userName,
        wallet: { $gte: roundToTwoDecimals(Math.abs(totalChangeMoney)) },
      },
      { $inc: { wallet: roundToTwoDecimals(totalChangeMoney) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUser) {
      return res.status(200).json({
        success: false,
        msg: "Insufficient Balance",
        code: 8052,
      });
    }

    await LiveOnCasinoModal.insertMany(
      betInfos.map((info) => ({
        betId: info.betRecord.orderNo,
        tranId: taskNo,
        username: userName,
        bet: true,
        betamount: roundToTwoDecimals(Math.abs(info.betRecord.stake)),
      })),
      { ordered: false }
    );

    return res.status(200).json({
      success: true,
      msg: "ok",
      code: 0,
      t: {
        balance: roundToTwoDecimals(updatedUser.wallet),
        currency: "MYR",
      },
    });
  } catch (error) {
    console.error("OnCasino placeBet error:", error.message);
    return res.status(200).json({
      success: false,
      msg: "Internal Server Error",
      code: 500,
    });
  }
});

router.post("/api/oncasino/cancelBet", async (req, res) => {
  try {
    const {
      agent,
      userName,
      taskNo,
      sign,
      nonceStr,
      totalChangeMoney,
      orderNoList,
    } = req.body;

    if (
      sign !==
      verifyOnCasinoSign({ agent, userName, taskNo, nonceStr }, oncasinoSecret)
    ) {
      return res
        .status(200)
        .json({ success: false, msg: "Invalid Sign", code: 500 });
    }

    const [currentUser, existingBets] = await Promise.all([
      User.findOne({ gameId: userName }, { _id: 1 }).lean(),
      LiveOnCasinoModal.find(
        { betId: { $in: orderNoList } },
        { betId: 1, cancel: 1, settle: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res
        .status(200)
        .json({ success: false, msg: "Invalid User", code: 8050 });
    }

    if (existingBets.length !== orderNoList.length) {
      return res
        .status(200)
        .json({ success: false, msg: "Order not found", code: 8054 });
    }

    const betIdsToCancel = [];

    for (const bet of existingBets) {
      if (!bet.settle && !bet.cancel) {
        betIdsToCancel.push(bet.betId);
      }
    }

    if (betIdsToCancel.length === 0) {
      return res.status(200).json({ success: true, msg: "ok", code: 0 });
    }

    await Promise.all([
      User.updateOne(
        { gameId: userName },
        { $inc: { wallet: roundToTwoDecimals(totalChangeMoney) } }
      ),
      LiveOnCasinoModal.updateMany(
        { betId: { $in: betIdsToCancel } },
        { $set: { cancel: true } }
      ),
    ]);

    return res.status(200).json({
      success: true,
      msg: "ok",
      code: 0,
    });
  } catch (error) {
    console.error("OnCasino cancelBet error:", error.message);
    return res.status(200).json({
      success: false,
      msg: "Internal Server Error",
      code: 500,
    });
  }
});

router.post("/api/oncasino/payout", async (req, res) => {
  try {
    const {
      agent,
      userName,
      taskNo,
      sign,
      nonceStr,
      totalChangeMoney,
      betInfos,
    } = req.body;

    if (
      sign !==
      verifyOnCasinoSign({ agent, userName, taskNo, nonceStr }, oncasinoSecret)
    ) {
      return res
        .status(200)
        .json({ success: false, msg: "Invalid Sign", code: 500 });
    }

    const orderNoList = betInfos.map((info) => info.betRecord.orderNo);

    const [currentUser, existingBets] = await Promise.all([
      User.findOne({ gameId: userName }, { _id: 1 }).lean(),
      LiveOnCasinoModal.find(
        { betId: { $in: orderNoList } },
        { betId: 1, cancel: 1, settle: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        success: false,
        msg: "Invalid User",
        code: 8050,
      });
    }

    if (existingBets.length !== orderNoList.length) {
      return res
        .status(200)
        .json({ success: false, msg: "Order not found", code: 8054 });
    }

    for (const bet of existingBets) {
      if (bet.settle || bet.cancel) {
        return res.status(200).json({
          success: false,
          msg: "Bet is cancelled or settled",
          code: 8053,
        });
      }
    }

    const [updatedUser] = await Promise.all([
      User.findOneAndUpdate(
        { _id: currentUser._id },
        { $inc: { wallet: roundToTwoDecimals(totalChangeMoney) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
      LiveOnCasinoModal.bulkWrite(
        betInfos.map((info) => ({
          updateOne: {
            filter: { betId: info.betRecord.orderNo },
            update: {
              $set: {
                settle: true,
                betamount: roundToTwoDecimals(info.betRecord.validBetAmount),
                settleamount: roundToTwoDecimals(info.betRecord.grossWin),
              },
            },
          },
        })),
        { ordered: false }
      ),
    ]);

    return res.status(200).json({
      success: true,
      msg: "ok",
      code: 0,
      t: { balance: roundToTwoDecimals(updatedUser.wallet), currency: "MYR" },
    });
  } catch (error) {
    console.error("OnCasino payout error:", error.message);
    return res.status(200).json({
      success: false,
      msg: "Internal Server Error",
      code: 500,
    });
  }
});

router.post("/api/oncasino/cancelOrder", async (req, res) => {
  try {
    const {
      agent,
      userName,
      taskNo,
      sign,
      nonceStr,
      totalChangeMoney,
      betInfos,
    } = req.body;

    if (
      sign !==
      verifyOnCasinoSign({ agent, userName, taskNo, nonceStr }, oncasinoSecret)
    ) {
      return res
        .status(200)
        .json({ success: false, msg: "Invalid Sign", code: 500 });
    }

    const orderNoList = betInfos.map((info) => info.betRecord.orderNo);

    const [currentUser, existingBets] = await Promise.all([
      User.findOne({ gameId: userName }, { _id: 1 }).lean(),
      LiveOnCasinoModal.find(
        { betId: { $in: orderNoList } },
        { betId: 1, cancel: 1, settle: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        success: false,
        msg: "Invalid User",
        code: 8050,
      });
    }

    if (existingBets.length !== orderNoList.length) {
      return res
        .status(200)
        .json({ success: false, msg: "Order not found", code: 8054 });
    }

    for (const bet of existingBets) {
      if (!bet.settle || bet.cancel) {
        return res.status(200).json({
          success: false,
          msg: "Order not settled or already cancelled",
          code: 8053,
        });
      }
    }

    await Promise.all([
      User.updateOne(
        { _id: currentUser._id },
        { $inc: { wallet: roundToTwoDecimals(totalChangeMoney) } }
      ),
      LiveOnCasinoModal.updateMany(
        { betId: { $in: orderNoList } },
        { $set: { cancel: true } }
      ),
    ]);

    return res.status(200).json({
      success: true,
      msg: "ok",
      code: 0,
    });
  } catch (error) {
    console.error("OnCasino cancelOrder error:", error.message);
    return res.status(200).json({
      success: false,
      msg: "Internal Server Error",
      code: 500,
    });
  }
});

router.post("/api/oncasino/reSettle", async (req, res) => {
  try {
    const {
      agent,
      userName,
      taskNo,
      sign,
      nonceStr,
      totalChangeMoney,
      betInfos,
    } = req.body;

    if (
      sign !==
      verifyOnCasinoSign({ agent, userName, taskNo, nonceStr }, oncasinoSecret)
    ) {
      return res
        .status(200)
        .json({ success: false, msg: "Invalid Sign", code: 500 });
    }

    const orderNoList = betInfos.map((info) => info.betRecord.orderNo);

    const [currentUser, existingBets] = await Promise.all([
      User.findOne({ gameId: userName }, { _id: 1 }).lean(),
      LiveOnCasinoModal.find(
        { betId: { $in: orderNoList } },
        { betId: 1, settle: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res
        .status(200)
        .json({ success: false, msg: "Invalid User", code: 8050 });
    }

    if (existingBets.length !== orderNoList.length) {
      return res
        .status(200)
        .json({ success: false, msg: "Order not found", code: 8054 });
    }

    for (const bet of existingBets) {
      if (!bet.settle) {
        return res
          .status(200)
          .json({ success: false, msg: "Order not settled", code: 8054 });
      }
    }

    await Promise.all([
      User.updateOne(
        { _id: currentUser._id },
        { $inc: { wallet: roundToTwoDecimals(totalChangeMoney) } }
      ),
      LiveOnCasinoModal.bulkWrite(
        betInfos.map((info) => ({
          updateOne: {
            filter: { betId: info.betRecord.orderNo },
            update: {
              $set: {
                settle: true,
                cancel: false,
                betamount: roundToTwoDecimals(info.betRecord.validBetAmount),
                settleamount: roundToTwoDecimals(info.betRecord.grossWin),
              },
            },
          },
        })),
        { ordered: false }
      ),
    ]);

    return res.status(200).json({
      success: true,
      msg: "ok",
      code: 0,
    });
  } catch (error) {
    console.error("OnCasino reSettle error:", error.message);
    return res.status(200).json({
      success: false,
      msg: "Internal Server Error",
      code: 500,
    });
  }
});

router.post("/api/oncasino/dealerReward", async (req, res) => {
  try {
    const { agent, userName, taskNo, sign, nonceStr, rewardRecord } = req.body;

    if (
      sign !==
      verifyOnCasinoSign({ agent, userName, taskNo, nonceStr }, oncasinoSecret)
    ) {
      return res
        .status(200)
        .json({ success: false, msg: "Invalid Sign", code: 500 });
    }

    const { orderNo, changeMoney } = rewardRecord;

    const [currentUser, existingBet] = await Promise.all([
      User.findOne({ gameId: userName }, { _id: 1 }).lean(),
      LiveOnCasinoModal.exists({ betId: orderNo }),
    ]);

    if (!currentUser) {
      return res
        .status(200)
        .json({ success: false, msg: "Invalid User", code: 8050 });
    }

    if (existingBet) {
      return res
        .status(200)
        .json({ success: false, msg: "Duplicate Reward", code: 8053 });
    }

    const absAmount = roundToTwoDecimals(Math.abs(changeMoney));
    const roundedChange = roundToTwoDecimals(changeMoney);

    const filter =
      changeMoney < 0
        ? { _id: currentUser._id, wallet: { $gte: absAmount } }
        : { _id: currentUser._id };

    const updatedUser = await User.findOneAndUpdate(
      filter,
      { $inc: { wallet: roundedChange } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUser) {
      return res.status(200).json({
        success: false,
        msg: "Insufficient Balance",
        code: 8052,
      });
    }

    await LiveOnCasinoModal.create({
      betId: orderNo,
      tranId: taskNo,
      username: userName,
      betamount: 0,
      bet: true,
      settle: true,
      settleamount: 0,
      tipamount: absAmount,
    });

    return res.status(200).json({
      success: true,
      msg: "ok",
      code: 0,
      t: { balance: roundToTwoDecimals(updatedUser.wallet), currency: "MYR" },
    });
  } catch (error) {
    console.error("OnCasino dealerReward error:", error.message);
    return res.status(200).json({
      success: false,
      msg: "Internal Server Error",
      code: 500,
    });
  }
});

router.post("/api/oncasino/cancelReward", async (req, res) => {
  try {
    const {
      agent,
      userName,
      taskNo,
      sign,
      nonceStr,
      totalChangeMoney,
      orderNo,
    } = req.body;

    if (
      sign !==
      verifyOnCasinoSign({ agent, userName, taskNo, nonceStr }, oncasinoSecret)
    ) {
      return res
        .status(200)
        .json({ success: false, msg: "Invalid Sign", code: 500 });
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne({ gameId: userName }, { _id: 1 }).lean(),
      LiveOnCasinoModal.exists({ betId: orderNo }),
    ]);

    if (!currentUser) {
      return res
        .status(200)
        .json({ success: false, msg: "Invalid User", code: 8050 });
    }

    if (!existingBet) {
      return res
        .status(200)
        .json({ success: false, msg: "Order not found", code: 8054 });
    }

    await Promise.all([
      User.updateOne(
        { _id: currentUser._id },
        { $inc: { wallet: roundToTwoDecimals(totalChangeMoney) } }
      ),
      LiveOnCasinoModal.updateOne(
        { betId: orderNo },
        { $set: { cancel: true } }
      ),
    ]);

    return res.status(200).json({
      success: true,
      msg: "ok",
      code: 0,
    });
  } catch (error) {
    console.error(
      "Oncasino: Error in game provider calling  settle bet api:",
      error.message
    );
    return res.status(200).json({
      success: false,
      msg: "Internal Server Error",
      code: 500,
    });
  }
});
module.exports = router;
