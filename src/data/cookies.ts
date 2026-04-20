// import type { UserRole } from "@type/roles";

// const mockCookies = {
//     username: "John Doe",
//     id: "1",
//     department_id: "1",
//     role: "Applicant" as UserRole //'Applicant' | 'Authorizer' | 'Admin' | 'AccountsPayable' | 'TravelAgency';
// };

// export const getCookie = (key: keyof typeof mockCookies): string | UserRole => {
//     return mockCookies[key];
// };

import type { APIContext } from "astro";
import type { UserRole } from "@type/roles";

export type Session = {
  username: string;
  id: string;
  role: UserRole;
  department_id?: string;
  token: string;
};

function emptySession(): Session {
  return {
    username: "",
    id: "",
    department_id: "",
    role: "" as UserRole,
    token: "",
  };
}

function resolveCookies(): APIContext["cookies"] | null {
  // En el navegador (p. ej. islas React) no existe Astro.cookies; es normal.
  if (typeof globalThis.window !== "undefined") {
    return null;
  }
  const astro = (globalThis as any).Astro;
  if (astro && astro.cookies && typeof astro.cookies.get === "function") {
    return astro.cookies;
  }
  if (import.meta.env.DEV) {
    console.warn("[WARN] resolveCookies(): Astro.cookies no disponible en este contexto SSR.");
  }
  return null;
}

export function getSession(cookies?: APIContext["cookies"]): Session {
  const realCookies = cookies || resolveCookies();

  if (!realCookies) {
    return emptySession();
  }

  const username = realCookies.get("username")?.value || "";
  // Login API (httpOnly) usa cookie `id`; el formulario cliente también setea `user_id`.
  const id =
    realCookies.get("id")?.value ||
    realCookies.get("user_id")?.value ||
    "";
  const department_id = realCookies.get("department_id")?.value || "";
  const role = realCookies.get("role")?.value || "";
  const token = realCookies.get("token")?.value || ""; 
  
  const session: Session = { username, id, department_id, role: role as UserRole, token };

  // if (process.env.NODE_ENV === "development") {
  //   console.log("[DEBUG] getSession cookies:", session);
  // }

  return session;
}

type CookieKey = keyof Session;

export function getCookie(key: CookieKey, cookies?: APIContext["cookies"]): string {
  return getSession(cookies)[key] ?? '';
}