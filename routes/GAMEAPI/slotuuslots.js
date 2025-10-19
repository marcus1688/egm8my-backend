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
const SlotUUSlotModal = require("../../models/slot_uuslot.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const GameWalletLog = require("../../models/gamewalletlog.model");
const Decimal = require("decimal.js");

require("dotenv").config();

const uuSlotOperatorID = "uusoc7MYR";
const uuSlotSecret = process.env.UUSLOT_SECRET;
const webURL = "https://www.oc7.me/";
const uuSlotAPIURL = "https://smapi.xystem138.com/api/opgateway/v1/op/";

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

router.post("/api/uuslot/getgamelist", async (req, res) => {
  try {
    const functionName = "GetGameList";

    const requestDateTime = getCurrentFormattedDate();

    const signature = generateSignature(
      functionName,
      requestDateTime,
      uuSlotOperatorID,
      uuSlotSecret
    );

    const payload = {
      OperatorId: uuSlotOperatorID,
      RequestDateTime: requestDateTime,
      Signature: signature,
    };

    const response = await axios.post(`${uuSlotAPIURL}GetGameList`, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    const gameTypeMap = {
      1: "Slot",
    };

    const excludedGameCodes = ["35007", "30026"];

    const filteredGames = response.data.Game.filter(
      (game) =>
        game.IsActive === true && !excludedGameCodes.includes(game.GameCode)
    ).map((game) => {
      const gameNameZH = game.OtherName.find((name) =>
        name.startsWith("zh-cn|")
      )
        ? game.OtherName.find((name) => name.startsWith("zh-cn|")).split("|")[1]
        : game.GameName;

      return {
        GameCode: game.GameCode,
        GameNameEN: game.GameName,
        GameImage: game.ImageUrl,
        GameNameZH: gameNameZH,
        GameType: gameTypeMap[game.GameType] || "UU_SLOT", // Map to GameType Name
      };
    });

    return res.status(200).json({
      success: true,
      gamelist: filteredGames,
    });
  } catch (error) {
    console.error("UU_SLOT error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "UU_SLOT: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "UU_SLOT: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "UU_SLOT: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

//to login to game
router.post("/api/uuslot/launchGame", authenticateToken, async (req, res) => {
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

    if (user.gameLock.uuslot.lock) {
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
      uuSlotOperatorID,
      uuSlotSecret,
      playerId
    );

    const payload = {
      OperatorId: uuSlotOperatorID,
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
    const response = await axios.post(`${uuSlotAPIURL}GameLogin`, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.data.Description !== "Success") {
      console.log(
        "UU_SLOT error in launching game",
        response.data,
        response.data.Description
      );
      return res.status(200).json({
        success: false,
        message: {
          en: "UU_SLOT: Game launch failed. Please try again or customer service for assistance.",
          zh: "UU_SLOT: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "UU_SLOT: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        uuslotGameToken: token,
      },
      { new: true }
    );

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "UU SLOT"
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
    console.log("UU_SLOT error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "UU_SLOT: Game launch failed. Please try again or customer service for assistance.",
        zh: "UU_SLOT: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "UU_SLOT: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/uuslot/GetBalance", async (req, res) => {
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

    if (OperatorId !== uuSlotOperatorID) {
      return res.status(200).json({
        Status: 900405,
        Description: "Operator ID Error",
        ResponseDateTime: RequestDateTime,
        Balance: 0,
      });
    }
    const signature = generateSignature(
      "GetBalance",
      RequestDateTime,
      uuSlotOperatorID,
      uuSlotSecret,
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
      { wallet: 1, uuslotGameToken: 1 }
    ).lean();

    if (!currentUser || currentUser.uuslotGameToken !== AuthToken) {
      return res.status(200).json({
        Status: 900500,
        Description: "Internal Server Error",
        ResponseDateTime: RequestDateTime,
        Balance: 0,
      });
    }

    const newBalance = new Decimal(Number(currentUser.wallet)).toDecimalPlaces(
      4
    );
    return res.status(200).json({
      Status: 200,
      Description: "OK",
      ResponseDateTime: RequestDateTime,
      Balance: newBalance.toNumber(),
    });
  } catch (error) {
    console.error(
      "UU_SLOT: Error in game provider calling ae96 get balance api:",
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

router.post("/api/uuslot/Bet", async (req, res) => {
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

    if (OperatorId !== uuSlotOperatorID) {
      return res.status(200).json({
        Status: 900405,
        Description: "Operator ID Error",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const signature = generateSignature(
      "Bet",
      BetId,
      RequestDateTime,
      uuSlotOperatorID,
      uuSlotSecret,
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
      // Only retrieve the fields we need
      User.findOne(
        { username },
        {
          wallet: 1,
          uuslotGameToken: 1,
          "gameLock.uuslot.lock": 1,
          _id: 1,
          username: 1,
        }
      ).lean(),

      // Just check for existence, minimizing returned data
      SlotUUSlotModal.findOne({ betId: BetId, bet: true }, { _id: 1 }).lean(),
    ]);

    if (!currentUser || currentUser.uuslotGameToken !== AuthToken) {
      return res.status(200).json({
        Status: 900500,
        Description: "Internal Server Error",
        ResponseDateTime: RequestDateTime,
        Balance: 0,
      });
    }

    if (currentUser.gameLock?.uuslot?.lock) {
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

    const inData = betAmount.toNumber();

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: inData },
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

    await SlotUUSlotModal.create({
      username: currentUser.username,
      betId: BetId,
      bet: true,
      betamount: inData,
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
      "UU_SLOT: Error in game provider calling ae96 get bet api:",
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

router.post("/api/uuslot/GameResult", async (req, res) => {
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

    if (OperatorId !== uuSlotOperatorID) {
      return res.status(200).json({
        Status: 900405,
        Description: "Operator ID Error",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const signature = generateSignature(
      "GameResult",
      ResultId,
      RequestDateTime,
      uuSlotOperatorID,
      uuSlotSecret,
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

    const [currentUser, existingBet, existingTransaction] = await Promise.all([
      // Only get fields we need
      User.findOne(
        { username: PlayerId },
        { wallet: 1, _id: 1, username: 1 }
      ).lean(),

      // Just check for existence
      SlotUUSlotModal.findOne({ betId: BetId, bet: true }, { _id: 1 }).lean(),

      // Just check for existence
      SlotUUSlotModal.findOne(
        {
          betId: BetId,
          $or: [{ settle: true }, { cancel: true }],
        },
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
      // Only return wallet field in projection
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: inData } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotUUSlotModal.findOneAndUpdate(
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
      "UU_SLOT: Error in game provider calling ae96 get game result api:",
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

router.post("/api/uuslot/Rollback", async (req, res) => {
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

    if (OperatorId !== uuSlotOperatorID) {
      return res.status(200).json({
        Status: 900405,
        Description: "Operator ID Error",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const signature = generateSignature(
      "Rollback",
      BetId,
      RequestDateTime,
      uuSlotOperatorID,
      uuSlotSecret,
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

    const [currentUser, existingBet, existingTransaction] = await Promise.all([
      // Only get fields we need
      User.findOne(
        { username: PlayerId },
        { wallet: 1, _id: 1, username: 1 }
      ).lean(),

      // Just check for existence
      SlotUUSlotModal.findOne({ betId: BetId, bet: true }, { _id: 1 }).lean(),

      // Just check for existence
      SlotUUSlotModal.findOne(
        {
          betId: BetId,
          $or: [{ settle: true }, { cancel: true }],
        },
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
      // Only return wallet field
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: inData } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotUUSlotModal.findOneAndUpdate(
        { betId: BetId },
        { $set: { cancel: true } },
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
      "UU_SLOT: Error in game provider calling ae96 get rollback api:",
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

router.post("/api/uuslot/CashBonus", async (req, res) => {
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

    if (OperatorId !== uuSlotOperatorID) {
      return res.status(200).json({
        Status: 900405,
        Description: "Operator ID Error",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const signature = generateSignature(
      "CashBonus",
      TranId,
      RequestDateTime,
      uuSlotOperatorID,
      uuSlotSecret,
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

    const [currentUser, existingTrans] = await Promise.all([
      // Only get fields we need
      User.findOne(
        { username: PlayerId },
        { wallet: 1, _id: 1, username: 1 }
      ).lean(),

      // Just check existence
      SlotUUSlotModal.findOne({ tranId: TranId }, { _id: 1 }).lean(),
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
      // Only return wallet field
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: inData } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotUUSlotModal.create({
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
      "UU_SLOT: Error in game provider calling ae96 get cashbonus api:",
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

router.post("/api/uuslot/Jackpot", async (req, res) => {
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

    if (OperatorId !== uuSlotOperatorID) {
      return res.status(200).json({
        Status: 900405,
        Description: "Operator ID Error",
        ResponseDateTime: RequestDateTime,
        OldBalance: 0,
        NewBalance: 0,
      });
    }

    const signature = generateSignature(
      "Jackpot",
      TranId,
      RequestDateTime,
      uuSlotOperatorID,
      uuSlotSecret,
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

    const [currentUser, existingTrans] = await Promise.all([
      // Only get fields we need
      User.findOne(
        { username: PlayerId },
        { wallet: 1, _id: 1, username: 1 }
      ).lean(),

      // Just check existence
      SlotUUSlotModal.findOne({ tranId: TranId }, { _id: 1 }).lean(),
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
      // Only return wallet field
      User.findByIdAndUpdate(
        currentUser._id,
        { $inc: { wallet: inData } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),

      SlotUUSlotModal.create({
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
      "UU_SLOT: Error in game provider calling ae96 get cashbonus api:",
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

router.post("/api/uuslot/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotUUSlotModal.find({
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
        gamename: "UU SLOT",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("UU_SLOT: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "UU SLOT: Failed to fetch win/loss report",
        zh: "UU SLOT: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/uuslot/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotUUSlotModal.find({
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
          gamename: "UU SLOT",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("UU_SLOT: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "UU SLOT: Failed to fetch win/loss report",
          zh: "UU SLOT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/uuslot/:userId/gamedata",
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

          if (slotGames["UU SLOT"]) {
            totalTurnover += slotGames["UU SLOT"].turnover || 0;
            totalWinLoss += slotGames["UU SLOT"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "UU SLOT",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("UU_SLOT: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "UU SLOT: Failed to fetch win/loss report",
          zh: "UU SLOT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/uuslot/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotUUSlotModal.find({
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
          gamename: "UU SLOT",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("UU SLOT: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "UU SLOT: Failed to fetch win/loss report",
          zh: "UU SLOT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/uuslot/kioskreport",
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

          if (liveCasino["UU SLOT"]) {
            totalTurnover += Number(liveCasino["UU SLOT"].turnover || 0);
            totalWinLoss += Number(liveCasino["UU SLOT"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "UU SLOT",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("UU SLOT: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "UU SLOT: Failed to fetch win/loss report",
          zh: "UU SLOT: 获取盈亏报告失败",
        },
      });
    }
  }
);
module.exports = router;
