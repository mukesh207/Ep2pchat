import React, { useRef } from 'react';
import { CommandBar } from '../components/layout/CommandBar';
import { Sidebar } from '../components/layout/Sidebar';
import { useUIStore } from '../stores/useUIStore';
import Layout from './Layout';

interface MainShellProps {
  children: React.ReactNode;
  onLogout: () => void;
  onPinToggle: (id: string) => void;
  onMuteToggle: (id: string) => void;
  pinnedContacts: Set<string>;
  mutedContacts: Set<string>;
  startChat: (contact: any) => void;
  onBroadcastClick: () => void;
}

export const MainShell: React.FC<MainShellProps> = ({
  children, onLogout, onPinToggle, onMuteToggle, pinnedContacts, mutedContacts, startChat, onBroadcastClick
}) => {  const { sidebarWidthPx, setSidebarWidthPx, isNarrowLayout, securityStatus } = useUIStore();
  const sidebarResizeState = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleSidebarResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isNarrowLayout) return;
    event.preventDefault();
    sidebarResizeState.current = { startX: event.clientX, startWidth: sidebarWidthPx };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!sidebarResizeState.current) return;
      const delta = e.clientX - sidebarResizeState.current.startX;
      const nextWidth = Math.min(420, Math.max(220, sidebarResizeState.current.startWidth + delta));
      setSidebarWidthPx(nextWidth);
    };

    const handleMouseUp = () => {
      sidebarResizeState.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <Layout securityStatus={securityStatus}>
      <div className="flex flex-col h-screen overflow-hidden bg-background-primary font-sans text-text-primary">
        <CommandBar />

        <div className="flex flex-1 overflow-hidden relative">
          <Sidebar
            searchQuery=""
            setSearchQuery={() => {}}
            handleLogout={onLogout}
            handlePinToggle={onPinToggle}
            handleMuteToggle={onMuteToggle}
            pinnedContacts={pinnedContacts}
            mutedContacts={mutedContacts}
            startChat={startChat}
            onBroadcastClick={onBroadcastClick}
          />
          {!isNarrowLayout && (
            <div
              className="w-[1px] bg-border-tactical hover:bg-accent-cyan/40 cursor-col-resize transition-all z-50"
              onMouseDown={handleSidebarResizeStart}
            />
          )}

          <div className="flex-1 flex flex-col min-w-0">
            {children}
          </div>
        </div>
      </div>
    </Layout>
  );
};
