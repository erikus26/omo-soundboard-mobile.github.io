#!/usr/bin/env python3
"""
Einfacher HTTP Server für das Handball Soundboard
Startet einen lokalen Server auf Port 8000
"""

import http.server
import socketserver
import os
import webbrowser
from pathlib import Path

PORT = 8000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # CORS Headers für lokale Entwicklung
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

def main():
    # Wechsle ins Verzeichnis der HTML-Datei
    os.chdir(Path(__file__).parent)
    
    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        print(f"🎵 Handball Soundboard Server gestartet!")
        print(f"📱 Öffne auf deinem iPhone: http://[DEINE-IP]:{PORT}")
        print(f"💻 Lokal: http://localhost:{PORT}")
        print(f"⏹️  Zum Stoppen: Strg+C")
        print("-" * 50)
        
        # Automatisch im Browser öffnen
        webbrowser.open(f'http://localhost:{PORT}')
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 Server gestoppt")

if __name__ == "__main__":
    main()