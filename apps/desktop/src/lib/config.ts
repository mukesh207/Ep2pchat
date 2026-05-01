// ── Trustline Application Configuration ─────────────────────────────────────
// Centralized constants and environment variables for the desktop client.
// These are resolved at build-time via Vite.

function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, "");
}

/** 
 * API Base URL for all REST requests. 
 * Defaults to '/api/v1' for same-origin proxying in development.
 */
export const API_BASE_URL = (() => {
    const configured = import.meta.env.VITE_API_BASE_URL?.trim();
    return configured ? trimTrailingSlash(configured) : "/api/v1";
})();

/** 
 * WebSocket URL for real-time messaging.
 * Automatically resolves to same-origin wss/ws if not explicitly configured.
 */
export const WS_BASE_URL = (() => {
    const configured = import.meta.env.VITE_WS_BASE_URL?.trim();
    if (configured) return trimTrailingSlash(configured);
    
    // Auto-detect protocol and host for local dev or same-domain production
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}/ws`;
})();

/** Application version injected during the build process. */
// @ts-expect-error __APP_VERSION__ is defined by Vite at build time
export const APP_VERSION: string = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0-dev";

/** Setup token for Admin Bootstrap bypass (only present in certain builds/environments). */
export const ADMIN_BOOTSTRAP_SETUP_TOKEN = import.meta.env.VITE_ADMIN_BOOTSTRAP_SETUP_TOKEN?.trim() ?? "";
