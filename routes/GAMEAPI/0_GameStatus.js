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

router.post(
  "/admin/api/playace/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("playace")) {
        console.log("Error updating seamless game status:", "PLAYACE");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["playace"].lock = !user.gameLock["playace"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for PLAYACE updated successfully.`,
          zh: `PLAYACE 的游戏锁定状态更新成功。`,
          ms: `Status kunci permainan untuk PLAYACE berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["playace"],
      });
    } catch (error) {
      console.error(
        "Error updating PLAYACE seamless game status:",
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
  "/admin/api/jili/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("jili")) {
        console.log("Error updating seamless game status:", "JILI");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["jili"].lock = !user.gameLock["jili"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for JILI updated successfully.`,
          zh: `JILI 的游戏锁定状态更新成功。`,
          ms: `Status kunci permainan untuk JILI berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["jili"],
      });
    } catch (error) {
      console.error("Error updating JILI seamless game status:", error.message);
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
  "/admin/api/yesgetrich/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("yesgetrich")) {
        console.log("Error updating seamless game status:", "YGR");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["yesgetrich"].lock = !user.gameLock["yesgetrich"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for YGR updated successfully.`,
          zh: `YGR 的游戏锁定状态更新成功。`,
          ms: `Status kunci permainan untuk YGR berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["yesgetrich"],
      });
    } catch (error) {
      console.error("Error updating YGR seamless game status:", error.message);
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
  "/admin/api/joker/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("joker")) {
        console.log("Error updating seamless game status:", "JOKER");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["joker"].lock = !user.gameLock["joker"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for JOKER updated successfully.`,
          zh: `JOKER 的游戏锁定状态更新成功。`,
          ms: `Status kunci permainan untuk JOKER berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["joker"],
      });
    } catch (error) {
      console.error(
        "Error updating JOKER seamless game status:",
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
  "/admin/api/microgaming/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("microgaming")) {
        console.log("Error updating seamless game status:", "MICRO GAMING");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["microgaming"].lock = !user.gameLock["microgaming"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for MICRO GAMING updated successfully.`,
          zh: `MICRO GAMING 的游戏锁定状态更新成功。`,
          ms: `Status kunci permainan untuk MICRO GAMING berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["microgaming"],
      });
    } catch (error) {
      console.error(
        "Error updating MICRO GAMING seamless game status:",
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
  "/admin/api/funky/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("funky")) {
        console.log("Error updating seamless game status:", "FUNKY");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["funky"].lock = !user.gameLock["funky"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for FUNKY updated successfully.`,
          zh: `FUNKY 的游戏锁定状态更新成功。`,
          ms: `Status kunci permainan untuk FUNKY berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["funky"],
      });
    } catch (error) {
      console.error(
        "Error updating FUNKY seamless game status:",
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
  "/admin/api/tfgaming/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("tfgaming")) {
        console.log("Error updating seamless game status:", "TF Gaming");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["tfgaming"].lock = !user.gameLock["tfgaming"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for TF Gaming updated successfully.`,
          zh: `TF Gaming 的游戏锁定状态更新成功。`,
          ms: `Status kunci permainan untuk TF Gaming berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["tfgaming"],
      });
    } catch (error) {
      console.error(
        "Error updating TF Gaming seamless game status:",
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
