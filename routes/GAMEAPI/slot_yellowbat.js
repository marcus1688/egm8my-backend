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
const SlotRich88Modal = require("../../models/slot_rich88.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const GameWalletLog = require("../../models/gamewalletlog.model");
const GameRich88GameModal = require("../../models/slot_rich88Database.model");
const GameRich88GeneralGameModal = require("../../models/slot_rich88General.model");
const Decimal = require("decimal.js");
require("dotenv").config();

const rich88PFID = "pmyr_IEGP";
const rich88Secret = process.env.RICH88_SECRET;
const webURL = "https://www.bm8my.vip/";
const rich88APIURL = "https://lobbycenter.ark8899.com/";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateRich88ApiKey(pfId, privateKey, timestamp) {
  const stringToHash = `${pfId}${privateKey}${timestamp}`;

  const apiKey = crypto.createHash("sha256").update(stringToHash).digest("hex");

  return apiKey;
}

function getCurrentFormattedDate() {
  return moment.utc().format("YYYY-MM-DD HH:mm:ss");
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

module.exports = router;
