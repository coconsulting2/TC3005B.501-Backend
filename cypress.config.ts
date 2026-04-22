import 'dotenv/config';
import { defineConfig } from 'cypress';

export default defineConfig({
  e2e:{
    supportFile: 'cypress/support/e2e.ts',
    baseUrl: 'https://localhost:4321',
    chromeWebSecurity: false,
    // Hard ceilings so a runaway spec can't hang the whole suite (as happened
    // with request-state-change's recursive pagination search).
    defaultCommandTimeout: 6000,
    pageLoadTimeout: 15000,
    retries: { runMode: 0, openMode: 0 },
    env: {
      SOLICITANTE_USER: process.env.CYPRESS_SOLICITANTE_USER,
      SOLICITANTE_PASSWORD: process.env.CYPRESS_SOLICITANTE_PASSWORD,
      N1_USER: process.env.CYPRESS_N1_USER,
      N1_PASSWORD: process.env.CYPRESS_N1_PASSWORD,
      N2_USER: process.env.CYPRESS_N2_USER,
      N2_PASSWORD: process.env.CYPRESS_N2_PASSWORD,
      ADMIN_USER: process.env.CYPRESS_ADMIN_USER,
      ADMIN_PASSWORD: process.env.CYPRESS_ADMIN_PASSWORD,
      AV_USER: process.env.CYPRESS_AV_USER,
      AV_PASSWORD: process.env.CYPRESS_AV_PASSWORD,
      CPP_USER: process.env.CYPRESS_CPP_USER,
      CPP_PASSWORD: process.env.CYPRESS_CPP_PASSWORD,
    },
  }
})