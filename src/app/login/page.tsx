import LoginForm from "@/components/auth/login-form";
import { SoftwareMetadataService } from "@/services/software-metadata.service";

/**
 * Resolved on the server for every request: the login screen is the first
 * place the product name and logo appear, and it is reachable without a
 * session, so it cannot read the settings API.
 */
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const branding = await SoftwareMetadataService.getBranding();
  return <LoginForm branding={branding} />;
}
