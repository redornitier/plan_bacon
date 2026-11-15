// Test-only entry point. Never referenced by wrangler.jsonc or the production build.
import worker from '../worker/index';
import type { Env } from '../worker/env';

export default {
  fetch(request: Request, env: Env) {
    const fault = request.headers.get('x-test-fault');
    if (!fault) return worker.fetch(request, env);
    let puts = 0;
    const photos = new Proxy(env.PHOTOS, { get(target, key) {
      if (key === 'put') return async (...args: Parameters<R2Bucket['put']>) => {
        if (++puts === (fault === 'upload-second' ? 2 : 1) && fault.startsWith('upload')) throw new Error('Simulated R2 failure');
        return target.put(...args);
      };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    const db = new Proxy(env.DB, { get(target, key) {
      if (key === 'prepare') return (sql: string) => {
        const statement = target.prepare(sql);
        if (!(/^(INSERT INTO opiniones|UPDATE opiniones)/.test(sql)) || !fault.startsWith('db')) return statement;
        return { bind: (...args: unknown[]) => ({ first: async () => {
          if (fault === 'db-after') await statement.bind(...args).first();
          throw new Error('Simulated D1 failure');
        } }) };
      };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    return worker.fetch(request, { ...env, PHOTOS: photos, DB: db });
  },
};
