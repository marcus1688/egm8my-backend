const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../auth/auth");
const Withdraw = require("../models/withdraw.model");
const { User } = require("../models/users.model");
const { authenticateAdminToken } = require("../auth/adminAuth");
const { general } = require("../models/general.model");
const { adminUser } = require("../models/adminuser.model");
const { v4: uuidv4 } = require("uuid");
const UserWalletLog = require("../models/userwalletlog.model");
const vip = require("../models/vip.model");
const moment = require("moment");
const Deposit = require("../models/deposit.model");
const Bonus = require("../models/bonus.model");
const promotion = require("../models/promotion.model");
const {
  checkGW99Balance,
  checkAlipayBalance,
  checkLionKingBalance,
} = require("../services/game");
const axios = require("axios");

// Check Turnover Requirement
// const checkTurnoverRequirements = async (userId) => {
//   try {
//     const DEFAULT_TURNOVER_MULTIPLIER = 1;
//     const DEFAULT_WINOVER_MULTIPLIER = 3;
//     const latestWithdraw = await Withdraw.findOne({
//       userId,
//       status: "approved",
//     }).sort({ createdAt: -1 });
//     const latestDeposit = await Deposit.findOne({
//       userId,
//       status: "approved",
//     }).sort({ createdAt: -1 });

//     let latestBonus = await Bonus.findOne({
//       userId,
//       status: "approved",
//     }).sort({ createdAt: -1 });
//     if (
//       latestWithdraw &&
//       (!latestDeposit || latestWithdraw.createdAt > latestDeposit.createdAt) &&
//       (!latestBonus || latestWithdraw.createdAt > latestBonus.createdAt)
//     ) {
//       return {
//         success: true,
//         message: "No turnover requirements to check",
//       };
//     }
//     let isDepositLatest =
//       latestDeposit &&
//       (!latestBonus || latestDeposit.createdAt > latestBonus.createdAt);
//     let isBonusLatest =
//       latestBonus &&
//       (!latestDeposit || latestBonus.createdAt > latestDeposit.createdAt);
//     // if (isBonusLatest && latestBonus && latestBonus.processBy === "system") {
//     //   const previousBonus = await Bonus.findOne({
//     //     userId,
//     //     status: "approved",
//     //     createdAt: { $lt: latestBonus.createdAt },
//     //   }).sort({ createdAt: -1 });
//     //   if (previousBonus) {
//     //     latestBonus = previousBonus;
//     //   } else {
//     //     if (latestDeposit) {
//     //       isDepositLatest = true;
//     //       isBonusLatest = false;
//     //     } else {
//     //       return {
//     //         success: true,
//     //         message: "No turnover requirements to check",
//     //       };
//     //     }
//     //   }
//     // }
//     let requirementType = "none";
//     let turnoverRequirement = 0;
//     let withdrawType = "turnover";
//     if (isDepositLatest) {
//       const relatedBonus = await Bonus.findOne({
//         depositId: latestDeposit._id,
//         status: "approved",
//       });
//       if (!relatedBonus) {
//         turnoverRequirement =
//           latestDeposit.amount * DEFAULT_TURNOVER_MULTIPLIER;
//         requirementType = "turnover";
//       } else {
//         const promotionData = await promotion.findById(
//           relatedBonus.promotionId
//         );
//         if (!promotionData) {
//           turnoverRequirement =
//             (parseFloat(latestDeposit.amount) +
//               parseFloat(relatedBonus.amount)) *
//             DEFAULT_TURNOVER_MULTIPLIER;
//           requirementType = "turnover";
//         } else {
//           withdrawType = promotionData.withdrawtype || "turnover";
//           if (withdrawType === "winover") {
//             const user = await User.findById(userId);
//             if (!user) {
//               return {
//                 success: false,
//                 message: "User not found",
//               };
//             }
//             const multiplier =
//               promotionData.winloserequirement || DEFAULT_WINOVER_MULTIPLIER;
//             const totalAmount =
//               parseFloat(latestDeposit.amount) +
//               parseFloat(relatedBonus.amount);
//             const winoverRequirement = totalAmount * multiplier;
//             if (user.wallet >= winoverRequirement) {
//               return {
//                 success: true,
//                 message: "Winover requirement met",
//               };
//             } else {
//               return {
//                 success: false,
//                 message: "Winover requirement not met",
//                 requiredAmount: winoverRequirement,
//                 currentBalance: user.wallet,
//                 remainingAmount: winoverRequirement - user.wallet,
//               };
//             }
//           } else {
//             const multiplier =
//               promotionData.turnoverrequiremnt || DEFAULT_TURNOVER_MULTIPLIER;
//             const totalAmount =
//               parseFloat(latestDeposit.amount) +
//               parseFloat(relatedBonus.amount);
//             turnoverRequirement = totalAmount * multiplier;
//             requirementType = "turnover";
//           }
//         }
//       }
//     } else if (isBonusLatest) {
//       if (!latestBonus.depositId) {
//         const promotionData = await promotion.findById(latestBonus.promotionId);
//         if (!promotionData) {
//           return {
//             success: true,
//             message: "No turnover requirements for this bonus",
//           };
//         }
//         withdrawType = promotionData.withdrawtype || "turnover";
//         if (withdrawType === "winover") {
//           const user = await User.findById(userId);
//           if (!user) {
//             return {
//               success: false,
//               message: "User not found",
//             };
//           }
//           const multiplier =
//             promotionData.winloserequirement || DEFAULT_WINOVER_MULTIPLIER;
//           const winoverRequirement = latestBonus.amount * multiplier;
//           if (user.wallet >= winoverRequirement) {
//             return {
//               success: true,
//               message: "Winover requirement met",
//             };
//           } else {
//             return {
//               success: false,
//               message: "Winover requirement not met",
//               requiredAmount: winoverRequirement,
//               currentBalance: user.wallet,
//               remainingAmount: winoverRequirement - user.wallet,
//             };
//           }
//         } else {
//           const multiplier =
//             promotionData.turnoverrequiremnt || DEFAULT_TURNOVER_MULTIPLIER;
//           turnoverRequirement = latestBonus.amount * multiplier;
//           requirementType = "turnover";
//         }
//       } else {
//         const relatedDeposit = await Deposit.findById(latestBonus.depositId);
//         const promotionData = await promotion.findById(latestBonus.promotionId);
//         if (!promotionData) {
//           if (relatedDeposit) {
//             turnoverRequirement =
//               (parseFloat(relatedDeposit.amount) +
//                 parseFloat(latestBonus.amount)) *
//               DEFAULT_TURNOVER_MULTIPLIER;
//           } else {
//             turnoverRequirement =
//               latestBonus.amount * DEFAULT_TURNOVER_MULTIPLIER;
//           }
//           requirementType = "turnover";
//         } else {
//           withdrawType = promotionData.withdrawtype || "turnover";
//           if (withdrawType === "winover") {
//             const user = await User.findById(userId);
//             if (!user) {
//               return {
//                 success: false,
//                 message: "User not found",
//               };
//             }
//             let totalAmount = latestBonus.amount;
//             if (relatedDeposit) {
//               totalAmount += parseFloat(relatedDeposit.amount);
//             }
//             const multiplier =
//               promotionData.winloserequirement || DEFAULT_WINOVER_MULTIPLIER;
//             const winoverRequirement = totalAmount * multiplier;
//             if (user.wallet >= winoverRequirement) {
//               return {
//                 success: true,
//                 message: "Winover requirement met",
//               };
//             } else {
//               return {
//                 success: false,
//                 message: "Winover requirement not met",
//                 requiredAmount: winoverRequirement,
//                 currentBalance: user.wallet,
//                 remainingAmount: winoverRequirement - user.wallet,
//               };
//             }
//           } else {
//             let totalAmount = latestBonus.amount;
//             if (relatedDeposit) {
//               totalAmount += parseFloat(relatedDeposit.amount);
//             }
//             const multiplier =
//               promotionData.turnoverrequiremnt || DEFAULT_TURNOVER_MULTIPLIER;
//             turnoverRequirement = totalAmount * multiplier;
//             requirementType = "turnover";
//           }
//         }
//       }
//     } else {
//       return {
//         success: true,
//         message: "No transactions found",
//       };
//     }
//     if (requirementType === "turnover" && turnoverRequirement > 0) {
//       try {
//         let transactionDate;
//         if (isBonusLatest) {
//           transactionDate = moment(latestBonus.createdAt).format(
//             "YYYY-MM-DD HH:mm:ss"
//           );
//         } else if (isDepositLatest) {
//           transactionDate = moment(latestDeposit.createdAt).format(
//             "YYYY-MM-DD HH:mm:ss"
//           );
//         }
//         const startDate = transactionDate;
//         const response = await axios.get(
//           `${process.env.BASE_URL}api/all/${userId}/dailygamedata`,
//           {
//             params: { startDate },
//           }
//         );
//         const data = response.data;
//         if (!data || !data.success) {
//           return {
//             success: false,
//             message: "Failed to fetch turnover data",
//           };
//         }
//         const userTotalTurnover = data.summary.totalTurnover || 0;
//         if (userTotalTurnover >= turnoverRequirement) {
//           return {
//             success: true,
//             message: "Turnover requirement met",
//           };
//         } else {
//           return {
//             success: false,
//             message: "Turnover requirement not met",
//             requiredTurnover: turnoverRequirement,
//             currentTurnover: userTotalTurnover,
//             remainingTurnover: turnoverRequirement - userTotalTurnover,
//           };
//         }
//       } catch (error) {
//         console.error("Error fetching turnover data:", error);
//         return {
//           success: false,
//           message: "Error checking turnover requirements",
//           error: error.message,
//         };
//       }
//     }
//     return {
//       success: true,
//       message: "No turnover requirements",
//     };
//   } catch (error) {
//     console.error("Error checking turnover requirements:", error);
//     return {
//       success: false,
//       message: "Error checking turnover requirements",
//       error: error.message,
//     };
//   }
// };

const checkTurnoverRequirements = async (userId) => {
  try {
    const DEFAULT_TURNOVER_MULTIPLIER = 1;
    const DEFAULT_WINOVER_MULTIPLIER = 3;
    const user = await User.findById(userId);
    if (!user) {
      return {
        success: false,
        message: "User not found",
      };
    }
    const latestWithdraw = await Withdraw.findOne({
      userId,
      status: "approved",
    }).sort({ createdAt: -1 });
    const latestDeposit = await Deposit.findOne({
      userId,
      status: "approved",
    }).sort({ createdAt: -1 });
    const latestBonus = await Bonus.findOne({
      userId,
      status: "approved",
    }).sort({ createdAt: -1 });

    let effectiveResetDate = null;
    if (latestWithdraw && user.turnoverResetAt) {
      effectiveResetDate =
        latestWithdraw.createdAt > user.turnoverResetAt
          ? latestWithdraw.createdAt
          : user.turnoverResetAt;
    } else if (latestWithdraw) {
      effectiveResetDate = latestWithdraw.createdAt;
    } else if (user.turnoverResetAt) {
      effectiveResetDate = user.turnoverResetAt;
    }
    if (
      effectiveResetDate &&
      (!latestDeposit || effectiveResetDate > latestDeposit.createdAt) &&
      (!latestBonus || effectiveResetDate > latestBonus.createdAt)
    ) {
      return {
        success: true,
        message:
          "No turnover requirements (last action was withdrawal or reset)",
      };
    }
    const depositsAfterWithdraw = await Deposit.find({
      userId,
      status: "approved",
      ...(effectiveResetDate && { createdAt: { $gt: effectiveResetDate } }),
    }).sort({ createdAt: 1 });
    const bonusesAfterWithdraw = await Bonus.find({
      userId,
      status: "approved",
      ...(effectiveResetDate && { createdAt: { $gt: effectiveResetDate } }),
    }).sort({ createdAt: 1 });
    const allTransactions = [
      ...depositsAfterWithdraw.map((d) => ({
        type: "deposit",
        data: d,
        date: d.createdAt,
        isNewCycle: d.isNewCycle || false,
      })),
      ...bonusesAfterWithdraw.map((b) => ({
        type: "bonus",
        data: b,
        date: b.createdAt,
        isNewCycle: b.isNewCycle || false,
      })),
    ].sort((a, b) => a.date - b.date);
    if (allTransactions.length === 0) {
      return {
        success: true,
        message: "No turnover requirements",
      };
    }
    let startIndex = 0;
    for (let i = allTransactions.length - 1; i >= 0; i--) {
      if (
        allTransactions[i].isNewCycle === true &&
        allTransactions[i].type === "deposit"
      ) {
        startIndex = i;
        break;
      }
    }
    if (startIndex === 0) {
      for (let i = allTransactions.length - 1; i >= 0; i--) {
        if (allTransactions[i].isNewCycle === true) {
          startIndex = i;
          break;
        }
      }
    }
    const validTransactions = allTransactions.slice(startIndex);
    const startDate = validTransactions[0].date;
    let totalTurnoverRequired = 0;
    let hasWinoverRequirement = false;
    let winoverDetails = null;
    for (let i = 0; i < validTransactions.length; i++) {
      const tx = validTransactions[i];
      if (tx.type === "deposit") {
        const deposit = tx.data;
        const relatedBonus = bonusesAfterWithdraw.find(
          (b) =>
            b.depositId && b.depositId.toString() === deposit._id.toString()
        );
        if (relatedBonus) {
          const promotionData = await promotion.findById(
            relatedBonus.promotionId
          );
          if (!promotionData) {
            const totalAmount =
              parseFloat(deposit.amount) + parseFloat(relatedBonus.amount);
            totalTurnoverRequired += totalAmount * DEFAULT_TURNOVER_MULTIPLIER;
          } else {
            const withdrawType = promotionData.withdrawtype || "turnover";
            if (withdrawType === "winover") {
              hasWinoverRequirement = true;
              const multiplier =
                promotionData.winloserequirement || DEFAULT_WINOVER_MULTIPLIER;
              const totalAmount =
                parseFloat(deposit.amount) + parseFloat(relatedBonus.amount);
              const winoverRequirement = totalAmount * multiplier;
              winoverDetails = {
                requiredAmount: winoverRequirement,
                depositAmount: deposit.amount,
                bonusAmount: relatedBonus.amount,
                multiplier: multiplier,
              };
            } else {
              const multiplier =
                promotionData.turnoverrequiremnt || DEFAULT_TURNOVER_MULTIPLIER;
              const totalAmount =
                parseFloat(deposit.amount) + parseFloat(relatedBonus.amount);
              totalTurnoverRequired += totalAmount * multiplier;
            }
          }
        } else {
          totalTurnoverRequired +=
            parseFloat(deposit.amount) * DEFAULT_TURNOVER_MULTIPLIER;
        }
      } else if (tx.type === "bonus") {
        const bonus = tx.data;
        if (bonus.depositId) {
          continue;
        }
        const promotionData = await promotion.findById(bonus.promotionId);
        if (!promotionData) {
          totalTurnoverRequired +=
            parseFloat(bonus.amount) * DEFAULT_TURNOVER_MULTIPLIER;
        } else {
          const withdrawType = promotionData.withdrawtype || "turnover";
          if (withdrawType === "winover") {
            hasWinoverRequirement = true;
            const multiplier =
              promotionData.winloserequirement || DEFAULT_WINOVER_MULTIPLIER;
            const winoverRequirement = parseFloat(bonus.amount) * multiplier;
            winoverDetails = {
              requiredAmount: winoverRequirement,
              bonusAmount: bonus.amount,
              multiplier: multiplier,
            };
          } else {
            const multiplier =
              promotionData.turnoverrequiremnt || DEFAULT_TURNOVER_MULTIPLIER;
            totalTurnoverRequired += parseFloat(bonus.amount) * multiplier;
          }
        }
      }
    }
    if (hasWinoverRequirement && winoverDetails) {
      if (user.wallet >= winoverDetails.requiredAmount) {
        return {
          success: true,
          message: "Winover requirement met",
        };
      } else {
        return {
          success: false,
          message: "Winover requirement not met",
          requiredAmount: winoverDetails.requiredAmount,
          currentBalance: user.wallet,
          remainingAmount: winoverDetails.requiredAmount - user.wallet,
        };
      }
    }

    if (totalTurnoverRequired > 0) {
      try {
        const response = await axios.get(
          `${process.env.BASE_URL}api/all/${userId}/dailygamedata`,
          {
            params: {
              startDate: moment(startDate).format("YYYY-MM-DD HH:mm:ss"),
            },
          }
        );
        const data = response.data;
        if (!data || !data.success) {
          return {
            success: false,
            message: "Failed to fetch turnover data",
          };
        }
        const userTotalTurnover = data.summary.totalTurnover || 0;
        if (userTotalTurnover >= totalTurnoverRequired) {
          return {
            success: true,
            message: "Turnover requirement met",
          };
        } else {
          return {
            success: false,
            message: "Turnover requirement not met",
            requiredTurnover: totalTurnoverRequired,
            currentTurnover: userTotalTurnover,
            remainingTurnover: totalTurnoverRequired - userTotalTurnover,
          };
        }
      } catch (error) {
        console.error("Error fetching turnover data:", error);
        return {
          success: false,
          message: "Error checking turnover requirements",
          error: error.message,
        };
      }
    }
    return {
      success: true,
      message: "No turnover requirements",
    };
  } catch (error) {
    console.error("Error checking turnover requirements:", error);
    return {
      success: false,
      message: "Error checking turnover requirements",
      error: error.message,
    };
  }
};

router.get("/api/user/turnover-check", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found, please contact customer service",
          zh: "找不到用户，请联系客服",
          ms: "Pengguna tidak dijumpai, sila hubungi khidmat pelanggan",
        },
      });
    }
    const turnoverCheck = await checkTurnoverRequirements(userId);
    if (turnoverCheck.success) {
      return res.status(200).json({
        success: true,
        message: {
          en: "No turnover requirements found. You can proceed with withdrawal",
          zh: "未发现流水要求，您可以进行提现",
          ms: "Tiada keperluan turnover dijumpai. Anda boleh meneruskan pengeluaran",
        },
        turnoverDetails: null,
      });
    } else {
      let detailedMessage = {
        en: "Turnover requirement not met",
        zh: "未满足流水要求",
        ms: "Keperluan turnover tidak dipenuhi",
      };
      if (turnoverCheck.requiredTurnover) {
        detailedMessage = {
          en: `Turnover requirement not met. Required: RM${turnoverCheck.requiredTurnover.toFixed(
            2
          )}, Current: RM${turnoverCheck.currentTurnover.toFixed(
            2
          )}, Remaining: RM${turnoverCheck.remainingTurnover.toFixed(2)}`,
          zh: `未满足流水要求。需要: RM${turnoverCheck.requiredTurnover.toFixed(
            2
          )}，当前: RM${turnoverCheck.currentTurnover.toFixed(
            2
          )}，还差: RM${turnoverCheck.remainingTurnover.toFixed(2)}`,
          ms: `Keperluan turnover tidak dipenuhi. Diperlukan: RM${turnoverCheck.requiredTurnover.toFixed(
            2
          )}, Semasa: RM${turnoverCheck.currentTurnover.toFixed(
            2
          )}, Baki: RM${turnoverCheck.remainingTurnover.toFixed(2)}`,
        };
      } else if (turnoverCheck.requiredAmount) {
        detailedMessage = {
          en: `Wallet balance requirement not met. Required balance: RM${turnoverCheck.requiredAmount.toFixed(
            2
          )}, Current: RM${turnoverCheck.currentBalance.toFixed(
            2
          )}, Shortfall: RM${turnoverCheck.remainingAmount.toFixed(2)}`,
          zh: `未满足余额要求。需要余额: RM${turnoverCheck.requiredAmount.toFixed(
            2
          )}，当前: RM${turnoverCheck.currentBalance.toFixed(
            2
          )}，缺少: RM${turnoverCheck.remainingAmount.toFixed(2)}`,
          ms: `Keperluan baki dompet tidak dipenuhi. Baki diperlukan: RM${turnoverCheck.requiredAmount.toFixed(
            2
          )}, Semasa: RM${turnoverCheck.currentBalance.toFixed(
            2
          )}, Kekurangan: RM${turnoverCheck.remainingAmount.toFixed(2)}`,
        };
      }
      return res.status(200).json({
        success: false,
        message: detailedMessage,
        turnoverDetails: turnoverCheck,
      });
    }
  } catch (error) {
    console.error("Error checking user turnover requirements:", error);
    return res.status(500).json({
      success: false,
      message: {
        en: "Failed to check turnover requirements. Please try again later",
        zh: "检查流水要求失败，请稍后再试",
        ms: "Gagal menyemak keperluan turnover. Sila cuba lagi kemudian",
      },
      error: error.message,
    });
  }
});

// Customer Submit Withdraw
router.post("/api/withdraw", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found, please contact customer service",
          zh: "找不到用户，请联系客服",
          ms: "Pengguna tidak dijumpai, sila hubungi khidmat pelanggan",
        },
      });
    }

    if (user.withdrawlock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Your withdrawals are currently locked. Please contact support for assistance",
          zh: "您的提现功能已被锁定，请联系客服获取帮助",
          ms: "Pengeluaran anda kini dikunci. Sila hubungi khidmat sokongan untuk bantuan",
        },
      });
    }

    const { withdrawAmount, userbankid } = req.body;
    if (!withdrawAmount || withdrawAmount <= 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Please enter a valid withdraw amount",
          zh: "请输入有效的提现金额",
          ms: "Sila masukkan jumlah pengeluaran yang sah",
        },
      });
    }

    const generalSettings = await general.findOne();
    const minWithdraw = generalSettings?.minWithdraw || 50;
    const maxWithdraw = generalSettings?.maxWithdraw || 0;

    if (withdrawAmount < minWithdraw) {
      return res.status(200).json({
        success: false,
        message: {
          en: `Minimum withdrawal amount is RM${minWithdraw}`,
          zh: `最低提款金额为RM${minWithdraw}`,
          ms: `Jumlah pengeluaran minimum adalah RM${minWithdraw}`,
        },
      });
    }

    if (maxWithdraw > 0 && withdrawAmount > maxWithdraw) {
      return res.status(200).json({
        success: false,
        message: {
          en: `Maximum withdrawal amount is RM${maxWithdraw}`,
          zh: `最高提款金额为RM${maxWithdraw}`,
          ms: `Jumlah pengeluaran maksimum adalah RM${maxWithdraw}`,
        },
      });
    }

    if (withdrawAmount > user.wallet) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Withdraw amount exceeds wallet balance",
          zh: "提现金额超过钱包余额",
          ms: "Jumlah pengeluaran melebihi baki dompet",
        },
      });
    }

    if (!userbankid) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Please select a bank account",
          zh: "请选择银行账户",
          ms: "Sila pilih akaun bank",
        },
      });
    }

    const existingPendingWithdrawal = await Withdraw.findOne({
      userId: userId,
      status: "pending",
    });

    if (existingPendingWithdrawal) {
      return res.status(200).json({
        success: false,
        message: {
          en: "You already have a pending withdrawal request. Please wait for it to be processed",
          zh: "您已有一笔待处理的提现申请，请等待处理完成",
          ms: "Anda sudah mempunyai permintaan pengeluaran yang belum selesai. Sila tunggu sehingga ia diproses",
        },
      });
    }

    const turnoverCheck = await checkTurnoverRequirements(userId);

    if (!turnoverCheck.success) {
      let message = {
        en: "Turnover requirement not met",
        zh: "未满足流水要求",
      };

      if (turnoverCheck.requiredTurnover) {
        message = {
          en: `Turnover requirement not met. You need ${turnoverCheck.requiredTurnover.toFixed(
            2
          )} turnover, current: ${turnoverCheck.currentTurnover.toFixed(
            2
          )}, remaining: ${turnoverCheck.remainingTurnover.toFixed(2)}`,
          zh: `未满足流水要求。您需要 ${turnoverCheck.requiredTurnover.toFixed(
            2
          )} 的流水，当前: ${turnoverCheck.currentTurnover.toFixed(
            2
          )}，还差: ${turnoverCheck.remainingTurnover.toFixed(2)}`,
        };
      } else if (turnoverCheck.requiredAmount) {
        message = {
          en: `Wallet balance requirement not met. Your wallet balance needs to reach ${turnoverCheck.requiredAmount.toFixed(
            2
          )}, current: ${turnoverCheck.currentBalance.toFixed(
            2
          )}, remaining: ${turnoverCheck.remainingAmount.toFixed(2)}`,
          zh: `未满足余额要求。您的钱包余额需要达到 ${turnoverCheck.requiredAmount.toFixed(
            2
          )}，当前: ${turnoverCheck.currentBalance.toFixed(
            2
          )}，还差: ${turnoverCheck.remainingAmount.toFixed(2)}`,
        };
      }

      return res.status(200).json({
        success: false,
        message: message,
        turnoverDetails: turnoverCheck,
      });
    }

    const userVipLevel = user.viplevel;
    const vipSettings = await vip.findOne();
    let withdrawCountLimit = 3;
    let dailyBankWithdrawLimit = 0;

    if (!vipSettings) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Unable to process withdrawal at this time. Please try again later",
          zh: "目前无法处理提款，请稍后再试",
          ms: "Tidak dapat memproses pengeluaran pada masa ini. Sila cuba lagi kemudian",
        },
      });
    }

    if (!userVipLevel || userVipLevel.toLowerCase() === "member") {
    } else if (vipSettings) {
      const vipLevelData = vipSettings.vipLevels.find(
        (level) => level.name === userVipLevel.toString()
      );
      if (vipLevelData) {
        if (vipLevelData.benefits.has("Withdraw Limit")) {
          const countLimit = vipLevelData.benefits.get("Withdraw Limit");
          withdrawCountLimit = parseInt(countLimit) || 3;
        }
        if (vipLevelData.benefits.has("Daily Bank Withdraw Limit")) {
          const limitValue = vipLevelData.benefits.get(
            "Daily Bank Withdraw Limit"
          );
          if (
            limitValue &&
            limitValue.toString().toLowerCase() !== "unlimited"
          ) {
            dailyBankWithdrawLimit = parseFloat(limitValue) || 0;
          }
        }
      }
    }
    const malaysiaTimezone = "Asia/Kuala_Lumpur";
    const todayStart = moment().tz(malaysiaTimezone).startOf("day").utc();
    const todayEnd = moment().tz(malaysiaTimezone).endOf("day").utc();
    const todayWithdrawals = await Withdraw.find({
      userId: userId,
      status: { $in: ["approved"] },
      createdAt: {
        $gte: todayStart.toDate(),
        $lte: todayEnd.toDate(),
      },
    });
    const todayWithdrawalCount = todayWithdrawals.length;
    if (todayWithdrawalCount >= withdrawCountLimit) {
      return res.status(200).json({
        success: false,
        message: {
          en: `Daily withdrawal limit reached. Your VIP level allows max ${withdrawCountLimit} withdrawals per day, you've already made ${todayWithdrawalCount} withdrawal(s) today.`,
          zh: `达到每日提款次数限制。您的VIP等级每日最多允许提款${withdrawCountLimit}次，您今日已提款${todayWithdrawalCount}次。`,
          ms: `Had pengeluaran harian dicapai. Tahap VIP anda membenarkan maksimum ${withdrawCountLimit} pengeluaran sehari, anda telah membuat ${todayWithdrawalCount} pengeluaran hari ini.`,
        },
      });
    }

    if (dailyBankWithdrawLimit > 0) {
      const todayTotalWithdrawn = todayWithdrawals.reduce(
        (sum, withdrawal) => sum + (parseFloat(withdrawal.amount) || 0),
        0
      );

      if (todayTotalWithdrawn + withdrawAmount > dailyBankWithdrawLimit) {
        const remaining = dailyBankWithdrawLimit - todayTotalWithdrawn;
        return res.status(200).json({
          success: false,
          message: {
            en: `Daily withdrawal amount limit exceeded. Your VIP level allows max RM${dailyBankWithdrawLimit.toFixed(
              2
            )} per day. You've withdrawn RM${todayTotalWithdrawn.toFixed(
              2
            )} today, remaining: RM${remaining.toFixed(2)}`,
            zh: `超过每日提款金额限制。您的VIP等级每日最多允许提款RM${dailyBankWithdrawLimit.toFixed(
              2
            )}。您今日已提款RM${todayTotalWithdrawn.toFixed(
              2
            )}，剩余: RM${remaining.toFixed(2)}`,
            ms: `Had jumlah pengeluaran harian melebihi. Tahap VIP anda membenarkan maksimum RM${dailyBankWithdrawLimit.toFixed(
              2
            )} sehari. Anda telah mengeluarkan RM${todayTotalWithdrawn.toFixed(
              2
            )} hari ini, baki: RM${remaining.toFixed(2)}`,
          },
        });
      }
    }

    const userBank = user.bankAccounts.find(
      (bank) => bank._id.toString() === userbankid
    );
    if (!userBank) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Bank account not found",
          zh: "找不到银行账户",
          ms: "Akaun bank tidak dijumpai",
        },
      });
    }
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $inc: { wallet: -withdrawAmount } },
      { new: true }
    );
    let lastDepositName = null;
    try {
      const lastApprovedDeposit = await Deposit.findOne({
        username: user.username,
        status: "approved",
      }).sort({ createdAt: -1 });

      if (lastApprovedDeposit && lastApprovedDeposit.depositname) {
        lastDepositName = lastApprovedDeposit.depositname;
      }
    } catch (error) {
      console.error("Error checking last deposit name:", error);
    }
    const transactionId = uuidv4();

    const [GW99Result, AlipayResult, LionKingResult] = await Promise.all([
      checkGW99Balance(user.username).catch((error) => ({
        success: false,
        error: error.message || "Connection failed",
        balance: 0,
      })),
      checkAlipayBalance(user.username).catch((error) => ({
        success: false,
        error: error.message || "Connection failed",
        balance: 0,
      })),
      checkLionKingBalance(user.username).catch((error) => ({
        success: false,
        error: error.message || "Connection failed",
        balance: 0,
      })),
    ]);

    const balanceFetchErrors = {};

    let totalGameBalance = 0;

    if (GW99Result.success && GW99Result.balance != null) {
      totalGameBalance += Number(GW99Result.balance) || 0;
    } else {
      console.error("GW99 balance check error:", GW99Result);
      balanceFetchErrors.gw99 = {
        error: GW99Result.error || "Failed to fetch balance",
        // timestamp: new Date().toISOString(),
      };
    }

    if (AlipayResult.success && AlipayResult.balance != null) {
      totalGameBalance += Number(AlipayResult.balance) || 0;
    } else {
      console.error("Alipay balance check error:", AlipayResult);
      balanceFetchErrors.alipay = {
        error: AlipayResult.error || "Failed to fetch balance",
        // timestamp: new Date().toISOString(),
      };
    }

    if (LionKingResult.success && LionKingResult.balance != null) {
      totalGameBalance += Number(LionKingResult.balance) || 0;
    } else {
      console.error("LionKing balance check error:", LionKingResult);
      balanceFetchErrors.lionking = {
        error: LionKingResult.error || "Failed to fetch balance",
        // timestamp: new Date().toISOString(),
      };
    }

    const totalWalletAmount = Number(user.wallet || 0) + totalGameBalance;

    const newWithdrawal = new Withdraw({
      transactionId: transactionId,
      userId,
      username: user.username,
      fullname: user.fullname,
      amount: withdrawAmount,
      walletamount: totalWalletAmount,
      bankname: userBank.bankname,
      ownername: userBank.name,
      transfernumber: userBank.banknumber,
      bankid: userBank._id,
      transactionType: "withdraw",
      method: "manual",
      processBy: "admin",
      status: "pending",
      remark: "-",
      duplicateIP: user.duplicateIP,
      depositname: lastDepositName,
    });
    const savedWithdrawal = await newWithdrawal.save();
    const walletLog = new UserWalletLog({
      userId: userId,
      transactionid: newWithdrawal.transactionId,
      transactiontime: new Date(),
      transactiontype: "withdraw",
      amount: withdrawAmount,
      status: "pending",
    });
    await walletLog.save();
    res.status(200).json({
      success: true,
      message: {
        en: "Withdrawal submitted successfully",
        zh: "提现申请提交成功",
        ms: "Pengeluaran berjaya dihantar",
      },
      withdrawal: savedWithdrawal,
    });
  } catch (error) {
    console.error("Error during submit withdraw:", error);
    res.status(500).json({
      success: false,
      message: {
        en: "Failed to submit withdrawal",
        zh: "提现申请提交失败",
        ms: "Gagal menghantar pengeluaran",
      },
    });
  }
});

// Admin Submit Withdraw
router.post("/admin/api/withdraw", authenticateAdminToken, async (req, res) => {
  try {
    const adminId = req.user.userId;
    const adminuser = await adminUser.findById(adminId);
    if (!adminuser) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Admin User not found, please contact customer service",
          zh: "找不到管理员用户，请联系客服",
        },
      });
    }
    const { userid, username, bankid, amount } = req.body;
    if (!userid || !username || !bankid || !amount) {
      return res.status(200).json({
        success: false,
        message: {
          en: "All fields are required",
          zh: "所有字段都是必填的",
        },
      });
    }
    if (!amount || amount <= 0) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Please enter a valid withdraw amount",
          zh: "请输入有效的提现金额",
        },
      });
    }
    const generalSettings = await general.findOne();
    const minWithdraw = generalSettings?.minWithdraw || 50;
    const maxWithdraw = generalSettings?.maxWithdraw || 0;

    if (parseFloat(amount) < minWithdraw) {
      return res.status(200).json({
        success: false,
        message: {
          en: `Minimum withdrawal amount is ${minWithdraw}`,
          zh: `最低提款金额为 ${minWithdraw}`,
        },
      });
    }

    if (maxWithdraw > 0 && parseFloat(amount) > maxWithdraw) {
      return res.status(200).json({
        success: false,
        message: {
          en: `Maximum withdrawal amount is ${maxWithdraw}`,
          zh: `最高提款金额为 ${maxWithdraw}`,
        },
      });
    }

    const user = await User.findById(userid);
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found",
          zh: "找不到用户",
        },
      });
    }
    if (user.withdrawlock) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User withdrawals are currently locked",
          zh: "用户的提现功能已被锁定",
        },
      });
    }
    if (amount > user.wallet) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Withdraw amount exceeds wallet balance",
          zh: "提现金额超过钱包余额",
        },
      });
    }
    const existingPendingWithdrawal = await Withdraw.findOne({
      userId: userid,
      status: "pending",
    });

    if (existingPendingWithdrawal) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User already has a pending withdrawal request",
          zh: "用户已有一笔待处理的提现申请",
        },
      });
    }
    const userBank = user.bankAccounts.find(
      (bank) => bank._id.toString() === bankid
    );
    if (!userBank) {
      return res.status(200).json({
        success: false,
        message: {
          en: "Bank account not found for this user",
          zh: "找不到该用户的银行账户",
        },
      });
    }
    const transactionId = uuidv4();

    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $inc: { wallet: -amount } },
      { new: true }
    );

    let lastDepositName = null;
    try {
      const lastApprovedDeposit = await Deposit.findOne({
        username: user.username,
        status: "approved",
      }).sort({ createdAt: -1 });

      if (lastApprovedDeposit && lastApprovedDeposit.depositname) {
        lastDepositName = lastApprovedDeposit.depositname;
      }
    } catch (error) {
      console.error("Error checking last deposit name:", error);
    }

    const [GW99Result, AlipayResult, LionKingResult] = await Promise.all([
      checkGW99Balance(user.username).catch((error) => ({
        success: false,
        error: error.message || "Connection failed",
        balance: 0,
      })),
      checkAlipayBalance(user.username).catch((error) => ({
        success: false,
        error: error.message || "Connection failed",
        balance: 0,
      })),
      checkLionKingBalance(user.username).catch((error) => ({
        success: false,
        error: error.message || "Connection failed",
        balance: 0,
      })),
    ]);

    const balanceFetchErrors = {};

    let totalGameBalance = 0;

    if (GW99Result.success && GW99Result.balance != null) {
      totalGameBalance += Number(GW99Result.balance) || 0;
    } else {
      console.error("GW99 balance check error:", GW99Result);
      balanceFetchErrors.gw99 = {
        error: GW99Result.error || "Failed to fetch balance",
        // timestamp: new Date().toISOString(),
      };
    }

    if (AlipayResult.success && AlipayResult.balance != null) {
      totalGameBalance += Number(AlipayResult.balance) || 0;
    } else {
      console.error("Alipay balance check error:", AlipayResult);
      balanceFetchErrors.alipay = {
        error: AlipayResult.error || "Failed to fetch balance",
        // timestamp: new Date().toISOString(),
      };
    }

    if (LionKingResult.success && LionKingResult.balance != null) {
      totalGameBalance += Number(LionKingResult.balance) || 0;
    } else {
      console.error("LionKing balance check error:", LionKingResult);
      balanceFetchErrors.lionking = {
        error: LionKingResult.error || "Failed to fetch balance",
        // timestamp: new Date().toISOString(),
      };
    }

    const totalWalletAmount = Number(user.wallet || 0) + totalGameBalance;

    const newWithdrawal = new Withdraw({
      transactionId: transactionId,
      userId: userid,
      username: user.username,
      fullname: user.fullname,
      amount: amount,
      walletamount: totalWalletAmount,
      bankname: userBank.bankname,
      ownername: userBank.name,
      transfernumber: userBank.banknumber,
      bankid: userBank._id,
      transactionType: "withdraw",
      method: "manual",
      processBy: "admin",
      status: "pending",
      remark: "CS",
      duplicateIP: user.duplicateIP,
      depositname: lastDepositName,
    });
    const savedWithdrawal = await newWithdrawal.save();

    const walletLog = new UserWalletLog({
      userId: userid,
      transactionid: newWithdrawal.transactionId,
      transactiontime: new Date(),
      transactiontype: "withdraw",
      amount: amount,
      status: "pending",
    });
    await walletLog.save();

    res.status(200).json({
      success: true,
      message: {
        en: "Withdrawal submitted successfully",
        zh: "提款提交成功",
      },
      data: savedWithdrawal,
    });
  } catch (error) {
    console.error("Error during withdraw:", error);
    res.status(200).json({
      success: false,
      message: {
        en: "Error processing withdrawal",
        zh: "处理提款时出错",
      },
      error: error.toString(),
    });
  }
});

// Admin Get User Withdraw Logs
router.get(
  "/admin/api/user/:userId/withdraw",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const { startDate, endDate } = req.query;

      const dateFilter = {
        username: user.username,
      };
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: moment(new Date(startDate)).utc().toDate(),
          $lte: moment(new Date(endDate)).utc().toDate(),
        };
      }

      const withdrawals = await Withdraw.find(dateFilter)
        .sort({ createdAt: -1 })
        .lean();

      res.status(200).json({
        success: true,
        message: "Withdrawals retrieved successfully",
        data: withdrawals,
      });
    } catch (error) {
      console.error("Error retrieving user withdrawals:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve withdrawals",
        error: error.message,
      });
    }
  }
);

// 只是獲取APPROVED OR REJECTED的提款數據而已
router.get("/api/filterwithdraw", async (req, res) => {
  try {
    const withdraws = await Withdraw.find({
      $and: [
        { $or: [{ status: "APPROVED" }, { status: "REJECTED" }] },
        { transactionType: { $ne: "TRANSACTION FEES" } },
      ],
    });
    res.status(200).json({
      authorized: true,
      message: "Withdraw fetched successfully",
      data: withdraws,
    });
  } catch (error) {
    console.error("Error fetching withdraw", error);
    res
      .status(200)
      .json({ message: "Error fetching withdraw", error: error.toString() });
  }
});

// 检查用户是否有PENDING提款
router.get("/api/checkPendingWithdrawal/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(200).json({ message: "用户不存在。" });
    }

    const pendingWithdrawal = await Withdraw.find({
      userid: userId,
      status: "pending",
    });

    const hasPendingWithdrawal = pendingWithdrawal.length > 0;

    res.status(200).json({
      authorized: true,
      message: "未决提款检查完成。",
      hasPendingWithdrawal: hasPendingWithdrawal,
    });
  } catch (error) {
    console.error("检查未决提款时发生错误：", error);
    res.status(200).json({
      message: "检查未决提款时发生内部服务器错误。",
      error: error.toString(),
    });
  }
});

router.get("/api/withdrawlogs", async (req, res) => {
  try {
    const withdraws = await Withdraw.find({ status: "approved" })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("amount username");
    const processedWithdraws = withdraws.map((withdraw) => {
      let username = withdraw.username;
      if (username.startsWith("6")) {
        username = username.substring(1);
      }
      if (username.length > 6) {
        username =
          username.substring(0, 3) +
          "****" +
          username.substring(username.length - 3);
      }
      return {
        amount: withdraw.amount,
        username: username,
      };
    });
    res.status(200).json({
      success: true,
      message: "Withdraws fetched successfully",
      data: processedWithdraws,
    });
  } catch (error) {
    console.error("Error fetching Withdraws", error);
    res.status(500).json({
      success: false,
      message: "Error fetching Withdraws",
    });
  }
});

// Admin Reset Turnover
router.post(
  "/admin/api/user/:userId/clear-turnover",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: {
            en: "User not found",
            zh: "找不到用户",
          },
        });
      }
      user.turnoverResetAt = new Date();
      await user.save();
      res.status(200).json({
        success: true,
        message: {
          en: "Turnover requirements cleared successfully",
          zh: "流水要求清零成功",
        },
        resetAt: user.turnoverResetAt,
      });
    } catch (error) {
      console.error("Error clearing turnover:", error);
      res.status(500).json({
        success: false,
        message: {
          en: "Failed to clear turnover requirements",
          zh: "清零流水要求失败",
        },
      });
    }
  }
);

// Check Game Restrictions Based on Bonus
router.get(
  "/api/user/game-restrictions",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(200).json({
          success: false,
          message: {
            en: "User not found, please contact customer service",
            zh: "找不到用户，请联系客服",
            ms: "Pengguna tidak dijumpai, sila hubungi khidmat pelanggan",
          },
        });
      }
      const latestWithdraw = await Withdraw.findOne({
        userId,
        status: "approved",
      }).sort({ createdAt: -1 });
      let effectiveResetDate = null;
      if (latestWithdraw && user.turnoverResetAt) {
        effectiveResetDate =
          latestWithdraw.createdAt > user.turnoverResetAt
            ? latestWithdraw.createdAt
            : user.turnoverResetAt;
      } else if (latestWithdraw) {
        effectiveResetDate = latestWithdraw.createdAt;
      } else if (user.turnoverResetAt) {
        effectiveResetDate = user.turnoverResetAt;
      }
      const depositsAfterWithdraw = await Deposit.find({
        userId,
        status: "approved",
        ...(effectiveResetDate && { createdAt: { $gt: effectiveResetDate } }),
      }).sort({ createdAt: 1 });
      const bonusesAfterWithdraw = await Bonus.find({
        userId,
        status: "approved",
        ...(effectiveResetDate && { createdAt: { $gt: effectiveResetDate } }),
      }).sort({ createdAt: 1 });
      const allTransactions = [
        ...depositsAfterWithdraw.map((d) => ({
          type: "deposit",
          data: d,
          date: d.createdAt,
          isNewCycle: d.isNewCycle || false,
        })),
        ...bonusesAfterWithdraw.map((b) => ({
          type: "bonus",
          data: b,
          date: b.createdAt,
          isNewCycle: b.isNewCycle || false,
        })),
      ].sort((a, b) => a.date - b.date);
      if (allTransactions.length === 0) {
        return res.status(200).json({
          success: true,
          hasRestrictions: false,
          allowedGames: [],
          message: {
            en: "No game restrictions",
            zh: "没有游戏限制",
            ms: "Tiada sekatan permainan",
          },
        });
      }
      let startIndex = 0;
      for (let i = allTransactions.length - 1; i >= 0; i--) {
        if (allTransactions[i].isNewCycle === true) {
          startIndex = i;
          break;
        }
      }
      const validTransactions = allTransactions.slice(startIndex);
      let restrictedGames = [];
      let hasRestrictions = false;
      for (const tx of validTransactions) {
        if (tx.type === "bonus") {
          const bonus = tx.data;
          const promotionData = await promotion.findById(bonus.promotionId);
          if (
            promotionData &&
            promotionData.allowedGameDatabaseNames &&
            promotionData.allowedGameDatabaseNames.length > 0
          ) {
            hasRestrictions = true;
            if (restrictedGames.length === 0) {
              restrictedGames = [...promotionData.allowedGameDatabaseNames];
            } else {
              restrictedGames = restrictedGames.filter((game) =>
                promotionData.allowedGameDatabaseNames.includes(game)
              );
            }
          }
        }
      }
      return res.status(200).json({
        success: true,
        hasRestrictions: hasRestrictions,
        allowedGames: restrictedGames,
        message: hasRestrictions
          ? {
              en: "You have game restrictions active. Only selected games are available",
              zh: "您有游戏限制。只能玩选定的游戏",
              ms: "Anda mempunyai sekatan permainan aktif. Hanya permainan terpilih tersedia",
            }
          : {
              en: "No game restrictions",
              zh: "没有游戏限制",
              ms: "Tiada sekatan permainan",
            },
      });
    } catch (error) {
      console.error("Error checking game restrictions:", error);
      return res.status(500).json({
        success: false,
        message: {
          en: "Failed to check game restrictions. Please try again later",
          zh: "检查游戏限制失败，请稍后再试",
          ms: "Gagal menyemak sekatan permainan. Sila cuba lagi kemudian",
        },
        error: error.message,
      });
    }
  }
);

module.exports = router;
