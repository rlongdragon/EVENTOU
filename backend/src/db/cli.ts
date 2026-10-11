// npm run db:migrate 的進入點
import { closeDb } from './client.js';
import { migrate } from './migrate.js';

migrate();
closeDb();
console.log('[db] migrations up to date');
