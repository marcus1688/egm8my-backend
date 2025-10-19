const jwt = require("jsonwebtoken");

const generateToken = async (userId) => {
  const secret = process.env.JWT_ADMIN_SECRET;
  return jwt.sign({ userId }, secret, {
    expiresIn: "7d",
  });
};

const generateRefreshToken = async (userId) => {
  const secret = process.env.ADMIN_REFRESH_TOKEN_SECRET;
  return jwt.sign({ userId }, secret, {
    expiresIn: "30d",
  });
};

const authenticateAdminToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token == null) {
    return res
      .status(200)
      .json({ authorized: false, message: "No token provided." });
  }
  jwt.verify(token, process.env.JWT_ADMIN_SECRET, (err, user) => {
    if (err) {
      return res
        .status(200)
        .json({ authorized: false, message: "Invalid token." });
    }
    req.user = user;
    next();
  });
};

const handleLoginSuccess = async (userId) => {
  const token = await generateToken(userId);
  const refreshToken = await generateRefreshToken(userId);
  return {
    token,
    refreshToken,
  };
};

module.exports = {
  generateToken,
  generateRefreshToken,
  authenticateAdminToken,
  handleLoginSuccess,
};
