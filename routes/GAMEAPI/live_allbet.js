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
const liveAllbetModal = require("../../models/live_allbet.model");

require("dotenv").config();

const webURL = "https://www.bm8my.vip/";
const allbetAPIURL = "https://sw2-2.absvc.net/";
const allbetSecret = process.env.ALLBET_SECRET;
const allbetCallbackSecret = process.env.ALLBET_CALLBACKSECRET;
const allbetOperatorID = "1089380";
const allbetSuffix = "2le";
const allbetAgent = "wcwv9y5";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateSignature(verb, contentMD5, contentType, date, path) {
  const stringToSign = `${verb}\n${contentMD5}\n${contentType}\n${date}\n${path}`;

  const decodedKey = Buffer.from(allbetSecret, "base64");

  const hmac = crypto.createHmac("sha1", decodedKey);
  hmac.update(stringToSign, "utf8");

  return hmac.digest("base64");
}

function getRFC1123Date() {
  return moment().format("ddd, DD MMM YYYY HH:mm:ss [GMT]ZZ");
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

async function registerAllbetUser(username) {
  try {
    const body = JSON.stringify({
      agent: allbetAgent,
      player: username,
    });

    const md5Hash = crypto.createHash("md5").update(body, "utf8").digest();
    const contentMD5 = md5Hash.toString("base64");

    const date = getRFC1123Date();

    const path = "/CheckOrCreate";

    const sign = generateSignature(
      "POST",
      contentMD5,
      "application/json; charset=utf-8",
      date,
      path
    );

    const response = await axios({
      method: "post",
      url: `${allbetAPIURL}${path}`,
      data: body,
      headers: {
        Accept: "application/json; charset=utf-8",
        "Content-Type": "application/json; charset=utf-8",
        "Content-MD5": contentMD5,
        Date: date,
        Authorization: `AB ${allbetOperatorID}:${sign}`,
      },
      transformRequest: [(data) => data],
    });

    if (
      response.data.resultCode === "OK" ||
      response.data.resultCode === "PLAYER_EXIST"
    ) {
      return { success: true };
    } else if (response.data.resultCode === "SYSTEM_MAINTENANCE") {
      return { success: false, maintenance: true, data: response.data };
    }

    return {
      success: false,
      data: response.data,
    };
  } catch (error) {
    console.error("ALLBET error in creating member:", error.response.data);
    return {
      success: false,
      error: error.message,
    };
  }
}
const verifyAllBetAuth = (req, res, next) => {
  console.log("\n=== AllBet Auth Verification ===");

  const auth = req.headers.authorization;
  console.log("1. Received Authorization:", auth);

  if (!auth) {
    console.log("❌ No authorization header");
    return res.status(200).json({
      resultCode: 40000,
      message: "Invalid request parameter: authorization header is required",
    });
  }

  const contentMD5 = req.headers["content-md5"] || "";
  const contentType =
    req.method !== "GET" ? "application/json; charset=UTF-8" : "";
  const path = req.originalUrl.replace("/api/allbet", "");
  const date = req.headers.date;

  console.log("2. Request Details:");
  console.log("   - HTTP Method:", req.method);
  console.log("   - Content-MD5:", contentMD5 ? contentMD5 : "(empty)");
  console.log("   - Content-Type:", contentType ? contentType : "(empty)");
  console.log("   - Date:", date);
  console.log("   - Original URL:", req.originalUrl);
  console.log("   - Path for signature:", path);

  const stringForSignature = `${req.method}\n${contentMD5}\n${contentType}\n${date}\n${path}`;

  console.log("3. String for Signature:");
  console.log(JSON.stringify(stringForSignature));
  console.log(
    "   Hex:",
    Buffer.from(stringForSignature, "utf8").toString("hex")
  );

  const decodedKey = Buffer.from(allbetCallbackSecret, "base64");
  console.log("4. Secret Key:");
  console.log("   - Original length:", allbetCallbackSecret.length);
  console.log("   - Decoded length:", decodedKey.length);
  console.log(
    "   - First 10 chars:",
    allbetCallbackSecret.substring(0, 10) + "..."
  );

  const signature = crypto
    .createHmac("sha1", decodedKey)
    .update(stringForSignature, "utf8")
    .digest("base64");

  const expectedAuth = `AB ${allbetOperatorID}:${signature}`;

  console.log("5. Signature Comparison:");
  console.log("   - Generated signature:", signature);
  console.log("   - Expected Auth:", expectedAuth);
  console.log("   - Received Auth:", auth);
  console.log("   - Match:", auth === expectedAuth ? "✅ YES" : "❌ NO");
  console.log("=================================\n");

  if (auth !== expectedAuth) {
    return res
      .status(200)
      .json({ resultCode: 10001, message: "Invalid signature" });
  }

  next();
};

router.post("/api/allbet/launchGame", authenticateToken, async (req, res) => {
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

    if (user.gameLock.allbet.lock) {
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

    const playerName = `${user.gameId}${allbetSuffix}`;

    if (!user.allbetRegistered) {
      const registration = await registerAllbetUser(playerName);

      if (!registration.success) {
        console.log(
          "ALLBET registration failed:",
          registration.data || registration.error
        );

        if (registration.maintenance) {
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

        return res.status(200).json({
          success: false,
          message: {
            en: "ALLBET: Game launch failed. Please try again or customer service for assistance.",
            zh: "ALLBET: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "ALLBET: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            zh_hk: "ALLBET: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
            id: "ALLBET: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      await User.findOneAndUpdate(
        { username: user.username },
        {
          $set: {
            allbetRegistered: true,
          },
        }
      );
    }

    let lang = "en";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "zh_CN";
    } else if (gameLang === "ms") {
      lang = "en";
    } else if (gameLang === "id") {
      lang = "id";
    } else if (gameLang === "zh_hk") {
      lang = "zh_HK";
    }

    const body = JSON.stringify({
      player: playerName,
      language: lang,
      returnUrl: webURL,
    });

    const md5Hash = crypto.createHash("md5").update(body, "utf8").digest();
    const contentMD5 = md5Hash.toString("base64");

    const date = getRFC1123Date();

    const path = "/Login";

    const sign = generateSignature(
      "POST",
      contentMD5,
      "application/json; charset=utf-8",
      date,
      path
    );

    const response = await axios({
      method: "post",
      url: `${allbetAPIURL}${path}`,
      data: body,
      headers: {
        Accept: "application/json; charset=utf-8",
        "Content-Type": "application/json; charset=utf-8",
        "Content-MD5": contentMD5,
        Date: date,
        Authorization: `AB ${allbetOperatorID}:${sign}`,
      },
      transformRequest: [(data) => data], // Prevent axios from modifying the body
    });

    if (response.data.resultCode !== "OK") {
      console.log("ALLBET error in launching game", response.data);

      if (response.data.resultCode === "SYSTEM_MAINTENANCE") {
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

      return res.status(200).json({
        success: false,
        message: {
          en: "ALLBET: Game launch failed. Please try again or customer service for assistance.",
          zh: "ALLBET: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "ALLBET: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          zh_hk: "ALLBET: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
          id: "ALLBET: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "ALLBET"
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data.data.gameLoginUrl,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
        zh_hk: "遊戲啟動成功。",
        id: "Permainan berhasil diluncurkan.",
      },
    });
  } catch (error) {
    console.log("ALLBET error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "ALLBET: Game launch failed. Please try again or customer service for assistance.",
        zh: "ALLBET: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "ALLBET: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "ALLBET: 遊戲啟動失敗，請重試或聯絡客服以獲得幫助。",
        id: "ALLBET: Peluncuran permainan gagal. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

const sendAllBetResponse = (res, resultCode, message, balance = null) => {
  const response = { resultCode, message };
  if (balance !== null) {
    response.balance = roundToTwoDecimals(balance);
  }
  return res.status(200).json(response);
};

const getCleanPlayerName = (player) => {
  return player.slice(0, -allbetSuffix.length).toUpperCase();
};

router.get(
  "/api/allbet/GetBalance/:player",
  verifyAllBetAuth,
  async (req, res) => {
    try {
      const { player } = req.params;

      if (!player) {
        console.log("hi");
        return sendAllBetResponse(
          res,
          40000,
          "Invalid request parameter: player is required"
        );
      }

      const cleanPlayerName = getCleanPlayerName(player);
      const currentUser = await User.findOne(
        { gameId: cleanPlayerName },
        { wallet: 1 }
      ).lean();

      if (!currentUser) {
        console.log("hi2");
        return sendAllBetResponse(res, 10003, "Player account does not exist");
      }
      console.log("success", currentUser.wallet);
      return sendAllBetResponse(res, 0, "Success", currentUser.wallet);
    } catch (error) {
      console.error("[AllBet GetBalance] Error:", error.message);
      return sendAllBetResponse(res, 50000, "Server error");
    }
  }
);

router.post("/api/allbe/Transfer", verifyAllBetAuth, async (req, res) => {
  try {
    const { tranId, player, amount, type, details } = req.body;

    // Validate required parameters
    if (!player || !tranId || amount == null || !type) {
      const missing = [];
      if (!player) missing.push("player");
      if (!tranId) missing.push("tranId");
      if (amount == null) missing.push("amount");
      if (!type) missing.push("type");

      return sendAllBetResponse(
        res,
        40000,
        `Invalid request parameter: missing ${missing.join(", ")}`
      );
    }

    const fullUsername = getCleanPlayerName(player);
    const currentUser = await User.findOne(
      { gameId: fullUsername },
      { wallet: 1, _id: 1, "gameLock.allbet.lock": 1 }
    ).lean();

    if (!currentUser) {
      return sendAllBetResponse(res, 10003, "Player account does not exist");
    }

    const roundedAmount = roundToTwoDecimals(amount);

    if (type === 10) {
      if (currentUser.gameLock?.allbet?.lock) {
        return sendAllBetResponse(res, 10100, "Prohibit to bet.");
      }

      const existingBet = await liveAllbetModal
        .findOne({ betId: tranId }, { _id: 1 })
        .lean();

      if (existingBet) {
        return sendAllBetResponse(res, 10007, "Invalid status");
      }

      const updatedUser = await User.findOneAndUpdate(
        {
          _id: currentUser._id,
          wallet: { $gte: Math.abs(roundedAmount) },
        },
        { $inc: { wallet: roundedAmount } },
        { new: true, projection: { wallet: 1 } }
      ).lean();

      if (!updatedUser) {
        return sendAllBetResponse(res, 10101, "Credit is not enough.");
      }

      if (details?.length) {
        const betRecords = details
          .filter((detail) => detail.betNum)
          .map((detail) => ({
            username: fullUsername,
            roundId: detail.betNum,
            betId: tranId,
            bet: true,
            betamount: roundToTwoDecimals(detail.betAmount || 0),
          }));

        if (betRecords.length > 0) {
          await liveAllbetModal.insertMany(betRecords, { ordered: false });
        }
      }

      return sendAllBetResponse(res, 0, "Success", updatedUser.wallet);
    }

    // ===== PLACE BET: Type 31 (Single bet) =====
    if (type === 31) {
      if (currentUser.gameLock?.allbet?.lock) {
        return sendAllBetResponse(res, 10100, "Prohibit to bet.");
      }

      const existingBet = await liveAllbetModal
        .findOne({ betId: tranId }, { _id: 1 })
        .lean();

      if (existingBet) {
        return sendAllBetResponse(res, 10007, "Invalid status");
      }

      const updatedUser = await User.findOneAndUpdate(
        {
          _id: currentUser._id,
          wallet: { $gte: Math.abs(roundedAmount) },
        },
        { $inc: { wallet: roundedAmount } },
        { new: true, projection: { wallet: 1 } }
      ).lean();

      if (!updatedUser) {
        return sendAllBetResponse(res, 10101, "Credit is not enough.");
      }

      await liveAllbetModal.create({
        username: fullUsername,
        betId: tranId,
        bet: true,
        betamount: Math.abs(roundedAmount),
        validbetamount: Math.abs(roundedAmount),
      });

      return sendAllBetResponse(res, 0, "Success", updatedUser.wallet);
    }

    // ===== SETTLE BET: Type 20, 21 (Multi-bet settlement) =====
    if (type === 20 || type === 21) {
      if (!details?.length) {
        return sendAllBetResponse(res, 40000, "Settlement details required");
      }

      const betNums = details
        .filter((detail) => detail.betNum)
        .map((detail) => detail.betNum);

      if (betNums.length === 0) {
        return sendAllBetResponse(res, 40000, "Invalid bet numbers");
      }

      // Combined query: check existence and settlement status
      const existingBets = await liveAllbetModal
        .find(
          { roundId: { $in: betNums }, bet: true },
          { _id: 1, roundId: 1, settle: 1, cancel: 1 }
        )
        .lean();

      if (!existingBets || existingBets.length === 0) {
        return sendAllBetResponse(res, 10006, "Transaction not existed");
      }

      // Check settlement in memory instead of separate query
      const alreadySettled = existingBets.some(
        (bet) => bet.settle === true || bet.cancel === true
      );

      if (alreadySettled) {
        return sendAllBetResponse(res, 10007, "Invalid status");
      }

      // Parallel execution: update wallet and bets simultaneously
      const [updatedUser] = await Promise.all([
        User.findByIdAndUpdate(
          currentUser._id,
          { $inc: { wallet: roundedAmount } },
          { new: true, projection: { wallet: 1 } }
        ).lean(),

        (async () => {
          const bulkOps = details
            .filter((detail) => detail.betNum)
            .map((detail) => ({
              updateOne: {
                filter: { roundId: detail.betNum },
                update: {
                  $set: {
                    settle: true,
                    winlossamount: roundToTwoDecimals(
                      detail.winOrLossAmount || 0
                    ),
                    validbetamount: roundToTwoDecimals(detail.validAmount || 0),
                  },
                },
              },
            }));

          if (bulkOps.length > 0) {
            return liveAllbetModal.bulkWrite(bulkOps, { ordered: false });
          }
        })(),
      ]);

      return sendAllBetResponse(res, 0, "Success", updatedUser.wallet);
    }

    // ===== SETTLE BET: Type 30, 32 (Single bet settlement) =====
    if (type === 30 || type === 32) {
      // Combined query: check existence and settlement status
      const existingBet = await liveAllbetModal
        .findOne({ betId: tranId, bet: true }, { _id: 1, settle: 1, cancel: 1 })
        .lean();

      if (!existingBet) {
        return sendAllBetResponse(res, 10006, "Transaction not existed");
      }

      // Check settlement in memory
      if (existingBet.settle || existingBet.cancel) {
        return sendAllBetResponse(res, 10007, "Invalid status");
      }

      // Parallel execution: update wallet and bet
      const [updatedUser] = await Promise.all([
        User.findByIdAndUpdate(
          currentUser._id,
          { $inc: { wallet: roundedAmount } },
          { new: true, projection: { wallet: 1 } }
        ).lean(),
        liveAllbetModal.findOneAndUpdate(
          { betId: tranId },
          { $set: { settle: true, settleamount: roundedAmount } },
          { new: true }
        ),
      ]);

      return sendAllBetResponse(res, 0, "Success", updatedUser.wallet);
    }

    // ===== BONUS/PROMOTION: Type 40 =====
    if (type === 40) {
      const existingTransaction = await liveAllbetModal
        .findOne({ betId: tranId }, { _id: 1 })
        .lean();

      if (existingTransaction) {
        return sendAllBetResponse(res, 10007, "Invalid status");
      }

      const [updatedUser] = await Promise.all([
        User.findByIdAndUpdate(
          currentUser._id,
          { $inc: { wallet: roundedAmount } },
          { new: true, projection: { wallet: 1 } }
        ).lean(),
        liveAllbetModal.create({
          username: fullUsername,
          betId: tranId,
          settle: true,
          bet: true,
          betamount: 0,
          settleamount: roundedAmount,
        }),
      ]);

      return sendAllBetResponse(res, 0, "Success", updatedUser.wallet);
    }

    return sendAllBetResponse(res, 40000, "Invalid transaction type");
  } catch (error) {
    console.error("[AllBet Transfer] Error:", error.message);
    return sendAllBetResponse(res, 50000, "Server error");
  }
});

router.post("/api/allbe/CancelTransfer", verifyAllBetAuth, async (req, res) => {
  try {
    const { tranId, player, originalTranId } = req.body;

    // Validate required parameters
    if (!tranId || !player || !originalTranId) {
      const missing = [];
      if (!player) missing.push("player");
      if (!tranId) missing.push("tranId");
      if (!originalTranId) missing.push("originalTranId");

      return sendAllBetResponse(
        res,
        40000,
        `Invalid request parameter: missing ${missing.join(", ")}`
      );
    }

    const fullUsername = getCleanPlayerName(player);

    const [currentUser, existingBet, existingCancel] = await Promise.all([
      User.findOne({ gameId: fullUsername }, { wallet: 1, _id: 1 }).lean(),
      liveAllbetModal
        .findOne({ betId: originalTranId, bet: true }, { _id: 1, betamount: 1 })
        .lean(),
      liveAllbetModal.findOne({ cancelId: tranId }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      return sendAllBetResponse(res, 10003, "Player account does not exist");
    }

    if (!existingBet) {
      return sendAllBetResponse(res, 10006, "Transaction not existed");
    }

    if (existingCancel) {
      return sendAllBetResponse(res, 10007, "Invalid status");
    }

    const refundAmount = roundToTwoDecimals(existingBet.betamount || 0);

    // Refund wallet and mark as cancelled
    const [updatedUser] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: refundAmount } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
      liveAllbetModal.findOneAndUpdate(
        { betId: originalTranId },
        { $set: { cancel: true, cancelId: tranId } },
        { new: true }
      ),
    ]);

    return sendAllBetResponse(res, 0, "Success", updatedUser.wallet);
  } catch (error) {
    console.error("[AllBet CancelTransfer] Error:", error.message);
    return sendAllBetResponse(res, 50000, "Server error");
  }
});

module.exports = router;
