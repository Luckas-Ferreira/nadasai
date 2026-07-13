const FIXTURE = 'sample.png';

/**
 * Regression: the current-file bar's effect used to read the `thumb` signal it
 * also wrote, so every write re-ran the effect and minted another object URL.
 * The tab locked up the instant a file entered the session. Counting
 * createObjectURL calls catches that loop directly.
 */
describe('upload does not lock up the tab', () => {
  it('mints a bounded number of object URLs', () => {
    let created = 0;

    cy.visit('/', {
      onBeforeLoad(win) {
        const original = win.URL.createObjectURL.bind(win.URL);
        win.URL.createObjectURL = (blob) => {
          created++;
          return original(blob);
        };
      },
    });

    cy.get('input[type=file]').first().selectFile(`cypress/fixtures/${FIXTURE}`, { force: true });

    cy.contains(FIXTURE).should('be.visible');
    cy.wait(2000);

    // The bar needs exactly one. A runaway effect reaches thousands.
    cy.then(() => expect(created).to.be.lessThan(10));
  });
});
