/**
 * @file index.js
 * @description Entry point for the CocoAPI backend server.
 * Carga variables de entorno, CORS, conexiones a BD y servidor HTTPS.
 */
import dotenv from "dotenv";

dotenv.config();

import fs from "fs";
import https from "https";

import { connectMongo } from "./services/fileStorage.js";
import { connectPostgres } from "./database/config/prisma.js";

import app from "./app.js";

const PORT = process.env.PORT || 3000;

export default app;

/** Jest importa `app` desde `app.js`; aquí no abrimos puerto ni conectamos BD. */
if (!process.env.JEST_WORKER_ID) {
    connectMongo().catch((error) => console.error("Failed to connect to MongoDB:", error));
    connectPostgres().catch((error) => console.error("Failed to connect to PostgreSQL:", error));

    const privateKey = fs.readFileSync("./certs/server.key", "utf8");
    const certificate = fs.readFileSync("./certs/server.crt", "utf8");
    const ca = fs.readFileSync("./certs/ca.crt", "utf8");
    const credentials = { key: privateKey, cert: certificate, ca: ca };

    console.clear(); // eslint-disable-line no-console

    const httpsServer = https.createServer(credentials, app);
    httpsServer.listen(PORT, () => {
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
`);
    });
}
