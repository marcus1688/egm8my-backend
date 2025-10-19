const mongoose = require("mongoose");
const moment = require("moment");

const agentPTReportSchema = new mongoose.Schema(
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
    totalDeposit: {
      type: String,
    },
    totalWithdraw: {
      type: String,
    },
    totalBonus: {
      type: String,
    },
    netWinlose: {
      type: String,
    },
    positionTaking: {
      type: String,
    },
    commission: {
      type: String,
    },
    status: {
      type: String,
      enum: ["paid", "unpaid"],
      default: "unpaid",
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

const AgentPTReport = mongoose.model("AgentPTReport", agentPTReportSchema);

module.exports = { AgentPTReport };
