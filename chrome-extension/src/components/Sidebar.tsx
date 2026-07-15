import { useEffect, useState } from "react";
import "./Sidebar.css";

const TRANSITION_MS = 220;

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }

    setVisible(false);
    const timeout = setTimeout(() => setMounted(false), TRANSITION_MS);
    return () => clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open || !mounted) return;

    // Keep the panel in its off-screen state for a painted frame before
    // starting the same transition that is used when it closes.
    let enterFrame = 0;
    const mountedFrame = requestAnimationFrame(() => {
      enterFrame = requestAnimationFrame(() => setVisible(true));
    });

    return () => {
      cancelAnimationFrame(mountedFrame);
      cancelAnimationFrame(enterFrame);
    };
  }, [mounted, open]);

  if (!mounted) return null;

  return (
    <>
      <div
        className={`sidebar-backdrop ${visible ? "sidebar-backdrop--visible" : ""}`}
        onClick={onClose}
      />
      <aside className={`sidebar-panel ${visible ? "sidebar-panel--visible" : ""}`}>
        <p className="sidebar-placeholder-text">Sidebar placeholder</p>
      </aside>
    </>
  );
}
