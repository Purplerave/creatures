/**
 * Los tests del servidor hablan con `localhost`, pero este entorno (y cualquier
 * CI con egress proxy) puede exportar `HTTP_PROXY` + `NODE_USE_ENV_PROXY=1`,
 * lo que haría que `fetch()` de Node enrutara 127.0.0.1 por el proxy y cayera.
 * Importar este módulo ANTES de cualquier `fetch` evita eso añadiendo los
 * hosts locales a `NO_PROXY` sin tocar el resto de variables del entorno.
 * En entornos sin proxy es un no-op.
 */

const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];

for (const key of ['NO_PROXY', 'no_proxy']) {
  const current = process.env[key];
  const entries = (current ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
  const coversAll = entries.includes('*') || LOCAL_HOSTS.every((host) => entries.includes(host));
  if (!coversAll) {
    process.env[key] = [...entries, ...LOCAL_HOSTS].join(',');
  }
}
