import { useState } from 'react';
import * as api from '../infrastructure/api';
import { useAuthStore } from '../stores/useAuthStore';
import { useChatStore } from '../stores/useChatStore';
import { useToast } from '../components/ui/Toast';

export function useProfileWorkflows() {
  const { addToast } = useToast();
  const { session, setSession } = useAuthStore();
  const { setPresenceByContact } = useChatStore();
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isRevokingDevice, setIsRevokingDevice] = useState<string | null>(null);
  const [myDevices, setMyDevices] = useState<any[]>([]);

  const refreshMyDevices = async () => {
    try {
      const res = await api.getMyDevices();
      setMyDevices(res.devices || []);
    } catch {}
  };

  const handleSaveProfile = async (username: string, department: string) => {
    setIsSavingProfile(true);
    try {
      await api.updateProfile({ username, department });
      setSession(session ? { ...session, username, department } : null);
      addToast("Profile updated successfully", "success");
    } catch (err: any) {
      addToast("Failed to update profile: " + err.message, "error");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePresenceChange = async (status: "online" | "away" | "offline") => {
    try {
      await api.updateProfile({ presence_status: status });
      if (session?.userId) {
        setPresenceByContact((prev: any) => ({ ...prev, [session.userId]: status }));
      }
      addToast(`Status updated to ${status}`, "success");
    } catch (err: any) {
      addToast("Failed to update presence: " + err.message, "error");
    }
  };

  const handleRevokeOwnDevice = async (deviceId: string) => {
    setIsRevokingDevice(deviceId);
    try {
      await api.revokeOwnDevice(deviceId);
      await refreshMyDevices();
      addToast("Device revoked", "success");
    } catch (err: any) {
      addToast("Failed to revoke device: " + err.message, "error");
    } finally {
      setIsRevokingDevice(null);
    }
  };

  return { 
    isSavingProfile, 
    isRevokingDevice, 
    myDevices, 
    setMyDevices,
    refreshMyDevices, 
    handleSaveProfile, 
    handlePresenceChange, 
    handleRevokeOwnDevice 
  };
}
