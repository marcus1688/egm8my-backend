const moment = require("moment-timezone");

// ========== DATE PARSER (all output in UTC+0) ==========
const parseDate = (dateStr, sourceTimezone = "Asia/Kuala_Lumpur") => {
  if (
    !dateStr ||
    dateStr.startsWith("0001-01-01") ||
    dateStr.startsWith("1900-01-01")
  ) {
    return null;
  }
  // Parse in source timezone, convert to UTC+0
  return moment
    .tz(dateStr, "YYYY-MM-DDTHH:mm:ss.SSS", sourceTimezone)
    .utc()
    .toDate();
};

// ========== GET CURRENT UTC+0 TIME ==========
const getCurrentUTC = () => moment.utc().toDate();

// ========== STATUS MAPPER ==========
const mapStatus = (provider, status) => {
  if (!status) return null;

  const statusMaps = {
    M9BET: {
      N: "accepted",
      A: "accepted",
      R: "rejected",
      RG: "rejected",
      RP: "rejected",
      RR: "rejected",
      RA: "rejected",
      C: "cancelled",
    },
    SBOBET: {
      running: "accepted",
      waiting: "accepted",
      "waiting rejected": "rejected",
      won: "accepted",
      lose: "accepted",
      draw: "accepted",
      void: "cancelled",
      "void(suspended match)": "cancelled",
      refund: "cancelled",
      done: "accepted",
      bonus: "accepted",
    },
  };

  const map = statusMaps[provider] || {};
  const statusLower = status?.toLowerCase();

  return map[status] || map[statusLower] || map[status?.toUpperCase()] || null;
};

// ========== RESULT MAPPER ==========
const mapResult = (provider, result) => {
  if (!result) return null;

  const resultMaps = {
    M9BET: {
      P: "pending",
      WA: "won",
      LA: "lost",
      WH: "half_won",
      LH: "half_lost",
      D: "draw",
      C: "void",
    },
    SBOBET: {
      running: "pending",
      waiting: "pending",
      "waiting rejected": "rejected",
      won: "won",
      lose: "lost",
      draw: "draw",
      void: "void",
      "void(suspended match)": "void",
      refund: "void",
      done: "void",
      bonus: "won",
    },
  };

  const map = resultMaps[provider] || {};
  const resultLower = result?.toLowerCase();

  return map[result] || map[resultLower] || map[result?.toUpperCase()] || null;
};

// ========== ODDS TYPE MAPPER ==========
const mapOddsType = (oddsType) => {
  if (!oddsType) return null;

  const oddsMap = {
    M: "MY",
    MY: "MY",
    H: "HK",
    HK: "HK",
    E: "EU",
    EU: "EU",
    I: "ID",
    ID: "ID",
  };

  return oddsMap[oddsType?.toUpperCase()] || oddsType;
};

// ========== SELECTION MAPPER ==========
const mapSelection = (side) => {
  if (!side) return null;

  const selectionMap = {
    1: "home",
    2: "away",
    X: "draw",
    x: "draw",
    H: "home",
    h: "home",
    A: "away",
    a: "away",
    D: "draw",
    d: "draw",
    O: "over",
    o: "over",
    U: "under",
    u: "under",
  };

  return (
    selectionMap[side?.toString()] || selectionMap[side?.toUpperCase()] || side
  );
};

// ========== HALF MAPPER ==========
const mapHalf = (half) => {
  if (half === null || half === undefined) return null;

  const halfMap = {
    0: "full",
    1: "first_half",
    2: "second_half",
    FT: "full",
    "1H": "first_half",
    "2H": "second_half",
  };

  return halfMap[half?.toString()?.toUpperCase()] || half;
};

// ========== SPORTS TYPE MAPPER ==========
const mapSportsType = (sportsType) => {
  if (typeof sportsType === "number") {
    const sportsMap = {
      1: "Soccer",
      2: "Basketball",
      3: "Tennis",
      4: "American Football",
      5: "Ice Hockey",
      6: "Baseball",
      7: "Volleyball",
      8: "Snooker",
      9: "Badminton",
      10: "Table Tennis",
      11: "Golf",
      12: "Boxing",
      13: "Motor Racing",
      14: "Cricket",
      15: "Rugby",
      43: "eSports",
    };
    return sportsMap[sportsType] || `Sport_${sportsType}`;
  }
  return sportsType;
};

// ========== CHECK IF SBOBET IS SETTLED ==========
const isSBOBETSettled = (status) => {
  if (!status) return false;

  const settledStatuses = [
    "won",
    "lose",
    "draw",
    "void",
    "void(suspended match)",
    "refund",
    "done",
    "bonus",
  ];

  const statusLower = status.toLowerCase();
  return settledStatuses.includes(statusLower) || statusLower.includes("void");
};

// ========== M9BET MAPPER (all dates converted to UTC+0) ==========
const mapM9BetToUnified = (ticket) => {
  // M9BET dates are in Asia/Kuala_Lumpur (UTC+8)
  const parseM9BetDate = (dateStr) => parseDate(dateStr, "Asia/Kuala_Lumpur");

  return {
    // Universal
    provider: "M9BET",
    category: "Sports",
    username: ticket.u,
    betId: ticket.id,
    transactionId: ticket.ventransid,

    // Amounts
    betamount: ticket.b || 0,
    validbetamount: ticket.b || 0,
    winlossamount: ticket.w || 0,
    settleamount: (ticket.b || 0) + (ticket.w || 0),
    turnover: ticket.b || 0,
    commission: ticket.c || 0,

    // Status
    status: mapStatus("M9BET", ticket.status),
    result: mapResult("M9BET", ticket.res),
    settle: ticket.res !== "P",
    cancel: ticket.status === "C",
    refund: ["R", "RG", "RP", "RR", "RA"].includes(ticket.status),

    // Game info
    gameName: mapSportsType(ticket.sportstype),
    gameType: ticket.game || null,

    // Dates (all in UTC+0)
    betTime: parseM9BetDate(ticket.t),
    settleTime: null,

    // Info
    currency: ticket.curcode || "MYR",
    ipAddress: ticket.ip || null,
    deviceType: ticket.webtype || null,

    // Raw
    statusRaw: ticket.status || null,
    resultRaw: ticket.res || null,

    // Sports specific (all dates in UTC+0)
    sports: {
      sportsType: mapSportsType(ticket.sportstype),
      sportsTypeId: ticket.sportstype || null,
      gameType: ticket.game || null,

      odds: ticket.odds || null,
      oddsType: mapOddsType(ticket.oddstype),

      leagueId: ticket.league?.toString() || null,
      leagueName: ticket.leaguename || null,

      homeTeamId: ticket.home?.toString() || null,
      homeTeamName: ticket.homename || null,
      awayTeamId: ticket.away?.toString() || null,
      awayTeamName: ticket.awayname || null,

      side: ticket.side || null,
      selection: mapSelection(ticket.side),
      handicapInfo: ticket.info || null,
      half: mapHalf(ticket.half),

      score: ticket.score || null,
      halfTimeScore: ticket.htscore || null,
      runningScore: ticket.runscore || null,

      isLive: false,
      isParlay: !!ticket.groupid || ticket.game === "PAR",
      isCashOut: false,
      isHalfWonLose: ["WH", "LH"].includes(ticket.res),

      matchDate: ticket.matchdate || null,
      matchDateTime: parseM9BetDate(ticket.matchdatetime),
      matchEndTime: parseM9BetDate(ticket.matchoverdate),
      workDate: parseM9BetDate(ticket.workdate),

      groupId: ticket.groupid || null,
      comboInfo: ticket.combinfo || null,

      firstLastGoal: ticket.flg || null,
      result4d: ticket.result4d || null,
      transSerial: ticket.transserial || null,
      fetchId: ticket.fid?.toString() || null,
      commissionAmount: ticket.a || null,
    },
  };
};

// ========== SBOBET MAPPER (all dates converted to UTC+0) ==========
const mapSBOBETToUnified = (bet) => {
  const isSettled = isSBOBETSettled(bet.status);
  const subBet = bet.subBet?.[0] || {};
  const statusLower = bet.status?.toLowerCase();

  // SBOBET dates are in UTC-4 (Etc/GMT+4 in moment)
  const parseSBOBETDate = (dateStr) => parseDate(dateStr, "Etc/GMT+4");

  return {
    // Universal
    provider: "SBOBET",
    category: "Sports",
    username: bet.username,
    betId: bet.refNo,
    transactionId: bet.refNo,

    // Amounts
    betamount: bet.stake || 0,
    validbetamount: bet.actualStake || 0,
    winlossamount: bet.winLost || 0,
    settleamount: (bet.stake || 0) + (bet.winLost || 0),
    turnover: bet.turnover || 0,
    commission: 0,

    // Status
    status: mapStatus("SBOBET", bet.status),
    result: mapResult("SBOBET", bet.status),
    settle: isSettled,
    cancel: statusLower === "void" || statusLower?.includes("void"),
    refund: statusLower === "refund",

    // Game info
    gameName: bet.sportsType || null,
    gameType: subBet.betOption || null,

    // Dates (all in UTC+0)
    betTime: parseSBOBETDate(bet.orderTime),
    settleTime: parseSBOBETDate(bet.settleTime),

    // Info
    currency: bet.currency || "MYR",
    ipAddress: bet.ip || null,
    deviceType: null,

    // Raw
    statusRaw: bet.status || null,
    resultRaw: bet.status || null,

    // Sports specific (all dates in UTC+0)
    sports: {
      sportsType: bet.sportsType || null,
      gameType: subBet.betOption || null,

      odds: bet.odds || null,
      oddsType: mapOddsType(bet.oddsStyle),

      leagueName: subBet.league || null,

      homeTeamName: subBet.home || null,
      awayTeamName: subBet.away || null,

      selection: null,
      handicapInfo: subBet.hdp?.toString() || null,
      half: subBet.isFirstHalf ? "first_half" : "full",

      score: subBet.ftScore || null,
      halfTimeScore: subBet.htScore || null,

      isLive: bet.isLive || false,
      isParlay: bet.sportsType === "Mix Parlay",
      isCashOut: bet.isCashOut || false,
      isHalfWonLose: bet.isHalfWonLose || false,

      matchDateTime: parseSBOBETDate(subBet.matchDatetime),
      winLostDate: parseSBOBETDate(bet.winLostDate),
      modifyDate: parseSBOBETDate(bet.modifyDate),

      parlayLegs: bet.subBet?.length || 0,
      subBets: bet.subBet || [],

      turnoverByStake: bet.turnoverByStake || 0,
      turnoverByActualStake: bet.turnoverByActualStake || 0,
      netTurnoverByStake: bet.netTurnoverByStake || 0,
      netTurnoverByActualStake: bet.netTurnoverByActualStake || 0,
      maxWinWithoutActualStake: bet.maxWinWithoutActualStake || 0,

      isSystemTagRisky: bet.isSystemTagRisky || false,
      isCustomerTagRisky: bet.isCustomerTagRisky || false,

      voidReason: bet.voidReason || null,
      topDownline: bet.topDownline || null,
    },
  };
};

// ========== EXPORT ==========
module.exports = {
  // Mappers
  mapM9BetToUnified,
  mapSBOBETToUnified,

  // Helpers
  parseDate,
  getCurrentUTC,
  mapStatus,
  mapResult,
  mapOddsType,
  mapSelection,
  mapHalf,
  mapSportsType,
  isSBOBETSettled,
};
