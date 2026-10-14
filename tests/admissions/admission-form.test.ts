import assert from "node:assert/strict";
import test from "node:test";
import {
    AdmissionFormValues,
    buildAdmissionCreatePayload,
    buildQuickPatientPayload,
    filterAdmissionPatients,
    filterAvailableAdmissionBeds
} from "@/lib/admission-form";

const baseForm: AdmissionFormValues = {
    patientId: "patient-1",
    doctorId: "doctor-1",
    bedId: "bed-1",
    admissionDate: "2026-10-14T10:00",
    admissionType: "ELECTIVE",
    wardType: "GENERAL",
    admissionSource: "OPD",
    paymentType: "INSURANCE",
    advanceDeposit: "1250",
    consentSigned: false,
    reasonForAdmission: "",
    notes: "",
    emergencyContactName: "Attendant",
    emergencyContactPhone: "9999999999",
    emergencyContactRelation: "Parent",
    insuranceProvider: "Example TPA",
    insurancePolicyNumber: "POL-123"
};

test("patient selector search matches patient name, UHID and phone", () => {
    const patients = [
        { _id: "1", name: "Asha Rao", uhid: "MED-1001", contact: "9000000001" },
        { _id: "2", name: "Ravi Das", uhid: "MED-1002", contact: "9000000002" }
    ];
    assert.deepEqual(filterAdmissionPatients(patients, "asha").map((patient) => patient._id), ["1"]);
    assert.deepEqual(filterAdmissionPatients(patients, "med-1002").map((patient) => patient._id), ["2"]);
    assert.deepEqual(filterAdmissionPatients(patients, "9000000001").map((patient) => patient._id), ["1"]);
});

test("bed selector includes only AVAILABLE beds belonging to the selected ward type", () => {
    const beds = [
        { _id: "1", status: "AVAILABLE", roomId: { wardId: { wardType: "GENERAL" } } },
        { _id: "2", status: "OCCUPIED", roomId: { wardId: { wardType: "GENERAL" } } },
        { _id: "3", status: "AVAILABLE", roomId: { wardId: { wardType: "ICU" } } }
    ];
    assert.deepEqual(filterAvailableAdmissionBeds(beds, "GENERAL").map((bed) => bed._id), ["1"]);
});

test("standard payload carries admission, payment, insurance, relative and consent values", () => {
    const payload = buildAdmissionCreatePayload(baseForm, false) as Record<string, any>;
    assert.equal(payload.admissionType, "ELECTIVE");
    assert.equal(payload.admissionSource, "OPD");
    assert.equal(payload.wardType, "GENERAL");
    assert.equal(payload.paymentType, "INSURANCE");
    assert.equal(payload.advanceDeposit, 1250);
    assert.deepEqual(payload.insurance, { provider: "Example TPA", policyNumber: "POL-123" });
    assert.equal(payload.emergencyContact.name, "Attendant");
    assert.equal(payload.consentSigned, false);
    assert.equal(payload.consentPending, false);
    assert.equal("initialDiagnosis" in payload, false);
});

test("emergency payload locks source and type, defaults admission time, and tracks pending consent", () => {
    const payload = buildAdmissionCreatePayload(
        { ...baseForm, admissionDate: "", consentSigned: false },
        true,
        new Date("2026-10-14T12:30:00.000Z")
    ) as Record<string, unknown>;
    assert.equal(payload.admissionType, "EMERGENCY");
    assert.equal(payload.admissionSource, "EMERGENCY");
    assert.equal(payload.admissionDate, "2026-10-14T12:30:00.000Z");
    assert.equal(payload.consentPending, true);
});

test("quick patient registration fills required API fields from the four-field modal", () => {
    assert.deepEqual(
        buildQuickPatientPayload({ name: " Asha Rao ", age: "29", gender: "FEMALE", phone: " 9000000001 " }, "branch-1"),
        {
            name: "Asha Rao",
            age: 29,
            gender: "FEMALE",
            contact: "9000000001",
            bloodGroup: "O+",
            address: "Not provided during admission registration",
            emergencyContact: "9000000001",
            branchId: "branch-1"
        }
    );
});
