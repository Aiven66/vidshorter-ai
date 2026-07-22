/**
 * @clipop/admin — Universal admin dashboard package.
 *
 * Public API surface. Import from '@clipop/admin' (or relative path).
 *
 * Server-only modules live under ./server/* and must never be imported
 * from client components.
 */

// Server-only — admin auth & table helpers.
export {
  isAdminFromToken,
  requireAdmin,
  extractBearerToken,
  getTables,
  DEFAULT_TABLES,
  type AdminConfig,
  type AdminTableNames,
  type AdminContext,
} from './server/verify';

// Server-only — analytics aggregation.
export {
  fetchAnalytics,
  type AnalyticsStats,
  type RetentionRates,
} from './server/analytics';

// Server-only — user management.
export {
  listUsers,
  getUserDetail,
  updateUser,
  deleteUser,
  type AdminUserRow,
  type AdminUserDetail,
  type ListUsersResult,
  type ListUsersOptions,
  type UpdateUserInput,
} from './server/users';

// Server-only — payment management.
export {
  listPayments,
  listTransactions,
  type PaymentRow,
  type TransactionRow,
  type PaymentSummary,
  type ListPaymentsResult,
  type ListPaymentsOptions,
  type ListTransactionsResult,
  type ListTransactionsOptions,
} from './server/payments';

// Server-only — behavior events.
export {
  fetchBehaviorEvents,
  type FetchEventsResult,
  type FetchEventsOptions,
  type DailyTrendPoint,
  type EventsSummary,
} from './server/events';

// Server-only — admin initialization.
export { initAdmin, type InitAdminInput } from './init-admin-api';

// Client components.
export { AdminLayout, type NavItem, type Locale, type AdminLayoutProps } from './admin-layout';
export { StatsPage, type StatsPageProps } from './stats-page';
export { UsersPage, type UsersPageProps } from './users-page';
export { PaymentsPage, type PaymentsPageProps } from './payments-page';
export { EventsPage, type EventsPageProps } from './events-page';
export { AdminDashboard, type AdminDashboardProps, type ExtraNavItem } from './admin-dashboard';
