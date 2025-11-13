const express = require("express");
const router = express.Router();
const WeeklyTurnover = require("../models/weeklyTurnover.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { authenticateToken } = require("../auth/auth");
const axios = require("axios");
const moment = require("moment");
const { User } = require("../models/users.model");

// User Get Weekly Turnover
router.get("/api/weeklyturnover", async (req, res) => {
  try {
    const entry = await WeeklyTurnover.findOne().sort({ createdAt: -1 });
    const top20Data = entry && entry.data ? entry.data.slice(0, 20) : [];
    res.status(200).json({
      success: true,
      data: top20Data,
      metadata: entry ? entry.metadata : null,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching weekly turnover data",
      error: error.message,
    });
  }
});

// User Get Their Rank in Weekly Turnover Leaderboard
router.get(
  "/api/weeklyturnover/myrank",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const user = await User.findById(userId);
      const username = user.username;
      const entry = await WeeklyTurnover.findOne().sort({ createdAt: -1 });
      if (!entry || !entry.data || entry.data.length === 0) {
        return res.status(200).json({
          success: true,
          ranked: false,
          message: {
            en: "No leaderboard data available",
            zh: "暂无排行榜数据",
            ms: "Tiada data papan pendahulu tersedia",
          },
        });
      }
      const sortedData = [...entry.data].sort(
        (a, b) => b.totalValidTurnover - a.totalValidTurnover
      );
      const userIndex = sortedData.findIndex(
        (item) => item.username === username
      );
      if (userIndex === -1) {
        return res.status(200).json({
          success: true,
          ranked: false,
          message: {
            en: "You are not currently ranked in the leaderboard",
            zh: "您目前未在排行榜中",
            ms: "Anda tidak berada dalam papan pendahulu",
          },
          metadata: entry.metadata,
        });
      }
      const rank = userIndex + 1;

      if (rank <= 20) {
        return res.status(200).json({
          success: true,
          ranked: false,
          message: {
            en: "You are in top 20",
            zh: "您在前20名",
            ms: "Anda dalam 20 teratas",
          },
          metadata: entry.metadata,
        });
      }

      const userEntry = sortedData[userIndex];
      return res.status(200).json({
        success: true,
        ranked: true,
        rank: rank,
        username: userEntry.username,
        totalValidTurnover: userEntry.totalValidTurnover,
        metadata: entry.metadata,
      });
    } catch (error) {
      console.error("Error fetching user rank:", error.message);
      return res.status(500).json({
        success: false,
        message: {
          en: "Internal Server Error. Please contact customer service for further assistance",
          zh: "服务器内部错误。请联系客服以获取进一步帮助",
          ms: "Ralat Pelayan Dalaman. Sila hubungi khidmat pelanggan untuk bantuan lanjut",
        },
      });
    }
  }
);

// Admin Get All Weekly Turnover
router.get(
  "/admin/api/allweeklyturnover",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const entry = await WeeklyTurnover.findOne().sort({ createdAt: -1 });
      res.status(200).json({
        success: true,
        data: entry ? entry.data : [],
        metadata: entry ? entry.metadata : null,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching weekly turnover data",
        error: error.message,
      });
    }
  }
);

// Mock Data
router.post("/api/turnover/getweeklyturnover", async (req, res) => {
  try {
    const today = moment().tz("Asia/Kuala_Lumpur");
    const currentMonday = moment(today).startOf("week").add(1, "days");
    const lastMonday = moment(currentMonday).subtract(7, "days");
    const lastSunday = moment(lastMonday).add(6, "days");
    const startDate = lastMonday.startOf("day");
    const endDate = lastSunday.endOf("day");
    const startDateStr = startDate.format("YYYY-MM-DD");
    const endDateStr = endDate.format("YYYY-MM-DD");
    const dateRange = [];
    let currentDate = moment(startDate);
    while (currentDate <= endDate) {
      dateRange.push(currentDate.format("YYYY-MM-DD"));
      currentDate = moment(currentDate).add(1, "days");
    }
    const usernamePatterns = [
      "dragon",
      "tiger",
      "phoenix",
      "lucky",
      "winner",
      "king",
      "queen",
      "ace",
      "pro",
      "master",
      "legend",
      "boss",
      "vip",
      "gold",
      "diamond",
      "shark",
      "eagle",
      "lion",
      "wolf",
      "bear",
      "cobra",
      "falcon",
      "hawk",
      "player",
      "gamer",
      "ninja",
      "samurai",
      "warrior",
      "knight",
      "hero",
    ];
    const mockUsers = [];
    for (let i = 0; i < 10; i++) {
      const pattern =
        usernamePatterns[Math.floor(Math.random() * usernamePatterns.length)];
      const randomNum = Math.floor(Math.random() * 9999) + 1000;
      mockUsers.push({
        username: `${pattern}${randomNum}`,
        totalValidTurnover: parseFloat(
          (Math.random() * 400000 + 100000).toFixed(2)
        ),
      });
    }
    for (let i = 10; i < 30; i++) {
      const pattern =
        usernamePatterns[Math.floor(Math.random() * usernamePatterns.length)];
      const randomNum = Math.floor(Math.random() * 9999) + 1000;
      mockUsers.push({
        username: `${pattern}${randomNum}`,
        totalValidTurnover: parseFloat(
          (Math.random() * 50000 + 50000).toFixed(2)
        ),
      });
    }
    for (let i = 30; i < 60; i++) {
      const pattern =
        usernamePatterns[Math.floor(Math.random() * usernamePatterns.length)];
      const randomNum = Math.floor(Math.random() * 9999) + 1000;
      mockUsers.push({
        username: `${pattern}${randomNum}`,
        totalValidTurnover: parseFloat(
          (Math.random() * 30000 + 20000).toFixed(2)
        ),
      });
    }
    for (let i = 60; i < 100; i++) {
      const pattern =
        usernamePatterns[Math.floor(Math.random() * usernamePatterns.length)];
      const randomNum = Math.floor(Math.random() * 9999) + 1000;
      mockUsers.push({
        username: `${pattern}${randomNum}`,
        totalValidTurnover: parseFloat(
          (Math.random() * 15000 + 5000).toFixed(2)
        ),
      });
    }
    mockUsers.sort((a, b) => b.totalValidTurnover - a.totalValidTurnover);
    const aggregatedResults = mockUsers;
    const metadata = {
      daysIncluded: dateRange,
      totalUsers: aggregatedResults.length,
      startDate: startDateStr,
      endDate: endDateStr,
    };
    return res.status(200).json({
      startDate: startDateStr,
      endDate: endDateStr,
      success: true,
      metadata: metadata,
      data: aggregatedResults,
    });
  } catch (error) {
    console.error("==== ERROR IN WEEKLY TURNOVER RETRIEVAL ====");
    console.error("Error obtaining weekly turnover data:", error.message);
    return res.status(500).json({
      success: false,
      message: {
        en: "Internal Server Error. Please contact customer service for further assistance",
        zh: "服务器内部错误。请联系客服以获取进一步帮助",
        ms: "Ralat Pelayan Dalaman. Sila hubungi khidmat pelanggan untuk bantuan lanjut",
      },
    });
  }
});

// Admin Fetch and Store Weekly Turnover Data
router.post(
  "/admin/api/weeklyturnover/fetch",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const response = await axios.post(
        `${process.env.BASE_URL}api/turnover/getweeklyturnover`
      );
      if (!response.data.success) {
        return res.status(400).json({
          success: false,
          message: {
            en: "Failed to fetch weekly turnover data",
            zh: "获取周营业额数据失败",
          },
        });
      }
      const weeklyData = response.data.data;
      const formattedData = weeklyData.map((item) => ({
        username: item.username,
        totalValidTurnover: item.totalValidTurnover,
      }));
      // await WeeklyTurnover.deleteMany({});
      // const savedEntry = await WeeklyTurnover.create({
      //   data: formattedData,
      //   metadata: response.data.metadata,
      // });
      res.status(200).json({
        success: true,
        message: {
          en: "Weekly turnover data fetched and stored successfully",
          zh: "周营业额数据获取并存储成功",
        },
        data: formattedData,
        metadata: response.data.metadata,
      });
    } catch (error) {
      console.error(
        "Error fetching and storing weekly turnover:",
        error.message
      );
      res.status(500).json({
        success: false,
        message: {
          en: "Error fetching and storing weekly turnover data",
          zh: "获取并存储周营业额数据时出错",
        },
        error: error.message,
      });
    }
  }
);

// Admin Update Weekly Turnover (Update entire data array)
router.put(
  "/admin/api/weeklyturnover",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { data, metadata } = req.body;
      if (!Array.isArray(data)) {
        return res.status(400).json({
          success: false,
          message: {
            en: "Data must be an array",
            zh: "数据必须是数组",
          },
        });
      }
      const isValidEntry = (entry) => {
        return entry.username && typeof entry.totalValidTurnover === "number";
      };
      if (!data.every(isValidEntry)) {
        return res.status(400).json({
          success: false,
          message: {
            en: "Invalid entry format",
            zh: "无效的数据格式",
          },
        });
      }
      let existingEntry = await WeeklyTurnover.findOne().sort({
        createdAt: -1,
      });
      if (existingEntry) {
        existingEntry.data = data;
        existingEntry.metadata = metadata;
        const savedEntry = await existingEntry.save();
        res.status(200).json({
          success: true,
          message: {
            en: "Weekly turnover data updated successfully",
            zh: "周营业额数据更新成功",
          },
          data: savedEntry.data,
          metadata: savedEntry.metadata,
        });
      } else {
        const savedEntry = await WeeklyTurnover.create({
          data: data,
          metadata,
        });
        res.status(200).json({
          success: true,
          message: {
            en: "Weekly turnover data created successfully",
            zh: "周营业额数据创建成功",
          },
          data: savedEntry.data,
          metadata: savedEntry.metadata,
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating weekly turnover data",
          zh: "更新周营业额数据时出错",
        },
        error: error.message,
      });
    }
  }
);

// Admin Add Single Entry
router.post(
  "/admin/api/weeklyturnover/entry",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { username, totalValidTurnover } = req.body;
      if (!username || typeof totalValidTurnover !== "number") {
        return res.status(400).json({
          success: false,
          message: {
            en: "Username and totalValidTurnover are required",
            zh: "用户名和总有效营业额是必需的",
          },
        });
      }
      let existingEntry = await WeeklyTurnover.findOne().sort({
        createdAt: -1,
      });
      let existingData = existingEntry ? existingEntry.data : [];
      const userIndex = existingData.findIndex(
        (item) => item.username === username
      );
      if (userIndex !== -1) {
        existingData[userIndex].totalValidTurnover = totalValidTurnover;
      } else {
        existingData.push({ username, totalValidTurnover });
      }
      if (existingEntry) {
        existingEntry.data = existingData;
        const savedEntry = await existingEntry.save();
        res.status(200).json({
          success: true,
          message: {
            en: "Entry added/updated successfully",
            zh: "条目添加/更新成功",
          },
          data: savedEntry.data,
          metadata: savedEntry.metadata,
        });
      } else {
        const savedEntry = await WeeklyTurnover.create({
          data: existingData,
        });

        res.status(200).json({
          success: true,
          message: {
            en: "Entry added successfully",
            zh: "条目添加成功",
          },
          data: savedEntry.data,
          metadata: savedEntry.metadata,
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error adding/updating entry",
          zh: "添加/更新条目时出错",
        },
        error: error.message,
      });
    }
  }
);

// Admin Delete Single Entry
router.delete(
  "/admin/api/weeklyturnover/entry/:username",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { username } = req.params;
      let existingEntry = await WeeklyTurnover.findOne().sort({
        createdAt: -1,
      });
      if (!existingEntry) {
        return res.status(404).json({
          success: false,
          message: {
            en: "No data found",
            zh: "未找到数据",
          },
        });
      }
      const updatedData = existingEntry.data.filter(
        (item) => item.username !== username
      );
      existingEntry.data = updatedData;
      const savedEntry = await existingEntry.save();

      res.status(200).json({
        success: true,
        message: {
          en: "Entry deleted successfully",
          zh: "条目删除成功",
        },
        data: savedEntry.data,
        metadata: savedEntry.metadata,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error deleting entry",
          zh: "删除条目时出错",
        },
        error: error.message,
      });
    }
  }
);

module.exports = router;
