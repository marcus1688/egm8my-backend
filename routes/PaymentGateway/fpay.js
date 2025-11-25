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
const fpayModal = require("../../models/paymentgateway_fpay.model");
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
const merchantName = "BM8MYG_inf";
const fpayBankAPIKEY = process.env.FPAYBANK_APIKEY;
const fpayBankSecret = process.env.FPAYBANK_SECRETKEY;
const fpayDuitnowAPIKEY = process.env.FPAYDUITNOW_APIKEY;
const fpayDuitnowSecret = process.env.FPAYDUITNOW_SECRETKEY;
const fpayEWalletAPIKEY = process.env.FPAYEWALLET_APIKEY;
const fpayEWalletSecret = process.env.FPAYEWALLET_SECRETKEY;
const webURL = "https://www.bm8my.vip/";
const fpayAPIURL = "https://liveapi.fpay.support/merchant/";
const callbackUrl = "https://api.egm8my.vip/api/surepay/receivedcalled158291";
const transferoutcallbackUrl =
  "https://api.egm8my.vip/api/surepay/receivedtransfercalled168";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateTransactionId(prefix = "") {
  const uuid = uuidv4().replace(/-/g, "").substring(0, 16);
  return prefix ? `${prefix}${uuid}` : uuid;
}

function generateFpayCallbackToken(orderid, amount, currency, secretKey) {
  const string = `${orderid}${amount}${currency}${secretKey}`;
  return crypto.createHash("md5").update(string).digest("hex");
}

async function getFPayAuth(paymentMethod) {
  try {
    let apiKey, secretKey;

    if (paymentMethod === "bank") {
      apiKey = fpayBankAPIKEY;
      secretKey = fpayBankSecret;
    } else if (paymentMethod === "duitnow") {
      apiKey = fpayDuitnowAPIKEY;
      secretKey = fpayDuitnowSecret;
    } else if (paymentMethod === "ewallet") {
      apiKey = fpayEWalletAPIKEY;
      secretKey = fpayEWalletSecret;
    } else {
      apiKey = fpayBankAPIKEY;
      secretKey = fpayBankSecret;
    }

    const payload = {
      username: merchantName,
      api_key: apiKey,
    };

    const response = await axios.post(`${fpayAPIURL}auth`, payload, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (response?.data?.status === true) {
      return {
        success: true,
        data: response.data,
      };
    }

    console.log("Error Getting FPay Auth Token:", response.data);
    return {
      success: false,
      error: response.data?.message || "Failed to get auth token",
    };
  } catch (error) {
    console.error("FPay error in getting auth token:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

router.post("/api/fpay/currency", async (req, res) => {
  try {
    const payload = {
      username: merchantName,
    };

    const response = await axios.post(`${fpayAPIURL}currency`, payload, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    if (!response.data.status) {
      console.log(`FPAY Currency API Error: ${JSON.stringify(response.data)}`);

      return res.status(200).json({
        success: false,
        message: {
          en: "Failed to fetch currency information. Please try again or contact customer service for assistance.",
          zh: "获取货币信息失败，请重试或联系客服以获取帮助。",
          zh_hk: "獲取貨幣信息失敗，請重試或聯絡客服以獲取幫助。",
          ms: "Gagal mendapatkan maklumat mata wang. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          id: "Gagal mengambil informasi mata uang. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: response.data.rate,
      message: {
        en: "Currency information retrieved successfully",
        zh: "成功获取货币信息",
        zh_hk: "成功獲取貨幣信息",
        ms: "Maklumat mata wang berjaya diperoleh",
        id: "Informasi mata uang berhasil diambil",
      },
    });
  } catch (error) {
    console.error(
      `Error in FPAY Currency API - User: ${req.user?.userId}:`,
      error.response?.data || error.message
    );

    return res.status(200).json({
      success: false,
      message: {
        en: "Failed to fetch currency information. Please try again or contact customer service for assistance.",
        zh: "获取货币信息失败，请重试或联系客服以获取帮助。",
        zh_hk: "獲取貨幣信息失敗，請重試或聯絡客服以獲取幫助。",
        ms: "Gagal mendapatkan maklumat mata wang. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        id: "Gagal mengambil informasi mata uang. Silakan coba lagi atau hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post("/api/fpay/getpaymentlink", authenticateToken, async (req, res) => {
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

      const existing = await fpayModal.findOne({ ourRefNo: refno }).lean();
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

    const PAYMENT_METHOD = {
      PbeBank: "bank",
      MayBank: "bank",
      CimbBank: "bank",
      RhbBank: "bank",
      AmBank: "bank",
      HlbBank: "bank",
      BSN: "bank",
      AllianceBank: "bank",
      AffinBank: "bank",
      Tng: "duitnow",
      MayBankQR: "duitnow",
      DuitNowQR: "duitnow",
      GrabPay: "duitnow",
      Boost: "duitnow",
    };
    const fpayAuth = await getFPayAuth(PAYMENT_METHOD[bankCode]);

    if (!fpayAuth.success) {
      console.log(`FPAY API Error: ${fpayAuth}`);

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

    const depositAmt = roundToTwoDecimals(trfAmt);

    const payload = {
      username: user.fullname,
      auth: fpayAuth.data.auth,
      amount: depositAmt,
      currency: "MYR",
      orderid: refno,
      redirect_url: webURL,
      bank_code: bankCode,
      customer_bank_holder_name: user.fullname,
    };

    const response = await axios.post(`${fpayAPIURL}generate_orders`, payload, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    if (response?.data?.status !== true) {
      console.log(`FPAY API Error: ${JSON.stringify(response.data)}`);

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
      PbeBank: "PUBLIC BANK",
      MayBank: "MAYBANK",
      CimbBank: "CIMB",
      RhbBank: "RHB",
      AmBank: "AMBANK",
      HlbBank: "HONG LEONG",
      BSN: "BSN",
      AllianceBank: "ALLIANCE BANK",
      AffinBank: "AFFIN BANK",
      Tng: "TNG",
      MayBankQR: "MAYBANK QR",
      DuitNowQR: "DUITNOW QR",
      GrabPay: "GRABPAY",
      Boost: "BOOST",
    };

    await fpayModal.create({
      ourRefNo: refno,
      paymentGatewayRefNo: fpayAuth.data.order_id,
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
      url: response.data.p_url,
    });
  } catch (error) {
    console.error(
      `Error in FPAY API - User: ${req.user?.userId}, Amount: ${req.body?.trfAmt}:`,
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
});

router.post("/api/fpaymy", async (req, res) => {
  try {
    const {
      order_id,
      amount,
      currency,
      order_status,
      status,
      charge,
      token,
      name,
      type,
    } = req.body;
    console.log("fpay request", req.body);
    return res.status(200).json();
    if (!order_id || amount === undefined || order_status === undefined) {
      console.log("Missing required parameters:", {
        order_id,
        amount,
        order_status,
      });
      return res.status(200).json();
    }

    if (merchantCheck !== merchant_code) {
      return res.status(200).json(req.body);
    }

    const statusMapping = {
      fail: "Reject",
      completed: "Success",
    };

    const statusCode = String(order_status);
    const statusText = statusMapping[statusCode] || "Unknown";
    const roundedAmount = roundToTwoDecimals(amount);
    const platformCharge = roundToTwoDecimals(charge || 0);

    const existingTrx = await fpayModal
      .findOne(
        { ourRefNo: order_id },
        { _id: 1, username: 1, status: 1, createdAt: 1, promotionId: 1 }
      )
      .lean();

    if (!existingTrx) {
      console.log(`Transaction not found: ${order_id}, creating record`);
      await fpayModal.create({
        username: "N/A",
        transfername: "N/A",
        ourRefNo: order_id,
        paymentGatewayRefNo: order_id,
        amount: roundedAmount,
        transactiontype: "deposit",
        status: statusText,
        platformCharge: platformCharge,
        remark: `No transaction found with reference: ${order_id}. Created from callback.`,
      });

      return res.status(200).json(req.body);
    }

    if (order_status === "completed" && existingTrx.status === "Success") {
      console.log("Transaction already processed successfully, skipping");
      return res.status(200).json(req.body);
    }

    if (order_status === "completed" && existingTrx.status !== "Success") {
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
            { name: { $regex: /^fpay$/i } },
            { _id: 1, name: 1, balance: 1 }
          )
          .lean(),

        kioskbalance.findOne({}, { status: 1 }).lean(),

        BankList.findById("69247c9f7ef1ac832d86e65f", {
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
        return res.status(200).json(req.body);
      }

      if (!bank) {
        console.error(`Bank not found: 69247c9f7ef1ac832d86e65f`);
        return res.status(200).json(req.body);
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
          bankname: "FPAY",
          ownername: "Payment Gateway",
          transfernumber: order_id,
          walletType: "Main",
          transactionType: "deposit",
          method: "auto",
          processBy: "admin",
          amount: roundedAmount,
          walletamount: user.wallet,
          remark: "-",
          status: "approved",
          processtime: "00:00:00",
          newDeposit: isNewDeposit,
          transactionId: order_id,
          duplicateIP: user.duplicateIP,
          duplicateBank: user.duplicateBank,
        }),

        fpayModal.findByIdAndUpdate(existingTrx._id, {
          $set: { status: statusText },
        }),

        UserWalletLog.create({
          userId: user._id,
          transactionid: order_id,
          transactiontime: new Date(),
          transactiontype: "deposit",
          amount: roundedAmount,
          status: "approved",
        }),

        paymentgateway.findOneAndUpdate(
          { name: { $regex: /^fpay$/i } },
          { $inc: { balance: roundedAmount } },
          { new: true, projection: { _id: 1, name: 1, balance: 1 } }
        ),

        BankList.findByIdAndUpdate(
          "69247c9f7ef1ac832d86e65f",
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
        gatewayName: gateway?.name || "FPAY",
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
            console.log("FPAY, couldn't find promotion");
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
      await fpayModal.findByIdAndUpdate(existingTrx._id, {
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

router.get("/admin/api/fpaydata", authenticateAdminToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let dateFilter = {};

    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: moment(new Date(startDate)).utc().toDate(),
        $lte: moment(new Date(endDate)).utc().toDate(),
      };
    }

    const dgData = await fpayModal
      .find(dateFilter)
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({
      success: true,
      message: "FPAY retrieved successfully",
      data: dgData,
    });
  } catch (error) {
    console.error("Error retrieving user bonus FPAY:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve bonus FPAY",
      error: error.message,
    });
  }
});
module.exports = router;
