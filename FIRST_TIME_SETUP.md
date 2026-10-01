# First-Time Setup

For someone who has just downloaded this repository and has never run it before.

This guide sets the system up with Docker and **without seeding anything**. You
never run `npm run seed` — that command wipes real data and is not part of this
flow.

---

## Requirements

- Docker Desktop (Windows/macOS) or Docker Engine + the Compose plugin (Linux)
- Ports `3000` and `8081` free on your machine
- About 3 minutes, most of it the image build

Check Docker is working:

```bash
docker --version
docker compose version
```

---

## Quick start

Three commands. This is the whole install.

```bash
# 1. Start the app (builds the image the first time, ~2 min)
docker compose up -d --build

# 2. Create your administrator login — pick your own password
docker compose exec app npm run bootstrap -- --admin-password 'choose-a-real-password'

# 3. Open the app
```

Go to **<http://localhost:3000/login>** and sign in:

| Email | Password |
| --- | --- |
| `admin@hospital.com` | the password you passed in step 2 |

Then change it under **Settings → Users**.

---

## Why there is a step 2

Step 1 alone gets you most of the way. The app builds its own access data on
startup, so **roles and menus need no seeding and no migration command**.

Verified: starting the app against a completely empty database produces

```
roles=6  menus=61  users=0  orgs=0  depts=0
```

The app is up, but there is no account to log in with. That is deliberate.
Minting a credential automatically is not something a web request should be
allowed to do, so `npm run bootstrap` is an explicit command you run once, by
hand, on a machine you control.

It is safe to re-run. It never deletes anything and only fills gaps.

---

## Step 1 — Start the app

```bash
docker compose up -d --build
```

This starts three containers:

| Container | What it is | Reaches it at |
| --- | --- | --- |
| `medistra-app` | the HMS web app | <http://localhost:3000> |
| `medistra-mongodb` | the database (internal only) | see [Accessing the database](#accessing-the-database) |
| `medistra-mongo-express` | database browser | <http://localhost:8081> — user `admin`, pass `medistra` |

On first run the build takes a couple of minutes. Later runs reuse the image
cache.

Watch it come up:

```bash
docker compose logs -f app
```

A healthy start ends with something like:

```
[access] roles and menus reconciled with the database in 465ms
```

If you see `roles and menus already up to date`, that is also fine.

---

## Step 2 — Create your administrator

```bash
docker compose exec app npm run bootstrap -- --admin-password 'choose-a-real-password'
```

Password rules: at least 8 characters, single-quoted in your shell so `!` and
`$` survive.

Expected output on a fresh install:

```
Summary
   +1    Roles and menus      reconciled, menus created
   +1    Hospital             Medistra Hospital created
   +7    Departments          none found, added 7
   +6    Designations         none found, added 6
   +10   Pharmacy catalogue   5 categor(y/ies), 5 medicine(s)
   +1    Administrator        admin@hospital.com
```

To use a different administrator email:

```bash
docker compose exec app npm run bootstrap -- \
  --admin-email you@yourhospital.com --admin-password 'choose-a-real-password'
```

What it creates on a brand-new install, and nothing more:

| Collection | Count | What it is |
| --- | --- | --- |
| roles | 6 | Admin, Doctor, Nurse, Receptionist, Pharmacist, Accountant |
| menus | 61 | the sidebar, 11 sections with 50 links |
| organizations | 1 | the hospital |
| departments | 7 | a starter set you can rename or replace |
| designations | 6 | job titles |
| medicines | 5 | a starter pharmacy catalogue so the screens are usable |
| users | 1 | your administrator |

It does **not** create fake doctors, fake patients, fake appointments or demo
logins. Add real people from **Settings → Users**.

---

## Step 3 — Sign in

Open <http://localhost:3000/login>, sign in, and change the password under
**Settings → Users**.

---

## Accessing the database

**MongoDB has no host port on purpose.** The app reaches it over Docker's
internal network as `mongodb:27017`.

This matters if you try to connect from your own machine:

```bash
mongosh mongodb://localhost:27017/medistra-hms   # WRONG — a different, empty MongoDB
```

You would silently write to the wrong database. Use one of these instead.

**Option A — the web browser** (easiest)

Open <http://localhost:8081>, user `admin`, password `medistra`.

**Option B — inside the container**

```bash
docker exec -it medistra-mongodb mongosh medistra-hms
```

Add `-e` to run a single command instead:

```bash
docker exec medistra-mongodb mongosh medistra-hms --quiet \
  --eval "print('users=' + db.users.countDocuments())"
```

**Option C — Mongo Express, as a container**

```bash
docker compose exec mongodb mongosh medistra-hms
```

---

## Verify the install

```bash
docker exec medistra-mongodb mongosh medistra-hms --quiet --eval \
  "print('users='+db.users.countDocuments()+' roles='+db.roles.countDocuments()+' menus='+db.menus.countDocuments())"
```

A healthy new install reports `users=1 roles=6 menus=61`.

The app is healthy if:

```bash
curl -o /dev/null -s -w "%{http_code}" http://localhost:3000/login
```

returns `200`.

---

## Do not run `npm run seed`

`seed` is the old destructive command. It **deletes users, roles, menus,
departments, doctors, staff and medicines before rebuilding them.** On a fresh
install it happens to work, which is exactly what makes it dangerous — it looks
harmless until the day someone runs it on a hospital with real data in it.

Use `bootstrap` instead. `seed` is retained only for building throwaway demo
environments.

If you want optional demo logins (one per role, obviously fake), that is a
separate command that only creates or refreshes those demo accounts and never
removes anything:

```bash
docker compose exec app npm run seed:demo
```

---

## Upgrading later

```bash
git pull
docker compose up -d --build
```

That is the entire procedure. The app reconciles its own roles and menus against
the new build on startup — old roles, removed pages and stale menu rows are
fixed as it starts, and users are moved to their equivalent new role. No
migration command, no seeding.

Users must sign out and back in to pick up menu changes.

---

## Troubleshooting

**Signing in just returns me to the login form.**
Step 2 was not run, or the password does not match. There is no error on screen
by design. Check for a user:

```bash
docker exec medistra-mongodb mongosh medistra-hms --quiet \
  --eval "printjson(db.users.find({},{name:1,email:1}).toArray())"
```

If it is empty, run step 2.

**"No administrator password"** — you ran `bootstrap` with no password on a
database that has no administrator. Pass one, as in step 2.

**Port 3000 or 8081 is already in use** — something else on your machine owns
it. Stop that, or change the left-hand port in `docker-compose.yml` and rebuild.

**`npm run bootstrap` says "Cannot find module '@/models/...'"** — the running
image is older than the script. Rebuild it:

```bash
docker compose up -d --build
```

**I want to start completely over.** This deletes everything, including any
real data you have entered:

```bash
docker compose down -v
docker compose up -d --build
```

**I forgot the administrator password.** There is no reset command. Either
bootstrap a new administrator at a different email:

```bash
docker compose exec app npm run bootstrap -- \
  --admin-email newadmin@yourhospital.com --admin-password 'choose-a-real-password'
```

or change it directly in the database.

---

## Security before this goes anywhere real

Two defaults in `docker-compose.yml` are fine for a laptop and must not be left
alone on a server.

**1. The session secret is a public constant.**

```yaml
- NEXTAUTH_SECRET=medistra_super_secret_production_jwt_key_2026_hms
```

It is committed to the repository, so anyone who has read the repository can
forge a valid session cookie. Generate a private one:

```bash
openssl rand -base64 32
```

Put it in `docker-compose.yml` and rebuild. Anyone signing in elsewhere will be
signed out, which is the correct outcome.

**2. Do not leave the default password.** `DEFAULT_ADMIN_PASSWORD=password123`
is also committed. Choose your own in step 2, or set it in `docker-compose.yml`
before running `bootstrap` without the flag.

**3. File storage is optional and off by default.** Document upload needs
Supabase S3 credentials (see `.env.sample`). Without them the app runs normally
and only the upload feature is unavailable.

---

## Without Docker

If you prefer to run it locally, see the *Local Setup* section of the main
[README](./README.md). The same rule applies: `npm run bootstrap`, never
`npm run seed`.