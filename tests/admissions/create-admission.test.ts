import assert from "node:assert/strict";
import test from "node:test";
import { ClientSession, Types } from "mongoose";
import { CreateAdmissionDto } from "@/dto/admission.dto";
import { admissionErrorDetails } from "@/services/admission-errors";
import { AdmissionPersistence } from "@/services/admission.persistence";
import { AdmissionService } from "@/services/admission.service";
import { AdmissionRepository } from "@/repositories/admission.repository";

function makeHarness(options: {
    active?: boolean;
    bedStatus?: string;
    patientMissing?: boolean;
    doctorMissing?: boolean;
    bedMissing?: boolean;
    createFails?: boolean;
} = {}) {
    const state = {
        active: options.active ?? false,
        bedStatus: options.bedStatus ?? "AVAILABLE",
        created: [] as Array<Record<string, unknown>>,
        sequence: 0,
        rolledBack: false
    };

    const persistence: AdmissionPersistence = {
        async withTransaction(operation) {
            const before = {
                active: state.active,
                bedStatus: state.bedStatus,
                created: [...state.created],
                sequence: state.sequence
            };
            try {
                return await operation({} as ClientSession);
            } catch (error) {
                state.active = before.active;
                state.bedStatus = before.bedStatus;
                state.created = before.created;
                state.sequence = before.sequence;
                state.rolledBack = true;
                throw error;
            }
        },
        async patientExists() { return !options.patientMissing; },
        async doctorExists() { return !options.doctorMissing; },
        async activeAdmissionExists() { return state.active; },
        async findBed() { return options.bedMissing ? null : { status: state.bedStatus }; },
        async occupyAvailableBed() {
            if (state.bedStatus !== "AVAILABLE") return false;
            state.bedStatus = "OCCUPIED";
            return true;
        },
        async nextIpdNumber(year) {
            state.sequence += 1;
            return `IPD-${year}-${String(state.sequence).padStart(4, "0")}`;
        },
        async createAdmission(data) {
            if (options.createFails) throw new Error("simulated insert failure");
            const admission = { ...data, _id: new Types.ObjectId() };
            state.created.push(admission);
            state.active = true;
            return admission;
        }
    };

    const repository = {
        async findById(id: Types.ObjectId) {
            return state.created.find((entry) => String(entry._id) === String(id)) || null;
        }
    } as unknown as AdmissionRepository;

    return { service: new AdmissionService(repository, persistence), state };
}

function validAdmission(): CreateAdmissionDto {
    return {
        patientId: new Types.ObjectId().toString(),
        doctorId: new Types.ObjectId().toString(),
        bedId: new Types.ObjectId().toString(),
        admissionDate: "2026-10-14T10:00:00.000Z",
        status: "DISCHARGED",
        ipdNumber: "CLIENT-SUPPLIED",
        admittedBy: new Types.ObjectId().toString()
    };
}

test("create rejects a patient with an active admission", async () => {
    const { service, state } = makeHarness({ active: true });
    await assert.rejects(
        service.createAdmission(validAdmission(), new Types.ObjectId()),
        (error: { statusCode?: number }) => error.statusCode === 409
    );
    assert.equal(state.created.length, 0);
});

test("create rejects a bed that is occupied", async () => {
    const { service, state } = makeHarness({ bedStatus: "OCCUPIED" });
    await assert.rejects(
        service.createAdmission(validAdmission(), new Types.ObjectId()),
        (error: { statusCode?: number }) => error.statusCode === 409
    );
    assert.equal(state.created.length, 0);
});

test("create returns 404 when a referenced patient, doctor, or bed does not exist", async () => {
    for (const options of [{ patientMissing: true }, { doctorMissing: true }, { bedMissing: true }]) {
        const { service } = makeHarness(options);
        await assert.rejects(
            service.createAdmission(validAdmission(), new Types.ObjectId()),
            (error: { statusCode?: number }) => error.statusCode === 404
        );
    }
});

test("create assigns the IPD number and admitting user from server data", async () => {
    const { service, state } = makeHarness();
    const actor = new Types.ObjectId();
    const admission = await service.createAdmission(validAdmission(), actor);
    const stored = state.created[0];

    assert.equal(admission.ipdNumber, "IPD-2026-0001");
    assert.equal(String(stored.admittedBy), actor.toString());
    assert.equal(stored.status, "ADMITTED");
    assert.equal(stored.ipdNumber, "IPD-2026-0001");
    assert.equal(state.bedStatus, "OCCUPIED");
});

test("create rolls back bed, admission and counter changes on insert failure", async () => {
    const { service, state } = makeHarness({ createFails: true });
    await assert.rejects(service.createAdmission(validAdmission(), new Types.ObjectId()));
    assert.equal(state.rolledBack, true);
    assert.equal(state.bedStatus, "AVAILABLE");
    assert.equal(state.created.length, 0);
    assert.equal(state.sequence, 0);
});

test("controller error mapping preserves status codes from thrown plain objects", () => {
    assert.deepEqual(
        admissionErrorDetails({ statusCode: 409, message: "Bed is not available" }, "Fallback"),
        { message: "Bed is not available", statusCode: 409 }
    );
});
