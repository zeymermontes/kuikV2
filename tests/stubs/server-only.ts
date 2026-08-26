// Stub for the `server-only` guard so `node --test` can load server modules.
//
// The real package has no export resolvable outside a bundler that sets the
// react-server condition, so importing lib/crypto.ts in a plain node run fails
// with MODULE_NOT_FOUND. The guard earns its place in the source — it is what
// stops a decrypted token reaching a client bundle — so neutralise it here
// instead of deleting it there. Wired up via `paths` in tsconfig.test.json.
export {};
