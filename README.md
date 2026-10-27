# Bnnr Studio

Desktop-app (Electron) voor het maken van **lichte, gevalideerde HTML5 display banners** (IAB), met een werkwijze zoals in After Effects: lagen, keyframes, easing en een tijdlijn. Je werkt vanuit boilerplates en de export is direct klaar voor **Campaign Manager 360**, **Google Ads**, **Google Ad Manager** of generiek IAB.

## Waarom

Google Web Designer-exports laden standaard een eigen runtime, webcomponents, polyfills en vaak de Studio Enabler mee. Bnnr Studio exporteert alleen wat nodig is:

- één `index.html` met inline CSS en een eigen animatie-runtime van ±1,5 KB;
- de gebruikte afbeeldingen;
- fonts **gesubset** naar alleen de gebruikte tekens, als WOFF2 (meestal 3–6 KB in plaats van 50–700 KB).

De demo-banner (300×600, eigen font, logo, write-on, 6 geanimeerde lagen) is als ZIP **8 KB**.

## Installeren op een (nieuwe) Mac

Eenmalig per Mac, in Terminal:

1. **Git** (Apple-ontwikkelaarstools): `xcode-select --install` en volg het venster. Staat het er al, dan meldt Terminal dat.
2. **Node.js 22 (LTS)**: download en installeer het pakket van nodejs.org. Controleer met `node -v` (moet v22 of hoger zijn).
3. **Code ophalen** (de repository is privé, dus GitHub vraagt om in te loggen: gebruikersnaam + een *personal access token* als wachtwoord, of log eerst in met GitHub Desktop):
   ```bash
   git clone -b claude/banner-studio https://github.com/GawiLe/check-app.git ~/banner-studio
   ```
4. **Installeren en starten:**
   ```bash
   cd ~/banner-studio
   npm install
   npm run dev
   ```
   `npm run dev` controleert zelf of Electron goed gedownload is en haalt hem zo nodig alsnog op. Lukt dat niet (bijv. "Electron uninstall"): `rm -rf node_modules/electron`, `npm install`, `npm run dev`.

Daarna is bijwerken altijd: `cd ~/banner-studio`, `git pull`, `npm install`, `npm run dev`.

### Als gewone app installeren (DMG), ook voor collega's

```bash
cd ~/banner-studio
git pull
npm install
npm run dmg
```

De eerste keer duurt dit een paar minuten. Daarna staan er twee DMG's in `dist/` (de map gaat vanzelf open):

- `Bnnr-Studio-<versie>-arm64.dmg` voor Macs met een **Apple-chip** (M1, M2, M3, M4 …)
- `Bnnr-Studio-<versie>-x64.dmg` voor Macs met een **Intel**-processor

Welke je nodig hebt: Apple-menu → *Over deze Mac* → bij *Chip* staat "Apple M…" (arm64), bij *Processor* staat "Intel" (x64). De DMG voor je eigen Mac gaat ook meteen open: sleep **Bnnr Studio** naar **Programma's**. Alleen je eigen versie maken gaat sneller: `npm run dmg -- --deze-mac`.

**Delen met collega's** (via WeTransfer, Drive, Slack, AirDrop …). De app is niet ondertekend met een Apple-certificaat, dus macOS vraagt de eerste keer om bevestiging:

1. DMG openen, **Bnnr Studio** naar **Programma's** slepen.
2. Bnnr Studio openen. macOS meldt dat het niet kan controleren of de app vrij is van malware: klik op *Gereed* (of *OK*).
3. *Systeeminstellingen → Privacy en beveiliging*, helemaal naar beneden: bij "Bnnr Studio is geblokkeerd" op **Open toch** klikken en bevestigen met je wachtwoord of Touch ID.
4. Daarna opent de app gewoon, ook alle volgende keren.

Lukt dat niet (of zegt macOS dat de app "beschadigd" is), dan in Terminal: `xattr -dr com.apple.quarantine "/Applications/Bnnr Studio.app"` en de app opnieuw openen.

Een nieuwe versie: opnieuw `npm run dmg` en de nieuwe DMG delen; collega's slepen hem over de oude heen (hun projecten en instellingen blijven staan). Wil je dat collega's helemaal geen melding krijgen, dan heb je een Apple Developer-account nodig: zie *Mac-app als ondertekende DMG* hieronder.

De app en `npm run dev` gebruiken dezelfde instellingen (recente projecten, presets, boilerplates). Alleen een AI-sleutel moet je in de app één keer opnieuw invullen (de sleutelhanger hoort per app).

Instellingen (recente projecten, API-sleutel, eigen presets, boilerplates) staan per Mac en gaan niet mee. Projectmappen kun je gewoon kopiëren of via een gedeelde map openen.

## Starten

```bash
npm install
npm run dev        # app starten met hot reload
npm test           # unit tests (builder, runtime, validatie, formaten)
npm run typecheck
npm run dmg        # Mac-app als DMG's (Apple-chip + Intel) om te installeren en te delen, zonder Apple-account
npm run dist:mac   # Mac-app als DMG (Apple silicon + Intel), ondertekend als de gegevens hieronder er zijn
```

## Mac-app als ondertekende DMG

Een **ondertekende en genotariseerde** DMG opent op elke Mac zonder waarschuwing ("kan niet worden geopend omdat de ontwikkelaar niet kan worden geverifieerd"). Daarvoor heb je eenmalig nodig:

1. **Apple Developer Program** (developer.apple.com/programs, € 99 per jaar). Op naam van Connect Create kan ook (dan vraagt Apple een D-U-N-S-nummer).
2. **Certificaat "Developer ID Application"**: in Xcode → Instellingen → Accounts → *Manage Certificates* → + → *Developer ID Application*. Het komt dan in je sleutelhanger. Voor GitHub: in *Sleutelhangertoegang* rechtsklik op het certificaat → *Exporteer…* als `.p12` met een wachtwoord.
3. **App-specifiek wachtwoord** voor de notarisatie: account.apple.com → *Inloggen en beveiliging* → *App-specifieke wachtwoorden*.
4. Je **Team ID** (10 tekens): developer.apple.com/account → *Membership details*.

**Op je eigen Mac** (certificaat staat in je sleutelhanger):

```bash
cd ~/banner-studio
export APPLE_ID="jij@connect-create.nl"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCDE12345"
npm run dist:mac
```

Na een paar minuten (de notarisatie bij Apple duurt even) staan in `dist/` twee DMG's: `Bnnr-Studio-<versie>-arm64.dmg` (Apple silicon) en `-x64.dmg` (Intel). Controle: `spctl -a -vvv "dist/mac-arm64/Bnnr Studio.app"` moet *Notarized Developer ID* melden.

**Via GitHub** (geen Mac nodig, bijv. voor een collega): zet in de repository onder *Settings → Secrets and variables → Actions* de secrets `MAC_CERT_P12_BASE64` (uitkomst van `base64 -i DeveloperID.p12 | pbcopy`), `MAC_CERT_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` en `APPLE_TEAM_ID`. Daarna een tag pushen, vanaf de branch waarop je werkt:

```bash
git tag v0.2.0
git push origin v0.2.0
```

GitHub bouwt dan op een Mac, ondertekent en notariseert, en zet de DMG's bij *Releases* (en onder *Actions → Artifacts*). Staat de workflow op de hoofdbranch (`main`), dan kan het ook zonder tag via *Actions → Mac-app (DMG) → Run workflow*.

Zonder Apple-account bouwt `npm run dist:mac` de DMG ook, alleen niet ondertekend: macOS waarschuwt dan bij het eerste openen (rechtsklik → *Open*, of *Systeeminstellingen → Privacy en beveiliging → Toch openen*).

De app is extra afgeschermd met Electron-*fuses*: geen "run as node", geen debugpoort, `NODE_OPTIONS` genegeerd, en alleen de ondertekende `app.asar` wordt geladen (met integriteitscontrole).


## Werken met projecten (bronmappen)

Een project is een gewone map:

```
mijn-campagne/
  project.bsproj   ← het project (JSON: formaten, lagen, keyframes)
  assets/          ← afbeeldingen (png, jpg, svg, gif, webp)
  fonts/           ← woff, woff2, ttf, otf
```

- **Nieuw project:** je kiest alleen de locatie (bijv. *Documenten/Banners*); de app maakt daarin zelf een map met de projectnaam. Bestaat die al, dan wordt het `Naam 2`.
- **Varianten** komen als eigen map naast het origineel, in dezelfde bovenliggende map (`Zomeractie-winter`).
- Er wordt **geen exportmap** in het project aangemaakt: bij de eerste export kies je waar de export heen moet (te wijzigen in het exportvenster; per project onthouden).

- Zet bestanden direct in `assets/` of `fonts/`. De app houdt de map in de gaten en ververst de preview als je een bestand vervangt (bijvoorbeeld een nieuwe packshot vanuit Photoshop).
- Je kunt de map gewoon in Git, Dropbox of op de server zetten.

## Workflow

1. **Nieuw project:** standaard **leeg** (alleen een 300×600-basis). Wil je een begin, kies dan *Voorbeeld 300×600* (achtergrond, headline, subline, packshot-plek en CTA, al geanimeerd) of een eigen boilerplate.
2. **Lagen** voeg je toe via *+ Laag*: tekst, vorm, write-on of een afbeelding. Een asset links aanklikken maakt er ook een laag van.
3. **Formaten** staan als tabs bovenin. Met *+* voeg je een IAB- of eigen formaat toe; dat wordt afgeleid van de basis 300×600.
4. **Animeren** in de tab *Animatie* (zie hieronder).
5. **Exporteren**: kies formaten en platform(s). Elke banner wordt gebouwd, gezipt, voorzien van een backup-JPG en gevalideerd.
6. **Opslaan als boilerplate** (bladwijzer-icoon): het hele project (formaten, animaties, assets, fonts) wordt een startpunt voor volgende campagnes.

### Meerdere formaten: de basis is leidend

Alle formaten staan in het paneel **Formaten** (links boven, of via Venster → Formaten):

- Klik op een formaat om het te bewerken; dubbelklik om de naam te wijzigen. Met **+** voeg je een formaat toe.
- Het **vinkje** zet een formaat aan of uit: uitgezette formaten staan niet in het overzicht en zijn standaard niet aangevinkt bij exporteren.
- **Alle formaten** toont de aangevinkte formaten naast elkaar, synchroon afspelend, elk met zijn eigen inhoud.
- Rechtermuisknop of **⋯**: naam wijzigen, *Lay-out overnemen van …* een ander formaat, alle aanpassingen terug naar de basis, verwijderen.

Hoe het koppelen werkt:

- De **basis** (300×600, label *basis*) is leidend. Wat je daarin toevoegt, verwijdert of wijzigt, gaat naar alle formaten: tekst, font, kleuren, afbeeldingen en animaties, en positie en maat (omgerekend naar dat formaat).
- **In een ander formaat** pas je inhoud, plek en maat aan, verberg je lagen met het oogje of voeg je eigen lagen toe. Dat geldt alleen voor dat formaat en de basis overschrijft het daarna niet meer.
  - In de tijdlijn: **geel** = aangepast in dit formaat, **blauwgroen** = eigen laag van dit formaat. Het formatenpaneel telt ze (● 2, +1).
  - In het paneel Ontwerp zie je welke eigenschappen afwijken. Met × herstel je één eigenschap naar de basis, met *Alles* de hele laag.
- Hetzelfde geldt voor de formaatinstellingen (duur, loops, achtergrond, rand).
- **Een ander formaat als begin:** bij *Formaat toevoegen* kies je *Uitgaan van* (bijv. je uitgewerkte 300×250 voor de 336×280), of je doet later *Lay-out overnemen van …*. Het formaat blijft gekoppeld aan de basis; wat afwijkt wordt een aanpassing van dat formaat.
- Met het **koppel-icoon** in het paneel zet je het koppelen uit. Dan zijn alle formaten los.

### Alle formaten naast elkaar

Knop **Alle formaten** bovenaan het canvas (of in het paneel Formaten, of de toets `\`): alle aangevinkte formaten tegelijk, synchroon afspelend.

- **Passend** zet ze allemaal in beeld op **dezelfde schaal**, zodat je de echte verhoudingen ziet; met *50%* en *100%* kijk je op vaste grootte.
- Per formaat zie je of het de basis is (★), hoeveel lagen er zijn aangepast (● 2) of eigen zijn (+1), en een waarschuwing **⚠ tekst** als een tekst niet in zijn kader past.
- **Klik** op een formaat om het te bewerken; de rechtermuisknop geeft hetzelfde menu als in het paneel Formaten (naam, lay-out overnemen, terugzetten, verwijderen).

### Animeren met keyframes

Je animeert met **keyframes**, zoals in After Effects.

- **Keyframe zetten:** klik ◆ bij een eigenschap (in de tijdlijn of in de tab *Animatie*), of zet **Auto-key** (de rode stip in de tijdlijn) aan. Daarna zet elke wijziging in positie, schaal, rotatie of dekking een keyframe op de playhead.
- **Keyframes bewerken:** sleep ze in de tijdlijn, kies een easing per keyframe (rechtermuisknop, of F9 voor Easy Ease), en pas waarden direct aan in de uitgeklapte eigenschappen.
- **Transform zoals in After Effects:** positie (X en Y) en schaal staan elk op één regel met één ◆. Schaal X/Y is standaard gekoppeld (🔗); ontkoppel om breedte en hoogte apart te schalen.
- **Hele laag verschuiven:** sleep de balk van een laag in de tijdlijn; alle keyframes gaan mee.
- **Meerdere keyframes:** ⇧-klik om keyframes erbij te selecteren, of sleep een rechthoek over lege ruimte in de eigenschap-sporen (ook over meerdere lagen). Sleep er één en ze gaan allemaal mee.
- **Relatief aanpassen:** staat de playhead op een van de geselecteerde keyframes en wijzig je de waarde (bijv. Y), dan schuiven alle geselecteerde keyframes van die eigenschap evenveel mee. Zo zet je een hele slide-in in één keer hoger.
- **Meerdere lagen tegelijk:** met meerdere lagen geselecteerd geldt een waarde die je in de tijdlijn intypt voor allemaal (zoals in After Effects).
- **Duur:** klik of sleep op de duur in de tijdlijnkop (naast de tijd), of stel hem in bij Ontwerp → formaat.

**Presets (paneel Animaties)** zijn een snelle start, en zetten gewone keyframes op de laag:

- **klik** op een preset: keyframes op de geselecteerde lagen, vanaf de playhead;
- **sleep** op een laag in het canvas, of op een spoor in de tijdlijn: daar begint hij waar je loslaat;
- bestaande keyframes binnen die periode worden vervangen, daarbuiten blijven ze staan.

| Binnen | Accent | Uit |
|---|---|---|
| Fade in, Slide up/down, Slide in links/rechts, Bounce in, Pop in, Elastic in, Zoom in/uit, Draai in, Write-on, Wipe links/omhoog | Pulse, Heartbeat, Shake, Wiebel, Spring, Flash | Fade out, Slide out omhoog/omlaag/links, Zoom out, Pop out |

Er zit niets "verborgens" meer op een laag: wat je ziet zijn de keyframes. Oudere projecten met binnenkomst/accent/uitgang worden bij het openen omgezet naar keyframes die er precies hetzelfde uitzien.

- **Na elkaar laten binnenkomen:** zonder selectie (of met meerdere lagen geselecteerd) zet de tab *Animatie* dezelfde preset op alle lagen, van boven naar onder na elkaar.
- **Eindbeeld** (Ontwerp → formaat): hier stopt de laatste loop en hiervan wordt de backup-afbeelding gemaakt. Standaard het einde; zet het vóór een uitgaande animatie (*Playhead*). Een *uit*-preset zet het eindbeeld automatisch vóór de uitgang.

### Werkruimte indelen

Alle panelen (Canvas, Code, Tijdlijn, Formaten, Animaties, Assets & fonts, Ontwerp, Animatie, AI) zijn los, zoals in After Effects:

- **Verplaatsen**: sleep een tabblad naar een andere paneelgroep (wordt een tab) of naar de rand van een paneel (links/rechts = naast elkaar, boven/onder = onder elkaar).
- **Groter/kleiner**: sleep de lijnen tussen panelen.
- **Aan/uit**: × op een tab sluit het paneel; terug via **Venster** (werkbalk of menubalk).
- **Maximaliseren**: dubbelklik op een tab, de knop rechtsboven, of ` (backtick) met de muis boven een paneel.
- **Eigen venster (tweede scherm):** sleep een tab buiten de app, of klik ↗ rechtsboven in een paneel. Het paneel komt in een eigen venster dat je overal neer kunt zetten; het werkt gewoon mee (selectie, tijd en sneltoetsen). Sluit het venster of klik op het terugzet-icoon en het paneel staat weer in de werkruimte. Losse vensters en hun plek worden onthouden.
- **Indeling herstellen** staat in het menu Venster. Je indeling wordt onthouden.

### Code bekijken

Bovenin het canvas kies je **Ontwerp**, **Code** of **Beide** (naast elkaar). De code is precies de HTML die geëxporteerd wordt, live bijgewerkt: *Leesbaar* (opgemaakt) of *Exact* (zoals in de zip), per platform, met de grootte en een kopieerknop. Er is ook een los paneel *Code* dat je overal neer kunt zetten.

### Uitlijnen en verdelen

Bovenin het paneel *Ontwerp* staan de knoppen voor links, midden, rechts, boven, midden en onder, en voor horizontaal en verticaal verdelen (gelijke tussenruimte). Kies *Selectie* (op elkaar) of *Banner*. Eén laag wordt altijd op de banner uitgelijnd. Er wordt uitgelijnd op de rustpositie, dus een binnenkomst-animatie telt niet mee.

### Hele pixels

Posities, maten en rotatie zijn altijd hele getallen, schaal en dekking hele procenten. Dat geldt voor slepen, typen, uitlijnen, keyframes en geïmporteerde projecten. Zo staat elke laag in rust precies op de pixelgrid, zonder wazige randen.

### Verloop, masker en overvloeien

Alleen technieken die in alle moderne browsers werken (Chrome, Safari, Firefox, Edge; ook op iOS en Android):

- **Verloop** (bij Vorm): van de vulkleur naar een tweede kleur, *lineair* (met hoek) of *radiaal*, met dekking per kant. Bijvoorbeeld zwart 60% → transparant over een foto, zodat tekst leesbaar blijft. Werkt ook op gesloten pen-vormen (als SVG-verloop).
- **Masker** (bij Weergave): snijd een afbeelding, vorm of hele compositie bij tot een rechthoek (met hoekradius) of ellips, bijvoorbeeld een ronde productfoto, of een compositie waar iets in- en uitschuift zonder buiten het kader te komen.
- **Overvloeien** (bij Weergave): Vermenigvuldigen, Bleken, Bedekken, Zacht licht enz., zoals in Photoshop. Mengt alleen binnen de banner, nooit met de website eromheen.

### Schaduw

Werkt zoals de **slagschaduw in Photoshop**: neem de waarden uit de laagstijl direct over.

- **Dekking** (%), **Hoek** (°, de richting van het licht: 90 = van boven, de schaduw valt naar beneden), **Afstand** (px), **Spreiden** (%) en **Grootte** (px).
- Meerdere schaduwen stapelen (zoals twee slagschaduwen in PS); voorbeelden: Zacht, Hard, Dubbel, Gloed.
- Werkt op tekst, vormen, afbeeldingen en composities (CSS `drop-shadow`, volgt de vorm).
- Niet over te nemen: de overvloeimodus van de schaduw (bij zwart maakt *Vermenigvuldigen* geen verschil) en *Contour*/*Ruis*.

### Tekst zoals in Photoshop

- **Lettergrootte** in pt (1 pt = 1 px, zoals in een webdocument van 72 ppi).
- **Regelafstand** (↕pt) in pt, vast zoals in Photoshop: hij blijft gelijk als je de lettergrootte wijzigt (in andere formaten schaalt hij mee met de letter).
- **Tracking** (VA) in duizendsten van een em, zoals in PS: neem bijv. *-40* direct over.
- *Kerning: Optisch* bestaat niet in browsers; de banner gebruikt de kerning van het font (*Metrisch*).

### Hernoemen

Lagen: selecteer en druk **Enter**, dubbelklik op de naam in de tijdlijn, of rechtermuisknop → *Naam wijzigen*. Composities: Enter of rechtermuisknop (dubbelklik opent ze). Formaten en compositie-tabs: dubbelklik op het tabblad.

### Werken op het canvas

- **Gereedschap** staat links in de balk:
  - **V** selecteren
  - **T** tekst: klik op het canvas, of **sleep een tekstvak** in de maat die je wilt
  - **Q** rechthoek en **E** ellips: sleep, met Shift voor een vierkant of cirkel
  - **G** pen tool: klik voor punten en sleep voor een bocht. Klik op het eerste punt om de vorm te sluiten. Een **open lijn** rond je af met dubbelklik, Enter, Esc, de rechtermuisknop of door ander gereedschap te kiezen. Een open lijn krijgt meteen een zwarte lijn van 3 px.
- **Lagen verbergen:** het oogje links in de tijdlijn. In een ander formaat dan de basis geldt dat alleen voor dat formaat.
- **Waarden in de tijdlijn:** klap een laag uit (pijltje, of P/S/R/O/U) en pas positie, schaal (X 🔗 Y), rotatie en dekking direct aan: slepen of klikken en typen. Is de eigenschap geanimeerd, dan komt er een keyframe op de playhead.
- **Uitlijnen:** de uitlijnknoppen staan bovenin de werkbalk (selectie of banner).
- **Panelen schikken:** sleep de kop van een blok in Ontwerp of Animatie (bijv. *Transform*) naar een andere plek. De volgorde wordt onthouden.
- **Tekst bewerken:** dubbelklik op een tekstlaag (of Enter) en typ direct op het canvas. Esc of Cmd/Ctrl+Enter bevestigt.
- **Slimme hulplijnen:** tijdens het slepen klikt een laag vast op de randen en het midden van de banner en van andere lagen (roze lijn). De afstanden in pixels tot de buren of de bannerrand staan erbij. Houd Cmd/Ctrl ingedrukt om even niet vast te klikken.
- **Formaat wijzigen:** acht grepen rondom de selectie, in elke hoek en midden op elke rand. De tegenoverliggende hoek of rand blijft staan (ook bij rotatie). Shift of het slotje bij *Maat* houdt de verhouding vast.
- **Passende tekst:** zet bij Tekst *Passend* aan en de letter wordt in de banner zelf kleiner tot de tekst in het kader past (handig bij varianten en vertalingen). Past tekst niet, dan zie je een rood kader *Tekst past niet* op het canvas en een waarschuwing in het paneel.
- **Anchor point:** het kruisje in het midden van een geselecteerde laag is het draaipunt voor schaal en rotatie.
  - Sleep het naar een andere plek; het klikt vast op hoeken, randen en midden. De laag verspringt niet, net als met Pan Behind in AE.
  - Je kunt het ook instellen via het 3×3-raster in de inspector.
- **Vormen:** kies rechthoek of ellips, zet vulling en lijn los aan of uit (met kleur en dikte), en stel bij een rechthoek de hoekradius in. *Rond* maakt er een pil-vorm van. Pen-vormen schalen mee als je de laag groter maakt.
- **Kleuren:** naast elk kleurvlakje staat de hexcode. Typ of plak een code (`#e30613`, `e30613` of kort `f00`) en druk op Enter.
- **Hoofdletters:** bij *Tekst → Hoofdletters* kies je *Aa* (zoals getypt), *AA* (alles hoofdletters), *aa* (alles kleine letters) of *Aa Bb* (elk woord een hoofdletter). De tekst zelf blijft zoals je hem typte; bij export komen de juiste letters in het verkleinde font.
- **Lijn (stroke):** bij een vorm stel je onder *Lijn* in: kleur, dikte, **positie** (binnen, midden of buiten de rand), **stippellijn** (lengte van streep en gat; streep 0 met ronde uiteinden geeft stippen) en **uiteinden** (rond of recht). Tekst kan ook een lijn krijgen (rond de letters, de vulling blijft heel).
- **Write-on richting:** bij een write-on laag kies je onder *Write-on → Richting* of de letters zich van links, van rechts, van boven of van onder schrijven (boven/onder: regel voor regel). De wipes in Animaties bestaan in alle vier richtingen; op een write-on laag zetten ze de schrijfrichting.
- **Lijn laten tekenen:** de knop *Lijn laten tekenen* (of Wipe → *Lijn tekenen*) laat de lijn zich vanaf de playhead in 1 seconde tekenen, zoals Trim Paths in After Effects. Het zijn gewone keyframes op *Reveal* die je in de tijdlijn kunt verschuiven of aanpassen. Werkt voor pen-lijnen, rechthoeken en ellipsen.
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
- **Assets-paneel:** elke asset met een voorbeeldje (op een schaakbord, zodat je transparantie ziet), de afmetingen en het gewicht in KB, en hoe vaak hij gebruikt wordt in alle formaten (*0×* = nergens). Met de knop in de kop wissel je tussen een lijst en een raster met grote voorbeelden. Sorteer op *Naam* of *Gebruik*. Verwijderen kan met het prullenbakje (bij aanwijzen) of de rechtermuisknop: het bestand gaat naar de prullenbak. Is de asset in gebruik, dan vraagt Bnnr eerst bevestiging en worden die afbeeldingslagen leeg.
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

- Je ziet dan **alleen die compositie**, los op zijn eigen maat, en de tijd begint op **0 s** (het in-punt van de compositie). De duur in de tijdlijnkop is de duur van de compositie; afspelen herhaalt alleen die compositie.
- **Maat en duur van een compositie:** open hem en klik op een lege plek (niets geselecteerd); in *Ontwerp → Compositie* stel je naam, maat (B×H), duur en het moment waarop hij begint in. De duur kan ook in de tijdlijnkop. In het formaat kun je de maat ook bij *Transform → Maat* aanpassen, en de duur door de balk te trimmen.
- In het formaat schuif je de compositie zelf naar de juiste plek in de tijd. Daar kun je hem ook uitklappen om de lagen erin te zien en te bewerken.
- Nieuwe lagen, getekende vormen en geplakte lagen komen in die compositie terecht.
- Met het formaat-tabblad (bijvoorbeeld 300×600) ga je terug; met × sluit je een tab.

### Transparant bekijken

Met het rasterknopje rechtsonder op het canvas zie je de banner (of een geopende compositie) zonder achtergrond, op een schaakbord. Handig voor een los getekend element. Dit is alleen weergave: de export houdt de achtergrond.

### Composities (pre-comps) en scènes

Groepen werken zoals pre-comps in After Effects.

- **Groeperen:** selecteer lagen (Shift-klik) en kies *Nieuwe compositie* of druk Cmd/Ctrl+G. De groep animeer je als geheel: sleep er bijvoorbeeld *Bounce in* op. Daarnaast houden de lagen binnen de groep hun eigen animaties.
- **Timing zoals in After Effects:** de nieuwe compositie begint waar de eerste laag begint (begint die op 3 s, dan de compositie ook). Open je de compositie, dan begint die eerste laag daarbinnen weer op 0 s. Hebben alle lagen een uitpunt, dan eindigt de compositie bij de laatste. In de banner verandert er niets: alles komt op hetzelfde moment in beeld.
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
- **Wat je ziet is het fontbestand uit het project**, ook tijdens het typen op het canvas (niet een font met dezelfde naam dat op je Mac staat). Let op bij "Alternates"-versies van een font: daarin zijn letters soms anders getekend. In *MANIC Alternates 3* is de hoofdletter U bijvoorbeeld als kleine u getekend; wil je de gewone hoofdletters, kies dan de gewone versie van het font.
- **Fontbestand vervangen:** in *Assets & fonts → Fonts* het pijltjes-icoon bij een font (verschijnt bij aanwijzen). Alle teksten en write-on lagen met dat font, in alle formaten, gaan in één keer mee. Handig als de versie op je Mac anders is dan die in het project: zoek hem in *Lettertypecatalogus* (Font Book), rechtsklik → *Toon in Finder*, en kies dat bestand.

### Eigen presets

Animeer een laag en kies in de tab *Animatie* **Opslaan als preset**.

- De preset verschijnt in de bibliotheek onder *Eigen presets* en is beschikbaar in al je projecten.
- Hij wordt relatief opgeslagen (verschuivingen in plaats van vaste posities), dus hij past op elke laag.
- De bibliotheekgroepen klap je in en uit door op de titel te klikken.

### Rand en polite loading

- **Rand**: per formaat aan/uit, met kleur en dikte (standaard 1px zwart). Hij wordt als aparte laag bovenop de banner geëxporteerd.
- **Polite loading** (standaard aan):
  - Direct zichtbaar zijn alleen de achtergrond en de rand.
  - Afbeeldingen laden pas na het `load`-event van de pagina. De animatie start pas als alle afbeeldingen en fonts binnen zijn.
  - In het validatierapport telt de *initial load* daardoor alleen de HTML en de fonts mee.

### Write-on

Een write-on laag zet tekst uit je eigen font om naar SVG-paden per letter. De eigenschap **Reveal** (0→1) tekent eerst de omtrek van elke letter en vult hem daarna, letter voor letter. Met "Vulling" bepaal je hoe vroeg de vulling komt; 0 betekent alleen lijnen.

### Varianten (template)

Knop *Varianten* in de werkbalk: het project is het template.

1. **Velden kiezen:** vink aan welke teksten en afbeeldingen per variant anders mogen zijn.
2. **Varianten invullen:** per variant een kolom; vul alleen in wat anders is (leeg = zoals het origineel). Afbeeldingen kies je uit de assets of upload je uit een map.
3. **Aanmaken:** elke variant wordt een eigen projectmap naast het template (`<project>-<variant>`), desgewenst meteen geëxporteerd, en verschijnt als tabblad.

**Per formaat:** elke variant krijgt alle formaten. Per veld kies je *Alle formaten* (één waarde per variant) of *Per formaat* (bijv. een eigen achtergrond per formaat), en per formaat of het variabel is. Verschilt het origineel per formaat, dan staat *Per formaat* vanzelf aan. Een leeg vak = zoals het origineel van dat formaat.

**Uit CSV/Excel (optie):** met *Uit CSV/Excel…* lees je varianten in uit een `.csv`, `.tsv` of Excel-bestand (`.xlsx`, eerste werkblad):

| Variant | Headline | logo.svg |
|---|---|---|
| Zomer | Zomeractie! | zomer.svg |
| Winter | Winterdeals | winter.png |

- De eerste rij bevat de **laagnamen** als kolomkop (of het volledige label, zoals `Scène 1 › Headline`); de kolom *Variant* (of de eerste kolom) is de naam. Gebruikte velden worden vanzelf aangevinkt.
- Afbeeldingen: een bestandsnaam uit `assets/`, of een bestand dat naast de spreadsheet staat (dat wordt naar `assets/` gekopieerd).
- Bestaat een variant met dezelfde naam al, dan wordt hij bijgewerkt. Een lege cel = zoals het origineel; een rij *Origineel* wordt overgeslagen.
- *Opslaan als CSV…* maakt een sjabloon met de gekozen velden en de huidige varianten, om in Excel verder in te vullen.

### Meerdere projecten (tabbladen)

Elk geopend project krijgt een tabblad bovenin het venster, zoals in een browser. Per tabblad blijft alles bewaard: ongedaan maken, selectie, tijd en zoom. Een gele stip betekent niet-opgeslagen wijzigingen.

- **Openen** (map-knop in de werkbalk of de **+** naast de tabbladen): *Map kiezen…* of een **recent project**. Staat het al open, dan ga je naar dat tabblad. Ook via menu Bestand → *Recent openen*.
- **Varianten** die je aanmaakt verschijnen meteen als tabbladen; je blijft in het template.
- **Sluiten:** × op het tabblad, middelklik of Cmd/Ctrl+W. Wisselen: klik of Ctrl+Tab / Ctrl+Shift+Tab.
- Bij afsluiten met wijzigingen in meerdere tabbladen slaat *Opslaan* ze allemaal op.

### Niet-opgeslagen wijzigingen

Sluit je het venster, sluit je de app af (Cmd+Q) of open je een ander of nieuw project terwijl er wijzigingen niet zijn opgeslagen, dan vraagt Bnnr Studio eerst: **Opslaan**, **Niet opslaan** of **Annuleren**. Op de Mac zie je niet-opgeslagen wijzigingen ook aan de stip in de sluitknop van het venster.

### Automatisch bewaren, herstel en versies

- Elke minuut bewaart Bnnr Studio een **herstelkopie** van niet-opgeslagen werk (in de verborgen map `.bnnr` in de projectmap). Crasht de app of valt de stroom uit, dan vraagt hij bij het openen of je dat werk wilt **herstellen**.
- Elke keer opslaan bewaart een **versie** (de laatste 50). Bestand → *Versiegeschiedenis…* toont ze; *Terugzetten* kun je met Cmd/Ctrl+Z weer ongedaan maken.

### Kleuren van de editor

In **Instellingen** (tandwiel rechtsboven in de werkbalk, ⌘, of de knop op het startscherm) → **Kleuren van de editor** kies je zelf de accentkleur (knoppen, selectie, grepen), de kleur van de lagen in de tijdlijn en die van de keyframes, met de kleurkiezer of een hexcode. Er zijn ook een paar voorbeelden (Bnnr, Mint, Blauw, Paars, Roze, Grijs). Je ziet het meteen; *Opslaan* bewaart het op deze computer, *Annuleren* zet het terug. Dit gaat alleen over de editor, niet over je banners.

### Sneltoetsen

Het volledige overzicht staat in de app: **Help → Sneltoetsen** of druk **?**. De belangrijkste (⌘ = Ctrl op Windows, ⌥ = Alt):

| Toets | Actie |
|---|---|
| Spatie | afspelen / pauze |
| Home / End | naar begin / eindframe |
| PageUp / PageDown | 1 frame terug / vooruit (⇧: 10) |
| < / > of J / K | naar vorig / volgend keyframe |
| ◀ ◆ ▶ in de tijdlijn | per eigenschap: precies naar het vorige / volgende keyframe, of keyframe zetten/weghalen |
| I / ⇧I | naar in- / uitpunt van de geselecteerde laag |
| [ / ] | laag met al zijn keyframes verschuiven: begint / eindigt (laatste keyframe) op de playhead |
| ⌥[ / ⌥] | in- / uitpunt op de playhead (inkorten) |
| P / S / R / O | alleen positie / schaal / rotatie / dekking van de selectie tonen in de tijdlijn (nog een keer = inklappen, ⇧ = erbij) |
| U | alleen eigenschappen met keyframes tonen |
| ⌥⇧P / S / R / O | keyframe positie / schaal / rotatie / dekking op de playhead (⌥⇧T werkt ook) |
| F9, ⇧F9, ⌘⇧F9 | Easy Ease, Easy Ease In, Easy Ease Out |
| ⌥A / ⌥H / ⌥D | links / horizontaal midden / rechts uitlijnen |
| ⌥W / ⌥V / ⌥S | boven / verticaal midden / onder uitlijnen |
| ⌥⇧H / ⌥⇧V | horizontaal / verticaal verdelen |
| ⌘] / ⌘[ (⇧: helemaal) | naar voren / naar achteren |
| ⌥⌘/ | afbeelding vervangen |
| ⌘D, ⌘G, ⇧⌘G | dupliceren, nieuwe compositie, opheffen |
| Enter | naam wijzigen |
| Pijltjes | 1 px verplaatsen (⇧: 10 px) |
| ⌘A / ⇧⌘A / Esc | alles / niets selecteren |
| V, T, Q, E, G | selecteren, tekst, rechthoek, ellips, pen (R = rechthoek als er niets geselecteerd is) |
| ⌘S, ⌘N, ⌘O, ⌘W, ⌘E | opslaan, nieuw, openen, tabblad sluiten, exporteren |
| Ctrl+Tab | volgend projecttabblad |
| ` | paneel onder de muis maximaliseren |

Letters en haakjes werken op de fysieke toets, dus ook met Option/Alt en op elk toetsenbord. In een invoerveld doen ze niets.

## Export en validatie

Elke geëxporteerde banner begint met `<!-- This banner was proudly created by Connect & Create -->` (vóór de doctype; geldig HTML5).

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

**Afbeeldingen optimaliseren (optie):** zet in het paneel Ontwerp bij Export *Afbeeldingen* aan (of vink het aan in het exportvenster). Bij export worden JPG's en PNG's dan verkleind tot de maat waarop ze in dat formaat getoond worden (2× voor retina, met schaal-animaties en groepen meegerekend) en opnieuw gecomprimeerd. Een PNG zonder transparantie (zoals een foto) wordt een JPG als dat veel kleiner is. De originelen in `assets/` blijven staan; het rapport toont per afbeelding wat het opleverde.

**Dubbele afbeeldingen:** staat dezelfde afbeelding op meerdere lagen, of twee keer in je assets onder een andere naam (byte voor byte gelijk), dan komt hij maar één keer in de export.

**Live KB-teller:** linksonder op het canvas zie je hoe groot de export van het huidige formaat wordt, tegen de strengste grens van de gekozen platforms (ZIP of initial load). Groen is ruim binnen de grens, geel bijna, rood te groot.

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

De uitkomst staat in het exportvenster.

**Waar komt de export?** In de map die je kiest, met daarin een map met de projectnaam en per formaat een zip plus backup-afbeelding met dezelfde naam:

```
<gekozen map>/
  Bannerv1/
    Bannerv1_300x600px.zip
    Bannerv1_300x600px.jpg
```

Kies je meer dan één platform, dan komt er per platform een submap tussen (`Bannerv1/CM360/…`, `Bannerv1/Adform/…`); bij één platform niet.

**Ook als MP4 of GIF:** vink in het exportvenster onder *Ook als video of GIF* MP4 en/of GIF aan (dat kan ook zonder HTML5-platform). Ze komen altijd in een eigen map, ook bij één platform:

```
<gekozen map>/
  Bannerv1/
    Bannerv1_300x600px.zip
    Bannerv1_300x600px.jpg
    MP4/Bannerv1_300x600px.mp4
    GIF/Bannerv1_300x600px.gif
```

- **MP4:** H.264 (speelt overal af, ook in PowerPoint, Keynote en op social), 25/30/60 fps, standaard 2× zo scherp (bijv. 600×1200 voor een 300×600).
- **GIF:** ware grootte, 8–20 fps. Vul bij *max. KB* een maximum in, dan maakt Bnnr de GIF zo nodig lichter (minder kleuren, lagere fps) en waarschuwt als dat niet genoeg is.
- Beide bevatten alle loops achter elkaar en eindigen op het eindbeeld, precies zoals de banner afspeelt (ook code-elementen en tekenende lijnen). In het exportvenster klik je op een platform om te zien wat het is en welke eisen gelden. *Azerion* is een Europees advertentieplatform (o.a. Improve Digital) dat banners op websites en in games plaatst; kies het alleen als de campagne daar loopt.

## Architectuur

```
src/shared/   types, animatie (easing/sampling), runtime, HTML-builder, validatie, presets, formaten
src/main/     Electron hoofdproces: projectmappen, fonts (subset + write-on paden), export/zip/backup, AI
src/preload/  veilige brug naar de renderer (window.bs)
src/renderer/ React-editor: viewer, tijdlijn, inspector, codeweergave, dialogen
src/renderer/src/dock/  werkruimte: indeling als boom van splitsingen en tabgroepen
resources/    app-icoon: mark.svg (beeldmerk, bron) → icon.svg / icon.png (macOS-raster, 1024 px)
```

- **Formaten koppelen** gebeurt in `src/shared/sync.ts`: na elke wijziging worden inhoud en timing doorgezet naar lagen met hetzelfde `linkId`.
- **Binnenkomst/uitgang** (`src/shared/motion.ts`) worden bij het bouwen omgezet naar gewone keyframes, dus de runtime blijft klein.
- **Wat je ziet is wat je exporteert.** De preview in de editor is dezelfde HTML als de export, met dezelfde runtime, in een iframe. Een test controleert dat runtime en editor op elk tijdstip identieke waarden geven.
- De runtime (`src/shared/runtime.ts`) gebruikt geen libraries. Hij speelt af na `load` en `document.fonts.ready` (geen FOUT) en stopt op het eindframe.

### Veiligheid

Een project is een gewone map die je kunt delen of krijgen. De app gaat er daarom van uit dat een projectbestand niet te vertrouwen is:

- **Preview:** eigen document via `bsproj://` met een strenge CSP (geen netwerk; alleen de scripts die de app zelf in de banner zet, op sha256-vingerafdruk). Alleen bestanden uit `assets/` en `fonts/` zijn bereikbaar.
- **Export, backup-JPG, MP4 en GIF** renderen in een aparte, afgeschermde sessie (`src/main/render.ts`): geen netwerk, geen permissies, alleen de tijdelijke exportmap.
- **Code-elementen** gaan door een allowlist-opschoner (`src/shared/code.ts`): alleen opmaak- en SVG-elementen, geen scripts, event-handlers, externe url's of CSS-escapes.
- **Bestanden schrijven** gaat via `src/main/paths.ts`: nooit buiten de projectmap (ook niet via `..` of symlinks), via een tijdelijk bestand + hernoemen (nooit een half geschreven project).
- **Vensters** draaien met `contextIsolation` en `sandbox`; geen camera/microfoon/locatie, geen `<webview>`, geen pop-ups behalve de losgemaakte panelen. Het hoofdproces accepteert IPC alleen van het hoofdvenster, en alleen voor het geopende project.
- **Spreadsheets:** grenzen aan grootte en kolommen (geen zip-bom), en formules krijgen bij CSV-export een `'` (geen formule-injectie in Excel).
- **API-sleutels** staan versleuteld in de OS-sleutelhanger; is die er niet, dan waarschuwt de app.

## AI: animatiecode laten schrijven

De AI is bedoeld voor animaties die je zelf lastig kunt maken. Paneel **AI**:

- **Nieuw element:** beschrijf een bewegend element, bijv. *"een laadsymbool met drie stippen die op en neer stuiteren"* of *"een glans die schuin over de knop schuift"*. De AI schrijft kleine HTML/SVG + CSS-animatie; die komt als **code-element** (laag) in het midden van het formaat.
- **Element aanpassen:** selecteer een code-element en vraag om een wijziging (*"twee keer zo snel"*, *"in de kleuren van de banner"*). Positie en schaal blijven behouden.
- **Lagen animeren:** de AI zet keyframes op je bestaande lagen (zoals voorheen).

Een code-element gedraagt zich als een gewone laag: verplaatsen, schalen (de inhoud schaalt mee), in-/uitpunt, keyframes, maskers. De CSS-animatie loopt **synchroon met de tijdlijn** vanaf het in-punt: scrubben laat precies dat moment zien, en de backup-afbeelding toont het eindbeeld. De code kun je zelf bekijken en aanpassen in het paneel **Ontwerp**. Bij het bouwen wordt hij altijd opgeschoond (geen scripts, geen externe bestanden) en per laag afgeschermd, zodat hij niets anders in de banner raakt.

**Instellingen → AI via:**
- **Anthropic (Claude):** vul je Anthropic API-sleutel in (console.anthropic.com). Standaardmodel: `claude-opus-5-5`.
- **fal.ai:** gebruikt je fal-tegoed (ook tegoed via Vercel). Maak een sleutel in het fal-dashboard (Vercel → Integrations → fal → *Open in fal* → Keys) en vul die in. Het fal-model is in te stellen (standaard `anthropic/claude-sonnet-4.5` via fal's `any-llm`; bestaat een model niet meer, dan probeert de app zelf een ander en onthoudt dat).

Sleutels worden versleuteld opgeslagen via de sleutelhanger van het OS.

## Roadmap-ideeën

- Slimmere formaat-afleiding met ankers per laag (links/rechts/midden, schaal-regels).
- Structuurwijzigingen in de basis (groeperen, lagen verplaatsen tussen groepen) slimmer doorzetten naar formaten met eigen aanpassingen.
- Preview tijdens slepen live bijwerken in plaats van herladen (nog vloeiender bij zware projecten).
- GIF-codering en de KB-teller in een apart proces, zodat de editor nooit even stokt.
- Extra platforms: Flashtalking, Xandr.
- Video-laag en sprite-sheets.
- Mockups in de app en *Publiceren naar klantportaal*.
- Automatische updates voor de ondertekende app (via GitHub-releases).
- De editor via een eigen protocol laden in plaats van `file://`, zodat ook die laatste Electron-fuse dicht kan.
- Overzicht "Alle formaten" naast elkaar met één klik naar het formaat; asset-miniaturen in het paneel.
- AI-effecten als herbruikbare presets opslaan.
