const express = require("express");
const router = express.Router();
const multer = require("multer");
const { authenticateAdminToken } = require("../auth/adminAuth");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const BankList = require("../models/banklist.model");
const BankTransactionLog = require("../models/banktransactionlog.model");
const { adminUser } = require("../models/adminuser.model");
const moment = require("moment");
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const upload = multer({ storage: multer.memoryStorage() });

// Client Get Bank List
router.get("/api/client/banklist", async (req, res) => {
  try {
    const bankLists = await BankList.find(
      { isActive: true },
      "_id bankaccount ownername bankname qrimage"
    );
    res.status(200).json({
      success: true,
      message: "Bank lists retrieved successfully",
      data: bankLists,
    });
  } catch (error) {
    console.error("Error occurred while retrieving bank lists:", error);
    res
      .status(200)
      .json({ message: "Internal server error", error: error.toString() });
  }
});

// Admin Get All Bank List
router.get("/admin/api/banklist", authenticateAdminToken, async (req, res) => {
  try {
    const bankLists = await BankList.find({});
    res.status(200).json({
      success: true,
      message: "Bank lists retrieved successfully",
      data: bankLists,
    });
  } catch (error) {
    console.error("Error occurred while retrieving bank lists:", error);
    res
      .status(200)
      .json({ message: "Internal server error", error: error.toString() });
  }
});

// Admin Create Bank List
router.post(
  "/admin/api/createbanklist",
  authenticateAdminToken,
  upload.single("qrimage"),
  async (req, res) => {
    try {
      const {
        bankname,
        bankaccount,
        ownername,
        fastpayment,
        transactionlimit,
        transactionamountlimit,
        remark,
      } = req.body;
      let qrImageUrl = null;
      if (req.file) {
        const folderPath = "banklists/";
        const fileKey = `${folderPath}${Date.now()}_${req.file.originalname}`;
        const putObjectCommand = new PutObjectCommand({
          Bucket: process.env.S3_MAINBUCKET,
          Key: fileKey,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        });

        await s3Client.send(putObjectCommand);
        qrImageUrl = `https://${process.env.S3_MAINBUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
      }

      const newBankList = await BankList.create({
        bankname,
        bankaccount,
        ownername,
        fastpayment,
        transactionlimit,
        transactionamountlimit,
        remark,
        qrimage: qrImageUrl,
      });

      res.status(200).json({
        success: true,
        message: {
          en: "Bank List created successfully",
          zh: "银行列表创建成功",
        },
        data: newBankList,
      });
    } catch (error) {
      console.error("Error occurred while creating bank list:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

// Admin Update Bank List
router.patch(
  "/admin/api/updatebank/:id",
  authenticateAdminToken,
  upload.single("qrimage"),
  async (req, res) => {
    const { id } = req.params;

    try {
      const existingBank = await BankList.findById(id);
      if (!existingBank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank list not found",
            zh: "找不到银行列表",
          },
        });
      }

      let qrImageUrl = existingBank.qrimage;

      if (req.file && qrImageUrl) {
        const url = new URL(qrImageUrl);
        const key = url.pathname.substring(1);

        const deleteObjectCommand = new DeleteObjectCommand({
          Bucket: process.env.S3_MAINBUCKET,
          Key: key,
        });

        await s3Client.send(deleteObjectCommand);
      }

      if (req.file) {
        const folderPath = "banklists/";
        const fileKey = `${folderPath}${Date.now()}_${req.file.originalname}`;
        const putObjectCommand = new PutObjectCommand({
          Bucket: process.env.S3_MAINBUCKET,
          Key: fileKey,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        });

        try {
          await s3Client.send(putObjectCommand);
          qrImageUrl = `https://${process.env.S3_MAINBUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
        } catch (uploadError) {
          return res.status(200).json({
            success: false,
            message: {
              en: "Error uploading image to S3",
              zh: "上传图片到S3时出错",
            },
          });
        }
      }

      const updateData = {
        bankname: req.body.bankname,
        bankaccount: req.body.bankaccount,
        ownername: req.body.ownername,
        fastpayment: req.body.fastpayment,
        transactionlimit: req.body.transactionlimit,
        transactionamountlimit: req.body.transactionamountlimit,
        remark: req.body.remark,
        qrimage: qrImageUrl,
      };

      const updatedBank = await BankList.findByIdAndUpdate(id, updateData, {
        new: true,
      });
      res.status(200).json({
        success: true,
        message: {
          en: "Bank list updated successfully",
          zh: "银行列表更新成功",
        },
        data: updatedBank,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

// Admin Delete Bank List
router.delete(
  "/admin/api/deletebanklist/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const bank = await BankList.findById(req.params.id);
      if (!bank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank list not found",
            zh: "未找到银行列表",
          },
        });
      }

      if (bank.qrimage) {
        const url = new URL(bank.qrimage);
        const key = decodeURIComponent(url.pathname.substring(1));

        const deleteObjectCommand = new DeleteObjectCommand({
          Bucket: process.env.S3_MAINBUCKET,
          Key: key,
        });

        await s3Client.send(deleteObjectCommand);
      }

      const deletedBank = await BankList.findOneAndDelete({
        _id: req.params.id,
      });
      if (!deletedBank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank list not found",
            zh: "未找到银行列表",
          },
        });
      }

      res.status(200).json({
        success: true,
        message: {
          en: "Bank list deleted successfully",
          zh: "银行列表删除成功",
        },
        data: deletedBank,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

// Admin Update Bank Status
router.patch(
  "/admin/api/updateactivebank",
  authenticateAdminToken,
  async (req, res) => {
    const { id, isActive } = req.body;
    try {
      const updatedBank = await BankList.findByIdAndUpdate(
        id,
        { isActive },
        { new: true }
      );
      if (!updatedBank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank not found",
            zh: "未找到银行",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Bank status updated successfully",
          zh: "银行状态更新成功",
        },
        data: updatedBank,
      });
    } catch (error) {
      console.error("Error updating bank's active status:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

// Admin Update Starting Balance
router.patch(
  "/admin/api/updatestartingbalance",
  authenticateAdminToken,
  async (req, res) => {
    console.log(req.body);
    const { id, startingBalance, remark } = req.body;
    const balance = parseFloat(startingBalance);
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
      const bank = await BankList.findById(id);
      if (!bank) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Bank list not found",
            zh: "找不到银行列表",
          },
        });
      }
      const oldBalance = bank.currentbalance;
      bank.startingbalance = balance;
      bank.currentbalance =
        bank.startingbalance +
        bank.totalDeposits -
        bank.totalWithdrawals +
        bank.totalCashIn -
        bank.totalCashOut;
      await bank.save();
      const transactionLog = new BankTransactionLog({
        bankName: bank.bankname,
        ownername: bank.ownername,
        remark: remark,
        lastBalance: oldBalance,
        currentBalance: bank.currentbalance,
        processby: adminuser.username,
        transactiontype: "adjust starting balance",
        amount: balance,
        qrimage: bank.qrimage,
        playerusername: "n/a",
        playerfullname: "n/a",
      });
      await transactionLog.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Starting balance updated successfully",
          zh: "初始余额更新成功",
        },
        data: bank,
      });
    } catch (error) {
      console.error("Error updating starting balance:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

// Admin Cash In
router.post("/admin/api/cashin", authenticateAdminToken, async (req, res) => {
  const { id, amount, remark } = req.body;
  const cashInAmount = parseFloat(amount);

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
    const bank = await BankList.findById(id);
    if (!bank) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Bank list not found",
          zh: "找不到银行列表",
        },
      });
    }
    const oldBalance = bank.currentbalance;

    bank.totalCashIn += cashInAmount;
    bank.currentbalance += cashInAmount;
    await bank.save();

    const transactionLog = new BankTransactionLog({
      bankName: bank.bankname,
      ownername: bank.ownername,
      remark: remark,
      lastBalance: oldBalance,
      currentBalance: bank.currentbalance,
      processby: adminuser.username,
      transactiontype: "cashin",
      amount: cashInAmount,
      qrimage: bank.qrimage,
      playerusername: "n/a",
      playerfullname: "n/a",
    });
    await transactionLog.save();
    res.status(200).json({
      success: true,
      message: {
        en: "Cash in processed successfully",
        zh: "现金存入处理成功",
      },
      data: bank,
    });
  } catch (error) {
    console.error("Error processing cash in:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Internal server error",
        zh: "服务器内部错误",
      },
    });
  }
});

// Admin Cash Out
router.post("/admin/api/cashout", authenticateAdminToken, async (req, res) => {
  const { id, amount, remark } = req.body;
  const cashOutAmount = parseFloat(amount);

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
    const bank = await BankList.findById(id);
    if (!bank) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Bank list not found",
          zh: "找不到银行列表",
        },
      });
    }
    if (bank.currentbalance < cashOutAmount) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Insufficient balance",
          zh: "余额不足",
        },
      });
    }
    const oldBalance = bank.currentbalance;

    bank.totalCashOut += cashOutAmount;
    bank.currentbalance -= cashOutAmount;
    await bank.save();

    const transactionLog = new BankTransactionLog({
      bankName: bank.bankname,
      ownername: bank.ownername,
      remark: remark,
      lastBalance: oldBalance,
      currentBalance: bank.currentbalance,
      processby: adminuser.username,
      transactiontype: "cashout",
      amount: cashOutAmount,
      qrimage: bank.qrimage,
      playerusername: "n/a",
      playerfullname: "n/a",
    });
    await transactionLog.save();

    res.status(200).json({
      success: true,
      message: {
        en: "Cash out processed successfully",
        zh: "现金提取处理成功",
      },
      data: bank,
    });
  } catch (error) {
    console.error("Error processing cash out:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Internal server error",
        zh: "服务器内部错误",
      },
    });
  }
});

// Admin Get Bank Report
router.get(
  "/admin/api/bankreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const banks = await BankList.find({});

      const dateFilter = {};
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }

      const stats = await BankTransactionLog.aggregate([
        {
          $match: {
            bankName: { $in: banks.map((b) => b.bankname) },
            ...dateFilter,
          },
        },
        {
          $group: {
            _id: "$bankName",
            totalDeposits: {
              $sum: {
                $cond: [
                  { $eq: [{ $toLower: "$transactiontype" }, "deposit"] },
                  "$amount",
                  0,
                ],
              },
            },
            totalWithdrawals: {
              $sum: {
                $cond: [
                  { $eq: [{ $toLower: "$transactiontype" }, "withdraw"] },
                  "$amount",
                  0,
                ],
              },
            },
            totalCashIn: {
              $sum: {
                $cond: [
                  { $eq: [{ $toLower: "$transactiontype" }, "cashin"] },
                  "$amount",
                  0,
                ],
              },
            },
            totalCashOut: {
              $sum: {
                $cond: [
                  { $eq: [{ $toLower: "$transactiontype" }, "cashout"] },
                  "$amount",
                  0,
                ],
              },
            },
          },
        },
      ]);

      const statsMap = new Map(stats.map((s) => [s._id, s]));

      const reportData = banks.map((bank) => {
        const bankStats = statsMap.get(bank.bankname) || {};
        return {
          id: bank._id,
          bankName: bank.bankname,
          ownername: bank.ownername,
          totalDeposit: bankStats.totalDeposits || 0,
          totalWithdraw: bankStats.totalWithdrawals || 0,
          totalCashIn: bankStats.totalCashIn || 0,
          totalCashOut: bankStats.totalCashOut || 0,
          currentBalance: bank.currentbalance,
        };
      });

      const totals = reportData.reduce(
        (acc, bank) => ({
          totalDeposit: (acc.totalDeposit || 0) + bank.totalDeposit,
          totalWithdraw: (acc.totalWithdraw || 0) + bank.totalWithdraw,
          totalCashIn: (acc.totalCashIn || 0) + bank.totalCashIn,
          totalCashOut: (acc.totalCashOut || 0) + bank.totalCashOut,
        }),
        {}
      );

      res.status(200).json({
        success: true,
        message: "Report data retrieved successfully",
        data: {
          reports: reportData,
          totals,
        },
      });
    } catch (error) {
      console.error("Error generating bank report:", error);
      res.status(200).json({
        success: false,
        message: "Internal server error",
        error: error.toString(),
      });
    }
  }
);

module.exports = router;
