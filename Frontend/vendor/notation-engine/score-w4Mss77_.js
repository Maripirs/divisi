var Tt = Object.defineProperty;
var ct = (o) => {
  throw TypeError(o);
};
var St = (o, t, e) => t in o ? Tt(o, t, { enumerable: !0, configurable: !0, writable: !0, value: e }) : o[t] = e;
var d = (o, t, e) => St(o, typeof t != "symbol" ? t + "" : t, e), q = (o, t, e) => t.has(o) || ct("Cannot " + e);
var v = (o, t, e) => (q(o, t, "read from private field"), e ? e.call(o) : t.get(o)), A = (o, t, e) => t.has(o) ? ct("Cannot add the same private member more than once") : t instanceof WeakSet ? t.add(o) : t.set(o, e), Y = (o, t, e, s) => (q(o, t, "write to private field"), s ? s.call(o, e) : t.set(o, e), e), g = (o, t, e) => (q(o, t, "access private method"), e);
var V = (o, t, e, s) => ({
  set _(n) {
    Y(o, t, n, e);
  },
  get _() {
    return v(o, t, s);
  }
});
const Et = ["C", "D", "E", "F", "G", "A", "B"], Nt = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
};
function Kt(o) {
  return o.octave * 7 + Et.indexOf(o.step);
}
function Wt(o) {
  return (o.octave + 1) * 12 + Nt[o.step] + o.alter;
}
const Mt = [
  ["C", 0],
  ["C", 1],
  ["D", 0],
  ["D", 1],
  ["E", 0],
  ["F", 0],
  ["F", 1],
  ["G", 0],
  ["G", 1],
  ["A", 0],
  ["A", 1],
  ["B", 0]
], $t = [
  ["C", 0],
  ["D", -1],
  ["D", 0],
  ["E", -1],
  ["E", 0],
  ["F", 0],
  ["G", -1],
  ["G", 0],
  ["A", -1],
  ["A", 0],
  ["B", -1],
  ["B", 0]
];
function Ct(o, t = "sharp") {
  const e = t === "sharp" ? Mt : $t, s = Math.floor(o / 12) - 1, n = e[(o % 12 + 12) % 12];
  if (!n) throw new Error(`unreachable: no spelling for midi ${o}`);
  const [r, i] = n;
  return { step: r, alter: i, octave: s };
}
function Bt(o, t) {
  return t === 0 ? o : Ct(Wt(o) + t, t > 0 ? "sharp" : "flat");
}
function Pt(o) {
  const t = /^([A-Ga-g])(#|b|)(-?\d+)$/.exec(o.trim());
  if (!t) throw new Error(`not a pitch name: "${o}"`);
  const [, e = "", s = "", n = ""] = t;
  return {
    step: e.toUpperCase(),
    alter: s === "#" ? 1 : s === "b" ? -1 : 0,
    octave: Number.parseInt(n, 10)
  };
}
function k(o, t) {
  return o.step === t.step && o.alter === t.alter && o.octave === t.octave;
}
function Xt(o) {
  const t = o.alter > 0 ? "#".repeat(o.alter) : "b".repeat(-o.alter);
  return `${o.step}${t}${o.octave}`;
}
function Qt(o, t) {
  const e = ["F", "C", "G", "D", "A", "E", "B"], s = ["B", "E", "A", "D", "G", "C", "F"];
  return o > 0 ? e.slice(0, o).includes(t) ? 1 : 0 : o < 0 && s.slice(0, -o).includes(t) ? -1 : 0;
}
const Zt = Object.freeze([
  "pppppp",
  "ppppp",
  "pppp",
  "ppp",
  "pp",
  "p",
  "mp",
  "mf",
  "f",
  "ff",
  "fff",
  "ffff",
  "fffff",
  "ffffff",
  "sf",
  "sfz",
  "sffz",
  "sfp",
  "sfpp",
  "sfzp",
  "fp",
  "fz",
  "rf",
  "rfz",
  "pf",
  "n"
]), gt = Object.freeze([]);
function At(o) {
  return o.length === 0 ? gt : [...o].sort((t, e) => t.onset - e.onset);
}
function Rt(o, t) {
  return o.measureIndex < t.measureIndex || o.measureIndex === t.measureIndex && o.onset < t.onset - 1e-9;
}
const ut = Object.freeze([]), ft = /* @__PURE__ */ new WeakMap();
function te(o) {
  const t = o.passthrough;
  if (t.length === 0) return ut;
  let e = ft.get(t);
  if (!e) {
    const s = [];
    for (const n of t) {
      const r = kt(n.element, n.onset.num / n.onset.den);
      r && s.push(r);
    }
    e = s.length === 0 ? ut : Object.freeze(s.sort((n, r) => n.onset - r.onset)), ft.set(t, e);
  }
  return e;
}
function kt(o, t) {
  if (o.name !== "direction") return null;
  let e = "", s;
  const n = [];
  let r = !1;
  for (const u of o.children)
    if (u.name === "sound" && (r || (r = u.attrs.tempo !== void 0)), u.name === "direction-type") {
      for (const c of u.children)
        if (c.name === "words")
          s ?? (s = c), e += c.text;
        else if (c.name === "metronome") {
          const l = Ft(c);
          l && n.push(l);
        }
    }
  const i = e.split(/\r?\n/).map((u) => u.trim()).find((u) => u !== "") ?? null;
  if (i === null && n.length === 0) return null;
  const a = o.attrs.placement;
  return {
    onset: t,
    placement: a === "above" || a === "below" ? a : null,
    text: i,
    metronome: n[0] ?? null,
    metronomes: n,
    tempo: r || n.length > 0,
    italic: (s == null ? void 0 : s.attrs["font-style"]) === "italic",
    bold: (s == null ? void 0 : s.attrs["font-weight"]) === "bold"
  };
}
function Ft(o) {
  var n;
  const t = o.children.filter((r) => r.name === "beat-unit"), e = (n = o.children.find((r) => r.name === "per-minute")) == null ? void 0 : n.text.trim();
  if (t.length !== 1 || !e) return null;
  const s = o.children.filter((r) => r.name === "beat-unit-dot").length;
  return { beatUnit: t[0].text.trim(), dots: s, perMinute: e };
}
const rt = Object.freeze([]);
function jt(o) {
  return Object.freeze({
    verse: o.verse ?? "1",
    syllabic: o.syllabic ?? "single",
    text: o.text,
    elisions: o.elisions && o.elisions.length > 0 ? Object.freeze(o.elisions.map((t) => Object.freeze({ ...t }))) : zt,
    extend: o.extend ?? null,
    source: o.source ?? null
  });
}
const zt = Object.freeze([]);
function Dt(o) {
  return !o || o.length === 0 ? rt : Object.isFrozen(o) && o.every((t) => Object.isFrozen(t) && "source" in t) ? o : Object.freeze(o.map(jt));
}
function ht(o, t) {
  const e = /^\d+$/.test(o) ? Number(o) : null, s = /^\d+$/.test(t) ? Number(t) : null;
  return e !== null && s !== null ? e - s : e !== null ? -1 : s !== null ? 1 : o < t ? -1 : o > t ? 1 : 0;
}
function ee(o) {
  return o.elisions.length === 0 ? o.text : [o.text, ...o.elisions.map((t) => t.text)].join("‿");
}
function se(o) {
  const t = o.elisions.length > 0 ? o.elisions[o.elisions.length - 1].syllabic : o.syllabic;
  return t === "begin" || t === "middle";
}
function ne(o) {
  return o.text !== "" && o.extend !== null && o.extend !== "stop";
}
function oe(o) {
  if (o.length === 1) {
    const e = o[0].lyrics;
    return e.length < 2 ? e : [...e].sort((s, n) => ht(s.verse, n.verse));
  }
  const t = /* @__PURE__ */ new Map();
  for (const e of o) for (const s of e.lyrics) t.has(s.verse) || t.set(s.verse, s);
  return t.size === 0 ? rt : [...t.values()].sort((e, s) => ht(e.verse, s.verse));
}
function dt(o, t) {
  if (t.length === 0) return o;
  const e = t.filter((s) => !o.some((n) => n.verse === s.verse));
  return e.length === 0 ? o : Object.freeze([...o, ...e]);
}
const C = Object.freeze([]);
function Gt(o, t) {
  const e = Object.keys(o.attrs).sort().map((n) => ` ${n}=${JSON.stringify(o.attrs[n])}`).join("");
  let s;
  return o.children.length > 0 ? s = o.children.map((n) => Gt(n, t)).join("") : t !== void 0 && (o.name === "offset" || o.name === "duration") ? s = Lt(o.text, t) : s = JSON.stringify(o.text), `<${o.name}${e}>${s}</${o.name}>`;
}
function Lt(o, t) {
  const e = Number(o.trim());
  if (!Number.isInteger(e)) return JSON.stringify(o);
  let s = Math.abs(e), n = t * 4;
  for (; n !== 0; ) [s, n] = [n, s % n];
  const r = s === 0 ? 1 : s;
  return `${e / r}/${t * 4 / r}`;
}
function vt(o, t) {
  let e = !1;
  const s = [];
  for (const n of o) {
    if (t(n, !1)) {
      e = !0;
      continue;
    }
    if (n.name === "notations") {
      const r = n.children.filter((i) => !t(i, !0));
      if (r.length !== n.children.length) {
        e = !0, r.length > 0 && s.push(Object.freeze({ ...n, children: Object.freeze(r) }));
        continue;
      }
    }
    s.push(n);
  }
  return e ? s.length === 0 ? C : Object.freeze(s) : o;
}
function J(o, t) {
  return vt(
    o,
    (e, s) => (s ? e.name === "tied" : e.name === "tie") && (t === void 0 || e.attrs.type === t)
  );
}
const N = {
  breve: 2,
  whole: 1,
  half: 1 / 2,
  quarter: 1 / 4,
  eighth: 1 / 8,
  "16th": 1 / 16,
  "32nd": 1 / 32,
  "64th": 1 / 64
}, wt = Object.freeze(["breve", "whole", "half", "quarter", "eighth", "16th", "32nd", "64th"]);
function bt(o, t) {
  return N[o] * (2 - 2 ** -t);
}
function _t(o, t = [0, 1, 2]) {
  for (const e of t)
    for (const s of wt)
      if (Math.abs(bt(s, e) - o) < 1e-6) return { value: s, dots: e };
  return null;
}
function Vt(o, t) {
  const e = [];
  let s = o, n = t;
  const r = 1e-9, i = (a, u) => {
    const c = a / u;
    return Math.abs(c - Math.round(c)) < 1e-6;
  };
  for (; n > r; ) {
    const a = wt.filter((c) => N[c] <= n + r);
    if (a.length === 0) return null;
    const u = a.find((c) => i(s, N[c])) ?? a[0];
    e.push(u), s += N[u], n -= N[u];
  }
  return e;
}
const re = { actualNotes: 3, normalNotes: 2 }, Z = Object.freeze([]), Ut = Object.freeze([
  "staccato",
  "staccatissimo",
  "tenuto",
  "detached-legato",
  "accent",
  "strong-accent"
]), Ht = Object.freeze({
  slash: !1,
  stealTimePrevious: null,
  stealTimeFollowing: null,
  makeTime: null
}), ie = Object.freeze({ ...Ht, slash: !0 }), it = Object.freeze([]);
class R {
  constructor(t, e) {
    d(this, "id");
    d(this, "pitch");
    d(this, "value");
    d(this, "voice");
    d(this, "dots");
    d(this, "tuplet");
    /** See `NoteSpec.tiedToId`. Mutable so `Score.setTie` can wire, change or
     *  clear it after construction; kept in sync with `Score`'s reverse index
     *  only when changed through `Score.setTie` (or `Score.appendNote`'s own
     *  spec-time wiring), never by assigning this field directly. */
    d(this, "tiedToId");
    /** See `NoteSpec.measureRestWholes`. `null` for every ordinary note or rest. */
    d(this, "measureRestWholes");
    /** See `NoteSpec.chordWithPrevious`. `false` for a chord's anchor and for
     *  every ordinary note or rest. */
    d(this, "chordWithPrevious");
    /** See `NoteSpec.articulations`. Always in `ARTICULATIONS` order with no
     *  duplicates; replaced wholesale (never mutated), so a clone may share it. */
    d(this, "articulations");
    /** See `NoteSpec.fermata`. `null` for none. */
    d(this, "fermata");
    /** See `NoteSpec.arpeggiate`. */
    d(this, "arpeggiate");
    /** See `NoteSpec.beam`. `null` when the source said nothing about beams. */
    d(this, "beam");
    /** See `NoteSpec.grace`. `null` for every ordinary note or rest. */
    d(this, "grace");
    /** See `NoteSpec.lyrics`. Frozen, replaced wholesale (never mutated), so a
     *  clone may share it. */
    d(this, "lyrics");
    /**
     * Unmodelled children of this note's `<note>` (M6 Slice 3, see
     * `passthrough.ts`), in source order: a `<lyric>` the model cannot hold
     * (M6 Slice 9: `<humming>`, `<laughing>`), `<notehead>`, `<cue>`, a
     * `<notations>` cut down to the children the model does not own, a
     * `<tie>`/`<tied>`/`<slur>` end that never found its partner, ... Export
     * slots each back into its schema position. It belongs to this note alone,
     * so edits that keep the note (a transpose) keep it, and a chord member
     * carries its own. Replaced wholesale, never mutated: the array and every
     * element are immutable, which is what lets `Score.clone` share them.
     */
    d(this, "passthrough");
    /** See `NoteSpec.hidden`. */
    d(this, "hidden");
    if (this.id = t, this.pitch = e.pitch, this.value = e.value, this.voice = e.voice ?? 1, this.dots = e.dots ?? 0, this.tuplet = e.tuplet ?? null, this.tiedToId = e.tiedToId ?? null, this.measureRestWholes = e.measureRestWholes ?? null, this.chordWithPrevious = e.chordWithPrevious ?? !1, this.articulations = at(e.articulations), this.fermata = e.fermata ?? null, this.arpeggiate = e.arpeggiate ?? !1, this.beam = e.beam ?? null, this.grace = e.grace ?? null, this.lyrics = Dt(e.lyrics), this.passthrough = e.passthrough ?? C, this.hidden = e.hidden ?? !1, this.grace !== null && (this.pitch === null || this.chordWithPrevious || this.tuplet !== null))
      throw new Error(`Note ${t}: grace is only valid on a pitched note that is not a chord member or a tuplet`);
    if (this.measureRestWholes !== null && this.pitch !== null)
      throw new Error(`Note ${t}: measureRestWholes is only valid on a rest (pitch: null)`);
    if (this.chordWithPrevious && this.pitch === null)
      throw new Error(`Note ${t}: chordWithPrevious is only valid on a pitched note, not a rest`);
  }
  /** Whether this is a grace note; see `NoteSpec.grace`. */
  get isGrace() {
    return this.grace !== null;
  }
  /** Whether this is a whole-measure rest; see `NoteSpec.measureRestWholes`. */
  get isMeasureRest() {
    return this.measureRestWholes !== null;
  }
  get isRest() {
    return this.pitch === null;
  }
  /** Whether this note starts a tie into a following note. */
  get isTied() {
    return this.tiedToId !== null;
  }
  /**
   * Duration as a fraction of a whole note, dots and tuplet ratio both folded
   * in. Layout uses it for note spacing (so a dotted or tupleted note gets
   * proportionally more or less room without spacing needing to know why);
   * `measureDurationWholes` sums it to check a measure against its time
   * signature's capacity.
   */
  get durationWholes() {
    if (this.grace !== null) return 0;
    if (this.measureRestWholes !== null) return this.measureRestWholes;
    const t = 2 - 2 ** -this.dots, e = this.tuplet ? this.tuplet.normalNotes / this.tuplet.actualNotes : 1;
    return N[this.value] * t * e;
  }
}
function at(o) {
  return !o || o.length === 0 ? it : Object.freeze(Ut.filter((t) => o.includes(t)));
}
function ae(o) {
  if (o.length === 1) return o[0].articulations;
  let t = !1;
  for (const e of o) e.articulations.length > 0 && (t = !0);
  return t ? at(o.flatMap((e) => e.articulations)) : it;
}
function le(o) {
  return o.some((t) => t.arpeggiate);
}
function qt(o) {
  let t = null;
  for (const e of o) {
    if (e.beam !== null && e.beam !== "none") return e.beam;
    t ?? (t = e.beam);
  }
  return t;
}
function ce(o) {
  let t = null;
  for (const e of o) {
    if (e.fermata === "upright") return "upright";
    e.fermata !== null && (t = e.fermata);
  }
  return t;
}
class pt {
  constructor(t, e) {
    /**
     * Position within its own staff, 0-based. Kept in sync by `Score`/`Staff`.
     *
     * Before M2 Slice 3 this was a single score-wide flat address (every score
     * had exactly one implicit staff, so "position in the score" and "position
     * in the staff" were the same number). Now a measure is addressed by this
     * *together with* `staffIndex`: `layout.ts`'s `LaidOutMeasure`,
     * `relayoutMeasure` and `CanvasRenderer.redrawMeasure` all take the pair,
     * not this field alone. A single-staff score (every score before this
     * slice, and still the common case) is the `staffIndex`-always-0
     * degenerate case, with this field's own meaning unchanged.
     */
    d(this, "index");
    /** Which staff (`Score.staves`) this measure belongs to. See `index`'s own
     *  comment on the `(staffIndex, index)` addressing pair this slice
     *  introduces. */
    d(this, "staffIndex");
    /**
     * The printed measure number (M8 Slice 2), MusicXML's `<measure number>`
     * verbatim: a string, since it need not be numeric ("12a", "X1"), and a
     * pickup is often "0". `undefined` when the source gave none, or for a
     * measure built in code; export then writes `index + 1`. Set on every
     * staff of the part, like the barline fields. Nothing renumbers it: an
     * edit that adds or removes measures leaves the others' numbers as read.
     */
    d(this, "number");
    d(this, "notes", []);
    /**
     * A key signature change taking effect starting at this measure.
     * `undefined` means "no change here": the key in force is whatever the
     * nearest earlier measure with an explicit value set, or the score's
     * initial `keyFifths` if none ever did. Callers should not walk that chain
     * themselves; `Score.keyFifthsAt` does it once, in one place.
     */
    d(this, "keyFifths");
    /** Same idea as `keyFifths`, for a time signature change. See `Score.timeAt`. */
    d(this, "time");
    /**
     * A clef change taking effect starting at this measure (M5 Slice 5), the
     * same shape as `keyFifths`/`time`: `undefined` means "same clef as the
     * previous measure", or, for measure 0, the staff's own `Staff.clef`.
     * `Staff.clef` stays the staff's *initial* clef; an explicit value here on
     * measure 0 is an override of it, not a replacement, so `Staff.clef` never
     * has to be rewritten by an edit. Read through `Score.clefAt`, never this
     * field directly: every clef-dependent position (notehead lines, ledgers,
     * key signature octaves) needs the clef actually in force, and the
     * walk-back that answers that lives in one place.
     */
    d(this, "clef");
    /**
     * Clef changes inside this measure (M6 Slice 4; see `ClefChange`), sorted
     * by onset, each onset > 0. Per staff like `clef`, and kept separate from
     * it rather than folding `clef` in as an onset-0 entry, so every existing
     * reader of the downbeat clef (`clefAt`, `setClefRange`, the system
     * header) keeps its one-field shape. The last change's clef carries into
     * the following measures through `Score.clefAt`'s walk-back, exactly as a
     * `clef` set here would. Read through `Score.clefAtOnset`, never directly,
     * for "which clef is this note in". Replaced wholesale, never mutated.
     */
    d(this, "clefChanges", Z);
    /**
     * Dynamic marks drawn on this measure's staff (M6 Slice 6; see
     * `DynamicMark`), sorted by onset. A hairpin spans measures, so it lives
     * on the score instead (`Score.wedges`). Replaced wholesale, never
     * mutated, like `clefChanges`.
     */
    d(this, "dynamics", gt);
    /**
     * The barline at the boundary *after* this measure: `'normal'`, `'double'`,
     * `'final'` or `'repeatEnd'`. `'repeatStart'` is deliberately not a valid
     * value here; see `startBarline` for why that one belongs to the measure it
     * opens instead. `undefined` means "no explicit choice": `Score.endBarlineAt`
     * resolves that to `'normal'`, except for the score's true last measure,
     * which resolves to `'final'` instead so every score still ends with a
     * final barline with no annotation required (this is exactly what
     * `ctx.isLast` hardcoded before `BarlineType` existed). Read through
     * `Score.endBarlineAt`, never this field directly: a `repeatStart` on the
     * *next* measure also overrides whatever this field says, and that walk
     * lives in one place, the same discipline `keyFifthsAt`/`timeAt` already
     * follow for key/time changes.
     */
    d(this, "endBarline");
    /**
     * A repeat-start barline (thick line, then two dots) at the *start* of
     * this measure, opening a repeated section. The only barline type
     * conventionally attached to the start of a measure rather than the end
     * (mirroring MusicXML's `<barline location="left">` vs `"right">`), which
     * is why it gets its own field instead of living in `endBarline`: a plain
     * union field for "the barline here" would have to pick one measure to
     * belong to, and `endBarline`'s owner (the measure just before the
     * boundary) is wrong for a mark that engraving convention reads as
     * belonging to what comes *after* it.
     *
     * Despite living on this measure's own model, the ink is still drawn by
     * whichever measure's `layoutMeasure` call lays out *this* measure (i.e.
     * this one, at its own start), not by the previous measure: that keeps the
     * "a measure's ops are everything a repaint of it needs to put back"
     * invariant intact without a second draw pass or a lookahead into a
     * neighbour's ops. The previous measure still needs a one-field lookahead
     * of its own, into *this* field, to know to skip drawing its own default
     * end barline at the same boundary; see `Score.endBarlineAt`.
     */
    d(this, "startBarline");
    /**
     * How many times the section a `repeatEnd` closes is played in all
     * (MusicXML `<repeat times>`), when the source stated it; `undefined`
     * means the usual 2. Only meaningful beside `endBarline: 'repeatEnd'`.
     */
    d(this, "repeatTimes");
    /**
     * A volta opening at the start of this measure (M6 Slice 12; see
     * `EndingStart`). An ending spans every measure from here to the next
     * measure with an `endingEnd`, inclusive; import only sets the pair, never
     * a start with no end or an end with no start (that `<ending>` stays
     * `barlinePassthrough`). Set on every staff of the part, like the barline
     * fields, though only the part's first staff is read on export.
     */
    d(this, "endingStart");
    /** The volta closing at the end of this measure; see `endingStart`. */
    d(this, "endingEnd");
    /**
     * `<measure>` children the model does not hold, each anchored at the onset
     * and voice stream it was read at (M6 Slice 3; see `MeasurePassthrough`).
     * Held by the staff the stream belongs to. Replaced wholesale, never
     * mutated, like `Note.passthrough`.
     */
    d(this, "passthrough", C);
    /**
     * Children of this measure's `<attributes>` the model does not own
     * (`<staff-details>`, `<transpose>`, `<measure-style>`, ...), which export
     * merges, in schema order, into the `<attributes>` it writes for the
     * measure (writing one just for them if the model has nothing to state).
     * Kept on the part's first staff, the one export reads a part's
     * attributes from. An `<attributes>` with nothing owned in it at all is
     * positional `passthrough` instead, so a mid-measure one stays mid-measure.
     */
    d(this, "attributesPassthrough", C);
    /**
     * `<barline>` elements, minus whatever the model read out of them into
     * `startBarline`/`endBarline` (`bar-style`, and `repeat` when the model
     * holds the repeat) and `endingStart`/`endingEnd` (a well-formed
     * `<ending>`), each still carrying its `location`: an unpaired `<ending>`, a
     * `<fermata>`, a `bar-style` the model has no shape for (`dashed`,
     * `heavy`, ...). Export merges each into the barline it writes at that
     * location, or writes it alone. Kept on the part's first staff, like
     * `attributesPassthrough`.
     */
    d(this, "barlinePassthrough", C);
    this.index = t, this.staffIndex = e;
  }
}
class K {
  constructor(t, e = "treble") {
    d(this, "index");
    d(this, "clef");
    d(this, "measures", []);
    this.index = t, this.clef = e;
  }
}
function ue(o) {
  return o.groupSymbol ?? (o.staffIndices.length === 2 ? "brace" : "bracket");
}
function Yt(o) {
  return o.notes.reduce(
    (t, e) => e.chordWithPrevious || e.grace !== null ? t : t + e.durationWholes,
    0
  );
}
function mt(o) {
  const t = [], e = /* @__PURE__ */ new Map();
  for (const s of o) {
    if (s.grace !== null) continue;
    const n = s.chordWithPrevious ? e.get(s.voice) : void 0;
    if (n) {
      n.push(s);
      continue;
    }
    const r = [s];
    t.push(r), e.set(s.voice, r);
  }
  return t;
}
function fe(o) {
  const t = [], e = /* @__PURE__ */ new Map();
  for (const s of o)
    if (s.grace !== null) {
      let n = e.get(s.voice);
      n || (n = { voice: s.voice, notes: [], principal: null }, t.push(n), e.set(s.voice, n)), n.notes.push(s);
    } else if (!s.chordWithPrevious) {
      const n = e.get(s.voice);
      n && (n.principal = s, e.delete(s.voice));
    }
  return t;
}
function xt(o) {
  return o.beats / o.beatType;
}
function he(o, t) {
  const e = Yt(o), s = xt(t), n = /* @__PURE__ */ new Map();
  for (const a of o.notes)
    a.chordWithPrevious || a.grace !== null || n.set(a.voice, (n.get(a.voice) ?? 0) + a.durationWholes);
  const r = [...n.entries()].map(([a, u]) => ({
    voice: a,
    actualWholes: u,
    valid: Math.abs(u - s) < 1e-9
  }));
  return { valid: r.length > 0 && r.every((a) => a.valid), actualWholes: e, expectedWholes: s, perVoice: r };
}
var I, $, E, B, f, et, M, U, z, st, nt, D, It, ot, H, G;
const lt = class lt {
  constructor(t = {}) {
    A(this, f);
    /**
     * Every staff in the score (M2 Slice 3). The constructor always creates
     * `staves[0]`, so a single-staff score (every score before this slice, and
     * still the common case) never has to think about this array at all;
     * `appendStaff` adds more.
     */
    d(this, "staves");
    /**
     * Every part in the score, each grouping one or more `staves` indices. The
     * constructor creates one default part holding just `staves[0]`, mirroring
     * `staves` itself: a single-staff, single-part score (every score before
     * this slice) needs no code change to keep that shape. See `Part`'s own
     * comment for what this does and does not do yet.
     */
    d(this, "parts");
    /** The key in force before any measure states its own change; equivalent to
     *  a change "at measure -1". Read this directly only when literally asking
     *  about the score's starting point; `keyFifthsAt` is what answers "what
     *  key is measure N actually in", which is what layout and validation need. */
    d(this, "keyFifths");
    /** Same idea as `keyFifths`, for the time signature. See `timeAt`. */
    d(this, "time");
    /** Score-wide tempo in quarter-note beats per minute. See `ScoreOptions
     *  .tempoBpm`: like `keyFifths`/`time` this is a single starting value with
     *  no mid-score change tracked yet, so playback (`src/playback`) reads this
     *  field directly rather than through a walk-back accessor. */
    d(this, "tempoBpm");
    /** Every slur in the score, in the order `addSlur` was called. Layout reads
     *  this directly (not through some per-measure index) since a slur's own
     *  measure range has to be worked out fresh from its two note ids anyway,
     *  the same reason a tie's crossing-a-barline case reads `Note.tiedToId`
     *  and `tiedFromNote` rather than a precomputed span.
     *
     * A slur's two ends are validated against `notesInOrder(staffIndex)`
     * (that method's own comment explains the per-staff parameter): both ends
     * must land on the same staff, and `addSlur` resolves and passes that
     * staff's index in itself, so a slur can anchor on any single staff, not
     * just `staves[0]`. A slur straddling *two different* staves is still
     * rejected (`addSlur` throws), since a slur's curve is drawn within one
     * staff's own band and there is no single cross-staff "score order" for
     * two ends on different staves to be checked against in the first place. */
    d(this, "slurs", []);
    /** Every cross-staff beam in the score (M2 Slice 6), in the order
     *  `addCrossStaffBeam` was called. See `CrossStaffBeam`'s own comment for
     *  what this does and does not model. */
    d(this, "crossStaffBeams", []);
    /**
     * Every crescendo/diminuendo hairpin (M6 Slice 6; see `Wedge`), in the
     * order they were added. A score-level list like `slurs`, since a hairpin
     * spans measures; layout and playback find the ones crossing a measure by
     * scanning it, which is cheap at the hundreds a real score has. Entries are
     * immutable: an edit replaces one.
     */
    d(this, "wedges", []);
    /**
     * The score header the model does not hold (M6 Slice 3): every
     * `<score-partwise>` child before `<part-list>` (`<work>`,
     * `<movement-title>`, `<identification>`, `<defaults>`, `<credit>`), in
     * source order, written back ahead of the part list.
     */
    d(this, "headerPassthrough", C);
    // Note id -> owning measure. Maintained on insert so an edit can answer
    // "which measure did I just touch" in O(1) instead of scanning the score.
    // On a 124-measure piece a scan would still be fast, but the index is the
    // honest shape for the incremental-edit architecture this spike is testing.
    A(this, I, /* @__PURE__ */ new Map());
    // Reverse index for ties: target note id -> the note whose `tiedToId`
    // names it. `Note.tiedToId` alone answers "what does this note tie into";
    // layout also needs the opposite question ("does some earlier note tie
    // into this one") when it lays out the *receiving* end of a tie that
    // crosses a barline, and that end has no field of its own to answer it
    // from. Kept as a separate map rather than a second field on `Note`
    // because at most one note ties into any given note (a target has one
    // source), so it is naturally a map, not a per-note list.
    A(this, $, /* @__PURE__ */ new Map());
    // Note id -> the CrossStaffBeam containing it, mirroring
    // `#tieSourceOfTarget`: layout looks this up once per note it lays out
    // (`crossStaffBeamContaining`), so an index beats scanning
    // `crossStaffBeams` on every note.
    A(this, E, /* @__PURE__ */ new Map());
    A(this, B, 1);
    this.keyFifths = t.keyFifths ?? 0, this.time = t.time ?? { beats: 4, beatType: 4 }, this.tempoBpm = t.tempoBpm ?? 120, this.staves = [new K(0, t.clef ?? "treble")], this.parts = [{ staffIndices: [0] }];
  }
  /** `staves[0]`'s own clef, kept as a convenience accessor so code (and any
   *  external reader) written against "the score's clef" from before M2
   *  Slice 3 still resolves to something sensible; a genuinely multi-staff
   *  score should read `staves[i].clef` directly instead. Either way this
   *  is only the *initial* clef: since M5 Slice 5 a measure can change it
   *  mid-staff, so "the clef at measure N" is `clefAt`'s question. */
  get clef() {
    return this.staves[0].clef;
  }
  /**
   * `staves[0]`'s own measures, kept as a convenience accessor for the same
   * reason `clef` is: every score built before M2 Slice 3 (and `buildScore`'s
   * own compact literal, still single-staff-only) reads/writes this directly,
   * and it stays the exact degenerate case of `staves[0].measures` for a
   * single-staff score. A genuinely multi-staff caller reads `staves[i]
   * .measures` instead.
   */
  get measures() {
    return this.staves[0].measures;
  }
  /** Add a new staff (default clef `'treble'`) and return it. The score's
   *  constructor always creates `staves[0]`; this is how a score grows a
   *  second or later staff, e.g. a piano's two staves or an additional SATB
   *  voice. Does not add the new staff to any `Part`: a caller wanting a
   *  multi-staff part (a piano's brace, a choir's bracket) still has to add
   *  or edit a `Part` itself, since a bare `appendStaff` call has no way to
   *  guess whether the new staff joins an existing part or starts its own. */
  appendStaff(t = "treble") {
    const e = new K(this.staves.length, t);
    return this.staves.push(e), e;
  }
  /** Add a new `Part` grouping `staffIndices`, returning it. See `Part`'s own
   *  comment: this only records the grouping, it draws no brace/bracket
   *  (Slice 5's job). */
  addPart(t, e, s, n = !1, r) {
    const i = {
      name: e,
      staffIndices: t,
      ...s && s.length > 0 ? { passthrough: s } : {},
      ...n ? { nameHidden: n } : {},
      ...r ? { groupSymbol: r } : {}
    };
    return this.parts.push(i), i;
  }
  /** Append a measure to a staff (`staves[0]` by default, preserving every
   *  single-staff call site from before M2 Slice 3 unchanged) and return it. */
  appendMeasure(t = 0) {
    const e = this.staves[t];
    if (!e) throw new Error(`appendMeasure: no staff at index ${t}`);
    const s = new pt(e.measures.length, t);
    return e.measures.push(s), s;
  }
  /**
   * The key signature in force at `measureIndex`: that measure's own
   * `keyFifths` if it set one, otherwise the nearest earlier measure's,
   * otherwise the score's initial `keyFifths`. Every reader that needs "the
   * key right now" (layout's key-aware accidental suppression, the courtesy
   * key signature at a change) calls this rather than walking `measures`
   * itself, so the walk-back rule lives in exactly one place.
   *
   * `staffIndex` (M2 Slice 3, default 0) walks back through *that staff's
   * own* measures: every score before this slice only ever had staff 0, so
   * the default reproduces the exact old single-argument behaviour.
   */
  keyFifthsAt(t, e = 0) {
    var n, r;
    const s = ((n = this.staves[e]) == null ? void 0 : n.measures) ?? [];
    for (let i = t; i >= 0; i--) {
      const a = (r = s[i]) == null ? void 0 : r.keyFifths;
      if (a !== void 0) return a;
    }
    return this.keyFifths;
  }
  /** Same walk-back as `keyFifthsAt`, for the time signature in force at
   *  `measureIndex` (of `staffIndex`, default 0). Layout uses this for beat
   *  grouping and the courtesy time signature at a change; `validateMeasure`
   *  uses it to check a measure against the capacity that actually applies to
   *  it, not the score's initial one, once a measure has changed it. */
  timeAt(t, e = 0) {
    var n, r;
    const s = ((n = this.staves[e]) == null ? void 0 : n.measures) ?? [];
    for (let i = t; i >= 0; i--) {
      const a = (r = s[i]) == null ? void 0 : r.time;
      if (a !== void 0) return a;
    }
    return this.time;
  }
  /**
   * The clef in force at `measureIndex` of `staffIndex` (M5 Slice 5): that
   * measure's own `clef` if it set one, otherwise the nearest earlier
   * measure's, otherwise the staff's own initial `Staff.clef`. The same
   * walk-back `keyFifthsAt`/`timeAt` already do, with the per-staff fallback
   * in place of a score-wide one, since a clef has always been per staff
   * (M2 Slice 3). Argument order matches those siblings (measure first,
   * staff defaulting to 0) rather than the plan's `(staffIndex,
   * measureIndex)` sketch, so every walk-back accessor reads the same way.
   */
  clefAt(t, e = 0) {
    const s = this.staves[e], n = (s == null ? void 0 : s.measures) ?? [];
    for (let r = t; r >= 0; r--) {
      const i = n[r];
      if (i && r < t && i.clefChanges.length > 0)
        return i.clefChanges[i.clefChanges.length - 1].clef;
      const a = i == null ? void 0 : i.clef;
      if (a !== void 0) return a;
    }
    return (s == null ? void 0 : s.clef) ?? "treble";
  }
  /**
   * The clef in force at `onsetWholes` (wholes from the start) inside
   * `measureIndex` (M6 Slice 4): the last `Measure.clefChanges` entry at or
   * before that onset, else the downbeat clef `clefAt` resolves. A change is
   * in force *at* its own onset, so the note it sits before reads it. Onsets
   * are compared with a tolerance far below any real duration, for the same
   * float-summation reason layout buckets its column onsets.
   */
  clefAtOnset(t, e, s = 0) {
    var r, i;
    const n = ((i = (r = this.staves[s]) == null ? void 0 : r.measures[t]) == null ? void 0 : i.clefChanges) ?? Z;
    for (let a = n.length - 1; a >= 0; a--)
      if (n[a].onset <= e + 1e-9) return n[a].clef;
    return this.clefAt(t, s);
  }
  /** The clef in force at the end of `measureIndex` (M6 Slice 4): its last
   *  mid-measure change, else its downbeat clef. What the next measure
   *  inherits when it states no clef of its own. */
  clefAtEnd(t, e = 0) {
    return this.clefAtOnset(t, Number.POSITIVE_INFINITY, e);
  }
  /**
   * The barline actually drawn at the boundary after `measureIndex`.
   *
   * Unlike `keyFifthsAt`/`timeAt`, a barline never *inherits* forward from an
   * earlier measure: each boundary is decided fresh from just the two
   * measures touching it. Two rules apply, in order. First, if the
   * *following* measure opens with `startBarline: 'repeatStart'`, that wins
   * regardless of what this measure's own `endBarline` says: a repeat start
   * is conventionally attached to the measure it opens (see
   * `Measure.startBarline`'s own comment), and the two fields could
   * otherwise disagree about who draws a boundary that only ever has one
   * physical barline. Second, an unset `endBarline` resolves to `'normal'`,
   * except at the score's true last measure, where it resolves to `'final'`
   * instead, preserving the behaviour `ctx.isLast` hardcoded before
   * `BarlineType` existed: every score still ends with a final barline with
   * no explicit annotation required, but a score that *does* annotate its
   * last measure (e.g. `endBarline: 'double'`) is honoured over the
   * automatic default.
   *
   * `staffIndex` (M2 Slice 3, default 0) resolves the boundary within *that
   * staff's own* measures, the same additive default every other staff-aware
   * method here uses.
   */
  endBarlineAt(t, e = 0) {
    var r, i, a;
    const s = ((r = this.staves[e]) == null ? void 0 : r.measures) ?? [];
    if (((i = s[t + 1]) == null ? void 0 : i.startBarline) === "repeatStart") return "repeatStart";
    const n = (a = s[t]) == null ? void 0 : a.endBarline;
    return n !== void 0 ? n : t === s.length - 1 ? "final" : "normal";
  }
  /**
   * The score's voltas in order, read off the top staff (every staff carries
   * the same fields): each `endingStart` paired with the next `endingEnd` at
   * or after it. A start with no end (import never leaves one) is skipped.
   * Shared by the volta brackets (layout) and the play order (playback).
   */
  endings() {
    var s, n;
    const t = ((s = this.staves[0]) == null ? void 0 : s.measures) ?? [], e = [];
    for (let r = 0; r < t.length; r++) {
      const i = t[r].endingStart;
      if (!i) continue;
      let a = r;
      for (; a < t.length && !t[a].endingEnd; ) a++;
      const u = (n = t[a]) == null ? void 0 : n.endingEnd;
      u && (e.push({ first: r, last: a, start: i, end: u }), r = a);
    }
    return e;
  }
  /** Append a note (or rest) to a measure, returning it so callers can keep its id. */
  appendNote(t, e) {
    if (e.chordWithPrevious) {
      const n = e.voice ?? 1;
      let r;
      for (let i = t.notes.length - 1; i >= 0 && !r; i--)
        t.notes[i].voice === n && t.notes[i].grace === null && (r = t.notes[i]);
      if (!r || r.pitch === null)
        throw new Error(
          `appendNote: a chord member (chordWithPrevious) needs an earlier pitched note in voice ${n} of the same measure`
        );
    }
    const s = new R(`n${V(this, B)._++}`, e);
    return t.notes.push(s), v(this, I).set(s.id, t), s.tiedToId !== null && g(this, f, et).call(this, s.id, s.tiedToId), s;
  }
  findNote(t) {
    var e;
    return (e = this.measureOfNote(t)) == null ? void 0 : e.notes.find((s) => s.id === t);
  }
  measureOfNote(t) {
    return v(this, I).get(t);
  }
  /**
   * Every note in the score, flattened in playback order (measure order, then
   * position within a measure). Layout's slur pass uses this to walk the run
   * of notes a slur spans, and `addSlur` uses it to check that a slur's start
   * genuinely comes before its end; a tie never needed this because its
   * target is always a single note named directly, never "whatever comes
   * between two others."
   *
   * Takes a `staffIndex` (M2 Slice 3, default 0) because multiple staves each
   * have their own independent note sequence: there is no single flat "score
   * order" spanning every staff at once (a question M3's own scoping notes
   * flag again for playback, unanswered for the same reason here), only one
   * order *per staff*. Defaulting to 0 reproduces this method's original
   * pre-Slice-3 no-argument behaviour for every existing caller that never
   * needed anything but `staves[0]`.
   *
   * This used to be a real bug, not just a documented scope cut: reading
   * `this.measures` (`staves[0]` alone) unconditionally meant `addSlur`'s
   * order check on any staff other than 0 always compared two `-1` indices
   * from `Array.indexOf` finding nothing, which always satisfied
   * `startIndex >= endIndex` and made `addSlur` throw "must come before" for
   * every non-staff-0 slur regardless of the actual notes involved. The
   * `staffIndex` parameter is the fix: `addSlur` now resolves the slur's
   * actual staff and passes it through here instead of always reading
   * staff 0.
   */
  notesInOrder(t = 0) {
    var e;
    return ((e = this.staves[t]) == null ? void 0 : e.measures.flatMap((s) => s.notes)) ?? [];
  }
  /**
   * Add a slur (phrase mark) spanning every note from `startNoteId` to
   * `endNoteId`, inclusive, in score order.
   *
   * Unlike `setTie`, there is no pitch-equality constraint: a slur marks a
   * phrase, not a sounding continuation, so any two notes at any two pitches
   * qualify. Both ends must already be notes (not rests: a slur has to
   * anchor its curve to an actual notehead), both ends must live on the
   * *same* staff (a slur's curve is drawn within one staff's own band; see
   * `notesInOrder`'s own comment on why there is no single cross-staff
   * "score order" to check a straddling slur against in the first place),
   * and `startNoteId` must come before `endNoteId` in that staff's own
   * `notesInOrder()`, since layout walks forward from one to the other to
   * find what the slur spans; a backwards or same-note span would have
   * nothing to walk.
   */
  addSlur(t, e) {
    const s = this.findNote(t);
    if (!s) throw new Error(`addSlur: unknown start note id "${t}"`);
    const n = this.findNote(e);
    if (!n) throw new Error(`addSlur: unknown end note id "${e}"`);
    if (s.pitch === null)
      throw new Error(`addSlur: start note "${t}" is a rest, which cannot anchor a slur`);
    if (n.pitch === null)
      throw new Error(`addSlur: end note "${e}" is a rest, which cannot anchor a slur`);
    const r = this.measureOfNote(t).staffIndex, i = this.measureOfNote(e).staffIndex;
    if (r !== i)
      throw new Error(
        `addSlur: start note "${t}" (staff ${r}) and end note "${e}" (staff ${i}) must be on the same staff`
      );
    const a = this.notesInOrder(r), u = a.indexOf(s), c = a.indexOf(n);
    if (u >= c)
      throw new Error(
        `addSlur: start note "${t}" must come before end note "${e}" in score order`
      );
    const l = { startNoteId: t, endNoteId: e };
    return this.slurs.push(l), l;
  }
  /**
   * Add a dynamic mark (M6 Slice 6) at `onset` wholes into measure
   * `measureIndex` of staff `staffIndex`, keeping `Measure.dynamics` sorted.
   * For a score built in code; import reads marks with their source attached
   * (`DynamicMark.source`) and sets the list directly. `voice` defaults to
   * the measure's first voice, the stream export writes the mark in.
   */
  addDynamic(t, e, s) {
    var a, u;
    const n = (a = this.staves[t]) == null ? void 0 : a.measures[e];
    if (!n) throw new Error(`addDynamic: no measure ${e} on staff ${t}`);
    const r = s.onset ?? 0;
    if (r < 0) throw new Error(`addDynamic: onset ${r} is before the measure's downbeat`);
    const i = {
      kind: s.kind,
      onset: r,
      placement: s.placement ?? null,
      voice: s.voice ?? ((u = n.notes[0]) == null ? void 0 : u.voice) ?? 1,
      source: null
    };
    return n.dynamics = At([...n.dynamics, i]), i;
  }
  /**
   * Add a crescendo/diminuendo hairpin (M6 Slice 6) on staff `staffIndex`
   * from `start` to `stop`, each a measure index plus an onset in wholes
   * from that measure's downbeat (default 0; a stop "at the barline" is the
   * measure's own length). Throws for a missing staff or measure, or a stop
   * before its start. For a score built in code, like `addDynamic`.
   */
  addWedge(t) {
    const e = t.staffIndex ?? 0, s = this.staves[e];
    if (!s) throw new Error(`addWedge: no staff at index ${e}`);
    const n = (u, c) => {
      var h;
      const l = s.measures[u.measureIndex];
      if (!l) throw new Error(`addWedge: ${c} measure ${u.measureIndex} is not on staff ${e}`);
      return {
        measureIndex: u.measureIndex,
        onset: u.onset ?? 0,
        voice: ((h = l.notes[0]) == null ? void 0 : h.voice) ?? 1,
        source: null
      };
    }, r = n(t.start, "start"), i = n(t.stop, "stop");
    if (Rt(i, r)) throw new Error("addWedge: the stop comes before the start");
    const a = { kind: t.kind, staffIndex: e, placement: t.placement ?? null, start: r, stop: i };
    return this.wedges.push(a), a;
  }
  /**
   * Add an explicit cross-staff beam (M2 Slice 6) linking `noteIds`, each
   * already a note in its own staff's own Measure. See `CrossStaffBeam`'s own
   * comment for what this does and does not model.
   *
   * Validated tightly since nothing later can sensibly render a malformed
   * group: every id must be a real, pitched note (a rest has no stem to
   * extend across the gap) whose own duration is beam-eligible (eighth note
   * or shorter, the same threshold `layout.ts`'s FLAG_GLYPHS keys on, checked
   * here via NOTE_VALUE_WHOLES so this file does not need to import anything
   * from layout.ts to know it); every note must land in the exact same
   * measure column (the same Measure.index) across staves, since this slice
   * does not attempt to coordinate x-position across a measure *and* a staff
   * boundary at once (documented scope cut, see layout.ts); the notes'
   * owning measures must span exactly two distinct, adjacent staffIndices
   * (this slice only ever splits one shared gap, the same scope barlineSpan
   * itself already narrowed to "spanning the full staff-group height" rather
   * than an arbitrary non-adjacent pair); and each staff side needs at least
   * two of its own notes, since layoutBeamGroup's ordinary machinery draws a
   * real beam segment only for two or more members. A cross-staff beam with
   * only one note on one side would need real engraving's "beamlet stub
   * toward the gap" convention for that side, which this slice does not
   * build (documented scope cut).
   */
  addCrossStaffBeam(t) {
    if (t.length < 2)
      throw new Error("addCrossStaffBeam: needs at least 2 note ids");
    const e = t.map((l) => {
      const h = this.findNote(l);
      if (!h) throw new Error(`addCrossStaffBeam: unknown note id "${l}"`);
      return h;
    });
    for (const l of e) {
      if (l.pitch === null)
        throw new Error(`addCrossStaffBeam: note "${l.id}" is a rest, which cannot join a beam`);
      if (N[l.value] > N.eighth)
        throw new Error(
          `addCrossStaffBeam: note "${l.id}" has value "${l.value}", too long to beam (needs eighth or shorter)`
        );
    }
    const s = e.map((l) => this.measureOfNote(l.id)), n = s[0].index;
    if (s.some((l) => l.index !== n))
      throw new Error("addCrossStaffBeam: every note must land in the same measure column across staves");
    const r = [...new Set(s.map((l) => l.staffIndex))];
    if (r.length !== 2)
      throw new Error(
        `addCrossStaffBeam: notes must span exactly two distinct staves, found ${r.length}`
      );
    const [i, a] = r.sort((l, h) => l - h);
    if (a - i !== 1)
      throw new Error(`addCrossStaffBeam: the two staves must be adjacent, got ${i} and ${a}`);
    const u = /* @__PURE__ */ new Map();
    for (const l of s)
      u.set(l.staffIndex, (u.get(l.staffIndex) ?? 0) + 1);
    for (const l of [i, a])
      if ((u.get(l) ?? 0) < 2)
        throw new Error(`addCrossStaffBeam: staff ${l} needs at least 2 notes of its own in the beam`);
    const c = { noteIds: [...t], staffIndices: [i, a] };
    this.crossStaffBeams.push(c);
    for (const l of t) v(this, E).set(l, c);
    return c;
  }
  /** The CrossStaffBeam containing `id`, if any. Layout uses this once per
   *  note it lays out, exactly like `tiedFromNote`. */
  crossStaffBeamContaining(t) {
    return v(this, E).get(t);
  }
  /**
   * Wire, change or clear a tie starting at `sourceId`.
   *
   * `targetId: null` unties `sourceId` from whatever it pointed at. A
   * non-null target must already be a note in this score (both notes must
   * exist for the pitch check below to run), which is exactly the
   * chicken-and-egg problem `buildScore`'s `extra.tiedToNext` sugar exists to
   * route around: a literal that reads top-to-bottom names a tie's source
   * before its target is ever built, so `buildScore` calls this only in a
   * second pass, once every note has an id.
   */
  setTie(t, e) {
    const s = this.findNote(t);
    if (!s) throw new Error(`setTie: unknown note id "${t}"`);
    s.tiedToId !== null && v(this, $).delete(s.tiedToId), e !== null && g(this, f, et).call(this, t, e), s.tiedToId = e;
  }
  /**
   * The note (if any) whose tie lands on `id`, i.e. `id`'s note is the
   * *receiving* end of a tie started elsewhere. Layout uses this to draw the
   * incoming half of a tie crossing into a measure from an earlier one,
   * without scanning every note in the score to find who ties into it.
   */
  tiedFromNote(t) {
    const e = v(this, $).get(t);
    return e ? this.findNote(e) : void 0;
  }
  /**
   * The one edit op Phase 0 implements: move a note by whole semitones.
   *
   * Returns the index of the measure that changed (within *its own staff*;
   * see `Measure.index`'s own comment), or `null` if nothing did (unknown id,
   * the note is a rest, or `semitones` is 0). That return value is the contract the
   * incremental redraw hangs off: the caller re-lays-out and repaints exactly
   * the measures an edit reports, and no others.
   *
   * Scope cut (M2 Slice 3): still returns a bare measure index, not a
   * `{staffIndex, measureIndex}` pair, even though `relayoutMeasure`/
   * `CanvasRenderer.redrawMeasure` now both need the pair to fully address a
   * measure. Every existing caller only ever edits staff 0, where the bare
   * index is already the whole answer; a caller editing a non-zero staff can
   * recover its `staffIndex` from `measureOfNote(id)?.staffIndex` (new this
   * slice) before calling `transposeNote`, so widening this return type is
   * not needed to make multi-staff edits addressable, only to make them
   * marginally more convenient. Left as its own follow-up rather than done
   * here, since it would touch every existing call site for no behaviour
   * change on the staff-0 case they all still are.
   */
  transposeNote(t, e) {
    const s = v(this, I).get(t), n = s == null ? void 0 : s.notes.find((r) => r.id === t);
    return !s || !n || n.pitch === null || e === 0 ? null : (n.pitch = Bt(n.pitch, e), s.index);
  }
  /**
   * Change the clef of measures `from..to` (inclusive, either order) of
   * `staffIndex` to `clef` (M5 Slice 5, the second real edit op after
   * `transposeNote`).
   *
   * The range is made uniform: `from` gets an explicit `clef`, and any
   * explicit clef already set inside `from + 1..to` is cleared, so the whole
   * range reads `clef` through `clefAt`'s walk-back. The clef that was in
   * force at `to + 1` *before* the edit is captured first and, if that
   * measure exists, pinned there explicitly, so the change is scoped to the
   * range rather than leaking forward through the walk-back into every later
   * measure. A range running to the staff's end has no `to + 1` and simply
   * keeps the new clef to the end.
   *
   * Returns the `{ from, to }` measure range (normalized) that was changed,
   * or `null` if nothing did: an unknown staff, an out-of-range index, or a
   * range already entirely in `clef`. The `null` is what lets
   * `EditHistory.record` skip recording a no-op, the same signal
   * `transposeNote` gives. Unlike `transposeNote`, a caller cannot repaint
   * just the returned measures: a clef change moves every notehead in the
   * range and changes widths (a courtesy clef glyph at the change), so the
   * caller should re-run a full `layoutScore`.
   *
   * Mid-measure clef changes (M6 Slice 4) inside the range are cleared too
   * (the range is made uniform), so a range holding one is never a no-op.
   * The restore at `to + 1` reads `clefAt`, which already accounts for a
   * change the range's last measure ended in, so the music after the range
   * keeps the clef it had.
   */
  setClefRange(t, e, s, n) {
    var h;
    const r = (h = this.staves[t]) == null ? void 0 : h.measures;
    if (!r) return null;
    const i = Math.min(e, s), a = Math.max(e, s);
    if (i < 0 || a >= r.length) return null;
    let u = !0;
    for (let m = i; m <= a; m++)
      if (this.clefAt(m, t) !== n || r[m].clefChanges.length > 0) {
        u = !1;
        break;
      }
    if (u) return null;
    const c = r[a + 1], l = c ? this.clefAt(a + 1, t) : void 0;
    r[i].clef = n;
    for (let m = i + 1; m <= a; m++) delete r[m].clef;
    for (let m = i; m <= a; m++) r[m].clefChanges = Z;
    return c && l !== void 0 && (c.clef = l), { from: i, to: a };
  }
  // --- Correction ops (M6 Slice 7) -----------------------------------------
  //
  // The ops needed to fix rough OMR output by hand: transpose,
  // delete-to-rest and duration edits, plus the commonest OMR misreads on
  // older engravings (rests misread from old-style glyphs have to be cheap
  // to turn back into notes, and wrong values cheap to fix).
  //
  // Shared contract, the same one `transposeNote`/`setClefRange` set:
  //
  //  - Each op validates its input and returns `null` when it refuses or
  //    when nothing would change. Refusal and no-op are deliberately the same
  //    signal: `EditHistory.record` keeps a snapshot only for a non-null
  //    result, so a refused edit leaves the undo stack and the dirty flag
  //    alone. The caller (the demo) records the pre-edit snapshot by running
  //    the op inside `history.record`, exactly as it does for a transpose.
  //  - Otherwise each returns the measures it touched (`MeasureRef`s,
  //    deduplicated, sorted), so the caller can `relayoutMeasure` and
  //    repaint just those, falling back to a full `layoutScore` when one of
  //    them declines (a width change, a moved dynamics baseline). A tie
  //    partner's or slur end's measure across a barline is included, since
  //    its curve is drawn in that measure's own ops too.
  //  - Nothing outside the edited voice of the edited measure moves in time:
  //    every op keeps the voice's total duration (padding with rests, or
  //    consuming them), so the next measure never shifts and positional
  //    anchors (dynamics, hairpins, `Measure.passthrough` at an onset) keep
  //    meaning the same moment.
  //  - A note keeps its id through every op that keeps the note (a
  //    selection survives), and the private indexes (`#measureOfNote`,
  //    `#tieSourceOfTarget`, `#crossStaffBeamOfNote`) are kept in step with
  //    every removal, so `findNote`, `tiedFromNote` and layout stay correct
  //    without a rebuild.
  /**
   * Turn a note into a rest of the same written duration (an editor's
   * "delete": nothing after it shifts). Returns `null` for an unknown id or a rest.
   *
   * On a chord head with other heads beside it this removes that head from
   * the chord instead (`removeChordMember`'s rules): deleting one misread
   * head of a divisi third should leave the other note, not silence the
   * whole chord.
   *
   * What goes with the pitch: any tie into or out of the note (the partner's
   * `tiedToId` too), its articulations (a staccato rest means nothing), and
   * its own passthrough payload (M6 Slice 3's promise: deleting a note drops
   * exactly its own payload, including any unmatched `<tie>`/`<tied>`/
   * `<slur>` ends), and its lyrics (M6 Slice 9: a rest is not sung; the
   * syllables go rather than jump to a neighbouring note, since which note
   * should take them is a judgement no op can make, and undo restores them).
   * On a chord head with siblings the lyrics move to the remaining anchor
   * instead (`removeChordMember`). A fermata stays: a fermata over a rest is
   * ordinary notation, and dropping it would lose a real hold. A slur that
   * starts or ends on the note moves to the nearest pitched event inside the
   * slur (same voice preferred), so a phrase mark survives deleting a stray
   * note at its end; a slur with nothing left inside to land on is dropped.
   * A cross-staff beam loses the note (a rest has no stem), and is dropped
   * when a side is left with fewer than two notes.
   *
   * A grace note (M6 Slice 8) is removed outright instead: a grace rest is
   * not a thing, and since a grace takes no time nothing shifts either way.
   * Its ties, slurs (re-anchored as above) and payload go with it. This is
   * the only op that changes a grace note's existence; no op inserts one.
   */
  noteToRest(t) {
    const e = g(this, f, M).call(this, t);
    if (!e || e.note.pitch === null) return null;
    const { measure: s, note: n } = e;
    if (n.grace !== null) return g(this, f, It).call(this, s, n);
    const r = g(this, f, z).call(this, s, n);
    if (r.length > 1) return g(this, f, ot).call(this, s, r, n);
    const i = new j();
    return i.addMeasure(s), g(this, f, D).call(this, n, i), n.pitch = null, n.articulations = it, n.lyrics = rt, n.passthrough = C, g(this, f, H).call(this, t, s, null, i), g(this, f, G).call(this, t, s, null, i), i.list();
  }
  /**
   * Turn a rest into a note at `pitch`, keeping its duration (the inverse of
   * `noteToRest`, and the fix for an OMR "rest" that was really a note).
   * Returns `null` for an unknown id or a pitched note.
   *
   * A whole-measure rest (`Note.isMeasureRest`) becomes a note lasting the
   * whole measure, which needs a single note value (plus dots) of exactly
   * the measure's length: 4/4 and 2/2 give a whole note, 3/4 and 6/8 a dotted
   * half, 7/8 a double-dotted half. A measure no single note value fills
   * (5/4, 5/8, ...) is refused (`null`): writing tied notes is the user's
   * call, not something to guess. The rest's fermata and articulations stay
   * on the note; its passthrough payload (typically a `<rest>`'s
   * display-step/octave, meaningless on a note) is dropped, as `noteToRest`
   * drops the note's. A hidden rest (`Note.hidden`) becomes a visible note.
   */
  restToNote(t, e) {
    const s = g(this, f, M).call(this, t);
    if (!s || s.note.pitch !== null) return null;
    const { measure: n, note: r } = s;
    if (r.measureRestWholes !== null) {
      const i = _t(r.measureRestWholes);
      if (!i) return null;
      g(this, f, nt).call(this, n, r, new R(r.id, {
        ...X(r),
        pitch: { ...e },
        value: i.value,
        dots: i.dots,
        measureRestWholes: null,
        passthrough: C,
        hidden: !1
      }));
    } else
      r.pitch = { ...e }, r.passthrough = C, r.hidden = !1;
    return [{ staffIndex: n.staffIndex, measureIndex: n.index }];
  }
  /**
   * Rewrite a pitched note at `pitch`, keeping its duration, marks and id
   * (an editor's note input over an existing note, and the direct fix for a
   * misread pitch, where `transposeNote` would need the interval worked out
   * first). Returns `null` for an unknown id, a rest (that is `restToNote`'s
   * job), an unchanged pitch, or a chord head moving onto a pitch another
   * head of its chord already has (`addChordMember`'s unison rule).
   *
   * A tie only joins two notes of the same pitch, so any tie into or out of
   * the note is cleared at both ends (as `noteToRest` does), with any stray
   * passthrough `<tie>`/`<tied>` markup on the note itself, so export cannot
   * write half a tie to a partner that no longer matches. Slurs, lyrics,
   * articulations and beams stay. Allowed on a grace note, like
   * `transposeNote`: a grace has a pitch like any other note.
   */
  setPitch(t, e) {
    const s = g(this, f, M).call(this, t);
    if (!s || s.note.pitch === null || k(s.note.pitch, e)) return null;
    const { measure: n, note: r } = s;
    if (r.grace === null && g(this, f, z).call(this, n, r).some((u) => u !== r && u.pitch !== null && k(u.pitch, e)))
      return null;
    const i = new j();
    return i.addMeasure(n), g(this, f, D).call(this, r, i), r.pitch = { ...e }, r.passthrough = J(r.passthrough), i.list();
  }
  /**
   * Change the written value (and dots) of a note's whole event: a single
   * note or rest, or every head of a chord (a chord has one duration).
   * Returns `null` when refused or when the value is unchanged.
   *
   * Measure capacity is never broken and the next measure never shifts:
   *
   *  - Shorter: the freed time is padded with rests right after the event
   *    (`restValuesFor`: undotted values, each aligned to its own length),
   *    so everything later in the voice keeps its onset.
   *  - Longer: the extra time is taken from the rests that directly follow
   *    in the same voice, consuming whole rests and re-spelling any
   *    leftover as rests (OMR often reads one note's worth of time as a
   *    note plus a spurious rest, so this is the friendly answer rather than
   *    a flat refusal). If every following event is a rest and they still do
   *    not cover it, an under-full voice's own slack before the barline may
   *    make up the difference. A pitched note in the way, or a total that
   *    would pass the time signature's capacity, refuses the edit: pushing
   *    the following notes later is a re-barring decision this op will not
   *    make silently. Consumed rests go with their fermatas and payloads.
   *  - Tuplets are refused for now (the event's anchor has a `tuplet`, or a
   *    rest it would consume does): changing one member's value breaks the
   *    run's ratio arithmetic, and an editor for tuplets is its own job.
   *    Since no tupleted note is ever changed, the passthrough `<tuplet>`
   *    brackets Slice 3 keeps for a run stay valid; any stray `<tuplet>` on
   *    a changed (non-tuplet) head is stripped so export cannot write a
   *    bracket for a run that no longer exists.
   *
   * A whole-measure rest is a valid target: it becomes an ordinary rest of
   * `value` plus padding (how a misread measure rest is cut down to a beat).
   * Ties into and out of the event stay (the pitch is unchanged, so they are
   * still valid). A head that becomes longer than an eighth leaves any
   * cross-staff beam (it has no beam to join). Chord members' own
   * `value`/`dots` follow the anchor, since they choose the head glyph.
   *
   * Refused on a grace note (M6 Slice 8): it takes no measure time, so
   * there is no capacity to keep and no event to resize; its written value
   * only picks a flag, and changing that is not a correction this op makes.
   * Consuming a rest that has grace notes before it leaves them in place,
   * where they attach to the voice's next event (`graceRuns`).
   */
  setDuration(t, e, s = 0) {
    const n = g(this, f, M).call(this, t);
    if (!n || n.note.grace !== null) return null;
    const { measure: r, note: i } = n, a = g(this, f, U).call(this, r, i.voice), u = a.findIndex((w) => w.includes(i)), c = a[u], l = c[0];
    if (l.tuplet !== null || !l.isMeasureRest && l.value === e && l.dots === s) return null;
    const h = 1e-9, m = l.durationWholes, y = bt(e, s);
    let p = 0;
    for (let w = 0; w < u; w++) p += a[w][0].durationWholes;
    const b = [];
    let S;
    if (y > m + h) {
      const w = y - m;
      let x = 0;
      for (let P = u + 1; P < a.length && x < w - h; P++) {
        const F = a[P][0];
        if (F.pitch !== null || F.tuplet !== null) return null;
        b.push(F), x += F.durationWholes;
      }
      if (x < w - h) {
        const P = a.reduce((yt, Ot) => yt + Ot[0].durationWholes, 0), F = xt(this.timeAt(r.index, r.staffIndex));
        if (P - x + w > F + h) return null;
      }
      S = Math.max(0, x - w);
    } else
      S = m - y;
    const T = Vt(p + y, S);
    if (T === null) return null;
    const O = new j();
    O.addMeasure(r);
    for (const w of b)
      r.notes.splice(r.notes.indexOf(w), 1), v(this, I).delete(w.id);
    let W;
    if (l.isMeasureRest)
      W = new R(l.id, { ...X(l), value: e, dots: s, measureRestWholes: null }), g(this, f, nt).call(this, r, l, W);
    else {
      for (const w of c)
        w.value = e, w.dots = s, w.passthrough = vt(w.passthrough, (x, P) => P && x.name === "tuplet");
      if (W = c.reduce((w, x) => r.notes.indexOf(x) > r.notes.indexOf(w) ? x : w), N[e] > N.eighth)
        for (const w of c) g(this, f, G).call(this, w.id, r, null, O);
    }
    let _ = r.notes.indexOf(W) + 1;
    for (const w of T) {
      const x = new R(`n${V(this, B)._++}`, { pitch: null, value: w, voice: l.voice });
      r.notes.splice(_++, 0, x), v(this, I).set(x.id, r);
    }
    return O.list();
  }
  /**
   * Add a head at `pitch` to the event `id` belongs to: a chord member
   * (`chordWithPrevious`) with the anchor's value, dots, tuplet and voice,
   * placed after the event's last head so `noteEvents` joins it there.
   * Returns `null` for an unknown id, a rest (a rest has no stem to share),
   * or a pitch the event already has (a unison head is not a correction
   * anyone needs, and layout draws one over the other). Use `findNote` on
   * the event afterwards to reach the new head; its id is fresh. Refused on
   * a grace note (M6 Slice 8): grace chords are not modelled.
   */
  addChordMember(t, e) {
    const s = g(this, f, M).call(this, t);
    if (!s || s.note.pitch === null || s.note.grace !== null) return null;
    const { measure: n, note: r } = s, i = g(this, f, z).call(this, n, r);
    if (i.some((l) => l.pitch !== null && k(l.pitch, e))) return null;
    const a = i[0], u = i.reduce((l, h) => n.notes.indexOf(h) > n.notes.indexOf(l) ? h : l), c = new R(`n${V(this, B)._++}`, {
      pitch: { ...e },
      value: a.value,
      dots: a.dots,
      tuplet: a.tuplet ?? void 0,
      voice: a.voice,
      chordWithPrevious: !0
    });
    return n.notes.splice(n.notes.indexOf(u) + 1, 0, c), v(this, I).set(c.id, n), [{ staffIndex: n.staffIndex, measureIndex: n.index }];
  }
  /**
   * Remove one head from a chord. Returns `null` for an unknown id, a rest,
   * or a note that is its event's only head (that is `noteToRest`'s job:
   * removing the last head would leave no event at all and shift the
   * voice).
   *
   * Removing the anchor (the first head, the one without
   * `chordWithPrevious`) promotes the next head to anchor, in the removed
   * anchor's place in `measure.notes`. Without that, the remaining heads
   * would be left as members joined to nothing (an earlier prototype hit
   * exactly that). The promoted
   * head keeps its id, pitch, ties and payload, and takes the chord's
   * value/dots/tuplet and any passthrough `<tuplet>` bracket the old anchor
   * carried (export writes a run's brackets on its anchors). The removed
   * head's articulations and fermata move to the remaining anchor (they
   * belong to the chord, whichever head they were written on), and so do its
   * lyrics (M6 Slice 9; a verse the anchor already sings keeps the anchor's
   * syllable, see `mergeLyrics`), its ties are
   * cleared at both ends, its own payload is dropped, and a slur or
   * cross-staff beam anchored on it moves to the remaining anchor.
   */
  removeChordMember(t) {
    const e = g(this, f, M).call(this, t);
    if (!e || e.note.pitch === null || e.note.grace !== null) return null;
    const s = g(this, f, z).call(this, e.measure, e.note);
    return s.length < 2 ? null : g(this, f, ot).call(this, e.measure, s, e.note);
  }
  /**
   * Tie `sourceId` to `targetId`, or untie it (`targetId: null`), as an
   * undoable correction (so a tie lost at a page join can be re-added).
   * Stricter than the low-level `setTie`, which import and `buildScore` use
   * to wire ties they already resolved: the target must be a head of the
   * *next event in the source's voice* (later in the same measure, or the
   * voice's first event in the next measure of the staff) with the same
   * pitch, and no other note may already tie into it. `tieTargetFor` finds
   * that head. Returns `null` when refused or when nothing changes.
   *
   * Passthrough tie markup is kept consistent with the model: the model's
   * tie is what export writes, so a stray unmatched `<tie>`/`<tied>` start
   * on the source and stop on the target (OMR's half of a tie whose partner
   * was on the other page) are stripped when linking, or export would write
   * each end twice. Untying strips the source's stray start too, so "untie"
   * also removes a dangling OMR tie start the model never linked (and is
   * not a no-op when that is all there is).
   *
   * Refused on a grace note (M6 Slice 8): a grace is not an event, so it has
   * no "next event" to tie into, and no event's next is a grace either.
   */
  editTie(t, e) {
    var h;
    const s = g(this, f, M).call(this, t);
    if (!s || s.note.pitch === null || s.note.grace !== null) return null;
    const { measure: n, note: r } = s, i = new j();
    i.addMeasure(n);
    const a = J(r.passthrough, "start");
    if (e === null) {
      if (r.tiedToId === null && a === r.passthrough) return null;
      if (r.tiedToId !== null) {
        const m = v(this, I).get(r.tiedToId);
        m && i.addMeasure(m), this.setTie(t, null);
      }
      return r.passthrough = a, i.list();
    }
    const u = (h = g(this, f, st).call(this, n, r)) == null ? void 0 : h.find((m) => m.id === e);
    if (!u || u.pitch === null || r.pitch === null || !k(u.pitch, r.pitch)) return null;
    const c = this.tiedFromNote(e);
    if (c && c !== r) return null;
    const l = J(u.passthrough, "stop");
    if (r.tiedToId === e && a === r.passthrough && l === u.passthrough)
      return null;
    if (r.tiedToId !== null && r.tiedToId !== e) {
      const m = v(this, I).get(r.tiedToId);
      m && i.addMeasure(m);
    }
    return this.setTie(t, e), r.passthrough = a, u.passthrough = l, i.addMeasure(v(this, I).get(e)), i.list();
  }
  /**
   * The head `editTie(sourceId, ...)` would accept as a target: the head of
   * the same pitch in the next event of the source's voice (see `editTie`),
   * or `null` if there is none (a rest, a different pitch, no next event).
   */
  tieTargetFor(t) {
    var r;
    const e = g(this, f, M).call(this, t), s = e == null ? void 0 : e.note.pitch;
    if (!e || !s || e.note.grace !== null) return null;
    const n = g(this, f, st).call(this, e.measure, e.note);
    return ((r = n == null ? void 0 : n.find((i) => i.pitch !== null && k(i.pitch, s))) == null ? void 0 : r.id) ?? null;
  }
  /**
   * A deep, **id-preserving** copy of this score.
   *
   * "Id-preserving": every cloned `Note` keeps its exact `id`, and the private
   * `#nextNoteId` counter is carried over verbatim, so the clone keeps minting
   * fresh, non-colliding ids from where the source left off. This is what lets
   * `EditHistory` compare a before/after snapshot note-for-note (via
   * `assertScoresEquivalent`, which still ignores id *values*) and lets a
   * restored snapshot be addressed by the same ids a caller already holds.
   *
   * "Deep": no mutable node is shared with the source. Every `Staff`,
   * `Measure`, `Note`, `Pitch`, `TupletRatio`, `Part`, `Slur` and
   * `CrossStaffBeam` is a fresh object, and every array is fresh, so mutating
   * anything in the clone (a note's pitch, a measure's barline, a staff's
   * clef, a part's staff list, a `tiedToId`) cannot reach back into the
   * source, or vice versa. Passthrough payloads (M6 Slice 3) are the one
   * thing shared, and only because they are immutable: an edit replaces a
   * payload list, it never mutates one.
   *
   * The three private indexes (`#measureOfNote`, `#tieSourceOfTarget`,
   * `#crossStaffBeamOfNote`) are rebuilt against the freshly created objects
   * rather than copied, since they hold references into the node graph. Ties
   * are reproduced by assigning `Note.tiedToId` directly and rebuilding
   * `#tieSourceOfTarget` from those values: routing through `setTie` would
   * re-run `#linkTie`'s pitch-equality validation, which can spuriously reject
   * a tie chain while it is only half-rebuilt.
   */
  clone() {
    const t = new lt({
      keyFifths: this.keyFifths,
      time: { beats: this.time.beats, beatType: this.time.beatType },
      tempoBpm: this.tempoBpm,
      clef: this.staves[0].clef
    });
    t.staves.length = 0, t.parts.length = 0;
    for (const e of this.staves) {
      const s = new K(e.index, e.clef);
      for (const n of e.measures) {
        const r = new pt(n.index, n.staffIndex);
        n.keyFifths !== void 0 && (r.keyFifths = n.keyFifths), n.clef !== void 0 && (r.clef = n.clef), n.clefChanges.length > 0 && (r.clefChanges = [...n.clefChanges]), n.dynamics.length > 0 && (r.dynamics = [...n.dynamics]), n.time !== void 0 && (r.time = { beats: n.time.beats, beatType: n.time.beatType }), n.endBarline !== void 0 && (r.endBarline = n.endBarline), n.startBarline !== void 0 && (r.startBarline = n.startBarline), n.repeatTimes !== void 0 && (r.repeatTimes = n.repeatTimes), n.number !== void 0 && (r.number = n.number), n.endingStart !== void 0 && (r.endingStart = n.endingStart), n.endingEnd !== void 0 && (r.endingEnd = n.endingEnd), r.passthrough = n.passthrough, r.attributesPassthrough = n.attributesPassthrough, r.barlinePassthrough = n.barlinePassthrough;
        for (const i of n.notes) {
          const a = new R(i.id, {
            pitch: i.pitch === null ? null : { ...i.pitch },
            value: i.value,
            voice: i.voice,
            dots: i.dots,
            tuplet: i.tuplet === null ? void 0 : { ...i.tuplet },
            measureRestWholes: i.measureRestWholes,
            chordWithPrevious: i.chordWithPrevious,
            articulations: i.articulations,
            fermata: i.fermata,
            arpeggiate: i.arpeggiate,
            beam: i.beam,
            grace: i.grace,
            lyrics: i.lyrics,
            passthrough: i.passthrough,
            hidden: i.hidden
          });
          a.tiedToId = i.tiedToId, r.notes.push(a), v(t, I).set(a.id, r), a.tiedToId !== null && v(t, $).set(a.tiedToId, a.id);
        }
        s.measures.push(r);
      }
      t.staves.push(s);
    }
    for (const e of this.parts) {
      const s = {
        staffIndices: [...e.staffIndices]
      };
      e.name !== void 0 && (s.name = e.name), e.nameHidden && (s.nameHidden = !0), e.groupSymbol !== void 0 && (s.groupSymbol = e.groupSymbol), e.passthrough !== void 0 && (s.passthrough = e.passthrough), t.parts.push(s);
    }
    t.headerPassthrough = this.headerPassthrough;
    for (const e of this.slurs)
      t.slurs.push({ startNoteId: e.startNoteId, endNoteId: e.endNoteId });
    t.wedges.push(...this.wedges);
    for (const e of this.crossStaffBeams) {
      const s = {
        noteIds: [...e.noteIds],
        staffIndices: [e.staffIndices[0], e.staffIndices[1]]
      };
      t.crossStaffBeams.push(s);
      for (const n of s.noteIds) v(t, E).set(n, s);
    }
    return Y(t, B, v(this, B)), t;
  }
};
I = new WeakMap(), $ = new WeakMap(), E = new WeakMap(), B = new WeakMap(), f = new WeakSet(), /**
 * Validate a tie and record it in the reverse index. Shared by
 * `appendNote` (a spec that already names its target's id) and `setTie`
 * (an existing note gaining or changing a tie later); both end up with the
 * same invariant enforced regardless of which path set `tiedToId`.
 */
et = function(t, e) {
  const s = this.findNote(t), n = this.findNote(e);
  if (!n) throw new Error(`tie target "${e}" is not a note in this score`);
  if (s.pitch === null || n.pitch === null || !k(s.pitch, n.pitch))
    throw new Error(
      `a tie must connect two notes of the same pitch (source "${t}", target "${e}")`
    );
  v(this, $).set(e, t);
}, M = function(t) {
  const e = v(this, I).get(t), s = e == null ? void 0 : e.notes.find((n) => n.id === t);
  return e && s ? { measure: e, note: s } : void 0;
}, /** One voice's events in `measure`, in time order. */
U = function(t, e) {
  return mt(t.notes).filter((s) => s[0].voice === e);
}, /** The event (`noteEvents`) holding `note`. */
z = function(t, e) {
  return mt(t.notes).find((s) => s.includes(e));
}, /** The event after `note`'s in its voice: later in `measure`, else the
 *  voice's first event in the staff's next measure. */
st = function(t, e) {
  const s = g(this, f, U).call(this, t, e.voice), n = s.findIndex((i) => i.includes(e));
  if (n + 1 < s.length) return s[n + 1];
  const r = this.staves[t.staffIndex].measures[t.index + 1];
  return r ? g(this, f, U).call(this, r, e.voice)[0] : void 0;
}, /** Swap `replacement` (same id) in for `note` at its place in
 *  `measure.notes`, for the fields `Note` keeps readonly
 *  (`chordWithPrevious`, `measureRestWholes`). The id indexes need no
 *  update, since they key by id; the tie is carried over directly. */
nt = function(t, e, s) {
  s.tiedToId = e.tiedToId, t.notes[t.notes.indexOf(e)] = s;
}, /** Clear every tie into and out of `note`, at both ends. */
D = function(t, e) {
  if (t.tiedToId !== null) {
    const n = v(this, I).get(t.tiedToId);
    n && e.addMeasure(n), v(this, $).delete(t.tiedToId), t.tiedToId = null;
  }
  const s = this.tiedFromNote(t.id);
  s && (e.addMeasure(v(this, I).get(s.id)), v(this, $).delete(t.id), s.tiedToId = null);
}, /** `noteToRest` on a grace note (M6 Slice 8): take it out of the score. */
It = function(t, e) {
  const s = new j();
  return s.addMeasure(t), g(this, f, D).call(this, e, s), g(this, f, H).call(this, e.id, t, null, s), g(this, f, G).call(this, e.id, t, null, s), t.notes.splice(t.notes.indexOf(e), 1), v(this, I).delete(e.id), s.list();
}, /** `noteToRest`/`removeChordMember` on a head of a chord with others. */
ot = function(t, e, s) {
  const n = new j();
  n.addMeasure(t), g(this, f, D).call(this, s, n);
  let r;
  if (s === e[0]) {
    const i = e[1], a = s.passthrough.flatMap(
      (c) => c.name === "notations" ? c.children.filter((l) => l.name === "tuplet") : []
    ), u = a.length === 0 ? i.passthrough : Object.freeze([
      ...i.passthrough,
      Object.freeze({ name: "notations", attrs: Object.freeze({}), children: Object.freeze(a), text: "" })
    ]);
    r = new R(i.id, {
      ...X(i),
      value: s.value,
      dots: s.dots,
      tuplet: s.tuplet ?? void 0,
      chordWithPrevious: !1,
      articulations: [...i.articulations, ...s.articulations],
      fermata: i.fermata ?? s.fermata,
      arpeggiate: i.arpeggiate || s.arpeggiate,
      beam: qt([s, i]),
      lyrics: dt(i.lyrics, s.lyrics),
      passthrough: u
    }), r.tiedToId = i.tiedToId, t.notes.splice(t.notes.indexOf(i), 1), t.notes[t.notes.indexOf(s)] = r;
  } else
    r = e[0], r.articulations = at([...r.articulations, ...s.articulations]), r.fermata === null && (r.fermata = s.fermata), s.arpeggiate && (r.arpeggiate = !0), r.lyrics = dt(r.lyrics, s.lyrics), t.notes.splice(t.notes.indexOf(s), 1);
  return v(this, I).delete(s.id), g(this, f, H).call(this, s.id, t, r.id, n), g(this, f, G).call(this, s.id, t, r.id, n), n.list();
}, /**
 * Move every slur end on `removedId` (in `removedMeasure`) to
 * `replacementId`, or, when that is `null`, to the nearest pitched event
 * inside the slur (its first for a start, its last for an end; same voice
 * as the removed note preferred). A slur left with no distinct, correctly
 * ordered pair of ends is dropped. Every measure the slur spanned is
 * touched, since its curve is redrawn in each.
 */
H = function(t, e, s, n) {
  var i;
  const r = e.staffIndex;
  for (let a = this.slurs.length - 1; a >= 0; a--) {
    const u = this.slurs[a], c = u.startNoteId === t;
    if (!c && u.endNoteId !== t) continue;
    const l = c ? u.endNoteId : u.startNoteId, h = v(this, I).get(l), m = Math.min(e.index, (h == null ? void 0 : h.index) ?? e.index), y = Math.max(e.index, (h == null ? void 0 : h.index) ?? e.index);
    for (let O = m; O <= y; O++) n.add(r, O);
    const p = this.notesInOrder(r), b = (O) => p.findIndex((W) => W.id === O);
    let S = s;
    if (S === null) {
      const O = p.find((x) => x.id === t), W = p.slice(b(u.startNoteId) + 1, b(u.endNoteId)).filter((x) => x.pitch !== null && !x.chordWithPrevious), _ = W.filter((x) => x.voice === (O == null ? void 0 : O.voice)), w = _.length > 0 ? _ : W;
      S = ((i = c ? w[0] : w[w.length - 1]) == null ? void 0 : i.id) ?? null;
    }
    const T = S === null ? null : c ? { startNoteId: S, endNoteId: u.endNoteId } : { startNoteId: u.startNoteId, endNoteId: S };
    T === null || b(T.startNoteId) < 0 || b(T.startNoteId) >= b(T.endNoteId) ? this.slurs.splice(a, 1) : this.slurs[a] = T;
  }
}, /**
 * Take `id` out of its cross-staff beam (if any), putting `replacementId`
 * in its place when given and not already a member. A beam left with
 * fewer than two notes on a staff (`addCrossStaffBeam`'s own rule) is
 * dropped. Every measure the beam spans is touched.
 */
G = function(t, e, s, n) {
  var c;
  const r = v(this, E).get(t);
  if (!r) return;
  v(this, E).delete(t);
  for (const l of r.staffIndices) n.add(l, e.index);
  const i = s !== null && !r.noteIds.includes(s) ? r.noteIds.map((l) => l === t ? s : l) : r.noteIds.filter((l) => l !== t), a = /* @__PURE__ */ new Map();
  for (const l of i) {
    const h = (c = v(this, I).get(l)) == null ? void 0 : c.staffIndex;
    h !== void 0 && a.set(h, (a.get(h) ?? 0) + 1);
  }
  const u = this.crossStaffBeams.indexOf(r);
  if (r.staffIndices.every((l) => (a.get(l) ?? 0) >= 2)) {
    const l = { noteIds: i, staffIndices: r.staffIndices };
    this.crossStaffBeams[u] = l;
    for (const h of i) v(this, E).set(h, l);
  } else {
    this.crossStaffBeams.splice(u, 1);
    for (const l of i) v(this, E).delete(l);
  }
};
let tt = lt;
function X(o) {
  return {
    pitch: o.pitch === null ? null : { ...o.pitch },
    value: o.value,
    voice: o.voice,
    dots: o.dots,
    tuplet: o.tuplet ?? void 0,
    measureRestWholes: o.measureRestWholes,
    chordWithPrevious: o.chordWithPrevious,
    articulations: o.articulations,
    fermata: o.fermata,
    arpeggiate: o.arpeggiate,
    beam: o.beam,
    grace: o.grace,
    lyrics: o.lyrics,
    passthrough: o.passthrough,
    hidden: o.hidden
  };
}
var L;
class j {
  constructor() {
    A(this, L, /* @__PURE__ */ new Map());
  }
  add(t, e) {
    v(this, L).set(`${t}:${e}`, { staffIndex: t, measureIndex: e });
  }
  addMeasure(t) {
    this.add(t.staffIndex, t.index);
  }
  list() {
    return [...v(this, L).values()].sort((t, e) => t.staffIndex - e.staffIndex || t.measureIndex - e.measureIndex);
  }
}
L = new WeakMap();
function Q(o) {
  return !Array.isArray(o);
}
function de(o, t = {}, e = [], s = []) {
  var a, u;
  const n = new tt(t), r = [], i = [];
  for (const c of o) {
    const l = n.appendMeasure();
    Q(c) && (l.keyFifths = c.keyFifths, l.time = c.time, l.clef = c.clef, c.clefChanges && (l.clefChanges = [...c.clefChanges].sort((m, y) => m.onset - y.onset)), l.endBarline = c.endBarline, l.startBarline = c.startBarline);
    const h = Q(c) ? c.notes : c;
    for (const [m, y, p] of h)
      (m === null ? [null] : typeof m == "string" ? [m] : m).forEach((S, T) => {
        const O = n.appendNote(l, {
          pitch: S === null ? null : Pt(S),
          value: y,
          dots: p == null ? void 0 : p.dots,
          tuplet: p == null ? void 0 : p.tuplet,
          voice: p == null ? void 0 : p.voice,
          chordWithPrevious: T > 0,
          // Marks are the chord's, so only the anchor carries them:
          // the shape an exporter (and MuseScore) writes.
          articulations: T === 0 ? p == null ? void 0 : p.articulations : void 0,
          fermata: T === 0 ? p == null ? void 0 : p.fermata : void 0,
          arpeggiate: T === 0 ? p == null ? void 0 : p.arpeggiate : void 0,
          beam: T === 0 ? p == null ? void 0 : p.beam : void 0,
          grace: p == null ? void 0 : p.grace,
          lyrics: T === 0 ? p == null ? void 0 : p.lyrics : void 0
        });
        i.push(O), p != null && p.tiedToNext && r.push(O);
      });
  }
  for (const c of r) {
    const l = i.indexOf(c) + 1, h = i.slice(l).filter((b) => b.voice === c.voice), m = h.findIndex((b) => !b.chordWithPrevious && b.grace === null);
    if (m === -1)
      throw new Error(
        `tiedToNext on a note with no following note in voice ${c.voice} to tie to`
      );
    const y = [h[m]];
    for (let b = m + 1; b < h.length && h[b].chordWithPrevious; b++) y.push(h[b]);
    const p = y.find(
      (b) => c.pitch !== null && b.pitch !== null && k(b.pitch, c.pitch)
    ) ?? y[0];
    n.setTie(c.id, p.id);
  }
  for (const c of e) {
    const [l, h] = c.start, [m, y] = c.end, p = (a = n.measures[l]) == null ? void 0 : a.notes[h], b = (u = n.measures[m]) == null ? void 0 : u.notes[y];
    if (!p)
      throw new Error(`slur start [${l}, ${h}] is not a note in this score`);
    if (!b)
      throw new Error(`slur end [${m}, ${y}] is not a note in this score`);
    n.addSlur(p.id, b.id);
  }
  o.forEach((c, l) => {
    if (!(!Q(c) || !c.dynamics))
      for (const h of c.dynamics) n.addDynamic(0, l, h);
  });
  for (const c of s)
    n.addWedge({
      kind: c.kind,
      placement: c.placement,
      start: { measureIndex: c.start[0], onset: c.start[1] },
      stop: { measureIndex: c.stop[0], onset: c.stop[1] }
    });
  return n;
}
export {
  ie as A,
  At as B,
  rt as C,
  Zt as D,
  wt as E,
  Ut as F,
  _t as G,
  Vt as H,
  it as I,
  Z as J,
  gt as K,
  R as L,
  pt as M,
  N,
  K as O,
  Ct as P,
  dt as Q,
  at as R,
  tt as S,
  re as T,
  Dt as U,
  k as V,
  Rt as W,
  Bt as X,
  he as Y,
  vt as Z,
  J as _,
  Ht as a,
  de as b,
  ue as c,
  Kt as d,
  qt as e,
  Xt as f,
  le as g,
  fe as h,
  ae as i,
  ce as j,
  Qt as k,
  se as l,
  xt as m,
  mt as n,
  Gt as o,
  Pt as p,
  ne as q,
  ht as r,
  ee as s,
  Yt as t,
  te as u,
  oe as v,
  bt as w,
  Wt as x,
  jt as y,
  C as z
};
