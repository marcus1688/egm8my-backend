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
const SlotJiliModal = require("../../models/slot_jili.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const qs = require("querystring");
const GameWalletLog = require("../../models/gamewalletlog.model");
const GameMega888H5GameModal = require("../../models/slot_mega888h5Database.model");
const SlotMega888H5Modal = require("../../models/slot_mega888h5.model");

require("dotenv").config();

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

const megaID = "@oc7";
const megaSecret = process.env.MEGAH5_SECRET;
const megaMdEncrypt = process.env.MEGAH5_MDENCRYPT;
const megaEncrypt = process.env.MEGAH5_ENCRYPT;
const megaToken = process.env.MEGAH5_TOKEN;
const webURL = "https://www.oc7.me/";
const megaAPIURL = "https://apigame.mg558h5.com/";
const megaGameURL = "https://apigame.mg558h5.com/";
const megaServiceDomain = "https://prov.h5mg888.com/";
const delimiter = "♂♫‼◄¶";

function generateUniqueTransactionId(prefix) {
  const uuid = uuidv4().replace(/-/g, "");
  return `${prefix}-${uuid.substring(0, 8)}`;
}

function desEncrypt(inString, key) {
  if (!inString || !key) {
    throw new Error("Input string and key are required");
  }

  try {
    // Using Latin1 to match ASCII encoding from C#
    const keyBytes = CryptoJS.enc.Latin1.parse(key);

    // Create DES encryptor with same key used as IV (matching C# implementation)
    const encrypted = CryptoJS.DES.encrypt(inString, keyBytes, {
      iv: keyBytes,
      mode: CryptoJS.mode.CBC, // Matching DESCryptoServiceProvider default
      padding: CryptoJS.pad.Pkcs7,
    });

    // Convert to Base64 and handle URL encoding
    return encrypted
      .toString()
      .replace(/\+/g, "%2b")
      .replace(/\//g, "%2f")
      .replace(/=/g, "%3d");
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

// MD5 Hash Function
function generateMD5Hash(inString) {
  // Use CryptoJS to match the C# implementation more closely
  return CryptoJS.MD5(inString).toString(CryptoJS.enc.Hex);
}

function getCurrentUTCTime() {
  return moment.utc().format("YYYYMMDDHHmmss");
}

function generateRandomPassword() {
  const randomNumber = crypto.randomInt(1000, 10000);

  return `OC7${randomNumber}`;
}

async function registerMega888H5User(user) {
  try {
    const response = await axios.post(
      `${megaServiceDomain}api/createplayer`,
      {
        accountID: user.userServerId,
        nickName: user.username,
        currency: "MYR",
      },
      {
        headers: {
          "Content-Type": "application/json",
          token: megaToken,
        },
      }
    );

    if (response.data.error !== "14" && response.data.error !== "0") {
      return {
        success: false,
        error: response.data.description,
      };
    }
    return {
      success: true,
      data: response.data,
      megah5Username: response.data.playerID,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

async function getMegaLoginAccessToken(user) {
  try {
    const currentTime = getCurrentUTCTime();

    const randomPass = generateRandomPassword();

    const queryString = `key=${megaSecret}${delimiter}time=${currentTime}${delimiter}userName=${user.mega888h5ID}${megaID}${delimiter}password=${randomPass}${delimiter}currency=MYR${delimiter}nickName=${user.username}`;

    const q = desEncrypt(queryString, megaEncrypt);

    const s = generateMD5Hash(
      queryString + megaMdEncrypt + currentTime + megaSecret
    );

    const requestBody = {
      q: q,
      s: s,
      accessToken: megaToken,
    };

    const response = await axios.post(
      `${megaAPIURL}api/Acc/Login`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.status !== "1") {
      return {
        success: false,
        error: response.data.description,
      };
    }

    await User.findOneAndUpdate(
      { username: user.username },
      {
        $set: {
          mega888h5PW: randomPass,
        },
      }
    );

    return {
      success: true,
      data: response.data,
      token: response.data.actk,
    };
  } catch (error) {
    console.error(
      "Error in getMegaLoginAccessToken:",
      error.response?.data || error.message
    );
    return {
      success: false,
      error: error.message,
    };
  }
}

router.post("/api/megah5/getgamelist", async (req, res) => {
  try {
    const games = await GameMega888H5GameModal.find({}).sort({
      hot: -1,
      createdAt: 1,
    });

    if (!games || games.length === 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "No games found. Please try again later.",
          zh: "未找到游戏。请稍后再试。",
          ms: "Tiada permainan ditemui. Sila cuba lagi kemudian.",
        },
      });
    }

    // Transform data into the desired format
    const reformattedGamelist = games.map((game) => ({
      GameCode: game.gameID,
      GameNameEN: game.gameNameEN,
      GameNameZH: game.gameNameCN,
      GameType: game.gameType,
      GameImage: game.imageUrlEN || "",
      GameImageZH: game.imageUrlCN || "",
      Hot: game.hot || false,
    }));

    return res.status(200).json({
      success: true,
      gamelist: reformattedGamelist,
    });
  } catch (error) {
    console.log("MEGA888H5 error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "MEGA888H5: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "MEGA888H5: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "MEGA888H5: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/megah5/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, gameCode } = req.body;
    const userId = req.user.userId;
    let user = await User.findById(userId);

    if (user.gameLock.mega888h5.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
        },
      });
    }

    if (!user.mega888h5ID) {
      const registerData = await registerMega888H5User(user);

      if (!registerData.success) {
        console.log(registerData);
        console.log(
          `MEGA888H5 error in registering account ${registerData.error}`
        );
        return res.status(200).json({
          success: false,
          message: {
            en: "MEGA888H5: Game launch failed. Please try again or contact customer service for assistance.",
            zh: "MEGA888H5: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "MEGA888H5: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }

      user = await User.findOneAndUpdate(
        { username: user.username },
        {
          $set: {
            mega888h5ID: registerData.megah5Username,
          },
        },
        { new: true }
      );
    }

    const tokenData = await getMegaLoginAccessToken(user);

    if (!tokenData.success) {
      console.log(`Mega888H5 error in registering account ${tokenData.error}`);
      return res.status(200).json({
        success: false,
        message: {
          en: "MEGA888H5: Game launch failed. Please try again or contact customer service for assistance.",
          zh: "MEGA888H5: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "MEGA888H5: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    let lang = "1";

    if (gameLang === "en") {
      lang = "1";
    } else if (gameLang === "zh") {
      lang = "2";
    } else if (gameLang === "ms") {
      lang = "1";
    }

    const gameUrl = `${megaGameURL}CallGame/?language=${lang}&user=${user.mega888h5ID}${megaID}&gName=${gameCode}&lobbyUrl=${webURL}&tkn=${tokenData.token}`;

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "MEGAH5"
    );

    return res.status(200).json({
      success: true,
      gameLobby: gameUrl,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
      },
    });
  } catch (error) {
    console.log("MEGA888H5 error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "MEGA888H5: Game launch failed. Please try again or customer service for assistance.",
        zh: "MEGA888H5: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "MEGA888H5: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/mega888h5/api/authenticate", async (req, res) => {
  try {
    const token = req.headers["token"];
    const { userName, password } = req.body;

    if (token !== "OC7") {
      console.log("failed 1");
      return res.status(200).json({
        error: "4",
        description: "Invalid Token",
      });
    }

    const currentUser = await User.findOne(
      { mega888h5ID: userName },
      { wallet: 1, mega888h5PW: 1, username: 1, mega888h5ID: 1 }
    ).lean();

    if (!currentUser || password !== currentUser.mega888h5PW) {
      console.log("failed 2");
      return res.status(200).json({
        error: "2",
        description: "Invalid User",
      });
    }

    return res.status(200).json({
      playerID: currentUser.mega888h5ID,
      balance: roundToTwoDecimals(currentUser.wallet),
      error: "0",
    });
  } catch (error) {
    console.error(
      "MEGA888H5: Error in game provider calling oc7 auth api:",
      error.message
    );
    return res.status(200).json({
      error: "100",
      description: "Internal Server Error, Please Contact Customer Service.",
    });
  }
});

router.get("/api/mega888h5/api/getbalance", async (req, res) => {
  try {
    const token = req.headers["token"];
    const { playerID } = req.query;

    if (token !== "OC7") {
      console.log("failed 11");
      return res.status(200).json({
        error: "4",
        description: "Invalid Token",
      });
    }

    const currentUser = await User.findOne(
      { mega888h5ID: playerID },
      { wallet: 1, username: 1, mega888h5ID: 1 }
    ).lean();
    if (!currentUser) {
      console.log("no user found");
      return res.status(200).json({
        error: "2",
        description: "Invalid User",
      });
    }
    console.log(currentUser.username);
    return res.status(200).json({
      balance: roundToTwoDecimals(currentUser.wallet),
      error: "0",
    });
  } catch (error) {
    console.error(
      "MEGA888H5: Error in game provider calling oc7 getbalance api:",
      error.message
    );
    return res.status(200).json({
      error: "100",
      description: "Internal Server Error, Please Contact Customer Service.",
    });
  }
});

router.post("/api/mega888h5/api/bet", async (req, res) => {
  try {
    const token = req.headers["token"];
    const {
      playerID,
      gameID,
      playSessionID,
      referenceID,
      betAmount,
      platform,
    } = req.body;

    if (token !== "OC7") {
      return res.status(200).json({
        error: "4",
        description: "Invalid Token",
      });
    }

    const [currentUser, existingBet] = await Promise.all([
      // Lean query with minimal projection
      User.findOne(
        { mega888h5ID: playerID },
        {
          wallet: 1,
          mega888h5ID: 1,
          "gameLock.mega888h5.lock": 1,
          _id: 1,
          username: 1,
        }
      ).lean(),

      // Just check existence
      SlotMega888H5Modal.findOne(
        { betId: referenceID, bet: true },
        { _id: 1 }
      ).lean(),
    ]);

    const txId = generateUniqueTransactionId("bet");

    if (!currentUser) {
      return res.status(200).json({
        error: "2",
        description: "Invalid User",
      });
    }

    if (currentUser.gameLock?.mega888h5?.lock) {
      return res.status(200).json({
        error: "6",
        description: "User Banned",
      });
    }

    if (existingBet) {
      return res.status(200).json({
        transactionID: txId,
        balance: roundToTwoDecimals(currentUser.wallet),
        error: "0",
      });
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: roundToTwoDecimals(betAmount || 0) },
      },
      { $inc: { wallet: -roundToTwoDecimals(betAmount || 0) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res.status(200).json({
        error: "1",
        description: "Insufficient Balance",
      });
    }

    await SlotMega888H5Modal.create({
      username: currentUser.username,
      betId: referenceID,
      bet: true,
      betamount: roundToTwoDecimals(betAmount),
      tranId: playSessionID,
    });

    return res.status(200).json({
      transactionID: txId,
      balance: roundToTwoDecimals(updatedUserBalance.wallet),
      error: "0",
    });
  } catch (error) {
    console.error(
      "MEGA888H5: Error in game provider calling oc7 get bet api:",
      error.message
    );
    return res.status(200).json({
      error: "100",
      description: "Internal Server Error, Please Contact Customer Service.",
    });
  }
});

router.post("/api/mega888h5/api/refund", async (req, res) => {
  try {
    const token = req.headers["token"];
    const {
      playerID,
      gameID,
      playSessionID,
      referenceID,
      betRefundID,
      betAmount,
      platform,
    } = req.body;

    if (token !== "OC7") {
      return res.status(200).json({
        error: "4",
        description: "Invalid Token",
      });
    }

    const [currentUser, existingBet, existingTransaction] = await Promise.all([
      // Lean query with minimal projection
      User.findOne(
        { mega888h5ID: playerID },
        { wallet: 1, _id: 1, username: 1, mega888h5ID: 1 }
      ).lean(),

      // Just check existence
      SlotMega888H5Modal.findOne(
        { betId: betRefundID, bet: true },
        { _id: 1 }
      ).lean(),

      // Just check existence
      SlotMega888H5Modal.findOne(
        {
          refundId: referenceID,
          cancel: true,
        },
        { _id: 1 }
      ).lean(),
    ]);

    const txId = generateUniqueTransactionId("refund");

    if (!currentUser) {
      return res.status(200).json({
        error: "2",
        description: "Invalid User",
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        error: "9",
        description: "Bet Not Found",
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        transactionID: txId,
        balance: roundToTwoDecimals(currentUser.wallet),
        error: "0",
      });
    }

    const [updatedUserBalance] = await Promise.all([
      // Update balance
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: roundToTwoDecimals(betAmount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      // Update transaction
      SlotMega888H5Modal.findOneAndUpdate(
        { betId: betRefundID },
        { $set: { cancel: true, refundId: referenceID } },
        { upsert: true }
      ),
    ]);

    return res.status(200).json({
      transactionID: txId,
      balance: roundToTwoDecimals(updatedUserBalance.wallet),
      error: "0",
    });
  } catch (error) {
    console.error(
      "MEGA888H5: Error in game provider calling oc7 get rollback api:",
      error.message
    );
    return res.status(200).json({
      error: "100",
      description: "Internal Server Error, Please Contact Customer Service.",
    });
  }
});

router.post("/api/mega888h5/api/betresult", async (req, res) => {
  try {
    const token = req.headers["token"];
    const { playerID, gameID, playSessionID, referenceID, winAmount, balance } =
      req.body;

    if (token !== "OC7") {
      return res.status(200).json({
        error: "4",
        description: "Invalid Token",
      });
    }

    const [currentUser, existingBet, existingTransaction] = await Promise.all([
      // Lean query with minimal projection
      User.findOne(
        { mega888h5ID: playerID },
        { wallet: 1, _id: 1, username: 1, mega888h5ID: 1 }
      ).lean(),

      // Just check existence
      SlotMega888H5Modal.findOne(
        { tranId: playSessionID, bet: true },
        { _id: 1 }
      ).lean(),

      // Just check existence
      SlotMega888H5Modal.findOne(
        {
          settleId: referenceID,
          settle: true,
        },
        { _id: 1 }
      ).lean(),
    ]);

    const txId = generateUniqueTransactionId("settle");

    if (!currentUser) {
      return res.status(200).json({
        error: "2",
        description: "Invalid User",
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        error: "9",
        description: "Bet Not Found",
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        transactionID: txId,
        balance: roundToTwoDecimals(currentUser.wallet),
        error: "0",
      });
    }

    const [updatedUserBalance] = await Promise.all([
      // Update balance
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: roundToTwoDecimals(winAmount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      // Update transaction
      SlotMega888H5Modal.findOneAndUpdate(
        { tranId: playSessionID },
        {
          $set: {
            settle: true,
            settleamount: roundToTwoDecimals(winAmount),
            settleId: referenceID,
          },
        },
        { upsert: true }
      ),
    ]);

    return res.status(200).json({
      transactionID: txId,
      balance: roundToTwoDecimals(updatedUserBalance.wallet),
      error: "0",
    });
  } catch (error) {
    console.error(
      "MEGA888H5: Error in game provider calling oc7 get game result api:",
      error.message
    );
    return res.status(200).json({
      error: "100",
      description: "Internal Server Error, Please Contact Customer Service.",
    });
  }
});

router.post("/api/mega888h5/api/fundrequest", async (req, res) => {
  try {
    const token = req.headers["token"];
    const { playerID, gameID, requestAmount, referenceID, platform } = req.body;

    if (token !== "OC7") {
      return res.status(200).json({
        error: "4",
        description: "Invalid Token",
      });
    }

    const [currentUser, existingTransaction] = await Promise.all([
      // Lean query with minimal projection
      User.findOne(
        { mega888h5ID: playerID },
        {
          wallet: 1,
          mega888h5ID: 1,
          "gameLock.mega888h5.lock": 1,
          _id: 1,
          username: 1,
        }
      ).lean(),

      // Just check existence
      SlotMega888H5Modal.findOne(
        { fundRequestId: referenceID },
        { _id: 1 }
      ).lean(),
    ]);

    const txId = generateUniqueTransactionId("fundreq");

    if (!currentUser) {
      return res.status(200).json({
        error: "2",
        description: "Invalid User",
      });
    }

    if (currentUser.gameLock?.mega888h5?.lock) {
      return res.status(200).json({
        error: "6",
        description: "User Banned",
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        transactionID: txId,
        balance: roundToTwoDecimals(currentUser.wallet),
        error: "0",
      });
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: roundToTwoDecimals(requestAmount || 0) },
      },
      { $inc: { wallet: -roundToTwoDecimals(requestAmount || 0) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res.status(200).json({
        error: "1",
        description: "Insufficient Balance",
      });
    }

    await SlotMega888H5Modal.create({
      username: currentUser.username,
      fundRequestId: referenceID,
      fundRequest: true,
      fundRequestAmount: roundToTwoDecimals(requestAmount),
    });

    return res.status(200).json({
      transactionID: txId,
      balance: roundToTwoDecimals(updatedUserBalance.wallet),
      error: "0",
    });
  } catch (error) {
    console.error(
      "MEGA888H5: Error in game provider calling oc7 fund request api:",
      error.message
    );
    return res.status(200).json({
      error: "100",
      description: "Internal Server Error, Please Contact Customer Service.",
    });
  }
});

router.post("/api/mega888h5/api/fundreturn", async (req, res) => {
  try {
    const token = req.headers["token"];
    const { playerID, gameID, returnAmount, referenceID, platform } = req.body;

    if (token !== "OC7") {
      return res.status(200).json({
        error: "4",
        description: "Invalid Token",
      });
    }

    const [currentUser, existingTransaction] = await Promise.all([
      // Lean query with minimal projection
      User.findOne(
        { mega888h5ID: playerID },
        { wallet: 1, _id: 1, username: 1, mega888h5ID: 1 }
      ).lean(),

      // Just check existence
      SlotMega888H5Modal.findOne(
        { fundReturnId: referenceID },
        { _id: 1 }
      ).lean(),
    ]);

    const txId = generateUniqueTransactionId("fundret");

    if (!currentUser) {
      return res.status(200).json({
        error: "2",
        description: "Invalid User",
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        transactionID: txId,
        balance: roundToTwoDecimals(currentUser.wallet),
        error: "0",
      });
    }

    const [updatedUserBalance] = await Promise.all([
      // Update balance
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: roundToTwoDecimals(returnAmount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      // Create transaction
      SlotMega888H5Modal.create({
        username: currentUser.username,
        fundReturnId: referenceID,
        fundReturn: true,
        fundReturnAmount: roundToTwoDecimals(returnAmount),
      }),
    ]);

    return res.status(200).json({
      transactionID: txId,
      balance: roundToTwoDecimals(updatedUserBalance.wallet),
      error: "0",
    });
  } catch (error) {
    console.error(
      "MEGA888H5: Error in game provider calling oc7 fund return api:",
      error.message
    );
    return res.status(200).json({
      error: "100",
      description: "Internal Server Error, Please Contact Customer Service.",
    });
  }
});

// FundBetResult API - Informational only, does not affect player balance
router.post("/api/mega888h5/api/fundbetresult", async (req, res) => {
  try {
    const token = req.headers["token"];
    const {
      playerID,
      gameID,
      playSessionID,
      referenceID,
      betAmount,
      winAmount,
      roundDetails,
      platform,
    } = req.body;

    if (token !== "OC7") {
      return res.status(200).json({
        error: "4",
        description: "Invalid Token",
      });
    }

    const [currentUser, existingTransaction] = await Promise.all([
      // Lean query with minimal projection
      User.findOne(
        { mega888h5ID: playerID },
        { wallet: 1, _id: 1, username: 1 }
      ).lean(),

      // Just check existence
      SlotMega888H5Modal.findOne(
        { fundBetResultId: referenceID },
        { _id: 1 }
      ).lean(),
    ]);

    const txId = generateUniqueTransactionId("fundbet");

    if (!currentUser) {
      return res.status(200).json({
        error: "2",
        description: "Invalid User",
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        transactionID: txId,
        error: "0",
      });
    }

    // For FundBetResult - Just record the transaction, don't update balance
    await SlotMega888H5Modal.create({
      username: currentUser.username,
      fundBetResultId: referenceID,
      bet: true,
      settle: true,
      betamount: roundToTwoDecimals(betAmount),
      settleamount: roundToTwoDecimals(winAmount),
      tranId: playSessionID,
    });

    return res.status(200).json({
      transactionID: txId,
      error: "0",
    });
  } catch (error) {
    console.error(
      "MEGA888H5: Error in game provider calling oc7 fund bet result api:",
      error.message
    );
    return res.status(200).json({
      error: "100",
      description: "Internal Server Error, Please Contact Customer Service.",
    });
  }
});

router.post("/api/mega888h5/api/jackpotwin", async (req, res) => {
  try {
    const token = req.headers["token"];
    const {
      playerID,
      gameID,
      playSessionID,
      referenceID,
      winAmount,
      jackpotModule,
      jackpotContributionAmt,
      roundDetails,
      platform,
      resultUrl,
    } = req.body;

    if (token !== "OC7") {
      return res.status(200).json({
        error: "4",
        description: "Invalid Token",
      });
    }

    const [currentUser, existingBet, existingTransaction] = await Promise.all([
      // Lean query with minimal projection
      User.findOne(
        { mega888h5ID: playerID },
        { wallet: 1, _id: 1, username: 1 }
      ).lean(),

      // Just check existence
      SlotMega888H5Modal.findOne(
        { tranId: playSessionID, bet: true },
        { _id: 1 }
      ).lean(),

      // Just check existence
      SlotMega888H5Modal.findOne(
        { jackpotWinId: referenceID },
        { _id: 1 }
      ).lean(),
    ]);

    const txId = generateUniqueTransactionId("jackpot");

    if (!currentUser) {
      return res.status(200).json({
        error: "2",
        description: "Invalid User",
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        error: "9",
        description: "Bet Not Found",
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        transactionID: txId,
        balance: roundToTwoDecimals(currentUser.wallet),
        error: "0",
      });
    }

    const [updatedUserBalance] = await Promise.all([
      // Update balance
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: roundToTwoDecimals(winAmount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      // Update transaction
      SlotMega888H5Modal.findOneAndUpdate(
        { tranId: playSessionID },
        {
          $set: {
            jackpotWinId: referenceID,
            settle: true,
            settleamount: roundToTwoDecimals(winAmount),
            jackpotWin: true,
          },
        },
        { upsert: true }
      ),
    ]);

    return res.status(200).json({
      transactionID: txId,
      balance: roundToTwoDecimals(updatedUserBalance.wallet),
      error: "0",
    });
  } catch (error) {
    console.error(
      "MEGA888H5: Error in game provider calling oc7 jackpot win api:",
      error.message
    );
    return res.status(200).json({
      error: "100",
      description: "Internal Server Error, Please Contact Customer Service.",
    });
  }
});

router.post("/api/mega888h5/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotMega888H5Modal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      settle: true,
      cancel: { $ne: true },
    });

    // Aggregate turnover and win/loss for each player
    let playerSummary = {};

    records.forEach((record) => {
      const username = record.username.toLowerCase();

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
        gamename: "MEGA888H5",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("MEGA888H5: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      error: "MEGA888H5: Failed to fetch win/loss report",
    });
  }
});

router.get(
  "/admin/api/mega888h5/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotMega888H5Modal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: startDate,
          $lt: endDate,
        },
        settle: true,
        cancel: { $ne: true },
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
          gamename: "MEGA888H5",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("MEGA888H5: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        error: "MEGA888H5: Failed to fetch win/loss report",
      });
    }
  }
);

router.get(
  "/admin/api/mega888h5/:userId/gamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await GameDataLog.find({
        username: user.username.toLowerCase(),
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

          if (slotGames["MEGA888H5"]) {
            totalTurnover += slotGames["MEGA888H5"].turnover || 0;
            totalWinLoss += slotGames["MEGA888H5"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "MEGA888H5",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("MEGA888H5: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        error: "MEGA888H5: Failed to fetch win/loss report",
      });
    }
  }
);

router.get(
  "/admin/api/mega888h5/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotMega888H5Modal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        settle: true,
        cancel: { $ne: true },
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
          gamename: "MEGA888H5",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("MEGA888H5: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        error: "MEGA888H5: Failed to fetch win/loss report",
      });
    }
  }
);

router.get(
  "/admin/api/mega888h5/kioskreport",
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

          if (liveCasino["MEGA888H5"]) {
            totalTurnover += Number(liveCasino["MEGA888H5"].turnover || 0);
            totalWinLoss += Number(liveCasino["MEGA888H5"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "MEGA888H5",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("MEGA888H5: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        error: "MEGA888H5: Failed to fetch win/loss report",
      });
    }
  }
);

module.exports = router;
