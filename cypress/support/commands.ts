declare namespace Cypress {
  interface Chainable {
    login(username: string, password: string): Chainable<void>;
  }
}

declare namespace Cypress {
  interface Chainable {
    logout(): Chainable<void>;
  }
}

interface ApiSession {
  token: string;
  role: string;
  user_id: number;
  permissions: string[];
  csrfToken: string;
  csrfCookie: string;
}

declare namespace Cypress {
  interface Chainable {
    /**
     * Authenticates against the backend API directly (no UI).
     * Returns an ApiSession with the bearer token, effective permissions,
     * and a fresh csrf-token for subsequent mutations.
     */
    apiLogin(username: string, password: string): Chainable<ApiSession>;

    /**
     * Convenience wrapper around cy.request that attaches the bearer token,
     * CSRF header and cookies for a given ApiSession.
     */
    apiAs(
      session: ApiSession,
      options: Partial<Cypress.RequestOptions> & { url: string }
    ): Chainable<Cypress.Response<any>>;
  }
}

Cypress.Commands.add('login', (username: string, password: string) => {
  cy.visit('https://localhost:4321');
  cy.clearCookies();
  cy.clearLocalStorage();

  cy.get('input[placeholder*="Usuario"]').type(username);
  cy.get('input[placeholder*="Contraseña"]').type(password + '{enter}');

  cy.on('window:alert', (text) => {
    expect(text).to.contains('Inicio de sesión exitoso');
  });

  cy.on('window:confirm', () => true);
  cy.url().should('include', 'dashboard');
});

Cypress.Commands.add('logout', () => {
  cy.wait(1000);
  cy.get('span.material-symbols-outlined').contains('logout').click();
  cy.contains('button', 'Cerrar Sesión').should('be.visible').click();
  cy.url().should('include', '/login');
});

const API_BASE = (Cypress.env('API_BASE') as string) || 'https://localhost:3000/api';

/**
 * Extracts the raw `_csrf=...` cookie value from a Set-Cookie header list.
 * csurf signs the CSRF token against this cookie's secret — both must match
 * on mutating requests, so we capture it per-session and re-send it explicitly
 * on every apiAs call (cy.clearCookies between logins otherwise breaks pairing).
 */
const extractCsrfCookie = (setCookieHeaders: string | string[] | undefined): string => {
  if (!setCookieHeaders) return '';
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const h of headers) {
    const m = /_csrf=([^;]+)/.exec(h);
    if (m) return m[1];
  }
  return '';
};

Cypress.Commands.add('apiLogin', (username: string, password: string) => {
  cy.clearCookies();
  return cy.request({
    method: 'POST',
    url: `${API_BASE}/user/login`,
    body: { username, password },
    failOnStatusCode: false,
  }).then((loginRes) => {
    expect(loginRes.status, `login(${username})`).to.eq(200);
    const { token, role, user_id, permissions } = loginRes.body;

    return cy.request({
      method: 'GET',
      url: `${API_BASE}/user/csrf-token`,
      headers: { Authorization: `Bearer ${token}` },
    }).then((csrfRes) => {
      const csrfCookie = extractCsrfCookie(csrfRes.headers['set-cookie'] as string | string[]);
      const session: ApiSession = {
        token,
        role,
        user_id,
        permissions: permissions || [],
        csrfToken: csrfRes.body.csrfToken,
        csrfCookie,
      };
      return cy.wrap(session);
    });
  });
});

Cypress.Commands.add('apiAs', (session: ApiSession, options) => {
  const method = (options.method || 'GET').toString().toUpperCase();
  const needsCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const extraHeaders: Record<string, string> = {};
  if (needsCsrf) {
    extraHeaders['csrf-token'] = session.csrfToken;
    // Ship the matching _csrf cookie explicitly so csurf can verify the token,
    // regardless of what the browser cookie jar currently holds.
    if (session.csrfCookie) {
      extraHeaders['Cookie'] = `_csrf=${session.csrfCookie}`;
    }
  }
  return cy.request({
    ...options,
    url: options.url.startsWith('http') ? options.url : `${API_BASE}${options.url}`,
    headers: {
      Authorization: `Bearer ${session.token}`,
      ...extraHeaders,
      ...(options.headers || {}),
    },
    failOnStatusCode: options.failOnStatusCode ?? false,
  });
});
