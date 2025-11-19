const express = require("express");
const router = express.Router();
const axios = require("axios");
const crypto = require("crypto");
const { authenticateToken } = require("../../auth/auth");
const { authenticateAdminToken } = require("../../auth/adminAuth");
const {
  User,
  adminUserWalletLog,
  GameDataLog,
} = require("../../models/users.model");
const { v4: uuidv4 } = require("uuid");
const querystring = require("querystring");
const moment = require("moment");

const GameWalletLog = require("../../models/gamewalletlog.model");

require("dotenv").config();

router.post(
  "/admin/api/:gameName/transferstatus/:transferType/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId, gameName, transferType } = req.params;

      if (
        transferType !== "transferinstatus" &&
        transferType !== "transferoutstatus"
      ) {
        return res.status(400).json({
          success: false,
          message: {
            en: "Invalid transfer type. Must be 'transferinstatus' or 'transferoutstatus'.",
            zh: "无效的转账类型。必须是'转入状态'或'转出状态'。",
            ms: "Jenis pemindahan tidak sah. Mesti 'transferinstatus' atau 'transferoutstatus'.",
            zh_hk: "無效嘅轉賬類型。必須係'轉入狀態'或'轉出狀態'。",
            id: "Jenis transfer tidak valid. Harus 'transferinstatus' atau 'transferoutstatus'.",
          },
        });
      }

      const user = await User.findById(userId, { gameStatus: 1 });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: {
            en: "User not found. Please contact IT support for further assistance.",
            zh: "用户未找到。请联系IT客服以获取进一步帮助。",
            ms: "Pengguna tidak ditemui. Sila hubungi sokongan IT untuk bantuan lanjut.",
            zh_hk: "搵唔到用戶。請聯絡IT客服以獲取進一步幫助。",
            id: "Pengguna tidak ditemukan. Silakan hubungi dukungan IT untuk bantuan lebih lanjut.",
          },
        });
      }

      if (!user.gameStatus?.hasOwnProperty(gameName)) {
        console.error(`Game status not found for: ${gameName.toUpperCase()}`);
        return res.status(404).json({
          success: false,
          message: {
            en: `Game status for ${gameName.toUpperCase()} not found. Please ensure the game provider is properly configured.`,
            zh: `未找到 ${gameName.toUpperCase()} 的游戏状态。请确保游戏提供商已正确配置。`,
            ms: `Status permainan untuk ${gameName.toUpperCase()} tidak ditemui. Sila pastikan penyedia permainan telah dikonfigurasi dengan betul.`,
            zh_hk: `搵唔到 ${gameName.toUpperCase()} 嘅遊戲狀態。請確保遊戲提供商已正確配置。`,
            id: `Status permainan untuk ${gameName.toUpperCase()} tidak ditemukan. Pastikan penyedia game sudah dikonfigurasi dengan benar.`,
          },
        });
      }

      const statusField =
        transferType === "transferinstatus"
          ? "transferInStatus"
          : "transferOutStatus";

      user.gameStatus[gameName][statusField] =
        !user.gameStatus[gameName][statusField];
      await user.save();

      const displayName = gameName.toUpperCase();
      const statusType =
        transferType === "transferinstatus" ? "transferIn" : "transferOut";

      return res.status(200).json({
        success: true,
        message: {
          en: `Game ${statusType} status for ${displayName} updated successfully.`,
          zh: `${displayName} 的${
            statusType === "transferIn" ? "转入" : "转出"
          }状态更新成功。`,
          ms: `Status pemindahan ${
            statusType === "transferIn" ? "masuk" : "keluar"
          } permainan untuk ${displayName} berjaya dikemas kini.`,
          zh_hk: `${displayName} 嘅${
            statusType === "transferIn" ? "轉入" : "轉出"
          }狀態更新成功。`,
          id: `Status ${
            statusType === "transferIn" ? "transfer masuk" : "transfer keluar"
          } permainan untuk ${displayName} berhasil diperbarui.`,
        },
        gameStatus: user.gameStatus[gameName],
      });
    } catch (error) {
      console.error(
        `Error updating ${req.params.gameName} transfer status:`,
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "Internal Server Error. Please contact IT support for further assistance.",
          zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
          ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          zh_hk: "內部服務器錯誤。請聯絡IT客服以獲取進一步幫助。",
          id: "Kesalahan Server Internal. Silakan hubungi dukungan IT untuk bantuan lebih lanjut.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/:gameName/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId, gameName } = req.params;
      const user = await User.findById(userId, { gameLock: 1 });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: {
            en: "User not found. Please contact IT support for further assistance.",
            zh: "用户未找到。请联系IT客服以获取进一步帮助。",
            ms: "Pengguna tidak ditemui. Sila hubungi sokongan IT untuk bantuan lanjut.",
            zh_hk: "搵唔到用戶。請聯絡IT客服以獲取進一步幫助。",
            id: "Pengguna tidak ditemukan. Silakan hubungi dukungan IT untuk bantuan lebih lanjut.",
          },
        });
      }

      if (!user.gameLock?.hasOwnProperty(gameName)) {
        console.error(`Game lock not found for: ${gameName.toUpperCase()}`);
        return res.status(404).json({
          success: false,
          message: {
            en: `Game lock for ${gameName.toUpperCase()} not found. Please ensure the game provider is properly configured.`,
            zh: `未找到 ${gameName.toUpperCase()} 的游戏锁。请确保游戏提供商已正确配置。`,
            ms: `Kunci permainan untuk ${gameName.toUpperCase()} tidak ditemui. Sila pastikan penyedia permainan telah dikonfigurasi dengan betul.`,
            zh_hk: `搵唔到 ${gameName.toUpperCase()} 嘅遊戲鎖。請確保遊戲提供商已正確配置。`,
            id: `Kunci permainan untuk ${gameName.toUpperCase()} tidak ditemukan. Pastikan penyedia game sudah dikonfigurasi dengan benar.`,
          },
        });
      }

      user.gameLock[gameName].lock = !user.gameLock[gameName].lock;
      await user.save();

      const displayName = gameName.toUpperCase();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for ${displayName} updated successfully.`,
          zh: `${displayName} 的游戏锁定状态更新成功。`,
          ms: `Status kunci permainan untuk ${displayName} berjaya dikemas kini.`,
          zh_hk: `${displayName} 嘅遊戲鎖定狀態更新成功。`,
          id: `Status kunci permainan untuk ${displayName} berhasil diperbarui.`,
        },
        gameLock: user.gameLock[gameName],
      });
    } catch (error) {
      console.error(
        `Error updating ${req.params.gameName} seamless game status:`,
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "Internal Server Error. Please contact IT support for further assistance.",
          zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
          ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          zh_hk: "內部服務器錯誤。請聯絡IT客服以獲取進一步幫助。",
          id: "Kesalahan Server Internal. Silakan hubungi dukungan IT untuk bantuan lebih lanjut.",
        },
      });
    }
  }
);
module.exports = router;
