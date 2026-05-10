import React, { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface LayoutProps {
  children: ReactNode;
  securityStatus?: 'protected' | 'alert' | 'danger';
}

const Layout: React.FC<LayoutProps> = ({ children, securityStatus = 'protected' }) => {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background-primary font-sans text-text-primary selection:bg-accent-cyan/30">
      {/* Tactical Grid Background */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-[0.4] tactical-grid-bg" />

      {/* Industrial Scan Line Overlay (Subtle) */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.02),rgba(0,255,0,0.01),rgba(0,0,255,0.02))] bg-[length:100%_4px,3px_100%] opacity-[0.03]" />

      {/* Alert Overlays */}
      <div className={`fixed inset-0 z-0 pointer-events-none transition-colors duration-1000 ${
        securityStatus === 'protected' ? 'bg-transparent' :
        securityStatus === 'alert' ? 'bg-accent-amber/[0.02]' :
        'bg-accent-red/[0.03]'
      }`} />

      {/* Main Content */}
      <motion.main 
        className="relative z-10 h-screen flex flex-col"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {children}
      </motion.main>
    </div>
  );
};

export default Layout;
