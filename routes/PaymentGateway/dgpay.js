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
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const Decimal = require("decimal.js");
const querystring = require("querystring");
const dgPayModal = require("../../models/paymentgateway_dgpay");
const UserWalletLog = require("../../models/userwalletlog.model");
const Bonus = require("../../models/bonus.model");
const Promotion = require("../../models/promotion.model");
const Deposit = require("../../models/deposit.model");
const { checkAndUpdateVIPLevel } = require("../users");
const { submitLuckySpin } = require("../deposit");
const {
  checkGW99Balance,
  checkAlipayBalance,
  checkLionKingBalance,
} = require("../../services/game");

require("dotenv").config();

const dgpayMerchantCode = "dgpay_1153";
const dgpaySecret = process.env.DGPAY_SECRET;
const webURL = "https://www.oc7.me/";
const drpayAPIURL = "https://dgpayapi.pwpgbo.com";
const callbackUrl = "https://api.oc7.me/api/dgpay/receivedcalled168";

function calculateProcessingTime(createdAtDate) {
  const approvedAt = new Date();
  const createdAt = new Date(createdAtDate);
  let timeDiff = approvedAt.getTime() - createdAt.getTime();

  let seconds = Math.floor((timeDiff / 1000) % 60);
  let minutes = Math.floor((timeDiff / (1000 * 60)) % 60);
  let hours = Math.floor((timeDiff / (1000 * 60 * 60)) % 24);

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateSecurityToken(fields) {
  const concatenatedString = fields.join("");
  const hash = crypto
    .createHash("md5")
    .update(concatenatedString, "utf8")
    .digest("hex");
  return hash;
}

function generateTransactionId(prefix = "") {
  const uuid = uuidv4().replace(/-/g, "").substring(0, 16);
  return prefix ? `${prefix}${uuid}` : uuid;
}

router.post(
  "/api/dgpay/getpaymentlink",
  authenticateToken,
  async (req, res) => {
    try {
      const { trfAmt, bankCode, promotionId } = req.body;

      const userId = req.user?.userId;

      // Validate required parameters early to avoid unnecessary database queries
      if (!trfAmt || !bankCode) {
        return res.status(200).json({
          success: false,
          message: {
            en: !trfAmt
              ? "Transfer amount is required"
              : "Bank Code is required",
            zh: !trfAmt ? "请输入转账金额" : "请输入银行代码",
            ms: !trfAmt
              ? "Jumlah pemindahan diperlukan"
              : "Kod Bank diperlukan",
          },
        });
      }

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

      if (promotionId) {
        const promotion = await Promotion.findById(promotionId);
        if (!promotion) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Promotion not found",
              zh: "找不到该促销活动",
              ms: "Promosi tidak dijumpai",
            },
          });
        }
      }

      let refno;
      let attempts = 0;
      const maxAttempts = 5;

      do {
        refno = generateTransactionId("deposit");

        const existing = await dgPayModal.findOne({ ourRefNo: refno }).lean();
        if (!existing) break;
        attempts++;
      } while (attempts < maxAttempts);

      if (attempts >= maxAttempts) {
        return res.status(200).json({
          success: false,
          message: {
            en: "System busy, please try again later",
            zh: "系统繁忙，请稍后再试",
            ms: "Sistem sibuk, sila cuba sebentar lagi",
          },
        });
      }

      // Pre-define constants
      const currency = "MYR";
      const opCode = dgpayMerchantCode;
      const reqDateTime = moment.utc().format("YYYY-MM-DD HH:mm:ss");
      const providerId = "5";
      const providerType = "10";
      const orderId = refno;

      // Build security token
      const securityToken = generateSecurityToken([
        orderId,
        providerId,
        providerType,
        currency,
        trfAmt,
        reqDateTime,
        opCode,
        dgpaySecret,
      ]);

      const dataPayload = {
        fromBankCode: bankCode,
        redirectUrl: webURL,
      };

      // Prepare request payload
      const postData = querystring.stringify({
        orderId,
        providerId,
        providerType,
        currency,
        amount: trfAmt,
        callbackUrl,
        data: JSON.stringify(dataPayload),
        opCode,
        reqDateTime,
        securityToken,
      });

      const response = await axios.post(
        `${drpayAPIURL}/ajax/api/deposit`,
        postData,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const responseData = response.data;

      // Log only important information
      if (responseData.code !== "0") {
        console.log(`DGPay API Error: ${JSON.stringify(responseData)}`);

        return res.status(200).json({
          success: false,
          message: {
            en: "Failed to generate payment link",
            zh: "生成支付链接失败",
            ms: "Gagal menjana pautan pembayaran",
          },
        });
      }

      await Promise.all([
        // Create DGPay record
        dgPayModal.create({
          ourRefNo: refno,
          username: user.username,
          amount: trfAmt,
          bankCode,
          status: "Pending",
          platformCharge: responseData.agentFee || 0,
          remark: "-",
          promotionId: promotionId,
        }),
      ]);

      return res.status(200).json({
        success: true,
        message: {
          en: "Payment link generated successfully",
          zh: "支付链接生成成功",
          ms: "Pautan pembayaran berjaya dijana",
        },
        url: responseData.paymentUrl,
      });
    } catch (error) {
      console.error(
        `Error in DGPay API - User: ${req.user?.userId}, Amount: ${req.body?.trfAmt}:`,
        error.response?.data || error.message
      );

      return res.status(200).json({
        success: false,
        message: {
          en: "Failed to generate payment link",
          zh: "生成支付链接失败",
          ms: "Gagal menjana pautan pembayaran",
        },
      });
    }
  }
);

function getOrderIdBeforeAt(orderId) {
  if (!orderId) return "";
  return orderId.split("@")[0];
}

router.post("/api/dgpay/receivedcalled168", async (req, res) => {
  try {
    const { orderId, amount, status } = req.body;

    if (!orderId || amount === undefined || status === undefined) {
      console.log("Missing required parameters:", { orderId, amount, status });
      return res.status(200).json({
        code: "100",
        description: "Missing required parameters",
      });
    }

    const statusMapping = {
      "-20": "Expired",
      "-10": "Reject",
      0: "Pending",
      5: "Pending Verification",
      10: "Processing",
      20: "Success",
    };

    const statusCode = String(status);
    const statusText = statusMapping[statusCode] || "Unknown";

    const cleanOrderId = getOrderIdBeforeAt(orderId);

    const existingTrx = await dgPayModal.findOne({ ourRefNo: cleanOrderId });

    if (!existingTrx) {
      console.log(`Transaction not found: ${orderId}, creating record`);
      await dgPayModal.create({
        username: "N/A",
        ourRefNo: cleanOrderId,
        amount: Number(amount),
        status: statusText,
        remark: `No transaction found with reference: ${orderId}. Created from callback.`,
        createdAt: new Date(),
      });

      return res.status(200).json({
        code: "0",
        description: "Created new transaction record",
      });
    }

    if (status === "20" && existingTrx.status === "Success") {
      console.log("Transaction already processed successfully, skipping");
      return res.status(200).json({
        status: true,
        message: "Transaction already processed successfully",
      });
    }

    if (status === "20" && existingTrx.status !== "Success") {
      const user = await User.findOne({ username: existingTrx.username });

      const setObject = {
        lastdepositdate: new Date(),
        ...(user &&
          !user.firstDepositDate && {
            firstDepositDate: existingTrx.createdAt,
          }),
      };

      const updatedUser = await User.findOneAndUpdate(
        { _id: user._id },
        {
          $inc: {
            wallet: roundToTwoDecimals(Number(amount)),
            totaldeposit: roundToTwoDecimals(Number(amount)),
          },
          $set: setObject,
        },
        { new: true }
      );

      const isNewDeposit =
        !updatedUser.firstDepositDate ||
        updatedUser.firstDepositDate.getTime() ===
          existingTrx.createdAt.getTime();

      const [newDeposit, updatedTrx, newWalletLog] = await Promise.all([
        Deposit.create({
          userId: user._id,
          username: user.username || "unknown",
          fullname: user.fullname || "unknown",
          bankname: "DGPAY",
          ownername: "Payment Gateway",
          transfernumber: uuidv4(),
          walletType: "Main",
          transactionType: "deposit",
          method: "auto",
          processBy: "admin",
          amount: Number(amount),
          remark: "-",
          transactionId: cleanOrderId,
          status: "approved",
          processtime: "00:00:00",
          newDeposit: isNewDeposit,
        }),

        // Update transaction status
        dgPayModal.findByIdAndUpdate(
          existingTrx._id,
          { $set: { status: statusText } },
          { new: true }
        ),

        UserWalletLog.create({
          userId: user._id,
          transactionid: cleanOrderId,
          transactiontime: new Date(),
          transactiontype: "deposit",
          amount: Number(amount),
          status: "approved",
        }),
      ]);

      global.sendNotificationToUser(
        user._id,
        {
          en: `Deposit MYR ${roundToTwoDecimals(Number(amount))} approved`,
          ms: `Deposit MYR ${roundToTwoDecimals(
            Number(amount)
          )} telah diluluskan`,
          zh: `存款 MYR ${roundToTwoDecimals(Number(amount))} 已批准`,
        },
        {
          en: "Deposit Approved",
          ms: "Deposit Diluluskan",
          zh: "存款已批准",
        }
      );

      setImmediate(() => {
        try {
          checkAndUpdateVIPLevel(user._id).catch((error) => {
            console.error(
              `Error checking/updating VIP level for user ${user._id}:`,
              error
            );
          });
        } catch (vipError) {
          console.error(
            `Error in VIP level check for user ${user._id}:`,
            vipError
          );
        }
      });

      if (
        parseFloat(amount) === 30 &&
        updatedUser.luckySpinAmount > 0 &&
        updatedUser.luckySpinClaim === false
      ) {
        submitLuckySpin(
          updatedUser._id,
          newDeposit._id,
          "pending",
          "manual",
          "PENDING",
          "manual"
        ).catch((error) => {
          console.error("Error submitting lucky spin:", error);
        });
      }

      // Handle promotion if applicable
      if (existingTrx.promotionId) {
        try {
          const promotion = await Promotion.findById(existingTrx.promotionId);

          if (!promotion) {
            console.log("DGPAY, couldn't find promotion");
            // Don't return here, continue processing the rest of the callback
          } else {
            // Calculate bonus amount
            let bonusAmount = 0;
            if (promotion.claimtype === "Percentage") {
              bonusAmount =
                (Number(amount) * parseFloat(promotion.bonuspercentage)) / 100;
              if (promotion.maxbonus > 0 && bonusAmount > promotion.maxbonus) {
                bonusAmount = promotion.maxbonus;
              }
            } else if (promotion.claimtype === "Exact") {
              bonusAmount = parseFloat(promotion.bonusexact);
              if (promotion.maxbonus > 0 && bonusAmount > promotion.maxbonus) {
                bonusAmount = promotion.maxbonus;
              }
            }

            if (bonusAmount > 0) {
              const [GW99Result, AlipayResult, LionKingResult] =
                await Promise.all([
                  checkGW99Balance(user.username).catch((error) => ({
                    success: false,
                    error: error.message || "Connection failed",
                    balance: 0,
                  })),
                  checkAlipayBalance(user.username).catch((error) => ({
                    success: false,
                    error: error.message || "Connection failed",
                    balance: 0,
                  })),
                  checkLionKingBalance(user.username).catch((error) => ({
                    success: false,
                    error: error.message || "Connection failed",
                    balance: 0,
                  })),
                ]);

              const balanceFetchErrors = {};

              let totalGameBalance = 0;

              if (GW99Result.success && GW99Result.balance != null) {
                totalGameBalance += Number(GW99Result.balance) || 0;
              } else {
                console.error("GW99 balance check error:", GW99Result);
                balanceFetchErrors.gw99 = {
                  error: GW99Result.error || "Failed to fetch balance",
                  // timestamp: new Date().toISOString(),
                };
              }

              if (AlipayResult.success && AlipayResult.balance != null) {
                totalGameBalance += Number(AlipayResult.balance) || 0;
              } else {
                console.error("Alipay balance check error:", AlipayResult);
                balanceFetchErrors.alipay = {
                  error: AlipayResult.error || "Failed to fetch balance",
                  // timestamp: new Date().toISOString(),
                };
              }

              if (LionKingResult.success && LionKingResult.balance != null) {
                totalGameBalance += Number(LionKingResult.balance) || 0;
              } else {
                console.error("LionKing balance check error:", LionKingResult);
                balanceFetchErrors.lionking = {
                  error: LionKingResult.error || "Failed to fetch balance",
                  // timestamp: new Date().toISOString(),
                };
              }

              const totalWalletAmount =
                Number(user.wallet || 0) + totalGameBalance;

              // Create bonus transaction
              const bonusTransactionId = uuidv4();

              // Process bonus in parallel
              await Promise.all([
                Bonus.create({
                  transactionId: bonusTransactionId,
                  userId: user._id,
                  username: user.username,
                  fullname: user.fullname,
                  transactionType: "bonus",
                  processBy: "admin",
                  amount: bonusAmount,
                  walletamount: totalWalletAmount,
                  status: "pending",
                  method: "manual",
                  remark: "-",
                  promotionname: promotion.maintitle,
                  promotionnameEN: promotion.maintitleEN,
                  promotionId: existingTrx.promotionId,
                  depositId: newDeposit._id,
                  duplicateIP: user.duplicateIP,
                }),

                UserWalletLog.create({
                  userId: user._id,
                  transactionid: bonusTransactionId,
                  transactiontime: new Date(),
                  transactiontype: "bonus",
                  amount: Number(bonusAmount),
                  status: "pending",
                  promotionnameCN: promotion.maintitle,
                  promotionnameEN: promotion.maintitleEN,
                }),
              ]);
            }
          }
        } catch (promotionError) {
          console.error("Error processing promotion:", promotionError);
          // Continue processing to ensure callback success
        }
      }
    } else if (status !== "20") {
      await dgPayModal.findByIdAndUpdate(existingTrx._id, {
        $set: { status: statusText },
      });
    }

    return res.status(200).json({
      code: "0",
      description: "Success",
    });
  } catch (error) {
    console.error("Payment callback processing error:", {
      error: error.message,
      body: req.body,
      timestamp: moment().utc().format(),
      stack: error.stack,
    });
    return res.status(200).json({
      code: "100",
      description: "Error",
    });
  }
});

router.get("/admin/api/dgpaydata", authenticateAdminToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let dateFilter = {};

    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: moment(new Date(startDate)).utc().toDate(),
        $lte: moment(new Date(endDate)).utc().toDate(),
      };
    }

    const dgData = await dgPayModal
      .find(dateFilter)
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({
      success: true,
      message: "DGPay retrieved successfully",
      data: dgData,
    });
  } catch (error) {
    console.error("Error retrieving user bonus DGPay:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve bonus DGPay",
      error: error.message,
    });
  }
});
module.exports = router;
