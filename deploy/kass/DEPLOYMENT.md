# Wdrożenie: Plane 1.4.3, wariant Kassek-dev

Instrukcja dla serwera z Plane zainstalowanym oficjalnym `setup.sh`.
Wariant podmienia **tylko obrazy** usług `web`, `api`, `worker`,
`beat-worker` i `migrator`. Pliki `docker-compose.yaml` i `plane.env` na
serwerze **nie są edytowane**.

Pliki w tym katalogu:

| Plik                                                | Rola                                                            |
| --------------------------------------------------- | --------------------------------------------------------------- |
| `docker-compose.kass.yaml`                          | override: wyłącznie `image` pięciu usług (tag `1.4.3-kass.<n>`) |
| `plane-kass.sh`                                     | uruchamianie wariantu i rollback; zastępuje menu `setup.sh`     |
| `.github/workflows/kass-images.yml` (w roocie repo) | build obrazów do GHCR po wypchnięciu tagu `1.4.3-kass.<n>`      |

Obrazy: `ghcr.io/kassek-dev/plane-frontend:1.4.3-kass.<n>` i
`ghcr.io/kassek-dev/plane-backend:1.4.3-kass.<n>` (`linux/amd64`, etykiety
OCI: tytuł, wersja, commit, źródło).

---

## A. Build obrazów (lokalnie, w repozytorium)

1. Wypchnij gałąź i utwórz tag wydania (tag = tag obrazu):

   ```bash
   git push origin team-availability
   git tag 1.4.3-kass.1
   git push origin 1.4.3-kass.1
   ```

2. GitHub → zakładka **Actions** → workflow **Kass variant images** musi
   zakończyć się sukcesem (testy modułów, potem build obu obrazów).
3. **Tylko za pierwszym razem:** ustaw obie paczki jako publiczne:
   GitHub → profil → **Packages** → `plane-frontend` → **Package settings**
   → **Change visibility** → **Public**. To samo dla `plane-backend`.
4. Sprawdź, że obraz da się pobrać bez logowania (dowolna maszyna):

   ```bash
   docker pull ghcr.io/kassek-dev/plane-backend:1.4.3-kass.1
   docker image inspect ghcr.io/kassek-dev/plane-backend:1.4.3-kass.1 \
     --format '{{index .Config.Labels "org.opencontainers.image.title"}} {{index .Config.Labels "org.opencontainers.image.version"}}'
   ```

---

## B. Pierwsze wdrożenie (na serwerze)

Wszystkie polecenia w **katalogu instalacji `setup.sh`** (ten, w którym są
`docker-compose.yaml` i `plane.env`, zwykle `plane-app`). Poniżej
`PLANE_DIR` oznacza jego ścieżkę.

### B1. Pliki wariantu

```bash
cd PLANE_DIR
TAG=1.4.3-kass.1
curl -fsSLO "https://raw.githubusercontent.com/Kassek-dev/plane-custom/$TAG/deploy/kass/docker-compose.kass.yaml"
curl -fsSLO "https://raw.githubusercontent.com/Kassek-dev/plane-custom/$TAG/deploy/kass/plane-kass.sh"
chmod +x plane-kass.sh
grep image: docker-compose.kass.yaml   # 5 linii, wszystkie z tagiem $TAG
```

### B2. Kopie zapasowe (przed jakąkolwiek zmianą)

```bash
BK=~/plane-backup/$(date +%Y%m%d-%H%M)
mkdir -p "$BK"
cp docker-compose.yaml plane.env "$BK"/
chmod 600 "$BK"/plane.env

# Zrzut bazy POZA wolumenem Dockera
docker compose -f docker-compose.yaml --env-file plane.env exec -T plane-db \
  sh -c 'pg_dump -h localhost -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BK/plane.dump"
head -c 5 "$BK/plane.dump"; echo     # musi wypisać: PGDMP

# Obecne obrazy (do porównania i ewentualnego powrotu)
docker compose -f docker-compose.yaml --env-file plane.env images > "$BK/images-before.txt"
./plane-kass.sh status
```

`status` musi pokazać `Running variant: official (makeplane/plane-backend:v1.4.3)`.

### B3. Pobranie obrazów i start wariantu

```bash
./plane-kass.sh pull
./plane-kass.sh up
```

`up` pobiera obrazy, uruchamia stos z override'em, czeka na `migrator` i
kończy się komunikatami:

```
Migrator finished (exit code 0).
Running variant: Kassek-dev (ghcr.io/kassek-dev/plane-backend:1.4.3-kass.1)
```

Jeśli `migrator` zakończy się błędem, skrypt przerywa i podpowiada
`./plane-kass.sh rollback` (sekcja D).

### B4. Weryfikacja

```bash
./plane-kass.sh logs migrator   # zawiera: Applying availability.0001_initial... OK  (Ctrl+C)
./plane-kass.sh logs api        # bez "Traceback" (Ctrl+C)
./plane-kass.sh status          # wszystkie usługi running, migrator exited (0)
```

W przeglądarce:

1. Logowanie działa, projekty i work itemy jak wcześniej.
2. Sidebar → **Team availability** otwiera moduł; w projekcie zakładka
   **Team availability**.
3. Ustawienia workspace'u → **Availability**: widać domyślne statusy i
   lokalizacje.
4. Dodaj wpis testowy, sprawdź, że jest widoczny, i **usuń go**.

---

## C. Kolejne wydania (`1.4.3-kass.2`, …)

### C1. Wydanie (w repozytorium)

1. Zmień tag w `deploy/kass/docker-compose.kass.yaml` (5 linii), commit.
2. `git tag 1.4.3-kass.<n> && git push origin team-availability 1.4.3-kass.<n>`.
3. Poczekaj na zielony workflow **Kass variant images** (sekcja A2).

### C2. Aktualizacja serwera: `./plane-kass.sh update`

```bash
cd PLANE_DIR
./plane-kass.sh version     # zainstalowana wersja i najnowsza na GitHubie
./plane-kass.sh update      # aktualizacja do najnowszej (pyta o potwierdzenie)
```

`update` kolejno:

1. odczytuje zainstalowaną wersję z `docker-compose.kass.yaml`;
2. znajduje na GitHubie najnowszy tag tej samej serii (`1.4.3-kass.<n>`;
   inna wersja Plane, np. `1.5.0-…`, nigdy nie jest wybierana);
3. sprawdza, że obrazy tej wersji są już w GHCR (workflow zakończony);
4. pokazuje `obecna -> nowa` i pyta o potwierdzenie (`-y` pomija pytanie);
5. robi kopię zapasową do `~/plane-backup/<data-godzina>/`:
   `docker-compose.yaml`, `plane.env`, override, skrypt, `plane.dump`
   (`pg_dump`, sprawdzony nagłówek `PGDMP`), lista obrazów;
6. pobiera z GitHuba override i skrypt nowej wersji, sprawdza je
   (5 obrazów z nowym tagiem, poprawna składnia) i podmienia;
7. uruchamia `up` (pobranie obrazów, start, czekanie na `migrator`).

Potem weryfikacja jak w B4. Inne warianty:

```bash
./plane-kass.sh update 1.4.3-kass.1   # konkretna wersja, także powrót do starszej
./plane-kass.sh update -y             # bez pytania (np. z crona; nie zalecane)
./plane-kass.sh backup                # sama kopia zapasowa
```

Katalog kopii zmienia `PLANE_KASS_BACKUP_DIR`. Źródło wydań (domyślnie
repozytorium `Kassek-dev/plane-custom`) zmienia `PLANE_KASS_REPO`.

**Jednorazowo przy przejściu z `1.4.3-kass.1`:** skrypt z wersji 1 nie ma
jeszcze `update`. Pobierz raz nowy skrypt, potem już tylko `update`:

```bash
cd PLANE_DIR
curl -fsSL "https://raw.githubusercontent.com/Kassek-dev/plane-custom/1.4.3-kass.2/deploy/kass/plane-kass.sh" -o plane-kass.sh
chmod +x plane-kass.sh
./plane-kass.sh update
```

---

## D. Rollback

```bash
./plane-kass.sh rollback
```

Wraca do oficjalnych obrazów `v1.4.3` (tylko bazowy `docker-compose.yaml`).
Tabele modułu zostają w bazie i nie przeszkadzają oficjalnemu Plane
(sprawdzone: migrator kończy się kodem 0, Plane działa normalnie). Ponowne
włączenie wariantu: `./plane-kass.sh up`.

**Przywrócenie `pg_dump` tylko przy uszkodzeniu danych** (zatrzymuje Plane
na czas przywracania):

```bash
./plane-kass.sh down
docker compose -f docker-compose.yaml --env-file plane.env up -d plane-db
docker compose -f docker-compose.yaml --env-file plane.env exec -T plane-db \
  sh -c 'pg_restore -h localhost -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$BK/plane.dump"
./plane-kass.sh rollback        # albo: ./plane-kass.sh up
```

---

## E. Codzienna obsługa

| Polecenie                          | Działanie                                           |
| ---------------------------------- | --------------------------------------------------- |
| `./plane-kass.sh status`           | kontenery, obrazy, który wariant działa             |
| `./plane-kass.sh logs [usługa]`    | logi (ostatnie 200 linii, na żywo)                  |
| `./plane-kass.sh restart [usługa]` | restart                                             |
| `./plane-kass.sh down`             | zatrzymanie (wolumeny zostają; `-v` jest blokowane) |
| `./plane-kass.sh up`               | start wariantu (wersja z override'u)                |
| `./plane-kass.sh version`          | wersja zainstalowana i najnowsza na GitHubie        |
| `./plane-kass.sh update [tag]`     | kopia zapasowa + nowa wersja z GitHuba (sekcja C2)  |
| `./plane-kass.sh backup`           | kopia plików i `pg_dump` do `~/plane-backup/`       |

Skrypt odmawia startu w katalogu bez istniejącej instalacji Plane (chroni
przed postawieniem drugiego, pustego Plane). `PLANE_KASS_SKIP_PULL=1` pomija
pobieranie obrazów (np. po `docker load`).

---

## F. Zakazane na produkcji

- `docker compose down -v`, usuwanie wolumenów, `docker volume prune`.
- `setup.sh` → **upgrade** (nadpisuje `docker-compose.yaml` i `plane.env`
  i zmienia wersję Plane). Od wdrożenia nie używaj menu `setup.sh`;
  start/stop/logi przez `plane-kass.sh`.
- Ręczne zmiany w bazie.
- Edycja `plane.env` i bazowego `docker-compose.yaml` w ramach wdrożenia.
  `SECRET_KEY` i `LIVE_SERVER_SECRET_KEY` zostają bez zmian.
