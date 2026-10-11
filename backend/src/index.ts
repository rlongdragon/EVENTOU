import { createApp } from './app.js';
import { migrate } from './db/index.js';
import { startIngestionScheduler } from './modules/ingestion/ingestion.scheduler.js';

const port = Number(process.env.PORT ?? 3000);

migrate();

createApp().listen(port, () => {
  console.log(`EVENTOU backend listening on http://localhost:${port}`);
});

startIngestionScheduler();
