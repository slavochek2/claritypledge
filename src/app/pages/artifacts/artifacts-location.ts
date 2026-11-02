/**
 * @file artifacts-location.ts
 * @description P1545 WP3 / P1536 W5: the tabs and lists of the Artifacts page and how the address names them. Letters (Drafts, Sent,
 * Received) and Canvases (Drafts, Mine, Shared with me); `?tab=` and `&list=`, old `tab=yours|shared&type=` links rewritten. Pure, and
 * free of the row model so the page and the model can both import it.
 */

export type ArtifactTab = 'letters' | 'canvases';
/** `canvas-drafts` is the Canvases tab's Drafts list (W5); its address says `list=drafts`, like the Letters one (LIST_PARAM). */
export type ArtifactList = 'drafts' | 'sent' | 'received' | 'canvas-drafts' | 'mine' | 'shared';

/** Canvases first (3c X14): it is the default tab, so bare `/artifacts` opens Canvases > Mine. */
export const ARTIFACT_TABS: readonly ArtifactTab[] = ['canvases', 'letters'];
/** The lists of each tab, in the order the filter shows them; the first is the default. */
export const TAB_LISTS: Record<ArtifactTab, readonly ArtifactList[]> = {
  letters: ['drafts', 'sent', 'received'],
  canvases: ['canvas-drafts', 'mine', 'shared'],
};

/** Mine stays the Canvases default, so every plain `?tab=canvases` link keeps landing where it did. */
export const DEFAULT_LIST: Record<ArtifactTab, ArtifactList> = { letters: 'drafts', canvases: 'mine' };

/** The `list=` value of a list when it differs from its id. */
const LIST_PARAM: Partial<Record<ArtifactList, string>> = { 'canvas-drafts': 'drafts' };
export const listParam = (list: ArtifactList): string => LIST_PARAM[list] ?? list;


// ---------------------------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------------------------

export interface ArtifactsLocation {
  tab: ArtifactTab;
  list: ArtifactList;
  /** The URL used the old `tab=yours|shared` / `type=` scheme: the page rewrites it to `canonical`, replacing history. */
  legacy: boolean;
  /** The same URL in the current scheme (unrelated params kept). */
  canonical: URLSearchParams;
}

function parseTab(raw: string | null): ArtifactTab {
  return raw === 'letters' ? 'letters' : 'canvases';
}

function parseList(tab: ArtifactTab, raw: string | null): ArtifactList {
  const lists = TAB_LISTS[tab];
  return lists.find(l => listParam(l) === raw) ?? DEFAULT_LIST[tab];
}

/**
 * Reads the tab and list from the URL: `?tab=letters|canvases` (default canvases) and `&list=` (default: the tab's first).
 * Old links keep working: `tab=yours` is Drafts (Mine with `type=canvases`), `tab=shared` is Received (Shared with me
 * with `type=canvases`), and a bare `type=` follows the old default tab, yours.
 */
export function resolveArtifactsLocation(params: URLSearchParams): ArtifactsLocation {
  const rawTab = params.get('tab');
  const type = params.get('type');
  const legacy = rawTab === 'yours' || rawTab === 'shared' || (rawTab === null && type !== null);
  let tab: ArtifactTab;
  let list: ArtifactList;
  if (legacy) {
    tab = type === 'canvases' ? 'canvases' : 'letters';
    const incoming = rawTab === 'shared';
    list = tab === 'canvases' ? (incoming ? 'shared' : 'mine') : (incoming ? 'received' : 'drafts');
  } else {
    tab = parseTab(rawTab);
    list = parseList(tab, params.get('list'));
  }
  const canonical = new URLSearchParams(params);
  if (legacy) {
    canonical.set('tab', tab);
    canonical.set('list', list);
    canonical.delete('type');
  }
  return { tab, list, legacy, canonical };
}
