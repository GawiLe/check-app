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
  - Sleep keyframes, en kies een easing per keyframe. Alleen het keyframe beweegt; de laagbalk blijft staan. Een plek waar al een keyframe staat wordt overgeslagen.
- **Transform zoals in After Effects**: positie (X en Y) en schaal staan elk op één regel, met één ◆. Eén klik zet een keyframe voor X én Y tegelijk; in de tijdlijn is het ook één regel *Positie* en één regel *Schaal*.
  - **Schaal X% / Y%** zijn standaard gekoppeld (🔗). Ontkoppel om breedte en hoogte apart te schalen; opnieuw koppelen zet Y weer gelijk aan X.
  - **Maat B / H** (pixels) kun je ook koppelen: dan blijft de verhouding gelijk bij typen en bij slepen aan de hoeken.
- **Hele laag verschuiven**: sleep de balk van een laag in de tijdlijn. Alle keyframes en de binnenkomst/uitgang gaan mee.
- Het **eindframe** ligt vóór de eerste uitgang. De laatste loop stopt daar, zodat het eindbeeld en de backup-afbeelding alles tonen.

### Werkruimte indelen

Alle panelen (Canvas, Code, Tijdlijn, Animaties, Assets & fonts, Ontwerp, Animatie, AI) zijn los, zoals in After Effects:

- **Verplaatsen**: sleep een tabblad naar een andere paneelgroep (wordt een tab) of naar de rand van een paneel (links/rechts = naast elkaar, boven/onder = onder elkaar).
- **Groter/kleiner**: sleep de lijnen tussen panelen.
- **Aan/uit**: × op een tab sluit het paneel; terug via **Venster** (werkbalk of menubalk).
- **Maximaliseren**: dubbelklik op een tab, de knop rechtsboven, of ` (backtick) met de muis boven een paneel.
- **Indeling herstellen** staat in het menu Venster. Je indeling wordt onthouden.

### Code bekijken

Bovenin het canvas kies je **Ontwerp**, **Code** of **Beide** (naast elkaar). De code is precies de HTML die geëxporteerd wordt, live bijgewerkt: *Leesbaar* (opgemaakt) of *Exact* (zoals in de zip), per platform, met de grootte en een kopieerknop. Er is ook een los paneel *Code* dat je overal neer kunt zetten.

### Uitlijnen en verdelen

Bovenin het paneel *Ontwerp* staan de knoppen voor links, midden, rechts, boven, midden en onder, en voor horizontaal en verticaal verdelen (gelijke tussenruimte). Kies *Selectie* (op elkaar) of *Banner*. Eén laag wordt altijd op de banner uitgelijnd. Er wordt uitgelijnd op de rustpositie, dus een binnenkomst-animatie telt niet mee.

### Hele pixels

Posities, maten en rotatie zijn altijd hele getallen, schaal en dekking hele procenten. Dat geldt voor slepen, typen, uitlijnen, keyframes en geïmporteerde projecten. Zo staat elke laag in rust precies op de pixelgrid, zonder wazige randen.

### Hernoemen

Lagen: selecteer en druk **Enter**, dubbelklik op de naam in de tijdlijn, of rechtermuisknop → *Naam wijzigen*. Composities: Enter of rechtermuisknop (dubbelklik opent ze). Formaten en compositie-tabs: dubbelklik op het tabblad.

### Werken op het canvas

- **Gereedschap** staat links in de balk:
  - **V** selecteren
  - **T** tekst: klik op het canvas
  - **R** rechthoek en **E** ellips: sleep, met Shift voor een vierkant of cirkel
  - **G** pen tool: klik voor punten en sleep voor een bocht. Klik op het eerste punt om de vorm te sluiten. Enter of de rechtermuisknop geeft een open lijn, Esc stopt.
- **Tekst bewerken:** dubbelklik op een tekstlaag (of Enter) en typ direct op het canvas. Esc of Cmd/Ctrl+Enter bevestigt.
- **Anchor point:** het kruisje in het midden van een geselecteerde laag is het draaipunt voor schaal en rotatie.
  - Sleep het naar een andere plek; het klikt vast op hoeken, randen en midden. De laag verspringt niet, net als met Pan Behind in AE.
  - Je kunt het ook instellen via het 3×3-raster in de inspector.
- **Vormen:** kies rechthoek of ellips, zet vulling en lijn los aan of uit (met kleur en dikte), en stel bij een rechthoek de hoekradius in. *Rond* maakt er een pil-vorm van. Pen-vormen schalen mee als je de laag groter maakt.
- **Rechtermuisknop** op een laag (canvas of tijdlijn) geeft onder meer:
  - *Voeg toe aan nieuwe compositie*
  - knippen, kopiëren, plakken, dupliceren
  - naar voren of achteren
  - achter elkaar zetten, in- en uitpunt
  - verbergen, vergrendelen, animatie verwijderen, verwijderen
- **Afbeelding vervangen** (zoals *Replace footage* in After Effects): positie, animatie en breedte blijven, de hoogte volgt de verhouding van de nieuwe afbeelding.
  - Rechtermuisknop op de laag → *Afbeelding vervangen…* (kies uit de assets of *Uploaden uit map…*) of direct *Vervangen door bestand uit map…*
  - Knop *Vervangen…* bij Afbeelding in het paneel Ontwerp
  - Rechtermuisknop op een asset → *Vervang geselecteerde afbeelding*, of sleep een asset op een afbeeldingslaag in de tijdlijn
  - In een afwijkend formaat (niet de basis) geldt de nieuwe afbeelding alleen voor dat formaat.

  Op een lege plek: plakken of een nieuwe laag.
- **Kopiëren en plakken** (Cmd/Ctrl+C, X, V) werkt binnen het project, ook tussen formaten en composities. In tekstvelden werkt het gewone kopiëren en plakken van het systeem.

### Lagen ordenen en bestanden importeren

- **Volgorde:** sleep een laag in de tijdlijn naar boven of onder. Een blauwe lijn laat zien waar hij komt; bij de rand scrolt de tijdlijn mee.
  - Je kunt een laag ook in of uit een opengeklapte compositie slepen. Positie en timing worden dan omgerekend, zodat hij op dezelfde plek en hetzelfde moment blijft.
- **SVG, PNG, JPG, GIF en WebP:** sleep ze vanuit de Finder op het canvas. Ze komen in `assets/` en worden meteen een laag op de plek waar je loslaat.
  - Sleep je ze op het linkerpaneel, dan komen ze alleen bij de assets.
  - Via *Assets & fonts → importeren* kan het ook.
  - SVG blijft scherp op elk formaat en is meestal maar een paar KB.
- **SVG: kiezen hoe hij binnenkomt.** Bij een SVG krijg je een keuzevenster:
  - **Als afbeelding:** één lichte laag, precies zoals het bestand, die je als geheel animeert.
  - **Als bewerkbare vormen:** elke vorm (path, rect, circle, ellipse, polygon, line) wordt een eigen laag in een nieuwe compositie, met eigen vulling, lijn en animatie. Handig om een logo in stukjes te animeren.
    - Overgenomen worden: transformaties, kleuren uit `<style>` en classes, lijndiktes en vormen met gaten (evenodd).
    - Van een verloop wordt alleen de eerste kleur overgenomen.
    - Tekst, ingesloten afbeeldingen en `<use>` worden overgeslagen; die meldt de app.
  - Met *Onthoud mijn keuze* krijg je het venster niet meer. Je zet het terug in Instellingen (*SVG importeren: elke keer vragen*).
- **Fonts** (WOFF/WOFF2/TTF/OTF) kun je ook gewoon op het venster slepen.

### Keyframe-assistent (Easy Ease)

Selecteer keyframes met een klik op ◆; Shift-klik voegt er meer aan toe. Kies daarna, via de rechtermuisknop, de knoppen in de tijdlijn of de toetsen:

| | |
|---|---|
| **Easy Ease** (F9) | rustig aankomen én vertrekken |
| **Easy Ease In** (Shift+F9) | rustig aankomen bij de keyframe |
| **Easy Ease Out** (Cmd/Ctrl+Shift+F9) | rustig vertrekken uit de keyframe |
| **Lineair** | geen easing |

Per keyframe kun je daarnaast een andere curve kiezen (bijvoorbeeld overshoot, elastisch of stuiter).

### Composities openen in een eigen tab

Dubbelklik op een compositie, op het canvas of in de tijdlijn, en hij opent als eigen tab boven de tijdlijn, zoals een pre-comp in After Effects.

- De tijdlijn toont dan alleen de lagen in die compositie.
- Op het canvas klik je alleen die lagen aan. De compositie zelf heeft een groene stippellijn.
- Nieuwe lagen, getekende vormen en geplakte lagen komen in die compositie terecht.
- Met het formaat-tabblad (bijvoorbeeld 300×600) ga je terug; met × sluit je een tab.

### Composities (pre-comps) en scènes

Groepen werken zoals pre-comps in After Effects.

- **Groeperen:** selecteer lagen (Shift-klik) en kies *Groeperen* of druk Cmd/Ctrl+G. De groep animeer je als geheel: sleep er bijvoorbeeld *Bounce in* op. Daarnaast houden de lagen binnen de groep hun eigen animaties.
- **In de groep werken:**
  - Klik op het canvas selecteert de hele groep. Dubbelklik pakt een laag ín de groep.
  - In de tijdlijn klap je de groep open; de lagen erin staan ingesprongen.
- **Dupliceren** (Cmd/Ctrl+D) kopieert de groep met alle inhoud en animaties.
- **Achter elkaar zetten:** selecteer meerdere lagen of groepen (bijvoorbeeld scène 1, 2 en 3) en kies *Achter elkaar*, eventueel met overlap. Elke laag begint dan waar de vorige eindigt.
- **In- en uitpunt** (wanneer een laag zichtbaar is):
  - Sleep de randen van de balk in de tijdlijn, of gebruik Alt+[ en Alt+], of het blok *Tijd* in de inspector.
  - Sleep je de hele balk, dan schuift de laag met al zijn animaties mee.
- **Degroeperen** (Shift+Cmd/Ctrl+G) zet alles terug op dezelfde plek en tijd.

### Tijdlijn

- Klap een laag uit met het pijltje, een dubbelklik of **U** (voor alle geselecteerde lagen). Je ziet dan per eigenschap de keyframes: positie X/Y, schaal, rotatie, dekking en reveal.
  - **Dichte ◆** zijn eigen keyframes: sleepbaar, met een easing per keyframe.
  - **Holle ◇** komen uit een binnenkomst, accent of uitgang. Die verschuif je via het gekleurde blok.
  - Met ◆ vóór een eigenschap zet je een keyframe op de playhead, of haal je hem weg.
- Met de knop naast de opname-stip klap je alles in één keer uit of in.
- **Panelen** zijn te vergroten door de scheidingslijnen te slepen (tijdlijn, links, rechts). Dubbelklik op een lijn zet hem terug. De indeling wordt onthouden.

### clickTag

De clickTag (landings-URL) staat altijd rechtsboven in de balk en geldt voor alle formaten. Is het geen geldige http(s)-URL, dan kleurt het veld rood.

De URL die je hier invult is de **fallback**. De export gebruikt het standaardpatroon van Google:

```html
<script>var clickTag = "https://jouw-landingspagina.nl";</script>
<a id="ad" href="javascript:window.open(window.clickTag)">…</a>
```

- **CM360, Google Ads en Ad Manager** herkennen `var clickTag` bij het uploaden. De trafficker vult daar de echte klik-URL in, en het ad-server overschrijft de fallback bij het uitserveren (met klikmeting).
- **Generieke ad-servers** die de klik-URL als `?clickTag=…` (of `clickTAG`) in de URL meegeven: die waarde wordt gebruikt. Alleen http(s) wordt geaccepteerd.
- Gebeurt geen van beide (lokaal testen, of de klik-URL is niet ingevuld), dan opent de fallback.
- Staat de fallback nog op de voorbeeld-URL, dan waarschuwt de export.

### Fonts

Bij een tekstlaag kies je een font met de font-kiezer:

- **In dit project:** fonts die je al gebruikt of hebt geïmporteerd.
- **Systeem:** Arial, Helvetica, Verdana, Georgia en dergelijke. Die worden niet meegeleverd (0 KB).
- **Google Fonts:** de hele catalogus, doorzoekbaar, met een voorbeeld als je over een naam beweegt.
  - Kies een gewicht; dat wordt gedownload naar `fonts/` in je project.
  - Bij export wordt het font weer verkleind tot alleen de gebruikte tekens.
  - Hiervoor is internet nodig. De catalogus wordt een week bewaard; offline zie je de populairste fonts.

**Eigen font:** kies in de font-kiezer *Eigen font toevoegen…* (WOFF, WOFF2, TTF of OTF). Het font wordt in `fonts/` gezet en meteen gekozen; daarna staat het onder *In dit project*. Importeren kan ook onder *Assets & fonts*.

**Bij export** (eigen fonts en Google Fonts; systeemfonts worden nooit meegeleverd):

- Het font wordt per formaat verkleind tot alleen de tekens die in dát formaat voorkomen (subset, woff2). Een font van 700 KB wordt zo vaak een paar KB. Het exportvenster meldt per font hoeveel tekens en hoeveel KB.
- Standaard wordt het als **Base64** in de HTML gezet, zonder losse `.woff`/`.woff2`-bestanden in de zip. Uitzetten kan bij *Ontwerp → Export → Fonts* (dan losse `.woff2`). Voor Google Ads en Azerion is inbedden altijd aan.

### Eigen presets

Animeer een laag en kies in de tab *Animatie* **Opslaan als preset**.

- De preset verschijnt in de bibliotheek onder *Eigen presets* en is beschikbaar in al je projecten.
- Hij wordt relatief opgeslagen (verschuivingen in plaats van vaste posities), dus hij past op elke laag.
- De bibliotheekgroepen klap je in en uit door op de titel te klikken.

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
| Cmd/Ctrl+D | laag of groep dupliceren |
| Cmd/Ctrl+G, Shift+Cmd/Ctrl+G | groeperen / degroeperen |
| U | eigenschappen van de selectie uit-/inklappen in de tijdlijn |
| Enter | geselecteerde laag hernoemen |
| ` | paneel onder de muis maximaliseren / terug |
| Alt+[ / Alt+] | in- / uitpunt op de playhead |
| Dubbelklik (canvas) | laag binnen een groep selecteren |
| Cmd/Ctrl+S, +E | opslaan, exporteren |
| Cmd/Ctrl+scroll | inzoomen in de viewer |

## Export en validatie

| | CM360 | Google Ads | Ad Manager | Adform | Azerion | Generiek IAB |
|---|---|---|---|---|---|---|
| Klik | `var clickTag` + `window.open(window.clickTag)` | idem | idem | `dhtml.getVar('clickTAG')` + `manifest.json` | idem als CM360 | idem als CM360 |
| Klikgebieden | `clickTag1`, `clickTag2` … | gaan naar de ene URL van de advertentie | `clickTag1` … | `clickTAG1` … | `clickTag1` … | `clickTag1` … |
| `<meta name="ad.size">` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Fonts (subset) | Base64 (instelbaar) | Base64 (verplicht) | Base64 (instelbaar) | Base64 (instelbaar) | Base64 (verplicht) | Base64 (instelbaar) |
| Max. ZIP | 10 MB (IAB-advies 150 KB) | 150 KB | 1 MB | 10 MB (IAB-advies 150 KB) | 300 KB | 200 KB |
| Max. bestanden | 100 | 40 | 100 | 100 | 100 | 100 |
| Animatie | 30 s, 3 loops | 30 s, 3 loops | 30 s, 3 loops | 30 s, 3 loops | 30 s, 3 loops | 15 s, 3 loops |
| Backup-JPG (eindframe, ≤40 KB) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Backup-afbeelding:** van het eindframe, als `<naam>.jpg` naast `<naam>.zip` (bijv. `campagne_300x600.zip` + `campagne_300x600.jpg`). Met dezelfde naam koppelt CM360 hem bij het uploaden aan de juiste creative.

**Klikgebieden (optioneel):** standaard is de hele banner één klikveld (`clickTag`). Via *+ Laag → Klikgebied* (een onzichtbare rechthoek) of rechtermuisknop → *Eigen klikgebied* op een bestaande laag geef je een deel van de banner een eigen URL. Klikgebieden liggen altijd boven de algemene klik, ook als er een andere laag overheen ligt. Op het canvas zie je ze als geel gestippeld kader met hun nummer.

**DV360:** banners die via DV360 worden ingekocht en via CM360 worden uitgeleverd: kies CM360. Rechtstreeks in DV360 uploaden werkt met dezelfde standaard HTML5-zip. Alleen voor Studio/rich media (Enabler) is iets anders nodig.

De validator controleert per banner:

- de `ad.size`-meta en de clickTag (gedeclareerd én gebruikt, ook per klikgebied; voor Adform `manifest.json` en `Adform.DHTML.js`);
- of de fallback-clickTag nog de voorbeeld-URL is;
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
src/renderer/ React-editor: viewer, tijdlijn, inspector, codeweergave, dialogen
src/renderer/src/dock/  werkruimte: indeling als boom van splitsingen en tabgroepen
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
