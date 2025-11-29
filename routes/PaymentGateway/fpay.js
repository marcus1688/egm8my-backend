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
const merchantNameOnlineBanking = "BM8MYG_inf";
const merchantNameDuitnow = "BM8MYD_inf";
const merchantNameEWallet = "BM8MYE_inf";
const fpayBankAPIKEY = process.env.FPAYBANK_APIKEY;
const fpayBankSecret = process.env.FPAYBANK_SECRETKEY;
const fpayDuitnowAPIKEY = process.env.FPAYDUITNOW_APIKEY;
const fpayDuitnowSecret = process.env.FPAYDUITNOW_SECRETKEY;
const fpayEWalletAPIKEY = process.env.FPAYEWALLET_APIKEY;
const fpayEWalletSecret = process.env.FPAYEWALLET_SECRETKEY;
const webURL = "https://www.bm8my.vip/";
const bankIDPG = "69247c9f7ef1ac832d86e65f";
const fpayAPIURL = "https://liveapi.fpay.support/merchant/";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateTransactionId(prefix = "") {
  const uuid = uuidv4().replace(/-/g, "").substring(0, 16);
  return prefix ? `${prefix}${uuid}` : uuid;
}

function generateFpayCallbackToken(orderid, secretKey) {
  const string = `${secretKey}${orderid}`;
  return crypto.createHash("md5").update(string).digest("hex");
}

async function getFPayAuth(paymentMethod) {
  try {
    let apiKey, secretKey, merchantName;
    console.log(paymentMethod);
    if (paymentMethod === "bank") {
      apiKey = fpayBankAPIKEY;
      secretKey = fpayBankSecret;
      merchantName = merchantNameOnlineBanking;
    } else if (paymentMethod === "duitnow") {
      apiKey = fpayDuitnowAPIKEY;
      secretKey = fpayDuitnowSecret;
      merchantName = merchantNameDuitnow;
    } else if (paymentMethod === "ewallet") {
      apiKey = fpayEWalletAPIKEY;
      secretKey = fpayEWalletSecret;
      merchantName = merchantNameEWallet;
    } else {
      apiKey = fpayBankAPIKEY;
      secretKey = fpayBankSecret;
      merchantName = merchantNameOnlineBanking;
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

    console.log("Error Getting FPay Auth Token:");
    console.log(response.data);
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
      paymenttype: PAYMENT_METHOD[bankCode],
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

const FPAY_CONFIG = {
  statusMapping: {
    fail: "Reject",
    completed: "Success",
  },
  typeMapping: {
    deposit: "deposit",
    withdrawal: "withdraw",
  },
  secretKeyMap: {
    bank: fpayBankSecret,
    duitnow: fpayDuitnowSecret,
    ewallet: fpayEWalletSecret,
  },
};

async function validateFpayCallback(req) {
  const { order_id, amount, currency, order_status, payment_type, token } =
    req.body;

  if (
    !order_id ||
    !currency ||
    amount === undefined ||
    order_status === undefined
  ) {
    return { valid: false, status: 400, error: "Missing required parameters" };
  }

  // Find existing transaction
  const existingTrx = await fpayModal
    .findOne(
      { ourRefNo: order_id },
      {
        _id: 1,
        username: 1,
        status: 1,
        createdAt: 1,
        promotionId: 1,
        paymenttype: 1,
      }
    )
    .lean();

  if (!existingTrx) {
    return {
      valid: false,
      status: 404,
      error: "Transaction not found",
      existingTrx: null,
    };
  }

  // Validate token
  const paymentTypeToUse = payment_type || existingTrx.paymenttype;
  const secretKey =
    FPAY_CONFIG.secretKeyMap[paymentTypeToUse] || fpayBankSecret;
  const ourToken = generateFpayCallbackToken(order_id, secretKey);

  if (ourToken !== token) {
    return { valid: false, status: 403, error: "Token validation failed" };
  }

  return { valid: true, existingTrx };
}

async function createMissingTransaction(
  order_id,
  roundedAmount,
  transactionType,
  statusText,
  platformCharge
) {
  await fpayModal.create({
    username: "N/A",
    transfername: "N/A",
    ourRefNo: order_id,
    paymentGatewayRefNo: order_id,
    amount: roundedAmount,
    transactiontype: transactionType,
    status: statusText,
    platformCharge: platformCharge,
    remark: `No transaction found with reference: ${order_id}. Created from callback.`,
  });
}

async function updateLiveTransactions(username, amount) {
  const count = await LiveTransaction.countDocuments({ type: "deposit" });

  if (count >= 5) {
    await LiveTransaction.findOneAndUpdate(
      { type: "deposit" },
      {
        $set: {
          username,
          amount,
          time: new Date(),
        },
      },
      { sort: { time: 1 } }
    );
  } else {
    await LiveTransaction.create({
      type: "deposit",
      username,
      amount,
      time: new Date(),
      status: "completed",
    });
  }
}

// ============================================
// DEPOSIT HANDLERS
// ============================================

async function handleDepositApproval(
  existingTrx,
  order_id,
  roundedAmount,
  platformCharge,
  statusText
) {
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
      .findOne({ name: { $regex: /^fpay$/i } }, { _id: 1, name: 1, balance: 1 })
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

  if (!user)
    throw { status: 404, message: `User not found: ${existingTrx.username}` };
  if (!bank) throw { status: 404, message: `Bank not found: ${bankIDPG}` };

  const isNewDeposit = !user.firstDepositDate;
  const oldGatewayBalance = gateway?.balance || 0;
  const oldBankBalance = bank.currentbalance || 0;

  const [updatedUser, newDeposit, , , updatedGateway, updatedBank] =
    await Promise.all([
      User.findByIdAndUpdate(
        user._id,
        {
          $inc: { wallet: roundedAmount, totaldeposit: roundedAmount },
          $set: {
            lastdepositdate: new Date(),
            ...(isNewDeposit && { firstDepositDate: existingTrx.createdAt }),
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
        $set: { status: statusText, platformCharge: platformCharge },
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
                  { $add: ["$totalWithdrawals", "$totalCashOut"] },
                ],
              },
            },
          },
        ],
        { new: true, projection: { currentbalance: 1 } }
      ).lean(),
    ]);

  // Create bank transaction log
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

  await updateLiveTransactions("deposit", user.username, roundedAmount);

  if (kioskSettings?.status) {
    await updateKioskBalance("subtract", roundedAmount, {
      username: user.username,
      transactionType: "deposit approval",
      remark: `Deposit ID: ${newDeposit._id}`,
      processBy: "admin",
    });
  }

  setImmediate(() => {
    checkAndUpdateVIPLevel(user._id).catch((err) =>
      console.error(`VIP level update error for user ${user._id}:`, err.message)
    );
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
    await handleDepositBonus(
      existingTrx,
      user,
      updatedUser,
      newDeposit,
      roundedAmount,
      kioskSettings
    );
  }
}

async function handleDepositBonus(
  existingTrx,
  user,
  updatedUser,
  newDeposit,
  depositAmount,
  kioskSettings
) {
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
      return;
    }

    let bonusAmount = 0;

    if (promotion.claimtype === "Percentage") {
      bonusAmount =
        (Number(depositAmount) * parseFloat(promotion.bonuspercentage)) / 100;
      if (promotion.maxbonus > 0 && bonusAmount > promotion.maxbonus) {
        bonusAmount = promotion.maxbonus;
      }
    } else if (promotion.claimtype === "Exact") {
      bonusAmount = parseFloat(promotion.bonusexact);
      if (promotion.maxbonus > 0 && bonusAmount > promotion.maxbonus) {
        bonusAmount = promotion.maxbonus;
      }
    }

    if (bonusAmount <= 0) return;

    bonusAmount = roundToTwoDecimals(bonusAmount);
    const bonusTransactionId = uuidv4();

    const [, newBonus] = await Promise.all([
      User.findByIdAndUpdate(user._id, { $inc: { wallet: bonusAmount } }),

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
      await updateKioskBalance("subtract", bonusAmount, {
        username: user.username,
        transactionType: "bonus approval",
        remark: `Bonus ID: ${newBonus._id}`,
        processBy: "admin",
      });
    }
  } catch (error) {
    console.error("Error processing promotion:", error);
  }
}

async function handleRejectedWithdrawalApproval(
  existingTrx,
  order_id,
  roundedAmount,
  user
) {
  const [, withdraw, updatedUser] = await Promise.all([
    UserWalletLog.findOneAndUpdate(
      { transactionid: order_id },
      { $set: { status: "approved" } }
    ),

    Withdraw.findOneAndUpdate(
      { transactionId: order_id },
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
    console.error(`Withdraw record not found for order_id: ${order_id}`);
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
    `Rejected withdrawal re-approved: ${order_id}, User ${existingTrx.username}, Amount: ${roundedAmount}`
  );
}

async function handleApprovedWithdrawalReject(
  existingTrx,
  order_id,
  roundedAmount,
  user
) {
  const gateway = await paymentgateway
    .findOne({ name: { $regex: /^fpay$/i } }, { _id: 1, name: 1, balance: 1 })
    .lean();

  if (!gateway) {
    console.error("Gateway not found for withdrawal rejection");
    return;
  }

  const oldGatewayBalance = gateway.balance || 0;

  const updatedGateway = await paymentgateway.findOneAndUpdate(
    { name: { $regex: /^fpay$/i } },
    { $inc: { balance: roundedAmount } },
    { new: true, projection: { _id: 1, name: 1, balance: 1 } }
  );

  await PaymentGatewayTransactionLog.create({
    gatewayId: gateway._id,
    gatewayName: gateway.name || "FPAY",
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
    `Approved withdrawal re-rejected: ${order_id}, User ${existingTrx.username}, Amount: ${roundedAmount}`
  );
}

// ============================================
// WITHDRAW HANDLERS
// ============================================

async function handleWithdrawApproval(
  existingTrx,
  order_id,
  roundedAmount,
  statusText
) {
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
      .findOne({ name: { $regex: /^fpay$/i } }, { _id: 1, name: 1, balance: 1 })
      .lean(),
  ]);

  if (!user)
    throw { status: 404, message: `User not found: ${existingTrx.username}` };

  if (existingTrx.status === "Reject") {
    await handleRejectedWithdrawalApproval(
      existingTrx,
      order_id,
      roundedAmount,
      user
    );
  }

  const oldGatewayBalance = gateway?.balance || 0;

  const [, updatedGateway] = await Promise.all([
    fpayModal.findByIdAndUpdate(existingTrx._id, {
      $set: { status: statusText },
    }),
    paymentgateway.findOneAndUpdate(
      { name: { $regex: /^fpay$/i } },
      { $inc: { balance: -roundedAmount } },
      { new: true, projection: { _id: 1, name: 1, balance: 1 } }
    ),
  ]);

  await PaymentGatewayTransactionLog.create({
    gatewayId: gateway?._id,
    gatewayName: gateway?.name || "FPAY",
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

async function handleWithdrawReject(
  existingTrx,
  order_id,
  roundedAmount,
  statusText
) {
  const [, , withdraw, updatedUser] = await Promise.all([
    fpayModal.findByIdAndUpdate(existingTrx._id, {
      $set: { status: statusText },
    }),
    UserWalletLog.findOneAndUpdate(
      { transactionid: order_id },
      { $set: { status: "cancel" } }
    ),
    Withdraw.findOneAndUpdate(
      { transactionId: order_id },
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

  // Handle approved withdrawal reject
  if (existingTrx.status === "Success") {
    await handleApprovedWithdrawalReject(
      existingTrx,
      order_id,
      roundedAmount,
      updatedUser
    );
  }

  if (!withdraw)
    throw {
      status: 404,
      message: `Withdraw not found for order_id: ${order_id}`,
    };

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

  if (!bank) throw { status: 404, message: "Invalid bank fpay callback" };

  if (kioskSettings?.status) {
    await updateKioskBalance("subtract", withdraw.amount, {
      username: existingTrx.username,
      transactionType: "withdraw reverted",
      remark: `Withdraw ID: ${withdraw._id}`,
      processBy: "admin",
    });
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
    `Transaction rejected: ${order_id}, User ${existingTrx.username} refunded ${roundedAmount}, New wallet: ${updatedUser?.wallet}`
  );
}

router.post("/api/fpaymy", async (req, res) => {
  try {
    const { order_id, amount, order_status, charge, type } = req.body;

    const roundedAmount = roundToTwoDecimals(amount);
    const platformCharge = roundToTwoDecimals(charge || 0);
    const statusText =
      FPAY_CONFIG.statusMapping[String(order_status)] || "Unknown";
    const transactionType = FPAY_CONFIG.typeMapping[type] || "Unknown";

    // Validate callback
    const validation = await validateFpayCallback(req);
    if (!validation.valid) {
      if (validation.status === 404) {
        await createMissingTransaction(
          order_id,
          roundedAmount,
          transactionType,
          statusText,
          platformCharge
        );
        return res.status(200).json();
      }
      console.log(validation.error);
      return res.status(validation.status).json();
    }

    const { existingTrx } = validation;

    if (order_status === "completed" && existingTrx.status === "Success") {
      console.log("Transaction already processed successfully, skipping");
      return res.status(200).json();
    }

    if (transactionType === "deposit") {
      if (order_status === "completed" && existingTrx.status !== "Success") {
        await handleDepositApproval(
          existingTrx,
          order_id,
          roundedAmount,
          platformCharge,
          statusText
        );
      } else {
        await fpayModal.findByIdAndUpdate(existingTrx._id, {
          $set: { status: statusText, remark: "Payment failed" },
        });
      }
    } else if (transactionType === "withdraw") {
      if (order_status === "completed" && existingTrx.status !== "Success") {
        await handleWithdrawApproval(
          existingTrx,
          order_id,
          roundedAmount,
          statusText
        );
      } else if (order_status === "fail" && existingTrx.status !== "Reject") {
        await handleWithdrawReject(
          existingTrx,
          order_id,
          roundedAmount,
          statusText
        );
      } else {
        await fpayModal.findByIdAndUpdate(existingTrx._id, {
          $set: { status: statusText, remark: "Payment failed" },
        });
      }
    }

    return res.status(200).json();
  } catch (error) {
    if (error.status) {
      console.error(error.message);
      return res.status(error.status).json();
    }

    console.error("Payment callback processing error:", {
      error: error.message,
      body: req.body,
      timestamp: moment().utc().format(),
      stack: error.stack,
    });
    return res.status(500).json();
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
