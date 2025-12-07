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
const UserWalletLog = require("../../models/userwalletlog.model");
const Bonus = require("../../models/bonus.model");
const Promotion = require("../../models/promotion.model");
const Deposit = require("../../models/deposit.model");
const Withdraw = require("../../models/withdraw.model");
const vip = require("../../models/vip.model");
const RebateLog = require("../../models/rebate.model");

const GameWalletLog = require("../../models/gamewalletlog.model");

const SlotEpicWinModal = require("../../models/slot_epicwin.model");
const SlotFachaiModal = require("../../models/slot_fachai.model");
const SlotLivePlayAceModal = require("../../models/slot_liveplayace.model");
const SlotJiliModal = require("../../models/slot_jili.model");
const SlotYGRModal = require("../../models/slot_yesgetrich.model");
const SlotJokerModal = require("../../models/slot_joker.model");
const SlotLiveMicroGamingModal = require("../../models/slot_livemicrogaming.model");
const SlotFunkyModal = require("../../models/slot_funky.model");
const EsportTfGamingModal = require("../../models/esport_tfgaming.model");
const LiveSaGamingModal = require("../../models/live_sagaming.model");
const LiveYeebetModal = require("../../models/live_yeebet.model");
const LiveWeCasinoModal = require("../../models/live_wecasino.model");
const SlotCQ9Modal = require("../../models/slot_cq9.model");
const SlotHabaneroModal = require("../../models/slot_habanero.model");
const SlotBNGModal = require("../../models/slot_bng.model");
const SlotPlayStarModal = require("../../models/slot_playstar.model");
const SlotVPowerModal = require("../../models/slot_vpower.model");
const SlotNextSpinModal = require("../../models/slot_nextspin.model");
const SlotDCTGameModal = require("../../models/slot_dctgame.model");
const SlotPlaytechModal = require("../../models/slot_playtech.model");
const SlotFastSpinModal = require("../../models/slot_fastspin.model");
const SlotRich88Modal = require("../../models/slot_rich88.model");
const SlotBTGamingModal = require("../../models/slot_btgaming.model");
const SlotAceWinModal = require("../../models/slot_acewin.model");
const SlotSpadeGamingModal = require("../../models/slot_spadegaming.model");
const slotMega888Modal = require("../../models/slot_mega888.model");
const SlotRSGModal = require("../../models/slot_rsg.model");
const SlotLivePPModal = require("../../models/slot_live_pp.model");
const SportM9BetModal = require("../../models/sport_m9bet.model");
const slot918KissModal = require("../../models/slot_918kiss.model");
const LotteryHuaweiModal = require("../../models/other_huaweilottery.model");
const LiveWMCasinoRebateModal = require("../../models/live_wmcasinorebate.model");
const SlotIBEXModal = require("../../models/slot_ibex.model");

require("dotenv").config();

function roundToTwoDecimals(num) {
  return Math.round(Number(num) * 100) / 100;
}

async function fetchRouteWithRetry(
  route,
  date,
  retryCount = 3,
  delayMinutes = 2
) {
  for (let i = 0; i < retryCount; i++) {
    try {
      const response = await axios.post(route.url, { date });
      if (response.data.success) {
        return response.data.summary;
      }
    } catch (error) {
      console.error(
        `Attempt ${i + 1} failed for ${route.name}:`,
        error.message
      );
      if (i < retryCount - 1) {
        console.log(`Retrying ${route.name} in ${delayMinutes} minutes...`);
        await new Promise((resolve) =>
          setTimeout(resolve, delayMinutes * 60 * 1000)
        );
      } else {
        console.error(
          `All retries failed for ${route.name}. Last error:`,
          error.response?.data || error.message
        );
      }
    }
  }
  return null;
}

const PUBLIC_APIURL = process.env.BASE_URL;

router.post("/admin/api/getAllTurnoverForRebate", async (req, res) => {
  try {
    const { date, pass } = req.body;
    const allGamesData = [];

    // if (pass !== process.env.SERVER_SECRET) {
    //   console.error(
    //     "Error in getAllTurnoverForRebate: Invalid Secret Key",
    //     error.message
    //   );
    //   return res.status(500).json({
    //     success: false,
    //     error: "Failed to fetch combined turnover data",
    //   });
    // }

    const routes = [
      {
        url: `${PUBLIC_APIURL}api/epicwin/getturnoverforrebate`,
        name: "EPICWIN",
      },
      {
        url: `${PUBLIC_APIURL}api/fachaislot/getturnoverforrebate`,
        name: "FACHAI",
      },
      {
        url: `${PUBLIC_APIURL}api/fachaifish/getturnoverforrebate`,
        name: "FACHAI",
      },
      {
        url: `${PUBLIC_APIURL}api/playaceslot/getturnoverforrebate`,
        name: "PLAYACE",
      },
      {
        url: `${PUBLIC_APIURL}api/playacelive/getturnoverforrebate`,
        name: "PLAYACE",
      },
      {
        url: `${PUBLIC_APIURL}api/jilislot/getturnoverforrebate`,
        name: "JILI",
      },
      {
        url: `${PUBLIC_APIURL}api/jilifish/getturnoverforrebate`,
        name: "JILI",
      },
      {
        url: `${PUBLIC_APIURL}api/yesgetrichslot/getturnoverforrebate`,
        name: "YGR",
      },
      {
        url: `${PUBLIC_APIURL}api/yesgetrichfish/getturnoverforrebate`,
        name: "YGR",
      },
      {
        url: `${PUBLIC_APIURL}api/jokerslot/getturnoverforrebate`,
        name: "JOKER",
      },
      {
        url: `${PUBLIC_APIURL}api/jokerfish/getturnoverforrebate`,
        name: "JOKER",
      },
      {
        url: `${PUBLIC_APIURL}api/microgamingslot/getturnoverforrebate`,
        name: "MICRO GAMING",
      },
      {
        url: `${PUBLIC_APIURL}api/microgaminglive/getturnoverforrebate`,
        name: "MICRO GAMING",
      },
      {
        url: `${PUBLIC_APIURL}api/funkyslot/getturnoverforrebate`,
        name: "FUNKY",
      },
      {
        url: `${PUBLIC_APIURL}api/funkyfish/getturnoverforrebate`,
        name: "FUNKY",
      },
      {
        url: `${PUBLIC_APIURL}api/tfgaming/getturnoverforrebate`,
        name: "TF GAMING",
      },
      {
        url: `${PUBLIC_APIURL}api/sagaming/getturnoverforrebate`,
        name: "SA GAMING",
      },
      {
        url: `${PUBLIC_APIURL}api/yeebet/getturnoverforrebate`,
        name: "YEEBET",
      },
      {
        url: `${PUBLIC_APIURL}api/wecasino/getturnoverforrebate`,
        name: "WE CASINO",
      },
      {
        url: `${PUBLIC_APIURL}api/cq9slot/getturnoverforrebate`,
        name: "CQ9",
      },
      {
        url: `${PUBLIC_APIURL}api/cq9fish/getturnoverforrebate`,
        name: "CQ9",
      },
      {
        url: `${PUBLIC_APIURL}api/habanero/getturnoverforrebate`,
        name: "HABANERO",
      },
      {
        url: `${PUBLIC_APIURL}api/bng/getturnoverforrebate`,
        name: "BNG",
      },
      {
        url: `${PUBLIC_APIURL}api/playstar/getturnoverforrebate`,
        name: "PLAYSTAR",
      },
      {
        url: `${PUBLIC_APIURL}api/vpower/getturnoverforrebate`,
        name: "VPOWER",
      },
      {
        url: `${PUBLIC_APIURL}api/nextspin/getturnoverforrebate`,
        name: "NEXTSPIN",
      },
      {
        url: `${PUBLIC_APIURL}api/hacksaw/getturnoverforrebate`,
        name: "HACKSAW",
      },
      {
        url: `${PUBLIC_APIURL}api/relaxgaming/getturnoverforrebate`,
        name: "RELAX GAMING",
      },
      {
        url: `${PUBLIC_APIURL}api/playtechslot/getturnoverforrebate`,
        name: "PLAYTECH",
      },
      {
        url: `${PUBLIC_APIURL}api/playtechlive/getturnoverforrebate`,
        name: "PLAYTECH",
      },
      {
        url: `${PUBLIC_APIURL}api/fastspinslot/getturnoverforrebate`,
        name: "FASTSPIN",
      },
      {
        url: `${PUBLIC_APIURL}api/fastspinfish/getturnoverforrebate`,
        name: "FASTSPIN",
      },
      {
        url: `${PUBLIC_APIURL}api/rich88/getturnoverforrebate`,
        name: "RICH88",
      },
      {
        url: `${PUBLIC_APIURL}api/btgaming/getturnoverforrebate`,
        name: "BT GAMING",
      },
      {
        url: `${PUBLIC_APIURL}api/acewinslot/getturnoverforrebate`,
        name: "ACEWIN",
      },
      {
        url: `${PUBLIC_APIURL}api/acewinfish/getturnoverforrebate`,
        name: "ACEWIN",
      },
      {
        url: `${PUBLIC_APIURL}api/spadegamingslot/getturnoverforrebate`,
        name: "SPADE GAMING",
      },
      {
        url: `${PUBLIC_APIURL}api/spadegamingfish/getturnoverforrebate`,
        name: "SPADE GAMING",
      },
      {
        url: `${PUBLIC_APIURL}api/mega888/getturnoverforrebate`,
        name: "MEGA888",
      },
      {
        url: `${PUBLIC_APIURL}api/rsgslot/getturnoverforrebate`,
        name: "RSG",
      },
      {
        url: `${PUBLIC_APIURL}api/rsgfish/getturnoverforrebate`,
        name: "RSG",
      },
      {
        url: `${PUBLIC_APIURL}api/ppslot/getturnoverforrebate`,
        name: "PRAGMATIC PLAY SLOT",
      },
      {
        url: `${PUBLIC_APIURL}api/pplive/getturnoverforrebate`,
        name: "PRAGMATIC PLAY LIVE",
      },
      {
        url: `${PUBLIC_APIURL}api/m9bet/getturnoverforrebate`,
        name: "M9BET",
      },
      {
        url: `${PUBLIC_APIURL}api/918kiss/getturnoverforrebate`,
        name: "918KISS",
      },
      {
        url: `${PUBLIC_APIURL}api/huawei/getturnoverforrebate`,
        name: "GRAND DRAGON",
      },
      {
        url: `${PUBLIC_APIURL}api/wmcasino/getturnoverforrebate`,
        name: "WM CASINO",
      },
      {
        url: `${PUBLIC_APIURL}api/ibex/getturnoverforrebate`,
        name: "IBEX",
      },
    ];

    const routePromises = routes.map((route) =>
      fetchRouteWithRetry(route, date)
    );
    const results = await Promise.all(routePromises);

    results.forEach((result) => {
      if (result) allGamesData.push(result);
    });

    const combinedUserData = {};

    allGamesData.forEach((gameData) => {
      const { gamename, gamecategory, users } = gameData;

      Object.entries(users).forEach(([username, data]) => {
        if (!combinedUserData[username]) {
          combinedUserData[username] = {};
        }

        if (!combinedUserData[username][gamecategory]) {
          combinedUserData[username][gamecategory] = {};
        }

        combinedUserData[username][gamecategory][gamename] = {
          turnover: data.turnover,
          winloss: data.winloss,
        };
      });
    });

    const yesterday = moment
      .utc()
      .add(8, "hours")
      .subtract(1, "days")
      .format("YYYY-MM-DD");

    for (const [username, categories] of Object.entries(combinedUserData)) {
      const gameCategories = new Map();

      for (const [category, games] of Object.entries(categories)) {
        gameCategories.set(category, new Map(Object.entries(games)));
      }

      await GameDataLog.findOneAndUpdate(
        { username, date: yesterday },
        {
          username,
          date: yesterday,
          gameCategories,
        },
        { upsert: true, new: true }
      );
    }

    return res.status(200).json({
      success: true,
      data: combinedUserData,
    });
  } catch (error) {
    console.error("Error in getAllTurnoverForRebate:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch combined turnover data",
    });
  }
});

const DEFAULT_TURNOVER_MULTIPLIER = 1;

const CATEGORIES = {
  LIVE_CASINO: "Live Casino",
  SLOT: "Slot",
  SPORTS: "Sports",
  ESPORTS: "Esports",
  FISHING: "Fishing",
  LOTTERY: "Lottery",
};

const GAME_CONFIG = [
  // ========== SLOT ==========
  {
    model: SlotEpicWinModal,
    name: "epicwin",
    category: CATEGORIES.SLOT,
    match: { cancel: { $ne: true }, settle: true },
  },
  {
    model: SlotFachaiModal,
    name: "fachaiSlot",
    category: CATEGORIES.SLOT,
    match: { cancel: { $ne: true }, settle: true, gametype: { $ne: "FISH" } },
  },
  {
    model: SlotLivePlayAceModal,
    name: "playace",
    category: CATEGORIES.SLOT,
    match: { cancel: { $ne: true }, settle: true },
  },
  {
    model: SlotJiliModal,
    name: "jiliSlot",
    category: CATEGORIES.SLOT,
    match: { cancel: { $ne: true }, settle: true, gametype: { $ne: "FISH" } },
  },
  {
    model: SlotYGRModal,
    name: "ygrSlot",
    category: CATEGORIES.SLOT,
    match: { cancel: { $ne: true }, settle: true, gametype: { $ne: "FISH" } },
  },
  {
    model: SlotJokerModal,
    name: "jokerSlot",
    category: CATEGORIES.SLOT,
    match: { cancel: { $ne: true }, settle: true, gametype: { $ne: "FISH" } },
  },
  {
    model: SlotFunkyModal,
    name: "funky",
    category: CATEGORIES.SLOT,
    match: { cancel: { $ne: true }, settle: true },
  },
  {
    model: SlotCQ9Modal,
    name: "cq9Slot",
    category: CATEGORIES.SLOT,
    match: {
      cancel: { $ne: true },
      refund: { $ne: true },
      settle: true,
      gametype: { $ne: "FISH" },
    },
  },
  {
    model: SlotHabaneroModal,
    name: "habanero",
    category: CATEGORIES.SLOT,
    match: { refund: { $ne: true }, settle: true },
  },
  {
    model: SlotBNGModal,
    name: "bng",
    category: CATEGORIES.SLOT,
    match: { cancel: { $ne: true }, settle: true },
  },
  {
    model: SlotPlayStarModal,
    name: "playstar",
    category: CATEGORIES.SLOT,
    match: { cancel: { $ne: true }, settle: true },
  },
  {
    model: SlotVPowerModal,
    name: "vpower",
    category: CATEGORIES.SLOT,
    match: { settle: true },
  },
  {
    model: SlotNextSpinModal,
    name: "nextspin",
    category: CATEGORIES.SLOT,
    match: { cancel: { $ne: true }, settle: true },
  },
  {
    model: SlotDCTGameModal,
    name: "dctgames",
    category: CATEGORIES.SLOT,
    match: { cancel: { $ne: true }, settle: true },
  },
  {
    model: SlotPlaytechModal,
    name: "playtech",
    category: CATEGORIES.SLOT,
    match: { settle: true, cancel: { $ne: true } },
  },
  {
    model: SlotFastSpinModal,
    name: "fastspinSlot",
    category: CATEGORIES.SLOT,
    match: { cancel: { $ne: true }, settle: true, gametype: { $ne: "FISH" } },
  },
  {
    model: SlotRich88Modal,
    name: "rich88",
    category: CATEGORIES.SLOT,
    match: { cancel: { $ne: true }, settle: true },
  },
  {
    model: SlotBTGamingModal,
    name: "btgaming",
    category: CATEGORIES.SLOT,
    match: { cancel: { $ne: true }, settle: true },
  },
  {
    model: SlotAceWinModal,
    name: "acewinSlot",
    category: CATEGORIES.SLOT,
    match: { cancel: { $ne: true }, settle: true, gametype: { $ne: "FISH" } },
  },
  {
    model: SlotSpadeGamingModal,
    name: "spadegamingSlot",
    category: CATEGORIES.SLOT,
    match: { cancel: { $ne: true }, settle: true, gametype: { $ne: "FISH" } },
  },
  {
    model: slotMega888Modal,
    name: "mega888",
    category: CATEGORIES.SLOT,
    match: {},
    useUsername: true,
  },
  {
    model: SlotRSGModal,
    name: "rsgSlot",
    category: CATEGORIES.SLOT,
    match: { cancel: { $ne: true }, settle: true, gametype: { $ne: "FISH" } },
  },
  {
    model: SlotLivePPModal,
    name: "ppSlot",
    category: CATEGORIES.SLOT,
    match: { refunded: false, ended: true, gameType: "Slot" },
  },
  {
    model: slot918KissModal,
    name: "kiss918",
    category: CATEGORIES.SLOT,
    match: {},
    useUsername: true,
  },
  {
    model: SlotIBEXModal,
    name: "ibex",
    category: CATEGORIES.SLOT,
    match: { cancel: { $ne: true }, settle: true },
  },
  {
    model: SlotLiveMicroGamingModal,
    name: "microgamingSlot",
    category: CATEGORIES.SLOT,
    match: { cancel: { $ne: true }, settle: true, gameType: "SLOT" },
  },

  // ========== LIVE CASINO ==========
  {
    model: SlotLiveMicroGamingModal,
    name: "microgamingLive",
    category: CATEGORIES.LIVE_CASINO,
    match: { cancel: { $ne: true }, settle: true, gameType: "LIVE" },
  },
  {
    model: LiveSaGamingModal,
    name: "sagaming",
    category: CATEGORIES.LIVE_CASINO,
    match: { cancel: { $ne: true }, settle: true },
    useValidBet: true,
  },
  {
    model: LiveYeebetModal,
    name: "yeebet",
    category: CATEGORIES.LIVE_CASINO,
    match: { settle: true, cancel: { $ne: true } },
  },
  {
    model: LiveWeCasinoModal,
    name: "wecasino",
    category: CATEGORIES.LIVE_CASINO,
    match: { settle: true, cancel: { $ne: true } },
    useValidBet: true,
  },
  {
    model: LiveWMCasinoRebateModal,
    name: "wmcasino",
    category: CATEGORIES.LIVE_CASINO,
    match: {},
    useUsername: true,
  },
  {
    model: SlotLivePPModal,
    name: "ppLive",
    category: CATEGORIES.LIVE_CASINO,
    match: { refunded: false, ended: true, gameType: "Live" },
  },

  // ========== SPORTS ==========
  {
    model: SportM9BetModal,
    name: "m9bet",
    category: CATEGORIES.SPORTS,
    match: { cancel: { $ne: true }, settle: true },
  },

  // ========== ESPORTS ==========
  {
    model: EsportTfGamingModal,
    name: "tfgaming",
    category: CATEGORIES.ESPORTS,
    match: { settle: true, cancel: { $ne: true } },
  },

  // ========== FISHING (0% rebate) ==========
  {
    model: SlotFachaiModal,
    name: "fachaiFish",
    category: CATEGORIES.FISHING,
    match: { cancel: { $ne: true }, settle: true, gametype: "FISH" },
  },
  {
    model: SlotJiliModal,
    name: "jiliFish",
    category: CATEGORIES.FISHING,
    match: { cancel: { $ne: true }, settle: true, gametype: "FISH" },
  },
  {
    model: SlotYGRModal,
    name: "ygrFish",
    category: CATEGORIES.FISHING,
    match: { cancel: { $ne: true }, settle: true, gametype: "FISH" },
  },
  {
    model: SlotJokerModal,
    name: "jokerFish",
    category: CATEGORIES.FISHING,
    match: { cancel: { $ne: true }, settle: true, gametype: "FISH" },
    isJoker: true,
  },
  {
    model: SlotCQ9Modal,
    name: "cq9Fish",
    category: CATEGORIES.FISHING,
    match: {
      cancel: { $ne: true },
      refund: { $ne: true },
      settle: true,
      gametype: "FISH",
    },
  },
  {
    model: SlotFastSpinModal,
    name: "fastspinFish",
    category: CATEGORIES.FISHING,
    match: { cancel: { $ne: true }, settle: true, gametype: "FISH" },
  },
  {
    model: SlotAceWinModal,
    name: "acewinFish",
    category: CATEGORIES.FISHING,
    match: { cancel: { $ne: true }, settle: true, gametype: "FISH" },
  },
  {
    model: SlotSpadeGamingModal,
    name: "spadegamingFish",
    category: CATEGORIES.FISHING,
    match: { cancel: { $ne: true }, settle: true, gametype: "FISH" },
  },
  {
    model: SlotRSGModal,
    name: "rsgFish",
    category: CATEGORIES.FISHING,
    match: { cancel: { $ne: true }, settle: true, gametype: "FISH" },
  },

  // ========== LOTTERY (0% rebate) ==========
  {
    model: LotteryHuaweiModal,
    name: "granddragon",
    category: CATEGORIES.LOTTERY,
    match: { cancel: { $ne: true } },
    useUsername: true,
  },
];

const buildUsernameSearchArray = (gameId, username) => {
  const upperGameId = gameId.toUpperCase();
  const lowerGameId = gameId.toLowerCase();
  const variations = [
    upperGameId,
    `${upperGameId}2X`,
    `${upperGameId}2x`,
    lowerGameId,
    `${lowerGameId}2X`,
    `${lowerGameId}2x`,
    gameId,
  ];

  if (username && username !== gameId) {
    const upperUsername = username.toUpperCase();
    const lowerUsername = username.toLowerCase();
    variations.push(
      upperUsername,
      `${upperUsername}2X`,
      `${upperUsername}2x`,
      lowerUsername,
      `${lowerUsername}2X`,
      `${lowerUsername}2x`,
      username
    );
  }

  return [...new Set(variations)];
};

const getVipRebateRates = (vipLevels, userVipLevel) => {
  if (!userVipLevel) {
    console.error(`❌ VIP Error: No VIP level assigned`);
    return null;
  }

  const vipLevel = vipLevels.find(
    (level) => level.name.toLowerCase() === userVipLevel.toLowerCase()
  );

  if (!vipLevel?.benefits) {
    console.error(`❌ VIP Error: "${userVipLevel}" not found or no benefits`);
    return null;
  }

  const benefits =
    vipLevel.benefits instanceof Map
      ? Object.fromEntries(vipLevel.benefits)
      : vipLevel.benefits;

  const liveCasino = parseFloat(benefits["Rebate Live Casino"]);
  const sports = parseFloat(benefits["Rebate Sports"]);
  const slot = parseFloat(benefits["Rebate Slot"]);
  const esports = parseFloat(benefits["Rebate Esports"]);

  if (isNaN(liveCasino) || isNaN(sports) || isNaN(slot) || isNaN(esports)) {
    console.error(
      `❌ VIP Error: "${userVipLevel}" missing required rebate rates`
    );
    console.error(
      `   Live Casino: ${liveCasino}, Sports: ${sports}, Slot: ${slot}, Esports: ${esports}`
    );
    return null;
  }

  return {
    [CATEGORIES.LIVE_CASINO]: liveCasino / 100,
    [CATEGORIES.SLOT]: slot / 100,
    [CATEGORIES.SPORTS]: sports / 100,
    [CATEGORIES.ESPORTS]: esports / 100,
    [CATEGORIES.FISHING]: 0,
    [CATEGORIES.LOTTERY]: 0,
  };
};
/**
 * Check user qualification for rebate
 *
 * Scenarios:
 * 1. No deposits AND no bonuses → Disqualified (nothing to claim)
 * 2. No deposits BUT has bonuses → Calculate turnover requirement (free bonus)
 * 3. Has deposits, no bonuses → Qualified from latest deposit
 * 4. Has deposits, pure deposit after latest bonus → Qualified from pure deposit
 * 5. Has deposits, all linked to bonuses → Calculate turnover requirement
 */
const checkUserQualification = async (userId) => {
  try {
    console.log(`\n🔍 Checking qualification for user: ${userId}`);

    const [deposits, bonuses] = await Promise.all([
      Deposit.find({ userId, status: "approved", reverted: false })
        .sort({ createdAt: -1 })
        .lean(),
      Bonus.find({ userId, status: "approved", reverted: false })
        .sort({ createdAt: 1 })
        .lean(),
    ]);

    console.log(
      `User ${userId}: ${deposits.length} deposits, ${bonuses.length} bonuses`
    );

    const hasDeposits = deposits?.length > 0;
    const hasBonuses = bonuses?.length > 0;

    // SCENARIO 1: No deposits AND no bonuses = disqualified
    if (!hasDeposits && !hasBonuses) {
      console.log(`❌ User ${userId}: No deposits and no bonuses`);
      return {
        qualified: false,
        reason: "No deposits and no bonuses found",
        turnoverRequired: 0,
      };
    }

    // SCENARIO 2: No deposits BUT has bonuses (free bonus) = check turnover requirement
    if (!hasDeposits && hasBonuses) {
      console.log(
        `📊 User ${userId}: No deposits but has free bonuses, calculating turnover requirement...`
      );

      const promotionIds = [
        ...new Set(bonuses.map((b) => b.promotionId).filter(Boolean)),
      ];
      const promotions = await Promotion.find({
        _id: { $in: promotionIds },
      }).lean();
      const promotionMap = new Map(promotions.map((p) => [String(p._id), p]));

      let totalTurnoverRequired = 0;
      const bonusDetails = [];

      for (const bonus of bonuses) {
        const promotion = promotionMap.get(String(bonus.promotionId));
        const multiplier =
          promotion?.turnoverrequiremnt || DEFAULT_TURNOVER_MULTIPLIER;
        const bonusAmount = parseFloat(bonus.amount) || 0;
        const requiredForThisBonus = bonusAmount * multiplier;

        totalTurnoverRequired += requiredForThisBonus;

        bonusDetails.push({
          bonusId: bonus._id,
          bonusAmount,
          multiplier,
          required: requiredForThisBonus,
          promotionName: promotion?.name || "Unknown",
          createdAt: bonus.createdAt,
        });

        console.log(
          `   Free Bonus: ${bonusAmount} × ${multiplier}x = ${requiredForThisBonus} (${
            promotion?.name || "Unknown"
          })`
        );
      }

      console.log(`📊 Total turnover required: ${totalTurnoverRequired}`);

      return {
        qualified: true,
        hasBonusTurnoverRequirement: true,
        turnoverRequired: totalTurnoverRequired,
        bonusDetails,
        reason: "Free bonus - need to meet turnover requirement",
      };
    }

    // SCENARIO 3: Has deposits, no bonuses = qualified from latest deposit
    if (hasDeposits && !hasBonuses) {
      console.log(
        `✅ User ${userId}: Has deposits, no bonuses, qualified from ${deposits[0].createdAt}`
      );
      return {
        qualified: true,
        qualifyFromDate: deposits[0].createdAt,
        reason: "No bonuses claimed",
        turnoverRequired: 0,
        hasBonusTurnoverRequirement: false,
      };
    }

    // SCENARIO 4 & 5: Has both deposits and bonuses
    // Check for pure deposit (not linked to any bonus)
    const linkedDepositIds = new Set(
      bonuses.filter((b) => b.depositId).map((b) => String(b.depositId))
    );

    const latestPureDeposit = deposits.find(
      (d) => !linkedDepositIds.has(String(d.transactionId))
    );

    // SCENARIO 4: Pure deposit exists and is more recent than latest bonus
    if (latestPureDeposit) {
      const latestBonus = bonuses[bonuses.length - 1]; // Most recent (sorted asc)
      if (!latestBonus || latestPureDeposit.createdAt > latestBonus.createdAt) {
        console.log(
          `✅ User ${userId}: Pure deposit after bonus, qualified from ${latestPureDeposit.createdAt}`
        );
        return {
          qualified: true,
          qualifyFromDate: latestPureDeposit.createdAt,
          reason: "Pure deposit without linked bonus",
          turnoverRequired: 0,
          hasBonusTurnoverRequirement: false,
        };
      }
    }

    // SCENARIO 5: All deposits linked to bonuses OR bonus claimed after pure deposit
    // Calculate turnover requirement from ALL bonuses
    console.log(
      `📊 User ${userId}: Calculating turnover requirement from bonuses...`
    );

    const promotionIds = [
      ...new Set(bonuses.map((b) => b.promotionId).filter(Boolean)),
    ];
    const promotions = await Promotion.find({
      _id: { $in: promotionIds },
    }).lean();
    const promotionMap = new Map(promotions.map((p) => [String(p._id), p]));

    let totalTurnoverRequired = 0;
    const bonusDetails = [];

    for (const bonus of bonuses) {
      const promotion = promotionMap.get(String(bonus.promotionId));
      const multiplier =
        promotion?.turnoverrequiremnt || DEFAULT_TURNOVER_MULTIPLIER;
      const bonusAmount = parseFloat(bonus.amount) || 0;
      const requiredForThisBonus = bonusAmount * multiplier;

      totalTurnoverRequired += requiredForThisBonus;

      bonusDetails.push({
        bonusId: bonus._id,
        bonusAmount,
        multiplier,
        required: requiredForThisBonus,
        promotionName: promotion?.name || "Unknown",
        createdAt: bonus.createdAt,
      });

      console.log(
        `   Bonus: ${bonusAmount} × ${multiplier}x = ${requiredForThisBonus} (${
          promotion?.name || "Unknown"
        })`
      );
    }

    console.log(`📊 Total turnover required: ${totalTurnoverRequired}`);

    return {
      qualified: true,
      hasBonusTurnoverRequirement: true,
      turnoverRequired: totalTurnoverRequired,
      bonusDetails,
      reason: "Has bonus - need to meet turnover requirement",
    };
  } catch (error) {
    console.error(`Error checking qualification for ${userId}:`, error);
    return {
      qualified: false,
      reason: "Error checking qualification",
      turnoverRequired: 0,
    };
  }
};

/**
 * Process game records with turnover requirement
 *
 * Logic:
 * - Sort all records by date (oldest first)
 * - Accumulate turnover until requirement is met
 * - Records used to meet requirement → disqualified (no rebate)
 * - Records after requirement met → eligible for rebate
 */
const processRecordsWithTurnoverRequirement = (
  allRecords,
  turnoverRequired
) => {
  const sortedRecords = [...allRecords].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );

  let cumulativeTurnover = 0;
  let requirementMetIndex = -1;
  let requirementMetDate = null;

  for (let i = 0; i < sortedRecords.length; i++) {
    cumulativeTurnover += sortedRecords[i].turnover || 0;

    if (cumulativeTurnover >= turnoverRequired && requirementMetIndex === -1) {
      requirementMetIndex = i;
      requirementMetDate = sortedRecords[i].createdAt;
      console.log(
        `✅ Turnover requirement met at record ${
          i + 1
        }, cumulative: ${cumulativeTurnover.toFixed(
          2
        )}, date: ${requirementMetDate}`
      );
      break;
    }
  }

  if (requirementMetIndex === -1) {
    return {
      met: false,
      currentTurnover: cumulativeTurnover,
      remainingTurnover: turnoverRequired - cumulativeTurnover,
      eligibleRecords: [],
      disqualifiedRecords: sortedRecords,
    };
  }

  const disqualifiedRecords = sortedRecords.slice(0, requirementMetIndex + 1);
  const eligibleRecords = sortedRecords.slice(requirementMetIndex + 1);

  return {
    met: true,
    requirementMetDate,
    turnoverUsedForRequirement: cumulativeTurnover,
    eligibleRecords,
    disqualifiedRecords,
    eligibleTurnover: eligibleRecords.reduce(
      (sum, r) => sum + (r.turnover || 0),
      0
    ),
  };
};

/**
 * Get turnover for a single game with individual records
 * Returns each record separately for turnover requirement processing
 */
const getGameTurnoverWithRecords = async (config, searchArray) => {
  try {
    let turnoverField;

    if (config.isJoker) {
      turnoverField = { $ifNull: ["$fishTurnover", 0] };
    } else if (config.useValidBet) {
      turnoverField = {
        $ifNull: [{ $ifNull: ["$validbetamount", "$betamount"] }, 0],
      };
    } else {
      turnoverField = { $ifNull: ["$betamount", 0] };
    }

    const pipeline = [
      {
        $match: {
          ...config.match,
          username: { $in: searchArray },
          claimed: false,
          disqualified: false,
        },
      },
      {
        $project: {
          _id: 1,
          createdAt: 1,
          turnover: turnoverField,
          username: 1,
        },
      },
      {
        $sort: { createdAt: 1 },
      },
    ];

    const records = await config.model.aggregate(pipeline);
    const totalTurnover = records.reduce(
      (sum, r) => sum + (r.turnover || 0),
      0
    );

    return {
      name: config.name,
      category: config.category,
      model: config.model,
      turnover: totalTurnover,
      records: records.map((r) => ({
        _id: r._id,
        createdAt: r.createdAt,
        turnover: r.turnover,
        category: config.category,
        gameName: config.name,
        model: config.model,
      })),
      count: records.length,
    };
  } catch (error) {
    console.error(`❌ Error fetching ${config.name}:`, error.message);
    return {
      name: config.name,
      category: config.category,
      model: config.model,
      turnover: 0,
      records: [],
      count: 0,
    };
  }
};

// ============================================================
// MAIN ROUTE
// ============================================================

router.post(
  "/api/all/categorizedgamedatavip",
  authenticateToken,
  async (req, res) => {
    const startTime = Date.now();

    try {
      const userId = req.user.userId;

      // Step 1: Fetch user and VIP config in parallel
      const [user, vipData] = await Promise.all([
        User.findById(userId)
          .select("_id gameId username viplevel wallet")
          .lean(),
        vip.findOne({}).lean(),
      ]);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: {
            en: "User not found",
            zh: "用户未找到",
            ms: "Pengguna tidak ditemui",
          },
        });
      }

      if (!vipData?.vipLevels?.length) {
        return res.status(500).json({
          success: false,
          message: {
            en: "VIP configuration not found",
            zh: "VIP配置未找到",
            ms: "Konfigurasi VIP tidak ditemui",
          },
        });
      }

      console.log(
        `\n🚀 Processing rebate for: ${user.gameId} [${user.viplevel}]`
      );

      // Step 2: Get VIP rates
      const rates = getVipRebateRates(vipData.vipLevels, user.viplevel);
      if (!rates) {
        return res.status(400).json({
          success: false,
          message: {
            en: `Invalid VIP level: ${user.viplevel}`,
            zh: `无效VIP等级: ${user.viplevel}`,
            ms: `Tahap VIP tidak sah: ${user.viplevel}`,
          },
        });
      }

      // Step 3: Check user qualification
      const qualification = await checkUserQualification(userId);

      if (!qualification.qualified) {
        return res.status(400).json({
          success: false,
          message: {
            en: qualification.reason,
            zh: qualification.reason,
            ms: qualification.reason,
          },
        });
      }

      const searchArray = buildUsernameSearchArray(user.gameId, user.username);

      // Step 4: Fetch all game turnovers with individual records
      const gameResults = await Promise.all(
        GAME_CONFIG.map((config) =>
          getGameTurnoverWithRecords(config, searchArray)
        )
      );

      // Combine all records from all games
      let allRecords = [];
      gameResults.forEach((result) => {
        if (result?.records?.length) {
          allRecords.push(...result.records);
        }
      });

      console.log(`📊 Total records found: ${allRecords.length}`);

      const totalTurnover = allRecords.reduce(
        (sum, r) => sum + (r.turnover || 0),
        0
      );

      if (totalTurnover <= 0) {
        return res.status(400).json({
          success: false,
          message: {
            en: "No turnover records found",
            zh: "没有找到流水记录",
            ms: "Tiada rekod pusing ganti ditemui",
          },
        });
      }

      // Step 5: Process turnover requirement if user has bonus
      let eligibleRecords = allRecords;
      let disqualifiedRecords = [];
      let turnoverRequirementInfo = null;

      if (
        qualification.hasBonusTurnoverRequirement &&
        qualification.turnoverRequired > 0
      ) {
        console.log(
          `\n📋 Processing turnover requirement: ${qualification.turnoverRequired}`
        );

        const turnoverResult = processRecordsWithTurnoverRequirement(
          allRecords,
          qualification.turnoverRequired
        );

        if (!turnoverResult.met) {
          return res.status(400).json({
            success: false,
            message: {
              en: `Turnover requirement not met. Need ${turnoverResult.remainingTurnover.toFixed(
                2
              )} more turnover.`,
              zh: `流水要求未达到。还需 ${turnoverResult.remainingTurnover.toFixed(
                2
              )} 流水。`,
              ms: `Keperluan pusing ganti tidak dipenuhi. Perlukan ${turnoverResult.remainingTurnover.toFixed(
                2
              )} lagi.`,
            },
            turnoverDetails: {
              required: qualification.turnoverRequired,
              current: turnoverResult.currentTurnover,
              remaining: turnoverResult.remainingTurnover,
              bonusDetails: qualification.bonusDetails,
            },
          });
        }

        eligibleRecords = turnoverResult.eligibleRecords;
        disqualifiedRecords = turnoverResult.disqualifiedRecords;
        turnoverRequirementInfo = {
          required: qualification.turnoverRequired,
          usedForRequirement: turnoverResult.turnoverUsedForRequirement,
          requirementMetDate: turnoverResult.requirementMetDate,
          disqualifiedCount: disqualifiedRecords.length,
          eligibleCount: eligibleRecords.length,
        };

        console.log(`✅ Turnover requirement met!`);
        console.log(
          `   Used for requirement: ${turnoverResult.turnoverUsedForRequirement.toFixed(
            2
          )}`
        );
        console.log(`   Disqualified records: ${disqualifiedRecords.length}`);
        console.log(`   Eligible records: ${eligibleRecords.length}`);
      } else if (qualification.qualifyFromDate) {
        // No bonus requirement - filter by qualifyFromDate
        const qualifyDate = new Date(qualification.qualifyFromDate);
        eligibleRecords = allRecords.filter(
          (r) => new Date(r.createdAt) >= qualifyDate
        );
        disqualifiedRecords = allRecords.filter(
          (r) => new Date(r.createdAt) < qualifyDate
        );

        console.log(`📅 Filtering by qualifyFromDate: ${qualifyDate}`);
        console.log(
          `   Eligible: ${eligibleRecords.length}, Disqualified: ${disqualifiedRecords.length}`
        );
      }

      // Step 6: Group eligible records by category
      const breakdown = {
        [CATEGORIES.LIVE_CASINO]: 0,
        [CATEGORIES.SLOT]: 0,
        [CATEGORIES.SPORTS]: 0,
        [CATEGORIES.ESPORTS]: 0,
        [CATEGORIES.FISHING]: 0,
        [CATEGORIES.LOTTERY]: 0,
      };

      const gamesByCategory = {
        [CATEGORIES.LIVE_CASINO]: [],
        [CATEGORIES.SLOT]: [],
        [CATEGORIES.SPORTS]: [],
        [CATEGORIES.ESPORTS]: [],
        [CATEGORIES.FISHING]: [],
        [CATEGORIES.LOTTERY]: [],
      };

      // Process eligible records
      eligibleRecords.forEach((record) => {
        breakdown[record.category] += record.turnover || 0;
      });

      // Aggregate by game name for response
      const gameAggregation = {};
      eligibleRecords.forEach((record) => {
        const key = `${record.category}_${record.gameName}`;
        if (!gameAggregation[key]) {
          gameAggregation[key] = {
            category: record.category,
            gameName: record.gameName,
            turnover: 0,
            count: 0,
          };
        }
        gameAggregation[key].turnover += record.turnover || 0;
        gameAggregation[key].count += 1;
      });

      Object.values(gameAggregation).forEach((game) => {
        if (game.turnover > 0) {
          gamesByCategory[game.category].push({
            gameName: game.gameName,
            turnover: game.turnover,
            count: game.count,
          });
        }
      });

      const eligibleTurnover = Object.values(breakdown).reduce(
        (sum, val) => sum + val,
        0
      );
      const rebatableTurnover =
        breakdown[CATEGORIES.LIVE_CASINO] +
        breakdown[CATEGORIES.SLOT] +
        breakdown[CATEGORIES.SPORTS] +
        breakdown[CATEGORIES.ESPORTS];

      console.log(`\n💰 Eligible Turnover Breakdown:`);
      console.log(
        `   Live Casino: ${breakdown[CATEGORIES.LIVE_CASINO].toFixed(2)}`
      );
      console.log(`   Slot: ${breakdown[CATEGORIES.SLOT].toFixed(2)}`);
      console.log(`   Sports: ${breakdown[CATEGORIES.SPORTS].toFixed(2)}`);
      console.log(`   Esports: ${breakdown[CATEGORIES.ESPORTS].toFixed(2)}`);
      console.log(
        `   Fishing: ${breakdown[CATEGORIES.FISHING].toFixed(2)} (0% rebate)`
      );
      console.log(
        `   Lottery: ${breakdown[CATEGORIES.LOTTERY].toFixed(2)} (0% rebate)`
      );
      console.log(`   Rebatable: ${rebatableTurnover.toFixed(2)}`);

      if (rebatableTurnover <= 0) {
        return res.status(400).json({
          success: false,
          message: {
            en: "No rebatable turnover available (Fishing and Lottery have 0% rebate)",
            zh: "没有可返水的流水（捕鱼和彩票返水为0%）",
            ms: "Tiada pusing ganti rebat tersedia (Memancing dan Loteri 0% rebat)",
          },
          turnoverDetails: turnoverRequirementInfo,
        });
      }

      // Step 7: Calculate commission
      const commission = {
        [CATEGORIES.LIVE_CASINO]:
          breakdown[CATEGORIES.LIVE_CASINO] * rates[CATEGORIES.LIVE_CASINO],
        [CATEGORIES.SLOT]: breakdown[CATEGORIES.SLOT] * rates[CATEGORIES.SLOT],
        [CATEGORIES.SPORTS]:
          breakdown[CATEGORIES.SPORTS] * rates[CATEGORIES.SPORTS],
        [CATEGORIES.ESPORTS]:
          breakdown[CATEGORIES.ESPORTS] * rates[CATEGORIES.ESPORTS],
        [CATEGORIES.FISHING]: 0,
        [CATEGORIES.LOTTERY]: 0,
      };

      const totalCommission = Number(
        Object.values(commission)
          .reduce((sum, val) => sum + val, 0)
          .toFixed(2)
      );

      console.log(`\n🧮 Commission Calculation:`);
      console.log(
        `   Live Casino: ${breakdown[CATEGORIES.LIVE_CASINO].toFixed(2)} × ${(
          rates[CATEGORIES.LIVE_CASINO] * 100
        ).toFixed(2)}% = ${commission[CATEGORIES.LIVE_CASINO].toFixed(2)}`
      );
      console.log(
        `   Slot: ${breakdown[CATEGORIES.SLOT].toFixed(2)} × ${(
          rates[CATEGORIES.SLOT] * 100
        ).toFixed(2)}% = ${commission[CATEGORIES.SLOT].toFixed(2)}`
      );
      console.log(
        `   Sports: ${breakdown[CATEGORIES.SPORTS].toFixed(2)} × ${(
          rates[CATEGORIES.SPORTS] * 100
        ).toFixed(2)}% = ${commission[CATEGORIES.SPORTS].toFixed(2)}`
      );
      console.log(
        `   Esports: ${breakdown[CATEGORIES.ESPORTS].toFixed(2)} × ${(
          rates[CATEGORIES.ESPORTS] * 100
        ).toFixed(2)}% = ${commission[CATEGORIES.ESPORTS].toFixed(2)}`
      );
      console.log(`   Total: ${totalCommission}`);

      if (totalCommission <= 0) {
        return res.status(400).json({
          success: false,
          message: {
            en: "Commission amount is too low to claim",
            zh: "佣金金额太低无法领取",
            ms: "Jumlah komisen terlalu rendah untuk dituntut",
          },
        });
      }

      // Step 8: Build formula string
      const formulaParts = [];
      if (breakdown[CATEGORIES.LIVE_CASINO] > 0) {
        formulaParts.push(
          `LC:${breakdown[CATEGORIES.LIVE_CASINO].toFixed(2)}×${(
            rates[CATEGORIES.LIVE_CASINO] * 100
          ).toFixed(2)}%`
        );
      }
      if (breakdown[CATEGORIES.SLOT] > 0) {
        formulaParts.push(
          `SL:${breakdown[CATEGORIES.SLOT].toFixed(2)}×${(
            rates[CATEGORIES.SLOT] * 100
          ).toFixed(2)}%`
        );
      }
      if (breakdown[CATEGORIES.SPORTS] > 0) {
        formulaParts.push(
          `SP:${breakdown[CATEGORIES.SPORTS].toFixed(2)}×${(
            rates[CATEGORIES.SPORTS] * 100
          ).toFixed(2)}%`
        );
      }
      if (breakdown[CATEGORIES.ESPORTS] > 0) {
        formulaParts.push(
          `ES:${breakdown[CATEGORIES.ESPORTS].toFixed(2)}×${(
            rates[CATEGORIES.ESPORTS] * 100
          ).toFixed(2)}%`
        );
      }
      const formula = `[${user.viplevel}] ${formulaParts.join(
        " + "
      )} = ${totalCommission}`;

      // Step 9: Update wallet and create rebate record
      const [updatedUser, rebateRecord] = await Promise.all([
        User.findByIdAndUpdate(
          userId,
          { $inc: { wallet: totalCommission } },
          { new: true, projection: { wallet: 1 } }
        ).lean(),

        InstantRebate.create({
          timeCalled: new Date(),
          username: user.gameId,
          vipLevel: user.viplevel,
          rebateRates: {
            liveCasino: rates[CATEGORIES.LIVE_CASINO] * 100,
            slot: rates[CATEGORIES.SLOT] * 100,
            sports: rates[CATEGORIES.SPORTS] * 100,
            esports: rates[CATEGORIES.ESPORTS] * 100,
            fishing: 0,
            lottery: 0,
          },
          liveCasino: { games: gamesByCategory[CATEGORIES.LIVE_CASINO] },
          slot: { games: gamesByCategory[CATEGORIES.SLOT] },
          sports: { games: gamesByCategory[CATEGORIES.SPORTS] },
          esports: { games: gamesByCategory[CATEGORIES.ESPORTS] },
          fishing: { games: gamesByCategory[CATEGORIES.FISHING] },
          lottery: { games: gamesByCategory[CATEGORIES.LOTTERY] },
          totalCommission,
          formula,
          grandTotalTurnover: totalTurnover,
          eligibleTurnover,
          rebatableTurnover,
          turnoverRequirement: turnoverRequirementInfo,
          processed: true,
        }),
      ]);

      if (!updatedUser) {
        await InstantRebate.findByIdAndDelete(rebateRecord._id);
        return res.status(500).json({
          success: false,
          message: {
            en: "Failed to update wallet",
            zh: "更新钱包失败",
            ms: "Gagal mengemas kini dompet",
          },
        });
      }

      // Step 10: Batch update records - mark as claimed/disqualified
      const updatePromises = [];

      // Group by model for efficient updates
      const eligibleByModel = new Map();
      const disqualifiedByModel = new Map();

      eligibleRecords.forEach((r) => {
        const modelName = r.model.modelName;
        if (!eligibleByModel.has(modelName)) {
          eligibleByModel.set(modelName, { model: r.model, ids: [] });
        }
        eligibleByModel.get(modelName).ids.push(r._id);
      });

      disqualifiedRecords.forEach((r) => {
        const modelName = r.model.modelName;
        if (!disqualifiedByModel.has(modelName)) {
          disqualifiedByModel.set(modelName, { model: r.model, ids: [] });
        }
        disqualifiedByModel.get(modelName).ids.push(r._id);
      });

      // Update eligible records as claimed
      eligibleByModel.forEach(({ model, ids }) => {
        if (ids.length > 0) {
          updatePromises.push(
            model.updateMany({ _id: { $in: ids } }, { $set: { claimed: true } })
          );
        }
      });

      // Update disqualified records
      disqualifiedByModel.forEach(({ model, ids }) => {
        if (ids.length > 0) {
          updatePromises.push(
            model.updateMany(
              { _id: { $in: ids } },
              { $set: { disqualified: true, claimed: true } }
            )
          );
        }
      });

      const updateResults = await Promise.all(updatePromises);
      const totalUpdated = updateResults.reduce(
        (sum, r) => sum + (r.modifiedCount || 0),
        0
      );

      const executionTime = Date.now() - startTime;
      console.log(
        `\n✅ Completed in ${executionTime}ms | Records updated: ${totalUpdated}`
      );

      // Step 11: Return success response
      return res.status(200).json({
        success: true,
        message: {
          en: `Rebate claimed successfully! +${totalCommission.toFixed(2)}`,
          zh: `返水领取成功! +${totalCommission.toFixed(2)}`,
          ms: `Rebat berjaya dituntut! +${totalCommission.toFixed(2)}`,
        },
        data: {
          username: user.gameId,
          vipLevel: user.viplevel,
          rates: {
            liveCasino: `${(rates[CATEGORIES.LIVE_CASINO] * 100).toFixed(2)}%`,
            slot: `${(rates[CATEGORIES.SLOT] * 100).toFixed(2)}%`,
            sports: `${(rates[CATEGORIES.SPORTS] * 100).toFixed(2)}%`,
            esports: `${(rates[CATEGORIES.ESPORTS] * 100).toFixed(2)}%`,
            fishing: "0.00%",
            lottery: "0.00%",
          },
          turnover: {
            total: Number(totalTurnover.toFixed(2)),
            eligible: Number(eligibleTurnover.toFixed(2)),
            rebatable: Number(rebatableTurnover.toFixed(2)),
            liveCasino: Number(breakdown[CATEGORIES.LIVE_CASINO].toFixed(2)),
            slot: Number(breakdown[CATEGORIES.SLOT].toFixed(2)),
            sports: Number(breakdown[CATEGORIES.SPORTS].toFixed(2)),
            esports: Number(breakdown[CATEGORIES.ESPORTS].toFixed(2)),
            fishing: Number(breakdown[CATEGORIES.FISHING].toFixed(2)),
            lottery: Number(breakdown[CATEGORIES.LOTTERY].toFixed(2)),
          },
          commission: {
            liveCasino: Number(commission[CATEGORIES.LIVE_CASINO].toFixed(2)),
            slot: Number(commission[CATEGORIES.SLOT].toFixed(2)),
            sports: Number(commission[CATEGORIES.SPORTS].toFixed(2)),
            esports: Number(commission[CATEGORIES.ESPORTS].toFixed(2)),
            total: totalCommission,
          },
          games: {
            liveCasino: gamesByCategory[CATEGORIES.LIVE_CASINO],
            slot: gamesByCategory[CATEGORIES.SLOT],
            sports: gamesByCategory[CATEGORIES.SPORTS],
            esports: gamesByCategory[CATEGORIES.ESPORTS],
            fishing: gamesByCategory[CATEGORIES.FISHING],
            lottery: gamesByCategory[CATEGORIES.LOTTERY],
          },
          turnoverRequirement: turnoverRequirementInfo,
          newWalletTwo: parseFloat(updatedUser.wallet.toString()),
          rebateId: rebateRecord._id,
          recordsUpdated: totalUpdated,
          qualificationReason: qualification.reason,
          executionTime: `${executionTime}ms`,
        },
      });
    } catch (error) {
      console.error("❌ VIP Rebate Error:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "Internal Server Error. Please contact customer support.",
          zh: "内部服务器错误，请联系客服。",
          ms: "Ralat dalaman pelayan. Sila hubungi sokongan pelanggan.",
        },
      });
    }
  }
);

module.exports = router;
