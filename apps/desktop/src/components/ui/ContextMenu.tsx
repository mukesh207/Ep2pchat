import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
}

interface ContextMenuProps {
  children: React.ReactNode;
  items: ContextMenuItem[];
}

export function ContextMenu({ children, items }: ContextMenuProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    
    // Boundary check for viewport
    const menuWidth = 220;
    const menuHeight = items.length * 40 + 10;
    
    let x = e.clientX;
    let y = e.clientY;
    
    if (x + menuWidth > window.innerWidth) x -= menuWidth;
    if (y + menuHeight > window.innerHeight) y -= menuHeight;
    
    setPosition({ x, y });
    setVisible(true);
  };

  useEffect(() => {
    const handleClick = () => setVisible(false);
    const handleScroll = () => setVisible(false);
    
    if (visible) {
      window.addEventListener("click", handleClick);
      window.addEventListener("scroll", handleScroll, true);
    }
    
    return () => {
      window.removeEventListener("click", handleClick);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [visible]);

  return (
    <div onContextMenu={handleContextMenu} className="h-full">
      {children}
      
      <AnimatePresence>
        {visible && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.98, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
            className="fixed z-[1000] min-w-[220px] p-1.5 rounded-xl border border-border-tactical bg-background-secondary/95 backdrop-blur-xl shadow-xl"
            style={{
              top: position.y,
              left: position.x,
            }}
          >
            <div className="flex flex-col gap-0.5">
              {items.map((item, i) => (
                <button
                  key={i}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-semibold transition-all text-left group ${
                    item.variant === "danger" 
                      ? "text-accent-red hover:bg-accent-red/10" 
                      : "text-text-secondary hover:text-text-primary hover:bg-white/5"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    item.onClick();
                    setVisible(false);
                  }}
                >
                  {item.icon && <span className="opacity-60 group-hover:opacity-100 transition-opacity">{item.icon}</span>}
                  <span className="flex-1">{item.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
