import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Archive03Icon,
  Cancel01Icon,
  Delete02Icon,
  Edit03Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  PinIcon,
  PinOffIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import "./Sidebar.css";

const TRANSITION_MS = 220;

// Placeholder until real user identity is wired up.
const CURRENT_USER_NAME = "Vamshi";
const CURRENT_USER_PLAN = "Free";

export interface SidebarChat {
  id: string;
  title: string;
  titlePending: boolean;
  pinned: boolean;
}

interface SidebarProps {
  open: boolean;
  chats: SidebarChat[];
  activeChatId: string | null;
  busy: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onRenameChat: (chatId: string, title: string) => void;
  onTogglePinChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => Promise<boolean>;
}

export default function Sidebar({
  open,
  chats,
  activeChatId,
  busy,
  onClose,
  onNewChat,
  onSelectChat,
  onRenameChat,
  onTogglePinChat,
  onDeleteChat,
}: SidebarProps) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteErrorFor, setDeleteErrorFor] = useState<string | null>(null);
  const menuAnchorRef = useRef<HTMLDivElement>(null);
  const renameCancelledRef = useRef(false);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true);
      return;
    }

    setVisible(false);
    setMenuOpenFor(null);
    setRenamingId(null);
    const timeout = setTimeout(() => setMounted(false), TRANSITION_MS);
    return () => clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open || !mounted) return;

    let enterFrame = 0;
    const mountedFrame = requestAnimationFrame(() => {
      enterFrame = requestAnimationFrame(() => setVisible(true));
    });

    return () => {
      cancelAnimationFrame(mountedFrame);
      cancelAnimationFrame(enterFrame);
    };
  }, [mounted, open]);

  useEffect(() => {
    if (!menuOpenFor) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuAnchorRef.current?.contains(event.target as Node)) {
        setMenuOpenFor(null);
        setDeleteErrorFor(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpenFor]);

  function startRename(chat: SidebarChat) {
    renameCancelledRef.current = false;
    setRenameValue(chat.title);
    setRenamingId(chat.id);
    setMenuOpenFor(null);
  }

  function commitRename(chatId: string) {
    if (renameCancelledRef.current) {
      renameCancelledRef.current = false;
      return;
    }
    const title = renameValue.trim();
    if (title) onRenameChat(chatId, title);
    setRenamingId(null);
  }

  async function deleteChat(chat: SidebarChat) {
    if (!window.confirm(`Delete “${chat.title}”? This cannot be undone.`)) return;

    setDeletingId(chat.id);
    setDeleteErrorFor(null);
    const deleted = await onDeleteChat(chat.id);
    setDeletingId(null);

    if (deleted) {
      setMenuOpenFor(null);
    } else {
      setDeleteErrorFor(chat.id);
    }
  }

  function renderChatList(sectionChats: SidebarChat[]) {
    return (
      <ul className="sidebar-chat-list">
        {sectionChats.map((chat) => {
          const active = chat.id === activeChatId;
          const renaming = chat.id === renamingId;

          return (
            <li
              key={chat.id}
              className={`sidebar-chat-item${
                active ? " sidebar-chat-item--active" : ""
              }`}
            >
              {renaming ? (
                <input
                  className="sidebar-chat-rename-input"
                  value={renameValue}
                  maxLength={56}
                  autoFocus
                  aria-label={`Rename ${chat.title}`}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onBlur={() => commitRename(chat.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitRename(chat.id);
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      renameCancelledRef.current = true;
                      setRenamingId(null);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="sidebar-chat-link"
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    onSelectChat(chat.id);
                    onClose();
                  }}
                >
                  {chat.titlePending ? (
                    <span
                      className="sidebar-chat-title-loading"
                      role="status"
                      aria-label="Generating conversation title"
                    >
                      <span className="sidebar-chat-title-spinner" aria-hidden="true" />
                      <span>Generating title</span>
                    </span>
                  ) : (
                    <span className="sidebar-chat-title">{chat.title}</span>
                  )}
                </button>
              )}
              {!chat.titlePending && (
                <div
                  className="sidebar-chat-menu-anchor"
                  ref={menuOpenFor === chat.id ? menuAnchorRef : undefined}
                >
                  <button
                    type="button"
                    className="sidebar-chat-menu-btn"
                    aria-label={`Open conversation options for ${chat.title}`}
                    aria-expanded={menuOpenFor === chat.id}
                    onClick={() => {
                      setDeleteErrorFor(null);
                      setMenuOpenFor((current) =>
                        current === chat.id ? null : chat.id,
                      );
                    }}
                  >
                    <HugeiconsIcon icon={MoreHorizontalIcon} size={18} />
                  </button>
                  {menuOpenFor === chat.id && (
                    <div className="sidebar-chat-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className="sidebar-chat-menu-item"
                      onClick={() => startRename(chat)}
                    >
                      <HugeiconsIcon icon={Edit03Icon} size={18} />
                      <span>Rename</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="sidebar-chat-menu-item"
                      onClick={() => {
                        onTogglePinChat(chat.id);
                        setMenuOpenFor(null);
                      }}
                    >
                      <HugeiconsIcon icon={chat.pinned ? PinOffIcon : PinIcon} size={18} />
                      <span>{chat.pinned ? "Unpin" : "Pin"}</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="sidebar-chat-menu-item"
                      disabled
                      title="Archive will be available later"
                    >
                      <HugeiconsIcon icon={Archive03Icon} size={18} />
                      <span>Archive</span>
                      <span className="sidebar-coming-soon">Later</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="sidebar-chat-menu-item sidebar-chat-menu-item--danger"
                      disabled={deletingId === chat.id || (busy && active)}
                      title={busy && active ? "Stop the response before deleting" : undefined}
                      onClick={() => void deleteChat(chat)}
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={18} />
                      <span>{deletingId === chat.id ? "Deleting…" : "Delete"}</span>
                    </button>
                    {deleteErrorFor === chat.id && (
                      <p className="sidebar-chat-menu-error" role="alert">
                        Could not delete this chat. Try again.
                      </p>
                    )}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  if (!mounted) return null;

  const pinnedChats = chats.filter((chat) => chat.pinned);
  const recentChats = chats.filter((chat) => !chat.pinned);

  return (
    <>
      <div
        className={`sidebar-backdrop ${visible ? "sidebar-backdrop--visible" : ""}`}
        onClick={onClose}
      />
      <aside
        className={`sidebar-panel ${visible ? "sidebar-panel--visible" : ""}`}
        aria-label="Conversation history"
      >
        <div className="sidebar-header">
          <span className="sidebar-brand">
            <img
              src="/icons/Full-logo.svg"
              alt="Donna"
              className="sidebar-brand-icon"
            />
          </span>
          <button
            type="button"
            className="sidebar-icon-btn"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={20} />
          </button>
        </div>

        <nav className="sidebar-primary-nav">
          <button
            type="button"
            className={`sidebar-nav-row${
              activeChatId === null ? " sidebar-nav-row--active" : ""
            }`}
            aria-current={activeChatId === null ? "page" : undefined}
            onClick={() => {
              onNewChat();
              onClose();
            }}
          >
            <HugeiconsIcon icon={PencilEdit02Icon} size={18} />
            <span>New chat</span>
          </button>
          <button
            type="button"
            className="sidebar-nav-row"
            disabled
            title="Search will be available later"
          >
            <HugeiconsIcon icon={Search01Icon} size={18} />
            <span>Search</span>
            <span className="sidebar-coming-soon">Later</span>
          </button>
        </nav>

        <div className="sidebar-history">
          {chats.length === 0 ? (
            <>
              <h2 className="sidebar-section-heading">Recents</h2>
              <p className="sidebar-empty-state">Your conversations will appear here.</p>
            </>
          ) : (
            <>
              {pinnedChats.length > 0 && (
                <section className="sidebar-history-section" aria-labelledby="pinned-heading">
                  <h2 className="sidebar-section-heading" id="pinned-heading">
                    Pinned
                  </h2>
                  {renderChatList(pinnedChats)}
                </section>
              )}
              {recentChats.length > 0 && (
                <section className="sidebar-history-section" aria-labelledby="recents-heading">
                  <h2 className="sidebar-section-heading" id="recents-heading">
                    Recents
                  </h2>
                  {renderChatList(recentChats)}
                </section>
              )}
            </>
          )}
        </div>

        <button type="button" className="sidebar-user-row">
          <span className="sidebar-user-avatar" aria-hidden="true">
            {CURRENT_USER_NAME.charAt(0)}
          </span>
          <span className="sidebar-user-info">
            <span className="sidebar-user-name">{CURRENT_USER_NAME}</span>
            <span className="sidebar-user-plan">{CURRENT_USER_PLAN}</span>
          </span>
        </button>
      </aside>
    </>
  );
}
