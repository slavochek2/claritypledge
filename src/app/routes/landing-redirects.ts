/** Old or singular landing paths → their canonical route (rendered as <Navigate replace>). */
export const LANDING_REDIRECTS: ReadonlyArray<readonly [from: string, to: string]> = [
  ["/hospital", "/hospitals"],
  ["/change-leads", "/change-managers"], // P1558: the page's first name
  ["/group-terms", "/communities"], // the terms for an organizer live on the community use-case page
  ["/program", "/pricing"], // P1087: /pricing is canonical
  ["/offers", "/pricing"],
];
