/**
 * @file index.js
 * @description Entry point for the CocoAPI backend server.
 * Configures env variables, connects to DBs and starts the HTTPS server.
 */
import dotenv from "dotenv";

dotenv.config();

import cors from "cors";

import fs from "fs";
import https from "https";

import { connectMongo } from "./services/fileStorage.js";
import { connectPostgres } from "./database/config/prisma.js";

import app from "./app.js";


const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
    : "https://localhost:4321";

app.use(cors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT"],
}));


connectMongo();
connectPostgres();

const PORT = process.env.PORT || 3000;

const privateKey = fs.readFileSync("./certs/server.key", "utf8");
const certificate = fs.readFileSync("./certs/server.crt", "utf8");
const ca = fs.readFileSync("./certs/ca.crt", "utf8");
const credentials = { key: privateKey, cert: certificate, ca: ca };

console.clear(); // eslint-disable-line no-console

const httpsServer = https.createServer(credentials, app);
httpsServer.listen(PORT, () =>
    // eslint-disable-next-line no-console
    console.log(`
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
