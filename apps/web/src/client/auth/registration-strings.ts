import { lang } from '../i18n/language.ts';
const en = {
  title: 'Create a RowLens account',
  intro:
    'Enter your email and choose a club, or continue without a club. Confirm your email to complete your registration.',
  loginIntro:
    'Already have an account? Enter your email to receive a login code. New here? Choose Create account below.',
  loginMailIf: 'If',
  loginMailRest:
    'already has an account, a login code is on its way. New here? Choose Create account.',
  create: 'Create account',
  club: 'Club',
  choose: 'Choose a club or no club',
  noClub: 'No club for now',
  loading: 'Loading clubs…',
  loadFailed: 'Could not load clubs. Try again.',
  retry: 'Try again',
  send: 'Send confirmation code',
  codeTitle: 'Confirm your email',
  codeIntro: 'Enter the six-digit code sent to',
  codeHint:
    'Your registration is submitted only after confirmation. The code is valid for 10 minutes.',
  confirm: 'Confirm and register',
  back: 'Change email or club',
  signIn: 'Back to sign in',
  clubUnavailable: 'That club is no longer available. Go back and choose another club or no club.',
  registered: 'Your registration is complete',
  registeredWithoutClub:
    'You did not choose a club for this registration. Open a club or request membership below.',
  registeredWithClub: 'Your registration is recorded for',
  admissionHint:
    'Your application status appears below. Club access starts after admission by an administrator.',
  accountRegistration: 'Account registration',
  clubApplication: 'Club application',
  registeredStatus: 'Email confirmed',
  date: 'Submitted',
};
const nl: typeof en = {
  title: 'Een RowLens-account aanmaken',
  intro:
    'Vul je e-mailadres in en kies een club, of ga verder zonder club. Bevestig je e-mailadres om je aanmelding af te ronden.',
  loginIntro:
    'Heb je al een account? Vul je e-mailadres in voor een inlogcode. Nieuw hier? Kies hieronder Account aanmaken.',
  loginMailIf: 'Als',
  loginMailRest:
    'al een account heeft, ontvang je een inlogcode. Nieuw hier? Kies Account aanmaken.',
  create: 'Account aanmaken',
  club: 'Club',
  choose: 'Kies een club of geen club',
  noClub: 'Voorlopig geen club',
  loading: 'Clubs laden…',
  loadFailed: 'De clubs konden niet worden geladen. Probeer het opnieuw.',
  retry: 'Opnieuw proberen',
  send: 'Bevestigingscode versturen',
  codeTitle: 'Bevestig je e-mailadres',
  codeIntro: 'Vul de zescijferige code in die is verstuurd naar',
  codeHint: 'Je aanmelding wordt pas na bevestiging ingediend. De code is 10 minuten geldig.',
  confirm: 'Bevestigen en aanmelden',
  back: 'E-mailadres of club wijzigen',
  signIn: 'Terug naar inloggen',
  clubUnavailable:
    'Deze club is niet meer beschikbaar. Ga terug en kies een andere club of geen club.',
  registered: 'Je aanmelding is afgerond',
  registeredWithoutClub:
    'Je hebt bij deze aanmelding geen club gekozen. Hieronder kun je een club openen of een lidmaatschap aanvragen.',
  registeredWithClub: 'Je aanmelding is vastgelegd voor',
  admissionHint:
    'Hieronder zie je de status van je aanvraag. Je krijgt clubtoegang na toelating door een beheerder.',
  accountRegistration: 'Accountaanmelding',
  clubApplication: 'Clubaanvraag',
  registeredStatus: 'E-mailadres bevestigd',
  date: 'Ingediend',
};
export const registrationStrings = () => (lang() === 'en' ? en : nl);
