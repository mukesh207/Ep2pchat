import { create } from 'zustand';
import { RootView } from '../types';

interface UIState {
  rootView: RootView;
  sidebarWidthPx: number;
  isSidebarOpen: boolean;
  showUserSettings: boolean;
  showIdentityModal: boolean;
  securityStatus: 'protected' | 'alert' | 'danger';
  isNarrowLayout: boolean;
  adminRefreshTrigger: number;
  
  setRootView: (view: RootView) => void;
  setSidebarWidthPx: (width: number) => void;
  setIsSidebarOpen: (isOpen: boolean) => void;
  setShowUserSettings: (show: boolean) => void;
  setShowIdentityModal: (show: boolean) => void;
  setSecurityStatus: (status: 'protected' | 'alert' | 'danger') => void;
  setIsNarrowLayout: (isNarrow: boolean) => void;
  triggerAdminRefresh: () => void;
}

const SIDEBAR_DEFAULT_WIDTH = 260;

export const useUIStore = create<UIState>((set) => ({
  rootView: 'AUTH',
  sidebarWidthPx: SIDEBAR_DEFAULT_WIDTH,
  isSidebarOpen: false,
  showUserSettings: false,
  showIdentityModal: false,
  securityStatus: 'protected',
  isNarrowLayout: false,
  adminRefreshTrigger: 0,

  setRootView: (rootView) => set({ rootView }),
  setSidebarWidthPx: (sidebarWidthPx) => set({ sidebarWidthPx }),
  setIsSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
  setShowUserSettings: (showUserSettings) => set({ showUserSettings }),
  setShowIdentityModal: (showIdentityModal) => set({ showIdentityModal }),
  setSecurityStatus: (securityStatus) => set({ securityStatus }),
  setIsNarrowLayout: (isNarrowLayout) => set({ isNarrowLayout }),
  triggerAdminRefresh: () => set((state) => ({ adminRefreshTrigger: state.adminRefreshTrigger + 1 })),
}));
