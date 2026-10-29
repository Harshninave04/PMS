import LoginForm from "@/components/auth/login-form";

/**
 * The root layout loads the hospital profile and provides it to this public page.
 */
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  return <LoginForm />;
}
