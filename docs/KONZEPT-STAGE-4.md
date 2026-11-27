# Duskvale: Konzept Stage 4 (Dungeons, Eliten, Nebenquests & Endgame)

Stage 4 baut den Spielinhalt und Wiederspielwert aus:

1. **Betretbare 2.5D-Dungeons / Krypten (`src/world/dungeon.ts`)**
   - Jede Schattenhöhle (`D`) sowie die neue **Krypta der Glut** nahe der Glutsenke führt in eine prozedurale Mehrraum-Instanz mit Steingängen, Feuerschalen, Truhen, Elite-Wächtern, einem Krypta-Boss und einem Rückkehr-Portal.
   - Eigene Innenraum-Atmosphäre (kein Regen, kühles Krypta-Licht mit warmen Feuerschalen).
2. **Elite-Gegner mit Affixen (`src/game/sideQuests.ts`, `src/game/game.ts`)**
   - **Brennend**, **Gepanzert**, **Flink** und **Blutdürstig** mit eigenen Werten, gold-violettem Rim-Light und höherer Beute (inkl. Runen-Drops).
3. **Nebenquests & Runen-System (`src/game/sideQuests.ts`, `src/ui/ui.ts`)**
   - Vier verfolgbare Nebenaufträge im Journal (`J`) mit direkten Belohnungen (Glut, XP, passive Runen).
   - Ausrüstbare **Runen** im Inventar (`I`): *Rune der Glut*, *Rune des Stahls*, *Rune des Wanderers*, *Rune des Siegers*.
4. **Endgame: Glut-Prüfung (Boss-Rematch am Schrein)**
   - Besiegte Bosse lassen sich an jedem entzündeten Schrein erneut in einer verstärkten Glut-Prüfung herausfordern.
