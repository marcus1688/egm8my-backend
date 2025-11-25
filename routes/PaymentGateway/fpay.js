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

module.exports = router;
