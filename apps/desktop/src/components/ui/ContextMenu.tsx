import { useEffect, useRef, useState } from "react";

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
    setPosition({ x: e.clientX, y: e.clientY });
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
    <div onContextMenu={handleContextMenu} style={{ height: "100%" }}>
      {children}
      
      {visible && (
        <div
          ref={menuRef}
          className="context-menu"
          style={{
            position: "fixed",
            top: position.y,
            left: position.x,
            zIndex: 1000,
            background: "var(--surface-2)",
            border: "1px solid var(--border-bright)",
            borderRadius: "var(--radius-md)",
            padding: "4px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            minWidth: 160,
            animation: "fadeSlideIn 0.15s ease",
          }}
        >
          {items.map((item, i) => (
            <button
              key={i}
              className="context-menu-item"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                border: "none",
                background: "transparent",
                color: item.variant === "danger" ? "var(--accent-danger)" : "var(--text-primary)",
                fontSize: "0.75rem",
                fontFamily: "var(--font-mono)",
                cursor: "pointer",
                borderRadius: "var(--radius-sm)",
                textAlign: "left",
              }}
              onClick={(e) => {
                e.stopPropagation();
                item.onClick();
                setVisible(false);
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--surface-3)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              {item.icon && <span style={{ opacity: 0.7 }}>{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
