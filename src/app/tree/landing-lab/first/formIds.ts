/**
 * Ids of the forms the footer's primary button submits (`<button form={id}>`). Every
 * primary action sits in the footer, so the forms carry no submit button of their own.
 */
export const FORM_ID = {
  pilot: "first-pilot-form",
  notify: "first-notify-form",
} as const;

export const MIRROR_FORM_ID = { ask: "first-mirror-form", retry: "first-mirror-retry-form" } as const;
