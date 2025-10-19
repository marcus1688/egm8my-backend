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
const SlotLive22Modal = require("../../models/slot_live22.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const GameWalletLog = require("../../models/gamewalletlog.model");
const Decimal = require("decimal.js");
const GameLive22GameModal = require("../../models/slot_live22Database.model");
require("dotenv").config();

const live22OperatorID = "l22oc7MYR";
const live22Secret = process.env.LIVE22_SECRET;
const webURL = "https://www.oc7.me/";
const live22APIURL = "https://smapi.xystem138.com/api/opgateway/v1/op/";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateSignature(...inputs) {
  // Filter out undefined or null inputs
  const validInputs = inputs.filter(
    (input) => input !== undefined && input !== null
  );

  // Join the valid inputs into a single string
  const stringToHash = validInputs.join("");

  return crypto.createHash("md5").update(stringToHash).digest("hex");
}

function getCurrentFormattedDate() {
  return moment.utc().format("YYYY-MM-DD HH:mm:ss");
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

router.post("/api/live22/getgamelist", async (req, res) => {
  try {
    const excludedGameIds = ["35007", "30026", "35008", "35003"];

    const games = await GameLive22GameModal.find({
      gameID: { $nin: excludedGameIds },
    }).sort({
      hot: -1,
      createdAt: -1,
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
      RTP: game.rtpRate,
    }));

    return res.status(200).json({
      success: true,
      gamelist: reformattedGamelist,
    });
  } catch (error) {
    console.log("LIVE22 error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "LIVE22: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "LIVE22: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "LIVE22: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

//to login to game
router.post("/api/live22/launchGame", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

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

    if (user.gameLock.live22.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
        },
      });
    }

    // let token = req.body.gameToken;

    let token = `${user.username}:${generateRandomCode()}`;

    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();

    // gameLang === en-us || zh-cn
    const { gameCode, gameLang } = req.body;

    let lang = "en-us";

    if (gameLang === "en") {
      lang = "en-us";
    } else if (gameLang === "zh") {
      lang = "zh-cn";
    } else if (gameLang === "ms") {
      lang = "ml-my";
    }

    const functionName = "GameLogin";

    const requestDateTime = getCurrentFormattedDate();

    const playerId = user.username;

    const signature = generateSignature(
      functionName,
      requestDateTime,
      live22OperatorID,
      live22Secret,
      playerId
    );

    const payload = {
      OperatorId: live22OperatorID,
      RequestDateTime: requestDateTime,
      Signature: signature,
      PlayerId: playerId,
      Ip: clientIp,
      GameCode: gameCode,
      Currency: "MYR",
      Lang: lang,
      RedirectUrl: webURL,
      AuthToken: token,
    };

    // Make the API request
    const response = await axios.post(`${live22APIURL}GameLogin`, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.data.Description !== "Success") {
      console.log(
        "LIVE22 error in launching game",
        response.data,
        response.data.Description
      );
      return res.status(200).json({
        success: false,
        message: {
          en: "LIVE22: Game launch failed. Please try again or customer service for assistance.",
          zh: "LIVE22: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "LIVE22: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        live22GameToken: token,
      },
      { new: true }
    );

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "LIVE22"
    );

    return res.status(200).json({
      success: true,
      gameLobby: response.data.Url,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
      },
    });
  } catch (error) {
    console.log("LIVE22 error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "LIVE22: Game launch failed. Please try again or customer service for assistance.",
        zh: "LIVE22: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "LIVE22: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/live22/GetBalance", async (req, res) => {
  try {
    const { OperatorId, Signature, PlayerId, AuthToken, RequestDateTime } =
      req.body;

    if (
      !OperatorId ||
      !Signature ||
      !PlayerId ||
      !AuthToken ||
      !RequestDateTime
    ) {
      return res.status(200).json({
        Status: 900406,
        Description: "Incoming Request Info Incomplete",
        ResponseDateTime: RequestDateTime,
        Balance: 0,
      });
    }

    if (OperatorId !== live22OperatorID) {
      return res.status(200).json({
        Status: 900405,
        Description: "Operator ID Error",
        ResponseDateTime: RequestDateTime,
        Balance: 0,
      });
    }

    const functionName = "GetBalance";

    const signature = generateSignature(
      functionName,
      RequestDateTime,
      live22OperatorID,
      live22Secret,
      PlayerId
    );
    if (signature !== Signature) {
      return res.status(200).json({
        Status: 900407,
        Description: "Invalid Signature",
        ResponseDateTime: RequestDateTime,
        Balance: 0,
      });
    }

    const tokenParts = AuthToken.split(":");

    const username = tokenParts[0];

    const currentUser = await User.findOne(
      { username },
      { wallet: 1, live22GameToken: 1 }
    ).lean();
    if (!currentUser || currentUser.live22GameToken !== AuthToken) {
      return res.status(200).json({
        Status: 900500,
        Description: "Internal Server Error",
        ResponseDateTime: RequestDateTime,
        Balance: 0,
      });
    }

    const walletValue = Number(currentUser.wallet);

    const newBalance = new Decimal(walletValue).toDecimalPlaces(4);
    return res.status(200).json({
      Status: 200,
      Description: "OK",
      ResponseDateTime: RequestDateTime,
      Balance: newBalance.toNumber(),
    });
  } catch (error) {
    console.error(
      "LIVE22: Error in game provider calling ae96 get balance api:",
      error.message
    );
    if (
      error.message === "jwt expired" ||
      error.message === "invalid token" ||
      error.message === "jwt malformed"
    ) {
      return res.status(200).json({
        Status: 900500,
        Description: "Internal Server Error",
        ResponseDateTime: getCurrentFormattedDate(),
        Balance: 0,
      });
    } else {
      return res.status(200).json({
        Status: 900500,
        Description: "Internal Server Error",
        ResponseDateTime: getCurrentFormattedDate(),
        Balance: 0,
      });
    }
  }
});

router.post("/api/live22/Bet", async (req, res) => {
  try {
    const {
      OperatorId,
      Signature,
      PlayerId,
      BetId,
      RequestDateTime,
      BetAmount,
      AuthToken,
      RoundId,
    } = req.body;

    if (
      !OperatorId ||
      !Signature ||
      !PlayerId ||
      !BetId ||
      !RequestDateTime ||
      !AuthToken ||
      BetAmount === null ||
      BetAmount === undefined
    ) {
      return res.status(200).json({
        Status: 900406,
        Description: "Incoming Request Info Incomplete",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (OperatorId !== live22OperatorID) {
      return res.status(200).json({
        Status: 900405,
        Description: "Operator ID Error",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const functionName = "Bet";

    const signature = generateSignature(
      functionName,
      BetId,
      RequestDateTime,
      live22OperatorID,
      live22Secret,
      PlayerId
    );

    if (signature !== Signature) {
      return res.status(200).json({
        Status: 900407,
        Description: "Invalid Signature",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const tokenParts = AuthToken.split(":");

    const username = tokenParts[0];

    const [currentUser, existingBet] = await Promise.all([
      // Get only fields we need, no lean()
      User.findOne(
        { username },
        {
          wallet: 1,
          live22GameToken: 1,
          "gameLock.live22.lock": 1,
          _id: 1,
          username: 1,
        }
      ).lean(),
      SlotLive22Modal.findOne({ betId: BetId, bet: true }, { _id: 1 }).lean(),
    ]);

    if (!currentUser || currentUser.live22GameToken !== AuthToken) {
      return res.status(200).json({
        Status: 900500,
        Description: "Internal Server Error",
        ResponseDateTime: RequestDateTime,
        Balance: 0,
      });
    }

    if (currentUser.gameLock?.live22?.lock) {
      return res.status(200).json({
        Status: 900416,
        Description: "Player Inactive",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (existingBet) {
      return res.status(200).json({
        Status: 900409,
        Description: "Duplicate Transaction",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    // const amount = roundToTwoDecimals(BetAmount);
    const amount = new Decimal(Number(BetAmount || 0)).toDecimalPlaces(4); // Keeps as Decimal
    const oldBalance = new Decimal(Number(currentUser.wallet)).toDecimalPlaces(
      4
    );
    const betAmount = new Decimal(Number(amount)).toDecimalPlaces(4);

    const inData = betAmount.toNumber(); // Ensure 4 decimals

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: betAmount.toDecimalPlaces(4).toNumber() },
      },
      { $inc: { wallet: -inData } },
      { new: true, projection: { wallet: 1 } }
    ).lean();

    if (!updatedUserBalance) {
      return res.status(200).json({
        Status: 900605,
        Description: "Insufficient Balance",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    await SlotLive22Modal.create({
      username: currentUser.username,
      betId: BetId,
      bet: true,
      betamount: betAmount.toDecimalPlaces(4).toNumber(),
    });

    const newBalance = new Decimal(
      Number(updatedUserBalance.wallet)
    ).toDecimalPlaces(4);

    return res.status(200).json({
      Status: 200,
      Description: "OK",
      ResponseDateTime: RequestDateTime,
      OldBalance: oldBalance.toDecimalPlaces(4).toNumber(),
      NewBalance: newBalance.toNumber(),
    });
  } catch (error) {
    console.error(
      "LIVE22: Error in game provider calling ae96 get bet api:",
      error.message
    );
    return res.status(200).json({
      Status: 900500,
      Description: "Internal Server Error",
      ResponseDateTime: getCurrentFormattedDate(),
      Balance: 0,
    });
  }
});

router.post("/api/live22/GameResult", async (req, res) => {
  try {
    const {
      OperatorId,
      Signature,
      PlayerId,
      BetId,
      RequestDateTime,
      BetAmount,
      ResultId,
      Payout,
    } = req.body;

    if (
      !OperatorId ||
      !Signature ||
      !PlayerId ||
      !BetId ||
      !RequestDateTime ||
      !ResultId ||
      Payout === null ||
      Payout === undefined ||
      BetAmount === null ||
      BetAmount === undefined
    ) {
      return res.status(200).json({
        Status: 900406,
        Description: "Incoming Request Info Incomplete",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (OperatorId !== live22OperatorID) {
      return res.status(200).json({
        Status: 900405,
        Description: "Operator ID Error",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const functionName = "GameResult";

    const signature = generateSignature(
      functionName,
      ResultId,
      RequestDateTime,
      live22OperatorID,
      live22Secret,
      PlayerId
    );

    if (signature !== Signature) {
      return res.status(200).json({
        Status: 900407,
        Description: "Invalid Signature",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const toLowercaseUsername = PlayerId;

    const [currentUser, existingBet, existingTransaction] = await Promise.all([
      User.findOne(
        { username: toLowercaseUsername },
        { wallet: 1, _id: 1 }
      ).lean(),
      SlotLive22Modal.findOne({ betId: BetId, bet: true }, { _id: 1 }).lean(),
      SlotLive22Modal.findOne(
        { betId: BetId, $or: [{ settle: true }, { cancel: true }] },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      return res.status(200).json({
        Status: 900404,
        Description: "Invalid player / password. Please try again",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        Status: 900415,
        Description: "Bet Transaction Not Found",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        Status: 900409,
        Description: "Duplicate Transaction",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const amount = new Decimal(Number(Payout || 0)).toDecimalPlaces(4); // Keep as Decimal (not string)
    const oldBalance = new Decimal(Number(currentUser.wallet)).toDecimalPlaces(
      4
    );
    const decimalAmount = new Decimal(Number(amount)).toDecimalPlaces(4); // Ensure consistency
    const inData = decimalAmount.toNumber(); // Convert safely to number

    const [updatedUserBalance] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: inData } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotLive22Modal.findOneAndUpdate(
        { betId: BetId },
        { $set: { settle: true, settleamount: inData } },
        { upsert: true }
      ),
    ]);

    const newBalance = new Decimal(
      Number(updatedUserBalance.wallet)
    ).toDecimalPlaces(4);

    return res.status(200).json({
      Status: 200,
      Description: "OK",
      ResponseDateTime: RequestDateTime,
      OldBalance: oldBalance.toNumber(),
      NewBalance: newBalance.toNumber(),
    });
  } catch (error) {
    console.error(
      "LIVE22: Error in game provider calling ae96 get game result api:",
      error.message
    );
    return res.status(200).json({
      Status: 900500,
      Description: "Internal Server Error",
      ResponseDateTime: getCurrentFormattedDate(),
      OldBalance: 0,
      NewBalance: 0,
    });
  }
});

router.post("/api/live22/Rollback", async (req, res) => {
  try {
    const {
      OperatorId,
      Signature,
      PlayerId,
      BetId,
      RequestDateTime,
      BetAmount,
    } = req.body;

    if (
      !OperatorId ||
      !Signature ||
      !PlayerId ||
      !BetId ||
      !RequestDateTime ||
      BetAmount === null ||
      BetAmount === undefined
    ) {
      return res.status(200).json({
        Status: 900406,
        Description: "Incoming Request Info Incomplete",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (OperatorId !== live22OperatorID) {
      return res.status(200).json({
        Status: 900405,
        Description: "Operator ID Error",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const functionName = "Rollback";

    const signature = generateSignature(
      functionName,
      BetId,
      RequestDateTime,
      live22OperatorID,
      live22Secret,
      PlayerId
    );

    if (signature !== Signature) {
      return res.status(200).json({
        Status: 900407,
        Description: "Invalid Signature",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const toLowercaseUsername = PlayerId;
    const [currentUser, existingBet, existingTransaction] = await Promise.all([
      User.findOne(
        { username: toLowercaseUsername },
        { wallet: 1, _id: 1 }
      ).lean(),
      SlotLive22Modal.findOne({ betId: BetId, bet: true }, { _id: 1 }).lean(),
      SlotLive22Modal.findOne(
        { betId: BetId, $or: [{ settle: true }, { cancel: true }] },
        { _id: 1 }
      ).lean(),
    ]);
    if (!currentUser) {
      return res.status(200).json({
        Status: 900404,
        Description: "Invalid player / password. Please try again",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (!existingBet) {
      return res.status(200).json({
        Status: 900415,
        Description: "Bet Transaction Not Found",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        Status: 900409,
        Description: "Duplicate Transaction",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const amount = new Decimal(Number(BetAmount || 0)).toDecimalPlaces(4); // Keeps as Decimal
    const oldBalance = new Decimal(Number(currentUser.wallet)).toDecimalPlaces(
      4
    );
    const inData = amount.toNumber(); // Ensure it's a valid number

    const [updatedUserBalance] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: inData } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotLive22Modal.findOneAndUpdate(
        { betId: BetId },
        { $set: { cancel: true } },
        { upsert: true, new: true }
      ),
    ]);

    const newBalance = new Decimal(
      Number(updatedUserBalance.wallet)
    ).toDecimalPlaces(4);

    return res.status(200).json({
      Status: 200,
      Description: "OK",
      ResponseDateTime: RequestDateTime,
      OldBalance: oldBalance.toNumber(),
      NewBalance: newBalance.toNumber(),
    });
  } catch (error) {
    console.error(
      "LIVE22: Error in game provider calling ae96 get rollback api:",
      error.message
    );
    return res.status(200).json({
      Status: 900500,
      Description: "Internal Server Error",
      ResponseDateTime: getCurrentFormattedDate(),
      OldBalance: 0,
      NewBalance: 0,
    });
  }
});

router.post("/api/live22/CashBonus", async (req, res) => {
  try {
    const { OperatorId, Signature, PlayerId, RequestDateTime, Payout, TranId } =
      req.body;

    if (
      !OperatorId ||
      !Signature ||
      !PlayerId ||
      !RequestDateTime ||
      !TranId ||
      Payout === null ||
      Payout === undefined
    ) {
      return res.status(200).json({
        Status: 900406,
        Description: "Incoming Request Info Incomplete",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (OperatorId !== live22OperatorID) {
      return res.status(200).json({
        Status: 900405,
        Description: "Operator ID Error",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const functionName = "CashBonus";

    const signature = generateSignature(
      functionName,
      TranId,
      RequestDateTime,
      live22OperatorID,
      live22Secret,
      PlayerId
    );

    if (signature !== Signature) {
      return res.status(200).json({
        Status: 900407,
        Description: "Invalid Signature",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const toLowercaseUsername = PlayerId;
    const [currentUser, existingTrans] = await Promise.all([
      User.findOne(
        { username: toLowercaseUsername },
        { wallet: 1, _id: 1, username: 1 }
      ).lean(),
      SlotLive22Modal.findOne({ tranId: TranId }, { _id: 1 }).lean(),
    ]);
    if (!currentUser) {
      return res.status(200).json({
        Status: 900404,
        Description: "Invalid player / password. Please try again",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    if (existingTrans) {
      return res.status(200).json({
        Status: 900409,
        Description: "Duplicate Transaction",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const amount = new Decimal(Number(Payout || 0)).toDecimalPlaces(4); // Ensures Decimal format
    const oldBalance = new Decimal(Number(currentUser.wallet)).toDecimalPlaces(
      4
    );
    const inData = amount.toNumber();

    const [updatedUserBalance] = await Promise.all([
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: inData } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotLive22Modal.create({
        username: currentUser.username,
        tranId: TranId,
      }),
    ]);

    const newBalance = new Decimal(
      Number(updatedUserBalance.wallet)
    ).toDecimalPlaces(4);

    return res.status(200).json({
      Status: 200,
      Description: "OK",
      ResponseDateTime: RequestDateTime,
      OldBalance: oldBalance.toNumber(),
      NewBalance: newBalance.toNumber(),
    });
  } catch (error) {
    console.error(
      "LIVE22: Error in game provider calling ae96 get cashbonus api:",
      error.message
    );
    return res.status(200).json({
      Status: 900500,
      Description: "Internal Server Error",
      ResponseDateTime: getCurrentFormattedDate(),
      OldBalance: 0,
      NewBalance: 0,
    });
  }
});

router.post("/api/live22/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotLive22Modal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      cancel: { $ne: true },

      settle: true,
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
        gamename: "LIVE22",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("LIVE22: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "LIVE22: Failed to fetch win/loss report",
        zh: "LIVE22: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/live22/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLive22Modal.find({
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
          gamename: "LIVE22",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("LIVE22: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "LIVE22: Failed to fetch win/loss report",
          zh: "LIVE22: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/live22/:userId/gamedata",
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
          const slotGames = Object.fromEntries(gameCategories["Slot Games"]);

          if (slotGames["LIVE22"]) {
            totalTurnover += slotGames["LIVE22"].turnover || 0;
            totalWinLoss += slotGames["LIVE22"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "LIVE22",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("LIVE22: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "LIVE22: Failed to fetch win/loss report",
          zh: "LIVE22: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/live22/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLive22Modal.find({
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
          gamename: "LIVE22",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("LIVE22: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "LIVE22: Failed to fetch win/loss report",
          zh: "LIVE22: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/live22/kioskreport",
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

          if (liveCasino["LIVE22"]) {
            totalTurnover += Number(liveCasino["LIVE22"].turnover || 0);
            totalWinLoss += Number(liveCasino["LIVE22"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "LIVE22",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("LIVE22: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "LIVE22: Failed to fetch win/loss report",
          zh: "LIVE22: 获取盈亏报告失败",
        },
      });
    }
  }
);
module.exports = router;
