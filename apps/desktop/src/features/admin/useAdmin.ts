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
};

export type AdminDevice = {
  id: string;
  device_name: string;
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

  return {
    fetchPending,
    approveUser,
    denyUser,
    fetchUsers,
    fetchUserDevices,
    revokeDevice,
    fetchAuditLog,
  };
}
