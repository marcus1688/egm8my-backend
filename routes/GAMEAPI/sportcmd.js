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
const xml = require("xml");
const Big = require("big.js");
const SportCMDModal = require("../../models/sport_cmd.model");

require("dotenv").config();

const webURL = "https://www.oc7.me/";
const cmdAPIURL = "http://api.fts368.com/";
const cmdPartnerCode = "OC7";
const cmdPartnerKey = process.env.CMD_TOKEN;
const cmdWebLaunchGameUrl = "https://oc7.fts368.com";
const cmdMobileLaunchGameUrl = "https://oc7mobile.fts368.com";

const generateRandomCode = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }

  return result;
};

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function getReversedKey(key) {
  return key.split("").reverse().join("");
}

function decryptAES(cipherTextBase64, key) {
  const iv = Buffer.from(getReversedKey(key), "utf8");
  const keyBuffer = Buffer.from(key, "utf8");
  const encryptedText = Buffer.from(
    decodeURIComponent(cipherTextBase64),
    "base64"
  );

  const decipher = crypto.createDecipheriv("aes-128-cbc", keyBuffer, iv);
  decipher.setAutoPadding(true);
  const decrypted = Buffer.concat([
    decipher.update(encryptedText),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function encryptAES(plainText, key) {
  try {
    const iv = getReversedKey(key);

    // Match C# behavior - return empty string for invalid key/iv length
    if (key.length !== 16 || iv.length !== 16) {
      console.warn(
        "Invalid key or IV length. Key:",
        key.length,
        "IV:",
        iv.length
      );
      return "";
    }

    // Create key and IV buffers
    const keyBuffer = Buffer.from(key, "utf8");
    const ivBuffer = Buffer.from(iv, "utf8");

    // Create cipher
    const cipher = crypto.createCipheriv("aes-128-cbc", keyBuffer, ivBuffer);
    cipher.setAutoPadding(true); // PKCS7 is the default in Node.js

    // Encrypt
    const encrypted = Buffer.concat([
      cipher.update(plainText, "utf8"),
      cipher.final(),
    ]);

    // Return base64 encoded result
    return encrypted.toString("base64");
  } catch (error) {
    console.error("Encryption failed:", error);
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

function sendFailResponse(res, data) {
  try {
    const encryptedResponse = encryptAES(JSON.stringify(data), cmdPartnerKey);
    res.setHeader("Content-Type", "text/plain");
    return res.status(200).send(encryptedResponse);
  } catch (error) {
    console.error("Failed to send encrypted error response:", error);
    // Send a minimal error response if encryption fails
    res.setHeader("Content-Type", "text/plain");
    return res.status(200).send("Error");
  }
}
function getTicksFromDate(date = new Date()) {
  // Convert current time to milliseconds since Unix epoch
  const milliseconds = date.getTime();

  // Calculate .NET ticks using big.js for precision
  const epochTicks = new Big("621355968000000000"); // .NET epoch in ticks
  const ticksPerMillisecond = new Big(10000);
  const millisToTicks = new Big(milliseconds).times(ticksPerMillisecond);

  // Calculate total ticks
  const dotNetTicks = epochTicks.plus(millisToTicks);

  const ticksStr = dotNetTicks.toString();

  // Extract the most significant digits (first 6 digits)
  const highPart = parseInt(ticksStr.substring(0, 6));

  // Extract the least significant digits (remaining digits)
  const lowPart = parseInt(ticksStr.substring(6));

  const numericTicks = highPart * Math.pow(10, ticksStr.length - 6) + lowPart;

  return numericTicks;
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

async function registerCMDUser(username) {
  try {
    const response = await axios.get(
      `${cmdAPIURL}/?Method=createmember&PartnerKey=${cmdPartnerKey}&UserName=${username}&Currency=MYR`,

      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    console.log(response.data.Code);
    if (response.data.Code === -98 || response.data.Code === 0) {
      return { success: true };
    }

    return {
      success: false,
      data: response.data,
    };
  } catch (error) {
    console.error("CMD368 error in creating member:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

router.post("/api/cmd368/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, clientPlatform } = req.body;

    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (user.gameLock.cmd368.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
        },
      });
    }

    const registration = await registerCMDUser(user.userServerId);

    if (!registration.success) {
      console.log(
        "CMD368 registration failed:",
        registration.data || registration.error
      );
      return res.status(200).json({
        success: false,
        message: {
          en: "CMD368: Game launch failed. Please try again or customer service for assistance.",
          zh: "CMD368: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "CMD368: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    let lang = "en-US";

    if (gameLang === "en") {
      lang = "en-US";
    } else if (gameLang === "zh") {
      lang = "zh-CN";
    } else if (gameLang === "ms") {
      lang = "id-ID";
    }

    let token = `${user.username}:${generateRandomCode()}`;

    let platform = cmdWebLaunchGameUrl;
    if (clientPlatform === "web") {
      platform = cmdWebLaunchGameUrl;
    } else if (clientPlatform === "mobile") {
      platform = cmdMobileLaunchGameUrl;
    }

    const Currency = "MYR";
    const TemplateName = "blue";
    const View = "v1";

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        cmd368GameToken: token,
      },
      { new: true }
    );

    const loginUrl = `${platform}/auth.aspx?lang=${lang}&user=${user.userServerId}&token=${token}&currency=${Currency}&templatename=${TemplateName}&view=${View}`;

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "CMD368"
    );

    return res.status(200).json({
      success: true,
      gameLobby: loginUrl,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
      },
    });
  } catch (error) {
    console.log("CMD368 error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "CMD368: Game launch failed. Please try again or customer service for assistance.",
        zh: "CMD368: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "CMD368: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.get("/cmd/auth", async (req, res) => {
  try {
    const { secret_key, token } = req.query;

    if (!token) {
      return res
        .status(200)
        .type("application/xml")
        .send(
          xml({
            authenticate: [
              { member_id: "" },
              { status_code: 2 },
              { message: "Failed" },
            ],
          })
        );
    }

    const username = token.split(":")[0];

    const currentUser = await User.findOne(
      { username, cmd368GameToken: token },
      { username: 1, _id: 0, userServerId: 1 }
    ).lean();

    if (!currentUser) {
      return res
        .status(200)
        .type("application/xml")
        .send(
          xml({
            authenticate: [
              { member_id: "" },
              { status_code: 2 },
              { message: "Failed" },
            ],
          })
        );
    }

    return res
      .status(200)
      .type("application/xml")
      .send(
        xml({
          authenticate: [
            { member_id: currentUser.userServerId },
            { status_code: 0 },
            { message: "Success" },
          ],
        })
      );
  } catch (error) {
    console.error(
      "CMD368: Error in game provider calling oc7 auth api:",
      error.message
    );
    return res
      .status(200)
      .type("application/xml")
      .send(
        xml({
          authenticate: [
            { member_id: "" },
            { status_code: 2 },
            { message: "Failed" },
          ],
        })
      );
  }
});

router.get("/cmd/balance", async (req, res) => {
  try {
    const { balancePackage, packageId, dateSent } = req.query;

    if (!balancePackage || !packageId) {
      return sendFailResponse(res, {
        PackageId: packageId || "",
        StatusCode: 900,
        StatusMessage: "Incoming Request Info Incomplete",
        Balance: 0.0,
        DateSent: getTicksFromDate(),
        DateReceived: dateSent ? Number(dateSent) : 0,
      });
    }

    const decrypted = decryptAES(balancePackage, cmdPartnerKey);

    const parsed = JSON.parse(decrypted);

    const { ActionId, SourceName } = parsed;

    if (!SourceName || ActionId !== 1000) {
      return sendFailResponse(res, {
        PackageId: packageId,
        StatusCode: 900,
        StatusMessage: "Incoming Request Info Incomplete",
        Balance: 0.0,
        DateSent: getTicksFromDate(),
        DateReceived: dateSent ? Number(dateSent) : 0,
      });
    }

    const currentUser = await User.findOne(
      { userServerId: SourceName },
      { wallet: 1, _id: 0 }
    ).lean();

    if (!currentUser) {
      return sendFailResponse(res, {
        PackageId: packageId,
        StatusCode: 800,
        StatusMessage: "User Not Found",
        Balance: 0.0,
        DateSent: getTicksFromDate(),
        DateReceived: dateSent ? Number(dateSent) : 0,
      });
    }

    const successResponse = {
      PackageId: packageId,
      StatusCode: 100,
      StatusMessage: "Success",
      Balance: roundToTwoDecimals(currentUser.wallet),
      DateSent: getTicksFromDate(),
      DateReceived: dateSent ? Number(dateSent) : 0,
    };

    const encryptedResponse = encryptAES(
      JSON.stringify(successResponse),
      cmdPartnerKey
    );
    res.setHeader("Content-Type", "text/plain");
    return res.status(200).send(encryptedResponse);
  } catch (error) {
    console.error("CMD368 Balance API Error:", error);
    return sendFailResponse(res, {
      PackageId: req.query.packageId || "",
      StatusCode: 500,
      StatusMessage: "Internal Server Error",
      Balance: 0.0,
      DateSent: getTicksFromDate(),
      DateReceived: Number(req.query.dateSent) || 0,
    });
  }
});

router.post("/cmd/deduct", async (req, res) => {
  try {
    const { balancePackage, method, packageId, dateSent } = req.body;

    if (!balancePackage || !packageId) {
      return sendFailResponse(res, {
        PackageId: packageId || "",
        StatusCode: 900,
        StatusMessage: "Incoming Request Info Incomplete",
        Balance: 0.0,
        DateSent: getTicksFromDate(),
        DateReceived: dateSent ? Number(dateSent) : 0,
      });
    }

    const decrypted = decryptAES(balancePackage, cmdPartnerKey);

    const parsed = JSON.parse(decrypted);

    const { ActionId, SourceName, TransactionAmount, ReferenceNo } = parsed;

    if (!SourceName || !ReferenceNo) {
      return sendFailResponse(res, {
        PackageId: packageId,
        StatusCode: 900,
        StatusMessage: "Incoming Request Info Incomplete",
        Balance: 0.0,
        DateSent: getTicksFromDate(),
        DateReceived: dateSent ? Number(dateSent) : 0,
      });
    }

    const [existingBet, currentUser] = await Promise.all([
      SportCMDModal.findOne({ betId: ReferenceNo }, { _id: 1 }).lean(),
      User.findOne(
        { userServerId: SourceName },
        { username: 1, wallet: 1, gameLock: 1, _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return sendFailResponse(res, {
        PackageId: packageId,
        StatusCode: 800,
        StatusMessage: "User Not Found",
        Balance: 0.0,
        DateSent: getTicksFromDate(),
        DateReceived: dateSent ? Number(dateSent) : 0,
      });
    }

    if (existingBet) {
      const successResponse = {
        PackageId: packageId,
        StatusCode: 100,
        StatusMessage: "DeductBalanceSucceed",
        Balance: roundToTwoDecimals(currentUser.wallet),
        DateSent: getTicksFromDate(),
        DateReceived: dateSent ? Number(dateSent) : 0,
      };

      const encryptedResponse = encryptAES(
        JSON.stringify(successResponse),
        cmdPartnerKey
      );

      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(encryptedResponse);
    }

    if (currentUser.gameLock?.cmd368?.lock) {
      return sendFailResponse(res, {
        PackageId: packageId,
        StatusCode: 600,
        StatusMessage: "User Banned",
        Balance: 0.0,
        DateSent: getTicksFromDate(),
        DateReceived: dateSent ? Number(dateSent) : 0,
      });
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: roundToTwoDecimals(Math.abs(TransactionAmount)) },
      },
      { $inc: { wallet: roundToTwoDecimals(TransactionAmount) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return sendFailResponse(res, {
        PackageId: packageId,
        StatusCode: -9001,
        StatusMessage: "Insufficient Balance",
        Balance: 0.0,
        DateSent: getTicksFromDate(),
        DateReceived: dateSent ? Number(dateSent) : 0,
      });
    }

    await SportCMDModal.create({
      username: currentUser.username,
      betId: ReferenceNo,
      bet: true,
      betamount: roundToTwoDecimals(Math.abs(TransactionAmount)),
    });

    const successResponse = {
      PackageId: packageId,
      StatusCode: 100,
      StatusMessage: "Success",
      Balance: roundToTwoDecimals(updatedUserBalance.wallet),
      DateSent: getTicksFromDate(),
      DateReceived: dateSent ? Number(dateSent) : 0,
    };

    const encryptedResponse = encryptAES(
      JSON.stringify(successResponse),
      cmdPartnerKey
    );
    res.setHeader("Content-Type", "text/plain");
    return res.status(200).send(encryptedResponse);
  } catch (error) {
    console.error("CMD368 Balance API Error:", error);
    return sendFailResponse(res, {
      PackageId: req.query.packageId || "",
      StatusCode: 500,
      StatusMessage: "Internal Server Error",
      Balance: 0.0,
      DateSent: getTicksFromDate(),
      DateReceived: Number(req.query.dateSent) || 0,
    });
  }
});

router.post("/cmd/update", async (req, res) => {
  try {
    const { balancePackage, method, packageId, dateSent } = req.body;

    if (!balancePackage || !packageId) {
      console.log("Missing required parameters");
      return sendFailResponse(res, {
        PackageId: packageId || "",
        StatusCode: 900,
        StatusMessage: "Incoming Request Info Incomplete",
        Balance: 0.0,
        DateSent: getTicksFromDate(),
        DateReceived: dateSent ? Number(dateSent) : 0,
      });
    }

    const decrypted = decryptAES(balancePackage, cmdPartnerKey);

    const parsed = JSON.parse(decrypted);

    const { ActionId, MatchID, TicketDetails } = parsed;

    if (!TicketDetails || !ActionId) {
      console.log("Invalid action or source name:", ActionId, SourceName);
      return sendFailResponse(res, {
        PackageId: packageId,
        StatusCode: 900,
        StatusMessage: "Incoming Request Info Incomplete",
        Balance: 0.0,
        DateSent: getTicksFromDate(),
        DateReceived: dateSent ? Number(dateSent) : 0,
      });
    }

    for (let i = 0; i < TicketDetails.length; i++) {
      const { SourceName, ReferenceNo, TransactionAmount, TransRefNo } =
        TicketDetails[i];

      const [currentUser, existingBet] = await Promise.all([
        User.findOne(
          { userServerId: SourceName },
          { _id: 1, username: 1 }
        ).lean(),
        SportCMDModal.findOne({ betId: ReferenceNo })
          .sort({ createdAt: -1 })
          .select({ cancel: 1, settle: 1, _id: 1 })
          .lean(),
      ]);

      if (!currentUser) {
        console.log(`User not found for ticket ${i}:`, SourceName);
        continue;
      }

      if (!existingBet) {
        console.log(`Bet not found for ticket ${i}:`, ReferenceNo);
        continue;
      }

      let skipUpdate = false;

      if (
        [2001, 2002, 6001, 6002].includes(ActionId) &&
        existingBet.cancel === true
      ) {
        skipUpdate = true;
      } else if (
        [3001, 4001, 4002, 4003].includes(ActionId) &&
        existingBet.settle === true
      ) {
        skipUpdate = true;
      } else if (
        [5001, 5002, 5003].includes(ActionId) &&
        existingBet.settle === false
      ) {
        skipUpdate = true;
      } else if (
        [7001, 7002].includes(ActionId) &&
        existingBet.settle === true
      ) {
        skipUpdate = true;
      }

      if (skipUpdate) {
        continue;
      }

      const updateAmount = roundToTwoDecimals(Math.abs(TransactionAmount));
      const updateData = { settleamount: updateAmount };

      if ([2001, 2002, 6001, 6002].includes(ActionId)) {
        updateData.cancel = true;
      } else if ([3001, 4001, 4002, 4003].includes(ActionId)) {
        updateData.settle = true;
        if (ActionId === 3001 && TransRefNo) {
          updateData.tranId = TransRefNo;
        }
      } else if ([5001, 5002, 5003].includes(ActionId)) {
        updateData.settle = false;
      } else if ([7001, 7002].includes(ActionId)) {
        updateData.cancel = false;
        updateData.settle = true;
      } else {
        updateData.settle = true;
      }

      await Promise.all([
        SportCMDModal.create({
          betId: ReferenceNo,
          username: currentUser.username,
          ...updateData,
        }),
        User.updateOne(
          { _id: currentUser._id },
          { $inc: { wallet: updateAmount } }
        ),
      ]);
    }

    const successResponse = {
      PackageId: packageId,
      StatusCode: 100,
      StatusMessage: "Success",
      DateSent: getTicksFromDate(),
      DateReceived: dateSent ? Number(dateSent) : 0,
    };

    const encryptedResponse = encryptAES(
      JSON.stringify(successResponse),
      cmdPartnerKey
    );
    res.setHeader("Content-Type", "text/plain");
    return res.status(200).send(encryptedResponse);
  } catch (error) {
    console.error("CMD368 Balance API Error:", error);
    return sendFailResponse(res, {
      PackageId: req.query.packageId || "",
      StatusCode: 500,
      StatusMessage: "Internal Server Error",
      DateSent: getTicksFromDate(),
      DateReceived: Number(req.query.dateSent) || 0,
    });
  }
});

// ----------------
router.post("/api/cmd368/getturnoverforrebate", async (req, res) => {
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

    const records = await SportCMDModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      cancel: { $ne: true },
    });

    // Aggregate turnover and win/loss for each player
    let playerSummary = {};

    records.forEach((record) => {
      const username = record.username;

      if (!playerSummary[username]) {
        playerSummary[username] = { turnover: 0, winloss: 0 };
      }

      playerSummary[username].turnover += record.betamount || 0;

      playerSummary[username].winloss +=
        (record.settleamount || 0) - (record.betamount || 0);
    });

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
        gamename: "CMD368",
        gamecategory: "Sports",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("CMD368: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      error: "CMD368: Failed to fetch win/loss report",
    });
  }
});

router.get(
  "/admin/api/cmd368/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SportCMDModal.find({
        username: user.username,
        createdAt: {
          $gte: startDate,
          $lt: endDate,
        },
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
          gamename: "CMD368",
          gamecategory: "Sports",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("CMD368: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        error: "CMD368: Failed to fetch win/loss report",
      });
    }
  }
);

router.get(
  "/admin/api/cmd368/:userId/gamedata",
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

      records.forEach((record) => {
        const gameCategories =
          record.gameCategories instanceof Map
            ? Object.fromEntries(record.gameCategories)
            : record.gameCategories;

        if (
          gameCategories &&
          gameCategories["Sports"] &&
          gameCategories["Sports"] instanceof Map
        ) {
          const gamecat = Object.fromEntries(gameCategories["Sports"]);

          if (gamecat["CMD368"]) {
            totalTurnover += gamecat["CMD368"].turnover || 0;
            totalWinLoss += gamecat["CMD368"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "CMD368",
          gamecategory: "Sports",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("CMD368: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        error: "CMD368: Failed to fetch win/loss report",
      });
    }
  }
);

router.get(
  "/admin/api/cmd368/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SportCMDModal.find({
        createdAt: {
          $gte: startDate,
          $lt: endDate,
        },
        cancel: { $ne: true },
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;

        totalWinLoss += (record.betamount || 0) - (record.settleamount || 0);
      });

      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      // Return the aggregated results
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "CMD368",
          gamecategory: "Sports",
          totalturnover: totalTurnover,
          totalwinloss: totalWinLoss,
        },
      });
    } catch (error) {
      console.log("CMD368: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        error: "CMD368: Failed to fetch win/loss report",
      });
    }
  }
);

router.get(
  "/admin/api/cmd368/kioskreport",
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
          gameCategories["Sports"] &&
          gameCategories["Sports"] instanceof Map
        ) {
          const gamecat = Object.fromEntries(gameCategories["Sports"]);

          if (gamecat["CMD368"]) {
            totalTurnover += Number(gamecat["CMD368"].turnover || 0);
            totalWinLoss += Number(gamecat["CMD368"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "CMD368",
          gamecategory: "Sports",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("CMD368: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        error: "CMD368: Failed to fetch win/loss report",
      });
    }
  }
);

router.post(
  "/api/cmd368/updateTemplateSetting",

  async (req, res) => {
    try {
      const { SettingDetail } = req.body;

      if (!SettingDetail) {
        return res.status(400).json({
          success: false,
          message: "Missing required parameters: TemplateName or SettingDetail",
        });
      }

      const payload = {
        Method: "updatetemplatesetting",
        PartnerKey: cmdPartnerKey,
        TemplateName: "blue",
        SettingDetail: JSON.stringify(SettingDetail),
      };

      const queryString = new URLSearchParams(payload).toString();
      const url = `${cmdAPIURL}?${queryString}`;

      const response = await axios.get(url, {
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (response.data.Code === 0) {
        return res.status(200).json({
          success: true,
          message: "Template updated successfully",
          data: response.data.Data,
        });
      } else {
        return res.status(400).json({
          success: false,
          message: "Failed to update template",
          error: response.data.Message,
          code: response.data.Code,
        });
      }
    } catch (error) {
      console.error("CMD368 updateTemplateSetting error:", error.message);
      return res.status(500).json({
        success: false,
        message: "CMD368: Internal server error during template update",
        error: error.message,
      });
    }
  }
);

module.exports = router;
