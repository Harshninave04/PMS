# Medistra Hospital Management System

[![Next.js](https://img.shields.io/badge/Next.js-16.3.1-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.8-blue?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose_9.9-green?style=flat-square&logo=mongodb)](https://www.mongodb.com/)

A simple hospital management system for **small and medium hospitals** (a single hospital, roughly 10–100 beds). It covers the day-to-day work of reception, doctors, nurses, pharmacy and accounts, and nothing else.

Built with Next.js 16 (App Router), React 19, TypeScript and MongoDB. Money is shown in Indian Rupees (₹) and dates in `DD/MM/YYYY`.

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

### Seed a new, empty database

```bash
docker compose exec app npm run seed
```

This creates the six roles, the menus, one hospital, departments, designations and a starter medicine list.

> ⚠️ `npm run seed` is destructive: it clears users, roles, menus, departments, doctors, staff and medicines first. Never run it against a database with real data.

### Upgrade an existing database

A database created by an older version still has the old roles (Lab Technician, HR Officer, …) and the old menus. Move it to the six roles without losing data:

```bash
docker compose up -d --build                         # rebuild with the new code
docker compose exec app npm run repair:rbac          # preview, writes nothing
docker compose exec app npm run repair:rbac:apply    # apply
```

The upgrade:

- creates or refreshes the six roles
- replaces the sidebar menus
- moves users from old roles to the matching new role (for example `HOSPITAL_ADMIN` → Admin, `CASHIER` → Accountant, `CONSULTANT` → Doctor) and deletes old roles that nobody holds
- lists users whose old role has no equivalent (Lab, Radiology, HR, …) so you can reassign them in **Settings → Users**
- attaches users without a hospital to the hospital

Users must log out and back in afterwards. Data from the removed modules (lab orders, insurance claims, …) is left in MongoDB untouched.

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
npm run seed        # new database only (see warning above)
npm run dev         # http://localhost:3000
```

Checks before a release:

```bash
npm run typecheck   # tsc --noEmit
npm test            # role, menu and permission tests (7 suites)
npm run build
```

---

## Logging In

After `npm run seed`, log in at `http://localhost:3000/login`:

| Email | Password | Role |
| --- | --- | --- |
| `admin@hospital.com` | `password123` | Administrator |

Change the password (or set `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` before seeding) and create staff logins from **Settings → Users**.

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
