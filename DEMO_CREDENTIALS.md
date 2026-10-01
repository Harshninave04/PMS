# Demo Credentials

There is one demo login per role, so each role's menus and dashboard can be
reviewed on its own. All demo accounts share one password.

> **Warning: shared credentials.** These accounts are for demonstration and
> testing only. They all share one publicly documented password. Never enable
> them in a production or patient-facing environment.

---

## Demo accounts

**Password for every account below: `Demo@2026`**

| Role | Email | Dashboard |
| --- | --- | --- |
| Administrator | `demo.admin@medistra.hospital` | Administration |
| Doctor | `demo.doctor@medistra.hospital` | Doctor |
| Nurse | `demo.nurse@medistra.hospital` | Nursing Station |
| Receptionist | `demo.receptionist@medistra.hospital` | Reception |
| Pharmacist | `demo.pharmacist@medistra.hospital` | Pharmacy |
| Accountant | `demo.accountant@medistra.hospital` | Billing & Accounts |

The dashboard and menus come from the role in the session token.
`src/lib/rbac/dashboard-profiles.ts` maps roles to dashboards and
`src/lib/rbac/roles.ts` defines what each role can access.

The main administrator account (`admin@hospital.com` / `password123`, unless
changed through `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD`) is always
created by `npm run seed`.

---

## Creating the demo accounts

**New database** — seed with demo accounts included:

```bash
SEED_DEMO_USERS=true npm run seed
```

The demo doctor also gets a doctor profile (General Medicine), and the other
demo users get staff profiles, so appointments can be booked with them.

**Existing database** — add the demo accounts without wiping anything. Run the
role upgrade first if the database predates the six roles:

```bash
npm run repair:rbac:apply
SEED_DEMO_USERS=true npm run seed:demo
```

`scripts/provision-demo-users.ts` never deletes anything. It only creates the
`demo.*@medistra.hospital` accounts, or refreshes their password, role and
active flag if they already exist. Accounts provisioned this way have no doctor
or staff profile; add one under **Settings → Doctors / Staff** if needed.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SEED_DEMO_USERS` | unset | Must be exactly `true`, otherwise nothing is created. |
| `SEED_DEMO_PASSWORD` | `Demo@2026` | Password for all demo accounts. |
| `MONGODB_URI` | `mongodb://localhost:27017/medistra-hms` | **Must match the database the running app uses.** |

### Under Docker

Run the commands inside the app container so they target the same database as
the app:

```bash
docker compose exec -e SEED_DEMO_USERS=true app npm run seed:demo
```

Running the script from the host with `MONGODB_URI=mongodb://localhost:27017/...`
is the usual reason demo logins fail with *Invalid email or password*: the
compose MongoDB is not published to the host, so the script writes to a
different database. The script prints the target database and the user count
before and after, so you can confirm it hit the right one.

---

## Verifying a login

```bash
curl -s -c jar.txt http://localhost:3000/api/auth/csrf
curl -s -b jar.txt -c jar.txt -X POST http://localhost:3000/api/auth/callback/credentials \
  -d "csrfToken=<token>&email=demo.doctor@medistra.hospital&password=Demo@2026&json=true"
curl -s -b jar.txt http://localhost:3000/api/auth/session
```

`roleName` in the session response decides which dashboard and menus appear.
