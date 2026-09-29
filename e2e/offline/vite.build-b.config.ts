/**
 * P1369 offline harness: "deploy B". The repo's own vite config, unchanged, except that every
 * emitted JS/CSS/asset file name carries a `-b` suffix. That models the worst real deploy — every
 * chunk changed — so a cached shell from build A cannot accidentally load build B's chunks (or the
 * reverse) and pass by coincidence. The service worker's precache manifest is generated from this
 * build's own output, so it stays internally consistent.
 */
import { mergeConfig, type UserConfig } from 'vite';
import base from '../../vite.config';

type ConfigFn = (env: { command: 'build'; mode: string; isSsrBuild?: boolean; isPreview?: boolean }) => UserConfig | Promise<UserConfig>;

export default async () => {
  const resolved =
    typeof base === 'function'
      ? await (base as unknown as ConfigFn)({ command: 'build', mode: 'production' })
      : (base as UserConfig);
  return mergeConfig(resolved, {
    build: {
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name]-[hash]-b.js',
          chunkFileNames: 'assets/[name]-[hash]-b.js',
          assetFileNames: 'assets/[name]-[hash]-b[extname]',
        },
      },
    },
  });
};
