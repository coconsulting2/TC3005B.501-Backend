/**
 * @file index.js
 * @description Entry point for the CocoAPI backend server.
 * Loads environment variables, registers Express middleware (CORS, JSON, cookies),
 * mounts all API route groups, connects to MongoDB, and starts the HTTPS server.
 */
import dotenv from "dotenv";
dotenv.config();

import applicantRoutes from "./routes/applicantRoutes.js";
import authorizerRoutes from "./routes/authorizerRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import travelAgentRoutes from "./routes/travelAgentRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import accountsPayableRoutes from "./routes/accountsPayableRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";

import { connectMongo } from "./services/fileStorage.js";
import { handleAuthError } from "./middleware/authErrors.js";
import prisma from "./database/config/prisma.js";
import logger from "./services/logger.js";

import fs from "fs";
import https from "https";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: "https://localhost:4321",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
}));

app.use(express.json());
app.use(cookieParser());

app.use("/api/applicant", applicantRoutes);
app.use("/api/authorizer", authorizerRoutes);
app.use("/api/user", userRoutes);
app.use("/api/travel-agent", travelAgentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/accounts-payable", accountsPayableRoutes);
app.use("/api/files", fileRoutes);

connectMongo().catch(error => logger.error("Failed to connect to MongoDB: %s", error.message));
prisma.$connect()
  .then(() => logger.info("PostgreSQL connected via Prisma"))
  .catch(error => logger.error("Failed to connect to PostgreSQL: %s", error.message));

// Centralized auth error handler — must be registered after all routes
app.use(handleAuthError);

// 503 handler for database connectivity errors
app.use((err, req, res, next) => {
  const dbErrorCodes = ["P1001", "P1002", "P1008", "P1017"];
  if (err?.code && dbErrorCodes.includes(err.code)) {
    logger.error("Database unavailable: %s", err.message);
    return res.status(503).json({ error: "Service temporarily unavailable. Please try again later." });
  }
  next(err);
});

app.get("/", (req, res) => {
  res.json({
    message: "This is my backend endpoint for the travel management system",
  });
});

const privateKey = fs.readFileSync("./certs/server.key", "utf8");
const certificate = fs.readFileSync("./certs/server.crt", "utf8");
const ca = fs.readFileSync("./certs/ca.crt", "utf8");
const credentials = { key: privateKey, cert: certificate, ca: ca };

console.clear();
const httpsServer = https.createServer(credentials, app);
httpsServer.listen(PORT, () =>
  logger.info(`
         )         )            (   (
   (  ( /(   (  ( /(      (     )\\ ))\\ )
   )\\ )\\())  )\\ )\\())     )\\   (()/(()/( 
 (((_|(_)\\ (((_|(_)\\   ((((_)(  /(_))(_))
 )\\___ ((_))\\___ ((_)   )\\ _ )\\(_))(_))
((/ __/ _ ((/ __/ _ \\   (_)_\\(_) _ \\_ _|
 | (_| (_) | (_| (_) |   / _ \\ |  _/| |
  \\___\\___/ \\___\\___/   /_/ \\_\\|_| |___|
🚀 Server running on port ${PORT} with HTTPS
`),
);
