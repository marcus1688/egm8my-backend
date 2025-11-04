const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { authenticateToken } = require("../auth/auth");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { adminUser } = require("../models/adminuser.model");
const Deposit = require("../models/deposit.model");
const { general } = require("../models/general.model");
const { checkSportPendingMatch } = require("../helpers/turnoverHelper");
const { v4: uuidv4 } = require("uuid");
const Bonus = require("../models/bonus.model");
const BankList = require("../models/banklist.model");
const { User } = require("../models/users.model");
const UserWalletLog = require("../models/userwalletlog.model");
const Promotion = require("../models/promotion.model");
const moment = require("moment");
const {
  checkGW99Balance,
  checkAlipayBalance,
  checkLionKingBalance,
} = require("../services/game");
const Withdraw = require("../models/withdraw.model");

require("dotenv").config();
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const upload = multer({ storage: multer.memoryStorage() });
async function uploadFileToS3(file) {
  const folderPath = "deposits/";
  const fileKey = `${folderPath}${Date.now()}_${file.originalname}`;
  const uploadParams = {
    Bucket: process.env.S3_MAINBUCKET,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  await s3Client.send(new PutObjectCommand(uploadParams));
  return `https://${process.env.S3_MAINBUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
}

async function submitLuckySpin(
  userId,
  depositId,
  status = "pending",
  method = "manual",
  processtime = "PENDING",
  paymentMethod = "manual"
) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      console.error("User not found when submitting lucky spin bonus");
      return false;
    }
    const promotionId = "681ad49732b843d7a5995f70";
    const promotion = await Promotion.findById(promotionId);
    if (!promotion) {
      console.error("Lucky Spin promotion not found");
      return false;
    }
    const bonusAmount = user.luckySpinAmount;
    const transactionId = uuidv4();

    const [GW99Result, AlipayResult, LionKingResult] = await Promise.all([
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

    const totalWalletAmount = Number(user.wallet || 0) + totalGameBalance;
    const hasSportPendingMatch = await checkSportPendingMatch(user.gameId);
    const isNewCycle = !hasSportPendingMatch && user.wallet <= 5;
    const NewBonusTransaction = new Bonus({
      transactionId: transactionId,
      userId: userId,
      username: user.username,
      fullname: user.fullname,
      transactionType: "bonus",
      processBy: "system",
      amount: bonusAmount,
      walletamount: totalWalletAmount,
      status: status,
      method: method,
      remark: "-",
      promotionname: promotion.maintitle,
      promotionnameEN: promotion.maintitleEN,
      promotionId: promotionId,
      depositId,
      isLuckySpin: true,
      processtime,
      duplicateIP: user.duplicateIP,
      isNewCycle: isNewCycle,
    });
    await NewBonusTransaction.save();
    const walletLog = new UserWalletLog({
      userId: userId,
      transactionid: transactionId,
      transactiontime: new Date(),
      transactiontype: "bonus",
      amount: bonusAmount,
      status: status,
      promotionnameCN: promotion.maintitle,
      promotionnameEN: promotion.maintitleEN,
    });
    await walletLog.save();

    // if (paymentMethod === "auto") {
    //   await User.findOneAndUpdate(
    //     {
    //       _id: userId,
    //     },
    //     {
    //       $inc: { wallet: user.luckySpinAmount },
    //       $set: {
    //         luckySpinClaim: true,
    //       },
    //     }
    //   );
    // }

    return true;
  } catch (error) {
    console.error("Error submitting lucky spin bonus:", error);
    return false;
  }
}

// Customer Submit Deposit
router.post(
  "/api/deposit",
  authenticateToken,
  upload.single("receipt"),
  async (req, res) => {
    if (!req.file) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Please upload a receipt",
          zh: "请上传收据",
          ms: "Sila muat naik resit",
        },
      });
    }
    try {
      const userId = req.user.userId;

      const [user, existingPendingDeposit] = await Promise.all([
        User.findById(userId),
        Deposit.findOne({ userId: userId, status: "pending" }),
      ]);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found, please contact customer service",
            zh: "找不到用户，请联系客服",
            ms: "Pengguna tidak dijumpai, sila hubungi khidmat pelanggan",
          },
        });
      }

      if (existingPendingDeposit) {
        return res.status(200).json({
          success: false,
          message: {
            en: "You already have a pending deposit. Please wait for it to be processed",
            zh: "您已有一笔待处理的存款，请等待处理完成",
            ms: "Anda sudah mempunyai deposit yang belum selesai. Sila tunggu sehingga ia diproses",
          },
        });
      }

      const generalSettings = await general.findOne();
      const minDeposit = generalSettings?.minDeposit || 10;
      const maxDeposit = generalSettings?.maxDeposit || 0;

      if (req.body.depositAmount < minDeposit) {
        return res.status(200).json({
          success: false,
          message: {
            en: `Minimum deposit amount is RM${minDeposit}`,
            zh: `最低存款金额为RM${minDeposit}`,
            ms: `Jumlah deposit minimum adalah RM${minDeposit}`,
          },
        });
      }

      if (maxDeposit > 0 && req.body.depositAmount > maxDeposit) {
        return res.status(200).json({
          success: false,
          message: {
            en: `Maximum deposit amount is RM${maxDeposit}`,
            zh: `最高存款金额为RM${maxDeposit}`,
            ms: `Jumlah deposit maksimum adalah RM${maxDeposit}`,
          },
        });
      }

      // if (req.body.depositAmount > 10000) {
      //   return res.status(200).json({
      //     success: false,
      //     message: {
      //       en: "Deposit amount exceeds the limit of $10,000",
      //       zh: "存款金额超过$10,000的限制",
      //       ms: "Jumlah deposit melebihi had $10,000",
      //     },
      //   });
      // }

      // After: Catches errors but continues process

      const [GW99Result, AlipayResult, imageUrl, LionKingResult] =
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
          uploadFileToS3(req.file),
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

      const totalWalletAmount = Number(user.wallet || 0) + totalGameBalance;

      const transactionId = uuidv4();
      const hasSportPendingMatch = await checkSportPendingMatch(user.gameId);
      const isNewCycle = !hasSportPendingMatch && user.wallet <= 5;
      const [deposit] = await Promise.all([
        new Deposit({
          userId: userId,
          username: user.username || "unknown",
          fullname: user.fullname || "unknown",
          bankname: req.body.bankname || "unknown",
          ownername: req.body.ownername || "unknown",
          transfernumber: req.body.transferNumber,
          walletamount: totalWalletAmount,
          bankid: req.body.bankid,
          walletType: "Main",
          transactionType: "deposit",
          method: "manual",
          processBy: "admin",
          amount: req.body.depositAmount,
          imageUrl,
          duplicateIP: user.duplicateIP,
          remark: req.body.remark || "-",
          transactionId: transactionId,
          isNewCycle: isNewCycle,
          balanceFetchErrors:
            Object.keys(balanceFetchErrors).length > 0
              ? balanceFetchErrors
              : null,
        }).save(),

        new UserWalletLog({
          userId: userId,
          transactionid: transactionId,
          transactiontime: new Date(),
          transactiontype: "deposit",
          amount: parseFloat(req.body.depositAmount),
          status: "pending",
        }).save(),
      ]);

      if (
        parseFloat(req.body.depositAmount) === 30 &&
        user.luckySpinAmount > 0 &&
        user.luckySpinClaim === false
      ) {
        await submitLuckySpin(userId, deposit._id);
      }

      return res.status(200).json({
        success: true,
        depositId: deposit._id,
        message: {
          en: "Deposit submitted successfully",
          zh: "存款提交成功",
          ms: "Deposit berjaya dihantar",
        },
      });
    } catch (error) {
      console.error("Error during submit deposit:", error);
      res.status(500).send({
        success: false,
        message: {
          en: "Failed to submit deposit",
          zh: "存款提交失败",
          ms: "Gagal menghantar deposit",
        },
      });
    }
  }
);

// Admin Submit Deposit
router.post("/admin/api/deposit", authenticateAdminToken, async (req, res) => {
  try {
    const adminId = req.user.userId;
    const adminuser = await adminUser.findById(adminId);
    if (!adminuser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Admin User not found, please contact customer service",
          zh: "找不到管理员用户，请联系客服",
        },
      });
    }
    const { userid, username, bankid, amount } = req.body;
    if (!userid || !username || !bankid || !amount) {
      return res.status(200).json({
        success: false,
        message: {
          en: "All fields are required",
          zh: "所有字段都是必填的",
        },
      });
    }

    const generalSettings = await general.findOne();
    const minDeposit = generalSettings?.minDeposit || 20;
    const maxDeposit = generalSettings?.maxDeposit || 0;

    if (parseFloat(amount) < minDeposit) {
      return res.status(200).json({
        success: false,
        message: {
          en: `Minimum deposit amount is ${minDeposit}`,
          zh: `最低存款金额为 ${minDeposit}`,
        },
      });
    }

    if (maxDeposit > 0 && parseFloat(amount) > maxDeposit) {
      return res.status(200).json({
        success: false,
        message: {
          en: `Maximum deposit amount is ${maxDeposit}`,
          zh: `最高存款金额为 ${maxDeposit}`,
        },
      });
    }

    const user = await User.findById(userid);
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found",
          zh: "找不到用户",
        },
      });
    }
    const bank = await BankList.findById(bankid);
    if (!bank) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Bank information not found",
          zh: "找不到银行信息",
        },
      });
    }
    const transactionId = uuidv4();

    const [GW99Result, AlipayResult, LionKingResult] = await Promise.all([
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

    const totalWalletAmount = Number(user.wallet || 0) + totalGameBalance;
    const hasSportPendingMatch = await checkSportPendingMatch(user.gameId);
    const isNewCycle = !hasSportPendingMatch && user.wallet <= 5;
    const deposit = new Deposit({
      userId: userid,
      username: username,
      fullname: user.fullname,
      bankname: bank.bankname,
      ownername: bank.ownername,
      transfernumber: bank.bankaccount,
      walletType: "Main",
      method: "manual",
      transactionType: "deposit",
      processBy: "admin",
      amount: parseFloat(amount),
      walletamount: totalWalletAmount,
      imageUrl: null,
      remark: "CS",
      transactionId: transactionId,
      bankid: bankid,
      status: "pending",
      duplicateIP: user.duplicateIP,
      isNewCycle: isNewCycle,
    });
    await deposit.save();

    const walletLog = new UserWalletLog({
      userId: userid,
      transactionid: deposit.transactionId,
      transactiontime: new Date(),
      transactiontype: "deposit",
      amount: parseFloat(amount),
      status: "pending",
    });
    await walletLog.save();

    res.status(200).json({
      success: true,
      depositId: deposit._id,
      message: {
        en: "Deposit submitted successfully",
        zh: "存款提交成功",
      },
      data: {
        transactionId: deposit.transactionId,
        amount: deposit.amount,
        status: deposit.status,
        createdAt: deposit.createdAt,
      },
    });
  } catch (error) {
    console.error("Error during submit deposit:", error);
    res.status(200).json({
      success: false,
      message: {
        en: "Error submitting deposit",
        zh: "提交存款时出错",
      },
      error: error.toString(),
    });
  }
});

// Admin Get User Deposit Logs
router.get(
  "/admin/api/user/:userId/deposits",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      const { startDate, endDate } = req.query;

      const dateFilter = {
        username: user.username,
      };
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }

      const deposits = await Deposit.find(dateFilter)
        .sort({ createdAt: -1 })
        .lean();
      res.status(200).json({
        success: true,
        message: "Deposits retrieved successfully",
        data: deposits,
      });
    } catch (error) {
      console.error("Error retrieving user deposits:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve deposits",
        error: error.message,
      });
    }
  }
);

// User Get Last 5 Deposits Logs
router.get("/api/depositslogs", async (req, res) => {
  try {
    const deposits = await Deposit.find({ status: "approved" })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("amount username");
    const processedDeposits = deposits.map((deposit) => {
      let username = deposit.username;
      if (username.startsWith("6")) {
        username = username.substring(1);
      }
      if (username.length > 6) {
        username =
          username.substring(0, 3) +
          "****" +
          username.substring(username.length - 3);
      }
      return {
        amount: deposit.amount,
        username: username,
      };
    });
    res.status(200).json({
      success: true,
      message: "Deposits fetched successfully",
      data: processedDeposits,
    });
  } catch (error) {
    console.error("Error fetching deposits", error);
    res.status(500).json({
      success: false,
      message: "Error fetching deposits",
    });
  }
});

// 只是獲取APPROVED OR REJECTED的存款數據而已
router.get("/api/filterdeposits", async (req, res) => {
  try {
    const deposits = await Deposit.find({
      $or: [{ status: "APPROVED" }, { status: "REJECTED" }],
    });
    res.status(200).json({
      authorized: true,
      message: "Deposits fetched successfully",
      data: deposits,
    });
  } catch (error) {
    console.error("Error fetching deposits", error);
    res
      .status(200)
      .json({ message: "Error fetching deposits", error: error.toString() });
  }
});

// 检查用户是否有PENDING存款
router.get("/api/checkPendingDeposit/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(200).json({ message: "用户不存在。" });
    }

    const pendingDeposits = await Deposit.find({
      userId: userId,
      status: "pending",
    });

    const hasPendingDeposits = pendingDeposits.length > 0;

    res.status(200).json({
      authorized: true,
      message: "未决存款检查完成。",
      hasPendingDeposits: hasPendingDeposits,
    });
  } catch (error) {
    console.error("检查未决存款时发生错误：", error);
    res.status(200).json({
      message: "检查未决存款时发生内部服务器错误。",
      error: error.toString(),
    });
  }
});

// Fast Deposit Restriction
router.get(
  "/api/check-fast-deposit-restriction",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found",
            zh: "用户不存在",
            ms: "Pengguna tidak dijumpai",
          },
        });
      }
      const [lastDeposit, lastWithdraw, lastBonus] = await Promise.all([
        Deposit.findOne({ userId }).sort({ createdAt: -1 }),
        Withdraw.findOne({ userId }).sort({ createdAt: -1 }),
        Bonus.findOne({ userId }).sort({ createdAt: -1 }),
      ]);
      const transactions = [];
      if (lastDeposit) {
        transactions.push({
          type: "deposit",
          date: lastDeposit.createdAt,
          id: lastDeposit._id,
          data: lastDeposit,
        });
      }
      if (lastWithdraw) {
        transactions.push({
          type: "withdraw",
          date: lastWithdraw.createdAt,
          id: lastWithdraw._id,
          data: lastWithdraw,
        });
      }
      if (lastBonus) {
        transactions.push({
          type: "bonus",
          date: lastBonus.createdAt,
          id: lastBonus._id,
          data: lastBonus,
        });
      }
      if (transactions.length === 0) {
        return res.status(200).json({
          success: true,
          hasRestriction: false,
          reason: "No previous transactions",
        });
      }
      transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
      const lastTransaction = transactions[0];
      let hasRestriction = false;
      let reason = "";
      switch (lastTransaction.type) {
        case "withdraw":
          hasRestriction = false;
          reason = "Last transaction is withdraw - no restriction";
          break;
        case "bonus":
          hasRestriction = true;
          reason = "Last transaction is bonus - restriction applies";
          break;

        case "deposit":
          if (lastBonus && lastBonus.depositId) {
            if (lastBonus.depositId.toString() === lastDeposit._id.toString()) {
              hasRestriction = true;
              reason =
                "Last deposit has associated bonus - restriction applies";
            } else {
              hasRestriction = false;
              reason = "Last deposit has no associated bonus - no restriction";
            }
          } else {
            hasRestriction = false;
            reason = "No bonus associated with last deposit - no restriction";
          }
          break;
        default:
          hasRestriction = false;
          reason = "Unknown transaction type - no restriction";
      }
      return res.status(200).json({
        success: true,
        hasRestriction,
        reason,
        lastTransactionType: lastTransaction.type,
        lastTransactionDate: lastTransaction.date,
        userWallet: user.wallet,
      });
    } catch (error) {
      console.error("Error checking fast deposit restriction:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "Failed to check deposit restriction",
          zh: "检查存款限制失败",
          ms: "Gagal memeriksa sekatan deposit",
        },
        error: error.message,
      });
    }
  }
);

// Admin Get Consecutive Deposit User
router.get(
  "/admin/api/consecutive-deposit-users",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { minAmount = 50 } = req.query;
      const today = moment().tz("Asia/Kuala_Lumpur");
      const todayStr = today.format("YYYY-MM-DD");
      const startDate = moment(today).subtract(30, "days").startOf("day");
      const endDate = moment(today).endOf("day");
      const deposits = await Deposit.find({
        status: "approved",
        reverted: false,
        createdAt: {
          $gte: startDate.utc().toDate(),
          $lte: endDate.utc().toDate(),
        },
      })
        .select("username userId amount createdAt")
        .sort({ createdAt: 1 })
        .lean();
      const userDeposits = {};
      deposits.forEach((deposit) => {
        const username = deposit.username;
        if (!userDeposits[username]) {
          userDeposits[username] = {
            userId: deposit.userId,
            deposits: [],
          };
        }
        const depositDate = moment(deposit.createdAt)
          .tz("Asia/Kuala_Lumpur")
          .format("YYYY-MM-DD");
        userDeposits[username].deposits.push({
          amount: deposit.amount,
          date: depositDate,
          createdAt: deposit.createdAt,
        });
      });
      const consecutiveUsers = [];
      Object.keys(userDeposits).forEach((username) => {
        const userInfo = userDeposits[username];
        const dailyDeposits = {};
        userInfo.deposits.forEach((deposit) => {
          const date = deposit.date;
          if (!dailyDeposits[date]) {
            dailyDeposits[date] = 0;
          }
          dailyDeposits[date] += deposit.amount;
        });
        let consecutiveDays = 0;
        let currentDate = moment(today);
        const streakDetails = [];
        while (consecutiveDays < 30) {
          const dateStr = currentDate.format("YYYY-MM-DD");
          const dayAmount = dailyDeposits[dateStr] || 0;
          if (dayAmount >= minAmount) {
            consecutiveDays++;
            streakDetails.unshift({
              date: dateStr,
              amount: dayAmount,
            });
          } else {
            break;
          }
          currentDate.subtract(1, "day");
        }
        if (consecutiveDays >= 2) {
          const totalAmount = streakDetails.reduce(
            (sum, day) => sum + day.amount,
            0
          );
          const avgAmount = totalAmount / streakDetails.length;
          consecutiveUsers.push({
            username,
            userId: userInfo.userId,
            consecutiveDays,
            startDate: streakDetails[0].date,
            endDate: streakDetails[streakDetails.length - 1].date,
            totalAmount: parseFloat(totalAmount.toFixed(2)),
            avgDailyAmount: parseFloat(avgAmount.toFixed(2)),
            dailyBreakdown: streakDetails,
            isActiveToday:
              streakDetails[streakDetails.length - 1].date === todayStr,
          });
        }
      });
      consecutiveUsers.sort((a, b) => {
        if (a.isActiveToday && !b.isActiveToday) return -1;
        if (!a.isActiveToday && b.isActiveToday) return 1;
        if (a.consecutiveDays >= 7 && b.consecutiveDays < 7) return -1;
        if (a.consecutiveDays < 7 && b.consecutiveDays >= 7) return 1;
        return b.consecutiveDays - a.consecutiveDays;
      });
      const sevenDayUsers = consecutiveUsers.filter(
        (user) => user.consecutiveDays >= 7
      );
      const twoToSixDayUsers = consecutiveUsers.filter(
        (user) => user.consecutiveDays >= 2 && user.consecutiveDays < 7
      );
      const activeTodayUsers = consecutiveUsers.filter(
        (user) => user.isActiveToday
      );
      const resultData = {
        summary: {
          total: consecutiveUsers.length,
          sevenDayUsers: sevenDayUsers.length,
          twoToSixDayUsers: twoToSixDayUsers.length,
          activeTodayUsers: activeTodayUsers.length,
          queryDate: todayStr,
          minAmount: parseFloat(minAmount),
        },
        sevenDayConsecutive: sevenDayUsers,
        twoToSixDayConsecutive: twoToSixDayUsers,
        allConsecutive: consecutiveUsers,
      };
      const finalResult =
        sevenDayUsers.length > 0
          ? {
              ...resultData,
              primary: sevenDayUsers,
              message: {
                en: `Found ${sevenDayUsers.length} users with 7+ consecutive deposit days (until ${todayStr})`,
                zh: `找到 ${sevenDayUsers.length} 个连续存款7天以上的用户（截至${todayStr}）`,
              },
            }
          : {
              ...resultData,
              primary: twoToSixDayUsers,
              message: {
                en: `No 7-day consecutive users found. Showing ${twoToSixDayUsers.length} users with 2+ consecutive deposit days (until ${todayStr})`,
                zh: `未找到连续7天存款用户。显示 ${twoToSixDayUsers.length} 个连续存款2天以上的用户（截至${todayStr}）`,
              },
            };

      res.status(200).json({
        success: true,
        message: finalResult.message,
        data: finalResult,
      });
    } catch (error) {
      console.error("Error fetching consecutive deposit users:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to fetch consecutive deposit users",
          zh: "获取连续存款用户失败",
        },
        error: error.message,
      });
    }
  }
);

// Admin Submit Checkin Bonus
router.post(
  "/admin/api/submit-checkin-bonus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;
      const promotionId = "68a834e98c7c0b0fd3bfc317";
      const bonusAmount = 50;
      if (!promotionId) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion ID is required",
            zh: "促销ID为必填项",
            ms: "ID promosi diperlukan",
          },
        });
      }
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found, please contact customer service",
            zh: "找不到用户，请联系客服",
            ms: "Pengguna tidak dijumpai, sila hubungi khidmat pelanggan",
          },
        });
      }
      const promotion = await Promotion.findById(promotionId);
      if (!promotion) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion not found",
            zh: "找不到促销活动",
            ms: "Promosi tidak dijumpai",
          },
        });
      }
      if (user.wallet >= 1) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Wallet balance must be less than RM 1.00 to claim checkin bonus",
            zh: "钱包余额必须少于RM 1.00才能申请签到奖金",
            ms: "Baki dompet mestilah kurang daripada RM 1.00 untuk menuntut bonus daftar masuk",
          },
          data: {
            currentBalance: user.wallet,
            maxAllowedBalance: 1,
          },
        });
      }
      const today = moment().tz("Asia/Kuala_Lumpur");
      const todayStr = today.format("YYYY-MM-DD");
      if (user.lastcheckinbonus) {
        const lastCheckinDate = moment(user.lastcheckinbonus)
          .tz("Asia/Kuala_Lumpur")
          .format("YYYY-MM-DD");
        if (lastCheckinDate === todayStr) {
          return res.status(200).json({
            success: false,
            message: {
              en: "You have already claimed checkin bonus today",
              zh: "您今天已经申请过签到奖金",
              ms: "Anda telah menuntut bonus daftar masuk hari ini",
            },
          });
        }
      }
      const minAmount = 50;
      let startDate;
      if (user.lastcheckinbonus) {
        startDate = moment(user.lastcheckinbonus)
          .tz("Asia/Kuala_Lumpur")
          .add(1, "day")
          .startOf("day");
      } else {
        startDate = moment(today).subtract(30, "days").startOf("day");
      }
      const endDate = moment(today).endOf("day");
      const deposits = await Deposit.find({
        userId: userId,
        status: "approved",
        reverted: false,
        createdAt: {
          $gte: startDate.utc().toDate(),
          $lte: endDate.utc().toDate(),
        },
      })
        .select("amount createdAt")
        .sort({ createdAt: 1 })
        .lean();
      const dailyDeposits = {};
      deposits.forEach((deposit) => {
        const date = moment(deposit.createdAt)
          .tz("Asia/Kuala_Lumpur")
          .format("YYYY-MM-DD");
        if (!dailyDeposits[date]) {
          dailyDeposits[date] = 0;
        }
        dailyDeposits[date] += deposit.amount;
      });
      let consecutiveDays = 0;
      let currentDate = moment(today);
      while (consecutiveDays < 30) {
        const dateStr = currentDate.format("YYYY-MM-DD");
        const dayAmount = dailyDeposits[dateStr] || 0;
        if (dayAmount >= minAmount) {
          consecutiveDays++;
        } else {
          break;
        }

        currentDate.subtract(1, "day");
      }
      if (consecutiveDays < 7) {
        return res.status(200).json({
          success: false,
          message: {
            en: `You need 7 consecutive deposit days to claim this bonus. Current: ${consecutiveDays} days`,
            zh: `您需要连续存款7天才能申请此奖金。当前: ${consecutiveDays} 天`,
            ms: `Anda perlu 7 hari deposit berturut-turut untuk menuntut bonus ini. Semasa: ${consecutiveDays} hari`,
          },
          data: {
            requiredDays: 7,
            currentConsecutiveDays: consecutiveDays,
            minDailyAmount: minAmount,
          },
        });
      }

      const transactionId = uuidv4();
      const hasSportPendingMatch = await checkSportPendingMatch(user.gameId);
      const isNewCycle = !hasSportPendingMatch && user.wallet <= 5;
      const newBonusTransaction = new Bonus({
        transactionId: transactionId,
        userId: userId,
        username: user.username,
        fullname: user.fullname,
        transactionType: "bonus",
        processBy: "system",
        amount: bonusAmount,
        walletamount: user.wallet,
        status: "pending",
        method: "manual",
        remark: `Check In bonus`,
        promotionname: promotion.maintitle,
        promotionnameEN: promotion.maintitleEN,
        promotionId: promotionId,
        isCheckinBonus: true,
        processtime: "00:00:00",
        isNewCycle: isNewCycle,
      });
      await newBonusTransaction.save();
      const walletLog = new UserWalletLog({
        userId: userId,
        transactionid: transactionId,
        transactiontime: new Date(),
        transactiontype: "bonus",
        amount: bonusAmount,
        status: "pending",
        promotionnameCN: promotion.maintitle,
        promotionnameEN: promotion.maintitleEN,
      });
      await walletLog.save();
      res.status(200).json({
        success: true,
        message: {
          en: `Checkin bonus of ${bonusAmount} submitted successfully! You have ${consecutiveDays} consecutive deposit days.`,
          zh: `签到奖金 ${bonusAmount} 申请成功！您已连续存款 ${consecutiveDays} 天。`,
          ms: `Bonus daftar masuk ${bonusAmount} berjaya dihantar! Anda mempunyai ${consecutiveDays} hari deposit berturut-turut.`,
        },
        data: {
          transactionId: transactionId,
          bonusAmount: bonusAmount,
          consecutiveDays: consecutiveDays,
          status: "pending",
          promotionName: promotion.maintitleEN,
        },
      });
    } catch (error) {
      console.error("Error submitting checkin bonus:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to submit checkin bonus",
          zh: "签到奖金申请失败",
          ms: "Gagal menghantar bonus daftar masuk",
        },
        error: error.message,
      });
    }
  }
);

// Client Submit Check In Bonus
router.post(
  "/api/submit-checkin-bonus",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const promotionId = "68a834e98c7c0b0fd3bfc317";
      const bonusAmount = 50;
      if (!promotionId) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion ID is required",
            zh: "促销ID为必填项",
            ms: "ID promosi diperlukan",
          },
        });
      }
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found, please contact customer service",
            zh: "找不到用户，请联系客服",
            ms: "Pengguna tidak dijumpai, sila hubungi khidmat pelanggan",
          },
        });
      }
      const promotion = await Promotion.findById(promotionId);
      if (!promotion) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Promotion not found",
            zh: "找不到促销活动",
            ms: "Promosi tidak dijumpai",
          },
        });
      }
      if (user.wallet >= 1) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Wallet balance must be less than RM 1.00 to claim checkin bonus",
            zh: "钱包余额必须少于RM 1.00才能申请签到奖金",
            ms: "Baki dompet mestilah kurang daripada RM 1.00 untuk menuntut bonus daftar masuk",
          },
          data: {
            currentBalance: user.wallet,
            maxAllowedBalance: 1,
          },
        });
      }
      const today = moment().tz("Asia/Kuala_Lumpur");
      const todayStr = today.format("YYYY-MM-DD");
      if (user.lastcheckinbonus) {
        const lastCheckinDate = moment(user.lastcheckinbonus)
          .tz("Asia/Kuala_Lumpur")
          .format("YYYY-MM-DD");
        if (lastCheckinDate === todayStr) {
          return res.status(200).json({
            success: false,
            message: {
              en: "You have already claimed checkin bonus today",
              zh: "您今天已经申请过签到奖金",
              ms: "Anda telah menuntut bonus daftar masuk hari ini",
            },
          });
        }
      }
      const minAmount = 50;
      let startDate;
      if (user.lastcheckinbonus) {
        startDate = moment(user.lastcheckinbonus)
          .tz("Asia/Kuala_Lumpur")
          .add(1, "day")
          .startOf("day");
      } else {
        startDate = moment(today).subtract(30, "days").startOf("day");
      }
      const endDate = moment(today).endOf("day");
      const deposits = await Deposit.find({
        userId: userId,
        status: "approved",
        reverted: false,
        createdAt: {
          $gte: startDate.utc().toDate(),
          $lte: endDate.utc().toDate(),
        },
      })
        .select("amount createdAt")
        .sort({ createdAt: 1 })
        .lean();
      const dailyDeposits = {};
      deposits.forEach((deposit) => {
        const date = moment(deposit.createdAt)
          .tz("Asia/Kuala_Lumpur")
          .format("YYYY-MM-DD");
        if (!dailyDeposits[date]) {
          dailyDeposits[date] = 0;
        }
        dailyDeposits[date] += deposit.amount;
      });
      let consecutiveDays = 0;
      let currentDate = moment(today);
      while (consecutiveDays < 30) {
        const dateStr = currentDate.format("YYYY-MM-DD");
        const dayAmount = dailyDeposits[dateStr] || 0;
        if (dayAmount >= minAmount) {
          consecutiveDays++;
        } else {
          break;
        }

        currentDate.subtract(1, "day");
      }
      if (consecutiveDays < 7) {
        return res.status(200).json({
          success: false,
          message: {
            en: `You need 7 consecutive deposit days to claim this bonus. Current: ${consecutiveDays} days`,
            zh: `您需要连续存款7天才能申请此奖金。当前: ${consecutiveDays} 天`,
            ms: `Anda perlu 7 hari deposit berturut-turut untuk menuntut bonus ini. Semasa: ${consecutiveDays} hari`,
          },
          data: {
            requiredDays: 7,
            currentConsecutiveDays: consecutiveDays,
            minDailyAmount: minAmount,
          },
        });
      }

      const transactionId = uuidv4();
      const hasSportPendingMatch = await checkSportPendingMatch(user.gameId);
      const isNewCycle = !hasSportPendingMatch && user.wallet <= 5;
      const newBonusTransaction = new Bonus({
        transactionId: transactionId,
        userId: userId,
        username: user.username,
        fullname: user.fullname,
        transactionType: "bonus",
        processBy: "system",
        amount: bonusAmount,
        walletamount: user.wallet,
        status: "pending",
        method: "manual",
        remark: `Check In bonus`,
        promotionname: promotion.maintitle,
        promotionnameEN: promotion.maintitleEN,
        promotionId: promotionId,
        isCheckinBonus: true,
        processtime: "00:00:00",
        isNewCycle: isNewCycle,
      });
      await newBonusTransaction.save();
      const walletLog = new UserWalletLog({
        userId: userId,
        transactionid: transactionId,
        transactiontime: new Date(),
        transactiontype: "bonus",
        amount: bonusAmount,
        status: "pending",
        promotionnameCN: promotion.maintitle,
        promotionnameEN: promotion.maintitleEN,
      });
      await walletLog.save();
      res.status(200).json({
        success: true,
        message: {
          en: `Checkin bonus of ${bonusAmount} submitted successfully! You have ${consecutiveDays} consecutive deposit days.`,
          zh: `签到奖金 ${bonusAmount} 申请成功！您已连续存款 ${consecutiveDays} 天。`,
          ms: `Bonus daftar masuk ${bonusAmount} berjaya dihantar! Anda mempunyai ${consecutiveDays} hari deposit berturut-turut.`,
        },
        data: {
          transactionId: transactionId,
          bonusAmount: bonusAmount,
          consecutiveDays: consecutiveDays,
          status: "pending",
          promotionName: promotion.maintitleEN,
        },
      });
    } catch (error) {
      console.error("Error submitting checkin bonus:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to submit checkin bonus",
          zh: "签到奖金申请失败",
          ms: "Gagal menghantar bonus daftar masuk",
        },
        error: error.message,
      });
    }
  }
);

module.exports = router;

module.exports.submitLuckySpin = submitLuckySpin;
