'use strict';
(function (DV) {
  const S = (DV.S = {});

  // ------------------------------------------------------------ Art sprites
  // Explicit glyphs. pal maps a char to a colour (d = default); em maps chars to
  // self-lit colours; anim maps chars to glyph cycles.
  function art(rows, pal, opts) {
    const w = Math.max(...rows.map((r) => r.length));
    return Object.assign({ type: 'art', rows, w, h: rows.length, pal, ax: w >> 1, ay: rows.length - 1, em: null, anim: null }, opts || {});
  }

  const PINE = { d: [0.1, 0.25, 0.14], '|': [0.28, 0.18, 0.1] };
  S.pine = [
    art(['  ^  ', ' /^\\ ', '//^\\\\', '  |  '], PINE),
    art(['   ^   ', '  /^\\  ', ' //^\\\\ ', '///^\\\\\\', '   |   '], PINE),
    art(['    ^    ', '   /^\\   ', '  //^\\\\  ', '  /^^^\\  ', ' //^^^\\\\ ', '///^^^\\\\\\', '    |    '], PINE),
  ];
  const DEAD = ['\\  | /', ' \\ |/_', '  \\|/ ', '   |  ', '   |  '];
  S.deadtree = art(DEAD, { d: [0.36, 0.31, 0.27] }, { ax: 3 });
  S.burnt = art(DEAD, { d: [0.17, 0.14, 0.13] }, { ax: 3, embers: true });
  S.rock = art([' _ ', '(_)'], { d: [0.4, 0.4, 0.43] });
  S.menhir = art([' _ ', '|#|', '|#|', '|_|'], { d: [0.42, 0.44, 0.5], ':': [0.4, 0.6, 1] });
  S.flower = [art(['*'], { d: [0.7, 0.08, 0.08] }), art(['\''], { d: [0.6, 0.07, 0.07] }), art(['v'], { d: [0.55, 0.1, 0.1] })];
  S.reeds = [art(['|', '|'], { d: [0.34, 0.38, 0.2] }), art(['/', '|'], { d: [0.3, 0.36, 0.18] }), art(['\\|'], { d: [0.32, 0.36, 0.2] })];
  S.fungus = art(['o'], { d: [0.2, 0.8, 0.7] }, { em: { o: [0.25, 0.85, 0.75] } });
  S.vent = art(['.'], { d: [1, 0.4, 0.1] }, { em: { '.': [1, 0.38, 0.08] }, anim: { '.': '.,\'`' } });
  S.cross = art([' | ', '-+-', ' | '], { d: [0.48, 0.47, 0.46] });
  S.tomb = art(['.-.', '|+|'], { d: [0.45, 0.45, 0.47] });
  S.pillar = art(['[=]', '|:|', '|:|', '[=]'], { d: [0.58, 0.57, 0.55] });
  S.brazier = art([' ^ ', '\\_/'], { d: [0.35, 0.3, 0.28] }, { em: { '^': [1, 0.55, 0.15] }, anim: { '^': '^*\'"^' } });
  S.campfire = art([' ^ ', '/x\\'], { d: [0.36, 0.24, 0.14] }, { em: { '^': [1, 0.5, 0.12] }, anim: { '^': '^*(^)' } });
  S.shrineLit = art(['  )  ', ' (^) ', ' /#\\ ', '[===]'], { d: [0.5, 0.48, 0.46] },
    { em: { ')': [1, 0.7, 0.25], '(': [1, 0.6, 0.2], '^': [1, 0.85, 0.4] }, anim: { ')': ')(\'`', '(': '()`\'', '^': '^*"^' } });
  S.shrineDark = art(['     ', '  .  ', ' /#\\ ', '[===]'], { d: [0.42, 0.4, 0.4], '.': [0.6, 0.3, 0.15] });
  S.lore = art([' __ ', '|::|', '|__|'], { d: [0.42, 0.43, 0.46], ':': [0.5, 0.75, 1] });
  S.altar = art(['._._.', '|###|'], { d: [0.4, 0.38, 0.38], '#': [0.45, 0.07, 0.08] });

  // Vertical mirror for reflections.
  S.FLIPV = { '/': '\\', '\\': '/', '^': 'v', v: '^', A: 'V', V: 'A', '.': '\'', '\'': '.', ',': '`', '`': ',', _: '-', '-': '_', '(': '(', ')': ')' };

  // ------------------------------------------------------------ Shade sprites
  // 1-9 steel/primary, a-i secondary, A-I accent, ! emissive. Glyph comes from a density ramp.
  function shade(rows) {
    const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
    const cells = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < rows[j].length; i++) {
      const c = rows[j].charCodeAt(i);
      if (c === 32) continue;
      let k, v;
      if (c >= 49 && c <= 57) { k = 0; v = (c - 48) / 9; }
      else if (c >= 97 && c <= 105) { k = 1; v = (c - 96) / 9; }
      else if (c >= 65 && c <= 73) { k = 2; v = (c - 64) / 9; }
      else if (c === 33) { k = 3; v = 1; }
      else continue;
      cells.push(i, j, k, v);
    }
    return { type: 'shade', w, h, cells, ax: w >> 1, ay: h - 1 };
  }
  function scale2(rows) {
    const out = [];
    for (const r of rows) {
      let s = '';
      for (const ch of r) s += ch + ch;
      out.push(s, s);
    }
    return out;
  }
  function set(rowsByFrame, big) {
    const o = {};
    for (const k in rowsByFrame) o[k] = rowsByFrame[k].map((rows) => shade(big ? scale2(rows) : rows));
    const ax = o.idle[0].ax;
    for (const k in o) o[k].forEach((f) => { f.ax = ax; f.ay = f.h - 1; });
    return o;
  }

  const KNIGHT = {
    idle: [
      ['    787    ', '   69996   ', '   68586   ', '  cc797cc  ', ' dcc686ccd9', ' dcc575cc 8', ' dc 464 cd7', '  c 4 4 c  ', '    3 3    '],
      ['    787    ', '   69996   ', '   68586   ', '  cc797cc  ', ' dcc686ccd9', ' dcc575cc 8', ' dc 464 cd7', '  c 4  4c  ', '   3   3   '],
    ],
    attack: [['    787         ', '   69996        ', '   68586        ', '  cc797cc       ', ' dcc686cc9999999', ' dcc575cc       ', ' dc 464 cd      ', '  c 4 4 c       ', '    3 3         ']],
    roll: [['           ', '           ', '           ', '    ccc    ', '   c686c   ', '  dc575cd  ', '  dc464cd  ', '   c343c   ', '           ']],
    drink: [['    787    ', '   69996   ', '   685E!   ', '  cc79Ecc  ', ' dcc686cc  ', ' dcc575cc  ', ' dc 464 cd ', '  c 4 4 c  ', '    3 3    ']],
  };
  const GHOUL = {
    idle: [
      ['   eef  ', '  efff! ', ' deeee  ', ' d d  e ', '  c  d  '],
      ['   eef  ', '  efff! ', ' deeee  ', ' d d  e ', ' c   d  '],
    ],
    attack: [['   eef   ', '  efff!  ', ' deeeefff', ' d d     ', '  c  d   ']],
  };
  const WOLF = {
    idle: [
      ['        56 ', ' 45666667!8', '3 4555554  ', '  4 4  4 4 '],
      ['        56 ', ' 45666667!8', '3 4555554  ', ' 4  4 4  4 '],
    ],
    attack: [['         56  ', '  45666667!88', ' 3 4555554 7 ', '  4  4 4  4  ']],
  };
  const SKEL = {
    idle: [
      ['  GHG  ', '  H!H  ', ' FGHGF5', '  GFG 5', '  F F 4', '  E E  '],
      ['  GHG  ', '  H!H  ', ' FGHGF5', '  GFG 5', '  F F 4', ' E   E '],
    ],
    attack: [['  GHG     ', '  H!H     ', ' FGHGF5555', '  GFG     ', '  F F     ', '  E E     ']],
  };
  const WRAITH = {
    idle: [
      ['  ccc  ', ' cfffc ', ' c!f!c ', 'ceeeeec', ' ddddd ', ' c d c ', '  b b  '],
      ['  ccc  ', ' cfffc ', ' c!f!c ', 'ceeeeec', ' ddddd ', '  dcd  ', ' b   b '],
    ],
    attack: [['  ccc  ', ' cfffc ', ' c!f!c ', 'cIeeeIc', 'IddddI ', ' c d c ', '  b b  ']],
  };
  const PILGRIM = {
    idle: [
      ['  c  ', ' cdc ', ' ded!', ' ded ', ' ddd ', ' c c '],
      ['  c  ', ' cdc ', ' ded!', ' ded ', ' ddd ', ' c c '],
    ],
  };
  const BISHOP = {
    idle: [
      ['    9    ', '   898   ', '   GHG   ', '  G!H!G  ', '  aGHGa  ', ' aaHIHaa ', ' aGHIHGa9', ' aGHIHGa8', 'aGGHIHGGa', 'aGGHHHGGa', ' GGGGGGG '],
      ['    9    ', '   898   ', '   GHG   ', '  G!H!G  ', '  aGHGa  ', ' aaHIHaa ', ' aGHIHGa9', ' aGHIHGa8', 'aGGHIHGGa', 'aGGHHHGGa', 'GGGGGGGGG'],
    ],
    attack: [['    9     ', '   898  ! ', '   GHG II ', '  G!H!GI  ', '  aGHGa   ', ' aaHIHaa  ', ' aGHIHGa  ', ' aGHIHGa  ', 'aGGHIHGGa ', 'aGGHHHGGa ', ' GGGGGGG  ']],
  };

  S.CR = {
    knight: set(KNIGHT), ghoul: set(GHOUL), wolf: set(WOLF), skeleton: set(SKEL), wraith: set(WRAITH), pilgrim: set(PILGRIM),
    knightBig: set(KNIGHT, true), skeletonBig: set(SKEL, true), wraithBig: set(WRAITH, true), bishopBig: set(BISHOP, true),
  };

  S.DENSE = ' .:-=+*#%@';
})(window.DV);
