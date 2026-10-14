# Deploying a client

Each client gets its own copy: its own folder, Docker project, port, database volume and address. The examples use the Plant Store demo (`plantstore`, port `8110`); pick a new name and a free port for each client and record them in the server's port register.

| | Example |
|---|---|
| Folder | `~/plantstore-dm` |
| Docker project | `plantstore` (`CLIENT` in `deploy/.env`) |
| Port | `127.0.0.1:8110` (`PORT` in `deploy/.env`) |
| Data | Docker volume `plantstore_data` |
| Secrets | `deploy/.env` on the server only |

On a shared server: only touch this client's project, never publish on `0.0.0.0`, and never run `docker compose down -v` (it deletes the client's data).

## First deploy

```bash
free -h                                     # each copy needs about 250 MB

git clone https://github.com/Shashank-Codes-bit/Auto_DM_Plugin ~/plantstore-dm
cd ~/plantstore-dm/deploy
cp .env.example .env && nano .env           # CLIENT, PORT, PUBLIC_BASE_URL, owner login, SESSION_SECRET, Instagram keys

docker compose up -d --build
curl -s -o /dev/null -w "%{http_code}\n" 127.0.0.1:8110/health    # 200 (a 000 right after start is normal; retry)

# Put it on the internet through the reverse proxy (Caddy example):
sudo bash ~/Service-Call-Bot/infra/oracle-vm/add-site.sh plantstore proxy 8110
```

## Connect Instagram

**The client has its own Meta app:** set its webhook callback to `PUBLIC_BASE_URL/webhook` with your `VERIFY_TOKEN`, field `comments`.

**The account is already used by another app (shared webhook):** keep Meta pointing at the other app, and:
1. In the other app's `.env`: `FORWARD_WEBHOOK_URL=<this PUBLIC_BASE_URL>/webhook` and `PLUGIN_URL=<this PUBLIC_BASE_URL>`. Restart it.
2. In this app's `.env`: the same `IG_ACCESS_TOKEN`, `IG_USER_ID` and `APP_SECRET` as the other app, and `DM_LINK_BASE=<the other app's address>` if DM links should show that address.
3. Map each reel in one app only.

## After it's up

1. Log in on `/login` with `ADMIN_PHONE` / `ADMIN_PASSWORD`.
2. **Brand & settings:** name, website, logo and look (or **Load demo data** for the Plant Store demo).
3. **Products:** paste product links. **Reels:** set up a reel.
4. Comment the keyword from a tester account: DM → reel page → product opens on the brand's website.

## Updating, logs, backups

```bash
cd ~/plantstore-dm && git pull && cd deploy && docker compose up -d --build   # update
docker compose logs -f web                                                     # logs
docker compose restart web                                                     # restart this client only

# Backup (stops this client for a few seconds)
docker compose stop web
docker run --rm -v plantstore_data:/data -v ~/backups:/backup busybox tar czf /backup/plantstore-$(date +%F).tgz -C /data .
docker compose start web
```

`npm run seed` needs the app stopped too, because only one process can open the built-in database:

```bash
docker compose stop web && docker compose run --rm web npm run seed && docker compose start web
```
