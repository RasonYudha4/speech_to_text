const { validationResult } = require("express-validator");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const { Op } = require("sequelize");


const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const authController = {
  // Local registration
  async register(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { name, email, password } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({
          success: false,
          message: "Name, email, and password are required",
        });
      }

      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Email already exists",
        });
      }

      const user = await User.create({
        name,
        email,
        password,
        provider: "local",
      });

      const token = generateToken(user.id);

      res.status(201).json({
        success: true,
        user: user.toJSON(),
        token,
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({
        success: false,
        message: "Registration failed",
      });
    }
  },

  // Local login
  async login(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { email, password } = req.body;
      const user = await User.findOne({ where: { email, provider: "local" } });

      if (!user || !(await user.comparePassword(password))) {
        return res.status(400).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      const token = generateToken(user.id);

      res.json({
        success: true,
        user: user.toJSON(),
        token,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({
        success: false,
        message: "Login failed",
      });
    }
  },

  // Google SSO login
  async googleLogin(req, res) {
    try {
      // Extract credential instead of idToken (this is what Google sends)
      const idToken = req.body.credential;
      console.log("Req : ", req.body);
      console.log("idToken type:", typeof idToken);
      console.log(
        "idToken preview:",
        idToken ? idToken.substring(0, 50) + "..." : "undefined"
      );

      if (!idToken) {
        return res.status(400).json({
          success: false,
          message: "Google credential is required",
        });
      }

      if (typeof idToken !== "string") {
        return res.status(400).json({
          success: false,
          message: "Invalid credential format",
          receivedType: typeof idToken,
        });
      }

      // Verify token with Google
      const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      console.log("Google user payload:", payload);

      const { sub: googleId, email, name } = payload;

      let user = await User.findOne({
        where: {
          [Op.or]: [{ email: email }, { providerId: googleId }],
        },
      });

      if (!user) {
        // Fallback: check by email (merge if user signed up locally)
        user = await User.findOne({ where: { email } });

        if (!user) {
          user = await User.create({
            name: name,
            email: email,
            provider: "google",
            providerId: googleId,
            // No password for OAuth users
          });
        } else if (user.provider !== "google") {
          // Update existing local user to also support Google login
          user.provider = "google";
          user.providerId = googleId;
          await user.save();
        }
      }

      const token = generateToken(user.id);

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          provider: user.provider,
        },
      });
    } catch (error) {
      console.error("Google login error:", error);

      // Handle specific Google verification errors
      if (error.message.includes("Token used too late")) {
        return res.status(400).json({
          success: false,
          message: "Token expired, please try logging in again",
        });
      }

      if (error.message.includes("Invalid token signature")) {
        return res.status(400).json({
          success: false,
          message: "Invalid token signature",
        });
      }

      if (error.message.includes("Wrong recipient")) {
        return res.status(400).json({
          success: false,
          message: "Token audience mismatch",
        });
      }

      res.status(500).json({
        success: false,
        message: "Google login failed",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  // JWT verification
  async verify(req, res) {
    try {
      const user = await User.findByPk(req.user.id);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        user: user.toJSON(),
      });
    } catch (error) {
      console.error("Verification error:", error);
      res.status(500).json({
        success: false,
        message: "Verification failed",
      });
    }
  },
};

module.exports = authController;
