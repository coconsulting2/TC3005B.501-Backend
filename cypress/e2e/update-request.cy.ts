describe('Edición de una solicitud existente desde el perfil del solicitante', () => {
  beforeEach(() => {
    cy.login(Cypress.env('SOLICITANTE_USER'), Cypress.env('SOLICITANTE_PASSWORD'));
  });

  afterEach(() => {
    cy.logout();
  });

  it('debe lograr modificar y guardar los cambios de los datos correctamente', () => {
    // The dashboard only renders the "Editar" button on rows whose request is
    // in "Primera Revisión" state. Click the first one.
    cy.contains('.status-pill', 'Primera Revisión')
      .first()
      .closest('div.flex')
      .within(() => {
        cy.contains('a', 'Editar').click({ force: true });
      });

    cy.url().should('include', '/editar-solicitud/');

    cy.get('input[name="origin_city_name"]').first().clear().type('Monterrey');
    cy.get('input[name="destination_city_name"]').first().clear().type('Chicago');
    // Seed dates are in the past relative to "today"; bump them to future so the
    // validator lets us save. Same pattern applied across all create/edit specs.
    cy.get('input[name="beginning_date"]').first().clear().type('2026-11-15');
    cy.get('input[name="ending_date"]').first().clear().type('2026-11-20');
    cy.get('input[name="beginning_time"]').first().clear().type('09:00');
    cy.get('input[name="ending_time"]').first().clear().type('18:00');
    cy.get('textarea[name="notes"]').clear().type('Esta solicitud fue modificada por una prueba de Cypress');

    cy.contains('button', 'Actualizar Solicitud').click();
    cy.url().should('include', '/dashboard');
  });
});
