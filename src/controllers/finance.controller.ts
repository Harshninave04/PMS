import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import defaultFinanceService, { FinanceService } from "@/services/finance.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export class FinanceController {
    constructor(private financeService: FinanceService = defaultFinanceService) { }

    async getStats(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.BILLING_INVOICE_VIEW, "Invoice");
            if (!auth.isAuthorized) return auth.response;

            const stats = await this.financeService.getFinanceStats();
            return NextResponse.json({ success: true, data: stats }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch finance statistics";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

    async getOutstanding(request: NextRequest): Promise<NextResponse> {
        try {
            await dbConnect();
            const auth = await authorizeRequest(request, PERMISSION_KEYS.BILLING_INVOICE_VIEW, "Invoice");
            if (!auth.isAuthorized) return auth.response;

            const data = await this.financeService.getOutstandingDues();
            return NextResponse.json({ success: true, data }, { status: 200 });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to fetch outstanding dues";
            return NextResponse.json({ success: false, message }, { status: 500 });
        }
    }

}

const financeController = new FinanceController();
export default financeController;
