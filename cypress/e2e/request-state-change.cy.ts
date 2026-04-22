/**
 * End-to-end del flujo Primera Revisión → Segunda Revisión:
 *   1. Como Solicitante: toma el id de una solicitud en "Primera Revisión".
 *   2. Como N2: navega a /autorizaciones, encuentra esa solicitud, la aprueba.
 *   3. Como Solicitante: verifica que la misma solicitud está ahora en "Segunda Revisión".
 *
 * Nota: el test depende de que haya datos dummy con una solicitud en estado
 * "Primera Revisión". Si fallase por ausencia de datos, corre
 * `bun run docker:dev:clean && bun run docker:dev` para re-seedear.
 */
describe('Proceso de autorización de una solicitud desde Primera Revisión hasta Segunda Revisión', () => {
  function buscarSolicitud(id: string) {
    cy.document().then((doc) => {
      const links = [...doc.querySelectorAll('a[href^="/autorizar-solicitud/"]')];
      const link = links.find((a) => (a as HTMLAnchorElement).href?.includes(id));
      if (link) {
        cy.wrap(link).click();
        cy.contains('button', 'Aceptar').click();
        cy.contains('button', 'Confirmar').should('be.visible').click();
      } else {
        cy.wait(2000);
        avanzarPagina(id);
      }
    });
  }

  function avanzarPagina(id: string) {
    cy.get('div.flex.justify-center.items-center.gap-1\\.5.mt-6 > button')
      .filter((_, el) => /^\d+$/.test(el.textContent || ''))
      .then(($pageButtons) => {
        const currentBtn = $pageButtons.filter((_, el) =>
          el.classList.contains('bg-primary-500') &&
          el.classList.contains('text-white')
        );
        const currentIndex = $pageButtons.index(currentBtn);
        const nextPageBtn = $pageButtons.get(currentIndex + 1);

        if (nextPageBtn) {
          cy.wrap(nextPageBtn).click();
          buscarSolicitud(id);
        } else {
          cy.get('div.flex.justify-center.items-center.gap-1\\.5.mt-6 > button')
            .contains('»')
            .then(($nextBtn) => {
              if (!$nextBtn.prop('disabled')) {
                cy.wrap($nextBtn).click();
                cy.wait(500);
                buscarSolicitud(id);
              } else {
                throw new Error(`No se encontró la solicitud con ID: ${id}`);
              }
            });
        }
      });
  }

  afterEach(() => {
    cy.logout();
  });

  it('debe obtener el ID de la primera solicitud en estado "Primera Revisión" desde el perfil del solicitante', () => {
    cy.login(Cypress.env('SOLICITANTE_USER'), Cypress.env('SOLICITANTE_PASSWORD'));

    cy.contains('.status-pill', 'Primera Revisión')
      .first()
      .closest('div.flex')
      .within(() => {
        cy.get('a[href^="/detalles-solicitud/"]')
          .first()
          .invoke('attr', 'href')
          .then((href) => {
            const id = (href || '').replace('/detalles-solicitud/', '').trim();
            Cypress.env('request_id', id);
          });
      });
  });

  it('debe autorizar la solicitud identificada y cambiar su estado a Segunda Revisión', () => {
    cy.login(Cypress.env('N2_USER'), Cypress.env('N2_PASSWORD'));

    cy.get('li').contains('AUTORIZACIONES').click();
    buscarSolicitud(Cypress.env('request_id'));
  });

  it('debe mostrar que la solicitud haya cambiado a estado "Segunda Revisión" desde el perfil del solicitante', () => {
    cy.login(Cypress.env('SOLICITANTE_USER'), Cypress.env('SOLICITANTE_PASSWORD'));

    cy.contains(`#${Cypress.env('request_id')}`)
      .closest('div.flex')
      .should('contain.text', 'Segunda Revisión');
  });
});
