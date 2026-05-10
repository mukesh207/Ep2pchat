import type { KeyUploadPayload } from '../types';
import { API_BASE_URL, ADMIN_BOOTSTRAP_SETUP_TOKEN } from '../constants/config';
import { AppError, ErrorCategory } from '../utils/errors';

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
    let res: Response;
    try {
        res = await fetch(`${API_BASE_URL}${path}`, init);
    } catch (err) {
        throw new AppError("Network request failed", ErrorCategory.NETWORK, { details: err });
    }

    const data = await res.json().catch(() => ({}));
    
    if (!res.ok) {
        const msg = data?.error || `Request failed with status ${res.status}`;
        
        if (res.status === 401) throw new AppError(msg, ErrorCategory.AUTH);
        if (res.status === 403) throw new AppError(msg, ErrorCategory.FORBIDDEN);
        if (msg === "MAINTENANCE_MODE") throw new AppError(msg, ErrorCategory.MAINTENANCE);
        if (res.status >= 500) throw new AppError(msg, ErrorCategory.SERVER);
        
        throw new AppError(msg, ErrorCategory.VALIDATION, { code: String(res.status) });
    }

    if (data?.error) {
        if (data.error === "MAINTENANCE_MODE") throw new AppError(data.error, ErrorCategory.MAINTENANCE);
        throw new AppError(data.error, ErrorCategory.VALIDATION);
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

export async function logout() {
    return requestJson('/auth/logout', {
        method: 'POST',
        headers: authHeaders(),
    });
}

export async function registerDevice(payload: {
    email: string,
    access_code: string,
    device_name: string,
    identity_key: string,
    signed_pre_key: string,
    signed_pre_key_sig: string
}) {
    return requestJson('/auth/register-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

export async function loginChallenge(email: string) {
    return requestJson('/auth/login/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
}

export async function loginVerify(payload: {
    user_id: string,
    device_id: string,
    signature: string,
    challenge: string
}) {
    return requestJson('/auth/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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

export interface AuditFilters {
    action?: string;
    email?: string;
    start_date?: string;
    end_date?: string;
}

export async function getAuditLogs(page: number = 1, pageSize: number = 50, filters: AuditFilters = {}) {
    let url = `/admin/audit?page=${page}&page_size=${pageSize}`;
    if (filters.action) url += `&action=${encodeURIComponent(filters.action)}`;
    if (filters.email) url += `&email=${encodeURIComponent(filters.email)}`;
    if (filters.start_date) url += `&start_date=${encodeURIComponent(filters.start_date)}`;
    if (filters.end_date) url += `&end_date=${encodeURIComponent(filters.end_date)}`;
    
    return requestJson(url, { headers: authHeaders() });
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

export async function updateProfile(payload: Partial<{ username: string, department: string, presence_status: string }>) {
    return requestJson('/users/profile', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(payload)
    });
}

export async function uploadStory(ciphertextB64: string, nonceB64: string) {
    return requestJson('/stories', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ciphertext_b64: ciphertextB64, nonce_b64: nonceB64 })
    });
}

export async function fetchStories() {
    return requestJson('/stories', { headers: authHeaders() });
}

export async function logSecurityEvent(action: string, details: any) {
    return requestJson('/users/audit/log-event', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ action, details })
    });
}

