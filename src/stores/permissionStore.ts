/**
 * In-memory + sessionStorage cache for the authenticated user's effective
 * permission set. The backend is the source of truth; this store exists so
 * every React island can call `hasPermission(...)` without refetching.
 *
 * Usage:
 *   const perms = await getCachedPermissions();   // warms cache if needed
 *   if (hasPermission(perms, "travel_request:authorize")) { ... }
 *
 * Call `clearPermissionCache()` on logout.
 */
import { apiRequest } from "@utils/apiClient";
import type { MePermissionsResponse, PermissionCode } from "@type/permissions";

const STORAGE_KEY = "coco:permissions";

let cache: PermissionCode[] | null = null;
let inflight: Promise<PermissionCode[]> | null = null;

const readSessionStorage = (): PermissionCode[] | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writeSessionStorage = (perms: PermissionCode[]): void => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(perms));
  } catch {
    /* storage full / disabled — cache stays in-memory */
  }
};

/** Puts a freshly-loaded permission list into both caches. */
export const setPermissionCache = (perms: PermissionCode[]): void => {
  cache = perms;
  writeSessionStorage(perms);
};

/** Wipes both caches. Call from logout flows. */
export const clearPermissionCache = (): void => {
  cache = null;
  if (typeof window !== "undefined") {
    try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
};

/**
 * Returns the effective permission list. Populates the cache from sessionStorage
 * on first call, or fetches `/api/user/me/permissions` if neither cache is warm.
 * Concurrent callers share a single in-flight request.
 */
export async function getCachedPermissions(): Promise<PermissionCode[]> {
  if (cache) return cache;

  const fromStorage = readSessionStorage();
  if (fromStorage) {
    cache = fromStorage;
    return cache;
  }

  if (!inflight) {
    inflight = apiRequest<MePermissionsResponse>("/user/me/permissions")
      .then((res) => {
        setPermissionCache(res.permissions);
        return res.permissions;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
