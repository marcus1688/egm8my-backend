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
const surepayModal = require("../../models/paymentgateway_surepay.model");
const UserWalletLog = require("../../models/userwalletlog.model");
const Bonus = require("../../models/bonus.model");
const Promotion = require("../../models/promotion.model");
const Deposit = require("../../models/deposit.model");
const Withdraw = require("../../models/withdraw.model");
const paymentgateway = require("../../models/paymentgateway.model");
const { checkAndUpdateVIPLevel, updateUserGameLocks } = require("../users");
const PaymentGatewayTransactionLog = require("../../models/paymentgatewayTransactionLog.model");
const kioskbalance = require("../../models/kioskbalance.model");
const { updateKioskBalance } = require("../../services/kioskBalanceService");
const BankTransactionLog = require("../../models/banktransactionlog.model");
const BankList = require("../../models/banklist.model");
const LiveTransaction = require("../../models/transaction.model");

require("dotenv").config();
const merchantName = "Infinity011";
const surePaySecret = process.env.SUREPAY_APIKEY;
const surePayCallbackSecret = process.env.SUREPAY_CALLBACKKEY;
const surePayPayoutSecret = process.env.SUREPAY_PAYOUTAPIKEY;
const webURL = "https://www.bm8my.vip/";
const surepayAPIURL = "https://my.paymentgt.com/";
const callbackUrl = "https://api.egm8my.vip/api/surepay/receivedcalled158291";
const transferoutcallbackUrl =
  "https://api.egm8my.vip/api/surepay/receivedtransfercalled168";
const bankIDPG = "69247c9f7ef1ac832d86e65f";
const payoutBankCode = "10021774";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateTransactionId(prefix = "") {
  const uuid = uuidv4().replace(/-/g, "").substring(0, 16);
  return prefix ? `${prefix}${uuid}` : uuid;
}
router.post("/api/surepay/banks", async (req, res) => {
  try {
    console.log(surePaySecret);
    console.log(`${surepayAPIURL}v1/bankquery`);
    const response = await axios.post(`${surepayAPIURL}v1/bankquery`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${surePaySecret}`,
      },
    });

    console.log("SurePay Bank Query Response:", response.data);

    // Check if response is successful (status 200)
    if (response.status !== 200) {
      return res.status(400).json({
        success: false,
        message: "Failed to fetch bank options from SurePay",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Bank options retrieved successfully",
      data: response.data,
    });
  } catch (error) {
    console.error("Error fetching SurePay bank options:", error);

    // Handle specific error cases
    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: error.response.data?.message || "Failed to fetch bank options",
        error: error.response.data,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error fetching bank options",
      error: error.message,
    });
  }
});

function generateSurePayRequestToken(
  merchant,
  amount,
  refid,
  customer,
  apikey,
  currency,
  clientip
) {
  const tokenString = `${merchant}${amount}${refid}${customer}${apikey}${currency}${clientip}`;

  return crypto.createHash("md5").update(tokenString).digest("hex");
}

function generateSurePayCallbackToken(
  merchant,
  amount,
  status,
  callbackApikey,
  trxno
) {
  const tokenString = `${merchant}${amount}${status}${callbackApikey}${trxno}`;
  return crypto.createHash("md5").update(tokenString).digest("hex");
}

router.post(
  "/api/surepay/getpaymentlink",
  authenticateToken,
  async (req, res) => {
    try {
      const { trfAmt, bankCode, promotionId, gameLang } = req.body;

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

        const existing = await surepayModal.findOne({ ourRefNo: refno }).lean();
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

      const clientIP = req.ip || req.connection.remoteAddress || "127.0.0.1";
      const depositAmt = roundToTwoDecimals(trfAmt);

      const token = generateSurePayRequestToken(
        merchantName,
        depositAmt,
        refno,
        user.fullname,
        surePaySecret,
        "MYR",
        clientIP
      );

      let lang = "en";

      if (gameLang === "en") {
        lang = "en";
      } else if (gameLang === "zh") {
        lang = "en";
      } else if (gameLang === "zh_hk") {
        lang = "en";
      } else if (gameLang === "ms") {
        lang = "my";
      } else if (gameLang === "id") {
        lang = "id";
      }

      const payload = {
        merchant: merchantName,
        refid: refno,
        amount: depositAmt,
        token: token,
        customer: user.fullname,
        currency: "MYR",
        language: lang,
        bankcode: bankCode,
        // srcbankcode: bankCode,
        srcbankaccname: user.fullname,
        clientip: clientIP,
        failed_return_url: webURL,
        return_url: webURL,
        post_url: callbackUrl,
      };

      const response = await axios.post(
        `${surepayAPIURL}api/request`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.status !== 1) {
        console.log(`SUREPAY API Error: ${JSON.stringify(response.data)}`);

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
        10021771: "AMBANK",
        10021773: "BANK ISLAM",
        10021772: "BANK RAKYAT",
        10021770: "BSN",
        10021765: "CIMB",
        10021769: "HONG LEONG",
        10021767: "MAYBANK",
        10021766: "PUBLIC BANK",
        10021768: "RHB",
        10021776: "TNG",
        10021775: "DUITNOW QR",
      };

      await surepayModal.create({
        ourRefNo: refno,
        paymentGatewayRefNo: response.data.trxid,
        transfername: user.fullname,
        username: user.username,
        amount: depositAmt,
        transferType: BANK_CODE_DISPLAY_NAMES[bankCode] || bankCode,
        transactiontype: "deposit",
        status: "Pending",
        platformCharge: 0,
        remark: "-",
        promotionId: promotionId || null,
      });

      return res.status(200).json({
        success: true,
        message: {
          en: "Redirecting to payment page...",
          zh: "正在跳转至支付页面...",
          zh_hk: "正在跳緊去支付頁面...",
          ms: "Mengalihkan ke halaman pembayaran...",
          id: "Mengarahkan ke halaman pembayaran...",
        },
        url: response.data.redirecturl,
      });
    } catch (error) {
      console.error(
        `Error in SUREPAY API - User: ${req.user?.userId}, Amount: ${req.body?.trfAmt}:`,
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

router.post("/api/surepay/receivedcalled158291", async (req, res) => {
  try {
    const {
      amount,
      merchant,
      refid,
      token,
      trxno,
      status,
      status_message,
      fee,
    } = req.body;

    if (!refid || amount === undefined || status === undefined) {
      console.log("Missing required parameters:", {
        refid,
        amount,
        status,
      });
      return res.status(200).json({ status: -1 });
    }

    if (merchantName !== merchant) {
      return res.status(200).json({ status: -1 });
    }

    const expectedToken = generateSurePayCallbackToken(
      merchant,
      amount,
      status,
      surePayCallbackSecret,
      trxno
    );

    if (token !== expectedToken) {
      console.log("Invalid callback token");
      return res.status(200).json({ status: -1 });
    }

    const statusMapping = {
      "-1": "Reject",
      1: "Success",
    };

    const statusCode = String(status);
    const statusText = statusMapping[statusCode] || "Unknown";
    const roundedAmount = roundToTwoDecimals(amount);

    const existingTrx = await surepayModal
      .findOne(
        { ourRefNo: refid },
        { _id: 1, username: 1, status: 1, createdAt: 1, promotionId: 1 }
      )
      .lean();

    if (!existingTrx) {
      console.log(`Transaction not found: ${refid}, creating record`);
      await surepayModal.create({
        username: "N/A",
        transfername: "N/A",
        ourRefNo: refid,
        paymentGatewayRefNo: trxno,
        amount: roundedAmount,
        transactiontype: "deposit",
        status: statusText,
        platformCharge: fee || 0,
        remark: `No transaction found with reference: ${refid}. Created from callback.`,
      });

      return res.status(200).json({ status: -1 });
    }

    if (status === "1" && existingTrx.status === "Success") {
      console.log("Transaction already processed successfully, skipping");
      return res.status(200).json({ status: 1 });
    }

    if (status === "1" && existingTrx.status !== "Success") {
      const [user, gateway, kioskSettings, bank] = await Promise.all([
        User.findOne(
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
        ).lean(),

        paymentgateway
          .findOne(
            { name: { $regex: /^surepay$/i } },
            { _id: 1, name: 1, balance: 1 }
          )
          .lean(),

        kioskbalance.findOne({}, { status: 1 }).lean(),

        BankList.findById(bankIDPG, {
          _id: 1,
          bankname: 1,
          ownername: 1,
          bankaccount: 1,
          qrimage: 1,
          currentbalance: 1,
        }).lean(),
      ]);

      if (!user) {
        console.error(`User not found: ${existingTrx.username}`);
        return res.status(200).json({ status: -1 });
      }

      if (!bank) {
        console.error(`Bank not found: ${bankIDPG}`);
        return res.status(200).json({ status: -1 });
      }

      const isNewDeposit = !user.firstDepositDate;
      const oldGatewayBalance = gateway?.balance || 0;
      const oldBankBalance = bank.currentbalance || 0;

      const [
        updatedUser,
        newDeposit,
        ,
        walletLog,
        updatedGateway,
        updatedBank,
      ] = await Promise.all([
        User.findByIdAndUpdate(
          user._id,
          {
            $inc: {
              wallet: roundedAmount,
              totaldeposit: roundedAmount,
            },
            $set: {
              lastdepositdate: new Date(),
              ...(isNewDeposit && {
                firstDepositDate: existingTrx.createdAt,
              }),
            },
          },
          { new: true, projection: { wallet: 1 } }
        ).lean(),

        Deposit.create({
          userId: user._id,
          username: user.username,
          fullname: user.fullname || "unknown",
          bankname: "SUREPAY",
          ownername: "Payment Gateway",
          transfernumber: trxno,
          walletType: "Main",
          transactionType: "deposit",
          method: "auto",
          processBy: "admin",
          bankid: bankIDPG,
          amount: roundedAmount,
          walletamount: user.wallet,
          remark: "-",
          status: "approved",
          processtime: "00:00:00",
          newDeposit: isNewDeposit,
          transactionId: refid,
          duplicateIP: user.duplicateIP,
          duplicateBank: user.duplicateBank,
        }),

        surepayModal.findByIdAndUpdate(existingTrx._id, {
          $set: { status: statusText, platformCharge: fee || 0 },
        }),

        UserWalletLog.create({
          userId: user._id,
          transactionid: refid,
          transactiontime: new Date(),
          transactiontype: "deposit",
          amount: roundedAmount,
          status: "approved",
        }),

        paymentgateway.findOneAndUpdate(
          { name: { $regex: /^surepay$/i } },
          { $inc: { balance: roundedAmount } },
          { new: true, projection: { _id: 1, name: 1, balance: 1 } }
        ),

        BankList.findByIdAndUpdate(
          bankIDPG,
          [
            {
              $set: {
                totalDeposits: { $add: ["$totalDeposits", roundedAmount] },
                currentbalance: {
                  $subtract: [
                    {
                      $add: [
                        "$startingbalance",
                        { $add: ["$totalDeposits", roundedAmount] },
                        "$totalCashIn",
                      ],
                    },
                    {
                      $add: ["$totalWithdrawals", "$totalCashOut"],
                    },
                  ],
                },
              },
            },
          ],
          { new: true, projection: { currentbalance: 1 } }
        ).lean(),
      ]);

      await BankTransactionLog.create({
        bankName: bank.bankname,
        ownername: bank.ownername,
        bankAccount: bank.bankaccount,
        remark: "-",
        lastBalance: oldBankBalance,
        currentBalance:
          updatedBank?.currentbalance || oldBankBalance + roundedAmount,
        processby: "admin",
        qrimage: bank.qrimage,
        playerusername: user.username,
        playerfullname: user.fullname,
        transactiontype: "deposit",
        amount: roundedAmount,
      });

      const depositCount = await LiveTransaction.countDocuments({
        type: "deposit",
      });

      if (depositCount >= 5) {
        await LiveTransaction.findOneAndUpdate(
          { type: "deposit" },
          {
            $set: {
              username: user.username,
              amount: roundedAmount,
              time: new Date(),
            },
          },
          { sort: { time: 1 } }
        );
      } else {
        await LiveTransaction.create({
          type: "deposit",
          username: user.username,
          amount: roundedAmount,
          time: new Date(),
          status: "completed",
        });
      }

      if (kioskSettings?.status) {
        const kioskResult = await updateKioskBalance(
          "subtract",
          roundedAmount,
          {
            username: user.username,
            transactionType: "deposit approval",
            remark: `Deposit ID: ${newDeposit._id}`,
            processBy: "admin",
          }
        );
        if (!kioskResult.success) {
          console.error("Failed to update kiosk balance for deposit");
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
        gatewayId: gateway?._id,
        gatewayName: gateway?.name || "SUREPAY",
        transactiontype: "deposit",
        amount: roundedAmount,
        lastBalance: oldGatewayBalance,
        currentBalance:
          updatedGateway?.balance || oldGatewayBalance + roundedAmount,
        remark: `Deposit from ${user.username}`,
        playerusername: user.username,
        processby: "system",
        depositId: newDeposit._id,
      });

      if (existingTrx.promotionId) {
        try {
          const promotion = await Promotion.findById(existingTrx.promotionId, {
            claimtype: 1,
            bonuspercentage: 1,
            bonusexact: 1,
            maxbonus: 1,
            maintitle: 1,
            maintitleEN: 1,
          }).lean();

          if (!promotion) {
            console.log("SUREPAY, couldn't find promotion");
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

              const [, newBonus] = await Promise.all([
                User.findByIdAndUpdate(user._id, {
                  $inc: { wallet: bonusAmount },
                }),

                Bonus.create({
                  transactionId: bonusTransactionId,
                  userId: user._id,
                  username: user.username,
                  fullname: user.fullname || "unknown",
                  transactionType: "bonus",
                  processBy: "admin",
                  amount: bonusAmount,
                  walletamount: updatedUser?.wallet || user.wallet,
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

              if (kioskSettings?.status) {
                const kioskResult = await updateKioskBalance(
                  "subtract",
                  bonusAmount,
                  {
                    username: user.username,
                    transactionType: "bonus approval",
                    remark: `Bonus ID: ${newBonus._id}`,
                    processBy: "admin",
                  }
                );
                if (!kioskResult.success) {
                  console.error("Failed to update kiosk balance for bonus");
                }
              }
            }
          }
        } catch (promotionError) {
          console.error("Error processing promotion:", promotionError);
        }
      }
    } else {
      await surepayModal.findByIdAndUpdate(existingTrx._id, {
        $set: { status: statusText, remark: status_message },
      });
    }

    return res.status(200).json({ status: 1 });
  } catch (error) {
    console.error("Payment callback processing error:", {
      error: error.message,
      body: req.body,
      timestamp: moment().utc().format(),
      stack: error.stack,
    });
    return res.status(200).json({ status: -1 });
  }
});

router.get(
  "/admin/api/surepaydata",
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

      const dgData = await surepayModal
        .find(dateFilter)
        .sort({ createdAt: -1 })
        .lean();
      res.status(200).json({
        success: true,
        message: "Surepay retrieved successfully",
        data: dgData,
      });
    } catch (error) {
      console.error("Error retrieving user bonus Surepay:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve bonus Surepay",
        error: error.message,
      });
    }
  }
);

router.post("/admin/api/surepay/requesttransfer/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
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

    const {
      amount,
      bankCode,
      accountHolder,
      accountNumber,
      bankName,
      transactionId,
    } = req.body;

    if (!amount || !bankCode || !accountHolder || !accountNumber) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Please complete all required fields",
          zh: "请完成所有必填项",
          zh_hk: "麻煩完成所有必填項目",
          ms: "Sila lengkapkan semua medan yang diperlukan",
          id: "Silakan lengkapi semua kolom yang diperlukan",
        },
      });
    }

    const clientIP = req.ip || req.connection.remoteAddress || "127.0.0.1";
    const formattedAmount = Number(amount).toFixed(2);

    const token = generateSurePayRequestToken(
      merchantName,
      formattedAmount,
      transactionId,
      accountHolder,
      surePayPayoutSecret,
      "MYR",
      clientIP
    );

    const payload = {
      merchant: merchantName,
      amount: formattedAmount,
      refid: transactionId,
      token: token,
      customer: accountHolder,
      currency: "MYR",
      bankcode: payoutBankCode,
      destbankaccname: accountHolder,
      destbankcode: bankCode,
      destbankaccno: accountNumber,
      clientip: clientIP,
      post_url: transferoutcallbackUrl,
    };

    const response = await axios.post(`${surepayAPIURL}api/payout`, payload, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    if (response.data.status !== 1) {
      console.log(`SUREPAY API Error: ${response.data}`);

      if (response.data.status === -101) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Payment gateway has insufficient balance.",
            zh: "支付网关金额不足。",
            zh_hk: "支付網關金額不足。",
            ms: "Baki gerbang pembayaran tidak mencukupi.",
            id: "Saldo gateway pembayaran tidak mencukupi.",
          },
        });
      }

      return res.status(200).json({
        success: false,
        message: {
          en: "Payout request failed",
          zh: "申请代付失败",
          zh_hk: "申請代付失敗",
          ms: "Permintaan pembayaran gagal",
          id: "Permintaan pembayaran gagal",
        },
      });
    }

    await Promise.all([
      surepayModal.create({
        ourRefNo: transactionId,
        paymentGatewayRefNo: response.data.trxno,
        transfername: "N/A",
        username: user.username,
        amount: Number(formattedAmount),
        transferType: bankName || bankCode,
        transactiontype: "withdraw",
        status: "Pending",
        platformCharge: 0,
        remark: "-",
        promotionId: null,
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: {
        en: "Payout request submitted successfully",
        zh: "提交申请代付成功",
        zh_hk: "提交申請代付成功",
        ms: "Permintaan pembayaran berjaya diserahkan",
        id: "Permintaan pembayaran berhasil diajukan",
      },
    });
  } catch (error) {
    console.error(
      `Error in SUREPAY API - User: ${req.user?.userId}, Amount: ${req.body?.amount}:`,
      error.response?.data || error.message
    );

    return res.status(200).json({
      success: false,
      message: {
        en: "Payout request failed",
        zh: "申请代付失败",
        zh_hk: "申請代付失敗",
        ms: "Permintaan pembayaran gagal",
        id: "Permintaan pembayaran gagal",
      },
    });
  }
});

async function handleRejectedWithdrawalApproval(
  existingTrx,
  refid,
  roundedAmount,
  user
) {
  const [, withdraw, updatedUser] = await Promise.all([
    UserWalletLog.findOneAndUpdate(
      { transactionid: refid },
      { $set: { status: "approved" } }
    ),

    Withdraw.findOneAndUpdate(
      { transactionId: refid },
      {
        $set: {
          status: "approved",
          processBy: "admin",
          processtime: "00:00:00",
        },
      },
      {
        new: false,
        projection: { _id: 1, amount: 1, withdrawbankid: 1, remark: 1 },
      }
    ).lean(),

    User.findOneAndUpdate(
      { username: existingTrx.username },
      { $inc: { wallet: -roundedAmount } },
      {
        new: true,
        projection: { _id: 1, username: 1, fullname: 1, wallet: 1 },
      }
    ).lean(),
  ]);

  if (!withdraw) {
    console.error(`Withdraw record not found for refid: ${refid}`);
    return;
  }

  const [kioskSettings, bank] = await Promise.all([
    kioskbalance.findOne({}, { status: 1 }).lean(),
    BankList.findById(withdraw.withdrawbankid, {
      _id: 1,
      bankname: 1,
      ownername: 1,
      bankaccount: 1,
      qrimage: 1,
      currentbalance: 1,
    }).lean(),
  ]);

  if (!bank) {
    console.error(
      `Bank not found for withdrawbankid: ${withdraw.withdrawbankid}`
    );
    return;
  }

  if (kioskSettings?.status) {
    const kioskResult = await updateKioskBalance("add", withdraw.amount, {
      username: existingTrx.username,
      transactionType: "withdraw approval",
      remark: `Withdraw ID: ${withdraw._id}`,
      processBy: "admin",
    });

    if (!kioskResult.success) {
      console.error("Failed to update kiosk balance for withdraw approval");
    }
  }

  await Promise.all([
    BankList.findByIdAndUpdate(withdraw.withdrawbankid, {
      $inc: {
        currentbalance: -withdraw.amount,
        totalWithdrawals: withdraw.amount,
      },
    }),

    BankTransactionLog.create({
      bankName: bank.bankname,
      ownername: bank.ownername,
      bankAccount: bank.bankaccount,
      remark: withdraw.remark || "-",
      lastBalance: bank.currentbalance,
      currentBalance: bank.currentbalance - withdraw.amount,
      processby: "admin",
      transactiontype: "withdraw",
      amount: withdraw.amount,
      qrimage: bank.qrimage,
      playerusername: updatedUser?.username || existingTrx.username,
      playerfullname: updatedUser?.fullname || "N/A",
    }),
  ]);

  console.log(
    `Rejected withdrawal re-approved: ${refid}, User ${existingTrx.username}, Amount: ${roundedAmount}`
  );
}

async function handleApprovedWithdrawalReject(
  existingTrx,
  refid,
  roundedAmount,
  user
) {
  const gateway = await paymentgateway
    .findOne(
      { name: { $regex: /^surepay$/i } },
      { _id: 1, name: 1, balance: 1 }
    )
    .lean();

  if (!gateway) {
    console.error("Gateway not found for withdrawal rejection");
    return;
  }

  const oldGatewayBalance = gateway.balance || 0;

  const updatedGateway = await paymentgateway.findOneAndUpdate(
    { name: { $regex: /^surepay$/i } },
    { $inc: { balance: roundedAmount } },
    { new: true, projection: { _id: 1, name: 1, balance: 1 } }
  );

  await PaymentGatewayTransactionLog.create({
    gatewayId: gateway._id,
    gatewayName: gateway.name || "SUREPAY",
    transactiontype: "reverted withdraw",
    amount: roundedAmount,
    lastBalance: oldGatewayBalance,
    currentBalance:
      updatedGateway?.balance || oldGatewayBalance + roundedAmount,
    remark: `Revert withdraw from ${user.username}`,
    playerusername: user.username,
    processby: "system",
  });

  console.log(
    `Approved withdrawal re-rejected: ${refid}, User ${existingTrx.username}, Amount: ${roundedAmount}`
  );
}

router.post("/api/surepay/receivedtransfercalled168", async (req, res) => {
  try {
    const {
      merchant,
      amount,
      refid,
      customer,
      token,
      trxno,
      status,
      status_message,
    } = req.body;

    console.log("surepay", req.body);

    if (!refid || amount === undefined || status === undefined) {
      console.log("Missing required parameters:", {
        refid,
        amount,
        status,
      });
      return res.status(200).json({ status: -1 });
    }

    if (merchantName !== merchant) {
      return res.status(200).json({ status: -1 });
    }

    const expectedToken = generateSurePayCallbackToken(
      merchant,
      amount,
      status,
      surePayCallbackSecret,
      trxno
    );

    if (token !== expectedToken) {
      console.log("Invalid callback token");
      return res.status(200).json({ status: -1 });
    }

    const statusMapping = {
      "-1": "Reject",
      1: "Success",
    };

    const statusCode = String(status);
    const statusText = statusMapping[statusCode] || "Unknown";
    const roundedAmount = roundToTwoDecimals(amount);

    const existingTrx = await surepayModal
      .findOne(
        { ourRefNo: refid },
        { _id: 1, username: 1, status: 1, createdAt: 1, promotionId: 1 }
      )
      .lean();

    if (!existingTrx) {
      console.log(`Transaction not found: ${refid}, creating record`);
      await surepayModal.create({
        username: "N/A",
        transfername: "N/A",
        ourRefNo: refid,
        paymentGatewayRefNo: trxno,
        amount: roundedAmount,
        transactiontype: "withdraw",
        status: statusText,
        platformCharge: 0,
        remark: `No transaction found with reference: ${refid}. Created from callback.`,
      });

      return res.status(200).json({ status: -1 });
    }

    if (status === "1" && existingTrx.status === "Success") {
      console.log("Transaction already processed successfully, skipping");
      return res.status(200).json({ status: 1 });
    }

    if (status === "1" && existingTrx.status !== "Success") {
      const [user, gateway] = await Promise.all([
        User.findOne(
          { username: existingTrx.username },
          {
            _id: 1,
            username: 1,
            fullname: 1,
            wallet: 1,
            duplicateIP: 1,
            duplicateBank: 1,
          }
        ).lean(),

        paymentgateway
          .findOne(
            { name: { $regex: /^surepay$/i } },
            { _id: 1, name: 1, balance: 1 }
          )
          .lean(),
      ]);

      if (!user) {
        console.error(`User not found: ${existingTrx.username}`);
        return res.status(200).json({ status: -1 });
      }

      if (status === "1" && existingTrx.status !== "Success") {
        const [user, gateway] = await Promise.all([
          User.findOne(
            { username: existingTrx.username },
            {
              _id: 1,
              username: 1,
              fullname: 1,
              wallet: 1,
              duplicateIP: 1,
              duplicateBank: 1,
            }
          ).lean(),

          paymentgateway
            .findOne(
              { name: { $regex: /^surepay$/i } },
              { _id: 1, name: 1, balance: 1 }
            )
            .lean(),
        ]);

        if (!user) {
          console.error(`User not found: ${existingTrx.username}`);
          return res.status(200).json({ status: -1 });
        }

        if (existingTrx.status === "Reject") {
          await handleRejectedWithdrawalApproval(
            existingTrx,
            refid,
            roundedAmount,
            user
          );
        }

        const oldGatewayBalance = gateway?.balance || 0;

        const [, updatedGateway] = await Promise.all([
          surepayModal.findByIdAndUpdate(existingTrx._id, {
            $set: { status: statusText },
          }),

          paymentgateway.findOneAndUpdate(
            { name: { $regex: /^surepay$/i } },
            { $inc: { balance: -roundedAmount } },
            { new: true, projection: { _id: 1, name: 1, balance: 1 } }
          ),
        ]);

        await PaymentGatewayTransactionLog.create({
          gatewayId: gateway?._id,
          gatewayName: gateway?.name || "SUREPAY",
          transactiontype: "withdraw",
          amount: roundedAmount,
          lastBalance: oldGatewayBalance,
          currentBalance:
            updatedGateway?.balance || oldGatewayBalance - roundedAmount,
          remark: `Withdraw from ${user.username}`,
          playerusername: user.username,
          processby: "system",
        });
      }
    } else if (status === "-1" && existingTrx.status !== "Reject") {
      const [, , withdraw, updatedUser] = await Promise.all([
        surepayModal.findByIdAndUpdate(existingTrx._id, {
          $set: { status: statusText },
        }),

        UserWalletLog.findOneAndUpdate(
          { transactionid: refid },
          { $set: { status: "cancel" } }
        ),

        Withdraw.findOneAndUpdate(
          { transactionId: refid },
          {
            $set: {
              status: "reverted",
              processBy: "admin",
              processtime: "00:00:00",
            },
          },
          {
            new: false,
            projection: { _id: 1, amount: 1, withdrawbankid: 1, remark: 1 },
          }
        ).lean(),

        User.findOneAndUpdate(
          { username: existingTrx.username },
          { $inc: { wallet: roundedAmount } },
          {
            new: true,
            projection: { _id: 1, username: 1, fullname: 1, wallet: 1 },
          }
        ).lean(),
      ]);

      if (existingTrx.status === "Success") {
        await handleApprovedWithdrawalReject(
          existingTrx,
          refid,
          roundedAmount,
          updatedUser
        );
      }

      if (!withdraw) {
        console.log(`Withdraw not found for refid: ${refid}`);
        return res.status(200).json({ status: 1 });
      }

      const [kioskSettings, bank] = await Promise.all([
        kioskbalance.findOne({}, { status: 1 }).lean(),
        BankList.findById(withdraw.withdrawbankid, {
          _id: 1,
          bankname: 1,
          ownername: 1,
          bankaccount: 1,
          qrimage: 1,
          currentbalance: 1,
        }).lean(),
      ]);

      if (!bank) {
        console.log("Invalid bank surepay callback");
        return res.status(200).json({ status: 1 });
      }

      if (kioskSettings?.status) {
        const kioskResult = await updateKioskBalance(
          "subtract",
          withdraw.amount,
          {
            username: existingTrx.username,
            transactionType: "withdraw reverted",
            remark: `Withdraw ID: ${withdraw._id}`,
            processBy: "admin",
          }
        );
        if (!kioskResult.success) {
          console.error("Failed to update kiosk balance for withdraw revert");
        }
      }

      await Promise.all([
        BankList.findByIdAndUpdate(withdraw.withdrawbankid, {
          $inc: {
            currentbalance: withdraw.amount,
            totalWithdrawals: -withdraw.amount,
          },
        }),

        BankTransactionLog.create({
          bankName: bank.bankname,
          ownername: bank.ownername,
          bankAccount: bank.bankaccount,
          remark: withdraw.remark || "-",
          lastBalance: bank.currentbalance,
          currentBalance: bank.currentbalance + withdraw.amount,
          processby: "admin",
          transactiontype: "reverted withdraw",
          amount: withdraw.amount,
          qrimage: bank.qrimage,
          playerusername: updatedUser?.username || existingTrx.username,
          playerfullname: updatedUser?.fullname || "N/A",
        }),
      ]);

      console.log(
        `Transaction rejected: ${refid}, User ${existingTrx.username} refunded ${roundedAmount}, New wallet: ${updatedUser?.wallet}`
      );
    } else {
      await surepayModal.findByIdAndUpdate(existingTrx._id, {
        $set: { status: statusText, remark: status_message },
      });
    }

    return res.status(200).json({ status: 1 });
  } catch (error) {
    console.error("Payment callback processing error:", {
      error: error.message,
      body: req.body,
      timestamp: moment().utc().format(),
      stack: error.stack,
    });
    return res.status(200).json({ status: -1 });
  }
});

module.exports = router;
