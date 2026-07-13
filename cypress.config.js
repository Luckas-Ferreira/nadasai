/**
 * Plain object rather than `defineConfig` — the cypress package itself is not a
 * local dependency here (only the global binary), so importing from 'cypress'
 * fails to resolve.
 */
module.exports = {
  e2e: {
    baseUrl: 'http://localhost:4200',
    supportFile: false,
    specPattern: 'cypress/e2e/**/*.cy.js',
    // Matches the Electron window, so `capture: 'viewport'` screenshots aren't cropped.
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    defaultCommandTimeout: 15000,
  },
};
