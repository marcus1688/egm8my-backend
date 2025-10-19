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
const SlotKiss918H5Modal = require("../../models/slot_kiss918.model");
const { v4: uuidv4 } = require("uuid");
const GameKiss918DataModal = require("../../models/slot_kiss918Database.model");

require("dotenv").config();

const kissh5AgentId = "918oc7h5";
const webURL = "https://www.oc7.me/";
const kissh5APIURL = "http://api.918kiss.ltd:9991/";
const kissLaunchGameURLLobby =
  "https://h5lobby.918kiss.ltd/apph5/gameIndex/myLobby/index.html";
const kissLaunchGameURL = "https://001.new9k.com/h5/";
const kissh5Secret = process.env.KISS_SECRET;
const kissh5Auth = process.env.KISS_AUTH;

function generateSignature(authcode, userName, time, secretKey) {
  const stringToHash =
    `${authcode}${userName}${time}${secretKey}`.toLowerCase();

  const signature = crypto
    .createHash("md5")
    .update(stringToHash)
    .digest("hex")
    .toUpperCase();

  return signature;
}

function generateTransactionId(prefix = "") {
  const uuid = uuidv4().replace(/-/g, "").substring(0, 16);
  return prefix ? `${prefix}${uuid}` : uuid;
}

// function generateAesEncode(bodyJson, aesKey, md5Key) {
//   try {
//     // Check if all required parameters are provided
//     if (!bodyJson || !aesKey || !md5Key) {
//       console.error("Missing parameters for AES-ENCODE generation:", {
//         bodyJsonProvided: !!bodyJson,
//         aesKeyProvided: !!aesKey,
//         md5KeyProvided: !!md5Key,
//       });
//       return null;
//     }

//     // Convert body to string if it's an object
//     const bodyStr =
//       typeof bodyJson === "object" ? JSON.stringify(bodyJson) : bodyJson;

//     // Step 1: AES ECB encryption of the body JSON
//     const cipher = crypto.createCipheriv(
//       "aes-128-ecb",
//       Buffer.from(aesKey),
//       null
//     );
//     let encrypted = cipher.update(bodyStr, "utf8", "base64");
//     encrypted += cipher.final("base64");

//     // Step 2: Concatenate with MD5 key
//     const concatenated = encrypted + md5Key;

//     // Step 3: Calculate MD5 hash and convert to lowercase
//     const md5Hash = crypto
//       .createHash("md5")
//       .update(concatenated)
//       .digest("hex")
//       .toLowerCase();

//     return md5Hash;
//   } catch (error) {
//     console.error("Error generating AES-ENCODE:", error);
//     return null;
//   }
// }

function generateAesEncode(bodyJson, aesKey, md5Key) {
  try {
    // Check if all required parameters are provided
    if (!bodyJson || !aesKey || !md5Key) {
      console.error("Missing parameters for AES-ENCODE generation:", {
        bodyJsonProvided: !!bodyJson,
        aesKeyProvided: !!aesKey,
        md5KeyProvided: !!md5Key,
      });
      return null;
    }

    // Convert body to string if it's an object
    const bodyStr =
      typeof bodyJson === "object" ? JSON.stringify(bodyJson) : bodyJson;

    // Step 1: AES ECB encryption of the body JSON
    const cipher = crypto.createCipheriv(
      "aes-128-ecb",
      Buffer.from(aesKey),
      null
    );
    let encrypted = cipher.update(bodyStr, "utf8", "base64");
    encrypted += cipher.final("base64");

    // Step 2: Concatenate with MD5 key
    const concatenated = encrypted + md5Key;

    // Step 3: Calculate MD5 hash and convert to lowercase
    const md5Hash = crypto
      .createHash("md5")
      .update(concatenated)
      .digest("hex")
      .toLowerCase();

    return md5Hash;
  } catch (error) {
    console.error("Error generating AES-ENCODE:", error);
    return null;
  }
}

// Function to verify incoming AES-ENCODE
// function verifyAesEncode(bodyJson, receivedAesEncode, aesKey, md5Key) {
//   // If any required parameter is missing, validation fails
//   if (!bodyJson || !receivedAesEncode || !aesKey || !md5Key) {
//     console.log("Missing parameters for AES-ENCODE verification");
//     return false;
//   }

//   try {
//     const calculatedAesEncode = generateAesEncode(bodyJson, aesKey, md5Key);

//     return calculatedAesEncode === receivedAesEncode;
//   } catch (error) {
//     console.error("Error verifying AES-ENCODE:", error);
//     return false;
//   }
// }

function verifyAesEncode(bodyJson, receivedAesEncode, aesKey, md5Key) {
  try {
    // Skip verification if no AES-ENCODE was provided
    if (!receivedAesEncode) {
      console.log("No AES-ENCODE provided for verification");
      return true;
    }

    // Check if all required parameters are provided
    if (!bodyJson || !aesKey || !md5Key) {
      console.error("Missing parameters for AES-ENCODE verification:", {
        bodyJsonProvided: !!bodyJson,
        aesKeyProvided: !!aesKey,
        md5KeyProvided: !!md5Key,
      });
      return false;
    }

    // Convert body to string if it's an object
    const bodyStr =
      typeof bodyJson === "object" ? JSON.stringify(bodyJson) : bodyJson;

    // Step 1: AES ECB encryption of the body JSON
    const cipher = crypto.createCipheriv(
      "aes-128-ecb",
      Buffer.from(aesKey),
      null
    );
    let encrypted = cipher.update(bodyStr, "utf8", "base64");
    encrypted += cipher.final("base64");

    // Step 2: Concatenate with MD5 key
    const concatenated = encrypted + md5Key;

    // Step 3: Calculate MD5 hash and convert to lowercase
    const calculatedAesEncode = crypto
      .createHash("md5")
      .update(concatenated)
      .digest("hex")
      .toLowerCase();

    return calculatedAesEncode === receivedAesEncode;
  } catch (error) {
    console.error("Error verifying AES-ENCODE:", error);
    return false;
  }
}

const generatePassword = () => {
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

function providerBalanceFormat(num) {
  const roundedNum = Math.round(num * 100) / 100;

  return Math.floor(roundedNum * 10000);
}

function ourBalanceFormat(num) {
  // Convert by dividing by 10000 then round to 2 decimal places
  return Math.round((num / 10000) * 100) / 100;
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

router.post("/api/kiss918/getgamelist", async (req, res) => {
  try {
    // Fetch all games from the database (or add filters as needed)
    const games = await GameKiss918DataModal.find({}).sort({
      hot: -1, // Sort by hot field (true values first)
      createdAt: 1, // Then sort by creation date (newest first)
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
    }));

    return res.status(200).json({
      success: true,
      gamelist: reformattedGamelist,
    });
  } catch (error) {
    console.log("Kiss918 error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "Kiss918: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "Kiss918: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "Kiss918: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

async function registerKissUser(user) {
  try {
    const randomUserTime = moment().valueOf();
    const randomUserSignature = generateSignature(
      kissh5Auth,
      kissh5AgentId,
      randomUserTime,
      kissh5Secret
    );

    const randomUsernameResponse = await axios.get(
      `${kissh5APIURL}ashx/account/account.ashx`,
      {
        params: {
          action: "RandomUserName",
          userName: kissh5AgentId,
          time: randomUserTime,
          authcode: kissh5Auth,
          sign: randomUserSignature,
        },
      }
    );

    if (randomUsernameResponse.data.success !== true) {
      return {
        success: false,
        error: randomUsernameResponse.data.msg,
      };
    }

    const generatedCustomerUsername = randomUsernameResponse.data.account;

    const registerUserTime = moment().valueOf();

    const registerSign = generateSignature(
      kissh5Auth,
      generatedCustomerUsername,
      registerUserTime,
      kissh5Secret
    );

    const registerPassword = generatePassword();

    const registerResponse = await axios.get(
      `${kissh5APIURL}ashx/account/account.ashx?action=addUser`,
      {
        params: {
          action: "addUser",
          agent: kissh5AgentId,
          PassWd: registerPassword,
          userName: generatedCustomerUsername,
          Name: user.username,
          Tel: user.phonenumber,
          Memo: "",
          UserType: "1", // For regular users
          time: registerUserTime,
          authcode: kissh5Auth,
          sign: registerSign,
          pwdtype: "1",
        },
      }
    );

    if (registerResponse.data.success !== true) {
      return {
        success: false,
        error: registerResponse.data.msg,
      };
    }
    return {
      success: true,
      data: registerResponse.data,
      kissusername: generatedCustomerUsername,
      kisspassword: registerPassword,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// Route to launch IA session
router.post("/api/kiss918/launchGame", authenticateToken, async (req, res) => {
  try {
    const { gameLang, gameCode } = req.body;
    const userId = req.user.userId;
    let user = await User.findById(userId);
    // Validate required fields
    if (user.gameLock.kiss918h5.lock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your game access has been locked. Please contact customer support for further assistance.",
          zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
          ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
        },
      });
    }

    if (!user.kiss918GameID || !user.kiss918GamePW) {
      const registerData = await registerKissUser(user);

      if (!registerData.success) {
        console.log(registerData);
        console.log(
          `KISS918 error in registering account ${registerData.error}`
        );
        return res.status(200).json({
          success: false,
          message: {
            en: "KISS918: Game launch failed. Please try again or contact customer service for assistance.",
            zh: "KISS918: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "KISS918: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }

      user = await User.findOneAndUpdate(
        { username: user.username },
        {
          $set: {
            kiss918GameID: registerData.kissusername,
            kiss918GamePW: registerData.kisspassword,
          },
        },
        { new: true }
      );
    }

    let lang = "en-US";

    if (gameLang === "en") {
      lang = "en-US";
    } else if (gameLang === "zh") {
      lang = "zh-CN";
    } else if (gameLang === "ms") {
      lang = "ms-MY";
    }

    const MAX_RETRIES = 3;
    let launchGameResponse = null;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const time = moment().valueOf();
        const launchGameSign = generateSignature(
          kissh5Auth,
          user.kiss918GameID,
          time,
          kissh5Secret
        );

        launchGameResponse = await axios.get(`${kissh5APIURL}ashx/launchH5`, {
          params: {
            userName: user.kiss918GameID,
            gamePlatformID: "MYAPH5RL",
            gameID: gameCode,
            officialUrl: webURL,
            lang,
            time,
            authcode: kissh5Auth,
            sign: launchGameSign,
          },
        });

        // Check if launch was successful
        if (launchGameResponse.data.success === true) {
          break; // Success! Exit the retry loop
        } else {
          // Launch failed
          lastError = launchGameResponse.data;

          // If this isn't the last attempt, wait before retrying
          if (attempt < MAX_RETRIES) {
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
          }
        }
      } catch (apiError) {
        lastError = { msg: apiError.message, code: -1, success: false };

        // If this isn't the last attempt, wait before retrying
        if (attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
        }
      }
    }

    if (launchGameResponse.data.success !== true) {
      console.log("KISS918 error in launching game", launchGameResponse.data);
      return res.status(200).json({
        success: false,
        message: {
          en: "KISS918: Game launch failed. Please try again or contact customer service for assistance.",
          zh: "KISS918: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "KISS918: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }

    await GameWalletLogAttempt(
      user.username,
      "Transfer In",
      "Seamless",
      roundToTwoDecimals(user.wallet),
      "918KISSH5"
    );

    return res.status(200).json({
      success: true,
      gameLobby: launchGameResponse.data.url,
      message: {
        en: "Game launched successfully.",
        zh: "游戏启动成功。",
        ms: "Permainan berjaya dimulakan.",
      },
    });
  } catch (error) {
    console.log("KISS918 error in launching game", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "KISS918: Game launch failed. Please try again or customer service for assistance.",
        zh: "KISS918: 游戏启动失败，请重试或联系客服以获得帮助。",
        ms: "KISS918: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/api/kiss918/launchGameWlobby",
  authenticateToken,
  async (req, res) => {
    try {
      const { gameLang } = req.body;
      const userId = req.user.userId;
      let user = await User.findById(userId);
      // Validate required fields
      if (user.gameLock.kiss918h5.lock) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Your game access has been locked. Please contact customer support for further assistance.",
            zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
            ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
          },
        });
      }

      if (!user.kiss918GameID || !user.kiss918GamePW) {
        const registerData = await registerKissUser(user);

        if (!registerData.success) {
          console.log(registerData);
          console.log(
            `KISS918 error in registering account ${registerData.error}`
          );
          return res.status(200).json({
            success: false,
            message: {
              en: "KISS918: Game launch failed. Please try again or contact customer service for assistance.",
              zh: "KISS918: 游戏启动失败，请重试或联系客服以获得帮助。",
              ms: "KISS918: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            },
          });
        }

        user = await User.findOneAndUpdate(
          { username: user.username },
          {
            $set: {
              kiss918GameID: registerData.kissusername,
              kiss918GamePW: registerData.kisspassword,
            },
          },
          { new: true }
        );
      }

      let lang = "en-US";

      if (gameLang === "en") {
        lang = "en-US";
      } else if (gameLang === "zh") {
        lang = "zh-CN";
      } else if (gameLang === "ms") {
        lang = "ms-MY";
      }
      const time = moment().valueOf();

      const launchGameSign = generateSignature(
        kissh5Auth,
        user.kiss918GameID,
        time,
        kissh5Secret
      );

      const launchGameResponse = await axios.get(
        `${kissh5APIURL}ashx/launchH5Lobby`,
        {
          params: {
            userName: user.kiss918GameID,
            time,
            authcode: kissh5Auth,
            sign: launchGameSign,
          },
        }
      );

      if (launchGameResponse.data.success !== true) {
        console.log("KISS918 error in launching game", launchGameResponse.data);
        return res.status(200).json({
          success: false,
          message: {
            en: "KISS918: Game launch failed. Please try again or contact customer service for assistance.",
            zh: "KISS918: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "KISS918: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "KISS918H5"
      );

      const gameURL = `${kissLaunchGameURLLobby}?lang=${lang}&officialUrl=${webURL}&token=${launchGameResponse.data.lobbyToken}`;

      return res.status(200).json({
        success: true,
        gameLobby: gameURL,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
        },
      });
    } catch (error) {
      console.log("KISS918 error in launching game", error.message);
      return res.status(200).json({
        success: false,
        message: {
          en: "KISS918: Game launch failed. Please try again or customer service for assistance.",
          zh: "KISS918: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "KISS918: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post("/api/918kissh5//getBalances", async (req, res) => {
  try {
    const receivedAesEncode = req.headers["aes-encode"];

    const { agent, account } = req.body[0];

    if (!agent || !account) {
      const errorResponse = [{ errorCode: 5 }];

      // Generate verification code for response
      const responseAesEncode = generateAesEncode(
        errorResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);

      return res.status(200).json(errorResponse);
    }

    if (agent !== kissh5AgentId) {
      console.log("Invalid agent ID:", agent);
      const errorResponse = [{ errorCode: 6 }];

      // Generate verification code for response
      const responseAesEncode = generateAesEncode(
        errorResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);

      return res.status(200).json(errorResponse);
    }

    if (
      !verifyAesEncode(req.body, receivedAesEncode, kissh5Auth, kissh5Secret)
    ) {
      const errorResponse = [{ errorCode: 7 }];
      const responseAesEncode = generateAesEncode(
        errorResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);
      return res.status(200).json(errorResponse);
    }

    const currentUser = await User.findOne(
      { kiss918GameID: account },
      { wallet: 1 }
    ).lean();

    if (!currentUser) {
      console.log("User not found:", account);
      const errorResponse = [{ errorCode: 8 }];

      // Generate verification code for response
      const responseAesEncode = generateAesEncode(
        errorResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);

      return res.status(200).json(errorResponse);
    }

    const successResponse = [
      {
        agent: kissh5AgentId,
        account: account,
        balance: providerBalanceFormat(currentUser.wallet),
      },
    ];

    const responseAesEncode = generateAesEncode(
      successResponse,
      kissh5Auth,
      kissh5Secret
    );
    res.setHeader("AES-ENCODE", responseAesEncode);

    return res.status(200).json(successResponse);
  } catch (error) {
    console.error(
      "918KISSH5: Error in game provider calling ae96 get balance api:",
      error.message
    );

    const errorResponse = [{ errorCode: 99 }];

    const responseAesEncode = generateAesEncode(
      errorResponse,
      kissh5Auth,
      kissh5Secret
    );
    res.setHeader("AES-ENCODE", responseAesEncode);

    return res.status(200).json(errorResponse);
  }
});

router.post("/api/918kissh5//bets", async (req, res) => {
  try {
    const receivedAesEncode = req.headers["aes-encode"];

    const { agent, account, coin, externalTransNo, betId } = req.body[0];

    if (!agent || !account) {
      console.log("Missing required parameters:", { agent, account });
      const errorResponse = [{ errorCode: 5 }];

      // Generate verification code for response
      const responseAesEncode = generateAesEncode(
        errorResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);

      return res.status(200).json(errorResponse);
    }

    if (agent !== kissh5AgentId) {
      console.log("Invalid agent ID:", agent);
      const errorResponse = [{ errorCode: 6 }];

      // Generate verification code for response
      const responseAesEncode = generateAesEncode(
        errorResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);

      return res.status(200).json(errorResponse);
    }

    if (
      !verifyAesEncode(req.body, receivedAesEncode, kissh5Auth, kissh5Secret)
    ) {
      const errorResponse = [{ errorCode: 7 }];
      const responseAesEncode = generateAesEncode(
        errorResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);
      return res.status(200).json(errorResponse);
    }

    const [currentUser, existingBet] = await Promise.all([
      User.findOne(
        { kiss918GameID: account },
        { wallet: 1, username: 1, "gameLock.kiss918h5.lock": 1 }
      ),
      SlotKiss918H5Modal.findOne(
        { transId: externalTransNo, bet: true },
        { transactionID: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      console.log("User not found:", account);
      const errorResponse = [{ errorCode: 8 }];

      // Generate verification code for response
      const responseAesEncode = generateAesEncode(
        errorResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);

      return res.status(200).json(errorResponse);
    }

    if (currentUser.gameLock?.kiss918h5?.lock) {
      const errorResponse = [{ errorCode: 9 }];
      const responseAesEncode = generateAesEncode(
        errorResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);
      return res.status(200).json(errorResponse);
    }

    if (existingBet) {
      const duplicateResponse = [
        {
          afterBalance: providerBalanceFormat(currentUser.wallet),
          agent: kissh5AgentId,
          beforeBalance: providerBalanceFormat(currentUser.wallet),
          coin: coin,
          externalTransNo,
          resultCode: 1,
          transactionID:
            existingBet.transactionID || generateTransactionId("BET"),
        },
      ];

      // Generate verification code for response
      const responseAesEncode = generateAesEncode(
        duplicateResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);

      return res.status(200).json(duplicateResponse);
    }

    const toUpdateAmount = ourBalanceFormat(coin || 0);

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
        wallet: { $gte: toUpdateAmount },
      },
      { $inc: { wallet: -toUpdateAmount } },
      { new: true, projection: { wallet: 1 } }
    );

    if (!updatedUserBalance) {
      console.log("Insufficient balance for user:", account);

      // Get current user balance
      const latestUser = await User.findById(currentUser._id, {
        wallet: 1,
      }).lean();

      const failedResponse = [
        {
          afterBalance: providerBalanceFormat(latestUser.wallet),
          agent: kissh5AgentId,
          beforeBalance: providerBalanceFormat(currentUser.wallet),
          coin: coin,
          externalTransNo,
          resultCode: 0, // Failed
          transactionID: generateTransactionId("BET"),
        },
      ];

      // Generate verification code for response
      const responseAesEncode = generateAesEncode(
        failedResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);

      return res.status(200).json(failedResponse);
    }

    await SlotKiss918H5Modal.create({
      username: currentUser.username,
      betId: betId,
      transId: externalTransNo,
      bet: true,
      betamount: toUpdateAmount,
    });

    const transactionID = generateTransactionId("BET");
    const successResponse = [
      {
        afterBalance: providerBalanceFormat(updatedUserBalance.wallet),
        agent: kissh5AgentId,
        beforeBalance: providerBalanceFormat(currentUser.wallet),
        coin: coin,
        externalTransNo,
        resultCode: 1, // Success
        transactionID,
      },
    ];

    const responseAesEncode = generateAesEncode(
      successResponse,
      kissh5Auth,
      kissh5Secret
    );
    res.setHeader("AES-ENCODE", responseAesEncode);

    return res.status(200).json(successResponse);
  } catch (error) {
    console.error(
      "918KISSH5: Error in game provider calling ae96 bet api:",
      error.message
    );
    const errorResponse = [{ errorCode: 99 }];
    const responseAesEncode = generateAesEncode(
      errorResponse,
      kissh5Auth,
      kissh5Secret
    );
    res.setHeader("AES-ENCODE", responseAesEncode);
    return res.status(200).json(errorResponse);
  }
});

router.post("/api/918kissh5//paids", async (req, res) => {
  try {
    const receivedAesEncode = req.headers["aes-encode"];

    const { agent, account, coin, externalTransNo, betId } = req.body[0];

    if (!agent || !account) {
      console.log("Missing required parameters");
      const errorResponse = [{ errorCode: 5 }];

      // Generate verification code for response
      const responseAesEncode = generateAesEncode(
        errorResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);

      return res.status(200).json(errorResponse);
    }

    // Validate agent ID
    if (agent !== kissh5AgentId) {
      console.log("Invalid agent ID:", agent);
      const errorResponse = [{ errorCode: 6 }];

      // Generate verification code for response
      const responseAesEncode = generateAesEncode(
        errorResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);

      return res.status(200).json(errorResponse);
    }

    if (
      !verifyAesEncode(req.body, receivedAesEncode, kissh5Auth, kissh5Secret)
    ) {
      const errorResponse = [{ errorCode: 7 }];
      const responseAesEncode = generateAesEncode(
        errorResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);
      return res.status(200).json(errorResponse);
    }

    const [currentUser, existingBet, existingTransaction] = await Promise.all([
      User.findOne({ kiss918GameID: account }, { wallet: 1 }).lean(),
      SlotKiss918H5Modal.findOne({ betId: betId, bet: true }).lean(),
      SlotKiss918H5Modal.findOne(
        {
          settletransId: externalTransNo,
          $or: [{ settle: true }, { cancel: true }],
        },
        { transactionID: 1 }
      ).lean(),
    ]);

    if (!currentUser) {
      console.log("User not found:", account);
      const errorResponse = [{ errorCode: 8 }];

      // Generate verification code for response
      const responseAesEncode = generateAesEncode(
        errorResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);

      return res.status(200).json(errorResponse);
    }

    if (!existingBet) {
      console.log("Original bet not found:", betId);
      const errorResponse = [{ errorCode: 18 }];

      // Generate verification code for response
      const responseAesEncode = generateAesEncode(
        errorResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);

      return res.status(200).json(errorResponse);
    }

    if (existingTransaction) {
      console.log("Settlement already exists:", externalTransNo);

      // Settlement already exists, return duplicate response
      const duplicateResponse = [
        {
          afterBalance: providerBalanceFormat(currentUser.wallet),
          agent: kissh5AgentId,
          beforeBalance: providerBalanceFormat(currentUser.wallet),
          coin: coin,
          externalTransNo,
          resultCode: 1,
          transactionID:
            existingSettlement.transactionID || generateTransactionId("SETTLE"),
        },
      ];

      // Generate verification code for response
      const responseAesEncode = generateAesEncode(
        duplicateResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);

      return res.status(200).json(duplicateResponse);
    }

    const toUpdateAmount = ourBalanceFormat(coin || 0);

    const walletUpdate = User.findOneAndUpdate(
      { _id: currentUser._id },
      { $inc: { wallet: toUpdateAmount } },
      { new: true, projection: { wallet: 1 } }
    );

    const betUpdate = SlotKiss918H5Modal.findOneAndUpdate(
      { betId: betId },
      {
        $set: {
          settle: true,
          settleamount: toUpdateAmount,
          settletransId: externalTransNo,
        },
      },
      { upsert: true }
    );

    const [updatedUserBalance] = await Promise.all([walletUpdate, betUpdate]);

    const successResponse = [
      {
        afterBalance: providerBalanceFormat(updatedUserBalance.wallet),
        agent: kissh5AgentId,
        beforeBalance: providerBalanceFormat(currentUser.wallet),
        coin: coin,
        externalTransNo,
        resultCode: 1, // Success
        transactionID: generateTransactionId("SETTLE"),
      },
    ];

    const responseAesEncode = generateAesEncode(
      successResponse,
      kissh5Auth,
      kissh5Secret
    );
    res.setHeader("AES-ENCODE", responseAesEncode);

    return res.status(200).json(successResponse);
  } catch (error) {
    console.error(
      "918KISSH5: Error in game provider calling ae96 paids api:",
      error.message
    );

    const errorResponse = [{ errorCode: 99 }];

    const responseAesEncode = generateAesEncode(
      errorResponse,
      kissh5Auth,
      kissh5Secret
    );
    res.setHeader("AES-ENCODE", responseAesEncode);

    return res.status(200).json(errorResponse);
  }
});

router.post("/api/918kissh5//refunds", async (req, res) => {
  try {
    const receivedAesEncode = req.headers["aes-encode"];

    const { agent, account, gid, externalTransNo } = req.body[0];

    if (!agent || !account) {
      console.log("Missing required parameters");
      const errorResponse = [{ errorCode: 5 }];

      // Generate verification code for response
      const responseAesEncode = generateAesEncode(
        errorResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);

      return res.status(200).json(errorResponse);
    }

    // Validate agent ID
    if (agent !== kissh5AgentId) {
      console.log("Invalid agent ID:", agent);
      const errorResponse = [{ errorCode: 6 }];

      // Generate verification code for response
      const responseAesEncode = generateAesEncode(
        errorResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);

      return res.status(200).json(errorResponse);
    }

    const isValidRequest = verifyAesEncode(
      req.body,
      receivedAesEncode,
      kissh5Auth,
      kissh5Secret
    );

    if (!isValidRequest) {
      console.log("Invalid AES-ENCODE");
      const errorResponse = [{ errorCode: 7 }];

      // Generate verification code for response
      const responseAesEncode = generateAesEncode(
        errorResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);

      return res.status(200).json(errorResponse);
    }

    const currentUser = await User.findOne({ kiss918GameID: account });

    if (!currentUser) {
      console.log("User not found:", account);
      const errorResponse = [{ errorCode: 8 }];

      // Generate verification code for response
      const responseAesEncode = generateAesEncode(
        errorResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);

      return res.status(200).json(errorResponse);
    }

    const existingBet = await SlotKiss918H5Modal.findOne({
      betId: externalTransNo,
      bet: true,
    });

    if (!existingBet) {
      console.log("Transaction not found:", externalTransNo);

      const notFoundResponse = [
        {
          afterBalance: providerBalanceFormat(currentUser.wallet),
          agent: kissh5AgentId,
          beforeBalance: providerBalanceFormat(currentUser.wallet),
          refundAmount: providerBalanceFormat(0),
          externalTransNo,
          resultCode: 234007, // No such transaction ID
          transactionID: generateTransactionId("CANCEL"),
        },
      ];

      // Generate verification code for response
      const responseAesEncode = generateAesEncode(
        notFoundResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);

      return res.status(200).json(notFoundResponse);
    }

    const existingTransaction = await SlotKiss918H5Modal.findOne({
      betId: externalTransNo,
      $or: [{ settle: true }, { cancel: true }],
    });

    if (existingTransaction) {
      console.log("Transaction already processed:", externalTransNo);

      const alreadyProcessedResponse = [
        {
          afterBalance: providerBalanceFormat(currentUser.wallet),
          agent: kissh5AgentId,
          beforeBalance: providerBalanceFormat(currentUser.wallet),
          refundAmount: providerBalanceFormat(existingBet.betamount),
          externalTransNo,
          resultCode: 230002, // Transaction already cancelled
          transactionID: generateTransactionId("CANCEL"),
        },
      ];

      // Generate verification code for response
      const responseAesEncode = generateAesEncode(
        alreadyProcessedResponse,
        kissh5Auth,
        kissh5Secret
      );
      res.setHeader("AES-ENCODE", responseAesEncode);

      return res.status(200).json(alreadyProcessedResponse);
    }

    const updatedUserBalance = await User.findOneAndUpdate(
      {
        _id: currentUser._id,
      },
      { $inc: { wallet: roundToTwoDecimals(existingBet.betamount || 0) } },
      { new: true }
    );

    await SlotKiss918H5Modal.findOneAndUpdate(
      { betId: externalTransNo },
      {
        $set: {
          cancel: true,
        },
      },
      { upsert: true, new: true }
    );

    const successResponse = [
      {
        afterBalance: providerBalanceFormat(updatedUserBalance.wallet),
        agent: kissh5AgentId,
        beforeBalance: providerBalanceFormat(currentUser.wallet),
        refundAmount: providerBalanceFormat(existingBet.betamount),
        externalTransNo,
        resultCode: 1, // Success
        transactionID: generateTransactionId("CANCEL"),
      },
    ];

    // Generate verification code for response
    const responseAesEncode = generateAesEncode(
      successResponse,
      kissh5Auth,
      kissh5Secret
    );
    res.setHeader("AES-ENCODE", responseAesEncode);

    return res.status(200).json(successResponse);
  } catch (error) {
    console.error(
      "918KISSH5: Error in game provider calling ae96 paids api:",
      error.message
    );

    const errorResponse = [{ errorCode: 99 }];

    // Generate verification code for response

    const responseAesEncode = generateAesEncode(
      errorResponse,
      kissh5Auth,
      kissh5Secret
    );
    res.setHeader("AES-ENCODE", responseAesEncode);

    return res.status(200).json(errorResponse);
  }
});

router.post("/api/918kissh5/getturnoverforrebate", async (req, res) => {
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

    const records = await SlotKiss918H5Modal.find({
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
        gamename: "918KISSH5",
        gamecategory: "Slot Games",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log("918KISSH5: Failed to fetch win/loss report:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "918KISSH5: Failed to fetch win/loss report",
        zh: "918KISSH5: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/918kissh5/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotKiss918H5Modal.find({
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
          gamename: "918KISSH5",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("918KISSH5: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "918KISSH5: Failed to fetch win/loss report",
          zh: "918KISSH5: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/918kissh5/:userId/gamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await GameDataLog.find({
        username: user.username.toLowerCase(),
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

          if (slotGames["918KISSH5"]) {
            totalTurnover += slotGames["918KISSH5"].turnover || 0;
            totalWinLoss += slotGames["918KISSH5"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "918KISSH5",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log("918KISSH5: Failed to fetch win/loss report:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "918KISSH5: Failed to fetch win/loss report",
          zh: "918KISSH5: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/918kissh5/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotKiss918H5Modal.find({
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
          gamename: "918KISSH5",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("918KISSH5: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "918KISSH5: Failed to fetch win/loss report",
          zh: "918KISSH5: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/918kissh5/kioskreport",
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

          if (liveCasino["918KISSH5"]) {
            totalTurnover += Number(liveCasino["918KISSH5"].turnover || 0);
            totalWinLoss += Number(liveCasino["918KISSH5"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "918KISSH5",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("918KISSH5: Failed to fetch win/loss report:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "918KISSH5: Failed to fetch win/loss report",
          zh: "918KISSH5: 获取盈亏报告失败",
        },
      });
    }
  }
);
module.exports = router;
