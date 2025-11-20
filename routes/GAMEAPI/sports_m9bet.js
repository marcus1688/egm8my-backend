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
const { v4: uuidv4 } = require("uuid");
const { adminUser, adminLog } = require("../../models/adminuser.model");
const GameWalletLog = require("../../models/gamewalletlog.model");
const Decimal = require("decimal.js");
const SportM9BetModal = require("../../models/sport_m9bet.model");
const cron = require("node-cron");
require("dotenv").config();

const webURL = "https://www.bm8my.vip/";
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

function generateTransactionId(prefix = "") {
  const uuid = uuidv4().replace(/-/g, "").substring(0, 12);
  return prefix ? `${prefix}${uuid}` : uuid;
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

async function depositM9BetUser(user) {
  try {
    const refNo = generateTransactionId(user.gameId);

    const params = new URLSearchParams({
      action: "deposit",
      secret: m9betSecret,
      agent: m9betAccount,
      username: user.gameId,
      serial: refNo,
      amount: 9999999,
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

async function markFetchedGroup(fetchIds) {
  try {
    if (!fetchIds || fetchIds.length === 0) {
      console.log("No fetch IDs to mark");
      return { success: true };
    }

    // Convert array to comma-separated string
    const fetchIdsString = Array.isArray(fetchIds)
      ? fetchIds.join(",")
      : fetchIds;
    const params = new URLSearchParams({
      action: "mark_fetched",
      secret: m9betSecret,
      agent: m9betAccount,
      fetch_ids: fetchIdsString,
    });

    console.log(`Marking ${fetchIds.length} tickets as fetched...`);

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
      console.error("M9BET mark fetched error:", response.data.errtext);
      return {
        success: false,
        error: response.data.errtext,
      };
    }

    console.log(`✅ Successfully marked ${fetchIds.length} tickets as fetched`);
    return { success: true };
  } catch (error) {
    console.error("M9BET mark fetched error:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function fetchAndProcessResult() {
  try {
    const params = new URLSearchParams({
      action: "fetch_result",
      secret: m9betSecret,
      agent: m9betAccount,
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
      console.error("M9BET fetch result error:", response.data.errtext);
      return {
        success: false,
        error: response.data.errtext,
        maintenance: response.data.errcode === -1,
      };
    }

    const tickets = response.data.result?.ticket || [];
    if (!tickets.length) {
      console.log("No tickets to process");
      return {
        success: true,
        processed: 0,
        skipped: 0,
        maintenance: false,
      };
    }

    console.log(`\n=== Processing ${tickets.length} M9BET tickets ===`);

    let processedCount = 0;
    let skippedCount = 0;
    const errors = [];
    const processedFetchIds = []; // Track successfully processed fetch IDs

    // Process each ticket
    for (const ticket of tickets) {
      const { ventransid, res, w, u, id, fid } = ticket;

      // STEP 1: Skip if match is pending (res === 'P')
      if (res === "P") {
        console.log(`⏳ Skipping pending match: ${ventransid} (res: ${res})`);
        skippedCount++;
        continue;
      }

      try {
        // STEP 2: Check if bet exists and is not already settled
        const existingBet = await SportM9BetModal.findOne(
          { betId: ventransid, settle: { $ne: true } },
          { username: 1, betamount: 1, settle: 1, _id: 1 }
        ).lean();

        if (!existingBet) {
          console.log(`⚠️  Bet not found or already settled: ${ventransid}`);
          skippedCount++;
          // Still mark as fetched even if already settled
          if (fid) processedFetchIds.push(fid);
          continue;
        }

        // STEP 3: Verify user exists
        const user = await User.findOne(
          { gameId: u },
          { _id: 1, wallet: 1 }
        ).lean();

        if (!user) {
          console.error(`❌ User not found: ${u} for bet ${ventransid}`);
          errors.push({
            ventransid,
            error: `User not found: ${u}`,
          });
          continue;
        }

        // STEP 4: Calculate win amount (w can be positive or negative)
        const winAmount = roundToTwoDecimals(Math.abs(w) || 0);

        // STEP 5: Update user balance and bet record in parallel
        const [updatedUser, updatedBet] = await Promise.all([
          // Update user balance
          User.findOneAndUpdate(
            { gameId: u },
            { $inc: { wallet: winAmount } },
            { new: true, projection: { wallet: 1 } }
          ).lean(),

          // Update bet record
          SportM9BetModal.findOneAndUpdate(
            { betId: ventransid },
            {
              $set: {
                settle: true,
                settleamount: winAmount,
                tranId: id,
              },
            },
            { new: true }
          ),
        ]);

        console.log(
          `✅ Processed ${ventransid}: User ${u}, Amount: ${winAmount} ${
            winAmount > 0 ? "(WIN)" : winAmount < 0 ? "(LOSS)" : "(DRAW)"
          }, Result: ${res}, New Balance: ${roundToTwoDecimals(
            updatedUser.wallet
          )}`
        );

        // Add to processed fetch IDs
        if (fid) processedFetchIds.push(fid);
        processedCount++;
      } catch (error) {
        console.error(
          `❌ Error processing ticket ${ventransid}:`,
          error.message
        );
        errors.push({
          ventransid,
          user: u,
          error: error.message,
        });
      }
    }

    console.log(
      `\n=== Processing Summary ===\n✅ Processed: ${processedCount}\n⏳ Skipped: ${skippedCount}\n❌ Errors: ${errors.length}\n========================\n`
    );

    // STEP 6: Mark all processed tickets as fetched
    if (processedFetchIds.length > 0) {
      console.log(
        `\nMarking ${processedFetchIds.length} tickets as fetched...`
      );
      const markResult = await markFetchedGroup(processedFetchIds);

      if (!markResult.success) {
        console.error("Failed to mark tickets as fetched:", markResult.error);
      }
    }

    return {
      success: true,
      processed: processedCount,
      skipped: skippedCount,
      errors: errors.length > 0 ? errors : undefined,
      markedFetched: processedFetchIds.length,
      maintenance: false,
    };
  } catch (error) {
    console.error("M9BET fetch result error:", error.message);
    return {
      success: false,
      error: error.response?.data || error.message,
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

    if (!user.m9betDeposited) {
      const depositData = await depositM9BetUser(user);
      if (!depositData.success) {
        console.log(`M9BET error in depositing account ${registeredData}`);

        if (depositData.maintenance) {
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
            m9betDeposited: true,
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

const createM9BETXMLResponse = (errcode, errtext, result) => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <errcode>${errcode}</errcode>
  <errtext>${errtext}</errtext>
  <result>${result}</result>
</response>`;
};

const sendXMLResponse = (res, errcode, errtext, result = 0) => {
  return res
    .status(200)
    .set("Content-Type", "application/xml")
    .send(createM9BETXMLResponse(errcode, errtext, result));
};

router.get("/api/m9bet", async (req, res) => {
  try {
    const { secret, action, userName, betId, amt } = req.query;

    if (!secret || !action || !userName) {
      return sendXMLResponse(res, -100, "Missing required parameters");
    }

    if (secret !== m9betSecret) {
      return sendXMLResponse(res, -2, "Invalid secret");
    }

    switch (action) {
      case "getbalance": {
        const user = await User.findOne(
          { gameId: userName },
          { wallet: 1, _id: 1 }
        ).lean();

        if (!user) {
          return sendXMLResponse(res, -4, "Invalid username");
        }

        return sendXMLResponse(res, 0, "", roundToTwoDecimals(user.wallet));
      }

      // ===== PLACE BET =====
      case "placebet": {
        if (!betId || amt == null) {
          return sendXMLResponse(res, -100, "Missing betId or amt");
        }

        const roundedAmount = roundToTwoDecimals(amt);

        const [user, existingBet] = await Promise.all([
          User.findOne(
            { gameId: userName },
            { wallet: 1, "gameLock.m9bet.lock": 1, _id: 1 }
          ).lean(),
          SportM9BetModal.exists({ betId }),
        ]);

        if (!user) {
          return sendXMLResponse(res, -4, "Invalid username");
        }

        if (user.gameLock?.m9bet?.lock) {
          return sendXMLResponse(res, -99, "Player account banned");
        }

        if (existingBet) {
          return sendXMLResponse(res, 0, "", roundToTwoDecimals(user.wallet));
        }

        const updatedUser = await User.findOneAndUpdate(
          {
            gameId: userName,
            wallet: { $gte: roundedAmount },
          },
          { $inc: { wallet: -roundedAmount } },
          { new: true, projection: { wallet: 1 } }
        ).lean();

        if (!updatedUser) {
          return sendXMLResponse(
            res,
            -98,
            "Insufficient Balance",
            roundToTwoDecimals(user.wallet)
          );
        }

        await SportM9BetModal.create({
          username: userName,
          betId,
          bet: true,
          settle: false,
          betamount: roundedAmount,
        });

        return sendXMLResponse(
          res,
          0,
          "",
          roundToTwoDecimals(updatedUser.wallet)
        );
      }

      case "rejectbet": {
        if (!betId) {
          return sendXMLResponse(res, -100, "Missing betId");
        }

        const [user, bet] = await Promise.all([
          User.findOne({ gameId: userName }, { wallet: 1, _id: 1 }).lean(),
          SportM9BetModal.findOne(
            { betId },
            { betamount: 1, cancel: 1 }
          ).lean(),
        ]);

        if (!user) {
          return sendXMLResponse(res, -4, "Invalid username");
        }

        if (!bet || bet.cancel) {
          return sendXMLResponse(res, 0, "", roundToTwoDecimals(user.wallet));
        }

        const [updatedUser] = await Promise.all([
          User.findByIdAndUpdate(
            user._id,
            { $inc: { wallet: roundToTwoDecimals(bet.betamount || 0) } },
            { new: true, projection: { wallet: 1 } }
          ).lean(),
          SportM9BetModal.findOneAndUpdate(
            { betId },
            { $set: { cancel: true } }
          ),
        ]);

        return sendXMLResponse(
          res,
          0,
          "",
          roundToTwoDecimals(updatedUser.wallet)
        );
      }

      case "placebet2": {
        if (!betId || amt == null) {
          return sendXMLResponse(res, -100, "Missing betId or amt");
        }

        const roundedAmount = roundToTwoDecimals(amt);

        const [user, existingBet] = await Promise.all([
          User.findOne(
            { gameId: userName },
            { wallet: 1, "gameLock.m9bet.lock": 1, _id: 1 }
          ).lean(),
          SportM9BetModal.exists({ betId }),
        ]);

        if (!user) {
          return sendXMLResponse(res, -4, "Invalid username");
        }

        if (user.gameLock?.m9bet?.lock) {
          return sendXMLResponse(res, -99, "Player account banned");
        }

        if (existingBet) {
          return sendXMLResponse(res, 0, "", roundToTwoDecimals(user.wallet));
        }

        const updatedUser = await User.findOneAndUpdate(
          {
            gameId: userName,
            wallet: { $gte: roundedAmount },
          },
          { $inc: { wallet: -roundedAmount } },
          { new: true, projection: { wallet: 1 } }
        ).lean();

        if (!updatedUser) {
          return sendXMLResponse(
            res,
            -98,
            "Insufficient Balance",
            roundToTwoDecimals(user.wallet)
          );
        }

        await SportM9BetModal.create({
          username: userName,
          betId,
          bet: true,
          settle: false,
          betamount: roundedAmount,
        });

        return sendXMLResponse(
          res,
          0,
          "",
          roundToTwoDecimals(updatedUser.wallet)
        );
      }

      // ===== INVALID ACTION =====
      default:
        return sendXMLResponse(res, -100, "Invalid action");
    }
  } catch (error) {
    console.error("M9BET API error:", error.message);
    return sendXMLResponse(res, -1, "Internal Server Error");
  }
});

if (process.env.NODE_ENV !== "development") {
  cron.schedule("*/5 * * * *", async () => {
    const result = await fetchAndProcessResult();

    if (!result.success) {
      console.error("M9BET processor failed:", result.error);
    } else {
      console.log(
        `✅ Completed: ${result.processed} processed, ${result.skipped} skipped, ${result.markedFetched} marked as fetched`
      );
    }
  });
}

module.exports = router;
