export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  plan: "free" | "starter" | "pro" | "enterprise";
  status: "active" | "inactive" | "suspended";
  createdAt: string;
  lastLoginAt: string;
}

export interface Plan {
  id: string;
  name: string;
  createdBy: string; // user id
  createdByName: string;
  description: string;
  projectCount: number;
  createdAt: string;
  status: "active" | "draft" | "archived";
}

export interface Payment {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  currency: string;
  status: "succeeded" | "pending" | "failed" | "refunded";
  description: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  linearId: string;
  title: string;
  userId: string;
  userName: string;
  priority: "urgent" | "high" | "medium" | "low";
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: string;
  updatedAt: string;
}

export interface Admin {
  id: string;
  email: string;
  name: string;
  grantedAt: string;
  grantedBy: string;
}
