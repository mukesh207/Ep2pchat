import { useMemo } from "react";
import { Terminal, Cpu, Zap, Pin, Hash, Globe, LogOut, ChevronRight, BellOff, Shield } from "lucide-react";
import { motion } from "framer-motion";
import { useAuthStore } from "../../stores/useAuthStore";
import { useUIStore } from "../../stores/useUIStore";
import { useChatStore } from "../../stores/useChatStore";
import { ContextMenu } from "../ui/ContextMenu";
import { Contact } from "../../types";

function getDisplayName(contact: Contact) {
  return contact.username || contact.email;
}

function getInitials(value: string) {
  return value.trim().charAt(0).toUpperCase();
}

export const Sidebar = ({ 
  searchQuery, 
  setSearchQuery, 
  handleLogout, 
  handlePinToggle, 
  handleMuteToggle,
  pinnedContacts,
  mutedContacts,
  startChat,
  onBroadcastClick
}: any) => {
  const session = useAuthStore((state) => state.session);
  const { isNarrowLayout, isSidebarOpen, sidebarWidthPx, setShowUserSettings, setRootView } = useUIStore();
  const { contacts, allStories, presenceByContact, typingByContact, unreadByContact, lastMessageByContact, activeContact } = useChatStore();

  const groupedContacts = useMemo(() => {
    const filtered = contacts.filter((c) =>
      `${c.email} ${c.username || ""}`.toLowerCase().includes(searchQuery.toLowerCase()),
    );
    
    const pinned = filtered.filter(c => pinnedContacts.has(c.id));
    const unpinned = filtered.filter(c => !pinnedContacts.has(c.id));

    const departments: Record<string, Contact[]> = {};
    unpinned.forEach(c => {
      const dept = c.department || "General";
      if (!departments[dept]) departments[dept] = [];
      departments[dept].push(c);
    });

    return {
      pinned,
      departments: Object.entries(departments).sort(([a], [b]) => a.localeCompare(b))
    };
  }, [contacts, searchQuery, pinnedContacts]);

  const renderContact = (c: Contact) => (
    <ContextMenu
      key={c.id}
      items={[
        {
          label: "Entity Intel",
          icon: <Shield size={14} />,
          onClick: () => {
            // This would normally set active contact and show modal
            startChat(c); 
          },
        },
        {
          label: pinnedContacts.has(c.id) ? "Unpin Node" : "Pin Node",
          icon: <Pin size={14} />,
          onClick: () => handlePinToggle(c.id),
        },
        {
          label: mutedContacts.has(c.id) ? "Enable Notifications" : "Silence Node",
          icon: <BellOff size={14} />,
          onClick: () => handleMuteToggle(c.id),
        },
      ]}
    >
      <motion.div
        role="button"
        tabIndex={0}
        whileHover={{ x: 2 }}
        className={`px-4 py-2.5 cursor-pointer flex items-center gap-3 border-l-2 transition-all group relative outline-none focus-visible:bg-white/[0.05] ${
          activeContact?.id === c.id 
            ? "bg-accent-cyan/10 border-accent-cyan shadow-[inset_0_0_8px_rgba(6,182,212,0.1)]" 
            : "border-transparent hover:bg-white/[0.02]"
        }`}
        onClick={() => void startChat(c)}
      >
        <div className="relative shrink-0">
          <div className={`h-8 w-8 rounded-sm flex items-center justify-center font-mono font-bold text-xs transition-all ${
            activeContact?.id === c.id 
              ? "bg-accent-cyan text-background-primary shadow-[0_0_8px_rgba(6,182,212,0.3)]" 
              : "bg-background-primary text-text-muted border border-border-tactical group-hover:border-accent-cyan/30 group-hover:text-text-primary"
          }`}>
            {getInitials(getDisplayName(c))}
          </div>
          {presenceByContact[c.id] === "online" && (
            <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent-green border border-background-primary shadow-sm" />
          )}
          {presenceByContact[c.id] === "away" && (
            <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent-amber border border-background-primary shadow-sm" />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className={`text-[12px] font-bold truncate transition-colors uppercase tracking-wider ${
              activeContact?.id === c.id ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary"
            }`}>
              {getDisplayName(c)}
            </div>
            {mutedContacts.has(c.id) && <BellOff size={10} className="text-text-muted shrink-0 opacity-40" />}
          </div>
          <div className="text-[9px] text-text-muted truncate font-mono opacity-60">
            {typingByContact[c.id] ? (
              <span className="text-accent-cyan animate-pulse">
                [INPUT_DETECTED]
              </span>
            ) : (
              <span className="group-hover:opacity-100 transition-opacity">
                {lastMessageByContact[c.id] || "IDLE"}
              </span>
            )}
          </div>
        </div>
        
        {(unreadByContact[c.id] || 0) > 0 ? (
          <div className="h-4 min-w-[16px] px-1 rounded-sm bg-accent-cyan text-background-primary text-[9px] font-black flex items-center justify-center shadow-lg shadow-cyan-500/20 animate-pulse">
            {unreadByContact[c.id]}
          </div>
        ) : (
          <ChevronRight size={12} className={`shrink-0 transition-all ${activeContact?.id === c.id ? "opacity-100 text-accent-cyan" : "opacity-0 group-hover:opacity-40 text-text-muted"}`} />
        )}
      </motion.div>
    </ContextMenu>
  );

  return (
    <aside 
      className="tactical-sidebar flex flex-col shrink-0 z-40 relative select-none"
      style={{ width: isNarrowLayout ? '100%' : `${sidebarWidthPx}px`, display: isNarrowLayout && !isSidebarOpen ? 'none' : 'flex' }}
    >
      {/* Identity Panel */}
      <div className="p-4 border-b border-border-tactical bg-background-accent/20">
         <div className="flex items-center gap-3 mb-4">
            <div 
              className="h-10 w-10 bg-background-primary border border-border-tactical flex items-center justify-center text-accent-cyan font-mono font-bold text-lg cursor-pointer hover:border-accent-cyan/50 transition-all shadow-inner"
              onClick={() => setShowUserSettings(true)}
            >
              {getInitials(session?.username || session?.email || "U")}
            </div>
            <div className="flex-1 min-w-0" onClick={() => setShowUserSettings(true)}>
               <div className="text-[12px] font-bold text-text-primary truncate uppercase tracking-wider">{session?.username || "ANONYMOUS_NODE"}</div>
               <div className="flex items-center gap-1.5 mt-0.5">
                  <div className={`status-dot ${presenceByContact[session?.userId || ""] === 'online' ? 'bg-accent-green' : 'bg-text-muted'}`} />
                  <span className="text-[9px] font-bold text-text-muted uppercase tracking-tighter">{session?.department || "External"} // {presenceByContact[session?.userId || ""] || "OFFLINE"}</span>
               </div>
            </div>
            <button 
              className="p-1.5 text-text-muted hover:text-accent-red hover:bg-accent-red/5 transition-all rounded-sm border border-transparent hover:border-accent-red/20"
              onClick={handleLogout}
            >
              <LogOut size={14} />
            </button>
         </div>
         
         <div className="relative group">
            <Terminal className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent-cyan transition-colors" size={12} />
            <input
              id="contact-search"
              className="w-full bg-background-primary/50 border border-border-tactical rounded-sm py-1.5 pl-8 pr-3 text-[11px] font-mono placeholder:text-text-muted/40 focus:outline-none focus:border-accent-cyan/40 transition-all"
              placeholder="FILTER_NODES..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
         </div>
      </div>

      <div className="px-2 py-4 flex flex-col gap-1">
        {session?.role === "ADMIN" && (
          <button
            id="admin-btn"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-sm text-accent-purple hover:bg-accent-purple/5 transition-all font-bold text-[10px] uppercase tracking-[0.1em] border border-transparent hover:border-accent-purple/20"
            onClick={() => setRootView("ADMIN")}
          >            <Cpu size={14} /> Intelligence Center
          </button>
        )}
        <button
          className="w-full flex items-center gap-3 px-3 py-2 rounded-sm text-text-muted hover:text-text-primary hover:bg-background-accent/50 transition-all font-bold text-[10px] uppercase tracking-[0.1em] border border-transparent hover:border-border-tactical"
          onClick={onBroadcastClick}
        >
          <Zap size={14} /> Broadcast Update
        </button>      </div>

      <div className="segmented-divider mb-4 opacity-50" />

      {/* Stories */}
      <div className="px-4 mb-4 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {Array.from(new Set(allStories.map((s: any) => s.user_id))).map(uid => {
          const contact = contacts.find((c: any) => c.id === uid);
          if (!contact) return null;
          return (
            <motion.button 
              key={uid as string} 
              whileHover={{ scale: 1.1 }}
              className="h-8 w-8 shrink-0 border border-accent-cyan p-[1px] bg-background-primary rounded-sm"
              title={getDisplayName(contact)}
            >
              <div className="h-full w-full bg-background-accent flex items-center justify-center text-[10px] font-bold text-accent-cyan">
                {getInitials(getDisplayName(contact))}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Roster */}
      <div className="flex-1 overflow-y-auto custom-scrollbar py-2 space-y-4">
        {groupedContacts.pinned.length > 0 && (
           <div className="space-y-1">
             <div className="px-4 mb-2 flex items-center justify-between">
                <span className="telemetry-label text-accent-amber">Priority Nodes</span>
                <Pin size={10} className="text-accent-amber opacity-50" />
             </div>
             {groupedContacts.pinned.map(renderContact)}
           </div>
        )}

        {groupedContacts.departments.map(([dept, people]: any) => (
          <div key={dept} className="space-y-1">
            <div className="px-4 mb-2 flex items-center justify-between">
                <span className="telemetry-label">{dept}</span>
                <Hash size={10} className="text-text-muted opacity-30" />
            </div>
            {people.map(renderContact)}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="p-3 bg-background-accent border-t border-border-tactical flex items-center justify-between">
          <div className="flex items-center gap-2">
             <Globe size={12} className="text-text-muted" />
             <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Enclave Status</span>
          </div>
          <div className="flex items-center gap-1.5 bg-accent-green/5 border border-accent-green/20 px-1.5 py-0.5 rounded-[2px]">
             <div className="status-dot bg-accent-green shadow-[0_0_4px_rgba(16,185,129,1)]" />
             <span className="text-[8px] font-bold text-accent-green uppercase">Secure</span>
          </div>
      </div>
    </aside>
  );
};
