const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");
const CryptoJS = require("crypto-js");

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
const luxePayModal = require("../../models/paymentgateway_luxepay");
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

const luxepayMerchantCode = "OC7";
const luxepaySecret = process.env.LUXEPAY_SECRET;
const webURL = "https://www.oc7.me/";
const luxepayINAPIURL = "https://btpayinapi.luxepay.co/payin/";
const luxepayOUTAPIURL = "https://payoutapi.luxepay.co/Payout/Withdrawal";
const luxepayQRDUITNOWAPIURL = "https://qrpayinapi.luxepay.co/DuitNow/Deposit";
const callbackUrl = "https://api.oc7.me/api/luxepay/receivedcalled158291";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

const generateDepositV2Hash = (
  merchantCode,
  itemId,
  currency,
  amount,
  secretKey
) => {
  const dataToHash = merchantCode + itemId + currency + amount;
  return CryptoJS.HmacSHA256(dataToHash, secretKey).toString();
};

function generateTransactionId(prefix = "") {
  const uuid = uuidv4().replace(/-/g, "").substring(0, 16);
  return prefix ? `${prefix}${uuid}` : uuid;
}
router.get("/api/luxepay/banks", async (req, res) => {
  try {
    const requestBody = {
      MerchantCode: luxepayMerchantCode,
      Currency: "MYR",
      APIKey: luxepaySecret,
    };

    const response = await axios.post(
      `${luxepayINAPIURL}DepositSenderBank`,
      requestBody,
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    if (response.data.error_code !== 0) {
      return res.status(400).json({
        success: false,
        message: response.data.message || "Failed to fetch bank options",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Bank options retrieved",
      data: response.data.Bank,
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
  "/api/luxepay/getpaymentlink",
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

        const existing = await luxePayModal.findOne({ ourRefNo: refno }).lean();
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

      const Hash = generateDepositV2Hash(
        luxepayMerchantCode,
        refno,
        "MYR",
        trfAmt,
        luxepaySecret
      );

      const requestBody = {
        MerchantCode: luxepayMerchantCode,
        ReturnURL: webURL,
        FailedReturnURL: webURL,
        HTTPPostURL: callbackUrl,
        Amount: trfAmt,
        Currency: "MYR",
        ItemID: refno,
        ItemDescription: `Top up MYR ${trfAmt} for ${user.username}`,
        PlayerId: user.username,
        Hash,
        BankCode: bankCode,
        ClientFullName: user.fullname,
      };

      const response = await axios.post(
        `${luxepayINAPIURL}DepositV2`,
        requestBody,
        {
          headers: { "Content-Type": "application/json" },
        }
      );

      if (response.data.message && !response.data.transaction) {
        console.log(`TRUEPay API Error: ${JSON.stringify(response.data)}`);

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
        luxePayModal.create({
          ourRefNo: refno,
          username: user.username,
          amount: trfAmt,
          bankCode,
          status: "Pending",
          remark: "-",
          promotionId: promotionId,
        }),
      ]);

      const paymentUrl = response.data.redirect_to.replace("redirectlink=", "");

      return res.status(200).json({
        success: true,
        message: {
          en: "Payment link generated successfully",
          zh: "支付链接生成成功",
          ms: "Pautan pembayaran berjaya dijana",
        },
        url: paymentUrl,
      });
    } catch (error) {
      console.error(
        `Error in TRUEPay API - User: ${req.user?.userId}, Amount: ${req.body?.trfAmt}:`,
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

// receivedcalled158291
router.post("/api/luxepay/payment", async (req, res) => {
  try {
    console.log(req.body);
    const {
      status,
      ItemID,
      decline_reason,
      Amount,
      bank_reference,
      total_fees,
    } = req.body;

    if (!ItemID || Amount === undefined || status === undefined) {
      console.log("Missing required parameters:", { ItemID, Amount, status });
      return res.status(200).json({
        error_code: 3,
        message: "Invalid Parameter",
      });
    }

    const statusMapping = {
      2: "Reject",
      1: "Success",
      3: "Success",
    };

    const statusCode = String(status);
    const statusText = statusMapping[statusCode] || "Unknown";

    const existingTrx = await luxePayModal.findOne({ ourRefNo: ItemID });

    if (!existingTrx) {
      console.log(`Transaction not found: ${ItemID}, creating record`);
      await luxePayModal.create({
        username: "N/A",
        ourRefNo: ItemID,
        amount: Number(Amount),
        platformCharge: Number(total_fees),
        status: statusText,
        remark: `No transaction found with reference: ${ItemID}. Created from callback.`,
        createdAt: new Date(),
      });

      return res.status(200).json({
        error_code: 1,
        message: "Invalid/Incorrect Transaction",
      });
    }

    if (
      (status === "1" || status === "3") &&
      existingTrx.status === "Success"
    ) {
      console.log("Transaction already processed successfully, skipping");
      return res.status(200).json({
        error_code: 0,
        message: "Operation Success",
      });
    }

    if (
      (status === "1" || status === "3") &&
      existingTrx.status !== "Success"
    ) {
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
            wallet: roundToTwoDecimals(Number(Amount)),
            totaldeposit: roundToTwoDecimals(Number(Amount)),
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
          bankname: "LUXEPAY",
          ownername: "Payment Gateway",
          transfernumber: uuidv4(),
          walletType: "Main",
          transactionType: "deposit",
          method: "auto",
          processBy: "admin",
          amount: Number(Amount),
          remark: "-",
          transactionId: ItemID,
          status: "approved",
          processtime: "00:00:00",
          newDeposit: isNewDeposit,
        }),

        // Update transaction status
        luxePayModal.findByIdAndUpdate(
          existingTrx._id,
          { $set: { status: statusText } },
          { new: true }
        ),

        UserWalletLog.create({
          userId: user._id,
          transactionid: ItemID,
          transactiontime: new Date(),
          transactiontype: "deposit",
          amount: Number(Amount),
          status: "approved",
        }),
      ]);

      global.sendNotificationToUser(
        user._id,
        {
          en: `Deposit MYR ${roundToTwoDecimals(Number(Amount))} approved`,
          ms: `Deposit MYR ${roundToTwoDecimals(
            Number(Amount)
          )} telah diluluskan`,
          zh: `存款 MYR ${roundToTwoDecimals(Number(Amount))} 已批准`,
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
        parseFloat(Amount) === 30 &&
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
            console.log("LUXEPAY, couldn't find promotion");
          } else {
            let bonusAmount = 0;
            if (promotion.claimtype === "Percentage") {
              bonusAmount =
                (Number(Amount) * parseFloat(promotion.bonuspercentage)) / 100;
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
    } else {
      await luxePayModal.findByIdAndUpdate(existingTrx._id, {
        $set: { status: statusText, remark: decline_reason },
      });
    }

    return res.status(200).json({
      error_code: 0,
      message: "Operation Success",
    });
  } catch (error) {
    console.error("Payment callback processing error:", {
      error: error.message,
      body: req.body,
      timestamp: moment().utc().format(),
      stack: error.stack,
    });
    return res.status(200).json({
      error_code: 4,
      message: "Operation Failed",
    });
  }
});

router.get(
  "/admin/api/luxepaydata",
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

      const dgData = await luxePayModal
        .find(dateFilter)
        .sort({ createdAt: -1 })
        .lean();
      res.status(200).json({
        success: true,
        message: "LUXEPay retrieved successfully",
        data: dgData,
      });
    } catch (error) {
      console.error("Error retrieving user bonus LUXEPay:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve bonus LUXEPay",
        error: error.message,
      });
    }
  }
);
module.exports = router;
