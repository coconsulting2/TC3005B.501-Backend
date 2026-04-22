/**
 * End-to-end coverage of the granular permission system:
 *   1. Each seeded role resolves to its expected permission set.
 *   2. Missing token → 401; insufficient permission → 403.
 *   3. Admin can CRUD the catalog and groups.
 *   4. Admin can grant/revoke permissions directly to a user (GRANT-only, additive).
 *   5. Admin can grant/revoke permission groups on a role / on a user.
 */

const ROLE_EXPECTED = {
  Solicitante: [
    'travel_request:create',
    'travel_request:view_own',
    'travel_request:view_any',
    'travel_request:edit_own',
    'travel_request:submit',
    'travel_request:cancel',
    'receipt:upload',
    'receipt:delete_own',
    'expense:view',
    'expense:submit',
    'user:view_self',
  ],
  N1: [
    'travel_request:authorize',
    'authorizer:view_alerts',
    'travel_request:view_any',
    'user:view_self',
  ],
  N2: [
    'travel_request:authorize',
    'authorizer:view_alerts',
    'travel_request:view_any',
    'user:view_self',
  ],
  'Agencia de viajes': [
    'travel_agent:attend',
    'travel_request:view_any',
    'user:view_self',
  ],
  'Cuentas por pagar': [
    'accounts_payable:attend',
    'accounting:export',
    'receipt:validate',
    'expense:view',
    'travel_request:view_any',
    'user:view_self',
  ],
  Administrador: [
    'user:list',
    'user:create',
    'user:edit',
    'permission:read',
    'permission:write',
    'permission_group:manage',
    'role:manage_permissions',
    'user:manage_permissions',
    'user:view_self',
  ],
} as const;

const CREDS = {
  Solicitante: [Cypress.env('SOLICITANTE_USER'), Cypress.env('SOLICITANTE_PASSWORD')],
  N1: [Cypress.env('N1_USER'), Cypress.env('N1_PASSWORD')],
  N2: [Cypress.env('N2_USER'), Cypress.env('N2_PASSWORD')],
  'Agencia de viajes': [Cypress.env('AV_USER'), Cypress.env('AV_PASSWORD')],
  'Cuentas por pagar': [Cypress.env('CPP_USER'), Cypress.env('CPP_PASSWORD')],
  Administrador: [Cypress.env('ADMIN_USER'), Cypress.env('ADMIN_PASSWORD')],
} as const;

const PERMISSIONS_API_BASE = (Cypress.env('API_BASE') as string) || 'https://localhost:3000/api';

describe('Granular permission system — E2E', () => {
  // ─── 1. Role → permission resolution ──────────────────────────────────────
  describe('Role → effective permission resolution', () => {
    (Object.keys(ROLE_EXPECTED) as Array<keyof typeof ROLE_EXPECTED>).forEach((role) => {
      it(`${role} gets its canonical permission set`, () => {
        const [user, pass] = CREDS[role];
        cy.apiLogin(user, pass).then((session) => {
          expect(session.role).to.eq(role);
          const expected = ROLE_EXPECTED[role];
          for (const code of expected) {
            expect(session.permissions, `${role} should include ${code}`).to.include(code);
          }
        });
      });
    });

    it('exposes the same permission set via GET /me/permissions', () => {
      const [user, pass] = CREDS.N1;
      cy.apiLogin(user, pass).then((session) => {
        cy.apiAs(session, { url: '/user/me/permissions' }).then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body.role).to.eq('N1');
          expect(res.body.permissions).to.include('travel_request:authorize');
        });
      });
    });
  });

  // ─── 2. Auth-bypass + 403 checks ──────────────────────────────────────────
  describe('Auth guards', () => {
    it('401 when no token is sent to a permission-gated endpoint', () => {
      cy.request({
        method: 'GET',
        url: `${PERMISSIONS_API_BASE}/admin/permissions`,
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(401);
      });
    });

    it('403 when an authenticated user lacks the required permission', () => {
      const [user, pass] = CREDS.Solicitante;
      cy.apiLogin(user, pass).then((session) => {
        cy.apiAs(session, { url: '/admin/permissions' }).then((res) => {
          expect(res.status).to.eq(403);
        });
      });
    });
  });

  // ─── 3. Admin CRUD on permission catalog ──────────────────────────────────
  describe('Admin — permission catalog CRUD', () => {
    const uniqueCode = `test_resource:test_action_${Date.now()}`;

    it('creates, lists, updates and deactivates a permission', () => {
      const [user, pass] = CREDS.Administrador;
      cy.apiLogin(user, pass).then((admin) => {
        // create
        cy.apiAs(admin, {
          method: 'POST',
          url: '/admin/permissions',
          body: { code: uniqueCode, resource: 'test_resource', action: 'test_action', description: 'cypress' },
        }).then((res) => {
          expect(res.status).to.eq(201);
          const permissionId = res.body.permissionId;
          expect(permissionId).to.be.a('number');

          // list
          cy.apiAs(admin, { url: '/admin/permissions' }).then((r) => {
            expect(r.status).to.eq(200);
            const codes = r.body.map((p: { code: string }) => p.code);
            expect(codes).to.include(uniqueCode);
          });

          // update
          cy.apiAs(admin, {
            method: 'PATCH',
            url: `/admin/permissions/${permissionId}`,
            body: { description: 'updated-by-cypress' },
          }).then((r) => {
            expect(r.status).to.eq(200);
            expect(r.body.description).to.eq('updated-by-cypress');
          });

          // soft delete
          cy.apiAs(admin, {
            method: 'DELETE',
            url: `/admin/permissions/${permissionId}`,
          }).then((r) => {
            expect(r.status).to.eq(200);
            expect(r.body.active).to.eq(false);
          });
        });
      });
    });
  });

  // ─── 4. Direct user grant / revoke ────────────────────────────────────────
  describe('Direct user grant (additive over role)', () => {
    it('granting user:list to a Solicitante enables GET /admin/get-user-list, revoking removes access', () => {
      const [adminUser, adminPass] = CREDS.Administrador;
      const [solUser, solPass] = CREDS.Solicitante;

      cy.apiLogin(adminUser, adminPass).then((admin) => {
        cy.apiLogin(solUser, solPass).then((sol) => {
          const solUserId = sol.user_id;

          // Find the permissionId of user:list
          cy.apiAs(admin, { url: '/admin/permissions' }).then((r) => {
            const perm = r.body.find((p: { code: string }) => p.code === 'user:list');
            expect(perm, 'user:list exists in seed').to.exist;

            // Idempotent setup: revoke any leftover grant from prior runs so
            // the baseline-403 assertion below is deterministic.
            cy.apiAs(admin, {
              method: 'DELETE',
              url: `/admin/users/${solUserId}/permissions/${perm.permissionId}`,
            }).then(() => {
              // Baseline check requires a fresh session so the new empty set is resolved.
              cy.apiLogin(solUser, solPass).then((solClean) => {
                expect(solClean.permissions).to.not.include('user:list');
                cy.apiAs(solClean, { url: '/admin/get-user-list' }).then((baseline) => {
                  expect(baseline.status).to.eq(403);
                });
              });
            });

            // Grant it to the Solicitante user directly
            cy.apiAs(admin, {
              method: 'POST',
              url: `/admin/users/${solUserId}/permissions`,
              body: { permissionIds: [perm.permissionId] },
            }).then((grant) => {
              expect(grant.status).to.eq(200);

              // Re-login to refresh permissions (login returns a fresh set)
              cy.apiLogin(solUser, solPass).then((solAfter) => {
                expect(solAfter.permissions).to.include('user:list');

                // Endpoint now returns 200
                cy.apiAs(solAfter, { url: '/admin/get-user-list' }).then((r2) => {
                  expect(r2.status).to.eq(200);
                });

                // Revoke
                cy.apiAs(admin, {
                  method: 'DELETE',
                  url: `/admin/users/${solUserId}/permissions/${perm.permissionId}`,
                }).then((del) => {
                  expect(del.status).to.eq(204);

                  // Re-login; permission gone
                  cy.apiLogin(solUser, solPass).then((solFinal) => {
                    expect(solFinal.permissions).to.not.include('user:list');
                    cy.apiAs(solFinal, { url: '/admin/get-user-list' }).then((r3) => {
                      expect(r3.status).to.eq(403);
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });

  // ─── 5. Permission group CRUD + attach / detach ───────────────────────────
  describe('Permission groups — CRUD + assignments', () => {
    it('creates a group, adds permissions, assigns to a user, verifies effective set', () => {
      const [adminUser, adminPass] = CREDS.Administrador;
      const [solUser, solPass] = CREDS.Solicitante;
      const groupName = `CypressGroup_${Date.now()}`;

      cy.apiLogin(adminUser, adminPass).then((admin) => {
        // Create group
        cy.apiAs(admin, {
          method: 'POST',
          url: '/admin/permission-groups',
          body: { groupName, description: 'temporary group created by cypress' },
        }).then((res) => {
          expect(res.status).to.eq(201);
          const groupId = res.body.groupId;

          // Look up user:list permission id
          cy.apiAs(admin, { url: '/admin/permissions' }).then((r) => {
            const perm = r.body.find((p: { code: string }) => p.code === 'user:list');

            // Attach permission to group
            cy.apiAs(admin, {
              method: 'POST',
              url: `/admin/permission-groups/${groupId}/permissions`,
              body: { permissionIds: [perm.permissionId] },
            }).then((attach) => {
              expect(attach.status).to.eq(200);

              // Find solicitante user_id
              cy.apiLogin(solUser, solPass).then((sol) => {
                const solId = sol.user_id;

                // Attach group to user
                cy.apiAs(admin, {
                  method: 'POST',
                  url: `/admin/users/${solId}/permission-groups`,
                  body: { groupIds: [groupId] },
                }).then((gAttach) => {
                  expect(gAttach.status).to.eq(200);

                  // Re-login & check effective set
                  cy.apiLogin(solUser, solPass).then((solAfter) => {
                    expect(solAfter.permissions).to.include('user:list');
                  });

                  // Clean up: remove group from user, then deactivate group
                  cy.apiAs(admin, {
                    method: 'DELETE',
                    url: `/admin/users/${solId}/permission-groups/${groupId}`,
                  }).then((dUser) => {
                    expect(dUser.status).to.eq(204);

                    cy.apiAs(admin, {
                      method: 'DELETE',
                      url: `/admin/permission-groups/${groupId}`,
                    }).then((dGroup) => {
                      expect(dGroup.status).to.eq(200);
                      expect(dGroup.body.active).to.eq(false);
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});
