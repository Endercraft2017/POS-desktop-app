import { sqliteTable, text, real } from "drizzle-orm/sqlite-core";
import { baseColumns } from "./columns";

// Ledger of partial / full payments against an operational_expenses row.
// Used to support accounts-payable workflows where a single bill can be
// settled across multiple dates and amounts.
export const expensePayments = sqliteTable("expense_payments", {
  ...baseColumns,
  expenseId: text("expense_id").notNull(),
  amount: real("amount").notNull(),
  paidOn: text("paid_on").notNull(),
  method: text("method"),
  notes: text("notes"),
});
