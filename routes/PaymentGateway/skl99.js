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
const skl99Modal = require("../../models/paymentgateway_skl99");
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
const merchantCheck = "onehello390@gmail.com";
const skl99SecretServer1 = process.env.SKL99_SECRET_ONE;
const skl99SecretServer2 = process.env.SKL99_SECRET_TWO;
const skl99SecretServer3 = process.env.SKL99_SECRET_THREE;
const skl99SecretMario = process.env.SKL99_SECRET_MARIO;
const skl99SecretMR = process.env.SKL99_SECRET_MR;
const skl99SecretNewServer = process.env.SKL99_SECRET_NEWSERVER;
const webURL = "https://www.oc7.me/";
const skl99APIURL = "https://apiv1.skl99.net";
const callbackUrl = "https://api.oc7.me/api/skl99/receivedcalled158291";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateTransactionId(prefix = "") {
  const uuid = uuidv4().replace(/-/g, "").substring(0, 16);
  return prefix ? `${prefix}${uuid}` : uuid;
}
router.get("/api/skl99/banks", async (req, res) => {
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

        const existing = await skl99Modal.findOne({ ourRefNo: refno }).lean();
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

      const ipResponse = await axios.get("https://api.ipify.org?format=json");
      const actualIP = ipResponse.data.ip;
      const cleanIP = actualIP.trim();

      let apiTokenApply;
      if (cleanIP === "13.228.225.19") {
        apiTokenApply = skl99SecretServer1;
      } else if (cleanIP === "18.142.128.26") {
        apiTokenApply = skl99SecretServer2;
      } else if (cleanIP === "54.254.162.138") {
        apiTokenApply = skl99SecretServer3;
      } else if (cleanIP === "18.141.229.244") {
        apiTokenApply = skl99SecretMario;
      } else if (cleanIP === "18.143.103.48") {
        apiTokenApply = skl99SecretMR;
      } else if (cleanIP === "208.77.246.15") {
        apiTokenApply = skl99SecretNewServer;
      } else {
        console.log(`⚠️ Unknown IP: ${ipResponse.data.ip} `);
      }

      const requestBody = {
        api_token: apiTokenApply,
        amount: trfAmt,
        gateway: bankCode,
        pusername: user.username,
        invoice_no: refno,
        v_user_id: user.fullname,
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
            en: "Failed to generate payment link",
            zh: "生成支付链接失败",
            ms: "Gagal menjana pautan pembayaran",
          },
        });
      }

      await Promise.all([
        skl99Modal.create({
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
          en: "Failed to generate payment link",
          zh: "生成支付链接失败",
          ms: "Gagal menjana pautan pembayaran",
        },
      });
    }
  }
);

// receivedcalled158291
router.post("/api/skl99/deposit", async (req, res) => {
  try {
    console.log("skl99", req.body);
    const {
      reference_no,
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

    const existingTrx = await skl99Modal.findOne({ ourRefNo: invoice_no });

    if (!existingTrx) {
      console.log(`Transaction not found: ${invoice_no}, creating record`);
      await skl99Modal.create({
        username: "N/A",
        ourRefNo: invoice_no,
        amount: Number(amount),
        status: statusText,
        remark: `No transaction found with reference: ${invoice_no}. Created from callback.`,
      });

      return res.status(200).json(req.body);
    }

    if (status === "SUCCESS" && existingTrx.status === "Success") {
      console.log("Transaction already processed successfully, skipping");
      return res.status(200).json(req.body);
    }

    if (status === "SUCCESS" && existingTrx.status !== "Success") {
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
          bankname: "SKL99",
          ownername: "Payment Gateway",
          transfernumber: uuidv4(),
          walletType: "Main",
          transactionType: "deposit",
          method: "auto",
          processBy: "admin",
          amount: Number(amount),
          remark: "-",
          transactionId: invoice_no,
          status: "approved",
          processtime: "00:00:00",
          newDeposit: isNewDeposit,
        }),

        // Update transaction status
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
            console.log("LUXEPAY, couldn't find promotion");
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
