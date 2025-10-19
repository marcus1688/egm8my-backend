const express = require("express");
const router = express.Router();
const { Kiosk } = require("../models/kiosk.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { updateSchedules } = require("../services/maintenanceScheduler");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
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
  const fileKey = `kiosk/${Date.now()}_${file.originalname}`;
  const uploadParams = {
    Bucket: process.env.S3_MAINBUCKET,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
  };
  await s3Client.send(new PutObjectCommand(uploadParams));
  return `https://${process.env.S3_MAINBUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
}

// User Get Kiosk
router.get("/api/kiosks", async (req, res) => {
  try {
    const kiosks = await Kiosk.find({ isActive: true })
      .populate("categoryId")
      .sort({ isHotGame: -1, createdAt: -1 });
    res.json({
      success: true,
      data: kiosks,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Admin Create Kiosk
router.post(
  "/admin/api/kiosks",
  authenticateAdminToken,
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "icon", maxCount: 1 },
    { name: "banner", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        categoryId,
        name,
        apiLink,
        gameListLink,
        backendLink,
        downloadUrl,
        iosDownloadUrl,
        androidDownloadUrl,
        changePasswordApi,
        transferInAPI,
        transferOutAPI,
        balanceAPI,
        databaseName,
        databaseGameID,
        databaseGamePassword,
        databasePastGameID,
        databasePastGamePassword,
        setAsMainAPI,
        lockTransferInAPI,
        lockTransferOutAPI,
        lockGameAPI,
        yesterdayTurnoverWinlossAPI,
        todayTurnoverWinlossAPI,
        todayKioskReportAPI,
        yesterdayKioskReportAPI,
        transferAllBalanceAPI,
        transferBalanceAPI,
        registerGameAPI,
        adminCheckUserBalanceAPI,
        isActive,
        isManualGame,
        isHTMLGame,
      } = req.body;
      let logoUrl = null;
      let iconUrl = null;
      let bannerUrl = null;
      if (req.files.logo) {
        logoUrl = await uploadFileToS3(req.files.logo[0]);
      }
      if (req.files.icon) {
        iconUrl = await uploadFileToS3(req.files.icon[0]);
      }
      if (req.files.banner) {
        bannerUrl = await uploadFileToS3(req.files.banner[0]);
      }
      const kiosk = new Kiosk({
        categoryId,
        name,
        apiLink,
        gameListLink,
        backendLink,
        downloadUrl,
        iosDownloadUrl,
        androidDownloadUrl,
        changePasswordApi,
        transferInAPI,
        transferOutAPI,
        balanceAPI,
        databaseName,
        databaseGameID,
        databaseGamePassword,
        databasePastGameID,
        databasePastGamePassword,
        setAsMainAPI,
        lockTransferInAPI,
        lockTransferOutAPI,
        lockGameAPI,
        yesterdayTurnoverWinlossAPI,
        todayTurnoverWinlossAPI,
        todayKioskReportAPI,
        yesterdayKioskReportAPI,
        transferAllBalanceAPI,
        transferBalanceAPI,
        registerGameAPI,
        adminCheckUserBalanceAPI,
        isManualGame,
        isHTMLGame,
        logo: logoUrl,
        icon: iconUrl,
        banner: bannerUrl,
        isActive: isActive === "true",
      });
      await kiosk.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Kiosk created successfully",
          zh: "游戏终端创建成功",
        },
        data: kiosk,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error creating kiosk",
          zh: "创建游戏终端时出错",
        },
      });
    }
  }
);

// Admin Get All Kiosks
router.get("/admin/api/kiosks", authenticateAdminToken, async (req, res) => {
  try {
    const kiosks = await Kiosk.find()
      .populate("categoryId")
      .sort({ createdAt: -1 });
    res.json({ success: true, data: kiosks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin Update Kiosk
router.put(
  "/admin/api/kiosks/:id",
  authenticateAdminToken,
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "icon", maxCount: 1 },
    { name: "banner", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        categoryId,
        name,
        apiLink,
        gameListLink,
        backendLink,
        downloadUrl,
        iosDownloadUrl,
        androidDownloadUrl,
        changePasswordApi,
        transferInAPI,
        transferOutAPI,
        balanceAPI,
        databaseName,
        databaseGameID,
        databaseGamePassword,
        databasePastGameID,
        databasePastGamePassword,
        setAsMainAPI,
        lockTransferInAPI,
        lockTransferOutAPI,
        lockGameAPI,
        yesterdayTurnoverWinlossAPI,
        todayTurnoverWinlossAPI,
        todayKioskReportAPI,
        yesterdayKioskReportAPI,
        transferAllBalanceAPI,
        transferBalanceAPI,
        registerGameAPI,
        adminCheckUserBalanceAPI,
        isManualGame,
        isHTMLGame,
        isActive,
      } = req.body;
      const updates = {
        categoryId,
        name,
        apiLink,
        gameListLink,
        backendLink,
        downloadUrl,
        iosDownloadUrl,
        androidDownloadUrl,
        changePasswordApi,
        transferInAPI,
        transferOutAPI,
        balanceAPI,
        databaseName,
        databaseGameID,
        databaseGamePassword,
        databasePastGameID,
        databasePastGamePassword,
        setAsMainAPI,
        lockTransferInAPI,
        lockTransferOutAPI,
        lockGameAPI,
        yesterdayTurnoverWinlossAPI,
        todayTurnoverWinlossAPI,
        todayKioskReportAPI,
        yesterdayKioskReportAPI,
        transferAllBalanceAPI,
        transferBalanceAPI,
        registerGameAPI,
        adminCheckUserBalanceAPI,
        isManualGame,
        isHTMLGame,
        isActive: isActive === "true",
      };

      const kiosk = await Kiosk.findById(req.params.id);
      if (!kiosk) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Kiosk not found",
            zh: "找不到游戏终端",
          },
        });
      }
      if (req.files.logo) {
        if (kiosk.logo) {
          const oldKey = kiosk.logo.split("/").slice(-2).join("/");
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: process.env.S3_MAINBUCKET,
              Key: oldKey,
            })
          );
        }
        updates.logo = await uploadFileToS3(req.files.logo[0]);
      }
      if (req.files.icon) {
        if (kiosk.icon) {
          const oldKey = kiosk.icon.split("/").slice(-2).join("/");
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: process.env.S3_MAINBUCKET,
              Key: oldKey,
            })
          );
        }
        updates.icon = await uploadFileToS3(req.files.icon[0]);
      }
      if (req.files.banner) {
        if (kiosk.banner) {
          const oldKey = kiosk.banner.split("/").slice(-2).join("/");
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: process.env.S3_MAINBUCKET,
              Key: oldKey,
            })
          );
        }
        updates.banner = await uploadFileToS3(req.files.banner[0]);
      }
      const updatedKiosk = await Kiosk.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true }
      ).populate("categoryId");
      res.status(200).json({
        success: true,
        message: {
          en: "Kiosk updated successfully",
          zh: "游戏终端更新成功",
        },
        data: updatedKiosk,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating kiosk",
          zh: "更新游戏终端时出错",
        },
      });
    }
  }
);

// Admin Delete Kiosk
router.delete(
  "/admin/api/kiosks/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const kiosk = await Kiosk.findById(req.params.id);
      if (!kiosk) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Kiosk not found",
            zh: "找不到游戏终端",
          },
        });
      }

      if (kiosk.logo) {
        const logoKey = kiosk.logo.split("/").slice(-2).join("/");
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: process.env.S3_MAINBUCKET,
            Key: logoKey,
          })
        );
      }
      if (kiosk.icon) {
        const iconKey = kiosk.icon.split("/").slice(-2).join("/");
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: process.env.S3_MAINBUCKET,
            Key: iconKey,
          })
        );
      }
      if (kiosk.banner) {
        const bannerKey = kiosk.banner.split("/").slice(-2).join("/");
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: process.env.S3_MAINBUCKET,
            Key: bannerKey,
          })
        );
      }

      await Kiosk.findByIdAndDelete(req.params.id);
      res.status(200).json({
        success: true,
        message: {
          en: "Kiosk deleted successfully",
          zh: "游戏终端删除成功",
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

// Admin Toggle Kiosk Status
router.patch(
  "/admin/api/kiosks/:id/toggle",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const kiosk = await Kiosk.findById(req.params.id);
      if (!kiosk) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Kiosk not found",
            zh: "找不到游戏终端",
          },
        });
      }
      kiosk.isActive = !kiosk.isActive;
      await kiosk.save();
      res.status(200).json({
        success: true,
        message: {
          en: `Kiosk is now ${kiosk.isActive ? "active" : "inactive"}`,
          zh: `游戏终端现在${kiosk.isActive ? "已激活" : "已停用"}`,
        },
        data: kiosk,
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

// Admin Toggle Hot Game Status
router.patch(
  "/admin/api/kiosks/:id/toggle-hot-game",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const kiosk = await Kiosk.findById(req.params.id);
      if (!kiosk) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Kiosk not found",
            zh: "找不到游戏终端",
          },
        });
      }
      kiosk.isHotGame = !kiosk.isHotGame;
      await kiosk.save();
      res.status(200).json({
        success: true,
        message: {
          en: `Hot game status ${
            kiosk.isHotGame ? "activated" : "deactivated"
          } successfully`,
          zh: `热门游戏状态${kiosk.isHotGame ? "已激活" : "已停用"}`,
        },
        data: kiosk,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to update hot game status",
          zh: "更新热门游戏状态失败",
        },
      });
    }
  }
);

// Admin Update Maintenance
router.put(
  "/admin/api/kiosks/:id/maintenance",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { deactivateAt, activateAt } = req.body;
      if (!deactivateAt || !activateAt) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Please set both deactivate and activate times",
            zh: "请同时设置停用和启用时间",
          },
        });
      }
      if (new Date(activateAt) <= new Date(deactivateAt)) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Activate time must be later than deactivate time",
            zh: "启用时间必须晚于停用时间",
          },
        });
      }
      const kiosk = await Kiosk.findById(req.params.id);
      if (!kiosk) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Kiosk not found",
            zh: "找不到游戏终端",
          },
        });
      }
      kiosk.maintenance = {
        deactivateAt: deactivateAt ? new Date(deactivateAt) : null,
        activateAt: activateAt ? new Date(activateAt) : null,
      };
      if (deactivateAt && new Date(deactivateAt) <= new Date()) {
        kiosk.isActive = false;
      }
      await kiosk.save();
      await updateSchedules();
      res.status(200).json({
        success: true,
        message: {
          en: "Maintenance schedule updated successfully",
          zh: "维护计划更新成功",
        },
        data: kiosk,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating maintenance schedule",
          zh: "更新维护计划时出错",
        },
      });
    }
  }
);

// Admin Clear Maintenance
router.delete(
  "/admin/api/kiosks/:id/maintenance",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const kiosk = await Kiosk.findById(req.params.id);
      if (!kiosk) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Kiosk not found",
            zh: "找不到游戏终端",
          },
        });
      }
      kiosk.maintenance = {
        deactivateAt: null,
        activateAt: null,
      };
      await kiosk.save();
      await updateSchedules();
      res.status(200).json({
        success: true,
        message: {
          en: "Maintenance schedule cleared successfully",
          zh: "维护计划已成功清除",
        },
        data: kiosk,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error clearing maintenance schedule",
          zh: "清除维护计划时出错",
        },
      });
    }
  }
);

// Kick Single User
router.post(
  "/admin/api/kiosks/:id/kick-single",
  authenticateAdminToken,
  async (req, res) => {
    try {
      res.json({ success: true, message: "User kicked out successfully" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Kick All Users
router.post(
  "/admin/api/kiosks/:id/kick-all",
  authenticateAdminToken,
  async (req, res) => {
    try {
      res.json({ success: true, message: "All users kicked out successfully" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Get Backend Link by Game Name
router.get("/admin/api/kiosk/backend-link/:gameName", async (req, res) => {
  try {
    const { gameName } = req.params;
    if (!gameName) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Game name is required",
          zh: "游戏名称是必需的",
        },
      });
    }
    const gameNameLower = gameName
      .toLowerCase()
      .trim()
      .replace(/[^a-zA-Z0-9]/g, "");
    const kiosks = await Kiosk.find({ isActive: true });
    const matchedKiosk = kiosks.find(
      (kiosk) =>
        kiosk.name
          .toLowerCase()
          .trim()
          .replace(/[^a-zA-Z0-9]/g, "") === gameNameLower
    );
    if (!matchedKiosk) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Game not found or inactive",
          zh: "找不到游戏或游戏已停用",
        },
      });
    }
    if (!matchedKiosk.backendLink) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Backend link not configured for this game",
          zh: "该游戏未配置后端链接",
        },
      });
    }
    res.status(200).json({
      success: true,
      message: {
        en: "Backend link retrieved successfully",
        zh: "后端链接获取成功",
      },
      data: {
        gameName: matchedKiosk.name,
        backendLink: matchedKiosk.backendLink,
      },
    });
  } catch (error) {
    console.error("Error fetching backend link:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Internal server error",
        zh: "服务器内部错误",
      },
    });
  }
});

module.exports = router;
