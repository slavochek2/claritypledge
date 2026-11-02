/** The sentences chat-voice answers with. Its own module so the canvas mode (canvas.ts) and the handler share them without importing each other. */
export const ERR = {
  unauthorized: 'Unauthorized',
  invalidBody: 'Invalid request body',
  invalidMode: 'Invalid mode',
  invalidId: 'Invalid id',
  badKey: 'Invalid object key',
  notMember: 'Not a member of this conversation',
  notYours: 'That upload belongs to someone else',
  unsupported: 'Voice notes are not available in this chat',
  notFound: 'Upload not found',
  badAudio: 'The recording is not a valid 16 kHz mono WAV',
  tooLong: 'The recording is longer than the 2 minute limit',
  rate: 'Too many voice notes, try again in a minute',
  uploadRate: 'Too many uploads, try again in a few minutes',
  gone: 'The audio is no longer available',
  draftCap: 'Too many open canvas drafts',
  internal: 'Service temporarily unavailable',
} as const;
