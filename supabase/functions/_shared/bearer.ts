/** The signed-in user behind a `Bearer <jwt>` Authorization header, or null for none or an invalid token. */
export async function bearerUserId(req: Request, getUserId: (token: string) => Promise<string | null>): Promise<string | null> {
  const header = req.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return await getUserId(header.slice('Bearer '.length));
}
