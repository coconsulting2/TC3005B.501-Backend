describe('Creación de una solicitud de viaje por el solicitante', () => {
  beforeEach(() => {
    cy.login(Cypress.env('SOLICITANTE_USER'), Cypress.env('SOLICITANTE_PASSWORD'));
  });

  afterEach(() => {
    cy.logout();
  });

  it('debe permitir completar y enviar exitosamente una nueva solicitud de viaje', () => {
    // Dashboard CTA. Appears as "+ Nueva solicitud" when there are requests,
    // or "Solicita tu primer viaje" when the dashboard is empty. Either routes
    // to /crear-solicitud, so just navigate via the anchor href.
    cy.get('a[href="/crear-solicitud"]').first().click({ force: true });
    cy.url().should('include', '/crear-solicitud');

    cy.get('input[name="origin_country_name"]').first().type('México');
    cy.get('input[name="origin_city_name"]').first().type('CDMX');
    cy.get('input[name="destination_country_name"]').first().type('Estados Unidos');
    cy.get('input[name="destination_city_name"]').first().type('Nueva York');

    cy.get('input[name="beginning_date"]').first().type('2026-10-12');
    cy.get('input[name="ending_date"]').first().type('2026-10-20');
    cy.get('input[name="beginning_time"]').first().type('10:23');
    cy.get('input[name="ending_time"]').first().type('23:00');

    cy.get('input[name="plane_needed"]').check();
    cy.get('input[name="hotel_needed"]').check();

    cy.get('input[name="requested_fee"]').type('10000');
    cy.get('textarea[name="notes"]').type('Esta solicitud fue creada con una prueba Cypress :)');

    cy.contains('button', 'Enviar Solicitud').click();
    cy.url().should('include', '/dashboard');
  });
});
