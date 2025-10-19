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
const jwt = require("jsonwebtoken");

const vip = require("../../models/vip.model");
const GameMicroGamingGameModal = require("../../models/slot_microgamingDatabase.model");
const GameWalletLog = require("../../models/gamewalletlog.model");
const SlotLiveMicroGamingModal = require("../../models/slot_microgaming.model");

require("dotenv").config();

const microGamingAgentCode = "ZBH0006_MYR_SW";
const microGamingSecret = process.env.MICROGAMING_SECRET;
const webURL = "https://www.oc7.me/";
const microGamingAPIURL = "https://api-superswansw.k2net.io";
const microGamingTokenURL = "https://sts-superswansw.k2net.io";
const cashierURL = "https://www.oc7.me/myaccount/deposit";

function roundToTwoDecimals(num) {
  return Math.round(num * 100) / 100;
}

function generateSignature(fields, secretKey) {
  const data = [];
  for (const key in fields) {
    data.push(`${key}=${fields[key]}`);
  }
  data.sort();

  const rawData = data.join("&") + secretKey;

  const md5sum = crypto.createHash("md5");
  md5sum.update(rawData, "utf8");

  return md5sum.digest("hex").toUpperCase();
}

const generateRandomCode = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }

  return result;
};

async function GameWalletLogAttempt(
  username,
  transactiontype,
  remark,
  amount,
  gamename
) {
  await GameWalletLog.create({
    username,
    transactiontype,
    remark: remark || "",
    amount,
    gamename: gamename,
  });
}

async function getAccessToken() {
  try {
    const response = await axios.post(
      `${microGamingTokenURL}/connect/token`,
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: microGamingAgentCode,
        client_secret: microGamingSecret, // Replace with your actual agent secret
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    // console.log(response.data);
    return response.data.access_token;
  } catch (error) {
    // console.error("Error getting access token:", error);
    throw new Error("Failed to get access token");
  }
}
// router.post("/api/microgaming/update-games", async (req, res) => {
//   try {
//     // Your game codes list in order
//     const gameCodesList = `SMG_bassCatchSuperUp,SMG_luckyTwinsWildsJackpots,SMG_africanWilds,SMG_minePop,SMG_dicePop,SMG_plinkoPop,SMG_chickenNightFever,SMG_jokerIceFrenzyEpicStrike,SMG_bearsMakeBankPowerCombo,P2_devilsfinger,SMG_diamondInferno,SMG_sugarMania8000,SMG_moonlightRomanceTheAwakening,SMG_andvariTheGoldenFish,SMG_mrPiggEBank,SMG_diamondDivaOinkBonanza,SMG_moneyOnReels,SMG_dragonsRhythmLinkAndWin,SMG_breakAwayGold,SMG_breakAwayShootout,SMG_starStashWild7S,SMG_bountifulBirds,SMG_jokerBurstFrenzy,SMG_bigButtonBash,SMG_mummyLockRiches,SMG_bonnysTreasures,SMG_broncoBigBounty,SMG_yamiWarriors,SMG_goFishingReelinFortunes,SMG_arcticWolfTripleRiches,SMG_pizzaFiesta,SMG_almightyPoseidonEmpire,SMG_monkeysTreasureQuest,SMG_3BlazingVolcanoesPowerCombo,SMG_3rdBase,SMG_luckyRumblePowerSurge,SMG_geniesMagicWishes,SMG_treasureStacksWilds,SMG_heavenlyElephantFortune,SMG_sweetJarCombo,SMG_splashOfRiches,SMG_kungPaoPanda,SMG_icePopParty,SMG_reignOfFire,SMG_hatchingGoldRoostersRiches,SMG_moneyDragon,SMG_royalThunderRiders,SMG_3AngelsPowerCombo,SMG_luckyTwinsAnd9Lions,SMG_almightyDionysusEmpire,SMG_frankenstein,SMG_carnavalFiesta,SMG_gatesOfAsgardPowerCombo,SMG_pongPongMahjongJackpots,SMG_cashBlitz,SMG_aztecTripleRichesPowerCombo,SMG_goldInfinity,SMG_mammothTripleRiches,SMG_bookOfWolves,SMG_hadesLostTreasures,SMG_candyRushWilds2,SMG_siennaSteele,SMG_treasureStacks,SMG_crazyBobBonanza,SMG_3LaughingLionsPowerCombo,SMG_almightyAthenaEmpire,SMG_mightyPanda,SMG_luckyTwinsPowerClusters,SMG_massiveGold,SMG_sharkPlatinum,SMG_drWattsUp,SMG_luckyLittleDragons,SMG_queenOfCairo,SMG_108HeroesWaterMargin,SMG_almightyZeusWilds,SMG_crazyRichTigers,SMG_miningPotsOfGold,SMG_chroniclesOfOlympusIIZeus,SMG_goldBlitzExtreme,SMG_godsPyramidsPowerCombo,SMG_dragonsLoot,SMG_fireAndRosesJollyJoker,SMG_9EnchantedBeans,SMG_fishinPotsOfGoldGoldBlitz,SMG_breakAwayMax,SMG_pongPongMahjong,SMG_legendaryTreasures,SMG_queensOfRa,SMG_gemFireFrenzy,SMG_theEternalWidow,SMG_anvilAndOre,SMG_unusualSuspects,SMG_asgardianFire,SMG_tikiTikiBoom,SMG_9PotsOfGoldMegaways,SMG_championsOfOlympus,SMG_amazonLostGold,SMG_dogDays,SMG_andvariTheMagicRing,SMG_fishEmUp,SMG_magicJokers,SMG_stormToRiches,SMG_tippyTavern,SMG_flyX,SMG_almightyZeusEmpire,SMG_grannyVsZombies,SMG_spinSpinSugar,SMG_amazingPharaoh,SMG_sugarCrazeBonanza,SMG_romeFightForGold,SMG_fortunePikeGold,SMG_bubbleBeez,SMG_chilliPepeHotStacks,SMG_monkeyBonanza,SMG_galloGoldMegaways,SMG_leprechaunStrike,SMG_fireAndRosesJoker,SMG_happyLuckyCats,SMG_chestsOfGold,SMG_wildfireWinsExtreme,SMG_candyRushWilds,SMG_wolfBlazeMegaways,SMG_goldBlitz,SMG_dragonsKeep,SMG_dokiDokiFireworks,SMG_bisonMoon,SMG_trojanKingdom,SMG_mastersOfOlympus,SMG_playboyWilds,SMG_tigersIce,SMG_thunderstruckStormchaser,SMG_fishinChristmasPotsOfGold,SMG_fionasChristmasFortune,SMG_luckyTwinsLinkAndWin,SMG_fishinBiggerPots,SMG_sonicLinks,SMG_777superBigBuildUpDeluxe,SMG_robinHoodsHeroes,SMG_aquanauts,SMG_starliteFruits,SMG_jadeShuriken,SMG_amazonKingdom,SMG_kitsuneAdventure,SMG_arkOfRa,SMG_777Surge,SMG_boltXUP,SMG_luckyLeprechaunClusters,SMG_maskOfAmun,SMG_divineRichesHelios,SMG_wildfireWins,SMG_circusJugglersJackpots,SMG_abraCatDabra,SMG_wildWildRomance,SMG_immortalRomanceVideoBingo,SMG_immortalRomance,SMG_lightningFortunes,SMG_25000Talons,SMG_cashNRichesMegaways,SMG_15Tridents,SMG_dungeonsAndDiamonds,SMG_aztecFalls,SMG_mastersOfValhalla,SMG_dokiDokiParfait,SMG_oniHunterNightSakura,SMG_fishinPotsOfGold,SMG_kingsOfCrystals,SMG_5StarKnockout,SMG_agentJaneBlondeMaxVolume,SMG_basketballStarWilds,SMG_kodiakKingdom,SMG_bigBoomRiches,SMG_squealinRiches,SMG_4DiamondBlues,SMG_9masksOfFireHyperSpins,SMG_catClans,SMG_bookOfMrsClaus,SMG_luckyClucks,SMG_chroniclesOfOlympusXUP,SMG_wweLegendsLinkWin,SMG_fortuneRush,SMG_10000Wishes,SMG_108Heroes,SMG_5ReelDrive,SMG_777MegaDeluxe,SMG_777RoyalWheel,SMG_9masksOfFire,SMG_9potsOfGold,SMG_aDarkMatter,SMG_aTaleOfElves,SMG_actionOpsSnowAndSable,SMG_adventurePalace,SMG_adventuresOfDoubloonIsland,SMG_africaXUP,SMG_ageOfDiscovery,SMG_agentJaneBlonde,SMG_alaskanFishing,SMG_alchemyFortunes,SMG_ancientFortunesPoseidonMegaways,SMG_ancientFortunesZeus,SMG_ariana,SMG_asianBeauty,SMG_assassinMoon,SMG_astroLegendsLyraandErion,SMG_auroraWilds,SMG_avalon,SMG_badmintonHero,SMG_bananaOdyssey,SMG_barBarBlackSheep5Reel,SMG_BarsAndStripes,SMG_basketballStar,SMG_basketballStarDeluxe,SMG_basketballStaronFire,SMG_beautifulBones,SMG_bigKahuna,SMG_bigTop,SMG_bikiniParty,SMG_blazingMammoth,SMG_boatofFortune,SMG_bookOfKingArthur,SMG_bookOfOz,SMG_bookOfOzLockNSpin,SMG_bookieOfOdds,SMG_boomPirates,SMG_breakAway,SMG_breakAwayDeluxe,SMG_breakAwayLuckyWilds,SMG_breakAwayUltra,SMG_breakDaBank,SMG_breakDaBankAgain,SMG_breakDaBankAgainRespin,SMG_breakDaBankAgainMegaways,SMG_burningDesire,SMG_bushTelegraph,SMG_bustTheBank,SMG_carnaval,SMG_carnavalJackpot,SMG_cashOfKingdoms,SMG_cashapillar,SMG_centreCourt,SMG_coolBuck5Reel,SMG_coolWolf,SMG_cricketStar,SMG_cricketStarScratch,SMG_deckTheHalls,SMG_diamondEmpire,SMG_dragonDance,SMG_dragonShard,SMG_dragonz,SMG_dreamDate,SMG_eaglesWings,SMG_emeraldGold,SMG_emperorOfTheSea,SMG_emperorOfTheSeaDeluxe,SMG_exoticCats,SMG_fireForge,SMG_fishParty,SMG_footballStar,SMG_footballStarDeluxe,SMG_forgottenIsland,SMG_fortuneGirl,SMG_fortunium,SMG_fruitBlast,SMG_fruitVSCandy,SMG_gemsAndDragons,SMG_goldCollector,SMG_goldenEra,SMG_goldenPrincess,SMG_goldenStallion,SMG_gopherGold,SMG_halloweenies,SMG_HappyHolidays,SMG_happyMonsterClaw,SMG_highSociety,SMG_hollyJollyPenguins,SMG_hyperGold,SMG_incanAdventure,SMG_theIncredibleBalloonMachine,SMG_jungleJimElDorado,SMG_jungleJimAndTheLostSphinx,SMG_kathmandu,SMG_kingTusk,SMG_kingsOfCash,SMG_ladiesNite,SMG_laraCroftTemplesAndTombs,SMG_legacyOfOz,SMG_LegendOftheMoonLovers,SMG_lifeOfRiches,SMG_loaded,SMG_longMuFortunes,SMG_lostVegas,SMG_luchaLegends,SMG_luckyBachelors,SMG_luckyfirecracker,SMG_luckyKoi,SMG_luckyLeprechaun,SMG_luckyLittleGods,SMG_luckyRichesHyperspins,SMG_luckyTwins,SMG_luckyTwinsCatcher,SMG_luckyTwinsJackpot,SMG_luckyTwinsWilds,SMG_magicOfSahara,SMG_maxDamageArcade,SMG_megaMoneyMultiplier,SMG_mermaidsMillions,SMG_monsterBlast,SMG_neptunesRichesOceanOfWilds,SMG_odinsRiches,SMG_oniHunter,SMG_oniHunterPlus,SMG_ourDaysA,SMG_pingPongStar,SMG_playboy,SMG_playboyFortunes,SMG_playboyGold,SMG_playboyGoldJackpots,SMG_purePlatinum,SMG_queenofAlexandria,SMG_queenOfTheCrystalRays,SMG_reelGems,SMG_reelGemsDeluxe,SMG_reelSpinner,SMG_ReelTalent,SMG_reelThunder,SMG_relicSeekers,SMG_retroReels,SMG_retroReelsDiamondGlitz,SMG_retroReelsExtremeHeat,SMG_rhymingReelsHeartsAndTarts,SMG_rugbyStar,SMG_rugbyStarDeluxe,SMG_santasWildRide,SMG_scrooge,SMG_secretAdmirer,SMG_secretRomance,SMG_serengetiGold,SMG_shamrockHolmes,SMG_shogunofTime,SMG_showdownSaloon,SMG_silverFang,SMG_silverSeas,SMG_silverbackMultiplierMountain,SMG_soccerStriker,SMG_springBreak,SMG_starlightKiss,SMG_sterlingSilver,SMG_summertime,SMG_sunTide,SMG_sureWin,SMG_tallyHo,SMG_theTwistedCircus,SMG_thunderstruck,SMG_thunderstruck2,SMG_thunderstruckWildLightning,SMG_tigersEye,SMG_treasureDash,SMG_treasurePalace,SMG_treasuresOfLionCity,SMG_untamedGiantPanda,SMG_wackyPanda,SMG_wantedOutlaws,SMG_westernGold,SMG_whatAHoot,SMG_wickedTalesDarkRed,SMG_wildCatchNew,SMG_wildOrient,SMG_wildScarabs,SMG_winSumDimSum`;

//     // Split the string into array
//     const gameCodesArray = gameCodesList.split(",").map((code) => code.trim());

//     console.log(`Processing ${gameCodesArray.length} Microgaming games...`);

//     // First, set all games hot = false
//     await GameMicroGamingGameModal.updateMany({}, { $set: { hot: false } });

//     // Update ALL games with createdAt based on their position in the list
//     const updateResults = [];
//     const baseTime = new Date(); // Current time for the #1 game

//     // Process all games
//     for (let i = 0; i < gameCodesArray.length; i++) {
//       const gameCode = gameCodesArray[i];
//       const isTop10 = i < 10; // First 10 games are top 10

//       // Calculate createdAt: #1 game = latest time, each subsequent game is 30 minutes earlier
//       const createdAtTime = new Date(baseTime.getTime() - i * 30 * 60 * 1000);

//       try {
//         // Use MongoDB collection directly to bypass Mongoose timestamps
//         const updateResult =
//           await GameMicroGamingGameModal.collection.updateOne(
//             { gameID: gameCode },
//             {
//               $set: {
//                 hot: isTop10, // Only top 10 are hot
//                 createdAt: createdAtTime,
//                 updatedAt: new Date(),
//               },
//             }
//           );

//         updateResults.push({
//           position: i + 1,
//           gameCode: gameCode,
//           createdAt: createdAtTime.toISOString(),
//           isTop10: isTop10,
//           hot: isTop10,
//           matched: updateResult.matchedCount > 0,
//           updated: updateResult.modifiedCount > 0,
//         });

//         if (i < 20 || updateResult.matchedCount === 0) {
//           // Log first 20 and any not found
//           console.log(
//             `#${i + 1} - ${gameCode} - ${createdAtTime.toISOString()} - ${
//               updateResult.matchedCount > 0 ? "FOUND" : "NOT FOUND"
//             } - Hot: ${isTop10}`
//           );
//         }
//       } catch (error) {
//         console.error(`Error updating game ${gameCode}:`, error);
//         updateResults.push({
//           position: i + 1,
//           gameCode: gameCode,
//           createdAt: createdAtTime.toISOString(),
//           isTop10: isTop10,
//           hot: isTop10,
//           matched: false,
//           updated: false,
//           error: error.message,
//         });
//       }
//     }

//     // Count results
//     const totalMatched = updateResults.filter((r) => r.matched).length;
//     const totalUpdated = updateResults.filter((r) => r.updated).length;
//     const top10Matched = updateResults.filter(
//       (r) => r.isTop10 && r.matched
//     ).length;
//     const notFound = updateResults.filter((r) => !r.matched);

//     console.log(
//       `Update complete: ${totalUpdated}/${gameCodesArray.length} games updated, ${top10Matched}/10 top games found`
//     );

//     return res.status(200).json({
//       success: true,
//       message: `Updated ${totalUpdated} Microgaming games with new createdAt times and ${top10Matched} hot games`,
//       summary: {
//         totalGames: gameCodesArray.length,
//         totalFoundInDB: totalMatched,
//         totalUpdated: totalUpdated,
//         top10HotGames: top10Matched,
//         notFoundInDB: gameCodesArray.length - totalMatched,
//         allGamesSetToNotHot: true,
//       },
//       top10Results: updateResults.slice(0, 10), // Show top 10 results
//       totalNotFound: notFound.length,
//       sampleNotFound: notFound.slice(0, 10).map((g) => ({
//         position: g.position,
//         gameCode: g.gameCode,
//       })),
//     });
//   } catch (error) {
//     console.error("Update Microgaming games error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error updating Microgaming games",
//       error: error.message,
//     });
//   }
// });

// router.post("/api/microgaming/import-games", async (req, res) => {
//   try {
//     const fs = require("fs");
//     const path = require("path");

//     // Path to your exported JSON file
//     const filePath = path.join(__dirname, "../../public/microgaming.json");

//     // Check if file exists
//     if (!fs.existsSync(filePath)) {
//       return res.status(404).json({
//         success: false,
//         message:
//           "joker.json file not found. Please ensure the file exists in public folder.",
//       });
//     }

//     // Read the JSON file
//     const fileContent = fs.readFileSync(filePath, "utf8");
//     const gameData = JSON.parse(fileContent);

//     // Validate that it's an array
//     if (!Array.isArray(gameData)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid JSON format. Expected an array of games.",
//       });
//     }

//     // Clean the games data - remove MongoDB specific fields
//     const cleanGames = gameData.map((game) => {
//       const cleanGame = { ...game };

//       // Remove MongoDB specific fields
//       delete cleanGame._id;
//       delete cleanGame.__v;
//       delete cleanGame.createdAt;
//       delete cleanGame.updatedAt;

//       return cleanGame;
//     });

//     console.log(`Preparing to import ${cleanGames.length} games...`);

//     // Delete all existing games and insert new ones
//     const deleteResult = await GameMicroGamingGameModal.deleteMany({});
//     console.log(`Deleted ${deleteResult.deletedCount} existing games`);

//     const insertResult = await GameMicroGamingGameModal.insertMany(cleanGames);
//     console.log(`Successfully imported ${insertResult.length} games`);

//     return res.status(200).json({
//       success: true,
//       message: {
//         en: `Successfully imported ${insertResult.length} games.`,
//         zh: `成功导入 ${insertResult.length} 个游戏。`,
//         ms: `Berjaya mengimport ${insertResult.length} permainan.`,
//       },
//       details: {
//         totalImported: insertResult.length,
//         deletedExisting: deleteResult.deletedCount,
//         filePath: filePath,
//       },
//     });
//   } catch (error) {
//     console.error("Error importing joker games:", error.message);

//     // Handle specific error types
//     if (error instanceof SyntaxError) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid JSON format in joker.json file.",
//         error: error.message,
//       });
//     }

//     if (error.code === 11000) {
//       return res.status(400).json({
//         success: false,
//         message: "Duplicate key error during import.",
//         error: "Some games have duplicate gameID values.",
//       });
//     }

//     return res.status(500).json({
//       success: false,
//       message: "Failed to import joker games.",
//       error: error.message,
//     });
//   }
// });
// router.post("/api/microgaming/comparegames", async (req, res) => {
//   try {
//     const token = await getAccessToken();

//     const [apiResponse, dbGames] = await Promise.all([
//       axios.get(
//         `${microGamingAPIURL}/api/v1/agents/${microGamingAgentCode}/games`,

//         {
//           headers: {
//             Authorization: `Bearer ${token}`,
//             "Content-Type": "application/x-www-form-urlencoded",
//           },
//         }
//       ),
//       GameMicroGamingGameModal.find(
//         {},
//         { gameID: 1, gameNameEN: 1, _id: 0 }
//       ).lean(),
//     ]);

//     // Extract game codes/IDs - Fixed to use correct response structure
//     const apiGameCodes = new Set(
//       apiResponse.data.map((game) => String(game.gameCode)) // Convert to string for consistency
//     );
//     const dbGameIDs = new Set(
//       dbGames.map((game) => String(game.gameID)) // Convert to string for consistency
//     );

//     // Find differences
//     const missingInDB = [...apiGameCodes].filter(
//       (code) => !dbGameIDs.has(code)
//     );
//     const extraInDB = [...dbGameIDs].filter((id) => !apiGameCodes.has(id));

//     // Update maintenance status - Fixed to use correct model
//     const [setMaintenanceTrue, setMaintenanceFalse] = await Promise.all([
//       // Set maintenance = true for games NOT in API (extra in DB)
//       GameMicroGamingGameModal.updateMany(
//         { gameID: { $in: extraInDB } },
//         { $set: { maintenance: true } }
//       ),
//       // Set maintenance = false for games that exist in API
//       GameMicroGamingGameModal.updateMany(
//         { gameID: { $in: [...apiGameCodes] } },
//         { $set: { maintenance: false } }
//       ),
//     ]);

//     // Get details for missing games - Fixed to use correct response structure
//     const missingGamesDetails = apiResponse.data
//       .filter((game) => missingInDB.includes(String(game.gameCode)))
//       .map((game) => ({
//         gameId: game.game_id,
//         gameName: game.game_name,
//         gameNameCn: game.game_name_cn,
//         gameType: game.game_type,
//         rtp: game.rtp,
//         releaseDate: game.release_date,
//       }));

//     // Get details for extra games
//     const extraGamesDetails = dbGames
//       .filter((game) => extraInDB.includes(String(game.gameID)))
//       .map((game) => ({
//         gameID: game.gameID,
//         gameNameEN: game.gameNameEN,
//       }));

//     return res.status(200).json({
//       success: true,
//       summary: {
//         totalAPIGames: apiGameCodes.size,
//         totalDBGames: dbGameIDs.size,
//         missingInDB: missingInDB.length,
//         extraInDB: extraInDB.length,
//         matching: apiGameCodes.size - missingInDB.length,
//       },
//       maintenanceUpdates: {
//         setToMaintenance: setMaintenanceTrue.modifiedCount,
//         setToActive: setMaintenanceFalse.modifiedCount,
//       },
//       missingInDatabase: missingGamesDetails,
//       extraInDatabase: extraGamesDetails,
//     });
//   } catch (error) {
//     console.error("Compare hacksaw games error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error comparing games",
//       error: error.message,
//     });
//   }
// });

router.post(
  "/api/microgaming/getprovidergamelist",

  async (req, res) => {
    try {
      const token = await getAccessToken();

      const response = await axios.get(
        `${microGamingAPIURL}/api/v1/agents/${microGamingAgentCode}/games`,

        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
      if (response.status !== 200 && response.status !== 201) {
        console.log(
          "Miro Gaming fail to launch game with error",
          response.data
        );
        return res.status(200).json({
          success: false,
          message: {
            en: "MICRO GAMING: Game launch failed. Please try again or contact customer service for assistance.",
            zh: "MICRO GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "MICRO GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }

      return res.status(200).json({
        success: true,
        gameLobby: response.data,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
        },
      });
    } catch (error) {
      console.error("Micro Gaming error launching game:", error);
      return res.status(200).json({
        success: false,
        message: {
          en: "MICRO GAMING: Game launch failed. Please try again or contact customer service for assistance.",
          zh: "MICRO GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "MICRO GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post("/api/microgaming/getgamelist", async (req, res) => {
  try {
    const games = await GameMicroGamingGameModal.find({
      $and: [
        {
          $or: [{ maintenance: false }, { maintenance: { $exists: false } }],
        },
        {
          imageUrlEN: { $exists: true, $ne: null, $ne: "" },
        },
      ],
    }).sort({
      hot: -1,
      createdAt: -1,
    });

    if (!games || games.length === 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "No games found. Please try again later.",
          zh: "未找到游戏。请稍后再试。",
          ms: "Tiada permainan ditemui. Sila cuba lagi kemudian.",
          zh_hk: "未找到遊戲。請稍後再試。",
          id: "Tidak ada permainan ditemukan. Silakan coba lagi nanti.",
        },
      });
    }

    const reformattedGamelist = games.map((game) => ({
      GameCode: game.gameID,
      GameNameEN: game.gameNameEN,
      GameNameZH: game.gameNameCN,
      GameType: game.gameType,
      GameImage: game.imageUrlEN || "",
      GameImageZH: game.imageUrlCN,
      Hot: game.hot,
      RTP: game.rtpRate,
    }));

    return res.status(200).json({
      success: true,
      gamelist: reformattedGamelist,
    });
  } catch (error) {
    console.error("Error fetching game list:", error.message);
    return res.status(200).json({
      success: false,
      message: {
        en: "MICRO GAMING: Unable to retrieve game lists. Please contact customer service for assistance.",
        zh: "MICRO GAMING: 无法获取游戏列表，请联系客服以获取帮助。",
        ms: "MICRO GAMING: Tidak dapat mendapatkan senarai permainan. Sila hubungi khidmat pelanggan untuk bantuan.",
        zh_hk: "MICRO GAMING: 無法獲取遊戲列表，請聯絡客服以獲取幫助。",
        id: "MICRO GAMING: Tidak dapat mengambil daftar permainan. Silakan hubungi layanan pelanggan untuk bantuan.",
      },
    });
  }
});

router.post(
  "/api/microgamingslot/launchGame",
  authenticateToken,
  async (req, res) => {
    try {
      const token = await getAccessToken();

      const userId = req.user.userId;
      const user = await User.findById(userId);

      const { gameLang, gameCode, clientPlatform } = req.body;

      if (user.gameLock.microgaming.lock) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Your game access has been locked. Please contact customer support for further assistance.",
            zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
            ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
          },
        });
      }

      let lang = "en-US";

      if (gameLang === "zh") {
        lang = "zh-CN";
      } else if (gameLang === "ms") {
        lang = "ms-MY";
      } else {
        lang = "en-US";
      }

      let platform = "Desktop";
      if (clientPlatform === "web") {
        platform = "Desktop";
      } else if (clientPlatform === "mobile") {
        platform = "Mobile";
      }

      let logintoken = `${user.username}:${generateRandomCode()}`;

      const payload = new URLSearchParams({
        contentCode: gameCode,
        platform,
        langCode: lang,
        homeUrl: webURL,
        bankUrl: cashierURL,
        operatorLoginToken: logintoken,
      });

      const response = await axios.post(
        `${microGamingAPIURL}/api/v1/agents/${microGamingAgentCode}/players/${user.username}/sessions`,
        payload.toString(),
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
      if (response.status !== 200 && response.status !== 201) {
        console.log(
          "Miro Gaming fail to launch game with error",
          response.data
        );
        return res.status(200).json({
          success: false,
          message: {
            en: "MICRO GAMING: Game launch failed. Please try again or contact customer service for assistance.",
            zh: "MICRO GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "MICRO GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }

      const updatedUser = await User.findOneAndUpdate(
        { _id: user._id },
        {
          microGamingGameToken: logintoken,
        },
        { new: true }
      );

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "MICRO GAMING"
      );

      return res.status(200).json({
        success: true,
        gameLobby: response.data.url,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
        },
      });
    } catch (error) {
      console.error("Micro Gaming error launching game:", error);
      return res.status(200).json({
        success: false,
        message: {
          en: "MICRO GAMING: Game launch failed. Please try again or contact customer service for assistance.",
          zh: "MICRO GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "MICRO GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post(
  "/api/microgaminglive/launchGame",
  authenticateToken,
  async (req, res) => {
    try {
      const token = await getAccessToken();

      const userId = req.user.userId;
      const user = await User.findById(userId);

      const { gameLang, clientPlatform } = req.body;

      if (user.gameLock.microgaming.lock) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Your game access has been locked. Please contact customer support for further assistance.",
            zh: "您的游戏访问已被锁定，请联系客服以获取进一步帮助。",
            ms: "Akses permainan anda telah dikunci. Sila hubungi khidmat pelanggan untuk bantuan lanjut.",
          },
        });
      }

      let lang = "en-US";

      if (gameLang === "zh") {
        lang = "zh-CN";
      } else if (gameLang === "ms") {
        lang = "ms-MY";
      } else {
        lang = "en-US";
      }

      let platform = "Desktop";
      if (clientPlatform === "web") {
        platform = "Desktop";
      } else if (clientPlatform === "mobile") {
        platform = "Mobile";
      }

      let logintoken = `${user.username}:${generateRandomCode()}`;

      const payload = new URLSearchParams({
        contentCode: "MGL_GRAND_LobbyAll",
        contentType: "Lobby",
        platform,
        langCode: lang,
        homeUrl: webURL,
        bankUrl: cashierURL,
        operatorLoginToken: logintoken,
      });

      const response = await axios.post(
        `${microGamingAPIURL}/api/v1/agents/${microGamingAgentCode}/players/${user.username}/sessions`,
        payload.toString(),
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );
      if (response.status !== 200 && response.status !== 201) {
        console.log(
          "Miro Gaming fail to launch game with error",
          response.data
        );
        return res.status(200).json({
          success: false,
          message: {
            en: "MICRO GAMING: Game launch failed. Please try again or contact customer service for assistance.",
            zh: "MICRO GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
            ms: "MICRO GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
          },
        });
      }

      const updatedUser = await User.findOneAndUpdate(
        { _id: user._id },
        {
          microGamingGameToken: logintoken,
        },
        { new: true }
      );

      await GameWalletLogAttempt(
        user.username,
        "Transfer In",
        "Seamless",
        roundToTwoDecimals(user.wallet),
        "MICRO GAMING"
      );

      return res.status(200).json({
        success: true,
        gameLobby: response.data.url,
        message: {
          en: "Game launched successfully.",
          zh: "游戏启动成功。",
          ms: "Permainan berjaya dimulakan.",
        },
      });
    } catch (error) {
      console.error("Micro Gaming error launching game:", error);
      return res.status(200).json({
        success: false,
        message: {
          en: "MICRO GAMING: Game launch failed. Please try again or contact customer service for assistance.",
          zh: "MICRO GAMING: 游戏启动失败，请重试或联系客服以获得帮助。",
          ms: "MICRO GAMING: Pelancaran permainan gagal. Sila cuba lagi atau hubungi khidmat pelanggan untuk bantuan.",
        },
      });
    }
  }
);

router.post("/api/microgaming/login", async (req, res) => {
  const startTime = Date.now();
  try {
    const mgpReqId = req.headers["x-mgp-req-id"];
    const mgpRequestTime = req.headers["x-mgp-request-timems"];

    res.set("X-MGP-REQ-ID", mgpReqId || "no-request-id-provided");

    const { playerId, contentCode, operatorLoginToken } = req.body;
    if (!playerId) {
      res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
      return res.status(432).json({});
    }

    const user = await User.findOne(
      { username: playerId },
      { username: 1, wallet: 1, microGamingGameToken: 1 }
    ).lean();

    if (!user) {
      res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
      return res.status(401).json({});
    }

    if (operatorLoginToken) {
      if (user.microGamingGameToken !== operatorLoginToken) {
        res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
        return res.status(401).json({});
      }
    }

    res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
    return res.status(200).json({
      balance: roundToTwoDecimals(user.wallet),
      currency: "MYR",
    });
  } catch (error) {
    console.log(
      "MICRO GAMING Error in game provider calling ae96 api",
      error.message
    );
    res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
    return res.status(404).json({});
  }
});

router.post("/api/microgaming/getbalance", async (req, res) => {
  const startTime = Date.now();
  try {
    const mgpReqId = req.headers["x-mgp-req-id"];
    const mgpRequestTime = req.headers["x-mgp-request-timems"];

    res.set("X-MGP-REQ-ID", mgpReqId || "no-request-id-provided");

    const { playerId } = req.body;

    if (!playerId) {
      res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
      return res.status(401).json({});
    }

    const currentUser = await User.findOne(
      { username: playerId },
      { username: 1, wallet: 1 }
    ).lean();

    if (!currentUser) {
      res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
      return res.status(404).json({});
    }

    res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
    return res.status(200).json({
      currency: "MYR",
      balance: roundToTwoDecimals(currentUser.wallet),
    });
  } catch (error) {
    console.log(
      "MICRO GAMING Error in game provider calling ae96 balance api",
      error.message
    );
    res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
    return res.status(404).json({});
  }
});

function generateTransactionId(prefix = "") {
  const uuid = uuidv4().replace(/-/g, "").substring(0, 16);
  return prefix ? `${prefix}${uuid}` : uuid;
}

router.post("/api/microgaming/updatebalance", async (req, res) => {
  const startTime = Date.now();
  const extransId = generateTransactionId();

  try {
    const mgpReqId = req.headers["x-mgp-req-id"];
    const mgpRequestTime = req.headers["x-mgp-request-timems"];

    res.set("X-MGP-REQ-ID", mgpReqId || "no-request-id-provided");

    const {
      playerId,
      txnType,
      amount,
      txnId,
      betId,
      roundId,
      contentCode,
      completed,
    } = req.body;
    if (!playerId || !txnType || !txnId) {
      res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
      return res.status(400).json({
        extTxnId: extransId,
        balance: 0,
        currency: "MYR",
      });
    }
    const gameType = await (async () => {
      if (!contentCode) return "SLOT"; // Default if no contentCode

      const gameExists = await GameMicroGamingGameModal.findOne(
        { gameID: contentCode, gameType: "Slot" },
        { _id: 1 }
      ).lean();

      return gameExists ? "SLOT" : "LIVE";
    })();

    switch (txnType) {
      case "DEBIT":
        const [currentUserDebit, existingTransactionDebit] = await Promise.all([
          User.findOne(
            { username: playerId },
            { username: 1, wallet: 1, "gameLock.microgaming.lock": 1, _id: 1 }
          ).lean(),
          SlotLiveMicroGamingModal.findOne(
            { tranId: txnId },
            { _id: 1 }
          ).lean(),
        ]);

        if (!currentUserDebit) {
          res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
          return res.status(404).json({
            extTxnId: extransId,
            balance: 0,
            currency: "MYR",
          });
        }

        if (currentUserDebit.gameLock?.microgaming?.lock) {
          res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
          return res.status(403).json({
            extTxnId: extransId,
            balance: 0,
            currency: "MYR",
          });
        }

        if (existingTransactionDebit) {
          res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
          return res.status(200).json({
            extTxnId: extransId,
            balance: roundToTwoDecimals(currentUserDebit.wallet),
            currency: "MYR",
          });
        }

        const updatedUserBalanceDebit = await User.findOneAndUpdate(
          {
            username: playerId,
            wallet: { $gte: roundToTwoDecimals(amount || 0) },
          },
          { $inc: { wallet: -roundToTwoDecimals(amount || 0) } },
          { new: true, projection: { wallet: 1 } }
        ).lean();

        if (!updatedUserBalanceDebit) {
          res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
          return res.status(402).json({
            extTxnId: extransId,
            balance: roundToTwoDecimals(currentUserDebit.wallet),
            currency: "MYR",
          });
        }

        await SlotLiveMicroGamingModal.create({
          username: playerId,
          betId: betId,
          tranId: txnId,
          bet: true,
          betamount: roundToTwoDecimals(amount),
          gameType: gameType,
          completed: completed !== undefined ? completed : true,
          roundId: roundId || "",
        });

        res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
        return res.status(200).json({
          extTxnId: extransId,
          balance: roundToTwoDecimals(updatedUserBalanceDebit.wallet),
          currency: "MYR",
        });

      case "CREDIT":
        const [
          currentUserCredit,
          existingTransactionCredit,
          existingSettledTransactionCredit,
        ] = await Promise.all([
          User.findOne(
            { username: playerId },
            { username: 1, wallet: 1, _id: 1 }
          ).lean(),
          SlotLiveMicroGamingModal.findOne({ betId: betId }, { _id: 1 }).lean(),
          SlotLiveMicroGamingModal.findOne(
            { settleId: txnId, $or: [{ settle: true }, { cancel: true }] },
            { _id: 1 }
          ).lean(),
        ]);

        if (!currentUserCredit) {
          res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
          return res.status(404).json({
            extTxnId: extransId,
            balance: 0,
            currency: "MYR",
          });
        }

        if (!existingTransactionCredit) {
          res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
          return res.status(400).json({
            extTxnId: extransId,
            balance: roundToTwoDecimals(currentUserCredit.wallet),
            currency: "MYR",
          });
        }

        if (existingSettledTransactionCredit) {
          res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
          return res.status(200).json({
            extTxnId: extransId,
            balance: roundToTwoDecimals(currentUserCredit.wallet),
            currency: "MYR",
          });
        }

        const [updatedUserBalanceCredit, settlementResult] = await Promise.all([
          User.findByIdAndUpdate(
            currentUserCredit._id,
            { $inc: { wallet: roundToTwoDecimals(amount || 0) } },
            { new: true, projection: { wallet: 1 } }
          ).lean(),
          SlotLiveMicroGamingModal.findOneAndUpdate(
            { betId: betId, settle: { $ne: true } },
            {
              $set: {
                settle: true,
                settleamount: roundToTwoDecimals(amount),
                settleId: txnId,
                completed: completed !== undefined ? completed : true,
              },
            },
            { new: true }
          ).lean(),
        ]);

        if (!settlementResult) {
          SlotLiveMicroGamingModal.create({
            username: playerId,
            betId: betId,
            bet: true,
            betamount: 0,
            settle: true,
            settleamount: roundToTwoDecimals(amount),
            settleId: txnId,
            gameType: gameType,
            roundId: roundId || "",
            completed: completed !== undefined ? completed : true,
          }).catch((error) => {
            console.error(
              "MICROGAMING: Error creating additional settlement record:",
              {
                playerId,
                betId,
                txnId,
                error: error.message,
              }
            );
          });
        }

        if (completed === true) {
          SlotLiveMicroGamingModal.updateMany(
            { betId: betId },
            { $set: { completed: true } }
          ).catch((error) => {
            console.error(
              "MICROGAMING: Error updating all records to completed:",
              {
                playerId,
                betId,
                error: error.message,
              }
            );
          });
        }

        res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
        return res.status(200).json({
          extTxnId: extransId,
          balance: roundToTwoDecimals(updatedUserBalanceCredit.wallet),
          currency: "MYR",
        });

      default:
        res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
        return res.status(400).json({
          extTxnId: extransId,
          balance: 0,
          currency: "MYR",
        });
    }
  } catch (error) {
    console.error(
      "MICROGAMING: Error in game provider calling ae96 betninfo api:",
      error.message
    );
    res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
    return res.status(500).json({
      extTxnId: extransId,
      balance: 0,
      currency: "MYR",
    });
  }
});

router.post("/api/microgaming/rollback", async (req, res) => {
  const startTime = Date.now();
  try {
    const mgpReqId = req.headers["x-mgp-req-id"];
    const mgpRequestTime = req.headers["x-mgp-request-timems"];

    res.set("X-MGP-REQ-ID", mgpReqId || "no-request-id-provided");

    const { playerId, amount, txnId } = req.body;

    if (!playerId) {
      res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
      return res.status(500).json({
        balance: 0,
        currency: "MYR",
      });
    }

    const [
      currentUserCredit,
      existingTransactionCredit,
      existingSettledTransactionCredit,
    ] = await Promise.all([
      User.findOne(
        { username: playerId },
        { username: 1, wallet: 1, _id: 1 }
      ).lean(),
      SlotLiveMicroGamingModal.findOne(
        { betId: txnId },
        { _id: 1, settle: 1, bet: 1 }
      ).lean(),
      SlotLiveMicroGamingModal.findOne(
        { betId: txnId, $or: [{ cancel: true }] },
        { _id: 1 }
      ).lean(),
    ]);

    if (!currentUserCredit) {
      res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
      return res.status(404).json({
        balance: 0,
        currency: "MYR",
      });
    }

    if (!existingTransactionCredit) {
      res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
      return res.status(400).json({
        balance: roundToTwoDecimals(currentUserCredit.wallet),
        currency: "MYR",
      });
    }

    if (existingSettledTransactionCredit) {
      res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
      return res.status(200).json({
        balance: roundToTwoDecimals(currentUserCredit.wallet),
        currency: "MYR",
      });
    }

    let walletAdjustment;
    if (existingTransactionCredit.settle === true) {
      walletAdjustment = -roundToTwoDecimals(amount || 0);
    } else {
      walletAdjustment = roundToTwoDecimals(amount || 0);
    }

    const [updatedUserBalanceCredit] = await Promise.all([
      User.findByIdAndUpdate(
        currentUserCredit._id,
        { $inc: { wallet: walletAdjustment } },
        { new: true, projection: { wallet: 1 } }
      ).lean(),
      SlotLiveMicroGamingModal.findOneAndUpdate(
        { betId: txnId },
        {
          $set: { cancel: true },
        },
        { upsert: true }
      ),
    ]);

    res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
    return res.status(200).json({
      balance: roundToTwoDecimals(updatedUserBalanceCredit.wallet),
      currency: "MYR",
    });
  } catch (error) {
    console.log(
      "MICRO GAMING Error in game provider calling ae96 balance api",
      error.message
    );
    res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
    return res.status(500).json({});
  }
});

router.get("/api/microgaming/monitor", async (req, res) => {
  const startTime = Date.now();
  try {
    const mgpReqId = req.headers["x-mgp-req-id"];
    const mgpRequestTime = req.headers["x-mgp-request-timems"];

    res.set("X-MGP-REQ-ID", mgpReqId || "no-request-id-provided");

    const { ping } = req.body;

    res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
    return res.status(200).json({
      pong: ping || "",
    });
  } catch (error) {
    console.log(
      "MICRO GAMING Error in game provider calling ae96 balance api",
      error.message
    );
    res.set("X-MGP-RESPONSE-TIME", Date.now() - startTime);
    return res.status(500).json({});
  }
});

router.post("/api/microgamingslot/getturnoverforrebate", async (req, res) => {
  try {
    const { date } = req.body;

    let startDate, endDate;
    if (date === "today") {
      startDate = moment
        .utc()
        .add(8, "hours")
        .startOf("day")
        .subtract(8, "hours")
        .toDate();
      endDate = moment
        .utc()
        .add(8, "hours")
        .endOf("day")
        .subtract(8, "hours")
        .toDate();
    } else if (date === "yesterday") {
      startDate = moment
        .utc()
        .add(8, "hours")
        .subtract(1, "days")
        .startOf("day")
        .subtract(8, "hours")
        .toDate();

      endDate = moment
        .utc()
        .add(8, "hours")
        .subtract(1, "days")
        .endOf("day")
        .subtract(8, "hours")
        .toDate();
    }

    const records = await SlotLiveMicroGamingModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      cancel: { $ne: true },
      settle: true,
      gameType: "SLOT",
    });

    // Aggregate turnover and win/loss for each player
    let playerSummary = {};

    records.forEach((record) => {
      const username = record.username.toLowerCase();

      if (!playerSummary[username]) {
        playerSummary[username] = { turnover: 0, winloss: 0 };
      }

      playerSummary[username].turnover += record.betamount || 0;

      playerSummary[username].winloss +=
        (record.settleamount || 0) - (record.betamount || 0);
    });

    Object.keys(playerSummary).forEach((playerId) => {
      playerSummary[playerId].turnover = Number(
        playerSummary[playerId].turnover.toFixed(2)
      );
      playerSummary[playerId].winloss = Number(
        playerSummary[playerId].winloss.toFixed(2)
      );
    });
    // Return the aggregated results
    return res.status(200).json({
      success: true,
      summary: {
        gamename: "MICRO GAMING",
        gamecategory: "Slot Games",
        users: playerSummary, // Return player summary for each user
      },
    });
  } catch (error) {
    console.log(
      "MICRO GAMING SLOT: Failed to fetch win/loss report:",
      error.message
    );
    return res.status(500).json({
      success: false,
      message: {
        en: "MICRO GAMING SLOT: Failed to fetch win/loss report",
        zh: "MICRO GAMING SLOT: 获取盈亏报告失败",
      },
    });
  }
});

router.post("/api/microgaminglive/getturnoverforrebate", async (req, res) => {
  try {
    const { date } = req.body;

    let startDate, endDate;
    if (date === "today") {
      startDate = moment
        .utc()
        .add(8, "hours")
        .startOf("day")
        .subtract(8, "hours")
        .toDate();
      endDate = moment
        .utc()
        .add(8, "hours")
        .endOf("day")
        .subtract(8, "hours")
        .toDate();
    } else if (date === "yesterday") {
      startDate = moment
        .utc()
        .add(8, "hours")
        .subtract(1, "days")
        .startOf("day")
        .subtract(8, "hours")
        .toDate();

      endDate = moment
        .utc()
        .add(8, "hours")
        .subtract(1, "days")
        .endOf("day")
        .subtract(8, "hours")
        .toDate();
    }

    const records = await SlotLiveMicroGamingModal.find({
      createdAt: {
        $gte: startDate,
        $lt: endDate,
      },
      cancel: { $ne: true },
      settle: true,
      gameType: "LIVE",
    });

    // Aggregate turnover and win/loss for each player
    let playerSummary = {};

    records.forEach((record) => {
      const username = record.username.toLowerCase();

      if (!playerSummary[username]) {
        playerSummary[username] = { turnover: 0, winloss: 0 };
      }

      playerSummary[username].turnover += record.betamount || 0;

      playerSummary[username].winloss +=
        (record.settleamount || 0) - (record.betamount || 0);
    });

    // Format the turnover and win/loss for each player to two decimal places
    Object.keys(playerSummary).forEach((playerId) => {
      playerSummary[playerId].turnover = Number(
        playerSummary[playerId].turnover.toFixed(2)
      );
      playerSummary[playerId].winloss = Number(
        playerSummary[playerId].winloss.toFixed(2)
      );
    });
    // Return the aggregated results
    return res.status(200).json({
      success: true,
      summary: {
        gamename: "MICRO GAMING",
        gamecategory: "Live Casino",
        users: playerSummary,
      },
    });
  } catch (error) {
    console.log(
      "MICRO GAMING LIVE: Failed to fetch win/loss report:",
      error.message
    );
    return res.status(500).json({
      success: false,
      message: {
        en: "MICRO GAMING LIVE: Failed to fetch win/loss report",
        zh: "MICRO GAMING LIVE: 获取盈亏报告失败",
      },
    });
  }
});

router.get(
  "/admin/api/microgaminglive/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLiveMicroGamingModal.find({
        username: user.username,
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        settle: true,
        gameType: "LIVE",
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;
        totalWinLoss += (record.settleamount || 0) - (record.betamount || 0);
      });

      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      // Return the aggregated results
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "MICRO GAMING",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log(
        "MICRO GAMING LIVE: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "MICRO GAMING LIVE: Failed to fetch win/loss report",
          zh: "MICRO GAMING LIVE: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/microgaminglive/:userId/gamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await GameDataLog.find({
        username: user.username,
        date: {
          $gte: moment(new Date(startDate))
            .utc()
            .add(8, "hours")
            .format("YYYY-MM-DD"),
          $lte: moment(new Date(endDate))
            .utc()
            .add(8, "hours")
            .format("YYYY-MM-DD"),
        },
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      // Sum up the values for EVOLUTION under Live Casino
      records.forEach((record) => {
        // Convert Mongoose Map to Plain Object
        const gameCategories =
          record.gameCategories instanceof Map
            ? Object.fromEntries(record.gameCategories)
            : record.gameCategories;

        if (
          gameCategories &&
          gameCategories["Live Casino"] &&
          gameCategories["Live Casino"] instanceof Map
        ) {
          const liveCasino = Object.fromEntries(gameCategories["Live Casino"]);

          if (liveCasino["MICRO GAMING"]) {
            totalTurnover += liveCasino["MICRO GAMING"].turnover || 0;
            totalWinLoss += liveCasino["MICRO GAMING"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "MICRO GAMING",
          gamecategory: "Live Casino",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log(
        "MICRO GAMING LIVE: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "MICRO GAMING LIVE: Failed to fetch win/loss report",
          zh: "MICRO GAMING LIVE: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/microgamingslot/:userId/dailygamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await SlotLiveMicroGamingModal.find({
        username: user.username.toLowerCase(),
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        settle: true,
        gameType: "SLOT",
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;
        totalWinLoss += (record.settleamount || 0) - (record.betamount || 0);
      });

      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      // Return the aggregated results
      return res.status(200).json({
        success: true,
        summary: {
          gamename: "MICRO GAMING",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log(
        "MICRO GAMING SLOT: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "MICRO GAMING SLOT: Failed to fetch win/loss report",
          zh: "MICRO GAMING SLOT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/microgamingslot/:userId/gamedata",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const userId = req.params.userId;

      const user = await User.findById(userId);

      const records = await GameDataLog.find({
        username: user.username,
        date: {
          $gte: moment(new Date(startDate))
            .utc()
            .add(8, "hours")
            .format("YYYY-MM-DD"),
          $lte: moment(new Date(endDate))
            .utc()
            .add(8, "hours")
            .format("YYYY-MM-DD"),
        },
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      // Sum up the values for EVOLUTION under Live Casino
      records.forEach((record) => {
        // Convert Mongoose Map to Plain Object
        const gameCategories =
          record.gameCategories instanceof Map
            ? Object.fromEntries(record.gameCategories)
            : record.gameCategories;

        if (
          gameCategories &&
          gameCategories["Slot Games"] &&
          gameCategories["Slot Games"] instanceof Map
        ) {
          const slotGames = Object.fromEntries(gameCategories["Slot Games"]);

          if (slotGames["MICRO GAMING"]) {
            totalTurnover += slotGames["MICRO GAMING"].turnover || 0;
            totalWinLoss += slotGames["MICRO GAMING"].winloss || 0;
          }
        }
      });

      // Format the total values to two decimal places
      totalTurnover = Number(totalTurnover.toFixed(2));
      totalWinLoss = Number(totalWinLoss.toFixed(2));

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "MICRO GAMING",
          gamecategory: "Slot Games",
          user: {
            username: user.username,
            turnover: totalTurnover,
            winloss: totalWinLoss,
          },
        },
      });
    } catch (error) {
      console.log(
        "MICRO GAMING: Failed to fetch win/loss report:",
        error.message
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "MICRO GAMING SLOT: Failed to fetch win/loss report",
          zh: "MICRO GAMING SLOT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/microgamingslot/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLiveMicroGamingModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        settle: true,
        gameType: "SLOT",
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;

        const winLoss = (record.betamount || 0) - (record.settleamount || 0);

        totalWinLoss += winLoss;
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "MICRO GAMING",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error(
        "MICRO GAMING SLOT: Failed to fetch win/loss report:",
        error
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "MICRO GAMING SLOT: Failed to fetch win/loss report",
          zh: "MICRO GAMING SLOT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/microgaminglive/dailykioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await SlotLiveMicroGamingModal.find({
        createdAt: {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        },
        cancel: { $ne: true },
        settle: true,
        gameType: "LIVE",
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        totalTurnover += record.betamount || 0;

        const winLoss = (record.betamount || 0) - (record.settleamount || 0);

        totalWinLoss += winLoss;
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "MICRO GAMING",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error(
        "MICRO GAMING LIVE: Failed to fetch win/loss report:",
        error
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "MICRO GAMING LIVE: Failed to fetch win/loss report",
          zh: "MICRO GAMING LIVE: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/microgamingslot/kioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await GameDataLog.find({
        date: {
          $gte: moment(new Date(startDate))
            .utc()
            .add(8, "hours")
            .format("YYYY-MM-DD"),
          $lte: moment(new Date(endDate))
            .utc()
            .add(8, "hours")
            .format("YYYY-MM-DD"),
        },
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        const gameCategories =
          record.gameCategories instanceof Map
            ? Object.fromEntries(record.gameCategories)
            : record.gameCategories;

        if (
          gameCategories &&
          gameCategories["Slot Games"] &&
          gameCategories["Slot Games"] instanceof Map
        ) {
          const liveCasino = Object.fromEntries(gameCategories["Slot Games"]);

          if (liveCasino["MICRO GAMING"]) {
            totalTurnover += Number(liveCasino["MICRO GAMING"].turnover || 0);
            totalWinLoss +=
              Number(liveCasino["MICRO GAMING"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "MICRO GAMING",
          gamecategory: "Slot Games",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error(
        "MICRO GAMING SLOT: Failed to fetch win/loss report:",
        error
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "MICRO GAMING SLOT: Failed to fetch win/loss report",
          zh: "MICRO GAMING SLOT: 获取盈亏报告失败",
        },
      });
    }
  }
);

router.get(
  "/admin/api/microgaminglive/kioskreport",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const records = await GameDataLog.find({
        date: {
          $gte: moment(new Date(startDate))
            .utc()
            .add(8, "hours")
            .format("YYYY-MM-DD"),
          $lte: moment(new Date(endDate))
            .utc()
            .add(8, "hours")
            .format("YYYY-MM-DD"),
        },
      });

      let totalTurnover = 0;
      let totalWinLoss = 0;

      records.forEach((record) => {
        const gameCategories =
          record.gameCategories instanceof Map
            ? Object.fromEntries(record.gameCategories)
            : record.gameCategories;

        if (
          gameCategories &&
          gameCategories["Live Casino"] &&
          gameCategories["Live Casino"] instanceof Map
        ) {
          const liveCasino = Object.fromEntries(gameCategories["Live Casino"]);

          if (liveCasino["MICRO GAMING"]) {
            totalTurnover += Number(liveCasino["MICRO GAMING"].turnover || 0);
            totalWinLoss +=
              Number(liveCasino["MICRO GAMING"].winloss || 0) * -1;
          }
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          gamename: "MICRO GAMING",
          gamecategory: "Live Casino",
          totalturnover: Number(totalTurnover.toFixed(2)),
          totalwinloss: Number(totalWinLoss.toFixed(2)),
        },
      });
    } catch (error) {
      console.error(
        "MICRO GAMING LIVE: Failed to fetch win/loss report:",
        error
      );
      return res.status(500).json({
        success: false,
        message: {
          en: "MICRO GAMING LIVE: Failed to fetch win/loss report",
          zh: "MICRO GAMING LIVE: 获取盈亏报告失败",
        },
      });
    }
  }
);

module.exports = router;
