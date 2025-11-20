const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");
const CryptoJS = require("crypto-js");
const moment = require("moment");
const { authenticateToken } = require("../../auth/auth");
const { authenticateAdminToken } = require("../../auth/adminAuth");
const {
  User,
  adminUserWalletLog,
  GameDataLog,
} = require("../../models/users.model");
const { v4: uuidv4 } = require("uuid");
const { parseStringPromise } = require("xml2js");
const GameWalletLog = require("../../models/gamewalletlog.model");
const LiveSaGamingModal = require("../../models/live_sagaming.model");

const webURL = "https://www.bm8my.vip/";
const saGamingApiUrl = "https://api.sa-apisvr.com/api/api.aspx";
const saGamingGameUrl = "https://web.sa-globalxns.com/app.aspx";
const saGamingSecurity = process.env.LIVE_SAGAMING_SECURITYKEY;
const saGamingEncrypt = process.env.LIVE_SAGAMING_ENCRYPTKEY;
const saGamingMD5Key = process.env.LIVE_SAGAMING_MD5KEY;

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

function BuildMD5(input) {
  return crypto.createHash("md5").update(input).digest("hex");
}

function DESEncrypt(str, key) {
  const keyHex = CryptoJS.enc.Utf8.parse(key.substring(0, 8));
  const ivHex = keyHex;

  const encrypted = CryptoJS.DES.encrypt(str, keyHex, {
    iv: ivHex,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return encrypted.toString();
}

function desDecrypt(encryptedData, key) {
  try {
    // Check if key is provided
    if (!key) {
      console.log("DES Decryption error: Key is undefined");
      return null;
    }

    // Ensure key is at least 8 characters for DES
    const desKey = key.substring(0, 8);

    // Parse the key and IV (same as key for DES CBC)
    const keyHex = CryptoJS.enc.Utf8.parse(desKey);
    const ivHex = keyHex; // Use same key as IV

    // Decrypt using CryptoJS
    const decrypted = CryptoJS.DES.decrypt(encryptedData, keyHex, {
      iv: ivHex,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    // Convert to string and remove padding characters
    const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
    return decryptedStr.replace(/[\x01-\x1F]/g, "");
  } catch (error) {
    console.log("DES Decryption error:", error);
    return null;
  }
}

router.post("/api/sagaming/launchGame", authenticateToken, async (req, res) => {
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

    if (user.gameLock.sagaming.lock) {
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

    const TokenTime = moment.utc().format("YYYYMMDDHHmmss");

    const TokenQueryString = `method=LoginRequest&Key=${saGamingSecurity}&Time=${TokenTime}&Username=${user.gameId}&CurrencyType=MYR`;

    const loginQ = encodeURIComponent(
      DESEncrypt(TokenQueryString, saGamingEncrypt)
    );

    const loginS = BuildMD5(
      TokenQueryString + saGamingMD5Key + TokenTime + saGamingSecurity
    );

    const loginData = `q=${loginQ}&s=${loginS}`;

    const loginResponse = await axios.post(saGamingApiUrl, loginData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const xmlData = loginResponse.data;
    const result = await parseStringPromise(xmlData);
    if (result.APIResponse) {
      TokenerrorMsgId = result.APIResponse.ErrorMsgId[0];
    } else if (result.LoginRequestResponse) {
      TokenerrorMsgId = result.LoginRequestResponse.ErrorMsgId[0];
    }

    if (TokenerrorMsgId === "129") {
      console.log("SA GAMING GAME maintenance");
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

    if (TokenerrorMsgId !== "0") {
      return res.status(200).json({
        success: false,
        message: {
          en: "SA GAMING: Game launch failed. Please try again or contact customer service for assistance.",
          zh: "SA GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "SA GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "SA GAMING: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "SA GAMING: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    const token = result.LoginRequestResponse.Token[0];

    let lang = "en-us";

    if (gameLang === "en") {
      lang = "en-us";
    } else if (gameLang === "zh") {
      lang = "zh-hans";
    } else if (gameLang === "ms") {
      lang = "ms";
    } else if (gameLang === "id") {
      lang = "id";
    } else if (gameLang === "zh_hk") {
      lang = "zh-hant";
    }

    const LaunchGameQueryString = `username=${user.gameId}&token=${token}&lobby=A12795&lang=${lang}&returnurl=${webURL}`;

    const lobbyURL = `${saGamingGameUrl}?${LaunchGameQueryString}`;

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "SA GAMING"
    );

    return res.status(200).json({
      success: true,
      gameLobby: lobbyURL,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("SA GAMING launch game fail: ", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "SA GAMING: Game launch failed. Please try again or contact customer service for assistance.",
        zh: "SA GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "SA GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "SA GAMING: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "SA GAMING: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/sagaming/GetUserBalance", async (req, res) => {
  try {
    if (req.headers["content-type"] === "text/plain") {
      let rawBody = "";

      req.on("data", (chunk) => {
        rawBody += chunk.toString();
      });

      req.on("end", async () => {
        try {
          const urlDecodedData = decodeURIComponent(rawBody);

          const decryptedData = desDecrypt(urlDecodedData, saGamingEncrypt);

          if (!decryptedData) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
  <RequestResponse>
      <error>1006</error>
  </RequestResponse>`);
          }

          // Step 3: Parse the decrypted URL parameters
          const urlParams = new URLSearchParams(decryptedData);
          const username = urlParams.get("username");
          const currency = urlParams.get("currency");

          if (currency !== "MYR") {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
<RequestResponse>
    <error>1001</error>
</RequestResponse>`);
          }

          const currentUser = await User.findOne(
            { gameId: username },
            { wallet: 1 }
          ).lean();

          if (!currentUser) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
<RequestResponse>
    <error>1000</error>
</RequestResponse>`);
          }

          return res.status(200).set("Content-Type", "application/xml")
            .send(`<?xml version="1.0" encoding="utf-8"?>
<RequestResponse>
<username>${username}</username>
<currency>${currency}</currency>
<amount>${roundToTwoDecimals(currentUser.wallet)}</amount>
<error>0</error>
</RequestResponse>`);
        } catch (parseError) {
          console.log("Parse error:", parseError);
          return res.status(200).set("Content-Type", "application/xml")
            .send(`<?xml version="1.0" encoding="utf-8"?>
  <RequestResponse>
      <error>1005</error>
  </RequestResponse>`);
        }
      });

      return;
    }
  } catch (error) {
    console.log("SA GAMING Error:", error.message);
    return res.status(200).set("Content-Type", "application/xml")
      .send(`<?xml version="1.0" encoding="utf-8"?>
  <RequestResponse>
      <error>9999</error>
  </RequestResponse>`);
  }
});

router.post("/api/sagaming/PlaceBet", async (req, res) => {
  try {
    if (req.headers["content-type"] === "text/plain") {
      let rawBody = "";

      req.on("data", (chunk) => {
        rawBody += chunk.toString();
      });

      req.on("end", async () => {
        try {
          const urlDecodedData = decodeURIComponent(rawBody);

          const decryptedData = desDecrypt(urlDecodedData, saGamingEncrypt);

          if (!decryptedData) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
    <RequestResponse>
        <error>1006</error>
    </RequestResponse>`);
          }

          // Step 3: Parse the decrypted URL parameters
          const urlParams = new URLSearchParams(decryptedData);
          const username = urlParams.get("username");
          const currency = urlParams.get("currency");
          const amount = urlParams.get("amount");
          const txnid = urlParams.get("txnid");

          const [currentUser, existingBet] = await Promise.all([
            User.findOne(
              { gameId: username },
              { username: 1, wallet: 1, "gameLock.sagaming.lock": 1 }
            ).lean(),

            LiveSaGamingModal.findOne({ betId: txnid }, { _id: 1 }).lean(),
          ]);

          if (currency !== "MYR") {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
  <RequestResponse>
      <error>1001</error>
  </RequestResponse>`);
          }

          if (!currentUser) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
  <RequestResponse>
      <error>1000</error>
  </RequestResponse>`);
          }

          if (currentUser.gameLock?.sagaming?.lock) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
<RequestResponse>
<username>${username}</username>
<currency>${currency}</currency>
<amount>${roundToTwoDecimals(currentUser.wallet)}</amount>
<error>1003</error>
</RequestResponse>`);
          }

          if (existingBet) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
  <RequestResponse>
  <username>${username}</username>
  <currency>${currency}</currency>
  <amount>${roundToTwoDecimals(currentUser.wallet)}</amount>
  <error>1005</error>
  </RequestResponse>`);
          }

          const updatedUserBalance = await User.findOneAndUpdate(
            {
              gameId: username,
              wallet: { $gte: roundToTwoDecimals(amount) },
            },
            { $inc: { wallet: -roundToTwoDecimals(amount) } },
            { new: true, projection: { wallet: 1 } }
          ).lean();

          if (!updatedUserBalance) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
<RequestResponse>
<username>${username}</username>
<currency>${currency}</currency>
<amount>${roundToTwoDecimals(currentUser.wallet)}</amount>
<error>1004</error>
</RequestResponse>`);
          }

          await LiveSaGamingModal.create({
            username: username,
            betamount: roundToTwoDecimals(amount),
            betId: txnid,
            bet: true,
          });

          return res.status(200).set("Content-Type", "application/xml")
            .send(`<?xml version="1.0" encoding="utf-8"?>
  <RequestResponse>
  <username>${username}</username>
  <currency>${currency}</currency>
  <amount>${roundToTwoDecimals(updatedUserBalance.wallet)}</amount>
  <error>0</error>
  </RequestResponse>`);
        } catch (parseError) {
          console.log("Parse error:", parseError);
          return res.status(200).set("Content-Type", "application/xml")
            .send(`<?xml version="1.0" encoding="utf-8"?>
    <RequestResponse>
        <error>1005</error>
    </RequestResponse>`);
        }
      });

      return;
    }
  } catch (error) {
    console.log("SA GAMING Error:", error.message);
    return res.status(200).set("Content-Type", "application/xml")
      .send(`<?xml version="1.0" encoding="utf-8"?>
    <RequestResponse>
        <error>9999</error>
    </RequestResponse>`);
  }
});

router.post("/api/sagaming/PlayerWin", async (req, res) => {
  try {
    if (req.headers["content-type"] === "text/plain") {
      let rawBody = "";

      req.on("data", (chunk) => {
        rawBody += chunk.toString();
      });

      req.on("end", async () => {
        try {
          const urlDecodedData = decodeURIComponent(rawBody);

          const decryptedData = desDecrypt(urlDecodedData, saGamingEncrypt);

          if (!decryptedData) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
        <RequestResponse>
            <error>1006</error>
        </RequestResponse>`);
          }

          // Step 3: Parse the decrypted URL parameters
          const urlParams = new URLSearchParams(decryptedData);
          const username = urlParams.get("username");
          const currency = urlParams.get("currency");
          const amount = urlParams.get("amount");
          const rolling = urlParams.get("rolling");
          const txnid = urlParams.get("txnid");
          const payoutdetails = urlParams.get("payoutdetails");

          // Parse payoutdetails JSON to extract txnid from betlist
          let betTxnIds = [];

          if (payoutdetails) {
            try {
              const payoutData = JSON.parse(payoutdetails);

              if (payoutData.betlist && Array.isArray(payoutData.betlist)) {
                payoutData.betlist.forEach((bet) => {
                  if (bet.txnid) {
                    betTxnIds.push(bet.txnid.toString());
                  }
                });
              }
            } catch (jsonError) {
              console.log("Error parsing payoutdetails JSON:", jsonError);
            }
          }

          const [currentUser, existingBets, existingResult] = await Promise.all(
            [
              User.findOne(
                { gameId: username },
                { username: 1, wallet: 1 }
              ).lean(),

              // Check if any of the bet txnids already exist
              LiveSaGamingModal.find(
                {
                  betId: { $in: betTxnIds },
                },
                { betId: 1 }
              ).lean(),

              LiveSaGamingModal.findOne({ settleId: txnid }, { _id: 1 }).lean(),
            ]
          );
          if (!currentUser) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
      <RequestResponse>
          <error>1000</error>
      </RequestResponse>`);
          }

          if (!existingBets || existingBets.length === 0) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
    <RequestResponse>
    <username>${username}</username>
    <currency>${currency}</currency>
    <amount>${roundToTwoDecimals(currentUser.wallet)}</amount>
    <error>1005</error>
    </RequestResponse>`);
          }

          if (existingResult) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
      <RequestResponse>
      <username>${username}</username>
      <currency>${currency}</currency>
      <amount>${roundToTwoDecimals(currentUser.wallet)}</amount>
      <error>1005</error>
      </RequestResponse>`);
          }

          const bulkOps = [];
          const processedBetIds = new Set();

          betTxnIds.forEach((betTxnId, index) => {
            if (processedBetIds.has(betTxnId)) {
              return;
            }
            // Only the first betId (index 0) gets the amount, rest get 0
            const settleAmount = index === 0 ? roundToTwoDecimals(amount) : 0;
            const validbetamount =
              index === 0 ? roundToTwoDecimals(rolling) : 0;

            bulkOps.push({
              updateOne: {
                filter: { betId: betTxnId },
                update: {
                  $set: {
                    settle: true,
                    settleId: txnid,
                    settleamount: settleAmount,
                    validbetamount: validbetamount,
                  },
                },
              },
            });
            processedBetIds.add(betTxnId);
          });

          const [updatedUserBalance] = await Promise.all([
            User.findOneAndUpdate(
              { gameId: username },
              { $inc: { wallet: roundToTwoDecimals(amount) } },
              { new: true, projection: { wallet: 1 } }
            ).lean(),

            LiveSaGamingModal.bulkWrite(bulkOps),
          ]);

          return res.status(200).set("Content-Type", "application/xml")
            .send(`<?xml version="1.0" encoding="utf-8"?>
      <RequestResponse>
      <username>${username}</username>
      <currency>${currency}</currency>
      <amount>${roundToTwoDecimals(updatedUserBalance.wallet)}</amount>
      <error>0</error>
      </RequestResponse>`);
        } catch (parseError) {
          console.log("Parse error:", parseError);
          return res.status(200).set("Content-Type", "application/xml")
            .send(`<?xml version="1.0" encoding="utf-8"?>
        <RequestResponse>
            <error>1005</error>
        </RequestResponse>`);
        }
      });

      return;
    }
  } catch (error) {
    console.log("SA GAMING Error:", error.message);
    return res.status(200).set("Content-Type", "application/xml")
      .send(`<?xml version="1.0" encoding="utf-8"?>
        <RequestResponse>
            <error>9999</error>
        </RequestResponse>`);
  }
});

router.post("/api/sagaming/PlayerLost", async (req, res) => {
  try {
    if (req.headers["content-type"] === "text/plain") {
      let rawBody = "";

      req.on("data", (chunk) => {
        rawBody += chunk.toString();
      });

      req.on("end", async () => {
        try {
          const urlDecodedData = decodeURIComponent(rawBody);

          const decryptedData = desDecrypt(urlDecodedData, saGamingEncrypt);

          if (!decryptedData) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
            <RequestResponse>
                <error>1006</error>
            </RequestResponse>`);
          }

          // Step 3: Parse the decrypted URL parameters
          const urlParams = new URLSearchParams(decryptedData);
          const username = urlParams.get("username");
          const currency = urlParams.get("currency");
          const rolling = urlParams.get("rolling");
          const txnid = urlParams.get("txnid");
          const payoutdetails = urlParams.get("payoutdetails");

          // Parse payoutdetails JSON to extract txnid from betlist
          let betTxnIds = [];

          if (payoutdetails) {
            try {
              const payoutData = JSON.parse(payoutdetails);

              if (payoutData.betlist && Array.isArray(payoutData.betlist)) {
                payoutData.betlist.forEach((bet) => {
                  if (bet.txnid) {
                    betTxnIds.push(bet.txnid.toString());
                  }
                });
              }
            } catch (jsonError) {
              console.log("Error parsing payoutdetails JSON:", jsonError);
            }
          }

          const [currentUser, existingBets, existingResult] = await Promise.all(
            [
              User.findOne(
                { gameId: username },
                { username: 1, wallet: 1 }
              ).lean(),

              // Check if any of the bet txnids already exist
              LiveSaGamingModal.find(
                {
                  betId: { $in: betTxnIds },
                },
                { betId: 1 }
              ).lean(),

              LiveSaGamingModal.findOne({ settleId: txnid }, { _id: 1 }).lean(),
            ]
          );

          if (!currentUser) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
          <RequestResponse>
              <error>1000</error>
          </RequestResponse>`);
          }

          if (!existingBets || existingBets.length === 0) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
      <RequestResponse>
      <username>${username}</username>
      <currency>${currency}</currency>
      <amount>${roundToTwoDecimals(currentUser.wallet)}</amount>
      <error>1005</error>
      </RequestResponse>`);
          }

          if (existingResult) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
          <RequestResponse>
          <username>${username}</username>
          <currency>${currency}</currency>
          <amount>${roundToTwoDecimals(currentUser.wallet)}</amount>
          <error>1005</error>
          </RequestResponse>`);
          }

          // Build bulk operations with rolling amount logic
          const bulkOps = [];
          const processedBetIds = new Set();

          betTxnIds.forEach((betTxnId, index) => {
            if (processedBetIds.has(betTxnId)) {
              return;
            }
            // Only the first betId (index 0) gets the rolling amount, rest get 0
            const validbetamount =
              index === 0 ? roundToTwoDecimals(rolling) : 0;

            bulkOps.push({
              updateOne: {
                filter: { betId: betTxnId },
                update: {
                  $set: {
                    settle: true,
                    settleId: txnid,
                    settleamount: 0,
                    validbetamount: validbetamount,
                  },
                },
              },
            });
            processedBetIds.add(betTxnId);
          });

          // Execute bulk update
          await LiveSaGamingModal.bulkWrite(bulkOps);

          return res.status(200).set("Content-Type", "application/xml")
            .send(`<?xml version="1.0" encoding="utf-8"?>
          <RequestResponse>
          <username>${username}</username>
          <currency>${currency}</currency>
          <amount>${roundToTwoDecimals(currentUser.wallet)}</amount>
          <error>0</error>
          </RequestResponse>`);
        } catch (parseError) {
          console.log("Parse error:", parseError);
          return res.status(200).set("Content-Type", "application/xml")
            .send(`<?xml version="1.0" encoding="utf-8"?>
            <RequestResponse>
                <error>1005</error>
            </RequestResponse>`);
        }
      });

      return;
    }
  } catch (error) {
    console.log("SA GAMING Error:", error.message);
    return res.status(200).set("Content-Type", "application/xml")
      .send(`<?xml version="1.0" encoding="utf-8"?>
            <RequestResponse>
                <error>9999</error>
            </RequestResponse>`);
  }
});

router.post("/api/sagaming/PlaceBetCancel", async (req, res) => {
  try {
    if (req.headers["content-type"] === "text/plain") {
      let rawBody = "";

      req.on("data", (chunk) => {
        rawBody += chunk.toString();
      });

      req.on("end", async () => {
        try {
          const urlDecodedData = decodeURIComponent(rawBody);

          const decryptedData = desDecrypt(urlDecodedData, saGamingEncrypt);

          if (!decryptedData) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
      <RequestResponse>
          <error>1006</error>
      </RequestResponse>`);
          }

          // Step 3: Parse the decrypted URL parameters
          const urlParams = new URLSearchParams(decryptedData);

          const username = urlParams.get("username");
          const currency = urlParams.get("currency");
          const amount = urlParams.get("amount");
          const txn_reverse_id = urlParams.get("txn_reverse_id");

          const [currentUser, existingBet] = await Promise.all([
            User.findOne(
              { gameId: username },
              { username: 1, wallet: 1 }
            ).lean(),

            LiveSaGamingModal.findOne(
              { betId: txn_reverse_id },
              { _id: 1, cancel: 1 }
            ).lean(),
          ]);

          if (currency !== "MYR") {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
  <RequestResponse>
      <error>1001</error>
  </RequestResponse>`);
          }

          if (!currentUser) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
    <RequestResponse>
        <error>1000</error>
    </RequestResponse>`);
          }

          if (!existingBet) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
    <RequestResponse>
    <username>${username}</username>
    <currency>${currency}</currency>
    <amount>${roundToTwoDecimals(currentUser.wallet)}</amount>
    <error>1005</error>
    </RequestResponse>`);
          }

          if (existingBet.cancel) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
    <RequestResponse>
    <username>${username}</username>
    <currency>${currency}</currency>
    <amount>${roundToTwoDecimals(currentUser.wallet)}</amount>
    <error>1005</error>
    </RequestResponse>`);
          }

          const [updatedUserBalance] = await Promise.all([
            User.findOneAndUpdate(
              { gameId: username },
              { $inc: { wallet: roundToTwoDecimals(amount) } },
              { new: true, projection: { wallet: 1 } }
            ).lean(),

            LiveSaGamingModal.updateOne(
              { betId: txn_reverse_id },
              { $set: { cancel: true } }
            ),
          ]);

          return res.status(200).set("Content-Type", "application/xml")
            .send(`<?xml version="1.0" encoding="utf-8"?>
    <RequestResponse>
    <username>${username}</username>
    <currency>${currency}</currency>
    <amount>${roundToTwoDecimals(updatedUserBalance.wallet)}</amount>
    <error>0</error>
    </RequestResponse>`);
        } catch (parseError) {
          console.log("Parse error:", parseError);
          return res.status(200).set("Content-Type", "application/xml")
            .send(`<?xml version="1.0" encoding="utf-8"?>
      <RequestResponse>
          <error>1005</error>
      </RequestResponse>`);
        }
      });

      return;
    }
  } catch (error) {
    console.log("SA GAMING Error:", error.message);
    return res.status(200).set("Content-Type", "application/xml")
      .send(`<?xml version="1.0" encoding="utf-8"?>
      <RequestResponse>
          <error>9999</error>
      </RequestResponse>`);
  }
});

router.post("/api/sagaming/BalanceAdjustment", async (req, res) => {
  try {
    if (req.headers["content-type"] === "text/plain") {
      let rawBody = "";

      req.on("data", (chunk) => {
        rawBody += chunk.toString();
      });

      req.on("end", async () => {
        try {
          const urlDecodedData = decodeURIComponent(rawBody);

          const decryptedData = desDecrypt(urlDecodedData, saGamingEncrypt);

          if (!decryptedData) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
        <RequestResponse>
            <error>1006</error>
        </RequestResponse>`);
          }

          // Step 3: Parse the decrypted URL parameters
          const urlParams = new URLSearchParams(decryptedData);
          const username = urlParams.get("username");
          const currency = urlParams.get("currency");
          const amount = parseFloat(urlParams.get("amount"));
          const txnid = urlParams.get("txnid");
          const adjustmenttype = parseInt(urlParams.get("adjustmenttype"));
          const [currentUser, existingTransaction] = await Promise.all([
            User.findOne(
              { gameId: username },
              { username: 1, wallet: 1 }
            ).lean(),
            LiveSaGamingModal.findOne(
              { betId: txnid },
              { _id: 1, adjustmentType: 1, cancel: 1 }
            ).lean(),
          ]);

          if (!currentUser) {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
<RequestResponse>
    <error>1000</error>
</RequestResponse>`);
          }
          // Handle Send Gift (adjustmenttype = 2)
          if (adjustmenttype === 2) {
            if (existingTransaction) {
              return res.status(200).set("Content-Type", "application/xml")
                .send(`<?xml version="1.0" encoding="utf-8"?>
    <RequestResponse>
    <username>${username}</username>
    <currency>${currency}</currency>
    <amount>${roundToTwoDecimals(currentUser.wallet)}</amount>
    <error>0</error>
    </RequestResponse>`);
            }

            const [updatedUser] = await Promise.all([
              User.findOneAndUpdate(
                {
                  gameId: username,
                  wallet: { $gte: roundToTwoDecimals(amount) },
                },
                { $inc: { wallet: -roundToTwoDecimals(amount) } },
                { new: true, projection: { wallet: 1 } }
              ).lean(),
              LiveSaGamingModal.create({
                username: username,
                betamount: roundToTwoDecimals(amount),
                betId: txnid,
                adjustmentType: 2,
                gift: true,
              }),
            ]);

            if (!updatedUser) {
              return res.status(200).set("Content-Type", "application/xml")
                .send(`<?xml version="1.0" encoding="utf-8"?>
<RequestResponse>
<username>${username}</username>
<currency>${currency}</currency>
<amount>${roundToTwoDecimals(currentUser.wallet)}</amount>
<error>1004</error>
</RequestResponse>`);
            }

            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
    <RequestResponse>
    <username>${username}</username>
    <currency>${currency}</currency>
    <amount>${roundToTwoDecimals(updatedUser.wallet)}</amount>
    <error>0</error>
    </RequestResponse>`);
          } else if (adjustmenttype === 3) {
            const adjustmentDetails = urlParams.get("adjustmentdetails");
            let cancelTxnId = null;

            try {
              if (adjustmentDetails) {
                const parsedDetails = JSON.parse(adjustmentDetails);
                cancelTxnId = parsedDetails.canceltxnid;
              }
            } catch (parseError) {
              console.log("Error parsing adjustmentdetails:", parseError);
            }

            const originalGiftTransaction = await LiveSaGamingModal.findOne({
              betId: cancelTxnId,
            }).lean();

            if (
              !originalGiftTransaction ||
              originalGiftTransaction.length === 0
            ) {
              console.log("hi");
              return res.status(200).set("Content-Type", "application/xml")
                .send(`<?xml version="1.0" encoding="utf-8"?>
    <RequestResponse>
    <username>${username}</username>
    <currency>${currency}</currency>
    <amount>${roundToTwoDecimals(currentUser.wallet)}</amount>
    <error>1005</error>
    </RequestResponse>`);
            }

            if (existingTransaction?.cancel) {
              return res.status(200).set("Content-Type", "application/xml")
                .send(`<?xml version="1.0" encoding="utf-8"?>
      <RequestResponse>
      <username>${username}</username>
      <currency>${currency}</currency>
      <amount>${roundToTwoDecimals(currentUser.wallet)}</amount>
      <error>1005</error>
      </RequestResponse>`);
            }

            const [updatedUser] = await Promise.all([
              User.findOneAndUpdate(
                {
                  gameId: username,
                },
                { $inc: { wallet: roundToTwoDecimals(amount) } },
                { new: true, projection: { wallet: 1 } }
              ).lean(),

              LiveSaGamingModal.findOneAndUpdate(
                { betId: cancelTxnId },
                { $set: { cancel: true } }
              ),

              LiveSaGamingModal.create({
                username: username,
                betamount: roundToTwoDecimals(amount),
                betId: txnid,
                adjustmentType: 3,
                gift: true,
                cancel: true,
              }),
            ]);

            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
    <RequestResponse>
    <username>${username}</username>
    <currency>${currency}</currency>
    <amount>${roundToTwoDecimals(updatedUser.wallet)}</amount>
    <error>0</error>
    </RequestResponse>`);
          } else {
            return res.status(200).set("Content-Type", "application/xml")
              .send(`<?xml version="1.0" encoding="utf-8"?>
            <RequestResponse>
                <error>9999</error>
            </RequestResponse>`);
          }
        } catch (parseError) {
          console.log("Parse error:", parseError);
          return res.status(200).set("Content-Type", "application/xml")
            .send(`<?xml version="1.0" encoding="utf-8"?>
        <RequestResponse>
            <error>1005</error>
        </RequestResponse>`);
        }
      });
      console.log("error invalid");
      return;
    }
  } catch (error) {
    console.log("SA GAMING Error:", error.message);
    return res.status(200).set("Content-Type", "application/xml")
      .send(`<?xml version="1.0" encoding="utf-8"?>
        <RequestResponse>
            <error>9999</error>
        </RequestResponse>`);
  }
});

router.post("/api/sagaming/getturnoverforrebate", async (req, res) => {
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

    console.log("SA GAMING QUERYING TIME", startDate, endDate);

    const records = await LiveSaGamingModal.find({
      createdAt: {
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
        console.warn(`SA GAMING User not found for gameId: ${gameId}`);
        return;
      }
      if (!playerSummary[actualUsername]) {
        playerSummary[actualUsername] = { turnover: 0, winloss: 0 };
      }

      playerSummary[actualUsername].turnover += record.validbetamount || 0;

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
        gamename: "SA GAMING",
        gamecategory: "Live Casino",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("SA GAMING: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "SA GAMING: Failed to fetch win/loss report",
        zh: "SA GAMING: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/sagaming/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await LiveSaGamingModal.find({
        username: user.gameId,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },

        settle: true,
      });

      // Aggregate turnover and win/loss for each player
      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.validbetamount || 0;
        totalWinLoss += (record.settleamount || 0) - (record.betamount || 0);
      });

      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));
      // Return the aggregated results
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "SA GAMING",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("SA GAMING: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "SA GAMING: Failed to fetch win/loss report",
          zh: "SA GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/sagaming/:userId/gamedata",
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
          gameCategories["Live Casino"] &&
          gameCategories["Live Casino"] instanceof Map
        ) {
          const slotGames = Object.fromEntries(gameCategories["Live Casino"]);

          if (slotGames["SA GAMING"]) {
            totalTurnover += slotGames["SA GAMING"].turnover || 0;
            totalWinLoss += slotGames["SA GAMING"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "SA GAMING",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("SA GAMING: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "SA GAMING: Failed to fetch win/loss report",
          zh: "SA GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/sagaming/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await LiveSaGamingModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },

        settle: true,
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.validbetamount || 0;

        totalWinLoss += (record.betamount || 0) - (record.settleamount || 0);
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "SA GAMING",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("SA GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "SA GAMING: Failed to fetch win/loss report",
          zh: "SA GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/sagaming/kioskreport",
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
          gameCategories["Live Casino"] &&
          gameCategories["Live Casino"] instanceof Map
        ) {
          const liveCasino = Object.fromEntries(gameCategories["Live Casino"]);

          if (liveCasino["SA GAMING"]) {
            totalTurnover += Number(liveCasino["SA GAMING"].turnover || 0);
            totalWinLoss += Number(liveCasino["SA GAMING"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "SA GAMING",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("SA GAMING: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "SA GAMING: Failed to fetch win/loss report",
          zh: "SA GAMING: 获取盈亏报告失败",
        },
      });
    }
  }
);
module.exports = router;
