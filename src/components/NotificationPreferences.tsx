/**
 * Author: Hector Lugo
 * Description: NotificationPreferences component for the user profile page (M3-006).
 * Toggle switches for Email, In-App, and Browser (Web Push) notifications.
 */
import { useState, useEffect } from "react";

interface Prefs {
  emailNotif: boolean;
  appNotif: boolean;
  browserNotif: boolean;
}

interface Props {
  userId: string;
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

export default function NotificationPreferences({ userId }: Props) {
  const [prefs, setPrefs] = useState<Prefs>({
    emailNotif: true,
    appNotif: true,
    browserNotif: true,
  });
  const [saving, setSaving] = useState(false);
  const [pushPermission, setPushPermission] = useState<string>("default");
  const base = resolveApiBase();

  useEffect(() => {
    if (!userId) return;
    fetch(`${base}/notifications/preferences/${userId}`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data: Prefs) =>
        setPrefs({
          emailNotif: data.emailNotif ?? true,
          appNotif: data.appNotif ?? true,
          browserNotif: data.browserNotif ?? true,
        })
      )
      .catch((err) => console.error("Error loading preferences:", err));

    if ("Notification" in window) {
      setPushPermission(Notification.permission);
    }
  }, [userId, base]);

  const updatePref = async (key: keyof Prefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSaving(true);
    try {
      const csrf = await getCsrf(base);
      await fetch(`${base}/notifications/preferences/${userId}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "csrf-token": csrf } : {}),
        },
        body: JSON.stringify({ [key]: value }),
      });

      // If enabling browser notifications, trigger the push subscription flow
      if (key === "browserNotif" && value) {
        await requestPushPermission();
      }
    } catch (err) {
      console.error("Error updating preference:", err);
      // revert
      setPrefs((prev) => ({ ...prev, [key]: !value }));
    } finally {
      setSaving(false);
    }
  };

  const requestPushPermission = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      console.warn("Push notifications not supported in this browser");
      return;
    }

    const permission = await Notification.requestPermission();
    setPushPermission(permission);

    if (permission !== "granted") return;

    try {
      // Get VAPID key from backend
      const vapidRes = await fetch(`${base}/notifications/vapid-public-key`, {
        credentials: "include",
      });
      const { key } = await vapidRes.json();
      if (!key) return;

      // Register service worker and subscribe
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });

      // Send subscription to backend
      const csrf = await getCsrf(base);
      await fetch(`${base}/notifications/subscribe`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "csrf-token": csrf } : {}),
        },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
    } catch (err) {
      console.error("Error subscribing to push:", err);
    }
  };

  const items: { key: keyof Prefs; label: string; desc: string }[] = [
    {
      key: "emailNotif",
      label: "Correo electrónico",
      desc: "Recibe alertas por correo electrónico cuando cambie el estado de tus solicitudes.",
    },
    {
      key: "appNotif",
      label: "Notificaciones in-app",
      desc: "Muestra las alertas en la campanita del menú superior.",
    },
    {
      key: "browserNotif",
      label: "Notificaciones del navegador",
      desc: "Recibe alertas push del sistema operativo incluso si la pestaña está en segundo plano.",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {items.map((item) => (
        <div
          key={item.key}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--color-ink, #111827)",
              }}
            >
              {item.label}
            </p>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: "12px",
                color: "var(--color-ink-muted, #6b7280)",
                lineHeight: 1.5,
              }}
            >
              {item.desc}
            </p>
            {item.key === "browserNotif" && pushPermission === "denied" && (
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: "11px",
                  color: "var(--color-error, #ef4444)",
                  fontWeight: 500,
                }}
              >
                ⚠ Permiso bloqueado en el navegador. Habilítalo desde la configuración del sitio.
              </p>
            )}
          </div>
          {/* Toggle switch */}
          <button
            onClick={() => updatePref(item.key, !prefs[item.key])}
            disabled={saving}
            aria-label={`${prefs[item.key] ? "Desactivar" : "Activar"} ${item.label}`}
            style={{
              position: "relative",
              width: "44px",
              height: "24px",
              borderRadius: "9999px",
              border: "none",
              padding: 0,
              cursor: saving ? "wait" : "pointer",
              background: prefs[item.key]
                ? "var(--color-primary-500, #3b82f6)"
                : "var(--color-neutral-300, #d1d5db)",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                display: "block",
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,.15)",
                position: "absolute",
                top: "3px",
                left: prefs[item.key] ? "23px" : "3px",
                transition: "left 0.2s",
              }}
            />
          </button>
        </div>
      ))}
    </div>
  );
}

