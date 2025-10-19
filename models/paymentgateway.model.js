const mongoose = require("mongoose");
const moment = require("moment");

const bankSchema = new mongoose.Schema({
  bankname: String,
  bankcode: String,
  bankimage: String,
  minlimit: {
    type: Number,
    default: 0,
  },
  maxlimit: {
    type: Number,
    default: 0,
  },
  active: {
    type: Boolean,
    default: true,
  },
});

const paymentGatewaySchema = new mongoose.Schema(
  {
    name: String,
    logo: String,
    paymentAPI: String,
    reportAPI: String,
    minDeposit: Number,
    maxDeposit: Number,
    remark: String,
    status: Boolean,
    banks: [bankSchema],
  },
  {
    timestamps: {
      currentTime: () => moment().utc().toDate(),
    },
  }
);

const paymentgateway = mongoose.model("paymentgateway", paymentGatewaySchema);

module.exports = paymentgateway;
