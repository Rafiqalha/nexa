import { serve } from '@hono/node-server';
import { createTargetApp } from './app';

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? '0.0.0.0';

serve({ fetch: createTargetApp().fetch, port, hostname }, (info) => {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      msg: 'target-app listening',
      port: info.port,
    }),
  );
});
