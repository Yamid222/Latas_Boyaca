import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const login = fs.readFileSync(path.join(root, 'views', 'login.html'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'views', 'dashboard.html'), 'utf8');
const out = `/* Generado por build-view-bundles.mjs — copia de views/*.html para entornos sin fetch (file://) */
export const loginHtmlFallback = ${JSON.stringify(login)};
export const dashboardHtmlFallback = ${JSON.stringify(dashboard)};
`;
fs.writeFileSync(path.join(__dirname, 'viewFallbacks.mjs'), out, 'utf8');
console.log('viewFallbacks.mjs generado');
