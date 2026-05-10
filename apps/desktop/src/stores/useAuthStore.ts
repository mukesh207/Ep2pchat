import { create } from 'zustand';
import { SessionState, LocalKeys } from '../types';

interface AuthState {
  session: SessionState | null;
  localKeys: LocalKeys | null;
  myDeviceId: string | null;
  setSession: (session: SessionState | null) => void;
  setLocalKeys: (keys: LocalKeys | null) => void;
  setMyDeviceId: (deviceId: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  localKeys: null,
  myDeviceId: null,
  setSession: (session) => set({ session }),
  setLocalKeys: (localKeys) => set({ localKeys }),
  setMyDeviceId: (myDeviceId) => set({ myDeviceId }),
  logout: () => set({ session: null, localKeys: null, myDeviceId: null }),
}));
