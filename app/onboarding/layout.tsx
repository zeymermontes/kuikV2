import { StaffIntlProvider } from '@/components/intl/StaffIntlProvider';

// Onboarding is a client page that uses translations, and the root layout no
// longer supplies them (see app/layout.tsx). This is its intl boundary.
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <StaffIntlProvider>{children}</StaffIntlProvider>;
}
