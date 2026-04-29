/**
 * Author: Hector Lugo
 * Description: NotificationBell component for the global header (M3-006).
 * Shows unread notification count as a badge and opens a dropdown with recent alerts.
 * Clicking a notification marks it as read via the API.
 */
import { useState, useEffect, useRef, useCallback } from "react";

interface NotificationItem {
  notificationId: number;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface Props {
  userId: string;
  apiBase?: string;
}

/**
 * Resolves the API base URL using the same logic as apiClient.ts.
 * Supports Docker (API_URL_SSR) and browser (PUBLIC_API_BASE_URL) environments.
 */
function resolveApiBase(): string {
  const isBrowser = typeof window !== "undefined";
  if (!isBrowser && typeof process !== "undefined" && process.env.API_URL_SSR) {
    return String(process.env.API_URL_SSR).replace(/\/$/, "");
  }
  return (import.meta.env?.PUBLIC_API_BASE_URL || "https://localhost:3000/api").replace(/\/$/, "");
}

/**
 * Helper to get CSRF token for mutating requests.
 */
async function getCsrf(base: string): Promise<string> {
  try {
    const res = await fetch(`${base}/user/csrf-token`, {
      credentials: "include",
    });
    const data = await res.json();
    return data.csrfToken || "";
  } catch {
    return "";
  }
}

export default function NotificationBell({ userId }: Props) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const base = resolveApiBase();

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${base}/notifications/${userId}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data: NotificationItem[] = await res.json();
        setNotifications(data);
        setUnreadCount(data.filter((n) => !n.isRead).length);
      }
    } catch (err) {
      console.error("Error fetching notifications:", err);
    }
  }, [userId, base]);

  useEffect(() => {
    if (!userId) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000); // poll every 30s
    return () => clearInterval(interval);
  }, [userId, fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAsRead = async (notificationId: number) => {
    try {
      const csrf = await getCsrf(base);
      await fetch(`${base}/notifications/${notificationId}/read`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "csrf-token": csrf } : {}),
        },
      });
      setNotifications((prev) =>
        prev.map((n) =>
          n.notificationId === notificationId ? { ...n, isRead: true } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Error marking notification as read:", err);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Ahora";
    if (diffMin < 60) return `hace ${diffMin}m`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `hace ${diffHrs}h`;
    return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative", display: "inline-flex" }}>
      {/* Bell button */}
      <button
        id="notification-bell-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notificaciones"
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "2.25rem",
          height: "2.25rem",
          borderRadius: "var(--radius-md, 0.5rem)",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: "var(--color-ink-muted, #6b7280)",
          transition: "background 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--color-surface-secondary, #f3f4f6)";
          (e.currentTarget as HTMLElement).style.color = "var(--color-ink, #111827)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = "var(--color-ink-muted, #6b7280)";
        }}
      >
        {/* Bell SVG */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {/* Badge */}
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: "2px",
              right: "2px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: "16px",
              height: "16px",
              borderRadius: "9999px",
              background: "var(--color-error, #ef4444)",
              color: "#fff",
              fontSize: "10px",
              fontWeight: 700,
              lineHeight: 1,
              padding: "0 4px",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          id="notification-dropdown"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: "360px",
            maxHeight: "420px",
            overflowY: "auto",
            background: "var(--color-surface-white, #fff)",
            border: "1px solid var(--color-neutral-200, #e5e7eb)",
            borderRadius: "var(--radius-lg, 0.75rem)",
            boxShadow: "0 10px 25px -5px rgba(0,0,0,.1), 0 4px 6px -2px rgba(0,0,0,.05)",
            zIndex: 100,
          }}
        >
          <div
            style={{
              padding: "14px 16px 10px",
              borderBottom: "1px solid var(--color-neutral-200, #e5e7eb)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--color-ink, #111827)" }}>
              Notificaciones
            </span>
            {unreadCount > 0 && (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--color-primary-500, #3b82f6)",
                  background: "var(--color-primary-50, #eff6ff)",
                  padding: "2px 8px",
                  borderRadius: "9999px",
                }}
              >
                {unreadCount} sin leer
              </span>
            )}
          </div>

          {notifications.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--color-ink-muted, #9ca3af)", fontSize: "13px" }}>
              No tienes notificaciones
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.notificationId}
                onClick={() => !n.isRead && markAsRead(n.notificationId)}
                style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "12px 16px",
                  border: "none",
                  borderBottom: "1px solid var(--color-neutral-100, #f3f4f6)",
                  background: n.isRead
                    ? "transparent"
                    : "var(--color-primary-50, #eff6ff)",
                  cursor: n.isRead ? "default" : "pointer",
                  textAlign: "left",
                  transition: "background 0.15s",
                }}
              >
                {/* Unread dot */}
                <span
                  style={{
                    marginTop: "6px",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: n.isRead
                      ? "var(--color-neutral-300, #d1d5db)"
                      : "var(--color-primary-500, #3b82f6)",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "13px",
                      fontWeight: n.isRead ? 400 : 500,
                      color: "var(--color-ink, #111827)",
                      lineHeight: 1.4,
                    }}
                  >
                    {n.message}
                  </p>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: "11px",
                      color: "var(--color-ink-muted, #9ca3af)",
                    }}
                  >
                    {formatTime(n.createdAt)}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
