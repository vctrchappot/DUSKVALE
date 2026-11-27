<img src="assets/icon.svg" width="64" height="64" alt="">

# Duskvale

Ein ASCII-Dark-Fantasy-Open-World-Spiel, das direkt im Browser läuft. Die ganze Welt wird Zeichen für Zeichen gerendert, mit dynamischem Licht, Regen, Nebel, Gewittern, Wasserspiegelungen, Glühwürmchen und Blut auf dem Boden.

## Spielen

`index.html` im Browser öffnen. Es gibt keinen Build-Schritt und keine Abhängigkeiten; nur die Schriften kommen von Google Fonts, mit lokalem Fallback.

| Taste | Aktion |
| --- | --- |
| WASD / Pfeile | bewegen |
| Maus | zielen |
| Linksklick / J | Schwerthieb |
| Leertaste / Shift / Rechtsklick | Ausweichrolle (Unverwundbarkeit) |
| Q | Glutflakon trinken |
| E | interagieren, rasten, lesen |
| M | Karte · H Hilfe · +/− Zoom · Esc Pause |

## Die Welt

Die Welt ist prozedural und unendlich, mit festem Seed. Die alten Straßen führen von der **Glutsenke** zu vier handgebauten Orten:

- **Hügelgrab des Heiligen Vael** (Westen): Vael, der Gebeinkönig. Siegel des Knochens
- **Die Ertrunkene Kapelle** (Osten, Moor): Die Ertrunkene Mutter. Siegel der Flut
- **Aschenfeste** (Süden): Corvus, der Aschenritter. Siegel der Asche
- **Die Schwarze Kathedrale** (Norden): Sie öffnet sich erst mit drei Siegeln.

Dazwischen liegen zufällige Ruinen, Wachtürme, Friedhöfe, Steinkreise, Lager und Wegschreine. Schreine sind Rast- und Respawnpunkte; wer dort rastet, kann aufleveln, schnellreisen und speichern. Dabei erheben sich die Feinde wieder. Wer stirbt, verliert seine Glut am Todesort und kann sie dort wieder einsammeln.

## Technik

- `js/world.js`: Terrain aus fbm-Noise, Biome, Straßen, Blueprints, 32×32-Chunks
- `js/render.js`: Zellpuffer, Beleuchtung, Nebel, Reflexionen; Glyph-Atlas mit `source-in`-Kolorierung und CSS-Bloom
- `js/game.js`: Spieler, Gegner-KI, Bosse mit Phasen, Wetter, Tag/Nacht, Speichern über `localStorage`
- `js/sprites.js`: ASCII-Art und Dichte-Sprites · `js/audio.js` prozeduraler WebAudio-Sound · `js/ui.js` HUD, Menüs, Karte

Dev-Shortcut: `index.html#play` startet sofort, `index.html#play:-180,-30` startet an einer Weltposition.
