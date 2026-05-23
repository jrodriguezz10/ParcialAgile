import { useEffect, useMemo, useState } from "react";

function readNotificationKey(item) {
  return String(
    item.readKey ||
      [item.id || item.title, item.title, item.message, item.meta].filter(Boolean).join("|")
  );
}

function readStoredKeys(storageKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredKeys(storageKey, keys) {
  localStorage.setItem(storageKey, JSON.stringify(keys.slice(-120)));
}

export function useNotificationReads(scope, notifications) {
  const storageKey = `cip_notification_reads_${scope || "global"}`;
  const [readKeys, setReadKeys] = useState(() => readStoredKeys(storageKey));

  useEffect(() => {
    setReadKeys(readStoredKeys(storageKey));
  }, [storageKey]);

  const notificationKeys = useMemo(() => notifications.map(readNotificationKey), [notifications]);
  const unreadCount = notificationKeys.filter((key) => !readKeys.includes(key)).length;

  function markRead(keys) {
    setReadKeys((current) => {
      const nextKeys = Array.from(new Set([...current, ...keys]));
      writeStoredKeys(storageKey, nextKeys);
      return nextKeys;
    });
  }

  function markAllRead() {
    markRead(notificationKeys);
  }

  function markItemRead(item) {
    markRead([readNotificationKey(item)]);
  }

  function isRead(item) {
    return readKeys.includes(readNotificationKey(item));
  }

  return {
    unreadCount,
    markAllRead,
    markItemRead,
    isRead,
  };
}
