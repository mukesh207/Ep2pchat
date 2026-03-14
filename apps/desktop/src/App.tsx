import { useState, useEffect, useRef } from "react";
import * as api from "./api";
import * as crypto from "./lib/crypto";
import * as vault from "./lib/vault";
import { socket, WsMessage } from "./lib/socket";
import "./App.css";

function App() {
  const [email, setEmail] = useState("");
  const [view, setView] = useState<"HOME" | "WAITING" | "REGISTER" | "DASHBOARD" | "ADMIN" | "CHAT">("HOME");
  const [userId, setUserId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [error, setError] = useState("");
  
  const [contacts, setContacts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeContact, setActiveContact] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState("");
  const [isHandshaking, setIsHandshaking] = useState(false);

  const localKeys = useRef<crypto.KeyBundle | null>(null);
  const myDeviceId = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkKeys = async () => {
        const keys = await vault.getLocalKeys();
        if (keys) {
            localKeys.current = {
                identity_public: keys.identity_public,
                identity_secret: keys.identity_secret,
                signed_pre_key_public: keys.signed_pre_key_public,
                signed_pre_key_secret: keys.signed_pre_key_secret,
                signed_pre_key_signature: keys.signed_pre_key_signature,
                one_time_pre_keys: []
            };
        }
    };
    checkKeys();

    socket.onMessage((msg: WsMessage) => {
      if (msg.type === "MESSAGE_RECEIVE") {
        handleIncomingMessage(msg.payload);
      }
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleIncomingMessage = async (payload: any) => {
    if (!localKeys.current) return;

    try {
      const plaintext = await crypto.bobDecrypt(
        localKeys.current.identity_secret,
        localKeys.current.signed_pre_key_secret,
        null, 
        payload.sender_identity_key,
        payload.ephemeral_public_key,
        payload.ciphertext,
        payload.nonce
      );

      const newMsg = {
        id: payload.message_id,
        sender: payload.sender_device_id,
        text: plaintext,
        timestamp: payload.timestamp,
        is_me: false
      };

      await vault.saveMessage(newMsg);
      setMessages(prev => [...prev, newMsg]);
    } catch (err) {
      console.error("Failed to decrypt:", err);
    }
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await api.requestAccess(email);
      if (res.error) throw new Error(res.error);
      setUserId(res.user_id);
      if (res.status === "active") {
         await handleLogin(email, res.user_id);
      } else {
         setView("WAITING");
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogin = async (loginEmail: string, uid: string) => {
    try {
      const res = await api.loginPasskey(loginEmail);
      if (res.error) throw new Error(res.error);
      setUserId(uid);
      setOrgId(res.org_id);
      
      if (!localKeys.current) {
         setView("REGISTER");
      } else {
         startSession();
      }
    } catch(err: any) {
      setError("Login failed. " + err.message);
      if (err.message.includes("No passkeys found") && uid) {
         setView("REGISTER");
      }
    }
  };

  const handleRegisterPasskey = async () => {
    if (!userId || !orgId) return;
    setError("");
    try {
       const keys = await crypto.generateKeys();
       localKeys.current = keys;
       await vault.saveLocalKeys(keys);

       const uploadRes = await api.uploadKeys({
          user_id: userId,
          org_id: orgId,
          device_name: "Desktop App",
          identity_key: keys.identity_public,
          signed_pre_key: keys.signed_pre_key_public,
          signed_pre_key_sig: keys.signed_pre_key_signature,
          one_time_pre_keys: keys.one_time_pre_keys.map(k => ({ key_id: k.key_id, public_key: k.public_key }))
       });
       if (uploadRes.error) throw new Error(uploadRes.error);
       myDeviceId.current = uploadRes.device_id;

       const res = await api.registerPasskey(userId);
       if (res.error) throw new Error(res.error);
       
       startSession();
    } catch (err: any) {
       setError(err.message);
    }
  };

  const startSession = async () => {
    socket.connect();
    const res = await api.getUsers();
    if (res.users) setContacts(res.users);
    setView("DASHBOARD");
  };

  const startChat = async (contact: any) => {
    setIsHandshaking(true);
    setActiveContact(contact);
    setView("CHAT");
    const history = await vault.getMessages(contact.id) as any[];
    setMessages(history.map(m => ({
        id: m.id,
        sender: m.is_me ? "me" : m.sender_id,
        text: m.content,
        timestamp: m.timestamp
    })));

    try {
        const res = await api.getUserKeys(contact.id);
        contact.devices = res.devices;
        // Artificial delay to show "Establishing..."
        setTimeout(() => setIsHandshaking(false), 800);
    } catch (err) {
        setError("Failed to fetch contact keys");
        setIsHandshaking(false);
    }
  };

  const filteredContacts = contacts.filter(c => c.email.toLowerCase().includes(searchQuery.toLowerCase()));

  const sendMessage = async () => {
    if (!inputText || !activeContact || !localKeys.current) return;

    const targetDevice = activeContact.devices[0];
    if (!targetDevice) return;

    try {
      const [ephemeralPk, payload] = await crypto.aliceEncrypt(
        localKeys.current.identity_secret,
        targetDevice.identity_key,
        targetDevice.signed_pre_key,
        targetDevice.one_time_pre_key?.public_key || null,
        inputText
      );

      socket.send("MESSAGE_SEND", {
        recipient_device_id: targetDevice.device_id,
        ciphertext: payload.ciphertext,
        ephemeral_public_key: ephemeralPk,
        nonce: payload.nonce
      });

      const tempId = Math.random().toString(36).substring(7);
      const myMsg = {
        id: tempId,
        sender: "me",
        text: inputText,
        timestamp: new Date().toISOString(),
        is_me: true
      };
      await vault.saveMessage(myMsg);

      setMessages(prev => [...prev, myMsg]);
      setInputText("");
    } catch (err) {
      console.error("Encryption failed:", err);
    }
  };

  if (view === "HOME" || view === "WAITING" || view === "REGISTER") {
      return (
          <div className="onboarding-screen">
              <h2>Trustline</h2>
              {error && <div className="error-banner">{error}</div>}
              
              {view === "HOME" && (
                  <form onSubmit={handleRequestAccess}>
                      <input 
                          type="email" 
                          value={email} 
                          onChange={e => setEmail(e.target.value)} 
                          placeholder="Corporate Email" 
                          required 
                      />
                      <button type="submit">Enter Workspace</button>
                      <button type="button" style={{background: 'transparent', border: '1px solid var(--border-color)'}} onClick={() => setView("ADMIN")}>Admin Access</button>
                  </form>
              )}

              {view === "WAITING" && (
                  <div>
                      <p style={{color: 'var(--accent-teal)'}}>Identity Pending Approval</p>
                      <p>Please contact your IT administrator to activate your account.</p>
                      <button onClick={() => setView("HOME")}>Back</button>
                  </div>
              )}

              {view === "REGISTER" && (
                  <div>
                      <p>Account Approved.</p>
                      <p style={{color: 'var(--text-secondary)'}}>Generating your cryptographic identity keys...</p>
                      <button onClick={handleRegisterPasskey}>Initialize Secure Vault</button>
                  </div>
              )}
          </div>
      );
  }

  if (view === "ADMIN") {
      return <AdminPanel onBack={() => setView("HOME")} />;
  }

  return (
      <div className="app-container">
          <aside className="sidebar">
              <div className="sidebar-header">
                  <span className="shield-icon">🛡️</span> Trustline
              </div>
              <div style={{padding: '10px 20px'}}>
                  <input 
                    style={{width: '100%', fontSize: '0.8rem', padding: '8px', background: '#010409', border: '1px solid var(--border-color)', color: 'white', borderRadius: '4px'}} 
                    placeholder="Search colleagues..." 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
              </div>
              <div className="contact-list">
                  {filteredContacts.map(c => (
                      <div 
                        key={c.id} 
                        className={`contact-item ${activeContact?.id === c.id ? 'active' : ''}`}
                        onClick={() => startChat(c)}
                      >
                          <div className="avatar">{c.email[0].toUpperCase()}</div>
                          <div>
                              <div style={{fontWeight: 600}}>{c.email}</div>
                              <div style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Secure Channel</div>
                          </div>
                      </div>
                  ))}
              </div>
              <div style={{padding: 20, borderTop: '1px solid var(--border-color)'}}>
                  <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                      <div className="avatar" style={{width: 30, height: 30}}>U</div>
                      <span>{email}</span>
                  </div>
              </div>
          </aside>

          <main className="chat-arena">
              {activeContact ? (
                  <>
                      <header className="chat-header">
                          <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                              <span style={{fontWeight: 600}}>{activeContact.email}</span>
                              {isHandshaking ? (
                                  <span style={{fontSize: '0.8rem', color: 'var(--accent-teal)', animation: 'pulse 1s infinite'}}>Establishing Secure Channel...</span>
                              ) : (
                                  <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>🛡️ E2E Encrypted</span>
                              )}
                          </div>
                          <button style={{padding: '4px 10px', fontSize: '0.8rem'}} onClick={() => setView("DASHBOARD")}>Close</button>
                      </header>

                      <div className="messages-feed">
                          {messages.map((m, i) => (
                              <div key={i} className={`message-bubble ${m.sender === "me" ? "me" : "them"}`}>
                                  <div>{m.text}</div>
                                  <div className="message-meta">
                                      {new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                  </div>
                              </div>
                          ))}
                          <div ref={messagesEndRef} />
                      </div>

                      <div className="composer">
                          <input 
                            value={inputText} 
                            placeholder="Type a secure message..."
                            onChange={e => setInputText(e.target.value)} 
                            onKeyDown={e => e.key === "Enter" && sendMessage()} 
                            disabled={isHandshaking}
                          />
                          <button onClick={sendMessage} disabled={isHandshaking || !inputText}>Send</button>
                      </div>
                  </>
              ) : (
                  <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)'}}>
                      <span style={{fontSize: '3rem', marginBottom: 20}}>🛡️</span>
                      <h3>Your Secure Vault is Open</h3>
                      <p>Select a colleague to start a zero-knowledge conversation.</p>
                  </div>
              )}
          </main>
      </div>
  );
}

function AdminPanel({ onBack }: { onBack: () => void }) {
    const [tab, setTab] = useState<"PENDING" | "USERS" | "LOGS" | "SETTINGS">("PENDING");
    const [data, setData] = useState<any[]>([]);

    const fetchData = async () => {
        if (tab === "PENDING") {
            const res = await api.getPendingUsers();
            setData(res.users || []);
        } else if (tab === "USERS") {
            const res = await api.getAllUsers();
            setData(res.users || []);
        } else if (tab === "LOGS") {
            const res = await api.getAuditLogs();
            setData(res.logs || []);
        }
    };

    useEffect(() => { fetchData(); }, [tab]);

    const handleApprove = async (id: string) => {
        await api.approveUser(id);
        fetchData();
    };

    return (
        <div className="onboarding-screen" style={{maxWidth: '800px', width: '90%'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 20}}>
                <h2>IT Admin Console</h2>
                <button onClick={onBack}>Exit</button>
            </div>

            <div style={{display: 'flex', gap: 10, marginBottom: 20}}>
                <button 
                    onClick={() => setTab("PENDING")} 
                    style={{flex: 1, padding: '10px 5px', fontSize: '0.8rem', background: tab === "PENDING" ? 'var(--accent-blue)' : 'var(--message-them)'}}
                >Pending</button>
                <button 
                    onClick={() => setTab("USERS")} 
                    style={{flex: 1, padding: '10px 5px', fontSize: '0.8rem', background: tab === "USERS" ? 'var(--accent-blue)' : 'var(--message-them)'}}
                >Roster</button>
                <button 
                    onClick={() => setTab("LOGS")} 
                    style={{flex: 1, padding: '10px 5px', fontSize: '0.8rem', background: tab === "LOGS" ? 'var(--accent-blue)' : 'var(--message-them)'}}
                >Audit</button>
                <button 
                    onClick={() => setTab("SETTINGS")} 
                    style={{flex: 1, padding: '10px 5px', fontSize: '0.8rem', background: tab === "SETTINGS" ? 'var(--accent-blue)' : 'var(--message-them)'}}
                >Settings</button>
            </div>

            <div style={{textAlign: 'left', maxHeight: '400px', overflowY: 'auto', background: '#010409', padding: 20, borderRadius: 8}}>
                {tab === "PENDING" && data.map(u => (
                    <div key={u.id} style={{display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)'}}>
                        <span>{u.email}</span>
                        <button onClick={() => handleApprove(u.id)} style={{padding: '5px 15px', fontSize: '0.8rem'}}>Approve</button>
                    </div>
                ))}

                {tab === "USERS" && data.map(u => (
                    <div key={u.id} style={{display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-color)'}}>
                        <div>
                            <div style={{fontWeight: 600}}>{u.email}</div>
                            <div style={{fontSize: '0.7rem', color: 'var(--text-secondary)'}}>{u.device_count} devices registered</div>
                        </div>
                        <span style={{color: u.status === 'active' ? 'var(--accent-teal)' : 'orange'}}>{u.status}</span>
                    </div>
                ))}

                {tab === "LOGS" && data.map(l => (
                    <div key={l.id} style={{padding: '10px 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between'}}>
                            <strong style={{color: 'var(--accent-blue)'}}>{l.action}</strong>
                            <span style={{color: 'var(--text-secondary)'}}>{new Date(l.created_at).toLocaleString()}</span>
                        </div>
                        <div style={{marginTop: 5, color: '#ccc'}}>Actor: {l.actor_email || 'System'}</div>
                        <pre style={{fontSize: '0.7rem', color: 'var(--text-secondary)', background: '#161B22', padding: 5, borderRadius: 4}}>
                            {JSON.stringify(l.details, null, 2)}
                        </pre>
                    </div>
                ))}

                {tab === "SETTINGS" && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
                        <div>
                            <label style={{display: 'block', marginBottom: 10, fontWeight: 600}}>Data Retention Policy</label>
                            <select style={{width: '100%', padding: 10, background: '#161B22', color: 'white', border: '1px solid var(--border-color)', borderRadius: 4}}>
                                <option>Forever</option>
                                <option>30 Days (Standard)</option>
                                <option>7 Days (Strict)</option>
                                <option>24 Hours (Ephemeral)</option>
                            </select>
                            <p style={{fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 5}}>Automated purging of encrypted metadata from server storage.</p>
                        </div>
                        <div>
                            <label style={{display: 'block', marginBottom: 10, fontWeight: 600}}>Global Registration</label>
                            <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                                <input type="checkbox" defaultChecked />
                                <span>Allow new identity requests</span>
                            </div>
                        </div>
                        <hr style={{borderColor: 'var(--border-color)', margin: '10px 0'}} />
                        <button 
                            style={{background: '#ff4444', color: 'white'}}
                            onClick={async () => {
                                if (confirm("Clear local encryption keys and message history? This cannot be undone.")) {
                                    localStorage.clear();
                                    const v = await vault.initVault();
                                    await v.execute("DELETE FROM local_keys");
                                    await v.execute("DELETE FROM messages");
                                    window.location.reload();
                                }
                            }}
                        >Wipe Local Vault</button>
                        <button style={{background: 'var(--accent-teal)', marginTop: 20}}>Save Operational Policies</button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
