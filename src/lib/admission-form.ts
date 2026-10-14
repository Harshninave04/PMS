export interface AdmissionPatientOption {
    _id: string;
    name?: string;
    uhid?: string;
    contact?: string;
    gender?: string;
    age?: number;
}

export interface AdmissionBedOption {
    _id: string;
    status: string;
    roomId?: { wardId?: { wardType?: string } | string } | string;
}

export interface AdmissionFormValues {
    patientId: string;
    doctorId: string;
    bedId: string;
    admissionDate: string;
    admissionType: string;
    wardType: string;
    admissionSource: string;
    paymentType: string;
    advanceDeposit: string;
    consentSigned: boolean;
    reasonForAdmission: string;
    notes: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    emergencyContactRelation: string;
    insuranceProvider: string;
    insurancePolicyNumber: string;
}

export function filterAdmissionPatients<T extends AdmissionPatientOption>(patients: T[], query: string): T[] {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return patients;
    return patients.filter((patient) =>
        [patient.name, patient.uhid, patient.contact]
            .some((value) => String(value || "").toLocaleLowerCase().includes(normalized))
    );
}

export function filterAvailableAdmissionBeds<T extends AdmissionBedOption>(beds: T[], wardType: string): T[] {
    return beds.filter((bed) => {
        const room = typeof bed.roomId === "object" && bed.roomId ? bed.roomId : undefined;
        const ward = room && typeof room.wardId === "object" && room.wardId ? room.wardId : undefined;
        return bed.status === "AVAILABLE" && ward?.wardType === wardType;
    });
}

export function buildAdmissionCreatePayload(
    form: AdmissionFormValues,
    emergencyMode: boolean,
    now: Date = new Date()
) {
    const payload: Record<string, unknown> = {
        patientId: form.patientId,
        doctorId: form.doctorId,
        bedId: form.bedId,
        admissionDate: new Date(form.admissionDate || now).toISOString(),
        admissionType: emergencyMode ? "EMERGENCY" : form.admissionType,
        wardType: form.wardType,
        admissionSource: emergencyMode ? "EMERGENCY" : form.admissionSource,
        paymentType: form.paymentType || undefined,
        consentSigned: form.consentSigned,
        consentPending: emergencyMode && !form.consentSigned,
        reasonForAdmission: form.reasonForAdmission,
        notes: form.notes
    };

    if (form.advanceDeposit.trim()) payload.advanceDeposit = Number(form.advanceDeposit);
    if (form.emergencyContactName || form.emergencyContactPhone || form.emergencyContactRelation) {
        payload.emergencyContact = {
            name: form.emergencyContactName,
            phone: form.emergencyContactPhone,
            relation: form.emergencyContactRelation
        };
    }
    if (form.paymentType === "INSURANCE" && (form.insuranceProvider || form.insurancePolicyNumber)) {
        payload.insurance = {
            provider: form.insuranceProvider,
            policyNumber: form.insurancePolicyNumber
        };
    }
    return payload;
}

export function buildQuickPatientPayload(
    patient: { name: string; age: string; gender: string; phone: string },
    branchId: string
) {
    return {
        name: patient.name.trim(),
        age: Number(patient.age),
        gender: patient.gender,
        contact: patient.phone.trim(),
        bloodGroup: "O+",
        address: "Not provided during admission registration",
        emergencyContact: patient.phone.trim(),
        branchId
    };
}
