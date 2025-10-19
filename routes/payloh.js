const express = require("express");
const { adminUser } = require("../models/adminuser.model");
const paylohModal = require("../models/payloh.model");
const router = express.Router();
const axios = require("axios");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { authenticateToken } = require("../auth/auth");
const crypto = require("crypto");
const moment = require("moment");
const { User } = require("../models/users.model");
require("dotenv").config();

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function roundToTwoDecimalsString(num) {
  const amount = Number(num);
  return amount.toFixed(2);
}

function generateHash(apiKey, refNo, amount, secretKey) {
  const rawString = `${apiKey}${refNo}${amount}${secretKey}`;
  return crypto.createHash("sha512").update(rawString).digest("hex");
}

function generateUniqueRefNo() {
  const randomBytes = crypto.randomBytes(9).toString("hex");

  const refNo = `PL${randomBytes}`.toUpperCase();

  return refNo.slice(0, 18);
}

const paylohAPIURL = "https://portal.payloh.com";
const paylohAPI = process.env.PAYLOH_API;
const paylohSecret = process.env.PAYLOH_SECRET;

// Admin Update Popup Data
router.post(
  "/api/payloh/getpaymentlink",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }

      const { trfAmt } = req.body;
      if (!trfAmt) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Transfer amount is required",
            zh: "请输入转账金额",
          },
        });
      }
      let refno;
      let isUnique = false;

      while (!isUnique) {
        refno = generateUniqueRefNo();
        const existing = await paylohModal.findOne({ ourRefNo: refno });
        if (!existing) {
          isUnique = true;
        }
      }

      const hashSignature = generateHash(
        paylohAPI,
        refno,
        roundToTwoDecimalsString(trfAmt),
        paylohSecret
      );

      const formData = new URLSearchParams();
      formData.append("api_key", paylohAPI);
      formData.append("secret_key", paylohSecret);
      formData.append("ref_no", refno);
      formData.append("amount", roundToTwoDecimalsString(trfAmt));
      formData.append("payment_method_id", "1");
      formData.append("currency", "AUD");
      formData.append("hash", hashSignature);

      formData.append("customer_name", user.username);
      formData.append("email", user.email);

      const response = await axios.post(`${paylohAPIURL}/api/PayV2`, formData, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        maxBodyLength: Infinity,
      });

      if (response.data.status) {
        await paylohModal.create({
          ourRefNo: refno,
          amount: roundToTwoDecimals(trfAmt),
          username: user.username,
          paymentGatewayRefNo: "-",
          status: "Pending",
          platformCharge: "-",
          remark: "-",
        });

        return res.status(200).json({
          success: true,
          message: {
            en: "Payment link generated successfully",
            zh: "支付链接生成成功",
          },
          url: response.data.data.payment_link,
        });
      } else {
        return res.status(200).json({
          success: false,
          message: {
            en: "Failed to generate payment link",
            zh: "生成支付链接失败",
          },
        });
      }
    } catch (error) {
      console.error("Error details:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });

      res.status(500).json({
        success: false,
        message: {
          en: "Failed to generate payment link. Please try again later",
          zh: "生成支付链接失败，请稍后重试",
        },
      });
    }
  }
);

// function validateCallbackParams(params) {
//   console.log("Received params:", JSON.stringify(params, null, 2));

//   const requiredParams = [
//     "status_id",
//     "amount",
//     "ref_no",
//     "transaction_reference",
//   ];

//   if (!params) {
//     throw new Error("No parameters received");
//   }

//   const missingParams = requiredParams.filter((param) => {
//     const value = params[param];
//     return value === undefined || value === null || value === "";
//   });

//   if (missingParams.length > 0) {
//     throw new Error(`Missing required parameters: ${missingParams.join(", ")}`);
//   }

//   const statusId = String(params.status_id);
//   console.log("Status ID after conversion:", statusId, typeof statusId);

//   if (!["0", "1", "2", "3"].includes(statusId)) {
//     throw new Error(`Invalid status_id: ${statusId}`);
//   }

//   const amount = Number(params.amount);
//   if (isNaN(amount)) {
//     throw new Error(`Invalid amount format: ${params.amount}`);
//   }
//   if (amount <= 0) {
//     throw new Error(`Amount must be greater than 0: ${amount}`);
//   }

//   return true;
// }

// function getStatusDescription(statusId) {
//   const id = String(statusId);
//   const statusMap = {
//     0: "Pending",
//     1: "Success",
//     2: "Failed",
//     3: "Timedout",
//   };
//   return statusMap[id] || "Unknown";
// }

// router.post("/api/payloh", async (req, res) => {
//   try {
//     validateCallbackParams(req.body);

//     const {
//       status_id,
//       currency,
//       amount,
//       ref_no,
//       platform_charge,
//       transaction_reference,
//     } = req.body;

//     const currentStatus = getStatusDescription(status_id);
//     const existingTrx = await paylohModal.findOne({ ourRefNo: ref_no });

//     // Handle case where no transaction is found
//     if (!existingTrx) {
//       await paylohModal.create({
//         ourRefNo: ref_no,
//         paymentGatewayRefNo: transaction_reference,
//         amount: Number(amount),
//         status: "Pending",
//         platformCharge: platform_charge,
//         remark: `No transaction found with reference: ${ref_no}. Created from callback.`,
//       });

//       return res.status(200).json({
//         status: true,
//         message: "Created new transaction record from callback",
//       });
//     }

//     // Check for amount mismatch
//     const amountDiff = Math.abs(existingTrx.amount - Number(amount));
//     if (amountDiff > 0.01) {
//       // Update existing record with mismatch information
//       await paylohModal.findOneAndUpdate(
//         { ourRefNo: ref_no },
//         {
//           $set: {
//             paymentGatewayRefNo: transaction_reference,
//             status: "Pending",
//             platformCharge: platform_charge,
//             remark: `Amount mismatch. Expected: ${existingTrx.amount}, Received: ${amount}`,
//           },
//         }
//       );

//       return res.status(200).json({
//         status: true,
//         message: "Updated transaction with amount mismatch",
//       });
//     }

//     // Normal flow for matching transaction
//     if (status_id === "1" && existingTrx.status === "Success") {
//       return res.status(200).json({
//         status: true,
//         message: "Transaction already processed successfully",
//       });
//     }

//     // Update transaction status
//     await paylohModal.findOneAndUpdate(
//       { ourRefNo: ref_no },
//       {
//         $set: {
//           paymentGatewayRefNo: transaction_reference,
//           status: currentStatus,
//           platformCharge: platform_charge,
//           remark: `Transaction ${currentStatus} at ${moment()
//             .utc()
//             .format("YYYY-MM-DD HH:mm:ss")} UTC`,
//         },
//       }
//     );

//     // Update user wallet only for successful transactions with matching amounts
//     if (status_id === "1" && existingTrx.status !== "Success") {
//       const updatedUser = await User.findOneAndUpdate(
//         { username: existingTrx.username },
//         { $inc: { wallet: roundToTwoDecimals(amount) } },
//         {
//           new: true,
//           runValidators: true,
//         }
//       );

//       if (!updatedUser) {
//         console.error(
//           `Failed to update wallet for user: ${existingTrx.username}`,
//           {
//             ref_no,
//             amount,
//             timestamp: moment().utc().format(),
//           }
//         );
//       }
//     }

//     return res.status(200).json({
//       status: true,
//       message: `Transaction ${currentStatus} processed successfully`,
//     });
//   } catch (error) {
//     console.error("Payment callback processing error:", {
//       error: error.message,
//       body: req.body,
//       timestamp: moment().utc().format(),
//       stack: error.stack,
//     });

//     return res.status(500).json({
//       status: false,
//       message: "Callback received with errors",
//       error: error.message,
//     });
//   }
// });

router.get(
  "/admin/api/paylohdata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      let dateFilter = {};

      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }

      const paylohData = await paylohModal
        .find(dateFilter)
        .sort({ createdAt: -1 })
        .lean();
      res.status(200).json({
        success: true,
        message: "Payloh retrieved successfully",
        data: paylohData,
      });
    } catch (error) {
      console.error("Error retrieving user bonus payloh:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve bonus payloh",
        error: error.message,
      });
    }
  }
);

module.exports = router;
