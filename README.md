<img src="assets/icon.svg" width="64" height="64" alt="">

# Duskvale (Stage 2)

Ein hochauflösendes ASCII-Dark-Fantasy-Action-RPG im Browser. Die gesamte Welt wird über eine WebGL2-ASCII-Pipeline Zeichen für Zeichen mit dynamischer Beleuchtung, GPU-Bloom, 2.5D-Fassaden, reaktivem Halm-Gras, Wasserspiegelungen und unbeleuchtetem UI-Text-Overlay gerendert.

## Entwicklung & Start

```bash
npm install
npm run dev
```

Build & Tests:

```bash
npm run typecheck
npm test
npm run build
```

Dev-Shortcut: `/#play` startet sofort, `/#play:64,-32` startet direkt an der **Burg am See**, `/#play:-175,-28` am **Hügelgrab des Heiligen Vael**.

## Steuerung

| Taste | Aktion |
| --- | --- |
| WASD / Pfeile | bewegen (weiche Beschleunigung) |
| Maus | zielen |
| Linksklick | 3-Hit-Schwertkombo |
| F | Parieren (Zeitfenster bricht gegnerische Haltung) |
| Leertaste / Shift / Rechtsklick | Ausweichrolle (Unverwundbarkeit) |
| Tab / Mittlere Maustaste | Lock-on anvisieren |
| 1–4 | Glut-Fähigkeiten (Flammenhieb, Glutbolzen, Ascheschild, Sprungangriff) |
| Q / 5 | Glutflakon trinken |
| E | interagieren, rasten, lesen, handeln |
| I / J / M / T | Inventar · Journal · Karte 2.0 · Multiplayer-Chat & Emotes (`/wave`, `/rest`, `/cheer`) |
| +/− · F3 · H · Esc | Zoom (Nah/Mittel/Fern) · Debug-Overlay · Hilfe · Pause & Optionen (inkl. Touch-Steuerung) |

## Multiplayer & Mobile (Stage 3)

- **Lokaler Co-op**: Einfach zwei Browser-Tabs öffnen — Spieler synchronisieren sich automatisch über `BroadcastChannel`.
- **WebSocket-Server**: Mit `?server=ws://localhost:8787` an den Raum-Server in `server/multiplayer.ts` (kompatibel mit Cloudflare Durable Objects) andocken.
- **Mobile & Hochformat**: Touch-Joystick & Aktions-Buttons aktivieren sich automatisch auf Touch-Geräten oder manuell unter **Esc → Optionen → Touch-Steuerung**.

## Architektur (Stage 2)

- `src/engine/`: WebGL2-Fullscreen-Quad-Renderer (`webgl.ts`), 2×-Oversampling-Atlas (`atlas.ts`), unbeleuchtetes Text-Overlay (`textOverlay.ts`), Optionen/Barrierefreiheit (`options.ts`), WebAudio (`audio.ts`)
- `src/world/`: Prozedurale 2.5D-Welt mit Höhenstufen 0–4, Klippen, Treppen, Torbögen, Wachtürmen, Burg am See, Wegweisern (`world.ts`, `blueprints.ts`) und Halm-Gras/Wasser-System (`grass.ts`)
- `src/game/`: Fixe 60-Hz-Simulation, glatte Feder-Kamera mit Sub-Zellen-Scrolling (`camera.ts`), Pixel-Art-zu-ASCII-Sprites (`pixelSprites.ts`), Quests & Onboarding (`quests.ts`), Waffen/Rüstungen/Ringe/Skills (`rpg.ts`), Kampf & KI (`game.ts`)
- `src/render/`: Bild→ASCII-Pipeline mit Material- & Sobel-Kanten-Glyphs, 2.5D-Fassaden-Verdeckung, Wasserspiegelung und Schatten (`renderer.ts`)
- `src/ui/`: HUD (ASCII-Porträt, Kompass, Quest-Tracker, XP-Leiste, Hotbar 1–0), Karte 2.0, Journal, Inventar, Optionen & Multi-Slot-Speicher (`ui.ts`)
