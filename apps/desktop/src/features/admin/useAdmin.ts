import { useCallback } from "react";
import * as api from "../../api";

export type PendingUser = {
  id: string;
  email: string;
  username?: string | null;
  requested_at?: string;
};

export type AdminUser = {
  id: string;
  email: string;
  username?: string | null;
  status?: string;
  device_count?: number;
  department?: string | null;
};

export type AdminDevice = {
  id: string;
  device_name: string;
  alias?: string | null;
  registered_at: string;
  last_seen: string;
  is_active: boolean;
};

export type AuditLogRow = {
  id: string;
  created_at: string;
  actor_email?: string | null;
  action: string;
  target?: string;
  details: Record<string, unknown>;
};

export function useAdmin(options?: {
  currentDeviceId?: string | null;
  onRevocation?: () => void;
}) {
  const currentDeviceId = options?.currentDeviceId ?? null;
  const onRevocation = options?.onRevocation;

  const fetchPending = useCallback(async (): Promise<PendingUser[]> => {
    const response = await api.getPendingUsers();
    return (response.users ?? []) as PendingUser[];
  }, []);

  const approveUser = useCallback(async (userId: string): Promise<void> => {
    await api.approveUser(userId);
  }, []);

  const denyUser = useCallback(async (userId: string): Promise<void> => {
    await api.denyUser(userId);
  }, []);

  const fetchUsers = useCallback(async (): Promise<AdminUser[]> => {
    const response = await api.getAllUsers();
    return (response.users ?? []) as AdminUser[];
  }, []);

  const fetchUserDevices = useCallback(async (userId: string): Promise<AdminDevice[]> => {
    const response = await api.getUserDevices(userId);
    return (response.devices ?? []) as AdminDevice[];
  }, []);

  const revokeDevice = useCallback(
    async (deviceId: string): Promise<void> => {
      await api.revokeAdminDevice(deviceId);
      if (currentDeviceId && currentDeviceId === deviceId) {
        onRevocation?.();
      }
    },
    [currentDeviceId, onRevocation],
  );

  const fetchAuditLog = useCallback(
    async (page: number): Promise<{ logs: AuditLogRow[]; page: number; page_size: number }> => {
      const response = await api.getAuditLogs(page, 25);
      return {
        logs: (response.logs ?? []) as AuditLogRow[],
        page: response.page ?? page,
        page_size: response.page_size ?? 25,
      };
    },
    [],
  );

  const approveBulk = useCallback(async (userIds: string[]): Promise<void> => {
    await api.approveBulk(userIds);
  }, []);

  const denyBulk = useCallback(async (userIds: string[]): Promise<void> => {
    await api.denyBulk(userIds);
  }, []);

  const updateDeviceAlias = useCallback(async (deviceId: string, alias: string): Promise<void> => {
    await api.updateDeviceAlias(deviceId, alias);
  }, []);

  const nukeDevice = useCallback(async (deviceId: string): Promise<void> => {
    await api.nukeDevice(deviceId);
    if (currentDeviceId && currentDeviceId === deviceId) {
      onRevocation?.();
    }
  }, [currentDeviceId, onRevocation]);

  const fetchOrgSettings = useCallback(async (): Promise<api.OrgSettings> => {
    return await api.getOrgSettings();
  }, []);

  const updateOrgSettings = useCallback(async (settings: Partial<api.OrgSettings>): Promise<void> => {
    await api.updateOrgSettings(settings);
  }, []);

  const updateUserDepartment = useCallback(async (userId: string, department: string): Promise<void> => {
    await api.requestJson(`/admin/users/${userId}/department`, {
        method: 'POST',
        headers: api.authHeaders(),
        body: JSON.stringify({ department })
    });
  }, []);

  return {
    fetchPending,
    approveUser,
    denyUser,
    fetchUsers,
    fetchUserDevices,
    revokeDevice,
    fetchAuditLog,
    approveBulk,
    denyBulk,
    updateDeviceAlias,
    nukeDevice,
    fetchOrgSettings,
    updateOrgSettings,
    updateUserDepartment,
  };
}
