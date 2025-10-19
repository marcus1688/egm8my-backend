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
const { getYesterdayGameLogs } = require("../../services/gameData");

require("dotenv").config();

router.post(
  "/admin/api/gw99/transferinstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameStatus.hasOwnProperty("gw99")) {
        console.log("Error updating transfer game status:", "GW99");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameStatus["gw99"].transferInStatus =
        !user.gameStatus["gw99"].transferInStatus;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game transferIn status for GW99 updated successfully.`,
          zh: `GW99 的转入状态更新成功。`,
          ms: `Status pemindahan masuk permainan GW99 berjaya dikemas kini.`,
        },
        gameStatus: user.gameStatus["gw99"],
      });
    } catch (error) {
      console.error("Error updating GW99 transfer game status:", error.message);
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
  "/admin/api/gw99/transferoutstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameStatus.hasOwnProperty("gw99")) {
        console.log("Error updating transfer game status:", "GW99");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameStatus["gw99"].transferOutStatus =
        !user.gameStatus["gw99"].transferOutStatus;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game transferOut status for GW99 updated successfully.`,
          zh: `GW99 的转出状态更新成功。`,
          ms: `Status pemindahan keluar permainan untuk GW99 berjaya dikemas kini.`,
        },
        gameStatus: user.gameStatus["gw99"],
      });
    } catch (error) {
      console.error("Error updating GW99 transfer game status:", error.message);
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
  "/admin/api/alipay/transferinstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameStatus.hasOwnProperty("alipay")) {
        console.log("Error updating transfer game status:", "ALIPAY");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameStatus["alipay"].transferInStatus =
        !user.gameStatus["alipay"].transferInStatus;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game transferIn status for ALIPAY updated successfully.`,
          zh: `ALIPAY 的转入状态更新成功。`,
          ms: `Status pemindahan masuk permainan ALIPAY berjaya dikemas kini.`,
        },
        gameStatus: user.gameStatus["alipay"],
      });
    } catch (error) {
      console.error(
        "Error updating ALIPAY transfer game status:",
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
  "/admin/api/alipay/transferoutstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameStatus.hasOwnProperty("alipay")) {
        console.log("Error updating transfer game status:", "ALIPAY");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameStatus["alipay"].transferOutStatus =
        !user.gameStatus["alipay"].transferOutStatus;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game transferOut status for ALIPAY updated successfully.`,
          zh: `ALIPAY 的转出状态更新成功。`,
          ms: `Status pemindahan keluar permainan untuk ALIPAY berjaya dikemas kini.`,
        },
        gameStatus: user.gameStatus["alipay"],
      });
    } catch (error) {
      console.error(
        "Error updating ALIPAY transfer game status:",
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
  "/admin/api/lionking/transferinstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameStatus.hasOwnProperty("lionking")) {
        console.log("Error updating transfer game status:", "LIONKING");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameStatus["lionking"].transferInStatus =
        !user.gameStatus["lionking"].transferInStatus;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game transferIn status for LIONKING updated successfully.`,
          zh: `LIONKING 的转入状态更新成功。`,
          ms: `Status pemindahan masuk permainan LIONKING berjaya dikemas kini.`,
        },
        gameStatus: user.gameStatus["lionking"],
      });
    } catch (error) {
      console.error(
        "Error updating LIONKING transfer game status:",
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
  "/admin/api/lionking/transferoutstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameStatus.hasOwnProperty("lionking")) {
        console.log("Error updating transfer game status:", "LIONKING");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameStatus["lionking"].transferOutStatus =
        !user.gameStatus["lionking"].transferOutStatus;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game transferOut status for LIONKING updated successfully.`,
          zh: `LIONKING 的转出状态更新成功。`,
          ms: `Status pemindahan keluar permainan untuk LIONKING berjaya dikemas kini.`,
        },
        gameStatus: user.gameStatus["lionking"],
      });
    } catch (error) {
      console.error(
        "Error updating LIONKING transfer game status:",
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
  "/admin/api/uuslot/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("uuslot")) {
        console.log("Error updating seamless game status:", "UUSLOT");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["uuslot"].lock = !user.gameLock["uuslot"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for UUSLOT updated successfully.`,
          zh: `UUSLOT 的游戏锁定状态更新成功。`,
          ms: `Status pemindahan masuk permainan UUSLOT berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["uuslot"],
      });
    } catch (error) {
      console.error(
        "Error updating UUSLOT seamless game status:",
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
  "/admin/api/cq9/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("cq9")) {
        console.log("Error updating seamless game status:", "CQ9");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["cq9"].lock = !user.gameLock["cq9"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for CQ9 updated successfully.`,
          zh: `CQ9 的游戏锁定状态更新成功。`,
          ms: `Status pemindahan masuk permainan CQ9 berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["cq9"],
      });
    } catch (error) {
      console.error("Error updating CQ9 seamless game status:", error.message);
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
          ms: `Status pemindahan masuk permainan JILI berjaya dikemas kini.`,
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
  "/admin/api/nextspin/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("nextspin")) {
        console.log("Error updating seamless game status:", "NEXTSPIN");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["nextspin"].lock = !user.gameLock["nextspin"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for NEXTSPIN updated successfully.`,
          zh: `NEXTSPIN 的游戏锁定状态更新成功。`,
          ms: `Status pemindahan masuk permainan NEXTSPIN berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["nextspin"],
      });
    } catch (error) {
      console.error(
        "Error updating NEXTSPIN seamless game status:",
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
          ms: `Status pemindahan masuk permainan JOKER berjaya dikemas kini.`,
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
  "/admin/api/asiagaming/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("asiagaming")) {
        console.log("Error updating seamless game status:", "ASIA GAMING");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["asiagaming"].lock = !user.gameLock["asiagaming"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for ASIA GAMING updated successfully.`,
          zh: `ASIA GAMING 的游戏锁定状态更新成功。`,
          ms: `Status pemindahan masuk permainan ASIA GAMING berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["asiagaming"],
      });
    } catch (error) {
      console.error(
        "Error updating ASIA GAMING seamless game status:",
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
  "/admin/api/gsc/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("gsi")) {
        console.log("Error updating seamless game status:", "GSC");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["gsi"].lock = !user.gameLock["gsi"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for GSC updated successfully.`,
          zh: `GSC 的游戏锁定状态更新成功。`,
          ms: `Status pemindahan masuk permainan GSC berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["gsi"],
      });
    } catch (error) {
      console.error("Error updating GSC seamless game status:", error.message);
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
  "/admin/api/lfc888/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("lfc888")) {
        console.log("Error updating seamless game status:", "LFC888");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["lfc888"].lock = !user.gameLock["lfc888"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for LFC888 updated successfully.`,
          zh: `LFC888 的游戏锁定状态更新成功。`,
          ms: `Status pemindahan masuk permainan LFC888 berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["lfc888"],
      });
    } catch (error) {
      console.error(
        "Error updating LFC888 seamless game status:",
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
  "/admin/api/pragmaticplay/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("pp")) {
        console.log("Error updating seamless game status:", "PRAGMATIC PLAY");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["pp"].lock = !user.gameLock["pp"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for PRAGMATIC PLAY updated successfully.`,
          zh: `PRAGMATIC PLAY 的游戏锁定状态更新成功。`,
          ms: `Status pemindahan masuk permainan PRAGMATIC PLAY berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["pp"],
      });
    } catch (error) {
      console.error(
        "Error updating PRAGMATIC PLAY seamless game status:",
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
  "/admin/api/cq9/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("cq9")) {
        console.log("Error updating seamless game status:", "CQ9");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["cq9"].lock = !user.gameLock["cq9"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for CQ9 updated successfully.`,
          zh: `CQ9 的游戏锁定状态更新成功。`,
          ms: `Status pemindahan masuk permainan CQ9 berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["cq9"],
      });
    } catch (error) {
      console.error("Error updating CQ9 seamless game status:", error.message);
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
  "/admin/api/kiss918h5/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("kiss918h5")) {
        console.log("Error updating seamless game status:", "918KISSH5");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["kiss918h5"].lock = !user.gameLock["kiss918h5"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for 918KISSH5 updated successfully.`,
          zh: `918KISSH5 的游戏锁定状态更新成功。`,
          ms: `Status pemindahan masuk permainan 918KISSH5 berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["kiss918h5"],
      });
    } catch (error) {
      console.error(
        "Error updating 918KISSH5 seamless game status:",
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
  "/admin/api/playtech/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("playtech")) {
        console.log("Error updating seamless game status:", "PLAYTECH");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["playtech"].lock = !user.gameLock["playtech"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for PLAYTECH updated successfully.`,
          zh: `PLAYTECH 的游戏锁定状态更新成功。`,
          ms: `Status pemindahan masuk permainan PLAYTECH berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["playtech"],
      });
    } catch (error) {
      console.error(
        "Error updating PLAYTECH seamless game status:",
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
  "/admin/api/habanero/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("habanero")) {
        console.log("Error updating seamless game status:", "HABANERO");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["habanero"].lock = !user.gameLock["habanero"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for HABANERO updated successfully.`,
          zh: `HABANERO 的游戏锁定状态更新成功。`,
          ms: `Status pemindahan masuk permainan HABANERO berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["habanero"],
      });
    } catch (error) {
      console.error(
        "Error updating HABANERO seamless game status:",
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
  "/admin/api/ct855/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("ct855")) {
        console.log("Error updating seamless game status:", "CT855");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["ct855"].lock = !user.gameLock["ct855"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for CT855 updated successfully.`,
          zh: `CT855 的游戏锁定状态更新成功。`,
          ms: `Status pemindahan masuk permainan CT855 berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["ct855"],
      });
    } catch (error) {
      console.error(
        "Error updating CT855 seamless game status:",
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
  "/admin/api/live22/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("live22")) {
        console.log("Error updating seamless game status:", "LIVE22");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["live22"].lock = !user.gameLock["live22"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for LIVE22 updated successfully.`,
          zh: `LIVE22 的游戏锁定状态更新成功。`,
          ms: `Status pemindahan masuk permainan LIVE22 berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["live22"],
      });
    } catch (error) {
      console.error(
        "Error updating LIVE22 seamless game status:",
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
  "/admin/api/megah5/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("mega888h5")) {
        console.log("Error updating seamless game status:", "MEGA888H5");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["mega888h5"].lock = !user.gameLock["mega888h5"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for MEGA888H5 updated successfully.`,
          zh: `MEGA888H5 的游戏锁定状态更新成功。`,
          ms: `Status pemindahan masuk permainan MEGA888H5 berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["mega888h5"],
      });
    } catch (error) {
      console.error(
        "Error updating MEGA888H5 seamless game status:",
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
  "/admin/api/cmd368/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("cmd368")) {
        console.log("Error updating seamless game status:", "CMD368");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["cmd368"].lock = !user.gameLock["cmd368"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for CMD368 updated successfully.`,
          zh: `CMD368 的游戏锁定状态更新成功。`,
          ms: `Status pemindahan masuk permainan CMD368 berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["cmd368"],
      });
    } catch (error) {
      console.error(
        "Error updating CMD368 seamless game status:",
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
  "/admin/api/spadegaming/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("spadegaming")) {
        console.log("Error updating seamless game status:", "Spade Gaming");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["spadegaming"].lock = !user.gameLock["spadegaming"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for Spade Gaming updated successfully.`,
          zh: `Spade Gaming 的游戏锁定状态更新成功。`,
          ms: `Status pemindahan masuk permainan Spade Gaming berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["spadegaming"],
      });
    } catch (error) {
      console.error(
        "Error updating Spade Gaming seamless game status:",
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
        console.log("Error updating seamless game status:", "Fachai");
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
          en: `Game lock status for Fachai updated successfully.`,
          zh: `Fachai 的游戏锁定状态更新成功。`,
          ms: `Status pemindahan masuk permainan Fachai berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["fachai"],
      });
    } catch (error) {
      console.error(
        "Error updating Fachai seamless game status:",
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
  "/admin/api/sagaming/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("sagaming")) {
        console.log("Error updating seamless game status:", "Sa Gaming");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["sagaming"].lock = !user.gameLock["sagaming"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status for Sa Gaming updated successfully.`,
          zh: `Sa Gaming 的游戏锁定状态更新成功。`,
          ms: `Status pemindahan masuk permainan Sa Gaming berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["sagaming"],
      });
    } catch (error) {
      console.error(
        "Error updating Sa Gaming seamless game status:",
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
        console.log("Error updating seamless game status:", "Micro Gaming");
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
          en: `Game lock status for Micro Gaming updated successfully.`,
          zh: `Micro Gaming 的游戏锁定状态更新成功。`,
          ms: `Status pemindahan masuk permainan Micro Gaming berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["microgaming"],
      });
    } catch (error) {
      console.error(
        "Error updating Micro Gaming seamless game status:",
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
  "/admin/api/hacksaw/seamlessstatus/:userId",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const userId = req.params.userId;

      const user = await User.findById(userId);

      if (!user.gameLock.hasOwnProperty("hacksaw")) {
        console.log("Error updating seamless game status:", "Hacksaw");
        return res.status(200).json({
          success: false,
          message: {
            en: "Internal Server Error. Please contact IT support for further assistance.",
            zh: "内部服务器错误。请联系IT客服以获取进一步帮助。",
            ms: "Ralat Pelayan Dalaman. Sila hubungi sokongan IT untuk bantuan lanjut.",
          },
        });
      }

      user.gameLock["hacksaw"].lock = !user.gameLock["hacksaw"].lock;

      await user.save();

      return res.status(200).json({
        success: true,
        message: {
          en: `Game lock status forHacksaw updated successfully.`,
          zh: `Hacksaw 的游戏锁定状态更新成功。`,
          ms: `Status pemindahan masuk permainan Hacksaw berjaya dikemas kini.`,
        },
        gameLock: user.gameLock["hacksaw"],
      });
    } catch (error) {
      console.error(
        "Error updating Hacksaw seamless game status:",
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
