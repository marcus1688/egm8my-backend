const express = require("express");
const router = express.Router();
const { KioskCategory } = require("../models/kioskcategory.model");
const { RebateSchedule } = require("../models/rebateSchedule.model");
const { AgentCommission } = require("../models/agent.model");
const { authenticateAdminToken } = require("../auth/adminAuth");

// Admin Create New Kiosk Categories
router.post(
  "/admin/api/kioskcategories",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { name } = req.body;
      const category = new KioskCategory({ name });
      await category.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Kiosk Category created successfully",
          zh: "游戏类别创建成功",
        },
        data: category,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error creating kiosk category",
          zh: "创建游戏类别时出错",
        },
      });
    }
  }
);

// Admin Get All Kiosk Categories
router.get(
  "/admin/api/kioskcategories",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const categories = await KioskCategory.find().sort({ createdAt: -1 });
      res.json({ success: true, data: categories });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Admin Update Kiosk Categories
router.put(
  "/admin/api/kioskcategories/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { name } = req.body;
      const category = await KioskCategory.findByIdAndUpdate(
        req.params.id,
        { name },
        { new: true }
      );
      if (!category) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Kiosk Category not found",
            zh: "找不到游戏类别",
          },
        });
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Kiosk Category updated successfully",
          zh: "游戏类别更新成功",
        },
        data: category,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Error updating kiosk category",
          zh: "更新游戏类别时出错",
        },
      });
    }
  }
);

// Admin Delete Kiosk Categories
router.delete(
  "/admin/api/kioskcategories/:id",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const kioskExists = await KioskCategory.exists({
        categoryId: req.params.id,
      });
      if (kioskExists) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Cannot delete category that has kiosks",
            zh: "无法删除含有游戏终端的分类",
          },
        });
      }

      const categoryToDelete = await KioskCategory.findById(req.params.id);
      if (!categoryToDelete) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Category not found",
            zh: "找不到游戏类别",
          },
        });
      }
      const categoryName = categoryToDelete.name;
      await KioskCategory.findByIdAndDelete(req.params.id);

      const schedule = await RebateSchedule.findOne();
      if (schedule && schedule.categoryPercentages) {
        if (schedule.categoryPercentages.get(categoryName)) {
          schedule.categoryPercentages.delete(categoryName);
          await schedule.save();
        }
      }

      const agentCommission = await AgentCommission.findOne();
      if (agentCommission && agentCommission.commissionPercentages) {
        for (const level in agentCommission.commissionPercentages) {
          const currentLevel = agentCommission.commissionPercentages[level];
          for (const key in currentLevel) {
            if (key === categoryName) {
              delete agentCommission.commissionPercentages[level][key];
            }
          }
        }
        agentCommission.markModified("commissionPercentages");
        await agentCommission.save();
      }
      res.status(200).json({
        success: true,
        message: {
          en: "Category deleted successfully",
          zh: "游戏类别删除成功",
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: {
          en: "Internal server error",
          zh: "服务器内部错误",
        },
      });
    }
  }
);

module.exports = router;
