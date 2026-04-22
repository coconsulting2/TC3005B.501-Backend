import 'cypress-file-upload';

describe('Validación al subir comprobantes', () => {
  beforeEach(() => {
    cy.login(Cypress.env('SOLICITANTE_USER'), Cypress.env('SOLICITANTE_PASSWORD'));

    cy.get('a[href="/comprobar-gastos"]').click();
    cy.url().should('include', 'comprobar-gastos');
    cy.get('a[href^="/comprobar-solicitud/"]').first().click();
    cy.get('a[href^="/subir-comprobante/"]').first().click();
  });

  it('debe aceptar archivos válidos en formato XML y PDF', () => {
    cy.get('select[name="concepto"]').select('Hospedaje');
    cy.get('input[type="number"]').type('123.45');

    cy.get('input[type="file"][accept=".pdf"]').attachFile('valid-document.pdf');
    cy.get('input[type="file"][accept=".xml"]').attachFile('valid-document.xml');

    cy.contains('button', 'Subir Comprobante').click();
    cy.contains('button', 'Confirmar').click();
    // The UI now shows inline success text instead of a window.alert().
    cy.contains('Archivos subidos correctamente').should('be.visible');
  });

  it('debe rechazar archivos con formatos inválidos', () => {
    cy.get('select[name="concepto"]').select('Hospedaje');
    cy.get('input[type="number"]').type('123.45');

    cy.get('input[type="file"]').first().attachFile('invalid-document.jpg');

    // ExpensesForm rejects invalid formats with window.alert:
    //   "Por favor, completa todos los campos correctamente."
    cy.on('window:alert', (text: string) => {
      expect(text).to.contain('Por favor, completa todos los campos correctamente.');
    });
    cy.contains('button', 'Subir Comprobante').click();
  });
});
