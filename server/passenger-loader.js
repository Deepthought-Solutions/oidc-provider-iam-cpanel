// This file is a CommonJS wrapper to load the main ES module server.
// Phusion Passenger's Node.js loader uses require(), which cannot be used on an ESM
// module with top-level await. This wrapper uses a dynamic import() to load
// the server, which is compatible with the CJS environment.

import('./server.mjs').catch(err => {
  console.error("Failed to load ES module server:", err);
  process.exit(1);
}).then((server) => {
  server.startServer()
});
