# Team Availability: integracja z Plane v1.4.3

Spis wszystkich zmian w plikach upstream. Każde miejsce w kodzie jest
oznaczone komentarzem `TEAM-AVAILABILITY`. Przy aktualizacji Plane
sprawdź każdy wiersz tej tabeli.

## Pliki upstream

| Plik                                  | Zmiana                                                                         | Etap |
| ------------------------------------- | ------------------------------------------------------------------------------ | ---- |
| `apps/api/plane/settings/common.py`   | `"plane.availability"` w `INSTALLED_APPS`                                      | 3    |
| `apps/api/plane/app/urls/__init__.py` | import `plane.availability.urls` i `*availability_urls` na końcu `urlpatterns` | 3    |

## Nowy kod (poza upstream)

- `apps/api/plane/availability/`: aplikacja Django (modele, migracja
  `0001_initial`, serializery, widoki, URL-e, testy).

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
