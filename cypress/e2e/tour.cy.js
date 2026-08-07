const FIXTURE = 'sample.png';

/** The dropzone's <input type=file> is visually hidden, hence `force`. */
function upload() {
  cy.get('input[type=file]').first().selectFile(`cypress/fixtures/${FIXTURE}`, { force: true });
}

function shot(name) {
  cy.screenshot(name, { capture: 'viewport', overwrite: true });
}

describe('Nada Sai — UI tour', () => {
  it('home, empty', () => {
    cy.visit('/');
    cy.get('h1').should('be.visible');
    shot('01-home-empty');
  });

  it('home, with a file loaded', () => {
    cy.visit('/');
    upload();

    cy.contains(FIXTURE).should('be.visible');
    shot('02-home-with-file');
  });

  it('compress: idle, then result', () => {
    cy.visit('/');
    upload();
    cy.visit('/compress');
    shot('03-compress-idle');

    cy.contains('button', /^(Compress|Comprimir)$/i).click();

    cy.contains(/KB|MB/).should('be.visible');
    shot('04-compress-result');
  });

  it('resize: exact dimensions, including upscale', () => {
    cy.visit('/');
    upload();
    cy.visit('/resize');
    shot('05-resize-idle');

    // Source is 1200x800; ask for more to prove upscaling actually happens.
    cy.get('input[type=number]').first().clear().type('1920');
    cy.contains('button', /^(Resize|Redimensionar)$/i).click();

    cy.contains('1920').should('be.visible');
    shot('06-resize-result');
  });

  it('convert: format grid and PDF options', () => {
    cy.visit('/');
    upload();
    cy.visit('/convert');
    shot('07-convert-idle');

    // AVIF is gone: canvas silently produced PNG bytes inside a .avif file.
    cy.contains('button', 'AVIF').should('not.exist');

    cy.contains('button', 'PDF').click();
    shot('08-convert-pdf-selected');
  });

  it('crop: editor with the cropper mounted', () => {
    cy.visit('/');
    upload();
    cy.visit('/crop');

    cy.get('.cropper-container', { timeout: 15000 }).should('exist');
    shot('09-crop-idle');

    cy.contains('button', /Apply crop|Aplicar corte/i).click();
    shot('10-crop-result');
  });

  it('remove-bg: loaded, waiting for an explicit run', () => {
    cy.visit('/');
    upload();
    cy.visit('/remove-bg');

    // Arriving with a file must NOT auto-run the model.
    cy.contains('button', /Remove background|Remover fundo/i).should('be.visible');
    shot('11-removebg-idle');
  });

  it('rejects a non-image with a visible error', () => {
    cy.visit('/');

    cy.get('input[type=file]')
      .first()
      .selectFile(
        {
          contents: Cypress.Buffer.from('not an image'),
          fileName: 'notes.txt',
          mimeType: 'text/plain',
        },
        { force: true },
      );

    cy.get('[role=alert]').should('be.visible');
    shot('12-error-bad-file');
  });

  it('light theme', () => {
    cy.visit('/');
    cy.get('button[aria-label*="theme" i], button[aria-label*="tema" i]').first().click();
    upload();
    shot('13-light-theme');
  });

  it('mobile viewport', () => {
    cy.viewport(390, 844);
    cy.visit('/');
    shot('14-mobile-home');

    upload();
    cy.visit('/compress');
    shot('15-mobile-compress');
  });
});
