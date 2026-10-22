import { createApplication } from './bootstrap.js';

const app = await createApplication();
await app.listen(process.env.PORT ?? 3000);
