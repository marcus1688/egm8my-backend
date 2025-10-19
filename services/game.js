const { User } = require("../models/users.model");
const moment = require("moment");
const axios = require("axios");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

require("dotenv").config();

const gw99AgentName = "JKL_BB12001";
const gw99SecretKey = process.env.GW99_SECRET;
const gw99APIURL = "https://gw99api.com";
function generateUniqueGW99TransactionId(prefix) {
  const uuid = uuidv4().replace(/-/g, "");
  return `${prefix}-${uuid.substring(0, 8)}`;
}

function generateGW99Signature(params) {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  // Correctly add &PrivateKey=xxx
  const signString = `${sortedParams}&PrivateKey=${gw99SecretKey}`;

  const hash = crypto.createHash("sha256").update(signString, "utf8").digest();
  const signature = Buffer.from(hash).toString("base64");

  return signature;
}

async function transferOutGW99(user, formattedWithdrawAmount) {
  const txId = generateUniqueGW99TransactionId("withdraw");

  const requestBody = {
    PlayerAccount: user.gw99GameID,
    Amount: -formattedWithdrawAmount,
    ExternalTransactionId: txId,
  };

  const signature = generateGW99Signature(requestBody);

  const response = await axios.post(
    `${gw99APIURL}/Api/IGame/Transaction/Create`,
    requestBody,
    {
      headers: {
        "Content-Type": "application/json",
        merchantName: gw99AgentName,
        signature: signature,
      },
    }
  );
  console.log(response.data);
  return response.data;
}

const checkGW99Balance = async (username) => {
  try {
    const user = await User.findOne({ username });

    if (!user) {
      return { success: false, balance: 0 };
    }

    if (!user?.gw99GameID) {
      return { success: true, balance: 0 };
    }
    const requestBody = {
      PlayerAccount: user.gw99GameID,
    };

    const signature = generateGW99Signature(requestBody);

    const response = await axios.post(
      `${gw99APIURL}/Api/IGame/Player/Info`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json",
          merchantName: gw99AgentName,
          signature: signature,
        },
      }
    );

    return {
      success: response.data.result.code === 0,
      balance: response.data.data.balance || 0,
      response: response.data,
    };
  } catch (error) {
    console.error("GW99 error checking user balance", error.message);
    return { success: false, balance: 0 };
  }
};

const alipayAPIURL = "https://api.ap95.org/api/";
const alipayUsername = "oc7api";
const alipayPassword = process.env.ALIPAY_PASS;

const checkAlipayBalance = async (username) => {
  try {
    const user = await User.findOne({ username });

    if (!user) {
      return { success: false, balance: 0 };
    }

    if (!user?.alipayGameID) {
      return { success: true, balance: 0 };
    }

    const payload = {
      target_mid: user.alipayGameID,
      mid: alipayUsername,
      pw: alipayPassword,
    };

    const response = await axios.post(
      `${alipayAPIURL}wallet_member_query`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return {
      success: response.data.status.success === true,
      balance: response.data.member.credit_available || 0,
      response: response.data,
    };
  } catch (error) {
    console.error("Alipay error checking user balance", error.message);
    return { success: false, balance: 0 };
  }
};

async function transferOutAlipay(user, formattedWithdrawAmount) {
  const payload = {
    target_mid: user.alipayGameID,
    withdraw_amount: formattedWithdrawAmount,
    mid: alipayUsername,
    pw: alipayPassword,
  };

  const response = await axios.post(
    `${alipayAPIURL}wallet_member_withdraw/en`,
    payload,
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
  return response.data;
}

const lionKingSN = process.env.LIONKING_SN;
const lionKingSecret = process.env.LIONKING_SECRET;
const webURL = "https://www.oc7.me/";
const lionKingAPIURL = "https://api.lk888.info/";
const returnCallbackUrl = "https://api.oc7.me/api/lionking";

function generateSignature(id, method, sn, playerCode) {
  const rawString = `${id}${method}${sn}${playerCode}${lionKingSecret}`;
  return crypto.createHash("md5").update(rawString).digest("hex");
}

async function transferOutLionking(user, formattedWithdrawAmount) {
  const id = uuidv4().replace(/-/g, "");
  const method = "SetBalanceTransfer";

  const signature = generateSignature(
    id,
    method,
    lionKingSN,
    user.lionKingGameID
  );

  const payload = {
    ID: id,
    Method: method,
    SN: lionKingSN,
    LoginId: user.lionKingGameID,
    Amount: -formattedWithdrawAmount,
    Signature: signature,
  };

  const response = await axios.post(
    `${lionKingAPIURL}Account/SetBalanceTransfer`,
    payload,
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}

const checkLionKingBalance = async (username) => {
  try {
    const user = await User.findOne({ username });

    if (!user) {
      return { success: false, balance: 0 };
    }

    if (!user?.lionKingGameID) {
      return { success: true, balance: 0 };
    }

    const id = uuidv4().replace(/-/g, "");
    const method = "GetBalance";

    const signature = generateSignature(
      id,
      method,
      lionKingSN,
      user.lionKingGameID
    );

    const payload = {
      ID: id,
      Method: method,
      SN: lionKingSN,
      LoginId: user.lionKingGameID,
      Signature: signature,
    };

    const response = await axios.post(
      `${lionKingAPIURL}Account/GetBalance`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return {
      success: response.data.code === "S100",
      balance: response.data.data.result || 0,
      response: response.data,
    };
  } catch (error) {
    console.error("LIONKING error checking user balance", error.message);
    return { success: false, balance: 0 };
  }
};

module.exports = {
  checkGW99Balance,
  transferOutGW99,
  transferOutAlipay,
  checkAlipayBalance,
  transferOutLionking,
  checkLionKingBalance,
};
