// Test support only (imported by tests, never by a function).
//
// Lets a test send a request through a function's real index.ts — its environment guards, its
// client construction, its request logic, its mail transport — without opening a socket.
//
// The functions here start with `serve()` from std/http, which calls Deno.listen, then
// listener.accept() and Deno.serveHttp(conn) for each connection. Replacing those two calls
// with in-memory stand-ins makes `serve()` hand every dispatched Request to the function's own
// callback. Outbound requests are answered separately: http-backend.test-util.ts.

interface PendingRequest {
  request: Request;
  resolve: (response: Response) => void;
}

export interface CapturedServer {
  /** Sends one request through the function's entry point and resolves with its response. */
  dispatch(request: Request): Promise<Response>;
}

function define(name: string, value: unknown) {
  Object.defineProperty(Deno, name, { configurable: true, writable: true, value });
}

/** Call before importing index.ts. */
export function captureStdServe(): CapturedServer {
  const queue: PendingRequest[] = [];
  const waiting: Array<(conn: unknown) => void> = [];
  const addr = { transport: 'tcp', hostname: '127.0.0.1', port: 0 };

  const connFor = (pending: PendingRequest) => ({ localAddr: addr, remoteAddr: addr, close() {}, pending });

  define('listen', () => ({
    addr,
    rid: 0,
    close() {},
    accept(): Promise<unknown> {
      const next = queue.shift();
      if (next) return Promise.resolve(connFor(next));
      return new Promise((resolve) => waiting.push(resolve));
    },
  }));

  define('serveHttp', (conn: { pending: PendingRequest }) => {
    let served = false;
    return {
      rid: 0,
      close() {},
      nextRequest() {
        if (served) return Promise.resolve(null);
        served = true;
        return Promise.resolve({
          request: conn.pending.request,
          respondWith: async (response: Response | Promise<Response>) => conn.pending.resolve(await response),
        });
      },
    };
  });

  return {
    dispatch(request: Request): Promise<Response> {
      return new Promise<Response>((resolve) => {
        const pending = { request, resolve };
        const waiter = waiting.shift();
        if (waiter) waiter(connFor(pending));
        else queue.push(pending);
      });
    },
  };
}
