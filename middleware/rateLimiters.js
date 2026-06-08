import RateLimit from "express-rate-limit";

// Behind Caddy + Astro SSR the backend sees most traffic from a single upstream
// IP (the proxy / the frontend container), so per-IP limits collapse all users
// onto one bucket and trip almost immediately. For this single-box UAT/demo
// deployment the limiter is effectively disabled: 1,000,000 requests per minute.
// Overridable via RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MS if a real limit is wanted.
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000; // 1 minute
const MAX = Number(process.env.RATE_LIMIT_MAX) || 1_000_000;

export const generalRateLimiter = RateLimit({
    windowMs: WINDOW_MS,
    max: MAX,
    message: "Too many requests from this IP, please try again later",
});

export const loginRateLimiter = RateLimit({
    windowMs: WINDOW_MS,
    max: MAX,
    message: "Too many login attempts from this IP, please try again later",
});
