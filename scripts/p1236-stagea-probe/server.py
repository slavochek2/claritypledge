import http.server, socketserver, os, sys, datetime
LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'phone.log')
class H(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(n).decode('utf-8', 'replace')
        with open(LOG, 'a') as f:
            f.write(body + '\n')
        sys.stderr.write(body + '\n'); sys.stderr.flush()
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()
    def log_message(self, *a): pass
os.chdir(os.path.dirname(os.path.abspath(__file__)))
with socketserver.TCPServer(('127.0.0.1', 8899), H) as s:
    sys.stderr.write('serving on 8899\n'); sys.stderr.flush()
    s.serve_forever()
