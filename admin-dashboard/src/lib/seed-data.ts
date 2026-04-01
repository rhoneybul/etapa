import { User, Plan, Payment, SupportTicket, Admin } from "@/types";

export const users: User[] = [
  { id: "u1", name: "Alice Chen", email: "alice@example.com", plan: "enterprise", status: "active", createdAt: "2025-01-15T10:00:00Z", lastLoginAt: "2026-03-30T14:22:00Z" },
  { id: "u2", name: "Bob Martinez", email: "bob@example.com", plan: "pro", status: "active", createdAt: "2025-03-22T08:30:00Z", lastLoginAt: "2026-03-29T09:15:00Z" },
  { id: "u3", name: "Carol White", email: "carol@example.com", plan: "starter", status: "active", createdAt: "2025-06-10T12:00:00Z", lastLoginAt: "2026-03-28T18:45:00Z" },
  { id: "u4", name: "Dan Liu", email: "dan@example.com", plan: "free", status: "inactive", createdAt: "2025-08-05T16:20:00Z", lastLoginAt: "2026-01-10T11:00:00Z" },
  { id: "u5", name: "Eve Johnson", email: "eve@example.com", plan: "pro", status: "active", createdAt: "2025-09-18T09:45:00Z", lastLoginAt: "2026-03-31T08:00:00Z" },
  { id: "u6", name: "Frank Osei", email: "frank@example.com", plan: "enterprise", status: "active", createdAt: "2025-02-28T14:10:00Z", lastLoginAt: "2026-03-30T16:30:00Z" },
  { id: "u7", name: "Grace Kim", email: "grace@example.com", plan: "starter", status: "suspended", createdAt: "2025-11-01T07:00:00Z", lastLoginAt: "2026-02-14T10:20:00Z" },
  { id: "u8", name: "Hiro Tanaka", email: "hiro@example.com", plan: "free", status: "active", createdAt: "2026-01-05T11:30:00Z", lastLoginAt: "2026-03-25T13:00:00Z" },
];

export const plans: Plan[] = [
  { id: "p1", name: "REDD+ Brazil Portfolio", createdBy: "u1", createdByName: "Alice Chen", description: "Monitoring deforestation avoidance projects in the Amazon basin", projectCount: 12, createdAt: "2025-02-10T10:00:00Z", status: "active" },
  { id: "p2", name: "Blue Carbon Assessment", createdBy: "u2", createdByName: "Bob Martinez", description: "Mangrove and seagrass restoration projects assessment", projectCount: 5, createdAt: "2025-04-15T09:00:00Z", status: "active" },
  { id: "p3", name: "Cookstove Due Diligence", createdBy: "u5", createdByName: "Eve Johnson", description: "Clean cookstove project verification across Sub-Saharan Africa", projectCount: 8, createdAt: "2025-10-01T14:00:00Z", status: "active" },
  { id: "p4", name: "ARR Southeast Asia", createdBy: "u6", createdByName: "Frank Osei", description: "Afforestation/reforestation projects in Vietnam and Indonesia", projectCount: 3, createdAt: "2025-06-20T08:00:00Z", status: "draft" },
  { id: "p5", name: "Renewable Energy Mix", createdBy: "u1", createdByName: "Alice Chen", description: "Solar and wind energy credit portfolio", projectCount: 15, createdAt: "2026-01-10T11:00:00Z", status: "active" },
  { id: "p6", name: "Biochar Removals", createdBy: "u3", createdByName: "Carol White", description: "Biochar carbon removal project analysis", projectCount: 2, createdAt: "2026-02-14T10:00:00Z", status: "archived" },
];

export const payments: Payment[] = [
  { id: "pay1", userId: "u1", userName: "Alice Chen", amount: 24000, currency: "USD", status: "succeeded", description: "Enterprise annual subscription", createdAt: "2026-01-15T10:00:00Z" },
  { id: "pay2", userId: "u2", userName: "Bob Martinez", amount: 4800, currency: "USD", status: "succeeded", description: "Pro annual subscription", createdAt: "2026-01-22T08:30:00Z" },
  { id: "pay3", userId: "u5", userName: "Eve Johnson", amount: 400, currency: "USD", status: "succeeded", description: "Pro monthly subscription", createdAt: "2026-03-01T09:00:00Z" },
  { id: "pay4", userId: "u6", userName: "Frank Osei", amount: 24000, currency: "USD", status: "succeeded", description: "Enterprise annual subscription", createdAt: "2026-02-28T14:00:00Z" },
  { id: "pay5", userId: "u3", userName: "Carol White", amount: 120, currency: "USD", status: "succeeded", description: "Starter monthly subscription", createdAt: "2026-03-10T12:00:00Z" },
  { id: "pay6", userId: "u7", userName: "Grace Kim", amount: 120, currency: "USD", status: "failed", description: "Starter monthly subscription", createdAt: "2026-03-10T07:00:00Z" },
  { id: "pay7", userId: "u5", userName: "Eve Johnson", amount: 400, currency: "USD", status: "pending", description: "Pro monthly subscription", createdAt: "2026-04-01T09:00:00Z" },
  { id: "pay8", userId: "u2", userName: "Bob Martinez", amount: 200, currency: "USD", status: "refunded", description: "Pro add-on refund", createdAt: "2026-02-15T11:00:00Z" },
];

export const tickets: SupportTicket[] = [
  { id: "t1", linearId: "SUP-142", title: "Cannot export portfolio as PDF", userId: "u1", userName: "Alice Chen", priority: "high", status: "open", createdAt: "2026-03-28T10:00:00Z", updatedAt: "2026-03-29T14:00:00Z" },
  { id: "t2", linearId: "SUP-139", title: "Rating discrepancy on VCS-1234", userId: "u2", userName: "Bob Martinez", priority: "medium", status: "in_progress", createdAt: "2026-03-25T08:30:00Z", updatedAt: "2026-03-30T09:15:00Z" },
  { id: "t3", linearId: "SUP-137", title: "SSO login failing intermittently", userId: "u6", userName: "Frank Osei", priority: "urgent", status: "in_progress", createdAt: "2026-03-22T16:00:00Z", updatedAt: "2026-03-31T08:00:00Z" },
  { id: "t4", linearId: "SUP-130", title: "Billing invoice format request", userId: "u3", userName: "Carol White", priority: "low", status: "resolved", createdAt: "2026-03-15T12:00:00Z", updatedAt: "2026-03-20T10:00:00Z" },
  { id: "t5", linearId: "SUP-128", title: "API rate limit too restrictive", userId: "u5", userName: "Eve Johnson", priority: "medium", status: "closed", createdAt: "2026-03-10T09:00:00Z", updatedAt: "2026-03-18T14:00:00Z" },
];

export const admins: Admin[] = [
  { id: "a1", email: "robert.honeybul@sylvera.io", name: "Rob Honeybul", grantedAt: "2025-01-01T00:00:00Z", grantedBy: "system" },
];
