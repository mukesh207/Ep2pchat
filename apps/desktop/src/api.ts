import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { invoke } from '@tauri-apps/api/core';
import type { KeyUploadPayload } from './types';
import { API_BASE_URL, ADMIN_BOOTSTRAP_SETUP_TOKEN } from './lib/config';

let authToken = "";

export function setToken(token: string) {
    authToken = token;
}

export function getToken() {
    return authToken;
}

export function authHeaders() {
    return {
        'Content-Type': 'application/json',
        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
    };
}

export async function requestJson(path: string, init?: RequestInit) {
    const res = await fetch(`${API_BASE_URL}${path}`, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) {
        throw new Error(data?.error || `Request failed with status ${res.status}`);
    }
    return data;
}

export function canAttemptAdminBootstrap(): boolean {
    return ADMIN_BOOTSTRAP_SETUP_TOKEN.length > 0;
}

export async function checkServerHealth(): Promise<boolean> {
    try {
        // The health endpoint is at the root /health, not /api/v1/health
        const url = API_BASE_URL.replace("/api/v1", "/health");
        const res = await fetch(url);
        return res.ok;
    } catch {
        return false;
    }
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
        body: JSON.stringify({
            email,
            setup_token: ADMIN_BOOTSTRAP_SETUP_TOKEN || undefined,
        })
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

export async function approveBulk(userIds: string[]) {
    return requestJson('/admin/bulk-approve', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ user_ids: userIds })
    });
}

export async function denyBulk(userIds: string[]) {
    return requestJson('/admin/bulk-deny', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ user_ids: userIds })
    });
}

export async function updateDeviceAlias(deviceId: string, alias: string) {
    return requestJson(`/admin/devices/${deviceId}/alias`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ alias })
    });
}

export async function nukeDevice(deviceId: string) {
    return requestJson(`/admin/devices/${deviceId}/nuke`, {
        method: 'POST',
        headers: authHeaders(),
    });
}

export interface OrgSettings {
    audit_retention_days: number;
    force_rls: boolean;
    branding: {
        primary_color: string;
        workspace_name: string;
    };
    is_maintenance_mode: boolean;
}

export async function getOrgSettings(): Promise<OrgSettings> {
    return requestJson('/admin/settings', { headers: authHeaders() });
}

export async function updateOrgSettings(settings: Partial<OrgSettings>) {
    return requestJson('/admin/settings', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(settings)
    });
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

export async function uploadKeys(payload: KeyUploadPayload) {
    return requestJson('/keys/upload', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload)
    });
}

export async function getUserKeys(userId: string) {
    return requestJson(`/keys/${userId}`, { headers: authHeaders() });
}

export async function logSecurityEvent(action: string, details: any) {
    return requestJson('/users/audit/log-event', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action, details })
    });
}

