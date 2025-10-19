const SportSchedule = require("../models/sport.model");
const cron = require("node-cron");
const express = require("express");
const router = express.Router();
const axios = require("axios");
require("dotenv").config();
const PREMIER_LEAGUE_ID = 39;
const API_KEY = process.env.SPORTS_API;
const API_HOST = "v3.football.api-sports.io";
const API_URL = "https://" + API_HOST;

const getApiConfig = () => {
  return {
    headers: {
      "x-rapidapi-key": API_KEY,
      "x-rapidapi-host": API_HOST,
    },
  };
};

// Testing For Multiple League
const updateMatchData = async () => {
  try {
    const LEAGUE_IDS = [
      // { id: 2, name: "UEFA Champions League" },
      // { id: 5, name: "UEFA Nations League" },
      // { id: 1, name: "FIFA Club World Cup" },
      { id: 39, name: "Premier League" },
      // { id: 45, name: "FA Cup" },
      // { id: 2, name: "Champions League" },
      // { id: 3, name: "Europa League" },
      // { id: 140, name: "LaLiga" },
      // { id: 78, name: "Bundesliga" },
      // { id: 135, name: "Serie A" },
    ];
    let finalMatches = [];
    let leagueUsed = null;
    for (const league of LEAGUE_IDS) {
      const liveResponse = await axios.get(`${API_URL}/fixtures`, {
        params: {
          league: league.id,
          live: "all",
        },
        ...getApiConfig(),
      });
      let liveMatches = [];
      if (liveResponse.data?.response?.length > 0) {
        liveMatches = liveResponse.data.response;
      }
      if (liveMatches.length >= 3) {
        finalMatches = liveMatches.slice(0, 3);
        leagueUsed = league;
        break;
      } else if (liveMatches.length > 0) {
        const needUpcoming = 3 - liveMatches.length;
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        // const season =
        //   currentDate.getMonth() < 7 ? currentYear - 1 : currentYear;
        const season = 2025;
        const upcomingResponse = await axios.get(`${API_URL}/fixtures`, {
          params: {
            league: league.id,
            season: season,
            next: 10,
            status: "NS",
          },
          ...getApiConfig(),
        });
        if (upcomingResponse.data?.response?.length > 0) {
          const liveIds = liveMatches.map((m) => m.fixture.id);
          const upcomingMatches = upcomingResponse.data.response.filter(
            (match) => !liveIds.includes(match.fixture.id)
          );

          if (upcomingMatches.length > 0) {
            finalMatches = [
              ...liveMatches,
              ...upcomingMatches.slice(0, needUpcoming),
            ];
            leagueUsed = league;
            break;
          } else {
            finalMatches = liveMatches;
            leagueUsed = league;
            break;
          }
        } else {
          finalMatches = liveMatches;
          leagueUsed = league;
          break;
        }
      } else {
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        // const season =
        //   currentDate.getMonth() < 7 ? currentYear - 1 : currentYear;
        const season = 2025;
        const upcomingResponse = await axios.get(`${API_URL}/fixtures`, {
          params: {
            league: league.id,
            season: season,
            next: 3,
            status: "NS",
          },
          ...getApiConfig(),
        });
        if (upcomingResponse.data?.response?.length > 0) {
          finalMatches = upcomingResponse.data.response;
          leagueUsed = league;
          break;
        } else {
          console.log(
            `No matches found for ${league.name}, trying next league...`
          );
        }
      }
    }
    if (finalMatches.length === 0) {
      console.log("No matches found in any of the specified leagues");
      return false;
    }
    for (const match of finalMatches) {
      const isInplay =
        match.fixture.status.short === "LIVE" ||
        match.fixture.status.short === "1H" ||
        match.fixture.status.short === "HT" ||
        match.fixture.status.short === "2H" ||
        match.fixture.status.short === "ET" ||
        match.fixture.status.short === "P" ||
        match.fixture.status.short === "SUSP" ||
        match.fixture.status.short === "INT" ||
        match.fixture.status.short === "BT";

      const matchData = {
        fixtureId: match.fixture.id,
        date: match.fixture.date,
        leagueId: leagueUsed.id,
        leagueName: leagueUsed.name,
        status: {
          long: match.fixture.status.long,
          short: match.fixture.status.short,
          elapsed: match.fixture.status.elapsed,
          extra: match.fixture.status.extra,
        },
        teams: {
          home: {
            id: match.teams.home.id,
            name: match.teams.home.name,
            logo: match.teams.home.logo,
          },
          away: {
            id: match.teams.away.id,
            name: match.teams.away.name,
            logo: match.teams.away.logo,
          },
        },
        goals: {
          home: match.goals?.home,
          away: match.goals?.away,
        },
        venue: match.fixture.venue,
        isInplay: isInplay,
        lastUpdated: new Date(),
      };

      if (isInplay) {
        await SportSchedule.findOneAndUpdate(
          { fixtureId: match.fixture.id },
          matchData,
          { upsert: true, new: true }
        );
      } else {
        const existing = await SportSchedule.findOne({
          fixtureId: match.fixture.id,
        });
        if (!existing) {
          await SportSchedule.create(matchData);
        }
      }
    }
    const finalIds = finalMatches.map((m) => m.fixture.id);
    await SportSchedule.deleteMany({
      fixtureId: { $nin: finalIds },
    });
    const finalCount = await SportSchedule.countDocuments({});
    const inplayCount = await SportSchedule.countDocuments({ isInplay: true });
    console.log(
      `Sport Database now has ${finalCount} matches (${inplayCount} live, ${
        finalCount - inplayCount
      } upcoming) from ${leagueUsed.name}`
    );

    return true;
  } catch (error) {
    console.error("Failed to update match data:", error);
    return false;
  }
};

// Premier League Succssful Function
// const updateMatchData = async () => {
//   try {
//     const liveResponse = await axios.get(`${API_URL}/fixtures`, {
//       params: {
//         league: PREMIER_LEAGUE_ID,
//         live: "all",
//       },
//       ...getApiConfig(),
//     });
//     let finalMatches = [];
//     let liveMatches = [];
//     if (liveResponse.data?.response?.length > 0) {
//       liveMatches = liveResponse.data.response;
//       if (liveMatches.length >= 3) {
//         finalMatches = liveMatches.slice(0, 3);
//       } else {
//         const needUpcoming = 3 - liveMatches.length;
//         const currentDate = new Date();
//         const currentYear = currentDate.getFullYear();
//         const season =
//           currentDate.getMonth() < 7 ? currentYear - 1 : currentYear;
//         const upcomingResponse = await axios.get(`${API_URL}/fixtures`, {
//           params: {
//             league: PREMIER_LEAGUE_ID,
//             season: season,
//             next: 10,
//             status: "NS",
//           },
//           ...getApiConfig(),
//         });

//         if (upcomingResponse.data?.response?.length > 0) {
//           const liveIds = liveMatches.map((m) => m.fixture.id);
//           const upcomingMatches = upcomingResponse.data.response.filter(
//             (match) => !liveIds.includes(match.fixture.id)
//           );
//           finalMatches = [
//             ...liveMatches,
//             ...upcomingMatches.slice(0, needUpcoming),
//           ];
//         } else {
//           finalMatches = liveMatches;
//         }
//       }
//     } else {
//       const currentDate = new Date();
//       const currentYear = currentDate.getFullYear();
//       const season = currentDate.getMonth() < 7 ? currentYear - 1 : currentYear;
//       const upcomingResponse = await axios.get(`${API_URL}/fixtures`, {
//         params: {
//           league: PREMIER_LEAGUE_ID,
//           season: season,
//           next: 3,
//           status: "NS",
//         },
//         ...getApiConfig(),
//       });
//       if (upcomingResponse.data?.response?.length > 0) {
//         finalMatches = upcomingResponse.data.response;
//       }
//     }

//     for (const match of finalMatches) {
//       const isInplay =
//         match.fixture.status.short === "LIVE" ||
//         match.fixture.status.short === "1H" ||
//         match.fixture.status.short === "HT" ||
//         match.fixture.status.short === "2H" ||
//         match.fixture.status.short === "ET" ||
//         match.fixture.status.short === "P" ||
//         match.fixture.status.short === "SUSP" ||
//         match.fixture.status.short === "INT" ||
//         match.fixture.status.short === "BT";
//       const matchData = {
//         fixtureId: match.fixture.id,
//         date: match.fixture.date,
//         status: {
//           long: match.fixture.status.long,
//           short: match.fixture.status.short,
//           elapsed: match.fixture.status.elapsed,
//           extra: match.fixture.status.extra,
//         },
//         teams: {
//           home: {
//             id: match.teams.home.id,
//             name: match.teams.home.name,
//             logo: match.teams.home.logo,
//           },
//           away: {
//             id: match.teams.away.id,
//             name: match.teams.away.name,
//             logo: match.teams.away.logo,
//           },
//         },
//         goals: {
//           home: match.goals?.home,
//           away: match.goals?.away,
//         },
//         venue: match.fixture.venue,
//         isInplay: isInplay,
//         lastUpdated: new Date(),
//       };

//       if (isInplay) {
//         await SportSchedule.findOneAndUpdate(
//           { fixtureId: match.fixture.id },
//           matchData,
//           { upsert: true, new: true }
//         );
//       } else {
//         const existing = await SportSchedule.findOne({
//           fixtureId: match.fixture.id,
//         });
//         if (!existing) {
//           await SportSchedule.create(matchData);
//         }
//       }
//     }
//     const finalIds = finalMatches.map((m) => m.fixture.id);
//     await SportSchedule.deleteMany({
//       fixtureId: { $nin: finalIds },
//     });
//     const finalCount = await SportSchedule.countDocuments({});
//     const inplayCount = await SportSchedule.countDocuments({ isInplay: true });
//     console.log(
//       `Sport Database now has ${finalCount} matches (${inplayCount} live, ${
//         finalCount - inplayCount
//       } upcoming)`
//     );
//     return true;
//   } catch (error) {
//     console.error("Failed to update match data:", error);
//     return false;
//   }
// };

const initCronJob = () => {
  if (process.env.NODE_ENV !== "development") {
    cron.schedule("* * * * *", async () => {
      await updateMatchData();
    });
    console.log("Sport Cron job initialized - will update every 1 minute");
  } else {
    console.log(
      "Development environment detected - Sport Cron job is disabled"
    );
  }

  // 启动时仍然执行一次更新
  updateMatchData();
};

router.get("/api/premier-league", async (req, res) => {
  try {
    const matches = await SportSchedule.find({}).sort({ date: 1 }).limit(3);
    return res.json({
      success: true,
      count: matches.length,
      data: matches,
      lastUpdated: matches[0]?.lastUpdated || new Date(),
    });
  } catch (error) {
    console.error("Failed to get matches:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get matches",
      error: error.message,
    });
  }
});

// Live Match
router.get("/api/premier-league/live-fixtures-raw", async (req, res) => {
  try {
    const apiResponse = await axios.get(`${API_URL}/fixtures`, {
      params: {
        league: PREMIER_LEAGUE_ID,
        live: "all",
      },
      ...getApiConfig(),
    });

    return res.json({
      success: true,
      requestParams: {
        league: PREMIER_LEAGUE_ID,
        live: "all",
      },
      apiResponse: apiResponse.data,
      responseHeaders: apiResponse.headers,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error fetching live fixtures raw data:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch live fixtures raw data",
      error: error.message,
      timestamp: new Date(),
    });
  }
});

// Upcoming Match
router.post("/api/premier-league/fixtures-raw", async (req, res) => {
  try {
    const {
      league = PREMIER_LEAGUE_ID,
      season = "2024",
      next = "3",
      date,
      live,
      from,
      to,
      round,
      team,
      venue,
      last,
      ids,
      ...otherParams
    } = req.body;
    const queryParams = {};
    if (season) {
      queryParams.season = season;
    } else {
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      queryParams.season =
        currentDate.getMonth() < 7 ? currentYear - 1 : currentYear;
    }
    queryParams.league = league;
    if (next) queryParams.next = next;
    if (date) queryParams.date = date;
    if (live) queryParams.live = live;
    if (from) queryParams.from = from;
    if (to) queryParams.to = to;
    if (round) queryParams.round = round;
    if (team) queryParams.team = team;
    if (venue) queryParams.venue = venue;
    if (last) queryParams.last = last;
    if (ids) queryParams.ids = ids;
    Object.assign(queryParams, otherParams);
    const apiResponse = await axios.get(`${API_URL}/fixtures`, {
      params: queryParams,
      ...getApiConfig(),
    });
    return res.json({
      success: true,
      requestParams: queryParams,
      apiResponse: apiResponse.data,
      responseHeaders: apiResponse.headers,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error fetching fixtures raw data:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch fixtures raw data",
      error: error.message,
      timestamp: new Date(),
    });
  }
});

// Get League ID
router.get("/api/leagues", async (req, res) => {
  try {
    const { name, country, season, current } = req.query;
    const params = {};
    if (name) params.name = name;
    if (country) params.country = country;
    if (season) params.season = season;
    if (current) params.current = current;
    const response = await axios.get(`${API_URL}/leagues`, {
      params,
      ...getApiConfig(),
    });
    const leagues = response.data.response.map((item) => ({
      id: item.league.id,
      name: item.league.name,
      type: item.league.type,
      country: item.country.name,
      countryCode: item.country.code,
      season: 2025,
      logo: item.league.logo,
      flag: item.country.flag,
    }));
    return res.json({
      success: true,
      count: leagues.length,
      data: leagues,
    });
  } catch (error) {
    console.error("Error fetching leagues:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch leagues data",
      error: error.message,
    });
  }
});

initCronJob();

module.exports = router;
