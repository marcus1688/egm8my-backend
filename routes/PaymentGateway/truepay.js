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
const { submitLuckySpin } = require("../deposit");
const truePayModal = require("../../models/paymentgateway_truepay");
const {
  checkGW99Balance,
  checkAlipayBalance,
  checkLionKingBalance,
} = require("../../services/game");

const { checkAndUpdateVIPLevel } = require("../users");
const multer = require("multer");
const upload = multer();
require("dotenv").config();

const truePayMerchantCode = "oc7my";
const truePaySecret = process.env.TRUEPAY_SECRET;
const webURL = "https://www.oc7.me/";
const truePayAPIURL = "https://api.tpm-bo.club";
const callbackUrl = "https://api.oc7.me/api/truepay/receivedcalled168";

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

function generateToken(mCode, secretKey, action, ts) {
  const raw = `${mCode}-${secretKey}-${action}-${ts}`;

  return crypto.createHash("md5").update(raw).digest("hex");
}

function generateCallbackToken(mCode, secretKey, trxid, amount, ts) {
  const str = `${mCode}-${secretKey}-${trxid}-${amount}-${ts}`;
  return crypto.createHash("md5").update(str).digest("hex");
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

router.get("/api/truepay/banks", async (req, res) => {
  try {
    const ts = Math.floor(Date.now() / 1000);
    const token = generateToken(
      truePayMerchantCode,
      truePaySecret,
      "getBankOptions",
      ts
    );

    const formData = new URLSearchParams({
      mCode: truePayMerchantCode,
      token,
      ts,
    });

    const response = await axios.post(
      `${truePayAPIURL}/a/getBankOptions`,
      formData,
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );
    console.log(response.data);
    const { status, msg, d } = response.data;

    if (status !== 0) {
      return res.status(400).json({
        success: false,
        message: msg || "Failed to fetch bank options",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Bank options retrieved",
      data: d,
    });
  } catch (error) {
    console.error("Error fetching bank options:", error.message);
    return res.status(500).json({
      success: false,
      message: "Server error fetching bank options",
    });
  }
});

router.post(
  "/api/truepay/getpaymentlink",
  authenticateToken,
  async (req, res) => {
    try {
      const { trfAmt, bankCode, promotionId } = req.body;
      const userId = req.user?.userId;

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

      const user = await User.findById(userId).select("_id username fullname");
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

        const existing = await truePayModal.findOne({ ourRefNo: refno }).lean();
        if (!existing) break;
        attempts++;
      } while (attempts < maxAttempts);

      if (attempts >= maxAttempts) {
        return res.status(200).json({
          success: false,
          message: {
            en: "System busy, please try again later",
            zh: "系统忙，请稍后再试",
            ms: "Sistem sibuk, sila cuba sebentar lagi",
          },
        });
      }

      const ts = Math.floor(Date.now() / 1000);
      const token = generateToken(
        truePayMerchantCode,
        truePaySecret,
        "getDPLink",
        ts
      );

      const formData = new URLSearchParams({
        mCode: truePayMerchantCode,
        token,
        ts,
        bCode: bankCode,
        amt: trfAmt,
        user: user.username,
        userFn: user.fullname,
        trxid: refno,
        notifyUrl: callbackUrl,
        webUrl: webURL,
      });

      const response = await axios.post(
        `${truePayAPIURL}/a/getDPLink`,
        formData,
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );

      const responseData = response.data;

      // Log only important information
      if (responseData.status !== 0) {
        console.log(`TruePay API Error: ${responseData}`);

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
        truePayModal.create({
          ourRefNo: refno,
          username: user.username,
          amount: trfAmt,
          bankCode,
          status: "Pending",
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
        url: responseData.d.url,
      });
    } catch (error) {
      console.error(
        `Error in truePay API - User: ${req.user?.userId}, Amount: ${req.body?.trfAmt}:`,
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

router.post(
  "/api/truepay/receivedcalled168",
  upload.none(),
  async (req, res) => {
    try {
      const { id, amount, status, fee, message, token, ts } = req.body;

      const generatedtoken = generateCallbackToken(
        truePayMerchantCode,
        truePaySecret,
        id,
        amount,
        ts
      );

      if (generatedtoken !== token) {
        console.log("truepay failed token", generatedtoken, token);
        return res
          .status(200)
          .type("text/plain")
          .send("Token validation failed");
      }

      const statusMapping = {
        "-1": "Reject",
        1: "Success",
      };

      const statusCode = String(status);
      const statusText = statusMapping[statusCode] || "Unknown";

      const existingTrx = await truePayModal.findOne({ ourRefNo: id });

      if (!existingTrx) {
        console.log(`Transaction not found: ${id}, creating record`);
        await truePayModal.create({
          username: "N/A",
          ourRefNo: id,
          amount: Number(amount),
          platformCharge: Number(fee),
          status: statusText,
          remark: `No transaction found with reference: ${id}. Created from callback.`,
          createdAt: new Date(),
        });

        return res.status(200).type("text/plain").send("OK");
      }

      if (status === "1" && existingTrx.status === "Success") {
        console.log("Transaction already processed successfully, skipping");
        return res.status(200).type("text/plain").send("OK");
      }
      console.log("--------");
      if (status === "1" && existingTrx.status !== "Success") {
        console.log("inside");
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
            bankname: "TruePay",
            ownername: "Payment Gateway",
            transfernumber: uuidv4(),
            walletType: "Main",
            transactionType: "deposit",
            method: "auto",
            processBy: "admin",
            amount: Number(amount),
            remark: "-",
            transactionId: id,
            status: "approved",
            processtime: "00:00:00",
            newDeposit: isNewDeposit,
          }),

          truePayModal.findByIdAndUpdate(
            existingTrx._id,
            { $set: { status: statusText, platformCharge: Number(fee) } },
            { new: true }
          ),

          UserWalletLog.create({
            userId: user._id,
            transactionid: id,
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
              console.log("Truepay, couldn't find promotion");
              // Don't return here, continue processing the rest of the callback
            } else {
              // Calculate bonus amount
              let bonusAmount = 0;
              if (promotion.claimtype === "Percentage") {
                bonusAmount =
                  (Number(amount) * parseFloat(promotion.bonuspercentage)) /
                  100;
                if (
                  promotion.maxbonus > 0 &&
                  bonusAmount > promotion.maxbonus
                ) {
                  bonusAmount = promotion.maxbonus;
                }
              } else if (promotion.claimtype === "Exact") {
                bonusAmount = parseFloat(promotion.bonusexact);
                if (
                  promotion.maxbonus > 0 &&
                  bonusAmount > promotion.maxbonus
                ) {
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
                  console.error(
                    "LionKing balance check error:",
                    LionKingResult
                  );
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
      } else if (status !== "1") {
        await truePayModal.findByIdAndUpdate(existingTrx._id, {
          $set: { status: statusText },
        });
      }

      return res.status(200).type("text/plain").send("OK");
    } catch (error) {
      console.error("Payment callback processing error:", {
        error: error.message,
        body: req.body,
        timestamp: moment().utc().format(),
        stack: error.stack,
      });
      return res.status(200).type("text/plain").send("Internal Server Error");
    }
  }
);

router.get(
  "/admin/api/truepaydata",
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

      const dgData = await truePayModal
        .find(dateFilter)
        .sort({ createdAt: -1 })
        .lean();
      res.status(200).json({
        success: true,
        message: "TruePay retrieved successfully",
        data: dgData,
      });
    } catch (error) {
      console.error("Error retrieving user bonus TruePay:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve bonus TruePay",
        error: error.message,
      });
    }
  }
);
module.exports = router;
