import { pinoHttp } from "pino-http";

export const httpLogger = pinoHttp({
    ...(process.env.NODE_ENV === 'development' && {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
                ignore: 'pid,hostname,req.method,res.statusCode,req.url,req,res,responseTime',
                messageFormat: '{req.method} [{res.statusCode}] {req.url} - Responded on {responseTime}ms',
            }
        }
    }),

    customLogLevel: function (req, res, err) {
        if (res.statusCode >= 400 && res.statusCode < 500) {
            return 'warn';
        }
        if (res.statusCode >= 500 || err) {
            return 'error';
        }
        return 'info';
    },

    customSuccessMessage: function (req, res) {
        if (res.statusCode === 404) {
            return 'Resource not found';
        }
        return `Request completed`;
    },

    serializers: {
        req: (req) => {
            return {
                method: req.method,
                url: req.url,
            };
        },
        res: (res) => {
            return {
                statusCode: res.statusCode,
            };
        },
    },
});
