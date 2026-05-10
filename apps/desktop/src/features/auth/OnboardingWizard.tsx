import { useState } from "react";
import { Shield, Lock, Building2, ChevronRight, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as api from "../../infrastructure/api";

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
      onComplete(username, department);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background-primary p-8 text-center overflow-hidden relative">
      {/* Subtle Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent-purple/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent-cyan/5 rounded-full blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="tactical-card w-full max-w-md p-12 relative z-10 border-border-tactical shadow-2xl"
      >
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-8"
            >
              <div className="h-16 w-16 rounded-2xl bg-accent-purple/10 border border-accent-purple/20 flex items-center justify-center mx-auto text-accent-purple shadow-sm">
                <Shield size={32} strokeWidth={1.5} />
              </div>
              <div className="space-y-3">
                <h2 className="text-2xl font-bold text-text-primary tracking-tight">Identity Anchored</h2>
                <p className="text-sm text-text-muted leading-relaxed font-medium">
                  Your account is now cryptographically linked to this hardware. Legacy password protocols have been deprecated for your security.
                </p>
              </div>
              <button className="btn-tactical btn-tactical-primary w-full group py-4" onClick={() => setStep(2)}>
                Privacy Model <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-8"
            >
              <div className="h-16 w-16 rounded-2xl bg-accent-green/10 border border-accent-green/20 flex items-center justify-center mx-auto text-accent-green shadow-sm">
                <Lock size={32} strokeWidth={1.5} />
              </div>
              <div className="space-y-3">
                <h2 className="text-2xl font-bold text-text-primary tracking-tight">Strictly E2EE</h2>
                <p className="text-sm text-text-muted leading-relaxed font-medium">
                  Utilizing the Double Ratchet protocol. End-to-end encryption is mandatory and enforced for all communication streams.
                </p>
              </div>
              <button className="btn-tactical btn-tactical-primary w-full group py-4" onClick={() => setStep(3)}>
                Configure Node <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div 
              key="step3"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-8"
            >
              <div className="h-16 w-16 rounded-2xl bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center mx-auto text-accent-cyan shadow-sm">
                <Building2 size={32} strokeWidth={1.5} />
              </div>
              <div className="space-y-3">
                <h2 className="text-2xl font-bold text-text-primary tracking-tight">Final Details</h2>
                <p className="text-sm text-text-muted leading-relaxed font-medium">
                  Establish your node's identity within the organizational directory.
                </p>
              </div>
              
                <div className="space-y-6 text-left">
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider ml-1 opacity-60">Assigned Alias</label>
                  <input 
                    className="input-tactical py-3" 
                    value={username} 
                    onChange={e => setUsername(e.target.value)} 
                    placeholder="e.g. Satoshi"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider ml-1 opacity-60">Sector ID</label>
                  <input 
                    className="input-tactical py-3" 
                    value={department} 
                    onChange={e => setDepartment(e.target.value)} 
                    placeholder="e.g. Engineering"
                  />
                </div>
              </div>

              <button 
                className="btn-tactical btn-tactical-primary w-full py-4 shadow-lg" 
                onClick={handleFinish}
                disabled={loading}
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : "Complete Setup"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-2.5 justify-center mt-12">
          {[1, 2, 3].map(i => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${step === i ? 'w-8 bg-accent-purple shadow-sm' : 'w-1.5 bg-border-tactical'}`} />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
