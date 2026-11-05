// P1640: the noise gate for the weekly product read. Pure: no IO, no clock, no randomness.
//
// The implementation lives in src/lib/weeklyRead.ts so the Day page can import percentLabel and the
// types: the board's import boundary (server/boundary.ts, P1445 D) refuses any specifier containing
// "analytics", so board code cannot import this file by name. Scripts and server import from here.
export * from '../src/lib/weeklyRead'
