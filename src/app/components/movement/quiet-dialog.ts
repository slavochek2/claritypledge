/**
 * @file quiet-dialog.ts
 * @description P1061: the shape the two dialogs of position movement share (the filter and the story's panel):
 * how they take the focus, and their head.
 */

/**
 * A dialog that takes the focus itself, not its first control: nothing inside is ringed by surprise, and on
 * a phone no keyboard rises over the content. No outline on the dialog, which holds the focus only for that.
 */
export const QUIET_DIALOG = {
  'aria-describedby': undefined,
  tabIndex: -1,
  onOpenAutoFocus: (event: Event) => { event.preventDefault(); (event.currentTarget as HTMLElement).focus(); },
  className: 'flex max-h-[90dvh] w-[calc(100%-1.5rem)] flex-col gap-0 rounded-lg p-0 focus:outline-none sm:max-w-lg',
} as const;

/**
 * The head of either dialog. The dialog draws its close button 40px tall, 16px from the top: a head of 72px
 * with its content centred puts the title on that button's middle line, in both dialogs alike.
 */
export const DIALOG_HEAD = 'flex min-h-[72px] flex-row items-center gap-1 space-y-0 border-b border-border px-4 py-0 pr-14 text-left';
