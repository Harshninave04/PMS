/**
 * The reference data a hospital needs before it can be used: itself, its
 * departments, job titles and a starter pharmacy catalogue.
 *
 * Shared by `npm run seed` (which wipes the database first) and
 * `npm run bootstrap` (which never deletes anything), so the two can never
 * describe different hospitals. Pure data only — no models, no database.
 */

export const HOSPITAL = {
    organizationName: "Medistra Hospital",
    organizationId: "MEDISTRA-MAIN",
    organizationType: "HOSPITAL",
    branchType: "MAIN",
    email: "info@medistra.hospital",
    phone: "+91 33 2345 6789",
    address: "12 Medical Enclave, Central Avenue, Kolkata",
    city: "Kolkata",
    state: "West Bengal",
    pincode: "700001",
    country: "India",
    capacity: 60,
    isActive: true,
} as const;

export const DEPARTMENTS = [
    { name: "General Medicine", code: "GMED", location: "Ground Floor", phoneExtension: "101", description: "Adult general health and chronic disease care" },
    { name: "General Surgery", code: "GSUR", location: "First Floor", phoneExtension: "102", description: "General surgical care" },
    { name: "Pediatrics", code: "PEDI", location: "Ground Floor", phoneExtension: "103", description: "Child health and vaccinations" },
    { name: "Obstetrics & Gynecology", code: "OBGY", location: "First Floor", phoneExtension: "104", description: "Maternity and women's health" },
    { name: "Orthopedics", code: "ORTH", location: "First Floor", phoneExtension: "105", description: "Bones, joints and fractures" },
    { name: "Casualty", code: "CASU", location: "Ground Floor", phoneExtension: "100", description: "Walk-in emergencies and first aid" },
    { name: "Pharmacy", code: "PHAR", location: "Ground Floor - Lobby", phoneExtension: "106", description: "Outpatient and inpatient dispensing" },
] as const;

export const DESIGNATIONS = [
    { name: "Consultant", code: "CONS", department: "Medical", level: "Senior", description: "Consultant doctor" },
    { name: "Medical Officer", code: "MO", department: "Medical", level: "Junior", description: "Duty doctor" },
    { name: "Staff Nurse", code: "NURSE", department: "Nursing", level: "Mid-Level", description: "Ward nurse" },
    { name: "Pharmacist", code: "PHARM", department: "Pharmacy", level: "Mid-Level", description: "Dispensing pharmacist" },
    { name: "Receptionist", code: "RECEP", department: "Administration", level: "Junior", description: "Front desk" },
    { name: "Accountant", code: "ACCT", department: "Finance", level: "Mid-Level", description: "Billing and accounts" },
] as const;

export const MEDICINE_CATEGORIES = [
    { name: "Antibiotics", code: "ABX", description: "Antimicrobials", storageCondition: "COOL_DRY" as const, requiresPrescription: true },
    { name: "Analgesics & Antipyretics", code: "ANALG", description: "Pain and fever", storageCondition: "ROOM_TEMPERATURE" as const, requiresPrescription: false },
    { name: "Cardiovascular", code: "CARD", description: "Blood pressure and heart", storageCondition: "ROOM_TEMPERATURE" as const, requiresPrescription: true },
    { name: "Gastrointestinal", code: "GI", description: "Antacids and PPIs", storageCondition: "ROOM_TEMPERATURE" as const, requiresPrescription: false },
    { name: "Antidiabetic", code: "DIAB", description: "Oral hypoglycemics and insulin", storageCondition: "ROOM_TEMPERATURE" as const, requiresPrescription: true },
] as const;

/**
 * A small dispensable catalogue so the pharmacy screens are usable on day one.
 * Expiry dates are relative to the day it runs, so nothing lands in the past.
 */
export function starterMedicines(): Record<string, unknown>[] {
    const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return [
        { name: "Paracetamol 500mg", category: "Analgesics & Antipyretics", genericName: "Acetaminophen", dosageForm: "TABLET", manufacturer: "GlaxoSmithKline", batchNumber: "PCM-2026-01", unitPrice: 2.5, stockQuantity: 2500, expiryDate: inDays(365) },
        { name: "Amoxicillin 500mg", category: "Antibiotics", genericName: "Amoxicillin Trihydrate", dosageForm: "CAPSULE", manufacturer: "Cipla Ltd", batchNumber: "AMX-2026-04", unitPrice: 8.0, stockQuantity: 1200, expiryDate: inDays(300) },
        { name: "Metformin 500mg", category: "Antidiabetic", genericName: "Metformin Hydrochloride", dosageForm: "TABLET", manufacturer: "Sun Pharma", batchNumber: "MET-2026-02", unitPrice: 4.0, stockQuantity: 1800, expiryDate: inDays(400) },
        { name: "Atorvastatin 20mg", category: "Cardiovascular", genericName: "Atorvastatin Calcium", dosageForm: "TABLET", manufacturer: "Torrent Pharma", batchNumber: "ATV-2026-07", unitPrice: 12.5, stockQuantity: 950, expiryDate: inDays(350) },
        { name: "Pantoprazole 40mg", category: "Gastrointestinal", genericName: "Pantoprazole Sodium", dosageForm: "TABLET", manufacturer: "Alkem Labs", batchNumber: "PAN-2026-03", unitPrice: 9.0, stockQuantity: 1400, expiryDate: inDays(380) },
    ];
}