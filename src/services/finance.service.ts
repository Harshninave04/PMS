import InvoiceModel from "@/models/invoice.model";
import PaymentModel from "@/models/payment.model";
import "@/models/patient.model"; // Ensure Patient model is registered for populate

export class FinanceService {
    async getFinanceStats() {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // Fetch Invoices
        const invoices = await InvoiceModel.find({ status: { $ne: "CANCELLED" } }).lean();
        
        let totalInvoiced = 0;
        let totalOutstanding = 0;
        let paidCount = 0;
        let unpaidCount = 0;
        let partialCount = 0;
        const departmentMap: Record<string, number> = {};

        for (const inv of invoices) {
            const finalAmt = Number(inv.finalAmount || 0);
            const paidAmt = Number(inv.paidAmount || (inv.status === "PAID" ? finalAmt : 0));
            const balanceAmt = Number(inv.balanceAmount ?? (finalAmt - paidAmt));

            totalInvoiced += finalAmt;

            if (inv.status === "PAID") {
                paidCount++;
            } else if (inv.status === "PARTIALLY_PAID") {
                partialCount++;
                totalOutstanding += balanceAmt;
            } else {
                unpaidCount++;
                totalOutstanding += balanceAmt;
            }

            const dept = inv.department || "General";
            departmentMap[dept] = (departmentMap[dept] || 0) + finalAmt;
        }

        // Fetch Payments
        const payments = await PaymentModel.find().lean();
        let totalCollected = 0;
        let todayCollections = 0;
        const methodMap: Record<string, number> = {
            CASH: 0,
            CARD: 0,
            UPI: 0,
            BANK_TRANSFER: 0,
            CHEQUE: 0,
            INSURANCE_TPA: 0
        };

        for (const pay of payments) {
            const amt = Number(pay.amount || 0);
            totalCollected += amt;

            const payDate = pay.date ? new Date(pay.date) : new Date((pay as any).createdAt);
            if (payDate >= todayStart) {
                todayCollections += amt;
            }

            const m = pay.method || "CASH";
            methodMap[m] = (methodMap[m] || 0) + amt;
        }

        // Recent Transactions (latest 6)
        const recentPayments = await PaymentModel.find()
            .populate("patientId", "name uhid contact")
            .populate("invoiceId", "invoiceNumber finalAmount department")
            .sort({ createdAt: -1 })
            .limit(6)
            .lean();

        return {
            totalInvoiced,
            totalCollected,
            totalOutstanding,
            todayCollections,
            counts: {
                totalInvoices: invoices.length,
                paid: paidCount,
                unpaid: unpaidCount,
                partiallyPaid: partialCount
            },
            departmentRevenue: departmentMap,
            paymentModeDistribution: methodMap,
            recentPayments
        };
    }

    async getOutstandingDues() {
        const unpaidInvoices = await InvoiceModel.find({
            status: { $in: ["UNPAID", "PARTIALLY_PAID"] }
        })
            .populate("patientId", "name uhid contact address")
            .sort({ createdAt: 1 })
            .lean();

        const now = new Date().getTime();
        const bucket0To30: any[] = [];
        const bucket31To60: any[] = [];
        const bucket61To90: any[] = [];
        const bucketOver90: any[] = [];

        let total0To30 = 0;
        let total31To60 = 0;
        let total61To90 = 0;
        let totalOver90 = 0;
        let grandTotalOutstanding = 0;

        for (const inv of unpaidInvoices) {
            const finalAmt = Number(inv.finalAmount || 0);
            const paidAmt = Number(inv.paidAmount || 0);
            const balance = Number(inv.balanceAmount ?? (finalAmt - paidAmt));

            if (balance <= 0) continue;

            grandTotalOutstanding += balance;

            const createdTime = new Date((inv as any).createdAt).getTime();
            const ageDays = Math.floor((now - createdTime) / (1000 * 60 * 60 * 24));
            const enriched = { ...inv, calculatedBalance: balance, ageDays };

            if (ageDays <= 30) {
                bucket0To30.push(enriched);
                total0To30 += balance;
            } else if (ageDays <= 60) {
                bucket31To60.push(enriched);
                total31To60 += balance;
            } else if (ageDays <= 90) {
                bucket61To90.push(enriched);
                total61To90 += balance;
            } else {
                bucketOver90.push(enriched);
                totalOver90 += balance;
            }
        }

        return {
            grandTotalOutstanding,
            buckets: {
                bucket0To30: { items: bucket0To30, total: total0To30, count: bucket0To30.length },
                bucket31To60: { items: bucket31To60, total: total31To60, count: bucket31To60.length },
                bucket61To90: { items: bucket61To90, total: total61To90, count: bucket61To90.length },
                bucketOver90: { items: bucketOver90, total: totalOver90, count: bucketOver90.length }
            },
            allOutstanding: [...bucketOver90, ...bucket61To90, ...bucket31To60, ...bucket0To30]
        };
    }

}

export default new FinanceService();
