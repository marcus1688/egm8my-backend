const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");
const { authenticateToken } = require("../../auth/auth");
const { authenticateAdminToken } = require("../../auth/adminAuth");
const { User, adminUserWalletLog } = require("../../models/users.model");
const { v4: uuidv4 } = require("uuid");
const querystring = require("querystring");
const moment = require("moment");
const GameWalletLog = require("../../models/gamewalletlog.model");

require("dotenv").config();

const mega888Secret = process.env.MEGA888_SECRET;
const mega888AgentId = "Mega1-6123";
const mega888SN = "ld00";
const webURL = "https://www.bm8my.vip/";
const mega888APIURL = "https://mgapi-ali.yidaiyiluclub.com/mega-cloud/api/";

function generateMD5Hash(data) {
  return crypto.createHash("md5").update(data).digest("hex");
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

router.post("/api/mega888", express.raw({ type: "*/*" }), async (req, res) => {
  const sessionId = uuidv4();

  const sendErrorResponse = (errorCode, msg) => {
    return res.status(200).json({
      success: 0,
      sessionId: sessionId,
      msg: msg,
      errorCode: errorCode,
    });
  };

  try {
    const rawBody = req.body.toString("utf8");

    let parsedBody;
    try {
      parsedBody = JSON.parse(rawBody.slice(5));
    } catch (e) {
      return sendErrorResponse("37197", "Invalid JSON format");
    }

    const { method, id, params } = parsedBody;
    if (method !== "open.operator.user.login") {
      return sendErrorResponse("37197", "Unsupported method");
    }

    const { random, digest, sn, loginId, password } = params;
    if (!random || !digest || !sn || !loginId || !password) {
      return sendErrorResponse("37197", "Missing required parameters");
    }

    const computedDigest = generateMD5Hash(
      random + sn + loginId + mega888Secret
    ).toUpperCase();

    if (computedDigest !== digest.toUpperCase()) {
      return sendErrorResponse("37197", "Digest verification failed");
    }

    const user = await User.findOne(
      { mega888GameID: loginId },
      { mega888GamePW: 1 }
    ).lean();

    if (!user) {
      return sendErrorResponse("21102", "Account does not exist");
    }

    if (user.mega888GamePW !== password) {
      return sendErrorResponse("2218", "Incorrect password");
    }

    return res.status(200).json({
      id,
      result: {
        success: 1,
        sessionId,
        msg: "Login successful",
      },
      error: null,
      jsonrpc: "2.0",
    });
  } catch (error) {
    console.error("Error during login:", error);
    return sendErrorResponse("37203", "Internal server error");
  }
});

module.exports = router;
