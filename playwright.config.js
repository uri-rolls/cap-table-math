import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'**/*.spec.js',use:{baseURL:process.env.BASE_URL||'http://127.0.0.1:4173',...devices['iPhone 13'],defaultBrowserType:'chromium'},webServer:process.env.BASE_URL?undefined:{command:'npm start',url:'http://127.0.0.1:4173',reuseExistingServer:true},reporter:'list'});
