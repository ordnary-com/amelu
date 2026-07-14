import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { SnackbarProvider } from "./context/SnackbarContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { MyOrganizationPage } from "./pages/MyOrganizationPage";
import { DomainsPage } from "./pages/DomainsPage";
import { NewDomainPage } from "./pages/NewDomainPage";
import { AllAddressesPage } from "./pages/AllAddressesPage";
import { MailboxesPage } from "./pages/MailboxesPage";
import { NewMailboxPage } from "./pages/NewMailboxPage";
import { MailboxOverviewPage } from "./pages/MailboxOverviewPage";
import { DeleteMailboxPage } from "./pages/DeleteMailboxPage";
import { MailboxRecentActivityPage } from "./pages/MailboxRecentActivityPage";
import { MailboxRecentLogsPage } from "./pages/MailboxRecentLogsPage";
import { MailboxUsageInstructionsPage } from "./pages/MailboxUsageInstructionsPage";
import { MailboxEnabledServicesPage } from "./pages/MailboxEnabledServicesPage";
import { MailboxPasswordPage } from "./pages/MailboxPasswordPage";
import { MailboxInternalAccessPage } from "./pages/MailboxInternalAccessPage";
import { MailboxIdentitiesPage } from "./pages/MailboxIdentitiesPage";
import { MailboxForwardingPage } from "./pages/MailboxForwardingPage";
import { MailboxDelegationPage } from "./pages/MailboxDelegationPage";
import { MailboxListingSettingsPage } from "./pages/MailboxListingSettingsPage";
import { MailboxAttachedNotesPage } from "./pages/MailboxAttachedNotesPage";
import { MailboxExpirationPage } from "./pages/MailboxExpirationPage";
import { MailboxLimitsPage } from "./pages/MailboxLimitsPage";
import { ImportMailboxesPage } from "./pages/ImportMailboxesPage";
import { NewAliasPage } from "./pages/NewAliasPage";
import { ImportAliasesPage } from "./pages/ImportAliasesPage";
import { DefaultServicesPage } from "./pages/DefaultServicesPage";
import { DefaultLimitsPage } from "./pages/DefaultLimitsPage";
import { DnsPage } from "./pages/DnsPage";
import { DeleteDomainPage } from "./pages/DeleteDomainPage";
import { AccountOverviewPage } from "./pages/AccountOverviewPage";
import { AccountGeneralPage } from "./pages/AccountGeneralPage";
import { AccountEmailPage } from "./pages/AccountEmailPage";
import { AccountPasswordPage } from "./pages/AccountPasswordPage";
import { AccountTerminatePage } from "./pages/AccountTerminatePage";
import { RecentActivityPage } from "./pages/RecentActivityPage";
import { AddressAliasesPage } from "./pages/AddressAliasesPage";
import { DomainAliasesPage } from "./pages/DomainAliasesPage";
import { NewDomainAliasPage } from "./pages/NewDomainAliasPage";
import { CatchallPage } from "./pages/CatchallPage";
import { DeactivateDomainPage } from "./pages/DeactivateDomainPage";
import { TransferOwnershipPage } from "./pages/TransferOwnershipPage";
import { ListingSettingsPage } from "./pages/ListingSettingsPage";
import { AttachedNotesPage } from "./pages/AttachedNotesPage";
import { PatternRewritesPage } from "./pages/PatternRewritesPage";
import { NewPatternRewritePage } from "./pages/NewPatternRewritePage";
import { BccCapturesPage } from "./pages/BccCapturesPage";
import { NewBccCapturePage } from "./pages/NewBccCapturePage";
import { SpamOverviewPage } from "./pages/SpamOverviewPage";
import { SpamAggressivenessPage } from "./pages/SpamAggressivenessPage";
import { SpamSenderListsPage } from "./pages/SpamSenderListsPage";
import { SpamRecipientDenylistPage } from "./pages/SpamRecipientDenylistPage";
import { SetPasswordPage } from "./pages/SetPasswordPage";
import { BillingOverviewPage } from "./pages/BillingOverviewPage";
import { BillingPlansPage } from "./pages/BillingPlansPage";
import { BillingInvoicesPage } from "./pages/BillingInvoicesPage";
import { ChangelogPage } from "./pages/ChangelogPage";
import { StatusPage } from "./pages/StatusPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SnackbarProvider>
          <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password/:token" element={<SetPasswordPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/organization" element={<MyOrganizationPage />} />
            <Route path="/billing/overview" element={<BillingOverviewPage />} />
            <Route path="/billing/plans" element={<BillingPlansPage />} />
            <Route path="/billing/invoices" element={<BillingInvoicesPage />} />
            <Route path="/changelog" element={<ChangelogPage />} />
            <Route path="/status" element={<StatusPage />} />

            <Route path="/domains" element={<DomainsPage />} />
            <Route path="/domains/new" element={<NewDomainPage />} />
            <Route path="/domains/:domainId" element={<AllAddressesPage />} />
            <Route path="/domains/:domainId/activity" element={<RecentActivityPage />} />
            <Route path="/domains/:domainId/mailboxes" element={<MailboxesPage />} />
            <Route path="/domains/:domainId/mailboxes/new" element={<NewMailboxPage />} />
            <Route path="/domains/:domainId/mailboxes/import" element={<ImportMailboxesPage />} />
            <Route path="/domains/:domainId/mailboxes/services" element={<DefaultServicesPage />} />
            <Route path="/domains/:domainId/mailboxes/limits" element={<DefaultLimitsPage />} />
            <Route path="/domains/:domainId/mailboxes/:mailboxId" element={<MailboxOverviewPage />} />
            <Route path="/domains/:domainId/mailboxes/:mailboxId/activity" element={<MailboxRecentActivityPage />} />
            <Route path="/domains/:domainId/mailboxes/:mailboxId/logs" element={<MailboxRecentLogsPage />} />
            <Route path="/domains/:domainId/mailboxes/:mailboxId/usage" element={<MailboxUsageInstructionsPage />} />
            <Route path="/domains/:domainId/mailboxes/:mailboxId/services" element={<MailboxEnabledServicesPage />} />
            <Route path="/domains/:domainId/mailboxes/:mailboxId/limits" element={<MailboxLimitsPage />} />
            <Route path="/domains/:domainId/mailboxes/:mailboxId/password" element={<MailboxPasswordPage />} />
            <Route path="/domains/:domainId/mailboxes/:mailboxId/internal-access" element={<MailboxInternalAccessPage />} />
            <Route path="/domains/:domainId/mailboxes/:mailboxId/identities" element={<MailboxIdentitiesPage />} />
            <Route path="/domains/:domainId/mailboxes/:mailboxId/forwarding" element={<MailboxForwardingPage />} />
            <Route path="/domains/:domainId/mailboxes/:mailboxId/delegation" element={<MailboxDelegationPage />} />
            <Route path="/domains/:domainId/mailboxes/:mailboxId/expiration" element={<MailboxExpirationPage />} />
            <Route path="/domains/:domainId/mailboxes/:mailboxId/delete" element={<DeleteMailboxPage />} />
            <Route path="/domains/:domainId/mailboxes/:mailboxId/listing-settings" element={<MailboxListingSettingsPage />} />
            <Route path="/domains/:domainId/mailboxes/:mailboxId/notes" element={<MailboxAttachedNotesPage />} />
            <Route path="/domains/:domainId/aliases/new" element={<NewAliasPage />} />
            <Route path="/domains/:domainId/aliases/import" element={<ImportAliasesPage />} />
            <Route path="/domains/:domainId/aliases" element={<AddressAliasesPage />} />
            <Route path="/domains/:domainId/domain-aliases/new" element={<NewDomainAliasPage />} />
            <Route path="/domains/:domainId/domain-aliases" element={<DomainAliasesPage />} />
            <Route path="/domains/:domainId/rewrites/new" element={<NewPatternRewritePage />} />
            <Route path="/domains/:domainId/rewrites" element={<PatternRewritesPage />} />
            <Route path="/domains/:domainId/catchall" element={<CatchallPage />} />
            <Route path="/domains/:domainId/bccs/new" element={<NewBccCapturePage />} />
            <Route path="/domains/:domainId/bccs" element={<BccCapturesPage />} />
            <Route path="/domains/:domainId/dns" element={<DnsPage />} />
            <Route path="/domains/:domainId/spam" element={<SpamOverviewPage />} />
            <Route path="/domains/:domainId/spam/subject" element={<SpamAggressivenessPage />} />
            <Route path="/domains/:domainId/spam/sender-lists" element={<SpamSenderListsPage />} />
            <Route path="/domains/:domainId/spam/recipient-denylist" element={<SpamRecipientDenylistPage />} />
            <Route path="/domains/:domainId/transfer" element={<TransferOwnershipPage />} />
            <Route path="/domains/:domainId/deactivate" element={<DeactivateDomainPage />} />
            <Route path="/domains/:domainId/delete" element={<DeleteDomainPage />} />
            <Route path="/domains/:domainId/listing-settings" element={<ListingSettingsPage />} />
            <Route path="/domains/:domainId/notes" element={<AttachedNotesPage />} />

            <Route path="/account" element={<AccountOverviewPage />} />
            <Route path="/account/edit" element={<AccountGeneralPage />} />
            <Route path="/account/email" element={<AccountEmailPage />} />
            <Route path="/account/password" element={<AccountPasswordPage />} />
            <Route path="/account/terminate" element={<AccountTerminatePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/domains" replace />} />
          </Routes>
        </SnackbarProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
