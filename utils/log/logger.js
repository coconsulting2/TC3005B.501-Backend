import pino from 'pino';
import { URL } from 'url';


const transport = pino.transport({
    targets: [
        ...(process.env.NODE_ENV !== "production" ?
                [{ target: 'pino-pretty', level: 'debug', options: { colorize: true } }] : []
        ),
        {
            target: new URL('./pino-prisma-transport.js', import.meta.url).href,
            level: 'info',
        }
    ]
});

const logger = pino({
    base: { service: 'coco-api' }
}, transport);

const close = async () => {
    const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Transport close timeout.')), 5000);
    });

    await Promise.race([
        transport.end(),
        timeout
    ]);
};

function Logger(service) {
    return pino({ base: { service: service } }, transport);
}

export {
    logger,
    Logger,
    close
};
