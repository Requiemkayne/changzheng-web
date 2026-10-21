import http.server, socketserver, os, sys, functools
ROOT = r'C:\Users\HP\Desktop\changzheng-web-main\competition-timeline'
PORT = 8899
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'public, max-age=600')
        super().end_headers()
Handler = functools.partial(H, directory=ROOT)
class S(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    request_queue_size = 256
with S(('0.0.0.0', PORT), Handler) as httpd:
    print('serving', ROOT, 'on 0.0.0.0:%d' % PORT, flush=True)
    httpd.serve_forever()
