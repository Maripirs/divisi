var pc = Object.defineProperty;
var mi = (e) => {
  throw TypeError(e);
};
var mc = (e, t, n) => t in e ? pc(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : e[t] = n;
var vt = (e, t, n) => mc(e, typeof t != "symbol" ? t + "" : t, n), mo = (e, t, n) => t.has(e) || mi("Cannot " + n);
var p = (e, t, n) => (mo(e, t, "read from private field"), n ? n.call(e) : t.get(e)), U = (e, t, n) => t.has(e) ? mi("Cannot add the same private member more than once") : t instanceof WeakSet ? t.add(e) : t.set(e, n), F = (e, t, n, s) => (mo(e, t, "write to private field"), s ? s.call(e, n) : t.set(e, n), n), A = (e, t, n) => (mo(e, t, "access private method"), n);
var go = (e, t, n, s) => ({
  set _(o) {
    F(e, t, o, n);
  },
  get _() {
    return p(e, t, s);
  }
});
import { o as Dn, c as Vo, f as gc, n as Xt, e as bc, d as ht, g as Xo, h as no, i as Ko, j as qo, m as Jo, k as Er, l as Qo, q as Br, r as yc, s as Tr, t as Vs, u as gi, v as xc, w as vc, N as In, D as Ir, x as Sc, y as bi, S as wc, z as Nr, B as Mc, C as kc, E as Ar, F as Ec, G as yi, H as Bc } from "./score-w4Mss77_.js";
import { A as nd, a as sd, M as od, I as id, J as rd, K as ad, L as cd, O as ld, b as fd, P as hd, Q as ud, R as dd, U as pd, p as md, V as gd, W as bd, X as yd, Y as xd, Z as vd, _ as Sd } from "./score-w4Mss77_.js";
function Tc(e, t) {
  e.keyFifths !== t.keyFifths && le("score.keyFifths", e.keyFifths, t.keyFifths), (e.time.beats !== t.time.beats || e.time.beatType !== t.time.beatType) && le("score.time", Es(e.time), Es(t.time)), e.tempoBpm !== t.tempoBpm && le("score.tempoBpm", e.tempoBpm, t.tempoBpm), mt("score.headerPassthrough", He(e.headerPassthrough), He(t.headerPassthrough)), e.staves.length !== t.staves.length && le("staves.length", e.staves.length, t.staves.length);
  for (let n = 0; n < t.staves.length; n++) {
    const s = e.staves[n], o = t.staves[n];
    e.clefAt(0, n) !== t.clefAt(0, n) && le(`staves[${n}].clef`, e.clefAt(0, n), t.clefAt(0, n)), s.measures.length !== o.measures.length && le(`staves[${n}].measures.length`, s.measures.length, o.measures.length);
    for (let i = 0; i < o.measures.length; i++) {
      const r = `staves[${n}].measures[${i}]`;
      mt(`${r} keyFifthsAt`, e.keyFifthsAt(i, n), t.keyFifthsAt(i, n)), mt(`${r} clefAt`, e.clefAt(i, n), t.clefAt(i, n)), mt(
        `${r} clefChanges`,
        Mi(s.measures[i].clefChanges),
        Mi(o.measures[i].clefChanges)
      ), mt(`${r} timeAt`, Es(e.timeAt(i, n)), Es(t.timeAt(i, n))), mt(`${r} endBarlineAt`, e.endBarlineAt(i, n), t.endBarlineAt(i, n)), mt(
        `${r} startBarline`,
        s.measures[i].startBarline ?? "none",
        o.measures[i].startBarline ?? "none"
      ), mt(
        `${r} repeatTimes`,
        s.measures[i].repeatTimes ?? "none",
        o.measures[i].repeatTimes ?? "none"
      ), mt(`${r} endings`, xi(s.measures[i]), xi(o.measures[i])), mt(
        `${r} number`,
        s.measures[i].number ?? String(i + 1),
        o.measures[i].number ?? String(i + 1)
      ), Ac(r, s.measures[i], o.measures[i]), mt(
        `${r} dynamics`,
        vi(s.measures[i].dynamics),
        vi(o.measures[i].dynamics)
      ), Ic(r, e, t, s.measures[i].notes, o.measures[i].notes);
    }
  }
  Cc(e, t), mt("wedges", wi(e.wedges), wi(t.wedges)), Pc(e, t);
}
function Cr(e) {
  return String(Math.round(e * 1e9) / 1e9);
}
function xi(e) {
  const t = (o) => Object.keys(o).sort().map((i) => `${i}=${o[i]}`).join(" "), n = e.endingStart, s = e.endingEnd;
  return (n ? `start ${n.numbers.join(",")} ${JSON.stringify(n.text)} [${t(n.attrs)}]` : "no start") + (s ? ` / ${s.kind} [${t(s.attrs)}]` : " / no end");
}
function Pr(e) {
  if (e === null) return "-";
  const t = Object.keys(e.markAttrs).sort().map((n) => `${n}=${JSON.stringify(e.markAttrs[n])}`).join(",");
  return `#${e.slot}[${t}]${Dn(e.element, e.divisions)}`;
}
function vi(e) {
  return e.map((t) => `${t.kind}@${Cr(t.onset)} ${t.placement ?? "-"} ${Pr(t.source)}`).sort().join(`
`);
}
function Si(e) {
  return `m${e.measureIndex}@${Cr(e.onset)} ${Pr(e.source)}`;
}
function wi(e) {
  return e.map((t) => `${t.kind} s${t.staffIndex} ${t.placement ?? "-"} ${Si(t.start)} -> ${Si(t.stop)}`).sort().join(`
`);
}
function Mi(e) {
  return e.map((t) => `${Math.round(t.onset * 1e9) / 1e9}:${t.clef}`).join(",");
}
function Ic(e, t, n, s, o) {
  const i = Bi(s), r = Bi(o), a = [...i.keys()].sort((f, c) => f - c), l = [...r.keys()].sort((f, c) => f - c);
  a.join(",") !== l.join(",") && le(`${e} voices present`, a.join(","), l.join(","));
  for (const f of l) {
    const c = i.get(f), u = r.get(f);
    c.length !== u.length && le(`${e} voice ${f} note count`, c.length, u.length);
    for (let h = 0; h < u.length; h++)
      Nc(
        `${e} voice ${f} note ${h}`,
        t,
        n,
        c[h],
        u[h]
      );
  }
}
function ki(e) {
  const t = e.grace;
  if (t === null) return "none";
  const n = (s) => s === null ? "-" : String(Math.round(s * 1e9) / 1e9);
  return `${t.slash ? "slash" : "plain"} ${n(t.stealTimePrevious)} ${n(t.stealTimeFollowing)} ${n(t.makeTime)}`;
}
function Ei(e) {
  return e.map(
    (t) => `${t.verse}:${t.syllabic}:${JSON.stringify(t.text)}` + t.elisions.map((n) => `_${n.syllabic}:${JSON.stringify(n.text)}`).join("") + `:${t.extend ?? "-"}:${t.source ? Dn(t.source) : "-"}`
  ).join(" | ");
}
function Nc(e, t, n, s, o) {
  mt(`${e} isRest`, s.isRest, o.isRest), mt(`${e} pitch`, ks(s.pitch), ks(o.pitch)), mt(`${e} value`, s.value, o.value), mt(`${e} dots`, s.dots, o.dots), mt(`${e} tuplet`, Fi(s), Fi(o)), mt(`${e} measureRestWholes`, s.measureRestWholes, o.measureRestWholes), mt(`${e} chordWithPrevious`, s.chordWithPrevious, o.chordWithPrevious), mt(`${e} articulations`, s.articulations.join(","), o.articulations.join(",")), mt(`${e} fermata`, s.fermata, o.fermata), mt(`${e} arpeggiate`, s.arpeggiate, o.arpeggiate), mt(`${e} grace`, ki(s), ki(o)), mt(`${e} lyrics`, Ei(s.lyrics), Ei(o.lyrics)), mt(`${e} passthrough`, Ii(s.passthrough), Ii(o.passthrough)), mt(`${e} hidden`, s.hidden, o.hidden);
  const i = s.tiedToId === null ? null : t.findNote(s.tiedToId) ?? null, r = o.tiedToId === null ? null : n.findNote(o.tiedToId) ?? null;
  mt(
    `${e} tie target pitch`,
    i ? ks(i.pitch) : "no-tie",
    r ? ks(r.pitch) : "no-tie"
  );
}
function Bi(e) {
  const t = /* @__PURE__ */ new Map();
  for (const n of e) {
    const s = t.get(n.voice);
    s ? s.push(n) : t.set(n.voice, [n]);
  }
  return t;
}
function Ac(e, t, n) {
  mt(`${e} passthrough`, Ti(t.passthrough), Ti(n.passthrough)), mt(
    `${e} attributesPassthrough`,
    He(t.attributesPassthrough),
    He(n.attributesPassthrough)
  ), mt(
    `${e} barlinePassthrough`,
    He(t.barlinePassthrough),
    He(n.barlinePassthrough)
  );
}
function Ti(e) {
  return e.map(
    (t) => `${t.lead ? "lead" : `v${t.voice}@${t.onset.num}/${t.onset.den}`} ${Dn(t.element, t.divisions)}`
  ).sort().join(`
`);
}
function Ii(e) {
  const t = [];
  for (const n of e) {
    if (n.name !== "notations") {
      t.push(n);
      continue;
    }
    const s = n.children.filter((o) => o.name !== "tuplet");
    s.length > 0 && t.push({ ...n, children: s });
  }
  return He(t);
}
function He(e) {
  return (e ?? []).map((t) => Dn(t)).sort().join(`
`);
}
function Or(e) {
  return e.passthrough && e.passthrough.length > 0 ? ` +${He(e.passthrough)}` : "";
}
function Cc(e, t) {
  e.slurs.length !== t.slurs.length && le("slurs.length", e.slurs.length, t.slurs.length);
  const n = new Set(e.slurs.map((s) => Ni(e, s.startNoteId, s.endNoteId)));
  for (const s of t.slurs) {
    const o = Ni(t, s.startNoteId, s.endNoteId);
    if (!n.has(o))
      throw new Error(`scores differ: expected a slur at ${o}, actual slurs are {${[...n].join("; ")}}`);
  }
}
function Ni(e, t, n) {
  return `${Ai(e, t)} -> ${Ai(e, n)}`;
}
function Ai(e, t) {
  for (let n = 0; n < e.staves.length; n++) {
    const s = e.staves[n].measures;
    for (let o = 0; o < s.length; o++) {
      const i = s[o].notes.findIndex((r) => r.id === t);
      if (i !== -1) return `${n}:${o}:${i}`;
    }
  }
  return "?:?:?";
}
function Pc(e, t) {
  Oi("named parts", Ci(e), Ci(t)), Oi("part-groups", Pi(e), Pi(t));
}
function Ci(e) {
  const t = /* @__PURE__ */ new Set();
  for (const n of e.parts) {
    if (n.name === void 0 || n.name === "" || /^Part \d+$/.test(n.name)) continue;
    const s = n.nameHidden ? " (hidden)" : "";
    t.add(`${Fr(n.staffIndices)}::${n.name}${s}${Or(n)}`);
  }
  return t;
}
function Pi(e) {
  const t = /* @__PURE__ */ new Set();
  for (const n of e.parts) {
    if (n.staffIndices.length < 2 || n.name !== void 0 && n.name !== "") continue;
    const s = Vo(n);
    t.add(`${Fr(n.staffIndices)}::${s}${Or(n)}`);
  }
  return t;
}
function Fr(e) {
  return `[${[...e].sort((t, n) => t - n).join(",")}]`;
}
function mt(e, t, n) {
  t !== n && le(e, t, n);
}
function Oi(e, t, n) {
  const s = [...t].sort(), o = [...n].sort();
  s.join(" | ") !== o.join(" | ") && le(e, `{${s.join("; ")}}`, `{${o.join("; ")}}`);
}
function le(e, t, n) {
  throw new Error(`scores differ at ${e}: actual ${JSON.stringify(t)}, expected ${JSON.stringify(n)}`);
}
function ks(e) {
  return e === null ? "rest" : gc(e);
}
function Fi(e) {
  return e.tuplet === null ? "none" : `${e.tuplet.actualNotes}:${e.tuplet.normalNotes}`;
}
function Es(e) {
  return `${e.beats}/${e.beatType}`;
}
function Oc(e) {
  const t = e.headerPassthrough, n = Bs(Nn(Nn(t, "work"), "work-title")), s = Bs(Nn(t, "movement-title")), o = As(Nn(t, "identification"), "creator"), i = (...h) => Bs(o.find((d) => h.includes(d.attrs.type ?? "") && Bs(d))), r = /* @__PURE__ */ new Map();
  for (const h of t) {
    if (h.name !== "credit") continue;
    const d = Wr(As(h.children, "credit-words").map((g) => g.text).join(" "));
    if (d)
      for (const g of As(h.children, "credit-type")) {
        const m = g.text.trim();
        r.has(m) || r.set(m, d);
      }
  }
  const a = {}, l = n ?? s ?? r.get("title"), f = n && s ? s : r.get("subtitle"), c = i("composer") ?? r.get("composer"), u = i("lyricist", "poet") ?? r.get("lyricist");
  return l && (a.title = l), f && f !== l && (a.subtitle = f), c && (a.composer = c), u && (a.lyricist = u), a;
}
function ju(e, t) {
  let n = [...e.headerPassthrough];
  const s = (i, r) => {
    const a = n.findIndex((c) => c.name === i);
    if (a >= 0) {
      r ? n[a] = r : n.splice(a, 1);
      return;
    }
    if (!r) return;
    const l = Wi.indexOf(i), f = n.findIndex((c) => Wi.indexOf(c.name) > l);
    n.splice(f < 0 ? n.length : f, 0, r);
  }, o = (i) => {
    n = n.filter((r) => r.name !== "credit" || !As(r.children, "credit-type").some((a) => a.text.trim() === i));
  };
  if (t.title !== void 0) {
    const i = Nn(n, "work"), r = i ? i.children.filter((c) => c.name !== "work-title") : [], a = r.findIndex((c) => c.name === "opus"), l = a < 0 ? r.length : a, f = t.title ? [...r.slice(0, l), Hn("work-title", t.title), ...r.slice(l)] : r;
    s("work", f.length > 0 ? Hn("work", "", f, i == null ? void 0 : i.attrs) : null), o("title");
  }
  t.subtitle !== void 0 && (s("movement-title", t.subtitle ? Hn("movement-title", t.subtitle) : null), o("subtitle"));
  for (const [i, r] of [
    ["composer", ["composer"]],
    ["lyricist", ["lyricist", "poet"]]
  ]) {
    const a = t[i];
    if (a === void 0) continue;
    const l = Nn(n, "identification"), f = l ? l.children.filter((h) => h.name !== "creator" || !r.includes(h.attrs.type)) : [], c = f.filter((h) => h.name === "creator").length, u = a ? [...f.slice(0, c), Hn("creator", a, [], { type: i }), ...f.slice(c)] : f;
    s("identification", u.length > 0 ? Hn("identification", "", u, l == null ? void 0 : l.attrs) : null), o(i);
  }
  e.headerPassthrough = Object.freeze(n);
}
const Wi = ["work", "movement-number", "movement-title", "identification", "defaults", "credit"];
function Hn(e, t, n = [], s = {}) {
  return Object.freeze({ name: e, attrs: s, children: Object.freeze([...n]), text: t });
}
function Nn(e, t) {
  return (e === void 0 ? [] : "name" in e ? e.children : e).find((s) => s.name === t);
}
function As(e, t) {
  return (e === void 0 ? [] : "name" in e ? e.children : e).filter((s) => s.name === t);
}
function Bs(e) {
  return e ? Wr(e.text) : void 0;
}
function Wr(e) {
  const t = e.replace(/\s+/g, " ").trim();
  return t === "" ? void 0 : t;
}
const Fc = 100;
var is, Rt, Se, nn, Fn;
class Hu {
  constructor(t, n = {}) {
    U(this, is);
    /** The live current score. Owned here; mutated only via `record`. */
    U(this, Rt);
    /** Snapshots of states *before* each kept edit, oldest first. */
    U(this, Se, []);
    /** Snapshots of states undone away from, most-recently-undone last. */
    U(this, nn, []);
    /** The state `markSaved()` last blessed as "on disk". Compared to
     *  `#current` by musical content to answer `dirty`. */
    U(this, Fn);
    F(this, is, Math.max(1, Math.floor(n.cap ?? Fc))), F(this, Rt, t.clone()), F(this, Fn, p(this, Rt).clone());
  }
  /** The live current score. Edit it only through `record`. */
  get current() {
    return p(this, Rt);
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
    const n = p(this, Rt).clone(), s = t(p(this, Rt));
    return s != null && s !== !1 && (p(this, Se).push(n), p(this, Se).length > p(this, is) && p(this, Se).shift(), p(this, nn).length = 0), s;
  }
  /** Restore the previous snapshot; returns the new `current`, or `null` if
   *  there is nothing to undo. */
  undo() {
    const t = p(this, Se).pop();
    return t === void 0 ? null : (p(this, nn).push(p(this, Rt)), F(this, Rt, t), p(this, Rt));
  }
  /** Re-apply the last undone snapshot; returns the new `current`, or `null`
   *  if there is nothing to redo. */
  redo() {
    const t = p(this, nn).pop();
    return t === void 0 ? null : (p(this, Se).push(p(this, Rt)), F(this, Rt, t), p(this, Rt));
  }
  get canUndo() {
    return p(this, Se).length > 0;
  }
  get canRedo() {
    return p(this, nn).length > 0;
  }
  /** Mark the current state as the saved baseline, so `dirty` reads false
   *  until the score next diverges from it. */
  markSaved() {
    F(this, Fn, p(this, Rt).clone());
  }
  /** Whether `current` differs, in musical content, from the last
   *  `markSaved()` baseline (the initial state if `markSaved` was never
   *  called). Compared with `assertScoresEquivalent`, not object identity. */
  get dirty() {
    try {
      return Tc(p(this, Rt), p(this, Fn)), !1;
    } catch {
      return !0;
    }
  }
}
is = new WeakMap(), Rt = new WeakMap(), Se = new WeakMap(), nn = new WeakMap(), Fn = new WeakMap();
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
  systemDivider: {
    name: "systemDivider",
    codepoint: 57351,
    description: "System divider",
    advance: 4.232,
    bBoxSW: [0, -0.272],
    bBoxNE: [4.232, 4.24],
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
  },
  breathMarkComma: {
    name: "breathMarkComma",
    codepoint: 58574,
    description: "Breath mark (comma)",
    advance: 0.612,
    bBoxSW: [4e-3, 8e-3],
    bBoxNE: [0.608, 1.004],
    anchors: {}
  },
  breathMarkTick: {
    name: "breathMarkTick",
    codepoint: 58575,
    description: "Breath mark (tick-like)",
    advance: 2,
    bBoxSW: [0, 0],
    bBoxNE: [2, 2.008],
    anchors: {}
  },
  breathMarkSalzedo: {
    name: "breathMarkSalzedo",
    codepoint: 58581,
    description: "Breath mark (Salzedo)",
    advance: 2.1,
    bBoxSW: [0, 8e-3],
    bBoxNE: [2.112, 1.732],
    anchors: {}
  },
  caesura: {
    name: "caesura",
    codepoint: 58577,
    description: "Caesura",
    advance: 1.54,
    bBoxSW: [0, -4e-3],
    bBoxNE: [1.536, 2.128],
    anchors: {}
  },
  caesuraShort: {
    name: "caesuraShort",
    codepoint: 58579,
    description: "Short caesura",
    advance: 0.74,
    bBoxSW: [0, 0],
    bBoxNE: [0.744, 2.132],
    anchors: {}
  },
  tuplet0: {
    name: "tuplet0",
    codepoint: 59520,
    description: "Tuplet 0",
    advance: 1.276,
    bBoxSW: [0, -0.032],
    bBoxNE: [1.272, 1.5],
    anchors: {}
  },
  tuplet1: {
    name: "tuplet1",
    codepoint: 59521,
    description: "Tuplet 1",
    advance: 0.984,
    bBoxSW: [0.04, 0],
    bBoxNE: [1.024, 1.488],
    anchors: {}
  },
  tuplet2: {
    name: "tuplet2",
    codepoint: 59522,
    description: "Tuplet 2",
    advance: 1.276,
    bBoxSW: [0.04, -0.024],
    bBoxNE: [1.316, 1.5],
    anchors: {}
  },
  tuplet3: {
    name: "tuplet3",
    codepoint: 59523,
    description: "Tuplet 3",
    advance: 1.184,
    bBoxSW: [0.04, -0.032],
    bBoxNE: [1.224, 1.5],
    anchors: {}
  },
  tuplet4: {
    name: "tuplet4",
    codepoint: 59524,
    description: "Tuplet 4",
    advance: 1.212,
    bBoxSW: [0.04, 0],
    bBoxNE: [1.252, 1.488],
    anchors: {}
  },
  tuplet5: {
    name: "tuplet5",
    codepoint: 59525,
    description: "Tuplet 5",
    advance: 1.268,
    bBoxSW: [0.04, -0.032],
    bBoxNE: [1.308, 1.492],
    anchors: {}
  },
  tuplet6: {
    name: "tuplet6",
    codepoint: 59526,
    description: "Tuplet 6",
    advance: 1.216,
    bBoxSW: [0.04, -0.032],
    bBoxNE: [1.256, 1.5],
    anchors: {}
  },
  tuplet7: {
    name: "tuplet7",
    codepoint: 59527,
    description: "Tuplet 7",
    advance: 1.212,
    bBoxSW: [0.12, -0.016],
    bBoxNE: [1.332, 1.488],
    anchors: {}
  },
  tuplet8: {
    name: "tuplet8",
    codepoint: 59528,
    description: "Tuplet 8",
    advance: 1.252,
    bBoxSW: [0.04, -0.032],
    bBoxNE: [1.292, 1.5],
    anchors: {}
  },
  tuplet9: {
    name: "tuplet9",
    codepoint: 59529,
    description: "Tuplet 9",
    advance: 1.216,
    bBoxSW: [0.04, -0.032],
    bBoxNE: [1.256, 1.5],
    anchors: {}
  },
  tupletColon: {
    name: "tupletColon",
    codepoint: 59530,
    description: "Tuplet colon",
    advance: 0.444,
    bBoxSW: [0.04, 0.232],
    bBoxNE: [0.484, 1.072],
    anchors: {}
  }
};
function ts(e) {
  return X[e];
}
const at = {
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
  hairpinThickness: 0.16,
  tupletBracketThickness: 0.16
}, vn = 4, Rr = "Bravura", Bo = {
  staffSpacePx: 9,
  paddingPx: 16
}, rt = {
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
   * staff spaces: the floor of the system-to-system distance. The next
   * system's own ink above its top staff (a high ledger line, a stem, a
   * tempo mark, a volta) is measured too (M9 Slice 7): the system moves
   * further down whenever that ink would come within `systemClearance` of
   * the system above, so this stays a floor, not a guess at the tallest
   * thing that might land there.
   */
  systemGap: 6,
  /** Blank kept between one system's lowest ink and the next system's
   *  highest ink (M9 Slice 7; it was the volta bracket's own clearance). */
  systemClearance: 2,
  /**
   * How much more blank two systems of a multi-staff score keep, staff
   * line to staff line, than the widest gap between two staves of either
   * system, staff spaces (M10 Slice 9): a system break has to read as one,
   * not as the next part's staff. A single-staff score has no such gap and
   * is unaffected.
   */
  systemGapOverStaffGap: 4,
  /**
   * The floor of the gap between two staves of one system, staff spaces,
   * from the upper staff's bottom line to the lower staff's top line (M9
   * Slice 7; a fixed 6 before). Each gap is sized from the ink actually
   * facing across it (`staffDistancePx`): the upper row's lowest ink
   * (ledger lines, stems, beams, slurs, marks, its dynamics, hairpins,
   * texts and lyrics) and the lower row's highest, kept `staffClearance`
   * apart, so a pair with deep ledger lines or a dynamic between them opens
   * up and an empty pair tightens to this floor. 4 is about OSMD's spacing
   * (8 spaces top line to top line, here 8 too) and still leaves room for
   * the common case of a stem reaching 1.5 spaces past each staff.
   */
  staffGap: 4,
  /** Blank between the upper staff's lowest ink and the lower staff's
   *  highest ink in one system, staff spaces (M9 Slice 7). Half of it on
   *  each side of the barline split (`staffSplitY`) is what keeps two
   *  staves' regions from overlapping, so it must stay at least
   *  `2 * REGION_BLEED_PX`. */
  staffClearance: 1
}, Le = {
  titleFontSpaces: 3.2,
  subtitleFontSpaces: 2,
  creditFontSpaces: 1.6,
  lineGap: 0.8,
  systemGap: 3,
  /** Least blank between the lyricist and the composer on their line. */
  creditGap: 2,
  /** A text line's ink above and below its baseline, as a fraction of its
   *  font size (the label font has no metrics in layout). */
  ascent: 0.8,
  descent: 0.25
}, Lr = {
  minStaves: 3,
  clearance: 1
}, Ri = {
  fontSpaces: 1.4,
  gapSpaces: 0.4
}, Pn = {
  /** Gap after a brace/bracket column: between two nested columns, and
   *  between the innermost one and the system barline (M10 Slice 9). */
  columnGap: 0.6,
  /** Gap between the label column's own reserved width and whatever
   *  follows it: the outermost brace/bracket, else the clef. */
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
function Wc(e, t) {
  const s = Math.max(e, 1e-9) / Math.max(t, 1e-9);
  return rt.noteSpaceBase + rt.noteSpacePerDoubling * Math.log2(Math.max(s, 1));
}
function so(e) {
  const t = /* @__PURE__ */ new Map();
  for (const n of _r(e).values()) {
    let s = 0;
    for (const o of n) {
      for (const i of o) t.set(i.id, s);
      s += o[0].durationWholes;
    }
  }
  return t;
}
function Rc(e) {
  if (e.length < 2) return !1;
  const t = e.flatMap((n) => n.pitch ? [ht(n.pitch)] : []).sort((n, s) => n - s);
  for (let n = 1; n < t.length; n++) if (t[n] - t[n - 1] === 1) return !0;
  return !1;
}
function St(e) {
  return Math.round(e * 1e9) / 1e9;
}
let ie = null;
function $r(e) {
  if (ie) return e();
  ie = { grids: /* @__PURE__ */ new Map(), lyrics: /* @__PURE__ */ new Map(), hiddenLines: /* @__PURE__ */ new Map() };
  try {
    return e();
  } finally {
    ie = null;
  }
}
function oo(e, t, n, s) {
  var l;
  const o = ie && ((l = e.staves[n]) == null ? void 0 : l.measures[t.index]) === t ? ie.grids : null;
  let i = o == null ? void 0 : o.get(t.index);
  if (i || (i = Lc(e, t, n), o == null || o.set(t.index, i)), !s || s.extras.size === 0) return i;
  const r = i.columns;
  return { columns: r.map((f, c) => {
    const u = St(f.onset), h = c + 1 < r.length ? St(r[c + 1].onset) : Number.POSITIVE_INFINITY;
    let d = f.width;
    for (const [g, m] of s.extras) g >= u && g < h && (d += m);
    return d === f.width ? f : { ...f, width: d };
  }), lead: i.lead };
}
function Lc(e, t, n) {
  const s = /* @__PURE__ */ new Map();
  e.staves.forEach((c, u) => {
    var b;
    const h = u === n ? t.notes : (b = c.measures[t.index]) == null ? void 0 : b.notes;
    if (!h) return;
    const d = so(h), g = e.keyFifthsAt(t.index, u), m = /* @__PURE__ */ new Map();
    for (const y of Xt(h)) {
      const x = y[0], S = d.get(x.id), w = St(S), E = Rc(y) ? X[xn[x.value]].advance : 0, B = X[x.pitch === null ? io[x.value] : xn[x.value]].advance + E;
      let D = m.get(x.voice);
      D || m.set(x.voice, D = /* @__PURE__ */ new Map());
      const M = y.flatMap((O) => O.pitch ? [{ note: O, pitch: O.pitch, d: ht(O.pitch) }] : []), I = oa(M, g, D).widthSpaces + (Xo(y) ? Ce.room : 0), C = s.get(w);
      C ? (C.shortest = Math.min(C.shortest, x.durationWholes), C.extra = Math.max(C.extra, E), C.ink = Math.max(C.ink, B), C.overhang = Math.max(C.overhang, I)) : s.set(w, { onset: S, shortest: x.durationWholes, extra: E, ink: B, overhang: I });
    }
  });
  const o = [...s.values()].sort((c, u) => c.onset - u.onset), i = o.map((c, u) => {
    const h = o[u + 1];
    return h ? Math.min(c.shortest, h.onset - c.onset) : c.shortest;
  }), r = Math.min(rt.spacingReferenceMaxWholes, ...i), a = o.map((c, u) => {
    const h = Wc(i[u], r) + c.extra, d = o[u + 1], g = d && d.overhang > 0 ? c.ink + rt.minAccidentalClearance + d.overhang : 0;
    return { onset: c.onset, width: Math.max(h, g), stretch: h };
  }), l = o[0], f = l ? Math.max(0, l.overhang + rt.accidentalLeadClearance - rt.measureLeadIn) : 0;
  return { columns: a, lead: f };
}
function $c(e) {
  const t = /* @__PURE__ */ new Map();
  for (const n of e) {
    const s = t.get(n.voice);
    s ? s.push(n) : t.set(n.voice, [n]);
  }
  return t;
}
function _r(e) {
  const t = /* @__PURE__ */ new Map();
  for (const n of Xt(e)) {
    const s = n[0].voice, o = t.get(s);
    o ? o.push(n) : t.set(s, [n]);
  }
  return t;
}
const Pe = 3.5, _c = 0.65, bo = 0.25, Li = 0.4, $i = 1.3, Ve = {
  treble: {
    bottomLine: ht({ step: "E", octave: 4 }),
    middleLine: ht({ step: "B", octave: 4 }),
    topLine: ht({ step: "F", octave: 5 })
  },
  treble8: {
    bottomLine: ht({ step: "E", octave: 4 }),
    middleLine: ht({ step: "B", octave: 4 }),
    topLine: ht({ step: "F", octave: 5 })
  },
  bass: {
    bottomLine: ht({ step: "G", octave: 2 }),
    middleLine: ht({ step: "D", octave: 3 }),
    topLine: ht({ step: "A", octave: 3 })
  },
  // The C clefs (M6 Slice 4) name middle C by the line the glyph centres
  // on: the middle (third) line for alto, the fourth line for tenor. So a
  // tenor staff reads a third lower than an alto one: its lines are D3 F3
  // A3 C4 E4 against alto's F3 A3 C4 E4 G4.
  alto: {
    bottomLine: ht({ step: "F", octave: 3 }),
    middleLine: ht({ step: "C", octave: 4 }),
    topLine: ht({ step: "G", octave: 4 })
  },
  tenor: {
    bottomLine: ht({ step: "D", octave: 3 }),
    middleLine: ht({ step: "A", octave: 3 }),
    topLine: ht({ step: "E", octave: 4 })
  }
};
function To(e) {
  return Ve[e].middleLine;
}
const Io = {
  sharp: ["F", "C", "G", "D", "A", "E", "B"],
  flat: ["B", "E", "A", "D", "G", "C", "F"]
}, Dr = {
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
}, xn = {
  breve: "noteheadDoubleWhole",
  whole: "noteheadWhole",
  half: "noteheadHalf",
  quarter: "noteheadBlack",
  eighth: "noteheadBlack",
  "16th": "noteheadBlack",
  "32nd": "noteheadBlack",
  "64th": "noteheadBlack"
}, io = {
  breve: "restDoubleWhole",
  whole: "restWhole",
  half: "restHalf",
  quarter: "restQuarter",
  eighth: "rest8th",
  "16th": "rest16th",
  "32nd": "rest32nd",
  "64th": "rest64th"
};
function Xs(e) {
  return e !== "whole" && e !== "breve";
}
const es = {
  eighth: { up: "flag8thUp", down: "flag8thDown" },
  "16th": { up: "flag16thUp", down: "flag16thDown" },
  "32nd": { up: "flag32ndUp", down: "flag32ndDown" },
  "64th": { up: "flag64thUp", down: "flag64thDown" }
}, Ks = {
  eighth: 1,
  "16th": 2,
  "32nd": 3,
  "64th": 4
}, Gr = {
  "-1": "accidentalFlat",
  0: "accidentalNatural",
  1: "accidentalSharp"
}, Dc = [
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
], me = 1;
function Zo(e, t, n, s) {
  return {
    top: n === null ? e : Math.min(e, n + me),
    bottom: s === null ? e + 4 * t : Math.max(e + 4 * t, s - me)
  };
}
function zr(e, t, n) {
  let s = t, o = t + 4 * n;
  for (const i of e) {
    const r = i.gapExtent ?? i.inkExtent ?? { top: i.region.y, bottom: i.region.y + i.region.height };
    s = Math.min(s, r.top), o = Math.max(o, r.bottom);
  }
  return { top: s, bottom: o };
}
function Yr(e, t, n, s) {
  const o = n ? bt.nextStaffClearance : rt.staffClearance;
  return 4 * s + Math.max(rt.staffGap * s, e + t + o * s);
}
function No(e, t, n, s, o) {
  const i = rt.staffClearance * o / 2, r = (e + 4 * o + n) / 2;
  return Math.min(Math.max(r, t + i), s - i);
}
function Ur(e, t, n, s, o) {
  return Math.max(s, e + Math.max(rt.systemGap * n, t + o));
}
function _i(e, t) {
  let n = 0;
  for (let s = 1; s < e.length; s++) n = Math.max(n, e[s] - e[s - 1] - 4 * t);
  return n;
}
function jr(e, t, n) {
  if (e.length < 2) return -1 / 0;
  const s = Math.max(_i(e, n), _i(t, n));
  return e[e.length - 1] + 4 * n + s + rt.systemGapOverStaffGap * n;
}
const Hr = (e, t) => t.systemSeparators === !0 && e.staves.length >= Lr.minStaves;
function Vr(e, t) {
  if (!e) return rt.systemClearance * t;
  const { bBoxSW: n, bBoxNE: s } = X.systemDivider;
  return Math.max(rt.systemClearance, s[1] - n[1] + 2 * Lr.clearance) * t;
}
function Xr(e, t, n, s) {
  const { bBoxSW: o, bBoxNE: i } = X.systemDivider, r = (t + n) / 2;
  return { kind: "glyph", glyph: "systemDivider", x: e, y: r + (i[1] + o[1]) / 2 * s };
}
function Kr(e, t, n, s) {
  return { above: e > 0 && !n, below: e < t - 1 && !s };
}
function Gc(e) {
  for (let t = 1; t < e.length; t++)
    if (e[t] !== e[t - 1] + 1) return !1;
  return !0;
}
function zc(e) {
  const t = /* @__PURE__ */ new Map();
  for (const r of e.parts) {
    if (r.staffIndices.length < 2) continue;
    const a = Vo(r), l = [...r.staffIndices].sort((h, d) => h - d);
    if (a === "none" || !Gc(l)) continue;
    const f = l.join(","), c = r.groupSymbol !== void 0, u = t.get(f);
    u && (u.stated || !c) || t.set(f, { staffIndices: l, glyph: a, stated: c });
  }
  const n = [...t.values()].sort((r, a) => r.staffIndices.length - a.staffIndices.length), s = [], o = (r) => r.staffIndices[0], i = (r) => r.staffIndices[r.staffIndices.length - 1];
  for (const r of n) {
    let a = 0;
    for (const l of s)
      o(l) >= o(r) && i(l) <= i(r) && (a = Math.max(a, l.column + 1));
    for (; s.some((l) => l.column === a && o(l) <= i(r) && i(l) >= o(r)); ) a++;
    s.push({ staffIndices: r.staffIndices, glyph: r.glyph, column: a });
  }
  return s;
}
function qr(e, t) {
  var s;
  if (t === "name") return e.nameHidden ? void 0 : e.name || void 0;
  const n = (s = e.passthrough) == null ? void 0 : s.find((o) => o.name === "part-abbreviation");
  if (!(!n || n.attrs["print-object"] === "no"))
    return n.text.trim() || void 0;
}
function Yc(e, t, n) {
  for (const s of e.parts) {
    if (s.staffIndices.length !== 1 || !s.staffIndices.includes(t)) continue;
    const o = qr(s, n);
    if (o) return o;
  }
}
function Jr(e, t) {
  const n = [];
  for (let s = 0; s < e.staves.length; s++) {
    const o = Yc(e, s, t);
    o && n.push({ name: o, staffIndices: [s] });
  }
  for (const s of e.parts) {
    if (s.staffIndices.length < 2) continue;
    const o = qr(s, t);
    o && n.push({ name: o, staffIndices: s.staffIndices });
  }
  return n;
}
function Qr(e, t) {
  return e.length * t * Pn.labelAvgCharWidthRatio;
}
const Uc = 14;
function Zr(e, t) {
  if (e.glyph === "bracket")
    return X.bracketTop.bBoxNE[0] * t;
  const n = X.brace.bBoxNE[1] - X.brace.bBoxSW[1];
  return X.brace.advance * t * Uc / n;
}
function jc(e, t, n, s, o, i) {
  const r = X.brace, a = r.bBoxNE[1] - r.bBoxSW[1], l = (s - n) / (a * o), f = o * vn * l, c = s + r.bBoxSW[1] * o * l, u = r.advance * o * l;
  return e.push({ kind: "glyph", glyph: "brace", x: t + i - u, y: c, fontSizePx: f }), t + i;
}
function Hc(e, t, n, s, o) {
  const i = n, r = s, a = at.bracketThickness * o;
  return e.push({ kind: "glyph", glyph: "bracketTop", x: t, y: i }), e.push({ kind: "rect", x: t, y: i, width: a, height: Math.max(0, r - i) }), e.push({ kind: "glyph", glyph: "bracketBottom", x: t, y: r }), t + X.bracketTop.bBoxNE[0] * o;
}
const Di = (e) => e === 0 ? "name" : "abbreviation";
function Vc(e, t) {
  const n = zc(e), s = [];
  for (const a of n)
    s[a.column] = Math.max(s[a.column] ?? 0, Zr(a, t));
  let o = 0;
  for (const a of s) o += a + Pn.columnGap * t;
  const i = Pn.labelFontSizeSpaces * t, r = (a) => {
    let l = 0;
    for (const f of Jr(e, a))
      l = Math.max(l, Qr(f.name, i));
    return l > 0 ? l + Pn.labelGap * t : 0;
  };
  return {
    groups: n,
    columnWidths: s,
    bracketAreaWidth: o,
    labelColumnWidth: { name: r("name"), abbreviation: r("abbreviation") },
    labelFontSizePx: i
  };
}
function Xc(e, t, n, s, o, i) {
  const r = [], a = o + n.labelColumnWidth[i] + n.bracketAreaWidth, l = (c) => {
    let u = a;
    for (let h = 0; h <= c; h++) u -= n.columnWidths[h] + Pn.columnGap * t;
    return u;
  };
  for (const c of n.groups) {
    const u = s[c.staffIndices[0]], h = s[c.staffIndices[c.staffIndices.length - 1]] + 4 * t, d = l(c.column), g = n.columnWidths[c.column];
    c.glyph === "brace" ? jc(r, d, u, h, t, g) : Hc(r, d + g - Zr(c, t), u, h, t);
  }
  if (s.length > 1) {
    const c = at.thinBarlineThickness * t, u = s[0];
    r.push({ kind: "rect", x: a - c, y: u, width: c, height: s[s.length - 1] + 4 * t - u });
  }
  const f = o + n.labelColumnWidth[i] - Pn.labelGap * t;
  for (const c of Jr(e, i)) {
    const u = Qr(c.name, n.labelFontSizePx), h = s[Math.min(...c.staffIndices)], d = s[Math.max(...c.staffIndices)] + 4 * t, g = c.staffIndices.length === 1 ? h : (h + d) / 2 - 2 * t;
    r.push({
      kind: "text",
      text: c.name,
      x: f - u,
      // Roughly vertically centred on the row: a baseline a little below
      // its own middle line, nudged down further by a fraction of the
      // font size to visually balance the ascenders and descenders a
      // real instrument name mixes (capital initial letter, no
      // descenders, in most names this slice's own demo uses).
      y: g + 2 * t + n.labelFontSizePx * 0.35,
      fontSizePx: n.labelFontSizePx
    });
  }
  return r;
}
function Gi(e, t = {}) {
  return $r(() => Kc(e, t));
}
function Kc(e, t) {
  const n = t.staffSpacePx ?? Bo.staffSpacePx, s = t.paddingPx ?? Bo.paddingPx, o = n * vn, i = e.staves.length;
  if (i === 0)
    return {
      width: 0,
      height: 0,
      staffSpacePx: n,
      staffTopY: s,
      fontSizePx: o,
      measures: [],
      systems: [],
      partDecorations: []
    };
  const r = e.staves[0].measures.length;
  for (let T = 1; T < i; T++)
    if (e.staves[T].measures.length !== r)
      throw new Error(
        `layoutScore: staff ${T} has ${e.staves[T].measures.length} measures, staff 0 has ${r}. M2 Slice 4's interleaved multi-staff layout decides system membership once for the whole score (see this function's own doc comment), which needs every staff to agree on how many measures it has; a score with genuinely different per-staff measure counts is out of this slice's scope.`
      );
  const a = Vc(e, n), l = (T) => a.bracketAreaWidth + a.labelColumnWidth[Di(T)], f = (T) => t.systemWidthPx === void 0 ? void 0 : t.systemWidthPx - 2 * s - l(T), c = f(0), u = t.courtesy !== !1, h = c === void 0 ? null : Zc(e, n, u), d = tl(e, h, c, f(1)), g = [], m = [], b = e.staves.map((T, V) => ya(e, V)), y = [], x = [];
  d.forEach((T, V) => {
    for (const N of T) x[N] = V;
  });
  let S = null, w = [];
  const E = Hr(e, t), B = Vr(E, n), D = da(e);
  for (let T = 0; T < d.length; T++) {
    const V = d[T], N = T === d.length - 1, v = (_) => u && !N && _ === V[V.length - 1], k = (_) => u && T > 0 && _ === V[0], H = Qc(
      e,
      V,
      (_, tt) => (tt === V[0] ? h.first : h.mid)[_][tt] + (v(tt) ? h.courtesy[_][tt] : 0),
      n,
      f(T),
      N
    ), q = e.staves.map(
      (_, tt) => V.map((ft) => {
        const At = _.measures[ft];
        return qs(
          e,
          tt,
          At,
          n,
          {
            isSystemFirst: ft === V[0],
            isScoreFirst: ft === 0,
            isLast: ft === _.measures.length - 1,
            endsSystem: v(ft),
            courtesyBefore: k(ft)
          },
          H
        );
      })
    ), et = V.map((_, tt) => Math.max(...q.map((ft) => ft[tt]))), z = b.map((_) => xa(_, V[0], V[V.length - 1])), Z = (_) => {
      var tt;
      return Kr(_, i, (((tt = z[_ - 1]) == null ? void 0 : tt.length) ?? 0) > 0, z[_].length > 0);
    }, Nt = (_, tt, ft, At) => {
      const Mt = e.staves[_], fe = z[_], Kt = Z(_), jt = Zo(tt, n, Kt.above ? ft : null, Kt.below ? At : null);
      let qt = s + l(T);
      const Ot = [];
      for (let Zt = 0; Zt < V.length; Zt++) {
        const te = V[Zt], Ss = Mt.measures[te], Sn = e.clefAt(te, _), Ke = Js(e, Ss, {
          ss: n,
          staffTopY: tt,
          startX: qt,
          isSystemFirst: te === V[0],
          isScoreFirst: te === 0,
          isLast: te === Mt.measures.length - 1,
          endsSystem: v(te),
          courtesyBefore: k(te),
          spacingScale: H,
          staffIndex: _,
          clef: Sn,
          lines: Ve[Sn],
          columnWidth: et[Zt],
          barlineTop: jt.top,
          barlineBottom: jt.bottom,
          ...ft !== null ? { splitAbove: ft } : {},
          ...At !== null ? { splitBelow: At } : {}
        });
        Ot.push(Ke), qt = Ke.region.x + Ke.region.width;
      }
      const Xe = b[_];
      let ye;
      const Jt = { staffIndex: _, measures: [...Ot], staffTopY: tt, ss: n, systemOf: x, lyrics: fe.length > 0 }, Qt = Po(e, Jt);
      if (Xe && fe.length > 0) {
        const Zt = rf(
          { measures: Ot, staffTopY: tt, ss: n, systemOf: x, index: Xe, verses: fe },
          (Qt == null ? void 0 : Qt.belowBottom) ?? null
        );
        Ot.splice(0, Ot.length, ...Zt.measures), ye = Zt.baseline;
      }
      let xe = Xl({ ...Jt, measures: Ot }, Qt), Un;
      const Fe = _ === 0 && ga(D, V[0], V[V.length - 1]) ? pa(e, Jt, ni(e, Jt), D, Qt == null ? void 0 : Qt.aboveTop) : null;
      if (Fe !== null) {
        Un = Fe;
        const Zt = { ...Jt, measures: xe };
        xe = xe.map((te) => On(te, ma(Zt, D, Fe, te), tt, n));
      }
      return { measures: xe, lyricBaseline: ye, voltaY: Un };
    }, Q = rt.staffGap * n / 2, ot = (_) => _ > 0 ? -Q : null, gt = (_) => _ < i - 1 ? 4 * n + Q : null, Pt = e.staves.map((_, tt) => Nt(tt, 0, ot(tt), gt(tt))), Wt = Pt.map((_) => zr(_.measures, 0, n)), ge = [0];
    for (let _ = 1; _ < i; _++) {
      const tt = Wt[_ - 1].bottom - 4 * n, ft = z[_ - 1].length > 0;
      ge.push(ge[_ - 1] + Yr(tt, -Wt[_].top, ft, n));
    }
    const be = S === null ? 0 : Ur(S, -Wt[0].top, n, jr(w, ge, n), B), Yt = ge.map((_) => be + _), Ut = Yt.slice(1).map((_, tt) => No(Yt[tt], Yt[tt] + Wt[tt].bottom, _, _ + Wt[tt + 1].top, n)), W = e.crossStaffBeams.length > 0;
    let Y = -1 / 0, st = 1 / 0;
    for (let _ = 0; _ < i; _++) {
      const tt = Yt[_], ft = _ > 0 ? Ut[_ - 1] : null, At = _ < i - 1 ? Ut[_] : null, Mt = Z(_), fe = (Ot, Xe, ye) => Ot !== null && Xe !== null && (ye || W) && Math.abs(Ot - tt - Xe) > 1e-6, Kt = Pt[_], jt = fe(ft, ot(_), Mt.above) || fe(At, gt(_), Mt.below) ? Nt(_, tt, ft, At) : {
        measures: tt === 0 ? Kt.measures : Kt.measures.map((Ot) => nr(Ot, tt)),
        lyricBaseline: Kt.lyricBaseline === void 0 ? void 0 : Kt.lyricBaseline + tt,
        voltaY: Kt.voltaY === void 0 ? void 0 : Kt.voltaY + tt
      };
      g.push(...jt.measures);
      const qt = z[_];
      m.push({
        measureIndices: [...V],
        topY: tt,
        spacingScale: H,
        staffIndex: _,
        ...jt.lyricBaseline !== void 0 ? { lyricVerses: qt, lyricBaseline: jt.lyricBaseline } : {},
        ...jt.voltaY !== void 0 ? { voltaY: jt.voltaY } : {}
      }), Y = Math.max(Y, tt + 4 * n, ...jt.measures.map((Ot) => Ot.region.y + Ot.region.height)), _ === 0 && (st = Math.min(tt, ...jt.measures.map((Ot) => Ot.region.y)));
    }
    y.push(
      ...Xc(e, n, a, Yt, s, Di(T))
    ), E && S !== null && y.push(Xr(s, S, st, n)), S = Y, w = Yt;
  }
  const M = t.header === !1 ? null : qc(Oc(e), n), I = y.length > 0 ? Ze(y, 0, 0, 0, n) : null, C = Math.min(0, ...g.map((T) => T.region.y), (I == null ? void 0 : I.y) ?? 0), O = s + ((M == null ? void 0 : M.height) ?? 0) - C, L = g.map((T) => nr(T, O)), R = m.map((T) => ({
    ...T,
    topY: T.topY + O,
    ...T.lyricBaseline !== void 0 ? { lyricBaseline: T.lyricBaseline + O } : {},
    ...T.voltaY !== void 0 ? { voltaY: T.voltaY + O } : {}
  })), K = Ma(y, O), j = Math.max(
    s * 2 + ((M == null ? void 0 : M.minWidth) ?? 0),
    ...L.map((T) => T.region.x + T.region.width + s)
  ), J = Math.max(
    ...R.map((T) => T.topY + 4 * n),
    ...L.map((T) => T.region.y + T.region.height),
    I ? I.y + I.height + O : -1 / 0
  );
  return {
    width: j,
    height: J + s,
    staffSpacePx: n,
    staffTopY: R[0].topY,
    fontSizePx: o,
    measures: L,
    systems: R,
    partDecorations: K,
    ...M ? { header: Jc(M, s, j) } : {}
  };
}
function qc(e, t) {
  const n = [];
  let s = 0, o = 0;
  const i = (r, a) => {
    const l = r * t;
    n.length > 0 && (s += Le.lineGap * t);
    const f = s + Le.ascent * l;
    s = f + Le.descent * l, n.push({ baseline: f, fontSizePx: l, ...a });
    const c = (u) => u ? to(u, l, a.fontStyle) : 0;
    o = Math.max(o, c(a.center), c(a.left) + c(a.right) + (a.left && a.right ? Le.creditGap * t : 0));
  };
  return e.title && i(Le.titleFontSpaces, { center: e.title, fontStyle: "bold" }), e.subtitle && i(Le.subtitleFontSpaces, { center: e.subtitle }), (e.composer || e.lyricist) && i(Le.creditFontSpaces, { left: e.lyricist, right: e.composer }), n.length === 0 ? null : { lines: n, inkHeight: s, height: s + Le.systemGap * t, minWidth: o };
}
function Jc(e, t, n) {
  const s = [];
  for (const o of e.lines) {
    const r = { y: t + o.baseline, fontSizePx: o.fontSizePx, ...o.fontStyle ? { fontStyle: o.fontStyle } : {} };
    o.center && s.push({ kind: "text", text: o.center, x: n / 2, align: "center", ...r }), o.left && s.push({ kind: "text", text: o.left, x: t, ...r }), o.right && s.push({ kind: "text", text: o.right, x: n - t, align: "right", ...r });
  }
  return { region: { x: 0, y: t, width: n, height: e.inkHeight }, ops: s };
}
function Qc(e, t, n, s, o, i) {
  if (o === void 0) return 1;
  const r = t.map(
    (l) => e.staves.map((f, c) => {
      const u = f.measures[l];
      let h = 0;
      for (const d of oo(e, u, c, ri(e, l)).columns) h += d.stretch;
      return { natural: n(c, l), stretch: h * s };
    })
  );
  if (!r.some((l) => l.some((f) => f.stretch > 0))) return 1;
  let a = 1;
  for (let l = 0; l < 32; l++) {
    let f = 0, c = 0;
    for (const h of r) {
      let d = -1 / 0, g = 0;
      for (const m of h) {
        const b = m.natural + (a - 1) * m.stretch;
        (b > d + 1e-9 || Math.abs(b - d) <= 1e-9 && m.stretch > g) && (d = b, g = m.stretch);
      }
      f += d, c += g;
    }
    const u = o - f;
    if (Math.abs(u) < 1e-6 || c <= 0) break;
    a += u / c;
  }
  return i && (a = Math.min(a, 1)), Math.max(a, 0.5);
}
function Zc(e, t, n) {
  const s = (l) => e.staves.map(
    (f, c) => f.measures.map(
      (u) => qs(e, c, u, t, {
        isSystemFirst: l,
        isScoreFirst: l && u.index === 0,
        isLast: u.index === f.measures.length - 1,
        courtesyBefore: n && l && u.index > 0
      })
    )
  ), o = e.staves[0].measures.map((l) => {
    let f = 0;
    for (const c of oo(e, l, 0, ri(e, l.index)).columns) f += c.stretch;
    return f * t;
  }), i = s(!1), r = e.staves[0].measures.map(
    (l) => n && e.staves.some((f, c) => ro(e, l.index, c) !== null)
  ), a = e.staves.map(
    (l, f) => l.measures.map(
      (c) => r[c.index] ? qs(e, f, c, t, { isSystemFirst: !1, isScoreFirst: !1, isLast: !1, endsSystem: !0 }) - i[f][c.index] : 0
    )
  );
  return { first: s(!0), mid: i, stretch: o, courtesy: a };
}
function tl(e, t, n, s = n) {
  const o = e.staves[0].measures.length, i = Array.from({ length: o }, (h, d) => d);
  if (n === void 0 || t === null) return [i];
  const r = 1 - rt.minCastOffScale, a = (h, d) => Math.max(...h.map((g) => g[d])) - r * t.stretch[d], l = (h) => Math.max(...t.courtesy.map((d) => d[h])), f = [];
  let c = [], u = 0;
  for (const h of i) {
    const d = a(t.first, h);
    if (c.length === 0) {
      c.push(h), u = d;
      continue;
    }
    const g = a(t.mid, h), m = f.length === 0 ? n : s;
    u + g + l(h) > m + 1e-6 ? (f.push(c), c = [h], u = d) : (c.push(h), u += g);
  }
  return c.length > 0 && f.push(c), f;
}
function qs(e, t, n, s, o, i) {
  const r = e.clefAt(n.index, t);
  return Js(e, n, {
    ss: s,
    staffTopY: 0,
    startX: 0,
    ...o,
    spacingScale: i,
    staffIndex: t,
    clef: r,
    lines: Ve[r]
  }).region.width;
}
function el(e, t, n, s) {
  const o = (a, l) => a.map((f) => {
    const c = e.measures.find((u) => u.staffIndex === t && u.index === f);
    return l === "top" ? c.region.y : c.region.y + c.region.height;
  }), i = n[s - 1], r = n[s + 1];
  return {
    top: i ? Math.max(...o(i.measureIndices, "bottom")) : e.header ? e.header.region.y + e.header.region.height : 0,
    bottom: r ? Math.min(...o(r.measureIndices, "top")) : e.height
  };
}
function nl(e, t, n, s = {}, o = 0) {
  return $r(() => sl(e, t, n, s, o));
}
function sl(e, t, n, s, o) {
  var Ut;
  const i = e.staves[o], r = i == null ? void 0 : i.measures[n], a = t.measures.find((W) => W.staffIndex === o && W.index === n), l = t.systems.filter((W) => W.staffIndex === o), f = l.findIndex((W) => W.measureIndices.includes(n)), c = l[f];
  if (!i || !r || !a || !c) return null;
  const u = e.clefAt(n, o), h = s.staffSpacePx ?? Bo.staffSpacePx, d = ya(e, o), g = xa(d, c.measureIndices[0], c.measureIndices[c.measureIndices.length - 1]), m = c.lyricVerses ?? Oo;
  if (g.length !== m.length || g.some((W, Y) => W !== m[Y])) return null;
  const b = e.staves.length, y = (W, Y) => t.systems.filter((st) => st.staffIndex === W)[Y], x = (W, Y) => t.measures.find((st) => st.staffIndex === W && st.index === Y), S = (W, Y) => zr(
    W.measureIndices.map((st) => Y && W.staffIndex === o && st === n ? Y : x(W.staffIndex, st)),
    W.topY,
    h
  ), w = (W, Y, st) => No(W.topY, S(W, st).bottom, Y.topY, S(Y, st).top, h), E = o > 0 ? y(o - 1, f) : void 0, B = o < b - 1 ? y(o + 1, f) : void 0, D = E ? w(E, c) : null, M = B ? w(c, B) : null, I = Kr(o, b, (((Ut = E == null ? void 0 : E.lyricVerses) == null ? void 0 : Ut.length) ?? 0) > 0, g.length > 0), C = Zo(c.topY, h, I.above ? D : null, I.below ? M : null), O = s.courtesy !== !1, L = {
    isSystemFirst: c.measureIndices[0] === n,
    isScoreFirst: n === 0,
    isLast: n === i.measures.length - 1,
    endsSystem: O && f < l.length - 1 && c.measureIndices[c.measureIndices.length - 1] === n,
    courtesyBefore: O && f > 0 && c.measureIndices[0] === n
  };
  if (O && L.isSystemFirst && f > 0) {
    const W = t.measures.find((Y) => Y.staffIndex === o && Y.index === n - 1);
    if (!W || !fl(W.courtesy, ro(e, n - 1, o))) return null;
  }
  const R = e.staves.length > 1 ? Math.max(
    ...e.staves.map(
      (W, Y) => qs(e, Y, W.measures[n], h, L, c.spacingScale)
    )
  ) : void 0;
  for (let W = 0; W < e.staves.length; W++) {
    if (W === o) continue;
    const Y = t.measures.find((At) => At.staffIndex === W && At.index === n), st = t.systems.find((At) => At.staffIndex === W && At.measureIndices.includes(n)), _ = e.staves[W].measures[n];
    if (!Y || !st || !_) return null;
    const tt = e.clefAt(n, W), ft = Js(e, _, {
      ss: h,
      staffTopY: st.topY,
      startX: Y.region.x,
      ...L,
      isLast: n === e.staves[W].measures.length - 1,
      spacingScale: c.spacingScale,
      staffIndex: W,
      clef: tt,
      lines: Ve[tt],
      columnWidth: R
    });
    if (ft.notes.length !== Y.notes.length || ft.notes.some((At, Mt) => Math.abs(At.bounds.x - Y.notes[Mt].bounds.x) > 1e-3)) return null;
  }
  const K = Js(e, r, {
    ss: h,
    staffTopY: c.topY,
    startX: a.region.x,
    ...L,
    spacingScale: c.spacingScale,
    staffIndex: o,
    clef: u,
    lines: Ve[u],
    columnWidth: R,
    barlineTop: C.top,
    barlineBottom: C.bottom,
    ...D !== null ? { splitAbove: D } : {},
    ...M !== null ? { splitBelow: M } : {}
  }), j = c.measureIndices[0], J = c.measureIndices[c.measureIndices.length - 1], T = [];
  l.forEach((W, Y) => {
    for (const st of W.measureIndices) T[st] = Y;
  });
  const V = (W) => t.measures.find((Y) => Y.staffIndex === o && Y.index === W), N = {
    staffIndex: o,
    measures: c.measureIndices.map(V),
    staffTopY: c.topY,
    ss: h,
    systemOf: T,
    lyrics: g.length > 0
  }, v = { ...N, measures: c.measureIndices.map((W) => W === n ? K : V(W)) }, k = Po(e, N), H = Po(e, v);
  if (k === null != (H === null)) return null;
  if (k && H) {
    const W = (Y, st) => Y === null || st === null ? Y !== st : Math.abs(Y - st) > 1e-3;
    if (W(k.baselines.above, H.baselines.above) || W(k.baselines.below, H.baselines.below))
      return null;
    for (const Y of c.measureIndices)
      if (Y !== n && !tr(k.ops.get(Y) ?? [], H.ops.get(Y) ?? []))
        return null;
  }
  let q = K;
  if (d && g.length > 0 && c.lyricBaseline !== void 0) {
    const W = { staffIndex: o, measures: N.measures, staffTopY: c.topY, ss: h, systemOf: T, index: d, verses: g }, Y = { ...W, measures: v.measures }, st = va(Y, (H == null ? void 0 : H.belowBottom) ?? null);
    if (Math.abs(st - c.lyricBaseline) > 1e-3) return null;
    for (const _ of c.measureIndices) {
      if (_ === n) continue;
      const tt = Os(W, st, V(_)), ft = Os(Y, st, V(_));
      if (!tr(tt, ft)) return null;
    }
    q = On(K, Os(Y, st, K), c.topY, h);
  }
  H && (q = On(q, H.ops.get(n) ?? [], c.topY, h));
  const et = o === 0 ? da(e) : [], z = ga(et, j, J);
  if (z !== (c.voltaY !== void 0)) return null;
  if (z) {
    const W = { ...v, measures: c.measureIndices.map((st) => st === n ? q : V(st)) }, Y = pa(e, W, ni(e, W), et, H == null ? void 0 : H.aboveTop);
    if (Y === null || Math.abs(Y - c.voltaY) > 1e-3) return null;
    q = On(q, ma(W, et, Y, q), c.topY, h);
  }
  const Z = (W, Y) => Math.abs(W - Y) > 1e-3, Nt = (W, Y) => {
    var Mt;
    const st = S(W, q), _ = S(Y, q), tt = (((Mt = W.lyricVerses) == null ? void 0 : Mt.length) ?? 0) > 0, ft = Yr(st.bottom - W.topY - 4 * h, Y.topY - _.top, tt, h), At = No(W.topY, st.bottom, Y.topY, _.top, h);
    return Z(W.topY + ft, Y.topY) || Z(At, w(W, Y));
  };
  if (E && Nt(E, c) || B && Nt(c, B)) return null;
  const Q = (W) => {
    let Y = -1 / 0;
    for (let st = 0; st < b; st++) {
      const _ = y(st, W);
      Y = Math.max(Y, _.topY + 4 * h);
      for (const tt of _.measureIndices) {
        const ft = st === o && tt === n ? q : x(st, tt);
        Y = Math.max(Y, ft.region.y + ft.region.height);
      }
    }
    return Y;
  }, ot = Hr(e, s), gt = (W) => Array.from({ length: b }, (Y, st) => y(st, W).topY), Pt = (W) => {
    const Y = y(0, W), st = jr(gt(W - 1), gt(W), h), _ = Vr(ot, h);
    return Z(Ur(Q(W - 1), Y.topY - S(Y, q).top, h, st, _), Y.topY);
  }, Wt = (W) => {
    if (!ot) return !1;
    const Y = t.partDecorations.filter((ft) => ft.kind === "glyph" && ft.glyph === "systemDivider")[W - 1], st = y(0, W), _ = Math.min(
      st.topY,
      ...st.measureIndices.map((ft) => (o === 0 && ft === n ? q : x(0, ft)).region.y)
    ), tt = Xr(0, Q(W - 1), _, h);
    return (Y == null ? void 0 : Y.kind) !== "glyph" || tt.kind !== "glyph" || Z(Y.y, tt.y);
  };
  if (o === 0 && f > 0 && (Pt(f) || Wt(f)) || o === b - 1 && f < l.length - 1 && (Pt(f + 1) || Wt(f + 1)))
    return null;
  const ge = Math.abs(q.region.width - a.region.width) > 1e-3, be = el(t, o, l, f), Yt = q.region.y < be.top || q.region.y + q.region.height > be.bottom;
  return ge || Yt ? null : {
    ...t,
    measures: t.measures.map(
      (W) => W.staffIndex === o && W.index === n ? q : W
    )
  };
}
function Js(e, t, n) {
  var fi, hi, ui, di;
  const { ss: s, staffTopY: o, startX: i } = n, r = [], a = [], l = e.keyFifthsAt(t.index, n.staffIndex), f = e.timeAt(t.index, n.staffIndex), c = t.index > 0 && l !== e.keyFifthsAt(t.index - 1, n.staffIndex), u = t.index > 0 && !ti(f, e.timeAt(t.index - 1, n.staffIndex)), h = t.index > 0 && n.clef !== e.clefAtEnd(t.index - 1, n.staffIndex);
  let d = i;
  if (n.isSystemFirst ? (d += rt.headerGap * s, d = Vn(r, d, n), d = Ao(
    r,
    d,
    l,
    n,
    c && !n.courtesyBefore ? e.keyFifthsAt(t.index - 1, n.staffIndex) : void 0
  ), (n.isScoreFirst || u) && (d = Co(r, d, f.beats, f.beatType, n))) : (h || c || u) && (d += rt.headerGap * s, h && (d = Vn(r, d, n, Ts)), c && (d = Ao(r, d, l, n, e.keyFifthsAt(t.index - 1, n.staffIndex))), u && (d = Co(r, d, f.beats, f.beatType, n))), n.isSystemFirst && n.staffIndex === 0 && t.index > 0) {
    const P = Ze(r, i, 0, o, s).y;
    r.push({
      kind: "text",
      text: t.number ?? String(t.index + 1),
      x: i,
      y: P - Ri.gapSpaces * s,
      fontSizePx: Ri.fontSpaces * s
    });
  }
  t.startBarline === "repeatStart" && (d = cl(r, d, o, n));
  const g = d, m = ri(e, t.index), b = oo(e, t, n.staffIndex, m);
  d += (rt.measureLeadIn + Math.max((m == null ? void 0 : m.lead) ?? 0, b.lead)) * s;
  const y = $c(t.notes), x = _r(t.notes), S = so(t.notes), w = /* @__PURE__ */ new Map();
  for (const P of Xt(t.notes)) {
    if (!Xo(P)) continue;
    const G = St(S.get(P[0].id) ?? 0);
    for (const ut of P) {
      if (!ut.pitch) continue;
      const yt = ht(ut.pitch), xt = w.get(G);
      xt ? (xt.low = Math.min(xt.low, yt), xt.high = Math.max(xt.high, yt)) : w.set(G, { low: yt, high: yt, drawn: !1 });
    }
  }
  const E = /* @__PURE__ */ new Map(), B = [];
  for (const P of no(t.notes)) {
    let G;
    P.principal ? (E.set(P.principal.id, P), G = S.get(P.principal.id) ?? 0) : (B.push(P), G = (x.get(P.voice) ?? []).reduce((ut, yt) => ut + yt[0].durationWholes, 0));
    for (const ut of P.notes) S.set(ut.id, G);
  }
  const D = t.clefChanges, M = /* @__PURE__ */ new Map([[n.clef, n]]), I = (P) => {
    let G = M.get(P);
    return G || (G = { ...n, clef: P, lines: Ve[P] }, M.set(P, G)), G;
  }, C = (P) => {
    for (let G = D.length - 1; G >= 0; G--)
      if (St(D[G].onset) <= St(P)) return D[G].clef;
    return n.clef;
  }, O = (P) => D.length === 0 ? n.lines.middleLine : Ve[C(S.get(P.id) ?? 0)].middleLine, L = pl(t, f, S), R = L.multiVoice, K = /* @__PURE__ */ new Set(), j = /* @__PURE__ */ new Map();
  for (const P of t.notes) {
    const G = e.crossStaffBeamContaining(P.id);
    if (!G) continue;
    K.add(P.id);
    const ut = j.get(G) ?? [];
    ut.push(P), j.set(G, ut);
  }
  const J = [];
  for (const [P, G] of y)
    J.push(
      ...aa(
        G,
        f,
        D.length === 0 ? n.lines.middleLine : O,
        Yn(P, R),
        K
      )
    );
  const T = [];
  for (const [P, G] of j) {
    const ut = n.staffIndex === P.staffIndices[0], yt = ut ? "down" : "up", xt = rt.staffGap * n.ss / 2, it = Zo(
      n.staffTopY,
      n.ss,
      n.splitAbove ?? n.staffTopY - xt,
      n.splitBelow ?? n.staffTopY + 4 * n.ss + xt
    ), Ft = ut ? it.bottom : it.top;
    T.push({ group: { notes: G, direction: yt }, beamY: Ft });
  }
  const V = /* @__PURE__ */ new Map();
  for (const P of J)
    for (const G of P.notes) V.set(G.id, P);
  for (const { group: P } of T)
    for (const G of P.notes) V.set(G.id, P);
  const N = ml(L, S, (P) => I(C(P)), V), v = /* @__PURE__ */ new Map(), k = /* @__PURE__ */ new Map(), H = /* @__PURE__ */ new Map(), q = [], et = n.spacingScale ?? 1, { columns: z } = b, Z = /* @__PURE__ */ new Map();
  let Nt = 0;
  for (const P of z)
    Z.set(St(P.onset), Nt), Nt += (P.width + (et - 1) * P.stretch) * s;
  const Q = [...y.keys()].sort((P, G) => P - G), ot = /* @__PURE__ */ new Map(), gt = /* @__PURE__ */ new Map(), Pt = /* @__PURE__ */ new Map(), Wt = /* @__PURE__ */ new Map();
  for (const P of Q)
    ot.set(P, 0), gt.set(P, /* @__PURE__ */ new Map()), Pt.set(P, null), Wt.set(P, 0);
  let ge = /* @__PURE__ */ new Map(), be = /* @__PURE__ */ new Map(), Yt = 0, Ut = n, W = 0, Y = 0;
  const st = (P, G) => {
    let ut = null;
    for (; Yt < D.length && St(D[Yt].onset) <= St(P); )
      ut = D[Yt++].clef;
    if (ut === null || ut === Ut.clef) return;
    Ut = I(ut);
    const yt = G + zi * s, it = Vn(r, yt, Ut, Ts) - rt.headerGap * s;
    W += it + zi * s - G;
    for (const Ft of Q) {
      const _t = Pt.get(Ft);
      Pt.set(Ft, _t === null ? it : Math.max(_t, it));
    }
  }, _ = [];
  for (const P of z) {
    const G = St(P.onset);
    Yt < D.length && st(
      P.onset,
      d + Z.get(G) + W + Y + Math.max(0, ...Wt.values())
    );
    const ut = /* @__PURE__ */ new Map();
    let yt = 0;
    for (const it of Q) {
      const Ft = (fi = x.get(it)) == null ? void 0 : fi[ot.get(it)], _t = Ft && St(S.get(Ft[0].id)) === G ? E.get(Ft[0].id) : void 0;
      if (!_t) continue;
      const wt = Ui(_t, l, gt.get(it), Is(it, R), s);
      ut.set(it, wt), yt = Math.max(yt, wt.widthPx);
    }
    Y += yt, be = /* @__PURE__ */ new Map();
    let xt = null;
    for (const it of Q) {
      const Ft = x.get(it) ?? [], _t = ot.get(it), wt = Ft[_t], Ct = wt == null ? void 0 : wt[0];
      if (!wt || !Ct || St(S.get(Ct.id)) !== G) continue;
      ot.set(it, _t + 1);
      const jn = Wt.get(it), We = d + Z.get(G) + W + Y + jn, Mn = ut.get(it);
      if (Mn) {
        const ee = ji(
          r,
          a,
          v,
          Mn,
          We - Mn.widthPx,
          Is(it, R),
          Ut
        ), Ms = Pt.get(it);
        Pt.set(it, Ms === null ? ee : Math.max(Ms, ee));
      }
      const kn = [...be.values()].flat(), Re = [...ge.values()].flat();
      let En = 0;
      for (const ee of wt)
        ee.pitch !== null && (En = Math.max(
          En,
          Ml(
            ht(ee.pitch),
            xn[Ct.value],
            We,
            kn,
            Re,
            s
          )
        ));
      const uo = We + En, hc = ((hi = V.get(Ct.id)) == null ? void 0 : hi.direction) ?? null, po = Pt.get(it), uc = po === null ? xt : xt === null ? po : Math.max(po, xt), pi = r.length, dc = a.length, ae = yl(
        r,
        a,
        uo,
        wt,
        l,
        Ut,
        hc,
        gt.get(it),
        uc,
        R,
        N.get(Ct.id) ?? null,
        w.get(St(S.get(Ct.id) ?? 0))
      );
      if (Ct.isMeasureRest && _.push({ opStart: pi, opEnd: r.length, noteIndex: dc }), (Ko(wt).length > 0 || qo(wt) !== null) && q.push({
        chord: wt,
        heads: ae.heads.map(([, ee]) => ee),
        stem: ae.stem,
        ctx: Ut,
        restOp: Ct.pitch === null ? pi : null
      }), Wt.set(it, jn + En + ae.collisionShift), Pt.set(it, ae.inkRight), xt = xt === null ? ae.inkRight : Math.max(xt, ae.inkRight), ae.heads.length > 0) {
        for (const [ee, Ms] of ae.heads) v.set(ee, Ms);
        be.set(
          it,
          ae.heads.map(([, ee]) => ({ d: ee.d, noteX: ee.noteX }))
        );
      }
      ae.stem && k.set(Ct.id, ae.stem);
    }
    ge = be;
  }
  const tt = Wt;
  if (Yt < D.length && st(
    Number.POSITIVE_INFINITY,
    d + Nt + W + Y + Math.max(0, ...tt.values())
  ), B.length > 0) {
    const P = d + Nt + W + Y + Math.max(0, ...tt.values());
    let G = 0;
    for (const ut of B) {
      const yt = Is(ut.voice, R), xt = gt.get(ut.voice) ?? /* @__PURE__ */ new Map(), it = Ui(ut, l, xt, yt, s);
      ji(r, a, v, it, P, yt, Ut), G = Math.max(G, it.widthPx);
    }
    Y += G;
  }
  for (const P of J) Vi(r, P, k, n, void 0, H);
  const ft = r.length;
  for (const { group: P, beamY: G } of T) Vi(r, P, k, n, G, H);
  const At = new Set(r.slice(ft));
  d += Nt + W + Y + Math.max(0, ...tt.values()), d += rt.measureTrailOut * s, d = Math.max(d, af(t, a, s));
  const Mt = n.endsSystem ? ro(e, t.index, n.staffIndex) : null, fe = Mt != null && Mt.clef ? I(Mt.clef) : I(e.clefAtEnd(t.index, n.staffIndex)), Kt = Mt != null && Mt.clef ? Vn([], 0, fe, Ts) : 0, jt = n.endsSystem ? hl(e, t.index, n) : 0;
  d += Kt;
  const qt = e.endBarlineAt(t.index, n.staffIndex), Ot = at.thinBarlineThickness * s, Xe = at.thickBarlineThickness * s, ye = qt === "repeatStart" ? 0 : qt === "final" || qt === "repeatEnd" ? Xe : Ot;
  if (n.columnWidth !== void 0) {
    const P = d + ye + jt - i;
    P < n.columnWidth && (d += n.columnWidth - P);
  }
  const Jt = d, Qt = Jt + ye + jt - i, xe = Jt - Kt;
  bl(r, a, _, g, xe, s);
  const Un = /* @__PURE__ */ new Map();
  for (const P of q) {
    const G = P.restOp === null ? void 0 : r[P.restOp];
    G && G.kind === "glyph" && Un.set(P, ns(G.glyph, G.x, G.y, s));
  }
  const Fe = n.barlineTop ?? o, Zt = n.barlineBottom ?? o + 4 * s, te = r.length, Ss = at.staffLineThickness * s, Sn = (ui = ol(e, n.staffIndex)) != null && ui[t.index] ? 0 : 5;
  for (let P = 0; P < Sn; P++)
    r.unshift({
      kind: "rect",
      x: i,
      y: o + P * s - Ss / 2,
      width: Qt,
      height: Ss
    });
  if ((qt === "final" || qt === "double") && r.push({
    kind: "rect",
    x: Jt - at.barlineSeparation * s - Ot,
    y: Fe,
    width: Ot,
    height: Zt - Fe
  }), qt === "repeatEnd") {
    const P = X.repeatDot.advance * s;
    ta(r, Jt - at.barlineSeparation * s - P, n);
  }
  qt !== "repeatStart" && r.push({
    kind: "rect",
    x: Jt,
    y: Fe,
    width: ye,
    height: Zt - Fe
  });
  const Ke = new Set(r.slice(te + Sn));
  Mt && (Mt.clef && Vn(r, xe, fe, Ts), ea(r, Jt + ye, Mt, fe));
  for (const P of t.notes) {
    const G = v.get(P.id);
    if (!G) continue;
    const ut = s * (G.scale ?? 1);
    if (P.tiedToId !== null && !P.hidden && ((di = e.findNote(P.tiedToId)) == null ? void 0 : di.hidden) !== !0) {
      const xt = Ji(G, O(P)), it = G.noteX + (X[G.headGlyph].bBoxNE[0] + bo) * ut, Ft = e.measureOfNote(P.tiedToId) === t ? v.get(P.tiedToId) : void 0;
      if (Ft) {
        const _t = s * (Ft.scale ?? 1), wt = Ft.noteX + (X[Ft.headGlyph].bBoxSW[0] - bo) * _t;
        So(r, it, G.y, wt, Ft.y, xt, P.id, n);
      } else
        So(r, it, G.y, xe, G.y, xt, P.id, n);
    }
    const yt = e.tiedFromNote(P.id);
    if (yt && !yt.hidden && !P.hidden && e.measureOfNote(yt.id) !== t) {
      const xt = Ji(G, O(P)), it = G.noteX + (X[G.headGlyph].bBoxSW[0] - bo) * ut;
      So(r, i, G.y, it, G.y, xt, yt.id, n);
    }
  }
  for (const P of e.slurs) {
    const G = e.measureOfNote(P.startNoteId), ut = e.measureOfNote(P.endNoteId);
    if (!G || !ut || t.staffIndex !== G.staffIndex || t.index < G.index || t.index > ut.index) continue;
    const yt = zl(e, P, G.staffIndex), xt = yt[0], it = (xt == null ? void 0 : xt.grace) != null ? xt : void 0, Ft = it ? Is(it.voice, R) : Gn(
      yt.flatMap((Re) => Re.pitch ? [ht(Re.pitch)] : []),
      n.lines.middleLine
    ) === "up";
    let _t = Yl(yt, Ft, n);
    const wt = t.index === G.index ? v.get(P.startNoteId) : void 0, Ct = t.index === ut.index ? v.get(P.endNoteId) : void 0;
    let jn = wt ? wt.noteX + (X[wt.headGlyph].bBoxNE[0] + Li) * s * (wt.scale ?? 1) : i, We = wt ? wt.y : _t, Mn = Ct ? Ct.noteX + (X[Ct.headGlyph].bBoxSW[0] - Li * (Ct.scale ?? 1)) * s : xe, kn = Ct ? Ct.y : _t;
    if (it && wt && Ct) {
      const Re = Ft ? 1 : -1, En = X[wt.headGlyph].advance * s * (wt.scale ?? 1), uo = X[Ct.headGlyph].advance * s * (Ct.scale ?? 1);
      jn = wt.noteX + En / 2, We = wt.y + Re * 0.5 * s, Mn = Ct.noteX + uo * 0.4, kn = Ct.y + Re * 0.7 * s, _t = (Ft ? Math.max(We, kn) : Math.min(We, kn)) + Re * 0.6 * s;
    }
    Ul(r, jn, We, Mn, kn, _t, P.startNoteId, n);
  }
  if (q.length > 0) {
    const P = r.filter((G) => G.kind === "curve");
    for (const G of q) {
      const ut = G.chord[0], yt = G.stem === null ? null : H.get(ut.id) ?? G.stem.nearY + (G.heads[0].up ? -Pe * s : Pe * s);
      Wl(r, G, Un.get(G) ?? null, yt, P, R);
    }
  }
  let wn = il(t);
  L.folded.size > 0 && (wn = /* @__PURE__ */ new Set([...wn ?? [], ...L.folded])), wn !== null && (rl(r, wn), al(a, wn)), _l(r, x, {
    placements: v,
    stemTips: H,
    beamGroupOfNote: V,
    hidden: wn ?? /* @__PURE__ */ new Set(),
    multiVoice: R,
    lineCount: Sn,
    barlineOps: Ke,
    ss: s
  });
  const ws = Ze(
    r.filter((P) => !Ke.has(P)),
    i,
    Qt,
    o,
    s
  ), ho = At.size === 0 ? ws : Ze(r.filter((P) => !Ke.has(P) && !At.has(P)), i, Qt, o, s);
  return {
    index: t.index,
    staffIndex: n.staffIndex,
    region: Ze(r, i, Qt, o, s),
    ops: r,
    notes: a,
    inkExtent: { top: ws.y + me, bottom: ws.y + ws.height - me },
    gapExtent: { top: ho.y + me, bottom: ho.y + ho.height - me },
    ...Mt ? { courtesy: Mt } : {}
  };
}
function ol(e, t) {
  const n = ie == null ? void 0 : ie.hiddenLines;
  if (n != null && n.has(t)) return n.get(t);
  let s;
  for (const f of e.parts)
    f.staffIndices.includes(t) && (!s || f.staffIndices.length < s.staffIndices.length) && (s = f);
  const o = s ? [...s.staffIndices].sort((f, c) => f - c) : [t], i = String(o.indexOf(t) + 1), r = e.staves[o[0]];
  let a = null, l = !1;
  return r.measures.forEach((f, c) => {
    for (const u of f.attributesPassthrough)
      u.name === "staff-details" && (u.attrs.number !== void 0 && u.attrs.number !== i || (l = u.attrs["print-object"] === "no"));
    l && ((a ?? (a = new Array(r.measures.length).fill(!1)))[c] = !0);
  }), n == null || n.set(t, a), a;
}
function il(e) {
  let t = null;
  for (const n of e.notes) n.hidden && (t ?? (t = /* @__PURE__ */ new Set())).add(n.id);
  return t;
}
function rl(e, t) {
  let n = 0;
  for (const s of e) (s.noteId === void 0 || !t.has(s.noteId)) && (e[n++] = s);
  e.length = n;
}
function al(e, t) {
  let n = 0;
  for (const s of e) t.has(s.id) || (e[n++] = s);
  e.length = n;
}
function cl(e, t, n, s) {
  const { ss: o } = s, i = at.thickBarlineThickness * o, r = at.barlineSeparation * o;
  e.push({ kind: "rect", x: t, y: n, width: i, height: 4 * o });
  const a = t + i + r;
  return ta(e, a, s), a + X.repeatDot.advance * o + r;
}
function ta(e, t, n) {
  e.push({ kind: "glyph", glyph: "repeatDot", x: t, y: Et(n.lines.middleLine + 1, n) }), e.push({ kind: "glyph", glyph: "repeatDot", x: t, y: Et(n.lines.middleLine - 1, n) });
}
function Vn(e, t, n, s = 1) {
  const o = s === 1 ? {} : { fontSizePx: n.ss * vn * s };
  if (n.clef === "bass") {
    const a = Et(ht({ step: "F", octave: 3 }), n);
    return e.push({ kind: "glyph", glyph: "fClef", x: t, y: a, ...o }), t + (X.fClef.advance * s + rt.headerGap) * n.ss;
  }
  if (n.clef === "alto" || n.clef === "tenor") {
    const a = Et(ht({ step: "C", octave: 4 }), n);
    return e.push({ kind: "glyph", glyph: "cClef", x: t, y: a, ...o }), t + (X.cClef.advance * s + rt.headerGap) * n.ss;
  }
  const i = n.clef === "treble8" ? "gClef8vb" : "gClef", r = Et(ht({ step: "G", octave: 4 }), n);
  return e.push({ kind: "glyph", glyph: i, x: t, y: r, ...o }), t + (X[i].advance * s + rt.headerGap) * n.ss;
}
const Ts = 0.75, zi = 0.4;
function Ao(e, t, n, s, o) {
  let i = t;
  if (o !== void 0 && o !== n && (i = ll(e, i, o, n, s)), n === 0) return i;
  const r = n > 0 ? "sharp" : "flat", a = r === "sharp" ? "accidentalSharp" : "accidentalFlat", l = Io[r], f = Dr[s.clef][r];
  for (let c = 0; c < Math.min(Math.abs(n), 7); c++) {
    const u = l[c], h = f[c];
    if (u === void 0 || h === void 0) break;
    i = Sa(e, a, i, Et(ht({ step: u, octave: h }), s), s);
  }
  return i + rt.headerGap * s.ss;
}
function ll(e, t, n, s, o) {
  const i = n > 0 ? "sharp" : "flat", r = Io[i].slice(0, Math.min(Math.abs(n), 7)), a = Dr[o.clef][i], l = s > 0 ? "sharp" : "flat", f = s === 0 ? /* @__PURE__ */ new Set() : new Set(Io[l].slice(0, Math.min(Math.abs(s), 7)));
  let c = t;
  for (let u = 0; u < r.length; u++) {
    const h = r[u];
    if (l === i && f.has(h)) continue;
    const d = a[u];
    c = Sa(
      e,
      "accidentalNatural",
      c,
      Et(ht({ step: h, octave: d }), o),
      o
    );
  }
  return c > t ? c + rt.headerGap * o.ss : c;
}
function ti(e, t) {
  return e.beats === t.beats && e.beatType === t.beatType;
}
function ro(e, t, n) {
  var f;
  const s = t + 1;
  if (s >= (((f = e.staves[n]) == null ? void 0 : f.measures.length) ?? 0)) return null;
  const o = e.clefAt(s, n), i = e.keyFifthsAt(t, n), r = e.keyFifthsAt(s, n), a = e.timeAt(s, n), l = {
    ...o !== e.clefAtEnd(t, n) ? { clef: o } : {},
    ...r !== i ? { keyFifths: r, previousFifths: i } : {},
    ...ti(a, e.timeAt(t, n)) ? {} : { time: a }
  };
  return Object.keys(l).length > 0 ? l : null;
}
function fl(e, t) {
  return !e || !t ? !e == !t : e.clef === t.clef && e.keyFifths === t.keyFifths && e.previousFifths === t.previousFifths && (e.time === void 0 || t.time === void 0 ? e.time === t.time : ti(e.time, t.time));
}
function ea(e, t, n, s) {
  if (n.keyFifths === void 0 && n.time === void 0) return t;
  let o = t + rt.headerGap * s.ss;
  return n.keyFifths !== void 0 && (o = Ao(e, o, n.keyFifths, s, n.previousFifths)), n.time && (o = Co(e, o, n.time.beats, n.time.beatType, s)), o;
}
function hl(e, t, n) {
  let s = 0;
  for (let o = 0; o < e.staves.length; o++) {
    const i = ro(e, t, o);
    if (!i) continue;
    const r = e.clefAt(t + 1, o), a = { ...n, clef: r, lines: Ve[r] };
    s = Math.max(s, ea([], 0, i, a));
  }
  return s;
}
function Co(e, t, n, s, o) {
  const { ss: i, staffTopY: r } = o, a = Yi(n), l = Yi(s), f = (u) => u.reduce((h, d) => h + X[d].advance * i, 0), c = Math.max(f(a), f(l));
  for (const [u, h] of [
    [a, r + i],
    [l, r + 3 * i]
  ]) {
    let d = t + (c - f(u)) / 2;
    for (const g of u)
      e.push({ kind: "glyph", glyph: g, x: d, y: h }), d += X[g].advance * i;
  }
  return t + c + rt.headerGap * i;
}
function Yi(e) {
  return String(Math.max(0, Math.trunc(e))).split("").map((t) => Dc[Number(t)] ?? "timeSig0");
}
function Yn(e, t) {
  if (t)
    return e % 2 === 1 ? "up" : "down";
}
function na(e, t) {
  return t.staffTopY + (e.value === "whole" ? 1 : 2) * t.ss;
}
function sa(e) {
  var o, i;
  const t = e.passthrough.find((r) => r.name === "rest");
  if (!t) return null;
  const n = (o = t.children.find((r) => r.name === "display-step")) == null ? void 0 : o.text.trim(), s = Number((i = t.children.find((r) => r.name === "display-octave")) == null ? void 0 : i.text.trim());
  return n === void 0 || !"CDEFGAB".includes(n) || n.length !== 1 || !Number.isInteger(s) ? null : ht({ step: n, octave: s });
}
const ul = 2, dl = 0.25;
function pl(e, t, n) {
  const s = /* @__PURE__ */ new Map();
  for (const c of e.notes) {
    if (c.hidden) continue;
    const u = s.get(c.voice);
    u ? u.push(c) : s.set(c.voice, [c]);
  }
  const o = Jo(t), i = [...s.keys()].sort((c, u) => c - u), r = /* @__PURE__ */ new Set();
  let a = null;
  for (const c of i) {
    const u = s.get(c), h = u.length === 1 ? u[0] : null;
    !h || h.pitch !== null || !h.isMeasureRest && h.durationWholes < o - 1e-9 || (a === null ? a = c : (r.add(h.id), s.delete(c)));
  }
  const l = /* @__PURE__ */ new Set(), f = /* @__PURE__ */ new Map();
  for (const c of [...s.keys()].sort((u, h) => u - h))
    for (const u of s.get(c)) {
      if (u.pitch !== null || u.isGrace || sa(u) !== null) continue;
      const d = `${St(n.get(u.id) ?? 0)}:${u.value}:${u.dots}:${St(u.durationWholes)}`, g = f.get(d);
      g ? g.voice !== c && (r.add(u.id), l.add(g.id)) : f.set(d, u);
    }
  for (const [c, u] of s) {
    const h = u.filter((d) => !r.has(d.id));
    h.length === 0 ? s.delete(c) : s.set(c, h);
  }
  return { multiVoice: s.size > 1, visibleByVoice: s, folded: r, merged: l };
}
function ml(e, t, n, s) {
  const { visibleByVoice: o, multiVoice: i } = e, r = (h) => {
    const d = t.get(h.id) ?? 0;
    return [d, d + h.durationWholes];
  }, a = (h, d) => h[0] < d[1] - 1e-9 && d[0] < h[1] - 1e-9, l = [], f = (h) => {
    const d = h.filter((g) => g.pitch !== null && !g.isGrace).map((g) => ht(g.pitch));
    return d.length === 0 ? null : d.reduce((g, m) => g + m, 0) / d.length;
  }, c = (h) => {
    const d = f(o.get(h)), g = f([...o].flatMap(([b, y]) => b === h ? [] : y));
    if (d !== null && g !== null && d !== g) return d > g ? -1 : 1;
    const m = [...o.keys()].filter((b) => b !== h);
    return m.every((b) => b > h) ? -1 : m.every((b) => b < h) ? 1 : h % 2 === 1 ? -1 : 1;
  }, u = /* @__PURE__ */ new Map();
  for (const h of [...o.keys()].sort((d, g) => d - g))
    for (const d of o.get(h)) {
      if (d.pitch !== null || d.isGrace) continue;
      const g = r(d), m = n(g[0]), { ss: b } = m, y = io[d.value], x = sa(d);
      let S = x === null ? na(d, m) : Et(x, m);
      const w = e.merged.has(d.id) && ![...o].some(([B, D]) => B !== h && D.some((M) => a(r(M), g)));
      if (x === null && i && !w) {
        const B = c(h);
        S += B * ul * b;
        const D = dl * b, M = l.filter((C) => C.voice !== h && a(C.time, g));
        for (const [C, O] of o)
          if (C !== h) {
            for (const L of O) {
              if (L.pitch === null || L.isGrace || !a(r(L), g)) continue;
              const R = Et(ht(L.pitch), n(r(L)[0]));
              M.push({ top: R - b / 2, bottom: R + b / 2 });
            }
            M.push(...gl(O, g[0], t, n, s));
          }
        const I = () => {
          const C = ns(y, 0, S, b);
          return M.some((O) => C.y < O.bottom + D && O.top - D < C.y + C.height);
        };
        for (; I(); ) S += B * b;
      }
      u.set(d.id, S);
      const E = ns(y, 0, S, b);
      l.push({ voice: h, top: E.y, bottom: E.y + E.height, time: g });
    }
  return u;
}
function gl(e, t, n, s, o) {
  const i = St(t), r = (h) => Et(ht(h.pitch), s(n.get(h.id) ?? 0)), a = [], l = /* @__PURE__ */ new Map(), f = (h) => {
    let d = l.get(h);
    if (d === void 0) {
      const { ss: g } = s(n.get(h.notes[0].id) ?? 0), m = h.direction === "up", b = Math.max(...h.notes.map((E) => Ks[E.value] ?? 1)), y = (at.beamThickness + at.beamSpacing) * g, x = Pe * g + Math.max(0, b - 2) * y, S = new Set(h.notes.map((E) => St(n.get(E.id) ?? 0))), w = e.filter((E) => E.pitch !== null && !E.isGrace && S.has(St(n.get(E.id) ?? 0))).map(r);
      d = m ? Math.min(...w) - x : Math.max(...w) + x, l.set(h, d);
    }
    return d;
  };
  let c = null;
  for (const h of e) {
    if (h.chordWithPrevious || (c = h), h.pitch === null || h.isGrace || !Xs(h.value) || St(n.get(h.id) ?? 0) !== i) continue;
    const { ss: d } = s(t), g = c ? o.get(c.id) : void 0, m = r(h), b = g ? g.direction === "up" : Yn(h.voice, !0) === "up", y = g ? f(g) : m + (b ? -Pe : Pe) * d;
    a.push({ top: Math.min(m, y), bottom: Math.max(m, y) });
  }
  const u = new Set(e.flatMap((h) => o.get(h.id) ?? []));
  for (const h of u) {
    const d = St(n.get(h.notes[0].id) ?? 0), g = St(n.get(h.notes[h.notes.length - 1].id) ?? 0);
    if (d > i || g < i) continue;
    const { ss: m } = s(t), y = Math.max(...h.notes.map((S) => Ks[S.value] ?? 1)) * (at.beamThickness + at.beamSpacing) * m, x = f(h);
    a.push(h.direction === "up" ? { top: x, bottom: x + y } : { top: x - y, bottom: x });
  }
  return a;
}
function bl(e, t, n, s, o, i) {
  const { bBoxSW: r, bBoxNE: a } = X.restWhole;
  for (const l of n) {
    const f = e[l.opStart];
    if (!f || f.kind !== "glyph") continue;
    const c = f.x + (r[0] + a[0]) / 2 * i, u = (s + o) / 2 - c;
    for (let d = l.opStart; d < l.opEnd; d++) {
      const g = e[d];
      e[d] = g.kind === "curve" ? { ...g, x0: g.x0 + u, cx0: g.cx0 + u, cx1: g.cx1 + u, x1: g.x1 + u } : { ...g, x: g.x + u };
    }
    const h = t[l.noteIndex];
    h && (t[l.noteIndex] = { ...h, bounds: { ...h.bounds, x: h.bounds.x + u } });
  }
}
function yl(e, t, n, s, o, i, r, a, l, f, c, u) {
  var Nt;
  const { ss: h } = i, d = s[0], g = r !== null;
  if (d.pitch === null) {
    const Q = d, ot = io[Q.value], gt = c ?? na(Q, i);
    return e.push({ kind: "glyph", glyph: ot, x: n, y: gt, noteId: Q.id, role: "rest" }), ia(e, n + X[ot].advance * h, gt, !1, Q.dots, i, Q.id, "rest"), t.push({ id: Q.id, bounds: ns(ot, n, gt, h, 0.25) }), {
      heads: [],
      stem: null,
      inkRight: n + X[ot].bBoxNE[0] * h,
      collisionShift: 0
    };
  }
  const m = s.flatMap((Q) => Q.pitch ? [{ note: Q, pitch: Q.pitch, d: ht(Q.pitch) }] : []).sort((Q, ot) => Q.d - ot.d), b = m.map((Q) => Q.d), y = m[0], x = m[m.length - 1], S = xn[d.value], w = X[S].advance * h, E = Xs(d.value), B = g ? r === "up" : Gn(b, i.lines.middleLine, Yn(d.voice, f)) === "up", D = vl(b, B), M = D.some(Boolean), I = w - at.stemThickness * h, { accidentals: C, columns: O, widthSpaces: L } = oa(m, o, a), R = O.map(
    (Q) => Math.max(...Q.map((ot) => X[ot.glyph].advance * h))
  ), K = L * h, j = Xo(s), J = K + (j ? Ce.room * h : 0);
  let T = 0;
  if ((C.length > 0 || j) && l !== null) {
    const Q = rt.minAccidentalClearance * h - (n - J - l);
    Q > 0 && (T = Q);
  }
  const V = n + T, N = V + (M && !B ? I : 0), v = (Q) => D[Q] ? B ? N + I : N - I : N;
  let k = V - rt.accidentalGap * h;
  if (O.forEach((Q, ot) => {
    for (const gt of Q) {
      const Pt = k - X[gt.glyph].advance * h;
      e.push({ kind: "glyph", glyph: gt.glyph, x: Pt, y: Et(gt.d, i), noteId: gt.noteId });
    }
    k -= R[ot] + rt.accidentalColumnGap * h;
  }), j && !(u != null && u.drawn)) {
    const Q = V - J + Ce.width / 2 * h, ot = Math.max(x.d, (u == null ? void 0 : u.high) ?? x.d), gt = Math.min(y.d, (u == null ? void 0 : u.low) ?? y.d);
    xl(e, Q, Et(ot, i) - Ce.overshoot * h, Et(gt, i) + Ce.overshoot * h, h, d.id), u && (u.drawn = !0);
  }
  m.forEach((Q, ot) => {
    e.push({ kind: "glyph", glyph: S, x: v(ot), y: Et(Q.d, i), noteId: Q.note.id });
  }), El(
    e,
    m.map((Q, ot) => ({ d: Q.d, x: v(ot), noteId: Q.note.id })),
    w,
    i
  );
  const H = Math.max(...m.map((Q, ot) => v(ot))) + w;
  kl(e, H, b, d.dots, i, d.id);
  let q = null;
  if (E) {
    const Q = ts(S).anchors, ot = B ? Q.stemUpSE : Q.stemDownNW, gt = ra(S, N, B, h);
    if (ot && gt) {
      const Pt = B ? y : x, Wt = B ? x : y;
      q = {
        left: gt.left,
        attachY: Et(Pt.d, i) - ot[1] * h,
        nearY: Et(Wt.d, i)
      }, g || Bl(e, q, d.value, d.id, i, B);
    }
  }
  const et = E ? B : null, z = m.map((Q, ot) => {
    let gt;
    if (m.length > 1) {
      const Pt = (m.length - 1) / 2;
      gt = ot < Pt ? !0 : ot > Pt ? !1 : B;
    }
    return [
      Q.note.id,
      { noteX: v(ot), y: Et(Q.d, i), headGlyph: S, d: Q.d, up: et, tieBelow: gt }
    ];
  });
  for (const Q of s) {
    const ot = (Nt = z.find(([gt]) => gt === Q.id)) == null ? void 0 : Nt[1];
    ot && t.push({ id: Q.id, bounds: ns(S, ot.noteX, ot.y, h, 0.3) });
  }
  let Z = Math.max(...m.map((Q, ot) => v(ot) + X[S].bBoxNE[0] * h));
  return (x.d >= i.lines.topLine + 2 || y.d <= i.lines.bottomLine - 2) && (Z = Math.max(Z, H + at.legerLineExtension * h)), q && (Z = Math.max(Z, q.left + at.stemThickness * h)), {
    heads: z,
    stem: q,
    inkRight: Z,
    collisionShift: T
  };
}
const Ce = {
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
function xl(e, t, n, s, o, i) {
  const r = Ce.halfWave * o, a = Math.max(2, Math.ceil((s - n) / r)), l = (Ce.width - Ce.thickness) / 2 * (4 / 3) * o;
  for (let f = 0; f < a; f++) {
    const c = n + f * r, u = f % 2 === 0 ? 1 : -1;
    e.push({
      kind: "curve",
      x0: t,
      y0: c,
      cx0: t + u * l,
      cy0: c + r / 3,
      cx1: t + u * l,
      cy1: c + 2 * r / 3,
      x1: t,
      y1: c + r,
      thickness: Ce.thickness * o,
      noteId: i
    });
  }
}
function vl(e, t) {
  const n = e.map(() => !1);
  if (t)
    for (let s = 1; s < e.length; s++)
      e[s] - e[s - 1] === 1 && !n[s - 1] && (n[s] = !0);
  else
    for (let s = e.length - 2; s >= 0; s--)
      e[s + 1] - e[s] === 1 && !n[s + 1] && (n[s] = !0);
  return n;
}
function oa(e, t, n) {
  const s = [];
  for (const r of e) {
    if (r.note.hidden) continue;
    const a = n.get(r.pitch.step) ?? Er(t, r.pitch.step);
    r.pitch.alter !== a && s.push({
      d: r.d,
      glyph: Gr[String(wa(r.pitch.alter))],
      noteId: r.note.id
    });
  }
  for (const r of s) {
    const a = e.find((l) => l.note.id === r.noteId);
    n.set(a.pitch.step, a.pitch.alter);
  }
  const o = wl(s), i = o.length === 0 ? 0 : o.reduce((r, a) => r + Math.max(...a.map((l) => X[l.glyph].advance)), 0) + (o.length - 1) * rt.accidentalColumnGap + rt.accidentalGap;
  return { accidentals: s, columns: o, widthSpaces: i };
}
const Sl = 6;
function wl(e) {
  const t = [...e].sort((o, i) => i.d - o.d), n = [];
  for (let o = 0, i = t.length - 1; o <= i; o++, i--)
    n.push(t[o]), i !== o && n.push(t[i]);
  const s = [];
  for (const o of n) {
    const i = s.find(
      (r) => r.every((a) => Math.abs(a.d - o.d) >= Sl)
    );
    i ? i.push(o) : s.push([o]);
  }
  return s;
}
function Ml(e, t, n, s, o, i) {
  const r = X[t].advance * i;
  let a = 0;
  for (const l of [...s, ...o]) {
    if (Math.abs(l.d - e) !== 1) continue;
    const f = n - l.noteX;
    f < r && (a = Math.max(a, r - f));
  }
  return a;
}
function ia(e, t, n, s, o, i, r, a) {
  if (o === 0) return;
  const { ss: l } = i, f = n, c = X.augmentationDot.advance * l;
  let u = t + rt.dotGap * l;
  for (let h = 0; h < o; h++)
    e.push({ kind: "glyph", glyph: "augmentationDot", x: u, y: f, noteId: r, ...a ? { role: a } : {} }), u += c + rt.dotSpacing * l;
}
function kl(e, t, n, s, o, i) {
  if (s === 0) return;
  const r = /* @__PURE__ */ new Set();
  for (const a of [...n].sort((l, f) => f - l)) {
    const l = (a - o.lines.bottomLine) % 2 === 0;
    let f = l ? a + 1 : a;
    r.has(f) && l && (f = a - 1), !r.has(f) && (r.add(f), ia(e, t, Et(f, o), !1, s, o, i));
  }
}
function El(e, t, n, s) {
  const { ss: o } = s, i = at.legerLineExtension * o, r = at.legerLineThickness * o, a = (c, u, h) => {
    const d = Math.min(...u.map((m) => m.x)), g = Math.max(...u.map((m) => m.x)) + n;
    e.push({
      kind: "rect",
      x: d - i,
      y: Et(c, s) - r / 2,
      width: g - d + i * 2,
      height: r,
      noteId: h
    });
  }, l = t.reduce((c, u) => u.d > c.d ? u : c), f = t.reduce((c, u) => u.d < c.d ? u : c);
  for (let c = s.lines.topLine + 2; c <= l.d; c += 2)
    a(c, t.filter((u) => u.d >= c), l.noteId);
  for (let c = s.lines.bottomLine - 2; c >= f.d; c -= 2)
    a(c, t.filter((u) => u.d <= c), f.noteId);
}
function Bl(e, t, n, s, o, i) {
  const { ss: r } = o, a = at.stemThickness * r, l = t.nearY + (i ? -Pe * r : Pe * r);
  e.push({
    kind: "rect",
    x: t.left,
    y: Math.min(t.attachY, l),
    width: a,
    height: Math.abs(l - t.attachY),
    noteId: s
  });
  const f = es[n];
  if (!f) return;
  const c = i ? f.up : f.down, u = ts(c).anchors[i ? "stemUpNW" : "stemDownSW"];
  u && e.push({
    kind: "glyph",
    glyph: c,
    x: t.left - u[0] * r,
    y: l + u[1] * r,
    noteId: s
  });
}
const An = 0.65, yo = Pe, Tl = 0.3, Il = 0.55;
function Is(e, t) {
  return Yn(e, t) !== "down";
}
function Ui(e, t, n, s, o) {
  const i = An * o, r = (h) => h.value in es, a = [];
  let l = [];
  e.notes.forEach((h, d) => {
    if (r(h)) {
      l.push(d);
      return;
    }
    l.length >= 2 && a.push(l), l = [];
  }), l.length >= 2 && a.push(l);
  const f = new Set(a.flat()), c = [];
  let u = 0;
  return e.notes.forEach((h, d) => {
    const g = h.pitch, m = n.get(g.step) ?? Er(t, g.step), b = g.alter === m ? null : Gr[String(wa(g.alter))];
    d > 0 && (u += Tl * o), b && (u += (X[b].advance + rt.accidentalGap) * i);
    const y = xn[h.value];
    c.push({ note: h, d: ht(g), accidental: b, headX: u }), u += X[y].advance * i;
    const x = es[h.value];
    s && x && !f.has(d) && (u += Math.max(0, X[x.up].bBoxNE[0]) * i);
  }), { run: e, graces: c, beamGroups: a, widthPx: u + Il * o };
}
function ji(e, t, n, s, o, i, r) {
  const { ss: a } = r, l = An * a, f = { fontSizePx: a * vn * An }, c = at.stemThickness * l;
  let u = o;
  const h = [];
  for (const y of s.graces) {
    const { note: x, d: S } = y, w = xn[x.value], E = o + y.headX, B = Et(S, r), D = X[w].advance * l;
    if (y.accidental) {
      const O = E - (rt.accidentalGap + X[y.accidental].advance) * l;
      e.push({ kind: "glyph", glyph: y.accidental, x: O, y: B, noteId: x.id, ...f });
    }
    e.push({ kind: "glyph", glyph: w, x: E, y: B, noteId: x.id, ...f });
    const M = at.legerLineExtension * l, I = at.legerLineThickness * a, C = (O) => e.push({
      kind: "rect",
      x: E - M,
      y: Et(O, r) - I / 2,
      width: D + 2 * M,
      height: I,
      noteId: x.id
    });
    for (let O = r.lines.topLine + 2; O <= S; O += 2) C(O);
    for (let O = r.lines.bottomLine - 2; O >= S; O -= 2) C(O);
    if (u = Math.max(u, E + X[w].bBoxNE[0] * l), (S >= r.lines.topLine + 2 || S <= r.lines.bottomLine - 2) && (u = Math.max(u, E + D + M)), Xs(x.value)) {
      const O = ts(w).anchors[i ? "stemUpSE" : "stemDownNW"], L = ra(w, E, i, l);
      O && L && h.push({ left: L.left, attachY: B - O[1] * l, headY: B, note: x });
    }
    n.set(x.id, { noteX: E, y: B, headGlyph: w, d: S, up: Xs(x.value) ? i : null, scale: An }), t.push({ id: x.id, bounds: Nl(w, E, B, l, 0.3 * a) });
  }
  const d = (y) => h.find((x) => x.note === y), g = (y) => y + (i ? -yo * l : yo * l), m = (y, x) => {
    e.push({
      kind: "rect",
      x: y.left,
      y: Math.min(y.attachY, x),
      width: c,
      height: Math.abs(x - y.attachY),
      noteId: y.note.id
    }), u = Math.max(u, y.left + c);
  }, b = new Set(s.beamGroups.flat().map((y) => s.graces[y].note));
  for (const y of h) {
    if (b.has(y.note)) continue;
    const x = g(y.headY);
    m(y, x);
    const S = es[y.note.value];
    if (S) {
      const w = i ? S.up : S.down, E = ts(w).anchors[i ? "stemUpNW" : "stemDownSW"];
      if (E) {
        const B = y.left - E[0] * l;
        e.push({ kind: "glyph", glyph: w, x: B, y: x + E[1] * l, noteId: y.note.id, ...f }), u = Math.max(u, B + X[w].bBoxNE[0] * l);
      }
    }
    y.note.grace.slash && Hi(e, y.left + c / 2, x, i, y.note.id, r);
  }
  for (const y of s.beamGroups) {
    const x = y.flatMap((B) => {
      const D = d(s.graces[B].note);
      return D ? [D] : [];
    });
    if (x.length < 2) continue;
    const S = ei(
      x.map((B) => ({ x: B.left + c / 2, nearY: B.headY })),
      i,
      yo * l,
      a,
      An
    );
    for (const B of x)
      ca(e, B.left, B.attachY, c, S, B.note.id), u = Math.max(u, B.left + c);
    la(
      e,
      x.map((B) => B.left),
      x.map((B) => Ks[B.note.value] ?? 1),
      S,
      i,
      at.beamThickness * l,
      (at.beamThickness + at.beamSpacing) * l,
      c,
      0.9 * l,
      (B) => x[B].note.id
    );
    const w = x[0], E = w.left + c / 2;
    w.note.grace.slash && Hi(e, E, S(E), i, w.note.id, r);
  }
  return u;
}
function Hi(e, t, n, s, o, i) {
  const r = An * i.ss, a = s ? 1 : -1, l = n + a * 1.1 * r, f = 0.8 * r, c = -a * 0.65 * r;
  ao(
    e,
    t - f,
    l - c,
    t - f / 3,
    l - c / 3,
    t + f / 3,
    l + c / 3,
    t + f,
    l + c,
    at.stemThickness * i.ss,
    o
  );
}
function Nl(e, t, n, s, o) {
  const { bBoxSW: i, bBoxNE: r } = X[e];
  return {
    x: t + i[0] * s - o,
    y: n - r[1] * s - o,
    width: (r[0] - i[0]) * s + o * 2,
    height: (r[1] - i[1]) * s + o * 2
  };
}
function ra(e, t, n, s) {
  const o = ts(e).anchors[n ? "stemUpSE" : "stemDownNW"];
  if (!o) return null;
  const i = at.stemThickness * s, r = n ? t + o[0] * s - i : t + o[0] * s;
  return { left: r, right: r + i };
}
function Al(e) {
  const t = 1 / e.beatType;
  return e.beatType === 8 && e.beats % 3 === 0 && e.beats > 3 ? t * 3 : t;
}
function aa(e, t, n, s, o) {
  const i = Al(t), r = 1e-9, a = [];
  let l = [], f = -1, c = 0;
  const u = () => {
    l.length >= 2 && a.push(l), l = [];
  }, h = Xt(e), d = h.map(bc), g = d.some((m) => m !== null);
  return h.forEach((m, b) => {
    const y = m[0];
    if (!(y.pitch !== null && y.value in es && !((o == null ? void 0 : o.has(y.id)) ?? !1))) {
      u(), c += y.durationWholes;
      return;
    }
    if (g) {
      const w = d[b];
      w === "begin" && u(), (w === "begin" || w === "continue" || w === "end") && l.push(m), w !== "begin" && w !== "continue" && u(), c += y.durationWholes;
      return;
    }
    const S = Math.floor((c + r) / i);
    l.length > 0 && S !== f && u(), l.push(m), f = S, c += y.durationWholes;
  }), u(), typeof n == "function" ? a.map((m) => ({
    notes: m.map((b) => b[0]),
    direction: Gn(
      m.flat().flatMap((b) => b.pitch ? [ht(b.pitch) - n(b)] : []),
      0,
      s
    )
  })) : a.map((m) => ({
    notes: m.map((b) => b[0]),
    direction: Gn(
      m.flat().flatMap((b) => b.pitch ? [ht(b.pitch)] : []),
      n,
      s
    )
  }));
}
function Gn(e, t, n) {
  if (n) return n;
  if (e.length === 0) return "down";
  const s = (l) => l - t, o = Math.max(...e.map((l) => Math.abs(s(l)))), i = e.filter((l) => Math.abs(s(l)) === o), r = i.some((l) => s(l) < 0), a = i.some((l) => s(l) > 0);
  if (r && !a) return "up";
  if (a && !r) return "down";
  if (r && a) {
    const l = e.filter((c) => s(c) < 0).length, f = e.filter((c) => s(c) > 0).length;
    if (l > f) return "up";
    if (f > l) return "down";
  }
  return "down";
}
const Ns = { perStep: 0.25, maxTwo: 1, maxLong: 1.5, maxGradient: 0.3 };
function ei(e, t, n, s, o = 1) {
  const i = e[0], r = e[e.length - 1], a = r.x - i.x, l = (g) => t ? -g : g, f = Math.max(l(i.nearY), l(r.nearY)), c = e.slice(1, -1).some((g) => l(g.nearY) > f + 1e-6);
  let u = 0;
  if (a > 0 && !c && !Cl(e)) {
    const g = Math.round(Math.abs(r.nearY - i.nearY) / (s / 2)), m = e.length > 2 ? Ns.maxLong : Ns.maxTwo, b = Math.min(g * Ns.perStep, m) * s * o;
    u = Math.sign(r.nearY - i.nearY) * Math.min(b, Ns.maxGradient * a) / a;
  }
  const h = e.map((g) => g.nearY + (t ? -n : n) - u * (g.x - i.x)), d = t ? Math.min(...h) : Math.max(...h);
  return (g) => d + u * (g - i.x);
}
function Cl(e) {
  const t = e.length;
  for (let n = 1; n <= t / 2; n++)
    if (t % n === 0 && e.every((s, o) => o < n || Math.abs(s.nearY - e[o - n].nearY) < 1e-6))
      return !0;
  return !1;
}
function ca(e, t, n, s, o, i) {
  const r = o(t + s / 2);
  return e.push({ kind: "rect", x: t, y: Math.min(n, r), width: s, height: Math.abs(r - n), noteId: i }), r;
}
function la(e, t, n, s, o, i, r, a, l, f) {
  const c = Math.max(...n);
  for (let u = 1; u <= c; u++) {
    const h = o ? (u - 1) * r : -(u - 1) * r - i;
    let d = -1;
    for (let g = 0; g <= t.length; g++) {
      const m = g < t.length && n[g] >= u;
      if (m && d === -1 && (d = g), !m && d !== -1) {
        const b = g - 1;
        let y, x;
        d === b ? (y = b + 1 < t.length ? t[d] : t[d] - l, x = l + a) : (y = t[d], x = t[b] - y + a);
        const S = s(y) + h, w = s(y + x) - s(y), E = f == null ? void 0 : f(d);
        e.push({
          kind: "rect",
          x: y,
          y: S,
          width: x,
          height: i,
          ...w !== 0 ? { rise: w } : {},
          ...E !== void 0 ? { noteId: E } : {}
        }), d = -1;
      }
    }
  }
}
function Vi(e, t, n, s, o, i) {
  const { ss: r } = s, a = t.notes.flatMap((m) => {
    const b = n.get(m.id);
    return b ? [{ note: m, stem: b }] : [];
  });
  if (a.length < 2) return;
  const l = t.direction === "up", f = at.stemThickness * r, c = at.beamThickness * r, u = (at.beamThickness + at.beamSpacing) * r, h = a.map((m) => Ks[m.note.value] ?? 1), d = Pe * r + Math.max(0, Math.max(...h) - 2) * u, g = o !== void 0 ? () => o : ei(
    a.map((m) => ({ x: m.stem.left + f / 2, nearY: m.stem.nearY })),
    l,
    d,
    r
  );
  for (const { note: m, stem: b } of a) {
    const y = ca(e, b.left, b.attachY, f, g, m.id);
    i == null || i.set(m.id, y);
  }
  la(
    e,
    a.map((m) => m.stem.left),
    h,
    g,
    l,
    c,
    u,
    f,
    0.9 * r
  );
}
const Pl = {
  staccato: { above: "articStaccatoAbove", below: "articStaccatoBelow" },
  staccatissimo: { above: "articStaccatissimoAbove", below: "articStaccatissimoBelow" },
  tenuto: { above: "articTenutoAbove", below: "articTenutoBelow" },
  "detached-legato": { above: "articTenutoStaccatoAbove", below: "articTenutoStaccatoBelow" },
  accent: { above: "articAccentAbove", below: "articAccentBelow" },
  "strong-accent": { above: "articMarcatoAbove", below: "articMarcatoBelow" }
}, Ol = /* @__PURE__ */ new Set(["staccato", "tenuto"]), xo = 0.35, Fl = 0.25, Xi = 0.5;
function Wl(e, t, n, s, o, i) {
  const { chord: r, heads: a, stem: l, ctx: f } = t, { ss: c } = f, u = r[0], h = f.staffTopY, d = f.staffTopY + 4 * c;
  let g, m, b, y = null, x = f.lines.bottomLine, S = f.lines.topLine;
  if (a.length === 0) {
    if (!n) return;
    g = n.y, m = n.y + n.height, b = n.x + n.width / 2;
  } else {
    const R = a[0].headGlyph, { bBoxSW: K, bBoxNE: j } = X[R], J = a.map((v) => v.y);
    g = Math.min(...J) - j[1] * c, m = Math.max(...J) - K[1] * c, y = a[0].up;
    const T = a.map((v) => v.noteX);
    b = (y === !1 ? Math.max(...T) : Math.min(...T)) + (K[0] + j[0]) / 2 * c;
    const N = a.map((v) => v.d);
    x = Math.min(x, ...N), S = Math.max(S, ...N);
  }
  const w = l ? l.left + at.stemThickness * c / 2 : null;
  let E = y === !0 && s !== null ? Math.min(g, s) : g, B = y === !1 && s !== null ? Math.max(m, s) : m;
  const D = Yn(u.voice, i), M = D ? D === "up" ? "above" : "below" : y === !0 ? "below" : "above", I = (R) => f.lines.bottomLine + (d - R) / (c / 2), C = (R) => R >= x && R <= S && ((R - f.lines.bottomLine) % 2 + 2) % 2 === 0, O = (R) => (r.find(R) ?? u).id;
  for (const R of Ko(r)) {
    const K = R === "strong-accent" ? "above" : M, j = K === "above", J = j ? -1 : 1, T = Pl[R][K], { bBoxSW: V, bBoxNE: N } = X[T], v = (N[1] - V[1]) * c, k = j ? E : B;
    let H;
    if (Ol.has(R)) {
      const z = I(k + J * (Fl * c + v / 2));
      let Z = j ? Math.ceil(z - 1e-6) : Math.floor(z + 1e-6);
      C(Z) && (Z += j ? 1 : -1), H = Et(Z, f);
    } else {
      let z = k + J * xo * c;
      const Z = z + J * v;
      Math.max(z, Z) > h && Math.min(z, Z) < d && (z = j ? Math.min(z, h - xo * c) : Math.max(z, d + xo * c)), H = z + J * v / 2;
    }
    const et = w !== null && (j ? y === !0 : y === !1) ? w : b;
    e.push({
      kind: "glyph",
      glyph: T,
      x: et - (V[0] + N[0]) / 2 * c,
      y: H + (V[1] + N[1]) / 2 * c,
      noteId: O((z) => z.articulations.includes(R))
    }), j ? E = Math.min(E, H - v / 2) : B = Math.max(B, H + v / 2);
  }
  const L = qo(r);
  if (L !== null) {
    const R = L === "upright", K = R ? "fermataAbove" : "fermataBelow", { bBoxSW: j, bBoxNE: J } = X[K];
    let T = R ? Math.min(h, E) : Math.max(d, B);
    for (const v of o)
      b < Math.min(v.x0, v.x1) || b > Math.max(v.x0, v.x1) || (T = R ? Math.min(T, v.y0, v.cy0, v.cy1, v.y1) : Math.max(T, v.y0, v.cy0, v.cy1, v.y1));
    const V = b - (j[0] + J[0]) / 2 * c, N = R ? T - Xi * c + j[1] * c : T + Xi * c + J[1] * c;
    e.push({ kind: "glyph", glyph: K, x: V, y: N, noteId: O((v) => v.fermata !== null) });
  }
}
const vo = { clearance: 0.5, hook: 0.6, numberGap: 0.3 };
function Rl(e) {
  const t = [];
  for (const n of e.passthrough)
    if (n.name === "notations")
      for (const s of n.children)
        s.name !== "tuplet" || s.attrs.type !== "start" && s.attrs.type !== "stop" || t.push({ type: s.attrs.type, number: s.attrs.number ?? "1", element: s });
  return t;
}
function Ki(e, t) {
  var i;
  const n = e.children.find((r) => r.name === t), s = (i = n == null ? void 0 : n.children.find((r) => r.name === "tuplet-number")) == null ? void 0 : i.text.trim(), o = s ? Number.parseInt(s, 10) : Number.NaN;
  return Number.isFinite(o) && o > 0 ? o : null;
}
function Ll(e) {
  const t = e.map((o) => o.flatMap(Rl));
  if (!t.some((o) => o.length > 0)) return $l(e);
  const n = [], s = /* @__PURE__ */ new Map();
  return t.forEach((o, i) => {
    var r;
    for (const a of o) a.type === "start" && !s.has(a.number) && s.set(a.number, { start: i, element: a.element });
    for (const a of o) {
      if (a.type !== "stop") continue;
      const l = s.get(a.number);
      if (!l) continue;
      s.delete(a.number);
      const f = e.slice(l.start, i + 1), c = ((r = f.find((b) => b[0].tuplet !== null)) == null ? void 0 : r[0].tuplet) ?? null, u = l.element, h = Ki(u, "tuplet-actual") ?? (c == null ? void 0 : c.actualNotes), d = Ki(u, "tuplet-normal") ?? (c == null ? void 0 : c.normalNotes);
      if (h === void 0 || d === void 0) continue;
      const g = u.attrs["show-number"], m = u.attrs.placement;
      n.push({
        events: f,
        actual: h,
        normal: d,
        bracket: u.attrs.bracket === "yes" ? !0 : u.attrs.bracket === "no" ? !1 : null,
        showNumber: g === "both" || g === "none" ? g : "actual",
        placement: m === "above" || m === "below" ? m : null
      });
    }
  }), n;
}
function $l(e) {
  var i, r;
  const t = [];
  let n = [], s = 0, o = Number.POSITIVE_INFINITY;
  for (const a of e) {
    const l = a[0], f = l.tuplet, c = (r = (i = n[0]) == null ? void 0 : i[0]) == null ? void 0 : r.tuplet;
    if ((f === null || c && (c.actualNotes !== f.actualNotes || c.normalNotes !== f.normalNotes)) && (n = [], s = 0, o = Number.POSITIVE_INFINITY, f === null))
      continue;
    n.push(a), s += vc(l.value, l.dots), o = Math.min(o, In[l.value]);
    const u = s / f.actualNotes;
    Object.values(In).some((d) => Math.abs(d - u) < 1e-9) && u >= o - 1e-9 && (t.push({ events: n, actual: f.actualNotes, normal: f.normalNotes, bracket: null, showNumber: "actual", placement: null }), n = [], s = 0, o = Number.POSITIVE_INFINITY);
  }
  return t;
}
function _l(e, t, n) {
  const s = [];
  for (const o of t.values()) s.push(...Ll(o));
  if (s.length !== 0) {
    s.sort((o, i) => o.events.length - i.events.length);
    for (const o of s) Dl(e, o, n);
  }
}
function Dl(e, t, n) {
  const { ss: s, placements: o, hidden: i } = n, r = t.events.filter((N) => N.some((v) => !i.has(v.id)));
  if (r.length === 0 || t.showNumber === "none" && t.bracket === !1) return;
  const a = /* @__PURE__ */ new Map();
  for (const N of e) {
    if (N.noteId === void 0 || N.kind === "curve" || N.kind === "text") continue;
    const v = Zs(N, s), k = a.get(N.noteId);
    a.set(N.noteId, k ? qi(k, v) : v);
  }
  const l = r.flatMap((N) => {
    let v = null, k = Number.POSITIVE_INFINITY, H = Number.NEGATIVE_INFINITY, q = null;
    for (const et of N) {
      if (i.has(et.id)) continue;
      const z = a.get(et.id);
      z && (v = v ? qi(v, z) : z);
      const Z = o.get(et.id);
      if (Z) {
        const { bBoxSW: Nt, bBoxNE: Q } = X[Z.headGlyph];
        k = Math.min(k, Z.noteX + Nt[0] * s), H = Math.max(H, Z.noteX + Q[0] * s), q ?? (q = Z.up);
      }
    }
    return v ? (k > H && (k = v.x, H = v.x + v.width), [{ anchor: N[0], ink: v, left: k, right: H, up: q }]) : [];
  });
  if (l.length === 0) return;
  const f = l.map((N) => N.anchor), c = n.beamGroupOfNote.get(f[0].id), u = c !== void 0 && f.every((N) => n.beamGroupOfNote.get(N.id) === c) && c.notes.every((N) => t.events.some((v) => v[0] === N)), h = t.bracket ?? !u, d = Yn(f[0].voice, n.multiVoice), m = (t.placement ?? (d ? d === "up" ? "above" : "below" : l.some((N) => N.up === !0) || !l.some((N) => N.up === !1) ? "above" : "below")) === "above", b = m ? -1 : 1, y = Math.min(...l.map((N) => N.left)), x = Math.max(...l.map((N) => N.right)), S = vo.clearance * s;
  let w = 0;
  const E = n.stemTips.get(f[0].id), B = n.stemTips.get(f[f.length - 1].id), D = (l[0].left + l[0].right) / 2, M = (l[l.length - 1].left + l[l.length - 1].right) / 2;
  if (u && c.direction === "up" === m && E !== void 0 && B !== void 0 && M > D)
    w = (B - E) / (M - D);
  else if (l.length > 1) {
    const N = l.map((k) => ({
      x: (k.left + k.right) / 2,
      nearY: m ? k.ink.y : k.ink.y + k.ink.height
    })), v = ei(N, m, 0, s);
    w = v(1) - v(0) || 0;
  }
  let C = m ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  const O = (N, v) => v + w * (N - y), L = (N, v) => {
    const k = v + b * S - w * (N - y);
    C = m ? Math.min(C, k) : Math.max(C, k);
  };
  for (let N = n.lineCount; N < e.length; N++) {
    const v = e[N];
    if (v.kind === "curve" || v.kind === "text" || n.barlineOps.has(v)) continue;
    const k = Zs(v, s), H = Math.max(y, k.x), q = Math.min(x, k.x + k.width);
    if (!(H > q))
      for (const et of [H, q])
        if (v.kind === "rect" && v.rise) {
          const z = v.y + v.rise * (et - v.x) / v.width;
          L(et, m ? z : z + v.height);
        } else
          L(et, m ? k.y : k.y + k.height);
  }
  if (!Number.isFinite(C)) return;
  const R = at.tupletBracketThickness * s, K = t.showNumber === "none" ? [] : Gl(t.actual, t.showNumber === "both" ? t.normal : null), j = K.reduce((N, v) => N + X[v].advance * s, 0), J = (X.tuplet0.bBoxNE[1] - X.tuplet0.bBoxSW[1]) / 2 * s, T = (y + x) / 2, V = C + b * (h ? Math.max(vo.hook * s, J) : J);
  if (h) {
    const N = K.length > 0 ? j / 2 + vo.numberGap * s : 0, v = (k, H) => {
      if (H - k <= 0) return;
      const q = w * (H - k);
      e.push({ kind: "rect", x: k, y: O(k, V) - R / 2, width: H - k, height: R, ...q !== 0 ? { rise: q } : {} });
    };
    N === 0 ? v(y, x) : (v(y, T - N), v(T + N, x));
    for (const k of [y, x - R]) {
      const H = O(k, V), q = O(k, C);
      e.push({ kind: "rect", x: k, y: Math.min(H, q), width: R, height: Math.abs(q - H) });
    }
  }
  if (K.length > 0) {
    const N = O(T, V), { bBoxSW: v, bBoxNE: k } = X.tuplet0, H = N + (v[1] + k[1]) / 2 * s;
    let q = T - j / 2;
    for (const et of K)
      e.push({ kind: "glyph", glyph: et, x: q, y: H }), q += X[et].advance * s;
  }
}
function Gl(e, t) {
  const n = (s) => [...String(s)].map((o) => `tuplet${o}`);
  return t === null ? n(e) : [...n(e), "tupletColon", ...n(t)];
}
function qi(e, t) {
  const n = Math.min(e.x, t.x), s = Math.min(e.y, t.y);
  return { x: n, y: s, width: Math.max(e.x + e.width, t.x + t.width) - n, height: Math.max(e.y + e.height, t.y + t.height) - s };
}
function Ji(e, t) {
  return e.tieBelow ?? e.up ?? Gn([e.d], t) === "up";
}
function ao(e, t, n, s, o, i, r, a, l, f, c) {
  e.push({ kind: "curve", x0: t, y0: n, cx0: s, cy0: o, cx1: i, cy1: r, x1: a, y1: l, thickness: f, noteId: c });
}
function So(e, t, n, s, o, i, r, a) {
  const { ss: l } = a, f = i ? 1 : -1, c = _c * l;
  ao(
    e,
    t,
    n,
    t + (s - t) * 0.25,
    n + f * c,
    t + (s - t) * 0.75,
    o + f * c,
    s,
    o,
    at.tieMidpointThickness * l,
    r
  );
}
function zl(e, t, n) {
  const s = e.notesInOrder(n), o = s.findIndex((r) => r.id === t.startNoteId), i = s.findIndex((r) => r.id === t.endNoteId);
  return s.slice(o, i + 1);
}
function Yl(e, t, n) {
  const s = e.flatMap((r) => r.pitch ? [ht(r.pitch)] : []), o = t ? Math.min(n.lines.bottomLine, ...s) : Math.max(n.lines.topLine, ...s), i = Et(o, n);
  return t ? i + $i * n.ss : i - $i * n.ss;
}
function Ul(e, t, n, s, o, i, r, a) {
  const { ss: l } = a;
  ao(
    e,
    t,
    n,
    t + (s - t) * 0.25,
    i,
    t + (s - t) * 0.75,
    i,
    s,
    o,
    at.slurMidpointThickness * l,
    r
  );
}
const jl = {
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
}, se = {
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
  /** A hairpin whose drawn length would come out shorter than this is not
   *  drawn (OMR's zero-length hairpins, a start and stop at one onset). */
  minLength: 1
};
function Cs(e, t, n) {
  const { stop: s, start: o } = t;
  if (s.onset === 0 && s.measureIndex > o.measureIndex && n[s.measureIndex] !== n[s.measureIndex - 1]) {
    const i = e.staves[t.staffIndex].measures[s.measureIndex - 1];
    return { measureIndex: s.measureIndex - 1, onset: Vs(i) };
  }
  return s;
}
function Qe(e, t) {
  return e ?? (t.lyrics ? "above" : "below");
}
function ni(e, t) {
  const { ss: n } = t;
  let s = null, o = null;
  return fa(e, t, (i, r) => {
    const a = i.inkExtent ?? { top: t.staffTopY, bottom: t.staffTopY + 4 * n };
    r === "below" ? s = Math.max(s ?? a.bottom, a.bottom) : o = Math.min(o ?? a.top, a.top);
  }), {
    below: s === null ? null : s + (se.clearance + se.ascent) * n,
    above: o === null ? null : o - (se.clearance + se.descent) * n
  };
}
function fa(e, t, n) {
  var a, l;
  const { staffIndex: s } = t, o = ((a = t.measures[0]) == null ? void 0 : a.index) ?? 0, i = ((l = t.measures[t.measures.length - 1]) == null ? void 0 : l.index) ?? -1, r = e.staves[s];
  for (const f of t.measures)
    for (const c of r.measures[f.index].dynamics) n(f, Qe(c.placement, t));
  for (const f of e.wedges) {
    if (f.staffIndex !== s) continue;
    const c = Cs(e, f, t.systemOf);
    if (!(c.measureIndex < o || f.start.measureIndex > i))
      for (const u of t.measures)
        u.index >= f.start.measureIndex && u.index <= c.measureIndex && n(u, Qe(f.placement, t));
  }
}
function Qs(e, t, n, s, o) {
  const i = e.staves[t].measures[n.index], r = so(i.notes), a = new Map(n.notes.map((x) => [x.id, x.bounds])), l = /* @__PURE__ */ new Map();
  for (const x of i.notes) {
    const S = a.get(x.id), w = r.get(x.id);
    if (!S || w === void 0) continue;
    const E = St(w), B = S.x + S.width / 2;
    l.set(E, Math.min(l.get(E) ?? B, B));
  }
  const f = [...l].sort((x, S) => x[0] - S[0]), c = St(s), u = l.get(c);
  if (u !== void 0) return { x: u, atNote: !0 };
  const h = n.region.x + n.region.width, d = { key: St(Math.max(Vs(i), s)), x: h - o };
  if (f.length === 0) return { x: n.region.x + n.region.width * Math.min(1, s / (d.key || 1)), atNote: !1 };
  let g, m;
  for (const x of f)
    x[0] < c ? g = x : m || (m = x);
  if (!g) return { x: f[0][1], atNote: !1 };
  const b = m ?? [d.key, d.x], y = b[0] === g[0] ? 1 : (c - g[0]) / (b[0] - g[0]);
  return { x: g[1] + (b[1] - g[1]) * y, atNote: !1 };
}
function Qi(e, t, n, s, o) {
  const i = jl[s.kind], { bBoxSW: r, bBoxNE: a } = X[i], l = (a[0] - r[0]) * o, f = Qs(e, t, n, s.onset, o).x, c = n.region.x + 0.2 * o, u = n.region.x + n.region.width - 0.2 * o - l, h = Math.max(c, Math.min(u, f - l / 2));
  return { glyph: i, x: h - r[0] * o, left: h, right: h + l };
}
function Hl(e, t, n, s) {
  const { ss: o, staffIndex: i } = t, r = [], a = e.staves[i], l = (m) => t.measures.find((b) => b.index === m), f = (m) => n[m] ?? t.staffTopY + (m === "below" ? 6.4 : -2.4) * o;
  for (const m of a.measures[s.index].dynamics) {
    const b = Qi(e, i, s, m, o);
    r.push({ kind: "glyph", glyph: b.glyph, x: b.x, y: f(Qe(m.placement, t)) });
  }
  const c = t.systemOf[s.index], u = t.measures[0], h = t.measures[t.measures.length - 1], d = (m) => {
    const b = Cs(e, m, t.systemOf), y = Qe(m.placement, t), x = (D, M) => {
      const I = l(D), C = I ? a.measures[D].dynamics.find((O) => Qe(O.placement, t) === y && Math.abs(O.onset - M) < 1e-9) : void 0;
      return I && C ? Qi(e, i, I, C, o) : void 0;
    };
    let S;
    const w = t.systemOf[m.start.measureIndex] === c ? l(m.start.measureIndex) : void 0;
    if (w) {
      const D = x(m.start.measureIndex, m.start.onset);
      S = D ? D.right + se.dynamicGap * o : Qs(e, i, w, m.start.onset, o).x - 0.6 * o;
    } else
      S = Math.min(...u.notes.map((D) => D.bounds.x), u.region.x + u.region.width) - 0.5 * o;
    let E;
    const B = t.systemOf[b.measureIndex] === c ? l(b.measureIndex) : void 0;
    if (B) {
      const D = Qs(e, i, B, b.onset, o);
      E = D.atNote ? D.x - (0.6 + se.noteGap) * o : D.x;
      const M = Vs(a.measures[b.measureIndex]), I = x(b.measureIndex, b.onset) ?? (b.onset >= M - 1e-9 && t.systemOf[b.measureIndex + 1] === c ? x(b.measureIndex + 1, 0) : void 0);
      I && (E = Math.min(E, I.left - se.dynamicGap * o));
    } else
      E = h.region.x + h.region.width - o;
    return { x0: S, x1: E };
  }, g = (m, b) => {
    const y = Cs(e, m, t.systemOf), x = b.start;
    return y.measureIndex === x.measureIndex ? Math.abs(y.onset - x.onset) < 1e-9 : y.measureIndex + 1 === x.measureIndex && x.onset === 0 && y.onset >= Vs(a.measures[y.measureIndex]) - 1e-9;
  };
  for (const m of e.wedges) {
    if (m.staffIndex !== i || m.start.measureIndex > s.index) continue;
    const b = Cs(e, m, t.systemOf);
    if (b.measureIndex < s.index) continue;
    const y = Qe(m.placement, t), { x1: x } = d(m);
    let { x0: S } = d(m);
    if (t.systemOf[m.start.measureIndex] === c)
      for (const T of e.wedges)
        T === m || T.staffIndex !== i || Qe(T.placement, t) !== y || g(T, m) && (S = Math.max(S, d(T).x1 + se.hairpinGap * o));
    if (x - S < se.minLength * o) continue;
    const w = t.systemOf[m.start.measureIndex], E = t.systemOf[b.measureIndex] - w + 1, B = c - w, D = se.hairpinOpening * o, M = (T) => (m.kind === "crescendo" ? T : 1 - T) * D, I = M(B / E), C = M((B + 1) / E), O = Math.max(S, s.region.x), L = Math.min(x, s.region.x + s.region.width);
    if (L <= O) continue;
    const R = (T) => I + (C - I) * (T - S) / (x - S), K = f(y) - se.hairpinCentre * o, j = R(O) / 2, J = R(L) / 2;
    Zi(r, O, K - j, L, K - J, o), Zi(r, O, K + j, L, K + J, o);
  }
  return r;
}
function Zi(e, t, n, s, o, i) {
  ao(
    e,
    t,
    n,
    t + (s - t) / 3,
    n + (o - n) / 3,
    t + (s - t) * 2 / 3,
    n + (o - n) * 2 / 3,
    s,
    o,
    at.hairpinThickness * i,
    void 0
  );
}
function Vl(e, t, n, s) {
  const o = e.staves[t];
  for (let i = n; i <= s; i++)
    if (o.measures[i].dynamics.length > 0 || ua(e, t, i).length > 0) return !0;
  return e.wedges.some((i) => i.staffIndex === t && i.start.measureIndex <= s && i.stop.measureIndex >= n);
}
function tr(e, t) {
  return e.length !== t.length ? !1 : e.every((n, s) => {
    const o = t[s];
    if (n.kind !== o.kind) return !1;
    const i = n, r = o;
    return Object.keys(i).every(
      (a) => typeof i[a] == "number" ? Math.abs(i[a] - r[a]) <= 1e-3 : i[a] === r[a]
    );
  });
}
function On(e, t, n, s) {
  if (t.length === 0) return e;
  const o = [...e.ops, ...t], i = Ze(t, e.region.x, e.region.width, n, s), r = e.gapExtent ?? { top: n, bottom: n + 4 * s };
  return {
    ...e,
    ops: o,
    region: Ze(o, e.region.x, e.region.width, n, s),
    gapExtent: {
      top: Math.min(r.top, i.y + me),
      bottom: Math.max(r.bottom, i.y + i.height - me)
    }
  };
}
function Po(e, t) {
  var c, u;
  const n = ((c = t.measures[0]) == null ? void 0 : c.index) ?? 0, s = ((u = t.measures[t.measures.length - 1]) == null ? void 0 : u.index) ?? -1;
  if (!Vl(e, t.staffIndex, n, s)) return null;
  const o = ni(e, t), i = new Map(t.measures.map((h) => [h.index, Hl(e, t, o, h)])), r = ql(e, t, i), a = /* @__PURE__ */ new Map(), l = t.staffTopY + 4 * t.ss;
  let f = null;
  for (const h of t.measures) {
    const d = [...i.get(h.index), ...r.ops.get(h.index) ?? []];
    a.set(h.index, d);
    for (const g of d) {
      const m = Zs(g, t.ss);
      m.y >= l && (f = Math.max(f ?? m.y + m.height, m.y + m.height));
    }
  }
  return { baselines: o, ops: a, belowBottom: f, aboveTop: r.aboveTop };
}
function Xl(e, t) {
  return t ? e.measures.map((n) => On(n, t.ops.get(n.index) ?? [], e.staffTopY, e.ss)) : [...e.measures];
}
const ve = {
  /** Words and a tempo's text, staff spaces (a little under the lyrics'). */
  fontSpaces: 1.7,
  /** Above / below its baseline, as fractions of the font size. */
  ascent: 0.75,
  descent: 0.25,
  /** Blank between a text and the ink it clears, staff spaces. */
  clearance: 0.5,
  /** A metronome mark's note glyph, as a fraction of the music font. */
  metronomeScale: 0.6
}, ha = {
  breve: "metNoteDoubleWhole",
  whole: "metNoteWhole",
  half: "metNoteHalfUp",
  quarter: "metNoteQuarterUp",
  eighth: "metNote8thUp",
  "16th": "metNote16thUp"
};
function Zs(e, t) {
  if (e.kind === "rect") {
    const i = e.rise ?? 0;
    return { x: e.x, y: e.y + Math.min(0, i), width: e.width, height: e.height + Math.abs(i) };
  }
  if (e.kind === "curve") {
    const i = [e.x0, e.cx0, e.cx1, e.x1], r = [e.y0, e.cy0, e.cy1, e.y1], a = Math.min(...i), l = Math.min(...r);
    return { x: a, y: l, width: Math.max(...i) - a, height: Math.max(...r) - l };
  }
  if (e.kind === "text") {
    const i = to(e.text, e.fontSizePx, e.fontStyle);
    return { x: e.align === "center" ? e.x - i / 2 : e.align === "right" ? e.x - i : e.x, y: e.y - e.fontSizePx, width: i, height: 1.3 * e.fontSizePx };
  }
  const n = e.fontSizePx !== void 0 ? e.fontSizePx / (vn * t) : 1, { bBoxSW: s, bBoxNE: o } = X[e.glyph];
  return {
    x: e.x + s[0] * t * n,
    y: e.y - o[1] * t * n,
    width: (o[0] - s[0]) * t * n,
    height: (o[1] - s[1]) * t * n
  };
}
function to(e, t, n) {
  const s = ba(e) / bt.fontSpaces * t;
  return n != null && n.includes("bold") ? s * 1.1 : s;
}
function Kl(e) {
  const t = ha[e.beatUnit] ? "" : ` ${e.beatUnit}`, n = /^\d+(\.\d*)?$/.test(e.perMinute) ? String(Math.round(Number(e.perMinute) * 10) / 10) : e.perMinute;
  return `${t} = ${n}`;
}
function wo(e) {
  const t = e.metronomes.map((n) => `${n.beatUnit}.${n.dots}=${n.perMinute}`).join(",");
  return `${e.onset}|${e.text ?? ""}|${t}`;
}
function ua(e, t, n) {
  const s = gi(e.staves[t].measures[n]);
  if (e.staves.length === 1) return s;
  const o = /* @__PURE__ */ new Map();
  for (const l of e.staves) {
    const f = l.measures[n];
    if (!f) continue;
    const c = /* @__PURE__ */ new Set();
    for (const u of gi(f)) {
      if (!u.tempo) continue;
      const h = wo(u);
      if (c.has(h)) continue;
      c.add(h);
      const d = o.get(h);
      d ? d.count++ : o.set(h, { count: 1, first: u });
    }
  }
  const i = (l) => {
    var f;
    return l.tempo && (((f = o.get(wo(l))) == null ? void 0 : f.count) ?? 0) > 1;
  };
  if (t !== 0) return s.some(i) ? s.filter((l) => !i(l)) : s;
  const r = new Set(s.filter((l) => l.tempo).map(wo)), a = [...o].filter(([l, f]) => f.count > 1 && !r.has(l)).map(([, l]) => l.first);
  return a.length === 0 ? s : [...s, ...a].sort((l, f) => l.onset - f.onset);
}
function ql(e, t, n) {
  var m, b;
  const { ss: s, staffIndex: o } = t, i = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), a = t.measures[0].region.x, l = t.measures[t.measures.length - 1], f = l.region.x + l.region.width, c = ve.fontSpaces * s, u = t.measures.flatMap((y) => (n.get(y.index) ?? []).map((x) => Zs(x, s))), h = [], d = t.staffTopY, g = t.staffTopY + 4 * s;
  for (const y of t.measures)
    for (const x of ua(e, o, y.index)) {
      const S = x.placement ?? "above", w = [x.italic ? "italic" : "", x.bold ? "bold" : ""].filter(Boolean).join(" ") || void 0, E = x.text ?? "", B = ve.metronomeScale * vn * s, D = 0.6 * s, M = x.metronomes.map((v) => {
        const k = ha[v.beatUnit], H = Kl(v), q = k ? X[k].advance * ve.metronomeScale * s : 0;
        return { glyph: k, glyphWidth: q, text: H, width: q + to(H, c) };
      }), I = E ? to(E, c, w) : 0, C = [...E ? [I] : [], ...M.map((v) => v.width)], O = C.reduce((v, k) => v + k, 0) + D * Math.max(0, C.length - 1), L = Qs(e, o, y, x.onset, s).x - 0.6 * s, R = Math.max(a + 0.2 * s, Math.min(L, f - 0.2 * s - O)), K = R + O, j = (v) => v.x < K + 0.3 * s && v.x + v.width > R - 0.3 * s;
      let J;
      if (S === "above") {
        let v = d;
        for (const k of t.measures) j(k.region) && (v = Math.min(v, ((m = k.inkExtent) == null ? void 0 : m.top) ?? d));
        for (const k of u) k.y + k.height <= d + 2 * s && j(k) && (v = Math.min(v, k.y));
        for (const k of h) k.side === S && k.right > R && k.left < K && (v = Math.min(v, k.top));
        J = v - ve.clearance * s - ve.descent * c;
      } else {
        let v = g;
        for (const k of t.measures) j(k.region) && (v = Math.max(v, ((b = k.inkExtent) == null ? void 0 : b.bottom) ?? g));
        for (const k of u) k.y >= g - 2 * s && j(k) && (v = Math.max(v, k.y + k.height));
        for (const k of h) k.side === S && k.right > R && k.left < K && (v = Math.max(v, k.bottom));
        J = v + ve.clearance * s + ve.ascent * c;
      }
      const T = J - ve.ascent * c;
      h.push({ side: S, left: R, right: K, top: T, bottom: J + ve.descent * c });
      const V = [];
      let N = R;
      E && (V.push({ kind: "text", text: E, x: N, y: J, fontSizePx: c, ...w ? { fontStyle: w } : {} }), N += I + D);
      for (const v of M)
        v.glyph && V.push({ kind: "glyph", glyph: v.glyph, x: N, y: J, fontSizePx: B, role: "text" }), V.push({ kind: "text", text: v.text, x: N + v.glyphWidth, y: J, fontSizePx: c }), N += v.width + D;
      for (const v of t.measures) {
        const k = v.region.x, H = v.region.x + v.region.width;
        if (H <= R || k >= K + 0.5 * s) continue;
        const q = i.get(v.index) ?? [];
        for (const et of V)
          et.kind === "text" ? q.push({ ...et, clip: { x: k, width: H - k } }) : et.kind === "glyph" && et.x >= k && et.x < H && q.push(et);
        i.set(v.index, q), S === "above" && r.set(v.index, Math.min(r.get(v.index) ?? T, T));
      }
    }
  return { ops: i, aboveTop: r };
}
const ne = {
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
  systemStartLeadIn: 1
};
function da(e) {
  return e.endings().map(({ first: t, last: n, start: s, end: o }) => ({
    first: t,
    last: n,
    label: s.text ?? `${s.numbers.join(", ")}.`,
    hooked: o.kind === "stop"
  }));
}
function Jl(e) {
  return Math.max(ne.hookLength * e, ne.labelBaseline * e + 0.3 * ne.labelFontSpaces * e);
}
function pa(e, t, n, s, o) {
  var f;
  const { ss: i } = t, r = (c) => s.some((u) => c >= u.first && c <= u.last), a = /* @__PURE__ */ new Set();
  fa(e, t, (c, u) => {
    u === "above" && a.add(c.index);
  });
  let l = null;
  for (const c of t.measures) {
    if (!r(c.index)) continue;
    let u = ((f = c.inkExtent) == null ? void 0 : f.top) ?? t.staffTopY;
    a.has(c.index) && n.above !== null && (u = Math.min(u, n.above - se.ascent * i));
    const h = o == null ? void 0 : o.get(c.index);
    h !== void 0 && (u = Math.min(u, h)), l = Math.min(l ?? u, u);
  }
  return l === null ? null : l - ne.clearance * i - Jl(i);
}
function ma(e, t, n, s) {
  const { ss: o } = e, i = [], r = e.measures[0], a = e.measures[e.measures.length - 1], l = at.thinBarlineThickness * o, f = (c) => c.region.x + c.region.width;
  for (const c of t) {
    if (s.index < c.first || s.index > c.last) continue;
    const u = c.first >= r.index, h = c.last <= a.index, d = e.measures.find((S) => S.index === Math.max(c.first, r.index)), g = d === r ? Math.min(...r.notes.map((S) => S.bounds.x), f(r)) - (u ? ne.systemStartLeadIn : 0.5) * o : d.region.x + ne.barlineInset * o, m = e.measures.find((S) => S.index === Math.min(c.last, a.index)), b = h ? f(m) - ne.barlineInset * o : f(m), y = Math.max(g, s.region.x), x = Math.min(b, f(s));
    x <= y || (i.push({ kind: "rect", x: y, y: n - l / 2, width: x - y, height: l }), u && s.index === c.first && (i.push({ kind: "rect", x: g, y: n - l / 2, width: l, height: ne.hookLength * o }), i.push({
      kind: "text",
      text: c.label,
      x: g + ne.labelInset * o,
      y: n + ne.labelBaseline * o,
      fontSizePx: ne.labelFontSpaces * o
    })), h && c.hooked && s.index === c.last && i.push({ kind: "rect", x: b - l, y: n - l / 2, width: l, height: ne.hookLength * o }));
  }
  return i;
}
function ga(e, t, n) {
  return e.some((s) => s.first <= n && s.last >= t);
}
const bt = {
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
   *  below-placed dynamic under it) and the next staff's highest ink (M9
   *  Slice 7; see `staffDistancePx`), so the text reads with its own staff. */
  nextStaffClearance: 2
};
function Ql(e) {
  return /[ijl.,;:'!|’ ]/.test(e) ? 0.25 : /[ftrI\-()]/.test(e) ? 0.33 : /[mwMW]/.test(e) ? 0.85 : /[A-Z]/.test(e) ? 0.68 : 0.55;
}
function ba(e) {
  let t = 0;
  for (const n of e) t += Ql(n);
  return t * bt.fontSpaces;
}
function Zl(e) {
  return e.syllabic === "middle" || e.syllabic === "end" ? bt.hyphenGap / 2 : bt.edgeMargin;
}
function tf(e) {
  return Qo(e) ? bt.hyphenGap / 2 : bt.edgeMargin;
}
function si(e, t, n, s) {
  const o = ba(Tr(e)) * s;
  if (Br(e)) return { left: t, right: t + o, x: t, align: "left" };
  const i = t + n / 2;
  return { left: i - o / 2, right: i + o / 2, x: i, align: "center" };
}
function oi(e, t, n) {
  const s = (t.pitch === null ? 0.25 : 0.3) * n;
  return { left: e.x + s, width: e.width - 2 * s };
}
function eo(e) {
  return xc(e.some((t) => t.hidden) ? e.filter((t) => !t.hidden) : e);
}
function ii(e) {
  return !e.hidden && e.lyrics.length > 0;
}
function ef(e) {
  const t = [];
  let n;
  for (const s of Xt(e)) {
    const o = eo(s);
    if (o.length === 0) continue;
    n ?? (n = so(e));
    const i = s[0], r = X[i.pitch === null ? io[i.value] : xn[i.value]].advance;
    for (const a of o) {
      if (a.text === "") continue;
      const l = si(a, 0, r, 1);
      t.push({ onset: St(n.get(i.id)), verse: a.verse, lyric: a, left: l.left, right: l.right });
    }
  }
  return t;
}
function ri(e, t) {
  return ie ? (ie.lyrics.has(t) || ie.lyrics.set(t, er(e, t)), ie.lyrics.get(t)) : er(e, t);
}
function er(e, t) {
  const n = [];
  for (const l of e.staves) {
    const f = l.measures[t];
    if (!f || !f.notes.some((u) => ii(u))) continue;
    const c = ef(f.notes);
    c.length > 0 && n.push({ columns: oo(e, f, l.index).columns, items: c });
  }
  if (n.length === 0) return null;
  const s = [...new Set(n.flatMap((l) => l.columns.map((f) => St(f.onset))))].sort((l, f) => l - f), o = new Map(s.map((l) => [l, 0])), i = (l, f) => {
    let c = 0;
    for (const u of l) {
      if (St(u.onset) >= f) break;
      c += u.width;
    }
    for (const u of s) {
      if (u >= f) break;
      c += o.get(u);
    }
    return c;
  }, r = (l, f, c) => {
    const u = [];
    for (let d = 0; d < s.length; d++) {
      const g = s[d];
      g < l || g >= f || u.push([g, Math.min(s[d + 1] ?? f, f) - g]);
    }
    const h = u.reduce((d, [, g]) => d + g, 0);
    for (const [d, g] of u) o.set(d, o.get(d) + (h > 0 ? c * g / h : c / u.length));
  };
  let a = 0;
  for (const { columns: l, items: f } of n) {
    const c = /* @__PURE__ */ new Map();
    for (const u of f) {
      const h = c.get(u.verse);
      h ? h.some((d) => d.onset === u.onset) || h.push(u) : c.set(u.verse, [u]);
    }
    for (const u of c.values()) {
      u.sort((d, g) => d.onset - g.onset);
      const h = u[0];
      a = Math.max(a, Zl(h.lyric) - h.left - rt.measureLeadIn - i(l, h.onset));
      for (let d = 1; d < u.length; d++) {
        const g = u[d - 1], m = u[d], b = Qo(g.lyric) ? bt.hyphenGap : bt.wordGap, y = i(l, m.onset) + m.left - (i(l, g.onset) + g.right);
        b - y > 1e-9 && r(g.onset, m.onset, b - y);
      }
    }
  }
  for (const [l, f] of o) f <= 0 && o.delete(l);
  return { extras: o, lead: Math.max(0, a) };
}
function ya(e, t) {
  const n = e.staves[t];
  if (!n.measures.some((a) => a.notes.some((l) => ii(l)))) return null;
  const s = /* @__PURE__ */ new Map(), o = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map();
  for (const a of n.measures)
    for (const l of Xt(a.notes)) {
      const f = l[0].voice;
      let c = s.get(f);
      c || s.set(f, c = []), c.push({ measureIndex: a.index, event: l });
      for (const u of eo(l)) {
        const h = { measureIndex: a.index, event: l, lyric: u, voice: f, at: c.length - 1 }, d = `${f}\0${u.verse}`, g = o.get(d);
        g ? g.push(h) : o.set(d, [h]);
        const m = i.get(a.index);
        m ? m.push(h) : i.set(a.index, [h]);
      }
    }
  const r = [];
  for (const a of o.values()) {
    const l = a.filter((f) => f.lyric.text !== "");
    l.forEach((f, c) => {
      const u = l[c + 1];
      if (u && Qo(f.lyric) && r.push({ kind: "hyphen", start: f, endMeasure: u.measureIndex, endEvent: u.event, endSlot: u }), !Br(f.lyric)) return;
      const h = s.get(f.voice);
      let d = h[f.at];
      for (let g = f.at + 1; g < h.length; g++) {
        const m = h[g];
        if (m.event[0].pitch === null) break;
        const b = eo(m.event).find((y) => y.verse === f.lyric.verse);
        if (b && b.text !== "" || (d = m, (b == null ? void 0 : b.extend) === "stop")) break;
      }
      r.push({ kind: "extender", start: f, endMeasure: d.measureIndex, endEvent: d.event, endSlot: null });
    });
  }
  return { slotsByMeasure: i, connectors: r };
}
function xa(e, t, n) {
  if (!e) return Oo;
  const s = /* @__PURE__ */ new Set();
  for (let o = t; o <= n; o++) for (const i of e.slotsByMeasure.get(o) ?? []) s.add(i.lyric.verse);
  for (const o of e.connectors)
    o.start.measureIndex < t && o.endMeasure >= t && s.add(o.start.lyric.verse);
  return s.size === 0 ? Oo : [...s].sort(yc);
}
const Oo = Object.freeze([]);
function va(e, t = null) {
  var i;
  const { ss: n } = e, s = e.staffTopY + 4 * n;
  let o = s + bt.firstBaseline * n;
  for (const r of e.measures) {
    const a = e.index.slotsByMeasure.get(r.index);
    if (!a || !a.some((f) => f.lyric.text !== "")) continue;
    const l = ((i = r.inkExtent) == null ? void 0 : i.bottom) ?? s;
    o = Math.max(o, l + (bt.inkClearance + bt.ascent) * n);
  }
  return t !== null && (o = Math.max(o, t + (bt.inkClearance + bt.ascent) * n)), o;
}
function nf(e, t) {
  return t + ((e.verses.length - 1) * bt.lineSpacing + bt.descent) * e.ss;
}
function Ps(e, t) {
  var u;
  const n = e.measures.find((h) => h.index === t.measureIndex), s = t.event[0], o = (u = n == null ? void 0 : n.notes.find((h) => h.id === s.id)) == null ? void 0 : u.bounds;
  if (!n || !o) return null;
  const { ss: i } = e, r = oi(o, s, i), a = si(t.lyric, r.left, r.width, i), l = n.region.x + bt.edgeMargin / 2 * i, f = n.region.x + n.region.width - bt.edgeMargin / 2 * i, c = a.left < l ? l - a.left : a.right > f ? Math.max(l - a.left, f - a.right) : 0;
  return { left: a.left + c, right: a.right + c, x: a.x + c, align: a.align };
}
function sf(e, t, n) {
  var a;
  const s = e.measures.find((l) => l.index === t), o = n[0], i = (a = s == null ? void 0 : s.notes.find((l) => l.id === o.id)) == null ? void 0 : a.bounds;
  if (!i) return null;
  const r = oi(i, o, e.ss);
  return r.left + r.width;
}
function of(e, t) {
  var g, m;
  const { ss: n, systemOf: s } = e, o = e.measures[0], i = e.measures[e.measures.length - 1], r = s[o.index], a = s[t.start.measureIndex], l = s[t.endMeasure];
  if (a > r || l < r) return null;
  const f = Math.min(o.region.x + o.region.width, ...o.notes.map((b) => b.bounds.x)), c = i.region.x + i.region.width - 0.5 * n;
  if (t.kind === "hyphen") {
    const b = a === r ? (g = Ps(e, t.start)) == null ? void 0 : g.right : void 0, y = l === r && t.endSlot ? (m = Ps(e, t.endSlot)) == null ? void 0 : m.left : void 0;
    return b !== void 0 && y !== void 0 ? { x0: b, x1: y } : b !== void 0 ? { x0: b, x1: c } : y !== void 0 && a < r ? { x0: Math.max(o.region.x + 0.5 * n, y - bt.breakHyphenRoom * n), x1: y } : null;
  }
  const u = a === r ? Ps(e, t.start) : null, h = u ? u.right + bt.extenderGap * n : f, d = l === r ? sf(e, t.endMeasure, t.endEvent) ?? c : c;
  return { x0: h, x1: d };
}
function Os(e, t, n) {
  const { ss: s } = e, o = [], i = bt.fontSpaces * s, r = (f) => t + Math.max(0, e.verses.indexOf(f)) * bt.lineSpacing * s, a = n.region.x, l = n.region.x + n.region.width;
  for (const f of e.index.slotsByMeasure.get(n.index) ?? []) {
    if (f.lyric.text === "") continue;
    const c = Ps(e, f);
    c && o.push({ kind: "text", text: Tr(f.lyric), x: c.x, y: r(f.lyric.verse), fontSizePx: i, align: c.align });
  }
  for (const f of e.index.connectors) {
    if (f.start.measureIndex > n.index || f.endMeasure < n.index) continue;
    const c = of(e, f);
    if (!c) continue;
    const u = r(f.start.lyric.verse);
    if (f.kind === "extender") {
      if (c.x1 - c.x0 < bt.extenderMin * s) continue;
      const b = Math.max(c.x0, a), y = Math.min(c.x1, l);
      if (y <= b) continue;
      const x = bt.extenderThickness * s;
      o.push({ kind: "rect", x: b, y: u - x, width: y - b, height: x, role: "text" });
      continue;
    }
    const h = c.x1 - c.x0;
    if (h < bt.hyphenMinGap * s) continue;
    const d = bt.hyphenWidth * s, g = bt.hyphenThickness * s, m = Math.max(1, Math.floor(h / (bt.hyphenSpacing * s)));
    for (let b = 0; b < m; b++) {
      const y = c.x0 + h * (b + 0.5) / m;
      if (y < a || y >= l) continue;
      const x = Math.max(a + 0.1 * s, Math.min(l - 0.1 * s - d, y - d / 2));
      o.push({ kind: "rect", x, y: u - bt.hyphenRise * s - g / 2, width: d, height: g, role: "text" });
    }
  }
  return o;
}
function rf(e, t = null) {
  const n = va(e, t);
  return {
    measures: e.measures.map((s) => On(s, Os(e, n, s), e.staffTopY, e.ss)),
    baseline: n,
    bottom: nf(e, n)
  };
}
function af(e, t, n) {
  let s = Number.NEGATIVE_INFINITY;
  if (!e.notes.some((i) => ii(i))) return s;
  const o = new Map(t.map((i) => [i.id, i.bounds]));
  for (const i of Xt(e.notes)) {
    const r = eo(i), a = r.length > 0 ? o.get(i[0].id) : void 0;
    if (!a) continue;
    const l = oi(a, i[0], n);
    for (const f of r)
      f.text !== "" && (s = Math.max(s, si(f, l.left, l.width, n).right + tf(f) * n));
  }
  return s;
}
function Sa(e, t, n, s, o) {
  return e.push({ kind: "glyph", glyph: t, x: n, y: s }), n + X[t].advance * o.ss;
}
function Et(e, t) {
  return t.staffTopY + 4 * t.ss - (e - t.lines.bottomLine) * (t.ss / 2);
}
function wa(e) {
  return e > 0 ? 1 : e < 0 ? -1 : 0;
}
function ns(e, t, n, s, o = 0) {
  const { bBoxSW: i, bBoxNE: r } = X[e];
  return {
    x: t + i[0] * s - o * s,
    y: n - r[1] * s - o * s,
    width: (r[0] - i[0]) * s + o * 2 * s,
    height: (r[1] - i[1]) * s + o * 2 * s
  };
}
function Ze(e, t, n, s, o) {
  let i = s, r = s + 4 * o;
  for (const a of e)
    if (a.kind === "rect") {
      const l = a.rise ?? 0;
      i = Math.min(i, a.y + Math.min(0, l)), r = Math.max(r, a.y + a.height + Math.max(0, l));
    } else if (a.kind === "curve")
      i = Math.min(i, a.y0, a.cy0, a.cy1, a.y1), r = Math.max(r, a.y0, a.cy0, a.cy1, a.y1);
    else if (a.kind === "text")
      i = Math.min(i, a.y - a.fontSizePx), r = Math.max(r, a.y + 0.3 * a.fontSizePx);
    else {
      const l = a.fontSizePx !== void 0 ? a.fontSizePx / (vn * o) : 1, { bBoxSW: f, bBoxNE: c } = X[a.glyph];
      i = Math.min(i, a.y - c[1] * o * l), r = Math.max(r, a.y - f[1] * o * l);
    }
  return { x: t, y: i - me, width: n, height: r - i + me * 2 };
}
function Ma(e, t) {
  return e.map(
    (n) => n.kind === "curve" ? { ...n, y0: n.y0 + t, cy0: n.cy0 + t, cy1: n.cy1 + t, y1: n.y1 + t } : { ...n, y: n.y + t }
  );
}
function nr(e, t) {
  return {
    index: e.index,
    staffIndex: e.staffIndex,
    region: { ...e.region, y: e.region.y + t },
    ops: Ma(e.ops, t),
    notes: e.notes.map((n) => ({
      id: n.id,
      bounds: { ...n.bounds, y: n.bounds.y + t }
    })),
    ...e.inkExtent ? { inkExtent: { top: e.inkExtent.top + t, bottom: e.inkExtent.bottom + t } } : {},
    ...e.gapExtent ? { gapExtent: { top: e.gapExtent.top + t, bottom: e.gapExtent.bottom + t } } : {},
    ...e.courtesy ? { courtesy: e.courtesy } : {}
  };
}
function Fo(e, t, n) {
  return t >= e.x && t <= e.x + e.width && n >= e.y && n <= e.y + e.height;
}
function cf(e, t, n) {
  for (const s of e.measures)
    if (Fo(s.region, t, n)) {
      for (const o of s.notes)
        if (Fo(o.bounds, t, n))
          return { noteId: o.id, measureIndex: s.index, staffIndex: s.staffIndex };
    }
  return null;
}
function Vu(e, t, n) {
  for (const s of e.measures)
    if (Fo(s.region, t, n))
      return { staffIndex: s.staffIndex, measureIndex: s.index };
  return null;
}
function lf(e, t) {
  const n = e.measures.find((s) => s.notes.some((o) => o.id === t));
  return n ? n.region : null;
}
const ff = 0.6;
function hf(e, t, n) {
  if (!Number.isInteger(n) || n < 0) return null;
  const s = e.measures.filter((f) => f.staffIndex === t).length;
  if (s === 0 || n > s) return null;
  const o = n === s, i = e.measures.find(
    (f) => f.staffIndex === t && f.index === (o ? s - 1 : n)
  );
  if (!i) return null;
  const { region: r } = i, a = ff * e.staffSpacePx;
  return { x: o ? r.x + r.width - a : r.x - a / 2, y: r.y, width: a, height: r.height };
}
const Xu = [
  "breathMarkComma",
  "breathMarkTick",
  "breathMarkSalzedo",
  "caesura",
  "caesuraShort"
], qe = {
  /** Blank between a mark and the ink (or staff line) it clears. */
  clearance: 0.5,
  /** Smaller blank kept above a high note's ink a mark is raised over. */
  noteClearance: 0.25,
  /** Text size. */
  fontSpaces: 1.8,
  /** How far a caesura's foot reaches below the top line. */
  caesuraDip: 1,
  /** Room a barline takes at the end of a measure. */
  barline: 0.2
}, uf = /* @__PURE__ */ new Set(["caesura", "caesuraShort"]);
function df(e, t) {
  const n = [];
  for (const s of t) {
    const o = pf(e, s);
    o && n.push(o);
  }
  return n;
}
function pf(e, t) {
  const n = e.staffSpacePx, s = t.anchor;
  let o, i = null;
  if ("noteId" in s ? (i = s.noteId, o = e.measures.find((M) => M.notes.some((I) => I.id === i))) : o = e.measures.find((M) => M.staffIndex === s.staffIndex && M.index === s.measureIndex), !o) return null;
  const r = t.glyph !== void 0 && Object.hasOwn(X, t.glyph) ? t.glyph : null;
  if (r === null && !t.text) return null;
  const a = qe.fontSpaces * n, l = r ? (X[r].bBoxNE[0] - X[r].bBoxSW[0]) * n : gf(t.text, a), f = r ? (X[r].bBoxNE[1] - X[r].bBoxSW[1]) * n : 1.3 * a, c = t.placement ?? "after", u = o.region.x, h = o.region.x + o.region.width, d = mf(e, o);
  let g;
  if (i !== null) {
    const M = o.notes.find((I) => I.id === i);
    g = c === "after" ? sr(o, i, n) : M.bounds.x + M.bounds.width / 2;
  } else {
    const M = "position" in s ? s.position : void 0, I = [...o.notes].sort((C, O) => C.bounds.x - O.bounds.x);
    M === "start" ? g = I.length > 0 ? I[0].bounds.x + I[0].bounds.width / 2 : u + n : M === "end" ? g = I.length > 0 ? sr(o, I[I.length - 1].id, n) : h - n : g = u + o.region.width / 2;
  }
  const m = u + l / 2 + 0.1 * n, b = h - l / 2 - 0.1 * n;
  g = m > b ? u + o.region.width / 2 : Math.min(b, Math.max(m, g));
  const y = g - l / 2, x = g + l / 2, S = o.gapExtent ?? o.inkExtent ?? { top: d, bottom: d + 4 * n };
  let w;
  if (c === "below")
    w = Math.max(S.bottom, d + 4 * n) + qe.clearance * n;
  else if (c === "above")
    w = Math.min(S.top, d) - qe.clearance * n - f;
  else {
    let M = r && uf.has(r) ? d + qe.caesuraDip * n : d - qe.clearance * n;
    for (const I of ka(o, n))
      I.right <= y || I.left >= x || I.top >= d - 0.01 || (M = Math.min(M, I.top - qe.noteClearance * n));
    w = M - f;
  }
  let E;
  if (r) {
    const { bBoxSW: M, bBoxNE: I } = X[r];
    E = { kind: "glyph", glyph: r, x: y - M[0] * n, y: w + I[1] * n };
  } else
    E = {
      kind: "text",
      text: t.text,
      x: g,
      y: w + a,
      fontSizePx: a,
      align: "center",
      fontStyle: "italic",
      clip: { x: u, width: o.region.width }
    };
  const B = r ? Math.max(u, y - 1) : u, D = r ? Math.min(h, x + 1) : h;
  return {
    id: t.id,
    staffIndex: o.staffIndex,
    measureIndex: o.index,
    ops: [E],
    bounds: { x: B, y: w - 1, width: D - B, height: f + 2 },
    ...t.color !== void 0 ? { color: t.color } : {}
  };
}
function mf(e, t) {
  const n = e.systems.find(
    (s) => s.staffIndex === t.staffIndex && s.measureIndices.includes(t.index)
  );
  return (n == null ? void 0 : n.topY) ?? e.staffTopY;
}
function ka(e, t) {
  const n = [];
  for (const s of e.ops)
    if (s.kind === "glyph") {
      const o = s.fontSizePx !== void 0 ? s.fontSizePx / (4 * t) : 1, { bBoxSW: i, bBoxNE: r } = X[s.glyph];
      n.push({
        left: s.x + i[0] * t * o,
        right: s.x + r[0] * t * o,
        top: s.y - r[1] * t * o,
        ...s.noteId !== void 0 ? { noteId: s.noteId } : {}
      });
    } else s.kind === "rect" && n.push({ left: s.x, right: s.x + s.width, top: s.y + Math.min(0, s.rise ?? 0) });
  return n;
}
function sr(e, t, n) {
  const s = ka(e, n), o = (h, d) => Math.min(d.x, ...s.filter((g) => g.noteId === h).map((g) => g.left)), i = (h, d) => Math.max(d.x + d.width, ...s.filter((g) => g.noteId === h).map((g) => g.right)), r = e.notes.find((h) => h.id === t), a = [...e.notes].sort((h, d) => h.bounds.x - d.bounds.x);
  let l = i(r.id, r.bounds);
  const f = 0.25 * n;
  let c = null;
  for (const h of a)
    if (!(h.id === r.id || h.bounds.x < r.bounds.x - f)) {
      if (h.bounds.x < l + f) {
        l = Math.max(l, i(h.id, h.bounds));
        continue;
      }
      c = o(h.id, h.bounds);
      break;
    }
  const u = c ?? e.region.x + e.region.width - qe.barline * n;
  return (l + Math.max(l, u)) / 2;
}
function gf(e, t) {
  return 0.55 * t * e.length;
}
const or = new URL(
  "./Bravura.woff2",
  import.meta.url
);
async function ir(e = or, t = Rr) {
  if (typeof FontFace > "u" || typeof document > "u")
    throw new Error(
      "loadSmuflFont needs a browser document. In Node, register the font with the rasterizer directly (node-canvas: registerFont with an OTF copy of Bravura)."
    );
  try {
    await rr(t, e);
  } catch (n) {
    if (e !== or) throw n;
    const { default: s } = await import("./Bravura-inline.js");
    await rr(t, s);
  }
  return t;
}
async function rr(e, t) {
  const n = new FontFace(e, `url(${JSON.stringify(String(t))})`);
  await n.load(), document.fonts.add(n);
}
const bf = Object.freeze({
  foreground: "#111111",
  background: "#ffffff",
  text: null,
  rest: null,
  selection: "#c2410c",
  playbackCursor: "#0369a1",
  measureRange: "rgba(37, 99, 235, 0.12)",
  seamMarker: "rgba(220, 38, 38, 0.45)",
  markup: "#3f6893"
});
var Bt, he, rs, Lt, pt, _e, Wn, sn, Rn, on, De, we, rn, an, cn, ue, nt, Wo, Fs, Ws, Rs, Ls, Ro, Ea, Lo, Ba, Ta, $s, _s, $o, $e;
class yf {
  constructor(t, n, s = {}) {
    U(this, nt);
    U(this, Bt);
    U(this, he);
    U(this, rs);
    U(this, Lt);
    U(this, pt);
    U(this, _e, null);
    /** The note ids currently under the playback cursor (M4 Slice 2), e.g. every
     *  note of a chord/multi-voice onset sounding at once. Empty, not `null`,
     *  when nothing is highlighted, since `setPlaybackCursor` always takes an
     *  array (possibly empty) rather than a nullable single id like
     *  `setSelection` does: a cursor is inherently a set, a selection is not. */
    U(this, Wn, /* @__PURE__ */ new Set());
    /** The current measure range (M5 Slice 4), always stored normalized
     *  (`from <= to`), or `null` when no range is active. */
    U(this, sn, null);
    /** The host's seam marker list (M5 Slice 6), exactly as last handed to
     *  `setSeamMarkers`. Kept alongside `#seamStrips` so a `setLayout` can
     *  re-resolve the same boundaries against the new geometry. */
    U(this, Rn, []);
    /** `#seamMarkers` resolved to strips against the current layout, with
     *  boundaries that do not exist in it dropped. Cached rather than resolved
     *  per paint so a region-scoped redraw stays a cheap rect intersection per
     *  marker, not a measure search per marker. */
    U(this, on, []);
    /** The visible window (M6 Slice 11), in layout coordinates, or `null` to
     *  treat the whole layout as visible. See `setViewport`. */
    U(this, De, null);
    /** Per-staff ink colours (M8 Slice 3), keyed by `staffIndex`. A staff
     *  absent from the map paints in the score colours (`#colors`). */
    U(this, we, /* @__PURE__ */ new Map());
    /** Per-note ink colours (M9), keyed by `NoteId`. Kept as given across
     *  `setLayout`: an id the layout no longer has simply has no ops to
     *  paint. */
    U(this, rn, /* @__PURE__ */ new Map());
    /** Each measure's area as last painted (its region plus its marks'
     *  bounds), keyed `staffIndex:index`. A region is sized to its ink, so
     *  after an edit that shrinks it (a note leaving the ledger lines) the old
     *  ink lies partly outside the new one, and a removed mark lies wholly
     *  outside it; a scoped redraw clears the union of both. */
    U(this, an, /* @__PURE__ */ new Map());
    /** The host's markup list (M9), exactly as last handed to `setMarkup`. */
    U(this, cn, []);
    /** `#markup` resolved against the current layout, grouped by owning
     *  measure (`staffIndex:index`). */
    U(this, ue, /* @__PURE__ */ new Map());
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
    vt(this, "lastRedrawnMeasures", []);
    /** Regions cleared and repainted by the most recent draw call. */
    vt(this, "lastRedrawnRegions", []);
    F(this, Bt, t), F(this, pt, n), F(this, he, s.fontFamily ?? Rr), F(this, rs, s.labelFontFamily ?? "sans-serif"), F(this, Lt, ar(bf, s));
  }
  get layout() {
    return p(this, pt);
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
    F(this, pt, t), F(this, on, A(this, nt, Ro).call(this)), F(this, ue, A(this, nt, Wo).call(this));
  }
  get markup() {
    return p(this, cn);
  }
  /**
   * Replace the markup layer (M9): the host's personal marks (breath marks,
   * caesuras, short text) drawn over the score. `[]` clears it. See
   * `Markup` and `layoutMarkup` for anchoring and placement.
   *
   * Marks are render state, like the selection: never part of the model,
   * never exported, never undone by `EditHistory`. They are positioned in
   * layout units and every `setLayout` re-resolves the list, so they follow
   * a zoom, a recast or an edit without the host calling this again; a
   * mark whose note was deleted simply stops drawing. They never change
   * spacing.
   *
   * Like `setSelection`, this does not paint: it returns the `(staffIndex,
   * index)` pairs of the measures whose marks changed, for the caller to
   * redraw. Each mark belongs to one measure, and a scoped redraw clears
   * the area the measure's marks last covered as well as its region, so a
   * removed or moved mark leaves no pixels behind.
   */
  setMarkup(t) {
    const n = p(this, ue);
    F(this, cn, [...t]);
    const s = A(this, nt, Wo).call(this);
    F(this, ue, s);
    const o = [];
    for (const i of p(this, pt).measures) {
      const r = `${i.staffIndex}:${i.index}`;
      JSON.stringify(n.get(r) ?? []) !== JSON.stringify(s.get(r) ?? []) && o.push({ staffIndex: i.staffIndex, index: i.index });
    }
    return o;
  }
  /** The id of the mark painted at layout point `(x, y)`, topmost first, or
   *  `null`. */
  markupAt(t, n) {
    let s = null;
    for (const o of p(this, ue).values())
      for (const i of o) {
        const r = i.bounds;
        t >= r.x && t <= r.x + r.width && n >= r.y && n <= r.y + r.height && (s = i.id);
      }
    return s;
  }
  /** The area mark `id` covers, in layout coordinates, or `null` when it is
   *  not drawn (unknown id, or its anchor is not in the layout). */
  markupBounds(t) {
    for (const n of p(this, ue).values()) {
      const s = n.find((o) => o.id === t);
      if (s) return s.bounds;
    }
    return null;
  }
  get selectedNoteId() {
    return p(this, _e);
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
    if (t === p(this, _e)) return [];
    const n = /* @__PURE__ */ new Map();
    for (const s of [p(this, _e), t]) {
      if (s === null) continue;
      const o = p(this, pt).measures.find((i) => i.notes.some((r) => r.id === s));
      o && n.set(`${o.staffIndex}:${o.index}`, {
        staffIndex: o.staffIndex,
        index: o.index
      });
    }
    return F(this, _e, t), [...n.values()];
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
    for (const o of [...p(this, Wn), ...n]) {
      const i = p(this, pt).measures.find((r) => r.notes.some((a) => a.id === o));
      i && s.set(`${i.staffIndex}:${i.index}`, {
        staffIndex: i.staffIndex,
        index: i.index
      });
    }
    return F(this, Wn, n), [...s.values()];
  }
  get measureRange() {
    return p(this, sn);
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
    }, s = (a) => {
      const l = /* @__PURE__ */ new Set();
      if (a === null) return l;
      for (const f of p(this, pt).measures)
        f.staffIndex === a.staffIndex && f.index >= a.from && f.index <= a.to && l.add(`${f.staffIndex}:${f.index}`);
      return l;
    }, o = s(p(this, sn)), i = s(n);
    F(this, sn, n);
    const r = [];
    for (const a of p(this, pt).measures) {
      const l = `${a.staffIndex}:${a.index}`;
      o.has(l) !== i.has(l) && r.push({ staffIndex: a.staffIndex, index: a.index });
    }
    return r;
  }
  get staffColors() {
    return p(this, we);
  }
  /**
   * Paint every measure of a staff in its own ink colour (M8 Slice 3), e.g.
   * a muted voice part dimmed to grey, or `null` to put every staff back in
   * the score colours. Keys are `staffIndex`; a staff left out keeps them.
   *
   * All of a measure's ops take the colour, staff lines, barlines, text and
   * rests included, so a dimmed part reads as one faded band rather than
   * faded notes on full-strength lines. Selection and the playback cursor
   * still win over it per note, as they win over `foreground`.
   * `partDecorations` (braces, brackets, part names) belong to no single
   * staff and keep the score colours; a barline shared down into the next staff belongs to the
   * upper staff's measure and takes that staff's colour.
   *
   * Like `setMeasureRange`, this does not paint: it returns the
   * `(staffIndex, index)` pairs of every measure on a staff whose colour
   * changed, for the caller to redraw (or call `drawAll`). No relayout is
   * involved, and the colours persist across `setLayout`.
   */
  setStaffColors(t) {
    const n = p(this, we), s = new Map(t ?? []);
    return F(this, we, s), p(this, pt).measures.filter((o) => n.get(o.staffIndex) !== s.get(o.staffIndex)).map((o) => ({ staffIndex: o.staffIndex, index: o.index }));
  }
  get noteColors() {
    return p(this, rn);
  }
  /**
   * Paint individual notes in their own ink colour (M9), e.g. green for a
   * pitch a practising student hit, or `null` to clear every note colour.
   * Replaces the whole map. Every op carrying the note's id takes the
   * colour: its head, stem, flag, dots, accidental, ties and articulations,
   * or a rest's glyph and dots. Each chord member has its own id, so a
   * chord's notes colour separately; a shared stem carries one member's id
   * and follows that member. Lyrics and other text under a note carry no
   * note id and keep their own colour.
   *
   * Selection and the playback cursor win over a note colour; a note colour
   * wins over the staff's colour (`setStaffColors`) and the `rest` colour.
   * Keyed by `NoteId`, so the colours persist across `setLayout`; an id the
   * layout no longer has draws nothing.
   *
   * Like `setStaffColors`, this does not paint: it returns the
   * `(staffIndex, index)` pairs of every measure holding a note whose
   * colour changed (old or new), deduplicated, for the caller to redraw.
   */
  setNoteColors(t) {
    const n = p(this, rn), s = new Map(t ?? []);
    F(this, rn, s);
    const o = /* @__PURE__ */ new Set();
    for (const i of /* @__PURE__ */ new Set([...n.keys(), ...s.keys()]))
      n.get(i) !== s.get(i) && o.add(i);
    return o.size === 0 ? [] : p(this, pt).measures.filter((i) => i.notes.some((r) => o.has(r.id))).map((i) => ({ staffIndex: i.staffIndex, index: i.index }));
  }
  /** The current colours, as set: `text` and `rest` are `null` while they
   *  follow `foreground`. */
  get colors() {
    return p(this, Lt);
  }
  /**
   * Change some colours (M9 Slice 6), keeping the rest. A key that is absent
   * or `undefined` stays as it is; `text: null` or `rest: null` makes that
   * colour follow `foreground` again.
   *
   * Like `setSeamMarkers`, this does not paint: every pixel may change,
   * including the title block and part decorations that only `drawAll`
   * paints, so the caller repaints with `drawAll()`. No relayout is
   * involved, and the colours persist across `setLayout`.
   */
  setColors(t) {
    F(this, Lt, ar(p(this, Lt), t));
  }
  get viewport() {
    return p(this, De);
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
    F(this, De, t === null ? null : { ...t });
  }
  get seamMarkers() {
    return p(this, Rn);
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
    F(this, Rn, t.map(({ staffIndex: n, boundaryIndex: s }) => ({ staffIndex: n, boundaryIndex: s }))), F(this, on, A(this, nt, Ro).call(this));
  }
  /** Repaint the whole score (or, with a viewport, all of it that is
   *  visible). The baseline the region-scoped path is measured against. */
  drawAll() {
    this.lastRedrawnMeasures = [], this.lastRedrawnRegions = [], A(this, nt, Ls).call(this, () => A(this, nt, Ea).call(this));
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
    this.lastRedrawnMeasures = [], this.lastRedrawnRegions = [], A(this, nt, Ls).call(this, () => A(this, nt, Lo).call(this, t, n));
  }
  /** Repaint several measures of one staff, e.g. when moving a selection
   *  between them. See `redrawMeasure`'s own comment on `staffIndex`. */
  redrawMeasures(t, n = 0) {
    this.lastRedrawnMeasures = [], this.lastRedrawnRegions = [], A(this, nt, Ls).call(this, () => {
      for (const s of t) A(this, nt, Lo).call(this, s, n);
    });
  }
}
Bt = new WeakMap(), he = new WeakMap(), rs = new WeakMap(), Lt = new WeakMap(), pt = new WeakMap(), _e = new WeakMap(), Wn = new WeakMap(), sn = new WeakMap(), Rn = new WeakMap(), on = new WeakMap(), De = new WeakMap(), we = new WeakMap(), rn = new WeakMap(), an = new WeakMap(), cn = new WeakMap(), ue = new WeakMap(), nt = new WeakSet(), Wo = function() {
  const t = /* @__PURE__ */ new Map();
  if (p(this, cn).length === 0) return t;
  for (const n of df(p(this, pt), p(this, cn))) {
    const s = `${n.staffIndex}:${n.measureIndex}`, o = t.get(s);
    o ? o.push(n) : t.set(s, [n]);
  }
  return t;
}, /** `measure`'s region grown to cover its marks: what painting it touches. */
Fs = function(t) {
  let n = t.region;
  for (const s of p(this, ue).get(`${t.staffIndex}:${t.index}`) ?? [])
    n = cr(n, s.bounds);
  return n;
}, Ws = function(t, n) {
  for (const s of p(this, ue).get(`${t}:${n}`) ?? [])
    A(this, nt, $e).call(this, s.ops, s.color ?? p(this, Lt).markup);
}, /** True when `rect` has some area inside the viewport (always, without one). */
Rs = function(t) {
  const n = p(this, De);
  return n === null ? !0 : t.x < n.x + n.width && t.x + t.width > n.x && t.y < n.y + n.height && t.y + t.height > n.y;
}, /** Run `paint` in layout coordinates: translated to the viewport's origin
 *  when there is one, and with the context's state restored afterwards. */
Ls = function(t) {
  const n = p(this, De);
  if (n === null) {
    t();
    return;
  }
  p(this, Bt).save(), p(this, Bt).translate(-n.x, -n.y);
  try {
    t();
  } finally {
    p(this, Bt).restore();
  }
}, Ro = function() {
  const t = [];
  for (const { staffIndex: n, boundaryIndex: s } of p(this, Rn)) {
    const o = hf(p(this, pt), n, s);
    o && t.push(o);
  }
  return t;
}, Ea = function() {
  A(this, nt, $o).call(this, p(this, De) ?? {
    x: 0,
    y: 0,
    width: p(this, pt).width,
    height: p(this, pt).height
  }), p(this, Bt).font = `${p(this, pt).fontSizePx}px "${p(this, he)}"`, p(this, Bt).textBaseline = "alphabetic", p(this, an).clear();
  const t = [];
  for (const s of p(this, pt).measures) {
    const o = A(this, nt, Fs).call(this, s);
    A(this, nt, Rs).call(this, o) && (t.push(s), p(this, an).set(`${s.staffIndex}:${s.index}`, o), A(this, nt, $s).call(this, s.staffIndex, s.index) && A(this, nt, _s).call(this, s.region), A(this, nt, $e).call(this, s.ops, p(this, we).get(s.staffIndex)), this.lastRedrawnMeasures.push(s.index), this.lastRedrawnRegions.push(s.region));
  }
  for (const s of t) A(this, nt, Ws).call(this, s.staffIndex, s.index);
  A(this, nt, $e).call(this, p(this, pt).partDecorations), p(this, pt).header && A(this, nt, $e).call(this, p(this, pt).header.ops);
  const n = p(this, on).filter((s) => A(this, nt, Rs).call(this, s));
  if (n.length > 0) {
    p(this, Bt).fillStyle = p(this, Lt).seamMarker;
    for (const s of n) p(this, Bt).fillRect(s.x, s.y, s.width, s.height);
  }
}, Lo = function(t, n) {
  const s = p(this, pt).measures.find((l) => l.staffIndex === n && l.index === t), o = s ? A(this, nt, Fs).call(this, s) : null;
  if (!s || !o || !A(this, nt, Rs).call(this, o)) return;
  const i = `${n}:${t}`, r = p(this, an).get(i), a = r ? cr(r, o) : o;
  A(this, nt, $o).call(this, a), p(this, an).set(i, o), A(this, nt, $s).call(this, n, t) && A(this, nt, _s).call(this, s.region), p(this, Bt).font = `${p(this, pt).fontSizePx}px "${p(this, he)}"`, p(this, Bt).textBaseline = "alphabetic", A(this, nt, $e).call(this, s.ops, p(this, we).get(n)), A(this, nt, Ba).call(this, a, s), A(this, nt, Ws).call(this, n, t), A(this, nt, Ta).call(this, a), this.lastRedrawnMeasures.push(t), this.lastRedrawnRegions.push(s.region);
}, /**
 * Put back what clearing `cleared` wiped outside `measure`'s own region.
 * Without marks the two are the same rectangle (regions never overlap),
 * and this paints nothing. A mark, though, is an overlay: it may sit over
 * another row's ink (a breath mark above a tightly spaced staff), so
 * clearing it took that ink too. Every other measure, and the title
 * block, whose painted area overlaps `cleared` is repainted clipped to
 * it; their marks are repainted after it, on top, as `drawAll` paints
 * them. Every pixel this touches stays inside `cleared`.
 */
Ba = function(t, n) {
  const s = n.region;
  if (t.x >= s.x && t.y >= s.y && t.x + t.width <= s.x + s.width && t.y + t.height <= s.y + s.height)
    return;
  const o = p(this, pt).measures.filter((a) => a !== n && lr(A(this, nt, Fs).call(this, a), t)), i = p(this, pt).header && lr(p(this, pt).header.region, t) ? p(this, pt).header : null;
  if (o.length === 0 && !i) return;
  const r = p(this, Bt);
  r.save(), r.beginPath(), r.rect(t.x, t.y, t.width, t.height), r.clip();
  for (const a of o)
    A(this, nt, $s).call(this, a.staffIndex, a.index) && A(this, nt, _s).call(this, a.region), A(this, nt, $e).call(this, a.ops, p(this, we).get(a.staffIndex));
  i && A(this, nt, $e).call(this, i.ops);
  for (const a of o) A(this, nt, Ws).call(this, a.staffIndex, a.index);
  r.restore(), r.font = `${p(this, pt).fontSizePx}px "${p(this, he)}"`;
}, /**
 * Repaint the part of every seam strip that overlaps `region` (M5 Slice 6),
 * after that region was just cleared and repainted. A strip is a plain
 * rectangle, so "clipped to the region" is a rectangle intersection, not a
 * canvas clip path: every call this makes stays inside `region`, keeping
 * a scoped redraw's "touches no pixel outside the measure" property exact.
 * Painted fresh over a freshly cleared background, so a translucent
 * `seamMarker` colour never accumulates across repeated redraws.
 */
Ta = function(t) {
  let n = !1;
  for (const s of p(this, on)) {
    const o = Math.max(s.x, t.x), i = Math.min(s.x + s.width, t.x + t.width), r = Math.max(s.y, t.y), a = Math.min(s.y + s.height, t.y + t.height);
    i <= o || a <= r || (n || (p(this, Bt).fillStyle = p(this, Lt).seamMarker, n = !0), p(this, Bt).fillRect(o, r, i - o, a - r));
  }
}, $s = function(t, n) {
  const s = p(this, sn);
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
_s = function(t) {
  p(this, Bt).fillStyle = p(this, Lt).measureRange, p(this, Bt).fillRect(t.x, t.y, t.width, t.height);
}, $o = function(t) {
  if (p(this, Lt).background === null) {
    p(this, Bt).clearRect(t.x, t.y, t.width, t.height);
    return;
  }
  p(this, Bt).fillStyle = p(this, Lt).background, p(this, Bt).fillRect(t.x, t.y, t.width, t.height);
}, /**
 * Paint `ops`. `staffInk` is the staff's own colour from `setStaffColors`,
 * when it has one; it then covers every op, text and rests included, so
 * a dimmed part dims as a whole.
 */
$e = function(t, n) {
  const s = p(this, Bt), { foreground: o, text: i, rest: r } = p(this, Lt), a = i ?? o, l = r ?? o;
  let f = "";
  for (const c of t) {
    const u = c.kind === "text" ? "text" : c.kind === "curve" ? void 0 : c.role, h = c.noteId !== void 0 && p(this, Wn).has(c.noteId) ? p(this, Lt).playbackCursor : c.noteId !== void 0 && c.noteId === p(this, _e) ? p(this, Lt).selection : (c.noteId !== void 0 ? p(this, rn).get(c.noteId) : void 0) ?? n ?? (u === "text" ? a : u === "rest" ? l : o);
    if (h !== f && (s.fillStyle = h, s.strokeStyle = h, f = h), c.kind === "rect")
      c.rise ? (s.beginPath(), s.moveTo(c.x, c.y), s.lineTo(c.x + c.width, c.y + c.rise), s.lineTo(c.x + c.width, c.y + c.rise + c.height), s.lineTo(c.x, c.y + c.height), s.closePath(), s.fill()) : s.fillRect(c.x, c.y, c.width, c.height);
    else if (c.kind === "curve")
      s.lineWidth = c.thickness, s.beginPath(), s.moveTo(c.x0, c.y0), s.bezierCurveTo(c.cx0, c.cy0, c.cx1, c.cy1, c.x1, c.y1), s.stroke();
    else if (c.kind === "text") {
      if (s.font = `${c.fontStyle ? `${c.fontStyle} ` : ""}${c.fontSizePx}px ${p(this, rs)}`, c.clip)
        s.save(), s.beginPath(), s.rect(c.clip.x, c.y - 2 * c.fontSizePx, c.clip.width, 3 * c.fontSizePx), s.clip(), s.fillText(c.text, c.x, c.y), s.restore();
      else if (c.align === "center" || c.align === "right") {
        const d = s.textAlign;
        s.textAlign = c.align, s.fillText(c.text, c.x, c.y), s.textAlign = d;
      } else
        s.fillText(c.text, c.x, c.y);
      s.font = `${p(this, pt).fontSizePx}px "${p(this, he)}"`;
    } else c.fontSizePx !== void 0 ? (s.font = `${c.fontSizePx}px "${p(this, he)}"`, s.fillText(String.fromCodePoint(X[c.glyph].codepoint), c.x, c.y), s.font = `${p(this, pt).fontSizePx}px "${p(this, he)}"`) : s.fillText(String.fromCodePoint(X[c.glyph].codepoint), c.x, c.y);
  }
};
function ar(e, t) {
  const n = (s) => {
    const o = t[s];
    return o === void 0 ? e[s] : o;
  };
  return {
    foreground: n("foreground"),
    background: n("background"),
    text: n("text"),
    rest: n("rest"),
    selection: n("selection"),
    playbackCursor: n("playbackCursor"),
    measureRange: n("measureRange"),
    seamMarker: n("seamMarker"),
    markup: n("markup")
  };
}
function cr(e, t) {
  const n = Math.min(e.x, t.x), s = Math.min(e.y, t.y);
  return {
    x: n,
    y: s,
    width: Math.max(e.x + e.width, t.x + t.width) - n,
    height: Math.max(e.y + e.height, t.y + t.height) - s
  };
}
function lr(e, t) {
  return e.x < t.x + t.width && e.x + e.width > t.x && e.y < t.y + t.height && e.y + e.height > t.y;
}
function Ia(e, t) {
  return e * 4 * (60 / t);
}
function Na(e) {
  var u;
  const t = Math.max(0, ...e.staves.map((h) => h.measures.length)), n = ((u = e.staves[0]) == null ? void 0 : u.measures) ?? [], s = /* @__PURE__ */ new Map();
  for (const h of e.endings())
    for (let d = h.first; d <= h.last; d++) s.set(d, { numbers: h.start.numbers, last: h.last });
  const o = (h) => {
    var d;
    return Math.max(1, ((d = n[h]) == null ? void 0 : d.repeatTimes) ?? 2);
  }, i = Math.max(2, ...n.map((h, d) => o(d))), r = t * (i + 1), a = [];
  let l = 0, f = 1, c = 0;
  for (; c < t && a.length < r; ) {
    const h = n[c];
    (h == null ? void 0 : h.startBarline) === "repeatStart" && c !== l && (l = c, f = 1);
    const d = s.get(c);
    if (d && !d.numbers.includes(f)) {
      c = d.last + 1;
      continue;
    }
    if (a.push({ measureIndex: c, pass: f }), (h == null ? void 0 : h.endBarline) === "repeatEnd") {
      if (f < o(c)) {
        f++, c = l;
        continue;
      }
      l = c + 1, f = 1;
    } else d && d.last === c && f > 1 && (l = c + 1, f = 1);
    c++;
  }
  return a;
}
const xf = 0.5, vf = 0.25, Sf = 0.75, wf = 1.3, Mf = 1.5, kf = 2, Cn = {
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
}, Ef = {
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
}, Bf = 0.05, Tf = 1 / 2, If = 2 / 3, Nf = 1 / 32, Af = 1 / 2, Cf = 3 / 4;
function Pf(e, t) {
  const n = t.durationWholes, s = e.length === 1 && !e[0].grace.slash, o = e.map((a) => {
    const l = a.grace.stealTimeFollowing;
    return l !== null ? Math.max(0, l) / 100 * n : s ? n * (t.dots > 0 ? If : Tf) : Math.min(Nf, n * Af / e.length);
  }), i = o.reduce((a, l) => a + l, 0), r = n * Cf;
  return i > r && i > 0 ? o.map((a) => a * r / i) : o;
}
const Of = Ir.filter((e) => Cn[e] !== void 0);
function fr(e, t) {
  const n = Of.map((s) => Cn[s]);
  return t > 0 ? n.find((s) => s > e + 1e-9) ?? e : [...n].reverse().find((s) => s < e - 1e-9) ?? e;
}
function Ff(e, t, n, s) {
  const o = e.staves[t], i = [];
  n.forEach(({ measureIndex: h }, d) => {
    var g;
    for (const m of ((g = o.measures[h]) == null ? void 0 : g.dynamics) ?? []) i.push({ x: s[d] + m.onset, kind: m.kind });
  });
  const r = [];
  for (const h of e.wedges)
    h.staffIndex === t && n.forEach(({ measureIndex: d }, g) => {
      if (d === h.start.measureIndex)
        for (let m = g; m < n.length; m++) {
          if (m > g && n[m].measureIndex <= n[m - 1].measureIndex) return;
          if (n[m].measureIndex === h.stop.measureIndex) {
            r.push({ kind: h.kind, start: s[g] + h.start.onset, stop: s[m] + h.stop.onset });
            return;
          }
        }
    });
  if (r.sort((h, d) => h.start - d.start), i.length === 0 && r.length === 0) return null;
  i.sort((h, d) => h.x - d.x);
  const a = [], l = /* @__PURE__ */ new Map();
  let f = 1;
  for (const { x: h, kind: d } of i) {
    const g = Cn[d], m = Ef[d];
    g !== void 0 ? f = g : m ? (l.set(Math.round(h * 1e9), m.attack), m.hold && (f = Cn[m.hold])) : d === "pf" ? f = fr(f, 1) : d === "n" && (f = Bf), a.push({ x: h, level: f });
  }
  const c = (h) => {
    let d = 1;
    for (const g of a) {
      if (g.x > h + 1e-9) break;
      d = g.level;
    }
    return d;
  }, u = r.map((h, d) => {
    var x;
    const g = c(h.start), m = ((x = r[d + 1]) == null ? void 0 : x.start) ?? Number.POSITIVE_INFINITY, b = i.find(
      (S) => S.x >= h.stop - 1e-9 && S.x < m - 1e-9 && Cn[S.kind] !== void 0
    ), y = b ? Cn[b.kind] : fr(g, h.kind === "crescendo" ? 1 : -1);
    return { ...h, from: g, to: y };
  });
  return (h) => {
    const d = l.get(Math.round(h * 1e9));
    if (d !== void 0) return d;
    let g;
    for (const b of a) {
      if (b.x > h + 1e-9) break;
      g = b;
    }
    let m;
    for (const b of u) {
      if (b.start > h + 1e-9) break;
      m = b;
    }
    return m && (!g || g.x <= m.start + 1e-9) ? h >= m.stop ? m.to : m.from + (m.to - m.from) * (h - m.start) / (m.stop - m.start) : (g == null ? void 0 : g.level) ?? 1;
  };
}
function Wf(e) {
  return e.includes("staccatissimo") ? vf : e.includes("staccato") ? xf : e.includes("detached-legato") ? Sf : 1;
}
function Rf(e) {
  return e.includes("strong-accent") ? Mf : e.includes("accent") ? wf : 1;
}
function ai(e) {
  const t = Math.max(0, ...e.staves.map((s) => s.measures.length)), n = [];
  for (let s = 0; s < t; s++) {
    let o = 0;
    for (const i of e.staves) {
      const r = i.measures[s];
      if (!r) continue;
      const a = /* @__PURE__ */ new Map();
      for (const [l] of Xt(r.notes))
        a.set(l.voice, (a.get(l.voice) ?? 0) + l.durationWholes);
      o = Math.max(o, ...a.values());
    }
    n.push(o > 0 ? o : Jo(e.timeAt(s)));
  }
  return n;
}
function Aa(e, t, n) {
  const s = [];
  for (const i of e.staves)
    for (let r = 0; r < t.length; r++) {
      const a = i.measures[t[r].measureIndex];
      if (!a) continue;
      const l = /* @__PURE__ */ new Map();
      for (const f of Xt(a.notes)) {
        const c = f[0], u = l.get(c.voice) ?? n[r], h = u + c.durationWholes;
        l.set(c.voice, h), qo(f) !== null && h > u && s.push([u, h]);
      }
    }
  if (s.length === 0) return (i) => i;
  s.sort((i, r) => i[0] - r[0]);
  const o = [];
  for (const [i, r] of s) {
    const a = o[o.length - 1];
    a && i <= a[1] ? a[1] = Math.max(a[1], r) : o.push([i, r]);
  }
  return (i) => {
    let r = 0;
    for (const [a, l] of o) {
      if (i <= a) break;
      r += (Math.min(i, l) - a) * (kf - 1);
    }
    return i + r;
  };
}
function Lf(e) {
  const t = /* @__PURE__ */ new Set();
  for (const n of e.measures)
    for (const s of n.notes)
      t.add(s.voice);
  return [...t];
}
function $f(e) {
  const t = e.tempoBpm, n = [], s = Na(e), o = ai(e), i = Ca(s, o), r = s.some((f, c) => f.measureIndex !== c) || s.length !== o.length, a = Aa(e, s, i), l = (f) => Ia(f, t);
  for (const f of e.staves) {
    const c = Ff(e, f.index, s, i);
    for (const u of Lf(f)) {
      let h = 0, d = /* @__PURE__ */ new Map(), g = [];
      for (let m = 0; m < s.length; m++) {
        const b = f.measures[s[m].measureIndex];
        if (!b) continue;
        m > 0 && s[m].measureIndex !== s[m - 1].measureIndex + 1 && (d = /* @__PURE__ */ new Map());
        const y = r ? { playIndex: m } : {};
        h = i[m];
        const x = /* @__PURE__ */ new Map(), S = [];
        for (const w of no(b.notes))
          w.voice === u && (w.principal ? x.set(w.principal.id, w.notes) : S.push(...w.notes));
        for (const w of Xt(b.notes)) {
          const E = w[0];
          if (E.voice !== u) continue;
          const B = /* @__PURE__ */ new Map(), D = Ko(w), M = c ? c(h) : 1, I = [...g, ...x.get(E.id) ?? []];
          g = [];
          let C = 0;
          if (I.length > 0) {
            const K = Pf(I, E);
            I.forEach((j, J) => {
              const T = h + C, V = T + K[J], N = l(a(T));
              n.push({
                noteId: j.id,
                pitch: j.pitch,
                startSeconds: N,
                durationSeconds: l(a(V)) - N,
                ...M !== 1 ? { velocity: M } : {},
                ...y
              }), C = V - h;
            });
          }
          const O = l(a(h + C)), L = l(a(h + E.durationWholes)) - O, R = Rf(D) * M;
          for (const K of w) {
            if (K.isRest) continue;
            const j = L * Wf(D), J = d.get(K.id);
            let T;
            if (J !== void 0) {
              const V = n[J];
              n[J] = { ...V, durationSeconds: V.durationSeconds + j }, T = J;
            } else
              n.push({
                noteId: K.id,
                // Non-null: rests were skipped above.
                pitch: K.pitch,
                startSeconds: O,
                durationSeconds: j,
                ...R !== 1 ? { velocity: R } : {},
                ...y
              }), T = n.length - 1;
            K.tiedToId !== null && B.set(K.tiedToId, T);
          }
          d = B, h += E.durationWholes;
        }
        g.push(...S);
      }
    }
  }
  return n;
}
function Ca(e, t) {
  const n = [];
  let s = 0;
  for (const { measureIndex: o } of e)
    n.push(s), s += t[o];
  return n;
}
function _f(e) {
  const t = Na(e), n = Ca(t, ai(e)), s = Aa(e, t, n);
  return n.map((o) => Ia(s(o), e.tempoBpm));
}
function Df(e, t) {
  let n;
  for (const s of e)
    s.noteId === t && (n === void 0 || s.startSeconds < n) && (n = s.startSeconds);
  return n;
}
const Gf = 0.1, zf = 25;
class Yf {
  constructor(t) {
    vt(this, "events");
    vt(this, "getCurrentTime");
    vt(this, "onSchedule");
    vt(this, "onTick");
    vt(this, "lookaheadSeconds");
    vt(this, "intervalMs");
    vt(this, "scheduledIndices", /* @__PURE__ */ new Set());
    vt(this, "timer", null);
    this.events = t.events, this.getCurrentTime = t.getCurrentTime, this.onSchedule = t.onSchedule, this.onTick = t.onTick, this.lookaheadSeconds = t.lookaheadSeconds ?? Gf, this.intervalMs = t.intervalMs ?? zf;
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
      const o = this.events[s];
      o.startSeconds <= t && (this.scheduledIndices.add(s), this.onSchedule(o));
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
function Uf(e) {
  return 440 * 2 ** ((e - 69) / 12);
}
function jf(e) {
  return Uf(Sc(e));
}
const Hf = 0.01, Vf = 0.05, Xf = 0.2;
function Kf(e, t, n) {
  const s = e + t;
  if (s <= n)
    return { attack: e, release: t };
  const o = s > 0 ? n / s : 0;
  return { attack: e * o, release: t * o };
}
function qf(e, t) {
  const { audioContext: n } = t, s = t.attackSeconds ?? Hf, o = t.releaseSeconds ?? Vf, i = (t.gain ?? Xf) * (e.velocity ?? 1), r = e.startSeconds, a = e.startSeconds + e.durationSeconds, { attack: l, release: f } = Kf(s, o, e.durationSeconds), c = n.createOscillator();
  c.type = "triangle", c.frequency.setValueAtTime(jf(e.pitch), r);
  const u = n.createGain();
  return u.gain.setValueAtTime(0, r), u.gain.linearRampToValueAtTime(i, r + l), u.gain.setValueAtTime(i, a - f), u.gain.linearRampToValueAtTime(0, a), c.connect(u), u.connect(n.destination), c.start(r), c.stop(a), { oscillator: c, gain: u };
}
class Jf {
  constructor(t) {
    vt(this, "events");
    vt(this, "audioContext");
    vt(this, "synthesisOptions");
    vt(this, "lookaheadSeconds");
    vt(this, "intervalMs");
    vt(this, "onOnset");
    vt(this, "onEnd");
    vt(this, "endSeconds");
    vt(this, "basePosition", 0);
    vt(this, "baseAudioTime", null);
    vt(this, "playing", !1);
    vt(this, "scheduler", null);
    vt(this, "activeOscillators", /* @__PURE__ */ new Set());
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
    const s = this.events.filter((i) => i.startSeconds >= t).map((i) => ({
      ...i,
      startSeconds: n + (i.startSeconds - t),
      pieceTimeStartSeconds: i.startSeconds
    })), o = new Yf({
      events: s,
      getCurrentTime: () => this.audioContext.currentTime,
      onSchedule: (i) => {
        var a;
        const { oscillator: r } = qf(i, {
          audioContext: this.audioContext,
          ...this.synthesisOptions
        });
        this.activeOscillators.add(r), (a = this.onOnset) == null || a.call(this, {
          noteId: i.noteId,
          pitch: i.pitch,
          startSeconds: i.pieceTimeStartSeconds,
          durationSeconds: i.durationSeconds
        });
      },
      onTick: () => this.endIfFinished(),
      lookaheadSeconds: this.lookaheadSeconds,
      intervalMs: this.intervalMs
    });
    this.scheduler = o, o.start(), this.playing = !0;
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
const hr = 1e-9;
function Ku(e) {
  const t = ai(e), n = [];
  let s = 0;
  for (const r of t)
    n.push(s), s += r;
  const o = /* @__PURE__ */ new Map(), i = [];
  for (const r of e.staves)
    r.measures.forEach((a, l) => {
      const f = /* @__PURE__ */ new Map();
      for (const c of Xt(a.notes)) {
        const u = c[0], h = f.get(u.voice) ?? n[l], d = h + u.durationWholes;
        f.set(u.voice, d);
        for (const g of c)
          o.set(g.id, h), g.isRest || i.push({ id: g.id, start: h, end: d });
      }
      for (const c of no(a.notes)) {
        const u = c.principal ? o.get(c.principal.id) : f.get(c.voice) ?? n[l];
        for (const h of c.notes) o.set(h.id, u);
      }
    });
  return {
    notesSoundingAt(r) {
      return i.filter((a) => a.start <= r + hr && r + hr < a.end).map((a) => a.id);
    },
    onsetWholes(r) {
      return o.get(r);
    }
  };
}
const tn = { num: 0, den: 1 };
function Pa(e, t) {
  for (e = Math.abs(e), t = Math.abs(t); t !== 0; )
    [e, t] = [t, e % t];
  return e === 0 ? 1 : e;
}
function Xn(e, t) {
  return e / Pa(e, t) * t;
}
function Oe(e) {
  const t = Pa(e.num, e.den);
  return { num: e.num / t, den: e.den / t };
}
function ur(e, t) {
  return Oe({ num: e.num * t.num, den: e.den * t.den });
}
function Ds(e, t) {
  return Oe({ num: e.num * t.den + t.num * e.den, den: e.den * t.den });
}
function Oa(e, t) {
  return Oe({ num: e.num * t.den - t.num * e.den, den: e.den * t.den });
}
function en(e, t) {
  return e.num * t.den - t.num * e.den;
}
const Qf = {
  breve: { num: 8, den: 1 },
  whole: { num: 4, den: 1 },
  half: { num: 2, den: 1 },
  quarter: { num: 1, den: 1 },
  eighth: { num: 1, den: 2 },
  "16th": { num: 1, den: 4 },
  "32nd": { num: 1, den: 8 },
  "64th": { num: 1, den: 16 }
}, Zf = {
  0: { num: 1, den: 1 },
  1: { num: 3, den: 2 },
  2: { num: 7, den: 4 }
};
function co(e) {
  if (e.grace !== null) return tn;
  if (e.measureRestWholes !== null) return ss(e.measureRestWholes);
  let t = ur(Qf[e.value], Zf[e.dots]);
  return e.tuplet && (t = ur(t, { num: e.tuplet.normalNotes, den: e.tuplet.actualNotes })), t;
}
function ss(e) {
  const t = e * 4;
  for (let n = 1; n <= 1024; n++) {
    const s = Math.round(t * n);
    if (Math.abs(s / n - t) < 1e-9) return Oe({ num: s, den: n });
  }
  return Oe({ num: Math.round(t * 1024), den: 1024 });
}
function lo(e) {
  return Oe({ num: e.num, den: e.den * 4 });
}
function Fa(e) {
  return Oe({ num: e.num * 4, den: e.den });
}
const Gs = /* @__PURE__ */ new Set(["end-line", "end-paragraph", "footnote", "level"]);
function Wa(e) {
  var c, u, h;
  const t = e.children.filter((d) => !Gs.has(d.name)), n = e.children.findIndex((d) => Gs.has(d.name));
  if (n !== -1 && e.children.slice(n).some((d) => !Gs.has(d.name))) return null;
  let s = 0;
  const o = [], i = () => {
    var g, m;
    let d = "single";
    if (((g = t[s]) == null ? void 0 : g.name) === "syllabic") {
      const b = t[s].text.trim();
      if (!th(b)) return !1;
      d = b, s++;
    }
    return ((m = t[s]) == null ? void 0 : m.name) !== "text" ? !1 : (o.push({ syllabic: d, text: t[s].text }), s++, !0);
  };
  if (((c = t[0]) == null ? void 0 : c.name) !== "extend") {
    if (!i()) return null;
    for (; ((u = t[s]) == null ? void 0 : u.name) === "elision"; )
      if (s++, !i()) return null;
  }
  let r = null;
  if (((h = t[s]) == null ? void 0 : h.name) === "extend") {
    const d = t[s].attrs.type;
    if (d === void 0) r = "untyped";
    else if (d === "start" || d === "stop" || d === "continue") r = d;
    else return null;
    s++;
  }
  if (s !== t.length || o.length === 0 && r === null) return null;
  const [a, ...l] = o, f = bi({
    verse: e.attrs.number ?? "1",
    syllabic: (a == null ? void 0 : a.syllabic) ?? "single",
    text: (a == null ? void 0 : a.text) ?? "",
    elisions: l,
    extend: r,
    source: null
  });
  return Dn(Ra(f)) === Dn(e) ? f : bi({ ...f, source: e });
}
function th(e) {
  return e === "single" || e === "begin" || e === "middle" || e === "end";
}
function Ra(e) {
  const { source: t } = e;
  if (t) {
    const i = Wa(t);
    if (i && eh(i, e)) return t;
  }
  const n = (i, r) => ({ name: i, attrs: {}, children: [], text: r }), s = [], o = (i, r) => {
    s.push(n("syllabic", i), n("text", r));
  };
  if (e.text !== "" || e.elisions.length > 0) {
    o(e.syllabic, e.text);
    for (const i of e.elisions)
      s.push(n("elision", "")), o(i.syllabic, i.text);
  }
  return e.extend !== null && s.push({ name: "extend", attrs: e.extend === "untyped" ? {} : { type: e.extend }, children: [], text: "" }), t && s.push(...t.children.filter((i) => Gs.has(i.name))), { name: "lyric", attrs: { ...t == null ? void 0 : t.attrs, number: e.verse }, children: s, text: "" };
}
function eh(e, t) {
  const n = (s, o) => s.length === o.length && s.every((i, r) => i.syllabic === o[r].syllabic && i.text === o[r].text);
  return e.verse === t.verse && e.syllabic === t.syllabic && e.text === t.text && e.extend === t.extend && n(e.elisions, t.elisions);
}
function qu(e) {
  const t = new Fh();
  t.raw('<?xml version="1.0" encoding="UTF-8"?>'), t.raw(
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">'
  ), t.open("score-partwise", { version: "4.0" });
  for (const i of e.headerPassthrough) t.element(i);
  const n = sh(e), s = oh(e, n);
  ih(t, n, s);
  const o = nh(e) !== e.tempoBpm;
  for (let i = 0; i < n.length; i++)
    rh(t, e, n, i, o);
  return t.close("score-partwise"), t.toString();
}
function nh(e) {
  let t;
  const n = (s) => {
    if (s.name === "metronome") {
      const o = s.children.find((r) => r.name === "per-minute"), i = o ? Number.parseFloat(o.text.trim()) : Number.NaN;
      if (Number.isFinite(i)) return i;
    }
    if (s.name === "sound" && t === void 0 && s.attrs.tempo !== void 0) {
      const o = Number.parseFloat(s.attrs.tempo);
      Number.isFinite(o) && (t = o);
    }
    for (const o of s.children) {
      const i = n(o);
      if (i !== void 0) return i;
    }
  };
  for (const s of e.staves)
    for (const o of s.measures)
      for (const i of o.passthrough) {
        const r = n(i.element);
        if (r !== void 0) return r;
      }
  return t;
}
function sh(e) {
  const t = [], n = /* @__PURE__ */ new Map();
  let s = 0;
  for (let o = 0; o < e.staves.length; o++) {
    if (n.has(o)) continue;
    const i = e.parts.find(
      (a) => a.name !== void 0 && a.name !== "" && a.staffIndices.includes(o)
    ), r = `P${t.length + 1}`;
    if (i) {
      const a = [...i.staffIndices].sort((l, f) => l - f);
      t.push({
        id: r,
        name: i.name,
        staffIndices: a,
        passthrough: i.passthrough ?? os,
        nameHidden: i.nameHidden === !0
      });
      for (const l of a)
        n.has(l) || n.set(l, t.length - 1);
    } else {
      s++;
      const a = e.parts.find(
        (l) => l.staffIndices.length === 1 && l.staffIndices[0] === o
      );
      t.push({
        id: r,
        name: `Part ${s}`,
        staffIndices: [o],
        passthrough: (a == null ? void 0 : a.passthrough) ?? os,
        nameHidden: (a == null ? void 0 : a.nameHidden) === !0
      }), n.set(o, t.length - 1);
    }
  }
  return t;
}
const os = Object.freeze([]), La = Object.freeze({ "print-object": "no" });
function oh(e, t) {
  const n = t.map((i) => new Set(i.staffIndices)), s = (i) => {
    const r = [...i.staffIndices].sort((a, l) => a - l).join(",");
    return t.some((a) => [...a.staffIndices].sort((l, f) => l - f).join(",") === r);
  }, o = [];
  for (const i of e.parts) {
    if (i.staffIndices.length < 2 || s(i)) continue;
    const r = [];
    for (let a = 0; a < n.length; a++)
      i.staffIndices.some((l) => n[a].has(l)) && r.push(a);
    r.length !== 0 && o.push({
      number: o.length + 1,
      symbol: Vo(i),
      firstEmittedIndex: r[0],
      lastEmittedIndex: r[r.length - 1],
      passthrough: i.passthrough ?? os
    });
  }
  return o;
}
function ih(e, t, n) {
  e.open("part-list");
  for (let s = 0; s < t.length; s++) {
    for (const i of n)
      if (i.firstEmittedIndex === s) {
        e.open("part-group", { type: "start", number: String(i.number) });
        const r = new zn(e, i.passthrough, Ah);
        r.before("group-symbol"), e.leaf("group-symbol", i.symbol), r.rest(), e.close("part-group");
      }
    e.open("score-part", { id: t[s].id });
    const o = new zn(e, t[s].passthrough, Nh);
    o.before("part-name"), e.leaf("part-name", t[s].name, t[s].nameHidden ? La : void 0), o.rest(), e.close("score-part");
    for (const i of n)
      i.lastEmittedIndex === s && e.selfClose("part-group", { type: "stop", number: String(i.number) });
  }
  e.close("part-list");
}
function rh(e, t, n, s, o) {
  const i = n[s], r = s === 0, a = i.staffIndices, l = a.length > 1, f = a[0], c = [], u = [], h = dh(t, a, l);
  for (const y of h.values()) u.push(...y);
  const d = [];
  for (const y of a)
    for (const x of t.staves[y].measures) {
      c.push(...x.notes), u.push(...x.passthrough);
      for (const S of x.clefChanges) d.push(S.onset);
    }
  const g = Ch(c, u, d), m = t.staves[f].measures.length;
  e.open("part", { id: i.id });
  let b;
  for (let y = 0; y < m; y++) {
    const x = t.staves[f].measures[y];
    e.open("measure", { number: x.number ?? String(y + 1) });
    for (const S of x.passthrough)
      S.lead && e.element(ci(S.element, g / S.divisions));
    x.endingStart && (b = x.endingStart), br(
      e,
      Eh(x),
      x.barlinePassthrough.filter((S) => S.attrs.location === "left"),
      "left"
    ), ah(e, t, i, y, g, l), o && r && y === 0 && (e.open("direction", { placement: "above" }), e.open("direction-type"), e.open("metronome"), e.leaf("beat-unit", "quarter"), e.leaf("per-minute", String(t.tempoBpm)), e.close("metronome"), e.close("direction-type"), e.selfClose("sound", { tempo: String(t.tempoBpm) }), e.close("direction")), ch(e, t, a, y, g, l, h), br(
      e,
      Bh(t.endBarlineAt(y, f), x, b),
      x.barlinePassthrough.filter((S) => S.attrs.location !== "left"),
      "right"
    ), x.endingEnd && (b = void 0), e.close("measure");
  }
  e.close("part");
}
function ah(e, t, n, s, o, i) {
  const r = n.staffIndices[0], a = t.staves[r].measures[s], l = a.attributesPassthrough;
  if (s === 0) {
    e.open("attributes");
    const u = new zn(e, l, yr);
    u.before("divisions"), e.leaf("divisions", String(o)), u.before("key"), e.open("key"), e.leaf("fifths", String(t.keyFifthsAt(0, r))), e.close("key"), u.before("time");
    const h = t.timeAt(0, r);
    e.open("time"), e.leaf("beats", String(h.beats)), e.leaf("beat-type", String(h.beatType)), e.close("time"), u.before("staves"), i && e.leaf("staves", String(n.staffIndices.length)), u.before("clef");
    for (let d = 0; d < n.staffIndices.length; d++)
      dr(e, t.clefAt(0, n.staffIndices[d]), d + 1);
    u.rest(), e.close("attributes");
    return;
  }
  const f = [];
  for (let u = 0; u < n.staffIndices.length; u++) {
    const h = t.staves[n.staffIndices[u]].measures[s].clef;
    h !== void 0 && f.push({ clef: h, number: u + 1 });
  }
  if (a.keyFifths === void 0 && a.time === void 0 && f.length === 0 && l.length === 0)
    return;
  e.open("attributes");
  const c = new zn(e, l, yr);
  a.keyFifths !== void 0 && (c.before("key"), e.open("key"), e.leaf("fifths", String(a.keyFifths)), e.close("key")), a.time !== void 0 && (c.before("time"), e.open("time"), e.leaf("beats", String(a.time.beats)), e.leaf("beat-type", String(a.time.beatType)), e.close("time")), f.length > 0 && c.before("clef");
  for (const u of f) dr(e, u.clef, u.number);
  c.rest(), e.close("attributes");
}
const $a = {
  treble: { sign: "G", line: 2 },
  bass: { sign: "F", line: 4 },
  treble8: { sign: "G", line: 2, octaveChange: -1 },
  alto: { sign: "C", line: 3 },
  tenor: { sign: "C", line: 4 }
};
function dr(e, t, n) {
  const s = $a[t];
  e.open("clef", { number: String(n) }), e.leaf("sign", s.sign), e.leaf("line", String(s.line)), s.octaveChange !== void 0 && e.leaf("clef-octave-change", String(s.octaveChange)), e.close("clef");
}
function ch(e, t, n, s, o, i, r) {
  var f, c, u;
  let a = tn, l = !0;
  for (let h = 0; h < n.length; h++) {
    const d = n[h], m = t.staves[d].measures[s], b = t.timeAt(s, d), y = To(t.clefAt(s, d)), x = [...xh(m.notes)], S = hh(m, x.map(([w]) => w));
    uh(S, m, (f = x[0]) == null ? void 0 : f[0], h + 1), gh(S, r.get(`${d}:${s}`), x.map(([w]) => w)), x.length === 0 && S.size > 0 && x.push([[...S.keys()][0], []]);
    for (const [w, E] of x) {
      !l && a.num > 0 && (e.open("backup"), e.leaf("duration", String(_o(a, o))), e.close("backup")), l = !1;
      const B = m.clefChanges.length === 0 ? y : yh(t, s, d, E), D = vh(E, b, B), M = /* @__PURE__ */ new Map();
      let I = [];
      const C = Sh(w, x.length > 1);
      for (const N of no(E))
        N.principal ? M.set(N.principal.id, N.notes) : I = N.notes, wh(D, N.notes, C);
      const O = (N) => {
        for (const v of N ?? [])
          gr(e, t, v, {
            divisions: o,
            multiStaff: i,
            staffNumber: h + 1,
            middleLine: 0,
            beamPlan: D,
            chord: [v],
            previousAnchor: void 0,
            nextAnchor: void 0,
            regenerateTuplets: !1,
            graceStem: C
          });
      }, L = S.get(w) ?? [], R = (N) => {
        e.element(ci(N.element, o / N.divisions));
      }, K = [];
      let j = 0, J = tn;
      const T = Xt(E), V = lh(T);
      for (let N = 0; N < T.length; N++) {
        const v = T[N];
        for (; j < L.length && en(oe(L[j]), J) < 0; ) K.push(L[j++]);
        for (; j < L.length && en(oe(L[j]), J) === 0; ) R(L[j++]);
        O(M.get(v[0].id));
        for (const k of v)
          gr(e, t, k, {
            divisions: o,
            multiStaff: i,
            staffNumber: h + 1,
            middleLine: typeof B == "number" ? B : B(v[0]),
            beamPlan: D,
            chord: v,
            previousAnchor: (c = T[N - 1]) == null ? void 0 : c[0],
            nextAnchor: (u = T[N + 1]) == null ? void 0 : u[0],
            regenerateTuplets: !V.has(N)
          });
        J = Ds(J, co(v[0]));
      }
      for (; j < L.length && en(oe(L[j]), J) < 0; ) K.push(L[j++]);
      for (; j < L.length; ) R(L[j++]);
      O(I), K.sort((N, v) => en(oe(v), oe(N)));
      for (const N of K) {
        const v = oe(N);
        e.open("backup"), e.leaf("duration", String(_o(Oa(J, v), o))), e.close("backup"), J = v, R(N);
      }
      a = J;
    }
  }
}
function lh(e) {
  const t = /* @__PURE__ */ new Set();
  let n = -1, s = !1;
  const o = (i) => {
    if (n !== -1 && s) for (let r = n; r < i; r++) t.add(r);
    n = -1, s = !1;
  };
  return e.forEach((i, r) => {
    if (i[0].tuplet === null) {
      o(r);
      return;
    }
    n === -1 && (n = r), i.some(fh) && (s = !0);
  }), o(e.length), t;
}
function fh(e) {
  return e.passthrough.some((t) => t.name === "notations" && t.children.some((n) => n.name === "tuplet"));
}
function oe(e) {
  return Fa(e.onset);
}
function _o(e, t) {
  return e.num * t / e.den;
}
function hh(e, t) {
  var o;
  const n = /* @__PURE__ */ new Map(), s = t[0] ?? ((o = e.passthrough.find((i) => !i.lead)) == null ? void 0 : o.voice) ?? 1;
  for (const i of e.passthrough) {
    if (i.lead) continue;
    const r = t.includes(i.voice) ? i.voice : s, a = n.get(r);
    a ? a.push(i) : n.set(r, [i]);
  }
  for (const i of n.values()) i.sort((r, a) => en(oe(r), oe(a)));
  return n;
}
function uh(e, t, n, s) {
  if (t.clefChanges.length === 0) return;
  const o = n ?? [...e.keys()][0] ?? 1, i = e.get(o) ?? [];
  for (const r of t.clefChanges)
    i.push({
      element: bh(r.clef, s),
      onset: lo(ss(r.onset)),
      voice: o,
      lead: !1,
      divisions: 1
    });
  i.sort((r, a) => en(oe(r), oe(a))), e.set(o, i);
}
const pr = (e, t = {}) => ({
  name: e,
  attrs: t,
  children: [],
  text: ""
});
function dh(e, t, n) {
  var f, c, u;
  const s = [];
  for (const h of t)
    for (const d of e.staves[h].measures)
      for (const g of d.dynamics)
        s.push({
          staffIndex: h,
          measureIndex: d.index,
          onset: g.onset,
          voice: g.voice,
          source: g.source,
          placement: g.placement,
          directionType: mr({
            name: "dynamics",
            attrs: ((f = g.source) == null ? void 0 : f.markAttrs) ?? {},
            children: [pr(g.kind)],
            text: ""
          })
        });
  const o = e.wedges.filter((h) => t.includes(h.staffIndex)).sort((h, d) => h.start.measureIndex - d.start.measureIndex || h.start.onset - d.start.onset), i = (h) => (
    // A sortable scalar: measures never hold anywhere near 1e6 wholes.
    h.measureIndex * 1e6 + h.onset
  ), r = [];
  for (const h of o) {
    const d = i(h.start), g = new Set(r.filter((y) => y.stop >= d - 1e-9).map((y) => y.number));
    let m = 1;
    for (; g.has(m); ) m++;
    r.push({ stop: i(h.stop), number: m });
    const b = (y, x) => mr(pr("wedge", { type: y, number: String(m), ...(x == null ? void 0 : x.markAttrs) ?? {} }));
    s.push({
      staffIndex: h.staffIndex,
      measureIndex: h.start.measureIndex,
      onset: h.start.onset,
      voice: h.start.voice,
      source: h.start.source,
      placement: h.placement,
      directionType: b(h.kind, h.start.source)
    }), s.push({
      staffIndex: h.staffIndex,
      measureIndex: h.stop.measureIndex,
      onset: h.stop.onset,
      voice: h.stop.voice,
      source: h.stop.source,
      placement: void 0,
      directionType: b("stop", h.stop.source)
    });
  }
  const a = /* @__PURE__ */ new Map();
  for (const h of s) {
    const d = ((c = h.source) == null ? void 0 : c.element) ?? h, g = a.get(d);
    g ? g.push(h) : a.set(d, [h]);
  }
  const l = /* @__PURE__ */ new Map();
  for (const h of a.values()) {
    const d = h[0], g = d.source ? ph(d.source.element, h) : mh(d, n ? t.indexOf(d.staffIndex) + 1 : void 0), m = `${d.staffIndex}:${d.measureIndex}`, b = {
      element: g,
      onset: lo(ss(d.onset)),
      voice: d.voice,
      lead: !1,
      divisions: ((u = d.source) == null ? void 0 : u.divisions) ?? 1
    }, y = l.get(m);
    y ? y.push(b) : l.set(m, [b]);
  }
  return l;
}
function mr(e) {
  return { name: "direction-type", attrs: {}, children: [e], text: "" };
}
function ph(e, t) {
  var f;
  const n = [...t].sort((c, u) => c.source.slot - u.source.slot), s = [];
  let o = 0, i = 0;
  const r = e.children.length + n.length;
  for (let c = 0; c < r; c++)
    i < n.length && n[i].source.slot === c ? s.push(n[i++].directionType) : o < e.children.length && s.push(e.children[o++]);
  for (; i < n.length; ) s.push(n[i++].directionType);
  const a = (f = t.find((c) => c.placement !== void 0 && c.placement !== null)) == null ? void 0 : f.placement, l = a ? { placement: a, ...e.attrs } : e.attrs;
  return { ...e, attrs: l, children: s };
}
function mh(e, t) {
  const n = [e.directionType];
  return t !== void 0 && n.push({ name: "staff", attrs: {}, children: [], text: String(t) }), {
    name: "direction",
    attrs: e.placement ? { placement: e.placement } : {},
    children: n,
    text: ""
  };
}
function gh(e, t, n) {
  if (!t || t.length === 0) return;
  const s = n[0] ?? [...e.keys()][0] ?? t[0].voice, o = /* @__PURE__ */ new Set();
  for (const i of t) {
    const r = n.includes(i.voice) ? i.voice : s, a = e.get(r) ?? [];
    a.push(i), e.set(r, a), o.add(r);
  }
  for (const i of o) e.get(i).sort((r, a) => en(oe(r), oe(a)));
}
function bh(e, t) {
  const n = $a[e], s = (i, r) => ({ name: i, attrs: {}, children: [], text: r }), o = [s("sign", n.sign), s("line", String(n.line))];
  return n.octaveChange !== void 0 && o.push(s("clef-octave-change", String(n.octaveChange))), {
    name: "attributes",
    attrs: {},
    children: [{ name: "clef", attrs: { number: String(t) }, children: o, text: "" }],
    text: ""
  };
}
function yh(e, t, n, s) {
  const o = /* @__PURE__ */ new Map();
  let i = 0;
  for (const r of Xt(s)) {
    const a = To(e.clefAtOnset(t, i, n));
    for (const l of r) o.set(l.id, a);
    i += r[0].durationWholes;
  }
  return (r) => o.get(r.id) ?? To(e.clefAt(t, n));
}
function xh(e) {
  const t = /* @__PURE__ */ new Map();
  for (const n of e) {
    const s = t.get(n.voice);
    s ? s.push(n) : t.set(n.voice, [n]);
  }
  return t;
}
function vh(e, t, n) {
  const s = /* @__PURE__ */ new Map(), o = aa(e, t, n);
  for (const i of o)
    i.notes.forEach((r, a) => {
      const l = a === 0 ? "begin" : a === i.notes.length - 1 ? "end" : "continue";
      s.set(r.id, { position: l, direction: i.direction });
    });
  return s;
}
function Sh(e, t) {
  return t && e % 2 === 0 ? "down" : "up";
}
function wh(e, t, n) {
  let s = 0;
  const o = (i) => {
    if (i - s >= 2)
      for (let r = s; r < i; r++) {
        const a = r === s ? "begin" : r === i - 1 ? "end" : "continue";
        e.set(t[r].id, { position: a, direction: n });
      }
  };
  t.forEach((i, r) => {
    Mh(i.value) || (o(r), s = r + 1);
  }), o(t.length);
}
function Mh(e) {
  return e === "eighth" || e === "16th" || e === "32nd" || e === "64th";
}
function gr(e, t, n, s) {
  const o = s.chord[0], i = n === o, r = n.passthrough, a = n.pitch === null ? r.find((w) => w.name === "rest") : void 0, l = r.filter((w) => w.name === "notations"), f = new zn(
    e,
    r.length === 0 ? r : r.filter((w) => w.name !== "rest" && w.name !== "notations"),
    Th
  );
  if (e.open("note", n.hidden ? La : void 0), f.before("grace"), n.grace !== null && e.selfClose("grace", kh(n.grace, s.divisions)), f.before("chord"), n.chordWithPrevious && e.selfClose("chord"), f.before("pitch"), n.pitch === null) {
    const w = n.isMeasureRest ? { ...a == null ? void 0 : a.attrs, measure: "yes" } : a == null ? void 0 : a.attrs;
    if (a && a.children.length > 0) {
      e.open("rest", w);
      for (const E of a.children) e.element(E);
      e.close("rest");
    } else
      e.selfClose("rest", w);
  } else
    e.open("pitch"), e.leaf("step", n.pitch.step), n.pitch.alter !== 0 && e.leaf("alter", String(n.pitch.alter)), e.leaf("octave", String(n.pitch.octave)), e.close("pitch");
  f.before("duration"), n.grace === null && e.leaf("duration", String(_o(co(o), s.divisions))), f.before("tie");
  const c = t.tiedFromNote(n.id) !== void 0;
  c && e.selfClose("tie", { type: "stop" }), n.tiedToId !== null && e.selfClose("tie", { type: "start" }), f.before("voice"), e.leaf("voice", String(n.voice)), f.before("type"), n.isMeasureRest || e.leaf("type", n.value), f.before("dot");
  for (let w = 0; w < n.dots; w++) e.selfClose("dot");
  f.before("time-modification"), n.tuplet && (e.open("time-modification"), e.leaf("actual-notes", String(n.tuplet.actualNotes)), e.leaf("normal-notes", String(n.tuplet.normalNotes)), e.close("time-modification")), f.before("stem");
  const u = s.beamPlan.get(o.id);
  if (n.pitch !== null && o.value !== "whole" && o.value !== "breve") {
    const w = s.graceStem ? s.graceStem : u ? u.direction : Gn(
      s.chord.flatMap((E) => E.pitch ? [ht(E.pitch)] : []),
      s.middleLine
    );
    e.leaf("stem", w);
  }
  f.before("staff"), s.multiStaff && e.leaf("staff", String(s.staffNumber)), f.before("beam"), u && i && e.leaf("beam", u.position, { number: "1" });
  const h = s.previousAnchor, d = s.nextAnchor, g = s.regenerateTuplets && i && n.tuplet !== null, m = g && (h === void 0 || h.tuplet === null), b = g && (d === void 0 || d.tuplet === null), y = [], x = [];
  t.slurs.forEach((w, E) => {
    const B = E % 6 + 1;
    w.endNoteId === n.id && y.push(B), w.startNoteId === n.id && x.push(B);
  });
  const S = c || n.tiedToId !== null || m || b || y.length > 0 || x.length > 0 || n.articulations.length > 0 || n.fermata !== null || n.arpeggiate;
  if (f.before("notations"), S) {
    const w = l[0], E = n.articulations.length > 0 ? w == null ? void 0 : w.children.find((B) => B.name === "articulations") : void 0;
    e.open("notations", w == null ? void 0 : w.attrs), c && e.selfClose("tied", { type: "stop" }), n.tiedToId !== null && e.selfClose("tied", { type: "start" }), m && e.selfClose("tuplet", { type: "start", number: "1" }), b && e.selfClose("tuplet", { type: "stop", number: "1" });
    for (const B of y) e.selfClose("slur", { type: "stop", number: String(B) });
    for (const B of x) e.selfClose("slur", { type: "start", number: String(B) });
    if (n.articulations.length > 0) {
      e.open("articulations", E == null ? void 0 : E.attrs);
      for (const B of n.articulations) e.selfClose(B);
      if (E) for (const B of E.children) e.element(B);
      e.close("articulations");
    }
    if (n.fermata !== null && e.selfClose("fermata", { type: n.fermata }), n.arpeggiate && e.selfClose("arpeggiate"), w)
      for (const B of w.children) B !== E && e.element(B);
    e.close("notations");
    for (let B = 1; B < l.length; B++) e.element(l[B]);
  } else
    for (const w of l) e.element(w);
  f.before("lyric");
  for (const w of n.lyrics) e.element(Ra(w));
  f.rest(), e.close("note");
}
function kh(e, t) {
  const n = {};
  return e.stealTimePrevious !== null && (n["steal-time-previous"] = String(e.stealTimePrevious)), e.stealTimeFollowing !== null && (n["steal-time-following"] = String(e.stealTimeFollowing)), e.makeTime !== null && (n["make-time"] = String(Math.round(e.makeTime * 4 * t))), e.slash && (n.slash = "yes"), n;
}
function Eh(e) {
  const t = e.endingStart && _a("start", e.endingStart.numbers, e.endingStart);
  return e.startBarline === "repeatStart" ? { style: "heavy-light", repeat: { direction: "forward" }, ending: t } : t && { ending: t };
}
function Bh(e, t, n) {
  const s = t.endingEnd && n && _a(t.endingEnd.kind, n.numbers, t.endingEnd);
  switch (e) {
    case "double":
      return { style: "light-light", ending: s };
    case "final":
      return { style: "light-heavy", ending: s };
    case "repeatEnd": {
      const o = t.repeatTimes;
      return { style: "light-heavy", ending: s, repeat: { direction: "backward", times: o } };
    }
    default:
      return s && { ending: s };
  }
}
function _a(e, t, n) {
  return {
    name: "ending",
    attrs: { number: t.join(", "), type: e, ...n.attrs },
    children: os,
    text: "text" in n ? n.text ?? "" : ""
  };
}
function br(e, t, n, s) {
  if (!t) {
    for (const a of n) e.element(a);
    return;
  }
  const o = n[0], i = o ? o.children.filter(
    (a) => !(t.style && a.name === "bar-style") && !(t.repeat && a.name === "repeat")
  ) : os;
  e.open("barline", { ...o == null ? void 0 : o.attrs, location: s });
  const r = new zn(e, i, Ih);
  if (r.before("bar-style"), t.style && e.leaf("bar-style", t.style), r.before("ending"), t.ending && e.element(t.ending), r.before("repeat"), t.repeat) {
    const { direction: a, times: l } = t.repeat;
    e.selfClose("repeat", l === void 0 ? { direction: a } : { direction: a, times: String(l) });
  }
  r.rest(), e.close("barline");
  for (let a = 1; a < n.length; a++) e.element(n[a]);
}
const Th = vs([
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
]), yr = vs([
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
]), Ih = vs([
  "bar-style",
  "footnote",
  "level",
  "wavy-line",
  "segno",
  "coda",
  "fermata",
  "ending",
  "repeat"
]), Nh = vs([
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
]), Ah = vs([
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
function vs(e) {
  return new Map(e.map((t, n) => [t, n]));
}
var de, Me, ln, Kn;
class zn {
  constructor(t, n, s) {
    U(this, ln);
    U(this, de);
    U(this, Me, 0);
    this.xml = t, this.order = s, F(this, de, n.length < 2 ? n : [...n].sort((o, i) => A(this, ln, Kn).call(this, o.name) - A(this, ln, Kn).call(this, i.name)));
  }
  before(t) {
    if (p(this, Me) >= p(this, de).length) return;
    const n = A(this, ln, Kn).call(this, t);
    for (; p(this, Me) < p(this, de).length && A(this, ln, Kn).call(this, p(this, de)[p(this, Me)].name) < n; )
      this.xml.element(p(this, de)[go(this, Me)._++]);
  }
  rest() {
    for (; p(this, Me) < p(this, de).length; ) this.xml.element(p(this, de)[go(this, Me)._++]);
  }
}
de = new WeakMap(), Me = new WeakMap(), ln = new WeakSet(), Kn = function(t) {
  return this.order.get(t) ?? this.order.size;
};
function ci(e, t) {
  if (t === 1) return e;
  if (e.children.length === 0) {
    if (e.name !== "offset" && e.name !== "duration") return e;
    const o = Number(e.text.trim());
    return Number.isFinite(o) && e.text.trim() !== "" ? { ...e, text: String(o * t) } : e;
  }
  let n = !1;
  const s = e.children.map((o) => {
    const i = ci(o, t);
    return i !== o && (n = !0), i;
  });
  return n ? { ...e, children: s } : e;
}
function Ch(e, t, n) {
  var o;
  let s = 1;
  for (const i of e)
    s = Xn(s, co(i).den), ((o = i.grace) == null ? void 0 : o.makeTime) != null && (s = Xn(s, ss(i.grace.makeTime).den));
  for (const i of t)
    s = Xn(s, Fa(i.onset).den), s = Xn(s, i.divisions);
  for (const i of n) s = Xn(s, ss(i).den);
  return s;
}
function Ph(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function Oh(e) {
  return e.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}
function Mo(e) {
  return e ? Object.entries(e).map(([t, n]) => ` ${t}="${Oh(n)}"`).join("") : "";
}
class Fh {
  constructor() {
    vt(this, "lines", []);
    vt(this, "depth", 0);
  }
  get indent() {
    return "  ".repeat(this.depth);
  }
  /** A line with no indentation and no escaping: the prolog and doctype. */
  raw(t) {
    this.lines.push(t);
  }
  open(t, n) {
    this.lines.push(`${this.indent}<${t}${Mo(n)}>`), this.depth++;
  }
  close(t) {
    this.depth--, this.lines.push(`${this.indent}</${t}>`);
  }
  leaf(t, n, s) {
    this.lines.push(`${this.indent}<${t}${Mo(s)}>${Ph(n)}</${t}>`);
  }
  selfClose(t, n) {
    this.lines.push(`${this.indent}<${t}${Mo(n)}/>`);
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
function Da(e) {
  return new Wh(e).parseDocument();
}
class Wh {
  constructor(t) {
    vt(this, "src");
    vt(this, "pos", 0);
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
        const a = t.map((l) => `<${l.name}>`).join(" ");
        throw new Error(`xml: unexpected end of input with unclosed tags: ${a || "(none)"}`);
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
        const a = this.src.indexOf("]]>", this.pos);
        if (a === -1) throw new Error("xml: unterminated CDATA section");
        const l = this.src.slice(this.pos + 9, a), f = t[t.length - 1];
        f && (f.text += l), this.pos = a + 3;
        continue;
      }
      if (this.startsWith("</")) {
        const a = this.readCloseTag(), l = t.pop();
        if (!l) throw new Error(`xml: close tag </${a}> with no open element`);
        if (l.name !== a)
          throw new Error(`xml: close tag </${a}> does not match open tag <${l.name}>`);
        if (t.length === 0) {
          n = l;
          break;
        }
        continue;
      }
      if (this.startsWith("<")) {
        const { element: a, selfClosing: l } = this.readOpenTag(), f = t[t.length - 1];
        if (f) f.children.push(a);
        else if (n && t.length === 0)
          throw new Error(`xml: unexpected second root element <${a.name}>`);
        if (!l)
          t.push(a);
        else if (t.length === 0) {
          n = a;
          break;
        }
        continue;
      }
      const s = this.src.indexOf("<", this.pos), o = s === -1 ? this.src.length : s, i = this.src.slice(this.pos, o), r = t[t.length - 1];
      r && (r.text += xr(i)), this.pos = o;
    }
    if (!n) throw new Error("xml: no root element found");
    return Ga(n);
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
      const o = this.readName();
      if (!o)
        throw new Error(`xml: malformed attribute in <${t}> near ${JSON.stringify(this.peek(16))}`);
      if (this.skipWhitespace(), this.src[this.pos] !== "=")
        throw new Error(`xml: attribute "${o}" in <${t}> has no value (expected '=')`);
      this.pos++, this.skipWhitespace();
      const i = this.src[this.pos];
      if (i !== '"' && i !== "'")
        throw new Error(`xml: attribute "${o}" in <${t}> value is not quoted`);
      this.pos++;
      const r = this.src.indexOf(i, this.pos);
      if (r === -1) throw new Error(`xml: unterminated attribute value for "${o}" in <${t}>`);
      n[o] = xr(this.src.slice(this.pos, r)), this.pos = r + 1;
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
function xr(e) {
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
function Ga(e) {
  return Object.freeze({
    name: e.name,
    attrs: Object.freeze(e.attrs),
    children: Object.freeze(e.children.map(Ga)),
    text: e.text
  });
}
function lt(e, t) {
  return e.children.find((n) => n.name === t);
}
function $t(e, t) {
  return e.children.filter((n) => n.name === t);
}
function ct(e, t) {
  const n = lt(e, t);
  return n ? n.text.trim() : void 0;
}
function Do(e, t) {
  const n = [], s = (o) => {
    for (const i of o.children)
      i.name === t && n.push(i), s(i);
  };
  return s(e), n;
}
function Ju() {
  return { dropped: /* @__PURE__ */ new Map(), passthrough: /* @__PURE__ */ new Map(), fallbacks: [] };
}
function za(e, t = {}) {
  var D;
  const n = Da(e);
  if (n.name !== "score-partwise") {
    const M = n.name === "score-timewise" ? " (score-timewise is not supported; convert it to score-partwise first)" : "";
    throw new Error(`importMusicXml: expected a <score-partwise> root element, got <${n.name}>${M}`);
  }
  const s = new fu(t.diagnostics), o = new wc(), i = [];
  for (const M of n.children)
    M.name === "part-list" || M.name === "part" || (i.push(M), s.keep(M.name));
  i.length > 0 && (o.headerPassthrough = Object.freeze(i));
  const r = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Set(), l = [], f = [], c = /* @__PURE__ */ new Map(), u = /* @__PURE__ */ new Map(), h = (M, I) => {
    const C = M.children.filter((O) => O.name !== I);
    for (const O of C) s.keep(O.name);
    return C.length > 0 ? Object.freeze(C) : Nr;
  }, d = lt(n, "part-list");
  if (d) {
    for (const M of d.children)
      if (M.name === "score-part") {
        const I = M.attrs.id ?? "";
        l.push(I);
        const C = ct(M, "part-name");
        C !== void 0 && C !== "" && r.set(I, C), ((D = lt(M, "part-name")) == null ? void 0 : D.attrs["print-object"]) === "no" && a.add(I), u.set(I, h(M, "part-name"));
      } else if (M.name === "part-group") {
        const I = M.attrs.number ?? "1";
        if (M.attrs.type === "start") {
          const C = vu(ct(M, "group-symbol")), O = h(M, "group-symbol");
          c.set(I, { symbol: C, firstScorePartIndex: l.length, passthrough: O });
        } else if (M.attrs.type === "stop") {
          const C = c.get(I);
          C && (c.delete(I), f.push({
            symbol: C.symbol,
            firstScorePartIndex: C.firstScorePartIndex,
            lastScorePartIndex: l.length - 1,
            passthrough: C.passthrough
          }));
        }
      }
  }
  const g = $t(n, "part"), m = [];
  let b = 0;
  for (const M of g) {
    const I = M.attrs.id ?? "", C = Sr(M), O = Math.max(1, It(C && ct(C, "staves"), 1)), L = Math.max(1, It(C && ct(C, "divisions"), 1)), R = b;
    for (let j = 0; j < O; j++)
      R + j >= o.staves.length && o.appendStaff();
    if (b += O, C) {
      const j = /* @__PURE__ */ new Set();
      for (const J of $t(C, "clef")) {
        const T = Math.max(1, It(J.attrs.number, 1)) - 1, V = o.staves[R + T];
        V && !j.has(T) && (j.add(T), s.at(I, wu(M)), V.clef = Xa(J, s));
      }
    }
    const K = Do(M, "beam").length > 0;
    m.push({ id: I, baseStaffIndex: R, staffCount: O, divisions: L, el: M, hasBeams: K });
  }
  const y = new Map(m.map((M) => [M.id, M])), x = m[0];
  if (x) {
    const M = Sr(x.el), I = M && lt(M, "key"), C = I && ct(I, "fifths");
    C != null && (o.keyFifths = It(C, 0));
    const O = M && lt(M, "time"), L = O ? Ka(O) : void 0;
    L && (o.time = L);
  }
  const S = pu(n);
  S !== void 0 && (o.tempoBpm = S.bpm);
  const w = (M) => {
    const I = y.get(l[M] ?? "");
    return I ? Su(I.baseStaffIndex, I.staffCount) : [];
  };
  l.some((M) => y.has(M)) && (o.parts.length = 0);
  for (let M = 0; M < l.length; M++) {
    const I = w(M);
    if (I.length === 0) continue;
    const C = l[M];
    o.addPart(I, r.get(C), u.get(C), a.has(C));
  }
  for (const M of f) {
    const I = [];
    for (let C = M.firstScorePartIndex; C <= M.lastScorePartIndex; C++)
      I.push(...w(C));
    I.sort((C, O) => C - O), I.length > 0 && o.addPart(I, void 0, M.passthrough, !1, M.symbol), I.length < 2 && s.drop("part-group");
  }
  const E = [], B = eu(m);
  for (const M of m) {
    const I = $t(M.el, "measure"), C = I.length;
    let O = M.divisions;
    const L = [], R = Yh(I);
    for (let K = 0; K < C; K++) {
      const j = I[K], J = K === C - 1;
      s.at(M.id, j.attrs.number ?? String(K + 1));
      const T = [];
      for (let et = 0; et < M.staffCount; et++) {
        const z = o.appendMeasure(M.baseStaffIndex + et);
        j.attrs.number !== void 0 && (z.number = j.attrs.number), T.push(z);
      }
      const V = [];
      for (const et of $t(j, "attributes")) {
        if (!et.children.some((Z) => ko.has(Z.name))) continue;
        const z = ct(et, "divisions");
        z !== void 0 && (O = Math.max(1, It(z, O))), zh(et, T, K, o);
        for (const Z of et.children)
          ko.has(Z.name) ? au(Z, s) : (V.push(Z), s.keep(Z.name));
      }
      V.length > 0 && (T[0].attributesPassthrough = Object.freeze(V));
      const N = [];
      for (const et of $t(j, "barline")) {
        const z = jh(et, T, J, R);
        if (z)
          if (N.push(z), z === et) s.keep("barline");
          else for (const Z of z.children) s.keep(Z.name);
      }
      N.length > 0 && (T[0].barlinePassthrough = Object.freeze(N));
      const v = { last: null }, k = new Lh(M, T, O), H = new Set(K === 0 ? T.map((et, z) => z) : []), q = j.children;
      for (let et = 0; et < q.length; et++) {
        const z = q[et];
        if (z.name === "note") {
          if (lt(z, "grace") && !qh(z, q, et)) {
            v.last = null, k.grace(z), s.keep("grace");
            continue;
          }
          const Z = Qh(z, M, T, K, O, E, o, s, v, B.get(K));
          k.sourceTime(z, O);
          for (const Nt of (Z == null ? void 0 : Z.notes) ?? []) k.noteBuilt(Z.k, Nt);
        } else if (z.name === "forward") {
          v.last = null;
          const Z = lu(z, M, T, O, o, s, cu(q, et));
          k.moved(z, O, 1);
          for (const Nt of (Z == null ? void 0 : Z.notes) ?? []) k.noteBuilt(Z.k, Nt);
        } else if (z.name === "backup")
          v.last = null, k.moved(z, O, -1);
        else if (z.name === "attributes")
          if (z.children.some((Z) => ko.has(Z.name)))
            Gh(z, T, k.position(), H, s), k.endLead();
          else {
            k.item(z), z.children.length === 0 && s.keep("attributes");
            for (const Z of z.children) s.keep(Z.name);
          }
        else if (z.name === "barline")
          k.endLead();
        else if (S !== void 0 && M === m[0] && K === 0 && Rh(z, S))
          k.endLead();
        else {
          k.item(z);
          const Z = z.name === "direction" ? _h(z) : null;
          Z ? L.push({ element: z, m: K, measureObjs: T, pieces: Z, order: L.length }) : z.name === "direction" ? zo(z, s) : s.keep(z.name), Hh.has(z.name) || s.unrecognized(z.name, "measure");
        }
      }
      k.finish();
    }
    Dh(L, M, o, s);
  }
  hu(E, o), uu(E, o);
  for (const M of E) iu(M, o, s);
  return o;
}
function Rh(e, t) {
  if (e.name !== "direction" || Object.keys(e.attrs).join(",") !== "placement" || e.attrs.placement !== "above") return !1;
  let n = !1;
  for (const s of e.children)
    if (s.name === "direction-type") {
      if (s.children.length !== 1 || s.children[0] !== t.source || n) return !1;
      const o = s.children[0];
      if (o.children.map((r) => r.name).join(",") !== "beat-unit,per-minute" || ct(o, "beat-unit") !== "quarter" || Object.keys(o.attrs).length > 0) return !1;
      n = !0;
    } else if (s.name === "sound") {
      if (s.children.length > 0 || Object.keys(s.attrs).join(",") !== "tempo" || Number.parseFloat(s.attrs.tempo) !== t.bpm) return !1;
    } else
      return !1;
  return n;
}
var fn, as, ke, Ee, Ht, hn, Be, re, Go, Ya, qn;
class Lh {
  constructor(t, n, s) {
    U(this, re);
    U(this, fn, []);
    U(this, as, /* @__PURE__ */ new Map());
    U(this, ke, []);
    U(this, Ee, tn);
    U(this, Ht, null);
    U(this, hn, !1);
    U(this, Be, !0);
    this.info = t, this.measureObjs = n, this.divisions = s;
  }
  /** The onset (quarters) an element read right now is anchored at, the same
   *  rule `item` applies: the previous note's stream clock when nothing has
   *  moved the cursor since, else the source cursor. An owned
   *  `<attributes>`'s clefs are placed by it (M6 Slice 4). */
  position() {
    return p(this, Ht) && !p(this, hn) ? A(this, re, qn).call(this, p(this, Ht).k, p(this, Ht).voice) : p(this, Ee);
  }
  /** Nothing read so far makes a later element "lead" any more. */
  endLead() {
    F(this, Be, !1);
  }
  /**
   * A positional element at the current position. Only a `<print>` can lead:
   * anything else at the very start of a measure is simply at onset 0 in the
   * first stream, which is also where export writes it, so it reads back the
   * same; a "lead" direction would read back as an onset-0 one.
   */
  item(t) {
    const n = p(this, Be) && t.name === "print", s = { element: t, fallback: p(this, Ht), k: 0, voice: 1, onset: tn, lead: n };
    p(this, fn).push(s), !n && (p(this, Ht) && !p(this, hn) ? (s.k = p(this, Ht).k, s.voice = p(this, Ht).voice, s.onset = A(this, re, qn).call(this, p(this, Ht).k, p(this, Ht).voice)) : (s.onset = p(this, Ee), p(this, ke).push(s)));
  }
  /** A grace note, in its own stream at that stream's clock. */
  grace(t) {
    F(this, Be, !1);
    const n = Math.min(Math.max(1, It(ct(t, "staff"), 1)) - 1, this.info.staffCount - 1), s = Math.max(1, It(ct(t, "voice"), 1));
    p(this, fn).push({ element: t, fallback: null, k: n, voice: s, onset: A(this, re, qn).call(this, n, s), lead: !1 });
  }
  /** Advance the source cursor past a `<note>` (its own `<duration>`). */
  sourceTime(t, n) {
    if (F(this, Be, !1), lt(t, "chord")) return;
    const s = It(ct(t, "duration"), 0);
    s > 0 && F(this, Ee, Ds(p(this, Ee), Oe({ num: s, den: n })));
  }
  /** A `<backup>` (`sign` -1) or `<forward>` (+1) moved the source cursor. */
  moved(t, n, s) {
    F(this, Be, !1), F(this, hn, !0), A(this, re, Go).call(this);
    const o = It(ct(t, "duration"), 0);
    if (o <= 0) return;
    const i = (s > 0 ? Ds : Oa)(p(this, Ee), Oe({ num: o, den: n }));
    F(this, Ee, i.num < 0 ? tn : i);
  }
  /** A model note (or `<forward>` rest) was appended to staff `k`. */
  noteBuilt(t, n) {
    F(this, Be, !1), n.chordWithPrevious || p(this, as).set(`${t}:${n.voice}`, Ds(A(this, re, qn).call(this, t, n.voice), co(n)));
    for (const s of p(this, ke))
      s.k = t, s.voice = n.voice;
    p(this, ke).length = 0, F(this, Ht, { k: t, voice: n.voice }), F(this, hn, !1);
  }
  /** Settle every anchor onto its staff's `Measure`. */
  finish() {
    if (p(this, fn).length === 0) return;
    A(this, re, Go).call(this);
    const t = this.measureObjs.map(() => []);
    for (const n of p(this, fn))
      n.lead || A(this, re, Ya).call(this, n), t[n.k].push({
        element: n.element,
        onset: lo(n.onset),
        voice: n.voice,
        lead: n.lead,
        divisions: this.divisions
      });
    t.forEach((n, s) => {
      n.length > 0 && (this.measureObjs[s].passthrough = Object.freeze(n));
    });
  }
}
fn = new WeakMap(), as = new WeakMap(), ke = new WeakMap(), Ee = new WeakMap(), Ht = new WeakMap(), hn = new WeakMap(), Be = new WeakMap(), re = new WeakSet(), /** Waiting anchors with a previous note settle on its stream. */
Go = function() {
  const t = [];
  for (const n of p(this, ke))
    n.fallback ? (n.k = n.fallback.k, n.voice = n.fallback.voice) : t.push(n);
  p(this, ke).length = 0, p(this, ke).push(...t);
}, /** Move an anchor whose voice has no notes on its staff in this measure to
 *  the first stream export will actually walk: that staff's first voice,
 *  else the first staff of the part with any notes. */
Ya = function(t) {
  const n = this.measureObjs[t.k].notes;
  if (n.some((o) => o.voice === t.voice)) return;
  if (n.length > 0) {
    t.voice = n[0].voice;
    return;
  }
  const s = this.measureObjs.findIndex((o) => o.notes.length > 0);
  s !== -1 && (t.k = s, t.voice = this.measureObjs[s].notes[0].voice);
}, qn = function(t, n) {
  return p(this, as).get(`${t}:${n}`) ?? tn;
};
const $h = new Set(Ir);
function _h(e) {
  const t = [];
  return e.children.forEach((n, s) => {
    if (n.name !== "direction-type" || n.children.length !== 1 || Object.keys(n.attrs).length > 0) return;
    const o = n.children[0];
    if (o.name === "dynamics") {
      const i = o.children.length === 1 ? o.children[0] : void 0;
      if (!i || !$h.has(i.name) || i.children.length > 0 || i.text.trim() !== "" || Object.keys(i.attrs).length > 0) return;
      t.push({ slot: s, kind: "dynamic", dynamic: i.name, markAttrs: o.attrs });
    } else if (o.name === "wedge") {
      const i = o.attrs.type;
      if (i !== "crescendo" && i !== "diminuendo" && i !== "stop" || o.children.length > 0) return;
      const { type: r, number: a = "1", ...l } = o.attrs;
      t.push({ slot: s, kind: "wedge", type: i, number: a, markAttrs: l });
    }
  }), t.length > 0 ? t : null;
}
function Dh(e, t, n, s) {
  if (e.length === 0) return;
  const o = [];
  for (const m of e) {
    const b = m.measureObjs.findIndex((w) => w.passthrough.some((E) => E.element === m.element));
    if (b === -1) continue;
    const y = m.measureObjs[b].passthrough.find((w) => w.element === m.element), x = ct(m.element, "staff"), S = x === void 0 ? b : Math.min(Math.max(1, It(x, 1)), t.staffCount) - 1;
    o.push({ candidate: m, k: b, anchor: y, displayK: S, onset: y.onset.num / y.onset.den });
  }
  const i = [];
  for (const m of o)
    for (const b of m.candidate.pieces) b.kind === "wedge" && i.push({ at: m, piece: b });
  i.sort(
    (m, b) => m.at.candidate.m - b.at.candidate.m || m.at.onset - b.at.onset || m.at.candidate.order - b.at.candidate.order || m.piece.slot - b.piece.slot
  );
  const r = /* @__PURE__ */ new Map(), a = [], l = /* @__PURE__ */ new Set();
  for (const m of i) {
    if (m.piece.type !== "stop") {
      r.set(m.piece.number, m);
      continue;
    }
    const b = r.get(m.piece.number);
    b && (r.delete(m.piece.number), a.push([b, m]), l.add(b), l.add(m));
  }
  const f = /* @__PURE__ */ new Set();
  for (const m of i) l.has(m) || f.add(m.at.candidate);
  for (let m = f.size > 0; m; ) {
    m = !1;
    for (const [b, y] of a) {
      const x = f.has(b.at.candidate), S = f.has(y.at.candidate);
      x !== S && (f.add(x ? y.at.candidate : b.at.candidate), m = !0);
    }
  }
  const c = /* @__PURE__ */ new Map(), u = /* @__PURE__ */ new Map(), h = /* @__PURE__ */ new Map(), d = /* @__PURE__ */ new Map();
  for (const m of o) {
    const { candidate: b } = m;
    if (f.has(b)) {
      zo(b.element, s);
      continue;
    }
    const y = b.pieces.some((L) => L.kind === "dynamic" || L.type !== "stop"), x = b.element.attrs.placement, S = y && (x === "above" || x === "below") ? x : null;
    u.set(b, S);
    const w = new Set(b.pieces.map((L) => L.slot));
    let E = b.element.attrs;
    if (S !== null) {
      const { placement: L, ...R } = E;
      E = R;
    }
    const B = Object.freeze({
      ...b.element,
      attrs: Object.freeze(E),
      children: Object.freeze(b.element.children.filter((L, R) => !w.has(R))),
      // A `<direction>` has no character data of its own, only the
      // indentation between children, which would read as content once
      // every child is cut out (and export regenerates indentation).
      text: ""
    }), D = b.pieces.length === 1 && Object.keys(b.pieces[0].markAttrs).length === 0 && Object.keys(E).length === 0 && B.children.every((L) => L.name === "staff" && t.staffCount > 1 && It(L.text, 0) === m.displayK + 1) && B.children.length === (t.staffCount > 1 ? 1 : 0);
    for (const L of b.pieces)
      D || c.set(L, Object.freeze({ element: B, slot: L.slot, divisions: m.anchor.divisions, markAttrs: L.markAttrs }));
    zo(B, s);
    const M = b.measureObjs[m.k], I = h.get(M) ?? /* @__PURE__ */ new Set();
    I.add(b.element), h.set(M, I);
    const C = b.measureObjs[m.displayK], O = vr(C, m.k === m.displayK ? m.anchor.voice : void 0);
    for (const L of b.pieces) {
      if (L.kind !== "dynamic") continue;
      const R = d.get(C) ?? [];
      R.push(Object.freeze({ kind: L.dynamic, onset: m.onset, placement: S, voice: O, source: c.get(L) ?? null })), d.set(C, R);
    }
  }
  for (const [m, b] of h) {
    const y = m.passthrough.filter((x) => !b.has(x.element));
    m.passthrough = y.length > 0 ? Object.freeze(y) : Nr;
  }
  for (const [m, b] of d) m.dynamics = Object.freeze(Mc([...m.dynamics, ...b]));
  const g = [];
  for (const [m, b] of a) {
    if (f.has(m.at.candidate) || f.has(b.at.candidate)) continue;
    const y = m.at.displayK, x = t.baseStaffIndex + y, S = (w) => {
      const E = w.at.candidate.measureObjs[y];
      return Object.freeze({
        measureIndex: w.at.candidate.m,
        onset: w.at.onset,
        voice: vr(E, w.at.k === y ? w.at.anchor.voice : void 0),
        source: c.get(w.piece) ?? null
      });
    };
    g.push(
      Object.freeze({
        kind: m.piece.type,
        staffIndex: x,
        placement: u.get(m.at.candidate) ?? null,
        start: S(m),
        stop: S(b)
      })
    );
  }
  n.wedges.push(...g);
}
function vr(e, t) {
  var n;
  return t !== void 0 && e.notes.some((s) => s.voice === t) ? t : ((n = e.notes[0]) == null ? void 0 : n.voice) ?? t ?? 1;
}
function Gh(e, t, n, s, o) {
  const i = lo(n), r = i.num / i.den;
  for (const a of $t(e, "clef")) {
    const l = Math.max(1, It(a.attrs.number, 1)) - 1, f = t[l];
    if (!f || s.delete(l)) continue;
    const c = Xa(a, o);
    if (r === 0) {
      f.clef !== void 0 && o.drop("clef"), f.clef = c;
      continue;
    }
    const u = f.clefChanges.filter((h) => Math.abs(h.onset - r) > 1e-9);
    u.length < f.clefChanges.length && o.drop("clef"), f.clefChanges = [...u, { onset: r, clef: c }].sort((h, d) => h.onset - d.onset);
  }
}
function zh(e, t, n, s) {
  const o = lt(e, "key");
  if (o) {
    const r = ct(o, "fifths");
    if (r !== void 0) {
      const a = It(r, 0);
      if (n !== 0 || a !== s.keyFifths)
        for (const l of t) l.keyFifths = a;
    }
  }
  const i = lt(e, "time");
  if (i) {
    const r = Ka(i);
    if (r && (n !== 0 || !xu(r, s.time)))
      for (const a of t) a.time = r;
  }
}
function Yh(e) {
  var s;
  const t = /* @__PURE__ */ new Set();
  let n;
  for (const o of e)
    for (const i of $t(o, "barline")) {
      const r = lt(i, "ending");
      if (!r) continue;
      const a = i.attrs.location ?? "right", l = (s = Ua(r.attrs.number)) == null ? void 0 : s.join(), f = r.attrs.type;
      if (f === "start" && a === "left" && l !== void 0) {
        n = { el: r, numbers: l };
        continue;
      }
      (f === "stop" || f === "discontinue") && a === "right" && (n == null ? void 0 : n.numbers) === l && (t.add(n.el), t.add(r)), n = void 0;
    }
  return t;
}
function Ua(e) {
  const t = (e ?? "").split(/[\s,]+/).filter((n) => n !== "");
  if (!(t.length === 0 || !t.every((n) => /^[1-9]\d*$/.test(n))))
    return [...new Set(t.map(Number))].sort((n, s) => n - s);
}
function Uh(e) {
  const { number: t, type: n, ...s } = e.attrs;
  return Object.freeze(s);
}
function jh(e, t, n, s) {
  const o = e.attrs.location ?? "right", i = lt(e, "repeat"), r = i == null ? void 0 : i.attrs.direction, a = ct(e, "bar-style");
  let l = !1, f = !1;
  if (o === "left") {
    if (r === "forward") {
      for (const d of t) d.startBarline = "repeatStart";
      l = !0, f = !0;
    }
  } else if (o === "right") {
    if (a === "light-light") {
      for (const d of t) d.endBarline = "double";
      l = !0;
    } else if (a === "light-heavy" && r === "backward") {
      const d = i.attrs.times;
      for (const g of t)
        g.endBarline = "repeatEnd", d !== void 0 && /^[1-9]\d*$/.test(d) && (g.repeatTimes = Number(d));
      l = !0, f = !0;
    } else if (a === "light-heavy") {
      if (!n) for (const d of t) d.endBarline = "final";
      l = !0;
    }
  }
  const c = lt(e, "ending"), u = c !== void 0 && s.has(c);
  if (u) {
    const d = Uh(c);
    if (c.attrs.type === "start") {
      const g = Object.freeze({
        numbers: Object.freeze(Ua(c.attrs.number)),
        text: c.text.trim() || null,
        attrs: d
      });
      for (const m of t) m.endingStart = g;
    } else {
      const g = Object.freeze({ kind: c.attrs.type, attrs: d });
      for (const m of t) m.endingEnd = g;
    }
  }
  if (!l && !u) return e;
  const h = e.children.filter(
    (d) => !(l && d.name === "bar-style" || f && d.name === "repeat" || u && d === c)
  );
  if (h.length !== 0)
    return Object.freeze({ ...e, children: Object.freeze(h) });
}
const Hh = /* @__PURE__ */ new Set([
  "direction",
  "print",
  "sound",
  "harmony",
  "figured-bass",
  "grouping",
  "link",
  "bookmark",
  "listening"
]), ko = /* @__PURE__ */ new Set(["divisions", "key", "time", "clef", "staves"]), Vh = {
  key: /* @__PURE__ */ new Set(["fifths"]),
  time: /* @__PURE__ */ new Set(["beats", "beat-type"]),
  clef: /* @__PURE__ */ new Set(["sign", "line", "clef-octave-change"])
}, Xh = /* @__PURE__ */ new Set([
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
]), Kh = /* @__PURE__ */ new Set([
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
function qh(e, t, n) {
  if (!lt(e, "pitch") || lt(e, "chord") || lt(e, "time-modification")) return !1;
  for (let s = n + 1; s < t.length; s++)
    if (t[s].name === "note")
      return !(lt(t[s], "grace") && lt(t[s], "chord"));
  return !0;
}
function Jh(e, t) {
  const n = (o) => {
    if (o === void 0) return null;
    const i = Number.parseFloat(o);
    return Number.isFinite(i) ? i : null;
  }, s = n(e.attrs["make-time"]);
  return Object.freeze({
    slash: e.attrs.slash === "yes",
    stealTimePrevious: n(e.attrs["steal-time-previous"]),
    stealTimeFollowing: n(e.attrs["steal-time-following"]),
    makeTime: s === null ? null : s / (t * 4)
  });
}
function Qh(e, t, n, s, o, i, r, a, l, f) {
  const c = lt(e, "chord") !== void 0, u = c ? l.last : null;
  if (c && (!u || !u.pitched || !lt(e, "pitch")))
    return a.drop("chord"), a.warnOnce("chord", "importMusicXml: <chord/> note with no pitched note to join; dropping it"), null;
  const h = Math.max(1, It(ct(e, "staff"), 1)), d = Math.min(h - 1, n.length - 1), g = u ? u.k : d, m = u ? u.measure : n[g] ?? n[0];
  if (!m) return null;
  const b = u ? u.staffIndex : t.baseStaffIndex + g, y = u ? u.voice : Math.max(1, It(ct(e, "voice"), 1)), x = u !== null;
  let S = null;
  const w = lt(e, "rest");
  if (!w) {
    const k = lt(e, "pitch");
    k ? S = {
      step: ct(k, "step") ?? "C",
      alter: Number.parseFloat(ct(k, "alter") ?? "0") || 0,
      octave: It(ct(k, "octave"), 4)
    } : lt(e, "unpitched") && a.drop("unpitched");
  }
  const E = lt(e, "time-modification");
  let B;
  if (E) {
    const k = It(ct(E, "actual-notes"), 1), H = It(ct(E, "normal-notes"), 1);
    k !== H && (B = { actualNotes: k, normalNotes: H });
  }
  const D = Math.min(2, $t(e, "dot").length), M = $t(e, "notations"), I = su(M), C = ou(e), O = t.hasBeams ? Zh(e) : null, L = e.attrs["print-object"] === "no";
  let R;
  const K = [], j = Jo(r.timeAt(s, b));
  if (w && (ja(e, o, f !== void 0) || tu(e, o, j))) {
    const k = f === void 0 ? j : Math.min(j, f > 0 ? f : fo(e, o) ?? j);
    R = r.appendNote(m, {
      pitch: null,
      value: "whole",
      voice: y,
      measureRestWholes: k,
      articulations: I.articulations,
      fermata: I.fermata,
      beam: O,
      lyrics: C.lyrics,
      hidden: L
    });
  } else {
    const k = ct(e, "type"), H = lt(e, "grace"), q = w && k === void 0 && !H && !B && D === 0 ? Va(ct(e, "duration"), o, m, y) : null, et = q ? q[0] : k !== void 0 && bu(k) ? { value: k, dots: D, tuplet: B } : H ? { value: "eighth", dots: D, tuplet: B } : qa(ct(e, "duration"), o, B, D, a, k);
    R = r.appendNote(m, {
      pitch: S,
      value: et.value,
      voice: y,
      dots: et.dots,
      tuplet: et.tuplet,
      chordWithPrevious: x,
      articulations: I.articulations,
      fermata: I.fermata,
      arpeggiate: I.arpeggiate,
      beam: O,
      grace: H ? Jh(H, o) : null,
      lyrics: C.lyrics,
      hidden: L
    });
    for (const z of (q == null ? void 0 : q.slice(1)) ?? [])
      K.push(r.appendNote(m, { pitch: null, voice: y, ...z, hidden: L }));
  }
  l.last = R.isGrace ? null : { measure: m, k: g, staffIndex: b, voice: y, pitched: S !== null };
  let J = !1, T = !1;
  const V = $t(e, "tie");
  if (V.length > 0)
    J = V.some((k) => k.attrs.type === "start"), T = V.some((k) => k.attrs.type === "stop");
  else
    for (const k of M)
      for (const H of $t(k, "tied"))
        H.attrs.type === "start" && (J = !0), H.attrs.type === "stop" && (T = !0);
  const N = [], v = [];
  for (const k of M)
    for (const H of $t(k, "slur")) {
      const q = { number: It(H.attrs.number, 1), el: H, paired: !1 };
      H.attrs.type === "start" ? N.push(q) : H.attrs.type === "stop" && v.push(q);
    }
  return i.push({
    id: R.id,
    note: R,
    el: e,
    staffIndex: b,
    voice: y,
    pitch: S,
    tieStart: J,
    tieStop: T,
    slurStarts: N,
    slurStops: v,
    ownedMarks: I.owned,
    ownedLyrics: C.owned
  }), { k: g, notes: [R, ...K] };
}
function Zh(e) {
  for (const t of $t(e, "beam")) {
    if ((t.attrs.number ?? "1") !== "1") continue;
    const n = t.text.trim();
    if (n === "begin" || n === "continue" || n === "end") return n;
  }
  return "none";
}
function ja(e, t, n) {
  const s = lt(e, "rest");
  if (!s || lt(e, "chord") || lt(e, "grace")) return !1;
  if (s.attrs.measure === "yes") return !0;
  if (!n || ct(e, "type") !== "whole") return !1;
  const o = fo(e, t);
  return o !== void 0 && o < 1;
}
function tu(e, t, n) {
  if (!lt(e, "rest") || lt(e, "type") || lt(e, "chord") || lt(e, "grace")) return !1;
  const s = fo(e, t);
  return s !== void 0 && Math.abs(s - n) < 1e-6;
}
function fo(e, t) {
  const n = Number.parseFloat(ct(e, "duration") ?? "");
  return Number.isFinite(n) && n > 0 ? n / (t * 4) : void 0;
}
function eu(e) {
  const t = e.map((s) => $t(s.el, "measure")), n = /* @__PURE__ */ new Map();
  for (const s of t)
    s.forEach((o, i) => {
      (i === 0 || o.attrs.implicit === "yes") && n.set(i, 0);
    });
  return e.forEach((s, o) => {
    let i = s.divisions;
    t[o].forEach((r, a) => {
      const l = n.has(a);
      let f = 0, c = 0;
      for (const u of r.children) {
        if (u.name === "attributes") {
          const d = ct(u, "divisions");
          d !== void 0 && (i = Math.max(1, It(d, i)));
        }
        if (!l) continue;
        const h = fo(u, i) ?? 0;
        u.name === "backup" ? f -= h : u.name === "forward" ? c = Math.max(c, f += h) : u.name === "note" && !lt(u, "chord") && !lt(u, "grace") && (f += h, ja(u, i, !0) || (c = Math.max(c, f)));
      }
      l && n.set(a, Math.max(n.get(a), c));
    });
  }), n;
}
const nu = new Set(Ec);
function su(e) {
  const t = [];
  let n = null, s = !1, o;
  for (const i of e)
    for (const r of i.children)
      if (r.name === "articulations")
        for (const a of r.children) {
          if (!nu.has(a.name)) continue;
          const l = a.name;
          t.includes(l) || (t.push(l), (o ?? (o = /* @__PURE__ */ new Set())).add(a));
        }
      else if (r.name === "fermata" && n === null) {
        const a = r.text.trim(), l = r.attrs.type ?? "upright";
        if (a !== "" && a !== "normal" || l !== "upright" && l !== "inverted") continue;
        n = l, (o ?? (o = /* @__PURE__ */ new Set())).add(r);
      } else r.name === "arpeggiate" && !s && r.attrs.direction === void 0 && (s = !0, (o ?? (o = /* @__PURE__ */ new Set())).add(r));
  return { articulations: t, fermata: n, arpeggiate: s, owned: o ?? Ha };
}
const Ha = /* @__PURE__ */ new Set();
function ou(e) {
  let t, n;
  for (const s of e.children) {
    if (s.name !== "lyric") continue;
    const o = Wa(s);
    !o || t != null && t.some((i) => i.verse === o.verse) || ((t ?? (t = [])).push(o), (n ?? (n = /* @__PURE__ */ new Set())).add(s));
  }
  return { lyrics: t ?? kc, owned: n ?? Ha };
}
function iu(e, t, n) {
  const s = e.note, o = s.tiedToId !== null, i = t.tiedFromNote(s.id) !== void 0, r = (f) => f === "start" && o || f === "stop" && i;
  let a;
  const l = (f) => {
    (a ?? (a = [])).push(f);
  };
  for (const f of e.el.children)
    if (!e.ownedLyrics.has(f)) {
      if (!Xh.has(f.name))
        l(f), n.keep(f.name), Kh.has(f.name) || n.unrecognized(f.name, "note");
      else if (f.name === "rest") {
        if (f.children.length === 0) continue;
        const { measure: c, ...u } = f.attrs;
        l(Object.freeze({ name: "rest", attrs: Object.freeze(u), children: f.children, text: "" }));
        for (const h of f.children) n.keep(h.name);
      } else if (f.name === "tie") {
        if (r(f.attrs.type)) continue;
        l(f), n.keep("tie");
      } else if (f.name === "notations") {
        const c = [];
        for (const u of f.children)
          if (!(u.name === "tied" && r(u.attrs.type)) && !(u.name === "slur" && ru(e, u)) && !e.ownedMarks.has(u)) {
            if (u.name === "articulations" && u.children.some((h) => e.ownedMarks.has(h))) {
              const h = u.children.filter((d) => !e.ownedMarks.has(d));
              h.length > 0 && c.push(Object.freeze({ ...u, children: Object.freeze(h) }));
              continue;
            }
            c.push(u);
          }
        if (c.length === 0) continue;
        l(Object.freeze({ ...f, children: Object.freeze(c) }));
        for (const u of c) n.keep(u.name);
      }
    }
  a && (s.passthrough = Object.freeze(a));
}
function ru(e, t) {
  for (const n of e.slurStarts) if (n.el === t) return n.paired;
  for (const n of e.slurStops) if (n.el === t) return n.paired;
  return !1;
}
function zo(e, t) {
  for (const n of e.children)
    if (n.name === "direction-type")
      for (const s of n.children) t.keep(s.name);
    else n.name === "sound" && t.keep("sound");
}
function au(e, t) {
  const n = Vh[e.name];
  if (n)
    for (const s of e.children) n.has(s.name) || t.drop(s.name);
}
function cu(e, t) {
  for (let n = t + 1; n < e.length; n++) {
    const s = e[n];
    if (s.name === "backup") break;
    if (s.name === "note") return s;
  }
  for (let n = t - 1; n >= 0; n--) {
    const s = e[n];
    if (s.name === "backup") break;
    if (s.name === "note") return s;
  }
}
function lu(e, t, n, s, o, i, r) {
  const a = ct(e, "duration");
  if (a === void 0) return null;
  const l = (g) => ct(e, g) ?? (r && ct(r, g)), f = Math.max(1, It(l("staff"), 1)), c = Math.min(f - 1, n.length - 1), u = n[c] ?? n[0];
  if (!u) return null;
  const h = Math.max(1, It(l("voice"), 1)), d = Va(a, s, u, h) ?? [
    qa(a, s, void 0, 0, i)
  ];
  return { k: c, notes: d.map((g) => o.appendNote(u, { pitch: null, voice: h, ...g, hidden: !0 })) };
}
function Va(e, t, n, s) {
  if (Ja(e, t, void 0, 0)) return null;
  const o = Number.parseFloat(e ?? "") / (t * 4);
  if (!Number.isFinite(o) || o <= 0) return null;
  let i = 0;
  for (const r of n.notes)
    r.voice === s && !r.chordWithPrevious && (i += r.durationWholes);
  return mu(i, o);
}
var Ge, cs, ls, fs;
class fu {
  constructor(t) {
    U(this, Ge);
    U(this, cs, /* @__PURE__ */ new Set());
    U(this, ls, "");
    U(this, fs, "");
    F(this, Ge, t);
  }
  at(t, n) {
    F(this, ls, t), F(this, fs, n);
  }
  /** A known element, genuinely lost. */
  drop(t) {
    var s;
    const n = (s = p(this, Ge)) == null ? void 0 : s.dropped;
    n && n.set(t, (n.get(t) ?? 0) + 1);
  }
  /** An element kept as an opaque passthrough payload. */
  keep(t) {
    var s;
    const n = (s = p(this, Ge)) == null ? void 0 : s.passthrough;
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
  fallback(t, n, s, o) {
    var i;
    (i = p(this, Ge)) == null || i.fallbacks.push({
      kind: t,
      partId: p(this, ls),
      measureNumber: p(this, fs),
      detail: o
    }), this.warnOnce(n, s);
  }
  warnOnce(t, n) {
    p(this, Ge) || p(this, cs).has(t) || (p(this, cs).add(t), console.warn(n));
  }
}
Ge = new WeakMap(), cs = new WeakMap(), ls = new WeakMap(), fs = new WeakMap();
function hu(e, t) {
  for (let n = 0; n < e.length; n++) {
    const s = e[n];
    if (!(!s.tieStart || s.pitch === null))
      for (let o = n + 1; o < e.length; o++) {
        const i = e[o];
        if (!(i.staffIndex !== s.staffIndex || i.voice !== s.voice) && !(i.pitch === null || !yu(i.pitch, s.pitch)) && i.tieStop) {
          t.setTie(s.id, i.id);
          break;
        }
      }
  }
}
function uu(e, t) {
  var n;
  for (let s = 0; s < t.staves.length; s++) {
    const o = /* @__PURE__ */ new Map();
    for (const i of e)
      if (i.staffIndex === s) {
        for (const r of i.slurStops) {
          const a = (n = o.get(r.number)) == null ? void 0 : n.pop();
          a !== void 0 && (t.addSlur(a.id, i.id), a.end.paired = !0, r.paired = !0);
        }
        for (const r of i.slurStarts) {
          const a = o.get(r.number) ?? [];
          a.push({ id: i.id, end: r }), o.set(r.number, a);
        }
      }
  }
}
const du = [
  { sign: "G", line: "2", clef: "treble" },
  { sign: "G", line: "2", octaveChange: "-1", clef: "treble8" },
  { sign: "F", line: "4", clef: "bass" },
  // The two C clefs the model draws (M6 Slice 4). Soprano (C1), mezzo (C2)
  // and baritone (C5) still fall back to treble, reported.
  { sign: "C", line: "3", clef: "alto" },
  { sign: "C", line: "4", clef: "tenor" }
];
function Xa(e, t) {
  const n = ct(e, "sign") ?? "", s = ct(e, "line") ?? "", o = ct(e, "clef-octave-change"), i = o === void 0 || o === "0" ? void 0 : o;
  for (const r of du)
    if (r.sign === n && r.line === s && r.octaveChange === i)
      return r.clef;
  return t.fallback(
    "clef",
    `clef:${n}/${s}/${o ?? ""}`,
    `importMusicXml: unrecognized clef <sign>${n}</sign><line>${s}</line>; defaulting to treble`,
    `sign ${n} line ${s}${o === void 0 ? "" : ` octave-change ${o}`}`
  ), "treble";
}
function Ka(e) {
  const t = ct(e, "beats"), n = ct(e, "beat-type");
  if (t === void 0 || n === void 0) return;
  const s = Number.parseInt(t, 10), o = Number.parseInt(n, 10);
  if (!(!Number.isFinite(s) || !Number.isFinite(o) || o <= 0))
    return { beats: s, beatType: o };
}
function pu(e) {
  for (const t of Do(e, "metronome")) {
    const n = ct(t, "per-minute");
    if (n !== void 0) {
      const s = Number.parseFloat(n);
      if (Number.isFinite(s)) return { bpm: s, source: t };
    }
  }
  for (const t of Do(e, "sound"))
    if (t.attrs.tempo !== void 0) {
      const n = Number.parseFloat(t.attrs.tempo);
      if (Number.isFinite(n)) return { bpm: n, source: t };
    }
}
function qa(e, t, n, s, o, i) {
  const r = Ja(e, t, n, s);
  return r || (o.fallback(
    "note-value",
    "note-value-fallback",
    "importMusicXml: a <note> had no usable <type> and no duration that maps to a note value; using quarter",
    `${i === void 0 ? "" : `unsupported <type>${i}</type>, `}duration ${(e == null ? void 0 : e.trim()) ?? "(none)"} at divisions ${t}${n ? ` in a ${n.actualNotes}:${n.normalNotes} tuplet` : ""}`
  ), { value: "quarter", dots: s, tuplet: n });
}
function Ja(e, t, n, s) {
  if (e === void 0 || t <= 0) return null;
  const o = Number.parseFloat(e) / (t * 4);
  if (!Number.isFinite(o)) return null;
  const i = n ? n.actualNotes / n.normalNotes : 1, r = yi(o * i, s > 0 ? [s] : [0, 1, 2]);
  if (r) return { ...r, tuplet: n };
  const a = n ? null : yi(o * (3 / 2), [s]);
  return a ? { ...a, tuplet: Qa } : null;
}
const Qa = Object.freeze({ actualNotes: 3, normalNotes: 2 });
function mu(e, t) {
  const o = e + t, i = Math.ceil(e / 0.25 - 1e-6) * 0.25, r = Math.floor(o / 0.25 + 1e-6) * 0.25, a = i < r - 1e-9 ? [e, i, r, o] : [e, o], l = [];
  for (let f = 0; f + 1 < a.length; f++) {
    const c = a[f], u = a[f + 1] - c;
    if (u < 1e-9) continue;
    const h = Bc(c, u), d = h ? h.map((g) => ({ value: g, dots: 0, tuplet: void 0 })) : gu(c, u);
    if (!d) return null;
    l.push(...d);
  }
  return l;
}
function gu(e, t) {
  const s = (a, l) => {
    const f = a / l;
    return Math.abs(f - Math.round(f)) < 1e-6;
  }, o = [];
  let i = e, r = t;
  for (; r > 1e-9; ) {
    const a = Ar.filter((f) => In[f] * 2 / 3 <= r + 1e-9);
    if (a.length === 0) return null;
    const l = a.find((f) => s(i, In[f] * 2 / 3)) ?? a[0];
    o.push({ value: l, dots: 0, tuplet: Qa }), i += In[l] * 2 / 3, r -= In[l] * 2 / 3;
  }
  return o;
}
function bu(e) {
  return Ar.includes(e);
}
function yu(e, t) {
  return e.step === t.step && e.alter === t.alter && e.octave === t.octave;
}
function xu(e, t) {
  return e.beats === t.beats && e.beatType === t.beatType;
}
function vu(e) {
  const t = e == null ? void 0 : e.trim();
  return t === "brace" ? "brace" : t === "bracket" || t === "line" || t === "square" ? "bracket" : "none";
}
function It(e, t) {
  if (e == null) return t;
  const n = Number.parseInt(e, 10);
  return Number.isFinite(n) ? n : t;
}
function Su(e, t) {
  return Array.from({ length: t }, (n, s) => e + s);
}
function wu(e) {
  var t;
  return ((t = lt(e, "measure")) == null ? void 0 : t.attrs.number) ?? "1";
}
function Sr(e) {
  const t = lt(e, "measure"), n = t ? $t(t, "attributes") : [];
  return n.length <= 1 ? n[0] : { name: "attributes", attrs: {}, children: n.flatMap((s) => s.children), text: "" };
}
const Za = 67324752, Mu = 33639248, tc = 101010256, ec = 22, ku = ec + 65535;
async function Eu(e, t = {}) {
  return za(await Bu(e), t);
}
async function Bu(e) {
  const t = e instanceof Uint8Array ? e : new Uint8Array(e);
  if (!Tu(t)) {
    const a = Eo(t);
    if (!a.trimStart().startsWith("<"))
      throw new Error("readMxl: not a MusicXML or .mxl file (neither a zip archive nor XML text)");
    return a;
  }
  const n = Nu(t), s = new Map(n.map((a) => [a.name, a])), o = s.get("META-INF/container.xml"), i = o === void 0 ? void 0 : Iu(Eo(await wr(t, o))), r = (i === void 0 ? void 0 : s.get(i)) ?? n.find((a) => !a.name.startsWith("META-INF/") && /\.(musicxml|xml)$/i.test(a.name));
  if (r === void 0) {
    const a = i === void 0 ? "" : ` (container.xml names "${i}", which is missing)`;
    throw new Error(`readMxl: the .mxl archive has no score file${a}`);
  }
  return Eo(await wr(t, r));
}
function Tu(e) {
  if (e.length < 4) return !1;
  const t = li(e).getUint32(0, !0);
  return t === Za || t === tc;
}
function li(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function Eo(e) {
  const t = e[0] === 255 && e[1] === 254 ? "utf-16le" : e[0] === 254 && e[1] === 255 ? "utf-16be" : "utf-8";
  return new TextDecoder(t).decode(e);
}
function Iu(e) {
  const t = lt(Da(e), "rootfiles");
  if (t !== void 0)
    return $t(t, "rootfile").map((n) => n.attrs["full-path"]).find((n) => n !== void 0 && n !== "");
}
function Nu(e) {
  const t = li(e), n = Math.max(0, e.length - ku);
  let s = -1;
  for (let f = e.length - ec; f >= n; f--)
    if (t.getUint32(f, !0) === tc) {
      s = f;
      break;
    }
  if (s < 0) throw new Error("readMxl: not a MusicXML or .mxl file (zip end of central directory not found)");
  const o = t.getUint16(s + 10, !0), i = t.getUint32(s + 16, !0);
  if (o === 65535 || i === 4294967295) throw new Error("readMxl: zip64 .mxl archives are not supported");
  const r = new TextDecoder("utf-8"), a = [];
  let l = i;
  for (let f = 0; f < o; f++) {
    if (l + 46 > e.length || t.getUint32(l, !0) !== Mu)
      throw new Error("readMxl: corrupt .mxl archive (bad central directory entry)");
    const c = t.getUint16(l + 28, !0), u = t.getUint16(l + 30, !0), h = t.getUint16(l + 32, !0);
    a.push({
      name: r.decode(e.subarray(l + 46, l + 46 + c)),
      flags: t.getUint16(l + 8, !0),
      method: t.getUint16(l + 10, !0),
      compressedSize: t.getUint32(l + 20, !0),
      uncompressedSize: t.getUint32(l + 24, !0),
      localHeaderOffset: t.getUint32(l + 42, !0)
    }), l += 46 + c + u + h;
  }
  return a;
}
async function wr(e, t) {
  if (t.flags & 1) throw new Error(`readMxl: "${t.name}" is encrypted, which is not supported`);
  const n = li(e), s = t.localHeaderOffset;
  if (s + 30 > e.length || n.getUint32(s, !0) !== Za)
    throw new Error(`readMxl: corrupt .mxl archive (bad local header for "${t.name}")`);
  const o = s + 30 + n.getUint16(s + 26, !0) + n.getUint16(s + 28, !0), i = o + t.compressedSize;
  if (i > e.length) throw new Error(`readMxl: corrupt .mxl archive ("${t.name}" is truncated)`);
  const r = e.slice(o, i);
  if (t.method === 0) return r;
  if (t.method !== 8)
    throw new Error(`readMxl: "${t.name}" uses unsupported zip compression method ${t.method}`);
  const a = new Blob([r]).stream().pipeThrough(new DecompressionStream("deflate-raw")), l = new Uint8Array(await new Response(a).arrayBuffer());
  if (l.length !== t.uncompressedSize)
    throw new Error(`readMxl: corrupt .mxl archive ("${t.name}" inflates to the wrong size)`);
  return l;
}
const Au = 200;
function Mr(e) {
  return Math.max(Au, Math.floor(e));
}
function Cu(e, t) {
  return e <= 0 || t <= 0 ? 1 : Math.min(1, t / e);
}
function Pu(e, t, n, s) {
  return { x: 0, y: e / s, width: n, height: t / s };
}
function Ou(e, t, n, s, o) {
  return {
    x: (e - n.left) / o + ((s == null ? void 0 : s.x) ?? 0),
    y: (t - n.top) / o + ((s == null ? void 0 : s.y) ?? 0)
  };
}
function Fu(e, t, n) {
  return { x: t.x + e.x * n, y: t.y + e.y * n, width: e.width * n, height: e.height * n };
}
function kr(e, t, n, s, o) {
  const i = n + e.y * t, r = e.height * t;
  return i >= s && i + r <= s + o ? null : Math.max(0, i + r / 2 - o / 2);
}
var ze, Ln, hs, us;
class Wu {
  constructor(t, n = (s) => queueMicrotask(s)) {
    U(this, ze, []);
    U(this, Ln, !1);
    U(this, hs);
    U(this, us);
    F(this, hs, t), F(this, us, n);
  }
  push(t) {
    p(this, ze).push(t), !p(this, Ln) && (F(this, Ln, !0), p(this, us).call(this, () => {
      if (F(this, Ln, !1), p(this, ze).length === 0) return;
      const n = p(this, ze);
      F(this, ze, []), p(this, hs).call(this, n);
    }));
  }
  /** Drop whatever has not been flushed yet (a stop or seek mid-turn). */
  clear() {
    F(this, ze, []);
  }
}
ze = new WeakMap(), Ln = new WeakMap(), hs = new WeakMap(), us = new WeakMap();
const Ru = 10, Lu = 0.5, $u = 100;
async function Qu(e, t, n = {}) {
  const [s, o] = await Promise.all([
    n.fontUrl === void 0 ? ir() : ir(n.fontUrl),
    t instanceof ArrayBuffer || t instanceof Uint8Array ? Eu(t) : nc(t)
  ]);
  return new _u(e, o, n, s);
}
function nc(e) {
  return typeof e == "string" ? za(e) : e;
}
var Tt, Dt, Te, Gt, Ie, ds, dt, pe, Ne, un, dn, ps, $n, ce, kt, Ye, pn, Ae, mn, gn, _n, ms, zt, Ue, Vt, gs, bn, yn, je, $, zs, Bn, Jn, Tn, Ys, Qn, Yo, Je, Us, Uo, sc, js, bs, jo, ys, xs, Ho, oc, ic, rc, ac, Zn, cc, lc, Hs;
class _u {
  constructor(t, n, s, o) {
    U(this, $);
    U(this, Tt);
    /** The host's outer scroller (`MountOptions.scrollElement`), or `null`
     *  when the container scrolls itself. */
    U(this, Dt);
    U(this, Te);
    U(this, Gt);
    U(this, Ie);
    U(this, ds);
    U(this, dt);
    U(this, pe);
    U(this, Ne, { noteclick: /* @__PURE__ */ new Set(), onset: /* @__PURE__ */ new Set(), end: /* @__PURE__ */ new Set(), layout: /* @__PURE__ */ new Set() });
    U(this, un);
    U(this, dn);
    /** Stops the outer scroller's resize reports (`OuterScroller.watchResize`). */
    U(this, ps);
    /** The container's inline `overflow` before the view set it, or `null`
     *  when the view left it alone. */
    U(this, $n, null);
    U(this, ce);
    U(this, kt);
    U(this, Ye);
    U(this, pn);
    /** Layout pixels to CSS pixels (see `fitScale`). */
    U(this, Ae, 1);
    U(this, mn, 0);
    /** Where layout (0, 0) sits in the container's scroll content, CSS pixels
     *  (see `noteBox`). Measured by `#size`, not per lookup, so a host placing
     *  many overlays does not force a reflow per box. */
    U(this, gn, { x: 0, y: 0 });
    U(this, _n);
    /** Container width and scroller height `#size` last measured, so a resize
     *  notice for the container's own growth (it is as tall as the score when
     *  an outer element scrolls) does not relayout. */
    U(this, ms, "");
    U(this, zt, !1);
    U(this, Ue, null);
    U(this, Vt, null);
    /** The timeline `#engine` was built from; rebuilt when the score changes. */
    U(this, gs, null);
    /** The current score's timeline, `null` until needed or after an edit. */
    U(this, bn, null);
    /** When each played measure starts (`seekMeasure`), `null` until needed
     *  or after an edit. */
    U(this, yn, null);
    /** Position to start from while no engine exists yet (a seek before the first play). */
    U(this, je, 0);
    // Scroll events arrive at most once per frame, before it paints, so painting
    // here keeps the canvas in step. Only the visible measures draw.
    U(this, bs, () => {
      p(this, Dt) && !A(this, $, oc).call(this, p(this, Dt)) || (A(this, $, js).call(this), p(this, dt).drawAll());
    });
    U(this, ys, (t) => {
      const n = A(this, $, jo).call(this, t), s = cf(p(this, kt), n.x, n.y);
      for (const o of p(this, Ne).noteclick) o(s, t);
    });
    U(this, xs, () => {
      clearTimeout(p(this, _n)), F(this, _n, setTimeout(() => {
        p(this, zt) || p(this, Dt) && p(this, ms) === A(this, $, Uo).call(this) || (A(this, $, Yo).call(this) && A(this, $, Bn).call(this), A(this, $, Je).call(this), p(this, dt).drawAll(), A(this, $, Tn).call(this));
      }, $u));
    });
    var l, f;
    const i = t.ownerDocument, r = i.defaultView;
    if (!r) throw new Error("mountScore needs a container attached to a window.");
    F(this, Te, r), F(this, Tt, t), F(this, Dt, Du(s.scrollElement, t, p(this, Te))), F(this, pe, s), F(this, ce, n), F(this, Ye, s.staffSpacePx ?? Ru), !p(this, Dt) && r.getComputedStyle(t).overflowY === "visible" && (F(this, $n, t.style.overflow), t.style.overflow = "auto"), F(this, Gt, i.createElement("canvas")), Object.assign(p(this, Gt).style, { display: "block", position: "sticky", top: "0", width: "0", height: "0" }), F(this, Ie, i.createElement("div")), t.append(p(this, Gt), p(this, Ie));
    const a = p(this, Gt).getContext("2d");
    if (!a) throw new Error("mountScore could not get a 2D canvas context.");
    F(this, ds, a), F(this, pn, s.systemWidthPx ?? Mr(A(this, $, Qn).call(this))), F(this, kt, Gi(n, A(this, $, zs).call(this))), F(this, dt, new yf(a, p(this, kt), { ...s.renderer, fontFamily: o })), F(this, un, new Wu((c) => A(this, $, lc).call(this, c))), A(this, $, Je).call(this), A(this, $, Yo).call(this) && (A(this, $, Bn).call(this), A(this, $, Je).call(this)), p(this, dt).drawAll(), A(this, $, Ho).call(this).addEventListener("scroll", p(this, bs), { passive: !0 }), p(this, Gt).addEventListener("pointerdown", p(this, ys)), F(this, dn, r.ResizeObserver ? new r.ResizeObserver(p(this, xs)) : null), (l = p(this, dn)) == null || l.observe(t), F(this, ps, ((f = p(this, Dt)) == null ? void 0 : f.watchResize(p(this, dn), p(this, xs))) ?? null);
  }
  get score() {
    return p(this, ce);
  }
  get layout() {
    return p(this, kt);
  }
  get renderer() {
    return p(this, dt);
  }
  get canvas() {
    return p(this, Gt);
  }
  get staffSpacePx() {
    return p(this, Ye);
  }
  get isPlaying() {
    var t;
    return ((t = p(this, Vt)) == null ? void 0 : t.isPlaying) ?? !1;
  }
  get positionSeconds() {
    var t;
    return ((t = p(this, Vt)) == null ? void 0 : t.positionSeconds) ?? p(this, je);
  }
  get durationSeconds() {
    return A(this, $, Zn).call(this).reduce((t, n) => Math.max(t, n.startSeconds + n.durationSeconds), 0);
  }
  on(t, n) {
    const s = p(this, Ne)[t];
    return s.add(n), () => s.delete(n);
  }
  load(t) {
    p(this, zt) || (this.stop(), F(this, ce, nc(t)), F(this, bn, null), F(this, yn, null), p(this, dt).setMarkup([]), p(this, dt).setNoteColors(null), A(this, $, Bn).call(this), A(this, $, ic).call(this), A(this, $, Je).call(this), p(this, dt).drawAll(), A(this, $, Tn).call(this));
  }
  setScore(t) {
    p(this, zt) || (F(this, ce, t), this.refresh());
  }
  refresh(t) {
    if (p(this, zt)) return !1;
    if (F(this, bn, null), F(this, yn, null), t) {
      let n = p(this, kt);
      for (const { staffIndex: s, measureIndex: o } of t)
        n = n && nl(p(this, ce), n, o, A(this, $, zs).call(this), s);
      if (n) {
        F(this, kt, n), p(this, dt).setLayout(n);
        for (const { staffIndex: s, measureIndex: o } of t) p(this, dt).redrawMeasure(o, s);
        return A(this, $, Tn).call(this), !0;
      }
    }
    return A(this, $, Bn).call(this), A(this, $, Je).call(this), p(this, dt).drawAll(), A(this, $, Tn).call(this), !1;
  }
  setZoom(t) {
    if (p(this, zt) || t === p(this, Ye) || !(t > 0)) return;
    const n = A(this, $, rc).call(this);
    F(this, Ye, t), A(this, $, Bn).call(this), A(this, $, Je).call(this), n !== null && A(this, $, ac).call(this, n), A(this, $, js).call(this), p(this, dt).drawAll(), A(this, $, Tn).call(this);
  }
  setColors(t) {
    p(this, zt) || (p(this, dt).setColors(t), p(this, dt).drawAll());
  }
  get noteColors() {
    return p(this, dt).noteColors;
  }
  setNoteColors(t) {
    if (!p(this, zt))
      for (const { staffIndex: n, index: s } of p(this, dt).setNoteColors(t)) p(this, dt).redrawMeasure(s, n);
  }
  noteBox(t) {
    for (const n of p(this, kt).measures) {
      const s = n.notes.find((o) => o.id === t);
      if (s) return A(this, $, Jn).call(this, s.bounds);
    }
    return null;
  }
  measureBox({ staffIndex: t, measureIndex: n }) {
    const s = p(this, kt).measures.find((o) => o.staffIndex === t && o.index === n);
    return s ? A(this, $, Jn).call(this, s.region) : null;
  }
  staffBoxes(t) {
    const n = [];
    for (const s of p(this, kt).systems) {
      if (s.staffIndex !== t) continue;
      const o = p(this, kt).measures.filter((f) => f.staffIndex === t && s.measureIndices.includes(f.index)).map((f) => f.region);
      if (o.length === 0) continue;
      const i = Math.min(...o.map((f) => f.x)), r = Math.min(...o.map((f) => f.y)), a = Math.max(...o.map((f) => f.x + f.width)), l = Math.max(...o.map((f) => f.y + f.height));
      n.push(A(this, $, Jn).call(this, { x: i, y: r, width: a - i, height: l - r }));
    }
    return n;
  }
  get markup() {
    return p(this, dt).markup;
  }
  setMarkup(t) {
    if (!p(this, zt))
      for (const { staffIndex: n, index: s } of p(this, dt).setMarkup(t)) p(this, dt).redrawMeasure(s, n);
  }
  markupAt(t) {
    const n = A(this, $, jo).call(this, t);
    return p(this, dt).markupAt(n.x, n.y);
  }
  markupBox(t) {
    const n = p(this, dt).markupBounds(t);
    return n ? A(this, $, Jn).call(this, n) : null;
  }
  scrollToNote(t) {
    const n = lf(p(this, kt), t);
    if (!n) return;
    const s = p(this, Dt);
    if (s) {
      const l = s.band(), c = p(this, Tt).getBoundingClientRect().top + p(this, Tt).clientTop - l.top + s.scrollTop + p(this, gn).y, u = kr(n, p(this, Ae), c, s.scrollTop, l.bottom - l.top);
      u !== null && s.scrollTo(u, !0);
      return;
    }
    const o = p(this, Tt), i = A(this, $, Ys).call(this, o), r = p(this, gn).y - i.top, a = kr(n, p(this, Ae), r, o.scrollTop, A(this, $, Us).call(this));
    a !== null && o.scrollTo({ top: a, behavior: "smooth" });
  }
  play() {
    var n;
    if (p(this, zt) || p(this, pe).playback === !1) return;
    const t = A(this, $, cc).call(this);
    (n = p(this, Ue)) == null || n.resume(), t.play();
  }
  pause() {
    var t;
    (t = p(this, Vt)) == null || t.pause();
  }
  stop() {
    var t;
    (t = p(this, Vt)) == null || t.stop(), F(this, je, 0), A(this, $, Hs).call(this);
  }
  seek(t) {
    const n = Math.max(0, t);
    p(this, Vt) ? p(this, Vt).seek(n) : F(this, je, n), A(this, $, Hs).call(this);
  }
  seekToNote(t) {
    const n = Df(A(this, $, Zn).call(this), t);
    return n === void 0 ? !1 : (this.seek(n), !0);
  }
  seekMeasure(t) {
    p(this, yn) ?? F(this, yn, _f(p(this, ce)));
    const n = p(this, yn), s = Math.trunc(t);
    if (s === 0 || n.length === 0) return !1;
    const o = this.positionSeconds;
    let i = 0;
    for (; i + 1 < n.length && n[i + 1] <= o + 1e-6; ) i++;
    const r = o - n[i], a = s < 0 && r > Lu ? i + 1 : i, l = Math.min(n.length - 1, Math.max(0, a + s));
    return (s > 0 ? l <= i : n[l] >= o - 1e-6) ? !1 : (this.seek(n[l]), !0);
  }
  destroy() {
    var t, n, s, o;
    if (!p(this, zt)) {
      F(this, zt, !0), (t = p(this, Vt)) == null || t.stop(), F(this, Vt, null), p(this, un).clear(), (n = p(this, Ue)) == null || n.close(), F(this, Ue, null), clearTimeout(p(this, _n)), (s = p(this, dn)) == null || s.disconnect(), (o = p(this, ps)) == null || o.call(this), A(this, $, Ho).call(this).removeEventListener("scroll", p(this, bs)), p(this, Gt).removeEventListener("pointerdown", p(this, ys)), p(this, Gt).remove(), p(this, Ie).remove(), p(this, $n) !== null && (p(this, Tt).style.overflow = p(this, $n));
      for (const i of Object.values(p(this, Ne))) i.clear();
    }
  }
}
Tt = new WeakMap(), Dt = new WeakMap(), Te = new WeakMap(), Gt = new WeakMap(), Ie = new WeakMap(), ds = new WeakMap(), dt = new WeakMap(), pe = new WeakMap(), Ne = new WeakMap(), un = new WeakMap(), dn = new WeakMap(), ps = new WeakMap(), $n = new WeakMap(), ce = new WeakMap(), kt = new WeakMap(), Ye = new WeakMap(), pn = new WeakMap(), Ae = new WeakMap(), mn = new WeakMap(), gn = new WeakMap(), _n = new WeakMap(), ms = new WeakMap(), zt = new WeakMap(), Ue = new WeakMap(), Vt = new WeakMap(), gs = new WeakMap(), bn = new WeakMap(), yn = new WeakMap(), je = new WeakMap(), $ = new WeakSet(), // --- Layout and painting ------------------------------------------------
zs = function() {
  return {
    staffSpacePx: p(this, Ye),
    systemWidthPx: p(this, pn),
    ...p(this, pe).header === !1 ? { header: !1 } : {},
    ...p(this, pe).courtesy === !1 ? { courtesy: !1 } : {},
    ...p(this, pe).systemSeparators === !0 ? { systemSeparators: !0 } : {}
  };
}, Bn = function() {
  F(this, kt, Gi(p(this, ce), A(this, $, zs).call(this))), p(this, dt).setLayout(p(this, kt));
}, Jn = function(t) {
  return Fu(t, p(this, gn), p(this, Ae));
}, Tn = function() {
  for (const t of p(this, Ne).layout) t(p(this, kt));
}, Ys = function(t) {
  return fc(p(this, Te), t);
}, Qn = function() {
  const t = A(this, $, Ys).call(this, p(this, Tt));
  return p(this, Tt).clientWidth - t.left - t.right;
}, /** Update the derived system width; true when it changed (needs a relayout). */
Yo = function() {
  if (p(this, pe).systemWidthPx !== void 0) return !1;
  const t = Mr(A(this, $, Qn).call(this));
  return t === p(this, pn) ? !1 : (F(this, pn, t), !0);
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
Je = function() {
  const t = p(this, Gt), n = (l, f) => {
    const c = p(this, kt).height * l;
    t.style.width = `${p(this, kt).width * l}px`, t.style.height = `${f}px`, p(this, Ie).style.height = `${c - f}px`;
  };
  n(1, 0);
  const s = Cu(p(this, kt).width, A(this, $, Qn).call(this));
  n(s, 0);
  const o = p(this, kt).height * s, i = A(this, $, Us).call(this), r = Math.min(o, i > 0 ? i : p(this, Te).innerHeight);
  n(s, r);
  const a = p(this, Te).devicePixelRatio || 1;
  t.width = Math.ceil(p(this, kt).width * s * a), t.height = Math.ceil(r * a), p(this, ds).setTransform(a * s, 0, 0, a * s, 0, 0), F(this, Ae, s), F(this, mn, r), F(this, gn, A(this, $, sc).call(this)), F(this, ms, A(this, $, Uo).call(this)), A(this, $, js).call(this);
}, /** The scroll element's visible height, inside its padding: the outer
 *  scroller's band, or the container's own client height. */
Us = function() {
  const t = p(this, Dt);
  if (t) {
    const s = t.band();
    return s.bottom - s.top;
  }
  const n = A(this, $, Ys).call(this, p(this, Tt));
  return p(this, Tt).clientHeight - n.top - n.bottom;
}, Uo = function() {
  return `${A(this, $, Qn).call(this)}x${A(this, $, Us).call(this)}`;
}, /** Layout (0, 0) in scroll-content coordinates. The canvas is sticky, so
 *  its own rect moves with scrolling; its in-flow top is read off the
 *  spacer instead, as in `#updateViewport`. */
sc = function() {
  const t = p(this, Tt), n = t.getBoundingClientRect(), s = p(this, Gt).getBoundingClientRect().left, o = p(this, Ie).getBoundingClientRect().top;
  return {
    x: s - n.left - t.clientLeft + t.scrollLeft,
    y: o - p(this, mn) - n.top - t.clientTop + t.scrollTop
  };
}, /** Point the renderer at the band the canvas currently shows. The canvas's
 *  offset into the score is read off the spacer, which sits right after it
 *  in flow, so container padding and borders cancel out. This holds for an
 *  outer scroller too: sticky positioning keeps the canvas inside its
 *  container, so with the container's top below the scroller's the canvas
 *  sits in flow (offset 0), with it scrolled past it is pushed down by
 *  exactly that much, and near the container's bottom it stops at the
 *  last band. */
js = function() {
  const t = p(this, Gt).getBoundingClientRect().top, n = p(this, Ie).getBoundingClientRect().top, s = Math.max(0, p(this, mn) - (n - t));
  p(this, dt).setViewport(Pu(s, p(this, mn), p(this, kt).width, p(this, Ae)));
}, bs = new WeakMap(), jo = function(t) {
  return Ou(
    t.clientX,
    t.clientY,
    p(this, Gt).getBoundingClientRect(),
    p(this, dt).viewport,
    p(this, Ae)
  );
}, ys = new WeakMap(), xs = new WeakMap(), // --- Outer scroller ------------------------------------------------------
/** Where the `scroll` events that move the view fire. */
Ho = function() {
  var t;
  return ((t = p(this, Dt)) == null ? void 0 : t.target) ?? p(this, Tt);
}, oc = function(t) {
  const n = t.band(), s = p(this, Tt).getBoundingClientRect();
  return s.bottom > n.top && s.top < n.bottom;
}, /** `load`'s scroll to the top: the whole container by default; with an
 *  outer scroller, only back up to the container's top when it was
 *  scrolled past, so loading one of several stacked views does not jump
 *  the host's page. */
ic = function() {
  const t = p(this, Dt);
  if (!t) {
    p(this, Tt).scrollTop = 0;
    return;
  }
  const n = t.band().top - p(this, Tt).getBoundingClientRect().top;
  n > 0 && t.scrollTo(t.scrollTop - n, !1);
}, /** How far down the score the top of the view is, as a fraction of its
 *  height, for `setZoom` to restore. `null` with an outer scroller whose
 *  top is not inside this container: the view is not what is being read. */
rc = function() {
  const t = p(this, Dt);
  if (!t) {
    const o = p(this, Tt);
    return o.scrollHeight > 0 ? o.scrollTop / o.scrollHeight : 0;
  }
  const n = t.band().top, s = p(this, Tt).getBoundingClientRect();
  return s.height <= 0 || n <= s.top || n >= s.bottom ? null : (n - s.top) / s.height;
}, ac = function(t) {
  const n = p(this, Dt);
  if (!n) {
    p(this, Tt).scrollTop = t * p(this, Tt).scrollHeight;
    return;
  }
  const s = p(this, Tt).getBoundingClientRect();
  n.scrollTo(n.scrollTop + s.top + t * s.height - n.band().top, !1);
}, // --- Playback -----------------------------------------------------------
Zn = function() {
  return p(this, bn) ?? F(this, bn, $f(p(this, ce))), p(this, bn);
}, /**
 * The engine for the current score. An engine takes its timeline once, so
 * after an edit it is rebuilt here, carrying the paused position over;
 * while playing, the old one plays on and the edit is heard from the next
 * play. The `AudioContext` is created on first use, inside the `play()`
 * the host called from a user gesture, and reused across rebuilds.
 */
cc = function() {
  const t = p(this, Vt);
  if (t && (t.isPlaying || p(this, gs) === A(this, $, Zn).call(this))) return t;
  const n = (t == null ? void 0 : t.positionSeconds) ?? p(this, je);
  t == null || t.stop();
  const s = A(this, $, Zn).call(this);
  p(this, Ue) ?? F(this, Ue, new (p(this, Te)).AudioContext());
  const o = new Jf({
    events: s,
    audioContext: p(this, Ue),
    onOnset: (i) => {
      p(this, un).push(i.noteId);
      for (const r of p(this, Ne).onset) r(i);
    },
    onEnd: () => {
      A(this, $, Hs).call(this);
      for (const i of p(this, Ne).end) i();
    }
  });
  return n > 0 && o.seek(n), F(this, Vt, o), F(this, gs, s), F(this, je, 0), o;
}, lc = function(t) {
  if (!p(this, zt)) {
    for (const { staffIndex: n, index: s } of p(this, dt).setPlaybackCursor(t))
      p(this, dt).redrawMeasure(s, n);
    p(this, pe).followScroll !== !1 && this.scrollToNote(t[0]);
  }
}, Hs = function() {
  p(this, un).clear();
  for (const { staffIndex: t, index: n } of p(this, dt).setPlaybackCursor([]))
    p(this, dt).redrawMeasure(n, t);
};
function fc(e, t) {
  const n = e.getComputedStyle(t);
  return {
    left: parseFloat(n.paddingLeft) || 0,
    right: parseFloat(n.paddingRight) || 0,
    top: parseFloat(n.paddingTop) || 0,
    bottom: parseFloat(n.paddingBottom) || 0
  };
}
function Du(e, t, n) {
  if (!e || e === t) return null;
  const s = t.ownerDocument;
  if (e === n || e === s || e === s.documentElement || e === s.scrollingElement) {
    if (!s.documentElement.contains(t))
      throw new Error("mountScore: options.scrollElement is the page, but the container is not attached to it.");
    return zu(n, s);
  }
  if (!("scrollTop" in e) || !e.contains(t))
    throw new Error(
      "mountScore: options.scrollElement must be an ancestor of the container, or the container's window or document."
    );
  return Gu(e, n);
}
function Gu(e, t) {
  return {
    target: e,
    get scrollTop() {
      return e.scrollTop;
    },
    band() {
      const n = e.getBoundingClientRect(), s = fc(t, e), o = n.top + e.clientTop;
      return { top: o + s.top, bottom: o + e.clientHeight - s.bottom };
    },
    scrollTo(n, s) {
      s ? e.scrollTo({ top: n, behavior: "smooth" }) : e.scrollTop = n;
    },
    watchResize(n) {
      return n == null || n.observe(e), () => {
      };
    }
  };
}
function zu(e, t) {
  return {
    target: e,
    get scrollTop() {
      return e.scrollY;
    },
    band() {
      var n;
      return { top: 0, bottom: ((n = t.scrollingElement) == null ? void 0 : n.clientHeight) ?? e.innerHeight };
    },
    scrollTo(n, s) {
      e.scrollTo({ top: n, behavior: s ? "smooth" : "auto" });
    },
    watchResize(n, s) {
      return e.addEventListener("resize", s), () => e.removeEventListener("resize", s);
    }
  };
}
const Zu = "0.3.0";
export {
  wf as ACCENT_VELOCITY,
  nd as ACCIACCATURA,
  Nf as ACCIACCATURA_WHOLES,
  sd as APPOGGIATURA,
  Tf as APPOGGIATURA_FRACTION,
  Ec as ARTICULATIONS,
  Rr as BRAVURA_FAMILY,
  yf as CanvasRenderer,
  bf as DEFAULT_COLORS,
  Ru as DEFAULT_STAFF_SPACE_PX,
  Sf as DETACHED_LEGATO_FRACTION,
  If as DOTTED_APPOGGIATURA_FRACTION,
  Ef as DYNAMIC_ACCENTS,
  Ir as DYNAMIC_KINDS,
  Cn as DYNAMIC_LEVELS,
  at as ENGRAVING_DEFAULTS,
  Hu as EditHistory,
  kf as FERMATA_FACTOR,
  X as GLYPH_METRICS,
  Af as GRACE_RUN_MAX_FRACTION,
  Cf as GRACE_TOTAL_MAX_FRACTION,
  Yf as LookaheadScheduler,
  Mf as MARCATO_VELOCITY,
  Xu as MARKUP_GLYPHS,
  Lu as MEASURE_RESTART_SECONDS,
  od as Measure,
  Bf as NIENTE_LEVEL,
  Zu as NOTATION_ENGINE_VERSION,
  Ar as NOTE_VALUES,
  In as NOTE_VALUE_WHOLES,
  id as NO_ARTICULATIONS,
  rd as NO_CLEF_CHANGES,
  ad as NO_DYNAMICS,
  kc as NO_LYRICS,
  Nr as NO_PASSTHROUGH,
  cd as Note,
  Jf as PlaybackEngine,
  ff as SEAM_STRIP_WIDTH_STAFF_SPACES,
  vf as STACCATISSIMO_FRACTION,
  xf as STACCATO_FRACTION,
  vn as STAFF_SPACES_PER_EM,
  wc as Score,
  ld as Staff,
  Tc as assertScoresEquivalent,
  or as bravuraFontUrl,
  fd as buildScore,
  yc as compareVerses,
  aa as computeBeamGroups,
  $f as computePlaybackTimeline,
  Fo as containsPoint,
  Ju as createImportDiagnostics,
  Ku as createOnsetIndex,
  ht as diatonicIndex,
  Ia as durationToSeconds,
  Xo as eventArpeggiate,
  Ko as eventArticulations,
  bc as eventBeam,
  qo as eventFermata,
  xc as eventLyrics,
  qu as exportMusicXml,
  Df as firstOnsetSeconds,
  gc as formatPitch,
  hd as fromMidi,
  ts as glyphMetrics,
  Pf as graceLengthsWholes,
  no as graceRuns,
  cf as hitTest,
  Vu as hitTestMeasure,
  za as importMusicXml,
  Eu as importMxl,
  Er as keyAlterForStep,
  df as layoutMarkup,
  Gi as layoutScore,
  ir as loadSmuflFont,
  Qo as lyricContinuesWord,
  Tr as lyricDisplayText,
  Br as lyricStartsExtender,
  bi as makeLyric,
  Jo as measureCapacityWholes,
  Vs as measureDurationWholes,
  Na as measurePlayOrder,
  ud as mergeLyrics,
  To as middleLineForClef,
  Uf as midiToFrequency,
  Qu as mountScore,
  dd as normalizeArticulations,
  pd as normalizeLyrics,
  Xt as noteEvents,
  yi as noteValueForWholes,
  Dn as opaqueElementKey,
  md as parsePitch,
  Vo as partGroupSymbol,
  jf as pitchToFrequency,
  gd as pitchesEqual,
  qf as playOnsetEvent,
  _f as playedMeasureStartsSeconds,
  bd as positionBefore,
  Bu as readMxl,
  hf as regionForMeasureBoundary,
  lf as regionForNote,
  nl as relayoutMeasure,
  Bc as restValuesFor,
  Oc as scoreHeader,
  ju as setScoreHeader,
  Mc as sortDynamics,
  vc as spelledWholes,
  Gn as stemDirectionForNotes,
  gi as textDirections,
  Sc as toMidi,
  yd as transpose,
  xd as validateMeasure,
  vd as withoutNoteMarkup,
  Sd as withoutTieMarkup
};
