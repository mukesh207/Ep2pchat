import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { invoke } from '@tauri-apps/api/core';

function trimTrailingSlash(value: string) {
    return value.replace(/\/+$/, "");
}

function resolveApiBase() {
    const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim();
    if (configuredBase) {
        return trimTrailingSlash(configuredBase);
    }

    return '/api/v1';
}

const API_BASE = resolveApiBase();

let authToken = "";

export function setToken(token: string) {
    authToken = token;
}

export function getToken() {
    return authToken;
}

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
    };
}

async function requestJson(path: string, init?: RequestInit) {
    const res = await fetch(`${API_BASE}${path}`, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) {
        throw new Error(data?.error || `Request failed with status ${res.status}`);
    }
    return data;
}

export async function requestAccess(email: string) {
    return requestJson('/auth/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
}

// Detect if running inside a Tauri desktop shell (Linux webview lacks WebAuthn)
function isTauri(): boolean {
    return !!(window as any).__TAURI_INTERNALS__;
}

export async function adminBootstrap(email: string) {
    return requestJson('/auth/admin-bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
}

export async function registerPasskey(userId: string) {
    const beginData = await requestJson('/auth/register-passkey/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
    });

    let credential;
    if (isTauri()) {
        // Tauri on Linux: WebAuthn is not available in the webview.
        // Open the system browser via the Rust bridge to collect the passkey.
        console.info('[Passkey] Tauri detected — using browser bridge for registration');
        const b64Challenge = btoa(JSON.stringify(beginData.challenge));
        const credStr = await invoke<string>("collect_passkey", { challenge_b64: b64Challenge, mode: "register" });
        credential = JSON.parse(credStr);
        if (credential.error) throw new Error(credential.error);
    } else {
        credential = await startRegistration({ optionsJSON: beginData.challenge });
    }

    return requestJson('/auth/register-passkey/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: userId,
            credential
        })
    });
}

export async function loginPasskey(email: string) {
    const beginData = await requestJson('/auth/login/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });

    let credential;
    if (isTauri()) {
        console.info('[Passkey] Tauri detected — using browser bridge for authentication');
        const b64Challenge = btoa(JSON.stringify(beginData.challenge));
        const credStr = await invoke<string>("collect_passkey", { challenge_b64: b64Challenge, mode: "login" });
        credential = JSON.parse(credStr);
        if (credential.error) throw new Error(credential.error);
    } else {
        credential = await startAuthentication({ optionsJSON: beginData.challenge });
    }

    return requestJson('/auth/login/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: beginData.user_id,
            credential
        })
    });
}

export async function getPendingUsers() {
    return requestJson('/admin/pending', { headers: authHeaders() });
}

export async function approveUser(userId: string) {
    return requestJson(`/admin/approve/${userId}`, {
        method: 'POST',
        headers: authHeaders(),
    });
}

export async function denyUser(userId: string) {
    return requestJson(`/admin/deny/${userId}`, {
        method: 'POST',
        headers: authHeaders(),
    });
}

export async function getUserDevices(userId: string) {
    return requestJson(`/admin/devices/${userId}`, { headers: authHeaders() });
}

export async function revokeAdminDevice(deviceId: string) {
    return requestJson(`/admin/revoke/${deviceId}`, {
        method: 'POST',
        headers: authHeaders(),
    });
}

export async function getAuditLogs(page: number = 1, pageSize: number = 50) {
    return requestJson(`/admin/audit?page=${page}&page_size=${pageSize}`, { headers: authHeaders() });
}

// Legacy wrappers kept for compatibility with older components/tests.
export async function approveUserLegacy(userId: string) {
    return requestJson('/admin/approve-user', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ user_id: userId })
    });
}

export async function getAllUsers() {
    return requestJson('/admin/users', { headers: authHeaders() });
}

export async function getAuditLogsLegacy() {
    return requestJson('/admin/audit-logs', { headers: authHeaders() });
}

export async function revokeDeviceLegacy(deviceId: string) {
    return requestJson('/admin/revoke-device', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ device_id: deviceId })
    });
}

export async function revokeDevice(deviceId: string) {
    return revokeAdminDevice(deviceId);
}

export async function getUsers() {
    return requestJson('/users/users', { headers: authHeaders() });
}

export async function getMyDevices() {
    return requestJson('/users/devices', { headers: authHeaders() });
}

export async function revokeOwnDevice(deviceId: string) {
    return requestJson('/users/revoke-device', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ device_id: deviceId })
    });
}

export async function uploadKeys(payload: any) {
    return requestJson('/keys/upload', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload)
    });
}

export async function getUserKeys(userId: string) {
    return requestJson(`/keys/${userId}`, { headers: authHeaders() });
}
