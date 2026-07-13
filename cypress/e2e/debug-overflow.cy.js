/** Finds which element is wider than the viewport and causing horizontal scroll. */
describe('layout overflow probe', () => {
  it('reports horizontal overflow offenders', () => {
    cy.visit('/');

    cy.document().then((doc) => {
      const docEl = doc.documentElement;
      cy.log(`scrollWidth=${docEl.scrollWidth} clientWidth=${docEl.clientWidth}`);
      // eslint-disable-next-line no-console
      console.log('DOC', docEl.scrollWidth, docEl.clientWidth);

      const limit = docEl.clientWidth;
      const offenders = [];

      doc.querySelectorAll('*').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.right > limit + 1 || rect.width > limit + 1) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.getAttribute('class') || '').slice(0, 90),
            width: Math.round(rect.width),
            right: Math.round(rect.right),
          });
        }
      });

      cy.writeFile('cypress/overflow.json', {
        scrollWidth: docEl.scrollWidth,
        clientWidth: docEl.clientWidth,
        offenders: offenders.slice(0, 25),
      });
    });
  });
});
