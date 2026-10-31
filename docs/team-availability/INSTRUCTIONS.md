# Instrukcje dla Claude Code: Team Availability dla Plane CE 1.4.3 (wersja 2)

> **Status dokumentu:** obowiązujący. Wersja z 30.10.2026.
>
> **Ten plik zastępuje w całości** wcześniejszą instrukcję
> `CLAUDE_TEAM_AVAILABILITY_PLANE_1.4.3.md` (wersja 1). Jeżeli
> znajdziesz wersję 1 w repozytorium, w historii rozmowy lub w innym
> pliku, **nie stosuj jej**. Część jej założeń została świadomie
> odrzucona (patrz sekcja 3). W razie sprzeczności między tym plikiem
> a jakimkolwiek innym dokumentem obowiązuje ten plik. Jeśli
> sprzeczność dotyczy faktów w kodzie, obowiązuje kod tagu `v1.4.3`.
> Wtedy zatrzymaj się i zgłoś rozbieżność użytkownikowi.
>
> **Środowisko docelowe:** Plane Community Edition `v1.4.3`
> (commit `37a15d99231042b3ff5a4401fed479fdbec9effe`), uruchomione
> przez Docker Compose z oficjalnego `setup.sh`, serwer `linux/amd64`.

------------------------------------------------------------------------

## 1. Cel

Dodać do Plane moduł **Team Availability** do planowania dostępności
zespołu. Moduł składa się z:

- trzech widoków: **Team Timeline**, **Team Calendar**, **Personal**;
- pełnej edycji wpisów (CRUD);
- strony konfiguracji słowników (statusy, lokalizacje) w ustawieniach
  workspace'u.

Moduł działa wewnątrz interfejsu Plane, nie jako osobna aplikacja ani
iframe. Ma wyglądać jak natywna część Plane.

Wpisy dostępności to **nowy, osobny model danych** w backendzie Plane,
na poziomie **workspace'u**. Wpisy **nie są** work itemami.

## 2. Sposób pracy

Działaj jak doświadczony inżynier full-stack, który bezpiecznie
rozszerza istniejący produkt.

1. **Nie zgaduj.** Nazwy komponentów, ścieżki, klient API, uprawnienia,
   formaty odpowiedzi i komendy budowania weryfikuj w kodzie tagu
   `v1.4.3`. Fakty w sekcji 4 zostały już raz zweryfikowane. Przed
   oparciem się na nich potwierdź je ponownie w kodzie.
2. **Nie korzystaj z aktualnej dokumentacji Plane ani gałęzi
   `preview`** jako źródła prawdy. Odpowiadają innej wersji.
3. **Pracuj etapami** (sekcja 14). Po każdym etapie raportuj:
   - co zrobiono,
   - jakie pliki zmieniono,
   - jakie testy uruchomiono i z jakim wynikiem,
   - co wymaga decyzji użytkownika,
   - jakie są kolejne kroki.

   Na kolejny etap przechodź dopiero po akceptacji użytkownika.
4. **Zmiany minimalne i izolowane.** Logika modułu żyje we własnych
   katalogach. Pliki upstream zmieniaj tylko w miejscach wymienionych
   w sekcji 9. Każdą taką zmianę oznacz komentarzem
   `TEAM-AVAILABILITY` i opisz w `docs/team-availability/INTEGRATION.md`.
5. **Nie refaktoruj niezwiązanego kodu Plane.** Nie aktualizuj jego
   zależności ani wersji usług.
6. **Konwencje repo:** stosuj się do `AGENTS.md` w roocie repozytorium
   (oxfmt, OxLint, strict TypeScript, nazewnictwo). Nowe pliki mają
   nagłówek SPDX w tym samym formacie co reszta repo (`COPYRIGHT_CHECK.md`).
7. **Produkcja jest nietykalna.** Nie łącz się z serwerem produkcyjnym
   i nie wykonuj na nim żadnych poleceń. Instrukcje wdrożenia
   przygotowujesz jako tekst dla użytkownika (sekcja 12).
8. **Nowe zależności npm lub pip** tylko za wyraźną zgodą użytkownika.
   Komercyjne biblioteki (np. FullCalendar Scheduler) są wykluczone.

## 3. Założenia wersji 1, które przestały obowiązywać

Poniższe punkty wersji 1 są **nieaktualne**. Nie wracaj do nich, nawet
jeśli wydają się prostsze.

| Wersja 1 (nieaktualne) | Obowiązuje teraz |
| --- | --- |
| Wpis dostępności = Work Item z etykietą `Team Availability` | Nowy model `AvailabilityEntry` w nowej aplikacji Django `plane.availability` |
| Dedykowany projekt jako kontener wpisów | Wpisy należą do workspace'u; widok w projekcie tylko filtruje do jego członków |
| Status i lokalizacja jako etykiety Plane | Słowniki `AvailabilityStatus` i `AvailabilityLocation`, konfigurowalne per workspace |
| Godziny i notatki w opisie work itemu | Kolumny `start_time`, `end_time`, `notes` |
| Zakaz zmian schematu bazy i backendu | Dozwolona nowa aplikacja Django z addytywną migracją (wyłącznie nowe tabele) |
| Zakaz migracji | Dokładnie jedna migracja `0001_initial` nowej aplikacji; zero zmian w istniejących tabelach |
| Zmieniany jest tylko obraz `web` | Własne obrazy `plane-frontend` i `plane-backend`; backend obsługuje usługi `api`, `worker`, `beat-worker`, `migrator` |
| Uprawnienia jak dla work itemów (Member edytuje wszystko) | Member zarządza tylko własnymi wpisami, Admin workspace'u wszystkimi; egzekwuje API |
| Obraz `local/plane-web:...`, `pull_policy: never` | Obrazy w GHCR (publiczny fork), budowane przez GitHub Actions dla `linux/amd64` |
| Kryterium „pobieraj tylko wpisy z etykietą” | Moduł nie czyta ani nie tworzy work itemów |
| Kryterium „nie usuwaj obcych etykiet” | Nie dotyczy |

Wersja 1 zawierała też zasady, które **nadal obowiązują**:
- brak iframe i drugiego runtime;
- brak komercyjnych zależności;
- poprawność dat jako priorytet;
- brak sekretów we frontendzie;
- brak bezpośrednich zapytań do bazy z frontendu;
- wdrożenie produkcyjne tylko po akceptacji.

Wszystkie są powtórzone w tym pliku.

## 4. Fakty zweryfikowane w kodzie v1.4.3

Ustalone podczas rekonesansu. Potwierdź je ponownie, zanim na nich
oprzesz implementację.

**Frontend (`apps/web`):**
- To React Router 7 w trybie SPA (`ssr: false`) z Vite, a nie Next.js.
  Pozostałe biblioteki: MobX, SWR, date-fns, Tailwind, react-hook-form
  i `@atlaskit/pragmatic-drag-and-drop`.
- Build produkcyjny tworzy statyczne pliki serwowane przez nginx
  z fallbackiem SPA (`try_files ... /index.html`).
- **Routing:** `app/routes.ts` scala `routes/core.ts` z pustym
  `routes/extended.ts` przez `mergeRoutes()` (`routes/helper.ts`).
  Scalanie odbywa się po pliku layoutu, a dzieci są łączone
  rekurencyjnie. Nowe trasy dodajemy więc w `extended.ts` pod tymi
  samymi layoutami co w `core.ts`, bez edycji `core.ts`.
- **Nawigacja projektu** jest w dwóch miejscach:
  - `core/components/navigation/use-navigation-items.ts` (tryb zakładek);
  - `core/components/workspace/sidebar/project-navigation.tsx` (tryb
    sidebar; ma nieużywany prop `additionalNavigationItems`).
  Pozycje są filtrowane po roli **w projekcie**.
- **Sidebar workspace'u:** `WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS`
  w `packages/constants/src/workspace.ts` oraz `sidebar-menu-items.tsx`,
  `sidebar-item.tsx` i `helper.tsx` w `core/components/workspace/sidebar/`.
  Pozycje obsługują osobiste preferencje użytkownika (włącz, wyłącz,
  kolejność).
- **Ustawienia workspace'u:** lista w
  `packages/constants/src/settings/workspace.ts`, trasy
  `:workspaceSlug/settings/...`.
- **Klient HTTP:** `core/services/api.service.ts` (`APIService`, axios,
  `withCredentials`, przy 401 przekierowanie). Sesja w cookie, bez
  tokenów.
- **Daty:** `getDate()` w `packages/utils/src/datetime.ts` parsuje
  `YYYY-MM-DD` bez przesunięcia strefy, ale zwraca lokalny `Date`.
- **Początek tygodnia:** ustawienie użytkownika `start_of_the_week`.
- **Tokeny kolorów etykiet** (jasne i ciemne):
  `--label-{kolor}-{bg,text,border,...}` w
  `packages/tailwind-config/variables.css`.
- **Wymiary Gantta:** `core/components/gantt-chart/constants.ts`
  (wiersz 44 px, nagłówek 48 px).
- **Natywny kalendarz** grupuje wpisy po `target_date`. Nie nadaje się
  dla tego modułu.
- `apps/web` nie ma frameworka testów jednostkowych.

**Backend (`apps/api`):**
- Django + DRF. Ścieżki: aplikacje w `INSTALLED_APPS`
  (`plane/settings/common.py`), URL-e w `plane/app/urls/__init__.py`
  pod prefiksem `api/`.
- **Uwierzytelnianie:** `BaseSessionAuthentication` z wyłączonym CSRF
  (`plane/authentication/session.py`).
- **Uprawnienia:** dekorator `allow_permission(allowed_roles, level=...)`
  w `plane/app/permissions/base.py`. Role: ADMIN = 20, MEMBER = 15,
  GUEST = 5. Poziom `"WORKSPACE"` sprawdza `WorkspaceMember`.
- **Modele bazowe:** `BaseModel` (UUID, audyt `created_by/updated_by`,
  soft delete `deleted_at`), `WorkspaceBaseModel`.
- **Twarde usuwanie:** zadanie `hard_delete` w
  `plane/bgtasks/deletion_task.py`. Usuwa na stałe rekordy wszystkich
  modeli z `deleted_at` starszym niż `HARD_DELETE_AFTER_DAYS` (60).
  Obejmie też nowe modele.
- **Paginacja:** `plane/utils/global_paginator.py` (`paginate`,
  maksymalnie 1000 na stronę).
- Konta botów mają `User.is_bot`.
- `Workspace.timezone` istnieje (domyślnie UTC).
- Usługa `migrator` uruchamia `python manage.py migrate`, czyli
  migracje wszystkich aplikacji.
- **Testy backendu:** `docker-compose-test.yml` w roocie repo
  (szczegóły w `AGENTS.md` i `apps/api/tests/RUNNING_TESTS.md`).

**Deployment:**
- **Obraz `web`:** `apps/web/Dockerfile.web`, kontekst = root repo,
  `turbo prune`, nginx.
- **Obraz backendu:** `apps/api/Dockerfile.api`.
- **`setup.sh` (`deployments/cli/community/install.sh`):**
  - opcja upgrade archiwizuje i nadpisuje `docker-compose.yaml` oraz
    `plane.env`;
  - start, stop i restart wywołują `docker compose -f
    docker-compose.yaml` **bez** plików override.
- W produkcyjnym compose obrazy mają na sztywno namespace `makeplane/`.

## 5. Architektura i model danych

### 5.1 Architektura

**Backend:** nowa aplikacja Django `plane.availability`
(`apps/api/plane/availability/`) z własnymi modelami, migracjami,
serializerami, widokami, uprawnieniami, URL-ami i testami.

**Frontend:** moduł w `apps/web/core/team-availability/`. Pliki tras
w `apps/web/app/...` są cienkie i tylko wywołują komponenty z modułu.
Dane pobiera SWR, a serwis HTTP dziedziczy po `APIService`. Moduł nie
dotyka globalnego store MobX ani `root.store.ts`. Odstępstwo od
konwencji MobX z `AGENTS.md` jest celowe, żeby zminimalizować zmiany
upstream.

### 5.2 Modele

Wszystkie modele dziedziczą po `BaseModel` Plane.

**`AvailabilityEntry`**: jeden wpis = jedna osoba = jeden ciągły,
inkluzywny zakres dni.

| Pole | Typ | Reguły |
| --- | --- | --- |
| `workspace` | FK → Workspace | wymagane |
| `member` | FK → User, `on_delete=CASCADE` | aktywny członek workspace'u, nie bot |
| `start_date` | DateField | data kalendarzowa |
| `end_date` | DateField | włącznie; constraint `end_date >= start_date`; maks. 366 dni długości |
| `status` | FK → AvailabilityStatus, `PROTECT` | wymagane, ten sam workspace, niezarchiwizowany przy zapisie |
| `location` | FK → AvailabilityLocation, `PROTECT`, null | ten sam workspace, niezarchiwizowana przy zapisie |
| `start_time`, `end_time` | TimeField, null | oba puste (cały dzień) albo oba ustawione i `end_time > start_time`; zmiany przez północ nieobsługiwane |
| `notes` | TextField | czysty tekst, nigdy HTML |

Indeksy: `(workspace, start_date, end_date)` i
`(workspace, member, start_date)`.

**`AvailabilityStatus`** i **`AvailabilityLocation`**: słowniki per
workspace.
- Pola: `name`, `sort_order`, `is_archived`. Status ma dodatkowo
  `color`.
- `color` to **nazwa koloru z palety etykiet Plane** (zbiór nazw
  odpowiadający tokenom `--label-{kolor}-*`), nie hex.
- Nazwa jest unikalna w workspace wśród rekordów z
  `deleted_at IS NULL` (warunkowy unique).

**Domyślne słowniki** backend tworzy przy pierwszym odczycie słowników
w danym workspace. Operacja jest idempotentna i odporna na równoległe
wywołania; nie ma migracji danych.
- Statusy: Available, Partially Available, Unavailable, Vacation,
  Sick Leave, On-call.
- Lokalizacje: Office, Remote, On-site, Business Trip.

### 5.3 Cykl życia danych

- **Usunięcie wpisu** to soft delete. Twarde usunięcie po 60 dniach
  wykonuje istniejące `hard_delete`.
- **Słowników nigdy nie usuwamy, tylko archiwizujemy.** API nie ma dla
  nich `DELETE`. Soft-deleted status z wpisami trafiłby na `PROTECT`
  i przerwał całe zadanie `hard_delete`, także dla tabel Plane.
- **Zarchiwizowane wartości** nadal wyświetlają się w istniejących
  wpisach, ale nie da się ich wybrać w nowych ani edytowanych.
- **Osoba nieaktywna lub usunięta z workspace'u:** wpisy zostają w
  bazie, a widoki pokazują tylko aktywnych członków.
- **Boty** są wykluczone z list osób i z walidacji pola `member`.

### 5.4 Migracja

Jedna migracja: `plane/availability/migrations/0001_initial.py`.
- Wyłącznie `CREATE TABLE`, constrainty i indeksy nowych tabel.
- Zależność od najnowszej migracji aplikacji `db` w v1.4.3 (sprawdź
  jej nazwę).
- Żadnych zmian w istniejących tabelach, żadnych migracji danych.

## 6. API

**Prefiks:** `/api/workspaces/<slug>/availability/`.
- Uwierzytelnianie sesją Plane.
- Uprawnienia: `allow_permission(..., level="WORKSPACE")` plus reguła
  obiektowa „własny wpis albo Admin”.
- Guest workspace'u nie ma dostępu do żadnego endpointu (403).

| Metoda i ścieżka | Opis | Dostęp |
| --- | --- | --- |
| `GET entries/?from=&to=` | Wpisy nachodzące na zakres (`start_date <= to` i `end_date >= from`); opcjonalne filtry `member_ids`, `status_ids`, `location_ids`, `project_id` | Admin, Member |
| `POST entries/` | Utworzenie | Member tylko dla siebie, Admin dla każdego |
| `PATCH entries/<id>/` | Edycja | Osoba, której dotyczy wpis (`member`), albo Admin |
| `DELETE entries/<id>/` | Soft delete | Osoba, której dotyczy wpis, albo Admin |
| `GET statuses/`, `GET locations/` | Słowniki; przy pierwszym wywołaniu tworzą domyślne | Admin, Member |
| `POST` i `PATCH` na `statuses/`, `locations/` | Dodanie, zmiana nazwy, koloru, kolejności, archiwizacja | Admin |

**Reguły:**
- `from` i `to` są wymagane, w formacie `YYYY-MM-DD`; zakres
  maksymalnie 400 dni.
- **Paginacja** kursorem przez `global_paginator.paginate`. Frontend
  pobiera wszystkie strony.
- `project_id` zawęża wynik do aktywnych członków projektu. Pytający
  musi być aktywnym członkiem tego projektu (dotyczy też Admina
  workspace'u, jak w reszcie Plane), inaczej 403.
- **Member** nie może utworzyć wpisu dla innej osoby ani zmienić
  `member` istniejącego wpisu.
- **Nakładające się wpisy** tej samej osoby są dozwolone; API ich nie
  blokuje.
- **Format dat i godzin:** daty jako `YYYY-MM-DD`, godziny jako `HH:MM`.
- **Format błędów:** standard DRF (400 z błędami pól, 403, 404).
- Brak powiadomień, webhooków i wpisów do aktywności Plane.
- Tylko ORM Django. Żadnego surowego SQL.

## 7. Frontend

### 7.1 Trasy (w `app/routes/extended.ts`)

- `/:workspaceSlug/projects/:projectId/team-availability`: widok
  w kontekście projektu, osoby ograniczone do członków projektu.
- `/:workspaceSlug/team-availability`: widok całego workspace'u.
- `/:workspaceSlug/settings/availability`: konfiguracja słowników,
  tylko dla Admina workspace'u.

Widok, zakres i filtry są trzymane w parametrach URL.

### 7.2 Nawigacja

- Pozycja w nawigacji projektu, w obu trybach (zakładki i sidebar),
  widoczna dla ról Admin i Member **w projekcie**.
- Pozycja w sidebarze workspace'u i w ustawieniach workspace'u,
  ukrywana według roli **w workspace**.
- Sprawdź, czy pozycja w sidebarze workspace'u wymaga domyślnej
  preferencji użytkownika, i obsłuż to minimalną zmianą.

### 7.3 Ekran główny

**Nagłówek** z breadcrumbami jak w Cycles i Views. Zawiera:
- przełącznik widoku: Timeline / Calendar / Personal;
- zakres: tydzień / 2 tygodnie / miesiąc, **domyślnie 2 tygodnie**;
- przyciski Previous / Today / Next;
- filtry: osoby, status, lokalizacja;
- przycisk „Add availability”;
- przełącznik gęstości (kompaktowa / wygodna), zapamiętany w
  `localStorage` i owinięty w try/catch.

### 7.4 Team Timeline

- **Układ:** siatka CSS Grid, wiersz na osobę, kolumna na dzień.
  Kolumna osób i nagłówek dat są sticky; nagłówek ma też pasek
  tygodni (numery ISO 8601) lub miesięcy.
- **Paski:** przycinane do widocznego okresu. Gdy wpis wychodzi poza
  okres, koniec jest ścięty i ma strzałkę.
- **Konflikty:** nakładające się wpisy tej samej osoby trafiają do
  pod-wierszy, a przy nazwisku pojawia się ikona ostrzeżenia.
  Sąsiednich wpisów nie łączymy.
- **Interakcje:**
  - kliknięcie paska otwiera edycję;
  - kliknięcie pustej komórki otwiera formularz z tą osobą i tą datą
    (po najechaniu widać „+”);
  - kliknięcie nazwiska prowadzi do widoku Personal.
- **Wyróżnienia:** weekendy wyszarzone, dzisiejszy dzień wyróżniony.
  Pod osią jest legenda.

### 7.5 Team Calendar

- Widok miesiąca i tygodnia; każdy tydzień to wiersz siatki.
- Wpis jest dzielony na odcinki per tydzień i układany w pasy (lanes).
  Jeden pasek w obrębie tygodnia, zawijany w kolejnym.
- Przy nadmiarze pasów: „+N more”.
- Kliknięcie wpisu otwiera edycję, kliknięcie dnia otwiera tworzenie.
- **Nie używaj** natywnego kalendarza Plane.

### 7.6 Personal

- Domyślnie zalogowany użytkownik; możliwość wyboru innej osoby.
- Kalendarz zawężony do wybranej osoby i lista jej wpisów posortowana
  po dacie.

### 7.7 Formularz (modal)

**Pola:**
- osoba (Member widzi ją zablokowaną na sobie);
- data od, data do;
- status, lokalizacja (bez wartości zarchiwizowanych);
- godzina od i do (opcjonalne; obok pokazana strefa workspace'u);
- notatka.

**Zachowanie:**
- Walidacja po stronie klienta odpowiada regułom z sekcji 6.
- Przycisk zapisu jest blokowany na czas wysyłki.
- Przy błędzie modal zostaje otwarty i pokazuje komunikat; 403 ma
  osobny, czytelny tekst.
- Usunięcie wymaga potwierdzenia w osobnym modalu.

### 7.8 Konfiguracja słowników

Strona w ustawieniach workspace'u z dwiema listami: statusy
i lokalizacje. Obsługuje dodawanie, zmianę nazwy, zmianę koloru
(tylko z palety etykiet Plane), kolejność i archiwizację. Usuwania
nie ma.

### 7.9 Wygląd

- **Wyłącznie istniejące tokeny i komponenty** `@plane/propel`
  i `@plane/ui` (Button, Tabs, Avatar, Tooltip, Combobox, Dialog,
  date picker). Własny CSS tylko dla siatki osi czasu.
- **Pasek wpisu** wygląda jak etykieta Plane: tło i tekst z
  `--label-{kolor}-*`, ikona lokalizacji, nazwa statusu, więc
  informacja nie zależy tylko od koloru. Godziny i notatka są w
  tooltipie; wpis z godzinami ma ikonę zegara.
- **Tryb ciemny** musi działać bez dodatkowych reguł.
- **Klawiatura:** paski i komórki są przyciskami z `aria-label`
  (osoba, status, zakres dat) i dają się obsłużyć klawiaturą.
- **Węższe ekrany:** siatka przewija się poziomo, kolumna osób zostaje
  sticky. Widok mobilny nie jest celem.
- **Teksty interfejsu** po angielsku, zdefiniowane w module. Bez zmian
  w `@plane/i18n`.

### 7.10 Odświeżanie i błędy

- Po zapisie SWR przeładowuje bieżący zakres. Bez optimistic UI.
- Bez realtime: nie używaj usługi `live`.
- Obsłuż błędy sieci oraz odpowiedzi 401, 403, 404 i 400.
- Zapobiegaj podwójnemu wysłaniu formularza.

### 7.11 Drag-and-drop

Poza MVP (faza 2), na `@atlaskit/pragmatic-drag-and-drop`. W MVP
wszystkie zmiany idą przez formularz.

## 8. Daty i strefy czasowe (krytyczne)

- **Daty kalendarzowe w logice widoków to liczby całkowite** (indeks
  dnia od 1970-01-01), wyliczane z tekstu `YYYY-MM-DD`. Nie obiekty
  `Date`.
- **Zakazane:** `new Date("YYYY-MM-DD")`, `toISOString()` i liczenie
  dni z milisekund.
- **Jeden helper w module:** `parseDay`, `formatDay`, `addDays`,
  `diffDays`, `weekStart`, `daysInMonth`, `isoWeek`, `overlaps`,
  `clip`.
- **Zakres inkluzywny:** dzień należy do wpisu, gdy
  `start <= day <= end`; długość wpisu to `end − start + 1`.
- **Przycinanie:** `visibleStart = max(start, rangeStart)`,
  `visibleEnd = min(end, rangeEnd)`, plus flagi `cutLeft` i `cutRight`.
- **„Dzisiaj”** to data lokalna przeglądarki.
- **Początek tygodnia** z `start_of_the_week`, domyślnie poniedziałek.
  Numery tygodni zawsze według ISO 8601.
- **Godziny** to czas ścienny w strefie `Workspace.timezone`, bez
  przeliczania. Strefa jest pokazywana obok godzin.
- **Backend:** `DateField` i `TimeField`, bez stref.

## 9. Dozwolone zmiany w plikach upstream

Tylko te pliki, każdy minimalnie, z komentarzem `TEAM-AVAILABILITY`:

| Plik | Zmiana |
| --- | --- |
| `apps/api/plane/settings/common.py` | `plane.availability` w `INSTALLED_APPS` |
| `apps/api/plane/app/urls/__init__.py` | dołączenie URL-i modułu |
| `apps/web/app/routes/extended.ts` | 3 trasy |
| `apps/web/core/components/navigation/use-navigation-items.ts` | pozycja (zakładki projektu) |
| `apps/web/core/components/workspace/sidebar/project-navigation.tsx` | pozycja (sidebar projektu) |
| `packages/constants/src/workspace.ts` | pozycja w sidebarze workspace'u |
| `apps/web/core/components/workspace/sidebar/sidebar-menu-items.tsx` | wyświetlenie pozycji |
| `apps/web/core/components/workspace/sidebar/sidebar-item.tsx` | obsługa klucza pozycji |
| `apps/web/core/components/workspace/sidebar/helper.tsx` | ikona pozycji |
| `packages/constants/src/settings/workspace.ts` | pozycja w ustawieniach workspace'u |

Jeśli rekonesans pokaże, że potrzebny jest inny plik, zatrzymaj się
i zapytaj użytkownika.

**Nowe pliki poza modułami:**
- `.github/workflows/team-availability-images.yml`;
- `deploy/team-availability/` (override compose, skrypt
  `plane-ta.sh`, instrukcja wdrożenia);
- `docs/team-availability/INTEGRATION.md`.

## 10. Testy i kryteria akceptacji

**Narzędzia:**
- Logika dat i pasów: `node --test`, bez nowych zależności (Node
  22.18 obsługuje TypeScript bez flag). Jeśli to nie zadziała
  z importami monorepo, zaproponuj `vitest` jako devDependency
  i poczekaj na zgodę.
- API: pytest w stosie `docker-compose-test.yml` (lokalnie;
  `down -v` jest tu dozwolone, bo dotyczy tylko stosu testowego).

**Implementacja jest ukończona, gdy przechodzą wszystkie poniższe
scenariusze.**

Daty i renderowanie:
1. Wpis od 1 do 3 listopada jest widoczny 1, 2 i 3 listopada.
2. Wpis przecinający dwa tygodnie zawija się poprawnie w obu.
3. Wpis przecinający koniec miesiąca jest widoczny w obu miesiącach.
4. Wpis jednodniowy zajmuje jeden dzień.
5. Wpis nie przesuwa się o dzień przy `TZ=America/Los_Angeles`
   ani `TZ=Pacific/Auckland`.
6. Wpisy obejmujące zmianę czasu (koniec marca, koniec października)
   mają poprawną długość.
7. `end_date < start_date` jest odrzucane przez klienta i API.

Dane i CRUD:
8. Utworzenie wpisu daje rekord `AvailabilityEntry`; moduł nie tworzy
   ani nie czyta work itemów.
9. Edycja zmienia ten sam rekord, bez duplikatu.
10. Usunięcie wymaga potwierdzenia i ustawia `deleted_at` właściwego
    rekordu.
11. Zapytanie o zakres zwraca wpisy przecinające jego początek i koniec.
12. Paginacja zwraca wszystkie wpisy z zakresu.
13. Słowniki domyślne powstają raz, także przy równoległych żądaniach.
14. Zarchiwizowany status nie jest dostępny przy zapisie, a istniejące
    wpisy z nim nadal się wyświetlają.

Uprawnienia:
15. Member tworzy, edytuje i usuwa tylko własne wpisy; dla cudzych
    dostaje 403 z API.
16. Admin workspace'u zarządza wpisami wszystkich.
17. Guest dostaje 403 na każdym endpoincie i nie widzi pozycji
    nawigacji.
18. Filtr `project_id` dla osoby spoza projektu zwraca 403.
19. Błąd 403 jest pokazany czytelnie, bez pozorowania sukcesu.

UX:
20. Kliknięcie pustej komórki lub dnia otwiera formularz z domyślną
    osobą i datą.
21. Kliknięcie paska otwiera edycję.
22. Wszystkie trzy widoki są dostępne z poziomu modułu.
23. Ekran jest użyteczny na desktopie i nie rozpada się na węższym
    oknie.
24. Tryb ciemny jest czytelny.
25. Konflikt wpisów jest widoczny.

Build i bezpieczeństwo:
26. `pnpm check:types` i `pnpm check:lint` bez nowych błędów;
    `ruff` dla nowego kodu Python.
27. Oba obrazy budują się dla `linux/amd64`.
28. Bundle nie zawiera sekretów ani tokenów.
29. Pozostałe moduły Plane działają jak przed zmianą (smoke test
    lokalny).
30. W nowym kodzie nie ma surowego SQL.

## 11. Środowisko lokalne

**Maszyna:** Windows 11, 64 GB RAM, Docker Desktop z WSL2. Repo
i Claude Code działają wewnątrz WSL, nie na `C:\`.

**Fork:** publiczny fork `makeplane/plane` na koncie użytkownika.
Gałąź robocza `team-availability` od tagu `v1.4.3`.

**Lokalny stack:**
- Oficjalny `docker-compose.yaml` 1.4.3 z override'em na lokalnie
  zbudowane obrazy.
- Do pracy nad frontendem: `pnpm dev` dla `web` z API lokalnego stosu.
  Konfigurację (`VITE_*`, CORS) ustal na początku Etapu 3.

**Kopia danych produkcyjnych** (opcjonalna, do testu migracji):
- `pg_dump` dostarcza użytkownik.
- **Zanim wystartuje `worker`:**
  - wyłącz webhooki w ustawieniach każdego workspace'u;
  - uruchom lokalny `worker` bez dostępu do sieci zewnętrznej.
  Produkcja nie ma SMTP, ale sprawdź to w ustawieniach instancji kopii.
- Dump zawiera hashe haseł i sesje. Trzymaj go tylko lokalnie, poza
  repo, i usuń po testach.

## 12. Wdrożenie i rollback

Przygotuj dla użytkownika gotowe polecenia. **Sam ich nie wykonuj na
produkcji.**

1. **GitHub Actions** buduje z gałęzi `team-availability` dla
   `linux/amd64` dwa obrazy:
   - `ghcr.io/<user>/plane-frontend:1.4.3-ta.<n>`,
   - `ghcr.io/<user>/plane-backend:1.4.3-ta.<n>`.

   Paczki są publiczne (użytkownik raz przełącza widoczność), więc na
   serwerze nie trzeba logowania.
2. **Plik override** `deploy/team-availability/docker-compose.team-availability.yaml`
   zmienia wyłącznie `image` usług `web`, `api`, `worker`,
   `beat-worker` i `migrator`. Środowisko, sieci, wolumeny i zależności
   zostają z bazowego pliku. Sprawdź, że nic poza `image` nie jest
   nadpisywane.
3. **Skrypt `deploy/team-availability/plane-ta.sh`** z akcjami
   `up`, `down`, `restart`, `logs`, `status`, `rollback`. Zawsze
   wywołuje `docker compose -f docker-compose.yaml -f <override>
   --env-file plane.env`, a `rollback` tylko plik bazowy. Od momentu
   wdrożenia menu `setup.sh` nie jest używane.
4. **Kolejność na produkcji** (wykonuje użytkownik):
   - kopia `docker-compose.yaml` i `plane.env`;
   - `pg_dump` poza wolumenem;
   - zapis identyfikatorów obecnych obrazów;
   - `pull` nowych obrazów;
   - `plane-ta.sh up`;
   - weryfikacja: logi `migrator` i `api`, logowanie, moduł, wpis
     testowy utworzony i usunięty.
5. **Rollback:** `plane-ta.sh rollback`, czyli powrót do oficjalnych
   obrazów `v1.4.3`. Nowe tabele zostają i nie przeszkadzają.
   Przywrócenie `pg_dump` tylko w razie uszkodzenia danych.
6. **Bezwzględnie zakazane na produkcji:**
   - `docker compose down -v` i usuwanie wolumenów;
   - `setup.sh` upgrade;
   - ręczne zmiany w bazie;
   - edycja `plane.env` i bazowego `docker-compose.yaml`.

   `SECRET_KEY` i `LIVE_SERVER_SECRET_KEY` są na serwerze ustawione;
   wdrożenie ich nie dotyka.

## 13. Poza zakresem

- Drag-and-drop (faza 2).
- Wiersz dziennej obsady zespołu.
- Święta i dni wolne.
- Grupowanie wierszy po projekcie.
- Zmiany przez północ.
- Realtime.
- Historia zmian wpisu.
- Polskie tłumaczenie interfejsu.
- Widok mobilny.
- Powiadomienia.
- Eksport.

## 14. Etapy

1. **Rekonesans.** Bez zmian w kodzie. Potwierdź fakty z sekcji 4 na
   tagu `v1.4.3`, uzupełnij brakujące (dokładne komponenty
   `@plane/propel` i `@plane/ui`, wzorzec nagłówka modułu, obsługa
   preferencji sidebaru, nazwa ostatniej migracji `db`). Zgłoś każdą
   rozbieżność z tym dokumentem.
2. **Środowisko lokalne.** Lokalny stack, `pnpm dev`, uruchomione
   testy backendu.
3. **Backend.** Modele, migracja, API, testy pytest (kryteria 7–18).
4. **Logika frontendu.** Helper dat, lanes, konflikty, testy
   (kryteria 1–7, 25).
5. **Widoki.** Nawigacja, trasy, Timeline, Calendar, Personal,
   formularz, ustawienia.
6. **Weryfikacja.** Typy, lint, build obrazów, smoke test, wszystkie
   kryteria z sekcji 10, `INTEGRATION.md`.
7. **Wdrożenie.** Workflow GHCR, override, `plane-ta.sh`, instrukcja
   krok po kroku. Wdrożenie produkcyjne wykonuje użytkownik, po swojej
   akceptacji.

**Pierwsze zadanie:** Etap 1. Sprawdź, że pracujesz na gałęzi
utworzonej z tagu `v1.4.3` (`git describe --tags`), i przedstaw raport
rekonesansu.

**Priorytet nadrzędny:** poprawność zakresów dat i bezpieczeństwo
działającej instancji Plane. Rozszerzenie ma być małe, odwracalne
i utrzymywalne.
