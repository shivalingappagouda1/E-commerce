# ShopKart — Physical Return & Inspection Workflow (Option B: Implemented)

> [!NOTE]
> **Status: APPROVED & IMPLEMENTED**
> Option B (dedicated `physical_return_inspections` table) was approved by the project owner and
> is now fully integrated into the Phase 6C migration (`database/migrations/phase6c_order_and_checkout_corrections.sql`).
> Note: The migration remains pending approval for remote Supabase execution.

---

## Architecture & Requirements (Implemented)

| Requirement | Implementation in Phase 6C |
|---|---|
| Track order, item, product, variant, returned qty | `physical_return_inspections` table (`order_id`, `order_item_id`, `product_id`, `variant_id`, `returned_quantity`) |
| Physical receipt confirmation | `receipt_confirmed BOOLEAN NOT NULL DEFAULT TRUE`, `received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` |
| Warehouse inspection outcome & condition | `inspection_outcome` ('pending','passed','rejected','partially_passed'), `condition` ('uninspected','good','damaged','defective','wrong_item','unusable') |
| Administrator notes & timestamp | `inspection_notes TEXT`, `inspector_id UUID REFERENCES auth.users(id)`, `inspected_at TIMESTAMPTZ` |
| Mandatory approved inspection before restock | `admin_record_refund(..., p_restock_inventory := TRUE)` strictly verifies approved, un-restocked inspection exists |
| Support partial returns | `approved_quantity <= returned_quantity`; only the approved quantity is restored to inventory |
| Prevent duplicate restocking | `restocked BOOLEAN NOT NULL DEFAULT FALSE`, `restocked_at TIMESTAMPTZ`; already-restocked rows cannot be restocked again |
| Financial refund separated from return approval | `admin_record_refund(..., p_restock_inventory := FALSE)` records financial refund independently without requiring or touching inspections |
| Preserves history | All order and payment history strictly preserved; foreign keys use `ON DELETE RESTRICT` |
| Additive changes | New table and functions; existing `admin_record_refund(UUID, TEXT, TEXT, BOOLEAN)` signature preserved |

### New Table: `public.physical_return_inspections`

```sql
-- ============================================================
-- physical_return_inspections
-- Records the physical receipt and inspection of a returned item
-- before inventory can be restocked by admin_record_refund().
-- ============================================================
CREATE TABLE IF NOT EXISTS public.physical_return_inspections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  inspector_id     UUID NOT NULL REFERENCES auth.users(id),   -- admin who inspected
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),         -- item physically received
  inspected_at     TIMESTAMPTZ,                                -- inspection completed
  received_qty     INTEGER NOT NULL CHECK (received_qty > 0),  -- quantity physically received
  condition        TEXT NOT NULL CHECK (condition IN ('good','damaged','unusable')),
  inspection_notes TEXT NOT NULL CHECK (TRIM(inspection_notes) <> ''),
  restock_approved BOOLEAN NOT NULL DEFAULT FALSE,             -- admin decision
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one inspection record per order
CREATE UNIQUE INDEX uq_physical_return_per_order
  ON public.physical_return_inspections (order_id);

-- RLS: only service_role / admin can read and write
ALTER TABLE public.physical_return_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_return_inspections FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.physical_return_inspections FROM PUBLIC;
REVOKE ALL ON TABLE public.physical_return_inspections FROM anon;
REVOKE ALL ON TABLE public.physical_return_inspections FROM authenticated;
GRANT ALL ON TABLE public.physical_return_inspections TO service_role;
```

### Modified `admin_record_refund()` Guard

Replace the notes-only check with:

```sql
-- Restock requires a completed physical inspection record, not just notes
IF p_restock_inventory = TRUE THEN
  SELECT ri.id, ri.received_qty, ri.restock_approved
  INTO v_inspection
  FROM public.physical_return_inspections ri
  WHERE ri.order_id = p_order_id
    AND ri.restock_approved = TRUE
    AND ri.inspected_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Cannot restock: no approved physical inspection record exists for order %.', p_order_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Only restock the quantity actually received and approved
  UPDATE public.inventory
  SET quantity = quantity + v_inspection.received_qty
  WHERE product_id IN (
    SELECT product_id FROM public.order_items WHERE order_id = p_order_id
  );
END IF;
```

### Workflow

```
1. Customer requests return
2. Item shipped back by customer
3. Admin creates physical_return_inspections row (received_at, received_qty, condition, notes)
4. Admin sets inspected_at and restock_approved = TRUE after inspection
5. Admin calls admin_record_refund(order_id, ref, TRUE, notes, admin_id)
   → Function reads physical_return_inspections to authorize and determine quantity
6. Inventory restocked by received_qty (not necessarily full order quantity)
```

---

## Decision Required from Project Owner

| Option | Description | Risk level |
|---|---|---|
| **A — Keep notes gate** (current) | Restock blocked until admin writes notes | Low enforcement, easy to implement |
| **B — Add schema table** (proposed) | Restock blocked until physical receipt + approval row exists | Strong enforcement, additive migration required |
| **C — Hybrid** | Keep notes gate for Phase 6C, plan schema table for Phase 7 | Incremental |

**Recommendation:** Option B for a store handling real money. Option A is acceptable
for an MVP if the team operates with strict internal policy discipline.

> [!NOTE]
> This document is a design proposal, not an implementation. No SQL has been
> executed. No migration has been modified. The choice belongs to the project owner.
