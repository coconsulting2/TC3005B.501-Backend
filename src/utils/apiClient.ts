/*
 * Author: Eduardo Porto Morales
 
 --GET
    const requests = await apiRequest('/applicant/get-user-requests/1');

 --POST
    await apiRequest('/applicant/create-request', {
        method: 'POST',
        data: { payload }
    });

 --PUT
    await apiRequest('/applicant/update-request/1', {
        method: 'PUT',
        data: { payload }
    });

*/

import { getSession } from "@data/cookies";

const DEFAULT_API = "https://localhost:3000/api";

/**
 * URL base del API. En el navegador: PUBLIC_API_BASE_URL (localhost).
 * En SSR dentro de Docker: `API_URL_SSR` apunta al backend en el host (p. ej. host.docker.internal).
 */
function resolveApiBaseUrl(): string {
  const isBrowser = typeof window !== "undefined";
  if (!isBrowser && typeof process !== "undefined" && process.env.API_URL_SSR) {
    return String(process.env.API_URL_SSR).replace(/\/$/, "");
  }
  return (import.meta.env.PUBLIC_API_BASE_URL || DEFAULT_API).replace(/\/$/, "");
}

let csrfTokenPromise: Promise<string> | null = null;

/**
 * Obtiene token CSRF (cookie `_csrf` + valor para header). Reutiliza una petición en curso.
 * Usa la misma base que `apiRequest` (`PUBLIC_API_BASE_URL` / default) para no desincronizar orígenes.
 */
async function getCsrfToken(): Promise<string> {
  if (!csrfTokenPromise) {
    const base = resolveApiBaseUrl();
    csrfTokenPromise = fetch(`${base}/user/csrf-token`, {
      method: "GET",
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || `CSRF fetch failed: ${res.status}`);
        }
        const data = await res.json();
        if (!data?.csrfToken) {
          throw new Error("CSRF response missing csrfToken");
        }
        return data.csrfToken as string;
      })
      .finally(() => {
        csrfTokenPromise = null;
      });
  }
  return csrfTokenPromise;
}

// Handle SSL certificate validation for server-side (Node.js) environment
// This is needed for Astro SSR to work with self-signed certificates
const isServer = typeof window === 'undefined';
// `astro dev` → DEV true; build + preview o SSR en Docker puede tener DEV false pero NODE_ENV=development.
const isDevelopment =
  import.meta.env.DEV ||
  import.meta.env.MODE === "development" ||
  (typeof process !== "undefined" && process.env.NODE_ENV === "development");

// In development server environment, disable certificate validation
if (isServer && isDevelopment && typeof process !== "undefined") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

type HTTP = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface ApiOptions {
  method?: HTTP;
  data?: any;
  headers?: Record<string, string>;
  cookies?: import("astro").APIContext["cookies"];
}

export async function apiRequest<T = any>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const baseUrl = resolveApiBaseUrl();
  const { method = 'GET', data, headers = {}, cookies } = options;

  let token = "";
  try {
    const session = getSession(cookies); 
    token = session.token;
  } catch (e) {
    console.warn("[WARN] No se pudo obtener sesión en apiRequest", e);
  }

  const needsCsrf =
    method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
  /** El backend excluye CSRF solo en POST /api/user/login. */
  const skipCsrfForThisCall =
    method === "POST" && (path === "/user/login" || path.endsWith("/user/login"));
  let csrfToken: string | undefined;
  if (needsCsrf && !skipCsrfForThisCall) {
    try {
      csrfToken = await getCsrfToken();
    } catch (e) {
      console.warn("[WARN] No se pudo obtener CSRF token", e);
    }
  }

  const config: RequestInit = {
    method,
    credentials: "include",
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(csrfToken ? { "csrf-token": csrfToken } : {}),
      ...headers,
    },
    ...(data && { body: JSON.stringify(data) }),
  };

  try {
    // For Node.js in development, the NODE_TLS_REJECT_UNAUTHORIZED env var handles this
    // For browsers, we can't directly modify SSL validation behavior
    const res = await fetch(`${baseUrl}${path}`, config);

    if (!res.ok) {
      const bodyText = await res.text();
      let response: unknown = bodyText;
      try {
        response = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        /* cuerpo no JSON */
      }
      throw {
        status: res.status,
        response,
      };
    }

    return await res.json();
  } catch (error) {
    console.error("API request failed:", error);
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      "response" in error
    ) {
      throw {
        message: "Network or fetch error",
        detail: error as { status: number; response: unknown },
      };
    }
    const errMsg = error instanceof Error ? error.message : String(error);
    const lower = errMsg.toLowerCase();
    const isUnreachable =
      error instanceof TypeError ||
      lower.includes("failed to fetch") ||
      lower.includes("networkerror") ||
      errMsg.includes("ERR_CONNECTION_REFUSED");
    const baseHint = resolveApiBaseUrl();
    throw {
      message: "Network or fetch error",
      detail: {
        response: {
          error: isUnreachable
            ? `No hay conexión con la API (${baseHint}). Inicia el backend en ese host/puerto y revisa PUBLIC_API_BASE_URL si usas otro origen.`
            : errMsg,
        },
        raw: error,
      },
    };
  }
}
