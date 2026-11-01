# Team Availability: postęp prac

> Plik roboczy aktualizowany po każdym etapie. Źródłem wymagań jest
> `INSTRUCTIONS.md` (wersja 2). Ten plik zapisuje stan, decyzje i ustalenia.

**Ostatnia aktualizacja:** 2026-11-01 (sesja 2)

## Bieżący etap

**Etap 6 (weryfikacja) w toku.** Etap 5 zaakceptowany 2026-11-01.

| Etap                  | Status                   |
| --------------------- | ------------------------ |
| 1. Rekonesans         | ukończony, zaakceptowany |
| 2. Środowisko lokalne | ukończony, zaakceptowany |
| 3. Backend            | ukończony, zaakceptowany |
| 4. Logika frontendu   | ukończony, zaakceptowany |
| 5. Widoki             | ukończony, zaakceptowany |
| 6. Weryfikacja        | w toku                   |
| 7. Wdrożenie          | nie rozpoczęty           |

## Co zrobione

### Etap 1: rekonesans (bez zmian w kodzie)

- Gałąź `team-availability` od `v1.4.3` (`37a15d99…`); nad tagiem tylko
  commity z dokumentacją.
- Potwierdzone fakty z sekcji 4 instrukcji (frontend, backend, deployment).
- Środowisko: Node 22.18.0, pnpm 11.10.0 (corepack, `packageManager`),
  Docker 29.9.2. Remote `origin` = `Kassek-dev/plane-custom`, `upstream` =
  `makeplane/plane`. Żaden istniejący workflow nie startuje na push do
  `team-availability`.

### Etap 2: środowisko lokalne (zaakceptowany 2026-11-01)

- `./setup.sh`: utworzone `.env`, `apps/{web,api,space,admin,live}/.env`
  (ignorowane przez git), `SECRET_KEY` w `apps/api/.env`, `pnpm install`
  bez zmian w lockfile. Husky zainstalował hook pre-commit (lint-staged).
- Stack deweloperski: `docker compose -f docker-compose-local.yml up -d
--build` (projekt `plane-custom`). Backend z zamontowanym `apps/api`
  (`runserver`, autoreload), migrator zakończony kodem 0, API odpowiada na
  `http://localhost:8000/api/instances/` (200).
- Konfiguracja web ↔ API z `.env.example` jest spójna, bez zmian:
  `VITE_API_BASE_URL=http://localhost:8000`, a `CORS_ALLOWED_ORIGINS`
  (i `CSRF_TRUSTED_ORIGINS`) zawiera `http://localhost:3000`.
- **Bazowy pytest (v1.4.3, przed zmianami):** 583 passed, **5 failed**,
  119 s. Wszystkie 5 to `429 RATE_LIMIT_EXCEEDED` w
  `plane/tests/contract/api/test_projects.py` i `test_projects_lite.py`
  (limit `API_KEY_RATE_LIMIT=60/minute` przy pełnym przebiegu). Problem
  środowiskowy upstreamu, nie regresja. Punkt odniesienia dla Etapu 3.
- **Stos testowy uruchamiamy z osobną nazwą projektu:**
  `docker compose -p plane-ta-test -f docker-compose-test.yml ...`
  (także `down -v`). Bez `-p` oba pliki compose trafiają do projektu
  `plane-custom` i `down -v` mógłby dotknąć stosu deweloperskiego.
- `pnpm turbo run dev --filter=web --filter=admin`: web
  `http://localhost:3000`, admin `http://localhost:3001/god-mode/`. W logach
  tylko ostrzeżenia upstreamu (React Router v8 future flags,
  `postcss.config.js` bez `"type"`).
- Przy pierwszym starcie Vite przebudowuje zależności (`optimized
dependencies changed`), a przeglądarka z nieaktualnym `?v=` dostaje
  `504 Outdated Optimize Dep` (Firefox: „niedozwolony typ MIME („”)”).
  Rozwiązanie: twarde odświeżenie (Ctrl+Shift+R).
- Instancja skonfigurowana w `/god-mode`. Workspace testowy `ta-test`:
  `piotr.wasielewski00@gmail.com` (Admin, 20), `member@ta.local` (Member, 15),
  `guest@ta.local` (Guest, 5). Projekt `TESTPROJEC`: Admin i Member (bez
  Guesta). SMTP wyłączony; zaproszenia przyjmowane po rejestracji.
- Decyzja robocza: do developmentu (Etapy 3–5) używamy
  `docker-compose-local.yml` + `pnpm dev`. Stack produkcyjny (oficjalny
  compose 1.4.3 + override na lokalnie zbudowane obrazy, sekcja 11) budujemy
  w Etapie 6 razem z obrazami `plane-frontend`/`plane-backend`.

### Etap 3: backend (zaakceptowany 2026-11-01)

- Aplikacja `apps/api/plane/availability/`: `models.py`, `constants.py`,
  `services.py` (domyślne słowniki), `serializers.py`, `views.py`, `urls.py`,
  `migrations/0001_initial.py`, `tests/` (95 testów).
- Upstream: `plane/settings/common.py` (`INSTALLED_APPS`) i
  `plane/app/urls/__init__.py` (URL-e). Opis w `INTEGRATION.md`.
- Migracja zastosowana na lokalnym stosie deweloperskim;
  `makemigrations --check`: brak zmian.
- Pytest modułu: 95 passed. Pełny przebieg: 678 passed, 5 failed (te same
  błędy 429 co w punkcie odniesienia, brak regresji).
- `ruff check` i `ruff format --check` dla `plane/availability`: czysto.
  `ruff format --check plane/settings/common.py` zgłasza plik także na
  czystym v1.4.3 (problem upstreamu, nie formatujemy go).
- Ustalenia implementacyjne:
  - domyślne słowniki: tworzone tylko gdy workspace nigdy nie miał wartości
    danego słownika (także soft-deleted), pod blokadą wiersza workspace'u
    (`select_for_update`) + `bulk_create(ignore_conflicts=True)`; zmiana nazwy
    domyślnej wartości nie powoduje jej ponownego utworzenia;
  - zarchiwizowany status/lokalizacja jest odrzucany tylko przy wyborze
    (utworzenie lub zmiana wartości); edycja innych pól wpisu z
    zarchiwizowanym statusem działa;
  - `GET entries/` pomija wpisy osób nieaktywnych w workspace i botów;
  - unikalność nazw słowników w serializerze bez rozróżniania wielkości
    liter, w bazie (constraint) dokładna;
  - `notes` maks. 2000 znaków, nazwy słowników maks. 100;
  - `project_id` nieistniejącego projektu daje 403 (jak brak członkostwa).

### Etap 4: logika frontendu (zaakceptowany 2026-11-01)

- Moduł `apps/web/core/team-availability/` (bez zmian w plikach upstream):
  - `lib/dates.ts`: dni jako liczby całkowite (indeks od 1970-01-01),
    konwersje algorytmami Hinnanta bez `Date`; `parseDay`, `tryParseDay`,
    `formatDay`, `addDays`, `diffDays`, `rangeLength`, `weekday`,
    `weekStart`, `daysInMonth`, `monthStart/End`, `addMonths`, `isoWeek`,
    `overlaps`, `contains`, `clip`, `fromLocalDate`/`toLocalDate` (most do
    date pickera), `today`;
  - `lib/range.ts`: zakresy tydzień / 2 tygodnie (domyślny) / miesiąc,
    Previous/Next, siatka tygodni kalendarza, paski tygodni ISO i miesięcy;
  - `lib/layout.ts`: pasy (zachłanny podział przedziałów), konflikty,
    wiersze Timeline (przycinanie, `cutLeft`/`cutRight`, pod-wiersze),
    tygodnie Calendar (odcinki per tydzień, pasy per tydzień, „+N more”
    liczone per dzień);
  - `lib/validation.ts`: walidacja formularza zgodna z API;
  - `lib/entries.ts`: wpisy API → elementy z indeksami dni;
  - `types.ts`: typy odpowiedzi API i paleta kolorów.
- Testy: `node core/team-availability/test/run.mjs` (z `apps/web`) uruchamia
  51 testów w strefach UTC, Europe/Warsaw, America/Los_Angeles,
  Pacific/Auckland. Hook `test/resolve-ts.mjs` dokleja `.ts` do
  bezrozszerzeniowych importów względnych; bez zależności.
  `lib/acceptance.test.ts` odwzorowuje kryteria 1–7 i 25.
- `tsc` (`pnpm run check:types` w `apps/web`): 0 błędów. `oxlint` i
  `oxfmt --check` dla modułu: 0 ostrzeżeń. Sortowanie kopii tablic z
  `// oxlint-disable-next-line unicorn/no-array-sort` jak w upstreamie
  (`toSorted` niedostępne: `lib` ES2022).

### Etap 5: widoki (zaakceptowany 2026-11-01)

- Moduł `apps/web/core/team-availability/`:
  - `services/availability.service.ts` (dziedziczy po `APIService`,
    pobiera wszystkie strony wpisów, błędy z zachowanym statusem HTTP);
  - `hooks/`: stan widoku w URL (`view`, `range`, `date`, `people`,
    `statuses`, `locations`, `person`), gęstość w `localStorage` (try/catch),
    SWR dla wpisów i słowników, odczyt kontekstu z store'ów Plane;
  - `components/`: nagłówek z breadcrumbami i „Add availability”, toolbar
    (widok, zakres, Previous/Today/Next, filtry, gęstość), Timeline,
    Calendar, Personal, legenda, modal formularza (`ModalCore`) i
    potwierdzenie usunięcia (`AlertModalCore`), strona słowników;
  - `lib/format.ts`: etykiety dat bez `Date`/`Intl` (3 nowe testy).
- Trasy w `extended.ts` + cienkie pliki tras; nawigacja: zakładki i sidebar
  projektu, sidebar workspace'u (stała pozycja pod Projects), ustawienia
  (Features → Availability, tylko Admin). Szczegóły w `INTEGRATION.md`.
- Kontrole: `tsc` 0 błędów; `oxlint` dla nowych plików 0 ostrzeżeń, pliki
  upstream bez nowych ostrzeżeń (5 przed i po); `oxfmt --check` czysto;
  54 testy `node --test` w 4 strefach; Vite kompiluje moduł (dev server).
- Ustalenia UI:
  - Member klika tylko komórki własnego wiersza (inne nie są przyciskami);
    cudzy wpis otwiera się w trybie tylko do odczytu;
  - w kalendarzu „+N more” przełącza na Timeline z zakresem tygodnia;
  - lista osób: aktywni członkowie workspace'u bez botów (wszystkie role,
    jak w API); w projekcie: członkowie projektu;
  - Calendar dla zakresu „2 weeks” pokazuje 2 wiersze tygodni.
- Poprawka po teście UI (2026-11-01): usuwanie nie działało (DELETE nie
  docierał do API). Modal potwierdzenia był drugim, równoległym `Dialog`
  headless-ui; kliknięcie w nim zamykało formularz i odmontowywało oba.
  Teraz formularz się zamyka, a `DeleteEntryModal` otwiera się samodzielnie
  (`components/delete-modal.tsx`, stan w `root.tsx`).
- Pytanie o automatyczne odświeżanie u innych użytkowników (2026-11-01):
  wykonalne (np. odpytywanie SWR co ~30 s + odświeżanie po powrocie do
  karty), ale użytkownik zdecydował: **nie wdrażamy**; zostaje zasada
  „bez realtime” z sekcji 7.10.

## Ustalenia z rekonesansu

**Frontend**

- Wzorzec nagłówka: `layout.tsx` = `AppHeader` (`header`, `mobileHeader`) +
  `ContentWrapper` + `Outlet`; nagłówek = `Header` + `Breadcrumbs`
  (`@plane/ui`) + `BreadcrumbLink`; w projekcie `CommonProjectBreadcrumbs`.
  Przykłady: `projects/(detail)/[projectId]/cycles/(list)/`, `stickies/`.
- Komponenty faktycznie używane w web: `@plane/propel` (`button`, `tooltip`,
  `toast`, `empty-state`, `tabs`); `@plane/ui` (`ModalCore`,
  `AlertModalCore`, `CustomSelect`, `CustomSearchSelect`, `Input`,
  `TextArea`, `Avatar`, `Loader`, `Breadcrumbs`, `Header`); web
  (`DateDropdown`, `MemberDropdown`). Propel `Combobox`/`Dialog` istnieją,
  ale web ich nie używa, więc wybieramy `ModalCore` i `CustomSearchSelect`.
- `t()` zwraca klucz przy braku tłumaczenia (`keySeparator: "."`,
  `nsSeparator: false`), więc angielskie etykiety bez kropek działają bez
  zmian w `@plane/i18n`.
- Paleta etykiet: crimson, emerald, grey, indigo, orange, pink, purple,
  yellow. Tailwind 4: klasy `bg-label-{c}-bg` itd. trzeba trzymać jako
  statyczną mapę (bez składania nazw w locie).
- `APIService.get(url, config)`: drugi argument to konfiguracja axios, więc
  parametry przekazujemy jako `{ params: {...} }`.
- `DateDropdown` zwraca `Date`; do `YYYY-MM-DD` przez
  `renderFormattedPayloadDate` (lokalny `format`, bez przesunięcia).
- `IUserLite.is_bot` jest dostępne we frontendzie.
- Ustawienia workspace'u: layout autoryzuje po `WORKSPACE_SETTINGS_ACCESS`
  (klucz = `href`); bez wpisu strona pokazuje `NotAuthorizedView`.
- Sidebar workspace'u: pozycje dynamiczne widoczne tylko gdy przypięte
  w `WorkspaceUserPreference`; backend tworzy wiersze wyłącznie dla
  `UserPreferenceKeys`, PATCH pomija brakujące klucze.
- `node --test` uruchamia TS bez flag, ale Node wymaga importów z `.ts`,
  a `tsc` (`include: **/*`) bez `allowImportingTsExtensions` zgłasza TS5097.

**Backend**

- Ostatnia migracja `db`: `0122_alter_draftissue_assignees_alter_issue_assignees_and_more`.
- Używamy `BaseModel` + własne FK `workspace` (`WorkspaceBaseModel` dodaje
  nullowalne FK `project`).
- `hard_delete` kończy się pętlą po `apps.get_models()`, więc obejmie nowe
  modele. Soft delete wywołuje Celery `soft_delete_related_objects`.
- **Korekta (Etap 3):** wcześniejsze ustalenie „usunięcie workspace'u
  kaskaduje w jednej operacji, więc `PROTECT` nie blokuje” było błędne.
  Django zgłasza `ProtectedError` także wtedy, gdy wpisy są usuwane w tej
  samej kaskadzie. Potwierdzone sondą i testem (`TestDeletion`).
- `allow_permission` zwraca 403 jako `{"error": ...}` (nie `{"detail": ...}`).
- `global_paginator.paginate`: kursor `size:page:0` (offset); błędny kursor
  rzuca `ValueError`, więc mapujemy na 400; wymagany deterministyczny
  `order_by` (z `id`).
- Pytest: `--nomigrations`, więc migrację weryfikujemy osobno
  (`makemigrations --check`, `migrate` na lokalnym stosie). Fixtures
  z `plane/tests/conftest.py` nie są widoczne w `plane/availability/tests/`,
  więc potrzebny własny `conftest.py`.
- `TESTING_GUIDE.md` jest w `apps/api/plane/tests/` (nie `apps/api/tests/`,
  jak podaje `AGENTS.md`). Brak `apps/api/.env`, więc `./setup.sh` w Etapie 2.

**Deployment**

- Compose (`deployments/cli/community/docker-compose.yml`): obrazy
  `makeplane/<nazwa>:${APP_RELEASE:-stable}`; usługi `web`, `api`, `worker`,
  `beat-worker`, `migrator` potwierdzone.
- `setup.sh` pobiera compose z release'u na GitHubie. Do weryfikacji
  override'u (Etap 7) potrzebna kopia `docker-compose.yaml` z serwera
  (bez `plane.env`).

## Decyzje

Podjęte:

- Formularz używa `ModalCore`; potwierdzenie usunięcia `AlertModalCore`.
- Modele dziedziczą po `BaseModel` z jawnym FK `workspace`.
- `AvailabilityEntry.status` i `.location`: `on_delete=RESTRICT` zamiast
  `PROTECT` z instrukcji (zatwierdzone 2026-11-01). `PROTECT` przerywał
  `hard_delete` przy twardym usuwaniu workspace'u z wpisami.

Potwierdzone przez użytkownika 2026-11-01 (wcześniej otwarte decyzje 1–4):

1. **Ustawienia workspace'u (1A).** Dopuszczone dodatkowe pliki upstream
   (poza sekcją 9): `packages/types/src/settings.ts` (typ
   `TWorkspaceSettingsTabs`) i
   `apps/web/core/components/settings/workspace/sidebar/item-icon.tsx`
   (ikona). Strona trafia do sidebaru ustawień. Obie zmiany oznaczone
   `TEAM-AVAILABILITY` i opisane w `INTEGRATION.md`.
2. **Sidebar workspace'u (2A).** Pozycja stała, zawsze widoczna dla
   Admin/Member, bez możliwości ukrycia; tylko pliki z sekcji 9, bez zmian
   w `UserPreferenceKeys`.
3. **Testy frontendu (3A).** `node --test` z własnym hookiem resolve
   (`--import`), bez nowych zależności.
4. **Store MobX (4: tak).** Odczyt przez istniejące hooki (`useUser`,
   `useUserPermissions`, `useMember`, `useWorkspace`) dozwolony; zakaz
   modyfikacji store'a i `root.store.ts`.

## Otwarte decyzje (czekają na użytkownika)

Brak.

## Następne kroki

1. Etap 6: `pnpm check:types`/`check:lint` (cały monorepo), build obrazów
   `plane-frontend`/`plane-backend` dla `linux/amd64`, kontrola bundla pod
   kątem sekretów, smoke test, przegląd kryteriów 1–30, `INTEGRATION.md`.
