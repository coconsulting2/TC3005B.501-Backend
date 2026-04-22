describe('Cancelación de solicitudes de viaje por el solicitante', () => {
  beforeEach(() => {
    cy.login(Cypress.env('SOLICITANTE_USER'), Cypress.env('SOLICITANTE_PASSWORD'));
  });

  afterEach(() => {
    cy.logout();
  });

  it('debe permitir cancelar una solicitud en estado "Primera Revisión"', () => {
    // Find a row whose status pill shows "Primera Revisión" and click the
    // delete (trash) button in that row — the CancelRequestModal renders as
    // the last button inside the row container.
    cy.contains('.status-pill', 'Primera Revisión')
      .first()
      .closest('div.flex')
      .within(() => {
        cy.get('button').last().click({ force: true });
      });

    cy.contains('Cancelar Solicitud').should('be.visible');
    cy.contains('¿Estás seguro de que deseas cancelar esta solicitud?').should('be.visible');
    cy.contains('button', 'Confirmar').click();
  });

  it('no debe mostrar botón de cancelar en solicitudes "Comprobación gastos del viaje"', () => {
    // Rows with this status suppress the delete button (isNotCancelable flag
    // in ApplicantView.astro). The material icon text would be "delete" if
    // the CancelRequestModal was rendered — its absence is the invariant.
    cy.contains('.status-pill', 'Comprobación gastos del viaje')
      .first()
      .closest('div.flex')
      .find('span.material-symbols-outlined')
      .should('have.length', 0);
  });
});
