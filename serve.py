import http.server
import socketserver
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

PORT = 3900
Handler = http.server.SimpleHTTPRequestHandler
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
