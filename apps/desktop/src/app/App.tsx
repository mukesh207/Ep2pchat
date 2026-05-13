import { useState, useEffect, useRef } from "react";
import { X, Settings, Loader2, Save, Monitor, Smartphone, ShieldOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "../stores/useAuthStore";
import { useUIStore } from "../stores/useUIStore";
import { useChatStore } from "../stores/useChatStore";
import { useAppInitialization } from "../hooks/useAppInitialization";
import { useChatWorkflows } from "../hooks/useChatWorkflows";
import { useProfileWorkflows } from "../hooks/useProfileWorkflows";
import { useStoryWorkflows } from "../features/stories/useStoryWorkflows";
import { MainShell } from "../layouts/MainShell";
import AuthFlow from "../features/auth/AuthFlow";
import OnboardingWizard from "../features/auth/OnboardingWizard";
import ChatArena from "../features/chat/ChatArena";
import AdminPanel from "../features/admin/AdminPanel";
import IdentityModal from "../features/chat/IdentityModal";
import { ToastProvider } from "../components/ui/Toast";
import { ConfirmProvider, useConfirm } from "../components/ui/ConfirmDialog";
import "../styles/App.css";

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppInternal />
      </ConfirmProvider>
    </ToastProvider>
  );
}

function AppInternal() {
  const confirm = useConfirm();
  const { rootView, setRootView, showUserSettings, setShowUserSettings, showIdentityModal, setShowIdentityModal } = useUIStore();
  const { session, myDeviceId, localKeys } = useAuthStore();
  
  // ChatArena and useChat hooks expect localKeys as a ref to avoid stale closures.
  const localKeysRef = useRef(localKeys);
  useEffect(() => {
    localKeysRef.current = localKeys;
  }, [localKeys]);

  const { 
    activeContact, 
    messages, 
    setMessages, 
    handshakeStatus, 
    typingByContact, 
    presenceByContact, 
    setLastMessageByContact 
  } = useChatStore();
  
  const { handleAuthenticated, handleLogout } = useAppInitialization();
  const { mutedContacts, pinnedContacts, handleMuteToggle, handlePinToggle, startChat } = useChatWorkflows();
  const { isSavingProfile, isRevokingDevice, myDevices, refreshMyDevices, handleSaveProfile, handleRevokeOwnDevice } = useProfileWorkflows();
  const { isPostingStory, showStoryCreator, setShowStoryCreator, storyText, setStoryText, handlePostStory } = useStoryWorkflows();

  const [editUsername, setEditUsername] = useState("");
  const [editDepartment, setEditDepartment] = useState("");

  useEffect(() => {
    if (showUserSettings) {
      void refreshMyDevices();
      setEditUsername(session?.username || "");
      setEditDepartment(session?.department || "");
    }
  }, [showUserSettings, session]);

  if (rootView === "AUTH") {
    return <AuthFlow onAuthenticated={handleAuthenticated} />;
  }

  if (rootView === "ADMIN") {
    return (
      <AdminPanel
        onBack={() => setRootView(session ? "CHAT" : "AUTH")}
      />
    );
  }

  if (rootView === "ONBOARDING" && session) {
    return (
      <OnboardingWizard
        email={session.email}
        onComplete={(username, department) => {
          handleAuthenticated(session.userId, session.orgId, session.email, myDeviceId!, localKeys!, session.role, username, department);
        }}
      />
    );
  }

  return (
    <MainShell
      onLogout={() => handleLogout(confirm)}
      onPinToggle={handlePinToggle}
      onMuteToggle={handleMuteToggle}
      pinnedContacts={pinnedContacts}
      mutedContacts={mutedContacts}
      startChat={startChat}
      onBroadcastClick={() => setShowStoryCreator(true)}
    >      <ChatArena
        activeContact={activeContact}
        handshakeStatus={handshakeStatus}
        messages={messages}
        setMessages={setMessages}
        typingByContact={typingByContact}
        presenceByContact={presenceByContact}
        localKeys={localKeysRef}
        setLastMessageByContact={setLastMessageByContact}
        showContactDetail={() => setShowIdentityModal(true)}
      />

      {/* User Settings Drawer */}
      <AnimatePresence>
        {showUserSettings && (
          <div className="fixed inset-0 z-[100] flex justify-end">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowUserSettings(false)}
            />
            
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-[440px] h-full bg-background-secondary border-l border-border-tactical shadow-2xl flex flex-col"
            >
              <header className="h-12 border-b border-border-tactical flex items-center justify-between px-6 shrink-0 bg-background-primary">
                <div className="flex items-center gap-3">
                   <Settings size={14} className="text-accent-cyan" />
                   <span className="text-[11px] font-bold text-text-primary uppercase tracking-[0.2em]">System_Configuration</span>
                </div>
                <button className="h-8 w-8 rounded-sm flex items-center justify-center text-text-muted hover:text-accent-red transition-all" onClick={() => setShowUserSettings(false)}>
                  <X size={16} />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scrollbar">
                <section className="space-y-6">
                  <h4 className="telemetry-label text-accent-cyan border-b border-border-tactical pb-2">Identity Profile</h4>
                  <div className="space-y-5">
                    <div className="space-y-1.5">
                      <label className="telemetry-label">Assigned Alias</label>
                      <input className="input-tactical" value={editUsername} onChange={e => setEditUsername(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="telemetry-label">Sector Assignment</label>
                      <input className="input-tactical" value={editDepartment} onChange={e => setEditDepartment(e.target.value)} />
                    </div>
                    <button className="btn-tactical btn-tactical-primary w-full py-3" onClick={() => handleSaveProfile(editUsername, editDepartment)} disabled={isSavingProfile}>
                      {isSavingProfile ? <Loader2 size={16} className="animate-spin" /> : <Save size={14} />} Sync Identity
                    </button>
                  </div>
                </section>
                
                <section className="space-y-6">
                  <h4 className="telemetry-label text-accent-cyan border-b border-border-tactical pb-2">Authorized Nodes</h4>
                  <div className="space-y-2">
                    {myDevices.map(d => (
                      <div key={d.id} className="p-3 border border-border-tactical bg-background-primary flex items-center justify-between group/dev">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 bg-background-secondary border border-border-tactical flex items-center justify-center text-text-muted group-hover/dev:text-accent-cyan">
                             {d.device_name?.toLowerCase().includes('mobile') ? <Smartphone size={14} /> : <Monitor size={14} />}
                          </div>
                          <div className="text-[11px] font-bold text-text-primary uppercase">{d.device_name}</div>
                        </div>
                        {d.id !== myDeviceId && (
                          <button className="h-7 w-7 flex items-center justify-center text-text-muted hover:text-accent-red" onClick={() => handleRevokeOwnDevice(d.id)} disabled={isRevokingDevice === d.id}>
                            <ShieldOff size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <footer className="p-6 border-t border-border-tactical bg-background-primary">
                <button className="btn-tactical bg-accent-red/10 text-accent-red border border-accent-red/20 w-full py-3 text-[10px] font-black" onClick={() => handleLogout(confirm)}>
                  TERMINATE_SESSION
                </button>
              </footer>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Identity Modal */}
      {showIdentityModal && activeContact && localKeys && (
        <IdentityModal
          contact={activeContact}
          localKeys={localKeys}
          onClose={() => setShowIdentityModal(false)}
        />
      )}

      {/* Story Creator */}
      <AnimatePresence>
        {showStoryCreator && (
          <div className="modal-overlay-tactical z-[200]">
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="modal-content-tactical p-6 bg-background-secondary border-t-2 border-t-accent-cyan">
              <textarea className="input-tactical min-h-[120px] text-center text-lg font-mono" placeholder="[SYSTEM_BROADCAST_READY]" value={storyText} onChange={e => setStoryText(e.target.value)} />
              <div className="mt-6 flex gap-2">
                 <button className="btn-tactical btn-tactical-secondary flex-1" onClick={() => setShowStoryCreator(false)}>Abort</button>
                 <button className="btn-tactical btn-tactical-primary flex-[2]" onClick={() => handlePostStory(storyText)} disabled={isPostingStory}>Transmit_Broadcast</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Story Viewer Placeholder (Needs integration) */}
    </MainShell>
  );
}
