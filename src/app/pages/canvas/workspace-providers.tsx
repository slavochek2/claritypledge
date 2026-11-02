/**
 * @file workspace-providers.tsx
 * @description P1536: what the canvas workspace's route element provides to everything under it: the workspace value (canvas-workspace-context) and the bus that
 * carries an "Add to chat" tag to the thread's composer (composer-tag-bus). One component so the route element stays short.
 */
import type { ReactNode } from 'react';
import { CanvasWorkspaceContext, type CanvasWorkspaceValue } from '@/app/components/canvas/canvas-workspace-context';
import { ComposerTagContext, type ComposerTagBus } from '@/app/pages/chat/composer-tag-bus';

export function WorkspaceProviders({ value, bus, children }: { value: CanvasWorkspaceValue; bus: ComposerTagBus; children: ReactNode }) {
  return (
    <CanvasWorkspaceContext.Provider value={value}>
      <ComposerTagContext.Provider value={bus}>{children}</ComposerTagContext.Provider>
    </CanvasWorkspaceContext.Provider>
  );
}
