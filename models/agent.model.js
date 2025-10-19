const mongoose = require("mongoose");
const moment = require("moment");

const agentCommissionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["weekly", "monthly"],
      default: "weekly",
    },
    weekDay: {
      type: String,
      default: "1",
    },
    monthDay: {
      type: String,
      min: 1,
      max: 31,
      default: 1,
    },
    hour: {
      type: String,
      default: "03",
    },
    minute: {
      type: String,
      default: "00",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    calculationType: {
      type: String,
      enum: ["turnover", "winlose"],
      default: "turnover",
    },
    maxDownline: {
      type: String,
      default: "1",
    },
    commissionPercentages: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    winLoseCommission: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    lastRunTime: {
      type: Date,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

const agentCommissionReportSchema = new mongoose.Schema(
  {
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    agentUsername: {
      type: String,
    },
    agentFullname: {
      type: String,
    },
    downlineUsername: {
      type: String,
    },
    downlineFullname: {
      type: String,
    },
    downlineId: {
      type: String,
    },
    downlineDetailTurnover: [
      {
        level: Number,
        username: String,
        totalTurnover: Number,
      },
    ],
    downlineDetailWinLoss: [
      {
        level: Number,
        username: String,
        totalDeposit: Number,
        totalWithdraw: Number,
        netAmount: Number,
      },
    ],
    calculationType: {
      type: String,
      enum: ["turnover", "winlose"],
      required: true,
    },
    categoryTurnover: {
      type: Map,
      of: Number,
      default: new Map(),
    },
    totalWinLoss: {
      type: Number,
      default: 0,
    },

    commissionAmount: {
      type: Number,
      required: true,
    },
    totalTurnover: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    formula: {
      type: String,
    },
    remark: {
      type: String,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

const AgentCommission = mongoose.model(
  "AgentCommission",
  agentCommissionSchema
);
const AgentCommissionReport = mongoose.model(
  "AgentCommissionReport",
  agentCommissionReportSchema
);

module.exports = { AgentCommission, AgentCommissionReport };
