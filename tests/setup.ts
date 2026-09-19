import "@testing-library/jest-dom/vitest";

// Deterministic clock base for effective-date logic. Individual tests that need
// a different date must inject it explicitly rather than relying on wall time.
process.env["TZ"] = "UTC";
