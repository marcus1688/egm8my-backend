const express = require("express");
const dotenv = require("dotenv");
dotenv.config();
if (process.env.PAUSE_SERVICE === "true") {
  console.log("Service is paused");
  process.exit(0);
}
const mongoose = require("mongoose");
const http = require("http");
const crypto = require("crypto");
const { Server } = require("socket.io");
const WebSocket = require("ws");
const {
  clearCookie,
  authenticateToken,
  generateToken: userGenerateToken,
} = require("./auth/auth");

const {
  authenticateAdminToken,
  generateToken: adminGenerateToken,
} = require("./auth/adminAuth");

const usersRouter = require("./routes/users");
const depositRouter = require("./routes/deposit");
const adminUserRouter = require("./routes/adminuser");
const myPromotionRouter = require("./routes/mypromotion");
const withdrawRouter = require("./routes/withdraw");
const banklistRouter = require("./routes/banklist");
const userbanklistRouter = require("./routes/userbanklist");
const carouselRouter = require("./routes/carousel");
const BankTransactionLogRouter = require("./routes/banktransactionlog");
const UserWalletLogRouter = require("./routes/userwalletlog");
const promotionRouter = require("./routes/promotion");
const vipRouter = require("./routes/vip");
const popUpRouter = require("./routes/popup");
const BonusRouter = require("./routes/bonus");
const LuckySpinRouter = require("./routes/luckyspin");
const InformationRouter = require("./routes/information");
const ReviewRouter = require("./routes/review");
const LeaderboardRouter = require("./routes/leaderboard");
const BlogRouter = require("./routes/blog");
const MailRouter = require("./routes/mail");
const AnnouncementRouter = require("./routes/announcement");
const AnnouncementCategoryRouter = require("./routes/announcementcategory");
const HelpRouter = require("./routes/help");
const FeedbackRouter = require("./routes/feedback");
const PromoCodeRouter = require("./routes/promocode");
const MemoRouter = require("./routes/memo");
const GeneralRouter = require("./routes/general");
const KioskCategoryRouter = require("./routes/kioskcategory");
const Kiosk = require("./routes/kiosk");
const PromotionCategoryRouter = require("./routes/promotioncategory");
const RebateScheduleRouter = require("./routes/rebateschedule");
const AgentRouter = require("./routes/agent");
const AgentLevelSystemRouter = require("./routes/agentlevelsystem");
const CheckInRouter = require("./routes/checkin");
const smsRouter = require("./routes/sms");
const emailRouter = require("./routes/email");
const LuckySpinSettingRouter = require("./routes/luckyspinsetting");
const SEORouter = require("./routes/seo");
const PaymentGatewayRouter = require("./routes/paymentgateway");
const WhitelistIPRouter = require("./routes/whitelistip");
const KioskBalanceRouter = require("./routes/kioskbalance");
const CryptoRouter = require("./routes/cryptowallet");
const SportsRouter = require("./routes/sports");
const AgentPTRouter = require("./routes/agentpt");
const WeeklyTurnoverRouter = require("./routes/weeklyturnover");
const LuckyDrawRouter = require("./routes/luckydraw");

const adminListRouter = require("./routes/adminlist");
const notificationRouter = require("./routes/notification");
const paymentgatewayRouter = require("./routes/payloh");
const allImportGameListRouter = require("./routes/GAMEAPI/0_ImportGameList");

const slotPlaytechRouter = require("./routes/GAMEAPI/slotPLAYTECH");
const slotHabaneroRouter = require("./routes/GAMEAPI/slothabanero");
const slotJiliRouter = require("./routes/GAMEAPI/slotjili");
const slotKiss918H5Router = require("./routes/GAMEAPI/slotkissh5");
const slotLive22Router = require("./routes/GAMEAPI/slotlive22ne");
const slotCQ9Router = require("./routes/GAMEAPI/slotcq9");
const slotLionKingRouter = require("./routes/GAMEAPI/slotlionking");
const slotLFC888Router = require("./routes/GAMEAPI/slotlfc888");
const slotNextSpinRouter = require("./routes/GAMEAPI/slotnextspin");
const slotUUSlotRouter = require("./routes/GAMEAPI/slotuuslots");
const slotJokerRouter = require("./routes/GAMEAPI/slot_joker");
const slotMegaH5Router = require("./routes/GAMEAPI/slotmega888h5");
const slotGw99Router = require("./routes/GAMEAPI/slot_99gw");
const slotSpadeGamingRouter = require("./routes/GAMEAPI/slotspadegaming");
const slotFachaiRouter = require("./routes/GAMEAPI/slotfachai");
const slotHacksawRouter = require("./routes/GAMEAPI/slothacksaw.js");
const slotLiveMicroGamingRouter = require("./routes/GAMEAPI/slot_livemicrogaming.js");

const liveCT855Router = require("./routes/GAMEAPI/liveCT855");
const liveCT855SeamlessRouter = require("./routes/GAMEAPI/liveCT855Seamless");
const liveSaGamingRouter = require("./routes/GAMEAPI/liveSaGaming.js");

const slotLivePPRouter = require("./routes/GAMEAPI/slot_livepp");
const slotLiveAGRouter = require("./routes/GAMEAPI/slot_liveasiagaming");

const sportCMD368Router = require("./routes/GAMEAPI/sportcmd.js");
// const sportSabaRouter = require("./routes/GAMEAPI/sportsaba.js");

const allGSIRouter = require("./routes/GAMEAPI/allGSI");

const GameFunctionRouter = require("./routes/GAMEAPI/0_GameFunction");
const GameTotalTurnoverRouter = require("./routes/GAMEAPI/0_GameTotalTurnover");
const OC7GameRouter = require("./routes/GAMEAPI/0_OC7Function");
const GameStatusRouter = require("./routes/GAMEAPI/0_GameStatus");

const { fetchAcceptedBetsCron } = require("./routes/GAMEAPI/lotteryAlipay");
const { startGW99Cron } = require("./routes/GAMEAPI/slot_99gw.js");
const { startLionKingCron } = require("./routes/GAMEAPI/slotlionking.js");

const lotteryAlipayRouter = require("./routes/GAMEAPI/lotteryAlipay");

const dgPayRouter = require("./routes/PaymentGateway/dgpay");
const truePayRouter = require("./routes/PaymentGateway/truepay");
const luxePayRouter = require("./routes/PaymentGateway/luxepay");
const skl99Router = require("./routes/PaymentGateway/skl99");

const cors = require("cors");
const cookieParser = require("cookie-parser");
const cookie = require("cookie");
const Deposits = require("./models/deposit.model");
const Withdraw = require("./models/withdraw.model");
const { User } = require("./models/users.model");
const { adminUser, adminLog } = require("./models/adminuser.model");
const { Mail } = require("./models/mail.model");
const paylohModal = require("./models/payloh.model");
const email = require("./models/email.model");
const { updateKioskBalance } = require("./services/kioskBalanceService");
const kioskbalance = require("./models/kioskbalance.model");
const UserWalletLog = require("./models/userwalletlog.model");
const BankList = require("./models/banklist.model");
const BankTransactionLog = require("./models/banktransactionlog.model");
const { myrusdtModel } = require("./models/myrusdt.model");
const { v4: uuidv4 } = require("uuid");
const jwt = require("jsonwebtoken");
const Bonus = require("./models/bonus.model");
const app = express();
const cron = require("node-cron");
const moment = require("moment");
const ipRangeCheck = require("ip-range-check");
const server = http.createServer(app);
const axios = require("axios");
const wss = new WebSocket.Server({ noServer: true });
const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
let connectedUsers = [];
let connectedAdmins = [];
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");

const allowedOrigins = [
  "https://mysteryclub88.com",
  "https://www.mysteryclub88.com",
  "https://www.egm8my.vip",
  "https://www.egm8sg.vip",
  "https://www.egm8my.com",
  "https://egm8my-frontend.vercel.app",
  "https://egm8sg-frontend.vercel.app",
  "capacitor://localhost",
  "ionic://localhost",
  "file://",
  ...(process.env.NODE_ENV === "development"
    ? ["http://localhost:3000", "http://localhost:3005"]
    : []),
];

app.use((req, res, next) => {
  if (process.env.PAUSE_SERVICE === "true") {
    return res.status(503).json({
      success: false,
      message: "Service is temporarily paused",
    });
  }
  next();
});

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader("Server", "nginx");
  next();
});
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(liveCT855SeamlessRouter);

// Apply express.json() only to non-CT855 routes
app.use((req, res, next) => {
  // Skip body parsing for CT855 routes - they handle it manually
  if (req.originalUrl && req.originalUrl.includes("/api/ct855/")) {
    console.log(
      `🎯 CT855 Request: ${req.method} ${req.originalUrl} - Skipping body parser`
    );
    return next();
  }

  // Apply express.json() to all other routes
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      try {
        JSON.parse(buf);
      } catch (e) {
        const error = new Error("Invalid JSON");
        error.status = 400;
        throw error;
      }
    },
  })(req, res, next);
});

// app.use(
//   express.json({
//     limit: "10mb",
//     verify: (req, res, buf) => {
//       try {
//         JSON.parse(buf);
//       } catch (e) {
//         const error = new Error("Invalid JSON");
//         error.status = 400;
//         throw error;
//       }
//     },
//   })
// );

// app.use(liveCT855SeamlessRouter);

app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use((req, res, next) => {
  if (
    req.path.includes("/admin/api/seo-pages") &&
    (req.method === "POST" || req.method === "PUT")
  ) {
    return next();
  }
  const xssClean = require("xss-clean");
  return xssClean()(req, res, next);
});

const path = require("path");
require("./services/maintenanceScheduler");

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }
      if (origin.includes("vercel.app")) {
        return callback(null, true);
      }
      if (origin === "https://localhost" || origin === "http://localhost") {
        return callback(null, true);
      }
      if (process.env.NODE_ENV === "development") {
        return callback(null, true);
      }
      console.log(`CORS blocked request from origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minutes
  max: 10000, // 10000 Request / IP
  message: "Too many requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
  skip: (req, res) => req.path === "/health",
  handler: (req, res, next, options) => {
    const clientIp = req.headers["x-forwarded-for"] || req.ip;
    const clientIpTrimmed = clientIp.split(",")[0].trim();
    const origin = req.headers.origin || "Unknown";

    console.log(
      `Global Rate Limit Exceeded - IP: ${clientIpTrimmed}, Origin: ${origin}, Path: ${
        req.path
      }, Time: ${new Date().toISOString()}`
    );
    res.status(options.statusCode).send(options.message);
  },
});

app.use(globalLimiter);

// --- SOCKET IO START ---
async function adminLogAttempt(username, fullname, clientIp, remark) {
  await adminLog.create({
    username,
    fullname,
    loginTime: new Date(),
    ip: clientIp,
    remark,
  });
}

async function updateAdminStatus(userId, status) {
  await adminUser.findByIdAndUpdate(userId, { onlineStatus: status });
}

const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }
      if (origin.includes("vercel.app")) {
        return callback(null, true);
      }
      if (origin === "https://localhost" || origin === "http://localhost") {
        return callback(null, true);
      }
      if (process.env.NODE_ENV === "development") {
        return callback(null, true);
      }
      console.log(`Socket.IO CORS blocked request from origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  },
});

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  const refreshToken = socket.handshake.auth.refreshToken;
  const isAdmin = socket.handshake.auth.isAdmin;
  let clientIp =
    socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;
  clientIp = clientIp.split(",")[0].trim();
  socket.clientIp = clientIp;
  if (token) {
    try {
      const secret = isAdmin
        ? process.env.JWT_ADMIN_SECRET
        : process.env.JWT_SECRET;
      const decoded = jwt.verify(token, secret);
      socket.userId = decoded.userId;
      next();
    } catch (error) {
      if (error.name === "TokenExpiredError" && refreshToken) {
        try {
          const refreshSecret = isAdmin
            ? process.env.ADMIN_REFRESH_TOKEN_SECRET
            : process.env.REFRESH_TOKEN_SECRET;
          const decoded = jwt.verify(refreshToken, refreshSecret);
          const user = isAdmin
            ? await adminUser.findById(decoded.userId)
            : await User.findById(decoded.userId);
          if (!user) {
            return next(new Error("User not found"));
          }
          const newToken = isAdmin
            ? await adminGenerateToken(user._id)
            : await userGenerateToken(user._id);
          socket.emit("token:refresh", { token: newToken });
          socket.userId = user._id;
          next();
        } catch (refreshError) {
          next(new Error("Authentication error"));
        }
      } else {
        next(new Error("Authentication error"));
      }
    }
  } else {
    next(new Error("Authentication error"));
  }
});

io.on("connection", async (socket) => {
  socket.isAlive = true;

  socket.on("setUserId", async (data) => {
    try {
      socket.userId = data.userId;
      socket.deviceId = data.deviceId;
      const user = await User.findById(socket.userId);
      if (user) {
        user.lastLogin = Date.now();
        user.lastLoginIp = socket.clientIp;
        await user.save();
      }
      const oldConnections = connectedUsers.filter(
        (user) => user.userId === socket.userId && user.socket !== socket
      );
      oldConnections.forEach((connection) => {
        if (connection.deviceId !== socket.deviceId) {
          connection.socket.emit("duplicateLogin", {
            fromDifferentDevice: true,
          });
          connection.socket.disconnect();
        }
      });
      connectedUsers = connectedUsers.filter(
        (user) => !oldConnections.includes(user)
      );
      const existingUserIndex = connectedUsers.findIndex(
        (user) => user.userId === socket.userId
      );
      if (existingUserIndex !== -1) {
        connectedUsers[existingUserIndex] = {
          userId: socket.userId,
          deviceId: socket.deviceId,
          socket,
        };
      } else {
        connectedUsers.push({
          userId: socket.userId,
          deviceId: socket.deviceId,
          socket,
        });
      }
    } catch (error) {
      console.error("Error in setUserId:", error);
    }
  });

  socket.on("setAdminId", async (data) => {
    try {
      socket.adminId = data.adminId;
      await updateAdminStatus(socket.adminId, true);
      const existingAdminIndex = connectedAdmins.findIndex(
        (admin) => admin.adminId === socket.adminId
      );
      if (existingAdminIndex !== -1) {
        connectedAdmins[existingAdminIndex] = {
          adminId: socket.adminId,
          socket,
        };
      } else {
        connectedAdmins.push({
          adminId: socket.adminId,
          socket,
        });
      }
    } catch (error) {
      console.error("Error in setAdminId:", error);
    }
  });

  socket.on("getUsername", async () => {
    try {
      const userPromises = connectedUsers.map(async (connectedUser) => {
        const user = await User.findById(connectedUser.userId);
        if (user) {
          return {
            userId: user._id,
            username: user.username,
            wallet: user.wallet,
            vip: user.viplevel,
            lastlogin: user.lastLogin,
          };
        }
        return null;
      });
      const onlineUsers = await Promise.all(userPromises);
      const validOnlineUsers = onlineUsers.filter((user) => user !== null);
      socket.emit("usernameResponse", { onlineUsers: validOnlineUsers });
    } catch (error) {
      console.error("Error in getUsername:", error);
      socket.emit("error", { message: "Error fetching online users data" });
    }
  });

  socket.on("requestLatestData", async () => {
    await Promise.all([
      sendLatestDeposits(socket),
      sendLatestWithdraws(socket),
      sendLatestBonusUpdates(socket),
    ]);
  });

  socket.on("disconnect", () => {
    if (socket.adminId) {
      updateAdminStatus(socket.adminId, false);
      connectedAdmins = connectedAdmins.filter(
        (admin) => admin.socket !== socket
      );
    }
    if (socket.userId) {
      connectedUsers = connectedUsers.filter((user) => user.socket !== socket);
    }
  });
});

async function sendLatestDeposits(socket) {
  try {
    const deposits = await Deposits.find({ status: "pending" });
    socket.emit("latest deposits", deposits);
  } catch (error) {
    console.error("Error fetching latest deposits:", error);
  }
}

async function sendLatestWithdraws(socket) {
  try {
    const withdraws = await Withdraw.find({ status: "pending" });
    socket.emit("latest withdraws", withdraws);
  } catch (error) {
    console.error("Error fetching latest withdraws:", error);
  }
}

async function sendLatestBonusUpdates(socket) {
  try {
    const bonuses = await Bonus.find({ status: "pending" });
    socket.emit("latest bonuses", bonuses);
  } catch (error) {
    console.error("Error fetching latest bonuses:", error);
  }
}

function forceLogout(userId) {
  const userConnection = connectedUsers.find((user) => user.userId === userId);
  if (userConnection) {
    try {
      userConnection.socket.emit("forceLogout");
      userConnection.socket.disconnect();
      connectedUsers = connectedUsers.filter((user) => user.userId !== userId);
    } catch (error) {
      console.error(`Error during force logout for user ${userId}:`, error);
    }
  }
}

function forceLogoutAdmin(adminId) {
  const adminConnection = connectedAdmins.find(
    (admin) => admin.adminId === adminId
  );
  if (adminConnection) {
    try {
      adminConnection.socket.emit("forceLogoutAdmin");
      adminConnection.socket.disconnect();
      connectedAdmins = connectedAdmins.filter(
        (admin) => admin.adminId !== adminId
      );
      updateAdminStatus(adminId, false);
      return true;
    } catch (error) {
      console.error(`Error during force logout for admin ${adminId}:`, error);
      return false;
    }
  } else {
    console.log(`Admin ${adminId} not found in connected admins list`);
    return false;
  }
}

app.post(
  "/admin/api/force-logout-by-admin",
  authenticateAdminToken,
  async (req, res) => {
    const admin = await adminUser.findById(req.user.userId);
    let clientIp = req.headers["x-forwarded-for"] || req.ip;
    clientIp = clientIp.split(",")[0].trim();

    const { userId } = req.body;
    const user = await User.findById(userId);

    forceLogout(userId);

    await adminLogAttempt(
      admin.username,
      admin.fullname,
      clientIp,
      `User: ${user.username} has been force logout. Performed by ${admin.username}`
    );

    res.json({ message: "User forced to logout" });
  }
);

app.post(
  "/admin/api/force-logout-admin",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const admin = await adminUser.findById(req.user.userId);
      let clientIp = req.headers["x-forwarded-for"] || req.ip;
      clientIp = clientIp.split(",")[0].trim();
      const { adminId } = req.body;
      if (!adminId) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin ID is required",
            zh: "管理员ID是必需的",
          },
        });
      }
      const targetAdmin = await adminUser.findById(adminId);
      if (!targetAdmin) {
        return res.status(200).json({
          success: false,
          message: {
            en: "Admin not found",
            zh: "未找到管理员",
          },
        });
      }
      const result = forceLogoutAdmin(adminId);

      if (admin.role !== "superadmin") {
        await adminLogAttempt(
          admin.username,
          admin.fullname,
          clientIp,
          `Admin: ${targetAdmin.username} has been force logout. Performed by ${admin.username}`
        );
      }

      if (result) {
        res.status(200).json({
          success: true,
          message: {
            en: "Admin forced to logout successfully",
            zh: "管理员已被成功强制登出",
          },
        });
      } else {
        res.status(200).json({
          success: true,
          message: {
            en: "Admin was not online or already logged out",
            zh: "管理员不在线或已经登出",
          },
        });
      }
    } catch (error) {
      console.error("Error forcing admin logout:", error);
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

app.post("/admin/api/mails", authenticateAdminToken, async (req, res) => {
  try {
    const {
      username,
      titleEN,
      titleCN,
      titleMS,
      contentEN,
      contentCN,
      contentMS,
    } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(200).json({
        success: false,
        message: {
          en: "User not found",
          zh: "找不到用户",
        },
      });
    }

    sendNotificationToUser(
      user._id,
      {
        en: "You have received a new mail",
        ms: "Anda telah menerima mel baru",
        zh: "您收到一条新邮件",
      },
      {
        en: "New Mail",
        ms: "Mel Baru",
        zh: "新邮件",
      }
    );

    const mail = new Mail({
      recipientId: user._id,
      username,
      titleEN,
      titleCN,
      titleMS,
      contentEN,
      contentCN,
      contentMS,
    });

    const savedMail = await mail.save();

    res.status(200).json({
      success: true,
      message: {
        en: "Mail sent successfully",
        zh: "邮件发送成功",
      },
      data: savedMail,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: {
        en: "Error sending mail",
        zh: "发送邮件时出错",
      },
    });
  }
});

app.get(
  "/admin/api/fallback-latest-transactions",
  authenticateAdminToken,
  async (req, res) => {
    try {
      const [deposits, withdraws, bonuses] = await Promise.all([
        Deposits.find({ status: "pending" }),
        Withdraw.find({ status: "pending" }),
        Bonus.find({ status: "pending" }),
      ]);
      return res.status(200).json({
        success: true,
        data: {
          deposits,
          withdraws,
          bonuses,
        },
      });
    } catch (error) {
      console.error("Fallback API error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// --- SOCKET IO END ---

function sendNotificationToUser(userId, message, title) {
  const userConnection = connectedUsers.find(
    (user) => user.userId.toString() === userId.toString()
  );

  if (userConnection && userConnection.socket.connected) {
    userConnection.socket.emit("notification", { message, title });
  }
}

app.post("/api/test-send-notification", async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({
        success: false,
        message: {
          en: "User ID and amount are required",
          zh: "用户ID和金额是必填项",
        },
      });
    }
    const message = {
      en: `Deposit of ${amount} USDT confirmed!`,
      zh: `存款 ${amount} USDT 已确认！`,
    };
    const title = {
      en: "Deposit confirmed!",
      zh: "存款确认！",
    };
    sendNotificationToUser(userId, message, title);
    return res.status(200).json({
      success: true,
      message: {
        en: "Notification sent to user",
        zh: "通知已发送给用户",
      },
    });
  } catch (error) {
    console.error("Error sending notification:", error);
    return res.status(500).json({
      success: false,
      message: {
        en: "Failed to send notification",
        zh: "发送通知失败",
      },
      error: error.message,
    });
  }
});

mongoose.connect(process.env.MONGODB_URI);

app.get("/", (req, res) => {
  res.status(403).send({
    error: "Access Forbidden",
    message: "You do not have permission to access this resource.",
  });
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.use(express.static("public"));
app.use(usersRouter);
app.use(depositRouter);
app.use(adminUserRouter);
app.use(withdrawRouter);
app.use(banklistRouter);
app.use(userbanklistRouter);
app.use(carouselRouter);
app.use(BankTransactionLogRouter);
app.use(promotionRouter);
app.use(vipRouter);
app.use(UserWalletLogRouter);
app.use(popUpRouter);
app.use(BonusRouter);
app.use(LuckySpinRouter);
app.use(InformationRouter);
app.use(ReviewRouter);
app.use(LeaderboardRouter);
app.use(BlogRouter);
app.use(MailRouter);
app.use(AnnouncementRouter);
app.use(AnnouncementCategoryRouter);
app.use(HelpRouter);
app.use(FeedbackRouter);
app.use(PromoCodeRouter);
app.use(MemoRouter);
app.use(GeneralRouter);
app.use(KioskCategoryRouter);
app.use(Kiosk);
app.use(PromotionCategoryRouter);
app.use(RebateScheduleRouter);
app.use(AgentRouter);
app.use(AgentLevelSystemRouter);
app.use(CheckInRouter);
app.use(smsRouter);
app.use(emailRouter);
app.use(LuckySpinSettingRouter);
app.use(SEORouter);
app.use(PaymentGatewayRouter);
app.use(WhitelistIPRouter);
app.use(KioskBalanceRouter);
app.use(CryptoRouter);
app.use(SportsRouter);
app.use(AgentPTRouter);
app.use(WeeklyTurnoverRouter);
app.use(LuckyDrawRouter);

app.use(adminListRouter);
app.use(notificationRouter);

app.use(myPromotionRouter);
app.use(paymentgatewayRouter);

app.use(allImportGameListRouter);

app.use(slotPlaytechRouter);
app.use(slotLive22Router);
app.use(slotHabaneroRouter);
app.use(slotJiliRouter);
app.use(slotKiss918H5Router);
app.use(slotCQ9Router);
app.use(slotLionKingRouter);
app.use(slotLFC888Router);
app.use(slotNextSpinRouter);
app.use(slotUUSlotRouter);
app.use(slotJokerRouter);
app.use(slotMegaH5Router);
app.use(slotGw99Router);
app.use(slotSpadeGamingRouter);
app.use(slotFachaiRouter);
app.use(slotHacksawRouter);
app.use(slotLiveMicroGamingRouter);

app.use(liveCT855Router);
app.use(liveSaGamingRouter);

app.use(slotLivePPRouter);
app.use(slotLiveAGRouter);

app.use(allGSIRouter);

app.use(lotteryAlipayRouter);

app.use(dgPayRouter);
app.use(truePayRouter);
app.use(luxePayRouter);
app.use(skl99Router);

app.use(GameFunctionRouter);
app.use(GameTotalTurnoverRouter);
app.use(OC7GameRouter);
app.use(GameStatusRouter);

app.use(sportCMD368Router);
// app.use(sportSabaRouter);

// cron.schedule(
//   "0 0 * * *", // runs at 00:00 (12 AM) every day
//   async () => {
//     try {
//       console.log("began process valid turnover storing");
//       const response = await axios.post(
//         `${process.env.BASE_URL}admin/api/getAllValidTurnoverForRebate`,
//         {
//           date: "yesterday",
//         }
//       );
//       if (response.data.success) {
//         console.log("Turnover data fetched successfully:", {
//           time: moment().format("YYYY-MM-DD HH:mm:ss"),
//         });
//       }
//     } catch (error) {
//       console.error("Error in getAllValidTurnoverForRebate:", error.message);
//     }
//   },
//   {
//     timezone: "Asia/Shanghai", // Set your desired timezone
//   }
// );

// cron.schedule(
//   "5 0 * * *",
//   async () => {
//     try {
//       console.log("began proces getallturnover forrebate");
//       const response = await axios.post(
//         `${process.env.BASE_URL}admin/api/getAllTurnoverForRebate`,
//         {
//           date: "yesterday",
//         }
//       );
//       if (response.data.success) {
//         console.log("Turnover data fetched successfully:", {
//           price: response.data.data,
//           time: moment().format("YYYY-MM-DD HH:mm:ss"),
//         });
//       }
//     } catch (error) {
//       console.error("Error in getallturnover:", error.message);
//     }
//   },
//   {
//     timezone: "Asia/Shanghai",
//   }
// );

// if (process.env.NODE_ENV !== "development") {
//   fetchAcceptedBetsCron();
//   startGW99Cron();
//   startLionKingCron();
//   console.log("🎲 Lottery cron enabled via environment variable");
// }

// const modelsToUpdate = [
//   "SportWBETModal",
//   "SportWBETRecordModal",
//   "SportsWsSportModal",
// ];

// const newExpireAfterSeconds = 432000;

// // Route to update all schemas
// const updateExpirationIndexes = async (
//   expirationTime = newExpireAfterSeconds
// ) => {
//   try {
//     for (const modelName of modelsToUpdate) {
//       const model = mongoose.model(modelName);

//       // Drop the existing index to avoid conflicts
//       await model.collection.dropIndex({ createdAt: -1 }).catch((err) => {
//         if (err.code !== 27) {
//           // 27 means the index wasn't found, so it can be ignored
//           console.error(`Error dropping index for ${modelName}:`, err);
//         }
//       });

//       // Recreate the index with updated expiration time
//       await model.collection.createIndex(
//         { createdAt: -1 },
//         { expireAfterSeconds: expirationTime }
//       );

//       console.log(
//         `Index updated for ${modelName} with expiration time: ${expirationTime} seconds.`
//       );
//     }

//     console.log(
//       `✅ Expiration updated to ${expirationTime} seconds for all specified models.`
//     );
//   } catch (error) {
//     console.error("❌ Error updating expiration indexes:", error);
//   }
// };
// updateExpirationIndexes();

app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    message: "请求的资源不存在",
  });
});

app.use((err, req, res, next) => {
  console.error("=== Global Error Caught ===");
  console.error("Time:", new Date().toISOString());
  console.error("Path:", req.method, req.originalUrl);
  console.error("IP:", req.ip);
  console.error("Error:", err.message);
  console.error("Stack:", err.stack);
  console.error("========================");
  res.status(err.status || 500).json({
    success: false,
    message: {
      en: "Internal server error",
      zh: "服务器内部错误",
      ms: "Ralat dalaman pelayan",
    },
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});

global.sendNotificationToUser = sendNotificationToUser;

module.exports = wss;
