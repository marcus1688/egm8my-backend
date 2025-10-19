const mongoose = require("mongoose");
const moment = require("moment");
const { nanoid } = require("nanoid");

const bankAccountSchema = new mongoose.Schema({
  name: String,
  bankname: String, // 银行名称
  banknumber: String, // 银行账号
});

const userLuckySpinSettingSchema = new mongoose.Schema(
  {
    settings: [
      {
        name: { type: String, required: true },
        angle: { type: Number, required: true },
        probability: { type: Number, required: true },
        value: { type: Number, required: true },
      },
    ],
    remainingCount: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { _id: false, timestamps: false }
);

const cryptoSchema = new mongoose.Schema({
  crypto_currency: String,
  crypto_active: Boolean,
  crypto_address: String,
  crypto_qrimage: String,
  crypto_customerid: String,
  crypto_accountid: String,
  crypto_accountbalance: String,
  crypto_availablebalance: String,
});

const gameStatusSchema = new mongoose.Schema(
  {
    transferInStatus: {
      type: Boolean,
      default: false,
    },
    transferOutStatus: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);
const gameLockSchema = new mongoose.Schema(
  {
    lock: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const dailyGameAmountsSchema = new mongoose.Schema(
  {
    "Slot Games": {
      turnover: { type: Number, default: 0 },
      winloss: { type: Number, default: 0 },
    },
    "E-Sports": {
      turnover: { type: Number, default: 0 },
      winloss: { type: Number, default: 0 },
    },
    Fishing: {
      turnover: { type: Number, default: 0 },
      winloss: { type: Number, default: 0 },
    },
    Horse: {
      turnover: { type: Number, default: 0 },
      winloss: { type: Number, default: 0 },
    },
    Lottery: {
      turnover: { type: Number, default: 0 },
      winloss: { type: Number, default: 0 },
    },
    "Mah Jong": {
      turnover: { type: Number, default: 0 },
      winloss: { type: Number, default: 0 },
    },
    Poker: {
      turnover: { type: Number, default: 0 },
      winloss: { type: Number, default: 0 },
    },
    "Live Casino": {
      turnover: { type: Number, default: 0 },
      winloss: { type: Number, default: 0 },
    },
    Sports: {
      turnover: { type: Number, default: 0 },
      winloss: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    customerId: String,
    userServerId: {
      type: String,
      unique: true,
      sparse: true,
    },
    evolutionUserId: Number,
    email: String,
    isPhoneVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    verificationToken: String,
    verificationTokenExpires: { type: Date },
    fullname: { type: String, required: true },
    username: String,
    email: String,
    phonenumber: String,
    password: String,
    confirmpassword: String,
    wallet: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString("0"),
      set: function (v) {
        // const formatted = parseFloat(v).toFixed(2);
        // return mongoose.Types.Decimal128.fromString(formatted);
        const formatted = parseFloat(v).toFixed(4);
        return mongoose.Types.Decimal128.fromString(formatted);
      },
      get: function (v) {
        if (v) return parseFloat(v.toString());
        return 0;
      },
    },
    dob: String,
    referralLink: { type: String },
    referralCode: { type: String },
    referralQrCode: { type: String },
    luckySpinAmount: { type: String, default: "0" },
    luckySpinClaim: { type: Boolean, default: false },
    bankAccounts: [bankAccountSchema],
    positionTaking: {
      type: String,
      default: "0",
    },
    cryptoWallet: [cryptoSchema],
    status: {
      type: Boolean,
      default: true,
    },
    firstDepositDate: {
      type: Date,
      default: null,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    lastLoginIp: {
      type: String,
      default: "-",
    },
    registerIp: {
      type: String,
      default: "-",
    },
    referrals: [
      {
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        username: { type: String },
        _id: false,
      },
    ],
    referralBy: {
      user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      username: { type: String },
      _id: false,
    },
    viplevel: {
      type: String,
      default: "Bronze",
      required: true,
    },
    telegramId: {
      type: String,
      default: null,
    },
    facebookId: {
      type: String,
      default: null,
    },
    highestVipLevel: {
      type: String,
      default: "normal", // default to the initial VIP level
    },
    highestVipLevelDate: {
      type: Date,
      default: new Date(Date.now() + 8 * 60 * 60 * 1000), // Track the date when the highest VIP level was achieved
    },
    monthlyBonusCountdownTime: { type: Number, default: 0 },
    monthlyLoyaltyCountdownTime: { type: Number, default: 0 },
    weeklySignInTime: { type: Number, default: 0 },
    lastClaimedVipLevel: {
      type: String,
      default: "normal", // Default to the initial VIP level
    },
    alert: {
      type: String,
      enum: {
        values: ["Yes", "No"],
      },
      default: "No",
    },
    abnormal: {
      type: String,
      enum: {
        values: ["Yes", "No"],
      },
      default: "No",
    },
    agentLevel: {
      type: Number,
      default: 0,
    },
    withdrawlock: {
      type: Boolean,
      default: false,
    },
    duplicateIP: {
      type: Boolean,
      default: false,
    },
    remark: {
      type: String,
    },
    userType: {
      type: String,
      enum: ["followed", "agent", "not found"],
      sparse: true,
    },

    rebate: { type: Number, default: 0 },
    turnover: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString("0"),
      set: function (v) {
        const formatted = parseFloat(v).toFixed(2);
        return mongoose.Types.Decimal128.fromString(formatted);
      },
      get: function (v) {
        if (v) return parseFloat(v.toString());
        return 0;
      },
    },
    totalturnover: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString("0"),
      set: function (v) {
        const formatted = parseFloat(v).toFixed(2);
        return mongoose.Types.Decimal128.fromString(formatted);
      },
      get: function (v) {
        if (v) return parseFloat(v.toString());
        return 0;
      },
    },
    winloss: { type: Number, default: 0 },
    gamewallet: { type: Number, default: 0 },
    totaldeposit: { type: Number, default: 0 },
    totalwithdraw: { type: Number, default: 0 },
    totalbonus: { type: Number, default: 0 },

    lastdepositdate: {
      type: Date,
      default: null,
    },
    lastcheckinbonus: {
      type: Date,
      default: null,
    },
    adminMagicToken: String,
    adminMagicTokenExpires: Date,
    adminMagicTokenUsed: { type: Boolean, default: false },
    lastAdminAccess: { type: Date, default: null },
    lastAdminAccessBy: String,
    gameLock: {
      // rcb988: { type: gameLockSchema, default: () => ({}) },
      // sexybcrt: { type: gameLockSchema, default: () => ({}) },
      // wmcasino: { type: gameLockSchema, default: () => ({}) },
      cmd368: { type: gameLockSchema, default: () => ({}) },
      ct855: { type: gameLockSchema, default: () => ({}) },
      mega888h5: { type: gameLockSchema, default: () => ({}) },
      jili: { type: gameLockSchema, default: () => ({}) },
      nextspin: { type: gameLockSchema, default: () => ({}) },
      joker: { type: gameLockSchema, default: () => ({}) },
      asiagaming: { type: gameLockSchema, default: () => ({}) },
      uuslot: { type: gameLockSchema, default: () => ({}) },
      live22: { type: gameLockSchema, default: () => ({}) },
      lfc888: { type: gameLockSchema, default: () => ({}) },
      playtech: { type: gameLockSchema, default: () => ({}) },
      gsi: { type: gameLockSchema, default: () => ({}) },
      kiss918h5: { type: gameLockSchema, default: () => ({}) },
      pp: { type: gameLockSchema, default: () => ({}) },
      habanero: { type: gameLockSchema, default: () => ({}) },
      cq9: { type: gameLockSchema, default: () => ({}) },
      spadegaming: { type: gameLockSchema, default: () => ({}) },
      fachai: { type: gameLockSchema, default: () => ({}) },
      sabasport: { type: gameLockSchema, default: () => ({}) },
      sagaming: { type: gameLockSchema, default: () => ({}) },
      microgaming: { type: gameLockSchema, default: () => ({}) },
      hacksaw: { type: gameLockSchema, default: () => ({}) },
    },
    gameStatus: {
      alipay: { type: gameStatusSchema, default: () => ({}) },
      lionking: { type: gameStatusSchema, default: () => ({}) },
      gw99: { type: gameStatusSchema, default: () => ({}) },
      // xe88: { type: gameStatusSchema, default: () => ({}) },
      // kiss918: { type: gameStatusSchema, default: () => ({}) },
    },
    lastForcedLogout: { type: Date, default: null },
    luckySpinCount: {
      type: Number,
      default: 0,
    },
    luckySpinSetting: {
      type: userLuckySpinSettingSchema,
      default: () => ({ settings: [], remainingCount: 0 }),
    },
    live22GameToken: {
      type: String,
    },
    uuslotGameToken: {
      type: String,
    },
    playtechGameToken: {
      type: String,
    },
    habaneroGameToken: {
      type: String,
    },
    CT855GamePW: {
      type: String,
    },
    kiss918GameID: {
      type: String,
    },
    kiss918GamePW: {
      type: String,
    },
    ppliveGameToken: {
      type: String,
    },
    ppslotGameToken: {
      type: String,
    },
    jiliGameToken: {
      type: String,
    },
    lionKingGameID: {
      type: String,
    },
    LFC888GamePW: {
      type: String,
    },
    AsiaGamingGamePW: {
      type: String,
    },
    AsiaGamingGameToken: {
      type: String,
    },
    alipayGameID: {
      type: String,
    },
    alipayGameToken: {
      type: String,
    },
    nextspinGameToken: {
      type: String,
    },
    microGamingGameToken: {
      type: String,
    },
    hacksawGameToken: {
      type: String,
    },
    cmd368GameToken: {
      type: String,
    },
    gw99GameID: {
      type: String,
    },
    gw99GamePW: {
      type: String,
    },
    pastGw99GameID: {
      type: [String],
      default: [],
    },
    pastGw99GamePW: {
      type: [String],
      default: [],
    },
    mega888h5ID: {
      type: String,
    },
    mega888h5PW: {
      type: String,
    },
    lastRebateClaim: {
      type: Date,
      default: null,
    },
    lastCommissionClaim: {
      type: Date,
      default: null,
    },
  },
  {
    toJSON: { getters: true },
    toObject: { getters: true },
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

const logSchema = new mongoose.Schema(
  {
    company: {
      type: String,
    },
    fullname: String,
    username: String,
    phonenumber: Number,
    loginTime: {
      type: Date,
      default: null,
    },
    source: {
      type: String,
    },
    ipaddress: {
      type: String,
    },
    ipcountry: {
      type: String,
    },
    ipcity: {
      type: String,
    },
    remark: {
      type: String,
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

const adminUserWalletLogSchema = new mongoose.Schema(
  {
    company: {
      type: String,
    },
    username: String,
    transactionId: String,
    transactiontime: { type: Date, default: Date.now },
    transactiontype: String,
    transferamount: Number,
    gamename: String,
    userwalletbalance: Number,
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(), // Ensure timestamps are stored in UTC
    },
  }
);

const userGameDataSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    gameHistory: {
      type: Map,
      of: dailyGameAmountsSchema,
      default: new Map(),
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

const gameDataLogSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    gameCategories: {
      type: Map,
      of: {
        type: Map,
        of: {
          turnover: {
            type: Number,
            default: 0,
          },
          winloss: {
            type: Number,
            default: 0,
          },
        },
      },
      default: new Map(),
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

const gameDataValidLogSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    gameCategories: {
      type: Map,
      of: {
        type: Map,
        of: {
          turnover: {
            type: Number,
            default: 0,
          },
        },
      },
      default: new Map(),
    },
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

function generateCustomerId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateUserServerId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

adminUserWalletLogSchema.index(
  { createdAt: -1 },
  { expireAfterSeconds: 5256000 }
);
logSchema.index({ createdAt: -1 }, { expireAfterSeconds: 5260000 });
gameDataLogSchema.index({ createdAt: -1 }, { expireAfterSeconds: 5260000 });
gameDataValidLogSchema.index(
  { createdAt: -1 },
  { expireAfterSeconds: 1309600 }
);

userSchema.pre("save", async function (next) {
  if (!this.customerId) {
    let newId;
    let exists = true;
    while (exists) {
      newId = generateCustomerId();
      exists = await mongoose.models.User.exists({ customerId: newId });
    }
    this.customerId = newId;
  }
  if (!this.userServerId) {
    let newServerId;
    let exists = true;
    while (exists) {
      newServerId = generateUserServerId(); // Generates 8-character ID like "a3k9m2qx"
      exists = await mongoose.models.User.exists({ userServerId: newServerId });
    }
    this.userServerId = newServerId;
  }
  next();
});

const adminUserWalletLog = mongoose.model(
  "adminUserWalletLog",
  adminUserWalletLogSchema
);
const userLog = mongoose.model("userLog", logSchema);
const User = mongoose.model("User", userSchema);
const UserGameData = mongoose.model("UserGameData", userGameDataSchema);
const GameDataLog = mongoose.model("GameDataLog", gameDataLogSchema);
const GameDataValidLog = mongoose.model(
  "GameDataValidLog",
  gameDataValidLogSchema
);

module.exports = {
  User,
  userLog,
  adminUserWalletLog,
  UserGameData,
  GameDataLog,
  GameDataValidLog,
};
