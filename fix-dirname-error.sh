#!/bin/bash

# Find the line with 'await server.init' and add the missing globals before it
sed -i '/await server.init/i \
globalThis.__filename = fileURLToPath(import.meta.url); \
globalThis.__dirname = path.dirname(globalThis.__filename);' build/handler.js

echo "Successfully patched handler.js with __dirname and __filename globals" 