/**
 * @file pac-launch.ts
 * @description Chromium launch options for the P1536 walks. When P1536_PAC names a proxy auto-config file (a path or file:// URL), the browser sends the hosted TEST host through it; unset, the
 * options are the project's own. The path comes from the environment so no personal path lives in a spec.
 */
export function pacLaunchOptions(): { args: string[] } {
  const args = ['--use-fake-ui-for-media-stream'];
  const pac = process.env.P1536_PAC;
  if (pac) args.push(`--proxy-pac-url=${pac.startsWith('file://') ? pac : `file://${pac}`}`);
  return { args };
}
