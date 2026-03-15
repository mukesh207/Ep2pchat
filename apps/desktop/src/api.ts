import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

const API_BASE = 'http://localhost:3000/api/v1';

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

export async function requestAccess(email: string) {
    const res = await fetch(`${API_BASE}/auth/request-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
    return res.json();
}

export async function registerPasskey(userId: string) {
    const beginRes = await fetch(`${API_BASE}/auth/register-passkey/begin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
    });
    const beginData = await beginRes.json();
    if (beginData.error) throw new Error(beginData.error);

    const credential = await startRegistration({ optionsJSON: beginData.challenge });

    const completeRes = await fetch(`${API_BASE}/auth/register-passkey/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: userId,
            credential
        })
    });
    return completeRes.json();
}

export async function loginPasskey(email: string) {
    const beginRes = await fetch(`${API_BASE}/auth/login/begin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
    const beginData = await beginRes.json();
    if (beginData.error) throw new Error(beginData.error);

    const credential = await startAuthentication({ optionsJSON: beginData.challenge });

    const completeRes = await fetch(`${API_BASE}/auth/login/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: beginData.user_id,
            credential
        })
    });
    return completeRes.json();
}

export async function getPendingUsers() {
    const res = await fetch(`${API_BASE}/admin/pending-users`, { headers: authHeaders() });
    return res.json();
}

export async function approveUser(userId: string) {
    const res = await fetch(`${API_BASE}/admin/approve-user`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ user_id: userId })
    });
    return res.json();
}

export async function getAllUsers() {
    const res = await fetch(`${API_BASE}/admin/users`, { headers: authHeaders() });
    return res.json();
}

export async function getAuditLogs() {
    const res = await fetch(`${API_BASE}/admin/audit-logs`, { headers: authHeaders() });
    return res.json();
}

export async function revokeDevice(deviceId: string) {
    const res = await fetch(`${API_BASE}/admin/revoke-device`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ device_id: deviceId })
    });
    return res.json();
}

export async function getUsers() {
    const res = await fetch(`${API_BASE}/users/users`, { headers: authHeaders() });
    return res.json();
}

export async function uploadKeys(payload: any) {
    const res = await fetch(`${API_BASE}/keys/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload)
    });
    return res.json();
}

export async function getUserKeys(userId: string) {
    const res = await fetch(`${API_BASE}/keys/${userId}`, { headers: authHeaders() });
    return res.json();
}
