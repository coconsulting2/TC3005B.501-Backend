import RateLimit from "express-rate-limit";

// In non-production environments (dev, test, CI) the aggressive limits prevent
// E2E suites and local exploration. Production keeps the tight values.
const isProd = process.env.NODE_ENV === "production";

export const generalRateLimiter = RateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isProd ? 100 : 10000,
    message: "Too many requests from this IP, please try again after 15 minutes",
});

export const loginRateLimiter = RateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: isProd ? 5 : 1000,
    message: "Too many login attempts from this IP, please try again after a minute",
});
