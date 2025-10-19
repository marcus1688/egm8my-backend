const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");
const moment = require("moment");
const { authenticateToken } = require("../../auth/auth");
const { authenticateAdminToken } = require("../../auth/adminAuth");
const {
  User,
  adminUserWalletLog,
  GameDataLog,
} = require("../../models/users.model");
const { adminUser, adminLog } = require("../../models/adminuser.model");
const { v4: uuidv4 } = require("uuid");
const GameWalletLog = require("../../models/gamewalletlog.model");
const SlotHacksawModal = require("../../models/slot_hacksaw.model");
const GameHacksawGameModal = require("../../models/slot_hacksawDatabase.model");

require("dotenv").config();

const hacksawBrandID = "S010193";
const hacksawKey = process.env.HACKSAW_SECRET;
const webURL = "https://www.oc7.me/";
const hacksawAPIURL = "https://gaming.dcgames.asia";

const generateRandomCode = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 10; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }

  return result;
};

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateDCTSignature(brand_id, api_key, additionalParams = "") {
  const signatureString = brand_id + additionalParams + api_key;
  console.log(signatureString);
  return crypto
    .createHash("md5")
    .update(signatureString, "utf8")
    .digest("hex")
    .toUpperCase();
}

function generateSignature(options) {
  const { params = [], brandId, apiKey } = options;

  // Start with brandId if it exists
  let message = brandId || "";

  // Add all parameters in order
  if (params && params.length > 0) {
    message += params.join("");
  }

  // Add API key at the end
  message += apiKey;

  // Generate MD5 hash and return in uppercase
  return crypto.createHash("md5").update(message).digest("hex").toUpperCase();
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

router.post("/api/hacksaw/getgamelist", async (req, res) => {
  try {
    const games = await GameHacksawGameModal.find({ maintenance: false }).sort({
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

    const reformattedGamelist = games.map((game) => ({
      GameCode: game.gameID,
      GameNameEN: game.gameNameEN,
      GameNameZH: game.gameNameCN,
      GameType: game.gameType,
      GameImage: game.imageUrlEN || "",
      Hot: game.hot,
      RTP: game.rtpRate,
    }));

    return res.status(200).json({
      success: true,
      gamelist: reformattedGamelist,
    });
  } catch (error) {
    console.error("Error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "HACKSAW: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "HACKSAW: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "HACKSAW: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/hacksaw/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, gameCode, clientPlatform } = req.body;

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found. Please try again or contact customer service for assistance.",
          zh: "用户未找到，请重试或联系客服以获取帮助。",
          ms: "Pengguna tidak ditemui, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    if (user.gameLock.hacksaw.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
        },
      });
    }

    let lang = "zh_hans";

    if (gameLang === "en") {
      lang = "en";
    } else if (gameLang === "zh") {
      lang = "zh_hans";
    } else if (gameLang === "ms") {
      lang = "id";
    }

    let platform = "pc";
    if (clientPlatform === "web") {
      platform = "pc";
    } else if (clientPlatform === "mobile") {
      platform = "mobile";
    }

    const sign = generateSignature({
      brandId: hacksawBrandID,
      params: [user.username],
      apiKey: hacksawKey,
    });

    let logintoken = `${user.username}:${generateRandomCode()}`;

    const payload = {
      brand_id: hacksawBrandID,
      sign,
      brand_uid: user.username,
      token: logintoken,
      game_id: parseInt(gameCode),
      currency: "MYR",
      language: lang,
      channel: platform,
      country_code: "MY",
      return_url: webURL,
    };

    const response = await axios.post(
      `${hacksawAPIURL}/dcs/loginGame`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const { code, data, msg } = response.data;

    if (code !== 1000) {
      console.log("Hacksaw fail to launch game with error", response.data);
      return res.status(200).json({
        success: false,
        message: {
          en: "HACKSAW: Game launch failed. Please try again or contact customer service for assistance.",
          zh: "HACKSAW: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "HACKSAW: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        hacksawGameToken: logintoken,
      },
      { new: true }
    );

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "HACKSAW"
    );

    return res.status(200).json({
      success: true,
      gameLobby: data.game_url,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
      },
    });
  } catch (error) {
    console.error("Hacksaw error launching game:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "HACKSAW: Game launch failed. Please try again or contact customer service for assistance.",
        zh: "HACKSAW: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "HACKSAW: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/hacksaw/login", async (req, res) => {
  try {
    const { brand_id, sign, token, brand_uid } = req.body;
    if (!token || !sign || !brand_uid || !brand_id) {
      console.log("token failed");
      return res.status(200).json({
        code: 5001,
        msg: "Request parameter error",
      });
    }

    const generatedsign = generateSignature({
      brandId: brand_id,
      params: [token],
      apiKey: hacksawKey,
    });

    if (sign !== generatedsign) {
      console.log("sign validate failed");
      return res.status(200).json({
        code: 5000,
        msg: "Verification code error",
      });
    }

    const user = await User.findOne(
      { username: brand_uid },
      { username: 1, wallet: 1, hacksawGameToken: 1 }
    ).lean();

    if (!user) {
      console.log("no user");
      return res.status(200).json({
        code: 5009,
        msg: "Player's account or token does not exist",
      });
    }

    if (user.hacksawGameToken !== token) {
      console.log("failed verify");

      const invalidUser = await User.findOne(
        { hacksawGameToken: token },
        { username: 1 }
      ).lean();

      if (invalidUser) {
        return res.status(200).json({
          code: 5013,
          msg: "Session authentication failed, token does not match with player",
        });
      } else {
        return res.status(200).json({
          code: 5009,
          msg: "Player's account or token does not exist",
        });
      }
    }

    return res.status(200).json({
      code: 1000,
      msg: "Success",
      data: {
        brand_uid: user.username,
        currency: "MYR",
        balance: roundToTwoDecimals(user.wallet),
      },
    });
  } catch (error) {
    console.log(
      "Hacksaw Error in game provider calling ae96 api",
      error.message
    );
    return res.status(200).json({
      code: 1001,
      msg: "System error",
    });
  }
});

router.post("/api/hacksaw/getBalance", async (req, res) => {
  try {
    const { brand_id, sign, token, brand_uid } = req.body;

    if (!token || !sign || !brand_uid || !brand_id) {
      return res.status(200).json({
        code: 5001,
        msg: "Request parameter error",
      });
    }

    const generatedsign = generateSignature({
      brandId: brand_id,
      params: [token],
      apiKey: hacksawKey,
    });

    if (sign !== generatedsign) {
      console.log("sign validate failed");
      return res.status(200).json({
        code: 5000,
        msg: "Verification code error",
      });
    }

    const user = await User.findOne(
      { username: brand_uid },
      { username: 1, wallet: 1, hacksawGameToken: 1 }
    ).lean();

    if (!user) {
      return res.status(200).json({
        code: 5009,
        msg: "Player's account or token does not exist",
      });
    }

    if (user.hacksawGameToken !== token) {
      const invalidUser = await User.findOne(
        { hacksawGameToken: token },
        { username: 1 }
      ).lean();

      if (invalidUser) {
        return res.status(200).json({
          code: 5013,
          msg: "Session authentication failed, token does not match with player",
        });
      } else {
        return res.status(200).json({
          code: 5009,
          msg: "Player's account or token does not exist",
        });
      }
    }

    return res.status(200).json({
      code: 1000,
      msg: "Success",
      data: {
        brand_uid: user.username,
        currency: "MYR",
        balance: roundToTwoDecimals(user.wallet),
      },
    });
  } catch (error) {
    console.log(
      "Hacksaw Error in game provider calling ae96 api",
      error.message
    );
    return res.status(200).json({
      code: 1001,
      msg: "System error",
    });
  }
});

router.post("/api/hacksaw/wager", async (req, res) => {
  try {
    const {
      brand_id,
      sign,
      token,
      brand_uid,
      amount,
      round_id,
      wager_id,
      is_endround,
      currency,
    } = req.body;

    if (!token || !sign || !brand_uid || !brand_id) {
      return res.status(200).json({
        code: 5001,
        msg: "Request parameter error",
      });
    }

    const generatedsign = generateSignature({
      brandId: brand_id,
      params: [wager_id],
      apiKey: hacksawKey,
    });

    if (sign !== generatedsign) {
      return res.status(200).json({
        code: 5000,
        msg: "Verification code error",
      });
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne(
        { username: brand_uid },
        {
          username: 1,
          wallet: 1,
          "gameLock.hacksaw.lock": 1,
          hacksawGameToken: 1,
        }
      ).lean(),

      SlotHacksawModal.findOne(
        { betId: wager_id, tranId: round_id },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        code: 5009,
        msg: "Player's account or token does not exist",
      });
    }
    if (currentUser.hacksawGameToken !== token) {
      const invalidUser = await User.findOne(
        { hacksawGameToken: token },
        { username: 1 }
      ).lean();

      if (invalidUser) {
        return res.status(200).json({
          code: 5013,
          msg: "Session authentication failed, token does not match with player",
        });
      } else {
        return res.status(200).json({
          code: 5009,
          msg: "Player's account or token does not exist",
        });
      }
    }

    if (currentUser.gameLock?.hacksaw?.lock) {
      return res.status(200).json({
        code: 5010,
        msg: "Player blocked",
      });
    }

    if (existingBet) {
      return res.status(200).json({
        code: 5043,
        msg: "Bet record is duplicated/identical",
        data: {
          brand_uid: brand_uid,
          currency: currency,
          balance: roundToTwoDecimals(currentUser.wallet),
        },
      });
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        username: brand_uid,
        wallet: { $gte: roundToTwoDecimals(amount || 0) },
      },
      { $inc: { wallet: -roundToTwoDecimals(amount || 0) } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res.status(200).json({
        code: 5003,
        msg: "Insufficient balance",
        data: {
          brand_uid: brand_uid,
          currency: currency,
          balance: roundToTwoDecimals(currentUser.wallet),
        },
      });
    }

    await SlotHacksawModal.create({
      username: currentUser.username,
      betamount: roundToTwoDecimals(amount),
      betId: wager_id,
      tranId: round_id,
      bet: true,
    });

    return res.status(200).json({
      code: 1000,
      msg: "Success",
      data: {
        brand_uid: brand_uid,
        currency: currency,
        balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
    });
  } catch (error) {
    console.log(
      "Hacksaw Error in game provider calling ae96 bet api",
      error.message
    );
    return res.status(200).json({
      code: 1001,
      msg: "System error",
    });
  }
});

router.post("/api/hacksaw/cancelWager", async (req, res) => {
  try {
    const { brand_id, sign, brand_uid, round_id, wager_id, currency } =
      req.body;

    if (!sign || !brand_uid || !brand_id) {
      return res.status(200).json({
        code: 5001,
        msg: "Request parameter error",
      });
    }

    const generatedsign = generateSignature({
      brandId: brand_id,
      params: [wager_id],
      apiKey: hacksawKey,
    });

    if (sign !== generatedsign) {
      return res.status(200).json({
        code: 5000,
        msg: "Verification code error",
      });
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne({ username: brand_uid }, { wallet: 1 }).lean(),
      SlotHacksawModal.findOne(
        { tranId: round_id, betId: wager_id },
        { cancel: 1, betamount: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        code: 5009,
        msg: "Player's account or token does not exist",
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        code: 5042,
        msg: "Bet record does not exist.",
        data: {
          brand_uid: brand_uid,
          currency: currency,
          balance: roundToTwoDecimals(currentUser.wallet),
        },
      });
    }

    if (existingBet.cancel) {
      return res.status(200).json({
        code: 5043,
        msg: "Bet record is duplicated/identical",
        data: {
          brand_uid: brand_uid,
          currency: currency,
          balance: roundToTwoDecimals(currentUser.wallet),
        },
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { username: brand_uid },
        { $inc: { wallet: roundToTwoDecimals(existingBet.betamount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotHacksawModal.updateOne(
        { tranId: round_id, betId: wager_id },
        { $set: { cancel: true, cancelId: wager_id } }
      ),
    ]);

    return res.status(200).json({
      code: 1000,
      msg: "Success",
      data: {
        brand_uid: brand_uid,
        currency: currency,
        balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
    });
  } catch (error) {
    console.log(
      "Hacksaw Error in game provider calling ae96 refund api",
      error.message
    );
    return res.status(200).json({
      code: 1001,
      msg: "System error",
    });
  }
});

router.post("/api/hacksaw/appendWager", async (req, res) => {
  try {
    const { brand_id, sign, brand_uid, round_id, amount, wager_id, currency } =
      req.body;

    if (!sign || !brand_uid || !brand_id) {
      return res.status(200).json({
        code: 5001,
        msg: "Request parameter error",
      });
    }

    const generatedsign = generateSignature({
      brandId: brand_id,
      params: [wager_id],
      apiKey: hacksawKey,
    });

    if (sign !== generatedsign) {
      return res.status(200).json({
        code: 5000,
        msg: "Verification code error",
      });
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne({ username: brand_uid }, { wallet: 1 }).lean(),
      SlotHacksawModal.findOne({ appendId: wager_id }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        code: 5009,
        msg: "Player's account or token does not exist",
      });
    }
    if (existingBet) {
      return res.status(200).json({
        code: 5043,
        msg: "Bet record is duplicated/identical",
        data: {
          brand_uid: brand_uid,
          currency: currency,
          balance: roundToTwoDecimals(currentUser.wallet),
        },
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { username: brand_uid },
        { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotHacksawModal.updateOne(
        { tranId: round_id },
        {
          $set: {
            settle: true,
            settleamount: roundToTwoDecimals(amount),
            tranId: round_id,
            appendId: wager_id,
          },
        }
      ),
    ]);

    return res.status(200).json({
      code: 1000,
      msg: "Success",
      data: {
        brand_uid: brand_uid,
        currency: currency,
        balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
    });
  } catch (error) {
    console.log(
      "HACKSAW Error in game provider calling ae96 result api",
      error.message
    );
    return res.status(200).json({
      code: 1001,
      msg: "System error",
    });
  }
});

router.post("/api/hacksaw/endWager", async (req, res) => {
  try {
    const { brand_id, sign, brand_uid, round_id, amount, wager_id, currency } =
      req.body;
    if (!sign || !brand_uid || !brand_id) {
      return res.status(200).json({
        code: 5001,
        msg: "Request parameter error",
      });
    }

    const generatedsign = generateSignature({
      brandId: brand_id,
      params: [wager_id],
      apiKey: hacksawKey,
    });

    if (sign !== generatedsign) {
      return res.status(200).json({
        code: 5000,
        msg: "Verification code error",
      });
    }

    const [currentUser, existingBet, duplicateWager] = await Promise.all([
      User.findOne({ username: brand_uid }, { wallet: 1 }).lean(),
      SlotHacksawModal.findOne(
        { tranId: round_id },
        { _id: 1, settle: 1, settleId: 1, settleamount: 1 }
      ).lean(),
      SlotHacksawModal.findOne({ settleId: wager_id }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        code: 5009,
        msg: "Player's account or token does not exist",
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        code: 5042,
        msg: "Bet record does not exist.",
        data: {
          brand_uid: brand_uid,
          currency: currency,
          balance: roundToTwoDecimals(currentUser.wallet),
        },
      });
    }

    if (duplicateWager) {
      return res.status(200).json({
        code: 5043,
        msg: "Bet record is duplicated/identical",
        data: {
          brand_uid: brand_uid,
          currency: currency,
          balance: roundToTwoDecimals(currentUser.wallet),
        },
      });
    }

    let updateQuery;
    let userBalanceUpdate;

    if (!existingBet.settle) {
      // First settlement for this round
      updateQuery = {
        $set: {
          settle: true,
          settleamount: roundToTwoDecimals(amount),
          settleId: wager_id,
        },
      };
    } else {
      updateQuery = {
        $set: {
          settleamount: roundToTwoDecimals(amount),
          settleId: wager_id,
          tranId: round_id,
          settle: true,
        },
      };
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { username: brand_uid },
        { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotHacksawModal.updateOne({ tranId: round_id }, updateQuery),
    ]);

    return res.status(200).json({
      code: 1000,
      msg: "Success",
      data: {
        brand_uid: brand_uid,
        currency: currency,
        balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
    });
  } catch (error) {
    console.log(
      "HACKSAW Error in game provider calling ae96 result api",
      error.message
    );
    return res.status(200).json({
      code: 1001,
      msg: "System error",
    });
  }
});

router.post("/api/hacksaw/freeSpinResult", async (req, res) => {
  try {
    const { brand_id, sign, brand_uid, round_id, amount, wager_id, currency } =
      req.body;

    if (!sign || !brand_uid || !brand_id) {
      return res.status(200).json({
        code: 5001,
        msg: "Request parameter error",
      });
    }

    const generatedsign = generateSignature({
      brandId: brand_id,
      params: [wager_id],
      apiKey: hacksawKey,
    });

    if (sign !== generatedsign) {
      return res.status(200).json({
        code: 5000,
        msg: "Verification code error",
      });
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne({ username: brand_uid }, { wallet: 1 }).lean(),
      SlotHacksawModal.findOne({ freespinId: wager_id }, { _id: 1 }).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        code: 5009,
        msg: "Player's account or token does not exist",
      });
    }

    if (existingBet) {
      return res.status(200).json({
        code: 5043,
        msg: "Bet record is duplicated/identical",
        data: {
          brand_uid: brand_uid,
          currency: currency,
          balance: roundToTwoDecimals(currentUser.wallet),
        },
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { username: brand_uid },
        { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotHacksawModal.updateOne(
        { tranId: round_id },
        {
          $set: {
            settle: true,
            settleamount: roundToTwoDecimals(amount),
            tranId: round_id,
            freespinId: wager_id,
          },
        },
        { upsert: true }
      ),
    ]);

    return res.status(200).json({
      code: 1000,
      msg: "Success",
      data: {
        brand_uid: brand_uid,
        currency: currency,
        balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
    });
  } catch (error) {
    console.log(
      "HACKSAW Error in game provider calling ae96 result api",
      error.message
    );
    return res.status(200).json({
      code: 1001,
      msg: "System error",
    });
  }
});

router.post("/api/hacksaw/promoPayout", async (req, res) => {
  try {
    const {
      brand_id,
      sign,
      brand_uid,
      trans_id,
      amount,
      promotion_id,
      currency,
    } = req.body;

    if (!sign || !brand_uid || !brand_id) {
      return res.status(200).json({
        code: 5001,
        msg: "Request parameter error",
      });
    }

    const generatedsign = generateSignature({
      brandId: brand_id,
      params: [promotion_id, trans_id],
      apiKey: hacksawKey,
    });

    if (sign !== generatedsign) {
      return res.status(200).json({
        code: 5000,
        msg: "Verification code error",
      });
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne({ username: brand_uid }, { wallet: 1 }).lean(),
      SlotHacksawModal.findOne(
        { betId: promotion_id, tranId: trans_id },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        code: 5009,
        msg: "Player's account or token does not exist",
      });
    }

    if (existingBet) {
      return res.status(200).json({
        code: 5043,
        msg: "Bet record is duplicated/identical",
        data: {
          brand_uid: brand_uid,
          currency: currency,
          balance: roundToTwoDecimals(currentUser.wallet),
        },
      });
    }

    const [updatedUserBalance] = await Promise.all([
      User.findOneAndUpdate(
        { username: brand_uid },
        { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
    ]);

    await SlotHacksawModal.create({
      username: currentUser.username,
      betamount: 0,
      settleamount: roundToTwoDecimals(amount),
      betId: promotion_id,
      tranId: trans_id,
      bet: true,
      settle: true,
    });

    return res.status(200).json({
      code: 1000,
      msg: "Success",
      data: {
        brand_uid: brand_uid,
        currency: currency,
        balance: roundToTwoDecimals(updatedUserBalance.wallet),
      },
    });
  } catch (error) {
    console.log(
      "HACKSAW Error in game provider calling ae96 result api",
      error.message
    );
    return res.status(200).json({
      code: 1001,
      msg: "System error",
    });
  }
});

router.post("/api/hacksaw/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotHacksawModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      cancel: { $ne: true },
      settle: true,
    });

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
    Object.keys(playerSummary).forEach((playerId) => {
      playerSummary[playerId].turnover = Number(
        playerSummary[playerId].turnover.toFixed(2)
      );
      playerSummary[playerId].winloss = Number(
        playerSummary[playerId].winloss.toFixed(2)
      );
    });
    return res.status(200).json({
      success: true,
      summary: {
        gamename: "HACKSAW",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("HACKSAW: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "HACKSAW: Failed to fetch win/loss report",
        zh: "HACKSAW: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/hacksaw/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotHacksawModal.find({
        username: user.username,
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
        totalTurnover += record.betamount || 0;
        totalWinLoss += (record.settleamount || 0) - (record.betamount || 0);
      });

      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));
      // Return the aggregated results
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "HACKSAW",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("HACKSAW: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "HACKSAW: Failed to fetch win/loss report",
          zh: "HACKSAW: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/hacksaw/:userId/gamedata",
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
          gameCategories["Slot Games"] &&
          gameCategories["Slot Games"] instanceof Map
        ) {
          const gameCat = Object.fromEntries(gameCategories["Slot Games"]);

          if (gameCat["HACKSAW"]) {
            totalTurnover += gameCat["HACKSAW"].turnover || 0;
            totalWinLoss += gameCat["HACKSAW"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "HACKSAW",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("HACKSAW: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "HACKSAW: Failed to fetch win/loss report",
          zh: "HACKSAW: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/hacksaw/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotHacksawModal.find({
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
        totalTurnover += record.betamount || 0;

        totalWinLoss += (record.betamount || 0) - (record.settleamount || 0);
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "HACKSAW",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("HACKSAW: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "HACKSAW: Failed to fetch win/loss report",
          zh: "HACKSAW: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/hacksaw/kioskreport",
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
          const gameCat = Object.fromEntries(gameCategories["Slot Games"]);

          if (gameCat["HACKSAW"]) {
            totalTurnover += Number(gameCat["HACKSAW"].turnover || 0);
            totalWinLoss += Number(gameCat["HACKSAW"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "HACKSAW",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("HACKSAW: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "HACKSAW: Failed to fetch win/loss report",
          zh: "HACKSAW: 获取盈亏报告失败",
        },
      });
    }
  }
);
module.exports = router;
