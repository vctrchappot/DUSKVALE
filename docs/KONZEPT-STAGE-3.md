# Duskvale: Konzept Stage 3 (Multiplayer, Mobile & Streaming)

Stage 3 erweitert das Action-RPG-Fundament aus Stage 2 um die drei verbliebenen Bausteine aus den Referenzen:

1. **Multiplayer / MMO-Schicht (`src/net/`, `server/multiplayer.ts`)**
   - Einheitliches JSON-Protokoll (`join`, `welcome`, `state`, `chat`, `emote`, `leave`, `ping`/`pong`) für WebSocket-Server (Node / Cloudflare Durable Objects).
   - **Zero-Config Multi-Tab-Co-op** über `BroadcastChannel` (mehrere Browser-Tabs teilen sich sofort dieselbe Welt).
   - **Gefährten / Phantom-Wanderer** (optional in den Optionen aktivierbar), damit die Glutsenke und Straßen auch allein belebt wirken.
   - Interpolierte Remote-Spieler mit sichtbarer Rüstung/Waffe, Namensschildern, Chat-Sprechblasen über dem Kopf sowie Kompass- & Kartenmarkern.
   - Kompakter Chat & Emotes (`/wave`, `/rest`, `/cheer`, `/point`).
2. **Mobile & Touch-Steuerung (`src/ui/touch.ts`, Hoch- & Querformat)**
   - Virtueller Analog-Joystick links, ergonomisches Aktions-Cluster rechts (Angriff, Ausweichen, Parieren, Interagieren, Flakon, Skills 1–4).
   - Automatische Erkennung auf Touch-Geräten + manueller Schalter in den Optionen zum Testen am Desktop.
   - Responsives Hochformat-HUD (kompaktes Spielerpanel, Kompass, Quest-Tracker und Touch-Bedienung).
3. **Web-Worker-Chunk-Streaming (`src/world/chunkWorker.ts`)**
   - Asynchrones Vorladen umliegender Chunks im Hintergrund-Worker, damit schnelles Erkunden ohne Frame-Drops läuft.
