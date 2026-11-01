# Team Availability: postęp prac

> Plik roboczy aktualizowany po każdym etapie. Źródłem wymagań jest
> `INSTRUCTIONS.md` (wersja 2). Ten plik zapisuje stan, decyzje i ustalenia.

**Ostatnia aktualizacja:** 2026-11-01 (koniec sesji)

## Bieżący etap

**Etap 2 (środowisko lokalne) w toku.** Etap 1 zaakceptowany 2026-11-01.
Stack deweloperski i bazowy pytest działają; zostało uruchomienie
`pnpm dev` i pierwsze logowanie (sekcja „Następne kroki”).

| Etap                  | Status                   |
| --------------------- | ------------------------ |
| 1. Rekonesans         | ukończony, zaakceptowany |
| 2. Środowisko lokalne | w toku                   |
| 3. Backend            | nie rozpoczęty           |
| 4. Logika frontendu   | nie rozpoczęty           |
| 5. Widoki             | nie rozpoczęty           |
| 6. Weryfikacja        | nie rozpoczęty           |
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

### Etap 2: środowisko lokalne (w toku)

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
- Decyzja robocza: do developmentu (Etapy 3–5) używamy
  `docker-compose-local.yml` + `pnpm dev`. Stack produkcyjny (oficjalny
  compose 1.4.3 + override na lokalnie zbudowane obrazy, sekcja 11) budujemy
  w Etapie 6 razem z obrazami `plane-frontend`/`plane-backend`.

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
  Usunięcie workspace'u kaskaduje na wpisy i słowniki w jednej operacji,
  więc `PROTECT` nie blokuje.
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

## Otwarte decyzje (czekają na użytkownika)

> **Do potwierdzenia na początku następnej sesji:** w bocznym wątku `/btw`
> padły odpowiedzi **1A, 2A, 3A, 4 tak**. Nie zostały potwierdzone w głównej
> rozmowie, więc do czasu potwierdzenia traktujemy je jako otwarte. Są
> potrzebne przed Etapem 3 (pkt 4) i Etapami 4–5 (pkt 1–3).

1. **Ustawienia workspace'u.** (A, rekomendowane) dopuścić zmiany w
   `packages/types/src/settings.ts` (typ `TWorkspaceSettingsTabs`) i
   `apps/web/core/components/settings/workspace/sidebar/item-icon.tsx`
   (ikona); albo (B) własny layout poza `(workspace)/layout`, bez pozycji
   w sidebarze ustawień.
2. **Sidebar workspace'u.** (A, rekomendowane) pozycja stała, zawsze
   widoczna dla Admin/Member, tylko pliki z sekcji 9, bez możliwości
   ukrycia; albo (B) klucz w `UserPreferenceKeys` (backend upstream, bez
   migracji; domyślnie nieprzypięty).
3. **Testy frontendu.** (rekomendowane) `node --test` z własnym hookiem
   resolve (`--import`) bez zależności; albo `vitest` z katalogu pnpm
   (`^4.1.11`; zmiana `apps/web/package.json` i lockfile).
4. **Store MobX.** Czy „nie dotyka globalnego store” oznacza tylko zakaz
   modyfikacji, a odczyt przez istniejące hooki (`useUser`,
   `useUserPermissions`, `useMember`, `useWorkspace`) jest dozwolony?

## Następne kroki

Dokończenie Etapu 2:

1. Wznowienie stacka, jeśli jest zatrzymany:
   `docker compose -f docker-compose-local.yml up -d`.
2. `pnpm dev` (lub `pnpm turbo run dev --filter=web --filter=admin`):
   web na :3000, admin na :3001.
3. Konfiguracja instancji w `/god-mode` (konto admina), utworzenie
   workspace'u testowego i kont: Admin, Member, Guest (do kryteriów 15–17).
4. Smoke test: logowanie, projekt, work item, Cycles (stan przed zmianami).
5. Raport Etapu 2, potwierdzenie decyzji 1–4, akceptacja przejścia do
   Etapu 3 (backend).
