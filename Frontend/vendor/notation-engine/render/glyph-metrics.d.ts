/** A point in staff spaces, y up, relative to the glyph origin. */
export type GlyphPoint = readonly [x: number, y: number];
export interface GlyphMetrics {
    /** The SMuFL canonical glyph name, e.g. `noteheadBlack`. */
    readonly name: string;
    /** Unicode code point in the SMuFL private-use range. */
    readonly codepoint: number;
    /** SMuFL's human-readable description, kept so the table reads as documentation. */
    readonly description: string;
    /** Horizontal advance width, staff spaces. */
    readonly advance: number;
    /** Bounding-box south-west corner, staff spaces relative to the origin. */
    readonly bBoxSW: GlyphPoint;
    /** Bounding-box north-east corner, staff spaces relative to the origin. */
    readonly bBoxNE: GlyphPoint;
    /** Stem attachment points, where the font publishes them. */
    readonly anchors: Readonly<Record<string, GlyphPoint | undefined>>;
}
/** The glyphs Phase 0 draws, keyed by SMuFL canonical name. */
export declare const GLYPH_METRICS: {
    readonly noteheadWhole: {
        readonly name: "noteheadWhole";
        readonly codepoint: 57506;
        readonly description: "Whole (semibreve) notehead";
        readonly advance: 1.688;
        readonly bBoxSW: readonly [0, -0.5];
        readonly bBoxNE: readonly [1.688, 0.5];
        readonly anchors: {};
    };
    readonly noteheadHalf: {
        readonly name: "noteheadHalf";
        readonly codepoint: 57507;
        readonly description: "Half (minim) notehead";
        readonly advance: 1.18;
        readonly bBoxSW: readonly [0, -0.5];
        readonly bBoxNE: readonly [1.18, 0.5];
        readonly anchors: {
            readonly stemUpSE: readonly [1.18, 0.168];
            readonly stemDownNW: readonly [0, -0.168];
        };
    };
    readonly noteheadBlack: {
        readonly name: "noteheadBlack";
        readonly codepoint: 57508;
        readonly description: "Black notehead";
        readonly advance: 1.18;
        readonly bBoxSW: readonly [0, -0.5];
        readonly bBoxNE: readonly [1.18, 0.5];
        readonly anchors: {
            readonly stemUpSE: readonly [1.18, 0.168];
            readonly stemDownNW: readonly [0, -0.168];
        };
    };
    readonly flag8thUp: {
        readonly name: "flag8thUp";
        readonly codepoint: 57920;
        readonly description: "Combining flag 1 (8th) above";
        readonly advance: 1.056;
        readonly bBoxSW: readonly [0, -3.24];
        readonly bBoxNE: readonly [1.056, 0.036];
        readonly anchors: {
            readonly stemUpNW: readonly [0, -0.04];
        };
    };
    readonly flag8thDown: {
        readonly name: "flag8thDown";
        readonly codepoint: 57921;
        readonly description: "Combining flag 1 (8th) below";
        readonly advance: 1.224;
        readonly bBoxSW: readonly [0, -0.056];
        readonly bBoxNE: readonly [1.224, 3.232];
        readonly anchors: {
            readonly stemDownSW: readonly [0, 0.132];
        };
    };
    readonly flag16thUp: {
        readonly name: "flag16thUp";
        readonly codepoint: 57922;
        readonly description: "Combining flag 2 (16th) above";
        readonly advance: 1.116;
        readonly bBoxSW: readonly [0, -3.252];
        readonly bBoxNE: readonly [1.116, 0.008];
        readonly anchors: {
            readonly stemUpNW: readonly [0, -0.088];
        };
    };
    readonly flag16thDown: {
        readonly name: "flag16thDown";
        readonly codepoint: 57923;
        readonly description: "Combining flag 2 (16th) below";
        readonly advance: 1.168;
        readonly bBoxSW: readonly [0, -0.036];
        readonly bBoxNE: readonly [1.164, 3.248];
        readonly anchors: {
            readonly stemDownSW: readonly [0, 0.128];
        };
    };
    readonly flag32ndUp: {
        readonly name: "flag32ndUp";
        readonly codepoint: 57924;
        readonly description: "Combining flag 3 (32nd) above";
        readonly advance: 1.048;
        readonly bBoxSW: readonly [0, -3.248];
        readonly bBoxNE: readonly [1.044, 0.596];
        readonly anchors: {
            readonly stemUpNW: readonly [0, 0.376];
        };
    };
    readonly flag32ndDown: {
        readonly name: "flag32ndDown";
        readonly codepoint: 57925;
        readonly description: "Combining flag 3 (32nd) below";
        readonly advance: 1.096;
        readonly bBoxSW: readonly [0, -0.688];
        readonly bBoxNE: readonly [1.092, 3.248];
        readonly anchors: {
            readonly stemDownSW: readonly [0, -0.448];
        };
    };
    readonly flag64thUp: {
        readonly name: "flag64thUp";
        readonly codepoint: 57926;
        readonly description: "Combining flag 4 (64th) above";
        readonly advance: 1.048;
        readonly bBoxSW: readonly [0, -3.248];
        readonly bBoxNE: readonly [1.044, 1.388];
        readonly anchors: {
            readonly stemUpNW: readonly [0, 1.172];
        };
    };
    readonly flag64thDown: {
        readonly name: "flag64thDown";
        readonly codepoint: 57927;
        readonly description: "Combining flag 4 (64th) below";
        readonly advance: 1.1;
        readonly bBoxSW: readonly [0, -1.504];
        readonly bBoxNE: readonly [1.092, 3.248];
        readonly anchors: {
            readonly stemDownSW: readonly [0, -1.244];
        };
    };
    readonly gClef: {
        readonly name: "gClef";
        readonly codepoint: 57424;
        readonly description: "G clef";
        readonly advance: 2.684;
        readonly bBoxSW: readonly [0, -2.632];
        readonly bBoxNE: readonly [2.684, 4.392];
        readonly anchors: {};
    };
    readonly fClef: {
        readonly name: "fClef";
        readonly codepoint: 57442;
        readonly description: "F clef";
        readonly advance: 2.736;
        readonly bBoxSW: readonly [-0.02, -2.54];
        readonly bBoxNE: readonly [2.736, 1.048];
        readonly anchors: {};
    };
    readonly gClef8vb: {
        readonly name: "gClef8vb";
        readonly codepoint: 57426;
        readonly description: "G clef ottava bassa";
        readonly advance: 2.656;
        readonly bBoxSW: readonly [0, -3.512];
        readonly bBoxNE: readonly [2.684, 4.392];
        readonly anchors: {};
    };
    readonly cClef: {
        readonly name: "cClef";
        readonly codepoint: 57436;
        readonly description: "C clef";
        readonly advance: 2.796;
        readonly bBoxSW: readonly [0, -2.024];
        readonly bBoxNE: readonly [2.796, 2.024];
        readonly anchors: {};
    };
    readonly restWhole: {
        readonly name: "restWhole";
        readonly codepoint: 58595;
        readonly description: "Whole (semibreve) rest";
        readonly advance: 1.132;
        readonly bBoxSW: readonly [0, -0.54];
        readonly bBoxNE: readonly [1.128, 0.036];
        readonly anchors: {};
    };
    readonly restHalf: {
        readonly name: "restHalf";
        readonly codepoint: 58596;
        readonly description: "Half (minim) rest";
        readonly advance: 1.132;
        readonly bBoxSW: readonly [0, -0.008];
        readonly bBoxNE: readonly [1.128, 0.568];
        readonly anchors: {};
    };
    readonly restQuarter: {
        readonly name: "restQuarter";
        readonly codepoint: 58597;
        readonly description: "Quarter (crotchet) rest";
        readonly advance: 1.08;
        readonly bBoxSW: readonly [0.004, -1.5];
        readonly bBoxNE: readonly [1.08, 1.492];
        readonly anchors: {};
    };
    readonly rest8th: {
        readonly name: "rest8th";
        readonly codepoint: 58598;
        readonly description: "Eighth (quaver) rest";
        readonly advance: 1;
        readonly bBoxSW: readonly [0, -1.004];
        readonly bBoxNE: readonly [0.988, 0.696];
        readonly anchors: {};
    };
    readonly rest16th: {
        readonly name: "rest16th";
        readonly codepoint: 58599;
        readonly description: "16th (semiquaver) rest";
        readonly advance: 1.28;
        readonly bBoxSW: readonly [0, -2];
        readonly bBoxNE: readonly [1.28, 0.716];
        readonly anchors: {};
    };
    readonly rest32nd: {
        readonly name: "rest32nd";
        readonly codepoint: 58600;
        readonly description: "32nd (demisemiquaver) rest";
        readonly advance: 1.452;
        readonly bBoxSW: readonly [0, -2];
        readonly bBoxNE: readonly [1.452, 1.704];
        readonly anchors: {};
    };
    readonly rest64th: {
        readonly name: "rest64th";
        readonly codepoint: 58601;
        readonly description: "64th (hemidemisemiquaver) rest";
        readonly advance: 1.696;
        readonly bBoxSW: readonly [0, -3.012];
        readonly bBoxNE: readonly [1.692, 1.72];
        readonly anchors: {};
    };
    readonly accidentalSharp: {
        readonly name: "accidentalSharp";
        readonly codepoint: 57954;
        readonly description: "Sharp";
        readonly advance: 0.996;
        readonly bBoxSW: readonly [0, -1.392];
        readonly bBoxNE: readonly [0.996, 1.4];
        readonly anchors: {};
    };
    readonly accidentalFlat: {
        readonly name: "accidentalFlat";
        readonly codepoint: 57952;
        readonly description: "Flat";
        readonly advance: 0.904;
        readonly bBoxSW: readonly [0, -0.7];
        readonly bBoxNE: readonly [0.904, 1.756];
        readonly anchors: {};
    };
    readonly accidentalNatural: {
        readonly name: "accidentalNatural";
        readonly codepoint: 57953;
        readonly description: "Natural";
        readonly advance: 0.672;
        readonly bBoxSW: readonly [0, -1.34];
        readonly bBoxNE: readonly [0.672, 1.364];
        readonly anchors: {};
    };
    readonly augmentationDot: {
        readonly name: "augmentationDot";
        readonly codepoint: 57831;
        readonly description: "Augmentation dot";
        readonly advance: 0.4;
        readonly bBoxSW: readonly [0, -0.2];
        readonly bBoxNE: readonly [0.4, 0.2];
        readonly anchors: {};
    };
    readonly repeatDot: {
        readonly name: "repeatDot";
        readonly codepoint: 57412;
        readonly description: "Single repeat dot";
        readonly advance: 0.4;
        readonly bBoxSW: readonly [0, -0.2];
        readonly bBoxNE: readonly [0.4, 0.2];
        readonly anchors: {};
    };
    readonly timeSig0: {
        readonly name: "timeSig0";
        readonly codepoint: 57472;
        readonly description: "Time signature 0";
        readonly advance: 1.88;
        readonly bBoxSW: readonly [0.08, -1];
        readonly bBoxNE: readonly [1.8, 1.004];
        readonly anchors: {};
    };
    readonly timeSig1: {
        readonly name: "timeSig1";
        readonly codepoint: 57473;
        readonly description: "Time signature 1";
        readonly advance: 1.336;
        readonly bBoxSW: readonly [0.08, -1];
        readonly bBoxNE: readonly [1.256, 1.004];
        readonly anchors: {};
    };
    readonly timeSig2: {
        readonly name: "timeSig2";
        readonly codepoint: 57474;
        readonly description: "Time signature 2";
        readonly advance: 1.784;
        readonly bBoxSW: readonly [0.08, -1.028];
        readonly bBoxNE: readonly [1.704, 1.016];
        readonly anchors: {};
    };
    readonly timeSig3: {
        readonly name: "timeSig3";
        readonly codepoint: 57475;
        readonly description: "Time signature 3";
        readonly advance: 1.684;
        readonly bBoxSW: readonly [0.08, -1.004];
        readonly bBoxNE: readonly [1.604, 0.996];
        readonly anchors: {};
    };
    readonly timeSig4: {
        readonly name: "timeSig4";
        readonly codepoint: 57476;
        readonly description: "Time signature 4";
        readonly advance: 1.88;
        readonly bBoxSW: readonly [0.08, -1];
        readonly bBoxNE: readonly [1.8, 1.004];
        readonly anchors: {};
    };
    readonly timeSig5: {
        readonly name: "timeSig5";
        readonly codepoint: 57477;
        readonly description: "Time signature 5";
        readonly advance: 1.612;
        readonly bBoxSW: readonly [0.08, -1.004];
        readonly bBoxNE: readonly [1.532, 0.984];
        readonly anchors: {};
    };
    readonly timeSig6: {
        readonly name: "timeSig6";
        readonly codepoint: 57478;
        readonly description: "Time signature 6";
        readonly advance: 1.736;
        readonly bBoxSW: readonly [0.08, -0.996];
        readonly bBoxNE: readonly [1.656, 1.004];
        readonly anchors: {};
    };
    readonly timeSig7: {
        readonly name: "timeSig7";
        readonly codepoint: 57479;
        readonly description: "Time signature 7";
        readonly advance: 1.764;
        readonly bBoxSW: readonly [0.08, -1];
        readonly bBoxNE: readonly [1.684, 0.996];
        readonly anchors: {};
    };
    readonly timeSig8: {
        readonly name: "timeSig8";
        readonly codepoint: 57480;
        readonly description: "Time signature 8";
        readonly advance: 1.744;
        readonly bBoxSW: readonly [0.08, -1.036];
        readonly bBoxNE: readonly [1.664, 1.036];
        readonly anchors: {};
    };
    readonly timeSig9: {
        readonly name: "timeSig9";
        readonly codepoint: 57481;
        readonly description: "Time signature 9";
        readonly advance: 1.736;
        readonly bBoxSW: readonly [0.08, -0.996];
        readonly bBoxNE: readonly [1.656, 1.004];
        readonly anchors: {};
    };
    readonly brace: {
        readonly name: "brace";
        readonly codepoint: 57344;
        readonly description: "Brace";
        readonly advance: 0.28;
        readonly bBoxSW: readonly [0, -0.0025];
        readonly bBoxNE: readonly [0.2774, 4.0024];
        readonly anchors: {};
    };
    readonly bracketTop: {
        readonly name: "bracketTop";
        readonly codepoint: 57347;
        readonly description: "Bracket top";
        readonly advance: 1.876;
        readonly bBoxSW: readonly [0, 0];
        readonly bBoxNE: readonly [1.876, 1.18];
        readonly anchors: {};
    };
    readonly bracketBottom: {
        readonly name: "bracketBottom";
        readonly codepoint: 57348;
        readonly description: "Bracket bottom";
        readonly advance: 1.876;
        readonly bBoxSW: readonly [0, -1.18];
        readonly bBoxNE: readonly [1.876, 0];
        readonly anchors: {};
    };
    readonly articStaccatoAbove: {
        readonly name: "articStaccatoAbove";
        readonly codepoint: 58530;
        readonly description: "Staccato above";
        readonly advance: 0.336;
        readonly bBoxSW: readonly [0, 0];
        readonly bBoxNE: readonly [0.336, 0.336];
        readonly anchors: {};
    };
    readonly articStaccatoBelow: {
        readonly name: "articStaccatoBelow";
        readonly codepoint: 58531;
        readonly description: "Staccato below";
        readonly advance: 0.336;
        readonly bBoxSW: readonly [0, -0.336];
        readonly bBoxNE: readonly [0.336, 0];
        readonly anchors: {};
    };
    readonly articStaccatissimoAbove: {
        readonly name: "articStaccatissimoAbove";
        readonly codepoint: 58534;
        readonly description: "Staccatissimo above";
        readonly advance: 0.408;
        readonly bBoxSW: readonly [0.004, -0.008];
        readonly bBoxNE: readonly [0.4, 1.172];
        readonly anchors: {};
    };
    readonly articStaccatissimoBelow: {
        readonly name: "articStaccatissimoBelow";
        readonly codepoint: 58535;
        readonly description: "Staccatissimo below";
        readonly advance: 0.408;
        readonly bBoxSW: readonly [0.004, -1.18];
        readonly bBoxNE: readonly [0.4, 0];
        readonly anchors: {};
    };
    readonly articTenutoAbove: {
        readonly name: "articTenutoAbove";
        readonly codepoint: 58532;
        readonly description: "Tenuto above";
        readonly advance: 1.352;
        readonly bBoxSW: readonly [-0.004, 0];
        readonly bBoxNE: readonly [1.352, 0.192];
        readonly anchors: {};
    };
    readonly articTenutoBelow: {
        readonly name: "articTenutoBelow";
        readonly codepoint: 58533;
        readonly description: "Tenuto below";
        readonly advance: 1.352;
        readonly bBoxSW: readonly [-0.004, -0.192];
        readonly bBoxNE: readonly [1.352, 0];
        readonly anchors: {};
    };
    readonly articTenutoStaccatoAbove: {
        readonly name: "articTenutoStaccatoAbove";
        readonly codepoint: 58546;
        readonly description: "Louré (tenuto-staccato) above";
        readonly advance: 1.356;
        readonly bBoxSW: readonly [-0.004, 0];
        readonly bBoxNE: readonly [1.352, 0.96];
        readonly anchors: {};
    };
    readonly articTenutoStaccatoBelow: {
        readonly name: "articTenutoStaccatoBelow";
        readonly codepoint: 58547;
        readonly description: "Louré (tenuto-staccato) below";
        readonly advance: 1.352;
        readonly bBoxSW: readonly [-0.004, -0.968];
        readonly bBoxNE: readonly [1.352, 0];
        readonly anchors: {};
    };
    readonly articAccentAbove: {
        readonly name: "articAccentAbove";
        readonly codepoint: 58528;
        readonly description: "Accent above";
        readonly advance: 1.356;
        readonly bBoxSW: readonly [0, 0.004];
        readonly bBoxNE: readonly [1.356, 0.98];
        readonly anchors: {};
    };
    readonly articAccentBelow: {
        readonly name: "articAccentBelow";
        readonly codepoint: 58529;
        readonly description: "Accent below";
        readonly advance: 1.356;
        readonly bBoxSW: readonly [0, -0.976];
        readonly bBoxNE: readonly [1.356, 0];
        readonly anchors: {};
    };
    readonly articMarcatoAbove: {
        readonly name: "articMarcatoAbove";
        readonly codepoint: 58540;
        readonly description: "Marcato above";
        readonly advance: 0.944;
        readonly bBoxSW: readonly [-0.004, -0.004];
        readonly bBoxNE: readonly [0.94, 1.012];
        readonly anchors: {};
    };
    readonly articMarcatoBelow: {
        readonly name: "articMarcatoBelow";
        readonly codepoint: 58541;
        readonly description: "Marcato below";
        readonly advance: 0.944;
        readonly bBoxSW: readonly [-0.004, -1.016];
        readonly bBoxNE: readonly [0.94, 0];
        readonly anchors: {};
    };
    readonly fermataAbove: {
        readonly name: "fermataAbove";
        readonly codepoint: 58560;
        readonly description: "Fermata above";
        readonly advance: 2.42;
        readonly bBoxSW: readonly [0.012, -0.012];
        readonly bBoxNE: readonly [2.42, 1.316];
        readonly anchors: {};
    };
    readonly fermataBelow: {
        readonly name: "fermataBelow";
        readonly codepoint: 58561;
        readonly description: "Fermata below";
        readonly advance: 2.42;
        readonly bBoxSW: readonly [0.012, -1.328];
        readonly bBoxNE: readonly [2.42, 0];
        readonly anchors: {};
    };
    readonly dynamicPiano: {
        readonly name: "dynamicPiano";
        readonly codepoint: 58656;
        readonly description: "Piano";
        readonly advance: 1.46;
        readonly bBoxSW: readonly [-0.356, -0.568];
        readonly bBoxNE: readonly [1.464, 1.096];
        readonly anchors: {};
    };
    readonly dynamicPP: {
        readonly name: "dynamicPP";
        readonly codepoint: 58667;
        readonly description: "pp";
        readonly advance: 2.908;
        readonly bBoxSW: readonly [-0.328, -0.568];
        readonly bBoxNE: readonly [2.912, 1.096];
        readonly anchors: {};
    };
    readonly dynamicPPP: {
        readonly name: "dynamicPPP";
        readonly codepoint: 58666;
        readonly description: "ppp";
        readonly advance: 4.288;
        readonly bBoxSW: readonly [-0.368, -0.568];
        readonly bBoxNE: readonly [4.292, 1.096];
        readonly anchors: {};
    };
    readonly dynamicPPPP: {
        readonly name: "dynamicPPPP";
        readonly codepoint: 58665;
        readonly description: "pppp";
        readonly advance: 5.668;
        readonly bBoxSW: readonly [-0.408, -0.568];
        readonly bBoxNE: readonly [5.672, 1.096];
        readonly anchors: {};
    };
    readonly dynamicPPPPP: {
        readonly name: "dynamicPPPPP";
        readonly codepoint: 58664;
        readonly description: "ppppp";
        readonly advance: 7.104;
        readonly bBoxSW: readonly [-0.408, -0.568];
        readonly bBoxNE: readonly [7.092, 1.096];
        readonly anchors: {};
    };
    readonly dynamicPPPPPP: {
        readonly name: "dynamicPPPPPP";
        readonly codepoint: 58663;
        readonly description: "pppppp";
        readonly advance: 8.496;
        readonly bBoxSW: readonly [-0.408, -0.568];
        readonly bBoxNE: readonly [8.512, 1.096];
        readonly anchors: {};
    };
    readonly dynamicForte: {
        readonly name: "dynamicForte";
        readonly codepoint: 58658;
        readonly description: "Forte";
        readonly advance: 1.456;
        readonly bBoxSW: readonly [-0.564, -0.608];
        readonly bBoxNE: readonly [1.456, 1.776];
        readonly anchors: {};
    };
    readonly dynamicFF: {
        readonly name: "dynamicFF";
        readonly codepoint: 58671;
        readonly description: "ff";
        readonly advance: 2.436;
        readonly bBoxSW: readonly [-0.54, -0.608];
        readonly bBoxNE: readonly [2.44, 1.776];
        readonly anchors: {};
    };
    readonly dynamicFFF: {
        readonly name: "dynamicFFF";
        readonly codepoint: 58672;
        readonly description: "fff";
        readonly advance: 3.324;
        readonly bBoxSW: readonly [-0.62, -0.608];
        readonly bBoxNE: readonly [3.32, 1.776];
        readonly anchors: {};
    };
    readonly dynamicFFFF: {
        readonly name: "dynamicFFFF";
        readonly codepoint: 58673;
        readonly description: "ffff";
        readonly advance: 4.28;
        readonly bBoxSW: readonly [-0.62, -0.608];
        readonly bBoxNE: readonly [4.28, 1.776];
        readonly anchors: {};
    };
    readonly dynamicFFFFF: {
        readonly name: "dynamicFFFFF";
        readonly codepoint: 58674;
        readonly description: "fffff";
        readonly advance: 5.24;
        readonly bBoxSW: readonly [-0.62, -0.608];
        readonly bBoxNE: readonly [5.24, 1.776];
        readonly anchors: {};
    };
    readonly dynamicFFFFFF: {
        readonly name: "dynamicFFFFFF";
        readonly codepoint: 58675;
        readonly description: "ffffff";
        readonly advance: 6.2;
        readonly bBoxSW: readonly [-0.62, -0.608];
        readonly bBoxNE: readonly [6.2, 1.776];
        readonly anchors: {};
    };
    readonly dynamicMP: {
        readonly name: "dynamicMP";
        readonly codepoint: 58668;
        readonly description: "mp";
        readonly advance: 3.304;
        readonly bBoxSW: readonly [-0.08, -0.568];
        readonly bBoxNE: readonly [3.3, 1.096];
        readonly anchors: {};
    };
    readonly dynamicMF: {
        readonly name: "dynamicMF";
        readonly codepoint: 58669;
        readonly description: "mf";
        readonly advance: 3.188;
        readonly bBoxSW: readonly [-0.08, -0.66];
        readonly bBoxNE: readonly [3.272, 1.724];
        readonly anchors: {};
    };
    readonly dynamicPF: {
        readonly name: "dynamicPF";
        readonly codepoint: 58670;
        readonly description: "pf";
        readonly advance: 3.08;
        readonly bBoxSW: readonly [-0.288, -0.608];
        readonly bBoxNE: readonly [3.08, 1.776];
        readonly anchors: {};
    };
    readonly dynamicFortePiano: {
        readonly name: "dynamicFortePiano";
        readonly codepoint: 58676;
        readonly description: "Forte-piano";
        readonly advance: 2.476;
        readonly bBoxSW: readonly [-0.564, -0.608];
        readonly bBoxNE: readonly [2.476, 1.776];
        readonly anchors: {};
    };
    readonly dynamicForzando: {
        readonly name: "dynamicForzando";
        readonly codepoint: 58677;
        readonly description: "Forzando";
        readonly advance: 1.988;
        readonly bBoxSW: readonly [-0.564, -0.608];
        readonly bBoxNE: readonly [1.988, 1.776];
        readonly anchors: {};
    };
    readonly dynamicSforzando1: {
        readonly name: "dynamicSforzando1";
        readonly codepoint: 58678;
        readonly description: "Sforzando 1";
        readonly advance: 2.416;
        readonly bBoxSW: readonly [0, -0.608];
        readonly bBoxNE: readonly [2.416, 1.776];
        readonly anchors: {};
    };
    readonly dynamicSforzandoPiano: {
        readonly name: "dynamicSforzandoPiano";
        readonly codepoint: 58679;
        readonly description: "Sforzando-piano";
        readonly advance: 3.384;
        readonly bBoxSW: readonly [0, -0.608];
        readonly bBoxNE: readonly [3.38, 1.776];
        readonly anchors: {};
    };
    readonly dynamicSforzandoPianissimo: {
        readonly name: "dynamicSforzandoPianissimo";
        readonly codepoint: 58680;
        readonly description: "Sforzando-pianissimo";
        readonly advance: 4.792;
        readonly bBoxSW: readonly [0, -0.608];
        readonly bBoxNE: readonly [4.796, 1.776];
        readonly anchors: {};
    };
    readonly dynamicSforzato: {
        readonly name: "dynamicSforzato";
        readonly codepoint: 58681;
        readonly description: "Sforzato";
        readonly advance: 2.928;
        readonly bBoxSW: readonly [0, -0.608];
        readonly bBoxNE: readonly [2.932, 1.776];
        readonly anchors: {};
    };
    readonly dynamicSforzatoPiano: {
        readonly name: "dynamicSforzatoPiano";
        readonly codepoint: 58682;
        readonly description: "Sforzato-piano";
        readonly advance: 4.3;
        readonly bBoxSW: readonly [0, -0.608];
        readonly bBoxNE: readonly [4.304, 1.776];
        readonly anchors: {};
    };
    readonly dynamicSforzatoFF: {
        readonly name: "dynamicSforzatoFF";
        readonly codepoint: 58683;
        readonly description: "Sforzatissimo";
        readonly advance: 3.856;
        readonly bBoxSW: readonly [0, -0.608];
        readonly bBoxNE: readonly [3.856, 1.776];
        readonly anchors: {};
    };
    readonly dynamicRinforzando1: {
        readonly name: "dynamicRinforzando1";
        readonly codepoint: 58684;
        readonly description: "Rinforzando 1";
        readonly advance: 2.5;
        readonly bBoxSW: readonly [-0.08, -0.608];
        readonly bBoxNE: readonly [2.5, 1.776];
        readonly anchors: {};
    };
    readonly dynamicRinforzando2: {
        readonly name: "dynamicRinforzando2";
        readonly codepoint: 58685;
        readonly description: "Rinforzando 2";
        readonly advance: 2.976;
        readonly bBoxSW: readonly [-0.08, -0.608];
        readonly bBoxNE: readonly [2.976, 1.776];
        readonly anchors: {};
    };
    readonly dynamicNiente: {
        readonly name: "dynamicNiente";
        readonly codepoint: 58662;
        readonly description: "Niente";
        readonly advance: 1.232;
        readonly bBoxSW: readonly [-0.092, -0.04];
        readonly bBoxNE: readonly [1.232, 1.096];
        readonly anchors: {};
    };
    readonly noteheadDoubleWhole: {
        readonly name: "noteheadDoubleWhole";
        readonly codepoint: 57504;
        readonly description: "Double whole (breve) notehead";
        readonly advance: 2.396;
        readonly bBoxSW: readonly [0, -0.62];
        readonly bBoxNE: readonly [2.396, 0.62];
        readonly anchors: {
            readonly stemUpSE: readonly [2.036, 0.004];
            readonly stemDownNW: readonly [0.36, 0.004];
        };
    };
    readonly restDoubleWhole: {
        readonly name: "restDoubleWhole";
        readonly codepoint: 58594;
        readonly description: "Double whole (breve) rest";
        readonly advance: 0.504;
        readonly bBoxSW: readonly [0, 0];
        readonly bBoxNE: readonly [0.5, 1];
        readonly anchors: {};
    };
    readonly metNoteDoubleWhole: {
        readonly name: "metNoteDoubleWhole";
        readonly codepoint: 60576;
        readonly description: "Double whole note (breve)";
        readonly advance: 2.62;
        readonly bBoxSW: readonly [0, -0.672];
        readonly bBoxNE: readonly [2.62, 0.68];
        readonly anchors: {};
    };
    readonly metNoteWhole: {
        readonly name: "metNoteWhole";
        readonly codepoint: 60578;
        readonly description: "Whole note (semibreve)";
        readonly advance: 1.836;
        readonly bBoxSW: readonly [0, -0.5];
        readonly bBoxNE: readonly [1.836, 0.592];
        readonly anchors: {};
    };
    readonly metNoteHalfUp: {
        readonly name: "metNoteHalfUp";
        readonly codepoint: 60579;
        readonly description: "Half note (minim) stem up";
        readonly advance: 1.364;
        readonly bBoxSW: readonly [0, -0.564];
        readonly bBoxNE: readonly [1.364, 2.752];
        readonly anchors: {};
    };
    readonly metNoteQuarterUp: {
        readonly name: "metNoteQuarterUp";
        readonly codepoint: 60581;
        readonly description: "Quarter note (crotchet) stem up";
        readonly advance: 1.328;
        readonly bBoxSW: readonly [0, -0.564];
        readonly bBoxNE: readonly [1.328, 2.752];
        readonly anchors: {};
    };
    readonly metNote8thUp: {
        readonly name: "metNote8thUp";
        readonly codepoint: 60583;
        readonly description: "Eighth note (quaver) stem up";
        readonly advance: 2.136;
        readonly bBoxSW: readonly [0, -0.564];
        readonly bBoxNE: readonly [2.132, 2.784];
        readonly anchors: {};
    };
    readonly metNote16thUp: {
        readonly name: "metNote16thUp";
        readonly codepoint: 60585;
        readonly description: "16th note (semiquaver) stem up";
        readonly advance: 2.088;
        readonly bBoxSW: readonly [0, -0.564];
        readonly bBoxNE: readonly [2.084, 2.8];
        readonly anchors: {};
    };
    readonly metAugmentationDot: {
        readonly name: "metAugmentationDot";
        readonly codepoint: 60599;
        readonly description: "Augmentation dot";
        readonly advance: 0.4;
        readonly bBoxSW: readonly [0, -0.2];
        readonly bBoxNE: readonly [0.4, 0.2];
        readonly anchors: {};
    };
};
/** Name of any glyph this engine knows how to draw. */
export type GlyphName = keyof typeof GLYPH_METRICS;
/**
 * Look a glyph up as a plain `GlyphMetrics`.
 *
 * `GLYPH_METRICS` is `as const`, so indexing it directly gives a union of
 * per-glyph literal types and an anchor that only some glyphs have is not
 * addressable on that union. This widens once, at the boundary, instead of
 * scattering casts through the layout code.
 */
export declare function glyphMetrics(name: GlyphName): GlyphMetrics;
/**
 * Line thicknesses and extensions recommended by the font, staff spaces. We
 * draw staff lines, stems, ledger lines and barlines ourselves as plain
 * rectangles, so using Bravura's own numbers is what keeps them looking like
 * they belong to the same typeface as the glyphs.
 */
export declare const ENGRAVING_DEFAULTS: {
    readonly staffLineThickness: 0.13;
    readonly stemThickness: 0.12;
    readonly legerLineThickness: 0.16;
    readonly legerLineExtension: 0.4;
    readonly thinBarlineThickness: 0.16;
    readonly thickBarlineThickness: 0.5;
    readonly barlineSeparation: 0.4;
    readonly beamThickness: 0.5;
    readonly beamSpacing: 0.25;
    readonly tieMidpointThickness: 0.22;
    readonly slurMidpointThickness: 0.22;
    readonly bracketThickness: 0.5;
    readonly hairpinThickness: 0.16;
};
/**
 * Staff spaces per em. SMuFL fixes this at 4: a font size of `4 * staffSpacePx`
 * makes every metric above scale by `staffSpacePx`. Named rather than inlined
 * because it appears in both layout and the renderer.
 */
export declare const STAFF_SPACES_PER_EM = 4;
/** The font family name the vendored Bravura file registers itself under. */
export declare const BRAVURA_FAMILY = "Bravura";
