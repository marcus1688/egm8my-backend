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

router.patch("/admin/api/updateseamlessstatus/:userId", async (req, res) => {
  try {
    const { gamename } = req.body;

    const userId = req.params.userId;

    const user = await User.findById(userId);

    if (!user.gameLock.hasOwnProperty(gamename)) {
      console.log("Error updating seamless game status:", gamename, "gamename");
      return res.status(200).json({
        success: false,
        message: {
          en: "Internal Server Error. Please contact IT support for further assistance.",
          zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
          ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
        },
      });
    }

    user.gameLock[gamename].lock = !user.gameLock[gamename].lock;

    await user.save();

    return res.status(200).json({
      success: true,
      message: {
        en: `Game lock status for ${gamename} updated successfully.`,
        zh: `${gamename} 的游戏锁定状态更新成功。`,
        ms: `Status kunci permainan untuk ${gamename} berjaya dikemas kini.`,
      },
      gameLock: user.gameLock[gamename],
    });
  } catch (error) {
    console.error("Error updating seamless game status:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "Internal Server Error. Please contact IT support for further assistance.",
        zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
        ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
      },
    });
  }
});

router.post(
  "/admin/api/epicwin/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("epicwin")) {
        console.log("Error updating seamless game status:", "EPICWIN");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["epicwin"].lock = !user.gameLock["epicwin"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for EPICWIN updated successfully.`,
          zh: `EPICWIN 的游戏锁定状态更新成功。`,
          ms: `Status kunci permainan untuk EPICWIN berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["epicwin"],
      });
    } catch (error) {
      console.error(
        "Error updating EPICWIN seamless game status:",
        error.message
      );
      return res.status(200).json({
        success: false,
        message: {
          en: "Internal Server Error. Please contact IT support for further assistance.",
          zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
          ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
        },
      });
    }
  }
);

router.post(
  "/admin/api/fachai/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("fachai")) {
        console.log("Error updating seamless game status:", "FACHAI");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["fachai"].lock = !user.gameLock["fachai"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for FACHAI updated successfully.`,
          zh: `FACHAI 的游戏锁定状态更新成功。`,
          ms: `Status kunci permainan untuk FACHAI berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["fachai"],
      });
    } catch (error) {
      console.error(
        "Error updating FACHAI seamless game status:",
        error.message
      );
      return res.status(200).json({
        success: false,
        message: {
          en: "Internal Server Error. Please contact IT support for further assistance.",
          zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
          ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
        },
      });
    }
  }
);

module.exports = router;
