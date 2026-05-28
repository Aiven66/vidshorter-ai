import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'Koti', blog: 'Blogi', pricing: 'Hinnat', login: 'Kirjaudu sisään', register: 'Rekisteröidy', dashboard: 'Kojelauta', admin: 'Hallintapaneeli', logout: 'Kirjaudu ulos', credits: 'Luottokappaleet', download: 'Lataa Sovellus', light: 'Vaalea', dark: 'Tumma',
  },
  footer: {
  desc: 'Muuta pitkät videosi kiehtoviksi lyhyiksi klipseiksi tekoälypohjaisella analyysillä ja editoinnilla.', quickLinks: 'Pikalinkit', legal: 'Lakiasiat', privacy: 'Tietosuojakäytäntö', terms: 'Käyttöehdot', contact: 'Yhteystiedot', rights: 'Kaikki oikeudet pidätetään.',
  },
  home: {
  hero: {
  badge: 'Tekoälypohjainen Videokäsittely',
  title: 'Muuta Pitkät Videot Viralaisiksi Lyhytvideoiksi',
  subtitle: 'AI-vetoinen videoleikkaus, joka erottaa parhaat hetket pitkästä sisällöstäsi automaattisesti',
  cta: 'Aloita Leikkaus Ilmaiseksi',
  secondary: 'Katso Demo',
  },
  howItWorks: {
  title: 'Näin Se Toimii', step1: { title: 'Syötä Video', desc: 'Liitä URL tai lataa videosi' }, step2: { title: 'Tekoälyanalyysi', desc: 'Tekoäly havaitsee kohokohdat automaattisesti' }, step3: { title: 'Luo Klippejä', desc: 'Lyhyet videot luodaan' }, step4: { title: 'Lataa', desc: 'Vie ja jaa missä tahansa' },
  },
  features: {
  title: 'Tehokas AI-videoleikkaus',
  auto: { title: 'Automaattinen Korostusten Tunnistus', desc: 'AI analysoi videosi ja tunnistaa kiinnostavimmat hetket automaattisesti' },
  multi: { title: 'Usean Alustan Tuki', desc: 'Tuo YouTube\'sta, Bilibili\'stä tai lataa omat videotiedostosi' },
  quick: { title: 'Nopea Vienti', desc: 'Lataa klipsisi useassa muodossa, valmiina mihin tahansa sosiaaliseen alustaan' },
  },
  },
  video: {
  input: { title: 'Syötevideo', url: 'Videon URL (YouTube/Bilibili)', upload: 'Lataa Video', placeholder: 'Liitä YouTube- tai Bilibili-videolinkki...' },
  process: 'Käsittele Video', processing: 'Käsitellään...', analyze: 'Analysoi', results: 'Luodut Lyhytvideot', highlights: 'Korostusten Analyysi', download: 'Lataa', preview: 'Esikatselu',
  creditsAvailable: 'krediittiä käytettävissä', signInToStart: 'aloittaaksesi videoiden käsittelyn', pasteUrlPlaceholder: 'Liitä videon URL (MP4, MOV, AVI...)', useLocalAgent: 'Käytä paikallista Mac Agenttia (suositeltu vakaalle YouTubelle)', uploadLocal: 'Lataa paikallinen videotiedosto (suositeltu kun YouTube-linkki on estetty)', selectedFile: 'Valittu', downloadMacApp: 'Lataa Mac-sovellus', viewPricing: 'Katso Hinnat', clipsReady: 'klippiä valmiina', playableClips: 'toistettavaa klippiä', failedClips: 'epäonnistui', aiFinished: 'Tekoäly on suorittanut vahvimpien hetkien valinnan lähdevideostasi.', openToPreview: 'Avaa mikä tahansa valmis klippi esikatseluun tai lataa MP4 suoraan.', clipsBeingGenerated: 'Klippejä luodaan:', videoPreviewNotAvailable: 'Videon esikatselu ei ole saatavilla', clipMayStillProcessing: 'Klippi saattaa olla yhä käsittelyssä tai sen luominen epäonnistui.', insufficientCredits: 'Krediittejä ei riittävästi. Tarvitset vähintään 30 krediittiä.', enterVideoUrl: 'Anna videon URL tai lataa paikallinen videotiedosto.', enterValidUrl: 'Anna kelvollinen julkinen http(s) videon URL.',
  stage: {
  init: 'Alustetaan...', extractFrames: 'Puretaan videoruutuja...', framesExtracted: 'Ruudut purettu onnistuneesti', framesUnavailable: 'Jatketaan analyysillä', aiAnalysis: 'Tekoäly analysoi videosisältöä...', analysisComplete: 'Analyysi valmis', generatingClip: 'Luodaan kohokohdaklippiä...', clipReady: 'Kohokohdaklippi valmis', saving: 'Tallennetaan tuloksia...', complete: 'Käsittely valmis!', error: 'Virhe tapahtui',
  },
  },
  pricing: {
  title: 'Yksinkertainen, Läpinäkyvä Hinnoittelu', subtitle: 'Valitse tarpeisiisi sopiva suunnitelma',
  paymentNote: 'Alipay Kiinalle · Creem kansainvälisille (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'Kaikki maksut suojattu TLS 256-bit salauksella', faqTitle: 'Usein Kysytyt Kysymykset', faq: { q1: 'Mikä on krediitti?', a1: 'Jokainen krediitti edustaa käsittelytehoa. Videoklipin käsittely maksaa 30 krediittiä.', q2: 'Miten päivittäinen krediittien nollaus toimii?', a2: 'Krediitit nollataan suunnitelmasi päivittäiseen rajaan joka päivä klo 00:00 UTC. Käyttämättömät krediitit eivät siirry.', q3: 'Voinko päivittää tai alentaa suunnitelmaani?', a3: 'Kyllä, voit vaihtaa suunnitelmaa milloin tahansa. Muutokset astuvat voimaan heti.', q4: 'Mitä videolähteitä tuetaan?', a4: 'Tuemme YouTubea, Bilibiliä ja suoria videotiedostojen latauksia (MP4, MOV, AVI).', q5: 'Mitä maksutapoja tuetaan?', a5: 'Alipay Kiinan käyttäjille, Creem (Visa, Mastercard, Apple Pay, Google Pay) kansainvälisille käyttäjille.' },
  mostPopular: 'Suosituin',
  free: { title: 'Ilmainen', price: '$0', period: '/kuukausi', desc: 'Täydellinen kokeiluun', feature1: '100 luottokappaletta päivittäin', feature2: 'Perusvideoleikkaus', feature3: '720p vientikualiteetti', feature4: 'Vesileima mukana', cta: 'Aloita' },
  starter: { title: 'Aloittelija', price: '$9.9', period: '/kuukausi', desc: 'Sisällöntuottajille', feature1: '500 luottokappaletta päivittäin', feature2: 'Ensisijainen käsittely', feature3: '1080p vientikualiteetti', feature4: 'Ei vesileimaa', feature5: 'Sähköpostituki', cta: 'Tilaa Nyt' },
  pro: { title: 'Pro', price: '$19.9', period: '/kuukausi', desc: 'Ammattilaisille ja tiimeille', feature1: 'Rajoittamat luottokappaleet', feature2: 'Nopein käsittely', feature3: '4K vientikualiteetti', feature4: 'Ei vesileimaa', feature5: 'API-pääsy', feature6: 'Ensisijainen tuki', cta: 'Tilaa Nyt' },
  },
  downloadPage: {
  title: 'Lataa Clipop Agent', subtitle: 'Työpöytäsovellus vakaaseen YouTube/Bilibili videokäsittelyyn', badge: 'Työpöytäsovellus', macTitle: 'macOS', macDesc: 'Apple Silicon (M1/M2/M3/M4) Mac-tietokoneille', downloadButton: 'Lataa macOS:lle', version: 'Versio', fileSize: 'Tiedostokoko', requirements: 'macOS 12.0 tai uudempi', installing: 'Asennusopas', step1: 'Klikkaa latauspainiketta tallentaaksesi .dmg-tiedoston', step2: 'Kaksoisklikkaa ladattua .dmg-tiedostoa', step3: 'Vedä Clipop Agent Sovellukset-kansioon', step4: 'Avaa Clipop Agent Sovellukset-kansiosta', notAvailable: 'Latausta valmistellaan, tarkista myöhemmin uudelleen', backToHome: 'Takaisin Etusivulle', whyDesktopTitle: 'Miksi Käyttää Työpöytäsovellusta?', features: { stable: { title: 'Vakaa Käsittely', desc: 'Käsittele videoita paikallisesti maksimaalisella vakaudella' }, fast: { title: 'Nopea Lataus', desc: 'Lataa videoita suoraan ilman selaimen rajoituksia' }, local: { title: 'Paikallinen Käsittely', desc: 'Käsittele videoita Macillasi yksityisyyden ja nopeuden vuoksi' } },
  },
  login: {
  title: 'Kirjaudu sisään', description: 'Pääsy tilillesi', emailLabel: 'Sähköposti', emailPlaceholder: 'you@example.com', passwordLabel: 'Salasana', passwordPlaceholder: '••••••••', submitButton: 'Kirjaudu sisään', orContinueWith: 'Tai jatka', googleButton: 'Jatka Google\'lla', dontHaveAccount: 'Ei tiliä?', signUp: 'Rekisteröidy',
  successTitle: 'Kirjautuminen Onnistui!', successMessage: 'Olet kirjautunut sisään onnistuneesti nimellä', successDesktopHint: 'Klikkaa alla olevaa painiketta palataksesi työpöytäsovellukseen.', returnToDesktop: 'Palaa Clipop Agentiin', desktopNotOpened: 'Jos työpöytäsovellus ei avaudu automaattisesti, varmista että Clipop Agent on käynnissä.',
  },
  register: {
  title: 'Luo Tili', description: 'Aloita Clipop AI:n kanssa', nameLabel: 'Koko Nimi', namePlaceholder: 'John Doe', emailLabel: 'Sähköposti', emailPlaceholder: 'you@example.com', passwordLabel: 'Salasana', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Vahvista Salasana', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Jatka', sendingCode: 'Lähetetään...', codeLabel: 'Vahvistuskoodi', codePlaceholder: 'Syötä 6-numeroinen koodi', verifyButton: 'Luo Tili', codeNotReceived: 'Etkö saanut koodia?', resendButton: 'Lähetä Uudelleen', resendIn: 'Lähetä uudelleen', backButton: 'Takaisin', googleButton: 'Jatka Google\'lla', alreadyHaveAccount: 'Onko sinulla jo tili?', signIn: 'Kirjaudu sisään',
  errorNameRequired: 'Anna nimesi', errorEmailRequired: 'Anna sähköpostiosoitteesi', errorPasswordLength: 'Salasanan on oltava vähintään 6 merkkiä', errorPasswordMismatch: 'Salasanat eivät täsmää', errorEmailExists: 'Tämä sähköpostiosoite on jo rekisteröity. Kirjaudu sisään.', errorSendCode: 'Koodin lähetys epäonnistui', errorNetwork: 'Verkkovirhe. Yritä uudelleen.', errorCodeLength: 'Anna 6-numeroinen koodi',
  successTitle: 'Tili Luotu!', successMessage: 'Tilisi on luotu onnistuneesti nimellä', successDesktopHint: 'Klikkaa alla olevaa painiketta palataksesi työpöytäsovellukseen.', returnToDesktop: 'Palaa Clipop Agentiin', desktopNotOpened: 'Jos työpöytäsovellus ei avaudu automaattisesti, varmista että Clipop Agent on käynnissä.',
  },
  dashboard: { title: 'Kojelauta', credits: 'Saatavilla olevat Luottokappaleet', creditsReset: 'Nollataan päivittäin klo 00:00 UTC', history: 'Käsittelyhistoria', noVideos: 'Ei vielä käsiteltyjä videoita', startProcessing: 'Aloita Videoiden Käsittely',
  untitled: 'Nimetön', clip: 'Klippi', clipsCount: 'kohokohtaa', clipsHint: 'Klikkaa mitä tahansa klippiä toistaaksesi',
  desktopLoginDetected: 'Työpöytäsovelluksen Kirjautuminen Havaittu', desktopLoginHint: 'Klikkaa alla olevaa painiketta palataksesi Clipop Agentiin', returnToDesktop: 'Palaa Clipop Agentiin',
  welcomeBack: 'Tervetuloa takaisin',
  videosProcessed: 'Käsitellyt Videot', videosProcessedDesc: 'Käsitellyt videot yhteensä', clipsGenerated: 'Luodut Klipit', clipsGeneratedDesc: 'Kohokohdaklipit yhteensä',
  currentPlan: 'Nykyinen Suunnitelma', upgradePlan: 'Päivitä Suunnitelma',
  processNewVideo: 'Käsittele Uusi Video', feedback: 'Palaute',
  historyHint: 'Klikkaa valmiita tietueita laajentaaksesi ja nähdäksesi kohokohdaklipit',
  processNewVideoDesc: 'Mene etusivulle käsitelläksesi uuden pitkän videon', goToProcessor: 'Mene Videoprosessoriin',
  userFeedback: 'Käyttäjäpalaute', feedbackDesc: 'Kerro meille ominaisuuksista joita haluat parantaa tai ongelmista joita olet kohdannut',
  feedbackPlaceholder: 'Anna palautettasi (ehdotukset, virheet, ominaisuuspyynnöt jne.)', feedbackSubmitted: 'Lähetetty, kiitos palautteestasi!',
  submitFeedback: 'Lähetä Palaute', feedbackFailed: 'Palautteen lähetys epäonnistui',
  statusPending: 'Odottaa', statusProcessing: 'Käsitellään', statusCompleted: '✓ Valmis', statusFailed: 'Epäonnistui',
  },
  admin: { title: 'Hallintapaneeli', blog: 'Blogin Hallinta', blogCreate: 'Luo Julkaisu', blogTitle: 'Otsikko', blogCategory: 'Kategoria', blogContent: 'Sisältö', blogPublish: 'Julkaise', blogSave: 'Tallenna Luonnos', blogPublished: 'Julkaistu', blogDraft: 'Luonnos' },
  blog: { title: 'Blogi', readMore: 'Lue Lisää', noPosts: 'Ei vielä julkaisuja', subtitle: 'Uusimmat uutiset, vinkit ja päivitykset Clipop AI:lta', views: 'katselukertaa' },
  common: { loading: 'Ladataan...', error: 'Virhe', success: 'Onnistui', cancel: 'Peruuta', save: 'Tallenna', delete: 'Poista', edit: 'Muokkaa', search: 'Etsi', ready: 'Valmis', failed: 'Epäonnistui', saving: 'Tallentaa...', score: 'Pisteet', user: 'Käyttäjä' },
};

export default translations;
