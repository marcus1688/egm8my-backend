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

const SlotLivePPModal = require("../../models/slot_live_pp.model");
const SlotLiveAGModal = require("../../models/slot_live_ag.model");
const SlotLiveGSCModal = require("../../models/slot_live_gsc.model");
const SlotJokerModal = require("../../models/slot_joker.model");
const SlotJiliModal = require("../../models/slot_jili.model");
const SlotHabaneroModal = require("../../models/slot_habanero.model");
const SlotKiss918H5Modal = require("../../models/slot_kiss918.model");
const SlotCQ9Modal = require("../../models/slot_cq9.model");
const SlotLive22Modal = require("../../models/slot_live22.model");
const SlotUUSlotModal = require("../../models/slot_uuslot.model");
const LiveCT855Modal = require("../../models/live_ct855.model");
const SlotNextSpinModal = require("../../models/slot_nextspin.model");
const SlotLFC888Modal = require("../../models/slot_lfc888.model");
const PlaytechGameModal = require("../../models/slot_playtech.model");
const SlotMega888H5Modal = require("../../models/slot_mega888h5.model");
const LotteryAP95Modal = require("../../models/lottery_ap95.mode");
const slotGW99Modal = require("../../models/slot_gw99.model");
const slotLionKingModal = require("../../models/slot_lionking.model");
const SlotSpadeGamingModal = require("../../models/slot_spadegaming.model");
const SlotFachaiModal = require("../../models/slot_fachai.model");
const LiveSaGamingModal = require("../../models/live_sagaming.model");
const SlotLiveMicroGamingModal = require("../../models/slot_microgaming.model");
const SlotHacksawModal = require("../../models/slot_hacksaw.model");
const SportCMDModal = require("../../models/sport_cmd.model");

require("dotenv").config();

const getGameDataSummary = async (
  model,
  username,
  start,
  end,
  aggregationPipeline
) => {
  try {
    const results = await model.aggregate([
      {
        $match: {
          username: username.toLowerCase(),
          createdAt: { $gte: start, $lte: end },
          ...aggregationPipeline.$match,
        },
      },
      {
        $group: aggregationPipeline.$group,
      },
    ]);

    return results.length > 0 ? results[0] : { turnover: 0, winLoss: 0 };
  } catch (error) {
    console.error(
      `Error aggregating data for model ${model.modelName}:`,
      error
    );
    return { turnover: 0, winLoss: 0 };
  }
};

router.get("/api/all/:userId/dailygamedata", async (req, res) => {
  const startTime = Date.now();
  try {
    // Extract and validate params
    const { userId } = req.params;
    const { startDate } = req.query;
    const endDate = moment().format("YYYY-MM-DD HH:mm:ss");
    if (!startDate) {
      return res.status(400).json({
        success: false,
        message: {
          en: "Start date and end date are required",
          zh: "开始日期和结束日期是必填项",
          ms: "Tarikh mula dan tarikh akhir diperlukan",
        },
      });
    }

    // Find user
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

    const username = user.username.toLowerCase();

    // Format dates
    const start = moment(new Date(startDate)).utc().toDate();
    const end = moment(new Date(endDate)).utc().toDate();

    const aggregations = {
      pp: {
        $match: {
          refunded: false,
          ended: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      ag: {
        $match: {
          cancel: { $ne: true },
          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      gsc: {
        $match: {
          cancel: { $ne: true },
          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      joker: {
        $match: {
          cancel: { $ne: true },

          settle: true,
        },
        $group: {
          _id: null,
          turnover: {
            $sum: {
              $add: [
                { $ifNull: ["$betamount", 0] },
                { $ifNull: ["$fishTurnover", 0] },
              ],
            },
          },
          winLoss: {
            $sum: {
              $add: [
                {
                  $subtract: [
                    { $ifNull: ["$settleamount", 0] },
                    { $ifNull: ["$betamount", 0] },
                  ],
                },
                { $ifNull: ["$fishWinLoss", 0] },
              ],
            },
          },
        },
      },
      jili: {
        $match: {
          cancel: { $ne: true },

          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      habanero: {
        $match: {
          refund: { $ne: true },

          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      kiss918H5: {
        $match: {
          cancel: { $ne: true },

          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      cq9: {
        $match: {
          cancel: { $ne: true },
          refund: { $ne: true },
          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      live22: {
        $match: {
          cancel: { $ne: true },

          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      uuslot: {
        $match: {
          cancel: { $ne: true },

          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      ct855: {
        $match: {
          cancel: { $ne: true },
          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      playtech: {
        $match: {
          settle: true,
          cancel: { $ne: true },
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betAmount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      nextspin: {
        $match: {
          cancel: { $ne: true },
          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      lfc888: {
        $match: {
          cancel: { $ne: true },
          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      mega888h5: {
        $match: {
          cancel: { $ne: true },
          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      alipay: {
        $match: {},
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      lionking: {
        $match: {},
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      gw99: {
        $match: {
          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      spadegamingslot: {
        $match: {
          cancel: { $ne: true },
          settle: true,
          gametype: "SLOT",
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      spadegamingfish: {
        $match: {
          cancel: { $ne: true },
          settle: true,
          gametype: "FISH",
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$withdrawamount", 0] },
                { $ifNull: ["$depositamount", 0] },
              ],
            },
          },
        },
      },
      fachai: {
        $match: {
          cancel: { $ne: true },
          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      sagaming: {
        $match: {
          cancel: { $ne: true },

          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      microgaming: {
        $match: {
          cancel: { $ne: true },
          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      hacksaw: {
        $match: {
          cancel: { $ne: true },

          settle: true,
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
      cmd368: {
        $match: {
          cancel: { $ne: true },
        },
        $group: {
          _id: null,
          turnover: { $sum: { $ifNull: ["$betamount", 0] } },
          winLoss: {
            $sum: {
              $subtract: [
                { $ifNull: ["$settleamount", 0] },
                { $ifNull: ["$betamount", 0] },
              ],
            },
          },
        },
      },
    };

    // Create an array of promises for all aggregations
    const promiseResults = await Promise.allSettled([
      getGameDataSummary(
        SlotLivePPModal,
        username,
        start,
        end,
        aggregations.pp
      ),
      getGameDataSummary(
        SlotLiveAGModal,
        username,
        start,
        end,
        aggregations.ag
      ),
      getGameDataSummary(
        SlotLiveGSCModal,
        username,
        start,
        end,
        aggregations.gsc
      ),
      getGameDataSummary(
        SlotJokerModal,
        username,
        start,
        end,
        aggregations.joker
      ),
      getGameDataSummary(
        SlotJiliModal,
        username,
        start,
        end,
        aggregations.jili
      ),
      getGameDataSummary(
        SlotHabaneroModal,
        username,
        start,
        end,
        aggregations.habanero
      ),
      getGameDataSummary(
        SlotKiss918H5Modal,
        username,
        start,
        end,
        aggregations.kiss918H5
      ),
      getGameDataSummary(SlotCQ9Modal, username, start, end, aggregations.cq9),
      getGameDataSummary(
        SlotLive22Modal,
        username,
        start,
        end,
        aggregations.live22
      ),
      getGameDataSummary(
        SlotUUSlotModal,
        username,
        start,
        end,
        aggregations.uuslot
      ),
      getGameDataSummary(
        LiveCT855Modal,
        username,
        start,
        end,
        aggregations.ct855
      ),
      getGameDataSummary(
        PlaytechGameModal,
        username,
        start,
        end,
        aggregations.playtech
      ),
      getGameDataSummary(
        SlotNextSpinModal,
        username,
        start,
        end,
        aggregations.nextspin
      ),
      getGameDataSummary(
        SlotLFC888Modal,
        username,
        start,
        end,
        aggregations.lfc888
      ),
      getGameDataSummary(
        SlotMega888H5Modal,
        username,
        start,
        end,
        aggregations.mega888h5
      ),
      getGameDataSummary(
        LotteryAP95Modal,
        username,
        start,
        end,
        aggregations.alipay
      ),
      getGameDataSummary(
        slotLionKingModal,
        username,
        start,
        end,
        aggregations.lionking
      ),
      getGameDataSummary(
        slotGW99Modal,
        username,
        start,
        end,
        aggregations.gw99
      ),
      getGameDataSummary(
        SlotSpadeGamingModal,
        username,
        start,
        end,
        aggregations.spadegamingslot
      ),
      getGameDataSummary(
        SlotSpadeGamingModal,
        username,
        start,
        end,
        aggregations.spadegamingfish
      ),
      getGameDataSummary(
        SlotFachaiModal,
        username,
        start,
        end,
        aggregations.fachai
      ),
      getGameDataSummary(
        LiveSaGamingModal,
        username,
        start,
        end,
        aggregations.sagaming
      ),
      getGameDataSummary(
        SlotLiveMicroGamingModal,
        username,
        start,
        end,
        aggregations.microgaming
      ),
      getGameDataSummary(
        SlotHacksawModal,
        username,
        start,
        end,
        aggregations.hacksaw
      ),
      getGameDataSummary(
        SportCMDModal,
        username,
        start,
        end,
        aggregations.cmd368
      ),
    ]);

    // Extract results safely
    const [
      pp,
      ag,
      gsc,
      joker,
      jili,
      habanero,
      kiss918H5,
      cq9,
      live22,
      uuslot,
      ct855,
      playtech,
      nextspin,
      lfc888,
      mega888h5,
      alipay,
      lionking,
      gw99,
      spadegamingslot,
      spadegamingfish,
      fachai,
      sagaming,
      microgaming,
      hacksaw,
      cmd368,
    ] = promiseResults.map((result) =>
      result.status === "fulfilled" ? result.value : { turnover: 0, winLoss: 0 }
    );

    // Calculate total turnover and win loss
    const totalTurnover =
      (pp.turnover || 0) +
      (ag.turnover || 0) +
      (gsc.turnover || 0) +
      (joker.turnover || 0) +
      (jili.turnover || 0) +
      (habanero.turnover || 0) +
      (kiss918H5.turnover || 0) +
      (cq9.turnover || 0) +
      (live22.turnover || 0) +
      (uuslot.turnover || 0) +
      (ct855.turnover || 0) +
      (playtech.turnover || 0) +
      (nextspin.turnover || 0) +
      (lfc888.turnover || 0) +
      (mega888h5.turnover || 0) +
      (alipay.turnover || 0) +
      (lionking.turnover || 0) +
      (gw99.turnover || 0) +
      (spadegamingslot.turnover || 0) +
      (spadegamingfish.turnover || 0) +
      (fachai.turnover || 0) +
      (sagaming.turnover || 0) +
      (microgaming.turnover || 0) +
      (hacksaw.turnover || 0) +
      (cmd368.turnover || 0);
    const totalWinLoss =
      (pp.winLoss || 0) +
      (ag.winLoss || 0) +
      (gsc.winLoss || 0) +
      (joker.winLoss || 0) +
      (jili.winLoss || 0) +
      (habanero.winLoss || 0) +
      (kiss918H5.winLoss || 0) +
      (cq9.winLoss || 0) +
      (live22.winLoss || 0) +
      (uuslot.winLoss || 0) +
      (ct855.winLoss || 0) +
      (playtech.winLoss || 0) +
      (nextspin.winLoss || 0) +
      (lfc888.winLoss || 0) +
      (mega888h5.winLoss || 0) +
      (alipay.winLoss || 0) +
      (lionking.winLoss || 0) +
      (gw99.winLoss || 0) +
      (spadegamingslot.winLoss || 0) +
      (spadegamingfish.winLoss || 0) +
      (fachai.winLoss || 0) +
      (sagaming.winLoss || 0) +
      (microgaming.winLoss || 0) +
      (hacksaw.winLoss || 0) +
      (cmd368.winLoss || 0);

    const executionTime = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      summary: {
        username,
        totalTurnover: Number(totalTurnover.toFixed(2)),
        totalWinLoss: Number(totalWinLoss.toFixed(2)),
        executionTime, // Include in development, remove in production
      },
    });
  } catch (error) {
    console.error("ALL GAME DATA: Failed to fetch report:", error);
    return res.status(500).json({
      success: false,
      message: {
        en: "Failed to fetch turnover report for all users",
        zh: "获取所有用户投注额报告失败",
        ms: "Gagal mendapatkan laporan pusing ganti untuk semua pengguna",
      },
    });
  }
});

module.exports = router;
