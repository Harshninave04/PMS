import { Types } from "mongoose";
import Medicine from "@/models/medicine.model";
import MedicineCategory from "@/models/medicine-category.model";
import PharmacyDispense from "@/models/pharmacy-dispense.model";
import Prescription from "@/models/prescription.model";

/** Money is rounded to paise at every boundary so totals cannot drift. */
function round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Creates the dispense, generating a bill number when the client did not
 * supply one. `billNumber` carries a unique index, so a collision with a
 * generated number is retried instead of surfacing as a duplicate key error.
 */
async function createDispenseWithBillNumber(record: Record<string, any>, requested?: string) {
    if (requested) {
        record.billNumber = requested;
        return await PharmacyDispense.create(record);
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const suffix = Math.floor(1000 + Math.random() * 9000);
        const billNumber = `PHARM-${dateStr}-${suffix}`;

        const taken = await PharmacyDispense.exists({ billNumber });
        if (taken) continue;

        record.billNumber = billNumber;
        return await PharmacyDispense.create(record);
    }

    throw { statusCode: 503, message: "Could not allocate a bill number, please retry" };
}

/** A dispense line after it has been priced from the live Medicine record. */
interface PricedLine {
    medicineId: Types.ObjectId;
    medicineName: string;
    batchNumber?: string;
    dosageForm?: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    gstPercent: number;
    totalAmount: number;
}

export class PharmacyService {
    /**
     * Get aggregate statistics for the Pharmacy module
     */
    static async getPharmacyStats() {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

        // Medicines & Stock
        const medicines = await Medicine.find({ isActive: true });
        const totalMedicines = medicines.length;

        let totalStockValuation = 0;
        let lowStockCount = 0;
        let outOfStockCount = 0;
        let expiredCount = 0;
        let expiringIn30DaysCount = 0;
        let expiringIn90DaysCount = 0;

        for (const med of medicines) {
            const stock = med.stockQuantity || 0;
            const price = med.unitPrice || 0;
            totalStockValuation += stock * price;

            if (stock === 0) outOfStockCount++;
            else if (stock <= (med.reorderLevel || 10)) lowStockCount++;

            if (med.expiryDate) {
                const exp = new Date(med.expiryDate);
                if (exp < now) expiredCount++;
                else if (exp <= thirtyDaysFromNow) expiringIn30DaysCount++;
                else if (exp <= ninetyDaysFromNow) expiringIn90DaysCount++;
            }
        }

        // Dispenses & Revenue
        const todayDispenses = await PharmacyDispense.find({
            createdAt: { $gte: startOfToday }
        });
        const todayDispensedCount = todayDispenses.length;
        const todayRevenue = todayDispenses.reduce((acc, d) => acc + (d.totalAmount || 0), 0);

        const totalDispensesCount = await PharmacyDispense.countDocuments();
        const allDispenses = await PharmacyDispense.find().select("totalAmount");
        const totalRevenue = allDispenses.reduce((acc, d) => acc + (d.totalAmount || 0), 0);

        // Prescriptions pending dispense
        const pendingPrescriptionsCount = await Prescription.countDocuments({
            dispenseStatus: { $in: ["PENDING", "PARTIAL", null] }
        });

        const totalCategories = await MedicineCategory.countDocuments({ isActive: true });

        return {
            totalMedicines,
            totalStockValuation: Math.round(totalStockValuation),
            lowStockCount,
            outOfStockCount,
            expiredCount,
            expiringIn30DaysCount,
            expiringIn90DaysCount,
            todayDispensedCount,
            todayRevenue: Math.round(todayRevenue),
            totalDispensesCount,
            totalRevenue: Math.round(totalRevenue),
            pendingPrescriptionsCount,
            totalCategories
        };
    }

/**
     * Dispenses a prescription or ad-hoc sale.
     *
     * Everything that matters is recomputed server-side: prices come from the
     * Medicine document rather than the request body, and subtotal/discount/tax
     * are derived here. A client that posts its own `totalAmount` (or price)
     * is therefore unable to change what the patient is charged.
     *
     * Stock is decremented with a conditional update, so a dispense can never
     * drive a medicine negative, and the compensation path restores *only* the
     * items this call actually took. Restoring the whole request instead would
     * hand back stock that was never consumed.
     */
    static async createDispense(data: any, dispensedBy?: string) {
        const items = Array.isArray(data?.items) ? data.items : [];

        if (items.length === 0) {
            throw { statusCode: 400, message: "A dispense must contain at least one item" };
        }

        // Aggregate by medicine: a request listing the same medicine twice must
        // still only be validated against, and deducted from, its true total.
        const requested = new Map<string, number>();
        for (const item of items) {
            const medicineId = String(item?.medicineId ?? "");
            const quantity = Number(item?.quantity);

            if (!Types.ObjectId.isValid(medicineId)) {
                throw { statusCode: 400, message: "Every dispense line needs a valid medicine" };
            }
            if (!Number.isInteger(quantity) || quantity < 1) {
                throw { statusCode: 400, message: "Every dispense line needs a whole quantity of at least 1" };
            }

            requested.set(medicineId, (requested.get(medicineId) ?? 0) + quantity);
        }

        // Authoritative catalogue data for the lines being sold.
        const medicines = await Medicine.find({ _id: { $in: [...requested.keys()] } });
        const byId = new Map(medicines.map((med) => [med._id.toString(), med]));

        const now = new Date();
        const priced: PricedLine[] = items.map((item: any) => {
            const medicineId = String(item.medicineId);
            const medicine = byId.get(medicineId);

            if (!medicine) {
                throw { statusCode: 404, message: "Medicine not found" };
            }
            if (medicine.expiryDate && medicine.expiryDate < now) {
                throw {
                    statusCode: 409,
                    message: `${medicine.name} expired on ${medicine.expiryDate.toISOString().slice(0, 10)} and cannot be dispensed`
                };
            }

            const quantity = Number(item.quantity);
            const unitPrice = Number(medicine.unitPrice) || 0;
            const discountPercent = Math.min(100, Math.max(0, Number(item.discountPercent) || 0));
            const gstPercent = Math.min(100, Math.max(0, Number(item.gstPercent ?? 12)));

            const gross = unitPrice * quantity;
            const afterDiscount = gross * (1 - discountPercent / 100);
            const tax = afterDiscount * (gstPercent / 100);

            return {
                medicineId: medicine._id,
                medicineName: medicine.name,
                batchNumber: item.batchNumber ?? medicine.batchNumber,
                dosageForm: item.dosageForm ?? medicine.dosageForm ?? "TABLET",
                quantity,
                unitPrice,
                discountPercent,
                gstPercent,
                totalAmount: round2(afterDiscount + tax)
            };
        });

        const subtotal = round2(priced.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
        const discountAmount = round2(
            priced.reduce(
                (sum, item) => sum + (item.unitPrice * item.quantity * item.discountPercent) / 100,
                0
            )
        );
        const taxAmount = round2(priced.reduce((sum, item) => sum + item.totalAmount, 0) - (subtotal - discountAmount));
        const totalAmount = round2(priced.reduce((sum, item) => sum + item.totalAmount, 0));

        // Only the lines that survived validation may reach the stock write.
        const deductions = [...requested.entries()].map(([medicineId, quantity]) => ({
            medicineId,
            quantity,
            name: byId.get(medicineId)?.name ?? medicineId
        }));

        // Deduct, tracking precisely what was taken so a later failure can undo
        // exactly that much and no more.
        const applied: Array<{ medicineId: string; quantity: number }> = [];

        try {
            for (const line of deductions) {
                const decremented = await Medicine.findOneAndUpdate(
                    { _id: line.medicineId, stockQuantity: { $gte: line.quantity } },
                    { $inc: { stockQuantity: -line.quantity } },
                    { new: true }
                ).lean();

                if (!decremented) {
                    throw {
                        statusCode: 409,
                        message: `Insufficient stock for ${line.name}`
                    };
                }

                applied.push(line);
            }

            const record: Record<string, any> = {
                prescriptionId: data.prescriptionId,
                patientId: data.patientId,
                patientName: data.patientName,
                patientPhone: data.patientPhone,
                uhid: data.uhid,
                items: priced,
                subtotal,
                discountAmount,
                taxAmount,
                totalAmount,
                paymentMode: data.paymentMode ?? "CASH",
                paymentStatus: data.paymentStatus ?? "PAID",
                dispensedBy: dispensedBy ?? null,
                notes: data.notes
            };

            const created = await createDispenseWithBillNumber(record, data.billNumber);

            // Mark the prescription only once the sale is safely recorded, so a
            // dispense can never be marked done while no bill exists.
            if (created.prescriptionId) {
                await Prescription.findByIdAndUpdate(
                    created.prescriptionId,
                    {
                        dispenseStatus: "DISPENSED",
                        dispensedAt: new Date(),
                        dispensedBy: dispensedBy ?? null
                    },
                    { runValidators: true }
                );
            }

            return created;
        } catch (error) {
            // Compensate only what this call removed. An earlier version walked
            // the whole request here and inflated stock for lines that had not
            // been deducted yet.
            for (const line of applied) {
                await Medicine.findByIdAndUpdate(line.medicineId, {
                    $inc: { stockQuantity: line.quantity }
                });
            }
            throw error;
        }
    }

    static async getAllDispenses(filter: any = {}) {
        return PharmacyDispense.find(filter)
            .populate("prescriptionId")
            .sort({ createdAt: -1 });
    }

    static async getDispenseById(id: string) {
        return PharmacyDispense.findById(id).populate("prescriptionId");
    }

    /**
     * Adjusts stock directly (Stock-In, Stock-Out, Disposal).
     *
     * Uses a single conditional update instead of read-modify-write, so two
     * concurrent adjustments cannot overwrite each other, and refuses to
     * silently clamp a removal that exceeds the quantity on hand.
     */
    static async adjustStock(medicineId: string, quantityChange: number, notes?: string) {
        if (!Number.isInteger(quantityChange) || quantityChange === 0) {
            throw { statusCode: 400, message: "Stock adjustment must be a non-zero whole number" };
        }

        if (quantityChange > 0) {
            const updated = await Medicine.findByIdAndUpdate(
                medicineId,
                { $inc: { stockQuantity: quantityChange } },
                { new: true, runValidators: true }
            ).lean();

            if (!updated) throw { statusCode: 404, message: "Medicine not found" };
            return updated;
        }

        const removed = Math.abs(quantityChange);
        const updated = await Medicine.findOneAndUpdate(
            { _id: medicineId, stockQuantity: { $gte: removed } },
            { $inc: { stockQuantity: -removed } },
            { new: true, runValidators: true }
        ).lean();

        if (!updated) {
            throw { statusCode: 409, message: `Cannot remove ${removed} units: not enough stock on hand` };
        }

        return updated;
    }

    /**
     * Category Operations
     */
    static async getAllCategories() {
        return MedicineCategory.find().sort({ name: 1 });
    }

    static async createCategory(data: any) {
        return MedicineCategory.create(data);
    }

    static async updateCategory(id: string, data: any) {
        return MedicineCategory.findByIdAndUpdate(id, data, { new: true });
    }

    static async deleteCategory(id: string) {
        return MedicineCategory.findByIdAndDelete(id);
    }

    /**
     * Expiry analysis grouping
     */
    static async getExpiryAnalysis() {
        const now = new Date();
        const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

        const medicines = await Medicine.find({ isActive: true }).sort({ expiryDate: 1 });

        const expired: any[] = [];
        const critical30: any[] = [];
        const warning90: any[] = [];
        const good: any[] = [];

        for (const med of medicines) {
            if (!med.expiryDate) {
                good.push(med);
                continue;
            }
            const exp = new Date(med.expiryDate);
            if (exp < now) {
                expired.push(med);
            } else if (exp <= thirtyDays) {
                critical30.push(med);
            } else if (exp <= ninetyDays) {
                warning90.push(med);
            } else {
                good.push(med);
            }
        }

        return {
            expired,
            critical30,
            warning90,
            good
        };
    }
}

export default PharmacyService;
