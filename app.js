/**
 * @file app.js
 * @description CocoAPI backend server.
 * CORS debe ir antes que rutas y body parsers para que OPTIONS (preflight) reciba headers.
 * Monta middleware, rutas y manejador de errores de auth. (Sin efectos al importar salvo stack.)
 */
import applicantRoutes from "./routes/applicantRoutes.js";
import authorizerRoutes from "./routes/authorizerRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import travelAgentRoutes from "./routes/travelAgentRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import accountsPayableRoutes from "./routes/accountsPayableRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import comprobantesRoutes from "./routes/comprobantesRoutes.js";
import gastoTramoRoutes from "./routes/gastoTramoRoutes.js";
import exchangeRateRoutes from "./routes/exchangeRateRoutes.js";

import { handleAuthError } from "./middleware/authErrors.js";

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import csrf from "csurf";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import swaggerUi from "swagger-ui-express";
import yaml from "js-yaml";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const swaggerM1Path = path.join(__dirname, "openapi", "swagger-m1.yaml");
const swaggerM1Document = yaml.load(fs.readFileSync(swaggerM1Path, "utf8"));

const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
    : ["https://localhost:4321", "http://localhost:4321"];

app.use(cors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
}));

app.use(express.json());
app.use(cookieParser());

if (process.env.NODE_ENV !== "test") {
    const csrfProtection = csrf({ cookie: true });
    /**
     * CSRF en JSON + SPA: el login no puede enviar token antes de existir sesión.
     * Excluimos solo POST /api/user/login; el resto de mutaciones siguen protegidas.
     */
    app.use((req, res, next) => {
        const pathOnly = (req.originalUrl || req.url || "").split("?")[0];
        if (req.method === "POST" && pathOnly === "/api/user/login") {
            return next();
        }
        return csrfProtection(req, res, next);
    });
    // Ruta explícita y temprana (otros POST/PUT siguen necesitando header csrf-token).
    app.get("/api/user/csrf-token", (req, res) => {
        res.json({ csrfToken: req.csrfToken() });
    });
}

app.use("/api/applicant", applicantRoutes);
app.use("/api/authorizer", authorizerRoutes);
app.use("/api/user", userRoutes);
app.use("/api/travel-agent", travelAgentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/accounts-payable", accountsPayableRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/comprobantes", comprobantesRoutes);
app.use("/api/viajes", gastoTramoRoutes);
app.use("/api/exchange-rate", exchangeRateRoutes);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerM1Document));

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
