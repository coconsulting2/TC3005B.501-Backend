/**
 * @file app.js
 * @description CocoAPI backend server.
 * Loads environment variables, registers Express middleware (CORS, JSON, cookies),
 * mounts all API route groups. (No side effects on import).
 */
import applicantRoutes from "./routes/applicantRoutes.js";
import authorizerRoutes from "./routes/authorizerRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import travelAgentRoutes from "./routes/travelAgentRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import accountsPayableRoutes from "./routes/accountsPayableRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import comprobantesRoutes from "./routes/comprobantesRoutes.js";

import { handleAuthError } from "./middleware/authErrors.js";

import express from "express";
import cookieParser from "cookie-parser";

const app = express();


app.use(express.json());
app.use(cookieParser());

app.use("/api/applicant", applicantRoutes);
app.use("/api/authorizer", authorizerRoutes);
app.use("/api/user", userRoutes);
app.use("/api/travel-agent", travelAgentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/accounts-payable", accountsPayableRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/comprobantes", comprobantesRoutes);

// Centralized auth error handler — must be registered after all routes
app.use(handleAuthError);

app.get("/", (req, res) => {
    res.json({
        message: "This is my backend endpoint for the travel management system",
    });
});

app.get("/health", (req, res) => {
    res.status(200).send("Server running OK");
});

export default app;
