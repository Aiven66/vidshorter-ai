import { commonTranslations } from '../common';

const translations = {
  ...commonTranslations,
  nav: {
  home: 'Strona główna', blog: 'Blog', pricing: 'Cennik', login: 'Zaloguj się', register: 'Zarejestruj się', dashboard: 'Panel', admin: 'Panel administracyjny', logout: 'Wyloguj się', credits: 'Kredyty', download: 'Pobierz Aplikację', light: 'Jasny', dark: 'Ciemny',
  },
  common: {
  error: 'Błąd', ready: 'Gotowe', failed: 'Niepowodzenie', saving: 'Zapisywanie...', score: 'Wynik', user: 'Użytkownik',
  loading: 'Ładowanie...', success: 'Sukces', cancel: 'Anuluj', save: 'Zapisz', delete: 'Usuń', edit: 'Edytuj', search: 'Szukaj',
  },
  footer: {
  desc: 'Przekształć swoje długie filmy w angażujące krótkie klipy dzięki analizie i edycji napędzanej przez AI.',
  quickLinks: 'Szybkie Linki', legal: 'Prawne', privacy: 'Polityka Prywatności', terms: 'Warunki Usług', contact: 'Kontakt', rights: 'Wszelkie prawa zastrzeżone.',
  },
  home: {
  hero: {
  badge: 'Przetwarzanie Wideo z AI',
  title: 'Przekształć Długie Filmy W Viralne Shorts',
  subtitle: 'Kadrowanie wideo z AI, który automatycznie wyodrębnia najlepsze chwile z Twojego długiego materiału',
  cta: 'Zacznij Kadrować Za Darmo',
  secondary: 'Obejrzyj Demo',
  },
  features: {
  title: 'Potężne Kadrowanie Wideo z AI',
  auto: { title: 'Automatyczne Wykrywanie Najważniejszych Chwil', desc: 'AI analizuje Twoje wideo i automatycznie identyfikuje najciekawsze chwile' },
  multi: { title: 'Obsługa Wielu Platform', desc: 'Importuj z YouTube, Bilibili lub wgraj własne pliki wideo' },
  quick: { title: 'Szybki Eksport', desc: 'Pobieraj swoje klipy w wielu formatach, gotowe do dowolnej platformy społecznościowej' },
  },
  howItWorks: {
  title: 'Jak To Działa',
  step1: { title: 'Wprowadź Wideo', desc: 'Wklej URL lub wgraj wideo' },
  step2: { title: 'Analiza AI', desc: 'AI automatycznie wykrywa najważniejsze chwile' },
  step3: { title: 'Generuj Klipy', desc: 'Krótkie filmy są tworzone' },
  step4: { title: 'Pobierz', desc: 'Eksportuj i udostępniaj wszędzie' },
  },
  },
  video: {
  input: { title: 'Wejściowe Wideo', url: 'URL Wideo (YouTube/Bilibili)', upload: 'Wgraj Wideo', placeholder: 'Wklej link do wideo YouTube lub Bilibili...' },
  process: 'Przetwórz Wideo', processing: 'Przetwarzanie...', analyze: 'Analizuj', results: 'Wygenerowane Shorts', highlights: 'Analiza Najważniejszych Chwil', download: 'Pobierz', preview: 'Podgląd',
  creditsAvailable: 'kredytów dostępnych', signInToStart: 'aby rozpocząć przetwarzanie wideo', pasteUrlPlaceholder: 'Wklej URL wideo (MP4, MOV, AVI...)', useLocalAgent: 'Użyj lokalnego Agenta Mac (zalecane dla stabilnego YouTube)', uploadLocal: 'Wgraj lokalny plik wideo (zalecane gdy link YouTube jest zablokowany)', selectedFile: 'Wybrano', downloadMacApp: 'Pobierz Aplikację Mac', viewPricing: 'Zobacz Cennik', clipsReady: 'klipów gotowych', playableClips: 'odtwarzalnych klipów', failedClips: 'niepowodzenia', aiFinished: 'AI zakończył wybieranie najsilniejszych momentów z Twojego źródłowego wideo.', openToPreview: 'Otwórz dowolny gotowy klip, aby zobaczyć podgląd lub pobierz MP4 bezpośrednio.', clipsBeingGenerated: 'Klipy są generowane:', videoPreviewNotAvailable: 'Podgląd wideo niedostępny', clipMayStillProcessing: 'Klip może być nadal przetwarzany lub jego generowanie nie powiodło się.', insufficientCredits: 'Niewystarczające kredyty. Potrzebujesz co najmniej 30 kredytów.', enterVideoUrl: 'Proszę wprowadzić URL wideo lub wgrać lokalny plik wideo.', enterValidUrl: 'Proszę wprowadzić prawidłowy publiczny URL wideo http(s).',
  stage: {
  init: 'Inicjalizacja...', extractFrames: 'Ekstrakcja klatek wideo...', framesExtracted: 'Klatki wyodrębnione pomyślnie', framesUnavailable: 'Kontynuacja analizy', aiAnalysis: 'AI analizuje zawartość wideo...', analysisComplete: 'Analiza zakończona', generatingClip: 'Tworzenie klipu z najważniejszymi chwilami...', clipReady: 'Klip z najważniejszymi chwilami gotowy', saving: 'Zapisywanie wyników...', complete: 'Przetwarzanie zakończone!', error: 'Wystąpił błąd',
  },
  },
  pricing: {
  title: 'Proste, Przezroczyste Ceny', subtitle: 'Wybierz plan pasujący do Twoich potrzeb',
  paymentNote: 'Alipay dla Chin · Creem dla międzynarodowych (Visa / Mastercard / Apple Pay / Google Pay)', secureNote: 'Wszystkie płatności zabezpieczone szyfrowaniem TLS 256-bit', faqTitle: 'Często Zadawane Pytania', faq: { q1: 'Czym jest kredyt?', a1: 'Każdy kredyt reprezentuje moc przetwarzania. Przetworzenie klipu wideo kosztuje 30 kredytów.', q2: 'Jak działa codzienny reset kredytów?', a2: 'Kredyty resetują się do dziennego limitu Twojego planu codziennie o 00:00 UTC. Niewykorzystane kredyty nie przechodzą na kolejny dzień.', q3: 'Czy mogę zmienić plan?', a3: 'Tak, możesz zmienić plan w dowolnym momencie. Zmiany wchodzą w życie natychmiast.', q4: 'Jakie źródła wideo są obsługiwane?', a4: 'Obsługujemy YouTube, Bilibili oraz bezpośrednie przesyłanie plików wideo (MP4, MOV, AVI).', q5: 'Jakie metody płatności są obsługiwane?', a5: 'Alipay dla użytkowników z Chin, Creem (Visa, Mastercard, Apple Pay, Google Pay) dla użytkowników międzynarodowych.' },
  mostPopular: 'Najpopularniejszy',
  free: { title: 'Darmowy', price: '$0', period: '/miesiąc', desc: 'Idealny do wypróbowania', feature1: '100 kredytów dziennie', feature2: 'Podstawowe kadrowanie wideo', feature3: 'Jakość eksportu 720p', feature4: 'Znak wodny zawarty', cta: 'Zacznij' },
  starter: { title: 'Startowy', price: '$9.9', period: '/miesiąc', desc: 'Dla twórców treści', feature1: '500 kredytów dziennie', feature2: 'Priorytetowe przetwarzanie', feature3: 'Jakość eksportu 1080p', feature4: 'Brak znaku wodnego', feature5: 'Wsparcie e-mailowe', cta: 'Subskrybuj Teraz' },
  pro: { title: 'Profesjonalny', price: '$19.9', period: '/miesiąc', desc: 'Dla profesjonalistów i zespołów', feature1: 'Nieograniczone kredyty', feature2: 'Najszybsze przetwarzanie', feature3: 'Jakość eksportu 4K', feature4: 'Brak znaku wodnego', feature5: 'Dostęp do API', feature6: 'Priorytetowe wsparcie', cta: 'Subskrybuj Teraz' },
  },
  downloadPage: {
  title: 'Pobierz Clipop Agent', subtitle: 'Aplikacja desktopowa do stabilnego przetwarzania wideo YouTube/Bilibili', badge: 'Aplikacja Desktopowa', macTitle: 'macOS', macDesc: 'Dla Mac z Apple Silicon (M1/M2/M3/M4)', downloadButton: 'Pobierz dla macOS', version: 'Wersja', fileSize: 'Rozmiar pliku', requirements: 'macOS 12.0 lub nowszy', installing: 'Instrukcja Instalacji', step1: 'Kliknij przycisk pobierania, aby zapisać plik .dmg', step2: 'Kliknij dwukrotnie pobrany plik .dmg', step3: 'Przeciągnij Clipop Agent do folderu Aplikacje', step4: 'Otwórz Clipop Agent z Aplikacji', notAvailable: 'Pobieranie jest przygotowywane, proszę sprawdzić później', backToHome: 'Powrót do Strony Głównej', whyDesktopTitle: 'Dlaczego Warto Używać Aplikacji Desktopowej?', features: { stable: { title: 'Stabilne Przetwarzanie', desc: 'Przetwarzaj wideo lokalnie z maksymalną stabilnością' }, fast: { title: 'Szybkie Pobieranie', desc: 'Pobieraj wideo bezpośrednio bez ograniczeń przeglądarki' }, local: { title: 'Lokalne Przetwarzanie', desc: 'Przetwarzaj wideo na swoim Macu dla prywatności i szybkości' } },
  },
  login: {
  title: 'Logowanie', description: 'Dostęp do Twojego konta', emailLabel: 'E-mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Hasło', passwordPlaceholder: '••••••••', submitButton: 'Zaloguj się', orContinueWith: 'Lub kontynuuj z', googleButton: 'Kontynuuj z Google', dontHaveAccount: 'Nie masz konta?', signUp: 'Zarejestruj się',
  successTitle: 'Logowanie Udane!', successMessage: 'Pomyślnie zalogowano jako', successDesktopHint: 'Kliknij przycisk poniżej, aby wrócić do aplikacji desktopowej.', returnToDesktop: 'Wróć do Clipop Agent', desktopNotOpened: 'Jeśli aplikacja desktopowa nie otworzy się automatycznie, upewnij się, że Clipop Agent jest uruchomiony.',
  },
  register: {
  title: 'Utwórz Konto', description: 'Zacznij z Clipop AI', nameLabel: 'Imię i Nazwisko', namePlaceholder: 'John Doe', emailLabel: 'E-mail', emailPlaceholder: 'you@example.com', passwordLabel: 'Hasło', passwordPlaceholder: '••••••••', confirmPasswordLabel: 'Potwierdź Hasło', confirmPasswordPlaceholder: '••••••••', sendCodeButton: 'Kontynuuj', sendingCode: 'Wysyłanie...', codeLabel: 'Kod Weryfikacyjny', codePlaceholder: 'Wprowadź 6-cyfrowy kod', verifyButton: 'Utwórz Konto', codeNotReceived: 'Nie otrzymałeś kodu?', resendButton: 'Wyślij Ponownie', resendIn: 'Wyślij ponownie w ciągu', backButton: 'Wstecz', googleButton: 'Kontynuuj z Google', alreadyHaveAccount: 'Masz już konto?', signIn: 'Zaloguj się',
  errorNameRequired: 'Proszę podać swoje imię', errorEmailRequired: 'Proszę podać swój e-mail', errorPasswordLength: 'Hasło musi mieć co najmniej 6 znaków', errorPasswordMismatch: 'Hasła nie pasują do siebie', errorEmailExists: 'Ten e-mail jest już zarejestrowany. Proszę się zalogować.', errorSendCode: 'Nie udało się wysłać kodu', errorNetwork: 'Błąd sieci. Proszę spróbować ponownie.', errorCodeLength: 'Proszę wprowadzić 6-cyfrowy kod',
  successTitle: 'Konto Utworzone!', successMessage: 'Twoje konto zostało pomyślnie utworzone jako', successDesktopHint: 'Kliknij przycisk poniżej, aby wrócić do aplikacji desktopowej.', returnToDesktop: 'Wróć do Clipop Agent', desktopNotOpened: 'Jeśli aplikacja desktopowa nie otworzy się automatycznie, upewnij się, że Clipop Agent jest uruchomiony.',
  },
  dashboard: { title: 'Panel', credits: 'Dostępne Kredyty', creditsReset: 'Reset codziennie o 00:00 UTC', history: 'Historia Przetwarzania', noVideos: 'Brak przetworzonych filmów', startProcessing: 'Rozpocznij Przetwarzanie Wideo',
  untitled: 'Bez tytułu', clip: 'Klip', clipsCount: 'najważniejsze chwile', clipsHint: 'Kliknij dowolny klip, aby odtworzyć',
  desktopLoginDetected: 'Wykryto Logowanie z Aplikacji Desktopowej', desktopLoginHint: 'Kliknij przycisk poniżej, aby wrócić do Clipop Agent', returnToDesktop: 'Wróć do Clipop Agent',
  welcomeBack: 'Witaj ponownie',
  videosProcessed: 'Przetworzone Filmy', videosProcessedDesc: 'Łącznie przetworzonych filmów', clipsGenerated: 'Wygenerowane Klipy', clipsGeneratedDesc: 'Łącznie klipów z najważniejszymi chwilami',
  currentPlan: 'Obecny Plan', upgradePlan: 'Ulepsz Plan',
  processNewVideo: 'Przetwórz Nowe Wideo', feedback: 'Opinia',
  historyHint: 'Kliknij ukończone rekordy, aby rozwinąć i zobaczyć klipy z najważniejszymi chwilami',
  processNewVideoDesc: 'Przejdź do strony głównej, aby przetworzyć nowe długie wideo', goToProcessor: 'Przejdź do Procesora Wideo',
  userFeedback: 'Opinia Użytkownika', feedbackDesc: 'Powiedz nam o funkcjach, które chcesz ulepszyć lub problemach, które napotkałeś',
  feedbackPlaceholder: 'Wpisz swoją opinię (sugestie, błędy, prośby o funkcje itp.)', feedbackSubmitted: 'Wysłano, dziękujemy za opinię!',
  submitFeedback: 'Wyślij Opinię', feedbackFailed: 'Nie udało się wysłać opinii',
  statusPending: 'Oczekujące', statusProcessing: 'Przetwarzanie', statusCompleted: '✓ Ukończone', statusFailed: 'Niepowodzenie',
  },
  admin: { title: 'Panel administracyjny', blog: 'Zarządzanie Blogiem', blogCreate: 'Utwórz Post', blogTitle: 'Tytuł', blogCategory: 'Kategoria', blogContent: 'Treść', blogPublish: 'Opublikuj', blogSave: 'Zapisz Wersję Roboczą', blogPublished: 'Opublikowano', blogDraft: 'Wersja Robocza' },
  blog: { title: 'Blog', readMore: 'Czytaj Dalej', noPosts: 'Nie ma jeszcze postów', subtitle: 'Najnowsze wiadomości, porady i aktualizacje od Clipop AI', views: 'wyświetleń' },
  common: { loading: 'Ładowanie...', error: 'Wystąpił błąd', success: 'Sukces', cancel: 'Anuluj', save: 'Zapisz', delete: 'Usuń', edit: 'Edytuj', search: 'Szukaj' },
};

export default translations;
