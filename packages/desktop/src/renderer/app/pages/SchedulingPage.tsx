import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../../hooks/use-theme";
import { useToday } from "../../hooks/use-today";
import { useAuthStore } from "../../stores/auth-store";
import { settingsRepo, orderRepo, expenseRepo } from "../../lib/repositories";
import { dbQuery } from "../../lib/db-bridge";
import type { ExpenseRow, PayableSummary, ExpensePaymentRow } from "../../lib/repositories";
import { performSync } from "../../lib/sync-manager";
import { ChatPanel } from "../../components/ui/ChatPanel";

// ---------------------------------------------------------------------------
// Types & defaults
// ---------------------------------------------------------------------------

interface ChecklistItem {
  id: string;
  label: string;
}

interface ItemState {
  checked: boolean;
  at?: string; // ISO timestamp
  by?: string; // employee name
}

interface DayState {
  // Per-day template snapshots so historical days keep their own item list
  openingItems?: ChecklistItem[];
  closingItems?: ChecklistItem[];
  opening: Record<string, ItemState>;
  closing: Record<string, ItemState>;
  notes: string;
}

const DEFAULT_OPENING: ChecklistItem[] = [
  { id: "op_equipment", label: "Turn on equipment (lights, POS, fryer)" },
  { id: "op_cash", label: "Count starting cash in the till" },
  { id: "op_stock", label: "Check ingredient stock levels" },
  { id: "op_clean", label: "Wipe down counters and tables" },
  { id: "op_open", label: "Unlock and open the entrance" },
];

const DEFAULT_CLOSING: ChecklistItem[] = [
  { id: "cl_count", label: "Count closing cash" },
  { id: "cl_reconcile", label: "Reconcile with day's sales" },
  { id: "cl_clean", label: "Clean all equipment" },
  { id: "cl_trash", label: "Empty trash" },
  { id: "cl_lock", label: "Lock doors and set alarm" },
  { id: "cl_off", label: "Turn off equipment" },
];

function newItemId(prefix: string): string {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function SchedulingPage() {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const today = useToday();
  const { currentEmployee } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"opening" | "closing" | "stock" | "expenses" | "calendar" | "counting" | "payables">("opening");
  const [currentDate, setCurrentDate] = useState(today);
  const showChat = currentEmployee?.role === "admin" && (activeTab === "stock" || activeTab === "expenses");
  const tabsRowRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const row = tabsRowRef.current;
    if (!row) return;
    const active = row.querySelector<HTMLElement>('[data-tab-active="true"]');
    if (!active) return;
    active.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [activeTab]);

  const { data: todayStats } = useQuery({
    queryKey: ["today-stats", today],
    queryFn: () => orderRepo.getTodayStats(),
  });

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: `${spacing.xs + 2}px ${spacing.md}px`,
    fontSize: fontSize.sm,
    fontWeight: 600,
    border: active ? `2px solid ${colors.primary}` : `1px solid ${colors.border}`,
    borderRadius: borderRadius.sm,
    backgroundColor: active ? colors.primaryLight : colors.surface,
    color: active ? colors.primary : colors.textSecondary,
    cursor: "pointer",
    minHeight: 32,
  });

  const isToday = currentDate === today;

  return (
    <div style={{
      padding: spacing.lg,
      display: "flex",
      flexDirection: "column",
      gap: spacing.md,
      height: "100%",
      overflow: "hidden",
      boxSizing: "border-box",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: spacing.sm }}>
        <h1 style={{ fontSize: fontSize["2xl"], fontWeight: 700, color: colors.textPrimary, margin: 0 }}>
          Scheduling
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: spacing.sm }}>
          <span style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>Date:</span>
          <input
            type="date"
            value={currentDate}
            onChange={(e) => setCurrentDate(e.target.value || today)}
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              fontSize: fontSize.sm,
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.sm,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              outline: "none",
            }}
          />
          {!isToday && (
            <button
              onClick={() => setCurrentDate(today)}
              style={{
                padding: `${spacing.xs}px ${spacing.sm}px`,
                fontSize: fontSize.xs,
                fontWeight: 600,
                backgroundColor: colors.surfaceElevated,
                color: colors.textSecondary,
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.sm,
                cursor: "pointer",
              }}
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* Today's sales summary */}
      {isToday && todayStats && (
        <div style={{
          display: "flex",
          gap: spacing.md,
          padding: spacing.md,
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: borderRadius.md,
          flexWrap: "wrap",
        }}>
          <Stat label="Orders" value={String(todayStats.total_orders)} colors={colors} fontSize={fontSize} spacing={spacing} />
          <Stat label="Revenue" value={`₱${todayStats.total_revenue.toFixed(2)}`} colors={colors} fontSize={fontSize} spacing={spacing} />
          <Stat label="Tax" value={`₱${todayStats.total_tax.toFixed(2)}`} colors={colors} fontSize={fontSize} spacing={spacing} />
          <Stat label="Avg Order" value={`₱${(todayStats.average_order || 0).toFixed(2)}`} colors={colors} fontSize={fontSize} spacing={spacing} />
        </div>
      )}

      {/* Tabs */}
      <div ref={tabsRowRef} style={{
        display: "flex",
        gap: spacing.xs,
        flexShrink: 0,
        flexWrap: "nowrap",
        overflowX: "auto",
        scrollbarWidth: "thin",
      }}>
        <button data-tab-active={activeTab === "opening"} style={{ ...tabBtnStyle(activeTab === "opening"), flexShrink: 0 }} onClick={() => setActiveTab("opening")}>Opening</button>
        <button data-tab-active={activeTab === "closing"} style={{ ...tabBtnStyle(activeTab === "closing"), flexShrink: 0 }} onClick={() => setActiveTab("closing")}>Closing</button>
        <button data-tab-active={activeTab === "stock"} style={{ ...tabBtnStyle(activeTab === "stock"), flexShrink: 0 }} onClick={() => setActiveTab("stock")}>Stock</button>
        <button data-tab-active={activeTab === "expenses"} style={{ ...tabBtnStyle(activeTab === "expenses"), flexShrink: 0 }} onClick={() => setActiveTab("expenses")}>Expenses</button>
        <button data-tab-active={activeTab === "payables"} style={{ ...tabBtnStyle(activeTab === "payables"), flexShrink: 0 }} onClick={() => setActiveTab("payables")}>Payables</button>
        <button data-tab-active={activeTab === "calendar"} style={{ ...tabBtnStyle(activeTab === "calendar"), flexShrink: 0 }} onClick={() => setActiveTab("calendar")}>Calendar</button>
        <button data-tab-active={activeTab === "counting"} style={{ ...tabBtnStyle(activeTab === "counting"), flexShrink: 0 }} onClick={() => setActiveTab("counting")}>Counting</button>
      </div>

      {/* Tab content */}
      {activeTab === "opening" && (
        <ChecklistView tabKey="opening" currentDate={currentDate} defaults={DEFAULT_OPENING} />
      )}
      {activeTab === "closing" && (
        <ChecklistView tabKey="closing" currentDate={currentDate} defaults={DEFAULT_CLOSING} />
      )}
      {activeTab === "stock" && (
        <StockView currentDate={currentDate} />
      )}
      {activeTab === "expenses" && (
        <ExpensesTab currentDate={currentDate} />
      )}
      {activeTab === "calendar" && (
        <CalendarView onSelectDate={(d) => { setCurrentDate(d); setActiveTab("opening"); }} />
      )}
      {activeTab === "counting" && (
        <CountingView currentDate={currentDate} />
      )}
      {activeTab === "payables" && (
        <PayablesView />
      )}
      {showChat && <ChatPanel page="scheduling" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small stat pill
// ---------------------------------------------------------------------------

function Stat({ label, value, colors, fontSize, spacing }: any) {
  return (
    <div style={{ flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: fontSize.xl, fontWeight: 700, color: colors.textPrimary }}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checklist view (shared between Opening and Closing)
// ---------------------------------------------------------------------------

interface ChecklistProps {
  tabKey: "opening" | "closing";
  currentDate: string;
  defaults: ChecklistItem[];
}

function ChecklistView({ tabKey, currentDate, defaults }: ChecklistProps) {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const { currentEmployee } = useAuthStore();
  const queryClient = useQueryClient();

  // Forward template: the latest list, used as seed for any NEW day the user opens.
  // Each day's state stores its OWN snapshot of the item list so historical
  // days never change when the user edits the list on a different day.
  const forwardTemplateKey = `scheduling_${tabKey}_template`;
  const stateKey = `scheduling_state_${currentDate}`;
  const itemsField = tabKey === "opening" ? "openingItems" : "closingItems";

  const [newItemLabel, setNewItemLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [notesFocused, setNotesFocused] = useState(false);

  const { data: forwardTemplateRaw } = useQuery({
    queryKey: ["scheduling-template", tabKey],
    queryFn: () => settingsRepo.get(forwardTemplateKey),
  });

  const { data: stateRaw } = useQuery({
    queryKey: ["scheduling-state", currentDate],
    queryFn: () => settingsRepo.get(stateKey),
  });

  // Seed forward template on first visit
  useEffect(() => {
    if (forwardTemplateRaw === null) {
      settingsRepo.set(forwardTemplateKey, JSON.stringify(defaults), "scheduling")
        .then(() => queryClient.invalidateQueries({ queryKey: ["scheduling-template", tabKey] }));
    }
  }, [forwardTemplateRaw, forwardTemplateKey, tabKey, defaults, queryClient]);

  const forwardTemplate: ChecklistItem[] = useMemo(() => {
    if (!forwardTemplateRaw) return defaults;
    try {
      const parsed = JSON.parse(forwardTemplateRaw);
      return Array.isArray(parsed) ? parsed : defaults;
    } catch {
      return defaults;
    }
  }, [forwardTemplateRaw, defaults]);

  const dayState: DayState = useMemo(() => {
    const empty: DayState = { opening: {}, closing: {}, notes: "" };
    if (!stateRaw) return empty;
    try {
      const parsed = JSON.parse(stateRaw);
      return {
        openingItems: parsed.openingItems,
        closingItems: parsed.closingItems,
        opening: parsed.opening || {},
        closing: parsed.closing || {},
        notes: parsed.notes || "",
      };
    } catch {
      return empty;
    }
  }, [stateRaw]);

  // Per-day item list: prefer the snapshot stored in the day's state,
  // otherwise fall back to the forward template (for days that haven't
  // been touched yet — typically future/today before any edit).
  const template: ChecklistItem[] = useMemo(() => {
    const stored = dayState[itemsField];
    if (Array.isArray(stored) && stored.length > 0) return stored;
    return forwardTemplate;
  }, [dayState, itemsField, forwardTemplate]);

  useEffect(() => {
    // Don't overwrite what the user is typing if the textarea is focused.
    if (notesFocused) return;
    setNotes(dayState.notes);
  }, [currentDate, dayState.notes, notesFocused]);

  const items = dayState[tabKey];

  async function saveState(newState: DayState) {
    await settingsRepo.set(stateKey, JSON.stringify(newState), "scheduling");
    queryClient.invalidateQueries({ queryKey: ["scheduling-state", currentDate] });
    performSync().catch(() => {});
  }

  async function saveForwardTemplate(newTemplate: ChecklistItem[]) {
    await settingsRepo.set(forwardTemplateKey, JSON.stringify(newTemplate), "scheduling");
    queryClient.invalidateQueries({ queryKey: ["scheduling-template", tabKey] });
  }

  const handleToggle = async (itemId: string) => {
    const existing = items[itemId];
    const nextState: DayState = {
      ...dayState,
      // Ensure the current day snapshot is frozen into state so future template
      // edits don't retroactively change it
      [itemsField]: dayState[itemsField] || template,
      [tabKey]: {
        ...items,
        [itemId]: existing?.checked
          ? { checked: false }
          : { checked: true, at: new Date().toISOString(), by: currentEmployee?.name || "unknown" },
      },
    };
    await saveState(nextState);
  };

  const handleAddItem = async () => {
    if (!newItemLabel.trim()) return;
    const id = newItemId(tabKey === "opening" ? "op" : "cl");
    const next = [...template, { id, label: newItemLabel.trim() }];
    // Update THIS day's snapshot only
    await saveState({ ...dayState, [itemsField]: next });
    // Also update the forward template so new (untouched) days get the latest
    await saveForwardTemplate(next);
    performSync().catch(() => {});
    setNewItemLabel("");
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!confirm("Remove this item from the checklist for this day forward?")) return;
    const next = template.filter((i) => i.id !== itemId);
    const { [itemId]: _, ...rest } = items;
    // Update THIS day only
    await saveState({ ...dayState, [itemsField]: next, [tabKey]: rest });
    // And the forward template
    await saveForwardTemplate(next);
    performSync().catch(() => {});
  };

  const handleReset = async () => {
    if (!confirm("Reset all checkboxes for this day?")) return;
    await saveState({ ...dayState, [itemsField]: dayState[itemsField] || template, [tabKey]: {} });
  };

  const handleReorder = async (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const fromIdx = template.findIndex((i) => i.id === fromId);
    const toIdx = template.findIndex((i) => i.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = template.slice();
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    await saveState({ ...dayState, [itemsField]: next });
    await saveForwardTemplate(next);
    performSync().catch(() => {});
  };

  const [dragFromId, setDragFromId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [handleDown, setHandleDown] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const startEdit = (item: ChecklistItem) => {
    setEditingId(item.id);
    setEditLabel(item.label);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditLabel("");
  };
  const saveEdit = async () => {
    if (!editingId || !editLabel.trim()) return;
    const next = template.map((it) =>
      it.id === editingId ? { ...it, label: editLabel.trim() } : it
    );
    await saveState({ ...dayState, [itemsField]: next });
    await saveForwardTemplate(next);
    performSync().catch(() => {});
    cancelEdit();
  };

  const handleNotesBlur = async () => {
    if (notes === dayState.notes) return;
    await saveState({ ...dayState, notes });
  };

  const completed = template.filter((i) => items[i.id]?.checked).length;
  const total = template.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.md, flex: 1, overflow: "auto" }}>
      {/* Progress header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: `${spacing.sm}px ${spacing.md}px`,
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: borderRadius.md,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: fontSize.sm, fontWeight: 600, color: colors.textPrimary, marginBottom: 4 }}>
            {completed} of {total} complete
          </div>
          <div style={{
            height: 6,
            backgroundColor: colors.surfaceElevated,
            borderRadius: 3,
            overflow: "hidden",
          }}>
            <div style={{
              width: `${progress}%`,
              height: "100%",
              backgroundColor: progress === 100 ? colors.success : colors.primary,
              transition: "width 0.2s",
            }} />
          </div>
        </div>
        <button
          onClick={handleReset}
          style={{
            marginLeft: spacing.md,
            padding: `${spacing.xs}px ${spacing.md}px`,
            fontSize: fontSize.xs,
            fontWeight: 600,
            backgroundColor: "transparent",
            color: colors.textSecondary,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.sm,
            cursor: "pointer",
          }}
        >
          Reset
        </button>
      </div>

      {/* Checklist items */}
      <div style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: borderRadius.md,
        padding: spacing.sm,
      }}>
        {template.length === 0 ? (
          <div style={{ padding: spacing.md, textAlign: "center", color: colors.textTertiary, fontSize: fontSize.sm }}>
            No items yet. Add one below.
          </div>
        ) : (
          template.map((item) => {
            const s = items[item.id];
            const checked = !!s?.checked;
            const isDragOver = dragOverId === item.id && dragFromId !== item.id;
            const isEditing = editingId === item.id;
            if (isEditing) {
              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    gap: spacing.xs,
                    padding: `${spacing.sm}px ${spacing.xs}px`,
                    borderBottom: `1px solid ${colors.border}`,
                    backgroundColor: colors.primaryLight,
                    alignItems: "center",
                  }}
                >
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                    autoFocus
                    style={{
                      flex: 1,
                      padding: `${spacing.xs}px ${spacing.sm}px`,
                      fontSize: fontSize.md,
                      border: `1px solid ${colors.border}`,
                      borderRadius: borderRadius.sm,
                      backgroundColor: colors.background,
                      color: colors.textPrimary,
                      outline: "none",
                      minHeight: 32,
                    }}
                  />
                  <button
                    onClick={saveEdit}
                    disabled={!editLabel.trim()}
                    style={{
                      padding: `${spacing.xs}px ${spacing.md}px`,
                      fontSize: fontSize.sm,
                      fontWeight: 600,
                      backgroundColor: colors.primary,
                      color: colors.textOnPrimary,
                      border: "none",
                      borderRadius: borderRadius.sm,
                      cursor: editLabel.trim() ? "pointer" : "not-allowed",
                      opacity: editLabel.trim() ? 1 : 0.5,
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    style={{
                      padding: `${spacing.xs}px ${spacing.md}px`,
                      fontSize: fontSize.sm,
                      fontWeight: 600,
                      backgroundColor: "transparent",
                      color: colors.textSecondary,
                      border: `1px solid ${colors.border}`,
                      borderRadius: borderRadius.sm,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              );
            }
            return (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", item.id);
                  e.dataTransfer.effectAllowed = "move";
                  setDragFromId(item.id);
                }}
                onDragEnd={() => { setDragFromId(null); setDragOverId(null); }}
                onDragOver={(e) => { e.preventDefault(); if (dragFromId !== item.id) setDragOverId(item.id); }}
                onDragLeave={() => { if (dragOverId === item.id) setDragOverId(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const fromId = e.dataTransfer.getData("text/plain") || dragFromId;
                  if (fromId) handleReorder(fromId, item.id);
                  setDragFromId(null);
                  setDragOverId(null);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: spacing.sm,
                  padding: `${spacing.sm}px ${spacing.xs}px`,
                  borderBottom: `1px solid ${colors.border}`,
                  backgroundColor: isDragOver ? colors.primaryLight : "transparent",
                  opacity: dragFromId === item.id ? 0.5 : 1,
                }}
              >
                <span
                  title="Drag to reorder"
                  style={{
                    width: 18,
                    color: colors.textTertiary,
                    fontSize: fontSize.md,
                    cursor: "grab",
                    userSelect: "none",
                    flexShrink: 0,
                    lineHeight: 1,
                  }}
                >
                  ⋮⋮
                </span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => handleToggle(item.id)}
                  style={{
                    width: 20,
                    height: 20,
                    cursor: "pointer",
                    accentColor: colors.primary,
                    flexShrink: 0,
                  }}
                />
                <div
                  style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                  onClick={() => startEdit(item)}
                  title="Click to edit"
                >
                  <div
                    style={{
                      fontSize: fontSize.md,
                      fontWeight: 500,
                      color: checked ? colors.textTertiary : colors.textPrimary,
                      textDecoration: checked ? "line-through" : "none",
                    }}
                  >
                    {item.label}
                  </div>
                  {checked && s?.at && (
                    <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>
                      ✓ {formatTime(s.at)}{s.by ? ` · ${s.by}` : ""}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => startEdit(item)}
                  style={{
                    padding: `2px ${spacing.sm}px`,
                    fontSize: fontSize.xs,
                    backgroundColor: "transparent",
                    color: colors.textSecondary,
                    border: `1px solid ${colors.border}`,
                    borderRadius: borderRadius.sm,
                    cursor: "pointer",
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleRemoveItem(item.id)}
                  style={{
                    padding: `2px ${spacing.sm}px`,
                    fontSize: fontSize.xs,
                    backgroundColor: "transparent",
                    color: colors.error,
                    border: `1px solid ${colors.error}`,
                    borderRadius: borderRadius.sm,
                    cursor: "pointer",
                    opacity: 0.7,
                  }}
                >
                  ×
                </button>
              </div>
            );
          })
        )}

        {/* Add new item */}
        <div style={{ display: "flex", gap: spacing.sm, marginTop: spacing.sm, paddingTop: spacing.sm, borderTop: `2px solid ${colors.border}` }}>
          <input
            type="text"
            value={newItemLabel}
            onChange={(e) => setNewItemLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
            placeholder="Add a new checklist item..."
            style={{
              flex: 1,
              padding: `${spacing.xs}px ${spacing.sm}px`,
              fontSize: fontSize.sm,
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.sm,
              backgroundColor: colors.background,
              color: colors.textPrimary,
              outline: "none",
            }}
          />
          <button
            onClick={handleAddItem}
            disabled={!newItemLabel.trim()}
            style={{
              padding: `${spacing.xs}px ${spacing.md}px`,
              fontSize: fontSize.sm,
              fontWeight: 600,
              backgroundColor: colors.primary,
              color: colors.textOnPrimary,
              border: "none",
              borderRadius: borderRadius.sm,
              cursor: newItemLabel.trim() ? "pointer" : "not-allowed",
              opacity: newItemLabel.trim() ? 1 : 0.5,
            }}
          >
            + Add
          </button>
        </div>
      </div>

      {/* Shift notes */}
      <div style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: borderRadius.md,
        padding: spacing.md,
      }}>
        <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textSecondary, marginBottom: spacing.xs }}>
          Shift Notes
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onFocus={() => setNotesFocused(true)}
          onBlur={() => { setNotesFocused(false); handleNotesBlur(); }}
          placeholder="Handover notes for the next shift (e.g. ran out of cups, fridge temp running high)"
          rows={3}
          style={{
            width: "100%",
            padding: `${spacing.xs}px ${spacing.sm}px`,
            fontSize: fontSize.sm,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.sm,
            backgroundColor: colors.background,
            color: colors.textPrimary,
            outline: "none",
            resize: "vertical",
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expenses tab — daily-filtered with cash reconciliation header
// ---------------------------------------------------------------------------

const EXPENSE_UNIT_OPTIONS = ["pcs", "g", "kg", "oz", "lb", "mL", "L", "cup", "tbsp", "tsp", "pack", "box", "bag", "bottle", "can", "each"];

// Payment method is encoded in the notes field with a [CASH]/[GCASH] prefix to
// avoid a schema migration. Default (no prefix) = cash.
function parseExpenseMethod(notes: string | null | undefined): { method: "cash" | "gcash"; notes: string } {
  const raw = notes ?? "";
  const m = raw.match(/^\[(CASH|GCASH)\]\s?(.*)$/s);
  if (m) {
    return { method: m[1] === "GCASH" ? "gcash" : "cash", notes: m[2] };
  }
  return { method: "cash", notes: raw };
}
function encodeExpenseNotes(method: "cash" | "gcash", notes: string): string | null {
  const tag = method === "gcash" ? "[GCASH]" : "[CASH]";
  const body = notes.trim();
  return body ? `${tag} ${body}` : tag;
}

function localDateOf(iso: string): string {
  if (!iso) return "";
  // iso may be "YYYY-MM-DD HH:MM:SS" (SQL) or ISO. Parse and return local YYYY-MM-DD.
  const s = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function ExpensesTab({ currentDate }: { currentDate: string }) {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const queryClient = useQueryClient();
  const today = useToday();
  const isToday = currentDate === today;

  const [form, setForm] = useState({ name: "", unit: "pcs", quantity: "", cost: "", notes: "", method: "cash" as "cash" | "gcash" });
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [startingCashInput, setStartingCashInput] = useState("");
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [overviewSearch, setOverviewSearch] = useState("");
  const [overviewMethod, setOverviewMethod] = useState<"all" | "cash" | "gcash">("all");

  const { data: allExpenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: () => expenseRepo.getAll(),
  });

  const { data: byMethod } = useQuery({
    queryKey: ["stats", "today-by-method", today],
    queryFn: () => orderRepo.getTodayByMethod(),
    enabled: isToday,
  });

  const { data: todayStatsTotal } = useQuery({
    queryKey: ["today-stats", today],
    queryFn: () => orderRepo.getTodayStats(),
    enabled: isToday,
  });

  // Daily-by-method lookup for any historical date (used for prev-day carryover)
  const { data: dailyByMethod = [] } = useQuery({
    queryKey: ["stats", "daily", "by-method"],
    queryFn: () => orderRepo.getDailySalesByMethod(60),
  });

  // Cumulative gcash/cash sales through the selected date (all-time up to and including currentDate)
  const { data: cumulativeByMethod } = useQuery({
    queryKey: ["stats", "cumulative-by-method", currentDate],
    queryFn: () => orderRepo.getCumulativeByMethodUntil(currentDate),
  });

  // Compute previous date (YYYY-MM-DD)
  const prevDate = useMemo(() => {
    const d = new Date(currentDate + "T00:00");
    if (isNaN(d.getTime())) return "";
    d.setDate(d.getDate() - 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, [currentDate]);

  const cashKey = `scheduling_starting_cash_${currentDate}`;

  const { data: startingCashRaw } = useQuery({
    queryKey: ["scheduling-starting-cash", currentDate],
    queryFn: () => settingsRepo.get(cashKey),
  });

  useEffect(() => {
    setStartingCashInput(startingCashRaw ?? "");
  }, [startingCashRaw, currentDate]);

  const startingCash = parseFloat(startingCashInput) || 0;

  const dailyExpenses = useMemo(
    // Use paid_at so payables only show on the day they were settled, not
    // when the bill was first booked. Unpaid payables are hidden here —
    // they live in the Payables tab until paid. Rows flagged as
    // exclude_from_expenses (e.g. personal credits) are also hidden.
    () => allExpenses.filter((e) =>
      e.paid_at &&
      localDateOf(e.paid_at) === currentDate &&
      !e.exclude_from_expenses
    ),
    [allExpenses, currentDate]
  );

  const totalExpenses = useMemo(
    () => dailyExpenses.reduce((s, e) => s + (e.amount || 0), 0),
    [dailyExpenses]
  );
  const cashExpenses = useMemo(
    () => dailyExpenses.filter((e) => parseExpenseMethod(e.notes).method === "cash").reduce((s, e) => s + (e.amount || 0), 0),
    [dailyExpenses]
  );
  const gcashExpenses = useMemo(
    () => dailyExpenses.filter((e) => parseExpenseMethod(e.notes).method === "gcash").reduce((s, e) => s + (e.amount || 0), 0),
    [dailyExpenses]
  );
  // Cumulative gcash expenses through the selected date — used to net against
  // the cumulative gcash sales figure displayed in the Total GCash card.
  const cumulativeGcashExpenses = useMemo(
    () =>
      allExpenses
        .filter((e) => {
          if (!e.paid_at) return false;
          if (e.exclude_from_expenses) return false;
          const d = localDateOf(e.paid_at);
          return d && d <= currentDate && parseExpenseMethod(e.notes).method === "gcash";
        })
        .reduce((s, e) => s + (e.amount || 0), 0),
    [allExpenses, currentDate]
  );

  const dayRow = dailyByMethod.find((d) => d.date === currentDate);
  const cashSales = isToday ? (byMethod?.cash ?? dayRow?.cash ?? 0) : (dayRow?.cash ?? 0);
  const gcashSales = isToday ? (byMethod?.gcash ?? dayRow?.gcash ?? 0) : (dayRow?.gcash ?? 0);
  const totalSales = isToday ? (todayStatsTotal?.total_revenue ?? (cashSales + gcashSales)) : (cashSales + gcashSales);
  // Only cash-paid expenses reduce the physical cash register; gcash-paid
  // expenses only affect the gcash balance.
  const totalCashNoGcash = startingCash + cashSales - cashExpenses;
  const totalCashWithGcash = startingCash + cashSales + gcashSales - cashExpenses - gcashExpenses;

  const saveStartingCash = async (val: string) => {
    if ((startingCashRaw ?? "") === val) return;
    await settingsRepo.set(cashKey, val, "scheduling");
    queryClient.invalidateQueries({ queryKey: ["scheduling-starting-cash", currentDate] });
    performSync().catch(() => {});
  };

  const createExpense = useMutation({
    mutationFn: async () => {
      const qty = parseFloat(form.quantity) || 0;
      const cost = parseFloat(form.cost) || 0;
      if (!form.name.trim()) throw new Error("Enter a product name");
      // Both cash and gcash accept any non-zero amount. Negative values are
      // intentionally allowed (refunds, returns, corrections).
      if (cost === 0) throw new Error("Enter a cost");
      // When adding on a non-today date, stamp created_at to that day (with
      // current wall-clock time of day) so it lands in the correct per-day
      // bucket and sorts naturally.
      let createdAt: string | undefined;
      if (currentDate !== today) {
        const [y, m, d] = currentDate.split("-").map((n) => parseInt(n, 10));
        const nowLocal = new Date();
        const dt = new Date(y, (m || 1) - 1, d || 1, nowLocal.getHours(), nowLocal.getMinutes(), nowLocal.getSeconds());
        createdAt = dt.toISOString();
      }
      return expenseRepo.create({
        name: form.name.trim(),
        category: form.unit,
        amount: cost,
        frequency: qty > 0 ? String(qty) : "",
        notes: encodeExpenseNotes(form.method, form.notes),
        is_active: 1,
        // Stamp paid_at to the same day as created_at so the row appears in
        // the selected day's Expenses bucket (the tab filters by paid_at).
        ...(createdAt ? { created_at: createdAt, paid_at: createdAt } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setForm({ name: "", unit: "pcs", quantity: "", cost: "", notes: "", method: "cash" });
      setError("");
      performSync().catch(() => {});
    },
    onError: (err) => setError((err as Error).message),
  });

  const updateExpenseM = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ExpenseRow> }) =>
      expenseRepo.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      setEditingId(null);
      setForm({ name: "", unit: "pcs", quantity: "", cost: "", notes: "", method: "cash" });
      setError("");
      performSync().catch(() => {});
    },
    onError: (err) => alert("Failed: " + (err as Error).message),
  });

  const deleteExpense = useMutation({
    mutationFn: (id: string) => expenseRepo.softDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      performSync().catch(() => {});
    },
  });

  const startEdit = (exp: ExpenseRow) => {
    setEditingId(exp.id);
    const parsed = parseExpenseMethod(exp.notes);
    setForm({
      name: exp.name,
      unit: exp.category || "pcs",
      quantity: exp.frequency || "1",
      cost: String(exp.amount),
      notes: parsed.notes,
      method: parsed.method,
    });
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ name: "", unit: "pcs", quantity: "", cost: "", notes: "", method: "cash" });
    setError("");
  };

  const handleSave = () => {
    setError("");
    if (editingId) {
      const qty = parseFloat(form.quantity) || 0;
      const cost = parseFloat(form.cost) || 0;
      updateExpenseM.mutate({
        id: editingId,
        data: {
          name: form.name.trim(),
          category: form.unit,
          amount: cost,
          frequency: qty > 0 ? String(qty) : "",
          notes: encodeExpenseNotes(form.method, form.notes),
        },
      });
    } else {
      createExpense.mutate();
    }
  };

  const formatTime = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  };

  const inputStyle: React.CSSProperties = {
    padding: `${spacing.xs}px ${spacing.sm}px`,
    fontSize: fontSize.sm,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    outline: "none",
    minHeight: 30,
    boxSizing: "border-box" as const,
  };

  const btnStyle = (variant: "primary" | "secondary" | "danger"): React.CSSProperties => ({
    padding: `${spacing.xs}px ${spacing.md}px`,
    fontSize: fontSize.sm,
    fontWeight: 600,
    border: variant === "secondary" ? `1px solid ${colors.border}` : "none",
    borderRadius: borderRadius.sm,
    cursor: "pointer",
    minHeight: 30,
    backgroundColor:
      variant === "primary" ? colors.primary :
      variant === "danger" ? colors.error :
      colors.buttonSecondary,
    color: variant === "secondary" ? colors.buttonSecondaryText : colors.textOnPrimary,
  });

  const summaryBox = (label: string, value: string, accent: string): React.CSSProperties => ({
    flex: 1,
    minWidth: 140,
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderLeft: `4px solid ${accent}`,
  });

  // Filtered expense list for the Overview popup. Searches across name and
  // the plain-notes portion of the notes field (the [CASH]/[GCASH] tag is
  // stripped by parseExpenseMethod).
  const overviewFiltered = useMemo(() => {
    const q = overviewSearch.trim().toLowerCase();
    return allExpenses
      .filter((e) => {
        if (e.exclude_from_expenses) return false;
        const { method, notes: plainNotes } = parseExpenseMethod(e.notes);
        if (overviewMethod !== "all" && method !== overviewMethod) return false;
        if (!q) return true;
        const name = (e.name || "").toLowerCase();
        const note = (plainNotes || "").toLowerCase();
        return name.includes(q) || note.includes(q);
      })
      .sort((a, b) => {
        // Newest first by paid_at if present, else created_at.
        const ad = (a.paid_at || a.created_at || "").toString();
        const bd = (b.paid_at || b.created_at || "").toString();
        return bd.localeCompare(ad);
      });
  }, [allExpenses, overviewSearch, overviewMethod]);

  const overviewTotals = useMemo(() => {
    let cash = 0, gcash = 0;
    for (const e of overviewFiltered) {
      const { method } = parseExpenseMethod(e.notes);
      if (method === "gcash") gcash += e.amount || 0;
      else cash += e.amount || 0;
    }
    return { cash, gcash, total: cash + gcash, count: overviewFiltered.length };
  }, [overviewFiltered]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.md, flex: 1, overflow: "auto" }}>
      {overviewOpen && (
        <div
          onClick={() => setOverviewOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: spacing.md,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.md,
              width: "min(900px, 100%)",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{
              padding: spacing.md,
              borderBottom: `1px solid ${colors.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing.sm,
            }}>
              <span style={{ fontSize: fontSize.lg, fontWeight: 700, color: colors.textPrimary }}>
                Expenses Overview
              </span>
              <button
                onClick={() => setOverviewOpen(false)}
                style={{
                  padding: `2px ${spacing.sm}px`,
                  fontSize: fontSize.xs,
                  fontWeight: 600,
                  border: `1px solid ${colors.border}`,
                  borderRadius: borderRadius.sm,
                  backgroundColor: colors.surfaceElevated,
                  color: colors.textSecondary,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            {/* Filter bar */}
            <div style={{
              padding: spacing.md,
              borderBottom: `1px solid ${colors.border}`,
              display: "flex",
              flexDirection: "column",
              gap: spacing.sm,
            }}>
              <input
                autoFocus
                value={overviewSearch}
                onChange={(e) => setOverviewSearch(e.target.value)}
                placeholder="Search by item name or note..."
                style={{
                  width: "100%",
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  fontSize: fontSize.sm,
                  border: `1px solid ${colors.border}`,
                  borderRadius: borderRadius.sm,
                  backgroundColor: colors.background,
                  color: colors.textPrimary,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: spacing.xs, alignItems: "center", flexWrap: "wrap" }}>
                {(["all", "cash", "gcash"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setOverviewMethod(m)}
                    style={{
                      padding: `${spacing.xs}px ${spacing.sm + 2}px`,
                      fontSize: fontSize.xs,
                      fontWeight: 600,
                      border: overviewMethod === m ? `2px solid ${colors.primary}` : `1px solid ${colors.border}`,
                      borderRadius: borderRadius.sm,
                      backgroundColor: overviewMethod === m ? colors.primaryLight : colors.surfaceElevated,
                      color: overviewMethod === m ? colors.primary : colors.textSecondary,
                      cursor: "pointer",
                    }}
                  >
                    {m === "all" ? "All" : m === "cash" ? "Cash" : "GCash"}
                  </button>
                ))}
                <span style={{ marginLeft: "auto", fontSize: fontSize.xs, color: colors.textTertiary }}>
                  {overviewTotals.count} item{overviewTotals.count === 1 ? "" : "s"}
                  {" · "}
                  Cash ₱{overviewTotals.cash.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  {" · "}
                  GCash ₱{overviewTotals.gcash.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  {" · "}
                  Total ₱{overviewTotals.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: "auto", padding: spacing.md }}>
              {overviewFiltered.length === 0 ? (
                <div style={{ textAlign: "center", color: colors.textTertiary, fontSize: fontSize.sm, padding: spacing.lg }}>
                  No expenses match this filter.
                </div>
              ) : (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "100px 1fr 60px 90px 1fr",
                  gap: spacing.xs,
                  fontSize: fontSize.sm,
                }}>
                  <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textTertiary, padding: `${spacing.xs}px ${spacing.sm}px`, borderBottom: `1px solid ${colors.border}` }}>Date</div>
                  <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textTertiary, padding: `${spacing.xs}px ${spacing.sm}px`, borderBottom: `1px solid ${colors.border}` }}>Item</div>
                  <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textTertiary, padding: `${spacing.xs}px ${spacing.sm}px`, borderBottom: `1px solid ${colors.border}` }}>Method</div>
                  <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textTertiary, padding: `${spacing.xs}px ${spacing.sm}px`, borderBottom: `1px solid ${colors.border}`, textAlign: "right" }}>Amount</div>
                  <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textTertiary, padding: `${spacing.xs}px ${spacing.sm}px`, borderBottom: `1px solid ${colors.border}` }}>Note</div>
                  {overviewFiltered.map((e) => {
                    const { method, notes: plainNotes } = parseExpenseMethod(e.notes);
                    const dateStr = (e.paid_at || e.created_at || "").slice(0, 10);
                    const qtyStr = e.frequency && e.frequency !== "daily" && e.frequency !== "weekly" && e.frequency !== "monthly" && e.frequency !== "per_use" ? e.frequency : "";
                    return (
                      <React.Fragment key={e.id}>
                        <div style={{ padding: `${spacing.xs}px ${spacing.sm}px`, borderBottom: `1px solid ${colors.border}`, color: colors.textSecondary, fontSize: fontSize.xs }}>{dateStr}</div>
                        <div style={{ padding: `${spacing.xs}px ${spacing.sm}px`, borderBottom: `1px solid ${colors.border}`, color: colors.textPrimary, fontWeight: 600 }}>
                          {e.name}
                          {qtyStr ? <span style={{ marginLeft: spacing.xs, color: colors.textTertiary, fontWeight: 400, fontSize: fontSize.xs }}>· {qtyStr} {e.category}</span> : null}
                        </div>
                        <div style={{ padding: `${spacing.xs}px ${spacing.sm}px`, borderBottom: `1px solid ${colors.border}`, color: method === "gcash" ? colors.primary : colors.textSecondary, fontSize: fontSize.xs, textTransform: "uppercase", fontWeight: 600 }}>{method}</div>
                        <div style={{ padding: `${spacing.xs}px ${spacing.sm}px`, borderBottom: `1px solid ${colors.border}`, color: colors.textPrimary, fontWeight: 700, textAlign: "right" }}>₱{(e.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                        <div style={{ padding: `${spacing.xs}px ${spacing.sm}px`, borderBottom: `1px solid ${colors.border}`, color: colors.textSecondary, fontSize: fontSize.xs, overflow: "hidden", textOverflow: "ellipsis" }} title={plainNotes || ""}>{plainNotes || "—"}</div>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cash reconciliation header */}
      <div style={{ display: "flex", gap: spacing.sm, flexWrap: "wrap" }}>
        <div style={summaryBox("Starting Cash", "", colors.primary)}>
          <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary, marginBottom: 4 }}>
            Starting Cash
          </div>
          <input
            type="number"
            min="0"
            step="0.01"
            value={startingCashInput}
            onChange={(e) => setStartingCashInput(e.target.value)}
            onBlur={() => saveStartingCash(startingCashInput)}
            placeholder="0.00"
            style={{
              ...inputStyle,
              width: "100%",
              fontSize: fontSize.xl,
              fontWeight: 700,
              color: colors.textPrimary,
            }}
          />
        </div>
        <div style={summaryBox("Total Sales", "", colors.success)}>
          <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary }}>Total Sales{isToday ? "" : " (today only)"}</div>
          <div style={{ fontSize: fontSize.xl, fontWeight: 700, color: colors.textPrimary, marginTop: 4 }}>
            ₱{totalSales.toFixed(2)}
          </div>
          {isToday && (
            <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>
              Cash ₱{cashSales.toFixed(2)} · GCash ₱{(byMethod?.gcash ?? 0).toFixed(2)}
            </div>
          )}
        </div>
        <div style={summaryBox("Total Expenses", "", colors.warning ?? colors.accent)}>
          <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary }}>Total Expenses</div>
          <div style={{ fontSize: fontSize.xl, fontWeight: 700, color: colors.textPrimary, marginTop: 4 }}>
            ₱{totalExpenses.toFixed(2)}
          </div>
          <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>
            Cash ₱{cashExpenses.toFixed(2)} · GCash ₱{gcashExpenses.toFixed(2)}
          </div>
        </div>
        {(() => {
          const cumulGcashSales = cumulativeByMethod?.gcash ?? 0;
          const netGcash = cumulGcashSales - cumulativeGcashExpenses;
          return (
            <div style={summaryBox("Total GCash", "", colors.accent)}>
              <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary }}>Total GCash (net)</div>
              <div style={{ fontSize: fontSize.xl, fontWeight: 700, color: netGcash < 0 ? colors.error : colors.textPrimary, marginTop: 4 }}>
                ₱{netGcash.toFixed(2)}
              </div>
              <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>
                Sales ₱{cumulGcashSales.toFixed(2)} − Expenses ₱{cumulativeGcashExpenses.toFixed(2)}
              </div>
            </div>
          );
        })()}
        <div style={summaryBox("Cash on Hand", "", colors.info ?? colors.primary)}>
          <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary }}>Cash on Hand</div>
          <div style={{ fontSize: fontSize.xl, fontWeight: 700, color: totalCashNoGcash < 0 ? colors.error : colors.textPrimary, marginTop: 4 }}>
            ₱{totalCashNoGcash.toFixed(2)}
          </div>
          <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>
            Starting + Cash − Expenses
          </div>
        </div>
        <div style={summaryBox("Total Cash (w/ GCash)", "", colors.accent)}>
          <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary }}>Total Cash (w/ GCash)</div>
          <div style={{ fontSize: fontSize.xl, fontWeight: 700, color: totalCashWithGcash < 0 ? colors.error : colors.textPrimary, marginTop: 4 }}>
            ₱{totalCashWithGcash.toFixed(2)}
          </div>
          <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>
            Starting + Cash + GCash − Expenses
          </div>
        </div>
      </div>

      {/* Add / edit form */}
      <div style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
          <div style={{ fontSize: fontSize.sm, fontWeight: 700, color: colors.textSecondary }}>
            {editingId ? "Edit Expense" : "Add Expense"}
          </div>
          <button
            onClick={() => setOverviewOpen(true)}
            style={{
              padding: `2px ${spacing.sm}px`,
              fontSize: fontSize.xs,
              fontWeight: 600,
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.sm,
              backgroundColor: colors.surfaceElevated,
              color: colors.textSecondary,
              cursor: "pointer",
            }}
          >
            Overview
          </button>
        </div>
        {error && (
          <div style={{ fontSize: fontSize.xs, color: colors.error, marginBottom: spacing.xs, fontWeight: 600 }}>{error}</div>
        )}
        <div style={{ display: "flex", gap: spacing.sm, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 160 }}>
            <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Product / Item *</div>
            <input
              style={{ ...inputStyle, width: "100%" }}
              value={form.name}
              onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setError(""); }}
              placeholder="e.g. Flour, Cooking Oil, Cups"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
          <div style={{ flex: 1, minWidth: 80 }}>
            <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Qty</div>
            <input
              style={{ ...inputStyle, width: "100%" }}
              type="number" min="0" step="0.01"
              value={form.quantity}
              onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="Optional"
            />
          </div>
          <div style={{ flex: 1, minWidth: 80 }}>
            <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Unit</div>
            <select
              style={{ ...inputStyle, width: "100%", cursor: "pointer" }}
              value={form.unit}
              onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
            >
              {EXPENSE_UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Cost (₱) *</div>
            <input
              style={{ ...inputStyle, width: "100%" }}
              type="number"
              step="0.01"
              value={form.cost}
              onChange={(e) => setForm((p) => ({ ...p, cost: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="0.00 (negative for refunds)"
            />
          </div>
          <div style={{ flex: 2, minWidth: 120 }}>
            <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2 }}>Notes</div>
            <input
              style={{ ...inputStyle, width: "100%" }}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="Optional notes"
            />
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: spacing.xs,
              cursor: "pointer",
              fontSize: fontSize.sm,
              fontWeight: 600,
              color: form.method === "gcash" ? colors.primary : colors.textSecondary,
              userSelect: "none",
              minHeight: 30,
              padding: `0 ${spacing.sm}px`,
            }}
          >
            <input
              type="checkbox"
              checked={form.method === "gcash"}
              onChange={(e) => setForm((p) => ({ ...p, method: e.target.checked ? "gcash" : "cash" }))}
              style={{ width: 16, height: 16, cursor: "pointer", accentColor: colors.primary }}
            />
            Paid via GCash
          </label>
          <button style={btnStyle("primary")} onClick={handleSave} disabled={!form.name.trim()}>
            {editingId ? "Save" : "+ Add"}
          </button>
          {editingId && (
            <button style={btnStyle("secondary")} onClick={cancelEdit}>Cancel</button>
          )}
        </div>
      </div>

      {/* Daily expenses list */}
      <div style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: borderRadius.md,
        flex: 1,
        minHeight: 120,
        overflow: "auto",
      }}>
        {dailyExpenses.length === 0 ? (
          <div style={{ padding: spacing.xl, textAlign: "center", color: colors.textTertiary, fontSize: fontSize.sm }}>
            No expenses for {currentDate}. {isToday ? "Add one above." : "This day has no recorded expenses."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Time", "Product / Item", "Qty", "Unit", "Cost (₱)", "Notes", ""].map((h, i) => (
                  <th key={i} style={{
                    padding: spacing.sm,
                    textAlign: i === 4 ? "right" : "left",
                    fontSize: fontSize.xs,
                    fontWeight: 700,
                    color: colors.textTertiary,
                    borderBottom: `2px solid ${colors.border}`,
                    position: "sticky",
                    top: 0,
                    backgroundColor: colors.surfaceElevated,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dailyExpenses.map((exp, i) => {
                const isEditing = editingId === exp.id;
                const parsed = parseExpenseMethod(exp.notes);
                return (
                  <tr
                    key={exp.id}
                    onClick={() => { if (!isEditing) startEdit(exp); }}
                    style={{
                      backgroundColor: isEditing ? colors.primaryLight : (i % 2 ? colors.surface : colors.background),
                      cursor: "pointer",
                      borderLeft: isEditing ? `3px solid ${colors.primary}` : "3px solid transparent",
                    }}
                    title="Click to edit"
                  >
                    <td style={{ padding: spacing.sm, fontSize: fontSize.xs, color: colors.textSecondary, whiteSpace: "nowrap" }}>{formatTime(exp.created_at)}</td>
                    <td style={{ padding: spacing.sm, fontSize: fontSize.sm, color: colors.textPrimary, fontWeight: isEditing ? 700 : 500 }}>
                      {exp.name}
                      <span style={{
                        marginLeft: spacing.sm,
                        fontSize: fontSize.xs,
                        fontWeight: 700,
                        padding: `1px ${spacing.xs + 2}px`,
                        borderRadius: borderRadius.full,
                        backgroundColor: parsed.method === "gcash" ? (colors.infoLight ?? colors.primaryLight) : (colors.successLight ?? colors.surfaceElevated),
                        color: parsed.method === "gcash" ? (colors.info ?? colors.primary) : (colors.success ?? colors.textSecondary),
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}>
                        {parsed.method}
                      </span>
                    </td>
                    <td style={{ padding: spacing.sm, fontSize: fontSize.sm, color: colors.textSecondary }}>{exp.frequency || "—"}</td>
                    <td style={{ padding: spacing.sm, fontSize: fontSize.sm, color: colors.textSecondary }}>{exp.frequency ? (exp.category || "pcs") : "—"}</td>
                    <td style={{ padding: spacing.sm, fontSize: fontSize.sm, color: colors.textPrimary, fontWeight: 600, textAlign: "right" }}>₱{(exp.amount || 0).toFixed(2)}</td>
                    <td style={{ padding: spacing.sm, fontSize: fontSize.xs, color: colors.textSecondary, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{parsed.notes || "—"}</td>
                    <td style={{ padding: spacing.sm }}>
                      <button
                        style={{ ...btnStyle("danger"), padding: `2px ${spacing.sm}px`, fontSize: fontSize.xs, minHeight: 24 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${exp.name}"?`)) deleteExpense.mutate(exp.id);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stock tab — per-day stock list (isolated history, no copy-over)
// ---------------------------------------------------------------------------

interface StockItem {
  id: string;
  label: string;
  qty: string;
  unit: string;
  notes?: string;
  checked: boolean;
  at?: string;
  by?: string;
}

const STOCK_UNIT_OPTIONS = ["pcs", "g", "kg", "oz", "lb", "mL", "L", "cup", "pack", "box", "bag", "bottle", "can", "each"];

function StockView({ currentDate }: { currentDate: string }) {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const { currentEmployee } = useAuthStore();
  const queryClient = useQueryClient();

  const stockKey = `scheduling_stock_${currentDate}`;
  const [newLabel, setNewLabel] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newUnit, setNewUnit] = useState("pcs");
  const [newNotes, setNewNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editUnit, setEditUnit] = useState("pcs");
  const [editNotes, setEditNotes] = useState("");

  // Previous date for carryover
  const prevDate = useMemo(() => {
    const d = new Date(currentDate + "T00:00");
    if (isNaN(d.getTime())) return "";
    d.setDate(d.getDate() - 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, [currentDate]);

  const prevStockKey = `scheduling_stock_${prevDate}`;

  const { data: stockRaw } = useQuery({
    queryKey: ["scheduling-stock", currentDate],
    queryFn: () => settingsRepo.get(stockKey),
  });

  const { data: prevStockRaw } = useQuery({
    queryKey: ["scheduling-stock", prevDate],
    queryFn: () => settingsRepo.get(prevStockKey),
    enabled: !!prevDate,
  });

  const items: StockItem[] = useMemo(() => {
    if (!stockRaw) return [];
    try {
      const parsed = JSON.parse(stockRaw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [stockRaw]);

  // Carry over unchecked items from the previous day if current day has no entries
  useEffect(() => {
    if (stockRaw != null) return; // already has data (even "[]")
    if (!prevStockRaw) return;
    try {
      const prevItems: StockItem[] = JSON.parse(prevStockRaw);
      if (!Array.isArray(prevItems)) return;
      const unchecked = prevItems
        .filter((it) => !it.checked)
        .map((it) => ({
          ...it,
          id: "stk_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          checked: false,
          at: undefined,
          by: undefined,
        }));
      if (unchecked.length === 0) return;
      settingsRepo.set(stockKey, JSON.stringify(unchecked), "scheduling").then(() => {
        queryClient.invalidateQueries({ queryKey: ["scheduling-stock", currentDate] });
        performSync().catch(() => {});
      });
    } catch {}
  }, [stockRaw, prevStockRaw, stockKey, currentDate, queryClient]);

  async function saveItems(next: StockItem[]) {
    await settingsRepo.set(stockKey, JSON.stringify(next), "scheduling");
    queryClient.invalidateQueries({ queryKey: ["scheduling-stock", currentDate] });
    performSync().catch(() => {});
  }

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    const id = "stk_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const next = [...items, {
      id,
      label: newLabel.trim(),
      qty: newQty.trim(),
      unit: newUnit,
      notes: newNotes.trim() || undefined,
      checked: false,
    }];
    await saveItems(next);
    setNewLabel("");
    setNewQty("");
    setNewNotes("");
  };

  const handleToggle = async (id: string) => {
    const next = items.map((it) =>
      it.id === id
        ? it.checked
          ? { ...it, checked: false, at: undefined, by: undefined }
          : { ...it, checked: true, at: new Date().toISOString(), by: currentEmployee?.name || "unknown" }
        : it
    );
    await saveItems(next);
  };

  const handleRemove = async (id: string) => {
    if (!confirm("Remove this stock entry?")) return;
    await saveItems(items.filter((it) => it.id !== id));
  };

  const handleReset = async () => {
    if (!confirm("Uncheck all stock items for this day?")) return;
    await saveItems(items.map((it) => ({ ...it, checked: false, at: undefined, by: undefined })));
  };

  const handleReorder = async (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const fromIdx = items.findIndex((it) => it.id === fromId);
    const toIdx = items.findIndex((it) => it.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = items.slice();
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    await saveItems(next);
  };

  const [dragFromId, setDragFromId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [handleDown, setHandleDown] = useState(false);

  const startEdit = (it: StockItem) => {
    setEditingId(it.id);
    setEditLabel(it.label);
    setEditQty(it.qty);
    setEditUnit(it.unit || "pcs");
    setEditNotes(it.notes || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLabel("");
    setEditQty("");
    setEditUnit("pcs");
    setEditNotes("");
  };

  const saveEdit = async () => {
    if (!editingId || !editLabel.trim()) return;
    const next = items.map((it) =>
      it.id === editingId
        ? { ...it, label: editLabel.trim(), qty: editQty.trim(), unit: editUnit, notes: editNotes.trim() || undefined }
        : it
    );
    await saveItems(next);
    cancelEdit();
  };

  const completed = items.filter((it) => it.checked).length;
  const total = items.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  const formatTime = (iso?: string) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: `${spacing.xs}px ${spacing.sm}px`,
    fontSize: fontSize.sm,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background,
    color: colors.textPrimary,
    outline: "none",
    minHeight: 30,
    boxSizing: "border-box" as const,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.md, flex: 1, overflow: "auto" }}>
      {/* Progress header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: `${spacing.sm}px ${spacing.md}px`,
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: borderRadius.md,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: fontSize.sm, fontWeight: 600, color: colors.textPrimary, marginBottom: 4 }}>
            {completed} of {total} checked · {currentDate}
          </div>
          <div style={{ height: 6, backgroundColor: colors.surfaceElevated, borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              width: `${progress}%`,
              height: "100%",
              backgroundColor: progress === 100 && total > 0 ? colors.success : colors.primary,
              transition: "width 0.2s",
            }} />
          </div>
        </div>
        <button
          onClick={handleReset}
          disabled={items.length === 0}
          style={{
            marginLeft: spacing.md,
            padding: `${spacing.xs}px ${spacing.md}px`,
            fontSize: fontSize.xs,
            fontWeight: 600,
            backgroundColor: "transparent",
            color: colors.textSecondary,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.sm,
            cursor: items.length === 0 ? "not-allowed" : "pointer",
            opacity: items.length === 0 ? 0.4 : 1,
          }}
        >
          Reset
        </button>
      </div>

      {/* Stock list */}
      <div style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: borderRadius.md,
        padding: spacing.sm,
      }}>
        {items.length === 0 ? (
          <div style={{ padding: spacing.md, textAlign: "center", color: colors.textTertiary, fontSize: fontSize.sm }}>
            No stock entries for {currentDate}. Add one below.
          </div>
        ) : (
          items.map((item, idx) => {
            const isEditing = editingId === item.id;
            if (isEditing) {
              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    gap: spacing.xs,
                    padding: `${spacing.sm}px ${spacing.xs}px`,
                    borderBottom: `1px solid ${colors.border}`,
                    backgroundColor: colors.primaryLight,
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                    style={{ ...inputStyle, flex: 2, minWidth: 140 }}
                  />
                  <input
                    type="text"
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                    placeholder="Qty"
                    style={{ ...inputStyle, flex: 1, minWidth: 70 }}
                  />
                  <select
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    style={{ ...inputStyle, flex: 1, minWidth: 80, cursor: "pointer" }}
                  >
                    {STOCK_UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                    placeholder="Notes"
                    style={{ ...inputStyle, flex: 2, minWidth: 120 }}
                  />
                  <button
                    onClick={saveEdit}
                    disabled={!editLabel.trim()}
                    style={{
                      padding: `${spacing.xs}px ${spacing.md}px`,
                      fontSize: fontSize.sm,
                      fontWeight: 600,
                      backgroundColor: colors.primary,
                      color: colors.textOnPrimary,
                      border: "none",
                      borderRadius: borderRadius.sm,
                      cursor: editLabel.trim() ? "pointer" : "not-allowed",
                      opacity: editLabel.trim() ? 1 : 0.5,
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    style={{
                      padding: `${spacing.xs}px ${spacing.md}px`,
                      fontSize: fontSize.sm,
                      fontWeight: 600,
                      backgroundColor: "transparent",
                      color: colors.textSecondary,
                      border: `1px solid ${colors.border}`,
                      borderRadius: borderRadius.sm,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              );
            }
            const isDragOver = dragOverId === item.id && dragFromId !== item.id;
            return (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", item.id);
                  e.dataTransfer.effectAllowed = "move";
                  setDragFromId(item.id);
                }}
                onDragEnd={() => { setDragFromId(null); setDragOverId(null); }}
                onDragOver={(e) => { e.preventDefault(); if (dragFromId !== item.id) setDragOverId(item.id); }}
                onDragLeave={() => { if (dragOverId === item.id) setDragOverId(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const fromId = e.dataTransfer.getData("text/plain") || dragFromId;
                  if (fromId) handleReorder(fromId, item.id);
                  setDragFromId(null);
                  setDragOverId(null);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: spacing.sm,
                  padding: `${spacing.sm}px ${spacing.xs}px`,
                  borderBottom: `1px solid ${colors.border}`,
                  backgroundColor: isDragOver ? colors.primaryLight : "transparent",
                  opacity: dragFromId === item.id ? 0.5 : 1,
                }}
              >
                <span
                  title="Drag to reorder"
                  style={{
                    width: 18,
                    color: colors.textTertiary,
                    fontSize: fontSize.md,
                    cursor: "grab",
                    userSelect: "none",
                    flexShrink: 0,
                    lineHeight: 1,
                  }}
                >
                  ⋮⋮
                </span>
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => handleToggle(item.id)}
                  style={{
                    width: 20,
                    height: 20,
                    cursor: "pointer",
                    accentColor: colors.primary,
                    flexShrink: 0,
                  }}
                />
                <div
                  style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                  onClick={() => startEdit(item)}
                  title="Click to edit"
                >
                  <div
                    style={{
                      fontSize: fontSize.md,
                      fontWeight: 500,
                      color: item.checked ? colors.textTertiary : colors.textPrimary,
                      textDecoration: item.checked ? "line-through" : "none",
                    }}
                  >
                    {item.label}
                    {item.qty && (
                      <span style={{ marginLeft: spacing.sm, fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: 600 }}>
                        {item.qty} {item.unit}
                      </span>
                    )}
                  </div>
                  {item.notes && (
                    <div style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2, fontStyle: "italic" }}>
                      {item.notes}
                    </div>
                  )}
                  {item.checked && item.at && (
                    <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>
                      ✓ {formatTime(item.at)}{item.by ? ` · ${item.by}` : ""}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => startEdit(item)}
                  style={{
                    padding: `2px ${spacing.sm}px`,
                    fontSize: fontSize.xs,
                    backgroundColor: "transparent",
                    color: colors.textSecondary,
                    border: `1px solid ${colors.border}`,
                    borderRadius: borderRadius.sm,
                    cursor: "pointer",
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleRemove(item.id)}
                  style={{
                    padding: `2px ${spacing.sm}px`,
                    fontSize: fontSize.xs,
                    backgroundColor: "transparent",
                    color: colors.error,
                    border: `1px solid ${colors.error}`,
                    borderRadius: borderRadius.sm,
                    cursor: "pointer",
                    opacity: 0.7,
                  }}
                >
                  ×
                </button>
              </div>
            );
          })
        )}

        {/* Add row */}
        <div style={{ display: "flex", gap: spacing.sm, marginTop: spacing.sm, paddingTop: spacing.sm, borderTop: `2px solid ${colors.border}`, flexWrap: "wrap" }}>
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Item name (e.g. Flour, Cups)"
            style={{ ...inputStyle, flex: 2, minWidth: 140 }}
          />
          <input
            type="text"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Qty"
            style={{ ...inputStyle, flex: 1, minWidth: 70 }}
          />
          <select
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 80, cursor: "pointer" }}
          >
            {STOCK_UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <input
            type="text"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Notes (optional)"
            style={{ ...inputStyle, flex: 2, minWidth: 140 }}
          />
          <button
            onClick={handleAdd}
            disabled={!newLabel.trim()}
            style={{
              padding: `${spacing.xs}px ${spacing.md}px`,
              fontSize: fontSize.sm,
              fontWeight: 600,
              backgroundColor: colors.primary,
              color: colors.textOnPrimary,
              border: "none",
              borderRadius: borderRadius.sm,
              cursor: newLabel.trim() ? "pointer" : "not-allowed",
              opacity: newLabel.trim() ? 1 : 0.5,
            }}
          >
            + Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar view — monthly grid with per-day notes and salary list
// ---------------------------------------------------------------------------

interface SalaryEntry {
  id: string;
  name: string;
  amount: number;
}

function CalendarView({ onSelectDate }: { onSelectDate: (d: string) => void }) {
  const { colors, spacing, borderRadius, fontSize, isMobile } = useTheme();
  const queryClient = useQueryClient();
  const today = useToday();
  const splitLayout = !isMobile;

  const [viewYear, setViewYear] = useState(() => parseInt(today.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => parseInt(today.slice(5, 7)));
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [multiSelect, setMultiSelect] = useState(false);
  const [anchorDay, setAnchorDay] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [salaryName, setSalaryName] = useState("");
  const [salaryAmount, setSalaryAmount] = useState("");
  const [noteFocused, setNoteFocused] = useState(false);

  const selectedDay = selectedDays.length === 1 ? selectedDays[0] : null;
  const isMulti = selectedDays.length > 1;

  const pad = (n: number) => String(n).padStart(2, "0");

  const grid = useMemo(() => {
    const first = new Date(viewYear, viewMonth - 1, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${viewYear}-${pad(viewMonth)}-${pad(d)}`);
    }
    return cells;
  }, [viewYear, viewMonth]);

  // Batch-load notes and salaries for visible month. Previous code did
  // ~60 sequential IPC round-trips per render (2 settings reads × 30 days)
  // which dominated the Scheduling page's load time. We now run two
  // prefix-LIKE queries against the settings table — total of 2 round-trips,
  // regardless of month length — and bucket the results in JS.
  const monthPrefix = `${viewYear}-${pad(viewMonth)}-`;
  const { data: monthData = { notes: new Map<string, string>(), salaries: new Map<string, SalaryEntry[]>() } } = useQuery({
    queryKey: ["scheduling-calendar", viewYear, viewMonth],
    queryFn: async () => {
      const notes = new Map<string, string>();
      const salaries = new Map<string, SalaryEntry[]>();
      const [noteRows, salRows] = await Promise.all([
        dbQuery<{ key: string; value: string }>(
          `SELECT key, value FROM settings WHERE deleted_at IS NULL AND key LIKE ?`,
          [`scheduling_calendar_${monthPrefix}%`]
        ),
        dbQuery<{ key: string; value: string }>(
          `SELECT key, value FROM settings WHERE deleted_at IS NULL AND key LIKE ?`,
          [`scheduling_salary_${monthPrefix}%`]
        ),
      ]);
      const noteKeyPrefix = `scheduling_calendar_`;
      for (const row of noteRows) {
        const dateStr = row.key.slice(noteKeyPrefix.length);
        if (row.value) notes.set(dateStr, row.value);
      }
      const salKeyPrefix = `scheduling_salary_`;
      for (const row of salRows) {
        const dateStr = row.key.slice(salKeyPrefix.length);
        if (!row.value) continue;
        try {
          const parsed = JSON.parse(row.value);
          if (Array.isArray(parsed)) salaries.set(dateStr, parsed);
        } catch {}
      }
      return { notes, salaries };
    },
  });

  useEffect(() => {
    // Don't overwrite what the user is actively typing
    if (noteFocused) return;
    if (selectedDays.length === 0) {
      setNoteText("");
      return;
    }
    if (selectedDays.length === 1) {
      setNoteText(monthData.notes.get(selectedDays[0]) || "");
    } else {
      // Multi-select: if all selected days share the same note, show it; else blank
      const firstNote = monthData.notes.get(selectedDays[0]) || "";
      const allSame = selectedDays.every((d) => (monthData.notes.get(d) || "") === firstNote);
      setNoteText(allSame ? firstNote : "");
    }
  }, [selectedDays, monthData, noteFocused]);

  const onDayClick = (dateStr: string, e: React.MouseEvent) => {
    const shift = e.shiftKey;
    const additive = e.ctrlKey || e.metaKey;

    // Shift+click: select a contiguous range from anchor to clicked day
    if (shift && anchorDay) {
      const a = anchorDay;
      const b = dateStr;
      const start = a < b ? a : b;
      const end = a < b ? b : a;
      const range: string[] = [];
      const startDate = new Date(start + "T00:00");
      const endDate = new Date(end + "T00:00");
      const cursor = new Date(startDate);
      while (cursor <= endDate) {
        const y = cursor.getFullYear();
        const m = String(cursor.getMonth() + 1).padStart(2, "0");
        const d = String(cursor.getDate()).padStart(2, "0");
        range.push(`${y}-${m}-${d}`);
        cursor.setDate(cursor.getDate() + 1);
      }
      setSelectedDays(range);
      return;
    }

    // Ctrl/Cmd+click: toggle this day in/out of the current selection
    if (additive) {
      setSelectedDays((prev) => {
        if (prev.includes(dateStr)) return prev.filter((d) => d !== dateStr);
        return [...prev, dateStr].sort();
      });
      setAnchorDay(dateStr);
      return;
    }

    // Checkbox-based multi-select mode: plain click toggles
    if (multiSelect) {
      setSelectedDays((prev) => {
        if (prev.includes(dateStr)) return prev.filter((d) => d !== dateStr);
        return [...prev, dateStr].sort();
      });
      setAnchorDay(dateStr);
      return;
    }

    // Plain click: single-select + set anchor for future shift-click ranges
    setSelectedDays([dateStr]);
    setAnchorDay(dateStr);
  };

  const saveNote = async () => {
    if (selectedDays.length === 0) return;
    const value = noteText.trim();
    for (const d of selectedDays) {
      const existing = monthData.notes.get(d) || "";
      if (existing === value) continue;
      await settingsRepo.set(`scheduling_calendar_${d}`, value, "scheduling");
    }
    queryClient.invalidateQueries({ queryKey: ["scheduling-calendar", viewYear, viewMonth] });
    performSync().catch(() => {});
  };

  const salariesForDay = selectedDay ? (monthData.salaries.get(selectedDay) || []) : [];
  const salaryTotal = salariesForDay.reduce((s, e) => s + (e.amount || 0), 0);

  const saveSalariesForDay = async (dateStr: string, next: SalaryEntry[]) => {
    await settingsRepo.set(`scheduling_salary_${dateStr}`, JSON.stringify(next), "scheduling");
  };

  const addSalary = async () => {
    if (selectedDays.length === 0 || !salaryName.trim()) return;
    const amt = parseFloat(salaryAmount) || 0;
    const name = salaryName.trim();
    for (const d of selectedDays) {
      const existing = monthData.salaries.get(d) || [];
      const entry: SalaryEntry = {
        id: "sal_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name,
        amount: amt,
      };
      await saveSalariesForDay(d, [...existing, entry]);
    }
    queryClient.invalidateQueries({ queryKey: ["scheduling-calendar", viewYear, viewMonth] });
    performSync().catch(() => {});
    setSalaryName("");
    setSalaryAmount("");
  };

  const removeSalary = async (id: string) => {
    if (!selectedDay) return;
    if (!confirm("Remove this salary entry?")) return;
    await saveSalariesForDay(selectedDay, salariesForDay.filter((e) => e.id !== id));
    queryClient.invalidateQueries({ queryKey: ["scheduling-calendar", viewYear, viewMonth] });
    performSync().catch(() => {});
  };

  const selectAllMonth = () => {
    const all: string[] = [];
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      all.push(`${viewYear}-${pad(viewMonth)}-${pad(d)}`);
    }
    setSelectedDays(all);
  };

  const clearSelection = () => setSelectedDays([]);

  const prevMonth = () => {
    if (viewMonth === 1) { setViewYear((y) => y - 1); setViewMonth(12); }
    else setViewMonth((m) => m - 1);
    setSelectedDays([]);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewYear((y) => y + 1); setViewMonth(1); }
    else setViewMonth((m) => m + 1);
    setSelectedDays([]);
  };

  const monthLabel = new Date(viewYear, viewMonth - 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const dayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Arrow key navigation for calendar days
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      const base = selectedDays.length > 0 ? selectedDays[selectedDays.length - 1] : today;
      const dt = new Date(base + "T00:00");
      if (isNaN(dt.getTime())) return;
      const delta = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" ? -7 : 7;
      dt.setDate(dt.getDate() + delta);
      const y = dt.getFullYear();
      const m = dt.getMonth() + 1;
      const d = dt.getDate();
      const next = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      // Follow the cursor into the month it lands in
      if (y !== viewYear || m !== viewMonth) {
        setViewYear(y);
        setViewMonth(m);
      }
      if (e.shiftKey && anchorDay) {
        // Shift+arrow: extend range selection from the anchor
        const a = anchorDay;
        const start = a < next ? a : next;
        const end = a < next ? next : a;
        const range: string[] = [];
        const cursor = new Date(start + "T00:00");
        const endDate = new Date(end + "T00:00");
        while (cursor <= endDate) {
          range.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`);
          cursor.setDate(cursor.getDate() + 1);
        }
        setSelectedDays(range);
      } else {
        setSelectedDays([next]);
        setAnchorDay(next);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedDays, anchorDay, viewYear, viewMonth, today]);

  const monthNavBlock = (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: borderRadius.md,
      padding: `${spacing.sm}px ${spacing.md}px`,
    }}>
      <button onClick={prevMonth} style={{ padding: `${spacing.xs}px ${spacing.md}px`, fontSize: fontSize.md, fontWeight: 700, backgroundColor: "transparent", color: colors.textSecondary, border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm, cursor: "pointer" }}>
        ←
      </button>
      <div style={{ fontSize: fontSize.lg, fontWeight: 700, color: colors.textPrimary }}>{monthLabel}</div>
      <button onClick={nextMonth} style={{ padding: `${spacing.xs}px ${spacing.md}px`, fontSize: fontSize.md, fontWeight: 700, backgroundColor: "transparent", color: colors.textSecondary, border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm, cursor: "pointer" }}>
        →
      </button>
    </div>
  );

  const multiSelectToolbarBlock = (
    <div style={{ display: "flex", gap: spacing.sm, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>
          Tip: ← → ↑ ↓ to move · Shift+arrow/click for a range · Ctrl/Cmd+click to toggle days
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: spacing.xs, cursor: "pointer", fontSize: fontSize.sm, fontWeight: 600, color: multiSelect ? colors.primary : colors.textSecondary, userSelect: "none" }}>
          <input
            type="checkbox"
            checked={multiSelect}
            onChange={(e) => {
              setMultiSelect(e.target.checked);
              if (!e.target.checked && selectedDays.length > 1) setSelectedDays([]);
            }}
            style={{ width: 16, height: 16, cursor: "pointer", accentColor: colors.primary }}
          />
          Select multiple days
        </label>
      {multiSelect && (
        <>
          <button
            onClick={selectAllMonth}
            style={{ padding: `${spacing.xs}px ${spacing.sm}px`, fontSize: fontSize.xs, fontWeight: 600, backgroundColor: "transparent", color: colors.textSecondary, border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm, cursor: "pointer" }}
          >
            Select all in month
          </button>
          <button
            onClick={clearSelection}
            disabled={selectedDays.length === 0}
            style={{ padding: `${spacing.xs}px ${spacing.sm}px`, fontSize: fontSize.xs, fontWeight: 600, backgroundColor: "transparent", color: colors.textSecondary, border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm, cursor: selectedDays.length === 0 ? "not-allowed" : "pointer", opacity: selectedDays.length === 0 ? 0.4 : 1 }}
          >
            Clear selection
          </button>
          {selectedDays.length > 0 && (
            <span style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>
              {selectedDays.length} day{selectedDays.length !== 1 ? "s" : ""} selected
            </span>
          )}
        </>
      )}
    </div>
  );

  const calendarGridBlock = (
    <div style={{
      backgroundColor: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: borderRadius.md,
      padding: spacing.sm,
    }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: spacing.xs }}>
          {dayHeaders.map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: fontSize.xs, fontWeight: 700, color: colors.textTertiary, padding: spacing.xs }}>
              {d}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {grid.map((dateStr, i) => {
            if (!dateStr) return <div key={`empty-${i}`} />;
            const dayNum = parseInt(dateStr.slice(8));
            const isToday = dateStr === today;
            const isSelected = selectedDays.includes(dateStr);
            const hasNote = (monthData.notes.get(dateStr) || "").trim().length > 0;
            const hasSalary = (monthData.salaries.get(dateStr) || []).length > 0;
            return (
              <div
                key={dateStr}
                onClick={(e) => onDayClick(dateStr, e)}
                style={{
                  aspectRatio: "1",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  borderRadius: borderRadius.sm,
                  cursor: "pointer",
                  fontSize: fontSize.sm,
                  fontWeight: isToday ? 700 : 500,
                  color: isSelected ? colors.textOnPrimary : isToday ? colors.primary : colors.textPrimary,
                  backgroundColor: isSelected ? colors.primary : isToday ? colors.primaryLight : "transparent",
                  border: isToday && !isSelected ? `2px solid ${colors.primary}` : `1px solid transparent`,
                }}
              >
                {dayNum}
                <div style={{ display: "flex", gap: 3 }}>
                  {hasNote && (
                    <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: isSelected ? colors.textOnPrimary : colors.accent }} />
                  )}
                  {hasSalary && (
                    <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: isSelected ? colors.textOnPrimary : colors.success }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
  );

  const editorBlock = selectedDays.length > 0 ? (
    <div style={{
      backgroundColor: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      display: "flex",
      flexDirection: "column",
      gap: spacing.md,
    }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: spacing.sm }}>
            <div style={{ fontSize: fontSize.md, fontWeight: 700, color: colors.textPrimary }}>
              {isMulti
                ? `Editing ${selectedDays.length} days`
                : new Date(selectedDays[0] + "T00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </div>
            {!isMulti && (
              <button
                onClick={() => onSelectDate(selectedDays[0])}
                style={{
                  padding: `${spacing.xs}px ${spacing.md}px`,
                  fontSize: fontSize.xs,
                  fontWeight: 600,
                  backgroundColor: colors.primary,
                  color: colors.textOnPrimary,
                  border: "none",
                  borderRadius: borderRadius.sm,
                  cursor: "pointer",
                }}
              >
                Go to this day
              </button>
            )}
          </div>
          {isMulti && (
            <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: -spacing.xs, wordBreak: "break-word" }}>
              {selectedDays.join(", ")}
            </div>
          )}

          {/* Notes */}
          <div>
            <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textSecondary, marginBottom: spacing.xs }}>Notes</div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onFocus={() => setNoteFocused(true)}
              onBlur={() => { setNoteFocused(false); saveNote(); }}
              placeholder={isMulti ? `Write once — applies to all ${selectedDays.length} selected days` : "Add notes for this day..."}
              rows={3}
              style={{
                width: "100%",
                padding: `${spacing.sm}px`,
                fontSize: fontSize.sm,
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.sm,
                backgroundColor: colors.background,
                color: colors.textPrimary,
                outline: "none",
                resize: "vertical",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Salary list */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs }}>
              <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textSecondary }}>
                Salary{isMulti ? ` (added to all ${selectedDays.length} days)` : ""}
              </div>
              {!isMulti && salariesForDay.length > 0 && (
                <div style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.textPrimary }}>
                  Total: ₱{salaryTotal.toFixed(2)}
                </div>
              )}
            </div>
            {!isMulti && salariesForDay.length > 0 && (
              <div style={{ border: `1px solid ${colors.border}`, borderRadius: borderRadius.sm, marginBottom: spacing.sm }}>
                {salariesForDay.map((e, i) => (
                  <div
                    key={e.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: spacing.sm,
                      padding: `${spacing.xs + 2}px ${spacing.sm}px`,
                      borderBottom: i === salariesForDay.length - 1 ? "none" : `1px solid ${colors.border}`,
                    }}
                  >
                    <div style={{ flex: 1, fontSize: fontSize.sm, color: colors.textPrimary, fontWeight: 500 }}>{e.name}</div>
                    <div style={{ fontSize: fontSize.sm, color: colors.textPrimary, fontWeight: 700 }}>₱{e.amount.toFixed(2)}</div>
                    <button
                      onClick={() => removeSalary(e.id)}
                      style={{
                        padding: `2px ${spacing.sm}px`,
                        fontSize: fontSize.xs,
                        backgroundColor: "transparent",
                        color: colors.error,
                        border: `1px solid ${colors.error}`,
                        borderRadius: borderRadius.sm,
                        cursor: "pointer",
                        opacity: 0.7,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: spacing.sm, flexWrap: "wrap" }}>
              <input
                type="text"
                value={salaryName}
                onChange={(e) => setSalaryName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSalary()}
                placeholder="Employee name"
                style={{
                  flex: 2,
                  minWidth: 140,
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  fontSize: fontSize.sm,
                  border: `1px solid ${colors.border}`,
                  borderRadius: borderRadius.sm,
                  backgroundColor: colors.background,
                  color: colors.textPrimary,
                  outline: "none",
                  minHeight: 30,
                }}
              />
              <input
                type="number"
                step="0.01"
                value={salaryAmount}
                onChange={(e) => setSalaryAmount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSalary()}
                placeholder="Amount (₱)"
                style={{
                  flex: 1,
                  minWidth: 100,
                  padding: `${spacing.xs}px ${spacing.sm}px`,
                  fontSize: fontSize.sm,
                  border: `1px solid ${colors.border}`,
                  borderRadius: borderRadius.sm,
                  backgroundColor: colors.background,
                  color: colors.textPrimary,
                  outline: "none",
                  minHeight: 30,
                  textAlign: "right",
                }}
              />
              <button
                onClick={addSalary}
                disabled={!salaryName.trim()}
                style={{
                  padding: `${spacing.xs}px ${spacing.md}px`,
                  fontSize: fontSize.sm,
                  fontWeight: 600,
                  backgroundColor: colors.primary,
                  color: colors.textOnPrimary,
                  border: "none",
                  borderRadius: borderRadius.sm,
                  cursor: salaryName.trim() ? "pointer" : "not-allowed",
                  opacity: salaryName.trim() ? 1 : 0.5,
                }}
              >
                + Add
              </button>
            </div>
          </div>
    </div>
  ) : null;

  if (splitLayout) {
    return (
      <div style={{ display: "flex", flexDirection: "row", gap: spacing.md, flex: 1, overflow: "hidden", minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: spacing.md, overflow: "auto" }}>
          {multiSelectToolbarBlock}
          {editorBlock}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: spacing.md, overflow: "auto" }}>
          {monthNavBlock}
          {calendarGridBlock}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.md, flex: 1, overflow: "auto" }}>
      {monthNavBlock}
      {multiSelectToolbarBlock}
      {calendarGridBlock}
      {editorBlock}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Counting view — list of numbers per day, with +/- counters and amount fields
// ---------------------------------------------------------------------------

interface CountingItem {
  id: string;
  value: number;
  amount: string;
}

interface CountingDefault {
  id: string;
  value: number;
}

const COUNTING_DEFAULTS_KEY = "scheduling_counting_defaults";

function CountingView({ currentDate }: { currentDate: string }) {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const dayKey = `scheduling_counting_${currentDate}`;
  const [adding, setAdding] = useState("");
  const [deletedStack, setDeletedStack] = useState<{ item: CountingItem; index: number }[]>([]);

  // Drop the undo stack whenever the day switches — undo only makes sense
  // within the same date's session.
  useEffect(() => { setDeletedStack([]); }, [currentDate]);

  const { data: defaultsRaw } = useQuery({
    queryKey: ["counting-defaults"],
    queryFn: () => settingsRepo.get(COUNTING_DEFAULTS_KEY),
  });
  const { data: dayRaw } = useQuery({
    queryKey: ["counting-day", currentDate],
    queryFn: () => settingsRepo.get(dayKey),
  });

  const defaults: CountingDefault[] = useMemo(() => {
    if (!defaultsRaw) return [];
    try {
      const p = JSON.parse(defaultsRaw);
      return Array.isArray(p) ? p : [];
    } catch { return []; }
  }, [defaultsRaw]);

  // Server-derived view of the day's list. Used to seed local state when
  // the date changes or remote data arrives.
  const serverItems: CountingItem[] = useMemo(() => {
    if (dayRaw) {
      try {
        const p = JSON.parse(dayRaw);
        return Array.isArray(p) ? p : [];
      } catch { return []; }
    }
    return defaults.map((d) => ({ id: d.id, value: d.value, amount: "" }));
  }, [dayRaw, defaults]);

  // Local optimistic state — every keystroke / +/- click updates this
  // immediately so the UI is snappy. Persisted with a debounced write.
  const [items, setItems] = useState<CountingItem[]>(serverItems);

  // Re-seed when the date or server data changes. Compare by content so
  // pending local edits aren't clobbered by an identical refetch.
  const serverSnapshot = useMemo(() => JSON.stringify(serverItems), [serverItems]);
  const lastServerSnapshotRef = React.useRef<string>(serverSnapshot);
  useEffect(() => {
    if (serverSnapshot !== lastServerSnapshotRef.current) {
      lastServerSnapshotRef.current = serverSnapshot;
      setItems(serverItems);
    }
  }, [serverSnapshot, serverItems]);
  // Force re-seed when switching days regardless.
  useEffect(() => {
    lastServerSnapshotRef.current = serverSnapshot;
    setItems(serverItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  // Debounced persist: writes to SQLite + kicks off cloud sync ~400ms after
  // the last edit, so rapid +/- and typing doesn't spam IPC.
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingItemsRef = React.useRef<CountingItem[] | null>(null);
  const flush = React.useCallback(async () => {
    const pending = pendingItemsRef.current;
    if (!pending) return;
    pendingItemsRef.current = null;
    lastServerSnapshotRef.current = JSON.stringify(pending);
    await settingsRepo.set(dayKey, JSON.stringify(pending), "scheduling");
    performSync().catch(() => {});
  }, [dayKey]);
  const scheduleSave = (next: CountingItem[]) => {
    pendingItemsRef.current = next;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { flush(); }, 400);
  };
  // Flush on unmount and when day changes.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey]);

  const update = (next: CountingItem[]) => {
    setItems(next);
    scheduleSave(next);
  };

  const handleAdd = () => {
    const v = parseFloat(adding);
    if (isNaN(v)) return;
    const id = "cnt_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    update([...items, { id, value: v, amount: "" }]);
    setAdding("");
  };

  const handleStep = (id: string, delta: number) => {
    update(items.map((it) => {
      if (it.id !== id) return it;
      const current = parseFloat(it.amount);
      const next = (isNaN(current) ? 0 : current) + delta;
      return { ...it, amount: String(next) };
    }));
  };

  const handleAmount = (id: string, amount: string) => {
    update(items.map((it) => it.id === id ? { ...it, amount } : it));
  };

  const handleDelete = (id: string) => {
    const idx = items.findIndex((it) => it.id === id);
    if (idx < 0) return;
    const item = items[idx];
    if (!confirm(`Delete the row for ${item.value}?`)) return;
    setDeletedStack((prev) => [{ item, index: idx }, ...prev].slice(0, 20));
    update(items.filter((it) => it.id !== id));
  };

  const handleUndo = () => {
    setDeletedStack((prev) => {
      if (prev.length === 0) return prev;
      const [head, ...rest] = prev;
      const insertAt = Math.min(head.index, items.length);
      const next = items.slice();
      next.splice(insertAt, 0, head.item);
      update(next);
      return rest;
    });
  };

  const handleReorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const fromIdx = items.findIndex((it) => it.id === fromId);
    const toIdx = items.findIndex((it) => it.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = items.slice();
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    update(next);
  };

  const [dragFromId, setDragFromId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    padding: `${spacing.xs}px ${spacing.sm}px`,
    fontSize: fontSize.sm,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background,
    color: colors.textPrimary,
    outline: "none",
    boxSizing: "border-box",
  };

  const stepBtnStyle: React.CSSProperties = {
    width: 30,
    height: 30,
    fontSize: fontSize.md,
    fontWeight: 700,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.sm, flex: 1, overflow: "auto" }}>
      <div style={{ display: "flex", gap: spacing.xs }}>
        <input
          type="number"
          placeholder="Add a number..."
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={handleAdd}
          disabled={adding.trim() === ""}
          style={{
            padding: `${spacing.xs}px ${spacing.md}px`,
            fontSize: fontSize.sm,
            fontWeight: 600,
            border: `1px solid ${colors.primary}`,
            borderRadius: borderRadius.sm,
            backgroundColor: colors.primary,
            color: colors.textOnPrimary || "#fff",
            cursor: adding.trim() === "" ? "not-allowed" : "pointer",
            opacity: adding.trim() === "" ? 0.5 : 1,
          }}
        >
          Add
        </button>
        <button
          onClick={handleUndo}
          disabled={deletedStack.length === 0}
          title={deletedStack.length > 0 ? `Restore last deleted (${deletedStack.length} in stack)` : "Nothing to undo"}
          style={{
            padding: `${spacing.xs}px ${spacing.md}px`,
            fontSize: fontSize.sm,
            fontWeight: 600,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.sm,
            backgroundColor: colors.surfaceElevated,
            color: deletedStack.length > 0 ? colors.textPrimary : colors.textTertiary,
            cursor: deletedStack.length === 0 ? "not-allowed" : "pointer",
            opacity: deletedStack.length === 0 ? 0.5 : 1,
          }}
        >
          ↶ Undo{deletedStack.length > 1 ? ` (${deletedStack.length})` : ""}
        </button>
      </div>

      {items.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: spacing.sm,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.sm,
            backgroundColor: colors.surfaceElevated,
          }}
        >
          <span style={{ fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: 600 }}>Total</span>
          <span style={{ fontSize: fontSize.lg, fontWeight: 700, color: colors.textPrimary }}>
            {items.reduce((sum, it) => {
              const a = parseFloat(it.amount);
              return sum + it.value * (isNaN(a) ? 0 : a);
            }, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </div>
      )}

      {items.length === 0 && (
        <div style={{ textAlign: "center", color: colors.textTertiary, fontSize: fontSize.sm, padding: spacing.lg }}>
          No numbers yet. Add one above, or set defaults in Settings → Default counting.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs }}>
        {items.map((it) => (
          <div
            key={it.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", it.id);
              e.dataTransfer.effectAllowed = "move";
              setDragFromId(it.id);
            }}
            onDragEnd={() => { setDragFromId(null); setDragOverId(null); }}
            onDragOver={(e) => { e.preventDefault(); if (dragFromId !== it.id) setDragOverId(it.id); }}
            onDragLeave={() => { if (dragOverId === it.id) setDragOverId(null); }}
            onDrop={(e) => {
              e.preventDefault();
              const fromId = e.dataTransfer.getData("text/plain") || dragFromId;
              if (fromId) handleReorder(fromId, it.id);
              setDragFromId(null);
              setDragOverId(null);
            }}
            style={{
              display: "flex",
              gap: spacing.xs,
              alignItems: "center",
              padding: spacing.sm,
              border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.sm,
              backgroundColor: dragOverId === it.id ? colors.primaryLight : colors.surface,
              opacity: dragFromId === it.id ? 0.5 : 1,
            }}
          >
            <span
              title="Drag to reorder"
              style={{
                width: 18,
                color: colors.textTertiary,
                fontSize: fontSize.md,
                cursor: "grab",
                userSelect: "none",
                flexShrink: 0,
                lineHeight: 1,
              }}
            >
              ⋮⋮
            </span>
            <div
              style={{
                minWidth: 80,
                fontSize: fontSize.lg,
                fontWeight: 700,
                color: colors.textPrimary,
                textAlign: "right",
                paddingRight: spacing.sm,
              }}
            >
              {it.value}
            </div>
            <button style={stepBtnStyle} onClick={() => handleStep(it.id, -1)} aria-label="Decrement">−</button>
            <button style={stepBtnStyle} onClick={() => handleStep(it.id, 1)} aria-label="Increment">+</button>
            <button
              onClick={() => handleDelete(it.id)}
              aria-label="Delete row"
              style={{
                ...stepBtnStyle,
                color: colors.error,
                borderColor: colors.border,
              }}
            >
              ×
            </button>
            <input
              placeholder="Amount"
              value={it.amount}
              onChange={(e) => handleAmount(it.id, e.target.value)}
              style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payables view — accounts payable list backed by operational_expenses
// (rows where paid_at IS NULL). Marking a payable paid sets paid_at, which
// flips it into a regular expense for that day.
// ---------------------------------------------------------------------------

function PayablesView() {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const queryClient = useQueryClient();
  const today = useToday();

  const [form, setForm] = useState({ name: "", amount: "", billDate: "", notes: "" });
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: payables = [] } = useQuery({
    queryKey: ["payables"],
    queryFn: () => expenseRepo.getPayables(),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["payables"] });
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["expense-payments"] });
    performSync().catch(() => {});
  };

  const handleAdd = () => {
    setError("");
    const amount = parseFloat(form.amount);
    if (!form.name.trim()) { setError("Vendor / description is required"); return; }
    if (!isFinite(amount) || amount === 0) { setError("Enter a non-zero amount"); return; }
    // If the user picked a bill date, stamp created_at to that day with the
    // current wall-clock time so it sorts naturally next to same-day rows.
    let createdAt: string | undefined;
    if (form.billDate) {
      const [y, m, d] = form.billDate.split("-").map((n) => parseInt(n, 10));
      const nowLocal = new Date();
      const dt = new Date(y, (m || 1) - 1, d || 1, nowLocal.getHours(), nowLocal.getMinutes(), nowLocal.getSeconds());
      createdAt = dt.toISOString();
    }
    const name = form.name.trim();
    const notes = form.notes.trim() || null;
    // Optimistic UI: clear the form and add a placeholder row to the cache
    // immediately, then fire the DB write in the background. The user gets
    // instant feedback; refresh() reconciles with the real row when it lands.
    setForm({ name: "", amount: "", billDate: "", notes: "" });
    const tempId = "temp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const nowIso = new Date().toISOString();
    queryClient.setQueryData<PayableSummary[]>(["payables"], (old = []) => [
      {
        id: tempId,
        device_id: "",
        created_at: createdAt || nowIso,
        updated_at: nowIso,
        deleted_at: null,
        name,
        category: "other",
        amount,
        frequency: "per_use",
        notes,
        is_active: 1,
        due_date: null,
        paid_at: null,
        exclude_from_expenses: 0,
        paid_total: 0,
        remaining: amount,
      },
      ...old,
    ]);
    expenseRepo.createPayable({
      name,
      amount,
      notes,
      ...(createdAt ? { created_at: createdAt } : {}),
    }).then(() => refresh()).catch((err) => {
      console.error("createPayable failed", err);
      setError(`Save failed: ${(err as Error).message}`);
      refresh();
    });
  };

  // "Mark Paid" closes out the remaining balance with a single payment
  // dated today, then the parent's paid_at flips automatically. Works for
  // both positive bills and negative credits — abs() handles either sign.
  // Optimistic: the cached row's remaining drops to 0 + paid_at flips
  // immediately so the UI doesn't lag the DB write.
  const handleMarkPaid = (p: PayableSummary) => {
    const nowIso = new Date().toISOString();
    queryClient.setQueryData<PayableSummary[]>(["payables"], (old = []) =>
      old.map((row) => row.id === p.id
        ? { ...row, paid_total: row.amount, remaining: 0, paid_at: nowIso }
        : row,
      ),
    );
    if (Math.abs(p.remaining) > 0.005) {
      expenseRepo.recordPayment(p.id, { amount: p.remaining, paid_on: today })
        .then(() => refresh()).catch(() => refresh());
    } else {
      expenseRepo.markPaid(p.id).then(() => refresh()).catch(() => refresh());
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this payable?")) return;
    queryClient.setQueryData<PayableSummary[]>(["payables"], (old = []) =>
      old.filter((row) => row.id !== id),
    );
    expenseRepo.softDelete(id).then(() => refresh()).catch(() => refresh());
  };

  const totalUnpaid = useMemo(() => payables.reduce((s, p) => s + (p.remaining || 0), 0), [payables]);
  const unpaidCount = useMemo(() => payables.filter((p) => !p.paid_at).length, [payables]);

  const inputStyle: React.CSSProperties = {
    padding: `${spacing.xs}px ${spacing.sm}px`,
    fontSize: fontSize.sm,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background,
    color: colors.textPrimary,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.sm, flex: 1, overflow: "auto" }}>
      {/* Summary */}
      <div
        style={{
          display: "flex",
          gap: spacing.md,
          padding: spacing.sm,
          border: `1px solid ${colors.border}`,
          borderRadius: borderRadius.sm,
          backgroundColor: colors.surfaceElevated,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>Outstanding</div>
          <div style={{ fontSize: fontSize.xl, fontWeight: 700, color: colors.textPrimary }}>
            ₱{totalUnpaid.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>Bills</div>
          <div style={{ fontSize: fontSize.xl, fontWeight: 700, color: colors.textPrimary }}>{unpaidCount}</div>
        </div>
      </div>

      {/* Add form */}
      <div
        style={{
          display: "flex",
          gap: spacing.xs,
          flexWrap: "wrap",
          padding: spacing.sm,
          border: `1px solid ${colors.border}`,
          borderRadius: borderRadius.sm,
          backgroundColor: colors.surface,
        }}
      >
        <input
          placeholder="Vendor / description"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          style={{ ...inputStyle, flex: 2, minWidth: 160 }}
        />
        <input
          type="number"
          placeholder="Amount"
          value={form.amount}
          onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          style={{ ...inputStyle, flex: 1, minWidth: 100 }}
        />
        <input
          type="date"
          value={form.billDate}
          onChange={(e) => setForm((f) => ({ ...f, billDate: e.target.value }))}
          style={{ ...inputStyle, flex: 1, minWidth: 130 }}
          title="Bill date (defaults to today if blank)"
        />
        <input
          placeholder="Notes (optional)"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          style={{ ...inputStyle, flex: 2, minWidth: 140 }}
        />
        <button
          onClick={handleAdd}
          style={{
            padding: `${spacing.xs}px ${spacing.md}px`,
            fontSize: fontSize.sm,
            fontWeight: 600,
            border: `1px solid ${colors.primary}`,
            borderRadius: borderRadius.sm,
            backgroundColor: colors.primary,
            color: colors.textOnPrimary || "#fff",
            cursor: "pointer",
          }}
        >
          Add Payable
        </button>
      </div>
      {error && (
        <div style={{ fontSize: fontSize.xs, color: colors.error, fontWeight: 600 }}>{error}</div>
      )}

      {/* List */}
      {payables.length === 0 ? (
        <div style={{ textAlign: "center", color: colors.textTertiary, fontSize: fontSize.sm, padding: spacing.lg }}>
          No outstanding payables.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs }}>
          {payables.map((p) => {
            const isPaid = !!p.paid_at;
            const isOpen = expandedId === p.id;
            const partial = !isPaid && (p.paid_total || 0) > 0.005 && (p.remaining || 0) > 0.005;
            const dimText = isPaid ? colors.textTertiary : colors.textPrimary;
            const billedOn = (p.created_at || "").slice(0, 10);
            return (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: spacing.xs,
                  padding: spacing.sm,
                  border: `1px solid ${colors.border}`,
                  borderRadius: borderRadius.sm,
                  backgroundColor: isPaid ? colors.background : colors.surface,
                  opacity: isPaid ? 0.65 : 1,
                }}
              >
                <div style={{
                  display: "flex",
                  gap: spacing.sm,
                  alignItems: "center",
                  flexWrap: "wrap",
                  textDecoration: isPaid ? "line-through" : "none",
                  textDecorationColor: isPaid ? colors.textTertiary : undefined,
                }}>
                  <button
                    onClick={() => setExpandedId(isOpen ? null : p.id)}
                    aria-label={isOpen ? "Collapse" : "Expand"}
                    style={{
                      width: 26,
                      height: 26,
                      padding: 0,
                      fontSize: fontSize.md,
                      border: `1px solid ${colors.border}`,
                      borderRadius: borderRadius.sm,
                      backgroundColor: colors.surfaceElevated,
                      color: colors.textSecondary,
                      cursor: "pointer",
                      flexShrink: 0,
                      textDecoration: "none",
                    }}
                  >
                    {isOpen ? "▾" : "▸"}
                  </button>
                  <div style={{ flex: 2, minWidth: 140 }}>
                    <div style={{ fontSize: fontSize.md, fontWeight: 600, color: dimText }}>{p.name}</div>
                    {p.notes && (
                      <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>{p.notes}</div>
                    )}
                  </div>
                  <div style={{ minWidth: 110, textAlign: "right" }}>
                    <div style={{ fontSize: fontSize.lg, fontWeight: 700, color: dimText }}>
                      ₱{((isPaid ? p.amount : p.remaining) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    {partial && (
                      <div style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>
                        of ₱{(p.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </div>
                    )}
                  </div>
                  <div style={{ minWidth: 110 }}>
                    <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, textDecoration: "none" }}>
                      {isPaid ? "Paid" : "Booked"}
                    </div>
                    <div style={{ fontSize: fontSize.sm, fontWeight: 600, color: dimText }}>
                      {isPaid ? (p.paid_at ? p.paid_at.slice(0, 10) : "—") : (billedOn || "—")}
                    </div>
                  </div>
                  {!isPaid && (
                    <button
                      onClick={() => handleMarkPaid(p)}
                      style={{
                        padding: `${spacing.xs}px ${spacing.md}px`,
                        fontSize: fontSize.sm,
                        fontWeight: 600,
                        border: `1px solid ${colors.success}`,
                        borderRadius: borderRadius.sm,
                        backgroundColor: colors.success,
                        color: colors.textOnPrimary || "#fff",
                        cursor: "pointer",
                        textDecoration: "none",
                      }}
                    >
                      Mark Paid
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(p.id)}
                    style={{
                      padding: `${spacing.xs}px ${spacing.sm}px`,
                      fontSize: fontSize.xs,
                      fontWeight: 600,
                      border: `1px solid ${colors.border}`,
                      borderRadius: borderRadius.sm,
                      backgroundColor: "transparent",
                      color: colors.error,
                      cursor: "pointer",
                      textDecoration: "none",
                    }}
                  >
                    Delete
                  </button>
                </div>
                {isOpen && (
                  <PayablePaymentLedger payable={p} onChanged={refresh} today={today} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payment ledger pane — list of recorded payments + add-payment form
// ---------------------------------------------------------------------------

function PayablePaymentLedger({ payable, onChanged, today }: {
  payable: PayableSummary;
  onChanged: () => void;
  today: string;
}) {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const queryClient = useQueryClient();

  const { data: payments = [] } = useQuery({
    queryKey: ["expense-payments", payable.id],
    queryFn: () => expenseRepo.getPayments(payable.id),
  });

  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const addPayment = () => {
    setError("");
    const v = parseFloat(amount);
    if (!isFinite(v) || v === 0) { setError("Enter a non-zero amount"); return; }
    if (!paidOn) { setError("Pick a payment date"); return; }
    if (Math.abs(v) > Math.abs(payable.remaining) + 0.005) {
      if (!confirm(`Payment exceeds remaining ₱${payable.remaining.toFixed(2)}. Record anyway?`)) return;
    }
    const trimmedNotes = notes.trim() || null;
    // Optimistic update: clear the form and prepend a placeholder payment.
    setAmount("");
    setNotes("");
    setPaidOn(today);
    const tempId = "temp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const nowIso = new Date().toISOString();
    queryClient.setQueryData<ExpensePaymentRow[]>(["expense-payments", payable.id], (old = []) => [
      ...old,
      {
        id: tempId,
        device_id: "",
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
        expense_id: payable.id,
        amount: v,
        paid_on: paidOn,
        method: null,
        notes: trimmedNotes,
      },
    ]);
    expenseRepo.recordPayment(payable.id, {
      amount: v,
      paid_on: paidOn,
      notes: trimmedNotes,
    }).then(() => onChanged()).catch((err) => {
      console.error("recordPayment failed", err);
      setError(`Save failed: ${(err as Error).message}`);
      onChanged();
    });
  };

  const removePayment = async (id: string) => {
    if (!confirm("Remove this payment?")) return;
    // Optimistic remove from cache, then fire DB delete in background.
    queryClient.setQueryData<ExpensePaymentRow[]>(
      ["expense-payments", payable.id],
      (old = []) => old.filter((p) => p.id !== id),
    );
    expenseRepo.deletePayment(id).then(() => onChanged()).catch(() => onChanged());
  };

  const inputStyle: React.CSSProperties = {
    padding: `${spacing.xs}px ${spacing.sm}px`,
    fontSize: fontSize.sm,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background,
    color: colors.textPrimary,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        marginTop: spacing.xs,
        padding: spacing.sm,
        border: `1px dashed ${colors.border}`,
        borderRadius: borderRadius.sm,
        backgroundColor: colors.background,
        display: "flex",
        flexDirection: "column",
        gap: spacing.sm,
      }}
    >
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: spacing.xs,
          fontSize: fontSize.xs,
          color: colors.textSecondary,
          cursor: "pointer",
          userSelect: "none",
        }}
        title="When checked, this payable's payments are skipped in the Expenses tab and profit reports."
      >
        <input
          type="checkbox"
          checked={!!payable.exclude_from_expenses}
          onChange={(e) => {
            const next = e.target.checked ? 1 : 0;
            // Optimistic flip in the cached payables list.
            queryClient.setQueryData<PayableSummary[]>(["payables"], (old = []) =>
              old.map((row) => row.id === payable.id ? { ...row, exclude_from_expenses: next } : row),
            );
            expenseRepo.update(payable.id, { exclude_from_expenses: next })
              .then(() => onChanged()).catch(() => onChanged());
          }}
          style={{ cursor: "pointer", accentColor: colors.primary }}
        />
        Don't include this payable's payments in Expenses
      </label>
      <div style={{ fontSize: fontSize.xs, fontWeight: 600, color: colors.textSecondary }}>
        Payment history
      </div>
      {payments.length === 0 ? (
        <div style={{ fontSize: fontSize.xs, color: colors.textTertiary, textAlign: "center", padding: spacing.xs }}>
          No payments recorded yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {payments.map((pay: ExpensePaymentRow) => (
            <div
              key={pay.id}
              style={{
                display: "flex",
                gap: spacing.sm,
                alignItems: "center",
                padding: `${spacing.xs}px ${spacing.sm}px`,
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.sm,
                backgroundColor: colors.surface,
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 110, fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: 600 }}>
                {pay.paid_on}
              </div>
              <div style={{ flex: 1, minWidth: 90, fontSize: fontSize.md, fontWeight: 700, color: colors.textPrimary }}>
                ₱{(pay.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              {pay.notes && (
                <div style={{ flex: 2, minWidth: 120, fontSize: fontSize.xs, color: colors.textTertiary }}>
                  {pay.notes}
                </div>
              )}
              <button
                onClick={() => removePayment(pay.id)}
                style={{
                  padding: `2px ${spacing.sm}px`,
                  fontSize: fontSize.xs,
                  fontWeight: 600,
                  border: `1px solid ${colors.border}`,
                  borderRadius: borderRadius.sm,
                  backgroundColor: "transparent",
                  color: colors.error,
                  cursor: "pointer",
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add payment form */}
      <div style={{ display: "flex", gap: spacing.xs, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="number"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 100 }}
        />
        <input
          type="date"
          value={paidOn}
          onChange={(e) => setPaidOn(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 130 }}
        />
        <input
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ ...inputStyle, flex: 2, minWidth: 140 }}
        />
        <button
          onClick={addPayment}
          style={{
            padding: `${spacing.xs}px ${spacing.md}px`,
            fontSize: fontSize.sm,
            fontWeight: 600,
            border: `1px solid ${colors.primary}`,
            borderRadius: borderRadius.sm,
            backgroundColor: colors.primary,
            color: colors.textOnPrimary || "#fff",
            cursor: "pointer",
          }}
        >
          Record Payment
        </button>
      </div>
      {error && (
        <div style={{ fontSize: fontSize.xs, color: colors.error, fontWeight: 600 }}>{error}</div>
      )}
    </div>
  );
}

