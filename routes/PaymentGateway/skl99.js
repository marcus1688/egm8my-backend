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
const skl99Modal = require("../../models/paymentgateway_skl99.model");
const UserWalletLog = require("../../models/userwalletlog.model");
const Bonus = require("../../models/bonus.model");
const Promotion = require("../../models/promotion.model");
const Deposit = require("../../models/deposit.model");
const paymentgateway = require("../../models/paymentgateway.model");
const { checkAndUpdateVIPLevel, updateUserGameLocks } = require("../users");
const PaymentGatewayTransactionLog = require("../../models/paymentgatewayTransactionLog.model");
const kioskbalance = require("../../models/kioskbalance.model");
const { updateKioskBalance } = require("../../services/kioskBalanceService");

require("dotenv").config();
const merchantCheck = "egmsoft1919@gmail.com";
const skl99SecretServer1 = process.env.SKL99_SECRET_SERVER;
const webURL = "https://www.bm8my.vip/";
const skl99APIURL = "https://staging-api.skl99.net";
const callbackUrl = "https://api.egm8my.vip/api/skl99/receivedcalled158291";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateTransactionId(prefix = "") {
  const uuid = uuidv4().replace(/-/g, "").substring(0, 16);
  return prefix ? `${prefix}${uuid}` : uuid;
}
router.post("/api/skl99/banks", async (req, res) => {
  try {
    const response = await axios.get(
      `${skl99APIURL}/api/transaction/get_gateways`,
      {
        headers: { "Content-Type": "application/json" },
      }
    );
    console.log(response.data);

    if (response.data?.code !== "SUCCESS") {
      return res.status(400).json({
        success: false,
        message: response.data.message || "Failed to fetch bank options",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Bank options retrieved",
      data: response.data,
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
  "/api/skl99/getpaymentlink",
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
              : "Please select a payment method",
            zh: !trfAmt ? "请输入转账金额" : "请选择转账方式",
            zh_hk: !trfAmt ? "麻煩輸入轉賬金額" : "麻煩老闆揀選轉帳方式",
            ms: !trfAmt
              ? "Jumlah pemindahan diperlukan"
              : "Sila pilih kaedah pembayaran",
            id: !trfAmt
              ? "Jumlah transfer diperlukan"
              : "Silakan pilih metode pembayaran",
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
            zh_hk: "用戶未找到，請重試或聯絡客服以獲取幫助。",
            id: "Pengguna tidak ditemukan. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      if (promotionId) {
        const promotion = await Promotion.findById(promotionId);
        if (!promotion) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Promotion not found, Please try again or contact customer service for assistance.",
              zh: "找不到该优惠活动，请重试或联系客服以获取帮助。",
              zh_hk: "搵唔到呢個優惠活動，請重試或聯絡客服以獲取幫助。",
              ms: "Promosi tidak dijumpai, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
              id: "Promosi tidak ditemukan, Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
            },
          });
        }
      }
      let refno;
      let attempts = 0;
      const maxAttempts = 5;

      do {
        refno = generateTransactionId("bm8my");

        const existing = await skl99Modal.findOne({ ourRefNo: refno }).lean();
        if (!existing) break;
        attempts++;
      } while (attempts < maxAttempts);

      if (attempts >= maxAttempts) {
        return res.status(200).json({
          success: false,
          message: {
            en: "System busy, Please try again or contact customer service for assistance.",
            zh: "系统繁忙，请重试或联系客服以获取帮助。",
            zh_hk: "系統繁忙，請重試或聯絡客服以獲取幫助。",
            ms: "Sistem sibuk, sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            id: "Sistem sibuk, Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      const formattedAmount = Number(trfAmt);

      const requestBody = {
        api_token: skl99SecretServer1,
        amount: formattedAmount,
        gateway: bankCode,
        pusername: user.fullname,
        invoice_no: refno,
        v_user_id: user.username,
      };

      const response = await axios.post(
        `${skl99APIURL}/api/transaction/init`,
        requestBody,
        {
          headers: { "Content-Type": "application/json" },
        }
      );
      console.log(response.data);
      if (!response.data.transaction_link) {
        console.log(`SKL99 API Error: ${JSON.stringify(response.data)}`);

        return res.status(200).json({
          success: false,
          message: {
            en: "Failed to generate payment link. Please try again or contact customer service for assistance.",
            zh: "生成支付链接失败，请重试或联系客服以获取帮助。",
            zh_hk: "生成支付連結失敗，麻煩老闆再試多次或者聯絡客服幫手。",
            ms: "Gagal menjana pautan pembayaran. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
            id: "Gagal membuat tautan pembayaran. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
          },
        });
      }

      const BANK_CODE_DISPLAY_NAMES = {
        MAYBANK: "MAYBANK",
        BANK_ISLAM: "BANK ISLAM",
        CIMB: "CIMB",
        TNG: "TNG",
      };

      await Promise.all([
        skl99Modal.create({
          ourRefNo: refno,
          paymentGatewayRefNo: response.data.transaction_id,
          transfername: user.fullname,
          username: user.username,
          amount: formattedAmount,
          transferType: BANK_CODE_DISPLAY_NAMES[bankCode] || bankCode,
          transactiontype: "deposit",
          status: "Pending",
          platformCharge: 0,
          remark: "-",
          promotionId: promotionId || null,
        }),
      ]);

      return res.status(200).json({
        success: true,
        message: {
          en: "Redirecting to payment page...",
          zh: "正在跳转至支付页面...",
          zh_hk: "正在跳緊去支付頁面...",
          ms: "Mengalihkan ke halaman pembayaran...",
          id: "Mengarahkan ke halaman pembayaran...",
        },
        url: response.data.transaction_link,
      });
    } catch (error) {
      console.error(
        `Error in SKL99 API - User: ${req.user?.userId}, Amount: ${req.body?.trfAmt}:`,
        error.response?.data || error.message
      );

      return res.status(200).json({
        success: false,
        message: {
          en: "Failed to generate payment link. Please try again or contact customer service for assistance.",
          zh: "生成支付链接失败，请重试或联系客服以获取帮助。",
          zh_hk: "生成支付連結失敗，麻煩老闆再試多次或者聯絡客服幫手。",
          ms: "Gagal menjana pautan pembayaran. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          id: "Gagal membuat tautan pembayaran. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post("/api/skl99deposit", async (req, res) => {
  try {
    const {
      reference_no,
      transaction_id,
      invoice_no,
      amount,
      status,
      status_message,
      merchant_code,
    } = req.body;
    console.log("skl99 callback", req.body);

    if (!invoice_no || amount === undefined || status === undefined) {
      console.log("Missing required parameters:", {
        invoice_no,
        amount,
        status,
      });
      return res.status(200).json(req.body);
    }

    if (merchantCheck !== merchant_code) {
      return res.status(200).json(req.body);
    }

    const statusMapping = {
      FAILED: "Reject",
      SUCCESS: "Success",
    };

    const statusCode = String(status);
    const statusText = statusMapping[statusCode] || "Unknown";

    const existingTrx = await skl99Modal.findOne({ ourRefNo: invoice_no });

    if (!existingTrx) {
      console.log(`Transaction not found: ${invoice_no}, creating record`);
      await skl99Modal.create({
        username: "N/A",
        transfername: "N/A",
        ourRefNo: invoice_no,
        paymentGatewayRefNo: transaction_id,
        amount: roundToTwoDecimals(amount),
        transactiontype: "deposit",
        status: statusText,
        platformCharge: 0,
        remark: `No transaction found with reference: ${invoice_no}. Created from callback.`,
      });

      return res.status(200).json(req.body);
    }

    if (status === "SUCCESS" && existingTrx.status === "Success") {
      console.log("Transaction already processed successfully, skipping");
      return res.status(200).json(req.body);
    }

    if (status === "SUCCESS" && existingTrx.status !== "Success") {
      const user = await User.findOne(
        { username: existingTrx.username },
        {
          _id: 1,
          username: 1,
          fullname: 1,
          wallet: 1,
          totaldeposit: 1,
          firstDepositDate: 1,
          duplicateIP: 1,
          duplicateBank: 1,
        }
      ).lean();

      if (!user) {
        console.error(`User not found: ${existingTrx.username}`);
        return res.status(200).json(req.body);
      }

      const isNewDeposit = !user.firstDepositDate;

      const setObject = {
        lastdepositdate: new Date(),
        ...(isNewDeposit && { firstDepositDate: existingTrx.createdAt }),
      };

      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        {
          $inc: {
            wallet: roundToTwoDecimals(amount),
            totaldeposit: roundToTwoDecimals(amount),
          },
          $set: setObject,
        },
        { new: true, projection: { wallet: 1 } }
      ).lean();

      const gateway = await paymentgateway
        .findOne(
          { name: { $regex: /^skl99$/i } },
          { _id: 1, name: 1, balance: 1 }
        )
        .lean();

      const oldGatewayBalance = gateway?.balance || 0;

      const parallelOperations = [
        Deposit.create({
          userId: user._id,
          username: user.username,
          fullname: user.fullname || "unknown",
          bankname: "SKL99",
          ownername: "Payment Gateway",
          transfernumber: transaction_id,
          walletType: "Main",
          transactionType: "deposit",
          method: "auto",
          processBy: "admin",
          amount: roundToTwoDecimals(amount),
          walletamount: user.wallet,
          remark: "-",
          status: "approved",
          processtime: "00:00:00",
          newDeposit: isNewDeposit,
          transactionId: invoice_no,
          duplicateIP: user.duplicateIP,
          duplicateBank: user.duplicateBank,
        }),

        skl99Modal.findByIdAndUpdate(
          existingTrx._id,
          { $set: { status: statusText } },
          { new: true }
        ),

        UserWalletLog.create({
          userId: user._id,
          transactionid: invoice_no,
          transactiontime: new Date(),
          transactiontype: "deposit",
          amount: roundToTwoDecimals(amount),
          status: "approved",
        }),

        paymentgateway.findOneAndUpdate(
          { name: { $regex: /^skl99$/i } },
          { $inc: { balance: roundToTwoDecimals(amount) } },
          { new: true, projection: { _id: 1, name: 1, balance: 1 } }
        ),
      ];

      const [newDeposit, , , updatedGateway] = await Promise.all(
        parallelOperations
      );

      const kioskSettings = await kioskbalance.findOne({});

      if (kioskSettings && kioskSettings.status) {
        const kioskResult = await updateKioskBalance(
          "subtract",
          roundToTwoDecimals(amount),
          {
            username: user.username,
            transactionType: "deposit approval",
            remark: `Deposit ID: ${newDeposit._id}`,
            processBy: "admin",
          }
        );
        if (!kioskResult.success) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Failed to update kiosk balance",
              zh: "更新Kiosk余额失败",
            },
          });
        }
      }

      setImmediate(() => {
        checkAndUpdateVIPLevel(user._id).catch((error) => {
          console.error(
            `VIP level update error for user ${user._id}:`,
            error.message
          );
        });
        updateUserGameLocks(user._id);
      });

      await PaymentGatewayTransactionLog.create({
        gatewayId: gateway._id,
        gatewayName: gateway.name,
        transactiontype: "deposit",
        amount: roundToTwoDecimals(amount),
        lastBalance: oldGatewayBalance,
        currentBalance:
          updatedGateway?.balance ||
          oldGatewayBalance + roundToTwoDecimals(amount),
        remark: `Deposit from ${user.username}`,
        playerusername: user.username,
        processby: "system",
        depositId: newDeposit._id,
      });

      if (existingTrx.promotionId) {
        try {
          const promotion = await Promotion.findOne(
            { _id: existingTrx.promotionId },
            {
              claimtype: 1,
              bonuspercentage: 1,
              bonusexact: 1,
              maxbonus: 1,
              maintitle: 1,
              maintitleEN: 1,
            }
          ).lean();

          if (!promotion) {
            console.log("SKL99, couldn't find promotion");
          } else {
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
              bonusAmount = roundToTwoDecimals(bonusAmount);
              const bonusTransactionId = uuidv4();

              await Promise.all([
                Bonus.create({
                  transactionId: bonusTransactionId,
                  userId: user._id,
                  username: user.username,
                  fullname: user.fullname || "unknown",
                  transactionType: "bonus",
                  processBy: "admin",
                  amount: bonusAmount,
                  walletamount: user.wallet,
                  status: "approved",
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
                  amount: bonusAmount,
                  status: "approved",
                  promotionnameCN: promotion.maintitle,
                  promotionnameEN: promotion.maintitleEN,
                }),
              ]);
            }
          }
        } catch (promotionError) {
          console.error("Error processing promotion:", promotionError);
        }
      }
    } else {
      await skl99Modal.findByIdAndUpdate(existingTrx._id, {
        $set: { status: statusText, remark: status_message },
      });
    }

    return res.status(200).json(req.body);
  } catch (error) {
    console.error("Payment callback processing error:", {
      error: error.message,
      body: req.body,
      timestamp: moment().utc().format(),
      stack: error.stack,
    });
    return res.status(200).json(req.body);
  }
});

router.get("/admin/api/skl99data", authenticateAdminToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let dateFilter = {};

    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: moment(new Date(startDate)).utc().toDate(),
        $lte: moment(new Date(endDate)).utc().toDate(),
      };
    }

    const dgData = await skl99Modal
      .find(dateFilter)
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({
      success: true,
      message: "SKL99 retrieved successfully",
      data: dgData,
    });
  } catch (error) {
    console.error("Error retrieving user bonus SKL99:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve bonus SKL99",
      error: error.message,
    });
  }
});
module.exports = router;
