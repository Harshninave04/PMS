# Demo Credentials

Every role-specific dashboard in the PMS has its own login, so each one can be
reviewed independently. All demo accounts share a single password.

> **Warning — shared credentials.** These accounts exist for demonstration and
> testing only. Every user below has identical access to nothing beyond their own
> role, but they all share one publicly documented password. Never enable them in
> a production or patient-facing environment.

---

## Demo accounts

**Password for every account below: `Demo@2026`**

| Dashboard shown | Email | Role |
| --- | --- | --- |
| Administration | `demo.system_super_admin@medistra.hospital` | `SYSTEM_SUPER_ADMIN` |
| Administration | `demo.hospital_admin@medistra.hospital` | `HOSPITAL_ADMIN` |
| System Administration | `demo.system_it_admin@medistra.hospital` | `SYSTEM_IT_ADMIN` |
| Compliance & Audit | `demo.system_auditor@medistra.hospital` | `SYSTEM_AUDITOR` |
| Clinical Practice | `demo.doctor@medistra.hospital` | `DOCTOR` |
| Nursing Station | `demo.nurse@medistra.hospital` | `NURSE` |
| Laboratory | `demo.lab_technician@medistra.hospital` | `LAB_TECHNICIAN` |
| Radiology & Imaging | `demo.radiologist@medistra.hospital` | `RADIOLOGIST` |
| Pharmacy | `demo.pharmacist@medistra.hospital` | `PHARMACIST` |
| Inventory & Stores | `demo.storekeeper@medistra.hospital` | `STOREKEEPER` |
| Procurement | `demo.procurement_officer@medistra.hospital` | `PROCUREMENT_OFFICER` |
| Front Desk | `demo.receptionist@medistra.hospital` | `RECEPTIONIST` |
| Finance & Billing | `demo.cashier@medistra.hospital` | `CASHIER` |
| Human Resources | `demo.hr_officer@medistra.hospital` | `HR_OFFICER` |
| Blood Bank | `demo.blood_bank_technician@medistra.hospital` | `BLOOD_BANK_TECHNICIAN` |
| Insurance & TPA | `demo.insurance_officer@medistra.hospital` | `INSURANCE_OFFICER` |
| Emergency | `demo.emergency_doctor@medistra.hospital` | `EMERGENCY_DOCTOR` |
| Operation Theatre | `demo.ot_nurse@medistra.hospital` | `OT_NURSE` |
| Ward Administration | `demo.branch_manager@medistra.hospital` | `BRANCH_MANAGER` |

19 logins cover all 18 non-default dashboard profiles. Two of them
(`SYSTEM_SUPER_ADMIN` and `HOSPITAL_ADMIN`) intentionally render the same
Administration dashboard, so both the platform and hospital levels are covered.

The dashboard is selected from the role in the session token, not from anything
the user types at login. `src/lib/rbac/dashboard-profiles.ts` holds the full
role-to-profile map; a role with no entry falls back to the generic "Staff"
profile.

---

## Pre-existing accounts

These are created by the main seed and are unaffected by the demo provisioner.

| Email | Password |
| --- | --- |
| `admin@hospital.com` | `password123` |
| `priya.das@medistra.hospital` | `Hospital@2026` |
| `sourav.roy@medistra.hospital` | `Hospital@2026` |
| `subhashis.m@medistra.hospital` | `Hospital@2026` |
| `tanushree.m@medistra.hospital` | `Hospital@2026` |
| `rohan.c@medistra.hospital` | `Hospital@2026` |

Other real accounts may also exist in a live database and are not listed here.

---

## Provisioning the demo accounts

`npm run seed` is destructive — it clears users, roles, menus and staff records
before reseeding. Use the additive provisioner instead when working against a
database that already holds data:

```bash
SEED_DEMO_USERS=true npm run seed:demo
```

Optional overrides:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SEED_DEMO_USERS` | unset | Must be exactly `true`, otherwise the script exits immediately. |
| `SEED_DEMO_PASSWORD` | `Demo@2026` | Password applied to all demo accounts. |
| `MONGODB_URI` | `mongodb://localhost:27017/medistra-hms` | **Must match the database the running app uses.** |

`scripts/provision-demo-users.ts` never deletes anything. It only:

1. adds `dashboard.dashboard.view` to any role that is missing it (without
   touching that role's other module grants), and
2. creates the demo accounts, or refreshes their password, role and active flag
   if they already exist.

It only ever writes to `demo.*@medistra.hospital` addresses.

### Running it against Docker

This is the most common reason demo logins "do not work": the provisioner writes
to a different database than the app reads from.

When the app runs under `docker compose`, the app container uses
`mongodb://mongodb:27017/medistra-hms` (the `mongodb` service on the internal
network), while `MONGODB_URI` in `.env` points at `localhost:27017`. If a
different Mongo is publishing that host port, the host-side script provisions
the wrong database and every demo login fails with *Invalid email or password*
even though the accounts look correct in the database you inspected.

Check which database the app is really using:

```bash
docker inspect medistra-app --format '{{range .Config.Env}}{{println .}}{{end}}' | grep MONGODB_URI
```

Then run the provisioner inside the same network, using the `mongodb` hostname:

```bash
docker run --rm --network pms_medistra-network \
  -e MONGODB_URI=mongodb://mongodb:27017/medistra-hms \
  -e SEED_DEMO_USERS=true \
  -v "$PWD:/src:ro" -w /work node:20-alpine sh -c \
  "mkdir -p scripts && cp /src/scripts/provision-demo-users.ts scripts/ \
   && npm i tsx mongoose bcryptjs dotenv --silent >/dev/null 2>&1 \
   && npx tsx scripts/provision-demo-users.ts"
```

The script prints the target database and the user count before and after, so
you can confirm it hit the right one.

---

## Verifying a login

```bash
curl -s -c jar.txt http://localhost:3000/api/auth/csrf
curl -s -b jar.txt -c jar.txt -X POST http://localhost:3000/api/auth/callback/credentials \
  -d "csrfToken=<token>&email=demo.doctor@medistra.hospital&password=Demo@2026&json=true"
curl -s -b jar.txt http://localhost:3000/api/auth/session
```

`roleName` in the session response is the value that drives which dashboard
renders. `/api/dashboard/stats` returns `403` for any role missing the
`dashboard.dashboard.view` grant.
