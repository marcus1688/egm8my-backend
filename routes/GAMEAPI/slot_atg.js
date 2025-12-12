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
const Decimal = require("decimal.js");
require("dotenv").config();

const atgOperator = "EGMMYR";
const atgSecret = process.env.ATG_SECRET;
const webURL = "https://www.bm8my.vip/";
const atgAPIURL = "https://api.godeezone1.com/";
const cashierUrl = "https://www.bm8my.vip/myaccount/deposit";

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

async function getAtgAccessToken() {
  try {
    const response = await axios.get(`${atgAPIURL}token`, {
      headers: {
        "X-Operator": atgOperator,
        "X-Key": atgSecret,
      },
    });
    console.log(response.data);
    if (response.data.status === "success" && response.data.data?.token) {
      return { success: true, token: response.data.data.token };
    }

    return {
      success: false,
      error: response.data.message || "Failed to get token",
    };
  } catch (error) {
    console.error("ATG getAccessToken error:", error.message);
    return { success: false, error: error.message };
  }
}
module.exports = router;
