import { useState, useEffect, useCallback } from "react";
import {
  NOTIFICATION_STYLES,
  NOTIFICATION_ICONS,
} from "@config/notification";
import type { Notification, NotificationType } from "@config/notification";

interface Props {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

function NotificationItem({
  notification,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: (id: string) => void;
}) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setAnimate(true));

    const duration = notification.duration ?? 4000;
    const timer = setTimeout(() => {
      setAnimate(false);
      setTimeout(() => onDismiss(notification.id), 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [notification.id, notification.duration, onDismiss]);

  return (
    <div
      className={`
        w-[340px] max-w-full border-l-4 rounded shadow-md p-4 flex items-start gap-3
        transition-all duration-300 ease-in-out
        ${animate ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"}
        ${NOTIFICATION_STYLES[notification.type]}
      `}
      role="alert"
    >
      <svg
        className="w-5 h-5 shrink-0 mt-0.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={NOTIFICATION_ICONS[notification.type]}
        />
      </svg>

      <p className="text-sm font-medium flex-1">{notification.message}</p>

      <button
        onClick={() => {
          setAnimate(false);
          setTimeout(() => onDismiss(notification.id), 300);
        }}
        className="shrink-0 hover:opacity-70 transition-opacity"
        aria-label="Cerrar notificación"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export default function NotificationContainer({ notifications, onDismiss }: Props) {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-6 right-4 z-50 flex flex-col gap-3">
      {notifications.map((n) => (
        <NotificationItem key={n.id} notification={n} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

let notificationCounter = 0;

export function createNotification(
  message: string,
  type: NotificationType,
  duration?: number,
): Notification {
  notificationCounter += 1;
  return {
    id: `notification-${Date.now()}-${notificationCounter}`,
    message,
    type,
    duration,
  };
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback(
    (message: string, type: NotificationType, duration?: number) => {
      setNotifications((prev) => [...prev, createNotification(message, type, duration)]);
    },
    [],
  );

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { notifications, addNotification, dismissNotification };
}
