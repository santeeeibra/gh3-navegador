# Servidor de respaldo de salas
Sin dependencias (Node 20+): `node respaldo/servidor.mjs` (PORT, por defecto 8899; ORIGENES = regex extra opcional).
Mismo protocolo que el Worker gh3-salas, salas en memoria (se pierden al reiniciar; no importa, son efimeras).
Prueba: `node test-respaldo.mjs`. Para activarlo en el sitio: subirlo a un hosting con WebSocket (Render, Fly, Deno...) y
poner su URL https en `RESPALDO` de `gh3/juego/servidor-salas.mjs`. Probar sin subirlo: `?respaldo=http://127.0.0.1:8899`.
El cliente mide `/api/sala/lista` del sitio (5 s); si falla, usa el respaldo 60 s. Las salas de cada servidor son independientes.
