const express = require("express");
const router = express.Router();
const WeeklyTurnover = require("../models/weeklyTurnover.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const axios = require("axios");

// User Get Weekly Turnover
router.get("/api/weeklyturnover", async (req, res) => {
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
});

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
