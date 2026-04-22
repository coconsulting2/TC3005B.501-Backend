describe('Gestión de borradores de solicitudes de viaje', () => {
  beforeEach(() => {
    cy.login(Cypress.env('SOLICITANTE_USER'), Cypress.env('SOLICITANTE_PASSWORD'));
  });

  afterEach(() => {
    cy.logout();
  });

  it('debe permitir guardar un nuevo borrador con solo los datos de destino', () => {
    cy.get('a[href="/crear-solicitud"]').first().click({ force: true });
    cy.url().should('include', '/crear-solicitud');
    cy.contains('Los campos obligatorios están marcados con un asterisco.').should('be.visible');

    cy.get('input[name="origin_country_name"]').type('México');
    cy.get('input[name="origin_city_name"]').type('Ciudad de México');
    cy.get('input[name="destination_country_name"]').type('Venezuela');
    cy.get('input[name="destination_city_name"]').type('Caracas');

    cy.contains('button', 'Guardar Borrador').click();
    cy.contains('Borrador guardado exitosamente').should('be.visible');
  });

  it('debe permitir editar un borrador existente y guardar los cambios', () => {
    cy.get('a[href="/solicitudes-draft"]').click();
    cy.get('a[href*="/completar-draft/"]').contains('Venezuela').click();
    cy.get('input[name="destination_city_name"]').clear().type('Maracaibo');
    // The edit endpoint applies the full validator even for draft PUTs, so
    // we need to fill the remaining required fields before saving.
    cy.get('input[name="beginning_date"]').first().clear().type('2026-08-01');
    cy.get('input[name="ending_date"]').first().clear().type('2026-08-10');
    cy.get('input[name="beginning_time"]').first().clear().type('09:00');
    cy.get('input[name="ending_time"]').first().clear().type('18:00');
    cy.get('input[name="requested_fee"]').clear().type('3000');
    cy.get('textarea[name="notes"]').clear().type('Borrador actualizado por Cypress');
    cy.contains('button', 'Guardar Cambios').click();
    cy.contains('Cambios guardados exitosamente.').should('be.visible');
  });

  it('debe permitir eliminar un borrador existente', () => {
    cy.get('a[href="/solicitudes-draft"]').click();
    // Scope to the first draft row and click its delete (trash) button.
    // CancelRequestModal is client:only="react", so give the island a moment to hydrate.
    cy.get('a[href^="/completar-draft/"]').first().should('be.visible');
    cy.get('a[href^="/completar-draft/"]')
      .first()
      .closest('div.flex')
      .find('button')
      .last()
      .click({ force: true });

    cy.contains('Cancelar Solicitud').should('be.visible');
    cy.contains('¿Estás seguro de que deseas cancelar esta solicitud?').should('be.visible');
    cy.contains('button', 'Confirmar').click();
  });
});
