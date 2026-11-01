# Team Availability: integracja z Plane v1.4.3

Spis wszystkich zmian w plikach upstream. Każde miejsce w kodzie jest
oznaczone komentarzem `TEAM-AVAILABILITY`. Przy aktualizacji Plane
sprawdź każdy wiersz tej tabeli.

## Pliki upstream

| Plik                                                                | Zmiana                                                                                                                                  | Etap |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `apps/api/plane/settings/common.py`                                 | `"plane.availability"` w `INSTALLED_APPS`                                                                                               | 3    |
| `apps/api/plane/app/urls/__init__.py`                               | import `plane.availability.urls` i `*availability_urls` na końcu `urlpatterns`                                                          | 3    |
| `apps/web/app/routes/extended.ts`                                   | 3 trasy pod tymi samymi layoutami co w `core.ts`                                                                                        | 5    |
| `apps/web/core/components/navigation/use-navigation-items.ts`       | pozycja w zakładkach projektu (`getTeamAvailabilityNavigationItem`)                                                                     | 5    |
| `apps/web/core/components/workspace/sidebar/project-navigation.tsx` | ta sama pozycja w sidebarze projektu                                                                                                    | 5    |
| `packages/constants/src/workspace.ts`                               | pozycja `team-availability` w `WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS` i w `..._STATIC_PINNED_NAVIGATION_ITEMS_LINKS` (pod Projects) | 5    |
| `apps/web/core/components/workspace/sidebar/sidebar-item.tsx`       | klucz `team_availability` w `staticItems` (zawsze widoczna, bez preferencji)                                                            | 5    |
| `apps/web/core/components/workspace/sidebar/helper.tsx`             | ikona dla klucza `team_availability`                                                                                                    | 5    |
| `packages/constants/src/settings/workspace.ts`                      | `WORKSPACE_SETTINGS.availability` (tylko Admin) w kategorii Features                                                                    | 5    |
| `packages/types/src/settings.ts`                                    | `"availability"` w `TWorkspaceSettingsTabs` (decyzja 1A, poza sekcją 9)                                                                 | 5    |
| `apps/web/core/components/settings/workspace/sidebar/item-icon.tsx` | ikona `availability` (decyzja 1A, poza sekcją 9)                                                                                        | 5    |

## Nowy kod (poza upstream)

- `apps/api/plane/availability/`: aplikacja Django (modele, migracja
  `0001_initial`, serializery, widoki, URL-e, testy).
- `apps/web/core/team-availability/`: moduł frontendu (logika `lib/`,
  serwis HTTP, hooki SWR, komponenty, testy `node --test`).
- Cienkie pliki tras (nowe, nie upstream):
  `apps/web/app/(all)/[workspaceSlug]/(projects)/team-availability/{layout,page}.tsx`,
  `.../projects/(detail)/[projectId]/team-availability/{layout,page}.tsx`,
  `.../(settings)/settings/(workspace)/availability/page.tsx`.

W `project-navigation.tsx` są też dwa komentarze
`// oxlint-disable-next-line no-shadow` przy istniejącym kodzie upstreamu
(hook lint-staged z `--deny-warnings` blokował commit; tak samo wycisza to
upstream w `use-navigation-items.ts`). Bez zmian w logice.

`sidebar-menu-items.tsx` (dozwolony w sekcji 9) nie wymagał zmian: pozycja
renderuje się przez istniejącą listę przypiętych pozycji statycznych.

## Frontend: uwagi utrzymaniowe

- `@plane/constants` i `@plane/types` są konsumowane z `dist/`. Po zmianie
  ich źródeł: `pnpm turbo run build --filter=@plane/types --filter=@plane/constants`
  i restart `pnpm dev`.
- Testy logiki (z `apps/web`): `node core/team-availability/test/run.mjs`.
- Moduł czyta store MobX tylko przez istniejące hooki (`useUser`,
  `useUserProfile`, `useUserPermissions`, `useMember`, `useWorkspace`,
  `useProject`); niczego w nim nie zapisuje. Dane modułu: SWR.

## Backend: uwagi utrzymaniowe

- **Migracja** `availability.0001_initial` zależy od
  `db.0122_alter_draftissue_assignees_alter_issue_assignees_and_more`.
  Tworzy wyłącznie tabele `availability_statuses`,
  `availability_locations`, `availability_entries` z indeksami
  i constraintami. Nie zmienia tabel Plane.
- **`on_delete=RESTRICT`** dla `AvailabilityEntry.status` i `.location`
  (instrukcja mówiła `PROTECT`). `PROTECT` blokuje twarde usunięcie
  workspace'u w `plane.bgtasks.deletion_task.hard_delete` i przerywa całe
  zadanie dla wszystkich tabel. `RESTRICT` pozwala na kaskadę z workspace'u,
  a samodzielne usunięcie słownika z wpisami nadal blokuje. Test regresji:
  `test_models.py::TestDeletion`.
- **Soft delete i `hard_delete`** obejmują nowe modele automatycznie
  (pętla po `apps.get_models()`).
- **Rollback na obrazy upstream:** tabele zostają; Plane ich nie czyta.
  Usunięcie tabel (tylko świadomie): `python manage.py migrate availability zero`
  na obrazie z modułem, przed powrotem do upstream.

## API

Prefiks `/api/workspaces/<slug>/availability/`:

| Metoda i ścieżka                                                                                         | Dostęp                                                               |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `GET entries/?from=YYYY-MM-DD&to=YYYY-MM-DD[&member_ids=&status_ids=&location_ids=&project_id=&cursor=]` | Admin, Member                                                        |
| `POST entries/`                                                                                          | Member dla siebie (`member` domyślnie = pytający), Admin dla każdego |
| `PATCH`, `DELETE entries/<id>/`                                                                          | osoba z wpisu albo Admin                                             |
| `GET statuses/`, `GET locations/`                                                                        | Admin, Member (pierwszy odczyt tworzy domyślne)                      |
| `POST statuses/`, `POST locations/`, `PATCH .../<id>/`                                                   | Admin                                                                |

- Odpowiedź `GET entries/` w formacie `global_paginator.paginate`
  (`results`, `next_cursor`, `total_results`…); kursor `rozmiar:strona:0`,
  domyślnie 1000 na stronę.
- Wpisy osób nieaktywnych w workspace i botów nie są zwracane.
- Błędy walidacji: 400 z błędami pól (DRF). 403 z `allow_permission`
  i reguły „własny wpis” ma postać `{"error": "..."}`.
- `DELETE` na słownikach: 405 (tylko archiwizacja).

## Build i wdrożenie: uwagi z weryfikacji (Etap 6)

- Obrazy budować z czystego drzewa (CI: checkout; lokalnie: `git archive`).
  Root `.dockerignore` wyklucza tylko `./.env`, nie `apps/*/.env`.
- Oficjalne obrazy `v1.4.3` działają na bazie z zastosowaną migracją
  `availability.0001_initial` (sprawdzone rollbackiem): migrator kończy się
  kodem 0, tabele modułu zostają nieużywane.
- Hook lint-staged uruchamia `oxlint --fix`; przy plikach upstream może
  zmienić kod (np. `.sort()` → `.toSorted()`, niezgodne z lib ES2022).
  Po commicie: `pnpm check:types`.
