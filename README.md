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
2. **Lagen** voeg je toe via *+ Laag*: tekst, vorm, write-on of een afbeelding. Een asset links aanklikken maakt er ook een laag van.
3. **Formaten** staan als tabs bovenin. Met *+* voeg je een IAB- of eigen formaat toe; dat wordt afgeleid van de basis 300×600.
4. **Animeren** in de tab *Animatie* (zie hieronder).
5. **Exporteren**: kies formaten en platform(s). Elke banner wordt gebouwd, gezipt, voorzien van een backup-JPG en gevalideerd.
6. **Opslaan als boilerplate** (bladwijzer-icoon): het hele project (formaten, animaties, assets, fonts) wordt een startpunt voor volgende campagnes.

### Meerdere formaten: de basis is leidend

- Alle formaten zitten in één project. De **basis** (300×600, gemarkeerd met ●) is leidend.
- Met **Alle** zie je de formaten naast elkaar, synchroon afspelend. Klik op een formaat om het te bewerken.
- **Wijzig je iets in de basis**, dan gaat het mee naar alle andere formaten. Dat geldt voor:
  - tekst, font, kleuren, afbeelding en animaties;
  - positie en maat, omgerekend naar dat formaat;
  - nieuwe en verwijderde lagen, en de volgorde.
- **Wijzig je iets in een afgeleid formaat**, dan geldt dat alleen daar. Die eigenschap wordt onthouden als *afwijkend van basis*, en latere wijzigingen in de basis overschrijven hem niet meer.
  - In de inspector zie je welke eigenschappen afwijken (oranje labels). Met × herstel je één eigenschap naar de basis, met *Alles* de hele laag.
  - In de tijdlijn hebben afwijkende lagen een oranje stip.
  - Lagen die je alleen in een afgeleid formaat toevoegt, zijn *eigen lagen* van dat formaat.
- Hetzelfde geldt voor de formaatinstellingen (duur, loops, achtergrond, rand).
- Met het **koppel-icoon** zet je dit uit. Dan zijn alle formaten los.
- Een nieuw formaat wordt automatisch afgeleid. Bij een sterk afwijkende verhouding (zoals 728×90 van 300×600) moet je de layout daar zelf bijstellen; dat blijft daarna staan.

### Animatiebibliotheek

Links staat onder **Animaties** een bibliotheek. Beweeg over een tegel voor een voorbeeld en sleep hem op een laag:

- **op het canvas**: de animatie gaat op die laag;
- **in de tijdlijn op een spoor**: de animatie begint waar je hem loslaat;
- **of klik** op een tegel om hem op de geselecteerde lagen te zetten.

| Binnenkomst | Accent | Uitgang |
|---|---|---|
| Fade in, Slide up/down, Slide in links/rechts, **Bounce in**, Pop in, Elastic in, Zoom in/uit, Draai in, Write-on, Wipe links/omhoog | Pulse, Heartbeat, Shake, Wiebel, Spring, Flash | Fade out, Slide out omhoog/omlaag/links, Zoom out, Pop out |

Daarna pas je alles aan in de tab **Animatie**:

- binnenkomst en uitgang: start, duur, easing, afstand, schaal, rotatie en fade;
- accent: start, duur, aantal herhalingen en kracht.

In de tijdlijn staan ze als groene (IN), gele (ACCENT) en oranje (UIT) blokken, die je kunt slepen en verlengen.

### Animeren

- **Binnenkomst, accent en uitgang** (makkelijkste manier): sleep een animatie uit de bibliotheek, of zet ze per laag aan in de tab *Animatie*.
  - Daarna stel je start, duur, easing, verschuiving, schaal, rotatie en fade bij.
  - De laag beweegt naar zijn eigen positie. Verplaats je de laag, dan beweegt de animatie mee; je hoeft geen keyframes te zetten.
  - In de tijdlijn staan ze als groene (IN) en oranje (UIT) blokken. Die sleep je om te verschuiven, en met de rechterrand verander je de duur.
- **Alles laten binnenkomen**: zonder selectie (of met meerdere lagen geselecteerd) geeft de tab *Animatie* alle lagen dezelfde binnenkomst, van boven naar onder na elkaar.
- **Keyframes** voor eigen bewegingen:
  - Klik ◆ bij een eigenschap, of zet **Auto-key** (de rode stip in de tijdlijn) aan. Dan zet elke wijziging in positie, schaal, rotatie of dekking een keyframe op de huidige tijd.
  - Sleep keyframes, en kies een easing per keyframe.
- **Hele laag verschuiven**: sleep de balk van een laag in de tijdlijn. Alle keyframes en de binnenkomst/uitgang gaan mee.
- Het **eindframe** ligt vóór de eerste uitgang. De laatste loop stopt daar, zodat het eindbeeld en de backup-afbeelding alles tonen.

### Rand en polite loading

- **Rand**: per formaat aan/uit, met kleur en dikte (standaard 1px #ccc). Hij wordt als aparte laag bovenop de banner geëxporteerd.
- **Polite loading** (standaard aan):
  - Direct zichtbaar zijn alleen de achtergrond en de rand.
  - Afbeeldingen laden pas na het `load`-event van de pagina. De animatie start pas als alle afbeeldingen en fonts binnen zijn.
  - In het validatierapport telt de *initial load* daardoor alleen de HTML en de fonts mee.

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

- **Formaten koppelen** gebeurt in `src/shared/sync.ts`: na elke wijziging worden inhoud en timing doorgezet naar lagen met hetzelfde `linkId`.
- **Binnenkomst/uitgang** (`src/shared/motion.ts`) worden bij het bouwen omgezet naar gewone keyframes, dus de runtime blijft klein.
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
