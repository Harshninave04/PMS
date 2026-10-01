# Medistra Hospital Management System

[![Next.js](https://img.shields.io/badge/Next.js-16.3.1-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.8-blue?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose_9.9-green?style=flat-square&logo=mongodb)](https://www.mongodb.com/)

A simple hospital management system for **small and medium hospitals** (a single hospital, roughly 10–100 beds). It covers the day-to-day work of reception, doctors, nurses, pharmacy and accounts, and nothing else.

Built with Next.js 16 (App Router), React 19, TypeScript and MongoDB. Money is shown in Indian Rupees (₹) and dates in `DD/MM/YYYY`.

---

## First time here?

**Start with [FIRST_TIME_SETUP.md](./FIRST_TIME_SETUP.md)** — a Docker walkthrough for a brand-new clone. No seeding required.

```bash
docker compose up -d --build
docker compose exec app npm run bootstrap -- --admin-password 'choose-a-real-password'
```

Then sign in at <http://localhost:3000/login>.

---

## Daily Workflow

```
OPD:  Register patient → Book appointment / token → Doctor consults (vitals, diagnosis, prescription)
         → Pharmacy dispenses → Bill & collect payment

IPD:  Admit → Assign bed → Nursing vitals, notes & medication rounds → Discharge summary → Final bill
```

## Modules

| Menu | What it does |
| --- | --- |
| **Dashboard** | One dashboard per role with today's numbers and shortcuts |
| **Patients** | Register, search, patient profile (visits, admissions, prescriptions, bills), documents |
| **OPD** | Book appointments, today's queue, all appointments (cancel / reschedule from the list) |
| **Consultation** | Consultations, prescriptions, vital signs, medical history |
| **IPD / Admissions** | New admission, admitted patients, bed transfer, discharge, discharge summary, history |
| **Wards & Beds** | Bed availability board; set up wards, rooms and beds |
| **Nursing** | Admitted patients, vitals, nursing notes, medication rounds |
| **Pharmacy** | Prescriptions to dispense, dispensing, medicines, categories, stock, expiry |
| **Billing** | Create bill, bills, payments, outstanding dues |
| **Reports** | Summary, patients, appointments, doctors, admissions, pharmacy, billing |
| **Settings** | Hospital profile, users, roles & permissions, doctors, staff, departments, doctor schedule |

## Roles

There are six fixed roles. Each one only sees its own menus.

| Role | Sees |
| --- | --- |
| **Administrator** | Everything, including Settings |
| **Doctor** | Dashboard, Patients (view), OPD, Consultation, IPD (view). Sees only their own appointments and prescriptions. |
| **Nurse** | Dashboard, Patients (view), IPD (view), Wards & Beds (view), Nursing |
| **Receptionist** | Dashboard, Patients, OPD, IPD, Wards & Beds (view), Billing (create bills, collect payments) |
| **Pharmacist** | Dashboard, Patients (view), Pharmacy |
| **Accountant** | Dashboard, Patients (view), Billing, Reports |

Where these are defined:

- `src/lib/rbac/roles.ts` — what each role can do
- `src/lib/rbac/permissions.ts` — the list of permissions
- `src/lib/menu-data.ts` — the sidebar menus
- `src/lib/rbac/canonical-sync.ts` — keeps roles and menus in the database in step with the code
- `src/lib/rbac/dashboard-profiles.ts` — each role's dashboard

An administrator can adjust a role's permissions from **Settings → Roles & Permissions**.

---

## Architecture

```
Next.js pages (React 19, Tailwind v4)
        │ HTTP / JSON
REST route handlers (src/app/api)
        │
Controllers  → request validation, permission check (src/lib/rbac/guard.ts)
        │
Services     → business rules
        │
Repositories / Mongoose models → MongoDB
```

Every API call checks the user's permission and limits the query to the user's hospital. Doctors are additionally limited to their own appointments and prescriptions.

---

## Docker Quickstart (Recommended)

```bash
docker compose up -d
```

- **Web app**: [http://localhost:3000](http://localhost:3000)
- **MongoDB**: internal only, `mongodb://mongodb:27017` on the compose network (`docker exec -it medistra-mongodb mongosh medistra-hms`)
- **Mongo Express**: [http://localhost:8081](http://localhost:8081) _(User: `admin`, Pass: `medistra`)_

### Prepare a new, empty database

> First time here? [FIRST_TIME_SETUP.md](./FIRST_TIME_SETUP.md) is the walkthrough. The short version is the two commands below.

```bash
docker compose exec app npm run bootstrap -- --admin-password 'choose-a-real-password'
```

This is the step to run on a fresh install. It creates the six roles, the menus, the hospital, sample departments, designations, a starter medicine list and the first administrator, so you can log in and start working.

It never deletes anything and it is safe to re-run: every step checks first and only fills a gap. On a database that already has departments or job titles it leaves them completely alone rather than merging the sample set in.

The administrator password comes from `--admin-password`, or from `DEFAULT_ADMIN_PASSWORD` if you omit the flag, and must be at least 8 characters. An existing administrator is never overwritten and its password is never reset.

If the database already has an administrator and you supply a new password, `bootstrap` creates an additional administrator at the email you gave. Leave the password out and it creates nothing.

> ⚠️ `npm run seed` is the older, destructive alternative: it clears users, roles, menus, departments, doctors, staff and medicines first. Never run it against a database with real data. Use `bootstrap`.

### Upgrade an existing database

Nothing to run. A database created by an older version still has the old roles (Lab Technician, HR Officer, …) and the old menus, and it can outlive any given build. The app brings its own access data up to date on the way up, so `docker compose up -d --build` is the whole procedure.

On every start, `src/instrumentation.ts` reconciles the database against the code:

- creates or refreshes the six roles
- replaces the sidebar menus when they no longer match the menus the code ships
- moves users from old roles to the matching new role (for example `HOSPITAL_ADMIN` → Admin, `CASHIER` → Accountant, `CONSULTANT` → Doctor) and deletes old roles that nobody holds
- attaches users without a hospital to the hospital

It compares before it writes, so a healthy database costs one read per collection and no writes. **No user is ever deleted.** Users whose old role has no equivalent (Lab, Radiology, HR, …) are reported in the app log and left alone for you to reassign in **Settings → Users**.

Users must log out and back in afterwards. Data from the removed modules (lab orders, insurance claims, …) is left in MongoDB untouched.

Even if that reconciliation cannot run — a read-only or unreachable database — the sidebar stays correct: `MenuController` filters menus to the ones the running build ships on every request, so a leftover row can never become a link to a deleted page.

If you want to see, or force, the reconciliation without restarting the app:

```bash
docker compose exec app npm run repair:rbac          # preview, writes nothing
docker compose exec app npm run repair:rbac:apply    # apply
```

It is the same code path the app runs at startup, so the result is identical.

### Useful commands

```bash
docker compose logs -f app   # logs
docker compose ps            # status
docker compose down          # stop (data kept)
docker compose down -v       # stop and wipe data
```

---

## Local Setup (Without Docker)

Prerequisites: Node.js 20+, MongoDB 6+.

```bash
npm install
```

Create `.env.local`:

```env
MONGODB_URI=mongodb://localhost:27017/medistra-hms
NEXTAUTH_SECRET=your_super_secret_key_here
NEXTAUTH_URL=http://localhost:3000
DEFAULT_ADMIN_EMAIL=admin@hospital.com
DEFAULT_ADMIN_PASSWORD=password123
```

Then:

```bash
npm run bootstrap    # new database only (see warning above)
npm run dev         # http://localhost:3000
```

Checks before a release:

```bash
npm run typecheck   # tsc --noEmit
npm test            # role, menu, permission and bootstrap tests (9 suites)
npm run build
```

---

## Logging In

After `npm run bootstrap`, log in at `http://localhost:3000/login`:

| Email | Password | Role |
| --- | --- | --- |
| `admin@hospital.com` | the password you passed to `bootstrap` | Administrator |

Change it afterwards from **Settings → Users**, and create staff logins the same way.

For one demo login per role, see [DEMO_CREDENTIALS.md](./DEMO_CREDENTIALS.md).

---

## Repository Structure

```
src/
├── app/
│   ├── (dashboard)/        # Pages: dashboard, patients, appointments, clinical, admissions,
│   │                       #        wards, nursing, pharmacy, finance, reports, staff, admin,
│   │                       #        organization (hospital profile)
│   ├── api/                # REST route handlers
│   └── login/
├── components/             # Layout (sidebar, header) and UI primitives
├── controllers/            # Request handling and permission checks
├── services/               # Business logic
├── repositories/           # Database queries
├── models/                 # Mongoose schemas
├── lib/
│   ├── rbac/               # Roles, permissions, guard, dashboards
│   └── menu-data.ts        # Sidebar menus
└── seed.ts                 # Database seeder
scripts/
├── repair-rbac-access.ts   # Upgrade an existing database to the six roles
└── provision-demo-users.ts # Add demo logins without wiping data
tests/rbac/                 # npm test
```
