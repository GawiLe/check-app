# Banner Studio

Desktop-app (Electron) voor het maken van **lichte, gevalideerde HTML5 display banners** (IAB), met een werkwijze zoals in After Effects: lagen, keyframes, easing en een tijdlijn. Je werkt vanuit boilerplates en de export is direct klaar voor **Campaign Manager 360**, **Google Ads**, **Google Ad Manager** of generiek IAB.

## Waarom

Google Web Designer-exports laden standaard een eigen runtime, webcomponents, polyfills en vaak de Studio Enabler mee. Banner Studio exporteert alleen wat nodig is:

- één `index.html` met inline CSS en een eigen animatie-runtime van ±1,5 KB;
- de gebruikte afbeeldingen;
- fonts **gesubset** naar alleen de gebruikte tekens, als WOFF2 (meestal 3–6 KB in plaats van 50–700 KB).

De demo-banner (300×600, eigen font, logo, write-on, 6 geanimeerde lagen) is als ZIP **8 KB**.

## Starten

```bash
npm install
npm run dev        # app starten met hot reload
npm test           # unit tests (builder, runtime, validatie, formaten)
npm run typecheck
npm run dist       # installer bouwen (dmg / nsis) via electron-builder
```

## Werken met projecten (bronmappen)

Een project is een gewone map:

```
mijn-campagne/
  project.bsproj   ← het project (JSON: formaten, lagen, keyframes)
  assets/          ← afbeeldingen (png, jpg, svg, gif, webp)
  fonts/           ← woff, woff2, ttf, otf
  export/          ← output per platform + rapport.json
```

- Zet bestanden direct in `assets/` of `fonts/`. De app houdt de map in de gaten en ververst de preview als je een bestand vervangt (bijvoorbeeld een nieuwe packshot vanuit Photoshop).
- Je kunt de map gewoon in Git, Dropbox of op de server zetten.

## Workflow

1. **Nieuw project** vanuit een boilerplate. De ingebouwde starter is **300×600**: achtergrond, headline, subline, packshot-plek en CTA, al geanimeerd.
2. **Lagen**: tekst, vorm, afbeelding (klik een asset aan) en write-on.
3. **Animeren zoals in AE**:
   - Klik de stopwatch ⏱ bij een eigenschap. Elke wijziging zet dan een keyframe op de huidige tijd.
   - Sleep keyframes in de tijdlijn.
   - Kies een easing per keyframe.
   - Getallen wijzig je door te slepen (Shift = 10×).
4. **Effecten**: presets (fade, inschuiven, pop, pulse, wipe, write-on) op de huidige tijd.
5. **AI-animatie**: beschrijf wat je wilt ("laat de headline inschrijven en de CTA na 3s pulseren"). Claude levert keyframes binnen het animatiemodel van de app, dus nooit losse code in je banner. Je kunt het altijd ongedaan maken.
6. **Formaten**: "+ Formaat" leidt een IAB- of eigen formaat af van de basis 300×600. Posities gaan relatief mee en maten schalen; daarna stel je het formaat zelf bij.
7. **Opslaan als boilerplate**: het hele project (formaten, animaties, assets, fonts) wordt een startpunt voor volgende campagnes.
8. **Exporteren**: kies formaten en platform(s). Elke banner wordt gebouwd, gezipt, voorzien van een backup-JPG en gevalideerd.

### Write-on

Een write-on laag zet tekst uit je eigen font om naar SVG-paden per letter. De eigenschap **Reveal** (0→1) tekent eerst de omtrek van elke letter en vult hem daarna, letter voor letter. Met "Vulling" bepaal je hoe vroeg de vulling komt; 0 betekent alleen lijnen.

### Sneltoetsen

| Toets | Actie |
|---|---|
| Spatie | afspelen / pauze |
| Home / End | naar begin / einde |
| PageUp / PageDown | 1 frame terug / vooruit (Shift: 10) |
| Pijltjes | laag 1px verplaatsen (Shift: 10px) |
| Delete | laag of geselecteerde keyframe verwijderen |
| Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z | ongedaan maken / opnieuw |
| Cmd/Ctrl+D | laag dupliceren |
| Cmd/Ctrl+S, +E | opslaan, exporteren |
| Cmd/Ctrl+scroll | inzoomen in de viewer |

## Export en validatie

| | CM360 | Google Ads | Ad Manager | Generiek IAB |
|---|---|---|---|---|
| clickTag (`var clickTag` + `window.open(window.clickTag)`) | ✓ | ✓ | ✓ | ✓ |
| `<meta name="ad.size">` | ✓ | ✓ | ✓ | ✓ |
| Fonts | los `.woff2` | inline base64 (losse fonts niet toegestaan) | los `.woff2` | los `.woff2` |
| Max. ZIP | 10 MB (IAB-advies 150 KB) | 150 KB | 1 MB | 200 KB |
| Max. bestanden | 100 | 40 | 100 | 100 |
| Animatie | 30 s, 3 loops | 30 s, 3 loops | 30 s, 3 loops | 15 s, 3 loops |
| Backup-JPG (eindframe, ≤40 KB) | ✓ | – | ✓ | ✓ |

De validator controleert per banner:

- de `ad.size`-meta en de clickTag (gedeclareerd én gebruikt);
- of er externe requests in zitten;
- gewicht, aantal bestanden en toegestane bestandstypen;
- bestandsnamen;
- duur en aantal loops;
- of er een rand is bij een lichte achtergrond;
- de backup-afbeelding.

De uitkomst staat in het exportvenster en in `export/rapport.json`.

## Architectuur

```
src/shared/   types, animatie (easing/sampling), runtime, HTML-builder, validatie, presets, formaten
src/main/     Electron hoofdproces: projectmappen, fonts (subset + write-on paden), export/zip/backup, AI
src/preload/  veilige brug naar de renderer (window.bs)
src/renderer/ React-editor: viewer, tijdlijn, inspector, dialogen
```

- **Wat je ziet is wat je exporteert.** De preview in de editor is dezelfde HTML als de export, met dezelfde runtime, in een iframe. Een test controleert dat runtime en editor op elk tijdstip identieke waarden geven.
- De runtime (`src/shared/runtime.ts`) gebruikt geen libraries. Hij speelt af na `load` en `document.fonts.ready` (geen FOUT) en stopt op het eindframe.

## AI-instelling

Vul onder **Instellingen** een Anthropic API-sleutel in. Die wordt versleuteld opgeslagen via de sleutelhanger van het OS. Standaardmodel: `claude-opus-5-5`.

## Roadmap-ideeën

- Afbeeldingen automatisch comprimeren (pngquant/mozjpeg) bij export.
- Slimmere formaat-afleiding met ankers per laag (links/rechts/midden, schaal-regels).
- Extra platforms: Adform, Flashtalking, Xandr.
- Video-laag en sprite-sheets.
- Varianten vanuit CSV (teksten/prijzen per variant).
- AI-effecten als herbruikbare presets opslaan.
