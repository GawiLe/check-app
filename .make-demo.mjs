// scripts/make-demo.ts
import { cp, mkdir, writeFile } from "node:fs/promises";
import { join as join2 } from "node:path";

// src/main/fonts.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as opentypeNs from "opentype.js";
import subsetFont from "subset-font";
import fontverter from "fontverter";

// src/shared/types.ts
var PROJECT_FILE = "project.bsproj";
var PROJECT_VERSION = 2;

// src/shared/specs.ts
var BASE_SIZE = { name: "Half Page", width: 300, height: 600 };
var IAB_INITIAL = 150 * 1024;
var TARGETS = {
  cm360: {
    id: "cm360",
    label: "Campaign Manager 360",
    maxZipBytes: 10 * 1024 * 1024,
    initialLoadBytes: IAB_INITIAL,
    maxFiles: 100,
    allowedExtensions: ["html", "css", "js", "json", "gif", "png", "jpg", "jpeg", "svg", "webp", "woff", "woff2"],
    inlineFonts: false,
    maxAnimationSeconds: 30,
    maxLoops: 3,
    backupImage: true,
    notes: "clickTag-variabele wordt bij upload herkend; backup-afbeelding apart uploaden."
  },
  "google-ads": {
    id: "google-ads",
    label: "Google Ads (GDN)",
    maxZipBytes: 150 * 1024,
    initialLoadBytes: IAB_INITIAL,
    maxFiles: 40,
    allowedExtensions: ["html", "css", "js", "gif", "png", "jpg", "jpeg", "svg"],
    inlineFonts: true,
    maxAnimationSeconds: 30,
    maxLoops: 3,
    backupImage: false,
    notes: "Max. 150KB ZIP, max. 40 bestanden, geen losse fontbestanden."
  },
  gam: {
    id: "gam",
    label: "Google Ad Manager",
    maxZipBytes: 1024 * 1024,
    initialLoadBytes: IAB_INITIAL,
    maxFiles: 100,
    allowedExtensions: ["html", "css", "js", "json", "gif", "png", "jpg", "jpeg", "svg", "webp", "woff", "woff2"],
    inlineFonts: false,
    maxAnimationSeconds: 30,
    maxLoops: 3,
    backupImage: true,
    notes: "HTML5-creative; clickTag wordt bij upload als variabele herkend."
  },
  generic: {
    id: "generic",
    label: "Generiek IAB",
    maxZipBytes: 200 * 1024,
    initialLoadBytes: IAB_INITIAL,
    maxFiles: 100,
    allowedExtensions: ["html", "css", "js", "json", "gif", "png", "jpg", "jpeg", "svg", "webp", "woff", "woff2"],
    inlineFonts: false,
    maxAnimationSeconds: 15,
    maxLoops: 3,
    backupImage: true,
    notes: "IAB New Ad Portfolio: 150KB initial load, 15s animatie."
  }
};
var TARGET_IDS = Object.keys(TARGETS);

// src/shared/factory.ts
function newId(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 9);
}
function createLayer(type, comp2) {
  const id = newId("l");
  const base = {
    id,
    linkId: id,
    name: { text: "Tekst", image: "Afbeelding", shape: "Vorm", writeon: "Write-on", group: "Groep" }[type],
    type,
    visible: true,
    locked: false,
    x: 20,
    y: 20,
    width: comp2.width - 40,
    height: 60,
    rotation: 0,
    scale: 1,
    opacity: 1,
    reveal: 1,
    revealMode: "none",
    cta: false,
    tracks: {}
  };
  switch (type) {
    case "text":
      base.text = {
        content: "Jouw headline hier",
        fontId: null,
        size: 28,
        color: "#111111",
        weight: 700,
        align: "left",
        lineHeight: 1.1,
        letterSpacing: 0
      };
      break;
    case "image":
      base.image = { src: "", fit: "contain" };
      base.height = 160;
      break;
    case "shape":
      base.shape = { fill: "#e30613", radius: 0, strokeColor: "#000000", strokeWidth: 0 };
      base.height = 100;
      break;
    case "writeon":
      base.writeon = {
        content: "Write-on",
        fontId: null,
        size: 48,
        color: "#111111",
        strokeWidth: 1.5,
        glyphs: [],
        viewBox: [0, 0, 100, 40],
        fillAfter: 0.4
      };
      base.height = 80;
      break;
  }
  return base;
}
function createComposition(width, height, name) {
  return {
    id: newId("c"),
    name: name ?? `${width}x${height}`,
    width,
    height,
    duration: 8,
    loops: 1,
    background: "#ffffff",
    border: { color: "#cccccc", width: 1 },
    layers: []
  };
}
var motion = (start, duration, spec) => ({
  start,
  duration,
  ease: "easeOut",
  fade: true,
  dx: 0,
  dy: 0,
  scale: 1,
  rotation: 0,
  reveal: false,
  ...spec
});
function createStarterProject(name = "Nieuwe campagne") {
  const comp2 = createComposition(BASE_SIZE.width, BASE_SIZE.height, "Basis 300x600");
  const W = comp2.width;
  const bg = createLayer("shape", comp2);
  Object.assign(bg, { name: "Achtergrond", x: 0, y: 0, width: W, height: comp2.height, locked: true });
  bg.shape.fill = "#f4f1ea";
  const headline = createLayer("text", comp2);
  Object.assign(headline, { name: "Headline", x: 24, y: 40, width: W - 48, height: 70 });
  headline.text.content = "Jouw headline\nop twee regels";
  headline.text.size = 28;
  headline.intro = motion(0.2, 0.6, { dy: 30 });
  const sub = createLayer("text", comp2);
  Object.assign(sub, { name: "Subline", x: 24, y: 120, width: W - 48, height: 50 });
  sub.text.content = "Korte ondersteunende tekst.";
  sub.text.size = 18;
  sub.text.weight = 400;
  sub.intro = motion(0.6, 0.5, { dy: 15 });
  const pack = createLayer("shape", comp2);
  Object.assign(pack, { name: "Packshot (vervang door afbeelding)", x: 50, y: 250, width: W - 100, height: 200 });
  pack.shape.fill = "#dcd6c8";
  pack.shape.radius = 8;
  pack.intro = motion(1, 0.7, { scale: 0.8, ease: "backOut" });
  const ctaBg = createLayer("shape", comp2);
  Object.assign(ctaBg, { name: "CTA", x: 60, y: 500, width: W - 120, height: 50, cta: true });
  ctaBg.shape.fill = "#e30613";
  ctaBg.shape.radius = 25;
  ctaBg.intro = motion(1.7, 0.5, { scale: 0, ease: "backOut" });
  const ctaText = createLayer("text", comp2);
  Object.assign(ctaText, { name: "CTA tekst", x: 60, y: 513, width: W - 120, height: 26 });
  Object.assign(ctaText.text, { content: "Bekijk nu", size: 18, color: "#ffffff", align: "center" });
  ctaText.intro = motion(1.9, 0.4, {});
  comp2.layers = [ctaText, ctaBg, pack, sub, headline, bg];
  return {
    version: PROJECT_VERSION,
    name,
    clickTag: "https://www.example.com",
    targets: ["cm360"],
    syncFormats: true,
    politeLoad: true,
    fonts: [],
    baseCompositionId: comp2.id,
    compositions: [comp2]
  };
}

// src/main/fonts.ts
var opentype = opentypeNs.default ?? opentypeNs;
async function toSfnt(buf) {
  return fontverter.convert(buf, "sfnt");
}
function parse(buf) {
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}
async function describeFont(dir2, file) {
  const font2 = parse(await toSfnt(await readFile(join(dir2, file))));
  const all = font2.names;
  const tables = [all.windows, all.macintosh, all.unicode, all].filter(Boolean);
  const pick = (key) => tables.map((t) => t[key]?.en ?? Object.values(t[key] ?? {})[0]).find(Boolean);
  const family = pick("typographicFamily") ?? pick("preferredFamily") ?? pick("fontFamily") ?? file.split("/").pop().replace(/\.\w+$/, "");
  const os2 = font2.tables.os2;
  const italic = ((os2?.fsSelection ?? 0) & 1) === 1;
  return { id: newId("f"), family, file, weight: os2?.usWeightClass ?? 400, style: italic ? "italic" : "normal" };
}
async function textToGlyphPaths(dir2, file, text, size) {
  const font2 = parse(await toSfnt(await readFile(join(dir2, file))));
  const lineHeight = size * 1.15;
  const glyphs = [];
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  text.split("\n").forEach((line, i) => {
    const baseline = size + i * lineHeight;
    const scale = size / font2.unitsPerEm;
    let x = 0;
    let prev = null;
    for (const ch of line) {
      const glyph = font2.charToGlyph(ch);
      if (prev) x += font2.getKerningValue(prev, glyph) * scale;
      const ox = x;
      x += (glyph.advanceWidth ?? 0) * scale;
      prev = glyph;
      const d = glyphPathData(glyph, ox, baseline, scale);
      if (!d) continue;
      const bb = glyph.getBoundingBox();
      x1 = Math.min(x1, ox + bb.x1 * scale);
      x2 = Math.max(x2, ox + bb.x2 * scale);
      y1 = Math.min(y1, baseline - bb.y2 * scale);
      y2 = Math.max(y2, baseline - bb.y1 * scale);
      glyphs.push({ d });
    }
  });
  if (!glyphs.length) return { glyphs, viewBox: [0, 0, 10, 10], width: 10, height: 10 };
  const pad = 2;
  const vb = [
    Math.floor(x1 - pad),
    Math.floor(y1 - pad),
    Math.ceil(x2 - x1 + pad * 2),
    Math.ceil(y2 - y1 + pad * 2)
  ];
  return { glyphs, viewBox: vb, width: vb[2], height: vb[3] };
}
function glyphPathData(glyph, ox, baseline, scale) {
  const f = (v) => String(Math.round(v * 10) / 10);
  const X = (v) => f(ox + v * scale);
  const Y = (v) => f(baseline - v * scale);
  let d = "";
  for (const c of glyph.path.commands) {
    if (c.type === "M" || c.type === "L") d += `${c.type}${X(c.x)} ${Y(c.y)}`;
    else if (c.type === "Q") d += `Q${X(c.x1)} ${Y(c.y1)} ${X(c.x)} ${Y(c.y)}`;
    else if (c.type === "C") d += `C${X(c.x1)} ${Y(c.y1)} ${X(c.x2)} ${Y(c.y2)} ${X(c.x)} ${Y(c.y)}`;
    else if (c.type === "Z") d += "Z";
  }
  return d;
}

// scripts/make-demo.ts
var [dir, fontFile] = process.argv.slice(2);
for (const d of ["assets", "fonts", "export"]) await mkdir(join2(dir, d), { recursive: true });
await cp(fontFile, join2(dir, "fonts/brand-bold.ttf"));
await writeFile(
  join2(dir, "assets/logo.svg"),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><rect width="120" height="40" rx="6" fill="#111"/><text x="60" y="26" font-family="Arial" font-size="16" fill="#fff" text-anchor="middle">LOGO</text></svg>'
);
var p = createStarterProject("Demo campagne");
var font = await describeFont(dir, "fonts/brand-bold.ttf");
p.fonts.push(font);
var comp = p.compositions[0];
for (const l of comp.layers) if (l.text) l.text.fontId = font.id;
var logo = createLayer("image", comp);
Object.assign(logo, { name: "logo.svg", x: 90, y: 560, width: 120, height: 30 });
logo.image.src = "assets/logo.svg";
var w = createLayer("writeon", comp);
var g = await textToGlyphPaths(dir, font.file, "Nu!", 40);
Object.assign(w, { name: "Write-on", x: 276 - g.width, y: 180, width: g.width, height: g.height });
Object.assign(w.writeon, { content: "Nu!", fontId: font.id, glyphs: g.glyphs, viewBox: g.viewBox, color: "#e30613" });
w.intro = { start: 1.2, duration: 1.4, ease: "easeInOut", fade: false, dx: 0, dy: 0, scale: 1, rotation: 0, reveal: true };
comp.layers.unshift(w, logo);
await writeFile(join2(dir, PROJECT_FILE), JSON.stringify(p, null, 2));
console.log("demo-project:", dir);
