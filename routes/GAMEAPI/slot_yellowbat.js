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
const SlotRich88Modal = require("../../models/slot_rich88.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const qs = require("querystring");
const GameWalletLog = require("../../models/gamewalletlog.model");
const GameRich88GameModal = require("../../models/slot_rich88Database.model");
const GameRich88GeneralGameModal = require("../../models/slot_rich88General.model");
const Decimal = require("decimal.js");
require("dotenv").config();

const yellowbatDC = "TITANS";
const yellowbatIV = process.env.YELLOWBAT_IV;
const yellowbatKEY = process.env.YELLOWBAT_KEY;
const webURL = "https://www.bm8my.vip/";
const yellowbatAPIURL = "https://api.ybdigit.net";
const yellowbatParent = "egm8myr";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function getCurrentTimestamp() {
  return moment.utc().valueOf(); // Returns the current timestamp in milliseconds (UTC)
}

function base64EncodeUrl(str) {
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

//To encrypt
function AESEncrypt(data, aesKey, aesIv) {
  const key = CryptoJS.enc.Utf8.parse(aesKey);
  const iv = CryptoJS.enc.Utf8.parse(aesIv);
  const encrypted = CryptoJS.AES.encrypt(data.trim(), key, {
    iv,
    padding: CryptoJS.pad.ZeroPadding,
  }).toString();
  return base64EncodeUrl(encrypted);
}

//To decrypt
function AesDecrypt(encryptedString, aesKey, aesIv) {
  const key = CryptoJS.enc.Utf8.parse(aesKey);
  const iv = CryptoJS.enc.Utf8.parse(aesIv);
  const decrypted = CryptoJS.AES.decrypt(
    base64DecodeUrl(encryptedString.trim()),
    key,
    {
      iv,
      padding: CryptoJS.pad.ZeroPadding,
    }
  );
  return CryptoJS.enc.Utf8.stringify(decrypted);
}

function base64DecodeUrl(str) {
  str = (str + "===").slice(0, str.length + (str.length % 4));
  return str.replace(/-/g, "+").replace(/_/g, "/");
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

router.post("/api/yellowbat/getprovidergamelist", async (req, res) => {
  try {
    //en or cn
    console.log("hi");
    const { gameLang } = req.body;

    let lang;

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "cn";
    }

    const data = {
      action: 49,
      ts: getCurrentTimestamp(),
      parent: yellowbatParent,
      lang: lang,
    };

    const encryptedPayload = AESEncrypt(
      JSON.stringify(data),
      yellowbatKEY,
      yellowbatIV
    );

    const axiosInstance = axios.create({
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const response = await axiosInstance.post(
      `${yellowbatAPIURL}/apiRequest.do`,
      qs.stringify({ dc: yellowbatDC, x: encryptedPayload })
    );

    const responseData = response.data;

    if (responseData.status !== "0000") {
      console.log("YWLLOABAT error fetching game list:", responseData);
      return res.status(200).json({
        success: false,
        message: {
          en: "YWLLOABAT: Unable to retrieve game lists. Please contact customer service for assistance.",
          zh: "YWLLOABAT: 无法获取游戏列表，请联系客服以获取帮助。",
          ms: "YWLLOABAT: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
    const gameTypeMap = {
      0: "Slot",
      7: "Fishing",
      9: "Arcade",
      12: "Lottery",
      18: "Card",
      50: "Slot",
    };

    // Transform the response data and filter only the allowed GameType
    const formattedGames = responseData.data.flatMap((game) =>
      game.list.map((gameItem) => ({
        GameCode: gameItem.mType,
        GameImage: gameItem.image,
        GameNameEN: gameItem.name,
        GameType: gameTypeMap[game.gType] || null, // Convert gType to text or ignore
      }))
    );

    // Filtering out invalid game types
    const filteredGames = formattedGames.filter(
      (game) => game.GameType !== null
    );

    return res.status(200).json({
      success: true,
      gamelist: filteredGames,
    });
  } catch (error) {
    console.log("YWLLOABAT error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "YWLLOABAT: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "YWLLOABAT: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "YWLLOABAT: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

module.exports = router;
