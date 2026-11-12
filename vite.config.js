import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * In production Vercel runs everything in /api as a serverless function.
 * Locally, plain `vite` knows nothing about /api, so this tiny plugin mounts
 * the same handler as dev middleware. That way `npm install && npm start`
 * works without the Vercel CLI, and the API key never reaches the browser.
 */
function localApi(env) {
  return {
    name: 'local-api',
    configureServer(server) {
      for (const [key, value] of Object.entries(env)) {
        if (!(key in process.env)) process.env[key] = value;
      }

      server.middlewares.use('/api/study', async (req, res) => {
        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const text = Buffer.concat(chunks).toString('utf8');
          try {
            req.body = text ? JSON.parse(text) : undefined;
          } catch {
            req.body = text;
          }

          // Small shim so the handler can use the same res.status().json() API Vercel gives it.
          res.status = (code) => {
            res.statusCode = code;
            return res;
          };
          res.json = (data) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
            return res;
          };

          const { default: handler } = await server.ssrLoadModule('/api/study.js');
          await handler(req, res);
        } catch (err) {
          server.config.logger.error(err?.stack || String(err));
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: { code: 'dev_server', message: 'Local API crashed. See terminal.' } }));
          }
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), localApi(env)],
    server: { port: 5173, open: false },
  };
});
