# Duskvale: Konzept Stage 2

Ziel von Stage 2: Duskvale soll aussehen und sich anfühlen wie die Referenzen, also hochauflösende ASCII-Malerei, weiche Kamera, gut lesbar und mit klarer Führung. Spielerisch wächst es von einer Tech-Demo zu einem echten Action-RPG.

Dieses Dokument ist die Bauvorlage. Jeder Abschnitt nennt **Problem**, **Lösung** und **Abnahmekriterien**. Die Reihenfolge der Umsetzung steht in Abschnitt 15.

---

## 1. Ist-Analyse (Stage 1)

| Thema | Beobachtung | Ursache im Code |
| --- | --- | --- |
| Auflösung zu grob | ca. 229×70 Zellen bei 1600×900, Figuren nur 9–11 Zellen breit | `R.fontPx = 13`; eine Weltzelle entspricht genau einer Bildschirmzelle (`render.js`) |
| Kamera verursacht Kopfweh | Bild springt in 7-px- bzw. 13-px-Schritten | `R.camX = Math.floor(...)` rastet auf ganze Zellen ein |
| | Kamera schwenkt mit jeder Mausbewegung | Blickvorhalt `p.aimX * 5` (`setCamera` in `game.js`) |
| | Treffer verschieben das ganze Raster um 1–2 Zellen | Screenshake ist ganzzahlig auf Zellen |
| Zu dunkel | Große schwarze Flächen, die Welt ist nur nahe der Fackel lesbar | Umgebungslicht nachts 0.24; Regen, Nebel und Wolken multiplizieren zusätzlich; es gibt keine Zell-Hintergrundfarbe; die Glyph-Schwelle `thr` schneidet dunkle Zellen ganz weg |
| Schrift schwer lesbar | Namen und Schadenszahlen sind im Weltraster beleuchtet und gehen unter; Fraktur-Banner liegen über der Spielfigur | Labels laufen durch `R.text` mit Licht und Nebel; Banner sitzen fix bei `top: 34%` |
| Unklar, was zu tun ist | Das Ziel steht nur im ersten Dialog mit Maren | Es gibt keinen Quest-Tracker, keine Marker, keine Wegweiser und keinen Kompass; die Karte zeigt nur Besuchtes |
| Figuren schwer zu erkennen | Spieler und Gegner verschwimmen mit dem Gras | Keine Kontur, kein Schatten, Glyphs aus derselben Dichte-Rampe wie das Terrain |

---

## 2. Was die Referenzen zeigen

1. **Sehr feines Raster** (Schrift ca. 6–8 px). Das Bild wirkt wie ein gemaltes Bild, das in ASCII umgerechnet wurde, und nicht wie eine Kachelkarte. Jede Zelle ist ein „Pixel“ mit eigener Farbe.
2. **Struktur-Glyphs statt nur Helligkeit.** Gras sind lange schräge Halme (`/ | \ '`) über mehrere Zellen. Steine bestehen aus runden Glyphs (`Q O 8 B @`), Mauern aus dichten (`# % $ &`). Die Glyph-Form folgt dem Material und der Kantenrichtung.
3. **2.5D-Höhe.** Burgmauern, Torbögen und Türme haben sichtbare Fassaden nach oben. Es gibt Plateaus („Tower high ground“), Klippen mit Moos, Treppen und Gras, das über Kanten hängt.
4. **Gras reagiert.** Halme biegen sich um Figuren herum („Grass collision“) und wiegen im Wind.
5. **Echte Spiegelung.** Mauern, Bäume, Mond und Figur spiegeln sich im See, mit Wellenverzerrung.
6. **Große, detaillierte Figuren** (ca. 15×30 Zellen) mit klarer Silhouette, Rüstungsdetails und farbigem Umhang. Waffen glühen und ziehen Funken nach.
7. **Lichtakzente.** Laternen und Feuer als warme Inseln, kalte Glühwürmchen und Blumen-Partikel (`* o`) in Weiß.
8. **HUD:** ein Panel mit ASCII-Porträt, LP- und MP-Balken und Stufe. Unten eine XP-Leiste und eine Hotbar 1–0. Namensschilder über Figuren, FPS- und Frame-Time-Anzeige.

---

## 3. Technik-Fundament

**Problem:** Mit Canvas-2D und einem `drawImage` pro Zelle sind etwa 300×170 Zellen bei 60 fps nicht machbar. Die globalen Skripte skalieren nicht.

**Lösung**
- **Projekt:** Vite, TypeScript und ES-Module. Struktur: `src/engine` (Renderer, Input, Audio), `src/world` (Generierung, Chunks), `src/game` (Entities, Kampf, Quests), `src/ui`.
  - Damit wird es ein Node-Repo. Laut CI-Regel einmalig das Onboarding-Skript von `vctrchappot/ci` ausführen und die erzeugten Dateien committen.
- **WebGL2-Renderer:**
  - Ein Glyph-Atlas als Textur.
  - Pro Frame drei Datentexturen in Rastergröße: Glyph-Index, Vordergrundfarbe (RGBA8) und Hintergrundfarbe (RGBA8).
  - Ein Fullscreen-Quad-Shader setzt alles zusammen.
  - Bloom läuft als zweiter Pass (Downsample, Blur, additiv) statt als CSS-Filter.
- **Simulation** in einem festen Takt (60 Hz). Rendering interpoliert dazwischen.
- Ein **Web Worker** generiert neue Chunks, damit das Laufen nicht ruckelt.
- **Tests:** Vitest für Weltgenerierung, Kampfwerte und Quest-Logik. Playwright erstellt Screenshot-Snapshots von festen Szenen über den bestehenden Shortcut `#play:x,y`.

**Abnahme**
- 1920×1080 mit ≥ 320×180 Zellen läuft auf einem Mittelklasse-Laptop mit stabil 60 fps.
- Frame-Time ≤ 8 ms, angezeigt im Debug-Overlay (F3).
- CI ist grün; Lint, Typecheck, Unit- und Screenshot-Tests laufen in `ci / check`.

---

## 4. Auflösung und Render-Pipeline (Bild → ASCII)

**Problem:** Eine Weltkachel entspricht einer Zelle. Dadurch wirkt alles grob und kachelig.

**Lösung**
- **Welt und Raster entkoppeln.** Die Welt wird in Welteinheiten gerendert (z. B. 1 Kachel = 4×2 Zellen). Daraus entsteht pro Frame ein **Szenen-Raster**: ein Farb-, Material-, Normalen- und Höhenwert pro Zelle, mit 2×2-Subsamples.
- **Glyph-Auswahl** pro Zelle aus drei Faktoren:
  1. **Helligkeit**: Index in die Rampe.
  2. **Material**: eigener Zeichensatz, etwa Gras `/|\',"`, Stein `oO0Q8@`, Mauer `#%&$`, Wasser `~-=≈`, Haut/Stoff aus der Dichte-Rampe.
  3. **Kantenrichtung** aus den 2×2-Subsamples (Sobel): `/ \ | - _` an Kanten. Erst dadurch entsteht die „gemalte“ Struktur.
- **Hintergrundfarbe pro Zelle:** abgedunkelte Materialfarbe (ca. 15–25 %). Das schließt die schwarzen Lücken, ohne die ASCII-Optik zu verlieren.
- **Zoomstufen:**
  - Nah: ca. 9 px pro Zelle, Standard.
  - Mittel: ca. 7 px.
  - Fern: ca. 6 px.
  - Gerendert wird immer mit Device Pixel Ratio, damit die Glyphs scharf bleiben.
- **Atlas** mit einer gut lesbaren Mono-Schrift in kleinen Größen (z. B. JetBrains Mono oder IBM Plex Mono), gerendert mit 2× Oversampling.

**Abnahme**
- Ein Screenshot des Start-Areals ist bei 50 % Zoom als „Gemälde“ lesbar: Bäume, Wege, Schrein und Wasser sind klar unterscheidbar.
- Keine Zelle ist reines Schwarz, außer in Höhlen und im bewussten Nachtschatten.

---

## 5. Kamera und Bewegung („FOV smoother“)

**Problem:** Einrasten auf Zellen, mitschwenkender Blickvorhalt und ganzzahliger Shake erzeugen ruckartige Sprünge.

**Lösung**
- **Sub-Zellen-Scrolling:**
  - Die Kameraposition ist ein Float.
  - Gerendert wird eine Zeile und Spalte mehr als sichtbar.
  - Das Raster ist an der Welt verankert, die Ausgabe wird um den Bruchteil in Pixeln verschoben (`uOffset` im Shader).
  - Ergebnis: Die Welt gleitet pixelgenau und flimmert nicht.
- **Kamera-Feder:** kritisch gedämpft (z. B. `smoothDamp`, ca. 0.25 s) mit einer **Totzone** von ca. 1.5 Welteinheiten um die Figur.
- **Blickvorhalt** klein (max. 2 Einheiten) und nur in Laufrichtung. Er folgt nicht der Maus. Optional: Vorhalt zur Maus erst nach 0.5 s Zielhalten.
- **Screenshake:**
  - Nur bei schweren Treffern und Boss-Slams.
  - Als Pixel-Offset mit Abklingen, nicht in ganzen Zellen.
  - In den Optionen abschaltbar.
- **Spielerbewegung:**
  - Beschleunigung und Abbremsen statt Sofort-Stopp (ca. 0.08 s).
  - Diagonalen normalisiert.
  - Bewegungsrichtung und Figur interpoliert gerendert.
- Kein Zoom-Pumpen, außer optional ein leichter Boss-Zoom.

**Abnahme**
- Bei Dauerlauf in jede Richtung springt das Bild nie um ganze Zellen; eine 144-Hz-Bildschirmaufnahme wirkt flüssig.
- Mausbewegung im Stand bewegt die Kamera nicht.
- Option „Kamerabewegung reduzieren“ = keine Shakes, kein Vorhalt.

---

## 6. Licht, Helligkeit, Lesbarkeit

**Problem:** Stimmung geht auf Kosten der Lesbarkeit; die Welt ist oft zu dunkel.

**Lösung**
- **Lichtmodell:**
  - Umgebungslicht nie unter einem **Boden-Wert** (ca. 0.35 Luminanz nachts).
  - Danach **Tonemapping** (ACES oder Filmic) statt harter Multiplikation.
  - Regen und Nebel senken den Kontrast, nicht die Helligkeit.
- **Fackel** als weiches, großes Licht (Radius ca. 28 Einheiten) mit warmem Rand. Der Nahbereich um die Figur ist immer gut lesbar.
- **Lichter mit Schatten:** Feuer, Laternen und Schreine werfen Schatten über ein grobes Verdeckungsraster (Raymarch auf halber Auflösung). Das gibt Tiefe, ohne alles zu verdunkeln.
- **Figuren hervorheben:**
  - 1-Zellen-**Kontur** (dunkler Rand) um Spieler, Gegner und NPCs.
  - **Bodenschatten** (Ellipse).
  - Leichte **Eigenleuchtkraft** (Rim-Light) in einer Farbe pro Fraktion: Spieler warm, Gegner kalt oder rot.
- **Text komplett aus dem Weltraster nehmen:**
  - Namen, Schadenszahlen und Prompts werden in einem eigenen, unbeleuchteten Overlay gerendert, in fester Lesegröße (≥ 12 px) mit dunklem Hintergrund.
  - Banner erscheinen im oberen Drittel, nie über der Spielfigur, und zuerst in Antiqua bzw. Mono. Fraktur nur für große Titel.
- **Helligkeitsregler** (Gamma) und Option **„Hoher Kontrast“**.

**Abnahme**
- Im Sturm bei Nacht sind Weg, Hindernisse und Gegner in mindestens 20 Einheiten Abstand erkennbar.
- Alle UI-Texte erreichen einen Kontrast von ≥ 4.5:1.

---

## 7. Welt in 2.5D: Höhe, Fassaden, Plateaus

**Lösung**
- **Höhenstufen** (0–4) pro Kachel aus der Höhenkarte mit Terrassierung. Ein Höhenunterschied erzeugt eine **Klippen-Fassade** nach unten: dunkler, vertikale Glyphs `| ! ]`, mit Moos- und Gras-Überhang an der Oberkante.
- **Mauern, Türme und Gebäude** haben eine Höhe in Zellen und werden als Fassade nach oben gezeichnet, im 3/4-Blick wie in den Referenzen. Torbögen sind Fassaden mit Aussparung.
- **Verdeckung:** Steht die Figur hinter einer Fassade, wird diese im Umkreis teiltransparent geschnitten (Kreis-Maske).
- **Treppen und Rampen** als begehbare Übergänge zwischen Stufen. **High Ground**: Fernkampf von oben macht +Schaden; Gegner brauchen einen Weg nach oben.
- **Neue Blueprints in 2.5D:** Burg mit Torbogen, Rundturm (begehbar, Dach als Plateau), Ruinen auf Plateaus, Höhleneingänge.

**Abnahme**
- Burgmauer mit Torbogen, Rundturm mit Plateau und eine Klippe mit Treppe sind begehbar und korrekt verdeckt.
- Die Kollision folgt den Höhenstufen.

---

## 8. Vegetation: Gras-System

**Lösung**
- **Halm-Partikel statt Bodenzeichen:**
  - Gras-Kacheln erzeugen deterministisch Halme mit Länge 2–4 Zellen, Neigung und Farbton (5–7 Grüntöne).
  - Gezeichnet wird von unten nach oben mit `/ | \` je nach Neigung.
- **Wind:** globales Windfeld (Noise, wandernd) neigt die Halme in Wellen.
- **Kollision:** Ein Verdrängungsfeld (Kreis um jede Figur) biegt Halme weg. Halme richten sich in ca. 1.5 s wieder auf und hinterlassen eine kurze Trampelspur.
- **Weitere Pflanzen:** Blumenfelder als weiße und rote Partikel (`* o .`), Farne, Moospolster auf Steinen und Mauerkronen, hängende Ranken an Fassaden.
- **Bäume** als große Sprites aus Pixel-Quellen (Abschnitt 10) mit Kronen-Verdeckung und Wind-Sway.

**Abnahme**
- Läuft die Figur durchs hohe Gras, sieht man eine sich schließende Schneise.
- 50k Halme im Bild bei ≤ 2 ms CPU (Batch über Typed Arrays oder GPU-Instancing).

---

## 9. Wasser und Spiegelung

**Lösung**
- **Spiegelpass:** Für Wasserzellen wird der Szenen-Raster vertikal an der Uferlinie gespiegelt. Das erfasst Mauern, Bäume, Figuren und Lichter.
  - Verzerrung mit Wellen-Offset (Sinus plus Noise).
  - Abgedunkelt und blau-grün getönt.
- **Mond und Himmelslicht** als Spiegelfläche bei Nacht.
- **Uferschaum,** Lichtreflexe von Fackeln als Glitzer-Glyphs (`· * -`). Laufen durch flaches Wasser erzeugt Ringwellen.

**Abnahme**
- Die Szene „Burg am See“ (fester Seed-Ort) zeigt Mauern, Torbogen und Figur gespiegelt mit Wellenbewegung.

---

## 10. Figuren und Animation

**Problem:** Handgetippte Dichte-Sprites mit 9×11 Zellen geben zu wenig Detail und Animation.

**Lösung**
- **Pixel-Art als Quelle:**
  - Figuren entstehen als kleine PNG-Spritesheets (z. B. 32×64 px pro Frame) oder in einem Mini-Editor.
  - Zur Laufzeit werden sie mit derselben Bild→ASCII-Pipeline (Abschnitt 4) in Zellen umgerechnet.
  - Spielfigur ca. 14×28 Zellen, Bosse 30–50 Zellen hoch.
- **Animationen:** Idle (Atmen), Lauf (6–8 Frames), Angriff 1/2/3 (Combo), Rolle, Trinken, Treffer, Tod. **Acht Richtungen**, mindestens vier plus Spiegelung.
- **Waffen-VFX:** glühende Klinge mit Funkenschweif (siehe Referenz), farbiger Schwung-Bogen, Treffer-Stopp.
- **Ausrüstung sichtbar:** Helm, Rüstung und Umhang als Layer im Spritesheet (Abschnitt 13).
- **Gegner neu als Pixel-Quellen:**
  - Skelettkrieger (Farbe gefixt: Knochen warmweiß, nicht grau).
  - Ghul, Aschwolf und Irrlicht.
  - Neu: Ritter-Gespenst und Moorhexe.
  - Vier Bosse mit mehreren Phasen.

**Abnahme**
- Spielfigur und Skelett sind bei Zoom „Mittel“ als Ritter bzw. Skelett erkennbar, auch ohne Namensschild.
- Lauf- und Angriffsanimationen sind flüssig.

---

## 11. Orientierung: Klar, was zu tun ist

**Problem:** Das Ziel steht nur im ersten Dialog.

**Lösung**
- **Quest-System** mit Haupt- und Nebenquests (Datenstruktur: Schritte, Bedingungen, Belohnung). Hauptquest-Kette:
  1. „Entzünde den Schrein der Glutsenke“
  2. „Sprich mit Maren“
  3. „Folge der Straße zum Hügelgrab“
  4. … bis „Betritt die Schwarze Kathedrale“
- **Ziel-Tracker** oben rechts: aktueller Schritt in einem Satz mit Distanz („Hügelgrab des Hl. Vael · 140 m Westen“).
- **Kompassleiste** oben mittig mit Markern für Quest-Ziel, entdeckte Schreine, verlorene Glut und Boss.
- **Wegweiser in der Welt** an Straßengabelungen, als ASCII-Schilder mit Ortsnamen.
- **Bildschirmrand-Pfeil** zum Quest-Ziel, wenn es außerhalb des Bildes liegt (abschaltbar).
- **Onboarding** in den ersten 3 Minuten: kontextuelle Hinweise („Halte Leertaste zum Rollen“), die verschwinden, sobald die Aktion einmal gemacht wurde.
- **Karte:**
  - Bekannte Orte erscheinen schon unentdeckt als „?“-Silhouette, sobald Maren davon erzählt hat.
  - Quest-Marker und eigene Pins.
  - Die Karte lässt sich zoomen und verschieben.
- **Journal** (J): Quests, gefundene Lore-Stelen, Bestiarium.

**Abnahme**
- Ein neuer Spieler findet in einem Test ohne Erklärung innerhalb von 5 Minuten zum ersten Boss.
- Es ist jederzeit ersichtlich, was der nächste Schritt ist.

---

## 12. HUD und UI

- **Spieler-Panel** oben links: ASCII-Porträt (aus dem Sprite generiert), LP-Balken, Glut/Mana-Balken, Ausdauer und Stufe (wie in Referenz 2).
- **Unten:** XP-Leiste (Stufe und XP) und **Hotbar 1–0** für Fähigkeiten und Flakons, mit Cooldown-Overlay.
- **Gegner:** kleine LP-Balken über verwundeten Gegnern, Namensschild beim Anvisieren. Bosse zeigen den großen Balken oben mit Phasen-Markierung.
- **Namensschilder** über NPCs und Spieler im Text-Overlay (Abschnitt 6).
- **Debug-Overlay** (F3): FPS, Frame-Time, Zellen, Chunks, Lichter.
- **Pausemenü** mit Optionen (Abschnitt 13). Alle Menüs vollständig per Tastatur, Maus und optional Gamepad bedienbar.

---

## 13. Gameplay-Ausbau

- **Progression:**
  - **XP** aus Kämpfen ergibt Stufen und Attributpunkte.
  - **Glut** bleibt die Währung zum Handeln und Schmieden und wird beim Tod verloren.
  - Getrennte Systeme machen das Ziel klarer.
- **Fähigkeiten** (Hotbar), die Mana bzw. Glut kosten:
  - Flammenhieb (Kegel, Brand)
  - Glutbolzen (Fernkampf)
  - Ascheschild (Block)
  - Sprungangriff
  - Freischaltung über Bosse und Schreine.
- **Kampf-Feinschliff:**
  - Anvisieren mit Lock-on (Tab bzw. mittlere Maustaste).
  - Klar lesbare **Boden-Telegraphs** (gefüllte Kegel und Kreise, die sich füllen).
  - Parieren mit Zeitfenster.
  - Haltung bzw. Gleichgewicht bei Gegnern.
  - Brand- und Blutungs-Effekte.
- **Loot und Ausrüstung:**
  - Waffen (Schwert, Großschwert, Speer, Sichel) mit eigenen Movesets.
  - Rüstungsteile, sichtbar am Sprite.
  - Ringe mit Effekten.
  - Inventar (I) und ein Schmied bei Maren.
- **Welt-Inhalt:**
  - Ein Dorf bzw. Lager als Hub mit Händler und Schmied.
  - Dungeons bzw. Höhlen als kleine 2.5D-Level.
  - Wiederkehrende Elite-Gegner, Truhen und Geheimnisse hinter Mauern.
- **Speichern:** mehrere Slots, Auto-Save am Schrein, Export/Import als Datei.

---

## 14. Optionen und Barrierefreiheit

- Grafik: Zoomstufe, Bloom an/aus, Partikel-Dichte, Gras-Dichte, Schatten-Qualität.
- Darstellung: Helligkeit/Gamma, Hoher Kontrast, Textgröße der UI.
- Komfort: Kamerabewegung reduzieren (keine Shakes, kein Vorhalt), Blitze reduzieren (Gewitter ohne Vollbild-Flash), Zielhilfe-Pfeil an/aus.
- Audio: Master, Musik, Effekte, Umgebung.
- Steuerung: Tastenbelegung, Gamepad.

---

## 15. Umsetzungsreihenfolge (Meilensteine)

| # | Meilenstein | Inhalt | Ergebnis |
| --- | --- | --- | --- |
| M1 | Fundament | Vite/TS-Migration, CI, WebGL2-Renderer mit fg/bg-Farben, fester Takt, Debug-Overlay | gleiche Welt, 60 fps bei 320×180 Zellen |
| M2 | Kamera & Lesbarkeit | Sub-Zellen-Scrolling, Kamera-Feder, Shake neu, Licht-Boden und Tonemapping, Text-Overlay, Konturen und Schatten, Optionen-Grundgerüst | Kopfweh-frei, nicht mehr zu dunkel |
| M3 | Bild→ASCII-Pipeline | Szenen-Raster, Material- und Kanten-Glyphs, Zoomstufen | „gemalter“ Look |
| M4 | Orientierung | Quest-System, Tracker, Kompass, Wegweiser, Onboarding, Karte 2.0, Journal | Spieler weiß immer, was zu tun ist |
| M5 | Vegetation & Wasser | Halm-Gras mit Wind und Kollision, Blumen und Moos, Spiegelpass, Ringwellen | Referenz-Optik „Grass collision“ und „Water reflection“ |
| M6 | 2.5D-Welt | Höhenstufen, Klippen, Fassaden, Türme, Treppen, Verdeckung, neue Blueprints | Referenz-Optik „Tower high ground“ |
| M7 | Figuren & Kampf | Pixel-Sprites und Animationen, Waffen-VFX, Lock-on, Telegraphs, Parieren | Kampf fühlt sich hochwertig an |
| M8 | RPG-Systeme | XP/Stufen, Hotbar-Skills, Loot, Inventar, Schmied, Hub-Dorf, Höhlen | vollwertiges Action-RPG |

Jeder Meilenstein wird als eigener PR mit Screenshot-Tests umgesetzt.

---

## 16. Nicht in Stage 2 (vorbereiten für Stage 3)

- **Multiplayer/MMO** (die Referenzen zeigen mehrere Spieler mit Namensschildern). Die Weltgenerierung ist schon deterministisch. Entities sollten von Beginn an serialisierbar sein (ID, Zustand, Inputs), damit später ein autoritativer Server (z. B. Cloudflare Durable Objects) andocken kann.
- Mobile/Touch-Steuerung (Hochformat wie in den Referenz-Videos).

## 17. Offene Entscheidungen

1. **Sprites:** Pixel-Art-Quellen selbst zeichnen bzw. zeichnen lassen, oder prozedural generieren? Empfehlung: Pixel-Art (32×64), weil die Qualität deutlich höher ist.
2. **Progression:** XP und Glut getrennt (Empfehlung) oder weiterhin Souls-artig nur Glut?
3. **Kamera:** fester Ausschnitt auf die Figur (Empfehlung) oder leichter Maus-Vorhalt als Option?
4. **Zielplattform:** nur Desktop-Browser in Stage 2 (Empfehlung) oder Mobile direkt mitdenken?
