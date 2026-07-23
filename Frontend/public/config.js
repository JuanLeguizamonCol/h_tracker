// Runtime configuration — OVERWRITTEN by the container entrypoint at startup
// from the BACKEND_URL env var. This committed default (empty API_URL) is what
// local `vite dev` and same-origin deployments use, where the app talks to the
// backend through the relative `/api` path.
window.__ENV__ = { API_URL: "" };
