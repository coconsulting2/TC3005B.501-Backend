import build from "pino-abstract-transport";
import prisma from "../../database/config/prisma.js";


/**
 *
 */
export default async function () {
    console.log("Pino prisma transport building...");

    const BUFFER_M = {
        SIZE: 10,
        TTL_MS: 3000,
        MAX_SIZE: 1000,
    };

    let buffer = [];
    let flusher = null;

    const flush = async () => {
        if (!buffer.length) return;
        if (flusher) return flusher;

        flusher = (async () => {
            const toInsert = [...buffer];
            buffer = [];

            try {
                await prisma.log.createMany({ data: toInsert });
            } catch (err) {
                if (buffer.length + toInsert.length < BUFFER_M.MAX_SIZE) {
                    buffer = [...toInsert, ...buffer];
                    process.stderr.write(JSON.stringify({ msg: "Batch insert failed (re queueing)", err }) + "\n");
                } else {
                    process.stderr.write("Log buffer overflow, dropping log queue: " + JSON.stringify(buffer) + "\n");
                    buffer = [];
                }
            } finally {
                flusher = null;
            }
        })();

        return flusher;
    };

    const SCHEDULE = {
        TIMEOUT_ID: undefined,
        STOPPED: false
    };

    const schedule_flush = () => {
        SCHEDULE.TIMEOUT_ID = setTimeout(async () => {
            await flush();
            if (!SCHEDULE.STOPPED) schedule_flush();
        }, BUFFER_M.TTL_MS);
    };
    schedule_flush();

    const cleanUp = async () => {
        SCHEDULE.STOPPED = true;
        clearTimeout(SCHEDULE.TIMEOUT_ID);

        await flush();
        if (flusher) await flusher;
    };

    return build(async function (source) {
        for await (const log of source) {
            const { service, level, msg, pid, hostname, time, v, ...context } = log;
            buffer.push({ service, levelId: level, message: msg, context, at: new Date(time) });

            if (buffer.length >= BUFFER_M.SIZE) await flush();
        }

        await flush();
    }, {
        async close() {
            await cleanUp();
        }
    });
};
