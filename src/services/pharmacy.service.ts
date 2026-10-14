import Medicine from "@/models/medicine.model";
import MedicineCategory from "@/models/medicine-category.model";
import PharmacyDispense from "@/models/pharmacy-dispense.model";
import Prescription from "@/models/prescription.model";

export type PharmacySalesGroupBy = "day" | "week" | "month";

export interface PharmacyStatsRange {
    /** Inclusive lower bound for the sales analytics window. */
    from?: Date;
    /** Inclusive upper bound for the sales analytics window. */
    to?: Date;
    /** Bucket granularity used to build the sales chart series. */
    groupBy?: PharmacySalesGroupBy;
}

export interface PharmacySalesBucket {
    /** ISO timestamp of the bucket start, stable React key. */
    key: string;
    /** Human readable bucket label, e.g. "05 Aug" or "Aug 2026". */
    label: string;
    /** Total collected amount for the bucket. */
    sales: number;
    /** Number of dispense bills in the bucket. */
    count: number;
}

export class PharmacyService {
    /**
     * Get aggregate statistics for the Pharmacy module
     */
    static async getPharmacyStats(range: PharmacyStatsRange = {}) {
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

        // Prescriptions
        const totalPrescriptions = await Prescription.countDocuments();
        const pendingPrescriptionsCount = await Prescription.countDocuments({
            dispenseStatus: { $in: ["PENDING", "PARTIAL", null] }
        });

        const totalCategories = await MedicineCategory.countDocuments({ isActive: true });

        // Customers who purchased medicines: distinct patient per dispense, falling
        // back to UHID or the recorded walk-in name when no patient is linked.
        const customerAggregate = await PharmacyDispense.aggregate([
            {
                $group: {
                    _id: { $ifNull: ["$patientId", { $ifNull: ["$uhid", "$patientName"] }] }
                }
            },
            { $count: "count" }
        ]);
        const totalCustomers = customerAggregate[0]?.count ?? 0;

        // Range sales analytics feeding the dashboard cards and chart.
        const from = range.from && !isNaN(range.from.getTime()) ? range.from : startOfToday;
        const to = range.to && !isNaN(range.to.getTime()) ? range.to : now;
        const groupBy: PharmacySalesGroupBy = range.groupBy ?? "day";

        const rangeDispenses = await PharmacyDispense.find({
            createdAt: { $gte: from, $lte: to }
        })
            .select("totalAmount createdAt")
            .lean();

        const rangeTotalSales = rangeDispenses.reduce(
            (acc, d) => acc + (d.totalAmount || 0),
            0
        );
        const salesSeries = PharmacyService.buildSalesSeries(rangeDispenses, from, to, groupBy);

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
            totalPrescriptions,
            totalCustomers,
            pendingPrescriptionsCount,
            totalCategories,
            range: {
                from: from.toISOString(),
                to: to.toISOString(),
                groupBy,
                totalSales: Math.round(rangeTotalSales),
                salesCount: rangeDispenses.length
            },
            salesSeries
        };
    }

    /**
     * Buckets dispense records into a continuous, zero-filled series so the chart
     * shows the shape of a quiet day as clearly as a busy one.
     */
    private static buildSalesSeries(
        dispenses: Array<{ totalAmount?: number; createdAt?: Date | string }>,
        from: Date,
        to: Date,
        groupBy: PharmacySalesGroupBy
    ): PharmacySalesBucket[] {
        const bucketOf = (value: Date): Date => {
            const bucket = new Date(value.getFullYear(), value.getMonth(), value.getDate());
            if (groupBy === "month") {
                bucket.setDate(1);
            } else if (groupBy === "week") {
                // Weeks start on Monday.
                bucket.setDate(bucket.getDate() - ((bucket.getDay() + 6) % 7));
            }
            return bucket;
        };

        const labelOf = (value: Date): string =>
            groupBy === "month"
                ? value.toLocaleDateString("en-IN", { month: "short", year: "numeric" })
                : value.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

        const series: PharmacySalesBucket[] = [];
        const indexByKey = new Map<number, number>();

        const cursor = bucketOf(from);
        const lastBucket = bucketOf(to);
        let guard = 0;
        while (cursor <= lastBucket && guard < 400) {
            const time = cursor.getTime();
            indexByKey.set(time, series.length);
            series.push({
                key: new Date(time).toISOString(),
                label: labelOf(cursor),
                sales: 0,
                count: 0
            });

            if (groupBy === "month") cursor.setMonth(cursor.getMonth() + 1);
            else if (groupBy === "week") cursor.setDate(cursor.getDate() + 7);
            else cursor.setDate(cursor.getDate() + 1);
            guard++;
        }

        for (const dispense of dispenses) {
            if (!dispense.createdAt) continue;
            const slot = indexByKey.get(bucketOf(new Date(dispense.createdAt)).getTime());
            if (slot === undefined) continue;
            series[slot].sales += dispense.totalAmount || 0;
            series[slot].count += 1;
        }

        return series.map((bucket) => ({ ...bucket, sales: Math.round(bucket.sales) }));
    }

    /**
     * Create a new Dispense transaction & atomically deduct medicine stock
     */
    static async createDispense(data: any) {
        // Auto-generate bill number if not supplied
        if (!data.billNumber) {
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
            const randomSuffix = Math.floor(1000 + Math.random() * 9000);
            data.billNumber = `PHARM-${dateStr}-${randomSuffix}`;
        }

        // 1. Check and decrement stock for each item
        if (data.items && Array.isArray(data.items)) {
            for (const item of data.items) {
                if (item.medicineId && item.quantity > 0) {
                    await Medicine.findByIdAndUpdate(item.medicineId, {
                        $inc: { stockQuantity: -item.quantity }
                    });
                }
            }
        }

        // 2. If linked to a prescription, mark prescription as DISPENSED
        if (data.prescriptionId) {
            await Prescription.findByIdAndUpdate(data.prescriptionId, {
                dispenseStatus: "DISPENSED",
                dispensedAt: new Date(),
                dispensedBy: data.dispensedBy || null
            });
        }

        // 3. Create Dispense Record
        const dispense = await PharmacyDispense.create(data);
        return dispense;
    }

    static async getAllDispenses(filter: any = {}, limit?: number) {
        let query = PharmacyDispense.find(filter)
            .populate("prescriptionId")
            .sort({ createdAt: -1 });
        if (limit && limit > 0) query = query.limit(Math.floor(limit));
        return query;
    }

    static async getDispenseById(id: string) {
        return PharmacyDispense.findById(id).populate("prescriptionId");
    }

    /**
     * Adjust stock directly (Stock-In or Stock-Out / Disposal)
     */
    static async adjustStock(medicineId: string, quantityChange: number, notes?: string) {
        const medicine = await Medicine.findById(medicineId);
        if (!medicine) throw new Error("Medicine not found");

        const newQuantity = Math.max(0, (medicine.stockQuantity || 0) + quantityChange);
        medicine.stockQuantity = newQuantity;
        await medicine.save();
        return medicine;
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
