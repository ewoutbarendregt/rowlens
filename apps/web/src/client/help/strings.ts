import { lang } from '../i18n/language.ts';
const en = {
  exampleExplanation: 'Example explanation',
  publicationNotice:
    'This is a public example for signed-in users. The original example maker’s own notes and drawings are included; feedback by other authors stays private.',
  manageOriginal: 'Manage original training',
  help: 'Help',
  examples: 'Example trainings',
  example: 'Example training',
  noExamples: 'No examples are available yet.',
  exampleIntro:
    'Explore how RowLens works. These examples are available to every signed-in user, independently of your club filters.',
  readOnly:
    'This example is read-only. It includes the original maker’s example notes and drawings; feedback by other authors stays private.',
  noClub:
    'You do not have an active club membership yet. You can explore the examples below or choose a club under Clubs.',
  video: (n: number) => `Video ${String(n)}`,
  noVideo: 'There are no videos ready to play yet.',
  primaryClub: 'Primary club',
  automaticClub: 'Automatic (first club by name)',
  primaryHint:
    'The training list starts with this club. You can still select another club or all clubs in the filters.',
  guideIntro:
    'Start with an example, then use your own training to review a session together with your crew and coach.',
  sections: [
    [
      'trainings',
      'Find your training',
      'As a rower you can view a training if you created it, appear in its lineup (including as cox), or have received access through individual or club-wide sharing. Coaches and club administrators can view all trainings in their club. Examples created by a RowLens administrator are available to every signed-in user. A shared note alone does not give access to another training.',
    ],
    [
      'clubs',
      'Choose your club',
      'In the account menu, select your primary club. The training filter starts with that club, or your only club. Without a primary choice, the first club by name is used. Select another club or All clubs in the filters when needed. Examples stay visible separately. Apply for another membership under Clubs.',
    ],
    [
      'create',
      'Create a training and crew',
      'Choose New training, its club, a clear title, date and boat type. Set the lineup from bow to stroke, with the cox in seat 0. Select the correct verified accounts so participants can find the training. You can copy a recent lineup. Being in the crew gives viewing access; it does not make you the owner.',
    ],
    [
      'upload',
      'Add video',
      'Open the training and choose Add videos. Select the recordings and their filming perspective. Keep the page open until the upload finishes. Processing may take a while; the training refreshes its progress. Start playback once the video is ready. Upload controls appear only when you may edit the training. Where Add existing video is available, you can reuse an accessible recording from the same club; your training keeps its own feedback and analysis. Linked source feedback stays read-only and requires continued source access.',
    ],
    [
      'playback',
      'Review frame by frame',
      'Open a video to play or pause, change speed and step through individual frames. Use the timeline to jump or set a loop for repeated review. Zoom with the zoom controls or a two-finger pinch, then drag the enlarged picture. Fullscreen gives you more space on a phone.',
    ],
    [
      'strokes',
      'Mark stroke moments',
      'Coaches and administrators can pause at a catch, half slide or finish and mark that moment in the Strokes tab. Use the stroke-seat rower as the crew reference. The strip and jump controls take you back to marked frames. Timings use these marks; missing or ambiguous information is reported instead of guessed.',
    ],
    [
      'angles',
      'Draw and measure',
      'Where editing is allowed, choose a drawing tool, tap the points on the paused picture and save. Adjust the points before saving if needed. Coaches use the Angles tab to draw or correct a boat line and measure joints on marked frames. Angle comparisons need a suitable side view; a filming perspective can make a measurement unreliable.',
    ],
    [
      'sharing',
      'Share a training',
      'Open Share training on a training you created, or as a coach on a club training. Choose All club members or search for individual members by name, then Save sharing. Recipients can view the training and videos; private feedback keeps its existing permissions. Remove a recipient and save, or use Stop sharing to withdraw all extra viewing access. The creator, participants and staff keep their existing rights. RowLens examples remain available to all signed-in accounts.',
    ],
    [
      'feedback',
      'Discuss feedback',
      'Use Notes for comments and drawings at specific frames. Feedback is private by default. Assign or share it explicitly with individual rowers or the crew when the controls allow it. Rowers see feedback intended for them or written by them within accessible trainings. In example trainings, the original example maker’s own notes and drawings are visible to every signed-in viewer. Feedback by other authors stays private.',
    ],
    [
      'rights',
      'Understand editing rights',
      'Rowers may edit their own trainings. Other trainings they participate in are read-only. Coaches and club administrators can edit club trainings. RowLens administrators manage the platform. Examples have a separate read-only viewer; administrators manage the original through its club context.',
    ],
    [
      'settings',
      'Your account settings',
      'Open your account menu for your name, default boat, primary club, language, display and video preferences. Preferences are saved to your account. After a change on another device, reload or focus the page to refresh them. Sign out from the same menu.',
    ],
  ] as [string, string, string][],
};
const nl: typeof en = {
  exampleExplanation: 'Toelichting bij het voorbeeld',
  publicationNotice:
    'Dit is een voorbeeld voor alle ingelogde gebruikers. De eigen notities en tekeningen van de oorspronkelijke maker zijn daarin zichtbaar; feedback van andere auteurs blijft privé.',
  manageOriginal: 'Originele training beheren',
  help: 'Uitleg',
  examples: 'Voorbeeldtrainingen',
  example: 'Voorbeeldtraining',
  noExamples: 'Er zijn nog geen voorbeelden beschikbaar.',
  exampleIntro:
    'Ontdek hoe RowLens werkt. Deze voorbeelden zijn beschikbaar voor iedereen die is ingelogd, ongeacht je clubfilters.',
  readOnly:
    'Dit voorbeeld kun je alleen bekijken. De voorbeeldnotities en tekeningen van de oorspronkelijke maker zijn zichtbaar; feedback van andere auteurs blijft privé.',
  noClub:
    'Je bent nog geen lid van een actieve club. Bekijk de voorbeelden hieronder of kies een club via Clubs.',
  video: (n: number) => `Video ${String(n)}`,
  noVideo: 'Er zijn nog geen video’s klaar om af te spelen.',
  primaryClub: 'Primaire club',
  automaticClub: 'Automatisch (eerste club op naam)',
  primaryHint:
    'De trainingslijst begint met deze club. Via de filters kun je ook een andere club of alle clubs kiezen.',
  guideIntro:
    'Begin met een voorbeeld en gebruik daarna je eigen training om samen met je ploeg en coach terug te kijken.',
  sections: [
    [
      'trainings',
      'Vind je training',
      'Als roeier zie je een training als je deze zelf hebt aangemaakt, in de opstelling staat (ook als stuurman), of toegang hebt gekregen via persoonlijk of clubbreed delen. Coaches en clubbeheerders zien alle trainingen van hun club. Voorbeelden van een RowLens-beheerder zijn voor iedereen die is ingelogd zichtbaar. Een gedeelde notitie alleen geeft geen toegang tot een andere training.',
    ],
    [
      'clubs',
      'Kies je club',
      'Kies in je accountmenu je primaire club. Het trainingsfilter begint met die club, of met je enige club. Zonder primaire keuze wordt de eerste club op naam gebruikt. Kies zo nodig een andere club of Alle clubs in het filter. Voorbeelden blijven apart zichtbaar. Via Clubs kun je lidmaatschap van een andere club aanvragen.',
    ],
    [
      'create',
      'Maak een training en opstelling',
      'Kies Nieuwe training, de club, een duidelijke titel, datum en boottype. Vul de opstelling van boeg naar slag in, met de stuurman op plek 0. Kies de juiste geverifieerde accounts zodat deelnemers de training kunnen vinden. Je kunt een recente opstelling overnemen. Deelname geeft kijkrechten; je wordt daardoor niet de eigenaar.',
    ],
    [
      'upload',
      'Voeg video toe',
      'Open de training en kies Video’s toevoegen. Selecteer de opnamen en het perspectief waaruit is gefilmd. Houd de pagina open tot het uploaden klaar is. Verwerken kan even duren; de training ververst de voortgang. Speel de video af zodra deze klaar is. Uploadknoppen verschijnen alleen als je de training mag bewerken. Via Bestaande video toevoegen kun je waar beschikbaar een toegankelijke opname van dezelfde club hergebruiken; feedback en analyse blijven van je eigen training. Gekoppelde bronfeedback is alleen te bekijken zolang je toegang tot de bron houdt.',
    ],
    [
      'playback',
      'Kijk beeld voor beeld',
      'Open een video om af te spelen of te pauzeren, de snelheid te wijzigen en losse beelden te doorlopen. Spring via de tijdlijn of stel een lus in om een stuk te herhalen. Zoom met de zoomknoppen of twee vingers en versleep daarna het vergrote beeld. Volledig scherm geeft meer ruimte op je telefoon.',
    ],
    [
      'strokes',
      'Markeer haalmomenten',
      'Coaches en beheerders kunnen bij de inpik, halve bank of uitpik pauzeren en dit moment in de tab Halen markeren. Gebruik de roeier op slag als referentie voor de ploeg. Via de markeringen en springknoppen ga je terug naar gemarkeerde beelden. Tijden worden uit die markeringen berekend; ontbrekende of onduidelijke informatie wordt vermeld.',
    ],
    [
      'angles',
      'Teken en meet',
      'Waar je mag bewerken kies je een tekengereedschap, tik je de punten op het stilstaande beeld aan en sla je op. Pas punten zo nodig vóór het opslaan aan. Coaches tekenen of corrigeren in Hoeken een bootlijn en meten gewrichten op gemarkeerde beelden. Hoekvergelijkingen vragen om een geschikt zijaanzicht; het filmperspectief kan een meting onbetrouwbaar maken.',
    ],
    [
      'sharing',
      'Deel een training',
      'Open Training delen bij een training die je zelf maakte, of als coach bij een clubtraining. Kies Alle clubleden of zoek individuele leden op naam en kies Delen opslaan. Ontvangers kunnen de training en video’s bekijken; privéfeedback houdt zijn bestaande rechten. Verwijder een ontvanger en sla op, of kies Delen stoppen om alle extra kijkrechten in te trekken. De maker, deelnemers en medewerkers houden hun bestaande rechten. RowLens-voorbeelden blijven voor iedereen die is ingelogd zichtbaar.',
    ],
    [
      'feedback',
      'Bespreek feedback',
      'Gebruik Notities voor opmerkingen en tekeningen bij een specifiek beeld. Feedback is standaard privé. Wijs deze expliciet toe of deel deze met afzonderlijke roeiers of de ploeg wanneer de knoppen dat toestaan. Roeiers zien binnen toegankelijke trainingen feedback voor henzelf of van henzelf. Bij voorbeeldtrainingen zijn de eigen notities en tekeningen van de oorspronkelijke voorbeeldmaker zichtbaar voor alle ingelogde kijkers. Feedback van andere auteurs blijft privé.',
    ],
    [
      'rights',
      'Wie mag bewerken?',
      'Roeiers mogen hun eigen trainingen bewerken. Andere trainingen waaraan ze deelnemen zijn alleen te bekijken. Coaches en clubbeheerders mogen clubtrainingen bewerken. RowLens-beheerders beheren het platform. Voorbeelden hebben een aparte kijkpagina; beheerders bewerken het origineel binnen de club.',
    ],
    [
      'settings',
      'Je accountinstellingen',
      'Open je accountmenu voor je naam, standaardboot, primaire club, taal, weergave en videovoorkeuren. Voorkeuren worden bij je account opgeslagen. Herlaad de pagina of keer terug naar het venster om wijzigingen vanaf een ander apparaat op te halen. Uitloggen kan via hetzelfde menu.',
    ],
  ],
};
export const helpStrings = () => (lang() === 'nl' ? nl : en);
