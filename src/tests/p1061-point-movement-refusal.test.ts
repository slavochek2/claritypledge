/**
 * P1061: get_point_movement_rows refuses a point that is not public and not validated by the caller
 * (20261117200000) by answering point_id null with every list empty. The client must report that as a failed
 * read, never as "nobody changed" (spec: a failed read is reported as a failure, never as an empty result).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

async function load() {
  vi.stubEnv('VITE_USE_REAL_API', 'true');
  vi.resetModules();
  return import('@/app/data/movement-service');
}

afterEach(() => {
  rpc.mockReset();
  vi.unstubAllEnvs();
  vi.resetModules();
});

const empty = { stories: [], verifications: [], history: [], current: [], agent_ids: [], profiles: [], events: [], groups: [] };

describe('getPointMovement: a server refusal is a failure', () => {
  it('throws when the function answers point_id null, and logs it', async () => {
    rpc.mockResolvedValue({ data: { point_id: null, ...empty }, error: null });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getPointMovement } = await load();
    await expect(getPointMovement('p-1')).rejects.toThrow('Could not load how positions changed');
    expect(rpc).toHaveBeenCalledWith('get_point_movement_rows', { p_point_id: 'p-1' });
    // The unit run is a dev build, where logDbError writes to the console instead of Sentry; a null error writes nothing.
    expect(logged).toHaveBeenCalledWith('[db-error] getPointMovement:', expect.objectContaining({ code: 'P1061_REFUSED' }));
    logged.mockRestore();
  });

  it('returns the rows when the point is answered, even with nobody in it', async () => {
    rpc.mockResolvedValue({ data: { point_id: 'p-1', ...empty }, error: null });
    const { getPointMovement } = await load();
    await expect(getPointMovement('p-1')).resolves.toMatchObject({ pointId: 'p-1' });
  });
});
