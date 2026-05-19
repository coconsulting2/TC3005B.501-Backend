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
import permissionRoutes from "./routes/permissionRoutes.js";
import solicitudWorkflowRoutes from "./routes/solicitudWorkflowRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import policyRoutes, { employeeCategoryRouter } from "./routes/policyRoutes.js";
import refundRoutes from "./routes/refundRoutes.js";
import inboxRoutes from "./routes/inboxRoutes.js";
import approvalSubstituteRoutes from "./routes/approvalSubstituteRoutes.js";
import apiKeyRoutes from "./routes/apiKeyRoutes.js";
import externalApiKeyRoutes from "./routes/externalApiKeyRoutes.js";
import organizationRoutes from "./routes/organizationRoutes.js";
import onboardingImportRoutes from "./routes/onboardingImportRoutes.js";
import exportRoutes from "./routes/exportRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import viaticasPolicyRoutes from "./routes/viaticasPolicyRoutes.js";
import fxRoutes from "./routes/fxRoutes.js";
import flightsRoutes from "./routes/flightsRoutes.js";
import hotelsRoutes from "./routes/hotelsRoutes.js";
import requestCommentRoutes from "./routes/requestCommentRoutes.js";
import workflowRuleRoutes from "./routes/workflowRuleRoutes.js";

import { handleAuthError } from "./middleware/authErrors.js";

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import csrf from "csurf";
import path from "path";
import { fileURLToPath } from "url";
import swaggerUi from "swagger-ui-express";
import { close, logger } from "./utils/log/logger.js";
import { httpLogger } from "./utils/log/logger.http.js";

// JSON serialization patch for Prisma BigInt fields (M2-006: orgId, etc.).
// Express's res.json uses JSON.stringify which throws on BigInt by default.

BigInt.prototype.toJSON = function () {
    return this.toString();
};

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Serve openapi directory statically for Swagger UI to fetch YAMLs
app.use("/openapi", express.static(path.join(__dirname, "openapi")));

const allowedCORS = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
    : ["https://localhost:4321", "http://localhost:4321"];

const CORS = cors({
    origin: (origin, callback) => {
        logger.trace(`CORS origin received: ${JSON.stringify(origin)}`);
        if (!origin) {
            return callback(null, true);
        }

        if (origin && allowedCORS.includes(origin)) {
            return callback(null, true);
        }

        logger.warn(`CORS rejected: ${origin}`);
        return callback(new Error(`CORS policy blocked: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});

app.options("*", CORS); // preflight
app.use(CORS);

app.use(express.json());
app.use(cookieParser());
app.use(httpLogger);

if (process.env.NODE_ENV !== "test") {
    const csrfProtection = csrf({ cookie: {
        maxAge: 60 * 60 * 24
        }});
    /**
     * CSRF en JSON + SPA: el login no puede enviar token antes de existir sesión.
     * Excluimos solo POST /api/user/login; el resto de mutaciones siguen protegidas.
     */
    app.use((req, res, next) => {
        const pathOnly = (req.originalUrl || req.url || "").split("?")[0];
        if (req.method === "POST" && pathOnly === "/api/user/login") {
            return next();
        }
        // GET csrf-token must bypass global CSRF validation so it can issue a
        // fresh _csrf cookie even when the previous one expired — otherwise the
        // client enters a deadlock where it cannot obtain a new token because
        // the middleware rejects the request that generates it.
        if (req.method === "GET" && pathOnly === "/api/user/csrf-token") {
            return next();
        }
        return csrfProtection(req, res, next);
    });
    // Apply csrfProtection directly on this route so it sets the _csrf cookie
    // and generates a token, but without requiring a valid _csrf cookie first
    // (the global middleware already skips it above).
    app.get("/api/user/csrf-token", csrfProtection, (req, res) => {
        res.json({ csrfToken: req.csrfToken() });
    });
}

app.use("/api/applicant", applicantRoutes);
app.use("/api/authorizer", authorizerRoutes);
// M2-006: inbox debe registrarse antes que solicitudWorkflowRoutes para que /inbox
// no se interprete como /:id/aprobar.
app.use("/api/solicitudes", inboxRoutes);
app.use("/api/solicitudes", solicitudWorkflowRoutes);
app.use("/api/solicitudes", requestCommentRoutes);
app.use("/api/approval-substitutes", approvalSubstituteRoutes);
app.use("/api/user", userRoutes);
app.use("/api/travel-agent", travelAgentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin", permissionRoutes);
app.use("/api/accounts-payable", accountsPayableRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/comprobantes", comprobantesRoutes);
app.use("/api/viajes", gastoTramoRoutes);
app.use("/api/exchange-rate", exchangeRateRoutes);
app.use("/api/fx", fxRoutes);
app.use("/api/flights", flightsRoutes);
app.use("/api/hotels", hotelsRoutes);
app.use("/api/notifications", notificationRoutes);
// M2-006 — Refund rule engine
app.use("/api/policies", policyRoutes);
app.use("/api/employee-categories", employeeCategoryRouter);
app.use("/api/refunds", refundRoutes);
// API keys por organización (panel admin + endpoints externos para integraciones)
app.use("/api/keys", apiKeyRoutes);
app.use("/api/external", externalApiKeyRoutes);
// Multi-tenant: gestión de organizaciones (Ditta only para crear/listar; admins de org leen/editan la propia).
app.use("/api/organizations", organizationRoutes);
// M3-007 — Importación masiva de usuarios para onboarding (JSON / CSV, strategy pattern).
app.use("/api/onboarding/import", onboardingImportRoutes);
// M1-010 — Exportación contable al ERP (polizas AV/GV).
app.use("/api/export", exportRoutes);
app.use("/api/reports", reportRoutes);
// TF-009 — Política de viáticos: topes de hotel y comida por organización.
app.use("/api/viaticos-policy", viaticasPolicyRoutes);
// Workflow rules CRUD — solo Administrador de org (workflow:manage)
app.use("/api/workflow-rules", workflowRuleRoutes);

const swaggerOptions = {
    explorer: true,
    swaggerOptions: {
        urls: [
            { url: "/openapi/swagger-m1.yaml", name: "Modulo 1 - Core" },
            { url: "/openapi/swagger-m2.yaml", name: "Modulo 2 - Admin & Workflow" }
        ]
    }
};
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(null, swaggerOptions));

// CSRF error handler — must be BEFORE handleAuthError so csurf rejections
// get proper JSON + CORS headers instead of Express's default HTML error page.
app.use((err, req, res, next) => {
    if (err.code === "EBADCSRFTOKEN") {
        return res.status(403).json({
            statusCode: 403,
            message: "Invalid or missing CSRF token",
            error: "EBADCSRFTOKEN",
        });
    }
    next(err);
});


app.get("/", (req, res) => {
    res.json({
        message: "This is my backend endpoint for the travel management system",
    });
});

app.get("/health", (req, res) => {
    res.status(200).send("Server running OK");
});

app.use(handleAuthError);
app.use((err, req, res, next) => {
    if (err.code === "EBADCSRFTOKEN") {
        CORS(req, res, () => {
            return res.status(403).json({
                statusCode: 403,
                message: "Invalid or missing CSRF token",
                error: "EBADCSRFTOKEN",
            });
        });
        return;
    }
    next(err);
});

/**
 *
 */
async function deallocate_resources() {
    await close();
    console.log("Pino prisma clean ups done.");
}

process.on("SIGTERM", async () => {
    await deallocate_resources();
    process.exit(0);
});

process.on("SIGINT", async () => {
    await deallocate_resources();
    process.exit(0);
});


export default app;
