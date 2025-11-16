const express = require("express");
const router = express.Router();
const PaymentGateway = require("../models/paymentgateway.model");
const PaymentGatewayTransactionLog = require("../models/paymentgatewayTransactionLog.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const moment = require("moment");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function uploadFileToS3(file) {
  const fileKey = `payment-gateway/${Date.now()}_${file.originalname}`;
  const uploadParams = {
    Bucket: process.env.S3_MAINBUCKET,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
  };
  await s3Client.send(new PutObjectCommand(uploadParams));
  return `https://${process.env.S3_MAINBUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
}

// User Get Payment Gateways
router.get("/api/payment-gateways", async (req, res) => {
  try {
    const gateways = await PaymentGateway.find({ status: true });
    const sortedGateways = gateways.sort((a, b) => {
      const orderA = a.order || 0;
      const orderB = b.order || 0;
      if (orderA === 0 && orderB !== 0) return 1;
      if (orderA !== 0 && orderB === 0) return -1;
      return orderA - orderB;
    });
    res.json({
      success: true,
      data: sortedGateways,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Admin Create Payment Gateway
router.post(
  "/admin/api/payment-gateways",
  authenticateAdminToken,
  upload.any(),
  async (req, res) => {
    try {
      const {
        name,
        paymentAPI,
        reportAPI,
        minDeposit,
        maxDeposit,
        remark,
        status,
        banks,
      } = req.body;
      let logoUrl = null;
      const logoFile = req.files?.find((file) => file.fieldname === "logo");
      if (logoFile) {
        logoUrl = await uploadFileToS3(logoFile);
      }
      let bankData = [];
      if (banks) {
        const banksArray = JSON.parse(banks);

        for (let i = 0; i < banksArray.length; i++) {
          const bank = banksArray[i];
          let bankImageUrl = null;
          const bankImageFile = req.files?.find(
            (file) => file.fieldname === `bankImage_${i}`
          );
          if (bankImageFile) {
            bankImageUrl = await uploadFileToS3(bankImageFile);
          }
          bankData.push({
            bankname: bank.bankname,
            bankcode: bank.bankcode,
            bankimage: bankImageUrl,
            minlimit: Number(bank.minlimit) || 0,
            maxlimit: Number(bank.maxlimit) || 0,
            active: bank.active !== undefined ? bank.active : true,
          });
        }
      }
      const gateway = new PaymentGateway({
        name,
        paymentAPI,
        reportAPI,
        minDeposit: Number(minDeposit),
        maxDeposit: Number(maxDeposit),
        remark,
        logo: logoUrl,
        status: status === "true",
        banks: bankData,
      });
      await gateway.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Payment gateway created successfully",
          zh: "支付网关创建成功",
        },
        data: gateway,
      });
    } catch (error) {
      console.error("Create error:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error creating payment gateway",
          zh: "创建支付网关时出错",
        },
      });
    }
  }
);

// Admin Get Single Payment Gateway by ID
router.get(
  "/admin/api/payment-gateways/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const gateway = await PaymentGateway.findById(req.params.id);

      if (!gateway) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Payment gateway not found",
            zh: "找不到支付网关",
          },
        });
      }

      res.status(200).json({
        success: true,
        data: gateway,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error fetching payment gateway",
          zh: "获取支付网关时出错",
        },
      });
    }
  }
);

// Admin Get All Payment Gateways
router.get(
  "/admin/api/payment-gateways",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const gateways = await PaymentGateway.find().sort({ createdAt: -1 });
      res.json({ success: true, data: gateways });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Admin Update Payment Gateway
router.put(
  "/admin/api/payment-gateways/:id",
  authenticateAdminToken,
  upload.any(),
  async (req, res) => {
    try {
      const {
        name,
        paymentAPI,
        reportAPI,
        minDeposit,
        maxDeposit,
        remark,
        status,
        banks,
      } = req.body;

      const updates = {
        name,
        paymentAPI,
        reportAPI,
        minDeposit: Number(minDeposit),
        maxDeposit: Number(maxDeposit),
        remark,
        status: status === "true",
      };

      const gateway = await PaymentGateway.findById(req.params.id);
      if (!gateway) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Payment gateway not found",
            zh: "找不到支付网关",
          },
        });
      }

      const logoFile = req.files?.find((file) => file.fieldname === "logo");
      if (logoFile) {
        if (gateway.logo) {
          const oldKey = gateway.logo.split("/").slice(-2).join("/");
          try {
            await s3Client.send(
              new DeleteObjectCommand({
                Bucket: process.env.S3_MAINBUCKET,
                Key: oldKey,
              })
            );
          } catch (error) {
            console.log(`Failed to delete old logo: ${oldKey}`, error);
          }
        }
        updates.logo = await uploadFileToS3(logoFile);
      }

      if (banks) {
        const banksArray = JSON.parse(banks);
        if (gateway.banks && gateway.banks.length > 0) {
          const newBankImages = banksArray
            .map((bank) => bank.bankimage)
            .filter((img) => img);
          for (const oldBank of gateway.banks) {
            if (
              oldBank.bankimage &&
              oldBank.bankimage.includes(process.env.S3_MAINBUCKET) &&
              !newBankImages.includes(oldBank.bankimage)
            ) {
              const oldKey = oldBank.bankimage.split("/").slice(-2).join("/");
              try {
                await s3Client.send(
                  new DeleteObjectCommand({
                    Bucket: process.env.S3_MAINBUCKET,
                    Key: oldKey,
                  })
                );
              } catch (error) {
                console.log(
                  `Failed to delete removed bank image: ${oldKey}`,
                  error
                );
              }
            }
          }
        }

        let bankData = [];
        for (let i = 0; i < banksArray.length; i++) {
          const bank = banksArray[i];
          let bankImageUrl = bank.bankimage;
          const bankImageFile = req.files?.find(
            (file) => file.fieldname === `bankImage_${i}`
          );

          if (bankImageFile) {
            if (
              bank.bankimage &&
              bank.bankimage.includes(process.env.S3_MAINBUCKET)
            ) {
              const oldKey = bank.bankimage.split("/").slice(-2).join("/");
              try {
                await s3Client.send(
                  new DeleteObjectCommand({
                    Bucket: process.env.S3_MAINBUCKET,
                    Key: oldKey,
                  })
                );
              } catch (error) {
                console.log(
                  `Failed to delete old bank ${i} image: ${oldKey}`,
                  error
                );
              }
            }
            bankImageUrl = await uploadFileToS3(bankImageFile);
          }

          bankData.push({
            bankname: bank.bankname,
            bankcode: bank.bankcode,
            bankimage: bankImageUrl,
            minlimit: Number(bank.minlimit) || 0,
            maxlimit: Number(bank.maxlimit) || 0,
            active: bank.active !== undefined ? bank.active : true,
          });
        }
        updates.banks = bankData;
      }

      const updatedGateway = await PaymentGateway.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true }
      );

      res.status(200).json({
        success: true,
        message: {
          en: "Payment gateway updated successfully",
          zh: "支付网关更新成功",
        },
        data: updatedGateway,
      });
    } catch (error) {
      console.error("Update error:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating payment gateway",
          zh: "更新支付网关时出错",
        },
      });
    }
  }
);

// Admin Delete Payment Gateway
router.delete(
  "/admin/api/payment-gateways/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const gateway = await PaymentGateway.findById(req.params.id);
      if (!gateway) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Payment gateway not found",
            zh: "找不到支付网关",
          },
        });
      }

      if (gateway.logo) {
        const logoKey = gateway.logo.split("/").slice(-2).join("/");
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: process.env.S3_MAINBUCKET,
            Key: logoKey,
          })
        );
      }

      if (gateway.banks) {
        for (const bank of gateway.banks) {
          if (bank.bankimage) {
            const bankKey = bank.bankimage.split("/").slice(-2).join("/");
            await s3Client.send(
              new DeleteObjectCommand({
                Bucket: process.env.S3_MAINBUCKET,
                Key: bankKey,
              })
            );
          }
        }
      }

      await PaymentGateway.findByIdAndDelete(req.params.id);
      res.status(200).json({
        success: true,
        message: {
          en: "Payment gateway deleted successfully",
          zh: "支付网关删除成功",
        },
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

// Admin Toggle Payment Gateway Status
router.patch(
  "/admin/api/payment-gateways/:id/toggle",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const gateway = await PaymentGateway.findById(req.params.id);
      if (!gateway) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Payment gateway not found",
            zh: "找不到支付网关",
          },
        });
      }

      gateway.status = !gateway.status;
      await gateway.save();
      res.status(200).json({
        success: true,
        message: {
          en: `Payment gateway is now ${
            gateway.status ? "active" : "inactive"
          }`,
          zh: `支付网关${gateway.status ? "已激活" : "已停用"}`,
        },
        data: gateway,
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

router.get(
  "/admin/api/paymentgatewaytransactionlog",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const dateFilter = {};
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }
      const banktransactionlog = await PaymentGatewayTransactionLog.find({
        ...dateFilter,
      }).sort({
        createdAt: -1,
      });
      res.status(200).json({
        success: true,
        message: "Bank transaction log retrieved successfully",
        data: banktransactionlog,
      });
    } catch (error) {
      console.error(
        "Error occurred while retrieving bank transaction log:",
        error
      );
      res
        .status(200)
        .json({ message: "Internal server error", error: error.message });
    }
  }
);

module.exports = router;
