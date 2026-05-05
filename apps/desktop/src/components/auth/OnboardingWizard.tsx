import { useState } from "react";
import { Shield, Lock, Building2, ChevronRight, Loader2, CheckCircle } from "lucide-react";
import * as api from "../../api";

interface OnboardingWizardProps {
  email: string;
  onComplete: (username: string, department: string) => void;
}

export default function OnboardingWizard({ email, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState(email.split("@")[0]);
  const [department, setDepartment] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFinish = async () => {
    setLoading(true);
    try {
      await api.updateProfile({
        username,
        department,
      });
      onComplete(username, department);
    } catch (err) {
      console.error("Failed to update profile during onboarding", err);
      // Even if update fails, we proceed to let the user in
      onComplete(username, department);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="onboarding-container" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      width: '100vw',
      background: 'var(--bg-app)',
      padding: '20px',
      textAlign: 'center'
    }}>
      <div className="onboarding-card" style={{
        maxWidth: '400px',
        width: '100%',
        padding: '40px',
        background: 'var(--bg-void)',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
      }}>
        {step === 1 && (
          <div className="step">
            <div className="icon-wrapper" style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(110, 86, 207, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              color: 'var(--accent-primary)'
            }}>
              <Shield size={32} />
            </div>
            <h2 style={{ marginBottom: 12, fontSize: '1.5rem', fontWeight: 700 }}>Identity Anchored</h2>
            <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 32 }}>
              Your account is now linked to your device's hardware. You'll never need a password to log in again.
            </p>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setStep(2)}>
              Learn about Privacy <ChevronRight size={14} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="step">
            <div className="icon-wrapper" style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(110, 86, 207, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              color: 'var(--accent-primary)'
            }}>
              <Lock size={32} />
            </div>
            <h2 style={{ marginBottom: 12, fontSize: '1.5rem', fontWeight: 700 }}>Strictly E2EE</h2>
            <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 32 }}>
              Trustline uses the Signal Protocol. Not even the server administrators can read your messages or see your shared stories.
            </p>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setStep(3)}>
              Setup Profile <ChevronRight size={14} />
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="step">
            <div className="icon-wrapper" style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(110, 86, 207, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              color: 'var(--accent-primary)'
            }}>
              <Building2 size={32} />
            </div>
            <h2 style={{ marginBottom: 12, fontSize: '1.5rem', fontWeight: 700 }}>Final Details</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 24 }}>
              How should your colleagues see you in the roster?
            </p>
            
            <div className="form-group" style={{ textAlign: 'left', marginBottom: 16 }}>
              <label style={{ fontSize: '0.7rem', display: 'block', marginBottom: 4, color: 'var(--text-muted)' }}>DISPLAY NAME</label>
              <input 
                className="input" 
                value={username} 
                onChange={e => setUsername(e.target.value)} 
                placeholder="e.g. Satoshi"
              />
            </div>

            <div className="form-group" style={{ textAlign: 'left', marginBottom: 32 }}>
              <label style={{ fontSize: '0.7rem', display: 'block', marginBottom: 4, color: 'var(--text-muted)' }}>DEPARTMENT</label>
              <input 
                className="input" 
                value={department} 
                onChange={e => setDepartment(e.target.value)} 
                placeholder="e.g. Engineering"
              />
            </div>

            <button 
              className="btn btn-primary" 
              style={{ width: '100%', justifyContent: 'center' }} 
              onClick={handleFinish}
              disabled={loading}
            >
              {loading ? <Loader2 size={16} className="spin" /> : <><CheckCircle size={16} /> Finish Setup</>}
            </button>
          </div>
        )}

        <div className="dots" style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 32 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: step === i ? 'var(--accent-primary)' : 'var(--border)',
              transition: 'all 0.2s ease'
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}
