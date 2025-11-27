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

router.post("/api/skl99/getwithdrawbank", async (req, res) => {
  try {
    const response = await axios.get(
      `${skl99APIURL}/api/transfer_out/get_all_gateways`,
      {
        headers: { "Content-Type": "application/json" },
      }
    );

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

router.post("/api/skldepositprod", async (req, res) => {
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
    const roundedAmount = roundToTwoDecimals(amount);

    const existingTrx = await skl99Modal
      .findOne(
        { ourRefNo: invoice_no },
        { _id: 1, username: 1, status: 1, createdAt: 1, promotionId: 1 }
      )
      .lean();

    if (!existingTrx) {
      console.log(`Transaction not found: ${invoice_no}, creating record`);
      await skl99Modal.create({
        username: "N/A",
        transfername: "N/A",
        ourRefNo: invoice_no,
        paymentGatewayRefNo: transaction_id,
        amount: roundedAmount,
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
            { name: { $regex: /^skl99$/i } },
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
          bankname: "SKL99",
          ownername: "Payment Gateway",
          transfernumber: transaction_id,
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
          transactionId: invoice_no,
          duplicateIP: user.duplicateIP,
          duplicateBank: user.duplicateBank,
        }),

        skl99Modal.findByIdAndUpdate(existingTrx._id, {
          $set: { status: statusText },
        }),

        UserWalletLog.create({
          userId: user._id,
          transactionid: invoice_no,
          transactiontime: new Date(),
          transactiontype: "deposit",
          amount: roundedAmount,
          status: "approved",
        }),

        paymentgateway.findOneAndUpdate(
          { name: { $regex: /^skl99$/i } },
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
        gatewayName: gateway?.name || "SKL99",
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

router.post("/admin/api/skl99/requesttransfer/:userId", async (req, res) => {
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

    const requestBody = {
      api_token: skl99SecretServer1,
      amount: formattedAmount,
      to_bank: bankCode,
      to_bank_account_no: accountNumber,
      account_holder: accountHolder,
      invoice_no: transactionId,
    };

    const response = await axios.post(
      `${skl99APIURL}/api/transfer_out/init`,
      requestBody,
      {
        headers: { "Content-Type": "application/json" },
      }
    );
    if (response.data.code !== "success") {
      console.log(`SKL99 API Error: ${response.data}`);

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
      skl99Modal.create({
        ourRefNo: transactionId,
        paymentGatewayRefNo: response.data.data.vendor_id,
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
      `Error in SKL99 API - User: ${req.user?.userId}, Amount: ${req.body?.amount}:`,
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
  invoice_no,
  roundedAmount,
  user
) {
  const [, withdraw, updatedUser] = await Promise.all([
    UserWalletLog.findOneAndUpdate(
      { transactionid: invoice_no },
      { $set: { status: "approved" } }
    ),

    Withdraw.findOneAndUpdate(
      { transactionId: invoice_no },
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
    console.error(`Withdraw record not found for invoice_no: ${invoice_no}`);
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
    `Rejected withdrawal re-approved: ${invoice_no}, User ${existingTrx.username}, Amount: ${roundedAmount}`
  );
}

async function handleApprovedWithdrawalReject(
  existingTrx,
  invoice_no,
  roundedAmount,
  user
) {
  const gateway = await paymentgateway
    .findOne({ name: { $regex: /^skl99$/i } }, { _id: 1, name: 1, balance: 1 })
    .lean();

  if (!gateway) {
    console.error("Gateway not found for withdrawal rejection");
    return;
  }

  const oldGatewayBalance = gateway.balance || 0;

  const updatedGateway = await paymentgateway.findOneAndUpdate(
    { name: { $regex: /^skl99$/i } },
    { $inc: { balance: roundedAmount } },
    { new: true, projection: { _id: 1, name: 1, balance: 1 } }
  );

  await PaymentGatewayTransactionLog.create({
    gatewayId: gateway._id,
    gatewayName: gateway.name || "SKL99",
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
    `Approved withdrawal re-rejected: ${invoice_no}, User ${existingTrx.username}, Amount: ${roundedAmount}`
  );
}

router.post("/api/sklwithdrawprod", async (req, res) => {
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

    if (!invoice_no || amount == undefined || status === undefined) {
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
    const roundedAmount = roundToTwoDecimals(amount);

    const existingTrx = await skl99Modal
      .findOne(
        { ourRefNo: invoice_no },
        { _id: 1, username: 1, status: 1, createdAt: 1, promotionId: 1 }
      )
      .lean();

    if (!existingTrx) {
      console.log(`Transaction not found: ${invoice_no}, creating record`);
      await skl99Modal.create({
        username: "N/A",
        transfername: "N/A",
        ourRefNo: invoice_no,
        paymentGatewayRefNo: transaction_id,
        amount: roundedAmount,
        transactiontype: "withdraw",
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
            { name: { $regex: /^skl99$/i } },
            { _id: 1, name: 1, balance: 1 }
          )
          .lean(),
      ]);

      if (!user) {
        console.error(`User not found: ${existingTrx.username}`);
        return res.status(200).json(req.body);
      }

      if (existingTrx.status === "Reject") {
        await handleRejectedWithdrawalApproval(
          existingTrx,
          invoice_no,
          roundedAmount,
          user
        );
      }

      const oldGatewayBalance = gateway?.balance || 0;

      const [, updatedGateway] = await Promise.all([
        skl99Modal.findByIdAndUpdate(existingTrx._id, {
          $set: { status: statusText },
        }),

        paymentgateway.findOneAndUpdate(
          { name: { $regex: /^skl99$/i } },
          { $inc: { balance: -roundedAmount } },
          { new: true, projection: { _id: 1, name: 1, balance: 1 } }
        ),
      ]);

      await PaymentGatewayTransactionLog.create({
        gatewayId: gateway?._id,
        gatewayName: gateway?.name || "SKL99",
        transactiontype: "withdraw",
        amount: roundedAmount,
        lastBalance: oldGatewayBalance,
        currentBalance:
          updatedGateway?.balance || oldGatewayBalance - roundedAmount,
        remark: `Withdraw from ${user.username}`,
        playerusername: user.username,
        processby: "system",
      });
    } else if (status === "FAILED" && existingTrx.status !== "Reject") {
      const [, , withdraw, updatedUser] = await Promise.all([
        skl99Modal.findByIdAndUpdate(existingTrx._id, {
          $set: { status: statusText },
        }),

        UserWalletLog.findOneAndUpdate(
          { transactionid: invoice_no },
          { $set: { status: "cancel" } }
        ),

        Withdraw.findOneAndUpdate(
          { transactionId: invoice_no },
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
          invoice_no,
          roundedAmount,
          updatedUser
        );
      }

      if (!withdraw) {
        console.log(`Withdraw not found for invoice_no: ${invoice_no}`);
        return res.status(200).json(req.body);
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
        console.log("Invalid bank skl99 callback");
        return res.status(200).json(req.body);
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
        `Transaction rejected: ${invoice_no}, User ${existingTrx.username} refunded ${roundedAmount}, New wallet: ${updatedUser?.wallet}`
      );
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
