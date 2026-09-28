import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import defaultInsuranceService, { InsuranceService } from "@/services/insurance.service";
import { authorizeRequest } from "@/lib/rbac/guard";
import { PERMISSION_KEYS } from "@/types/rbac";

export class InsuranceController {
  constructor(private service: InsuranceService = defaultInsuranceService) { }

  // Stats
  async getStats(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_CLAIM_VIEW, "InsuranceClaim");
      if (!auth.isAuthorized) return auth.response;

      const stats = await this.service.getInsuranceStats();
      return NextResponse.json({ success: true, data: stats }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch insurance stats";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Providers
  async getProviders(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_POLICY_VIEW, "InsuranceProvider");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const activeOnly = searchParams.get('activeOnly');
      const organizationId = searchParams.get('organizationId');

      const query: Record<string, unknown> = {};
      if (activeOnly === 'true') query.active = true;
      if (organizationId && Types.ObjectId.isValid(organizationId)) query.organizationId = new Types.ObjectId(organizationId);

      const providers = await this.service.getInsuranceProviders(query);
      return NextResponse.json({ success: true, count: providers.length, data: providers }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch providers";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async createProvider(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_POLICY_MANAGE, "InsuranceProvider");
      if (!auth.isAuthorized) return auth.response;

      const body = await request.json();
      if (!body.name) {
        return NextResponse.json({ success: false, message: "Provider name is required" }, { status: 400 });
      }
      const provider = await this.service.createInsuranceProvider(body);
      return NextResponse.json({ success: true, message: "Insurance Provider empanelled successfully", data: provider }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create provider";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async getProviderById(id: string, request?: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      if (request) {
        const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_POLICY_VIEW, "InsuranceProvider");
        if (!auth.isAuthorized) return auth.response;
      }

      if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json({ success: false, message: "Invalid provider ID" }, { status: 400 });
      }
      const provider = await this.service.getInsuranceProviderById(id);
      if (!provider) {
        return NextResponse.json({ success: false, message: "Provider not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: provider }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch provider";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async updateProvider(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_POLICY_MANAGE, "InsuranceProvider");
      if (!auth.isAuthorized) return auth.response;

      if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json({ success: false, message: "Invalid provider ID" }, { status: 400 });
      }
      const body = await request.json();
      const updated = await this.service.updateInsuranceProvider(id, body);
      return NextResponse.json({ success: true, message: "Provider updated", data: updated }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update provider";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Policies
  async getPolicies(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_POLICY_VIEW, "InsurancePolicy");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const patientId = searchParams.get('patientId');
      const providerId = searchParams.get('providerId');

      const query: Record<string, unknown> = {};
      if (patientId && Types.ObjectId.isValid(patientId)) query.patientId = new Types.ObjectId(patientId);
      if (providerId && Types.ObjectId.isValid(providerId)) query.providerId = new Types.ObjectId(providerId);

      const policies = await this.service.getInsurancePolicies(query);
      return NextResponse.json({ success: true, count: policies.length, data: policies }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch policies";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async createPolicy(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_POLICY_MANAGE, "InsurancePolicy");
      if (!auth.isAuthorized) return auth.response;

      const body = await request.json();
      if (!body.policyNumber || !body.patientId || !body.providerId || body.coverageAmount === undefined) {
        return NextResponse.json({ success: false, message: "Policy number, patient, provider, and coverage amount are required" }, { status: 400 });
      }
      const policy = await this.service.createInsurancePolicy(body);
      return NextResponse.json({ success: true, message: "Patient policy registered", data: policy }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create policy";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async getPolicyById(id: string, request?: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      if (request) {
        const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_POLICY_VIEW, "InsurancePolicy");
        if (!auth.isAuthorized) return auth.response;
      }

      if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json({ success: false, message: "Invalid policy ID" }, { status: 400 });
      }
      const policy = await this.service.getInsurancePolicyById(id);
      if (!policy) {
        return NextResponse.json({ success: false, message: "Policy not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: policy }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch policy";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async updatePolicy(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_POLICY_MANAGE, "InsurancePolicy");
      if (!auth.isAuthorized) return auth.response;

      if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json({ success: false, message: "Invalid policy ID" }, { status: 400 });
      }
      const body = await request.json();
      const updated = await this.service.updateInsurancePolicy(id, body);
      return NextResponse.json({ success: true, message: "Policy updated", data: updated }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update policy";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Eligibility Verification
  async verifyEligibility(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_POLICY_VIEW, "InsurancePolicy");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const memberId = searchParams.get('memberId') || undefined;
      const policyNumber = searchParams.get('policyNumber') || undefined;
      const patientId = searchParams.get('patientId') || undefined;

      if (!memberId && !policyNumber && !patientId) {
        return NextResponse.json({ success: false, message: "Provide memberId, policyNumber, or patientId" }, { status: 400 });
      }

      const result = await this.service.verifyEligibility({ memberId, policyNumber, patientId });
      return NextResponse.json({ success: true, data: result }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to verify eligibility";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Pre-Authorizations
  async getPreauths(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_CLAIM_VIEW, "InsurancePreauth");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const status = searchParams.get('status');
      const patientId = searchParams.get('patientId');

      const query: Record<string, unknown> = {};
      if (status) query.status = status;
      if (patientId && Types.ObjectId.isValid(patientId)) query.patientId = new Types.ObjectId(patientId);

      const preauths = await this.service.getInsurancePreauths(query);
      return NextResponse.json({ success: true, count: preauths.length, data: preauths }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch preauths";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async createPreauth(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_CLAIM_CREATE, "InsurancePreauth");
      if (!auth.isAuthorized) return auth.response;

      const body = await request.json();
      if (!body.patientId || !body.providerId || body.requestedAmount === undefined || !body.diagnosis) {
        return NextResponse.json({ success: false, message: "Patient, provider, diagnosis, and requested amount are required" }, { status: 400 });
      }
      const preauth = await this.service.createInsurancePreauth(body);
      return NextResponse.json({ success: true, message: "Pre-Authorization submitted", data: preauth }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create preauth";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async updatePreauth(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_CLAIM_SUBMIT, "InsurancePreauth");
      if (!auth.isAuthorized) return auth.response;

      if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json({ success: false, message: "Invalid preauth ID" }, { status: 400 });
      }
      const body = await request.json();
      const updated = await this.service.updateInsurancePreauthStatus(id, body);
      return NextResponse.json({ success: true, message: "Pre-auth updated", data: updated }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update preauth";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Claims
  async getClaims(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_CLAIM_VIEW, "InsuranceClaim");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const status = searchParams.get('status');
      const providerId = searchParams.get('providerId');
      const patientId = searchParams.get('patientId');

      const query: Record<string, unknown> = {};
      if (status) query.status = status;
      if (providerId && Types.ObjectId.isValid(providerId)) query.providerId = new Types.ObjectId(providerId);
      if (patientId && Types.ObjectId.isValid(patientId)) query.patientId = new Types.ObjectId(patientId);

      const claims = await this.service.getInsuranceClaims(query);
      return NextResponse.json({ success: true, count: claims.length, data: claims }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch claims";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async createClaim(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_CLAIM_CREATE, "InsuranceClaim");
      if (!auth.isAuthorized) return auth.response;

      const body = await request.json();
      if (!body.patientId || !body.providerId || body.amountClaimed === undefined) {
        return NextResponse.json({ success: false, message: "Patient, provider, and amountClaimed are required" }, { status: 400 });
      }
      const claim = await this.service.createInsuranceClaim(body);
      return NextResponse.json({ success: true, message: "Claim created successfully", data: claim }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create claim";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async getClaimById(id: string, request?: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      if (request) {
        const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_CLAIM_VIEW, "InsuranceClaim");
        if (!auth.isAuthorized) return auth.response;
      }

      if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json({ success: false, message: "Invalid claim ID" }, { status: 400 });
      }
      const claim = await this.service.getInsuranceClaimById(id);
      if (!claim) {
        return NextResponse.json({ success: false, message: "Claim not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: claim }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch claim";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async updateClaim(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_CLAIM_SUBMIT, "InsuranceClaim");
      if (!auth.isAuthorized) return auth.response;

      if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json({ success: false, message: "Invalid claim ID" }, { status: 400 });
      }
      const body = await request.json();
      const updated = await this.service.updateInsuranceClaim(id, body);
      return NextResponse.json({ success: true, message: "Claim updated", data: updated }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update claim";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Documents
  async getDocuments(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_CLAIM_VIEW, "InsuranceDocument");
      if (!auth.isAuthorized) return auth.response;

      const { searchParams } = new URL(request.url);
      const claimId = searchParams.get('claimId');
      const patientId = searchParams.get('patientId');

      const query: Record<string, unknown> = {};
      if (claimId && Types.ObjectId.isValid(claimId)) query.claimId = new Types.ObjectId(claimId);
      if (patientId && Types.ObjectId.isValid(patientId)) query.patientId = new Types.ObjectId(patientId);

      const docs = await this.service.getInsuranceDocuments(query);
      return NextResponse.json({ success: true, count: docs.length, data: docs }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch documents";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async createDocument(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_CLAIM_CREATE, "InsuranceDocument");
      if (!auth.isAuthorized) return auth.response;

      const body = await request.json();
      if (!body.patientId || !body.documentName || !body.fileUrl) {
        return NextResponse.json({ success: false, message: "Patient, document name, and file URL are required" }, { status: 400 });
      }
      const doc = await this.service.createInsuranceDocument(body);
      return NextResponse.json({ success: true, message: "Document uploaded to claim repository", data: doc }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to upload document";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  async verifyDocument(request: NextRequest, id: string): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_CLAIM_ADJUDICATE, "InsuranceDocument");
      if (!auth.isAuthorized) return auth.response;

      if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json({ success: false, message: "Invalid document ID" }, { status: 400 });
      }
      const body = await request.json();
      const verified = await this.service.verifyInsuranceDocument(id, body.verifiedBy || "TPA Medical Auditor");
      return NextResponse.json({ success: true, message: "Document verified", data: verified }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to verify document";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Submission Batching
  async createSubmissionBatch(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_CLAIM_SUBMIT, "InsuranceClaim");
      if (!auth.isAuthorized) return auth.response;

      const body = await request.json();
      if (!body.claimIds || !Array.isArray(body.claimIds) || body.claimIds.length === 0) {
        return NextResponse.json({ success: false, message: "Array of claimIds is required" }, { status: 400 });
      }
      const result = await this.service.createSubmissionBatch(body.claimIds, body.batchName);
      return NextResponse.json({ success: true, message: "Submission batch compiled and dispatched", data: result }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create submission batch";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Settlement
  async recordSettlement(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_CLAIM_ADJUDICATE, "InsuranceClaim");
      if (!auth.isAuthorized) return auth.response;

      const body = await request.json();
      if (!body.claimId || body.amountSettled === undefined) {
        return NextResponse.json({ success: false, message: "Claim ID and amountSettled are required" }, { status: 400 });
      }
      const result = await this.service.recordClaimSettlement(body.claimId, body);
      return NextResponse.json({ success: true, message: "Claim settlement recorded", data: result }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to record settlement";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  // Reports
  async getReports(request: NextRequest): Promise<NextResponse> {
    try {
      await dbConnect();
      const auth = await authorizeRequest(request, PERMISSION_KEYS.INSURANCE_CLAIM_VIEW, "InsuranceClaim");
      if (!auth.isAuthorized) return auth.response;

      const reports = await this.service.getInsuranceReports();
      return NextResponse.json({ success: true, data: reports }, { status: 200 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to generate insurance reports";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }
}

const insuranceController = new InsuranceController();
export default insuranceController;
