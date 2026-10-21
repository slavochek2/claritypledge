/**
 * @file remove-attendee-copy.ts
 * @description P1515: the words of the host's "remove a registered person" control on the event page.
 * [FOUNDER DECISION: every string here is proposed copy, listed in the spec's UI Contract.]
 */
export const REMOVE_ATTENDEE_COPY = {
  button: 'Remove',
  /** the control's accessible name; the longer form is its title (the tooltip) */
  buttonLabel: (name: string) => `Remove ${name}`,
  buttonTitle: (name: string) => `Remove ${name} from this event`,
  title: (name: string) => `Remove ${name}?`,
  body: (name: string) =>
    `${name} will come off the guest list and cannot register for this event again. They also lose access to anything shared with this event, such as canvases.`,
  confirm: 'Remove',
  cancel: 'Keep',
  done: (name: string) => `${name} removed`,
  error: "Couldn't remove them. Please try again.",
} as const;
