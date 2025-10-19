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
const bodyParser = require("body-parser");
const LiveCT855Modal = require("../../models/live_ct855.model");

require("dotenv").config();

const webURL = "https://www.oc7.me/";
const ctAPIURL = "http://api.ct-888.com";
const ctSecret = process.env.CT855_SECRET;
const ctAgent = "CT0106AO09";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateRandomString(length = 16) {
  return crypto.randomBytes(length).toString("hex");
}

function generateSign(agentName, apiKey) {
  return crypto
    .createHash("md5")
    .update(agentName + apiKey)
    .digest("hex");
}

const parseBody = (req) => {
  return new Promise((resolve, reject) => {
    let bodyData = "";

    // Set encoding to utf8 (this ignores Content-Encoding header)
    req.setEncoding("utf8");

    req.on("data", (chunk) => {
      bodyData += chunk;
    });

    req.on("end", () => {
      try {
        const parsedBody = JSON.parse(bodyData);
        resolve(parsedBody);
      } catch (error) {
        console.error("JSON parsing error in CT855:", error);
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", (error) => {
      console.error("Request error in CT855:", error);
      reject(error);
    });
  });
};

router.post("/api/ct855/user/getBalance/:agentId", async (req, res) => {
  try {
    const parsedBody = await parseBody(req);

    const agentID = req.params.agentId;
    const { token, member } = parsedBody;

    // Validation
    if (!token || !member?.username || agentID !== ctAgent) {
      return res.status(200).json({
        codeId: !token || !member?.username ? 1 : 118,
        token: !token ? "" : token,
      });
    }

    // Verify token
    const generatedSign = generateSign(ctAgent, ctSecret);
    if (generatedSign !== token) {
      return res.status(200).json({
        codeId: 2,
        token,
      });
    }

    // Find user
    const username = member.username.toLowerCase();
    const user = await User.findOne(
      { userServerId: username },
      { wallet: 1 }
    ).lean();

    if (!user) {
      return res.status(200).json({
        codeId: 102,
        token,
      });
    }

    return res.status(200).json({
      codeId: 0,
      token,
      member: {
        username,
        balance: roundToTwoDecimals(user.wallet),
      },
    });
  } catch (err) {
    console.error("❌ CT855 GetBalance error:", err.message);
    return res.status(200).json({
      codeId: 501,
      token: "",
    });
  }
});
// router.post("/api/ct855/user/getBalance/:agentId", async (req, res) => {
//   let bodyData = "";
//   console.log("hi");
//   req.setEncoding("utf8");

//   req.on("data", (chunk) => {
//     bodyData += chunk;
//   });

//   req.on("end", async () => {
//     try {
//       const parsedBody = JSON.parse(bodyData);
//       const agentID = req.params.agentId;
//       const { token, member } = parsedBody;

//       if (!token || !member?.username || agentID !== ctAgent) {
//         return res.status(200).json({
//           codeId: !token || !member?.username ? 1 : 118,
//           token: !token ? "" : token,
//         });
//       }

//       const generatedSign = generateSign(ctAgent, ctSecret);

//       if (generatedSign !== token) {
//         return res.status(200).json({
//           codeId: 2,
//           token,
//         });
//       }
//       const username = member.username.toLowerCase();
//       const user = await User.findOne(
//         { userServerId: username },
//         { wallet: 1 }
//       ).lean();

//       if (!user) {
//         return res.status(200).json({
//           codeId: 102,
//           token,
//         });
//       }

//       return res.status(200).json({
//         codeId: 0,
//         token,
//         member: {
//           username,
//           balance: roundToTwoDecimals(user.wallet),
//         },
//       });
//     } catch (err) {
//       console.error("CT855 GetBalance error:", err.message);
//       return res.status(200).json({
//         codeId: 501,
//         token: "",
//       });
//     }
//   });
// });

// router.post("/api/ct855/account/transfer/:agentId", async (req, res) => {
//   let bodyData = "";

//   req.setEncoding("utf8");

//   req.on("data", (chunk) => {
//     bodyData += chunk;
//   });

//   req.on("end", async () => {
//     try {
//       const parsedBody = JSON.parse(bodyData);
//       const agentID = req.params.agentId;
//       const { token, ticketId, data, member } = parsedBody;

//       if (
//         !token ||
//         !member?.username ||
//         !ticketId ||
//         !data ||
//         member.amount === undefined ||
//         agentID !== ctAgent
//       ) {
//         return res.status(200).json({
//           codeId:
//             !token ||
//             !member?.username ||
//             !ticketId ||
//             !data ||
//             member.amount === undefined
//               ? 1
//               : 118,
//           token: !token ? "" : token,
//         });
//       }

//       const generatedSign = generateSign(ctAgent, ctSecret);

//       if (generatedSign !== token) {
//         return res.status(200).json({
//           codeId: 2,
//           token: token,
//         });
//       }

//       const username = member.username.toLowerCase();
//       const updateAmount = roundToTwoDecimals(member.amount);

//       const [user, existingTransaction] = await Promise.all([
//         User.findOne(
//           { userServerId: username },
//           { username: 1, wallet: 1, userServerId: 1 }
//         ).lean(),
//         LiveCT855Modal.findOne(
//           {
//             $or: [{ betId: data }, { settleId: data }],
//           },
//           { _id: 1 }
//         ).lean(),
//       ]);

//       if (!user) {
//         return res.status(200).json({
//           codeId: 102,
//           token,
//         });
//       }

//       if (existingTransaction) {
//         return res.status(200).json({
//           codeId: 0,
//           token,
//           data,
//           member: {
//             username,
//             amount: updateAmount,
//             balance: roundToTwoDecimals(user.wallet),
//           },
//         });
//       }

//       let updatedUserBalance;

//       if (updateAmount < 0) {
//         updatedUserBalance = await User.findOneAndUpdate(
//           {
//             username: user.username,
//             wallet: { $gte: roundToTwoDecimals(updateAmount) },
//           },
//           { $inc: { wallet: roundToTwoDecimals(updateAmount) } },
//           { new: true, projection: { wallet: 1 } }
//         ).lean();

//         if (!updatedUserBalance) {
//           return res.status(200).json({
//             codeId: 120,
//             token,
//           });
//         }

//         await LiveCT855Modal.create({
//           username: user.username,
//           userServerId: user.userServerId,
//           betId: data,
//           tranId: ticketId,
//           bet: true,
//           betamount: roundToTwoDecimals(Math.abs(updateAmount)),
//         });
//       } else {
//         const [updatedUserBalance, _] = await Promise.all([
//           User.findOneAndUpdate(
//             { username: user.username },
//             { $inc: { wallet: roundToTwoDecimals(updateAmount) } },
//             { new: true, projection: { wallet: 1 } }
//           ).lean(),

//           LiveCT855Modal.findOneAndUpdate(
//             { username: user.username, tranId: ticketId },
//             {
//               $set: {
//                 settle: true,
//                 settleamount: roundToTwoDecimals(updateAmount),
//                 settleId: data,
//               },
//             },
//             { upsert: true }
//           ),
//         ]);
//       }

//       return res.status(200).json({
//         codeId: 0,
//         token,
//         member: {
//           username,
//           amount: updateAmount,
//           balance: roundToTwoDecimals(user.wallet),
//         },
//       });
//     } catch (err) {
//       console.error("CT855 GetBalance error:", err.message);
//       return res.status(200).json({
//         codeId: 501,
//         token: "",
//       });
//     }
//   });
// });

// router.post("/api/ct855/account/checkTransfer/:agentId", async (req, res) => {
//   let bodyData = "";

//   req.setEncoding("utf8");

//   req.on("data", (chunk) => {
//     bodyData += chunk;
//   });

//   req.on("end", async () => {
//     try {
//       const parsedBody = JSON.parse(bodyData);
//       const agentID = req.params.agentId;
//       const { token, data } = parsedBody;

//       if (!token || !data || agentID !== ctAgent) {
//         return res.status(200).json({
//           codeId: !token || !data ? 1 : 118,
//           token: token || "",
//         });
//       }

//       const generatedSign = generateSign(ctAgent, ctSecret);

//       if (generatedSign !== token) {
//         return res.status(200).json({
//           codeId: 2,
//           token,
//         });
//       }

//       const existingTransaction = await LiveCT855Modal.findOne(
//         { $or: [{ betId: data }, { settleId: data }] },
//         { _id: 1 }
//       ).lean();

//       if (!existingTransaction) {
//         return res.status(200).json({
//           codeId: 98,
//           token,
//         });
//       }

//       return res.status(200).json({
//         codeId: 0,
//         token,
//       });
//     } catch (err) {
//       console.error("CT855 check transfer error:", err.message);
//       return res.status(200).json({
//         codeId: 501,
//         token: "",
//       });
//     }
//   });
// });

// router.post("/api/ct855/account/inform/:agentId", async (req, res) => {
//   let bodyData = "";

//   req.setEncoding("utf8");

//   req.on("data", (chunk) => {
//     bodyData += chunk;
//   });

//   req.on("end", async () => {
//     try {
//       const parsedBody = JSON.parse(bodyData);
//       const agentID = req.params.agentId;
//       const { token, ticketId, data, member } = parsedBody;

//       if (
//         !token ||
//         !member?.username ||
//         !ticketId ||
//         !data ||
//         member.amount === undefined ||
//         agentID !== ctAgent
//       ) {
//         return res.status(200).json({
//           codeId:
//             !token ||
//             !member?.username ||
//             !ticketId ||
//             !data ||
//             member.amount === undefined
//               ? 1
//               : 118,
//           token: token || "",
//         });
//       }

//       const generatedSign = generateSign(ctAgent, ctSecret);

//       if (generatedSign !== token) {
//         return res.status(200).json({
//           codeId: 2,
//           token,
//         });
//       }

//       const username = member.username.toLowerCase();
//       const transferAmount = roundToTwoDecimals(member.amount);

//       const [user, existingRollback, existingTransaction] = await Promise.all([
//         User.findOne(
//           { userServerId: username },
//           { wallet: 1, username: 1, userServerId: 1 }
//         ).lean(),
//         LiveCT855Modal.findOne(
//           {
//             $or: [{ betId: data }, { settleId: data }, { cancelId: data }],
//             cancel: true,
//           },
//           { _id: 1 }
//         ).lean(),
//         LiveCT855Modal.findOne({ tranId: ticketId }, { _id: 1 }).lean(),
//       ]);

//       if (!user) {
//         return res.status(200).json({
//           codeId: 102,
//           token,
//         });
//       }

//       if (existingRollback) {
//         return res.status(200).json({
//           codeId: 0,
//           token,
//           data,
//           member: {
//             username,
//             balance: roundToTwoDecimals(user.wallet),
//           },
//         });
//       }

//       let updatedUserBalance;

//       if (transferAmount < 0) {
//         if (existingTransaction) {
//           updatedUserBalance = await User.findOneAndUpdate(
//             {
//               username: user.username,
//               wallet: { $gte: roundToTwoDecimals(transferAmount) },
//             },
//             { $inc: { wallet: roundToTwoDecimals(transferAmount) } },
//             { new: true, projection: { wallet: 1 } }
//           ).lean();

//           if (!updatedUserBalance) {
//             return res.status(200).json({
//               codeId: 120,
//               token,
//             });
//           }

//           await LiveCT855Modal.findOneAndUpdate(
//             { username: user.username, tranId: ticketId },
//             {
//               $set: {
//                 cancel: true,
//                 cancelId: data,
//               },
//             },
//             { upsert: true }
//           );
//         } else {
//           return res.status(200).json({
//             codeId: 0,
//             token,
//             data,
//             member: {
//               username,
//               balance: roundToTwoDecimals(user.wallet),
//             },
//           });
//         }
//       } else {
//         // This is a deposit rollback
//         if (!existingTransaction) {
//           const [updatedBalance, _] = await Promise.all([
//             User.findOneAndUpdate(
//               { username: user.username },
//               { $inc: { wallet: roundToTwoDecimals(transferAmount) } },
//               { new: true, projection: { wallet: 1 } }
//             ).lean(),

//             new LiveCT855Modal({
//               username: user.username,
//               userServerId: user.userServerId,
//               cancelId: data,
//               tranId: ticketId,
//               cancel: true,
//               settleamount: transferAmount,
//             }).save(),
//           ]);

//           updatedUserBalance = updatedBalance;
//         } else {
//           return res.status(200).json({
//             codeId: 0,
//             token,
//             data,
//             member: {
//               username,
//               balance: roundToTwoDecimals(user.wallet),
//             },
//           });
//         }
//       }

//       return res.status(200).json({
//         codeId: 0,
//         token,
//         data,
//         member: {
//           username,
//           balance: roundToTwoDecimals(
//             updatedUserBalance ? updatedUserBalance.wallet : user.wallet
//           ),
//         },
//       });
//     } catch (err) {
//       console.error("CT855 Rollback parse error:", err.message);
//       return res.status(200).json({
//         codeId: 501,
//         token: "",
//       });
//     }
//   });
// });

// router.post("/api/ct855/account/order/:agentId", async (req, res) => {
//   let bodyData = "";

//   req.setEncoding("utf8");

//   req.on("data", (chunk) => {
//     bodyData += chunk;
//   });

//   req.on("end", async () => {
//     try {
//       const parsedBody = JSON.parse(bodyData);
//       const agentID = req.params.agentId;
//       const { token, ticketId } = parsedBody;

//       if (!token || !ticketId || agentID !== ctAgent) {
//         return res.status(200).json({
//           codeId: !token || !ticketId ? 1 : 118,
//           token: token || "",
//         });
//       }

//       const generatedSign = generateSign(ctAgent, ctSecret);

//       if (generatedSign !== token) {
//         return res.status(200).json({
//           codeId: 2,
//           token,
//         });
//       }

//       const transactions = await LiveCT855Modal.find(
//         { tranId: ticketId },
//         {
//           username: 1,
//           tranId: 1,
//           betId: 1,
//           settleId: 1,
//           cancelId: 1,
//           bet: 1,
//           settle: 1,
//           cancel: 1,
//           betamount: 1,
//           settleamount: 1,
//           userServerId: 1,
//         }
//       ).lean();

//       let formattedTransactions = [];

//       transactions.forEach((transaction) => {
//         if (transaction.bet === true) {
//           formattedTransactions.push({
//             username: transaction.userServerId.toUpperCase(),
//             ticketId: transaction.tranId,
//             serial: transaction.betId,
//             amount: -transaction.betamount,
//           });
//         }

//         // If settle flag is true, add settle transaction
//         if (transaction.settle === true) {
//           formattedTransactions.push({
//             username: transaction.userServerId.toUpperCase(),
//             ticketId: transaction.tranId,
//             serial: transaction.settleId,
//             amount: transaction.settleamount,
//           });
//         }

//         // If cancel flag is true, add cancel transaction
//         if (transaction.cancel === true) {
//           const cancelAmount =
//             transaction.settleamount !== undefined &&
//             transaction.settleamount !== null
//               ? transaction.settleamount
//               : -transaction.betamount;

//           formattedTransactions.push({
//             username: transaction.userServerId.toUpperCase(),
//             ticketId: transaction.tranId,
//             serial: transaction.cancelId,
//             amount: cancelAmount,
//           });
//         }
//       });

//       return res.status(200).json({
//         codeId: 0,
//         token,
//         ticketId,
//         list: formattedTransactions,
//       });
//     } catch (err) {
//       console.error("CT855 Order check error:", err.message);
//       return res.status(200).json({
//         codeId: 501,
//         token: "",
//         ticketId: "",
//         list: [],
//       });
//     }
//   });
// });

// router.post("/api/ct855/account/unsettle/:agentId", async (req, res) => {
//   let bodyData = "";

//   req.setEncoding("utf8");

//   req.on("data", (chunk) => {
//     bodyData += chunk;
//   });

//   req.on("end", async () => {
//     try {
//       const parsedBody = JSON.parse(bodyData);
//       const agentID = req.params.agentId;
//       const { token } = parsedBody;

//       if (!token || agentID !== ctAgent) {
//         return res.status(200).json({
//           codeId: !token ? 1 : 118,
//           token: token || "",
//         });
//       }

//       const generatedSign = generateSign(ctAgent, ctSecret);

//       if (generatedSign !== token) {
//         return res.status(200).json({
//           codeId: 2,
//           token: token,
//         });
//       }

//       const cutoffTime = moment().utc().subtract(10, "minutes").toDate();

//       const unsettledBets = await LiveCT855Modal.find(
//         {
//           bet: true,
//           settle: false,
//           cancel: false,
//           createdAt: { $lt: cutoffTime },
//         },
//         { username: 1, betamount: 1, tranId: 1, betId: 1, userServerId: 1 }
//       ).lean();

//       // Format the response
//       let formattedTransactions = [];

//       unsettledBets.forEach((transaction) => {
//         formattedTransactions.push({
//           username: transaction.userServerId.toUpperCase(),
//           amount: -transaction.betamount,
//           ticketId: transaction.tranId,
//           serial: transaction.betId,
//         });
//       });

//       return res.status(200).json({
//         codeId: 0,
//         token,
//         list: formattedTransactions,
//       });
//     } catch (err) {
//       console.error("CT855 Unsettle records error:", err.message);
//       return res.status(200).json({
//         codeId: 501,
//         token: "",
//         list: [],
//       });
//     }
//   });
// });

// TRANSFER ROUTE
router.post("/api/ct855/account/transfer/:agentId", async (req, res) => {
  try {
    const parsedBody = await parseBody(req);

    const agentID = req.params.agentId;
    const { token, ticketId, data, member } = parsedBody;

    if (
      !token ||
      !member?.username ||
      !ticketId ||
      !data ||
      member.amount === undefined ||
      agentID !== ctAgent
    ) {
      return res.status(200).json({
        codeId:
          !token ||
          !member?.username ||
          !ticketId ||
          !data ||
          member.amount === undefined
            ? 1
            : 118,
        token: !token ? "" : token,
      });
    }

    const generatedSign = generateSign(ctAgent, ctSecret);
    if (generatedSign !== token) {
      return res.status(200).json({
        codeId: 2,
        token: token,
      });
    }

    const username = member.username.toLowerCase();
    const updateAmount = roundToTwoDecimals(member.amount);

    const [user, existingTransaction] = await Promise.all([
      User.findOne(
        { userServerId: username },
        { username: 1, wallet: 1, userServerId: 1 }
      ).lean(),
      LiveCT855Modal.findOne(
        {
          $or: [{ betId: data }, { settleId: data }],
        },
        { _id: 1 }
      ).lean(),
    ]);

    if (!user) {
      return res.status(200).json({
        codeId: 102,
        token,
      });
    }

    if (existingTransaction) {
      return res.status(200).json({
        codeId: 0,
        token,
        data,
        member: {
          username,
          amount: updateAmount,
          balance: roundToTwoDecimals(user.wallet),
        },
      });
    }

    let updatedUserBalance;

    if (updateAmount < 0) {
      updatedUserBalance = await User.findOneAndUpdate(
        {
          username: user.username,
          wallet: { $gte: roundToTwoDecimals(updateAmount) },
        },
        { $inc: { wallet: roundToTwoDecimals(updateAmount || 0) } },
        { new: true, projection: { wallet: 1 } }
      ).lean();

      if (!updatedUserBalance) {
        return res.status(200).json({
          codeId: 120,
          token,
        });
      }

      await LiveCT855Modal.create({
        username: user.username,
        userServerId: user.userServerId,
        betId: data,
        tranId: ticketId,
        bet: true,
        betamount: roundToTwoDecimals(Math.abs(updateAmount)),
      });
    } else {
      const [updatedBalance, _] = await Promise.all([
        User.findOneAndUpdate(
          { username: user.username },
          { $inc: { wallet: roundToTwoDecimals(updateAmount || 0) } },
          { new: true, projection: { wallet: 1 } }
        ).lean(),

        (async () => {
          await LiveCT855Modal.updateOne(
            { username: user.username, tranId: ticketId },
            {
              $set: {
                settle: true,
                settleId: data,
                settleamount: roundToTwoDecimals(updateAmount),
              },
            }
          );

          await LiveCT855Modal.updateMany(
            {
              username: user.username,
              tranId: ticketId,
              settleamount: { $ne: roundToTwoDecimals(updateAmount) },
            },
            {
              $set: {
                settle: true,
                settleId: data,
                settleamount: 0,
              },
            }
          );
        })(),
      ]);
      updatedUserBalance = updatedBalance;
    }

    return res.status(200).json({
      codeId: 0,
      token,
      member: {
        username,
        amount: updateAmount,
        balance: roundToTwoDecimals(user.wallet),
      },
    });
  } catch (err) {
    console.error("❌ CT855 Transfer error:", err.message);
    return res.status(200).json({
      codeId: 501,
      token: "",
    });
  }
});

// CHECK TRANSFER ROUTE
router.post("/api/ct855/account/checkTransfer/:agentId", async (req, res) => {
  try {
    const parsedBody = await parseBody(req);

    const agentID = req.params.agentId;
    const { token, data } = parsedBody;

    if (!token || !data || agentID !== ctAgent) {
      return res.status(200).json({
        codeId: !token || !data ? 1 : 118,
        token: token || "",
      });
    }

    const generatedSign = generateSign(ctAgent, ctSecret);
    if (generatedSign !== token) {
      return res.status(200).json({
        codeId: 2,
        token,
      });
    }

    const existingTransaction = await LiveCT855Modal.findOne(
      { $or: [{ betId: data }, { settleId: data }] },
      { _id: 1 }
    ).lean();

    if (!existingTransaction) {
      return res.status(200).json({
        codeId: 98,
        token,
      });
    }

    return res.status(200).json({
      codeId: 0,
      token,
    });
  } catch (err) {
    console.error("❌ CT855 checkTransfer error:", err.message);
    return res.status(200).json({
      codeId: 501,
      token: "",
    });
  }
});

// INFORM (ROLLBACK) ROUTE
router.post("/api/ct855/account/inform/:agentId", async (req, res) => {
  try {
    const parsedBody = await parseBody(req);

    const agentID = req.params.agentId;
    const { token, ticketId, data, member } = parsedBody;

    if (
      !token ||
      !member?.username ||
      !ticketId ||
      !data ||
      member.amount === undefined ||
      agentID !== ctAgent
    ) {
      return res.status(200).json({
        codeId:
          !token ||
          !member?.username ||
          !ticketId ||
          !data ||
          member.amount === undefined
            ? 1
            : 118,
        token: token || "",
      });
    }

    const generatedSign = generateSign(ctAgent, ctSecret);
    if (generatedSign !== token) {
      return res.status(200).json({
        codeId: 2,
        token,
      });
    }

    const username = member.username.toLowerCase();
    const transferAmount = roundToTwoDecimals(member.amount);

    const [user, existingRollback, existingTransaction] = await Promise.all([
      User.findOne(
        { userServerId: username },
        { wallet: 1, username: 1, userServerId: 1 }
      ).lean(),
      LiveCT855Modal.findOne(
        {
          $or: [{ betId: data }, { settleId: data }, { cancelId: data }],
          cancel: true,
        },
        { _id: 1 }
      ).lean(),
      LiveCT855Modal.findOne({ tranId: ticketId }, { _id: 1 }).lean(),
    ]);

    if (!user) {
      return res.status(200).json({
        codeId: 102,
        token,
      });
    }

    if (existingRollback) {
      return res.status(200).json({
        codeId: 0,
        token,
        data,
        member: {
          username,
          balance: roundToTwoDecimals(user.wallet),
        },
      });
    }

    let updatedUserBalance;

    if (transferAmount < 0) {
      if (existingTransaction) {
        updatedUserBalance = await User.findOneAndUpdate(
          {
            username: user.username,
            wallet: { $gte: roundToTwoDecimals(transferAmount) },
          },
          { $inc: { wallet: roundToTwoDecimals(transferAmount || 0) } },
          { new: true, projection: { wallet: 1 } }
        ).lean();

        if (!updatedUserBalance) {
          return res.status(200).json({
            codeId: 120,
            token,
          });
        }

        await LiveCT855Modal.findOneAndUpdate(
          { username: user.username, tranId: ticketId },
          {
            $set: {
              cancel: true,
              cancelId: data,
            },
          },
          { upsert: true }
        );
      } else {
        return res.status(200).json({
          codeId: 0,
          token,
          data,
          member: {
            username,
            balance: roundToTwoDecimals(user.wallet),
          },
        });
      }
    } else {
      // This is a deposit rollback
      if (!existingTransaction) {
        const [updatedBalance, _] = await Promise.all([
          User.findOneAndUpdate(
            { username: user.username },
            { $inc: { wallet: roundToTwoDecimals(transferAmount || 0) } },
            { new: true, projection: { wallet: 1 } }
          ).lean(),

          new LiveCT855Modal({
            username: user.username,
            userServerId: user.userServerId,
            cancelId: data,
            tranId: ticketId,
            cancel: true,
            settleamount: transferAmount,
          }).save(),
        ]);

        updatedUserBalance = updatedBalance;
      } else {
        return res.status(200).json({
          codeId: 0,
          token,
          data,
          member: {
            username,
            balance: roundToTwoDecimals(user.wallet),
          },
        });
      }
    }

    return res.status(200).json({
      codeId: 0,
      token,
      data,
      member: {
        username,
        balance: roundToTwoDecimals(
          updatedUserBalance ? updatedUserBalance.wallet : user.wallet
        ),
      },
    });
  } catch (err) {
    console.error("❌ CT855 inform error:", err.message);
    return res.status(200).json({
      codeId: 501,
      token: "",
    });
  }
});

// ORDER ROUTE
router.post("/api/ct855/account/order/:agentId", async (req, res) => {
  try {
    const parsedBody = await parseBody(req);

    const agentID = req.params.agentId;
    const { token, ticketId } = parsedBody;

    if (!token || !ticketId || agentID !== ctAgent) {
      return res.status(200).json({
        codeId: !token || !ticketId ? 1 : 118,
        token: token || "",
      });
    }

    const generatedSign = generateSign(ctAgent, ctSecret);
    if (generatedSign !== token) {
      return res.status(200).json({
        codeId: 2,
        token,
      });
    }

    const transactions = await LiveCT855Modal.find(
      { tranId: ticketId },
      {
        username: 1,
        tranId: 1,
        betId: 1,
        settleId: 1,
        cancelId: 1,
        bet: 1,
        settle: 1,
        cancel: 1,
        betamount: 1,
        settleamount: 1,
        userServerId: 1,
      }
    ).lean();

    let formattedTransactions = [];

    transactions.forEach((transaction) => {
      if (transaction.bet === true) {
        formattedTransactions.push({
          username: transaction.userServerId.toUpperCase(),
          ticketId: transaction.tranId,
          serial: transaction.betId,
          amount: -transaction.betamount,
        });
      }

      if (transaction.settle === true) {
        formattedTransactions.push({
          username: transaction.userServerId.toUpperCase(),
          ticketId: transaction.tranId,
          serial: transaction.settleId,
          amount: transaction.settleamount,
        });
      }

      if (transaction.cancel === true) {
        const cancelAmount =
          transaction.settleamount !== undefined &&
          transaction.settleamount !== null
            ? transaction.settleamount
            : -transaction.betamount;

        formattedTransactions.push({
          username: transaction.userServerId.toUpperCase(),
          ticketId: transaction.tranId,
          serial: transaction.cancelId,
          amount: cancelAmount,
        });
      }
    });

    return res.status(200).json({
      codeId: 0,
      token,
      ticketId,
      list: formattedTransactions,
    });
  } catch (err) {
    console.error("❌ CT855 order error:", err.message);
    return res.status(200).json({
      codeId: 501,
      token: "",
      ticketId: "",
      list: [],
    });
  }
});

// UNSETTLE ROUTE
router.post("/api/ct855/account/unsettle/:agentId", async (req, res) => {
  try {
    const parsedBody = await parseBody(req);

    const agentID = req.params.agentId;
    const { token } = parsedBody;

    if (!token || agentID !== ctAgent) {
      return res.status(200).json({
        codeId: !token ? 1 : 118,
        token: token || "",
      });
    }

    const generatedSign = generateSign(ctAgent, ctSecret);
    if (generatedSign !== token) {
      return res.status(200).json({
        codeId: 2,
        token: token,
      });
    }

    const cutoffTime = moment().utc().subtract(10, "minutes").toDate();

    const unsettledBets = await LiveCT855Modal.find(
      {
        bet: true,
        settle: false,
        cancel: false,
        createdAt: { $lt: cutoffTime },
      },
      { username: 1, betamount: 1, tranId: 1, betId: 1, userServerId: 1 }
    ).lean();

    let formattedTransactions = [];

    unsettledBets.forEach((transaction) => {
      formattedTransactions.push({
        username: transaction.userServerId.toUpperCase(),
        amount: -transaction.betamount,
        ticketId: transaction.tranId,
        serial: transaction.betId,
      });
    });

    return res.status(200).json({
      codeId: 0,
      token,
      list: formattedTransactions,
    });
  } catch (err) {
    console.error("❌ CT855 unsettle error:", err.message);
    return res.status(200).json({
      codeId: 501,
      token: "",
      list: [],
    });
  }
});
module.exports = router;
