var Oa = Object.defineProperty;
var yo = (e) => {
  throw TypeError(e);
};
var Ra = (e, t, n) => t in e ? Oa(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : e[t] = n;
var ht = (e, t, n) => Ra(e, typeof t != "symbol" ? t + "" : t, n), Ss = (e, t, n) => t.has(e) || yo("Cannot " + n);
var u = (e, t, n) => (Ss(e, t, "read from private field"), n ? n.call(e) : t.get(e)), z = (e, t, n) => t.has(e) ? yo("Cannot add the same private member more than once") : t instanceof WeakSet ? t.add(e) : t.set(e, n), $ = (e, t, n, s) => (Ss(e, t, "write to private field"), s ? s.call(e, n) : t.set(e, n), n), C = (e, t, n) => (Ss(e, t, "access private method"), n);
var ws = (e, t, n, s) => ({
  set _(i) {
    $(e, t, i, n);
  },
  get _() {
    return u(e, t, s);
  }
});
import { o as dn, f as La, n as Lt, e as $a, d as it, c as Qs, g as hs, h as Js, i as Zs, k as xi, t as to, l as eo, j as as, m as Si, q as Ga, r as wi, s as rs, u as Mi, D as ki, v as Da, w as vo, S as _a, N as Ei, x as za, y as Ua, z as Ya, B as ja, C as Va } from "./score-DlrqpIlx.js";
import { A as _f, a as zf, M as Uf, E as Yf, F as jf, G as Vf, H as Hf, I as Xf, J as Kf, b as qf, K as Qf, L as Jf, O as Zf, P as th, p as eh, Q as nh, R as sh, U as oh, V as ih, W as ah, X as rh, Y as ch, Z as lh } from "./score-DlrqpIlx.js";
function Ha(e, t) {
  e.keyFifths !== t.keyFifths && Ht("score.keyFifths", e.keyFifths, t.keyFifths), (e.time.beats !== t.time.beats || e.time.beatType !== t.time.beatType) && Ht("score.time", jn(e.time), jn(t.time)), e.tempoBpm !== t.tempoBpm && Ht("score.tempoBpm", e.tempoBpm, t.tempoBpm), ct("score.headerPassthrough", ke(e.headerPassthrough), ke(t.headerPassthrough)), e.staves.length !== t.staves.length && Ht("staves.length", e.staves.length, t.staves.length);
  for (let n = 0; n < t.staves.length; n++) {
    const s = e.staves[n], i = t.staves[n];
    e.clefAt(0, n) !== t.clefAt(0, n) && Ht(`staves[${n}].clef`, e.clefAt(0, n), t.clefAt(0, n)), s.measures.length !== i.measures.length && Ht(`staves[${n}].measures.length`, s.measures.length, i.measures.length);
    for (let o = 0; o < i.measures.length; o++) {
      const a = `staves[${n}].measures[${o}]`;
      ct(`${a} keyFifthsAt`, e.keyFifthsAt(o, n), t.keyFifthsAt(o, n)), ct(`${a} clefAt`, e.clefAt(o, n), t.clefAt(o, n)), ct(
        `${a} clefChanges`,
        ko(s.measures[o].clefChanges),
        ko(i.measures[o].clefChanges)
      ), ct(`${a} timeAt`, jn(e.timeAt(o, n)), jn(t.timeAt(o, n))), ct(`${a} endBarlineAt`, e.endBarlineAt(o, n), t.endBarlineAt(o, n)), ct(
        `${a} startBarline`,
        s.measures[o].startBarline ?? "none",
        i.measures[o].startBarline ?? "none"
      ), ct(
        `${a} repeatTimes`,
        s.measures[o].repeatTimes ?? "none",
        i.measures[o].repeatTimes ?? "none"
      ), ct(`${a} endings`, xo(s.measures[o]), xo(i.measures[o])), ct(
        `${a} number`,
        s.measures[o].number ?? String(o + 1),
        i.measures[o].number ?? String(o + 1)
      ), qa(a, s.measures[o], i.measures[o]), ct(
        `${a} dynamics`,
        So(s.measures[o].dynamics),
        So(i.measures[o].dynamics)
      ), Xa(a, e, t, s.measures[o].notes, i.measures[o].notes);
    }
  }
  Qa(e, t), ct("wedges", Mo(e.wedges), Mo(t.wedges)), Ja(e, t);
}
function Ti(e) {
  return String(Math.round(e * 1e9) / 1e9);
}
function xo(e) {
  const t = (i) => Object.keys(i).sort().map((o) => `${o}=${i[o]}`).join(" "), n = e.endingStart, s = e.endingEnd;
  return (n ? `start ${n.numbers.join(",")} ${JSON.stringify(n.text)} [${t(n.attrs)}]` : "no start") + (s ? ` / ${s.kind} [${t(s.attrs)}]` : " / no end");
}
function Ii(e) {
  if (e === null) return "-";
  const t = Object.keys(e.markAttrs).sort().map((n) => `${n}=${JSON.stringify(e.markAttrs[n])}`).join(",");
  return `#${e.slot}[${t}]${dn(e.element, e.divisions)}`;
}
function So(e) {
  return e.map((t) => `${t.kind}@${Ti(t.onset)} ${t.placement ?? "-"} ${Ii(t.source)}`).sort().join(`
`);
}
function wo(e) {
  return `m${e.measureIndex}@${Ti(e.onset)} ${Ii(e.source)}`;
}
function Mo(e) {
  return e.map((t) => `${t.kind} s${t.staffIndex} ${t.placement ?? "-"} ${wo(t.start)} -> ${wo(t.stop)}`).sort().join(`
`);
}
function ko(e) {
  return e.map((t) => `${Math.round(t.onset * 1e9) / 1e9}:${t.clef}`).join(",");
}
function Xa(e, t, n, s, i) {
  const o = Io(s), a = Io(i), r = [...o.keys()].sort((f, l) => f - l), c = [...a.keys()].sort((f, l) => f - l);
  r.join(",") !== c.join(",") && Ht(`${e} voices present`, r.join(","), c.join(","));
  for (const f of c) {
    const l = o.get(f), h = a.get(f);
    l.length !== h.length && Ht(`${e} voice ${f} note count`, l.length, h.length);
    for (let d = 0; d < h.length; d++)
      Ka(
        `${e} voice ${f} note ${d}`,
        t,
        n,
        l[d],
        h[d]
      );
  }
}
function Eo(e) {
  const t = e.grace;
  if (t === null) return "none";
  const n = (s) => s === null ? "-" : String(Math.round(s * 1e9) / 1e9);
  return `${t.slash ? "slash" : "plain"} ${n(t.stealTimePrevious)} ${n(t.stealTimeFollowing)} ${n(t.makeTime)}`;
}
function To(e) {
  return e.map(
    (t) => `${t.verse}:${t.syllabic}:${JSON.stringify(t.text)}` + t.elisions.map((n) => `_${n.syllabic}:${JSON.stringify(n.text)}`).join("") + `:${t.extend ?? "-"}:${t.source ? dn(t.source) : "-"}`
  ).join(" | ");
}
function Ka(e, t, n, s, i) {
  ct(`${e} isRest`, s.isRest, i.isRest), ct(`${e} pitch`, Yn(s.pitch), Yn(i.pitch)), ct(`${e} value`, s.value, i.value), ct(`${e} dots`, s.dots, i.dots), ct(`${e} tuplet`, Oo(s), Oo(i)), ct(`${e} measureRestWholes`, s.measureRestWholes, i.measureRestWholes), ct(`${e} chordWithPrevious`, s.chordWithPrevious, i.chordWithPrevious), ct(`${e} articulations`, s.articulations.join(","), i.articulations.join(",")), ct(`${e} fermata`, s.fermata, i.fermata), ct(`${e} arpeggiate`, s.arpeggiate, i.arpeggiate), ct(`${e} grace`, Eo(s), Eo(i)), ct(`${e} lyrics`, To(s.lyrics), To(i.lyrics)), ct(`${e} passthrough`, No(s.passthrough), No(i.passthrough));
  const o = s.tiedToId === null ? null : t.findNote(s.tiedToId) ?? null, a = i.tiedToId === null ? null : n.findNote(i.tiedToId) ?? null;
  ct(
    `${e} tie target pitch`,
    o ? Yn(o.pitch) : "no-tie",
    a ? Yn(a.pitch) : "no-tie"
  );
}
function Io(e) {
  const t = /* @__PURE__ */ new Map();
  for (const n of e) {
    const s = t.get(n.voice);
    s ? s.push(n) : t.set(n.voice, [n]);
  }
  return t;
}
function qa(e, t, n) {
  ct(`${e} passthrough`, Bo(t.passthrough), Bo(n.passthrough)), ct(
    `${e} attributesPassthrough`,
    ke(t.attributesPassthrough),
    ke(n.attributesPassthrough)
  ), ct(
    `${e} barlinePassthrough`,
    ke(t.barlinePassthrough),
    ke(n.barlinePassthrough)
  );
}
function Bo(e) {
  return e.map(
    (t) => `${t.lead ? "lead" : `v${t.voice}@${t.onset.num}/${t.onset.den}`} ${dn(t.element, t.divisions)}`
  ).sort().join(`
`);
}
function No(e) {
  const t = [];
  for (const n of e) {
    if (n.name !== "notations") {
      t.push(n);
      continue;
    }
    const s = n.children.filter((i) => i.name !== "tuplet");
    s.length > 0 && t.push({ ...n, children: s });
  }
  return ke(t);
}
function ke(e) {
  return (e ?? []).map((t) => dn(t)).sort().join(`
`);
}
function Bi(e) {
  return e.passthrough && e.passthrough.length > 0 ? ` +${ke(e.passthrough)}` : "";
}
function Qa(e, t) {
  e.slurs.length !== t.slurs.length && Ht("slurs.length", e.slurs.length, t.slurs.length);
  const n = new Set(e.slurs.map((s) => Ao(e, s.startNoteId, s.endNoteId)));
  for (const s of t.slurs) {
    const i = Ao(t, s.startNoteId, s.endNoteId);
    if (!n.has(i))
      throw new Error(`scores differ: expected a slur at ${i}, actual slurs are {${[...n].join("; ")}}`);
  }
}
function Ao(e, t, n) {
  return `${Co(e, t)} -> ${Co(e, n)}`;
}
function Co(e, t) {
  for (let n = 0; n < e.staves.length; n++) {
    const s = e.staves[n].measures;
    for (let i = 0; i < s.length; i++) {
      const o = s[i].notes.findIndex((a) => a.id === t);
      if (o !== -1) return `${n}:${i}:${o}`;
    }
  }
  return "?:?:?";
}
function Ja(e, t) {
  Wo("named parts", Po(e), Po(t)), Wo("part-groups", Fo(e), Fo(t));
}
function Po(e) {
  const t = /* @__PURE__ */ new Set();
  for (const n of e.parts)
    n.name === void 0 || n.name === "" || /^Part \d+$/.test(n.name) || t.add(`${Ni(n.staffIndices)}::${n.name}${Bi(n)}`);
  return t;
}
function Fo(e) {
  const t = /* @__PURE__ */ new Set();
  for (const n of e.parts) {
    if (n.staffIndices.length < 2 || n.name !== void 0 && n.name !== "") continue;
    const s = n.staffIndices.length === 2 ? "brace" : "bracket";
    t.add(`${Ni(n.staffIndices)}::${s}${Bi(n)}`);
  }
  return t;
}
function Ni(e) {
  return `[${[...e].sort((t, n) => t - n).join(",")}]`;
}
function ct(e, t, n) {
  t !== n && Ht(e, t, n);
}
function Wo(e, t, n) {
  const s = [...t].sort(), i = [...n].sort();
  s.join(" | ") !== i.join(" | ") && Ht(e, `{${s.join("; ")}}`, `{${i.join("; ")}}`);
}
function Ht(e, t, n) {
  throw new Error(`scores differ at ${e}: actual ${JSON.stringify(t)}, expected ${JSON.stringify(n)}`);
}
function Yn(e) {
  return e === null ? "rest" : La(e);
}
function Oo(e) {
  return e.tuplet === null ? "none" : `${e.tuplet.actualNotes}:${e.tuplet.normalNotes}`;
}
function jn(e) {
  return `${e.beats}/${e.beatType}`;
}
const Za = 100;
var Nn, Nt, ne, Pe, on;
class Pf {
  constructor(t, n = {}) {
    z(this, Nn);
    /** The live current score. Owned here; mutated only via `record`. */
    z(this, Nt);
    /** Snapshots of states *before* each kept edit, oldest first. */
    z(this, ne, []);
    /** Snapshots of states undone away from, most-recently-undone last. */
    z(this, Pe, []);
    /** The state `markSaved()` last blessed as "on disk". Compared to
     *  `#current` by musical content to answer `dirty`. */
    z(this, on);
    $(this, Nn, Math.max(1, Math.floor(n.cap ?? Za))), $(this, Nt, t.clone()), $(this, on, u(this, Nt).clone());
  }
  /** The live current score. Edit it only through `record`. */
  get current() {
    return u(this, Nt);
  }
  /**
   * Snapshot `current`, run `edit` against the live score, and keep the
   * snapshot on the undo stack only if `edit` reports a change. "Reports a
   * change" means it returned something other than `null`, `undefined` or
   * `false` (so `transposeNote` returning measure index `0` still counts).
   * Keeping a snapshot clears the redo stack and, past `cap`, drops the
   * oldest snapshot. Returns whatever `edit` returned, so a caller can still
   * read e.g. the changed measure index from `transposeNote`.
   */
  record(t) {
    const n = u(this, Nt).clone(), s = t(u(this, Nt));
    return s != null && s !== !1 && (u(this, ne).push(n), u(this, ne).length > u(this, Nn) && u(this, ne).shift(), u(this, Pe).length = 0), s;
  }
  /** Restore the previous snapshot; returns the new `current`, or `null` if
   *  there is nothing to undo. */
  undo() {
    const t = u(this, ne).pop();
    return t === void 0 ? null : (u(this, Pe).push(u(this, Nt)), $(this, Nt, t), u(this, Nt));
  }
  /** Re-apply the last undone snapshot; returns the new `current`, or `null`
   *  if there is nothing to redo. */
  redo() {
    const t = u(this, Pe).pop();
    return t === void 0 ? null : (u(this, ne).push(u(this, Nt)), $(this, Nt, t), u(this, Nt));
  }
  get canUndo() {
    return u(this, ne).length > 0;
  }
  get canRedo() {
    return u(this, Pe).length > 0;
  }
  /** Mark the current state as the saved baseline, so `dirty` reads false
   *  until the score next diverges from it. */
  markSaved() {
    $(this, on, u(this, Nt).clone());
  }
  /** Whether `current` differs, in musical content, from the last
   *  `markSaved()` baseline (the initial state if `markSaved` was never
   *  called). Compared with `assertScoresEquivalent`, not object identity. */
  get dirty() {
    try {
      return Ha(u(this, Nt), u(this, on)), !1;
    } catch {
      return !0;
    }
  }
}
Nn = new WeakMap(), Nt = new WeakMap(), ne = new WeakMap(), Pe = new WeakMap(), on = new WeakMap();
const X = {
  noteheadWhole: {
    name: "noteheadWhole",
    codepoint: 57506,
    description: "Whole (semibreve) notehead",
    advance: 1.688,
    bBoxSW: [0, -0.5],
    bBoxNE: [1.688, 0.5],
    anchors: {}
  },
  noteheadHalf: {
    name: "noteheadHalf",
    codepoint: 57507,
    description: "Half (minim) notehead",
    advance: 1.18,
    bBoxSW: [0, -0.5],
    bBoxNE: [1.18, 0.5],
    anchors: { stemUpSE: [1.18, 0.168], stemDownNW: [0, -0.168] }
  },
  noteheadBlack: {
    name: "noteheadBlack",
    codepoint: 57508,
    description: "Black notehead",
    advance: 1.18,
    bBoxSW: [0, -0.5],
    bBoxNE: [1.18, 0.5],
    anchors: { stemUpSE: [1.18, 0.168], stemDownNW: [0, -0.168] }
  },
  flag8thUp: {
    name: "flag8thUp",
    codepoint: 57920,
    description: "Combining flag 1 (8th) above",
    advance: 1.056,
    bBoxSW: [0, -3.24],
    bBoxNE: [1.056, 0.036],
    anchors: { stemUpNW: [0, -0.04] }
  },
  flag8thDown: {
    name: "flag8thDown",
    codepoint: 57921,
    description: "Combining flag 1 (8th) below",
    advance: 1.224,
    bBoxSW: [0, -0.056],
    bBoxNE: [1.224, 3.232],
    anchors: { stemDownSW: [0, 0.132] }
  },
  flag16thUp: {
    name: "flag16thUp",
    codepoint: 57922,
    description: "Combining flag 2 (16th) above",
    advance: 1.116,
    bBoxSW: [0, -3.252],
    bBoxNE: [1.116, 8e-3],
    anchors: { stemUpNW: [0, -0.088] }
  },
  flag16thDown: {
    name: "flag16thDown",
    codepoint: 57923,
    description: "Combining flag 2 (16th) below",
    advance: 1.168,
    bBoxSW: [0, -0.036],
    bBoxNE: [1.164, 3.248],
    anchors: { stemDownSW: [0, 0.128] }
  },
  flag32ndUp: {
    name: "flag32ndUp",
    codepoint: 57924,
    description: "Combining flag 3 (32nd) above",
    advance: 1.048,
    bBoxSW: [0, -3.248],
    bBoxNE: [1.044, 0.596],
    anchors: { stemUpNW: [0, 0.376] }
  },
  flag32ndDown: {
    name: "flag32ndDown",
    codepoint: 57925,
    description: "Combining flag 3 (32nd) below",
    advance: 1.096,
    bBoxSW: [0, -0.688],
    bBoxNE: [1.092, 3.248],
    anchors: { stemDownSW: [0, -0.448] }
  },
  flag64thUp: {
    name: "flag64thUp",
    codepoint: 57926,
    description: "Combining flag 4 (64th) above",
    advance: 1.048,
    bBoxSW: [0, -3.248],
    bBoxNE: [1.044, 1.388],
    anchors: { stemUpNW: [0, 1.172] }
  },
  flag64thDown: {
    name: "flag64thDown",
    codepoint: 57927,
    description: "Combining flag 4 (64th) below",
    advance: 1.1,
    bBoxSW: [0, -1.504],
    bBoxNE: [1.092, 3.248],
    anchors: { stemDownSW: [0, -1.244] }
  },
  gClef: {
    name: "gClef",
    codepoint: 57424,
    description: "G clef",
    advance: 2.684,
    bBoxSW: [0, -2.632],
    bBoxNE: [2.684, 4.392],
    anchors: {}
  },
  fClef: {
    name: "fClef",
    codepoint: 57442,
    description: "F clef",
    advance: 2.736,
    bBoxSW: [-0.02, -2.54],
    bBoxNE: [2.736, 1.048],
    anchors: {}
  },
  gClef8vb: {
    name: "gClef8vb",
    codepoint: 57426,
    description: "G clef ottava bassa",
    advance: 2.656,
    bBoxSW: [0, -3.512],
    bBoxNE: [2.684, 4.392],
    anchors: {}
  },
  cClef: {
    name: "cClef",
    codepoint: 57436,
    description: "C clef",
    advance: 2.796,
    bBoxSW: [0, -2.024],
    bBoxNE: [2.796, 2.024],
    anchors: {}
  },
  restWhole: {
    name: "restWhole",
    codepoint: 58595,
    description: "Whole (semibreve) rest",
    advance: 1.132,
    bBoxSW: [0, -0.54],
    bBoxNE: [1.128, 0.036],
    anchors: {}
  },
  restHalf: {
    name: "restHalf",
    codepoint: 58596,
    description: "Half (minim) rest",
    advance: 1.132,
    bBoxSW: [0, -8e-3],
    bBoxNE: [1.128, 0.568],
    anchors: {}
  },
  restQuarter: {
    name: "restQuarter",
    codepoint: 58597,
    description: "Quarter (crotchet) rest",
    advance: 1.08,
    bBoxSW: [4e-3, -1.5],
    bBoxNE: [1.08, 1.492],
    anchors: {}
  },
  rest8th: {
    name: "rest8th",
    codepoint: 58598,
    description: "Eighth (quaver) rest",
    advance: 1,
    bBoxSW: [0, -1.004],
    bBoxNE: [0.988, 0.696],
    anchors: {}
  },
  rest16th: {
    name: "rest16th",
    codepoint: 58599,
    description: "16th (semiquaver) rest",
    advance: 1.28,
    bBoxSW: [0, -2],
    bBoxNE: [1.28, 0.716],
    anchors: {}
  },
  rest32nd: {
    name: "rest32nd",
    codepoint: 58600,
    description: "32nd (demisemiquaver) rest",
    advance: 1.452,
    bBoxSW: [0, -2],
    bBoxNE: [1.452, 1.704],
    anchors: {}
  },
  rest64th: {
    name: "rest64th",
    codepoint: 58601,
    description: "64th (hemidemisemiquaver) rest",
    advance: 1.696,
    bBoxSW: [0, -3.012],
    bBoxNE: [1.692, 1.72],
    anchors: {}
  },
  accidentalSharp: {
    name: "accidentalSharp",
    codepoint: 57954,
    description: "Sharp",
    advance: 0.996,
    bBoxSW: [0, -1.392],
    bBoxNE: [0.996, 1.4],
    anchors: {}
  },
  accidentalFlat: {
    name: "accidentalFlat",
    codepoint: 57952,
    description: "Flat",
    advance: 0.904,
    bBoxSW: [0, -0.7],
    bBoxNE: [0.904, 1.756],
    anchors: {}
  },
  accidentalNatural: {
    name: "accidentalNatural",
    codepoint: 57953,
    description: "Natural",
    advance: 0.672,
    bBoxSW: [0, -1.34],
    bBoxNE: [0.672, 1.364],
    anchors: {}
  },
  augmentationDot: {
    name: "augmentationDot",
    codepoint: 57831,
    description: "Augmentation dot",
    advance: 0.4,
    bBoxSW: [0, -0.2],
    bBoxNE: [0.4, 0.2],
    anchors: {}
  },
  repeatDot: {
    name: "repeatDot",
    codepoint: 57412,
    description: "Single repeat dot",
    advance: 0.4,
    bBoxSW: [0, -0.2],
    bBoxNE: [0.4, 0.2],
    anchors: {}
  },
  timeSig0: {
    name: "timeSig0",
    codepoint: 57472,
    description: "Time signature 0",
    advance: 1.88,
    bBoxSW: [0.08, -1],
    bBoxNE: [1.8, 1.004],
    anchors: {}
  },
  timeSig1: {
    name: "timeSig1",
    codepoint: 57473,
    description: "Time signature 1",
    advance: 1.336,
    bBoxSW: [0.08, -1],
    bBoxNE: [1.256, 1.004],
    anchors: {}
  },
  timeSig2: {
    name: "timeSig2",
    codepoint: 57474,
    description: "Time signature 2",
    advance: 1.784,
    bBoxSW: [0.08, -1.028],
    bBoxNE: [1.704, 1.016],
    anchors: {}
  },
  timeSig3: {
    name: "timeSig3",
    codepoint: 57475,
    description: "Time signature 3",
    advance: 1.684,
    bBoxSW: [0.08, -1.004],
    bBoxNE: [1.604, 0.996],
    anchors: {}
  },
  timeSig4: {
    name: "timeSig4",
    codepoint: 57476,
    description: "Time signature 4",
    advance: 1.88,
    bBoxSW: [0.08, -1],
    bBoxNE: [1.8, 1.004],
    anchors: {}
  },
  timeSig5: {
    name: "timeSig5",
    codepoint: 57477,
    description: "Time signature 5",
    advance: 1.612,
    bBoxSW: [0.08, -1.004],
    bBoxNE: [1.532, 0.984],
    anchors: {}
  },
  timeSig6: {
    name: "timeSig6",
    codepoint: 57478,
    description: "Time signature 6",
    advance: 1.736,
    bBoxSW: [0.08, -0.996],
    bBoxNE: [1.656, 1.004],
    anchors: {}
  },
  timeSig7: {
    name: "timeSig7",
    codepoint: 57479,
    description: "Time signature 7",
    advance: 1.764,
    bBoxSW: [0.08, -1],
    bBoxNE: [1.684, 0.996],
    anchors: {}
  },
  timeSig8: {
    name: "timeSig8",
    codepoint: 57480,
    description: "Time signature 8",
    advance: 1.744,
    bBoxSW: [0.08, -1.036],
    bBoxNE: [1.664, 1.036],
    anchors: {}
  },
  timeSig9: {
    name: "timeSig9",
    codepoint: 57481,
    description: "Time signature 9",
    advance: 1.736,
    bBoxSW: [0.08, -0.996],
    bBoxNE: [1.656, 1.004],
    anchors: {}
  },
  brace: {
    name: "brace",
    codepoint: 57344,
    description: "Brace",
    advance: 0.28,
    bBoxSW: [0, -25e-4],
    bBoxNE: [0.2774, 4.0024],
    anchors: {}
  },
  bracketTop: {
    name: "bracketTop",
    codepoint: 57347,
    description: "Bracket top",
    advance: 1.876,
    bBoxSW: [0, 0],
    bBoxNE: [1.876, 1.18],
    anchors: {}
  },
  bracketBottom: {
    name: "bracketBottom",
    codepoint: 57348,
    description: "Bracket bottom",
    advance: 1.876,
    bBoxSW: [0, -1.18],
    bBoxNE: [1.876, 0],
    anchors: {}
  },
  articStaccatoAbove: {
    name: "articStaccatoAbove",
    codepoint: 58530,
    description: "Staccato above",
    advance: 0.336,
    bBoxSW: [0, 0],
    bBoxNE: [0.336, 0.336],
    anchors: {}
  },
  articStaccatoBelow: {
    name: "articStaccatoBelow",
    codepoint: 58531,
    description: "Staccato below",
    advance: 0.336,
    bBoxSW: [0, -0.336],
    bBoxNE: [0.336, 0],
    anchors: {}
  },
  articStaccatissimoAbove: {
    name: "articStaccatissimoAbove",
    codepoint: 58534,
    description: "Staccatissimo above",
    advance: 0.408,
    bBoxSW: [4e-3, -8e-3],
    bBoxNE: [0.4, 1.172],
    anchors: {}
  },
  articStaccatissimoBelow: {
    name: "articStaccatissimoBelow",
    codepoint: 58535,
    description: "Staccatissimo below",
    advance: 0.408,
    bBoxSW: [4e-3, -1.18],
    bBoxNE: [0.4, 0],
    anchors: {}
  },
  articTenutoAbove: {
    name: "articTenutoAbove",
    codepoint: 58532,
    description: "Tenuto above",
    advance: 1.352,
    bBoxSW: [-4e-3, 0],
    bBoxNE: [1.352, 0.192],
    anchors: {}
  },
  articTenutoBelow: {
    name: "articTenutoBelow",
    codepoint: 58533,
    description: "Tenuto below",
    advance: 1.352,
    bBoxSW: [-4e-3, -0.192],
    bBoxNE: [1.352, 0],
    anchors: {}
  },
  articTenutoStaccatoAbove: {
    name: "articTenutoStaccatoAbove",
    codepoint: 58546,
    description: "Louré (tenuto-staccato) above",
    advance: 1.356,
    bBoxSW: [-4e-3, 0],
    bBoxNE: [1.352, 0.96],
    anchors: {}
  },
  articTenutoStaccatoBelow: {
    name: "articTenutoStaccatoBelow",
    codepoint: 58547,
    description: "Louré (tenuto-staccato) below",
    advance: 1.352,
    bBoxSW: [-4e-3, -0.968],
    bBoxNE: [1.352, 0],
    anchors: {}
  },
  articAccentAbove: {
    name: "articAccentAbove",
    codepoint: 58528,
    description: "Accent above",
    advance: 1.356,
    bBoxSW: [0, 4e-3],
    bBoxNE: [1.356, 0.98],
    anchors: {}
  },
  articAccentBelow: {
    name: "articAccentBelow",
    codepoint: 58529,
    description: "Accent below",
    advance: 1.356,
    bBoxSW: [0, -0.976],
    bBoxNE: [1.356, 0],
    anchors: {}
  },
  articMarcatoAbove: {
    name: "articMarcatoAbove",
    codepoint: 58540,
    description: "Marcato above",
    advance: 0.944,
    bBoxSW: [-4e-3, -4e-3],
    bBoxNE: [0.94, 1.012],
    anchors: {}
  },
  articMarcatoBelow: {
    name: "articMarcatoBelow",
    codepoint: 58541,
    description: "Marcato below",
    advance: 0.944,
    bBoxSW: [-4e-3, -1.016],
    bBoxNE: [0.94, 0],
    anchors: {}
  },
  fermataAbove: {
    name: "fermataAbove",
    codepoint: 58560,
    description: "Fermata above",
    advance: 2.42,
    bBoxSW: [0.012, -0.012],
    bBoxNE: [2.42, 1.316],
    anchors: {}
  },
  fermataBelow: {
    name: "fermataBelow",
    codepoint: 58561,
    description: "Fermata below",
    advance: 2.42,
    bBoxSW: [0.012, -1.328],
    bBoxNE: [2.42, 0],
    anchors: {}
  },
  dynamicPiano: {
    name: "dynamicPiano",
    codepoint: 58656,
    description: "Piano",
    advance: 1.46,
    bBoxSW: [-0.356, -0.568],
    bBoxNE: [1.464, 1.096],
    anchors: {}
  },
  dynamicPP: {
    name: "dynamicPP",
    codepoint: 58667,
    description: "pp",
    advance: 2.908,
    bBoxSW: [-0.328, -0.568],
    bBoxNE: [2.912, 1.096],
    anchors: {}
  },
  dynamicPPP: {
    name: "dynamicPPP",
    codepoint: 58666,
    description: "ppp",
    advance: 4.288,
    bBoxSW: [-0.368, -0.568],
    bBoxNE: [4.292, 1.096],
    anchors: {}
  },
  dynamicPPPP: {
    name: "dynamicPPPP",
    codepoint: 58665,
    description: "pppp",
    advance: 5.668,
    bBoxSW: [-0.408, -0.568],
    bBoxNE: [5.672, 1.096],
    anchors: {}
  },
  dynamicPPPPP: {
    name: "dynamicPPPPP",
    codepoint: 58664,
    description: "ppppp",
    advance: 7.104,
    bBoxSW: [-0.408, -0.568],
    bBoxNE: [7.092, 1.096],
    anchors: {}
  },
  dynamicPPPPPP: {
    name: "dynamicPPPPPP",
    codepoint: 58663,
    description: "pppppp",
    advance: 8.496,
    bBoxSW: [-0.408, -0.568],
    bBoxNE: [8.512, 1.096],
    anchors: {}
  },
  dynamicForte: {
    name: "dynamicForte",
    codepoint: 58658,
    description: "Forte",
    advance: 1.456,
    bBoxSW: [-0.564, -0.608],
    bBoxNE: [1.456, 1.776],
    anchors: {}
  },
  dynamicFF: {
    name: "dynamicFF",
    codepoint: 58671,
    description: "ff",
    advance: 2.436,
    bBoxSW: [-0.54, -0.608],
    bBoxNE: [2.44, 1.776],
    anchors: {}
  },
  dynamicFFF: {
    name: "dynamicFFF",
    codepoint: 58672,
    description: "fff",
    advance: 3.324,
    bBoxSW: [-0.62, -0.608],
    bBoxNE: [3.32, 1.776],
    anchors: {}
  },
  dynamicFFFF: {
    name: "dynamicFFFF",
    codepoint: 58673,
    description: "ffff",
    advance: 4.28,
    bBoxSW: [-0.62, -0.608],
    bBoxNE: [4.28, 1.776],
    anchors: {}
  },
  dynamicFFFFF: {
    name: "dynamicFFFFF",
    codepoint: 58674,
    description: "fffff",
    advance: 5.24,
    bBoxSW: [-0.62, -0.608],
    bBoxNE: [5.24, 1.776],
    anchors: {}
  },
  dynamicFFFFFF: {
    name: "dynamicFFFFFF",
    codepoint: 58675,
    description: "ffffff",
    advance: 6.2,
    bBoxSW: [-0.62, -0.608],
    bBoxNE: [6.2, 1.776],
    anchors: {}
  },
  dynamicMP: {
    name: "dynamicMP",
    codepoint: 58668,
    description: "mp",
    advance: 3.304,
    bBoxSW: [-0.08, -0.568],
    bBoxNE: [3.3, 1.096],
    anchors: {}
  },
  dynamicMF: {
    name: "dynamicMF",
    codepoint: 58669,
    description: "mf",
    advance: 3.188,
    bBoxSW: [-0.08, -0.66],
    bBoxNE: [3.272, 1.724],
    anchors: {}
  },
  dynamicPF: {
    name: "dynamicPF",
    codepoint: 58670,
    description: "pf",
    advance: 3.08,
    bBoxSW: [-0.288, -0.608],
    bBoxNE: [3.08, 1.776],
    anchors: {}
  },
  dynamicFortePiano: {
    name: "dynamicFortePiano",
    codepoint: 58676,
    description: "Forte-piano",
    advance: 2.476,
    bBoxSW: [-0.564, -0.608],
    bBoxNE: [2.476, 1.776],
    anchors: {}
  },
  dynamicForzando: {
    name: "dynamicForzando",
    codepoint: 58677,
    description: "Forzando",
    advance: 1.988,
    bBoxSW: [-0.564, -0.608],
    bBoxNE: [1.988, 1.776],
    anchors: {}
  },
  dynamicSforzando1: {
    name: "dynamicSforzando1",
    codepoint: 58678,
    description: "Sforzando 1",
    advance: 2.416,
    bBoxSW: [0, -0.608],
    bBoxNE: [2.416, 1.776],
    anchors: {}
  },
  dynamicSforzandoPiano: {
    name: "dynamicSforzandoPiano",
    codepoint: 58679,
    description: "Sforzando-piano",
    advance: 3.384,
    bBoxSW: [0, -0.608],
    bBoxNE: [3.38, 1.776],
    anchors: {}
  },
  dynamicSforzandoPianissimo: {
    name: "dynamicSforzandoPianissimo",
    codepoint: 58680,
    description: "Sforzando-pianissimo",
    advance: 4.792,
    bBoxSW: [0, -0.608],
    bBoxNE: [4.796, 1.776],
    anchors: {}
  },
  dynamicSforzato: {
    name: "dynamicSforzato",
    codepoint: 58681,
    description: "Sforzato",
    advance: 2.928,
    bBoxSW: [0, -0.608],
    bBoxNE: [2.932, 1.776],
    anchors: {}
  },
  dynamicSforzatoPiano: {
    name: "dynamicSforzatoPiano",
    codepoint: 58682,
    description: "Sforzato-piano",
    advance: 4.3,
    bBoxSW: [0, -0.608],
    bBoxNE: [4.304, 1.776],
    anchors: {}
  },
  dynamicSforzatoFF: {
    name: "dynamicSforzatoFF",
    codepoint: 58683,
    description: "Sforzatissimo",
    advance: 3.856,
    bBoxSW: [0, -0.608],
    bBoxNE: [3.856, 1.776],
    anchors: {}
  },
  dynamicRinforzando1: {
    name: "dynamicRinforzando1",
    codepoint: 58684,
    description: "Rinforzando 1",
    advance: 2.5,
    bBoxSW: [-0.08, -0.608],
    bBoxNE: [2.5, 1.776],
    anchors: {}
  },
  dynamicRinforzando2: {
    name: "dynamicRinforzando2",
    codepoint: 58685,
    description: "Rinforzando 2",
    advance: 2.976,
    bBoxSW: [-0.08, -0.608],
    bBoxNE: [2.976, 1.776],
    anchors: {}
  },
  dynamicNiente: {
    name: "dynamicNiente",
    codepoint: 58662,
    description: "Niente",
    advance: 1.232,
    bBoxSW: [-0.092, -0.04],
    bBoxNE: [1.232, 1.096],
    anchors: {}
  },
  noteheadDoubleWhole: {
    name: "noteheadDoubleWhole",
    codepoint: 57504,
    description: "Double whole (breve) notehead",
    advance: 2.396,
    bBoxSW: [0, -0.62],
    bBoxNE: [2.396, 0.62],
    anchors: { stemUpSE: [2.036, 4e-3], stemDownNW: [0.36, 4e-3] }
  },
  restDoubleWhole: {
    name: "restDoubleWhole",
    codepoint: 58594,
    description: "Double whole (breve) rest",
    advance: 0.504,
    bBoxSW: [0, 0],
    bBoxNE: [0.5, 1],
    anchors: {}
  },
  metNoteDoubleWhole: {
    name: "metNoteDoubleWhole",
    codepoint: 60576,
    description: "Double whole note (breve)",
    advance: 2.62,
    bBoxSW: [0, -0.672],
    bBoxNE: [2.62, 0.68],
    anchors: {}
  },
  metNoteWhole: {
    name: "metNoteWhole",
    codepoint: 60578,
    description: "Whole note (semibreve)",
    advance: 1.836,
    bBoxSW: [0, -0.5],
    bBoxNE: [1.836, 0.592],
    anchors: {}
  },
  metNoteHalfUp: {
    name: "metNoteHalfUp",
    codepoint: 60579,
    description: "Half note (minim) stem up",
    advance: 1.364,
    bBoxSW: [0, -0.564],
    bBoxNE: [1.364, 2.752],
    anchors: {}
  },
  metNoteQuarterUp: {
    name: "metNoteQuarterUp",
    codepoint: 60581,
    description: "Quarter note (crotchet) stem up",
    advance: 1.328,
    bBoxSW: [0, -0.564],
    bBoxNE: [1.328, 2.752],
    anchors: {}
  },
  metNote8thUp: {
    name: "metNote8thUp",
    codepoint: 60583,
    description: "Eighth note (quaver) stem up",
    advance: 2.136,
    bBoxSW: [0, -0.564],
    bBoxNE: [2.132, 2.784],
    anchors: {}
  },
  metNote16thUp: {
    name: "metNote16thUp",
    codepoint: 60585,
    description: "16th note (semiquaver) stem up",
    advance: 2.088,
    bBoxSW: [0, -0.564],
    bBoxNE: [2.084, 2.8],
    anchors: {}
  },
  metAugmentationDot: {
    name: "metAugmentationDot",
    codepoint: 60599,
    description: "Augmentation dot",
    advance: 0.4,
    bBoxSW: [0, -0.2],
    bBoxNE: [0.4, 0.2],
    anchors: {}
  }
};
function kn(e) {
  return X[e];
}
const st = {
  staffLineThickness: 0.13,
  stemThickness: 0.12,
  legerLineThickness: 0.16,
  legerLineExtension: 0.4,
  thinBarlineThickness: 0.16,
  thickBarlineThickness: 0.5,
  barlineSeparation: 0.4,
  beamThickness: 0.5,
  beamSpacing: 0.25,
  tieMidpointThickness: 0.22,
  slurMidpointThickness: 0.22,
  bracketThickness: 0.5,
  hairpinThickness: 0.16
}, Xe = 4, Ai = "Bravura", Ns = {
  staffSpacePx: 9,
  paddingPx: 16
}, ot = {
  /**
   * Horizontal advance given to a column whose duration equals its measure's
   * spacing reference (`spacingReferenceWholes`), staff spaces: the room the
   * measure's shortest note gets. A notehead is about 1.2 spaces wide, so
   * this leaves about one space of air after it (M8 Slice 4; LilyPond's
   * default shortest-note space is about 2.4).
   */
  noteSpaceBase: 2.4,
  /**
   * Extra advance added per *doubling* of a column's duration relative to
   * its measure's spacing reference, staff spaces. This is what makes the
   * curve logarithmic rather than linear: a note twice as long as another
   * gets exactly this much more room, not twice as much. See
   * `noteAdvanceSpaces`.
   */
  noteSpacePerDoubling: 1,
  /**
   * The longest a measure's spacing reference may be, as a fraction of a
   * whole note. The reference is the measure's shortest column duration
   * (shortest-note-relative spacing, as engravers do it), capped here so a
   * measure of only quarters or halves still gives them more room than
   * eighths get elsewhere instead of crowding them to `noteSpaceBase`.
   */
  spacingReferenceMaxWholes: 1 / 8,
  /** Gap between an accidental and the notehead it belongs to. */
  accidentalGap: 0.3,
  /** Least blank between a measure's barline (or header) and an accidental
   *  on its first note, which hangs left into the lead-in (M8 Slice 4). */
  accidentalLeadClearance: 0.4,
  /** Gap between two columns of a chord's stacked accidentals (M6 Slice 2;
   *  see `stackAccidentals`): tighter than `accidentalGap`, since the two
   *  glyphs belong together, but enough that their ink never touches. */
  accidentalColumnGap: 0.15,
  /**
   * Minimum blank required between the previous note's rightmost ink (its
   * stem, a ledger line, or just its notehead) and an accidental this note
   * must draw. Below this, the accidental would print on top of that ink;
   * `layoutNote` pushes the whole note right by however much clearance is
   * missing rather than let that happen. Independent of `accidentalGap`,
   * which is the gap on the *other* side, between the accidental and its
   * own notehead. Deliberately never scaled by a system's justification
   * factor (`MeasureContext.spacingScale`): it is a minimum-ink guarantee,
   * not decorative spacing, so it has to hold even in the rare system that
   * ends up mildly compressed rather than stretched.
   *
   * Since M8 Slice 4 accidentals hang left of their column and
   * `measureColumns` reserves this clearance (from the previous head) ahead
   * of time, so the push only binds where the reservation cannot see the
   * ink: a ledger line, another voice at the same onset, a grace run.
   */
  minAccidentalClearance: 0.9,
  /** Gap between a notehead (or rest) and its first augmentation dot. */
  dotGap: 0.2,
  /** Gap between two augmentation dots on the same note. */
  dotSpacing: 0.3,
  /**
   * How far a system's note advances may be compressed to fit one more
   * measure when casting off (M8 Slice 4), as a justification scale. Only
   * the duration-driven part of a column shrinks (`Column.stretch`):
   * accidental and lyric room stay whole, so compression never makes
   * them collide. Engravers (and OSMD) compress a little rather than
   * break early; without it a measure that misses by a few pixels left a
   * system half empty and stretched.
   */
  minCastOffScale: 0.9,
  /** Blank at the start of a measure's note area, after the clef or barline.
   *  Wide enough that a down-stem first note, whose stem is the leftmost ink
   *  it draws, does not crowd the barline. */
  measureLeadIn: 1.7,
  /** Blank between the last note and the barline. */
  measureTrailOut: 1.4,
  /** Gap between the clef, key signature and time signature in the first measure. */
  headerGap: 0.9,
  /**
   * Blank between one system's lowest ink and the next system's staff top,
   * staff spaces. A fixed multiple of `ss` rather than a measured clearance:
   * real engraving reserves space per system based on the tallest thing that
   * actually lands there (a high ledger line, a beam, a dynamic). Phase 0 has
   * none of that yet, so a constant generous enough for stems and a few
   * ledger lines on either side is the naive-but-correct stand-in.
   */
  systemGap: 6,
  /**
   * Blank between one staff and the next, staff spaces, when two or more
   * staves are stacked *within one system* (M2 Slice 4). A fixed, generous
   * gap, the same naive-but-correct spirit as `systemGap`: real engraving
   * would size this per system based on the tallest ink actually landing in
   * it (a deep ledger line, a beam); this file has no such measurement yet,
   * so a constant wide enough for a couple of ledger lines on either side
   * (e.g. middle C sitting between a piano's two staves) is the stand-in.
   * Deliberately *not* ink-aware: `layoutScore` fixes every staff's own top
   * at a constant offset from the previous staff's nominal (not actual)
   * bottom, precisely so the shared barline's own split point (see
   * `layoutScore`'s own comment on `barlineTop`/`barlineBottom`) can be
   * computed up front, before any measure's content is laid out, with no
   * circular dependency between "how tall is this staff's ink" and "where
   * does the next staff start".
   *
   * Replaces Slice 3's `staffBlockGap`, which separated two whole
   * independent per-staff *blocks* (every one of a staff's own systems,
   * stacked below the previous staff's own last system); this slice
   * interleaves staves *within* a system instead, so the gap that matters
   * now is staff-to-staff, not block-to-block, and `systemGap` alone
   * separates one system's whole staff group from the next.
   */
  staffGap: 6
}, Ro = {
  fontSpaces: 1.4,
  gapSpaces: 0.4
}, nn = {
  /** Gap after a brace/bracket's own ink: between two qualifying groups
   *  stacked left to right, and between the last one and the label column
   *  (or, with no groups at all, between the left margin and the label
   *  column). */
  columnGap: 0.6,
  /** Gap between the label column's own reserved width and the clef. */
  labelGap: 0.6,
  /** A part-name label's font size, staff spaces: ordinary text, not a
   *  SMuFL glyph, sized relative to the staff the same way every other
   *  measurement in this file is, rather than a fixed point size. */
  labelFontSizeSpaces: 2,
  /**
   * Heuristic average glyph width, as a fraction of font size, used to
   * estimate a text label's pixel width. Layout has no canvas to measure
   * real text metrics with (`glyph-metrics.ts` only publishes SMuFL glyph
   * metrics, not an arbitrary text font's), so this is a documented
   * approximation, not a real measurement: 0.55 is a reasonable average
   * character width for a normal sans-serif font, good enough to reserve a
   * header column that comfortably fits a typical instrument name and to
   * roughly right-align each label against its own clef. A label whose
   * actual rendered width differs noticeably from this estimate (an
   * unusually wide or narrow font, a very short or very long name) could
   * end up a little more loosely or tightly spaced than intended; nothing
   * in this slice's own acceptance criteria needs pixel-exact text layout.
   */
  labelAvgCharWidthRatio: 0.55
};
function tr(e, t) {
  const s = Math.max(e, 1e-9) / Math.max(t, 1e-9);
  return ot.noteSpaceBase + ot.noteSpacePerDoubling * Math.log2(Math.max(s, 1));
}
function ds(e) {
  const t = /* @__PURE__ */ new Map();
  for (const n of Pi(e).values()) {
    let s = 0;
    for (const i of n) {
      for (const o of i) t.set(o.id, s);
      s += i[0].durationWholes;
    }
  }
  return t;
}
function er(e) {
  if (e.length < 2) return !1;
  const t = e.flatMap((n) => n.pitch ? [it(n.pitch)] : []).sort((n, s) => n - s);
  for (let n = 1; n < t.length; n++) if (t[n] - t[n - 1] === 1) return !0;
  return !1;
}
function kt(e) {
  return Math.round(e * 1e9) / 1e9;
}
let le = null;
function Ci(e) {
  if (le) return e();
  le = { grids: /* @__PURE__ */ new Map(), lyrics: /* @__PURE__ */ new Map() };
  try {
    return e();
  } finally {
    le = null;
  }
}
function us(e, t, n, s) {
  var c;
  const i = le && ((c = e.staves[n]) == null ? void 0 : c.measures[t.index]) === t ? le.grids : null;
  let o = i == null ? void 0 : i.get(t.index);
  if (o || (o = nr(e, t, n), i == null || i.set(t.index, o)), !s || s.extras.size === 0) return o;
  const a = o.columns;
  return { columns: a.map((f, l) => {
    const h = kt(f.onset), d = l + 1 < a.length ? kt(a[l + 1].onset) : Number.POSITIVE_INFINITY;
    let p = f.width;
    for (const [g, m] of s.extras) g >= h && g < d && (p += m);
    return p === f.width ? f : { ...f, width: p };
  }), lead: o.lead };
}
function nr(e, t, n) {
  const s = /* @__PURE__ */ new Map();
  e.staves.forEach((l, h) => {
    var b;
    const d = h === n ? t.notes : (b = l.measures[t.index]) == null ? void 0 : b.notes;
    if (!d) return;
    const p = ds(d), g = e.keyFifthsAt(t.index, h), m = /* @__PURE__ */ new Map();
    for (const y of Lt(d)) {
      const v = y[0], S = p.get(v.id), w = kt(S), T = er(y) ? X[He[v.value]].advance : 0, x = X[v.pitch === null ? no[v.value] : He[v.value]].advance + T;
      let P = m.get(v.voice);
      P || m.set(v.voice, P = /* @__PURE__ */ new Map());
      const N = y.flatMap((_) => _.pitch ? [{ note: _, pitch: _.pitch, d: it(_.pitch) }] : []), F = Gi(N, g, P).widthSpaces + (Qs(y) ? fe.room : 0), U = s.get(w);
      U ? (U.shortest = Math.min(U.shortest, v.durationWholes), U.extra = Math.max(U.extra, T), U.ink = Math.max(U.ink, x), U.overhang = Math.max(U.overhang, F)) : s.set(w, { onset: S, shortest: v.durationWholes, extra: T, ink: x, overhang: F });
    }
  });
  const i = [...s.values()].sort((l, h) => l.onset - h.onset), o = i.map((l, h) => {
    const d = i[h + 1];
    return d ? Math.min(l.shortest, d.onset - l.onset) : l.shortest;
  }), a = Math.min(ot.spacingReferenceMaxWholes, ...o), r = i.map((l, h) => {
    const d = tr(o[h], a) + l.extra, p = i[h + 1], g = p && p.overhang > 0 ? l.ink + ot.minAccidentalClearance + p.overhang : 0;
    return { onset: l.onset, width: Math.max(d, g), stretch: d };
  }), c = i[0], f = c ? Math.max(0, c.overhang + ot.accidentalLeadClearance - ot.measureLeadIn) : 0;
  return { columns: r, lead: f };
}
function sr(e) {
  const t = /* @__PURE__ */ new Map();
  for (const n of e) {
    const s = t.get(n.voice);
    s ? s.push(n) : t.set(n.voice, [n]);
  }
  return t;
}
function Pi(e) {
  const t = /* @__PURE__ */ new Map();
  for (const n of Lt(e)) {
    const s = n[0].voice, i = t.get(s);
    i ? i.push(n) : t.set(s, [n]);
  }
  return t;
}
const je = 3.5, or = 0.65, Ms = 0.25, Lo = 0.4, $o = 1.3, Ve = {
  treble: {
    bottomLine: it({ step: "E", octave: 4 }),
    middleLine: it({ step: "B", octave: 4 }),
    topLine: it({ step: "F", octave: 5 })
  },
  treble8: {
    bottomLine: it({ step: "E", octave: 4 }),
    middleLine: it({ step: "B", octave: 4 }),
    topLine: it({ step: "F", octave: 5 })
  },
  bass: {
    bottomLine: it({ step: "G", octave: 2 }),
    middleLine: it({ step: "D", octave: 3 }),
    topLine: it({ step: "A", octave: 3 })
  },
  // The C clefs (M6 Slice 4) name middle C by the line the glyph centres
  // on: the middle (third) line for alto, the fourth line for tenor. So a
  // tenor staff reads a third lower than an alto one: its lines are D3 F3
  // A3 C4 E4 against alto's F3 A3 C4 E4 G4.
  alto: {
    bottomLine: it({ step: "F", octave: 3 }),
    middleLine: it({ step: "C", octave: 4 }),
    topLine: it({ step: "G", octave: 4 })
  },
  tenor: {
    bottomLine: it({ step: "D", octave: 3 }),
    middleLine: it({ step: "A", octave: 3 }),
    topLine: it({ step: "E", octave: 4 })
  }
};
function As(e) {
  return Ve[e].middleLine;
}
const Cs = {
  sharp: ["F", "C", "G", "D", "A", "E", "B"],
  flat: ["B", "E", "A", "D", "G", "C", "F"]
}, Fi = {
  treble: {
    // F5 C5 G5 D5 A4 E5 B4
    sharp: [5, 5, 5, 5, 4, 5, 4],
    // B4 E5 A4 D5 G4 C5 F4
    flat: [4, 5, 4, 5, 4, 5, 4]
  },
  treble8: {
    sharp: [5, 5, 5, 5, 4, 5, 4],
    flat: [4, 5, 4, 5, 4, 5, 4]
  },
  bass: {
    // F3 C3 G3 D3 A2 E3 B2
    sharp: [3, 3, 3, 3, 2, 3, 2],
    // B2 E3 A2 D3 G2 C3 F2 (M6 Slice 4 fix: this read B3 E3 A3 ..., which
    // put the first flat above the staff and the third on the top line)
    flat: [2, 3, 2, 3, 2, 3, 2]
  },
  alto: {
    // F4 C4 G4 D4 A3 E4 B3
    sharp: [4, 4, 4, 4, 3, 4, 3],
    // B3 E4 A3 D4 G3 C4 F3
    flat: [3, 4, 3, 4, 3, 4, 3]
  },
  tenor: {
    // F3 C4 G3 D4 A3 E4 B3: the low-starting tenor sharp pattern
    sharp: [3, 4, 3, 4, 3, 4, 3],
    // B3 E4 A3 D4 G3 C4 F3
    flat: [3, 4, 3, 4, 3, 4, 3]
  }
}, He = {
  breve: "noteheadDoubleWhole",
  whole: "noteheadWhole",
  half: "noteheadHalf",
  quarter: "noteheadBlack",
  eighth: "noteheadBlack",
  "16th": "noteheadBlack",
  "32nd": "noteheadBlack",
  "64th": "noteheadBlack"
}, no = {
  breve: "restDoubleWhole",
  whole: "restWhole",
  half: "restHalf",
  quarter: "restQuarter",
  eighth: "rest8th",
  "16th": "rest16th",
  "32nd": "rest32nd",
  "64th": "rest64th"
};
function Ps(e) {
  return e !== "whole" && e !== "breve";
}
const En = {
  eighth: { up: "flag8thUp", down: "flag8thDown" },
  "16th": { up: "flag16thUp", down: "flag16thDown" },
  "32nd": { up: "flag32ndUp", down: "flag32ndDown" },
  "64th": { up: "flag64thUp", down: "flag64thDown" }
}, Fs = {
  eighth: 1,
  "16th": 2,
  "32nd": 3,
  "64th": 4
}, Wi = {
  "-1": "accidentalFlat",
  0: "accidentalNatural",
  1: "accidentalSharp"
}, ir = [
  "timeSig0",
  "timeSig1",
  "timeSig2",
  "timeSig3",
  "timeSig4",
  "timeSig5",
  "timeSig6",
  "timeSig7",
  "timeSig8",
  "timeSig9"
], Tn = 1;
function so(e, t, n, s, i = {
  above: e > 0,
  below: e < t - 1
}) {
  const o = Math.max(0, ot.staffGap * s / 2 - Tn);
  return {
    top: n - (i.above ? o : 0),
    bottom: n + 4 * s + (i.below ? o : 0)
  };
}
function Oi(e, t, n, s) {
  return { above: e > 0 && !n, below: e < t - 1 && !s };
}
function ar(e) {
  for (let t = 1; t < e.length; t++)
    if (e[t] !== e[t - 1] + 1) return !1;
  return !0;
}
function rr(e) {
  const t = [];
  for (const n of e.parts) {
    if (n.staffIndices.length < 2) continue;
    const s = [...n.staffIndices].sort((i, o) => i - o);
    ar(s) && t.push({ staffIndices: s, glyph: s.length === 2 ? "brace" : "bracket" });
  }
  return t.sort((n, s) => s.staffIndices.length - n.staffIndices.length), t;
}
function cr(e, t) {
  let n;
  for (const s of e.parts)
    !s.name || s.staffIndices.length !== 1 || s.staffIndices.includes(t) && (n || (n = s));
  return n;
}
function Ri(e) {
  const t = [];
  for (let n = 0; n < e.staves.length; n++) {
    const s = cr(e, n);
    s != null && s.name && t.push({ name: s.name, staffIndices: [n] });
  }
  for (const n of e.parts)
    n.name && n.staffIndices.length >= 2 && t.push({ name: n.name, staffIndices: n.staffIndices });
  return t;
}
function Li(e, t) {
  return e.length * t * nn.labelAvgCharWidthRatio;
}
function lr(e) {
  return e * 4 + (e - 1) * ot.staffGap;
}
function fr(e, t) {
  if (e.glyph === "bracket")
    return X.bracketTop.bBoxNE[0] * t;
  const n = X.brace.bBoxNE[1] - X.brace.bBoxSW[1], s = lr(e.staffIndices.length) / n;
  return X.brace.advance * t * s;
}
function hr(e, t, n, s, i) {
  const o = X.brace, a = o.bBoxNE[1] - o.bBoxSW[1], r = (s - n) / (a * i), c = i * Xe * r, f = s + o.bBoxSW[1] * i * r;
  return e.push({ kind: "glyph", glyph: "brace", x: t, y: f, fontSizePx: c }), t + o.advance * i * r;
}
function dr(e, t, n, s, i) {
  const o = X.bracketTop.bBoxNE[1] * i, a = n + o, r = s - o, c = st.bracketThickness * i;
  return e.push({ kind: "glyph", glyph: "bracketTop", x: t, y: a }), e.push({ kind: "rect", x: t, y: a, width: c, height: Math.max(0, r - a) }), e.push({ kind: "glyph", glyph: "bracketBottom", x: t, y: r }), t + X.bracketTop.bBoxNE[0] * i;
}
function ur(e, t) {
  const n = rr(e);
  let s = 0;
  for (const r of n)
    s += fr(r, t) + nn.columnGap * t;
  const i = nn.labelFontSizeSpaces * t;
  let o = 0;
  for (const r of Ri(e))
    o = Math.max(o, Li(r.name, i));
  const a = o > 0 ? o + nn.labelGap * t : 0;
  return { groups: n, bracketAreaWidth: s, labelColumnWidth: a, labelFontSizePx: i, headerWidth: s + a };
}
function pr(e, t, n, s, i, o) {
  const a = [];
  let r = i;
  for (const c of n.groups) {
    const f = s[c.staffIndices[0]], l = s[c.staffIndices[c.staffIndices.length - 1]] + 4 * t;
    r = (c.glyph === "brace" ? hr : dr)(a, r, f, l, t), r += nn.columnGap * t;
  }
  if (o) {
    const c = i + n.bracketAreaWidth + n.labelColumnWidth - nn.labelGap * t;
    for (const f of Ri(e)) {
      const l = Li(f.name, n.labelFontSizePx), h = s[Math.min(...f.staffIndices)], d = s[Math.max(...f.staffIndices)] + 4 * t, p = f.staffIndices.length === 1 ? h : (h + d) / 2 - 2 * t;
      a.push({
        kind: "text",
        text: f.name,
        x: c - l,
        // Roughly vertically centred on the row: a baseline a little below
        // its own middle line, nudged down further by a fraction of the
        // font size to visually balance the ascenders and descenders a
        // real instrument name mixes (capital initial letter, no
        // descenders, in most names this slice's own demo uses).
        y: p + 2 * t + n.labelFontSizePx * 0.35,
        fontSizePx: n.labelFontSizePx
      });
    }
  }
  return a;
}
function Go(e, t = {}) {
  return Ci(() => mr(e, t));
}
function mr(e, t) {
  var B;
  const n = t.staffSpacePx ?? Ns.staffSpacePx, s = t.paddingPx ?? Ns.paddingPx, i = n * Xe, o = e.staves.length;
  if (o === 0)
    return {
      width: 0,
      height: 0,
      staffSpacePx: n,
      staffTopY: s,
      fontSizePx: i,
      measures: [],
      systems: [],
      partDecorations: []
    };
  const a = e.staves[0].measures.length;
  for (let M = 1; M < o; M++)
    if (e.staves[M].measures.length !== a)
      throw new Error(
        `layoutScore: staff ${M} has ${e.staves[M].measures.length} measures, staff 0 has ${a}. M2 Slice 4's interleaved multi-staff layout decides system membership once for the whole score (see this function's own doc comment), which needs every staff to agree on how many measures it has; a score with genuinely different per-staff measure counts is out of this slice's scope.`
      );
  const r = ur(e, n), c = (M) => M === 0 ? r.headerWidth : r.bracketAreaWidth, f = (M) => t.systemWidthPx === void 0 ? void 0 : t.systemWidthPx - 2 * s - c(M), l = f(0), h = l === void 0 ? null : br(e, n), d = yr(e, h, l, f(1)), p = [], g = [], m = e.staves.map((M, G) => Qi(e, G)), b = [], y = [];
  d.forEach((M, G) => {
    for (const W of M) y[W] = G;
  });
  let v = 0, S = null;
  const w = Vi(e);
  for (let M = 0; M < d.length; M++) {
    const G = d[M], W = M === d.length - 1, Y = gr(
      e,
      G,
      (E, K) => (K === G[0] ? h.first : h.mid)[E][K],
      n,
      f(M),
      W
    ), j = e.staves.map(
      (E, K) => G.map((Q) => {
        const et = E.measures[Q];
        return oo(
          e,
          K,
          et,
          n,
          {
            isSystemFirst: Q === G[0],
            isScoreFirst: Q === 0,
            isLast: Q === E.measures.length - 1
          },
          Y
        );
      })
    ), D = G.map((E, K) => Math.max(...j.map((Q) => Q[K])));
    let I = v, k = v;
    const V = [], O = m.map((E) => Ji(E, G[0], G[G.length - 1]));
    for (let E = 0; E < o; E++) {
      const K = e.staves[E], Q = O[E], et = so(
        E,
        o,
        I,
        n,
        Oi(E, o, (((B = O[E - 1]) == null ? void 0 : B.length) ?? 0) > 0, Q.length > 0)
      );
      V.push(I);
      let H = s + c(M);
      const q = [];
      for (let pt = 0; pt < G.length; pt++) {
        const Jt = G[pt], mn = K.measures[Jt], Zt = e.clefAt(Jt, E), Ie = cs(e, mn, {
          ss: n,
          staffTopY: I,
          startX: H,
          isSystemFirst: Jt === G[0],
          isScoreFirst: Jt === 0,
          isLast: Jt === K.measures.length - 1,
          spacingScale: Y,
          staffIndex: E,
          clef: Zt,
          lines: Ve[Zt],
          columnWidth: D[pt],
          barlineTop: et.top,
          barlineBottom: et.bottom
        });
        q.push(Ie), H = Ie.region.x + Ie.region.width;
      }
      const rt = m[E];
      let Et = null, Ut;
      const Xt = { staffIndex: E, measures: [...q], staffTopY: I, ss: n, systemOf: y, lyrics: Q.length > 0 }, It = Ws(e, Xt);
      if (rt && Q.length > 0) {
        const pt = lc(
          { measures: q, staffTopY: I, ss: n, systemOf: y, index: rt, verses: Q },
          (It == null ? void 0 : It.belowBottom) ?? null
        );
        q.splice(0, q.length, ...pt.measures), Et = pt.bottom, Ut = pt.baseline;
      }
      const Kt = Jr({ ...Xt, measures: q }, It);
      let Yt;
      const $t = E === 0 && Ki(w, G[0], G[G.length - 1]) ? Hi(e, Xt, io(e, Xt), w, It == null ? void 0 : It.aboveTop) : null;
      let Ee = $t === null ? null : $t - st.thinBarlineThickness * n / 2;
      if (E === 0 && It) {
        const pt = [...It.aboveTop.values()];
        It.baselines.above !== null && pt.push(It.baselines.above - Ft.ascent * n), pt.length > 0 && (Ee = Math.min(Ee ?? 1 / 0, ...pt));
      }
      const qt = S === null || Ee === null ? 0 : Math.max(0, S + Rt.systemClearance * n - Ee), Te = qt > 0 ? Kt.map((pt) => si(pt, qt)) : Kt;
      if (qt > 0 && (Ut = Ut === void 0 ? void 0 : Ut + qt, Et = Et === null ? null : Et + qt, I += qt, V[E] = I), $t !== null) {
        Yt = $t + qt;
        const pt = { ...Xt, measures: Te };
        q.splice(
          0,
          q.length,
          ...Te.map((Jt) => sn(Jt, Xi(pt, w, Yt, Jt), I, n))
        );
      } else
        q.splice(0, q.length, ...Te);
      p.push(...q), g.push({
        measureIndices: [...G],
        topY: I,
        spacingScale: Y,
        staffIndex: E,
        ...Ut !== void 0 ? { lyricVerses: Q, lyricBaseline: Ut } : {},
        ...Yt !== void 0 ? { voltaY: Yt } : {}
      });
      const Qt = Math.max(I + 4 * n, ...q.map((pt) => pt.region.y + pt.region.height));
      if (k = Math.max(k, Qt), E < o - 1) {
        I = I + 4 * n + ot.staffGap * n;
        const pt = lt.nextStaffGap + Qr(e, E + 1, G[0], G[G.length - 1], O[E + 1].length > 0);
        Et !== null && (I = Math.max(I, Qt + pt * n));
      }
    }
    b.push(
      ...pr(e, n, r, V, s, M === 0)
    ), S = k, v = k + ot.systemGap * n;
  }
  const T = Math.min(0, ...p.map((M) => M.region.y)), x = s - T, P = p.map((M) => si(M, x)), N = g.map((M) => ({
    ...M,
    topY: M.topY + x,
    ...M.lyricBaseline !== void 0 ? { lyricBaseline: M.lyricBaseline + x } : {},
    ...M.voltaY !== void 0 ? { voltaY: M.voltaY + x } : {}
  })), F = na(b, x), U = Math.max(s * 2, ...P.map((M) => M.region.x + M.region.width + s)), _ = Math.max(
    ...N.map((M) => M.topY + 4 * n),
    ...P.map((M) => M.region.y + M.region.height)
  );
  return {
    width: U,
    height: _ + s,
    staffSpacePx: n,
    staffTopY: N[0].topY,
    fontSizePx: i,
    measures: P,
    systems: N,
    partDecorations: F
  };
}
function gr(e, t, n, s, i, o) {
  if (i === void 0) return 1;
  const a = t.map(
    (c) => e.staves.map((f, l) => {
      const h = f.measures[c];
      let d = 0;
      for (const p of us(e, h, l, co(e, c)).columns) d += p.stretch;
      return { natural: n(l, c), stretch: d * s };
    })
  );
  if (!a.some((c) => c.some((f) => f.stretch > 0))) return 1;
  let r = 1;
  for (let c = 0; c < 32; c++) {
    let f = 0, l = 0;
    for (const d of a) {
      let p = -1 / 0, g = 0;
      for (const m of d) {
        const b = m.natural + (r - 1) * m.stretch;
        (b > p + 1e-9 || Math.abs(b - p) <= 1e-9 && m.stretch > g) && (p = b, g = m.stretch);
      }
      f += p, l += g;
    }
    const h = i - f;
    if (Math.abs(h) < 1e-6 || l <= 0) break;
    r += h / l;
  }
  return o && (r = Math.min(r, 1)), Math.max(r, 0.5);
}
function br(e, t) {
  const n = (i) => e.staves.map(
    (o, a) => o.measures.map(
      (r) => oo(e, a, r, t, {
        isSystemFirst: i,
        isScoreFirst: i && r.index === 0,
        isLast: r.index === o.measures.length - 1
      })
    )
  ), s = e.staves[0].measures.map((i) => {
    let o = 0;
    for (const a of us(e, i, 0, co(e, i.index)).columns) o += a.stretch;
    return o * t;
  });
  return { first: n(!0), mid: n(!1), stretch: s };
}
function yr(e, t, n, s = n) {
  const i = e.staves[0].measures.length, o = Array.from({ length: i }, (h, d) => d);
  if (n === void 0 || t === null) return [o];
  const a = 1 - ot.minCastOffScale, r = (h, d) => Math.max(...h.map((p) => p[d])) - a * t.stretch[d], c = [];
  let f = [], l = 0;
  for (const h of o) {
    const d = r(t.first, h);
    if (f.length === 0) {
      f.push(h), l = d;
      continue;
    }
    const p = r(t.mid, h), g = c.length === 0 ? n : s;
    l + p > g + 1e-6 ? (c.push(f), f = [h], l = d) : (f.push(h), l += p);
  }
  return f.length > 0 && c.push(f), c;
}
function oo(e, t, n, s, i, o) {
  const a = e.clefAt(n.index, t);
  return cs(e, n, {
    ss: s,
    staffTopY: 0,
    startX: 0,
    ...i,
    spacingScale: o,
    staffIndex: t,
    clef: a,
    lines: Ve[a]
  }).region.width;
}
function vr(e, t, n, s) {
  const i = (r, c) => r.map((f) => {
    const l = e.measures.find((h) => h.staffIndex === t && h.index === f);
    return c === "top" ? l.region.y : l.region.y + l.region.height;
  }), o = n[s - 1], a = n[s + 1];
  return {
    top: o ? Math.max(...i(o.measureIndices, "bottom")) : 0,
    bottom: a ? Math.min(...i(a.measureIndices, "top")) : e.height
  };
}
function xr(e, t, n, s = {}, i = 0) {
  return Ci(() => Sr(e, t, n, s, i));
}
function Sr(e, t, n, s, i) {
  var I;
  const o = e.staves[i], a = o == null ? void 0 : o.measures[n], r = t.measures.find((k) => k.staffIndex === i && k.index === n), c = t.systems.filter((k) => k.staffIndex === i), f = c.findIndex((k) => k.measureIndices.includes(n)), l = c[f];
  if (!o || !a || !r || !l) return null;
  const h = e.clefAt(n, i), d = s.staffSpacePx ?? Ns.staffSpacePx, p = Qi(e, i), g = Ji(p, l.measureIndices[0], l.measureIndices[l.measureIndices.length - 1]), m = l.lyricVerses ?? Rs;
  if (g.length !== m.length || g.some((k, V) => k !== m[V])) return null;
  const b = i > 0 ? t.systems.find((k) => k.staffIndex === i - 1 && k.measureIndices.includes(n)) : void 0, y = so(
    i,
    e.staves.length,
    l.topY,
    d,
    Oi(i, e.staves.length, (((I = b == null ? void 0 : b.lyricVerses) == null ? void 0 : I.length) ?? 0) > 0, g.length > 0)
  ), v = {
    isSystemFirst: l.measureIndices[0] === n,
    isScoreFirst: n === 0,
    isLast: n === o.measures.length - 1
  }, S = e.staves.length > 1 ? Math.max(
    ...e.staves.map(
      (k, V) => oo(e, V, k.measures[n], d, v, l.spacingScale)
    )
  ) : void 0;
  for (let k = 0; k < e.staves.length; k++) {
    if (k === i) continue;
    const V = t.measures.find((et) => et.staffIndex === k && et.index === n), O = t.systems.find((et) => et.staffIndex === k && et.measureIndices.includes(n)), E = e.staves[k].measures[n];
    if (!V || !O || !E) return null;
    const K = e.clefAt(n, k), Q = cs(e, E, {
      ss: d,
      staffTopY: O.topY,
      startX: V.region.x,
      ...v,
      isLast: n === e.staves[k].measures.length - 1,
      spacingScale: l.spacingScale,
      staffIndex: k,
      clef: K,
      lines: Ve[K],
      columnWidth: S
    });
    if (Q.notes.length !== V.notes.length || Q.notes.some((et, H) => Math.abs(et.bounds.x - V.notes[H].bounds.x) > 1e-3)) return null;
  }
  const w = cs(e, a, {
    ss: d,
    staffTopY: l.topY,
    startX: r.region.x,
    ...v,
    spacingScale: l.spacingScale,
    staffIndex: i,
    clef: h,
    lines: Ve[h],
    columnWidth: S,
    barlineTop: y.top,
    barlineBottom: y.bottom
  }), T = l.measureIndices[0], x = l.measureIndices[l.measureIndices.length - 1], P = [];
  c.forEach((k, V) => {
    for (const O of k.measureIndices) P[O] = V;
  });
  const N = (k) => t.measures.find((V) => V.staffIndex === i && V.index === k), F = {
    staffIndex: i,
    measures: l.measureIndices.map(N),
    staffTopY: l.topY,
    ss: d,
    systemOf: P,
    lyrics: g.length > 0
  }, U = { ...F, measures: l.measureIndices.map((k) => k === n ? w : N(k)) }, _ = Ws(e, F), B = Ws(e, U);
  if (_ === null != (B === null)) return null;
  if (_ && B) {
    const k = (V, O) => V === null || O === null ? V !== O : Math.abs(V - O) > 1e-3;
    if (k(_.baselines.above, B.baselines.above) || k(_.baselines.below, B.baselines.below))
      return null;
    for (const V of l.measureIndices)
      if (V !== n && !ei(_.ops.get(V) ?? [], B.ops.get(V) ?? []))
        return null;
  }
  let M = w;
  if (p && g.length > 0 && l.lyricBaseline !== void 0) {
    const k = { staffIndex: i, measures: F.measures, staffTopY: l.topY, ss: d, systemOf: P, index: p, verses: g }, V = { ...k, measures: U.measures }, O = Zi(V, (B == null ? void 0 : B.belowBottom) ?? null);
    if (Math.abs(O - l.lyricBaseline) > 1e-3) return null;
    for (const E of l.measureIndices) {
      if (E === n) continue;
      const K = Kn(k, O, N(E)), Q = Kn(V, O, N(E));
      if (!ei(K, Q)) return null;
    }
    M = sn(w, Kn(V, O, w), l.topY, d);
  }
  B && (M = sn(M, B.ops.get(n) ?? [], l.topY, d));
  const G = i === 0 ? Vi(e) : [], W = Ki(G, T, x);
  if (W !== (l.voltaY !== void 0)) return null;
  if (W) {
    const k = { ...U, measures: l.measureIndices.map((O) => O === n ? M : N(O)) }, V = Hi(e, k, io(e, k), G, B == null ? void 0 : B.aboveTop);
    if (V === null || Math.abs(V - l.voltaY) > 1e-3) return null;
    M = sn(M, Xi(k, G, V, M), l.topY, d);
  }
  const Y = Math.abs(M.region.width - r.region.width) > 1e-3, j = vr(t, i, c, f), D = M.region.y < j.top || M.region.y + M.region.height > j.bottom;
  return Y || D ? null : {
    ...t,
    measures: t.measures.map(
      (k) => k.staffIndex === i && k.index === n ? M : k
    )
  };
}
function cs(e, t, n) {
  var mo, go;
  const { ss: s, staffTopY: i, startX: o } = n, a = [], r = [], c = e.keyFifthsAt(t.index, n.staffIndex), f = e.timeAt(t.index, n.staffIndex), l = t.index > 0 && c !== e.keyFifthsAt(t.index - 1, n.staffIndex), h = t.index > 0 && !kr(f, e.timeAt(t.index - 1, n.staffIndex)), d = t.index > 0 && n.clef !== e.clefAtEnd(t.index - 1, n.staffIndex);
  let p = o;
  if (n.isSystemFirst ? (p += ot.headerGap * s, p = ks(a, p, n), p = zo(
    a,
    p,
    c,
    n,
    l ? e.keyFifthsAt(t.index - 1, n.staffIndex) : void 0
  ), (n.isScoreFirst || h) && (p = Uo(a, p, f.beats, f.beatType, n))) : (d || l || h) && (p += ot.headerGap * s, d && (p = ks(a, p, n, Do)), l && (p = zo(a, p, c, n, e.keyFifthsAt(t.index - 1, n.staffIndex))), h && (p = Uo(a, p, f.beats, f.beatType, n))), n.isSystemFirst && n.staffIndex === 0 && t.index > 0) {
    const A = qn(a, o, 0, i, s).y;
    a.push({
      kind: "text",
      text: t.number ?? String(t.index + 1),
      x: o,
      y: A - Ro.gapSpaces * s,
      fontSizePx: Ro.fontSpaces * s
    });
  }
  t.startBarline === "repeatStart" && (p = wr(a, p, i, n));
  const g = p, m = co(e, t.index), b = us(e, t, n.staffIndex, m);
  p += (ot.measureLeadIn + Math.max((m == null ? void 0 : m.lead) ?? 0, b.lead)) * s;
  const y = sr(t.notes), v = Pi(t.notes), S = y.size > 1, w = ds(t.notes), T = /* @__PURE__ */ new Map();
  for (const A of Lt(t.notes)) {
    if (!Qs(A)) continue;
    const L = kt(w.get(A[0].id) ?? 0);
    for (const nt of A) {
      if (!nt.pitch) continue;
      const dt = it(nt.pitch), ft = T.get(L);
      ft ? (ft.low = Math.min(ft.low, dt), ft.high = Math.max(ft.high, dt)) : T.set(L, { low: dt, high: dt, drawn: !1 });
    }
  }
  const x = /* @__PURE__ */ new Map(), P = [];
  for (const A of hs(t.notes)) {
    let L;
    A.principal ? (x.set(A.principal.id, A), L = w.get(A.principal.id) ?? 0) : (P.push(A), L = (v.get(A.voice) ?? []).reduce((nt, dt) => nt + dt[0].durationWholes, 0));
    for (const nt of A.notes) w.set(nt.id, L);
  }
  const N = t.clefChanges, F = /* @__PURE__ */ new Map([[n.clef, n]]), U = (A) => {
    let L = F.get(A);
    return L || (L = { ...n, clef: A, lines: Ve[A] }, F.set(A, L)), L;
  }, _ = (A) => {
    for (let L = N.length - 1; L >= 0; L--)
      if (kt(N[L].onset) <= kt(A)) return N[L].clef;
    return n.clef;
  }, B = (A) => N.length === 0 ? n.lines.middleLine : Ve[_(w.get(A.id) ?? 0)].middleLine, M = /* @__PURE__ */ new Set(), G = /* @__PURE__ */ new Map();
  for (const A of t.notes) {
    const L = e.crossStaffBeamContaining(A.id);
    if (!L) continue;
    M.add(A.id);
    const nt = G.get(L) ?? [];
    nt.push(A), G.set(L, nt);
  }
  const W = [];
  for (const [A, L] of y)
    W.push(
      ...zi(
        L,
        f,
        N.length === 0 ? n.lines.middleLine : B,
        ps(A, S),
        M
      )
    );
  const Y = [];
  for (const [A, L] of G) {
    const nt = n.staffIndex === A.staffIndices[0], dt = nt ? "down" : "up", ft = so(n.staffIndex, e.staves.length, n.staffTopY, n.ss), J = nt ? ft.bottom : ft.top;
    Y.push({ group: { notes: L, direction: dt }, beamY: J });
  }
  const j = /* @__PURE__ */ new Map();
  for (const A of W)
    for (const L of A.notes) j.set(L.id, A);
  for (const { group: A } of Y)
    for (const L of A.notes) j.set(L.id, A);
  const D = /* @__PURE__ */ new Map(), I = /* @__PURE__ */ new Map(), k = /* @__PURE__ */ new Map(), V = [], O = n.spacingScale ?? 1, { columns: E } = b, K = /* @__PURE__ */ new Map();
  let Q = 0;
  for (const A of E)
    K.set(kt(A.onset), Q), Q += (A.width + (O - 1) * A.stretch) * s;
  const et = [...y.keys()].sort((A, L) => A - L), H = /* @__PURE__ */ new Map(), q = /* @__PURE__ */ new Map(), rt = /* @__PURE__ */ new Map(), Et = /* @__PURE__ */ new Map();
  for (const A of et)
    H.set(A, 0), q.set(A, /* @__PURE__ */ new Map()), rt.set(A, null), Et.set(A, 0);
  let Ut = /* @__PURE__ */ new Map(), Xt = /* @__PURE__ */ new Map(), It = 0, Kt = n, Yt = 0, $t = 0;
  const Ee = (A, L) => {
    let nt = null;
    for (; It < N.length && kt(N[It].onset) <= kt(A); )
      nt = N[It++].clef;
    if (nt === null || nt === Kt.clef) return;
    Kt = U(nt);
    const dt = L + _o * s, J = ks(a, dt, Kt, Do) - ot.headerGap * s;
    Yt += J + _o * s - L;
    for (const Tt of et) {
      const At = rt.get(Tt);
      rt.set(Tt, At === null ? J : Math.max(At, J));
    }
  }, qt = [];
  for (const A of E) {
    const L = kt(A.onset);
    It < N.length && Ee(
      A.onset,
      p + K.get(L) + Yt + $t + Math.max(0, ...Et.values())
    );
    const nt = /* @__PURE__ */ new Map();
    let dt = 0;
    for (const J of et) {
      const Tt = (mo = v.get(J)) == null ? void 0 : mo[H.get(J)], At = Tt && kt(w.get(Tt[0].id)) === L ? x.get(Tt[0].id) : void 0;
      if (!At) continue;
      const ut = Ho(At, c, q.get(J), Vn(J, S), s);
      nt.set(J, ut), dt = Math.max(dt, ut.widthPx);
    }
    $t += dt, Xt = /* @__PURE__ */ new Map();
    let ft = null;
    for (const J of et) {
      const Tt = v.get(J) ?? [], At = H.get(J), ut = Tt[At], xt = ut == null ? void 0 : ut[0];
      if (!ut || !xt || kt(w.get(xt.id)) !== L) continue;
      H.set(J, At + 1);
      const gn = Et.get(J), de = p + K.get(L) + Yt + $t + gn, Ke = nt.get(J);
      if (Ke) {
        const Gt = Xo(
          a,
          r,
          D,
          Ke,
          de - Ke.widthPx,
          Vn(J, S),
          Kt
        ), Un = rt.get(J);
        rt.set(J, Un === null ? Gt : Math.max(Un, Gt));
      }
      const qe = [...Xt.values()].flat(), ue = [...Ut.values()].flat();
      let Qe = 0;
      for (const Gt of ut)
        Gt.pitch !== null && (Qe = Math.max(
          Qe,
          Pr(
            it(Gt.pitch),
            He[xt.value],
            de,
            qe,
            ue,
            s
          )
        ));
      const vs = de + Qe, Pa = ((go = j.get(xt.id)) == null ? void 0 : go.direction) ?? null, xs = rt.get(J), Fa = xs === null ? ft : ft === null ? xs : Math.max(xs, ft), bo = a.length, Wa = r.length, jt = Ir(
        a,
        r,
        vs,
        ut,
        c,
        Kt,
        Pa,
        q.get(J),
        Fa,
        S,
        T.get(kt(w.get(xt.id) ?? 0))
      );
      if (xt.isMeasureRest && qt.push({ opStart: bo, opEnd: a.length, noteIndex: Wa }), (Js(ut).length > 0 || Zs(ut) !== null) && V.push({
        chord: ut,
        heads: jt.heads.map(([, Gt]) => Gt),
        stem: jt.stem,
        ctx: Kt,
        restOp: xt.pitch === null ? bo : null
      }), Et.set(J, gn + Qe + jt.collisionShift), rt.set(J, jt.inkRight), ft = ft === null ? jt.inkRight : Math.max(ft, jt.inkRight), jt.heads.length > 0) {
        for (const [Gt, Un] of jt.heads) D.set(Gt, Un);
        Xt.set(
          J,
          jt.heads.map(([, Gt]) => ({ d: Gt.d, noteX: Gt.noteX }))
        );
      }
      jt.stem && I.set(xt.id, jt.stem);
    }
    Ut = Xt;
  }
  const Te = Et;
  if (It < N.length && Ee(
    Number.POSITIVE_INFINITY,
    p + Q + Yt + $t + Math.max(0, ...Te.values())
  ), P.length > 0) {
    const A = p + Q + Yt + $t + Math.max(0, ...Te.values());
    let L = 0;
    for (const nt of P) {
      const dt = Vn(nt.voice, S), ft = q.get(nt.voice) ?? /* @__PURE__ */ new Map(), J = Ho(nt, c, ft, dt, s);
      Xo(a, r, D, J, A, dt, Kt), L = Math.max(L, J.widthPx);
    }
    $t += L;
  }
  for (const A of W) qo(a, A, I, n, void 0, k);
  for (const { group: A, beamY: L } of Y) qo(a, A, I, n, L, k);
  p += Q + Yt + $t + Math.max(0, ...Te.values()), p += ot.measureTrailOut * s, p = Math.max(p, fc(t, r, s));
  const Qt = e.endBarlineAt(t.index, n.staffIndex), pt = st.thinBarlineThickness * s, Jt = st.thickBarlineThickness * s, mn = Qt === "repeatStart" ? 0 : Qt === "final" || Qt === "repeatEnd" ? Jt : pt;
  if (n.columnWidth !== void 0) {
    const A = p + mn - o;
    A < n.columnWidth && (p += n.columnWidth - A);
  }
  const Zt = p, Ie = Zt + mn - o;
  Tr(a, r, qt, g, Zt, s);
  const ho = /* @__PURE__ */ new Map();
  for (const A of V) {
    const L = A.restOp === null ? void 0 : a[A.restOp];
    L && L.kind === "glyph" && ho.set(A, Ls(L.glyph, L.x, L.y, s));
  }
  const zn = n.barlineTop ?? i, uo = n.barlineBottom ?? i + 4 * s, Aa = a.length, po = st.staffLineThickness * s;
  for (let A = 0; A < 5; A++)
    a.unshift({
      kind: "rect",
      x: o,
      y: i + A * s - po / 2,
      width: Ie,
      height: po
    });
  if ((Qt === "final" || Qt === "double") && a.push({
    kind: "rect",
    x: Zt - st.barlineSeparation * s - pt,
    y: zn,
    width: pt,
    height: uo - zn
  }), Qt === "repeatEnd") {
    const A = X.repeatDot.advance * s;
    $i(a, Zt - st.barlineSeparation * s - A, n);
  }
  Qt !== "repeatStart" && a.push({
    kind: "rect",
    x: Zt,
    y: zn,
    width: mn,
    height: uo - zn
  });
  const Ca = new Set(a.slice(Aa + 5));
  for (const A of t.notes) {
    const L = D.get(A.id);
    if (!L) continue;
    const nt = s * (L.scale ?? 1);
    if (A.tiedToId !== null) {
      const ft = Jo(L, B(A)), J = L.noteX + (X[L.headGlyph].bBoxNE[0] + Ms) * nt, Tt = e.measureOfNote(A.tiedToId) === t ? D.get(A.tiedToId) : void 0;
      if (Tt) {
        const At = s * (Tt.scale ?? 1), ut = Tt.noteX + (X[Tt.headGlyph].bBoxSW[0] - Ms) * At;
        Ts(a, J, L.y, ut, Tt.y, ft, A.id, n);
      } else
        Ts(a, J, L.y, Zt, L.y, ft, A.id, n);
    }
    const dt = e.tiedFromNote(A.id);
    if (dt && e.measureOfNote(dt.id) !== t) {
      const ft = Jo(L, B(A)), J = L.noteX + (X[L.headGlyph].bBoxSW[0] - Ms) * nt;
      Ts(a, o, L.y, J, L.y, ft, dt.id, n);
    }
  }
  for (const A of e.slurs) {
    const L = e.measureOfNote(A.startNoteId), nt = e.measureOfNote(A.endNoteId);
    if (!L || !nt || t.staffIndex !== L.staffIndex || t.index < L.index || t.index > nt.index) continue;
    const dt = jr(e, A, L.staffIndex), ft = dt[0], J = (ft == null ? void 0 : ft.grace) != null ? ft : void 0, Tt = J ? Vn(J.voice, S) : un(
      dt.flatMap((ue) => ue.pitch ? [it(ue.pitch)] : []),
      n.lines.middleLine
    ) === "up";
    let At = Vr(dt, Tt, n);
    const ut = t.index === L.index ? D.get(A.startNoteId) : void 0, xt = t.index === nt.index ? D.get(A.endNoteId) : void 0;
    let gn = ut ? ut.noteX + (X[ut.headGlyph].bBoxNE[0] + Lo) * s * (ut.scale ?? 1) : o, de = ut ? ut.y : At, Ke = xt ? xt.noteX + (X[xt.headGlyph].bBoxSW[0] - Lo * (xt.scale ?? 1)) * s : Zt, qe = xt ? xt.y : At;
    if (J && ut && xt) {
      const ue = Tt ? 1 : -1, Qe = X[ut.headGlyph].advance * s * (ut.scale ?? 1), vs = X[xt.headGlyph].advance * s * (xt.scale ?? 1);
      gn = ut.noteX + Qe / 2, de = ut.y + ue * 0.5 * s, Ke = xt.noteX + vs * 0.4, qe = xt.y + ue * 0.7 * s, At = (Tt ? Math.max(de, qe) : Math.min(de, qe)) + ue * 0.6 * s;
    }
    Hr(a, gn, de, Ke, qe, At, A.startNoteId, n);
  }
  if (V.length > 0) {
    const A = a.filter((L) => L.kind === "curve");
    for (const L of V) {
      const nt = L.chord[0], dt = L.stem === null ? null : k.get(nt.id) ?? L.stem.nearY + (L.heads[0].up ? -je * s : je * s);
      Yr(a, L, ho.get(L) ?? null, dt, A, S);
    }
  }
  const ys = qn(
    a.filter((A) => !Ca.has(A)),
    o,
    Ie,
    i,
    s
  );
  return {
    index: t.index,
    staffIndex: n.staffIndex,
    region: qn(a, o, Ie, i, s),
    ops: a,
    notes: r,
    inkExtent: { top: ys.y + Tn, bottom: ys.y + ys.height - Tn }
  };
}
function wr(e, t, n, s) {
  const { ss: i } = s, o = st.thickBarlineThickness * i, a = st.barlineSeparation * i;
  e.push({ kind: "rect", x: t, y: n, width: o, height: 4 * i });
  const r = t + o + a;
  return $i(e, r, s), r + X.repeatDot.advance * i + a;
}
function $i(e, t, n) {
  e.push({ kind: "glyph", glyph: "repeatDot", x: t, y: wt(n.lines.middleLine + 1, n) }), e.push({ kind: "glyph", glyph: "repeatDot", x: t, y: wt(n.lines.middleLine - 1, n) });
}
function ks(e, t, n, s = 1) {
  const i = s === 1 ? {} : { fontSizePx: n.ss * Xe * s };
  if (n.clef === "bass") {
    const r = wt(it({ step: "F", octave: 3 }), n);
    return e.push({ kind: "glyph", glyph: "fClef", x: t, y: r, ...i }), t + (X.fClef.advance * s + ot.headerGap) * n.ss;
  }
  if (n.clef === "alto" || n.clef === "tenor") {
    const r = wt(it({ step: "C", octave: 4 }), n);
    return e.push({ kind: "glyph", glyph: "cClef", x: t, y: r, ...i }), t + (X.cClef.advance * s + ot.headerGap) * n.ss;
  }
  const o = n.clef === "treble8" ? "gClef8vb" : "gClef", a = wt(it({ step: "G", octave: 4 }), n);
  return e.push({ kind: "glyph", glyph: o, x: t, y: a, ...i }), t + (X[o].advance * s + ot.headerGap) * n.ss;
}
const Do = 0.75, _o = 0.4;
function zo(e, t, n, s, i) {
  let o = t;
  if (i !== void 0 && i !== n && (o = Mr(e, o, i, n, s)), n === 0) return o;
  const a = n > 0 ? "sharp" : "flat", r = a === "sharp" ? "accidentalSharp" : "accidentalFlat", c = Cs[a], f = Fi[s.clef][a];
  for (let l = 0; l < Math.min(Math.abs(n), 7); l++) {
    const h = c[l], d = f[l];
    if (h === void 0 || d === void 0) break;
    o = ta(e, r, o, wt(it({ step: h, octave: d }), s), s);
  }
  return o + ot.headerGap * s.ss;
}
function Mr(e, t, n, s, i) {
  const o = n > 0 ? "sharp" : "flat", a = Cs[o].slice(0, Math.min(Math.abs(n), 7)), r = Fi[i.clef][o], c = s > 0 ? "sharp" : "flat", f = s === 0 ? /* @__PURE__ */ new Set() : new Set(Cs[c].slice(0, Math.min(Math.abs(s), 7)));
  let l = t;
  for (let h = 0; h < a.length; h++) {
    const d = a[h];
    if (c === o && f.has(d)) continue;
    const p = r[h];
    l = ta(
      e,
      "accidentalNatural",
      l,
      wt(it({ step: d, octave: p }), i),
      i
    );
  }
  return l > t ? l + ot.headerGap * i.ss : l;
}
function kr(e, t) {
  return e.beats === t.beats && e.beatType === t.beatType;
}
function Uo(e, t, n, s, i) {
  const { ss: o, staffTopY: a } = i, r = Yo(n), c = Yo(s), f = (h) => h.reduce((d, p) => d + X[p].advance * o, 0), l = Math.max(f(r), f(c));
  for (const [h, d] of [
    [r, a + o],
    [c, a + 3 * o]
  ]) {
    let p = t + (l - f(h)) / 2;
    for (const g of h)
      e.push({ kind: "glyph", glyph: g, x: p, y: d }), p += X[g].advance * o;
  }
  return t + l + ot.headerGap * o;
}
function Yo(e) {
  return String(Math.max(0, Math.trunc(e))).split("").map((t) => ir[Number(t)] ?? "timeSig0");
}
function ps(e, t) {
  if (t)
    return e % 2 === 1 ? "up" : "down";
}
const jo = 2;
function Er(e, t) {
  return t ? e % 2 === 1 ? -jo * Math.ceil(e / 2) : jo * (e / 2) : 0;
}
function Tr(e, t, n, s, i, o) {
  const { bBoxSW: a, bBoxNE: r } = X.restWhole;
  for (const c of n) {
    const f = e[c.opStart];
    if (!f || f.kind !== "glyph") continue;
    const l = f.x + (a[0] + r[0]) / 2 * o, h = (s + i) / 2 - l;
    for (let p = c.opStart; p < c.opEnd; p++) {
      const g = e[p];
      e[p] = g.kind === "curve" ? { ...g, x0: g.x0 + h, cx0: g.cx0 + h, cx1: g.cx1 + h, x1: g.x1 + h } : { ...g, x: g.x + h };
    }
    const d = t[c.noteIndex];
    d && (t[c.noteIndex] = { ...d, bounds: { ...d.bounds, x: d.bounds.x + h } });
  }
}
function Ir(e, t, n, s, i, o, a, r, c, f, l) {
  var et;
  const { ss: h } = o, d = s[0], p = a !== null;
  if (d.pitch === null) {
    const H = d, q = no[H.value], rt = o.staffTopY + (H.value === "whole" ? 1 : 2) * h + Er(H.voice, f) * h;
    return e.push({ kind: "glyph", glyph: q, x: n, y: rt, noteId: H.id }), Di(e, n + X[q].advance * h, rt, !1, H.dots, o), t.push({ id: H.id, bounds: Ls(q, n, rt, h, 0.25) }), {
      heads: [],
      stem: null,
      inkRight: n + X[q].bBoxNE[0] * h,
      collisionShift: 0
    };
  }
  const g = s.flatMap((H) => H.pitch ? [{ note: H, pitch: H.pitch, d: it(H.pitch) }] : []).sort((H, q) => H.d - q.d), m = g.map((H) => H.d), b = g[0], y = g[g.length - 1], v = He[d.value], S = X[v].advance * h, w = Ps(d.value), T = p ? a === "up" : un(m, o.lines.middleLine, ps(d.voice, f)) === "up", x = Nr(m, T), P = x.some(Boolean), N = S - st.stemThickness * h, { accidentals: F, columns: U, widthSpaces: _ } = Gi(g, i, r), B = U.map(
    (H) => Math.max(...H.map((q) => X[q.glyph].advance * h))
  ), M = _ * h, G = Qs(s), W = M + (G ? fe.room * h : 0);
  let Y = 0;
  if ((F.length > 0 || G) && c !== null) {
    const H = ot.minAccidentalClearance * h - (n - W - c);
    H > 0 && (Y = H);
  }
  const j = n + Y, D = j + (P && !T ? N : 0), I = (H) => x[H] ? T ? D + N : D - N : D;
  let k = j - ot.accidentalGap * h;
  if (U.forEach((H, q) => {
    for (const rt of H) {
      const Et = k - X[rt.glyph].advance * h;
      e.push({ kind: "glyph", glyph: rt.glyph, x: Et, y: wt(rt.d, o), noteId: rt.noteId });
    }
    k -= B[q] + ot.accidentalColumnGap * h;
  }), G && !(l != null && l.drawn)) {
    const H = j - W + fe.width / 2 * h, q = Math.max(y.d, (l == null ? void 0 : l.high) ?? y.d), rt = Math.min(b.d, (l == null ? void 0 : l.low) ?? b.d);
    Br(e, H, wt(q, o) - fe.overshoot * h, wt(rt, o) + fe.overshoot * h, h, d.id), l && (l.drawn = !0);
  }
  g.forEach((H, q) => {
    e.push({ kind: "glyph", glyph: v, x: I(q), y: wt(H.d, o), noteId: H.note.id });
  }), Wr(
    e,
    g.map((H, q) => ({ d: H.d, x: I(q), noteId: H.note.id })),
    S,
    o
  );
  const V = Math.max(...g.map((H, q) => I(q))) + S;
  Fr(e, V, m, d.dots, o);
  let O = null;
  if (w) {
    const H = kn(v).anchors, q = T ? H.stemUpSE : H.stemDownNW, rt = _i(v, D, T, h);
    if (q && rt) {
      const Et = T ? b : y, Ut = T ? y : b;
      O = {
        left: rt.left,
        attachY: wt(Et.d, o) - q[1] * h,
        nearY: wt(Ut.d, o)
      }, p || Or(e, O, d.value, d.id, o, T);
    }
  }
  const E = w ? T : null, K = g.map((H, q) => {
    let rt;
    if (g.length > 1) {
      const Et = (g.length - 1) / 2;
      rt = q < Et ? !0 : q > Et ? !1 : T;
    }
    return [
      H.note.id,
      { noteX: I(q), y: wt(H.d, o), headGlyph: v, d: H.d, up: E, tieBelow: rt }
    ];
  });
  for (const H of s) {
    const q = (et = K.find(([rt]) => rt === H.id)) == null ? void 0 : et[1];
    q && t.push({ id: H.id, bounds: Ls(v, q.noteX, q.y, h, 0.3) });
  }
  let Q = Math.max(...g.map((H, q) => I(q) + X[v].bBoxNE[0] * h));
  return (y.d >= o.lines.topLine + 2 || b.d <= o.lines.bottomLine - 2) && (Q = Math.max(Q, V + st.legerLineExtension * h)), O && (Q = Math.max(Q, O.left + st.stemThickness * h)), {
    heads: K,
    stem: O,
    inkRight: Q,
    collisionShift: Y
  };
}
const fe = {
  /** The wave's full width, crest to crest. */
  width: 0.55,
  /** Everything the line takes left of the chord's leftmost ink. */
  room: 0.8,
  /** One crest to the next trough. */
  halfWave: 0.5,
  /** How far past the outer heads' centres the line reaches. */
  overshoot: 0.6,
  thickness: 0.15
};
function Br(e, t, n, s, i, o) {
  const a = fe.halfWave * i, r = Math.max(2, Math.ceil((s - n) / a)), c = (fe.width - fe.thickness) / 2 * (4 / 3) * i;
  for (let f = 0; f < r; f++) {
    const l = n + f * a, h = f % 2 === 0 ? 1 : -1;
    e.push({
      kind: "curve",
      x0: t,
      y0: l,
      cx0: t + h * c,
      cy0: l + a / 3,
      cx1: t + h * c,
      cy1: l + 2 * a / 3,
      x1: t,
      y1: l + a,
      thickness: fe.thickness * i,
      noteId: o
    });
  }
}
function Nr(e, t) {
  const n = e.map(() => !1);
  if (t)
    for (let s = 1; s < e.length; s++)
      e[s] - e[s - 1] === 1 && !n[s - 1] && (n[s] = !0);
  else
    for (let s = e.length - 2; s >= 0; s--)
      e[s + 1] - e[s] === 1 && !n[s + 1] && (n[s] = !0);
  return n;
}
function Gi(e, t, n) {
  const s = [];
  for (const a of e) {
    const r = n.get(a.pitch.step) ?? xi(t, a.pitch.step);
    a.pitch.alter !== r && s.push({
      d: a.d,
      glyph: Wi[String(ea(a.pitch.alter))],
      noteId: a.note.id
    });
  }
  for (const a of s) {
    const r = e.find((c) => c.note.id === a.noteId);
    n.set(r.pitch.step, r.pitch.alter);
  }
  const i = Cr(s), o = i.length === 0 ? 0 : i.reduce((a, r) => a + Math.max(...r.map((c) => X[c.glyph].advance)), 0) + (i.length - 1) * ot.accidentalColumnGap + ot.accidentalGap;
  return { accidentals: s, columns: i, widthSpaces: o };
}
const Ar = 6;
function Cr(e) {
  const t = [...e].sort((i, o) => o.d - i.d), n = [];
  for (let i = 0, o = t.length - 1; i <= o; i++, o--)
    n.push(t[i]), o !== i && n.push(t[o]);
  const s = [];
  for (const i of n) {
    const o = s.find(
      (a) => a.every((r) => Math.abs(r.d - i.d) >= Ar)
    );
    o ? o.push(i) : s.push([i]);
  }
  return s;
}
function Pr(e, t, n, s, i, o) {
  const a = X[t].advance * o;
  let r = 0;
  for (const c of [...s, ...i]) {
    if (Math.abs(c.d - e) !== 1) continue;
    const f = n - c.noteX;
    f < a && (r = Math.max(r, a - f));
  }
  return r;
}
function Di(e, t, n, s, i, o) {
  if (i === 0) return;
  const { ss: a } = o, r = n, c = X.augmentationDot.advance * a;
  let f = t + ot.dotGap * a;
  for (let l = 0; l < i; l++)
    e.push({ kind: "glyph", glyph: "augmentationDot", x: f, y: r }), f += c + ot.dotSpacing * a;
}
function Fr(e, t, n, s, i) {
  if (s === 0) return;
  const o = /* @__PURE__ */ new Set();
  for (const a of [...n].sort((r, c) => c - r)) {
    const r = (a - i.lines.bottomLine) % 2 === 0;
    let c = r ? a + 1 : a;
    o.has(c) && r && (c = a - 1), !o.has(c) && (o.add(c), Di(e, t, wt(c, i), !1, s, i));
  }
}
function Wr(e, t, n, s) {
  const { ss: i } = s, o = st.legerLineExtension * i, a = st.legerLineThickness * i, r = (l, h, d) => {
    const p = Math.min(...h.map((m) => m.x)), g = Math.max(...h.map((m) => m.x)) + n;
    e.push({
      kind: "rect",
      x: p - o,
      y: wt(l, s) - a / 2,
      width: g - p + o * 2,
      height: a,
      noteId: d
    });
  }, c = t.reduce((l, h) => h.d > l.d ? h : l), f = t.reduce((l, h) => h.d < l.d ? h : l);
  for (let l = s.lines.topLine + 2; l <= c.d; l += 2)
    r(l, t.filter((h) => h.d >= l), c.noteId);
  for (let l = s.lines.bottomLine - 2; l >= f.d; l -= 2)
    r(l, t.filter((h) => h.d <= l), f.noteId);
}
function Or(e, t, n, s, i, o) {
  const { ss: a } = i, r = st.stemThickness * a, c = t.nearY + (o ? -je * a : je * a);
  e.push({
    kind: "rect",
    x: t.left,
    y: Math.min(t.attachY, c),
    width: r,
    height: Math.abs(c - t.attachY),
    noteId: s
  });
  const f = En[n];
  if (!f) return;
  const l = o ? f.up : f.down, h = kn(l).anchors[o ? "stemUpNW" : "stemDownSW"];
  h && e.push({
    kind: "glyph",
    glyph: l,
    x: t.left - h[0] * a,
    y: c + h[1] * a,
    noteId: s
  });
}
const Mn = 0.65, Vo = je, Rr = 0.3, Lr = 0.55;
function Vn(e, t) {
  return ps(e, t) !== "down";
}
function Ho(e, t, n, s, i) {
  const o = Mn * i, a = (d) => d.value in En, r = [];
  let c = [];
  e.notes.forEach((d, p) => {
    if (a(d)) {
      c.push(p);
      return;
    }
    c.length >= 2 && r.push(c), c = [];
  }), c.length >= 2 && r.push(c);
  const f = new Set(r.flat()), l = [];
  let h = 0;
  return e.notes.forEach((d, p) => {
    const g = d.pitch, m = n.get(g.step) ?? xi(t, g.step), b = g.alter === m ? null : Wi[String(ea(g.alter))];
    p > 0 && (h += Rr * i), b && (h += (X[b].advance + ot.accidentalGap) * o);
    const y = He[d.value];
    l.push({ note: d, d: it(g), accidental: b, headX: h }), h += X[y].advance * o;
    const v = En[d.value];
    s && v && !f.has(p) && (h += Math.max(0, X[v.up].bBoxNE[0]) * o);
  }), { run: e, graces: l, beamGroups: r, widthPx: h + Lr * i };
}
function Xo(e, t, n, s, i, o, a) {
  const { ss: r } = a, c = Mn * r, f = { fontSizePx: r * Xe * Mn }, l = st.stemThickness * c;
  let h = i;
  const d = [];
  for (const y of s.graces) {
    const { note: v, d: S } = y, w = He[v.value], T = i + y.headX, x = wt(S, a), P = X[w].advance * c;
    if (y.accidental) {
      const _ = T - (ot.accidentalGap + X[y.accidental].advance) * c;
      e.push({ kind: "glyph", glyph: y.accidental, x: _, y: x, noteId: v.id, ...f });
    }
    e.push({ kind: "glyph", glyph: w, x: T, y: x, noteId: v.id, ...f });
    const N = st.legerLineExtension * c, F = st.legerLineThickness * r, U = (_) => e.push({
      kind: "rect",
      x: T - N,
      y: wt(_, a) - F / 2,
      width: P + 2 * N,
      height: F,
      noteId: v.id
    });
    for (let _ = a.lines.topLine + 2; _ <= S; _ += 2) U(_);
    for (let _ = a.lines.bottomLine - 2; _ >= S; _ -= 2) U(_);
    if (h = Math.max(h, T + X[w].bBoxNE[0] * c), (S >= a.lines.topLine + 2 || S <= a.lines.bottomLine - 2) && (h = Math.max(h, T + P + N)), Ps(v.value)) {
      const _ = kn(w).anchors[o ? "stemUpSE" : "stemDownNW"], B = _i(w, T, o, c);
      _ && B && d.push({ left: B.left, attachY: x - _[1] * c, headY: x, note: v });
    }
    n.set(v.id, { noteX: T, y: x, headGlyph: w, d: S, up: Ps(v.value) ? o : null, scale: Mn }), t.push({ id: v.id, bounds: $r(w, T, x, c, 0.3 * r) });
  }
  const p = (y) => d.find((v) => v.note === y), g = (y) => y + (o ? -Vo * c : Vo * c), m = (y, v) => {
    e.push({
      kind: "rect",
      x: y.left,
      y: Math.min(y.attachY, v),
      width: l,
      height: Math.abs(v - y.attachY),
      noteId: y.note.id
    }), h = Math.max(h, y.left + l);
  }, b = new Set(s.beamGroups.flat().map((y) => s.graces[y].note));
  for (const y of d) {
    if (b.has(y.note)) continue;
    const v = g(y.headY);
    m(y, v);
    const S = En[y.note.value];
    if (S) {
      const w = o ? S.up : S.down, T = kn(w).anchors[o ? "stemUpNW" : "stemDownSW"];
      if (T) {
        const x = y.left - T[0] * c;
        e.push({ kind: "glyph", glyph: w, x, y: v + T[1] * c, noteId: y.note.id, ...f }), h = Math.max(h, x + X[w].bBoxNE[0] * c);
      }
    }
    y.note.grace.slash && Ko(e, y.left + l / 2, v, o, y.note.id, a);
  }
  for (const y of s.beamGroups) {
    const v = y.flatMap((F) => {
      const U = p(s.graces[F].note);
      return U ? [U] : [];
    });
    if (v.length < 2) continue;
    const S = o ? Math.min(...v.map((F) => g(F.headY))) : Math.max(...v.map((F) => g(F.headY)));
    for (const F of v) m(F, S);
    const w = st.beamThickness * c, T = (st.beamThickness + st.beamSpacing) * c, x = (F) => Fs[F.value] ?? 1, P = Math.max(...v.map((F) => x(F.note)));
    for (let F = 1; F <= P; F++) {
      const U = o ? S + (F - 1) * T : S - (F - 1) * T - w;
      let _ = -1;
      for (let B = 0; B <= v.length; B++) {
        const M = B < v.length && x(v[B].note) >= F;
        if (M && _ === -1 && (_ = B), !M && _ !== -1) {
          const G = v[_], W = v[B - 1], Y = _ === B - 1 ? 0.9 * c : 0, j = B < v.length, D = Y > 0 && !j ? G.left - Y : G.left, I = Y > 0 ? Y + l : W.left - G.left + l;
          e.push({ kind: "rect", x: D, y: U, width: I, height: w, noteId: G.note.id }), _ = -1;
        }
      }
    }
    const N = v[0];
    N.note.grace.slash && Ko(e, N.left + l / 2, S, o, N.note.id, a);
  }
  return h;
}
function Ko(e, t, n, s, i, o) {
  const a = Mn * o.ss, r = s ? 1 : -1, c = n + r * 1.1 * a, f = 0.8 * a, l = -r * 0.65 * a;
  ms(
    e,
    t - f,
    c - l,
    t - f / 3,
    c - l / 3,
    t + f / 3,
    c + l / 3,
    t + f,
    c + l,
    st.stemThickness * o.ss,
    i
  );
}
function $r(e, t, n, s, i) {
  const { bBoxSW: o, bBoxNE: a } = X[e];
  return {
    x: t + o[0] * s - i,
    y: n - a[1] * s - i,
    width: (a[0] - o[0]) * s + i * 2,
    height: (a[1] - o[1]) * s + i * 2
  };
}
function _i(e, t, n, s) {
  const i = kn(e).anchors[n ? "stemUpSE" : "stemDownNW"];
  if (!i) return null;
  const o = st.stemThickness * s, a = n ? t + i[0] * s - o : t + i[0] * s;
  return { left: a, right: a + o };
}
function Gr(e) {
  const t = 1 / e.beatType;
  return e.beatType === 8 && e.beats % 3 === 0 && e.beats > 3 ? t * 3 : t;
}
function zi(e, t, n, s, i) {
  const o = Gr(t), a = 1e-9, r = [];
  let c = [], f = -1, l = 0;
  const h = () => {
    c.length >= 2 && r.push(c), c = [];
  }, d = Lt(e), p = d.map($a), g = p.some((m) => m !== null);
  return d.forEach((m, b) => {
    const y = m[0];
    if (!(y.pitch !== null && y.value in En && !((i == null ? void 0 : i.has(y.id)) ?? !1))) {
      h(), l += y.durationWholes;
      return;
    }
    if (g) {
      const w = p[b];
      w === "begin" && h(), (w === "begin" || w === "continue" || w === "end") && c.push(m), w !== "begin" && w !== "continue" && h(), l += y.durationWholes;
      return;
    }
    const S = Math.floor((l + a) / o);
    c.length > 0 && S !== f && h(), c.push(m), f = S, l += y.durationWholes;
  }), h(), typeof n == "function" ? r.map((m) => ({
    notes: m.map((b) => b[0]),
    direction: un(
      m.flat().flatMap((b) => b.pitch ? [it(b.pitch) - n(b)] : []),
      0,
      s
    )
  })) : r.map((m) => ({
    notes: m.map((b) => b[0]),
    direction: un(
      m.flat().flatMap((b) => b.pitch ? [it(b.pitch)] : []),
      n,
      s
    )
  }));
}
function un(e, t, n) {
  if (n) return n;
  if (e.length === 0) return "down";
  const s = (c) => c - t, i = Math.max(...e.map((c) => Math.abs(s(c)))), o = e.filter((c) => Math.abs(s(c)) === i), a = o.some((c) => s(c) < 0), r = o.some((c) => s(c) > 0);
  if (a && !r) return "up";
  if (r && !a) return "down";
  if (a && r) {
    const c = e.filter((l) => s(l) < 0).length, f = e.filter((l) => s(l) > 0).length;
    if (c > f) return "up";
    if (f > c) return "down";
  }
  return "down";
}
function qo(e, t, n, s, i, o) {
  const { ss: a } = s, r = t.notes.flatMap((g) => {
    const m = n.get(g.id);
    return m ? [{ note: g, stem: m }] : [];
  });
  if (r.length < 2) return;
  const c = t.direction === "up", f = i ?? (c ? Math.min(...r.map((g) => g.stem.nearY - je * a)) : Math.max(...r.map((g) => g.stem.nearY + je * a))), l = st.stemThickness * a;
  for (const { note: g, stem: m } of r)
    o == null || o.set(g.id, f), e.push({
      kind: "rect",
      x: m.left,
      y: Math.min(m.attachY, f),
      width: l,
      height: Math.abs(f - m.attachY),
      noteId: g.id
    });
  const h = st.beamThickness * a, d = (st.beamThickness + st.beamSpacing) * a, p = Math.max(...t.notes.map((g) => Fs[g.value] ?? 1));
  for (let g = 1; g <= p; g++) {
    const m = c ? f + (g - 1) * d : f - (g - 1) * d - h;
    let b = -1;
    for (let y = 0; y <= r.length; y++) {
      const v = y < r.length && (Fs[r[y].note.value] ?? 1) >= g;
      v && b === -1 && (b = y), !v && b !== -1 && (Dr(e, r, b, y - 1, m, h, l, c, a), b = -1);
    }
  }
}
function Dr(e, t, n, s, i, o, a, r, c) {
  const f = (g) => t[g].stem.left;
  if (n === s) {
    const g = 0.9 * c, m = s + 1 < t.length, b = f(n), y = m ? b : b - g;
    e.push({ kind: "rect", x: y, y: i, width: g + a, height: o });
    return;
  }
  const l = f(n), h = f(s), d = Math.min(l, h), p = Math.max(l, h);
  e.push({ kind: "rect", x: d, y: i, width: p - d + a, height: o });
}
const _r = {
  staccato: { above: "articStaccatoAbove", below: "articStaccatoBelow" },
  staccatissimo: { above: "articStaccatissimoAbove", below: "articStaccatissimoBelow" },
  tenuto: { above: "articTenutoAbove", below: "articTenutoBelow" },
  "detached-legato": { above: "articTenutoStaccatoAbove", below: "articTenutoStaccatoBelow" },
  accent: { above: "articAccentAbove", below: "articAccentBelow" },
  "strong-accent": { above: "articMarcatoAbove", below: "articMarcatoBelow" }
}, zr = /* @__PURE__ */ new Set(["staccato", "tenuto"]), Es = 0.35, Ur = 0.25, Qo = 0.5;
function Yr(e, t, n, s, i, o) {
  const { chord: a, heads: r, stem: c, ctx: f } = t, { ss: l } = f, h = a[0], d = f.staffTopY, p = f.staffTopY + 4 * l;
  let g, m, b, y = null, v = f.lines.bottomLine, S = f.lines.topLine;
  if (r.length === 0) {
    if (!n) return;
    g = n.y, m = n.y + n.height, b = n.x + n.width / 2;
  } else {
    const M = r[0].headGlyph, { bBoxSW: G, bBoxNE: W } = X[M], Y = r.map((k) => k.y);
    g = Math.min(...Y) - W[1] * l, m = Math.max(...Y) - G[1] * l, y = r[0].up;
    const j = r.map((k) => k.noteX);
    b = (y === !1 ? Math.max(...j) : Math.min(...j)) + (G[0] + W[0]) / 2 * l;
    const I = r.map((k) => k.d);
    v = Math.min(v, ...I), S = Math.max(S, ...I);
  }
  const w = c ? c.left + st.stemThickness * l / 2 : null;
  let T = y === !0 && s !== null ? Math.min(g, s) : g, x = y === !1 && s !== null ? Math.max(m, s) : m;
  const P = ps(h.voice, o), N = P ? P === "up" ? "above" : "below" : y === !0 ? "below" : "above", F = (M) => f.lines.bottomLine + (p - M) / (l / 2), U = (M) => M >= v && M <= S && ((M - f.lines.bottomLine) % 2 + 2) % 2 === 0, _ = (M) => (a.find(M) ?? h).id;
  for (const M of Js(a)) {
    const G = M === "strong-accent" ? "above" : N, W = G === "above", Y = W ? -1 : 1, j = _r[M][G], { bBoxSW: D, bBoxNE: I } = X[j], k = (I[1] - D[1]) * l, V = W ? T : x;
    let O;
    if (zr.has(M)) {
      const Q = F(V + Y * (Ur * l + k / 2));
      let et = W ? Math.ceil(Q - 1e-6) : Math.floor(Q + 1e-6);
      U(et) && (et += W ? 1 : -1), O = wt(et, f);
    } else {
      let Q = V + Y * Es * l;
      const et = Q + Y * k;
      Math.max(Q, et) > d && Math.min(Q, et) < p && (Q = W ? Math.min(Q, d - Es * l) : Math.max(Q, p + Es * l)), O = Q + Y * k / 2;
    }
    const K = w !== null && (W ? y === !0 : y === !1) ? w : b;
    e.push({
      kind: "glyph",
      glyph: j,
      x: K - (D[0] + I[0]) / 2 * l,
      y: O + (D[1] + I[1]) / 2 * l,
      noteId: _((Q) => Q.articulations.includes(M))
    }), W ? T = Math.min(T, O - k / 2) : x = Math.max(x, O + k / 2);
  }
  const B = Zs(a);
  if (B !== null) {
    const M = B === "upright", G = M ? "fermataAbove" : "fermataBelow", { bBoxSW: W, bBoxNE: Y } = X[G];
    let j = M ? Math.min(d, T) : Math.max(p, x);
    for (const k of i)
      b < Math.min(k.x0, k.x1) || b > Math.max(k.x0, k.x1) || (j = M ? Math.min(j, k.y0, k.cy0, k.cy1, k.y1) : Math.max(j, k.y0, k.cy0, k.cy1, k.y1));
    const D = b - (W[0] + Y[0]) / 2 * l, I = M ? j - Qo * l + W[1] * l : j + Qo * l + Y[1] * l;
    e.push({ kind: "glyph", glyph: G, x: D, y: I, noteId: _((k) => k.fermata !== null) });
  }
}
function Jo(e, t) {
  return e.tieBelow ?? e.up ?? un([e.d], t) === "up";
}
function ms(e, t, n, s, i, o, a, r, c, f, l) {
  e.push({ kind: "curve", x0: t, y0: n, cx0: s, cy0: i, cx1: o, cy1: a, x1: r, y1: c, thickness: f, noteId: l });
}
function Ts(e, t, n, s, i, o, a, r) {
  const { ss: c } = r, f = o ? 1 : -1, l = or * c;
  ms(
    e,
    t,
    n,
    t + (s - t) * 0.25,
    n + f * l,
    t + (s - t) * 0.75,
    i + f * l,
    s,
    i,
    st.tieMidpointThickness * c,
    a
  );
}
function jr(e, t, n) {
  const s = e.notesInOrder(n), i = s.findIndex((a) => a.id === t.startNoteId), o = s.findIndex((a) => a.id === t.endNoteId);
  return s.slice(i, o + 1);
}
function Vr(e, t, n) {
  const s = e.flatMap((a) => a.pitch ? [it(a.pitch)] : []), i = t ? Math.min(n.lines.bottomLine, ...s) : Math.max(n.lines.topLine, ...s), o = wt(i, n);
  return t ? o + $o * n.ss : o - $o * n.ss;
}
function Hr(e, t, n, s, i, o, a, r) {
  const { ss: c } = r;
  ms(
    e,
    t,
    n,
    t + (s - t) * 0.25,
    o,
    t + (s - t) * 0.75,
    o,
    s,
    i,
    st.slurMidpointThickness * c,
    a
  );
}
const Xr = {
  pppppp: "dynamicPPPPPP",
  ppppp: "dynamicPPPPP",
  pppp: "dynamicPPPP",
  ppp: "dynamicPPP",
  pp: "dynamicPP",
  p: "dynamicPiano",
  mp: "dynamicMP",
  mf: "dynamicMF",
  f: "dynamicForte",
  ff: "dynamicFF",
  fff: "dynamicFFF",
  ffff: "dynamicFFFF",
  fffff: "dynamicFFFFF",
  ffffff: "dynamicFFFFFF",
  sf: "dynamicSforzando1",
  sfz: "dynamicSforzato",
  sffz: "dynamicSforzatoFF",
  sfp: "dynamicSforzandoPiano",
  sfpp: "dynamicSforzandoPianissimo",
  sfzp: "dynamicSforzatoPiano",
  fp: "dynamicFortePiano",
  fz: "dynamicForzando",
  rf: "dynamicRinforzando1",
  rfz: "dynamicRinforzando2",
  pf: "dynamicPF",
  n: "dynamicNiente"
}, Ft = {
  /** Blank between the ink a direction clears and the dynamic's tallest
   *  letter (or a hairpin's edge), staff spaces. */
  clearance: 0.6,
  /** How far a dynamic letter can reach above its baseline (an `f`'s
   *  ascender) and below it (a `p`'s or `f`'s descender), staff spaces:
   *  Bravura's tallest and deepest dynamic glyphs. Every dynamic sits on one
   *  baseline per side, so these fixed figures, not each glyph's own box,
   *  decide how far that baseline is from the ink; a system's marks then
   *  line up whatever letters they use. */
  ascent: 1.776,
  descent: 0.608,
  /** Height above the baseline of a hairpin's centre line: half the letters'
   *  x-height, so a hairpin points at the middle of a `p` or `f`. */
  hairpinCentre: 0.55,
  /** A hairpin's full opening, staff spaces: near MusicXML's `spread`
   *  default of 1.5 (M8 Slice 5; 1.1 read as a flat line on real scores). */
  hairpinOpening: 1.4,
  /** Gap between two hairpins that meet (a crescendo straight into a
   *  diminuendo), so they read as two shapes, not one diamond. */
  hairpinGap: 0.8,
  /** Gap between a hairpin's end and a dynamic it meets, staff spaces. */
  dynamicGap: 0.4,
  /** Gap between a hairpin's stop and the notehead it stops at. */
  noteGap: 0.3,
  /** Extra room a lyric staff's gap to the next staff keeps when that staff
   *  has directions above it (M8 Slice 5). */
  aboveRoom: 2,
  /** A hairpin whose drawn length would come out shorter than this is not
   *  drawn (OMR's zero-length hairpins, a start and stop at one onset). */
  minLength: 1
};
function Hn(e, t, n) {
  const { stop: s, start: i } = t;
  if (s.onset === 0 && s.measureIndex > i.measureIndex && n[s.measureIndex] !== n[s.measureIndex - 1]) {
    const o = e.staves[t.staffIndex].measures[s.measureIndex - 1];
    return { measureIndex: s.measureIndex - 1, onset: rs(o) };
  }
  return s;
}
function Ne(e, t) {
  return e ?? (t.lyrics ? "above" : "below");
}
function io(e, t) {
  const { ss: n } = t;
  let s = null, i = null;
  return Ui(e, t, (o, a) => {
    const r = o.inkExtent ?? { top: t.staffTopY, bottom: t.staffTopY + 4 * n };
    a === "below" ? s = Math.max(s ?? r.bottom, r.bottom) : i = Math.min(i ?? r.top, r.top);
  }), {
    below: s === null ? null : s + (Ft.clearance + Ft.ascent) * n,
    above: i === null ? null : i - (Ft.clearance + Ft.descent) * n
  };
}
function Ui(e, t, n) {
  var r, c;
  const { staffIndex: s } = t, i = ((r = t.measures[0]) == null ? void 0 : r.index) ?? 0, o = ((c = t.measures[t.measures.length - 1]) == null ? void 0 : c.index) ?? -1, a = e.staves[s];
  for (const f of t.measures)
    for (const l of a.measures[f.index].dynamics) n(f, Ne(l.placement, t));
  for (const f of e.wedges) {
    if (f.staffIndex !== s) continue;
    const l = Hn(e, f, t.systemOf);
    if (!(l.measureIndex < i || f.start.measureIndex > o))
      for (const h of t.measures)
        h.index >= f.start.measureIndex && h.index <= l.measureIndex && n(h, Ne(f.placement, t));
  }
}
function ls(e, t, n, s, i) {
  const o = e.staves[t].measures[n.index], a = ds(o.notes), r = new Map(n.notes.map((v) => [v.id, v.bounds])), c = /* @__PURE__ */ new Map();
  for (const v of o.notes) {
    const S = r.get(v.id), w = a.get(v.id);
    if (!S || w === void 0) continue;
    const T = kt(w), x = S.x + S.width / 2;
    c.set(T, Math.min(c.get(T) ?? x, x));
  }
  const f = [...c].sort((v, S) => v[0] - S[0]), l = kt(s), h = c.get(l);
  if (h !== void 0) return { x: h, atNote: !0 };
  const d = n.region.x + n.region.width, p = { key: kt(Math.max(rs(o), s)), x: d - i };
  if (f.length === 0) return { x: n.region.x + n.region.width * Math.min(1, s / (p.key || 1)), atNote: !1 };
  let g, m;
  for (const v of f)
    v[0] < l ? g = v : m || (m = v);
  if (!g) return { x: f[0][1], atNote: !1 };
  const b = m ?? [p.key, p.x], y = b[0] === g[0] ? 1 : (l - g[0]) / (b[0] - g[0]);
  return { x: g[1] + (b[1] - g[1]) * y, atNote: !1 };
}
function Zo(e, t, n, s, i) {
  const o = Xr[s.kind], { bBoxSW: a, bBoxNE: r } = X[o], c = (r[0] - a[0]) * i, f = ls(e, t, n, s.onset, i).x, l = n.region.x + 0.2 * i, h = n.region.x + n.region.width - 0.2 * i - c, d = Math.max(l, Math.min(h, f - c / 2));
  return { glyph: o, x: d - a[0] * i, left: d, right: d + c };
}
function Kr(e, t, n, s) {
  const { ss: i, staffIndex: o } = t, a = [], r = e.staves[o], c = (m) => t.measures.find((b) => b.index === m), f = (m) => n[m] ?? t.staffTopY + (m === "below" ? 6.4 : -2.4) * i;
  for (const m of r.measures[s.index].dynamics) {
    const b = Zo(e, o, s, m, i);
    a.push({ kind: "glyph", glyph: b.glyph, x: b.x, y: f(Ne(m.placement, t)) });
  }
  const l = t.systemOf[s.index], h = t.measures[0], d = t.measures[t.measures.length - 1], p = (m) => {
    const b = Hn(e, m, t.systemOf), y = Ne(m.placement, t), v = (P, N) => {
      const F = c(P), U = F ? r.measures[P].dynamics.find((_) => Ne(_.placement, t) === y && Math.abs(_.onset - N) < 1e-9) : void 0;
      return F && U ? Zo(e, o, F, U, i) : void 0;
    };
    let S;
    const w = t.systemOf[m.start.measureIndex] === l ? c(m.start.measureIndex) : void 0;
    if (w) {
      const P = v(m.start.measureIndex, m.start.onset);
      S = P ? P.right + Ft.dynamicGap * i : ls(e, o, w, m.start.onset, i).x - 0.6 * i;
    } else
      S = Math.min(...h.notes.map((P) => P.bounds.x), h.region.x + h.region.width) - 0.5 * i;
    let T;
    const x = t.systemOf[b.measureIndex] === l ? c(b.measureIndex) : void 0;
    if (x) {
      const P = ls(e, o, x, b.onset, i);
      T = P.atNote ? P.x - (0.6 + Ft.noteGap) * i : P.x;
      const N = rs(r.measures[b.measureIndex]), F = v(b.measureIndex, b.onset) ?? (b.onset >= N - 1e-9 && t.systemOf[b.measureIndex + 1] === l ? v(b.measureIndex + 1, 0) : void 0);
      F && (T = Math.min(T, F.left - Ft.dynamicGap * i));
    } else
      T = d.region.x + d.region.width - i;
    return { x0: S, x1: T };
  }, g = (m, b) => {
    const y = Hn(e, m, t.systemOf), v = b.start;
    return y.measureIndex === v.measureIndex ? Math.abs(y.onset - v.onset) < 1e-9 : y.measureIndex + 1 === v.measureIndex && v.onset === 0 && y.onset >= rs(r.measures[y.measureIndex]) - 1e-9;
  };
  for (const m of e.wedges) {
    if (m.staffIndex !== o || m.start.measureIndex > s.index) continue;
    const b = Hn(e, m, t.systemOf);
    if (b.measureIndex < s.index) continue;
    const y = Ne(m.placement, t), { x1: v } = p(m);
    let { x0: S } = p(m);
    if (t.systemOf[m.start.measureIndex] === l)
      for (const j of e.wedges)
        j === m || j.staffIndex !== o || Ne(j.placement, t) !== y || g(j, m) && (S = Math.max(S, p(j).x1 + Ft.hairpinGap * i));
    if (v - S < Ft.minLength * i) continue;
    const w = t.systemOf[m.start.measureIndex], T = t.systemOf[b.measureIndex] - w + 1, x = l - w, P = Ft.hairpinOpening * i, N = (j) => (m.kind === "crescendo" ? j : 1 - j) * P, F = N(x / T), U = N((x + 1) / T), _ = Math.max(S, s.region.x), B = Math.min(v, s.region.x + s.region.width);
    if (B <= _) continue;
    const M = (j) => F + (U - F) * (j - S) / (v - S), G = f(y) - Ft.hairpinCentre * i, W = M(_) / 2, Y = M(B) / 2;
    ti(a, _, G - W, B, G - Y, i), ti(a, _, G + W, B, G + Y, i);
  }
  return a;
}
function ti(e, t, n, s, i, o) {
  ms(
    e,
    t,
    n,
    t + (s - t) / 3,
    n + (i - n) / 3,
    t + (s - t) * 2 / 3,
    n + (i - n) * 2 / 3,
    s,
    i,
    st.hairpinThickness * o,
    void 0
  );
}
function qr(e, t, n, s) {
  const i = e.staves[t];
  for (let o = n; o <= s; o++) {
    const a = i.measures[o];
    if (a.dynamics.length > 0 || to(a).length > 0) return !0;
  }
  return e.wedges.some((o) => o.staffIndex === t && o.start.measureIndex <= s && o.stop.measureIndex >= n);
}
function Qr(e, t, n, s, i) {
  const o = e.staves[t], a = (l, h) => (l ?? h) === "above", r = i ? "above" : "below";
  let c = e.wedges.some(
    (l) => l.staffIndex === t && l.start.measureIndex <= s && l.stop.measureIndex >= n && a(l.placement, r)
  ), f = !1;
  for (let l = n; l <= s; l++) {
    const h = o.measures[l];
    h.dynamics.some((d) => a(d.placement, r)) && (c = !0), to(h).some((d) => a(d.placement, "above")) && (f = !0);
  }
  return (c ? Ft.aboveRoom : 0) + (f ? Vt.fontSpaces + Vt.clearance : 0);
}
function ei(e, t) {
  return e.length !== t.length ? !1 : e.every((n, s) => {
    const i = t[s];
    if (n.kind !== i.kind) return !1;
    const o = n, a = i;
    return Object.keys(o).every(
      (r) => typeof o[r] == "number" ? Math.abs(o[r] - a[r]) <= 1e-3 : o[r] === a[r]
    );
  });
}
function sn(e, t, n, s) {
  if (t.length === 0) return e;
  const i = [...e.ops, ...t];
  return { ...e, ops: i, region: qn(i, e.region.x, e.region.width, n, s) };
}
function Ws(e, t) {
  var l, h;
  const n = ((l = t.measures[0]) == null ? void 0 : l.index) ?? 0, s = ((h = t.measures[t.measures.length - 1]) == null ? void 0 : h.index) ?? -1;
  if (!qr(e, t.staffIndex, n, s)) return null;
  const i = io(e, t), o = new Map(t.measures.map((d) => [d.index, Kr(e, t, i, d)])), a = tc(e, t, o), r = /* @__PURE__ */ new Map(), c = t.staffTopY + 4 * t.ss;
  let f = null;
  for (const d of t.measures) {
    const p = [...o.get(d.index), ...a.ops.get(d.index) ?? []];
    r.set(d.index, p);
    for (const g of p) {
      const m = ji(g, t.ss);
      m.y >= c && (f = Math.max(f ?? m.y + m.height, m.y + m.height));
    }
  }
  return { baselines: i, ops: r, belowBottom: f, aboveTop: a.aboveTop };
}
function Jr(e, t) {
  return t ? e.measures.map((n) => sn(n, t.ops.get(n.index) ?? [], e.staffTopY, e.ss)) : [...e.measures];
}
const Vt = {
  /** Words and a tempo's text, staff spaces (a little under the lyrics'). */
  fontSpaces: 1.7,
  /** Above / below its baseline, as fractions of the font size. */
  ascent: 0.75,
  descent: 0.25,
  /** Blank between a text and the ink it clears, staff spaces. */
  clearance: 0.5,
  /** A metronome mark's note glyph, as a fraction of the music font. */
  metronomeScale: 0.6
}, Yi = {
  breve: "metNoteDoubleWhole",
  whole: "metNoteWhole",
  half: "metNoteHalfUp",
  quarter: "metNoteQuarterUp",
  eighth: "metNote8thUp",
  "16th": "metNote16thUp"
};
function ji(e, t) {
  if (e.kind === "rect") return { x: e.x, y: e.y, width: e.width, height: e.height };
  if (e.kind === "curve") {
    const o = [e.x0, e.cx0, e.cx1, e.x1], a = [e.y0, e.cy0, e.cy1, e.y1], r = Math.min(...o), c = Math.min(...a);
    return { x: r, y: c, width: Math.max(...o) - r, height: Math.max(...a) - c };
  }
  if (e.kind === "text") {
    const o = Os(e.text, e.fontSizePx, e.fontStyle);
    return { x: e.align === "center" ? e.x - o / 2 : e.x, y: e.y - e.fontSizePx, width: o, height: 1.3 * e.fontSizePx };
  }
  const n = e.fontSizePx !== void 0 ? e.fontSizePx / (Xe * t) : 1, { bBoxSW: s, bBoxNE: i } = X[e.glyph];
  return {
    x: e.x + s[0] * t * n,
    y: e.y - i[1] * t * n,
    width: (i[0] - s[0]) * t * n,
    height: (i[1] - s[1]) * t * n
  };
}
function Os(e, t, n) {
  const s = qi(e) / lt.fontSpaces * t;
  return n != null && n.includes("bold") ? s * 1.1 : s;
}
function Zr(e) {
  return `${Yi[e.beatUnit] ? "" : ` ${e.beatUnit}`} = ${e.perMinute}`;
}
function tc(e, t, n) {
  var b, y;
  const { ss: s, staffIndex: i } = t, o = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Map(), r = e.staves[i], c = t.measures[0].region.x, f = t.measures[t.measures.length - 1], l = f.region.x + f.region.width, h = Vt.fontSpaces * s, d = t.measures.flatMap((v) => (n.get(v.index) ?? []).map((S) => ji(S, s))), p = [], g = t.staffTopY, m = t.staffTopY + 4 * s;
  for (const v of t.measures)
    for (const S of to(r.measures[v.index])) {
      const w = S.placement ?? "above", T = [S.italic ? "italic" : "", S.bold ? "bold" : ""].filter(Boolean).join(" ") || void 0, x = S.text ?? "", P = S.metronome ? Yi[S.metronome.beatUnit] : void 0, N = Vt.metronomeScale * Xe * s, F = P ? X[P].advance * Vt.metronomeScale * s : 0, U = S.metronome ? Zr(S.metronome) : "", _ = x ? Os(x, h, T) : 0, B = x && S.metronome ? 0.6 * s : 0, M = _ + B + F + (U ? Os(U, h) : 0), G = ls(e, i, v, S.onset, s).x - 0.6 * s, W = Math.max(c + 0.2 * s, Math.min(G, l - 0.2 * s - M)), Y = W + M, j = (O) => O.x < Y + 0.3 * s && O.x + O.width > W - 0.3 * s;
      let D;
      if (w === "above") {
        let O = g;
        for (const E of t.measures) j(E.region) && (O = Math.min(O, ((b = E.inkExtent) == null ? void 0 : b.top) ?? g));
        for (const E of d) E.y + E.height <= g + 2 * s && j(E) && (O = Math.min(O, E.y));
        for (const E of p) E.side === w && E.right > W && E.left < Y && (O = Math.min(O, E.top));
        D = O - Vt.clearance * s - Vt.descent * h;
      } else {
        let O = m;
        for (const E of t.measures) j(E.region) && (O = Math.max(O, ((y = E.inkExtent) == null ? void 0 : y.bottom) ?? m));
        for (const E of d) E.y >= m - 2 * s && j(E) && (O = Math.max(O, E.y + E.height));
        for (const E of p) E.side === w && E.right > W && E.left < Y && (O = Math.max(O, E.bottom));
        D = O + Vt.clearance * s + Vt.ascent * h;
      }
      const I = D - Vt.ascent * h;
      p.push({ side: w, left: W, right: Y, top: I, bottom: D + Vt.descent * h });
      const k = [];
      let V = W;
      x && (k.push({ kind: "text", text: x, x: V, y: D, fontSizePx: h, ...T ? { fontStyle: T } : {} }), V += _ + B), P && (k.push({ kind: "glyph", glyph: P, x: V, y: D, fontSizePx: N }), V += F), U && k.push({ kind: "text", text: U, x: V, y: D, fontSizePx: h });
      for (const O of t.measures) {
        const E = O.region.x, K = O.region.x + O.region.width;
        if (K <= W || E >= Y + 0.5 * s) continue;
        const Q = o.get(O.index) ?? [];
        for (const et of k)
          et.kind === "text" ? Q.push({ ...et, clip: { x: E, width: K - E } }) : et.kind === "glyph" && et.x >= E && et.x < K && Q.push(et);
        o.set(O.index, Q), w === "above" && a.set(O.index, Math.min(a.get(O.index) ?? I, I));
      }
    }
  return { ops: o, aboveTop: a };
}
const Rt = {
  /** Blank between the highest ink a bracket clears and the bottom of its
   *  hooks and label, staff spaces. */
  clearance: 0.8,
  /** How far a hook reaches down from the bracket line. */
  hookLength: 2.4,
  /** Label text size, its baseline below the bracket line, and its inset
   *  right of the left hook. */
  labelFontSpaces: 1.6,
  labelBaseline: 1.9,
  labelInset: 0.5,
  /** Gap between a hooked end (or a start) and the barline it meets, so
   *  a 1st ending's closing hook and a 2nd ending's opening hook stay apart. */
  barlineInset: 0.3,
  /** Where a bracket starts in a system's first measure: this far left of
   *  the first note, after the clef and key signature. */
  systemStartLeadIn: 1,
  /** Minimum blank between the system above's lowest ink and a bracket. */
  systemClearance: 2
};
function Vi(e) {
  return e.endings().map(({ first: t, last: n, start: s, end: i }) => ({
    first: t,
    last: n,
    label: s.text ?? `${s.numbers.join(", ")}.`,
    hooked: i.kind === "stop"
  }));
}
function ec(e) {
  return Math.max(Rt.hookLength * e, Rt.labelBaseline * e + 0.3 * Rt.labelFontSpaces * e);
}
function Hi(e, t, n, s, i) {
  var f;
  const { ss: o } = t, a = (l) => s.some((h) => l >= h.first && l <= h.last), r = /* @__PURE__ */ new Set();
  Ui(e, t, (l, h) => {
    h === "above" && r.add(l.index);
  });
  let c = null;
  for (const l of t.measures) {
    if (!a(l.index)) continue;
    let h = ((f = l.inkExtent) == null ? void 0 : f.top) ?? t.staffTopY;
    r.has(l.index) && n.above !== null && (h = Math.min(h, n.above - Ft.ascent * o));
    const d = i == null ? void 0 : i.get(l.index);
    d !== void 0 && (h = Math.min(h, d)), c = Math.min(c ?? h, h);
  }
  return c === null ? null : c - Rt.clearance * o - ec(o);
}
function Xi(e, t, n, s) {
  const { ss: i } = e, o = [], a = e.measures[0], r = e.measures[e.measures.length - 1], c = st.thinBarlineThickness * i, f = (l) => l.region.x + l.region.width;
  for (const l of t) {
    if (s.index < l.first || s.index > l.last) continue;
    const h = l.first >= a.index, d = l.last <= r.index, p = e.measures.find((S) => S.index === Math.max(l.first, a.index)), g = p === a ? Math.min(...a.notes.map((S) => S.bounds.x), f(a)) - (h ? Rt.systemStartLeadIn : 0.5) * i : p.region.x + Rt.barlineInset * i, m = e.measures.find((S) => S.index === Math.min(l.last, r.index)), b = d ? f(m) - Rt.barlineInset * i : f(m), y = Math.max(g, s.region.x), v = Math.min(b, f(s));
    v <= y || (o.push({ kind: "rect", x: y, y: n - c / 2, width: v - y, height: c }), h && s.index === l.first && (o.push({ kind: "rect", x: g, y: n - c / 2, width: c, height: Rt.hookLength * i }), o.push({
      kind: "text",
      text: l.label,
      x: g + Rt.labelInset * i,
      y: n + Rt.labelBaseline * i,
      fontSizePx: Rt.labelFontSpaces * i
    })), d && l.hooked && s.index === l.last && o.push({ kind: "rect", x: b - c, y: n - c / 2, width: c, height: Rt.hookLength * i }));
  }
  return o;
}
function Ki(e, t, n) {
  return e.some((s) => s.first <= n && s.last >= t);
}
const lt = {
  /** Lyric text size, staff spaces (about 10pt on a 7mm staff). */
  fontSpaces: 2,
  /** Smallest distance from the staff's bottom line to verse 1's baseline. */
  firstBaseline: 4.6,
  /** Blank between the lowest ink a verse line clears and its letters' tops. */
  inkClearance: 0.9,
  /** How far capitals and ascenders reach above the baseline, and
   *  descenders below it, staff spaces (0.72 and 0.25 em). */
  ascent: 1.45,
  descent: 0.5,
  /** Baseline to baseline between verse lines. */
  lineSpacing: 2.6,
  /** Minimum blank between two words of one verse. */
  wordGap: 0.8,
  /** Minimum blank between two syllables of one word: room for a hyphen
   *  with some air either side. */
  hyphenGap: 1.6,
  /** Minimum blank between a syllable and its measure's barline (a hyphen
   *  that crosses it gets `hyphenGap / 2` on each side instead). */
  edgeMargin: 0.4,
  hyphenWidth: 0.65,
  hyphenThickness: 0.13,
  /** Height of a hyphen's centre above the baseline: about half an x-height. */
  hyphenRise: 0.6,
  /** A gap narrower than this gets no hyphen (only reachable in a
   *  compressed system, since spacing reserves `hyphenGap`). */
  hyphenMinGap: 1,
  /** Roughly one hyphen per this many spaces of a long gap (Gould: repeat
   *  hyphens across a wide gap so the eye can follow the word). */
  hyphenSpacing: 6,
  /** The room before a syllable that continues a word from the previous
   *  system, where that system's hyphen is repeated. */
  breakHyphenRoom: 1.6,
  /** Gap between a syllable and the extender line after it. */
  extenderGap: 0.25,
  extenderThickness: 0.11,
  /** An extender shorter than this is not drawn (a "melisma" of the
   *  syllable's own note, which is no melisma). */
  extenderMin: 0.8,
  /** Blank between a lyric staff's lowest ink (its last verse line, or a
   *  below-placed dynamic under it) and the next staff's top line: room for
   *  that staff's ledger lines and above-placed dynamics. */
  nextStaffGap: 4.5
};
function nc(e) {
  return /[ijl.,;:'!|’ ]/.test(e) ? 0.25 : /[ftrI\-()]/.test(e) ? 0.33 : /[mwMW]/.test(e) ? 0.85 : /[A-Z]/.test(e) ? 0.68 : 0.55;
}
function qi(e) {
  let t = 0;
  for (const n of e) t += nc(n);
  return t * lt.fontSpaces;
}
function sc(e) {
  return e.syllabic === "middle" || e.syllabic === "end" ? lt.hyphenGap / 2 : lt.edgeMargin;
}
function oc(e) {
  return eo(e) ? lt.hyphenGap / 2 : lt.edgeMargin;
}
function ao(e, t, n, s) {
  const i = qi(wi(e)) * s;
  if (Si(e)) return { left: t, right: t + i, x: t, align: "left" };
  const o = t + n / 2;
  return { left: o - i / 2, right: o + i / 2, x: o, align: "center" };
}
function ro(e, t, n) {
  const s = (t.pitch === null ? 0.25 : 0.3) * n;
  return { left: e.x + s, width: e.width - 2 * s };
}
function ic(e) {
  const t = [];
  let n;
  for (const s of Lt(e)) {
    const i = as(s);
    if (i.length === 0) continue;
    n ?? (n = ds(e));
    const o = s[0], a = X[o.pitch === null ? no[o.value] : He[o.value]].advance;
    for (const r of i) {
      if (r.text === "") continue;
      const c = ao(r, 0, a, 1);
      t.push({ onset: kt(n.get(o.id)), verse: r.verse, lyric: r, left: c.left, right: c.right });
    }
  }
  return t;
}
function co(e, t) {
  return le ? (le.lyrics.has(t) || le.lyrics.set(t, ni(e, t)), le.lyrics.get(t)) : ni(e, t);
}
function ni(e, t) {
  const n = [];
  for (const c of e.staves) {
    const f = c.measures[t];
    if (!f || !f.notes.some((h) => h.lyrics.length > 0)) continue;
    const l = ic(f.notes);
    l.length > 0 && n.push({ columns: us(e, f, c.index).columns, items: l });
  }
  if (n.length === 0) return null;
  const s = [...new Set(n.flatMap((c) => c.columns.map((f) => kt(f.onset))))].sort((c, f) => c - f), i = new Map(s.map((c) => [c, 0])), o = (c, f) => {
    let l = 0;
    for (const h of c) {
      if (kt(h.onset) >= f) break;
      l += h.width;
    }
    for (const h of s) {
      if (h >= f) break;
      l += i.get(h);
    }
    return l;
  }, a = (c, f, l) => {
    const h = [];
    for (let p = 0; p < s.length; p++) {
      const g = s[p];
      g < c || g >= f || h.push([g, Math.min(s[p + 1] ?? f, f) - g]);
    }
    const d = h.reduce((p, [, g]) => p + g, 0);
    for (const [p, g] of h) i.set(p, i.get(p) + (d > 0 ? l * g / d : l / h.length));
  };
  let r = 0;
  for (const { columns: c, items: f } of n) {
    const l = /* @__PURE__ */ new Map();
    for (const h of f) {
      const d = l.get(h.verse);
      d ? d.some((p) => p.onset === h.onset) || d.push(h) : l.set(h.verse, [h]);
    }
    for (const h of l.values()) {
      h.sort((p, g) => p.onset - g.onset);
      const d = h[0];
      r = Math.max(r, sc(d.lyric) - d.left - ot.measureLeadIn - o(c, d.onset));
      for (let p = 1; p < h.length; p++) {
        const g = h[p - 1], m = h[p], b = eo(g.lyric) ? lt.hyphenGap : lt.wordGap, y = o(c, m.onset) + m.left - (o(c, g.onset) + g.right);
        b - y > 1e-9 && a(g.onset, m.onset, b - y);
      }
    }
  }
  for (const [c, f] of i) f <= 0 && i.delete(c);
  return { extras: i, lead: Math.max(0, r) };
}
function Qi(e, t) {
  const n = e.staves[t];
  if (!n.measures.some((r) => r.notes.some((c) => c.lyrics.length > 0))) return null;
  const s = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map(), o = /* @__PURE__ */ new Map();
  for (const r of n.measures)
    for (const c of Lt(r.notes)) {
      const f = c[0].voice;
      let l = s.get(f);
      l || s.set(f, l = []), l.push({ measureIndex: r.index, event: c });
      for (const h of as(c)) {
        const d = { measureIndex: r.index, event: c, lyric: h, voice: f, at: l.length - 1 }, p = `${f}\0${h.verse}`, g = i.get(p);
        g ? g.push(d) : i.set(p, [d]);
        const m = o.get(r.index);
        m ? m.push(d) : o.set(r.index, [d]);
      }
    }
  const a = [];
  for (const r of i.values()) {
    const c = r.filter((f) => f.lyric.text !== "");
    c.forEach((f, l) => {
      const h = c[l + 1];
      if (h && eo(f.lyric) && a.push({ kind: "hyphen", start: f, endMeasure: h.measureIndex, endEvent: h.event, endSlot: h }), !Si(f.lyric)) return;
      const d = s.get(f.voice);
      let p = d[f.at];
      for (let g = f.at + 1; g < d.length; g++) {
        const m = d[g];
        if (m.event[0].pitch === null) break;
        const b = as(m.event).find((y) => y.verse === f.lyric.verse);
        if (b && b.text !== "" || (p = m, (b == null ? void 0 : b.extend) === "stop")) break;
      }
      a.push({ kind: "extender", start: f, endMeasure: p.measureIndex, endEvent: p.event, endSlot: null });
    });
  }
  return { slotsByMeasure: o, connectors: a };
}
function Ji(e, t, n) {
  if (!e) return Rs;
  const s = /* @__PURE__ */ new Set();
  for (let i = t; i <= n; i++) for (const o of e.slotsByMeasure.get(i) ?? []) s.add(o.lyric.verse);
  for (const i of e.connectors)
    i.start.measureIndex < t && i.endMeasure >= t && s.add(i.start.lyric.verse);
  return s.size === 0 ? Rs : [...s].sort(Ga);
}
const Rs = Object.freeze([]);
function Zi(e, t = null) {
  var o;
  const { ss: n } = e, s = e.staffTopY + 4 * n;
  let i = s + lt.firstBaseline * n;
  for (const a of e.measures) {
    const r = e.index.slotsByMeasure.get(a.index);
    if (!r || !r.some((f) => f.lyric.text !== "")) continue;
    const c = ((o = a.inkExtent) == null ? void 0 : o.bottom) ?? s;
    i = Math.max(i, c + (lt.inkClearance + lt.ascent) * n);
  }
  return t !== null && (i = Math.max(i, t + (lt.inkClearance + lt.ascent) * n)), i;
}
function ac(e, t) {
  return t + ((e.verses.length - 1) * lt.lineSpacing + lt.descent) * e.ss;
}
function Xn(e, t) {
  var h;
  const n = e.measures.find((d) => d.index === t.measureIndex), s = t.event[0], i = (h = n == null ? void 0 : n.notes.find((d) => d.id === s.id)) == null ? void 0 : h.bounds;
  if (!n || !i) return null;
  const { ss: o } = e, a = ro(i, s, o), r = ao(t.lyric, a.left, a.width, o), c = n.region.x + lt.edgeMargin / 2 * o, f = n.region.x + n.region.width - lt.edgeMargin / 2 * o, l = r.left < c ? c - r.left : r.right > f ? Math.max(c - r.left, f - r.right) : 0;
  return { left: r.left + l, right: r.right + l, x: r.x + l, align: r.align };
}
function rc(e, t, n) {
  var r;
  const s = e.measures.find((c) => c.index === t), i = n[0], o = (r = s == null ? void 0 : s.notes.find((c) => c.id === i.id)) == null ? void 0 : r.bounds;
  if (!o) return null;
  const a = ro(o, i, e.ss);
  return a.left + a.width;
}
function cc(e, t) {
  var g, m;
  const { ss: n, systemOf: s } = e, i = e.measures[0], o = e.measures[e.measures.length - 1], a = s[i.index], r = s[t.start.measureIndex], c = s[t.endMeasure];
  if (r > a || c < a) return null;
  const f = Math.min(i.region.x + i.region.width, ...i.notes.map((b) => b.bounds.x)), l = o.region.x + o.region.width - 0.5 * n;
  if (t.kind === "hyphen") {
    const b = r === a ? (g = Xn(e, t.start)) == null ? void 0 : g.right : void 0, y = c === a && t.endSlot ? (m = Xn(e, t.endSlot)) == null ? void 0 : m.left : void 0;
    return b !== void 0 && y !== void 0 ? { x0: b, x1: y } : b !== void 0 ? { x0: b, x1: l } : y !== void 0 && r < a ? { x0: Math.max(i.region.x + 0.5 * n, y - lt.breakHyphenRoom * n), x1: y } : null;
  }
  const h = r === a ? Xn(e, t.start) : null, d = h ? h.right + lt.extenderGap * n : f, p = c === a ? rc(e, t.endMeasure, t.endEvent) ?? l : l;
  return { x0: d, x1: p };
}
function Kn(e, t, n) {
  const { ss: s } = e, i = [], o = lt.fontSpaces * s, a = (f) => t + Math.max(0, e.verses.indexOf(f)) * lt.lineSpacing * s, r = n.region.x, c = n.region.x + n.region.width;
  for (const f of e.index.slotsByMeasure.get(n.index) ?? []) {
    if (f.lyric.text === "") continue;
    const l = Xn(e, f);
    l && i.push({ kind: "text", text: wi(f.lyric), x: l.x, y: a(f.lyric.verse), fontSizePx: o, align: l.align });
  }
  for (const f of e.index.connectors) {
    if (f.start.measureIndex > n.index || f.endMeasure < n.index) continue;
    const l = cc(e, f);
    if (!l) continue;
    const h = a(f.start.lyric.verse);
    if (f.kind === "extender") {
      if (l.x1 - l.x0 < lt.extenderMin * s) continue;
      const b = Math.max(l.x0, r), y = Math.min(l.x1, c);
      if (y <= b) continue;
      const v = lt.extenderThickness * s;
      i.push({ kind: "rect", x: b, y: h - v, width: y - b, height: v });
      continue;
    }
    const d = l.x1 - l.x0;
    if (d < lt.hyphenMinGap * s) continue;
    const p = lt.hyphenWidth * s, g = lt.hyphenThickness * s, m = Math.max(1, Math.floor(d / (lt.hyphenSpacing * s)));
    for (let b = 0; b < m; b++) {
      const y = l.x0 + d * (b + 0.5) / m;
      if (y < r || y >= c) continue;
      const v = Math.max(r + 0.1 * s, Math.min(c - 0.1 * s - p, y - p / 2));
      i.push({ kind: "rect", x: v, y: h - lt.hyphenRise * s - g / 2, width: p, height: g });
    }
  }
  return i;
}
function lc(e, t = null) {
  const n = Zi(e, t);
  return {
    measures: e.measures.map((s) => sn(s, Kn(e, n, s), e.staffTopY, e.ss)),
    baseline: n,
    bottom: ac(e, n)
  };
}
function fc(e, t, n) {
  let s = Number.NEGATIVE_INFINITY;
  if (!e.notes.some((o) => o.lyrics.length > 0)) return s;
  const i = new Map(t.map((o) => [o.id, o.bounds]));
  for (const o of Lt(e.notes)) {
    const a = as(o), r = a.length > 0 ? i.get(o[0].id) : void 0;
    if (!r) continue;
    const c = ro(r, o[0], n);
    for (const f of a)
      f.text !== "" && (s = Math.max(s, ao(f, c.left, c.width, n).right + oc(f) * n));
  }
  return s;
}
function ta(e, t, n, s, i) {
  return e.push({ kind: "glyph", glyph: t, x: n, y: s }), n + X[t].advance * i.ss;
}
function wt(e, t) {
  return t.staffTopY + 4 * t.ss - (e - t.lines.bottomLine) * (t.ss / 2);
}
function ea(e) {
  return e > 0 ? 1 : e < 0 ? -1 : 0;
}
function Ls(e, t, n, s, i = 0) {
  const { bBoxSW: o, bBoxNE: a } = X[e];
  return {
    x: t + o[0] * s - i * s,
    y: n - a[1] * s - i * s,
    width: (a[0] - o[0]) * s + i * 2 * s,
    height: (a[1] - o[1]) * s + i * 2 * s
  };
}
function qn(e, t, n, s, i) {
  let o = s, a = s + 4 * i;
  for (const r of e)
    if (r.kind === "rect")
      o = Math.min(o, r.y), a = Math.max(a, r.y + r.height);
    else if (r.kind === "curve")
      o = Math.min(o, r.y0, r.cy0, r.cy1, r.y1), a = Math.max(a, r.y0, r.cy0, r.cy1, r.y1);
    else if (r.kind === "text")
      o = Math.min(o, r.y - r.fontSizePx), a = Math.max(a, r.y + 0.3 * r.fontSizePx);
    else {
      const c = r.fontSizePx !== void 0 ? r.fontSizePx / (Xe * i) : 1, { bBoxSW: f, bBoxNE: l } = X[r.glyph];
      o = Math.min(o, r.y - l[1] * i * c), a = Math.max(a, r.y - f[1] * i * c);
    }
  return { x: t, y: o - Tn, width: n, height: a - o + Tn * 2 };
}
function na(e, t) {
  return e.map(
    (n) => n.kind === "curve" ? { ...n, y0: n.y0 + t, cy0: n.cy0 + t, cy1: n.cy1 + t, y1: n.y1 + t } : { ...n, y: n.y + t }
  );
}
function si(e, t) {
  return {
    index: e.index,
    staffIndex: e.staffIndex,
    region: { ...e.region, y: e.region.y + t },
    ops: na(e.ops, t),
    notes: e.notes.map((n) => ({
      id: n.id,
      bounds: { ...n.bounds, y: n.bounds.y + t }
    })),
    ...e.inkExtent ? { inkExtent: { top: e.inkExtent.top + t, bottom: e.inkExtent.bottom + t } } : {}
  };
}
function $s(e, t, n) {
  return t >= e.x && t <= e.x + e.width && n >= e.y && n <= e.y + e.height;
}
function hc(e, t, n) {
  for (const s of e.measures)
    if ($s(s.region, t, n)) {
      for (const i of s.notes)
        if ($s(i.bounds, t, n))
          return { noteId: i.id, measureIndex: s.index, staffIndex: s.staffIndex };
    }
  return null;
}
function Ff(e, t, n) {
  for (const s of e.measures)
    if ($s(s.region, t, n))
      return { staffIndex: s.staffIndex, measureIndex: s.index };
  return null;
}
function dc(e, t) {
  const n = e.measures.find((s) => s.notes.some((i) => i.id === t));
  return n ? n.region : null;
}
const uc = 0.6;
function pc(e, t, n) {
  if (!Number.isInteger(n) || n < 0) return null;
  const s = e.measures.filter((f) => f.staffIndex === t).length;
  if (s === 0 || n > s) return null;
  const i = n === s, o = e.measures.find(
    (f) => f.staffIndex === t && f.index === (i ? s - 1 : n)
  );
  if (!o) return null;
  const { region: a } = o, r = uc * e.staffSpacePx;
  return { x: i ? a.x + a.width - r : a.x - r / 2, y: a.y, width: r, height: a.height };
}
const oi = new URL(
  "./Bravura.woff2",
  import.meta.url
);
async function ii(e = oi, t = Ai) {
  if (typeof FontFace > "u" || typeof document > "u")
    throw new Error(
      "loadSmuflFont needs a browser document. In Node, register the font with the rasterizer directly (node-canvas: registerFont with an OTF copy of Bravura)."
    );
  try {
    await ai(t, e);
  } catch (n) {
    if (e !== oi) throw n;
    const { default: s } = await import("./Bravura-inline.js");
    await ai(t, s);
  }
  return t;
}
async function ai(e, t) {
  const n = new FontFace(e, `url(${JSON.stringify(String(t))})`);
  await n.load(), document.fonts.add(n);
}
const pe = {
  fontFamily: Ai,
  labelFontFamily: "sans-serif",
  foreground: "#111111",
  background: "#ffffff",
  selection: "#c2410c",
  playbackCursor: "#0369a1",
  measureRange: "rgba(37, 99, 235, 0.12)",
  seamMarker: "rgba(220, 38, 38, 0.45)"
};
var yt, Mt, vt, me, an, Fe, rn, We, ge, Oe, Z, Qn, Jn, Gs, sa, Ds, oa, _s, zs, Us, Ys, Zn;
class mc {
  constructor(t, n, s = {}) {
    z(this, Z);
    z(this, yt);
    z(this, Mt);
    z(this, vt);
    z(this, me, null);
    /** The note ids currently under the playback cursor (M4 Slice 2), e.g. every
     *  note of a chord/multi-voice onset sounding at once. Empty, not `null`,
     *  when nothing is highlighted, since `setPlaybackCursor` always takes an
     *  array (possibly empty) rather than a nullable single id like
     *  `setSelection` does: a cursor is inherently a set, a selection is not. */
    z(this, an, /* @__PURE__ */ new Set());
    /** The current measure range (M5 Slice 4), always stored normalized
     *  (`from <= to`), or `null` when no range is active. */
    z(this, Fe, null);
    /** The host's seam marker list (M5 Slice 6), exactly as last handed to
     *  `setSeamMarkers`. Kept alongside `#seamStrips` so a `setLayout` can
     *  re-resolve the same boundaries against the new geometry. */
    z(this, rn, []);
    /** `#seamMarkers` resolved to strips against the current layout, with
     *  boundaries that do not exist in it dropped. Cached rather than resolved
     *  per paint so a region-scoped redraw stays a cheap rect intersection per
     *  marker, not a measure search per marker. */
    z(this, We, []);
    /** The visible window (M6 Slice 11), in layout coordinates, or `null` to
     *  treat the whole layout as visible. See `setViewport`. */
    z(this, ge, null);
    /** Per-staff ink colours (M8 Slice 3), keyed by `staffIndex`. A staff
     *  absent from the map paints in `foreground`. */
    z(this, Oe, /* @__PURE__ */ new Map());
    /**
     * Measure indices painted by the most recent draw call, in the order they
     * were painted.
     *
     * This exists for testing, not for the host app. "Only the touched measure
     * redraws" is the claim Phase 0 has to substantiate, and a wall-clock number
     * cannot substantiate it: a fast redraw might still be repainting everything
     * on a small score. This makes the claim a property that can be asserted in
     * CI on any machine.
     */
    ht(this, "lastRedrawnMeasures", []);
    /** Regions cleared and repainted by the most recent draw call. */
    ht(this, "lastRedrawnRegions", []);
    $(this, yt, t), $(this, vt, n), $(this, Mt, {
      fontFamily: s.fontFamily ?? pe.fontFamily,
      labelFontFamily: s.labelFontFamily ?? pe.labelFontFamily,
      foreground: s.foreground ?? pe.foreground,
      background: s.background === void 0 ? pe.background : s.background,
      selection: s.selection ?? pe.selection,
      playbackCursor: s.playbackCursor ?? pe.playbackCursor,
      measureRange: s.measureRange ?? pe.measureRange,
      seamMarker: s.seamMarker ?? pe.seamMarker
    });
  }
  get layout() {
    return u(this, vt);
  }
  /**
   * Swap in a new layout without redrawing.
   *
   * After an edit the caller re-lays-out the score, installs the new layout,
   * then redraws only the measures the edit reported. Splitting "install" from
   * "draw" is what makes that possible; a `render(layout)` API would force a
   * full repaint on every layout change, which is exactly OSMD's shape.
   */
  setLayout(t) {
    $(this, vt, t), $(this, We, C(this, Z, Gs).call(this));
  }
  get selectedNoteId() {
    return u(this, me);
  }
  /**
   * Change the selection, returning the `(staffIndex, index)` pairs whose
   * appearance changed so the caller can redraw exactly those. Selection is a
   * render-time concern, not a model one: nothing about the music changes
   * when a user clicks a note.
   *
   * Fixed in M4 Slice 1: this used to return bare measure indices, and a
   * caller feeding that straight into `redrawMeasures` (which defaults
   * `staffIndex` to 0) would repaint staff 0's same-numbered measure instead
   * of the staff the selection actually changed on, since each staff numbers
   * its own measures from 0 (see `LaidOutMeasure.staffIndex`'s own doc
   * comment). That was silent as long as every score had one staff; on a
   * multi-staff one it left the true change unpainted and vandalised an
   * unrelated measure's pixels instead. Returning the pair the note actually
   * lives on removes the ambiguity at the source rather than trusting every
   * caller to know which staff a note came from.
   */
  setSelection(t) {
    if (t === u(this, me)) return [];
    const n = /* @__PURE__ */ new Map();
    for (const s of [u(this, me), t]) {
      if (s === null) continue;
      const i = u(this, vt).measures.find((o) => o.notes.some((a) => a.id === s));
      i && n.set(`${i.staffIndex}:${i.index}`, {
        staffIndex: i.staffIndex,
        index: i.index
      });
    }
    return $(this, me, t), [...n.values()];
  }
  /**
   * Change the playback cursor to `noteIds`, returning the `(staffIndex,
   * index)` pairs whose appearance changed so the caller can redraw exactly
   * those. Mirrors `setSelection` above, but over a *set* of ids rather than
   * one: a chord or a simultaneous multi-voice onset (see `OnsetEvent`'s own
   * doc comment in `src/playback/timeline.ts`, one event per note, never one
   * event for several) highlights several notes across possibly several
   * staves at the same instant, so a single nullable id cannot represent it.
   *
   * Like `setSelection`, this does not try to be clever about only returning
   * notes whose highlight state actually changed: it unions "measure of
   * every old id" with "measure of every new id", deduplicated by
   * `(staffIndex, index)`. A note present in both the old and new set still
   * has its measure returned, which is harmless (that measure repaints to
   * the same appearance it already had) and keeps this method's logic a
   * straight mirror of `setSelection`'s rather than a second, subtly
   * different diff algorithm.
   */
  setPlaybackCursor(t) {
    const n = new Set(t), s = /* @__PURE__ */ new Map();
    for (const i of [...u(this, an), ...n]) {
      const o = u(this, vt).measures.find((a) => a.notes.some((r) => r.id === i));
      o && s.set(`${o.staffIndex}:${o.index}`, {
        staffIndex: o.staffIndex,
        index: o.index
      });
    }
    return $(this, an, n), [...s.values()];
  }
  get measureRange() {
    return u(this, Fe);
  }
  /**
   * Change the measure range (M5 Slice 4), returning the `(staffIndex,
   * index)` pairs whose membership changed so the caller can redraw exactly
   * those. `null` clears the range. `from`/`to` may arrive in either order
   * (a drag leftwards from its anchor produces `from > to`) and are
   * normalized here, so callers never have to.
   *
   * Same diff-and-return shape as `setSelection` and `setPlaybackCursor`
   * above, with one deliberate difference: this returns *only* the
   * symmetric difference of the old and new member sets, not their union.
   * Those two can afford the union because they touch a handful of
   * measures at most; a range can span a whole staff, and growing a
   * twenty-measure range by one bar should repaint one measure, not
   * twenty-one. A measure that stays in the range keeps its tint, so
   * repainting it would be pure waste. Pairs are deduplicated by
   * `staffIndex:index` and limited to measures that actually exist in the
   * current layout, so an out-of-bounds `to` never yields a pair
   * `redrawMeasure` would silently ignore anyway. Setting the same range
   * again returns `[]`.
   */
  setMeasureRange(t) {
    const n = t === null ? null : {
      staffIndex: t.staffIndex,
      from: Math.min(t.from, t.to),
      to: Math.max(t.from, t.to)
    }, s = (r) => {
      const c = /* @__PURE__ */ new Set();
      if (r === null) return c;
      for (const f of u(this, vt).measures)
        f.staffIndex === r.staffIndex && f.index >= r.from && f.index <= r.to && c.add(`${f.staffIndex}:${f.index}`);
      return c;
    }, i = s(u(this, Fe)), o = s(n);
    $(this, Fe, n);
    const a = [];
    for (const r of u(this, vt).measures) {
      const c = `${r.staffIndex}:${r.index}`;
      i.has(c) !== o.has(c) && a.push({ staffIndex: r.staffIndex, index: r.index });
    }
    return a;
  }
  get staffColors() {
    return u(this, Oe);
  }
  /**
   * Paint every measure of a staff in its own ink colour (M8 Slice 3), e.g.
   * a muted voice part dimmed to grey, or `null` to put every staff back in
   * `foreground`. Keys are `staffIndex`; a staff left out keeps `foreground`.
   *
   * All of a measure's ops take the colour, staff lines and barlines
   * included, so a dimmed part reads as one faded band rather than faded
   * notes on full-strength lines. Selection and the playback cursor still
   * win over it per note, as they win over `foreground`. `partDecorations`
   * (braces, brackets, part names) belong to no single staff and keep
   * `foreground`; a barline shared down into the next staff belongs to the
   * upper staff's measure and takes that staff's colour.
   *
   * Like `setMeasureRange`, this does not paint: it returns the
   * `(staffIndex, index)` pairs of every measure on a staff whose colour
   * changed, for the caller to redraw (or call `drawAll`). No relayout is
   * involved, and the colours persist across `setLayout`.
   */
  setStaffColors(t) {
    const n = u(this, Oe), s = new Map(t ?? []);
    return $(this, Oe, s), u(this, vt).measures.filter((i) => n.get(i.staffIndex) !== s.get(i.staffIndex)).map((i) => ({ staffIndex: i.staffIndex, index: i.index }));
  }
  get viewport() {
    return u(this, ge);
  }
  /**
   * Limit painting to the part of the layout the host actually shows (M6
   * Slice 11), or `null` (the default) to paint the whole layout at its own
   * coordinates, as before this existed.
   *
   * A canvas big enough for a whole real score does not work: the largest
   * real score tried lays out about 79,000 CSS px tall, past the ~32k
   * device-pixel ceiling browsers allow a canvas, so the backing store had
   * to drop well below 1x density, and compositing it cost 33-65ms per
   * selection click. With a viewport the host can size its canvas to the
   * visible window instead: the renderer translates every draw by
   * `-viewport.x, -viewport.y` (on top of whatever transform the host
   * already set, e.g. its pixel-ratio scale), `drawAll` paints only the
   * measures intersecting the window, and
   * `redrawMeasure`/`redrawMeasures` skip a measure outside it entirely,
   * since none of its pixels exist on the canvas. A skipped measure needs
   * no bookkeeping: the host repaints with `drawAll` whenever it moves the
   * viewport, which picks up the measure's current ops and state then.
   *
   * Like `setLayout`, this does not paint: the host moves the viewport and
   * then calls `drawAll`. Draws are not clipped to the window here, because
   * the canvas edge already clips a measure that is only partly visible.
   */
  setViewport(t) {
    $(this, ge, t === null ? null : { ...t });
  }
  get seamMarkers() {
    return u(this, rn);
  }
  /**
   * Replace the seam marker list (M5 Slice 6): a thin vertical strip at each
   * listed measure boundary, laid over the score. `[]` clears them. Takes
   * effect on the next `drawAll()`, the same way `partDecorations` only ever
   * paint there; unlike `setSelection`/`setMeasureRange` there are no
   * affected measures to return, because a strip reaches outside every
   * measure's region (into the margin at a system start or the final
   * barline), so no set of `redrawMeasure` calls could fully erase a removed
   * one. Seams are set rarely (once per loaded scan mapping, say), so a full
   * repaint is the honest cost.
   *
   * Markers are render state only, like the selection: never part of the
   * model, never persisted, never exported. Boundaries that do not exist in
   * the current layout are kept in the list but simply not drawn, and every
   * `setLayout` re-resolves the list against the new geometry, so markers
   * follow a rescale or a re-cast without the host calling this again.
   *
   * Like `partDecorations`, strips live outside every measure's own `ops`
   * and `region`, so a marker never inflates a region. Unlike
   * `partDecorations`, a strip does overlap measure regions (it straddles
   * the barline it marks), so `redrawMeasure`/`redrawMeasures` must not just
   * leave markers alone: after repainting a measure they repaint the part of
   * every strip that falls inside that measure's region, clipped to it. The
   * part outside is never cleared, so it never needs repainting either.
   */
  setSeamMarkers(t) {
    $(this, rn, t.map(({ staffIndex: n, boundaryIndex: s }) => ({ staffIndex: n, boundaryIndex: s }))), $(this, We, C(this, Z, Gs).call(this));
  }
  /** Repaint the whole score (or, with a viewport, all of it that is
   *  visible). The baseline the region-scoped path is measured against. */
  drawAll() {
    this.lastRedrawnMeasures = [], this.lastRedrawnRegions = [], C(this, Z, Jn).call(this, () => C(this, Z, sa).call(this));
  }
  /**
   * Repaint one measure and nothing else.
   *
   * Clearing the measure's region wipes its staff lines, barline and (for
   * measure 0) its clef and signatures along with its notes, and drawing its
   * ops puts all of them back, because layout assigns every one of those to
   * the measure that owns the pixels. Neighbouring measures are untouched
   * because regions never overlap horizontally.
   *
   * `staffIndex` (M2 Slice 3, default 0) completes the `(staffIndex, index)`
   * pair `LaidOutMeasure` now carries, so a multi-staff layout redraws
   * exactly one staff's one measure, leaving every other staff's own
   * measures (which may well reuse the same `index`, since each staff
   * numbers its own measures from 0) untouched. Every call site from before
   * this slice omits it and keeps redrawing staff 0, exactly as before.
   */
  redrawMeasure(t, n = 0) {
    this.lastRedrawnMeasures = [], this.lastRedrawnRegions = [], C(this, Z, Jn).call(this, () => C(this, Z, Ds).call(this, t, n));
  }
  /** Repaint several measures of one staff, e.g. when moving a selection
   *  between them. See `redrawMeasure`'s own comment on `staffIndex`. */
  redrawMeasures(t, n = 0) {
    this.lastRedrawnMeasures = [], this.lastRedrawnRegions = [], C(this, Z, Jn).call(this, () => {
      for (const s of t) C(this, Z, Ds).call(this, s, n);
    });
  }
}
yt = new WeakMap(), Mt = new WeakMap(), vt = new WeakMap(), me = new WeakMap(), an = new WeakMap(), Fe = new WeakMap(), rn = new WeakMap(), We = new WeakMap(), ge = new WeakMap(), Oe = new WeakMap(), Z = new WeakSet(), /** True when `rect` has some area inside the viewport (always, without one). */
Qn = function(t) {
  const n = u(this, ge);
  return n === null ? !0 : t.x < n.x + n.width && t.x + t.width > n.x && t.y < n.y + n.height && t.y + t.height > n.y;
}, /** Run `paint` in layout coordinates: translated to the viewport's origin
 *  when there is one, and with the context's state restored afterwards. */
Jn = function(t) {
  const n = u(this, ge);
  if (n === null) {
    t();
    return;
  }
  u(this, yt).save(), u(this, yt).translate(-n.x, -n.y);
  try {
    t();
  } finally {
    u(this, yt).restore();
  }
}, Gs = function() {
  const t = [];
  for (const { staffIndex: n, boundaryIndex: s } of u(this, rn)) {
    const i = pc(u(this, vt), n, s);
    i && t.push(i);
  }
  return t;
}, sa = function() {
  C(this, Z, Us).call(this, u(this, ge) ?? {
    x: 0,
    y: 0,
    width: u(this, vt).width,
    height: u(this, vt).height
  }), u(this, yt).font = `${u(this, vt).fontSizePx}px "${u(this, Mt).fontFamily}"`, u(this, yt).textBaseline = "alphabetic";
  for (const n of u(this, vt).measures)
    C(this, Z, Qn).call(this, n.region) && (C(this, Z, _s).call(this, n.staffIndex, n.index) && C(this, Z, zs).call(this, n.region), C(this, Z, Zn).call(this, n.ops, C(this, Z, Ys).call(this, n.staffIndex)), this.lastRedrawnMeasures.push(n.index), this.lastRedrawnRegions.push(n.region));
  C(this, Z, Zn).call(this, u(this, vt).partDecorations);
  const t = u(this, We).filter((n) => C(this, Z, Qn).call(this, n));
  if (t.length > 0) {
    u(this, yt).fillStyle = u(this, Mt).seamMarker;
    for (const n of t) u(this, yt).fillRect(n.x, n.y, n.width, n.height);
  }
}, Ds = function(t, n) {
  const s = u(this, vt).measures.find((i) => i.staffIndex === n && i.index === t);
  !s || !C(this, Z, Qn).call(this, s.region) || (C(this, Z, Us).call(this, s.region), C(this, Z, _s).call(this, n, t) && C(this, Z, zs).call(this, s.region), u(this, yt).font = `${u(this, vt).fontSizePx}px "${u(this, Mt).fontFamily}"`, u(this, yt).textBaseline = "alphabetic", C(this, Z, Zn).call(this, s.ops, C(this, Z, Ys).call(this, n)), C(this, Z, oa).call(this, s.region), this.lastRedrawnMeasures.push(t), this.lastRedrawnRegions.push(s.region));
}, /**
 * Repaint the part of every seam strip that overlaps `region` (M5 Slice 6),
 * after that region was just cleared and repainted. A strip is a plain
 * rectangle, so "clipped to the region" is a rectangle intersection, not a
 * canvas clip path: every call this makes stays inside `region`, keeping
 * a scoped redraw's "touches no pixel outside the measure" property exact.
 * Painted fresh over a freshly cleared background, so a translucent
 * `seamMarker` colour never accumulates across repeated redraws.
 */
oa = function(t) {
  let n = !1;
  for (const s of u(this, We)) {
    const i = Math.max(s.x, t.x), o = Math.min(s.x + s.width, t.x + t.width), a = Math.max(s.y, t.y), r = Math.min(s.y + s.height, t.y + t.height);
    o <= i || r <= a || (n || (u(this, yt).fillStyle = u(this, Mt).seamMarker, n = !0), u(this, yt).fillRect(i, a, o - i, r - a));
  }
}, _s = function(t, n) {
  const s = u(this, Fe);
  return s !== null && s.staffIndex === t && n >= s.from && n <= s.to;
}, /**
 * Tint one range measure's region (M5 Slice 4): a translucent fill laid
 * over the freshly painted background and *under* the measure's ops, so
 * every ink op still draws on top at full strength.
 *
 * A background fill rather than an ink recolour, deliberately. Note
 * selection and the playback cursor both recolour ink (see `#drawOps`),
 * so a third ink colour would compete with them for the same pixels and
 * need its own precedence rule; a background tint occupies a different
 * layer entirely, so a selected or cursor-highlighted note inside the
 * range keeps its own ink colour and the range still reads as a range.
 * It stays region-scoped for the same reason the background does: it
 * fills exactly `measure.region`, and regions never overlap.
 */
zs = function(t) {
  u(this, yt).fillStyle = u(this, Mt).measureRange, u(this, yt).fillRect(t.x, t.y, t.width, t.height);
}, Us = function(t) {
  if (u(this, Mt).background === null) {
    u(this, yt).clearRect(t.x, t.y, t.width, t.height);
    return;
  }
  u(this, yt).fillStyle = u(this, Mt).background, u(this, yt).fillRect(t.x, t.y, t.width, t.height);
}, /** The ink a staff's measures paint in when no highlight applies. */
Ys = function(t) {
  return u(this, Oe).get(t) ?? u(this, Mt).foreground;
}, Zn = function(t, n = u(this, Mt).foreground) {
  const s = u(this, yt);
  let i = "";
  for (const o of t) {
    const a = o.noteId !== void 0 && u(this, an).has(o.noteId) ? u(this, Mt).playbackCursor : o.noteId !== void 0 && o.noteId === u(this, me) ? u(this, Mt).selection : n;
    if (a !== i && (s.fillStyle = a, s.strokeStyle = a, i = a), o.kind === "rect")
      s.fillRect(o.x, o.y, o.width, o.height);
    else if (o.kind === "curve")
      s.lineWidth = o.thickness, s.beginPath(), s.moveTo(o.x0, o.y0), s.bezierCurveTo(o.cx0, o.cy0, o.cx1, o.cy1, o.x1, o.y1), s.stroke();
    else if (o.kind === "text") {
      if (s.font = `${o.fontStyle ? `${o.fontStyle} ` : ""}${o.fontSizePx}px ${u(this, Mt).labelFontFamily}`, o.clip)
        s.save(), s.beginPath(), s.rect(o.clip.x, o.y - 2 * o.fontSizePx, o.clip.width, 3 * o.fontSizePx), s.clip(), s.fillText(o.text, o.x, o.y), s.restore();
      else if (o.align === "center") {
        const r = s.textAlign;
        s.textAlign = "center", s.fillText(o.text, o.x, o.y), s.textAlign = r;
      } else
        s.fillText(o.text, o.x, o.y);
      s.font = `${u(this, vt).fontSizePx}px "${u(this, Mt).fontFamily}"`;
    } else o.fontSizePx !== void 0 ? (s.font = `${o.fontSizePx}px "${u(this, Mt).fontFamily}"`, s.fillText(String.fromCodePoint(X[o.glyph].codepoint), o.x, o.y), s.font = `${u(this, vt).fontSizePx}px "${u(this, Mt).fontFamily}"`) : s.fillText(String.fromCodePoint(X[o.glyph].codepoint), o.x, o.y);
  }
};
function gc(e, t) {
  return e * 4 * (60 / t);
}
function bc(e) {
  var h;
  const t = Math.max(0, ...e.staves.map((d) => d.measures.length)), n = ((h = e.staves[0]) == null ? void 0 : h.measures) ?? [], s = /* @__PURE__ */ new Map();
  for (const d of e.endings())
    for (let p = d.first; p <= d.last; p++) s.set(p, { numbers: d.start.numbers, last: d.last });
  const i = (d) => {
    var p;
    return Math.max(1, ((p = n[d]) == null ? void 0 : p.repeatTimes) ?? 2);
  }, o = Math.max(2, ...n.map((d, p) => i(p))), a = t * (o + 1), r = [];
  let c = 0, f = 1, l = 0;
  for (; l < t && r.length < a; ) {
    const d = n[l];
    (d == null ? void 0 : d.startBarline) === "repeatStart" && l !== c && (c = l, f = 1);
    const p = s.get(l);
    if (p && !p.numbers.includes(f)) {
      l = p.last + 1;
      continue;
    }
    if (r.push({ measureIndex: l, pass: f }), (d == null ? void 0 : d.endBarline) === "repeatEnd") {
      if (f < i(l)) {
        f++, l = c;
        continue;
      }
      c = l + 1, f = 1;
    } else p && p.last === l && f > 1 && (c = l + 1, f = 1);
    l++;
  }
  return r;
}
const yc = 0.5, vc = 0.25, xc = 0.75, Sc = 1.3, wc = 1.5, Mc = 2, en = {
  pppppp: 0.1,
  ppppp: 0.14,
  pppp: 0.18,
  ppp: 0.25,
  pp: 0.35,
  p: 0.5,
  mp: 0.62,
  mf: 0.75,
  f: 0.88,
  ff: 1,
  fff: 1.1,
  ffff: 1.2,
  fffff: 1.3,
  ffffff: 1.4
}, kc = {
  sf: { attack: 1 },
  sfz: { attack: 1 },
  fz: { attack: 1 },
  rf: { attack: 1 },
  rfz: { attack: 1 },
  sffz: { attack: 1.1 },
  fp: { attack: 0.88, hold: "p" },
  sfp: { attack: 1, hold: "p" },
  sfpp: { attack: 1, hold: "pp" },
  sfzp: { attack: 1, hold: "p" }
}, Ec = 0.05, Tc = 1 / 2, Ic = 2 / 3, Bc = 1 / 32, Nc = 1 / 2, Ac = 3 / 4;
function Cc(e, t) {
  const n = t.durationWholes, s = e.length === 1 && !e[0].grace.slash, i = e.map((r) => {
    const c = r.grace.stealTimeFollowing;
    return c !== null ? Math.max(0, c) / 100 * n : s ? n * (t.dots > 0 ? Ic : Tc) : Math.min(Bc, n * Nc / e.length);
  }), o = i.reduce((r, c) => r + c, 0), a = n * Ac;
  return o > a && o > 0 ? i.map((r) => r * a / o) : i;
}
const Pc = ki.filter((e) => en[e] !== void 0);
function ri(e, t) {
  const n = Pc.map((s) => en[s]);
  return t > 0 ? n.find((s) => s > e + 1e-9) ?? e : [...n].reverse().find((s) => s < e - 1e-9) ?? e;
}
function Fc(e, t, n, s) {
  const i = e.staves[t], o = [];
  n.forEach(({ measureIndex: d }, p) => {
    var g;
    for (const m of ((g = i.measures[d]) == null ? void 0 : g.dynamics) ?? []) o.push({ x: s[p] + m.onset, kind: m.kind });
  });
  const a = [];
  for (const d of e.wedges)
    d.staffIndex === t && n.forEach(({ measureIndex: p }, g) => {
      if (p === d.start.measureIndex)
        for (let m = g; m < n.length; m++) {
          if (m > g && n[m].measureIndex <= n[m - 1].measureIndex) return;
          if (n[m].measureIndex === d.stop.measureIndex) {
            a.push({ kind: d.kind, start: s[g] + d.start.onset, stop: s[m] + d.stop.onset });
            return;
          }
        }
    });
  if (a.sort((d, p) => d.start - p.start), o.length === 0 && a.length === 0) return null;
  o.sort((d, p) => d.x - p.x);
  const r = [], c = /* @__PURE__ */ new Map();
  let f = 1;
  for (const { x: d, kind: p } of o) {
    const g = en[p], m = kc[p];
    g !== void 0 ? f = g : m ? (c.set(Math.round(d * 1e9), m.attack), m.hold && (f = en[m.hold])) : p === "pf" ? f = ri(f, 1) : p === "n" && (f = Ec), r.push({ x: d, level: f });
  }
  const l = (d) => {
    let p = 1;
    for (const g of r) {
      if (g.x > d + 1e-9) break;
      p = g.level;
    }
    return p;
  }, h = a.map((d, p) => {
    var v;
    const g = l(d.start), m = ((v = a[p + 1]) == null ? void 0 : v.start) ?? Number.POSITIVE_INFINITY, b = o.find(
      (S) => S.x >= d.stop - 1e-9 && S.x < m - 1e-9 && en[S.kind] !== void 0
    ), y = b ? en[b.kind] : ri(g, d.kind === "crescendo" ? 1 : -1);
    return { ...d, from: g, to: y };
  });
  return (d) => {
    const p = c.get(Math.round(d * 1e9));
    if (p !== void 0) return p;
    let g;
    for (const b of r) {
      if (b.x > d + 1e-9) break;
      g = b;
    }
    let m;
    for (const b of h) {
      if (b.start > d + 1e-9) break;
      m = b;
    }
    return m && (!g || g.x <= m.start + 1e-9) ? d >= m.stop ? m.to : m.from + (m.to - m.from) * (d - m.start) / (m.stop - m.start) : (g == null ? void 0 : g.level) ?? 1;
  };
}
function Wc(e) {
  return e.includes("staccatissimo") ? vc : e.includes("staccato") ? yc : e.includes("detached-legato") ? xc : 1;
}
function Oc(e) {
  return e.includes("strong-accent") ? wc : e.includes("accent") ? Sc : 1;
}
function ia(e) {
  const t = Math.max(0, ...e.staves.map((s) => s.measures.length)), n = [];
  for (let s = 0; s < t; s++) {
    let i = 0;
    for (const o of e.staves) {
      const a = o.measures[s];
      if (!a) continue;
      const r = /* @__PURE__ */ new Map();
      for (const [c] of Lt(a.notes))
        r.set(c.voice, (r.get(c.voice) ?? 0) + c.durationWholes);
      i = Math.max(i, ...r.values());
    }
    n.push(i > 0 ? i : Mi(e.timeAt(s)));
  }
  return n;
}
function Rc(e, t, n) {
  const s = [];
  for (const o of e.staves)
    for (let a = 0; a < t.length; a++) {
      const r = o.measures[t[a].measureIndex];
      if (!r) continue;
      const c = /* @__PURE__ */ new Map();
      for (const f of Lt(r.notes)) {
        const l = f[0], h = c.get(l.voice) ?? n[a], d = h + l.durationWholes;
        c.set(l.voice, d), Zs(f) !== null && d > h && s.push([h, d]);
      }
    }
  if (s.length === 0) return (o) => o;
  s.sort((o, a) => o[0] - a[0]);
  const i = [];
  for (const [o, a] of s) {
    const r = i[i.length - 1];
    r && o <= r[1] ? r[1] = Math.max(r[1], a) : i.push([o, a]);
  }
  return (o) => {
    let a = 0;
    for (const [r, c] of i) {
      if (o <= r) break;
      a += (Math.min(o, c) - r) * (Mc - 1);
    }
    return o + a;
  };
}
function Lc(e) {
  const t = /* @__PURE__ */ new Set();
  for (const n of e.measures)
    for (const s of n.notes)
      t.add(s.voice);
  return [...t];
}
function $c(e) {
  const t = e.tempoBpm, n = [], s = bc(e), i = ia(e), o = [];
  let a = 0;
  for (const { measureIndex: l } of s)
    o.push(a), a += i[l];
  const r = s.some((l, h) => l.measureIndex !== h) || s.length !== i.length, c = Rc(e, s, o), f = (l) => gc(l, t);
  for (const l of e.staves) {
    const h = Fc(e, l.index, s, o);
    for (const d of Lc(l)) {
      let p = 0, g = /* @__PURE__ */ new Map(), m = [];
      for (let b = 0; b < s.length; b++) {
        const y = l.measures[s[b].measureIndex];
        if (!y) continue;
        b > 0 && s[b].measureIndex !== s[b - 1].measureIndex + 1 && (g = /* @__PURE__ */ new Map());
        const v = r ? { playIndex: b } : {};
        p = o[b];
        const S = /* @__PURE__ */ new Map(), w = [];
        for (const T of hs(y.notes))
          T.voice === d && (T.principal ? S.set(T.principal.id, T.notes) : w.push(...T.notes));
        for (const T of Lt(y.notes)) {
          const x = T[0];
          if (x.voice !== d) continue;
          const P = /* @__PURE__ */ new Map(), N = Js(T), F = h ? h(p) : 1, U = [...m, ...S.get(x.id) ?? []];
          m = [];
          let _ = 0;
          if (U.length > 0) {
            const W = Cc(U, x);
            U.forEach((Y, j) => {
              const D = p + _, I = D + W[j], k = f(c(D));
              n.push({
                noteId: Y.id,
                pitch: Y.pitch,
                startSeconds: k,
                durationSeconds: f(c(I)) - k,
                ...F !== 1 ? { velocity: F } : {},
                ...v
              }), _ = I - p;
            });
          }
          const B = f(c(p + _)), M = f(c(p + x.durationWholes)) - B, G = Oc(N) * F;
          for (const W of T) {
            if (W.isRest) continue;
            const Y = M * Wc(N), j = g.get(W.id);
            let D;
            if (j !== void 0) {
              const I = n[j];
              n[j] = { ...I, durationSeconds: I.durationSeconds + Y }, D = j;
            } else
              n.push({
                noteId: W.id,
                // Non-null: rests were skipped above.
                pitch: W.pitch,
                startSeconds: B,
                durationSeconds: Y,
                ...G !== 1 ? { velocity: G } : {},
                ...v
              }), D = n.length - 1;
            W.tiedToId !== null && P.set(W.tiedToId, D);
          }
          g = P, p += x.durationWholes;
        }
        m.push(...w);
      }
    }
  }
  return n;
}
function Gc(e, t) {
  let n;
  for (const s of e)
    s.noteId === t && (n === void 0 || s.startSeconds < n) && (n = s.startSeconds);
  return n;
}
const Dc = 0.1, _c = 25;
class zc {
  constructor(t) {
    ht(this, "events");
    ht(this, "getCurrentTime");
    ht(this, "onSchedule");
    ht(this, "onTick");
    ht(this, "lookaheadSeconds");
    ht(this, "intervalMs");
    ht(this, "scheduledIndices", /* @__PURE__ */ new Set());
    ht(this, "timer", null);
    this.events = t.events, this.getCurrentTime = t.getCurrentTime, this.onSchedule = t.onSchedule, this.onTick = t.onTick, this.lookaheadSeconds = t.lookaheadSeconds ?? Dc, this.intervalMs = t.intervalMs ?? _c;
  }
  /**
   * One pass: call `onSchedule` for every not-yet-scheduled event whose
   * `startSeconds` falls at or before `getCurrentTime() + lookaheadSeconds`.
   * Exposed directly (rather than only reachable through `start()`'s
   * `setInterval` loop) so tests can drive the scheduler deterministically
   * with a fake clock and explicit `tick()` calls, with no real timer
   * involved at all.
   *
   * This makes no distinction between an event that just became due and one
   * that was already due before this `tick()` (e.g. the scheduler was
   * constructed, or `start()` was called, after playback had logically
   * already begun): the same `startSeconds <= horizon` check covers both, so
   * an event with a past `startSeconds` is scheduled on the very next
   * `tick()` exactly like one just entering the window, never skipped or
   * specially deferred.
   */
  tick() {
    var n;
    const t = this.getCurrentTime() + this.lookaheadSeconds;
    for (let s = 0; s < this.events.length; s++) {
      if (this.scheduledIndices.has(s)) continue;
      const i = this.events[s];
      i.startSeconds <= t && (this.scheduledIndices.add(s), this.onSchedule(i));
    }
    (n = this.onTick) == null || n.call(this);
  }
  /**
   * Starts a real `setInterval`-driven loop calling `tick()` every
   * `intervalMs`. Plain Node/browser `setInterval`, nothing DOM-specific:
   * this repo's test suite runs with no jsdom (see `vite.config.ts`), so this
   * method deliberately needs nothing beyond the global `setInterval`/
   * `clearInterval` every JS runtime, browser or Node, already provides.
   * Idempotent: calling `start()` again while already running is a no-op
   * rather than layering a second interval on top.
   */
  start() {
    this.timer === null && (this.timer = setInterval(() => this.tick(), this.intervalMs));
  }
  /** Stops the driving loop started by `start()`. Idempotent (safe to call
   *  when not started). */
  stop() {
    this.timer !== null && (clearInterval(this.timer), this.timer = null);
  }
  /**
   * Clears the "already scheduled" bookkeeping so the next `tick()` treats
   * every event as not-yet-scheduled again, without affecting `start()`'s
   * running timer (if any) or the `events` list itself. Not used by this
   * slice, but deliberately present for a later slice's benefit: Slice 5's
   * transport controls will want a seek to re-evaluate a fresh "not yet
   * scheduled" set from an arbitrary clock position, and `reset()` is the
   * hook that lets a future caller do that without reworking this class's
   * internals (the "already scheduled" state is already isolated to exactly
   * this one `Set`, so clearing it is the whole operation).
   */
  reset() {
    this.scheduledIndices.clear();
  }
}
function Uc(e) {
  return 440 * 2 ** ((e - 69) / 12);
}
function Yc(e) {
  return Uc(Da(e));
}
const jc = 0.01, Vc = 0.05, Hc = 0.2;
function Xc(e, t, n) {
  const s = e + t;
  if (s <= n)
    return { attack: e, release: t };
  const i = s > 0 ? n / s : 0;
  return { attack: e * i, release: t * i };
}
function Kc(e, t) {
  const { audioContext: n } = t, s = t.attackSeconds ?? jc, i = t.releaseSeconds ?? Vc, o = (t.gain ?? Hc) * (e.velocity ?? 1), a = e.startSeconds, r = e.startSeconds + e.durationSeconds, { attack: c, release: f } = Xc(s, i, e.durationSeconds), l = n.createOscillator();
  l.type = "triangle", l.frequency.setValueAtTime(Yc(e.pitch), a);
  const h = n.createGain();
  return h.gain.setValueAtTime(0, a), h.gain.linearRampToValueAtTime(o, a + c), h.gain.setValueAtTime(o, r - f), h.gain.linearRampToValueAtTime(0, r), l.connect(h), h.connect(n.destination), l.start(a), l.stop(r), { oscillator: l, gain: h };
}
class qc {
  constructor(t) {
    ht(this, "events");
    ht(this, "audioContext");
    ht(this, "synthesisOptions");
    ht(this, "lookaheadSeconds");
    ht(this, "intervalMs");
    ht(this, "onOnset");
    ht(this, "onEnd");
    ht(this, "endSeconds");
    ht(this, "basePosition", 0);
    ht(this, "baseAudioTime", null);
    ht(this, "playing", !1);
    ht(this, "scheduler", null);
    ht(this, "activeOscillators", /* @__PURE__ */ new Set());
    this.events = t.events, this.audioContext = t.audioContext, this.synthesisOptions = t.synthesisOptions ?? {}, this.lookaheadSeconds = t.lookaheadSeconds, this.intervalMs = t.intervalMs, this.onOnset = t.onOnset, this.onEnd = t.onEnd, this.endSeconds = this.events.reduce((n, s) => Math.max(n, s.startSeconds + s.durationSeconds), 0);
  }
  /** True while the engine is actively scheduling/sounding events. Turns
   *  false on its own once playback reaches `durationSeconds`. */
  get isPlaying() {
    return this.playing;
  }
  /** Where the last note ends, in piece-time seconds: the piece's length. */
  get durationSeconds() {
    return this.endSeconds;
  }
  /** Elapsed position in the piece, in seconds. 0 at construction, frozen
   *  while paused/stopped, advancing in real time while playing. Also used
   *  internally by pause() to capture the frozen position, and is this
   *  slice's position-query half of the "playback position hook" alongside
   *  `onOnset` (see the class-level doc comment above). */
  get positionSeconds() {
    return this.baseAudioTime === null ? this.basePosition : this.basePosition + (this.audioContext.currentTime - this.baseAudioTime);
  }
  /**
   * Starts (or resumes) playback from `positionSeconds` (0 initially, or
   * wherever a prior `pause()`/`seek()` left it). A no-op if already
   * playing.
   *
   * Builds a fresh `LookaheadScheduler` over the subset of `events` still
   * ahead of the resume point (`startSeconds >= basePosition`), each
   * remapped from piece-time to real audio-context time by shifting its
   * `startSeconds` by the same offset that maps `basePosition` to
   * `audioContext.currentTime`. See `seek()`'s own doc comment for why this
   * same "drop anything already past" filter is also the correct behaviour
   * for a seek into the middle of the timeline, not just an incidental
   * consequence of reusing this method.
   *
   * Each remapped event also carries its original, unshifted piece-time
   * `startSeconds` alongside the remapped one (as `pieceTimeStartSeconds`),
   * purely so `onOnset`, wired straight into the scheduler's own
   * `onSchedule` below, can hand a caller back the piece-time value rather
   * than the real-audio-clock one `playOnsetEvent` itself needs: those two
   * numbers are only ever equal when `basePosition` was 0 and playback
   * started at `audioContext.currentTime === 0`, and differ in every other
   * case (a resume, a seek, or simply a real `AudioContext` whose clock did
   * not start at 0), so conflating them would silently hand a future caller
   * (e.g. a score cursor comparing against `positionSeconds`) the wrong
   * number.
   */
  play() {
    if (this.playing) return;
    const t = this.basePosition, n = this.audioContext.currentTime;
    this.baseAudioTime = n;
    const s = this.events.filter((o) => o.startSeconds >= t).map((o) => ({
      ...o,
      startSeconds: n + (o.startSeconds - t),
      pieceTimeStartSeconds: o.startSeconds
    })), i = new zc({
      events: s,
      getCurrentTime: () => this.audioContext.currentTime,
      onSchedule: (o) => {
        var r;
        const { oscillator: a } = Kc(o, {
          audioContext: this.audioContext,
          ...this.synthesisOptions
        });
        this.activeOscillators.add(a), (r = this.onOnset) == null || r.call(this, {
          noteId: o.noteId,
          pitch: o.pitch,
          startSeconds: o.pieceTimeStartSeconds,
          durationSeconds: o.durationSeconds
        });
      },
      onTick: () => this.endIfFinished(),
      lookaheadSeconds: this.lookaheadSeconds,
      intervalMs: this.intervalMs
    });
    this.scheduler = i, i.start(), this.playing = !0;
  }
  /**
   * Freezes playback at its current position, without touching any note
   * already sounding: a note that has already been scheduled and started
   * keeps ringing to whatever stop time it was already given, since
   * `AudioContext.currentTime` itself never pauses (there is no real Web
   * Audio operation that "pauses" an already-started oscillator's
   * envelope). This is a deliberate consequence of that fact, not a bug:
   * only `stop()` performs the harder reset of silencing already-sounding
   * notes early. A no-op if not currently playing.
   */
  pause() {
    var t;
    this.playing && (this.basePosition = this.positionSeconds, this.baseAudioTime = null, (t = this.scheduler) == null || t.stop(), this.scheduler = null, this.playing = !1);
  }
  /**
   * Hard stop: halts the internal scheduler (no further events will be
   * scheduled) and silences every note already scheduled/sounding by
   * calling `oscillator.stop(audioContext.currentTime)` on each one (the
   * Web Audio spec allows re-calling `stop()` with an earlier time before a
   * node's originally scheduled stop fires), then resets position back to
   * the very start. Leaves no dangling scheduled or sounding nodes.
   */
  stop() {
    this.haltAndSilence(), this.basePosition = 0, this.baseAudioTime = null;
  }
  /**
   * Jumps playback position to `seconds`. Always performs the same hard
   * cleanup as `stop()` for any currently active/pending nodes and the
   * internal scheduler first (a stale sounding note from before the seek
   * would otherwise ring on at a position unrelated to the new one, which
   * seeking should eliminate), then resumes playing from `seconds` only if
   * the engine was already playing before this call; a `seek()` while
   * paused/stopped just updates where a later `play()` will resume from.
   *
   * A note that was already sounding *across* the seek target (its
   * `startSeconds` before `seconds`, but `startSeconds + durationSeconds`
   * after it, i.e. genuinely "in progress" at that instant) is not
   * rescheduled at the seek point: `play()`'s own event filter
   * (`startSeconds >= basePosition`) drops it, since its `startSeconds` is
   * before the new `basePosition`. This is deliberate, not a gap: this
   * engine has no mechanism to resume a note mid-envelope (Slice 4's
   * attack/release envelope always starts fresh from silence), so naively
   * rescheduling such a note at the seek point would restart its attack
   * envelope and pitch onset as though it began right there, audibly wrong
   * versus its real, earlier onset. Not sounding that note again after the
   * seek is the honest choice, and the one this design makes, over
   * falsifying its onset.
   */
  seek(t) {
    const n = this.playing;
    this.haltAndSilence(), this.basePosition = t, this.baseAudioTime = null, n && this.play();
  }
  /**
   * Forces one scheduling pass on the internal scheduler, bypassing its
   * real `setInterval`-driven loop. Exists purely for deterministic tests:
   * a real unit test cannot wait on a real timer, so it drives scheduling
   * by calling `play()` then `tick()` directly with a controllable
   * `AudioContext.currentTime`, the same "expose the single-pass primitive
   * a real loop wraps" precedent `LookaheadScheduler.tick()` already sets
   * for exactly the same reason. A no-op when not currently playing.
   */
  tick() {
    var t;
    (t = this.scheduler) == null || t.tick();
  }
  /**
   * Run after every scheduling pass: once the position passes the last
   * note's end, every oscillator has already stopped at its own end time,
   * so this only drops the scheduler and the references (no early cut,
   * which would clip a release still ringing), rewinds, and reports it.
   */
  endIfFinished() {
    var t, n;
    !this.playing || this.positionSeconds < this.endSeconds || ((t = this.scheduler) == null || t.stop(), this.scheduler = null, this.playing = !1, this.activeOscillators.clear(), this.basePosition = 0, this.baseAudioTime = null, (n = this.onEnd) == null || n.call(this));
  }
  /**
   * Shared cleanup between `stop()` and `seek()`: halts the internal
   * scheduler (discarding it so no further events get scheduled) and
   * silences every currently tracked oscillator by calling `stop()` on it
   * at the current audio-clock time, then clears the tracking set and marks
   * the engine not-playing. Deliberately does not touch `basePosition`/
   * `baseAudioTime`: `stop()` and `seek()` each set those to their own
   * different targets right after calling this.
   */
  haltAndSilence() {
    var n;
    (n = this.scheduler) == null || n.stop(), this.scheduler = null, this.playing = !1;
    const t = this.audioContext.currentTime;
    for (const s of this.activeOscillators)
      s.stop(t);
    this.activeOscillators.clear();
  }
}
const ci = 1e-9;
function Wf(e) {
  const t = ia(e), n = [];
  let s = 0;
  for (const a of t)
    n.push(s), s += a;
  const i = /* @__PURE__ */ new Map(), o = [];
  for (const a of e.staves)
    a.measures.forEach((r, c) => {
      const f = /* @__PURE__ */ new Map();
      for (const l of Lt(r.notes)) {
        const h = l[0], d = f.get(h.voice) ?? n[c], p = d + h.durationWholes;
        f.set(h.voice, p);
        for (const g of l)
          i.set(g.id, d), g.isRest || o.push({ id: g.id, start: d, end: p });
      }
      for (const l of hs(r.notes)) {
        const h = l.principal ? i.get(l.principal.id) : f.get(l.voice) ?? n[c];
        for (const d of l.notes) i.set(d.id, h);
      }
    });
  return {
    notesSoundingAt(a) {
      return o.filter((r) => r.start <= a + ci && a + ci < r.end).map((r) => r.id);
    },
    onsetWholes(a) {
      return i.get(a);
    }
  };
}
const Ae = { num: 0, den: 1 };
function aa(e, t) {
  for (e = Math.abs(e), t = Math.abs(t); t !== 0; )
    [e, t] = [t, e % t];
  return e === 0 ? 1 : e;
}
function bn(e, t) {
  return e / aa(e, t) * t;
}
function he(e) {
  const t = aa(e.num, e.den);
  return { num: e.num / t, den: e.den / t };
}
function li(e, t) {
  return he({ num: e.num * t.num, den: e.den * t.den });
}
function ts(e, t) {
  return he({ num: e.num * t.den + t.num * e.den, den: e.den * t.den });
}
function ra(e, t) {
  return he({ num: e.num * t.den - t.num * e.den, den: e.den * t.den });
}
function Ce(e, t) {
  return e.num * t.den - t.num * e.den;
}
const Qc = {
  breve: { num: 8, den: 1 },
  whole: { num: 4, den: 1 },
  half: { num: 2, den: 1 },
  quarter: { num: 1, den: 1 },
  eighth: { num: 1, den: 2 },
  "16th": { num: 1, den: 4 },
  "32nd": { num: 1, den: 8 },
  "64th": { num: 1, den: 16 }
}, Jc = {
  0: { num: 1, den: 1 },
  1: { num: 3, den: 2 },
  2: { num: 7, den: 4 }
};
function gs(e) {
  if (e.grace !== null) return Ae;
  if (e.measureRestWholes !== null) return In(e.measureRestWholes);
  let t = li(Qc[e.value], Jc[e.dots]);
  return e.tuplet && (t = li(t, { num: e.tuplet.normalNotes, den: e.tuplet.actualNotes })), t;
}
function In(e) {
  const t = e * 4;
  for (let n = 1; n <= 1024; n++) {
    const s = Math.round(t * n);
    if (Math.abs(s / n - t) < 1e-9) return he({ num: s, den: n });
  }
  return he({ num: Math.round(t * 1024), den: 1024 });
}
function bs(e) {
  return he({ num: e.num, den: e.den * 4 });
}
function ca(e) {
  return he({ num: e.num * 4, den: e.den });
}
const es = /* @__PURE__ */ new Set(["end-line", "end-paragraph", "footnote", "level"]);
function la(e) {
  var l, h, d;
  const t = e.children.filter((p) => !es.has(p.name)), n = e.children.findIndex((p) => es.has(p.name));
  if (n !== -1 && e.children.slice(n).some((p) => !es.has(p.name))) return null;
  let s = 0;
  const i = [], o = () => {
    var g, m;
    let p = "single";
    if (((g = t[s]) == null ? void 0 : g.name) === "syllabic") {
      const b = t[s].text.trim();
      if (!Zc(b)) return !1;
      p = b, s++;
    }
    return ((m = t[s]) == null ? void 0 : m.name) !== "text" ? !1 : (i.push({ syllabic: p, text: t[s].text }), s++, !0);
  };
  if (((l = t[0]) == null ? void 0 : l.name) !== "extend") {
    if (!o()) return null;
    for (; ((h = t[s]) == null ? void 0 : h.name) === "elision"; )
      if (s++, !o()) return null;
  }
  let a = null;
  if (((d = t[s]) == null ? void 0 : d.name) === "extend") {
    const p = t[s].attrs.type;
    if (p === void 0) a = "untyped";
    else if (p === "start" || p === "stop" || p === "continue") a = p;
    else return null;
    s++;
  }
  if (s !== t.length || i.length === 0 && a === null) return null;
  const [r, ...c] = i, f = vo({
    verse: e.attrs.number ?? "1",
    syllabic: (r == null ? void 0 : r.syllabic) ?? "single",
    text: (r == null ? void 0 : r.text) ?? "",
    elisions: c,
    extend: a,
    source: null
  });
  return dn(fa(f)) === dn(e) ? f : vo({ ...f, source: e });
}
function Zc(e) {
  return e === "single" || e === "begin" || e === "middle" || e === "end";
}
function fa(e) {
  const { source: t } = e;
  if (t) {
    const o = la(t);
    if (o && tl(o, e)) return t;
  }
  const n = (o, a) => ({ name: o, attrs: {}, children: [], text: a }), s = [], i = (o, a) => {
    s.push(n("syllabic", o), n("text", a));
  };
  if (e.text !== "" || e.elisions.length > 0) {
    i(e.syllabic, e.text);
    for (const o of e.elisions)
      s.push(n("elision", "")), i(o.syllabic, o.text);
  }
  return e.extend !== null && s.push({ name: "extend", attrs: e.extend === "untyped" ? {} : { type: e.extend }, children: [], text: "" }), t && s.push(...t.children.filter((o) => es.has(o.name))), { name: "lyric", attrs: { ...t == null ? void 0 : t.attrs, number: e.verse }, children: s, text: "" };
}
function tl(e, t) {
  const n = (s, i) => s.length === i.length && s.every((o, a) => o.syllabic === i[a].syllabic && o.text === i[a].text);
  return e.verse === t.verse && e.syllabic === t.syllabic && e.text === t.text && e.extend === t.extend && n(e.elisions, t.elisions);
}
function Of(e) {
  const t = new Fl();
  t.raw('<?xml version="1.0" encoding="UTF-8"?>'), t.raw(
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">'
  ), t.open("score-partwise", { version: "4.0" });
  for (const o of e.headerPassthrough) t.element(o);
  const n = nl(e), s = sl(e, n);
  ol(t, n, s);
  const i = el(e) !== e.tempoBpm;
  for (let o = 0; o < n.length; o++)
    il(t, e, n, o, i);
  return t.close("score-partwise"), t.toString();
}
function el(e) {
  let t;
  const n = (s) => {
    if (s.name === "metronome") {
      const i = s.children.find((a) => a.name === "per-minute"), o = i ? Number.parseFloat(i.text.trim()) : Number.NaN;
      if (Number.isFinite(o)) return o;
    }
    if (s.name === "sound" && t === void 0 && s.attrs.tempo !== void 0) {
      const i = Number.parseFloat(s.attrs.tempo);
      Number.isFinite(i) && (t = i);
    }
    for (const i of s.children) {
      const o = n(i);
      if (o !== void 0) return o;
    }
  };
  for (const s of e.staves)
    for (const i of s.measures)
      for (const o of i.passthrough) {
        const a = n(o.element);
        if (a !== void 0) return a;
      }
  return t;
}
function nl(e) {
  const t = [], n = /* @__PURE__ */ new Map();
  let s = 0;
  for (let i = 0; i < e.staves.length; i++) {
    if (n.has(i)) continue;
    const o = e.parts.find(
      (r) => r.name !== void 0 && r.name !== "" && r.staffIndices.includes(i)
    ), a = `P${t.length + 1}`;
    if (o) {
      const r = [...o.staffIndices].sort((c, f) => c - f);
      t.push({ id: a, name: o.name, staffIndices: r, passthrough: o.passthrough ?? Bn });
      for (const c of r)
        n.has(c) || n.set(c, t.length - 1);
    } else {
      s++;
      const r = e.parts.find(
        (c) => c.staffIndices.length === 1 && c.staffIndices[0] === i
      );
      t.push({
        id: a,
        name: `Part ${s}`,
        staffIndices: [i],
        passthrough: (r == null ? void 0 : r.passthrough) ?? Bn
      }), n.set(i, t.length - 1);
    }
  }
  return t;
}
const Bn = Object.freeze([]);
function sl(e, t) {
  const n = t.map((o) => new Set(o.staffIndices)), s = (o) => {
    const a = [...o.staffIndices].sort((r, c) => r - c).join(",");
    return t.some((r) => [...r.staffIndices].sort((c, f) => c - f).join(",") === a);
  }, i = [];
  for (const o of e.parts) {
    if (o.staffIndices.length < 2 || s(o)) continue;
    const a = [];
    for (let r = 0; r < n.length; r++)
      o.staffIndices.some((c) => n[r].has(c)) && a.push(r);
    a.length !== 0 && i.push({
      number: i.length + 1,
      symbol: o.staffIndices.length === 2 ? "brace" : "bracket",
      firstEmittedIndex: a[0],
      lastEmittedIndex: a[a.length - 1],
      passthrough: o.passthrough ?? Bn
    });
  }
  return i;
}
function ol(e, t, n) {
  e.open("part-list");
  for (let s = 0; s < t.length; s++) {
    for (const o of n)
      if (o.firstEmittedIndex === s) {
        e.open("part-group", { type: "start", number: String(o.number) });
        const a = new pn(e, o.passthrough, Nl);
        a.before("group-symbol"), e.leaf("group-symbol", o.symbol), a.rest(), e.close("part-group");
      }
    e.open("score-part", { id: t[s].id });
    const i = new pn(e, t[s].passthrough, Bl);
    i.before("part-name"), e.leaf("part-name", t[s].name), i.rest(), e.close("score-part");
    for (const o of n)
      o.lastEmittedIndex === s && e.selfClose("part-group", { type: "stop", number: String(o.number) });
  }
  e.close("part-list");
}
function il(e, t, n, s, i) {
  const o = n[s], a = s === 0, r = o.staffIndices, c = r.length > 1, f = r[0], l = [], h = [], d = dl(t, r, c);
  for (const y of d.values()) h.push(...y);
  const p = [];
  for (const y of r)
    for (const v of t.staves[y].measures) {
      l.push(...v.notes), h.push(...v.passthrough);
      for (const S of v.clefChanges) p.push(S.onset);
    }
  const g = Al(l, h, p), m = t.staves[f].measures.length;
  e.open("part", { id: o.id });
  let b;
  for (let y = 0; y < m; y++) {
    const v = t.staves[f].measures[y];
    e.open("measure", { number: v.number ?? String(y + 1) });
    for (const S of v.passthrough)
      S.lead && e.element(lo(S.element, g / S.divisions));
    v.endingStart && (b = v.endingStart), pi(
      e,
      kl(v),
      v.barlinePassthrough.filter((S) => S.attrs.location === "left"),
      "left"
    ), al(e, t, o, y, g, c), i && a && y === 0 && (e.open("direction", { placement: "above" }), e.open("direction-type"), e.open("metronome"), e.leaf("beat-unit", "quarter"), e.leaf("per-minute", String(t.tempoBpm)), e.close("metronome"), e.close("direction-type"), e.selfClose("sound", { tempo: String(t.tempoBpm) }), e.close("direction")), rl(e, t, r, y, g, c, d), pi(
      e,
      El(t.endBarlineAt(y, f), v, b),
      v.barlinePassthrough.filter((S) => S.attrs.location !== "left"),
      "right"
    ), v.endingEnd && (b = void 0), e.close("measure");
  }
  e.close("part");
}
function al(e, t, n, s, i, o) {
  const a = n.staffIndices[0], r = t.staves[a].measures[s], c = r.attributesPassthrough;
  if (s === 0) {
    e.open("attributes");
    const h = new pn(e, c, mi);
    h.before("divisions"), e.leaf("divisions", String(i)), h.before("key"), e.open("key"), e.leaf("fifths", String(t.keyFifthsAt(0, a))), e.close("key"), h.before("time");
    const d = t.timeAt(0, a);
    e.open("time"), e.leaf("beats", String(d.beats)), e.leaf("beat-type", String(d.beatType)), e.close("time"), h.before("staves"), o && e.leaf("staves", String(n.staffIndices.length)), h.before("clef");
    for (let p = 0; p < n.staffIndices.length; p++)
      fi(e, t.clefAt(0, n.staffIndices[p]), p + 1);
    h.rest(), e.close("attributes");
    return;
  }
  const f = [];
  for (let h = 0; h < n.staffIndices.length; h++) {
    const d = t.staves[n.staffIndices[h]].measures[s].clef;
    d !== void 0 && f.push({ clef: d, number: h + 1 });
  }
  if (r.keyFifths === void 0 && r.time === void 0 && f.length === 0 && c.length === 0)
    return;
  e.open("attributes");
  const l = new pn(e, c, mi);
  r.keyFifths !== void 0 && (l.before("key"), e.open("key"), e.leaf("fifths", String(r.keyFifths)), e.close("key")), r.time !== void 0 && (l.before("time"), e.open("time"), e.leaf("beats", String(r.time.beats)), e.leaf("beat-type", String(r.time.beatType)), e.close("time")), f.length > 0 && l.before("clef");
  for (const h of f) fi(e, h.clef, h.number);
  l.rest(), e.close("attributes");
}
const ha = {
  treble: { sign: "G", line: 2 },
  bass: { sign: "F", line: 4 },
  treble8: { sign: "G", line: 2, octaveChange: -1 },
  alto: { sign: "C", line: 3 },
  tenor: { sign: "C", line: 4 }
};
function fi(e, t, n) {
  const s = ha[t];
  e.open("clef", { number: String(n) }), e.leaf("sign", s.sign), e.leaf("line", String(s.line)), s.octaveChange !== void 0 && e.leaf("clef-octave-change", String(s.octaveChange)), e.close("clef");
}
function rl(e, t, n, s, i, o, a) {
  var f, l, h;
  let r = Ae, c = !0;
  for (let d = 0; d < n.length; d++) {
    const p = n[d], m = t.staves[p].measures[s], b = t.timeAt(s, p), y = As(t.clefAt(s, p)), v = [...yl(m.notes)], S = fl(m, v.map(([w]) => w));
    hl(S, m, (f = v[0]) == null ? void 0 : f[0], d + 1), ml(S, a.get(`${p}:${s}`), v.map(([w]) => w)), v.length === 0 && S.size > 0 && v.push([[...S.keys()][0], []]);
    for (const [w, T] of v) {
      !c && r.num > 0 && (e.open("backup"), e.leaf("duration", String(js(r, i))), e.close("backup")), c = !1;
      const x = m.clefChanges.length === 0 ? y : bl(t, s, p, T), P = vl(T, b, x), N = /* @__PURE__ */ new Map();
      let F = [];
      const U = xl(w, v.length > 1);
      for (const I of hs(T))
        I.principal ? N.set(I.principal.id, I.notes) : F = I.notes, Sl(P, I.notes, U);
      const _ = (I) => {
        for (const k of I ?? [])
          ui(e, t, k, {
            divisions: i,
            multiStaff: o,
            staffNumber: d + 1,
            middleLine: 0,
            beamPlan: P,
            chord: [k],
            previousAnchor: void 0,
            nextAnchor: void 0,
            regenerateTuplets: !1,
            graceStem: U
          });
      }, B = S.get(w) ?? [], M = (I) => {
        e.element(lo(I.element, i / I.divisions));
      }, G = [];
      let W = 0, Y = Ae;
      const j = Lt(T), D = cl(j);
      for (let I = 0; I < j.length; I++) {
        const k = j[I];
        for (; W < B.length && Ce(_t(B[W]), Y) < 0; ) G.push(B[W++]);
        for (; W < B.length && Ce(_t(B[W]), Y) === 0; ) M(B[W++]);
        _(N.get(k[0].id));
        for (const V of k)
          ui(e, t, V, {
            divisions: i,
            multiStaff: o,
            staffNumber: d + 1,
            middleLine: typeof x == "number" ? x : x(k[0]),
            beamPlan: P,
            chord: k,
            previousAnchor: (l = j[I - 1]) == null ? void 0 : l[0],
            nextAnchor: (h = j[I + 1]) == null ? void 0 : h[0],
            regenerateTuplets: !D.has(I)
          });
        Y = ts(Y, gs(k[0]));
      }
      for (; W < B.length && Ce(_t(B[W]), Y) < 0; ) G.push(B[W++]);
      for (; W < B.length; ) M(B[W++]);
      _(F), G.sort((I, k) => Ce(_t(k), _t(I)));
      for (const I of G) {
        const k = _t(I);
        e.open("backup"), e.leaf("duration", String(js(ra(Y, k), i))), e.close("backup"), Y = k, M(I);
      }
      r = Y;
    }
  }
}
function cl(e) {
  const t = /* @__PURE__ */ new Set();
  let n = -1, s = !1;
  const i = (o) => {
    if (n !== -1 && s) for (let a = n; a < o; a++) t.add(a);
    n = -1, s = !1;
  };
  return e.forEach((o, a) => {
    if (o[0].tuplet === null) {
      i(a);
      return;
    }
    n === -1 && (n = a), o.some(ll) && (s = !0);
  }), i(e.length), t;
}
function ll(e) {
  return e.passthrough.some((t) => t.name === "notations" && t.children.some((n) => n.name === "tuplet"));
}
function _t(e) {
  return ca(e.onset);
}
function js(e, t) {
  return e.num * t / e.den;
}
function fl(e, t) {
  var i;
  const n = /* @__PURE__ */ new Map(), s = t[0] ?? ((i = e.passthrough.find((o) => !o.lead)) == null ? void 0 : i.voice) ?? 1;
  for (const o of e.passthrough) {
    if (o.lead) continue;
    const a = t.includes(o.voice) ? o.voice : s, r = n.get(a);
    r ? r.push(o) : n.set(a, [o]);
  }
  for (const o of n.values()) o.sort((a, r) => Ce(_t(a), _t(r)));
  return n;
}
function hl(e, t, n, s) {
  if (t.clefChanges.length === 0) return;
  const i = n ?? [...e.keys()][0] ?? 1, o = e.get(i) ?? [];
  for (const a of t.clefChanges)
    o.push({
      element: gl(a.clef, s),
      onset: bs(In(a.onset)),
      voice: i,
      lead: !1,
      divisions: 1
    });
  o.sort((a, r) => Ce(_t(a), _t(r))), e.set(i, o);
}
const hi = (e, t = {}) => ({
  name: e,
  attrs: t,
  children: [],
  text: ""
});
function dl(e, t, n) {
  var f, l, h;
  const s = [];
  for (const d of t)
    for (const p of e.staves[d].measures)
      for (const g of p.dynamics)
        s.push({
          staffIndex: d,
          measureIndex: p.index,
          onset: g.onset,
          voice: g.voice,
          source: g.source,
          placement: g.placement,
          directionType: di({
            name: "dynamics",
            attrs: ((f = g.source) == null ? void 0 : f.markAttrs) ?? {},
            children: [hi(g.kind)],
            text: ""
          })
        });
  const i = e.wedges.filter((d) => t.includes(d.staffIndex)).sort((d, p) => d.start.measureIndex - p.start.measureIndex || d.start.onset - p.start.onset), o = (d) => (
    // A sortable scalar: measures never hold anywhere near 1e6 wholes.
    d.measureIndex * 1e6 + d.onset
  ), a = [];
  for (const d of i) {
    const p = o(d.start), g = new Set(a.filter((y) => y.stop >= p - 1e-9).map((y) => y.number));
    let m = 1;
    for (; g.has(m); ) m++;
    a.push({ stop: o(d.stop), number: m });
    const b = (y, v) => di(hi("wedge", { type: y, number: String(m), ...(v == null ? void 0 : v.markAttrs) ?? {} }));
    s.push({
      staffIndex: d.staffIndex,
      measureIndex: d.start.measureIndex,
      onset: d.start.onset,
      voice: d.start.voice,
      source: d.start.source,
      placement: d.placement,
      directionType: b(d.kind, d.start.source)
    }), s.push({
      staffIndex: d.staffIndex,
      measureIndex: d.stop.measureIndex,
      onset: d.stop.onset,
      voice: d.stop.voice,
      source: d.stop.source,
      placement: void 0,
      directionType: b("stop", d.stop.source)
    });
  }
  const r = /* @__PURE__ */ new Map();
  for (const d of s) {
    const p = ((l = d.source) == null ? void 0 : l.element) ?? d, g = r.get(p);
    g ? g.push(d) : r.set(p, [d]);
  }
  const c = /* @__PURE__ */ new Map();
  for (const d of r.values()) {
    const p = d[0], g = p.source ? ul(p.source.element, d) : pl(p, n ? t.indexOf(p.staffIndex) + 1 : void 0), m = `${p.staffIndex}:${p.measureIndex}`, b = {
      element: g,
      onset: bs(In(p.onset)),
      voice: p.voice,
      lead: !1,
      divisions: ((h = p.source) == null ? void 0 : h.divisions) ?? 1
    }, y = c.get(m);
    y ? y.push(b) : c.set(m, [b]);
  }
  return c;
}
function di(e) {
  return { name: "direction-type", attrs: {}, children: [e], text: "" };
}
function ul(e, t) {
  var f;
  const n = [...t].sort((l, h) => l.source.slot - h.source.slot), s = [];
  let i = 0, o = 0;
  const a = e.children.length + n.length;
  for (let l = 0; l < a; l++)
    o < n.length && n[o].source.slot === l ? s.push(n[o++].directionType) : i < e.children.length && s.push(e.children[i++]);
  for (; o < n.length; ) s.push(n[o++].directionType);
  const r = (f = t.find((l) => l.placement !== void 0 && l.placement !== null)) == null ? void 0 : f.placement, c = r ? { placement: r, ...e.attrs } : e.attrs;
  return { ...e, attrs: c, children: s };
}
function pl(e, t) {
  const n = [e.directionType];
  return t !== void 0 && n.push({ name: "staff", attrs: {}, children: [], text: String(t) }), {
    name: "direction",
    attrs: e.placement ? { placement: e.placement } : {},
    children: n,
    text: ""
  };
}
function ml(e, t, n) {
  if (!t || t.length === 0) return;
  const s = n[0] ?? [...e.keys()][0] ?? t[0].voice, i = /* @__PURE__ */ new Set();
  for (const o of t) {
    const a = n.includes(o.voice) ? o.voice : s, r = e.get(a) ?? [];
    r.push(o), e.set(a, r), i.add(a);
  }
  for (const o of i) e.get(o).sort((a, r) => Ce(_t(a), _t(r)));
}
function gl(e, t) {
  const n = ha[e], s = (o, a) => ({ name: o, attrs: {}, children: [], text: a }), i = [s("sign", n.sign), s("line", String(n.line))];
  return n.octaveChange !== void 0 && i.push(s("clef-octave-change", String(n.octaveChange))), {
    name: "attributes",
    attrs: {},
    children: [{ name: "clef", attrs: { number: String(t) }, children: i, text: "" }],
    text: ""
  };
}
function bl(e, t, n, s) {
  const i = /* @__PURE__ */ new Map();
  let o = 0;
  for (const a of Lt(s)) {
    const r = As(e.clefAtOnset(t, o, n));
    for (const c of a) i.set(c.id, r);
    o += a[0].durationWholes;
  }
  return (a) => i.get(a.id) ?? As(e.clefAt(t, n));
}
function yl(e) {
  const t = /* @__PURE__ */ new Map();
  for (const n of e) {
    const s = t.get(n.voice);
    s ? s.push(n) : t.set(n.voice, [n]);
  }
  return t;
}
function vl(e, t, n) {
  const s = /* @__PURE__ */ new Map(), i = zi(e, t, n);
  for (const o of i)
    o.notes.forEach((a, r) => {
      const c = r === 0 ? "begin" : r === o.notes.length - 1 ? "end" : "continue";
      s.set(a.id, { position: c, direction: o.direction });
    });
  return s;
}
function xl(e, t) {
  return t && e % 2 === 0 ? "down" : "up";
}
function Sl(e, t, n) {
  let s = 0;
  const i = (o) => {
    if (o - s >= 2)
      for (let a = s; a < o; a++) {
        const r = a === s ? "begin" : a === o - 1 ? "end" : "continue";
        e.set(t[a].id, { position: r, direction: n });
      }
  };
  t.forEach((o, a) => {
    wl(o.value) || (i(a), s = a + 1);
  }), i(t.length);
}
function wl(e) {
  return e === "eighth" || e === "16th" || e === "32nd" || e === "64th";
}
function ui(e, t, n, s) {
  const i = s.chord[0], o = n === i, a = n.passthrough, r = n.pitch === null ? a.find((w) => w.name === "rest") : void 0, c = a.filter((w) => w.name === "notations"), f = new pn(
    e,
    a.length === 0 ? a : a.filter((w) => w.name !== "rest" && w.name !== "notations"),
    Tl
  );
  if (e.open("note"), f.before("grace"), n.grace !== null && e.selfClose("grace", Ml(n.grace, s.divisions)), f.before("chord"), n.chordWithPrevious && e.selfClose("chord"), f.before("pitch"), n.pitch === null) {
    const w = n.isMeasureRest ? { ...r == null ? void 0 : r.attrs, measure: "yes" } : r == null ? void 0 : r.attrs;
    if (r && r.children.length > 0) {
      e.open("rest", w);
      for (const T of r.children) e.element(T);
      e.close("rest");
    } else
      e.selfClose("rest", w);
  } else
    e.open("pitch"), e.leaf("step", n.pitch.step), n.pitch.alter !== 0 && e.leaf("alter", String(n.pitch.alter)), e.leaf("octave", String(n.pitch.octave)), e.close("pitch");
  f.before("duration"), n.grace === null && e.leaf("duration", String(js(gs(i), s.divisions))), f.before("tie");
  const l = t.tiedFromNote(n.id) !== void 0;
  l && e.selfClose("tie", { type: "stop" }), n.tiedToId !== null && e.selfClose("tie", { type: "start" }), f.before("voice"), e.leaf("voice", String(n.voice)), f.before("type"), n.isMeasureRest || e.leaf("type", n.value), f.before("dot");
  for (let w = 0; w < n.dots; w++) e.selfClose("dot");
  f.before("time-modification"), n.tuplet && (e.open("time-modification"), e.leaf("actual-notes", String(n.tuplet.actualNotes)), e.leaf("normal-notes", String(n.tuplet.normalNotes)), e.close("time-modification")), f.before("stem");
  const h = s.beamPlan.get(i.id);
  if (n.pitch !== null && i.value !== "whole" && i.value !== "breve") {
    const w = s.graceStem ? s.graceStem : h ? h.direction : un(
      s.chord.flatMap((T) => T.pitch ? [it(T.pitch)] : []),
      s.middleLine
    );
    e.leaf("stem", w);
  }
  f.before("staff"), s.multiStaff && e.leaf("staff", String(s.staffNumber)), f.before("beam"), h && o && e.leaf("beam", h.position, { number: "1" });
  const d = s.previousAnchor, p = s.nextAnchor, g = s.regenerateTuplets && o && n.tuplet !== null, m = g && (d === void 0 || d.tuplet === null), b = g && (p === void 0 || p.tuplet === null), y = [], v = [];
  t.slurs.forEach((w, T) => {
    const x = T % 6 + 1;
    w.endNoteId === n.id && y.push(x), w.startNoteId === n.id && v.push(x);
  });
  const S = l || n.tiedToId !== null || m || b || y.length > 0 || v.length > 0 || n.articulations.length > 0 || n.fermata !== null || n.arpeggiate;
  if (f.before("notations"), S) {
    const w = c[0], T = n.articulations.length > 0 ? w == null ? void 0 : w.children.find((x) => x.name === "articulations") : void 0;
    e.open("notations", w == null ? void 0 : w.attrs), l && e.selfClose("tied", { type: "stop" }), n.tiedToId !== null && e.selfClose("tied", { type: "start" }), m && e.selfClose("tuplet", { type: "start", number: "1" }), b && e.selfClose("tuplet", { type: "stop", number: "1" });
    for (const x of y) e.selfClose("slur", { type: "stop", number: String(x) });
    for (const x of v) e.selfClose("slur", { type: "start", number: String(x) });
    if (n.articulations.length > 0) {
      e.open("articulations", T == null ? void 0 : T.attrs);
      for (const x of n.articulations) e.selfClose(x);
      if (T) for (const x of T.children) e.element(x);
      e.close("articulations");
    }
    if (n.fermata !== null && e.selfClose("fermata", { type: n.fermata }), n.arpeggiate && e.selfClose("arpeggiate"), w)
      for (const x of w.children) x !== T && e.element(x);
    e.close("notations");
    for (let x = 1; x < c.length; x++) e.element(c[x]);
  } else
    for (const w of c) e.element(w);
  f.before("lyric");
  for (const w of n.lyrics) e.element(fa(w));
  f.rest(), e.close("note");
}
function Ml(e, t) {
  const n = {};
  return e.stealTimePrevious !== null && (n["steal-time-previous"] = String(e.stealTimePrevious)), e.stealTimeFollowing !== null && (n["steal-time-following"] = String(e.stealTimeFollowing)), e.makeTime !== null && (n["make-time"] = String(Math.round(e.makeTime * 4 * t))), e.slash && (n.slash = "yes"), n;
}
function kl(e) {
  const t = e.endingStart && da("start", e.endingStart.numbers, e.endingStart);
  return e.startBarline === "repeatStart" ? { style: "heavy-light", repeat: { direction: "forward" }, ending: t } : t && { ending: t };
}
function El(e, t, n) {
  const s = t.endingEnd && n && da(t.endingEnd.kind, n.numbers, t.endingEnd);
  switch (e) {
    case "double":
      return { style: "light-light", ending: s };
    case "final":
      return { style: "light-heavy", ending: s };
    case "repeatEnd": {
      const i = t.repeatTimes;
      return { style: "light-heavy", ending: s, repeat: { direction: "backward", times: i } };
    }
    default:
      return s && { ending: s };
  }
}
function da(e, t, n) {
  return {
    name: "ending",
    attrs: { number: t.join(", "), type: e, ...n.attrs },
    children: Bn,
    text: "text" in n ? n.text ?? "" : ""
  };
}
function pi(e, t, n, s) {
  if (!t) {
    for (const r of n) e.element(r);
    return;
  }
  const i = n[0], o = i ? i.children.filter(
    (r) => !(t.style && r.name === "bar-style") && !(t.repeat && r.name === "repeat")
  ) : Bn;
  e.open("barline", { ...i == null ? void 0 : i.attrs, location: s });
  const a = new pn(e, o, Il);
  if (a.before("bar-style"), t.style && e.leaf("bar-style", t.style), a.before("ending"), t.ending && e.element(t.ending), a.before("repeat"), t.repeat) {
    const { direction: r, times: c } = t.repeat;
    e.selfClose("repeat", c === void 0 ? { direction: r } : { direction: r, times: String(c) });
  }
  a.rest(), e.close("barline");
  for (let r = 1; r < n.length; r++) e.element(n[r]);
}
const Tl = _n([
  "grace",
  "cue",
  "chord",
  "pitch",
  "unpitched",
  "rest",
  "duration",
  "tie",
  "instrument",
  "footnote",
  "level",
  "voice",
  "type",
  "dot",
  "accidental",
  "time-modification",
  "stem",
  "notehead",
  "notehead-text",
  "staff",
  "beam",
  "notations",
  "lyric",
  "play",
  "listen"
]), mi = _n([
  "footnote",
  "level",
  "divisions",
  "key",
  "time",
  "staves",
  "part-symbol",
  "instruments",
  "clef",
  "staff-details",
  "transpose",
  "for-part",
  "directive",
  "measure-style"
]), Il = _n([
  "bar-style",
  "footnote",
  "level",
  "wavy-line",
  "segno",
  "coda",
  "fermata",
  "ending",
  "repeat"
]), Bl = _n([
  "identification",
  "part-link",
  "part-name",
  "part-name-display",
  "part-abbreviation",
  "part-abbreviation-display",
  "group",
  "score-instrument",
  "player",
  "midi-device",
  "midi-instrument"
]), Nl = _n([
  "group-name",
  "group-name-display",
  "group-abbreviation",
  "group-abbreviation-display",
  "group-symbol",
  "group-barline",
  "group-time",
  "footnote",
  "level"
]);
function _n(e) {
  return new Map(e.map((t, n) => [t, n]));
}
var te, se, Re, yn;
class pn {
  constructor(t, n, s) {
    z(this, Re);
    z(this, te);
    z(this, se, 0);
    this.xml = t, this.order = s, $(this, te, n.length < 2 ? n : [...n].sort((i, o) => C(this, Re, yn).call(this, i.name) - C(this, Re, yn).call(this, o.name)));
  }
  before(t) {
    if (u(this, se) >= u(this, te).length) return;
    const n = C(this, Re, yn).call(this, t);
    for (; u(this, se) < u(this, te).length && C(this, Re, yn).call(this, u(this, te)[u(this, se)].name) < n; )
      this.xml.element(u(this, te)[ws(this, se)._++]);
  }
  rest() {
    for (; u(this, se) < u(this, te).length; ) this.xml.element(u(this, te)[ws(this, se)._++]);
  }
}
te = new WeakMap(), se = new WeakMap(), Re = new WeakSet(), yn = function(t) {
  return this.order.get(t) ?? this.order.size;
};
function lo(e, t) {
  if (t === 1) return e;
  if (e.children.length === 0) {
    if (e.name !== "offset" && e.name !== "duration") return e;
    const i = Number(e.text.trim());
    return Number.isFinite(i) && e.text.trim() !== "" ? { ...e, text: String(i * t) } : e;
  }
  let n = !1;
  const s = e.children.map((i) => {
    const o = lo(i, t);
    return o !== i && (n = !0), o;
  });
  return n ? { ...e, children: s } : e;
}
function Al(e, t, n) {
  var i;
  let s = 1;
  for (const o of e)
    s = bn(s, gs(o).den), ((i = o.grace) == null ? void 0 : i.makeTime) != null && (s = bn(s, In(o.grace.makeTime).den));
  for (const o of t)
    s = bn(s, ca(o.onset).den), s = bn(s, o.divisions);
  for (const o of n) s = bn(s, In(o).den);
  return s;
}
function Cl(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function Pl(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}
function Is(e) {
  return e ? Object.entries(e).map(([t, n]) => ` ${t}="${Pl(n)}"`).join("") : "";
}
class Fl {
  constructor() {
    ht(this, "lines", []);
    ht(this, "depth", 0);
  }
  get indent() {
    return "  ".repeat(this.depth);
  }
  /** A line with no indentation and no escaping: the prolog and doctype. */
  raw(t) {
    this.lines.push(t);
  }
  open(t, n) {
    this.lines.push(`${this.indent}<${t}${Is(n)}>`), this.depth++;
  }
  close(t) {
    this.depth--, this.lines.push(`${this.indent}</${t}>`);
  }
  leaf(t, n, s) {
    this.lines.push(`${this.indent}<${t}${Is(s)}>${Cl(n)}</${t}>`);
  }
  selfClose(t, n) {
    this.lines.push(`${this.indent}<${t}${Is(n)}/>`);
  }
  /**
   * A passthrough element (M6 Slice 3), verbatim: its attributes, then its
   * children recursively, or its text if it has none. An element with
   * children carried only indentation as text (MusicXML has no mixed
   * content), which is regenerated here rather than copied.
   */
  element(t) {
    if (t.children.length > 0) {
      this.open(t.name, t.attrs);
      for (const n of t.children) this.element(n);
      this.close(t.name);
    } else t.text !== "" ? this.leaf(t.name, t.text, t.attrs) : this.selfClose(t.name, t.attrs);
  }
  toString() {
    return this.lines.join(`
`) + `
`;
  }
}
function Wl(e) {
  return new Ol(e).parseDocument();
}
class Ol {
  constructor(t) {
    ht(this, "src");
    ht(this, "pos", 0);
    this.src = t;
  }
  parseDocument() {
    return this.skipProlog(), this.parseElement();
  }
  /**
   * Consume everything that can legally precede the root element: whitespace,
   * the `<?xml ... ?>` declaration, other processing instructions, comments,
   * and a `<!DOCTYPE ...>` declaration (including one carrying an internal
   * `[ ... ]` subset, which can itself contain `>` characters, so the scan has
   * to balance brackets rather than stop at the first `>`).
   */
  skipProlog() {
    for (; ; )
      if (this.skipWhitespace(), this.startsWith("<?"))
        this.skipProcessingInstruction();
      else if (this.startsWith("<!--"))
        this.skipComment();
      else if (this.startsWithIgnoreCase("<!DOCTYPE"))
        this.skipDoctype();
      else
        return;
  }
  skipProcessingInstruction() {
    const t = this.src.indexOf("?>", this.pos);
    if (t === -1) throw new Error('xml: unterminated processing instruction (no matching "?>")');
    this.pos = t + 2;
  }
  skipComment() {
    const t = this.src.indexOf("-->", this.pos);
    if (t === -1) throw new Error('xml: unterminated comment (no matching "-->")');
    this.pos = t + 3;
  }
  /**
   * Skip a `<!DOCTYPE ...>`. The tricky case is an internal subset:
   * `<!DOCTYPE score-partwise PUBLIC "..." "..." [ <!ENTITY ...> ]>`. The
   * `[...]` can contain `>` characters, so we scan character by character,
   * tracking whether we are inside the bracketed subset, and only accept the
   * `>` that closes the declaration itself.
   */
  skipDoctype() {
    let t = this.pos + 9, n = !1;
    for (; t < this.src.length; t++) {
      const s = this.src[t];
      if (s === "[") n = !0;
      else if (s === "]") n = !1;
      else if (s === ">" && !n) {
        this.pos = t + 1;
        return;
      }
    }
    throw new Error("xml: unterminated DOCTYPE declaration");
  }
  /**
   * Parse one element (the caller has already skipped to its opening `<`) and
   * everything nested inside it, up to and including its close tag. Returns the
   * frozen node.
   */
  parseElement() {
    if (!this.startsWith("<"))
      throw new Error(`xml: expected an element at offset ${this.pos}, found ${JSON.stringify(this.peek(16))}`);
    const t = [];
    let n;
    for (; ; ) {
      if (this.pos >= this.src.length) {
        const r = t.map((c) => `<${c.name}>`).join(" ");
        throw new Error(`xml: unexpected end of input with unclosed tags: ${r || "(none)"}`);
      }
      if (this.startsWith("<!--")) {
        this.skipComment();
        continue;
      }
      if (this.startsWith("<?")) {
        this.skipProcessingInstruction();
        continue;
      }
      if (this.startsWith("<![CDATA[")) {
        const r = this.src.indexOf("]]>", this.pos);
        if (r === -1) throw new Error("xml: unterminated CDATA section");
        const c = this.src.slice(this.pos + 9, r), f = t[t.length - 1];
        f && (f.text += c), this.pos = r + 3;
        continue;
      }
      if (this.startsWith("</")) {
        const r = this.readCloseTag(), c = t.pop();
        if (!c) throw new Error(`xml: close tag </${r}> with no open element`);
        if (c.name !== r)
          throw new Error(`xml: close tag </${r}> does not match open tag <${c.name}>`);
        if (t.length === 0) {
          n = c;
          break;
        }
        continue;
      }
      if (this.startsWith("<")) {
        const { element: r, selfClosing: c } = this.readOpenTag(), f = t[t.length - 1];
        if (f) f.children.push(r);
        else if (n && t.length === 0)
          throw new Error(`xml: unexpected second root element <${r.name}>`);
        if (!c)
          t.push(r);
        else if (t.length === 0) {
          n = r;
          break;
        }
        continue;
      }
      const s = this.src.indexOf("<", this.pos), i = s === -1 ? this.src.length : s, o = this.src.slice(this.pos, i), a = t[t.length - 1];
      a && (a.text += gi(o)), this.pos = i;
    }
    if (!n) throw new Error("xml: no root element found");
    return ua(n);
  }
  /** Read `<name attr="v" ...>` or `<name .../>`. Position is at the `<`. */
  readOpenTag() {
    this.pos++;
    const t = this.readName();
    if (!t) throw new Error(`xml: malformed open tag at offset ${this.pos}`);
    const n = {};
    for (; ; ) {
      this.skipWhitespace();
      const s = this.src[this.pos];
      if (s === void 0) throw new Error(`xml: unterminated open tag <${t}`);
      if (s === ">")
        return this.pos++, { element: { name: t, attrs: n, children: [], text: "" }, selfClosing: !1 };
      if (s === "/") {
        if (this.src[this.pos + 1] !== ">")
          throw new Error(`xml: malformed self-closing tag <${t}`);
        return this.pos += 2, { element: { name: t, attrs: n, children: [], text: "" }, selfClosing: !0 };
      }
      const i = this.readName();
      if (!i)
        throw new Error(`xml: malformed attribute in <${t}> near ${JSON.stringify(this.peek(16))}`);
      if (this.skipWhitespace(), this.src[this.pos] !== "=")
        throw new Error(`xml: attribute "${i}" in <${t}> has no value (expected '=')`);
      this.pos++, this.skipWhitespace();
      const o = this.src[this.pos];
      if (o !== '"' && o !== "'")
        throw new Error(`xml: attribute "${i}" in <${t}> value is not quoted`);
      this.pos++;
      const a = this.src.indexOf(o, this.pos);
      if (a === -1) throw new Error(`xml: unterminated attribute value for "${i}" in <${t}>`);
      n[i] = gi(this.src.slice(this.pos, a)), this.pos = a + 1;
    }
  }
  /** Read `</name>` and return `name`. Position is at the `<`. */
  readCloseTag() {
    this.pos += 2;
    const t = this.readName();
    if (!t) throw new Error(`xml: malformed close tag at offset ${this.pos}`);
    if (this.skipWhitespace(), this.src[this.pos] !== ">") throw new Error(`xml: malformed close tag </${t}`);
    return this.pos++, t;
  }
  readName() {
    const t = this.pos;
    for (; this.pos < this.src.length && /[A-Za-z0-9_.:-]/.test(this.src[this.pos]); )
      this.pos++;
    return this.src.slice(t, this.pos);
  }
  skipWhitespace() {
    for (; this.pos < this.src.length && /\s/.test(this.src[this.pos]); ) this.pos++;
  }
  startsWith(t) {
    return this.src.startsWith(t, this.pos);
  }
  startsWithIgnoreCase(t) {
    return this.src.slice(this.pos, this.pos + t.length).toUpperCase() === t.toUpperCase();
  }
  peek(t) {
    return this.src.slice(this.pos, this.pos + t);
  }
}
function gi(e) {
  return e.indexOf("&") === -1 ? e : e.replace(/&(#x?[0-9A-Fa-f]+|[A-Za-z]+);/g, (t, n) => {
    switch (n) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
    }
    if (n[0] === "#") {
      const s = n[1] === "x" || n[1] === "X" ? Number.parseInt(n.slice(2), 16) : Number.parseInt(n.slice(1), 10);
      if (Number.isFinite(s) && s >= 0 && s <= 1114111)
        return String.fromCodePoint(s);
    }
    return t;
  });
}
function ua(e) {
  return Object.freeze({
    name: e.name,
    attrs: Object.freeze(e.attrs),
    children: Object.freeze(e.children.map(ua)),
    text: e.text
  });
}
function at(e, t) {
  return e.children.find((n) => n.name === t);
}
function Pt(e, t) {
  return e.children.filter((n) => n.name === t);
}
function tt(e, t) {
  const n = at(e, t);
  return n ? n.text.trim() : void 0;
}
function Vs(e, t) {
  const n = [], s = (i) => {
    for (const o of i.children)
      o.name === t && n.push(o), s(o);
  };
  return s(e), n;
}
function Rf() {
  return { dropped: /* @__PURE__ */ new Map(), passthrough: /* @__PURE__ */ new Map(), fallbacks: [] };
}
function Rl(e, t = {}) {
  const n = Wl(e);
  if (n.name !== "score-partwise") {
    const x = n.name === "score-timewise" ? " (score-timewise is not supported; convert it to score-partwise first)" : "";
    throw new Error(`importMusicXml: expected a <score-partwise> root element, got <${n.name}>${x}`);
  }
  const s = new ff(t.diagnostics), i = new _a(), o = [];
  for (const x of n.children)
    x.name === "part-list" || x.name === "part" || (o.push(x), s.keep(x.name));
  o.length > 0 && (i.headerPassthrough = Object.freeze(o));
  const a = /* @__PURE__ */ new Map(), r = [], c = [], f = /* @__PURE__ */ new Map(), l = /* @__PURE__ */ new Map(), h = (x, P) => {
    const N = x.children.filter((F) => F.name !== P);
    for (const F of N) s.keep(F.name);
    return N.length > 0 ? Object.freeze(N) : Ei;
  }, d = at(n, "part-list");
  if (d) {
    for (const x of d.children)
      if (x.name === "score-part") {
        const P = x.attrs.id ?? "";
        r.push(P);
        const N = tt(x, "part-name");
        N !== void 0 && N !== "" && a.set(P, N), l.set(P, h(x, "part-name"));
      } else if (x.name === "part-group") {
        const P = x.attrs.number ?? "1";
        if (x.attrs.type === "start") {
          const N = tt(x, "group-symbol") === "brace" ? "brace" : "bracket", F = h(x, "group-symbol");
          f.set(P, { symbol: N, firstScorePartIndex: r.length, passthrough: F });
        } else if (x.attrs.type === "stop") {
          const N = f.get(P);
          N && (f.delete(P), c.push({
            symbol: N.symbol,
            firstScorePartIndex: N.firstScorePartIndex,
            lastScorePartIndex: r.length - 1,
            passthrough: N.passthrough
          }));
        }
      }
  }
  const p = Pt(n, "part"), g = [];
  let m = 0;
  for (const x of p) {
    const P = x.attrs.id ?? "", N = yi(x), F = Math.max(1, bt(N && tt(N, "staves"), 1)), U = Math.max(1, bt(N && tt(N, "divisions"), 1)), _ = m;
    for (let M = 0; M < F; M++)
      _ + M >= i.staves.length && i.appendStaff();
    if (m += F, N) {
      const M = /* @__PURE__ */ new Set();
      for (const G of Pt(N, "clef")) {
        const W = Math.max(1, bt(G.attrs.number, 1)) - 1, Y = i.staves[_ + W];
        Y && !M.has(W) && (M.add(W), s.at(P, vf(x)), Y.clef = ya(G, s));
      }
    }
    const B = Vs(x, "beam").length > 0;
    g.push({ id: P, baseStaffIndex: _, staffCount: F, divisions: U, el: x, hasBeams: B });
  }
  const b = new Map(g.map((x) => [x.id, x])), y = g[0];
  if (y) {
    const x = yi(y.el), P = x && at(x, "key"), N = P && tt(P, "fifths");
    N != null && (i.keyFifths = bt(N, 0));
    const F = x && at(x, "time"), U = F ? va(F) : void 0;
    U && (i.time = U);
  }
  const v = pf(n);
  v !== void 0 && (i.tempoBpm = v.bpm);
  const S = (x) => {
    const P = b.get(r[x] ?? "");
    return P ? yf(P.baseStaffIndex, P.staffCount) : [];
  };
  r.some((x) => b.has(x)) && (i.parts.length = 0);
  for (let x = 0; x < r.length; x++) {
    const P = S(x);
    if (P.length === 0) continue;
    const N = r[x];
    i.addPart(P, a.get(N), l.get(N));
  }
  for (const x of c) {
    const P = [];
    for (let N = x.firstScorePartIndex; N <= x.lastScorePartIndex; N++)
      P.push(...S(N));
    P.sort((N, F) => N - F), P.length > 0 && i.addPart(P, void 0, x.passthrough), P.length < 2 && s.drop("part-group");
  }
  const w = [], T = ef(g);
  for (const x of g) {
    const P = Pt(x.el, "measure"), N = P.length;
    let F = x.divisions;
    const U = [], _ = Yl(P);
    for (let B = 0; B < N; B++) {
      const M = P[B], G = B === N - 1;
      s.at(x.id, M.attrs.number ?? String(B + 1));
      const W = [];
      for (let O = 0; O < x.staffCount; O++) {
        const E = i.appendMeasure(x.baseStaffIndex + O);
        M.attrs.number !== void 0 && (E.number = M.attrs.number), W.push(E);
      }
      const Y = [];
      for (const O of Pt(M, "attributes")) {
        if (!O.children.some((K) => Bs.has(K.name))) continue;
        const E = tt(O, "divisions");
        E !== void 0 && (F = Math.max(1, bt(E, F))), Ul(O, W, B, i);
        for (const K of O.children)
          Bs.has(K.name) ? cf(K, s) : (Y.push(K), s.keep(K.name));
      }
      Y.length > 0 && (W[0].attributesPassthrough = Object.freeze(Y));
      const j = [];
      for (const O of Pt(M, "barline")) {
        const E = Vl(O, W, G, _);
        if (E)
          if (j.push(E), E === O) s.keep("barline");
          else for (const K of E.children) s.keep(K.name);
      }
      j.length > 0 && (W[0].barlinePassthrough = Object.freeze(j));
      const D = { last: null }, I = new $l(x, W, F), k = new Set(B === 0 ? W.map((O, E) => E) : []), V = M.children;
      for (let O = 0; O < V.length; O++) {
        const E = V[O];
        if (E.name === "note") {
          if (at(E, "grace") && !Ql(E, V, O)) {
            D.last = null, I.grace(E), s.keep("grace");
            continue;
          }
          const K = Zl(E, x, W, B, F, w, i, s, D, T.get(B));
          I.sourceTime(E, F), K && I.noteBuilt(K.k, K.note);
        } else if (E.name === "forward") {
          D.last = null;
          const K = lf(E, x, W, F, i, s);
          I.moved(E, F, 1), K && I.noteBuilt(K.k, K.note);
        } else if (E.name === "backup")
          D.last = null, I.moved(E, F, -1);
        else if (E.name === "attributes")
          if (E.children.some((K) => Bs.has(K.name)))
            zl(E, W, I.position(), k, s), I.endLead();
          else {
            I.item(E), E.children.length === 0 && s.keep("attributes");
            for (const K of E.children) s.keep(K.name);
          }
        else if (E.name === "barline")
          I.endLead();
        else if (v !== void 0 && x === g[0] && B === 0 && Ll(E, v))
          I.endLead();
        else {
          I.item(E);
          const K = E.name === "direction" ? Dl(E) : null;
          K ? U.push({ element: E, m: B, measureObjs: W, pieces: K, order: U.length }) : E.name === "direction" ? Xs(E, s) : s.keep(E.name), Hl.has(E.name) || s.unrecognized(E.name, "measure");
        }
      }
      I.finish();
    }
    _l(U, x, i, s);
  }
  hf(w, i), df(w, i);
  for (const x of w) af(x, i, s);
  return i;
}
function Ll(e, t) {
  if (e.name !== "direction") return !1;
  let n = !1;
  for (const s of e.children)
    if (s.name === "direction-type") {
      if (s.children.length !== 1 || s.children[0] !== t.source || n) return !1;
      const i = s.children[0];
      if (i.children.map((a) => a.name).join(",") !== "beat-unit,per-minute" || tt(i, "beat-unit") !== "quarter" || Object.keys(i.attrs).length > 0) return !1;
      n = !0;
    } else if (s.name === "sound") {
      if (s.children.length > 0 || Object.keys(s.attrs).join(",") !== "tempo" || Number.parseFloat(s.attrs.tempo) !== t.bpm) return !1;
    } else
      return !1;
  return n;
}
var Le, An, oe, ie, Wt, $e, ae, zt, Hs, pa, vn;
class $l {
  constructor(t, n, s) {
    z(this, zt);
    z(this, Le, []);
    z(this, An, /* @__PURE__ */ new Map());
    z(this, oe, []);
    z(this, ie, Ae);
    z(this, Wt, null);
    z(this, $e, !1);
    z(this, ae, !0);
    this.info = t, this.measureObjs = n, this.divisions = s;
  }
  /** The onset (quarters) an element read right now is anchored at, the same
   *  rule `item` applies: the previous note's stream clock when nothing has
   *  moved the cursor since, else the source cursor. An owned
   *  `<attributes>`'s clefs are placed by it (M6 Slice 4). */
  position() {
    return u(this, Wt) && !u(this, $e) ? C(this, zt, vn).call(this, u(this, Wt).k, u(this, Wt).voice) : u(this, ie);
  }
  /** Nothing read so far makes a later element "lead" any more. */
  endLead() {
    $(this, ae, !1);
  }
  /**
   * A positional element at the current position. Only a `<print>` can lead:
   * anything else at the very start of a measure is simply at onset 0 in the
   * first stream, which is also where export writes it, so it reads back the
   * same; a "lead" direction would read back as an onset-0 one.
   */
  item(t) {
    const n = u(this, ae) && t.name === "print", s = { element: t, fallback: u(this, Wt), k: 0, voice: 1, onset: Ae, lead: n };
    u(this, Le).push(s), !n && (u(this, Wt) && !u(this, $e) ? (s.k = u(this, Wt).k, s.voice = u(this, Wt).voice, s.onset = C(this, zt, vn).call(this, u(this, Wt).k, u(this, Wt).voice)) : (s.onset = u(this, ie), u(this, oe).push(s)));
  }
  /** A grace note, in its own stream at that stream's clock. */
  grace(t) {
    $(this, ae, !1);
    const n = Math.min(Math.max(1, bt(tt(t, "staff"), 1)) - 1, this.info.staffCount - 1), s = Math.max(1, bt(tt(t, "voice"), 1));
    u(this, Le).push({ element: t, fallback: null, k: n, voice: s, onset: C(this, zt, vn).call(this, n, s), lead: !1 });
  }
  /** Advance the source cursor past a `<note>` (its own `<duration>`). */
  sourceTime(t, n) {
    if ($(this, ae, !1), at(t, "chord")) return;
    const s = bt(tt(t, "duration"), 0);
    s > 0 && $(this, ie, ts(u(this, ie), he({ num: s, den: n })));
  }
  /** A `<backup>` (`sign` -1) or `<forward>` (+1) moved the source cursor. */
  moved(t, n, s) {
    $(this, ae, !1), $(this, $e, !0), C(this, zt, Hs).call(this);
    const i = bt(tt(t, "duration"), 0);
    if (i <= 0) return;
    const o = (s > 0 ? ts : ra)(u(this, ie), he({ num: i, den: n }));
    $(this, ie, o.num < 0 ? Ae : o);
  }
  /** A model note (or `<forward>` rest) was appended to staff `k`. */
  noteBuilt(t, n) {
    $(this, ae, !1), n.chordWithPrevious || u(this, An).set(`${t}:${n.voice}`, ts(C(this, zt, vn).call(this, t, n.voice), gs(n)));
    for (const s of u(this, oe))
      s.k = t, s.voice = n.voice;
    u(this, oe).length = 0, $(this, Wt, { k: t, voice: n.voice }), $(this, $e, !1);
  }
  /** Settle every anchor onto its staff's `Measure`. */
  finish() {
    if (u(this, Le).length === 0) return;
    C(this, zt, Hs).call(this);
    const t = this.measureObjs.map(() => []);
    for (const n of u(this, Le))
      n.lead || C(this, zt, pa).call(this, n), t[n.k].push({
        element: n.element,
        onset: bs(n.onset),
        voice: n.voice,
        lead: n.lead,
        divisions: this.divisions
      });
    t.forEach((n, s) => {
      n.length > 0 && (this.measureObjs[s].passthrough = Object.freeze(n));
    });
  }
}
Le = new WeakMap(), An = new WeakMap(), oe = new WeakMap(), ie = new WeakMap(), Wt = new WeakMap(), $e = new WeakMap(), ae = new WeakMap(), zt = new WeakSet(), /** Waiting anchors with a previous note settle on its stream. */
Hs = function() {
  const t = [];
  for (const n of u(this, oe))
    n.fallback ? (n.k = n.fallback.k, n.voice = n.fallback.voice) : t.push(n);
  u(this, oe).length = 0, u(this, oe).push(...t);
}, /** Move an anchor whose voice has no notes on its staff in this measure to
 *  the first stream export will actually walk: that staff's first voice,
 *  else the first staff of the part with any notes. */
pa = function(t) {
  const n = this.measureObjs[t.k].notes;
  if (n.some((i) => i.voice === t.voice)) return;
  if (n.length > 0) {
    t.voice = n[0].voice;
    return;
  }
  const s = this.measureObjs.findIndex((i) => i.notes.length > 0);
  s !== -1 && (t.k = s, t.voice = this.measureObjs[s].notes[0].voice);
}, vn = function(t, n) {
  return u(this, An).get(`${t}:${n}`) ?? Ae;
};
const Gl = new Set(ki);
function Dl(e) {
  const t = [];
  return e.children.forEach((n, s) => {
    if (n.name !== "direction-type" || n.children.length !== 1 || Object.keys(n.attrs).length > 0) return;
    const i = n.children[0];
    if (i.name === "dynamics") {
      const o = i.children.length === 1 ? i.children[0] : void 0;
      if (!o || !Gl.has(o.name) || o.children.length > 0 || o.text.trim() !== "" || Object.keys(o.attrs).length > 0) return;
      t.push({ slot: s, kind: "dynamic", dynamic: o.name, markAttrs: i.attrs });
    } else if (i.name === "wedge") {
      const o = i.attrs.type;
      if (o !== "crescendo" && o !== "diminuendo" && o !== "stop" || i.children.length > 0) return;
      const { type: a, number: r = "1", ...c } = i.attrs;
      t.push({ slot: s, kind: "wedge", type: o, number: r, markAttrs: c });
    }
  }), t.length > 0 ? t : null;
}
function _l(e, t, n, s) {
  if (e.length === 0) return;
  const i = [];
  for (const m of e) {
    const b = m.measureObjs.findIndex((w) => w.passthrough.some((T) => T.element === m.element));
    if (b === -1) continue;
    const y = m.measureObjs[b].passthrough.find((w) => w.element === m.element), v = tt(m.element, "staff"), S = v === void 0 ? b : Math.min(Math.max(1, bt(v, 1)), t.staffCount) - 1;
    i.push({ candidate: m, k: b, anchor: y, displayK: S, onset: y.onset.num / y.onset.den });
  }
  const o = [];
  for (const m of i)
    for (const b of m.candidate.pieces) b.kind === "wedge" && o.push({ at: m, piece: b });
  o.sort(
    (m, b) => m.at.candidate.m - b.at.candidate.m || m.at.onset - b.at.onset || m.at.candidate.order - b.at.candidate.order || m.piece.slot - b.piece.slot
  );
  const a = /* @__PURE__ */ new Map(), r = [], c = /* @__PURE__ */ new Set();
  for (const m of o) {
    if (m.piece.type !== "stop") {
      a.set(m.piece.number, m);
      continue;
    }
    const b = a.get(m.piece.number);
    b && (a.delete(m.piece.number), r.push([b, m]), c.add(b), c.add(m));
  }
  const f = /* @__PURE__ */ new Set();
  for (const m of o) c.has(m) || f.add(m.at.candidate);
  for (let m = f.size > 0; m; ) {
    m = !1;
    for (const [b, y] of r) {
      const v = f.has(b.at.candidate), S = f.has(y.at.candidate);
      v !== S && (f.add(v ? y.at.candidate : b.at.candidate), m = !0);
    }
  }
  const l = /* @__PURE__ */ new Map(), h = /* @__PURE__ */ new Map(), d = /* @__PURE__ */ new Map(), p = /* @__PURE__ */ new Map();
  for (const m of i) {
    const { candidate: b } = m;
    if (f.has(b)) {
      Xs(b.element, s);
      continue;
    }
    const y = b.pieces.some((B) => B.kind === "dynamic" || B.type !== "stop"), v = b.element.attrs.placement, S = y && (v === "above" || v === "below") ? v : null;
    h.set(b, S);
    const w = new Set(b.pieces.map((B) => B.slot));
    let T = b.element.attrs;
    if (S !== null) {
      const { placement: B, ...M } = T;
      T = M;
    }
    const x = Object.freeze({
      ...b.element,
      attrs: Object.freeze(T),
      children: Object.freeze(b.element.children.filter((B, M) => !w.has(M))),
      // A `<direction>` has no character data of its own, only the
      // indentation between children, which would read as content once
      // every child is cut out (and export regenerates indentation).
      text: ""
    }), P = b.pieces.length === 1 && Object.keys(b.pieces[0].markAttrs).length === 0 && Object.keys(T).length === 0 && x.children.every((B) => B.name === "staff" && t.staffCount > 1 && bt(B.text, 0) === m.displayK + 1) && x.children.length === (t.staffCount > 1 ? 1 : 0);
    for (const B of b.pieces)
      P || l.set(B, Object.freeze({ element: x, slot: B.slot, divisions: m.anchor.divisions, markAttrs: B.markAttrs }));
    Xs(x, s);
    const N = b.measureObjs[m.k], F = d.get(N) ?? /* @__PURE__ */ new Set();
    F.add(b.element), d.set(N, F);
    const U = b.measureObjs[m.displayK], _ = bi(U, m.k === m.displayK ? m.anchor.voice : void 0);
    for (const B of b.pieces) {
      if (B.kind !== "dynamic") continue;
      const M = p.get(U) ?? [];
      M.push(Object.freeze({ kind: B.dynamic, onset: m.onset, placement: S, voice: _, source: l.get(B) ?? null })), p.set(U, M);
    }
  }
  for (const [m, b] of d) {
    const y = m.passthrough.filter((v) => !b.has(v.element));
    m.passthrough = y.length > 0 ? Object.freeze(y) : Ei;
  }
  for (const [m, b] of p) m.dynamics = Object.freeze(za([...m.dynamics, ...b]));
  const g = [];
  for (const [m, b] of r) {
    if (f.has(m.at.candidate) || f.has(b.at.candidate)) continue;
    const y = m.at.displayK, v = t.baseStaffIndex + y, S = (w) => {
      const T = w.at.candidate.measureObjs[y];
      return Object.freeze({
        measureIndex: w.at.candidate.m,
        onset: w.at.onset,
        voice: bi(T, w.at.k === y ? w.at.anchor.voice : void 0),
        source: l.get(w.piece) ?? null
      });
    };
    g.push(
      Object.freeze({
        kind: m.piece.type,
        staffIndex: v,
        placement: h.get(m.at.candidate) ?? null,
        start: S(m),
        stop: S(b)
      })
    );
  }
  n.wedges.push(...g);
}
function bi(e, t) {
  var n;
  return t !== void 0 && e.notes.some((s) => s.voice === t) ? t : ((n = e.notes[0]) == null ? void 0 : n.voice) ?? t ?? 1;
}
function zl(e, t, n, s, i) {
  const o = bs(n), a = o.num / o.den;
  for (const r of Pt(e, "clef")) {
    const c = Math.max(1, bt(r.attrs.number, 1)) - 1, f = t[c];
    if (!f || s.delete(c)) continue;
    const l = ya(r, i);
    if (a === 0) {
      f.clef !== void 0 && i.drop("clef"), f.clef = l;
      continue;
    }
    const h = f.clefChanges.filter((d) => Math.abs(d.onset - a) > 1e-9);
    h.length < f.clefChanges.length && i.drop("clef"), f.clefChanges = [...h, { onset: a, clef: l }].sort((d, p) => d.onset - p.onset);
  }
}
function Ul(e, t, n, s) {
  const i = at(e, "key");
  if (i) {
    const a = tt(i, "fifths");
    if (a !== void 0) {
      const r = bt(a, 0);
      if (n !== 0 || r !== s.keyFifths)
        for (const c of t) c.keyFifths = r;
    }
  }
  const o = at(e, "time");
  if (o) {
    const a = va(o);
    if (a && (n !== 0 || !bf(a, s.time)))
      for (const r of t) r.time = a;
  }
}
function Yl(e) {
  var s;
  const t = /* @__PURE__ */ new Set();
  let n;
  for (const i of e)
    for (const o of Pt(i, "barline")) {
      const a = at(o, "ending");
      if (!a) continue;
      const r = o.attrs.location ?? "right", c = (s = ma(a.attrs.number)) == null ? void 0 : s.join(), f = a.attrs.type;
      if (f === "start" && r === "left" && c !== void 0) {
        n = { el: a, numbers: c };
        continue;
      }
      (f === "stop" || f === "discontinue") && r === "right" && (n == null ? void 0 : n.numbers) === c && (t.add(n.el), t.add(a)), n = void 0;
    }
  return t;
}
function ma(e) {
  const t = (e ?? "").split(/[\s,]+/).filter((n) => n !== "");
  if (!(t.length === 0 || !t.every((n) => /^[1-9]\d*$/.test(n))))
    return [...new Set(t.map(Number))].sort((n, s) => n - s);
}
function jl(e) {
  const { number: t, type: n, ...s } = e.attrs;
  return Object.freeze(s);
}
function Vl(e, t, n, s) {
  const i = e.attrs.location ?? "right", o = at(e, "repeat"), a = o == null ? void 0 : o.attrs.direction, r = tt(e, "bar-style");
  let c = !1, f = !1;
  if (i === "left") {
    if (a === "forward") {
      for (const p of t) p.startBarline = "repeatStart";
      c = !0, f = !0;
    }
  } else if (i === "right") {
    if (r === "light-light") {
      for (const p of t) p.endBarline = "double";
      c = !0;
    } else if (r === "light-heavy" && a === "backward") {
      const p = o.attrs.times;
      for (const g of t)
        g.endBarline = "repeatEnd", p !== void 0 && /^[1-9]\d*$/.test(p) && (g.repeatTimes = Number(p));
      c = !0, f = !0;
    } else if (r === "light-heavy") {
      if (!n) for (const p of t) p.endBarline = "final";
      c = !0;
    }
  }
  const l = at(e, "ending"), h = l !== void 0 && s.has(l);
  if (h) {
    const p = jl(l);
    if (l.attrs.type === "start") {
      const g = Object.freeze({
        numbers: Object.freeze(ma(l.attrs.number)),
        text: l.text.trim() || null,
        attrs: p
      });
      for (const m of t) m.endingStart = g;
    } else {
      const g = Object.freeze({ kind: l.attrs.type, attrs: p });
      for (const m of t) m.endingEnd = g;
    }
  }
  if (!c && !h) return e;
  const d = e.children.filter(
    (p) => !(c && p.name === "bar-style" || f && p.name === "repeat" || h && p === l)
  );
  if (d.length !== 0)
    return Object.freeze({ ...e, children: Object.freeze(d) });
}
const Hl = /* @__PURE__ */ new Set([
  "direction",
  "print",
  "sound",
  "harmony",
  "figured-bass",
  "grouping",
  "link",
  "bookmark",
  "listening"
]), Bs = /* @__PURE__ */ new Set(["divisions", "key", "time", "clef", "staves"]), Xl = {
  key: /* @__PURE__ */ new Set(["fifths"]),
  time: /* @__PURE__ */ new Set(["beats", "beat-type"]),
  clef: /* @__PURE__ */ new Set(["sign", "line", "clef-octave-change"])
}, Kl = /* @__PURE__ */ new Set([
  "chord",
  "pitch",
  "unpitched",
  "rest",
  "duration",
  "tie",
  "voice",
  "type",
  "dot",
  "time-modification",
  "staff",
  "notations",
  "grace",
  "stem",
  "beam",
  "accidental"
]), ql = /* @__PURE__ */ new Set([
  "cue",
  "instrument",
  "footnote",
  "level",
  "notehead",
  "notehead-text",
  "lyric",
  "play",
  "listen"
]);
function Ql(e, t, n) {
  if (!at(e, "pitch") || at(e, "chord") || at(e, "time-modification")) return !1;
  for (let s = n + 1; s < t.length; s++)
    if (t[s].name === "note")
      return !(at(t[s], "grace") && at(t[s], "chord"));
  return !0;
}
function Jl(e, t) {
  const n = (i) => {
    if (i === void 0) return null;
    const o = Number.parseFloat(i);
    return Number.isFinite(o) ? o : null;
  }, s = n(e.attrs["make-time"]);
  return Object.freeze({
    slash: e.attrs.slash === "yes",
    stealTimePrevious: n(e.attrs["steal-time-previous"]),
    stealTimeFollowing: n(e.attrs["steal-time-following"]),
    makeTime: s === null ? null : s / (t * 4)
  });
}
function Zl(e, t, n, s, i, o, a, r, c, f) {
  const l = at(e, "chord") !== void 0, h = l ? c.last : null;
  if (l && (!h || !h.pitched || !at(e, "pitch")))
    return r.drop("chord"), r.warnOnce("chord", "importMusicXml: <chord/> note with no pitched note to join; dropping it"), null;
  const d = Math.max(1, bt(tt(e, "staff"), 1)), p = Math.min(d - 1, n.length - 1), g = h ? h.k : p, m = h ? h.measure : n[g] ?? n[0];
  if (!m) return null;
  const b = h ? h.staffIndex : t.baseStaffIndex + g, y = h ? h.voice : Math.max(1, bt(tt(e, "voice"), 1)), v = h !== null;
  let S = null;
  const w = at(e, "rest");
  if (!w) {
    const D = at(e, "pitch");
    D ? S = {
      step: tt(D, "step") ?? "C",
      alter: Number.parseFloat(tt(D, "alter") ?? "0") || 0,
      octave: bt(tt(D, "octave"), 4)
    } : at(e, "unpitched") && r.drop("unpitched");
  }
  const T = at(e, "time-modification");
  let x;
  if (T) {
    const D = bt(tt(T, "actual-notes"), 1), I = bt(tt(T, "normal-notes"), 1);
    D !== I && (x = { actualNotes: D, normalNotes: I });
  }
  const P = Math.min(2, Pt(e, "dot").length), N = Pt(e, "notations"), F = sf(N), U = of(e), _ = t.hasBeams ? tf(e) : null;
  let B;
  if (w && ga(e, i, f !== void 0)) {
    const D = Mi(a.timeAt(s, b)), I = f === void 0 ? D : Math.min(D, f > 0 ? f : fo(e, i) ?? D);
    B = a.appendNote(m, {
      pitch: null,
      value: "whole",
      voice: y,
      measureRestWholes: I,
      articulations: F.articulations,
      fermata: F.fermata,
      beam: _,
      lyrics: U.lyrics
    });
  } else {
    const D = tt(e, "type"), I = at(e, "grace"), { value: k, dots: V } = D !== void 0 && mf(D) ? { value: D, dots: P } : I ? { value: "eighth", dots: P } : xa(tt(e, "duration"), i, x, P, r, D);
    B = a.appendNote(m, {
      pitch: S,
      value: k,
      voice: y,
      dots: V,
      tuplet: x,
      chordWithPrevious: v,
      articulations: F.articulations,
      fermata: F.fermata,
      arpeggiate: F.arpeggiate,
      beam: _,
      grace: I ? Jl(I, i) : null,
      lyrics: U.lyrics
    });
  }
  c.last = B.isGrace ? null : { measure: m, k: g, staffIndex: b, voice: y, pitched: S !== null };
  let M = !1, G = !1;
  const W = Pt(e, "tie");
  if (W.length > 0)
    M = W.some((D) => D.attrs.type === "start"), G = W.some((D) => D.attrs.type === "stop");
  else
    for (const D of N)
      for (const I of Pt(D, "tied"))
        I.attrs.type === "start" && (M = !0), I.attrs.type === "stop" && (G = !0);
  const Y = [], j = [];
  for (const D of N)
    for (const I of Pt(D, "slur")) {
      const k = { number: bt(I.attrs.number, 1), el: I, paired: !1 };
      I.attrs.type === "start" ? Y.push(k) : I.attrs.type === "stop" && j.push(k);
    }
  return o.push({
    id: B.id,
    note: B,
    el: e,
    staffIndex: b,
    voice: y,
    pitch: S,
    tieStart: M,
    tieStop: G,
    slurStarts: Y,
    slurStops: j,
    ownedMarks: F.owned,
    ownedLyrics: U.owned
  }), { k: g, note: B };
}
function tf(e) {
  for (const t of Pt(e, "beam")) {
    if ((t.attrs.number ?? "1") !== "1") continue;
    const n = t.text.trim();
    if (n === "begin" || n === "continue" || n === "end") return n;
  }
  return "none";
}
function ga(e, t, n) {
  const s = at(e, "rest");
  if (!s || at(e, "chord") || at(e, "grace")) return !1;
  if (s.attrs.measure === "yes") return !0;
  if (!n || tt(e, "type") !== "whole") return !1;
  const i = fo(e, t);
  return i !== void 0 && i < 1;
}
function fo(e, t) {
  const n = Number.parseFloat(tt(e, "duration") ?? "");
  return Number.isFinite(n) && n > 0 ? n / (t * 4) : void 0;
}
function ef(e) {
  const t = e.map((s) => Pt(s.el, "measure")), n = /* @__PURE__ */ new Map();
  for (const s of t)
    s.forEach((i, o) => {
      (o === 0 || i.attrs.implicit === "yes") && n.set(o, 0);
    });
  return e.forEach((s, i) => {
    let o = s.divisions;
    t[i].forEach((a, r) => {
      const c = n.has(r);
      let f = 0, l = 0;
      for (const h of a.children) {
        if (h.name === "attributes") {
          const p = tt(h, "divisions");
          p !== void 0 && (o = Math.max(1, bt(p, o)));
        }
        if (!c) continue;
        const d = fo(h, o) ?? 0;
        h.name === "backup" ? f -= d : h.name === "forward" ? l = Math.max(l, f += d) : h.name === "note" && !at(h, "chord") && !at(h, "grace") && (f += d, ga(h, o, !0) || (l = Math.max(l, f)));
      }
      c && n.set(r, Math.max(n.get(r), l));
    });
  }), n;
}
const nf = new Set(Va);
function sf(e) {
  const t = [];
  let n = null, s = !1, i;
  for (const o of e)
    for (const a of o.children)
      if (a.name === "articulations")
        for (const r of a.children) {
          if (!nf.has(r.name)) continue;
          const c = r.name;
          t.includes(c) || (t.push(c), (i ?? (i = /* @__PURE__ */ new Set())).add(r));
        }
      else if (a.name === "fermata" && n === null) {
        const r = a.text.trim(), c = a.attrs.type ?? "upright";
        if (r !== "" && r !== "normal" || c !== "upright" && c !== "inverted") continue;
        n = c, (i ?? (i = /* @__PURE__ */ new Set())).add(a);
      } else a.name === "arpeggiate" && !s && a.attrs.direction === void 0 && (s = !0, (i ?? (i = /* @__PURE__ */ new Set())).add(a));
  return { articulations: t, fermata: n, arpeggiate: s, owned: i ?? ba };
}
const ba = /* @__PURE__ */ new Set();
function of(e) {
  let t, n;
  for (const s of e.children) {
    if (s.name !== "lyric") continue;
    const i = la(s);
    !i || t != null && t.some((o) => o.verse === i.verse) || ((t ?? (t = [])).push(i), (n ?? (n = /* @__PURE__ */ new Set())).add(s));
  }
  return { lyrics: t ?? Ua, owned: n ?? ba };
}
function af(e, t, n) {
  const s = e.note, i = s.tiedToId !== null, o = t.tiedFromNote(s.id) !== void 0, a = (f) => f === "start" && i || f === "stop" && o;
  let r;
  const c = (f) => {
    (r ?? (r = [])).push(f);
  };
  for (const f of e.el.children)
    if (!e.ownedLyrics.has(f)) {
      if (!Kl.has(f.name))
        c(f), n.keep(f.name), ql.has(f.name) || n.unrecognized(f.name, "note");
      else if (f.name === "rest") {
        if (f.children.length === 0) continue;
        const { measure: l, ...h } = f.attrs;
        c(Object.freeze({ name: "rest", attrs: Object.freeze(h), children: f.children, text: "" }));
        for (const d of f.children) n.keep(d.name);
      } else if (f.name === "tie") {
        if (a(f.attrs.type)) continue;
        c(f), n.keep("tie");
      } else if (f.name === "notations") {
        const l = [];
        for (const h of f.children)
          if (!(h.name === "tied" && a(h.attrs.type)) && !(h.name === "slur" && rf(e, h)) && !e.ownedMarks.has(h)) {
            if (h.name === "articulations" && h.children.some((d) => e.ownedMarks.has(d))) {
              const d = h.children.filter((p) => !e.ownedMarks.has(p));
              d.length > 0 && l.push(Object.freeze({ ...h, children: Object.freeze(d) }));
              continue;
            }
            l.push(h);
          }
        if (l.length === 0) continue;
        c(Object.freeze({ ...f, children: Object.freeze(l) }));
        for (const h of l) n.keep(h.name);
      }
    }
  r && (s.passthrough = Object.freeze(r));
}
function rf(e, t) {
  for (const n of e.slurStarts) if (n.el === t) return n.paired;
  for (const n of e.slurStops) if (n.el === t) return n.paired;
  return !1;
}
function Xs(e, t) {
  for (const n of e.children)
    if (n.name === "direction-type")
      for (const s of n.children) t.keep(s.name);
    else n.name === "sound" && t.keep("sound");
}
function cf(e, t) {
  const n = Xl[e.name];
  if (n)
    for (const s of e.children) n.has(s.name) || t.drop(s.name);
}
function lf(e, t, n, s, i, o) {
  const a = tt(e, "duration");
  if (a === void 0) return null;
  const r = Math.max(1, bt(tt(e, "staff"), 1)), c = Math.min(r - 1, n.length - 1), f = n[c] ?? n[0];
  if (!f) return null;
  const l = Math.max(1, bt(tt(e, "voice"), 1)), { value: h, dots: d } = xa(a, s, void 0, 0, o);
  return { k: c, note: i.appendNote(f, { pitch: null, value: h, voice: l, dots: d }) };
}
var be, Cn, Pn, Fn;
class ff {
  constructor(t) {
    z(this, be);
    z(this, Cn, /* @__PURE__ */ new Set());
    z(this, Pn, "");
    z(this, Fn, "");
    $(this, be, t);
  }
  at(t, n) {
    $(this, Pn, t), $(this, Fn, n);
  }
  /** A known element, genuinely lost. */
  drop(t) {
    var s;
    const n = (s = u(this, be)) == null ? void 0 : s.dropped;
    n && n.set(t, (n.get(t) ?? 0) + 1);
  }
  /** An element kept as an opaque passthrough payload. */
  keep(t) {
    var s;
    const n = (s = u(this, be)) == null ? void 0 : s.passthrough;
    n && n.set(t, (n.get(t) ?? 0) + 1);
  }
  /** An element name this importer has no bucket for. It is passed through
   *  like any other unmodelled element (the caller tallies that), but worth
   *  a warning, since it may be a typo or newer MusicXML. */
  unrecognized(t, n) {
    this.warnOnce(t, `importMusicXml: passing through unrecognized <${t}> inside <${n}>`);
  }
  /** Something kept, but guessed. `warnKey` dedupes the console form, which
   *  stays one generic message per kind; the recorded event is per site. */
  fallback(t, n, s, i) {
    var o;
    (o = u(this, be)) == null || o.fallbacks.push({
      kind: t,
      partId: u(this, Pn),
      measureNumber: u(this, Fn),
      detail: i
    }), this.warnOnce(n, s);
  }
  warnOnce(t, n) {
    u(this, be) || u(this, Cn).has(t) || (u(this, Cn).add(t), console.warn(n));
  }
}
be = new WeakMap(), Cn = new WeakMap(), Pn = new WeakMap(), Fn = new WeakMap();
function hf(e, t) {
  for (let n = 0; n < e.length; n++) {
    const s = e[n];
    if (!(!s.tieStart || s.pitch === null))
      for (let i = n + 1; i < e.length; i++) {
        const o = e[i];
        if (!(o.staffIndex !== s.staffIndex || o.voice !== s.voice) && !(o.pitch === null || !gf(o.pitch, s.pitch)) && o.tieStop) {
          t.setTie(s.id, o.id);
          break;
        }
      }
  }
}
function df(e, t) {
  var n;
  for (let s = 0; s < t.staves.length; s++) {
    const i = /* @__PURE__ */ new Map();
    for (const o of e)
      if (o.staffIndex === s) {
        for (const a of o.slurStops) {
          const r = (n = i.get(a.number)) == null ? void 0 : n.pop();
          r !== void 0 && (t.addSlur(r.id, o.id), r.end.paired = !0, a.paired = !0);
        }
        for (const a of o.slurStarts) {
          const r = i.get(a.number) ?? [];
          r.push({ id: o.id, end: a }), i.set(a.number, r);
        }
      }
  }
}
const uf = [
  { sign: "G", line: "2", clef: "treble" },
  { sign: "G", line: "2", octaveChange: "-1", clef: "treble8" },
  { sign: "F", line: "4", clef: "bass" },
  // The two C clefs the model draws (M6 Slice 4). Soprano (C1), mezzo (C2)
  // and baritone (C5) still fall back to treble, reported.
  { sign: "C", line: "3", clef: "alto" },
  { sign: "C", line: "4", clef: "tenor" }
];
function ya(e, t) {
  const n = tt(e, "sign") ?? "", s = tt(e, "line") ?? "", i = tt(e, "clef-octave-change"), o = i === void 0 || i === "0" ? void 0 : i;
  for (const a of uf)
    if (a.sign === n && a.line === s && a.octaveChange === o)
      return a.clef;
  return t.fallback(
    "clef",
    `clef:${n}/${s}/${i ?? ""}`,
    `importMusicXml: unrecognized clef <sign>${n}</sign><line>${s}</line>; defaulting to treble`,
    `sign ${n} line ${s}${i === void 0 ? "" : ` octave-change ${i}`}`
  ), "treble";
}
function va(e) {
  const t = tt(e, "beats"), n = tt(e, "beat-type");
  if (t === void 0 || n === void 0) return;
  const s = Number.parseInt(t, 10), i = Number.parseInt(n, 10);
  if (!(!Number.isFinite(s) || !Number.isFinite(i) || i <= 0))
    return { beats: s, beatType: i };
}
function pf(e) {
  for (const t of Vs(e, "metronome")) {
    const n = tt(t, "per-minute");
    if (n !== void 0) {
      const s = Number.parseFloat(n);
      if (Number.isFinite(s)) return { bpm: s, source: t };
    }
  }
  for (const t of Vs(e, "sound"))
    if (t.attrs.tempo !== void 0) {
      const n = Number.parseFloat(t.attrs.tempo);
      if (Number.isFinite(n)) return { bpm: n, source: t };
    }
}
function xa(e, t, n, s, i, o) {
  if (e !== void 0 && t > 0) {
    let a = Number.parseFloat(e) / (t * 4);
    if (Number.isFinite(a)) {
      n && (a *= n.actualNotes / n.normalNotes);
      const r = ja(a, s > 0 ? [s] : [0, 1, 2]);
      if (r) return r;
    }
  }
  return i.fallback(
    "note-value",
    "note-value-fallback",
    "importMusicXml: a <note> had no usable <type> and no duration that maps to a note value; using quarter",
    `${o === void 0 ? "" : `unsupported <type>${o}</type>, `}duration ${(e == null ? void 0 : e.trim()) ?? "(none)"} at divisions ${t}${n ? ` in a ${n.actualNotes}:${n.normalNotes} tuplet` : ""}`
  ), { value: "quarter", dots: s };
}
function mf(e) {
  return Ya.includes(e);
}
function gf(e, t) {
  return e.step === t.step && e.alter === t.alter && e.octave === t.octave;
}
function bf(e, t) {
  return e.beats === t.beats && e.beatType === t.beatType;
}
function bt(e, t) {
  if (e == null) return t;
  const n = Number.parseInt(e, 10);
  return Number.isFinite(n) ? n : t;
}
function yf(e, t) {
  return Array.from({ length: t }, (n, s) => e + s);
}
function vf(e) {
  var t;
  return ((t = at(e, "measure")) == null ? void 0 : t.attrs.number) ?? "1";
}
function yi(e) {
  const t = at(e, "measure"), n = t ? Pt(t, "attributes") : [];
  return n.length <= 1 ? n[0] : { name: "attributes", attrs: {}, children: n.flatMap((s) => s.children), text: "" };
}
const xf = 200;
function vi(e) {
  return Math.max(xf, Math.floor(e));
}
function Sf(e, t) {
  return e <= 0 || t <= 0 ? 1 : Math.min(1, t / e);
}
function wf(e, t, n, s) {
  return { x: 0, y: e / s, width: n, height: t / s };
}
function Mf(e, t, n, s, i) {
  return {
    x: (e - n.left) / i + ((s == null ? void 0 : s.x) ?? 0),
    y: (t - n.top) / i + ((s == null ? void 0 : s.y) ?? 0)
  };
}
function kf(e, t, n) {
  return { x: t.x + e.x * n, y: t.y + e.y * n, width: e.width * n, height: e.height * n };
}
function Ef(e, t, n, s, i) {
  const o = n + e.y * t, a = e.height * t;
  return o >= s && o + a <= s + i ? null : Math.max(0, o + a / 2 - i / 2);
}
var ye, cn, Wn, On;
class Tf {
  constructor(t, n = (s) => queueMicrotask(s)) {
    z(this, ye, []);
    z(this, cn, !1);
    z(this, Wn);
    z(this, On);
    $(this, Wn, t), $(this, On, n);
  }
  push(t) {
    u(this, ye).push(t), !u(this, cn) && ($(this, cn, !0), u(this, On).call(this, () => {
      if ($(this, cn, !1), u(this, ye).length === 0) return;
      const n = u(this, ye);
      $(this, ye, []), u(this, Wn).call(this, n);
    }));
  }
  /** Drop whatever has not been flushed yet (a stop or seek mid-turn). */
  clear() {
    $(this, ye, []);
  }
}
ye = new WeakMap(), cn = new WeakMap(), Wn = new WeakMap(), On = new WeakMap();
const If = 10, Bf = 100;
async function Lf(e, t, n = {}) {
  const s = n.fontUrl === void 0 ? await ii() : await ii(n.fontUrl);
  return new Nf(e, Sa(t), n, s);
}
function Sa(e) {
  return typeof e == "string" ? Rl(e) : e;
}
var mt, Bt, ve, Ct, re, Rn, St, Ge, ce, De, _e, ln, ee, gt, xe, ze, Se, Ue, fn, hn, Ln, Dt, we, Ot, $n, Ye, Me, R, ns, Je, ss, Ze, xn, tn, Ks, Be, wa, os, Gn, Dn, fs, qs, Sn, Ma, ka, Ea, Ta, Ia, wn, Ba, Na, is;
class Nf {
  constructor(t, n, s, i) {
    z(this, R);
    z(this, mt);
    /** The host's outer scroll element (`MountOptions.scrollElement`), or
     *  `null` when the container scrolls itself. */
    z(this, Bt);
    z(this, ve);
    z(this, Ct);
    z(this, re);
    z(this, Rn);
    z(this, St);
    z(this, Ge);
    z(this, ce, { noteclick: /* @__PURE__ */ new Set(), onset: /* @__PURE__ */ new Set(), end: /* @__PURE__ */ new Set(), layout: /* @__PURE__ */ new Set() });
    z(this, De);
    z(this, _e);
    /** The container's inline `overflow` before the view set it, or `null`
     *  when the view left it alone. */
    z(this, ln, null);
    z(this, ee);
    z(this, gt);
    z(this, xe);
    z(this, ze);
    /** Layout pixels to CSS pixels (see `fitScale`). */
    z(this, Se, 1);
    z(this, Ue, 0);
    /** Where layout (0, 0) sits in the container's scroll content, CSS pixels
     *  (see `noteBox`). Measured by `#size`, not per lookup, so a host placing
     *  many overlays does not force a reflow per box. */
    z(this, fn, { x: 0, y: 0 });
    z(this, hn);
    /** Container width and scroller height `#size` last measured, so a resize
     *  notice for the container's own growth (it is as tall as the score when
     *  an outer element scrolls) does not relayout. */
    z(this, Ln, "");
    z(this, Dt, !1);
    z(this, we, null);
    z(this, Ot, null);
    /** The timeline `#engine` was built from; rebuilt when the score changes. */
    z(this, $n, null);
    /** The current score's timeline, `null` until needed or after an edit. */
    z(this, Ye, null);
    /** Position to start from while no engine exists yet (a seek before the first play). */
    z(this, Me, 0);
    // Scroll events arrive at most once per frame, before it paints, so painting
    // here keeps the canvas in step. Only the visible measures draw.
    z(this, Gn, () => {
      u(this, Bt) && !C(this, R, ka).call(this, u(this, Bt)) || (C(this, R, os).call(this), u(this, St).drawAll());
    });
    z(this, Dn, (t) => {
      const n = Mf(
        t.clientX,
        t.clientY,
        u(this, Ct).getBoundingClientRect(),
        u(this, St).viewport,
        u(this, Se)
      ), s = hc(u(this, gt), n.x, n.y);
      for (const i of u(this, ce).noteclick) i(s, t);
    });
    z(this, fs, () => {
      clearTimeout(u(this, hn)), $(this, hn, setTimeout(() => {
        if (u(this, Dt)) return;
        const t = u(this, Bt) ?? u(this, mt);
        u(this, Bt) && u(this, Ln) === `${C(this, R, tn).call(this)}x${t.clientHeight}` || (C(this, R, Ks).call(this) && C(this, R, Je).call(this), C(this, R, Be).call(this), u(this, St).drawAll(), C(this, R, Ze).call(this));
      }, Bf));
    });
    var f, l;
    const o = t.ownerDocument, a = o.defaultView;
    if (!a) throw new Error("mountScore needs a container attached to a window.");
    const r = s.scrollElement;
    if (r && !r.contains(t))
      throw new Error("mountScore: options.scrollElement must be an ancestor of the container.");
    $(this, mt, t), $(this, Bt, r && r !== t ? r : null), $(this, ve, a), $(this, Ge, s), $(this, ee, n), $(this, xe, s.staffSpacePx ?? If), !u(this, Bt) && a.getComputedStyle(t).overflowY === "visible" && ($(this, ln, t.style.overflow), t.style.overflow = "auto"), $(this, Ct, o.createElement("canvas")), Object.assign(u(this, Ct).style, { display: "block", position: "sticky", top: "0", width: "0", height: "0" }), $(this, re, o.createElement("div")), t.append(u(this, Ct), u(this, re));
    const c = u(this, Ct).getContext("2d");
    if (!c) throw new Error("mountScore could not get a 2D canvas context.");
    $(this, Rn, c), $(this, ze, s.systemWidthPx ?? vi(C(this, R, tn).call(this))), $(this, gt, Go(n, C(this, R, ns).call(this))), $(this, St, new mc(c, u(this, gt), { ...s.renderer, fontFamily: i })), $(this, De, new Tf((h) => C(this, R, Na).call(this, h))), C(this, R, Be).call(this), C(this, R, Ks).call(this) && (C(this, R, Je).call(this), C(this, R, Be).call(this)), u(this, St).drawAll(), C(this, R, qs).call(this).addEventListener("scroll", u(this, Gn), { passive: !0 }), u(this, Ct).addEventListener("pointerdown", u(this, Dn)), $(this, _e, a.ResizeObserver ? new a.ResizeObserver(u(this, fs)) : null), (f = u(this, _e)) == null || f.observe(t), u(this, Bt) && ((l = u(this, _e)) == null || l.observe(u(this, Bt)));
  }
  get score() {
    return u(this, ee);
  }
  get layout() {
    return u(this, gt);
  }
  get renderer() {
    return u(this, St);
  }
  get canvas() {
    return u(this, Ct);
  }
  get staffSpacePx() {
    return u(this, xe);
  }
  get isPlaying() {
    var t;
    return ((t = u(this, Ot)) == null ? void 0 : t.isPlaying) ?? !1;
  }
  get positionSeconds() {
    var t;
    return ((t = u(this, Ot)) == null ? void 0 : t.positionSeconds) ?? u(this, Me);
  }
  get durationSeconds() {
    return C(this, R, wn).call(this).reduce((t, n) => Math.max(t, n.startSeconds + n.durationSeconds), 0);
  }
  on(t, n) {
    const s = u(this, ce)[t];
    return s.add(n), () => s.delete(n);
  }
  load(t) {
    u(this, Dt) || (this.stop(), $(this, ee, Sa(t)), $(this, Ye, null), C(this, R, Je).call(this), C(this, R, Ea).call(this), C(this, R, Be).call(this), u(this, St).drawAll(), C(this, R, Ze).call(this));
  }
  setScore(t) {
    u(this, Dt) || ($(this, ee, t), this.refresh());
  }
  refresh(t) {
    if (u(this, Dt)) return !1;
    if ($(this, Ye, null), t) {
      let n = u(this, gt);
      for (const { staffIndex: s, measureIndex: i } of t)
        n = n && xr(u(this, ee), n, i, C(this, R, ns).call(this), s);
      if (n) {
        $(this, gt, n), u(this, St).setLayout(n);
        for (const { staffIndex: s, measureIndex: i } of t) u(this, St).redrawMeasure(i, s);
        return C(this, R, Ze).call(this), !0;
      }
    }
    return C(this, R, Je).call(this), C(this, R, Be).call(this), u(this, St).drawAll(), C(this, R, Ze).call(this), !1;
  }
  setZoom(t) {
    if (u(this, Dt) || t === u(this, xe) || !(t > 0)) return;
    const n = C(this, R, Ta).call(this);
    $(this, xe, t), C(this, R, Je).call(this), C(this, R, Be).call(this), n !== null && C(this, R, Ia).call(this, n), C(this, R, os).call(this), u(this, St).drawAll(), C(this, R, Ze).call(this);
  }
  noteBox(t) {
    for (const n of u(this, gt).measures) {
      const s = n.notes.find((i) => i.id === t);
      if (s) return C(this, R, ss).call(this, s.bounds);
    }
    return null;
  }
  measureBox({ staffIndex: t, measureIndex: n }) {
    const s = u(this, gt).measures.find((i) => i.staffIndex === t && i.index === n);
    return s ? C(this, R, ss).call(this, s.region) : null;
  }
  staffBoxes(t) {
    const n = [];
    for (const s of u(this, gt).systems) {
      if (s.staffIndex !== t) continue;
      const i = u(this, gt).measures.filter((f) => f.staffIndex === t && s.measureIndices.includes(f.index)).map((f) => f.region);
      if (i.length === 0) continue;
      const o = Math.min(...i.map((f) => f.x)), a = Math.min(...i.map((f) => f.y)), r = Math.max(...i.map((f) => f.x + f.width)), c = Math.max(...i.map((f) => f.y + f.height));
      n.push(C(this, R, ss).call(this, { x: o, y: a, width: r - o, height: c - a }));
    }
    return n;
  }
  scrollToNote(t) {
    const n = dc(u(this, gt), t);
    if (!n) return;
    const s = u(this, Bt), i = s ? C(this, R, Ma).call(this, s) + u(this, fn).y : C(this, R, xn).call(this, u(this, mt)).top, o = s ?? u(this, mt), a = Ef(n, u(this, Se), i, o.scrollTop, o.clientHeight);
    a !== null && o.scrollTo({ top: a, behavior: "smooth" });
  }
  play() {
    var n;
    if (u(this, Dt) || u(this, Ge).playback === !1) return;
    const t = C(this, R, Ba).call(this);
    (n = u(this, we)) == null || n.resume(), t.play();
  }
  pause() {
    var t;
    (t = u(this, Ot)) == null || t.pause();
  }
  stop() {
    var t;
    (t = u(this, Ot)) == null || t.stop(), $(this, Me, 0), C(this, R, is).call(this);
  }
  seek(t) {
    const n = Math.max(0, t);
    u(this, Ot) ? u(this, Ot).seek(n) : $(this, Me, n), C(this, R, is).call(this);
  }
  seekToNote(t) {
    const n = Gc(C(this, R, wn).call(this), t);
    return n === void 0 ? !1 : (this.seek(n), !0);
  }
  destroy() {
    var t, n, s;
    if (!u(this, Dt)) {
      $(this, Dt, !0), (t = u(this, Ot)) == null || t.stop(), $(this, Ot, null), u(this, De).clear(), (n = u(this, we)) == null || n.close(), $(this, we, null), clearTimeout(u(this, hn)), (s = u(this, _e)) == null || s.disconnect(), C(this, R, qs).call(this).removeEventListener("scroll", u(this, Gn)), u(this, Ct).removeEventListener("pointerdown", u(this, Dn)), u(this, Ct).remove(), u(this, re).remove(), u(this, ln) !== null && (u(this, mt).style.overflow = u(this, ln));
      for (const i of Object.values(u(this, ce))) i.clear();
    }
  }
}
mt = new WeakMap(), Bt = new WeakMap(), ve = new WeakMap(), Ct = new WeakMap(), re = new WeakMap(), Rn = new WeakMap(), St = new WeakMap(), Ge = new WeakMap(), ce = new WeakMap(), De = new WeakMap(), _e = new WeakMap(), ln = new WeakMap(), ee = new WeakMap(), gt = new WeakMap(), xe = new WeakMap(), ze = new WeakMap(), Se = new WeakMap(), Ue = new WeakMap(), fn = new WeakMap(), hn = new WeakMap(), Ln = new WeakMap(), Dt = new WeakMap(), we = new WeakMap(), Ot = new WeakMap(), $n = new WeakMap(), Ye = new WeakMap(), Me = new WeakMap(), R = new WeakSet(), // --- Layout and painting ------------------------------------------------
ns = function() {
  return { staffSpacePx: u(this, xe), systemWidthPx: u(this, ze) };
}, Je = function() {
  $(this, gt, Go(u(this, ee), C(this, R, ns).call(this))), u(this, St).setLayout(u(this, gt));
}, ss = function(t) {
  return kf(t, u(this, fn), u(this, Se));
}, Ze = function() {
  for (const t of u(this, ce).layout) t(u(this, gt));
}, xn = function(t) {
  const n = u(this, ve).getComputedStyle(t);
  return {
    left: parseFloat(n.paddingLeft) || 0,
    right: parseFloat(n.paddingRight) || 0,
    top: parseFloat(n.paddingTop) || 0,
    bottom: parseFloat(n.paddingBottom) || 0
  };
}, tn = function() {
  const t = C(this, R, xn).call(this, u(this, mt));
  return u(this, mt).clientWidth - t.left - t.right;
}, /** Update the derived system width; true when it changed (needs a relayout). */
Ks = function() {
  if (u(this, Ge).systemWidthPx !== void 0) return !1;
  const t = vi(C(this, R, tn).call(this));
  return t === u(this, ze) ? !1 : ($(this, ze, t), !0);
}, /**
 * Size the canvas to the visible window and the spacer to the rest of the
 * score's height, at the full device pixel ratio, then point the renderer
 * at the visible band. Does not paint.
 *
 * Measured in passes because each answer depends on the last: the
 * container's width depends on whether the score's height gave it a
 * scrollbar, the scale on that width, and the visible height on the
 * scaled height. The total content height stays the score's throughout,
 * so the scroll position is not disturbed along the way.
 */
Be = function() {
  const t = u(this, Ct), n = u(this, Bt) ?? u(this, mt), s = C(this, R, xn).call(this, n), i = (l, h) => {
    const d = u(this, gt).height * l;
    t.style.width = `${u(this, gt).width * l}px`, t.style.height = `${h}px`, u(this, re).style.height = `${d - h}px`;
  };
  i(1, 0);
  const o = Sf(u(this, gt).width, C(this, R, tn).call(this));
  i(o, 0);
  const a = u(this, gt).height * o, r = n.clientHeight - s.top - s.bottom, c = Math.min(a, r > 0 ? r : u(this, ve).innerHeight);
  i(o, c);
  const f = u(this, ve).devicePixelRatio || 1;
  t.width = Math.ceil(u(this, gt).width * o * f), t.height = Math.ceil(c * f), u(this, Rn).setTransform(f * o, 0, 0, f * o, 0, 0), $(this, Se, o), $(this, Ue, c), $(this, fn, C(this, R, wa).call(this)), $(this, Ln, `${C(this, R, tn).call(this)}x${n.clientHeight}`), C(this, R, os).call(this);
}, /** Layout (0, 0) in scroll-content coordinates. The canvas is sticky, so
 *  its own rect moves with scrolling; its in-flow top is read off the
 *  spacer instead, as in `#updateViewport`. */
wa = function() {
  const t = u(this, mt), n = t.getBoundingClientRect(), s = u(this, Ct).getBoundingClientRect().left, i = u(this, re).getBoundingClientRect().top;
  return {
    x: s - n.left - t.clientLeft + t.scrollLeft,
    y: i - u(this, Ue) - n.top - t.clientTop + t.scrollTop
  };
}, /** Point the renderer at the band the canvas currently shows. The canvas's
 *  offset into the score is read off the spacer, which sits right after it
 *  in flow, so container padding and borders cancel out. This holds for an
 *  outer scroller too: sticky positioning keeps the canvas inside its
 *  container, so with the container's top below the scroller's the canvas
 *  sits in flow (offset 0), with it scrolled past it is pushed down by
 *  exactly that much, and near the container's bottom it stops at the
 *  last band. */
os = function() {
  const t = u(this, Ct).getBoundingClientRect().top, n = u(this, re).getBoundingClientRect().top, s = Math.max(0, u(this, Ue) - (n - t));
  u(this, St).setViewport(wf(s, u(this, Ue), u(this, gt).width, u(this, Se)));
}, Gn = new WeakMap(), Dn = new WeakMap(), fs = new WeakMap(), // --- Outer scroll element ---------------------------------------------------
/** The element whose `scroll` events move the view. */
qs = function() {
  return u(this, Bt) ?? u(this, mt);
}, /** The scroller's visible content band in client pixels: inside its border
 *  and padding, where the sticky canvas sits. */
Sn = function(t) {
  const n = t.getBoundingClientRect(), s = C(this, R, xn).call(this, t), i = n.top + t.clientTop;
  return { top: i + s.top, bottom: i + t.clientHeight - s.bottom };
}, /** The container's padding-box top in the scroller's scroll content. */
Ma = function(t) {
  const n = t.getBoundingClientRect();
  return u(this, mt).getBoundingClientRect().top + u(this, mt).clientTop - n.top - t.clientTop + t.scrollTop;
}, ka = function(t) {
  const n = C(this, R, Sn).call(this, t), s = u(this, mt).getBoundingClientRect();
  return s.bottom > n.top && s.top < n.bottom;
}, /** `load`'s scroll to the top: the whole container by default; with an
 *  outer scroller, only back up to the container's top when it was
 *  scrolled past, so loading one of several stacked views does not jump
 *  the host's page. */
Ea = function() {
  const t = u(this, Bt);
  if (!t) {
    u(this, mt).scrollTop = 0;
    return;
  }
  const n = C(this, R, Sn).call(this, t).top - u(this, mt).getBoundingClientRect().top;
  n > 0 && (t.scrollTop -= n);
}, /** How far down the score the top of the view is, as a fraction of its
 *  height, for `setZoom` to restore. `null` with an outer scroller whose
 *  top is not inside this container: the view is not what is being read. */
Ta = function() {
  const t = u(this, Bt);
  if (!t) {
    const i = u(this, mt);
    return i.scrollHeight > 0 ? i.scrollTop / i.scrollHeight : 0;
  }
  const n = C(this, R, Sn).call(this, t).top, s = u(this, mt).getBoundingClientRect();
  return s.height <= 0 || n <= s.top || n >= s.bottom ? null : (n - s.top) / s.height;
}, Ia = function(t) {
  const n = u(this, Bt);
  if (!n) {
    u(this, mt).scrollTop = t * u(this, mt).scrollHeight;
    return;
  }
  const s = u(this, mt).getBoundingClientRect();
  n.scrollTop += s.top + t * s.height - C(this, R, Sn).call(this, n).top;
}, // --- Playback -----------------------------------------------------------
wn = function() {
  return u(this, Ye) ?? $(this, Ye, $c(u(this, ee))), u(this, Ye);
}, /**
 * The engine for the current score. An engine takes its timeline once, so
 * after an edit it is rebuilt here, carrying the paused position over;
 * while playing, the old one plays on and the edit is heard from the next
 * play. The `AudioContext` is created on first use, inside the `play()`
 * the host called from a user gesture, and reused across rebuilds.
 */
Ba = function() {
  const t = u(this, Ot);
  if (t && (t.isPlaying || u(this, $n) === C(this, R, wn).call(this))) return t;
  const n = (t == null ? void 0 : t.positionSeconds) ?? u(this, Me);
  t == null || t.stop();
  const s = C(this, R, wn).call(this);
  u(this, we) ?? $(this, we, new (u(this, ve)).AudioContext());
  const i = new qc({
    events: s,
    audioContext: u(this, we),
    onOnset: (o) => {
      u(this, De).push(o.noteId);
      for (const a of u(this, ce).onset) a(o);
    },
    onEnd: () => {
      C(this, R, is).call(this);
      for (const o of u(this, ce).end) o();
    }
  });
  return n > 0 && i.seek(n), $(this, Ot, i), $(this, $n, s), $(this, Me, 0), i;
}, Na = function(t) {
  if (!u(this, Dt)) {
    for (const { staffIndex: n, index: s } of u(this, St).setPlaybackCursor(t))
      u(this, St).redrawMeasure(s, n);
    u(this, Ge).followScroll !== !1 && this.scrollToNote(t[0]);
  }
}, is = function() {
  u(this, De).clear();
  for (const { staffIndex: t, index: n } of u(this, St).setPlaybackCursor([]))
    u(this, St).redrawMeasure(n, t);
};
const $f = "0.1.0";
export {
  Sc as ACCENT_VELOCITY,
  _f as ACCIACCATURA,
  Bc as ACCIACCATURA_WHOLES,
  zf as APPOGGIATURA,
  Tc as APPOGGIATURA_FRACTION,
  Va as ARTICULATIONS,
  Ai as BRAVURA_FAMILY,
  mc as CanvasRenderer,
  If as DEFAULT_STAFF_SPACE_PX,
  xc as DETACHED_LEGATO_FRACTION,
  Ic as DOTTED_APPOGGIATURA_FRACTION,
  kc as DYNAMIC_ACCENTS,
  ki as DYNAMIC_KINDS,
  en as DYNAMIC_LEVELS,
  st as ENGRAVING_DEFAULTS,
  Pf as EditHistory,
  Mc as FERMATA_FACTOR,
  X as GLYPH_METRICS,
  Nc as GRACE_RUN_MAX_FRACTION,
  Ac as GRACE_TOTAL_MAX_FRACTION,
  zc as LookaheadScheduler,
  wc as MARCATO_VELOCITY,
  Uf as Measure,
  Ec as NIENTE_LEVEL,
  $f as NOTATION_ENGINE_VERSION,
  Ya as NOTE_VALUES,
  Yf as NOTE_VALUE_WHOLES,
  jf as NO_ARTICULATIONS,
  Vf as NO_CLEF_CHANGES,
  Hf as NO_DYNAMICS,
  Ua as NO_LYRICS,
  Ei as NO_PASSTHROUGH,
  Xf as Note,
  qc as PlaybackEngine,
  uc as SEAM_STRIP_WIDTH_STAFF_SPACES,
  vc as STACCATISSIMO_FRACTION,
  yc as STACCATO_FRACTION,
  Xe as STAFF_SPACES_PER_EM,
  _a as Score,
  Kf as Staff,
  Ha as assertScoresEquivalent,
  oi as bravuraFontUrl,
  qf as buildScore,
  Ga as compareVerses,
  zi as computeBeamGroups,
  $c as computePlaybackTimeline,
  $s as containsPoint,
  Rf as createImportDiagnostics,
  Wf as createOnsetIndex,
  it as diatonicIndex,
  gc as durationToSeconds,
  Qs as eventArpeggiate,
  Js as eventArticulations,
  $a as eventBeam,
  Zs as eventFermata,
  as as eventLyrics,
  Of as exportMusicXml,
  Gc as firstOnsetSeconds,
  La as formatPitch,
  Qf as fromMidi,
  kn as glyphMetrics,
  Cc as graceLengthsWholes,
  hs as graceRuns,
  hc as hitTest,
  Ff as hitTestMeasure,
  Rl as importMusicXml,
  xi as keyAlterForStep,
  Go as layoutScore,
  ii as loadSmuflFont,
  eo as lyricContinuesWord,
  wi as lyricDisplayText,
  Si as lyricStartsExtender,
  vo as makeLyric,
  Mi as measureCapacityWholes,
  rs as measureDurationWholes,
  bc as measurePlayOrder,
  Jf as mergeLyrics,
  As as middleLineForClef,
  Uc as midiToFrequency,
  Lf as mountScore,
  Zf as normalizeArticulations,
  th as normalizeLyrics,
  Lt as noteEvents,
  ja as noteValueForWholes,
  dn as opaqueElementKey,
  eh as parsePitch,
  Yc as pitchToFrequency,
  nh as pitchesEqual,
  Kc as playOnsetEvent,
  sh as positionBefore,
  pc as regionForMeasureBoundary,
  dc as regionForNote,
  xr as relayoutMeasure,
  oh as restValuesFor,
  za as sortDynamics,
  ih as spelledWholes,
  un as stemDirectionForNotes,
  to as textDirections,
  Da as toMidi,
  ah as transpose,
  rh as validateMeasure,
  ch as withoutNoteMarkup,
  lh as withoutTieMarkup
};
