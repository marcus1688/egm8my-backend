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
const luxepayModal = require("../../models/paymentgateway_luxepay.model");
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
const { checkSportPendingMatch } = require("../../helpers/turnoverHelper");

require("dotenv").config();

const luxepayMerchantCode = "bm8my";
const luxepaySecret = process.env.LUXEPAY_SECRET;
const webURL = "https://www.bm8my.vip/";
const luxepayDuitNowAPIURL = "https://qrpayinapi.luxepay.co/DuitNow/Deposit";
const luxepayINAPIURL = "https://btpayinapi.luxepay.co/payin/Depositv2";
const luxepayPAYOUTAPIURL = "https://payoutapi.luxepay.co/Payout/Withdrawal";
const callbackUrl = "https://api.egm8my.vip/api/luxepay/payin";
const banklistID = "69247c9f7ef1ac832d86e65f";

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

const generateWithdrawHash = (
  merchantCode,
  ref_id,
  player_username,
  player_ip,
  currency_code,
  amount,
  bank_code,
  beneficiary_account,
  beneficiary_name,
  secretKey
) => {
  const dataToHash =
    merchantCode +
    ref_id +
    player_username +
    player_ip +
    currency_code +
    amount +
    bank_code +
    beneficiary_account +
    beneficiary_name;

  return CryptoJS.HmacSHA256(dataToHash, secretKey).toString();
};

const generateDuitNowHash = (
  merchantCode,
  refId,
  playerUsername,
  playerIp,
  currencyCode,
  amount,
  clientUrl,
  secretKey
) => {
  const dataToHash =
    merchantCode +
    refId +
    playerUsername +
    playerIp +
    currencyCode +
    amount +
    clientUrl;
  return CryptoJS.HmacSHA256(dataToHash, secretKey).toString();
};

const generateDepositCallbackHash = (
  transaction_id,
  status,
  currency,
  amount,
  created_at,
  secretKey
) => {
  const dataToHash = transaction_id + status + currency + amount + created_at;
  return CryptoJS.HmacSHA256(dataToHash, secretKey).toString();
};

const generateQRPAYCallbackHash = (
  invoiceno,
  receiverbank,
  receiveraccount,
  currency,
  amount,
  paymentdate,
  secretKey
) => {
  const dataToHash =
    invoiceno +
    receiverbank +
    receiveraccount +
    currency +
    amount +
    paymentdate;
  return CryptoJS.HmacSHA256(dataToHash, secretKey).toString();
};

const generateWithdrawCallbackHash = (
  invoiceno,
  status,
  currency,
  amount,
  paymentdate,
  secretKey
) => {
  const dataToHash = invoiceno + status + currency + amount + paymentdate;
  return CryptoJS.HmacSHA256(dataToHash, secretKey).toString();
};

function generateTransactionId(prefix = "") {
  const uuid = uuidv4().replace(/-/g, "").substring(0, 16);
  return prefix ? `${prefix}${uuid}` : uuid;
}
router.post("/api/luxepay/banks", async (req, res) => {
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
        refno = generateTransactionId("bm8");

        const existing = await luxepayModal.findOne({ ourRefNo: refno }).lean();
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

      let APIURL;
      let requestBody;
      let hash;

      if (bankCode === "DUITNOW") {
        let clientIp = req.headers["x-forwarded-for"] || req.ip;
        clientIp = clientIp.split(",")[0].trim();

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
          lang = "my";
        }

        hash = generateDuitNowHash(
          luxepayMerchantCode,
          refno,
          user.fullname,
          clientIp,
          "MYR",
          trfAmt,
          webURL,
          luxepaySecret
        );

        APIURL = luxepayDuitNowAPIURL;

        requestBody = {
          merchant_code: luxepayMerchantCode,
          ref_id: refno,
          player_username: user.fullname,
          player_ip: clientIp,
          currency_code: "MYR",
          amount: trfAmt,
          client_url: webURL,
          hash: hash,
          lang,
        };
      } else {
        hash = generateDepositV2Hash(
          luxepayMerchantCode,
          refno,
          "MYR",
          trfAmt,
          luxepaySecret
        );

        APIURL = luxepayINAPIURL;

        requestBody = {
          MerchantCode: luxepayMerchantCode,
          ReturnURL: webURL,
          FailedReturnURL: webURL,
          HTTPPostURL: callbackUrl,
          Amount: trfAmt,
          Currency: "MYR",
          ItemID: refno,
          ItemDescription: `Top up MYR ${trfAmt} for ${user.username}`,
          PlayerId: user.username,
          Hash: hash,
          BankCode: bankCode,
          ClientFullName: user.fullname,
        };
      }

      const response = await axios.post(`${APIURL}`, requestBody, {
        headers: { "Content-Type": "application/json" },
      });
      if (response.data.message && !response.data.transaction) {
        console.log(`TRUEPay API Error: ${JSON.stringify(response.data)}`);

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

      await Promise.all([
        luxepayModal.create({
          ourRefNo: refno,
          paymentGatewayRefNo: "",
          transfername: user.fullname,
          username: user.username,
          amount: Number(trfAmt),
          transferType: bankCode,
          transactiontype: "deposit",
          status: "Pending",
          platformCharge: 0,
          remark: "-",
          promotionId: promotionId || null,
        }),
      ]);

      const paymentUrl = response.data.redirect_to.replace("redirectlink=", "");

      return res.status(200).json({
        success: true,
        message: {
          en: "Redirecting to payment page...",
          zh: "正在跳转至支付页面...",
          zh_hk: "正在跳緊去支付頁面...",
          ms: "Mengalihkan ke halaman pembayaran...",
          id: "Mengarahkan ke halaman pembayaran...",
        },
        url: paymentUrl,
      });
    } catch (error) {
      console.error(
        `Error in LUXEPAY API - User: ${req.user?.userId}, Amount: ${req.body?.trfAmt}:`,
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

router.post("/api/luxepay/payin", async (req, res) => {
  try {
    const {
      status,
      ItemID,
      Currency,
      decline_reason,
      Amount,
      bank_reference,
      transaction,
      created_at,
      signature2,
    } = req.body;

    if (!ItemID || Amount === undefined || status === undefined) {
      console.log("Missing required parameters:", { ItemID, Amount, status });
      return res.status(200).json({
        error_code: 3,
        message: "Invalid Parameter",
      });
    }

    const ourhash = generateDepositCallbackHash(
      transaction,
      status,
      Currency,
      Amount,
      created_at,
      luxepaySecret
    );

    if (ourhash !== signature2) {
      console.log("invalid hash", ourhash);
      console.log("invalid sign", signature2);
      return res.status(200).json({
        error_code: 4,
        message: "Operation Failed",
      });
    }

    const statusMapping = {
      2: "Reject",
      1: "Success",
      3: "Success",
    };

    const statusCode = String(status);
    const statusText = statusMapping[statusCode] || "Unknown";
    const roundedAmount = roundToTwoDecimals(Amount);

    const existingTrx = await luxepayModal
      .findOne(
        { ourRefNo: ItemID },
        { _id: 1, username: 1, status: 1, createdAt: 1, promotionId: 1 }
      )
      .lean();

    if (!existingTrx) {
      console.log(`Transaction not found: ${ItemID}, creating record`);

      await luxepayModal.create({
        username: "N/A",
        transfername: "N/A",
        ourRefNo: ItemID,
        paymentGatewayRefNo: transaction,
        amount: roundedAmount,
        transactiontype: "deposit",
        status: statusText,
        platformCharge: 0,
        remark: `No transaction found with reference: ${ItemID}. Created from callback.`,
      });

      return res.status(200).json({
        error_code: 1,
        message: "Invalid/Incorrect Transaction",
      });
    }

    if (
      (statusCode === "1" || statusCode === "3") &&
      existingTrx.status === "Success"
    ) {
      console.log("Transaction already processed successfully, skipping");
      return res.status(200).json({
        error_code: 0,
        message: "Operation Success",
      });
    }

    if (
      (statusCode === "1" || statusCode === "3") &&
      existingTrx.status !== "Success"
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
            gameId: 1,
            firstDepositDate: 1,
            duplicateIP: 1,
            duplicateBank: 1,
          }
        ).lean(),

        paymentgateway
          .findOne(
            { name: { $regex: /^luxepay$/i } },
            { _id: 1, name: 1, balance: 1 }
          )
          .lean(),

        kioskbalance.findOne({}, { status: 1 }).lean(),

        BankList.findById(banklistID, {
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
        return res.status(200).json({
          error_code: 4,
          message: "Operation Failed",
        });
      }

      if (!bank) {
        console.error(`Bank not found: 69247c9f7ef1ac832d86e65f`);
        return res.status(200).json({
          error_code: 4,
          message: "Operation Failed",
        });
      }

      const hasSportPendingMatch = await checkSportPendingMatch(user.gameId);
      const isNewCycle = !hasSportPendingMatch && user.wallet <= 5;

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
          bankname: "LUXEPAY",
          ownername: "Payment Gateway",
          transfernumber: transaction,
          walletType: "Main",
          transactionType: "deposit",
          method: "auto",
          processBy: "admin",
          amount: roundedAmount,
          bankid: "69247c9f7ef1ac832d86e65f",
          walletamount: user.wallet,
          remark: "-",
          status: "approved",
          processtime: "00:00:00",
          newDeposit: isNewDeposit,
          transactionId: ItemID,
          duplicateIP: user.duplicateIP,
          duplicateBank: user.duplicateBank,
          isNewCycle: isNewCycle,
        }),

        luxepayModal.findByIdAndUpdate(existingTrx._id, {
          $set: { status: statusText },
        }),

        UserWalletLog.create({
          userId: user._id,
          transactionid: ItemID,
          transactiontime: new Date(),
          transactiontype: "deposit",
          amount: roundedAmount,
          status: "approved",
        }),

        paymentgateway.findOneAndUpdate(
          { name: { $regex: /^luxepay$/i } },
          { $inc: { balance: roundedAmount } },
          { new: true, projection: { _id: 1, name: 1, balance: 1 } }
        ),

        BankList.findByIdAndUpdate(
          banklistID,
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
        gatewayName: gateway?.name || "LUXEPAY",
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
      await luxepayModal.findByIdAndUpdate(existingTrx._id, {
        $set: { status: statusText },
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

router.post("/api/luxepay/qrpay", async (req, res) => {
  try {
    const {
      Status,
      RefId,
      Currency,
      Amount,
      InvoiceNo,
      PaymentDate,
      Signature,
      ReceiverBank,
      ReceiverAccount,
    } = req.body;
    if (!RefId || Amount === undefined || Status === undefined) {
      console.log("Missing required parameters:", { RefId, Amount, Status });
      return res.status(200).json({
        error_code: 3,
        message: "Invalid Parameter",
      });
    }

    const ourhash = generateQRPAYCallbackHash(
      InvoiceNo,
      ReceiverBank,
      ReceiverAccount,
      Currency,
      Amount,
      PaymentDate,
      luxepaySecret
    );

    if (ourhash !== Signature) {
      console.log("invalid hash", ourhash);
      console.log("invalid sign", Signature);
      return res.status(200).json({
        error_code: 4,
        message: "Operation Failed",
      });
    }

    const statusMapping = {
      0: "Pending",
      2: "Reject",
      1: "Success",
      3: "Success",
    };

    const statusCode = String(Status);
    const statusText = statusMapping[statusCode] || "Unknown";
    const roundedAmount = roundToTwoDecimals(Amount);

    const existingTrx = await luxepayModal
      .findOne(
        { ourRefNo: RefId },
        { _id: 1, username: 1, status: 1, createdAt: 1, promotionId: 1 }
      )
      .lean();

    if (!existingTrx) {
      console.log(`Transaction not found: ${RefId}, creating record`);

      await luxepayModal.create({
        username: "N/A",
        transfername: "N/A",
        ourRefNo: RefId,
        paymentGatewayRefNo: InvoiceNo,
        amount: roundedAmount,
        transactiontype: "deposit",
        status: statusText,
        platformCharge: 0,
        remark: `No transaction found with reference: ${RefId}. Created from callback.`,
      });

      return res.status(200).json({
        error_code: 1,
        message: "Invalid/Incorrect Transaction",
      });
    }

    if (
      (statusCode === "1" || statusCode === "3") &&
      existingTrx.status === "Success"
    ) {
      console.log("Transaction already processed successfully, skipping");
      return res.status(200).json({
        error_code: 0,
        message: "Operation Success",
      });
    }

    if (
      (statusCode === "1" || statusCode === "3") &&
      existingTrx.status !== "Success"
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
          .findOne(
            { name: { $regex: /^luxepay$/i } },
            { _id: 1, name: 1, balance: 1 }
          )
          .lean(),

        kioskbalance.findOne({}, { status: 1 }).lean(),

        BankList.findById(banklistID, {
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
        return res.status(200).json({
          error_code: 4,
          message: "Operation Failed",
        });
      }

      if (!bank) {
        console.error(`Bank not found: 69247c9f7ef1ac832d86e65f`);
        return res.status(200).json({
          error_code: 4,
          message: "Operation Failed",
        });
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
          bankname: "LUXEPAY",
          ownername: "Payment Gateway",
          transfernumber: InvoiceNo,
          walletType: "Main",
          transactionType: "deposit",
          method: "auto",
          processBy: "admin",
          amount: roundedAmount,
          bankid: "69247c9f7ef1ac832d86e65f",
          walletamount: user.wallet,
          remark: "-",
          status: "approved",
          processtime: "00:00:00",
          newDeposit: isNewDeposit,
          transactionId: RefId,
          duplicateIP: user.duplicateIP,
          duplicateBank: user.duplicateBank,
        }),

        luxepayModal.findByIdAndUpdate(existingTrx._id, {
          $set: { status: statusText },
        }),

        UserWalletLog.create({
          userId: user._id,
          transactionid: RefId,
          transactiontime: new Date(),
          transactiontype: "deposit",
          amount: roundedAmount,
          status: "approved",
        }),

        paymentgateway.findOneAndUpdate(
          { name: { $regex: /^luxepay$/i } },
          { $inc: { balance: roundedAmount } },
          { new: true, projection: { _id: 1, name: 1, balance: 1 } }
        ),

        BankList.findByIdAndUpdate(
          banklistID,
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
        gatewayName: gateway?.name || "LUXEPAY",
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
      await luxepayModal.findByIdAndUpdate(existingTrx._id, {
        $set: { status: statusText },
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

router.post("/admin/api/luxepay/requesttransfer/:userId", async (req, res) => {
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

    const formattedAmount = Number(amount).toFixed(2);

    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();

    const hash = generateWithdrawHash(
      luxepayMerchantCode,
      transactionId,
      accountHolder,
      clientIp,
      "MYR",
      formattedAmount,
      bankCode,
      accountNumber,
      accountHolder,
      luxepaySecret
    );

    const requestBody = {
      merchant_code: luxepayMerchantCode,
      ref_id: transactionId,
      player_username: accountHolder,
      player_ip: clientIp,
      currency_code: "MYR",
      amount: formattedAmount,
      bank_code: bankCode,
      beneficiary_account: accountNumber,
      beneficiary_name: accountHolder,
      hash,
    };

    const response = await axios.post(`${luxepayPAYOUTAPIURL}`, requestBody, {
      headers: { "Content-Type": "application/json" },
    });

    if (response.data.error_code !== 0) {
      console.log(`LUXPAY API Error: ${JSON.stringify(response.data)}`);

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
      luxepayModal.create({
        ourRefNo: transactionId,
        paymentGatewayRefNo: response.data.invoice_number,
        transfername: user.fullname,
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
      `Error in LUXEPAY API - User: ${req.user?.userId}, Amount: ${req.body?.trfAmt}:`,
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
      { name: { $regex: /^luxepay$/i } },
      { _id: 1, name: 1, balance: 1 }
    )
    .lean();

  if (!gateway) {
    console.error("Gateway not found for withdrawal rejection");
    return;
  }

  const oldGatewayBalance = gateway.balance || 0;

  const updatedGateway = await paymentgateway.findOneAndUpdate(
    { name: { $regex: /^luxepay$/i } },
    { $inc: { balance: roundedAmount } },
    { new: true, projection: { _id: 1, name: 1, balance: 1 } }
  );

  await PaymentGatewayTransactionLog.create({
    gatewayId: gateway._id,
    gatewayName: gateway.name || "LUXEPAY",
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

router.post("/api/luxepay/payout", async (req, res) => {
  try {
    const {
      InvoiceNo,
      Status,
      Currency,
      PaymentDate,
      StatusMessage,
      MerchantCode,
      Signature,
      RefId,
      Amount,
    } = req.body;

    if (!RefId || Amount == undefined || Status === undefined) {
      console.log("Missing required parameters:", {
        RefId,
        Amount,
        Status,
      });
      return res.status(200).json({
        error_code: 3,
        message: "Invalid Parameter",
      });
    }

    const ourhash = generateWithdrawCallbackHash(
      InvoiceNo,
      Status,
      Currency,
      Amount,
      PaymentDate,
      luxepaySecret
    );

    if (ourhash !== Signature) {
      console.log("invalid hash", ourhash);
      console.log("invalid sign", Signature);
      return res.status(200).json({
        error_code: 1001,
        message: "Invalid Signature",
      });
    }

    const statusMapping = {
      0: "Pending",
      2: "Reject",
      1: "Success",
      3: "Success",
    };

    const statusCode = String(Status);
    const statusText = statusMapping[statusCode] || "Unknown";
    const roundedAmount = roundToTwoDecimals(Amount);

    const existingTrx = await luxepayModal
      .findOne(
        { ourRefNo: RefId },
        { _id: 1, username: 1, status: 1, createdAt: 1, promotionId: 1 }
      )
      .lean();

    if (!existingTrx) {
      console.log(`Transaction not found: ${RefId}, creating record`);
      await luxepayModal.create({
        username: "N/A",
        transfername: "N/A",
        ourRefNo: RefId,
        paymentGatewayRefNo: InvoiceNo,
        amount: roundedAmount,
        transactiontype: "withdraw",
        status: statusText,
        platformCharge: 0,
        remark: `No transaction found with reference: ${RefId}. Created from callback.`,
      });

      return res.status(200).json({
        error_code: 1,
        message: "Invalid/Incorrect Transaction",
      });
    }

    if (
      (statusCode === "1" || statusCode === "3") &&
      existingTrx.status === "Success"
    ) {
      console.log("Transaction already processed successfully, skipping");
      return res.status(200).json({
        error_code: 0,
        message: "Operation Success",
      });
    }

    if (
      (statusCode === "1" || statusCode === "3") &&
      existingTrx.status !== "Success"
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
          .findOne(
            { name: { $regex: /^luxepay$/i } },
            { _id: 1, name: 1, balance: 1 }
          )
          .lean(),
      ]);

      if (!user) {
        console.error(`User not found: ${existingTrx.username}`);
        return res.status(200).json({
          error_code: 3,
          message: "Invalid Parameter",
        });
      }

      if (existingTrx.status === "Reject") {
        await handleRejectedWithdrawalApproval(
          existingTrx,
          RefId,
          roundedAmount,
          user
        );
      }

      const oldGatewayBalance = gateway?.balance || 0;

      const [, updatedGateway] = await Promise.all([
        luxepayModal.findByIdAndUpdate(existingTrx._id, {
          $set: { status: statusText },
        }),

        paymentgateway.findOneAndUpdate(
          { name: { $regex: /^luxepay$/i } },
          { $inc: { balance: -roundedAmount } },
          { new: true, projection: { _id: 1, name: 1, balance: 1 } }
        ),
      ]);

      await PaymentGatewayTransactionLog.create({
        gatewayId: gateway?._id,
        gatewayName: gateway?.name || "LUXEPAY",
        transactiontype: "withdraw",
        amount: roundedAmount,
        lastBalance: oldGatewayBalance,
        currentBalance:
          updatedGateway?.balance || oldGatewayBalance - roundedAmount,
        remark: `Withdraw from ${user.username}`,
        playerusername: user.username,
        processby: "system",
      });
    } else if (statusCode === "2" && existingTrx.status !== "Reject") {
      const [, , withdraw, updatedUser] = await Promise.all([
        luxepayModal.findByIdAndUpdate(existingTrx._id, {
          $set: { status: statusText },
        }),

        UserWalletLog.findOneAndUpdate(
          { transactionid: RefId },
          { $set: { status: "cancel" } }
        ),

        Withdraw.findOneAndUpdate(
          { transactionId: RefId },
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
          RefId,
          roundedAmount,
          updatedUser
        );
      }

      if (!withdraw) {
        console.log(`Withdraw not found for RefId: ${RefId}`);
        return res.status(200).json({
          error_code: 3,
          message: "Invalid Parameter",
        });
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
        console.log("Invalid bank luxepay callback");
        return res.status(200).json({
          error_code: 3,
          message: "Invalid Parameter",
        });
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
        `Transaction rejected: ${RefId}, User ${existingTrx.username} refunded ${roundedAmount}, New wallet: ${updatedUser?.wallet}`
      );
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
      error_code: 3,
      message: "Invalid Parameter",
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

      const dgData = await luxepayModal
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
