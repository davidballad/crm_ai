# Supplier Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build full supplier (proveedor) management — a CRUD Lambda, Terraform routes, frontend pages, and integration into the product form and purchase orders UI.

**Architecture:** New `suppliers` Lambda handles CRUD for `Supplier` entities stored in DynamoDB under `SUPPLIER#` SK prefix, same single-table pattern as other entities. The `purchases` Lambda is extended to resolve `supplier_name` from `supplier_id` on reads. Frontend adds: `api/suppliers.js`, `hooks/useSuppliers.js`, `pages/SupplierList.jsx`, `pages/SupplierForm.jsx`, supplier picker in `InventoryForm`, and a full Purchase Orders page (`pages/PurchaseOrders.jsx` + `pages/PurchaseOrderForm.jsx`). No unit tests until after implementation.

**Tech Stack:** Python 3.12 (backend), React 18 + TanStack Query (frontend), DynamoDB single-table, Terraform (API Gateway HTTP API + Lambda)

---

## File Map

**Create:**
- `backend/functions/suppliers/__init__.py`
- `backend/functions/suppliers/handler.py`
- `frontend/src/api/suppliers.js`
- `frontend/src/hooks/useSuppliers.js`
- `frontend/src/pages/SupplierList.jsx`
- `frontend/src/pages/SupplierForm.jsx`
- `frontend/src/pages/PurchaseOrders.jsx`
- `frontend/src/pages/PurchaseOrderForm.jsx`
- `frontend/src/api/purchases.js`
- `frontend/src/hooks/usePurchases.js`

**Modify:**
- `backend/shared/models.py` — add `@dataclass` decorator to `Supplier` (it's missing)
- `terraform/locals.tf` — add `suppliers` to `lambda_functions` map
- `terraform/api_gateway.tf` — add integration + 5 routes for `/suppliers`
- `frontend/src/App.jsx` — add 4 new routes
- `frontend/src/components/Layout.jsx` — add nav entries for Proveedores and Compras

---

## Phase 1: Backend — Suppliers Lambda

### Task 1: Fix Supplier model + create suppliers Lambda

**Files:**
- Modify: `backend/shared/models.py`
- Create: `backend/functions/suppliers/__init__.py`
- Create: `backend/functions/suppliers/handler.py`

- [ ] **Step 1: Add `@dataclass` decorator to `Supplier` in models.py**

Open `backend/shared/models.py`. Find the `Supplier` class (around line 108). It's missing the `@dataclass` decorator. Add it:

```python
@dataclass
class Supplier(_BaseModel):
    name: str
    id: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    lead_time_days: int | None = None
    notes: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
```

- [ ] **Step 2: Create `backend/functions/suppliers/__init__.py`**

```python
```
(empty file)

- [ ] **Step 3: Create `backend/functions/suppliers/handler.py`**

```python
"""Suppliers Lambda handler — CRUD for supplier entities."""

from __future__ import annotations

import base64
import json
import os
import sys
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.auth import require_auth
from shared.db import DynamoDBError, get_item, put_item, query_items, update_item, delete_item
from shared.models import Supplier
from shared.response import created, error, no_content, not_found, server_error, success
from shared.utils import build_pk, build_sk, generate_id, now_iso, parse_body

SUPPLIER_SK_PREFIX = "SUPPLIER#"


def _decode_next_token(token: str | None) -> dict[str, Any] | None:
    if not token:
        return None
    try:
        return json.loads(base64.b64decode(token).decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        return None


def _encode_next_token(last_key: dict[str, Any] | None) -> str | None:
    if not last_key:
        return None
    return base64.b64encode(json.dumps(last_key, default=str).encode()).decode()


def _get_method(event: dict[str, Any]) -> str:
    return (
        event.get("requestContext", {})
        .get("http", {})
        .get("method", event.get("httpMethod", "GET"))
    ).upper()


def _get_path(event: dict[str, Any]) -> str:
    return event.get("path", "") or event.get("rawPath", "")


def list_suppliers(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    params = event.get("queryStringParameters") or {}
    next_token = params.get("next_token")
    try:
        limit = min(int(params.get("limit", 100)), 200)
    except (TypeError, ValueError):
        limit = 100

    pk = build_pk(tenant_id)
    last_key = _decode_next_token(next_token)

    try:
        items, last_eval = query_items(pk=pk, sk_prefix=SUPPLIER_SK_PREFIX, limit=limit, last_key=last_key)
        suppliers = [Supplier.from_dynamo(i).to_dict() for i in items]
        body: dict[str, Any] = {"suppliers": suppliers}
        token = _encode_next_token(last_eval)
        if token:
            body["next_token"] = token
        return success(body)
    except DynamoDBError as e:
        return server_error(str(e))


def create_supplier(tenant_id: str, event: dict[str, Any]) -> dict[str, Any]:
    try:
        body = parse_body(event)
    except Exception as e:
        return error(f"Invalid request body: {e}", 400)

    name = (body.get("name") or "").strip()
    if not name:
        return error("name is required", 400)

    supplier_id = generate_id()
    now = now_iso()
    supplier = Supplier(
        id=supplier_id,
        name=name,
        contact_email=body.get("contact_email") or None,
        contact_phone=body.get("contact_phone") or None,
        address=body.get("address") or None,
        lead_time_days=body.get("lead_time_days") or None,
        notes=body.get("notes") or None,
        created_at=now,
        updated_at=now,
    )

    pk = build_pk(tenant_id)
    sk = build_sk("SUPPLIER", supplier_id)

    item: dict[str, Any] = {
        "pk": pk,
        "sk": sk,
        "entity_type": "SUPPLIER",
        **supplier.to_dynamo(),
    }

    try:
        put_item(item)
    except DynamoDBError as e:
        return server_error(str(e))

    return created(supplier.to_dict())


def get_supplier(tenant_id: str, supplier_id: str) -> dict[str, Any]:
    pk = build_pk(tenant_id)
    sk = build_sk("SUPPLIER", supplier_id)

    try:
        item = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))

    if not item:
        return not_found("Supplier not found")

    return success(Supplier.from_dynamo(item).to_dict())


def update_supplier(tenant_id: str, supplier_id: str, event: dict[str, Any]) -> dict[str, Any]:
    pk = build_pk(tenant_id)
    sk = build_sk("SUPPLIER", supplier_id)

    try:
        existing = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    if not existing:
        return not_found("Supplier not found")

    try:
        body = parse_body(event)
    except (json.JSONDecodeError, TypeError):
        return error("Invalid JSON body", 400)

    updates: dict[str, Any] = {"updated_at": now_iso()}
    for field in ("name", "contact_email", "contact_phone", "address", "lead_time_days", "notes"):
        if field in body:
            updates[field] = body[field] if body[field] not in ("", None) or field != "name" else existing.get(field)
    if "name" in updates and not (updates["name"] or "").strip():
        return error("name cannot be empty", 400)

    try:
        updated = update_item(pk=pk, sk=sk, updates=updates)
    except DynamoDBError as e:
        return server_error(str(e))

    return success(Supplier.from_dynamo(updated).to_dict())


def delete_supplier(tenant_id: str, supplier_id: str) -> dict[str, Any]:
    pk = build_pk(tenant_id)
    sk = build_sk("SUPPLIER", supplier_id)

    try:
        existing = get_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))
    if not existing:
        return not_found("Supplier not found")

    try:
        delete_item(pk=pk, sk=sk)
    except DynamoDBError as e:
        return server_error(str(e))

    return no_content()


@require_auth
def lambda_handler(event: dict[str, Any], context: Any = None) -> dict[str, Any]:
    try:
        tenant_id = event.get("tenant_id", "")
        method = _get_method(event)
        path_params = event.get("pathParameters") or {}
        supplier_id = path_params.get("id")

        if method == "GET" and not supplier_id:
            return list_suppliers(tenant_id, event)
        if method == "POST" and not supplier_id:
            return create_supplier(tenant_id, event)
        if method == "GET" and supplier_id:
            return get_supplier(tenant_id, supplier_id)
        if method == "PUT" and supplier_id:
            return update_supplier(tenant_id, supplier_id, event)
        if method == "DELETE" and supplier_id:
            return delete_supplier(tenant_id, supplier_id)

        return error("Method not allowed", 405)
    except Exception as e:
        return server_error(str(e))
```

- [ ] **Step 4: Check that `delete_item` exists in `shared/db.py`. If it doesn't, add it.**

Run: `grep -n "def delete_item" backend/shared/db.py`

If missing, add to `backend/shared/db.py` after the `update_item` function:

```python
def delete_item(pk: str, sk: str) -> None:
    """Delete an item by pk and sk."""
    try:
        table = get_table()
        table.delete_item(Key={"pk": pk, "sk": sk})
    except ClientError as e:
        raise DynamoDBError(str(e), e) from e
```

---

## Phase 2: Terraform — Wire Up Suppliers Lambda

### Task 2: Add `suppliers` Lambda to Terraform

**Files:**
- Modify: `terraform/locals.tf`
- Modify: `terraform/api_gateway.tf`

- [ ] **Step 1: Add `suppliers` to `lambda_functions` map in `terraform/locals.tf`**

Find the `lambda_functions` map. Add after `profits`:

```hcl
    suppliers = {
      memory_size = 256
      timeout     = 30
    }
```

- [ ] **Step 2: Add integration and routes in `terraform/api_gateway.tf`**

Find the `resource "aws_apigatewayv2_integration" "purchases"` block. Add after it:

```hcl
resource "aws_apigatewayv2_integration" "suppliers" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.services["suppliers"].invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}
```

Then find the purchases routes block. Add after the last purchases route:

```hcl
# Suppliers routes
resource "aws_apigatewayv2_route" "suppliers_list" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /suppliers"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.suppliers.id}"
}

resource "aws_apigatewayv2_route" "suppliers_create" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /suppliers"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.suppliers.id}"
}

resource "aws_apigatewayv2_route" "suppliers_get" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /suppliers/{id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.suppliers.id}"
}

resource "aws_apigatewayv2_route" "suppliers_update" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "PUT /suppliers/{id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.suppliers.id}"
}

resource "aws_apigatewayv2_route" "suppliers_delete" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "DELETE /suppliers/{id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.suppliers.id}"
}
```

---

## Phase 3: Frontend — Suppliers API + Hook

### Task 3: Create `api/suppliers.js` and `hooks/useSuppliers.js`

**Files:**
- Create: `frontend/src/api/suppliers.js`
- Create: `frontend/src/hooks/useSuppliers.js`

- [ ] **Step 1: Create `frontend/src/api/suppliers.js`**

```javascript
import { api } from './client';

export function fetchSuppliers() {
  return api.get('/suppliers?limit=200');
}

export function fetchSupplier(id) {
  return api.get(`/suppliers/${id}`);
}

export function createSupplier(data) {
  return api.post('/suppliers', data);
}

export function updateSupplier(id, data) {
  return api.put(`/suppliers/${id}`, data);
}

export function deleteSupplier(id) {
  return api.delete(`/suppliers/${id}`);
}
```

- [ ] **Step 2: Create `frontend/src/hooks/useSuppliers.js`**

```javascript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSuppliers, fetchSupplier, createSupplier, updateSupplier, deleteSupplier } from '../api/suppliers';

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: fetchSuppliers,
    select: (data) => data?.suppliers ?? [],
  });
}

export function useSupplier(id) {
  return useQuery({
    queryKey: ['suppliers', id],
    queryFn: () => fetchSupplier(id),
    enabled: !!id,
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createSupplier,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => updateSupplier(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}
```

---

## Phase 4: Frontend — Supplier Pages

### Task 4: Create `SupplierList.jsx`

**Files:**
- Create: `frontend/src/pages/SupplierList.jsx`

- [ ] **Step 1: Create `frontend/src/pages/SupplierList.jsx`**

```jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSuppliers, useDeleteSupplier } from '../hooks/useSuppliers';
import { Plus, Pencil, Trash2, Building2, Phone, Mail, Clock } from 'lucide-react';

export default function SupplierList() {
  const { data: suppliers = [], isLoading } = useSuppliers();
  const deleteMutation = useDeleteSupplier();
  const [confirmId, setConfirmId] = useState(null);

  const handleDelete = async (id) => {
    await deleteMutation.mutateAsync(id);
    setConfirmId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Proveedores</h1>
          <p className="mt-0.5 text-sm text-gray-500">{suppliers.length} proveedor{suppliers.length !== 1 ? 'es' : ''}</p>
        </div>
        <Link to="/app/suppliers/new" className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" /> Nuevo proveedor
        </Link>
      </div>

      {suppliers.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Building2 className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">Sin proveedores aún</p>
          <p className="mt-1 text-xs text-gray-400">Agrega tu primer proveedor para vincularlo a tus productos y órdenes de compra.</p>
          <Link to="/app/suppliers/new" className="btn-primary mt-4">Agregar proveedor</Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((s) => (
            <div key={s.id} className="card flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                    <Building2 className="h-5 w-5 text-brand-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900">{s.name}</p>
                    {s.lead_time_days != null && (
                      <p className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="h-3 w-3" /> {s.lead_time_days}d entrega
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Link to={`/app/suppliers/${s.id}`} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600">
                    <Pencil className="h-4 w-4" />
                  </Link>
                  <button onClick={() => setConfirmId(s.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-1 text-xs text-gray-500">
                {s.contact_phone && (
                  <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" />{s.contact_phone}</p>
                )}
                {s.contact_email && (
                  <p className="flex items-center gap-1.5 truncate"><Mail className="h-3.5 w-3.5 shrink-0" />{s.contact_email}</p>
                )}
                {s.address && (
                  <p className="truncate text-gray-400">{s.address}</p>
                )}
              </div>

              {s.notes && (
                <p className="line-clamp-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">{s.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-gray-900">¿Eliminar proveedor?</h2>
            <p className="mt-1 text-sm text-gray-500">Esta acción no se puede deshacer. Los productos vinculados a este proveedor no serán eliminados.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmId(null)} className="btn-secondary">Cancelar</button>
              <button
                onClick={() => handleDelete(confirmId)}
                disabled={deleteMutation.isPending}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

### Task 5: Create `SupplierForm.jsx`

**Files:**
- Create: `frontend/src/pages/SupplierForm.jsx`

- [ ] **Step 1: Create `frontend/src/pages/SupplierForm.jsx`**

```jsx
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSupplier, useCreateSupplier, useUpdateSupplier } from '../hooks/useSuppliers';
import { ArrowLeft } from 'lucide-react';

const EMPTY = {
  name: '',
  contact_phone: '',
  contact_email: '',
  address: '',
  lead_time_days: '',
  notes: '',
};

export default function SupplierForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { data: existing, isLoading } = useSupplier(id);
  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  useEffect(() => {
    if (existing) {
      const s = existing.supplier ?? existing;
      setForm({
        name: s.name || '',
        contact_phone: s.contact_phone || '',
        contact_email: s.contact_email || '',
        address: s.address || '',
        lead_time_days: s.lead_time_days != null ? String(s.lead_time_days) : '',
        notes: s.notes || '',
      });
    }
  }, [existing]);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const payload = {
      name: form.name.trim(),
      contact_phone: form.contact_phone.trim() || undefined,
      contact_email: form.contact_email.trim() || undefined,
      address: form.address.trim() || undefined,
      lead_time_days: form.lead_time_days ? Number(form.lead_time_days) : undefined,
      notes: form.notes.trim() || undefined,
    };
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id, data: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      navigate('/app/suppliers');
    } catch (err) {
      setError(err.message || 'Error al guardar proveedor');
    }
  };

  if (isEdit && isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="mx-auto max-w-lg">
      <button onClick={() => navigate('/app/suppliers')} className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Proveedores
      </button>

      <h1 className="mb-6 text-xl font-bold text-gray-900">
        {isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}
      </h1>

      <form onSubmit={handleSubmit} className="card space-y-4">
        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Nombre *</label>
          <input required value={form.name} onChange={update('name')} className="input-field" placeholder="Ej. Distribuidora Norte" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Teléfono</label>
            <input type="tel" value={form.contact_phone} onChange={update('contact_phone')} className="input-field" placeholder="+593 99 000 0000" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Correo</label>
            <input type="email" value={form.contact_email} onChange={update('contact_email')} className="input-field" placeholder="ventas@proveedor.com" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Dirección</label>
          <input value={form.address} onChange={update('address')} className="input-field" placeholder="Av. Principal 123, Ciudad" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Tiempo de entrega (días)</label>
          <input type="number" min="0" value={form.lead_time_days} onChange={update('lead_time_days')} className="input-field" placeholder="3" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Notas</label>
          <textarea rows={3} value={form.notes} onChange={update('notes')} className="input-field" placeholder="Condiciones de pago, contactos adicionales..." />
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={() => navigate('/app/suppliers')} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Guardando...' : isEdit ? 'Actualizar' : 'Crear proveedor'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

---

## Phase 5: Frontend — Supplier Picker in InventoryForm

### Task 6: Add supplier picker to `InventoryForm.jsx`

**Files:**
- Modify: `frontend/src/pages/InventoryForm.jsx`

- [ ] **Step 1: Import `useSuppliers` hook at the top of `InventoryForm.jsx`**

Add after the existing imports:

```javascript
import { useSuppliers } from '../hooks/useSuppliers';
```

- [ ] **Step 2: Add `supplier_id` to the `EMPTY` state constant**

Find the `EMPTY` object (around line 10). Add `supplier_id`:

```javascript
const EMPTY = {
  name: '',
  category: '',
  quantity: 0,
  unit_cost: '',
  reorder_threshold: 10,
  sku: '',
  unit: 'each',
  image_url: '',
  image_urls: [],
  description: '',
  notes: '',
  tags: '',
  promo_price: '',
  promo_end_at: '',
  supplier_id: '',
};
```

- [ ] **Step 3: Load `supplier_id` when editing an existing product**

In the `useEffect` where `existing` is loaded (around line 42), add `supplier_id` to the `setForm` call:

```javascript
supplier_id: product.supplier_id || '',
```

- [ ] **Step 4: Add `supplier_id` to the payload in `handleSubmit`**

In `handleSubmit`, inside the `payload` object (around line 124), add:

```javascript
supplier_id: form.supplier_id || undefined,
```

- [ ] **Step 5: Call `useSuppliers` hook inside the component**

Add after the existing hooks near the top of `InventoryForm`:

```javascript
const { data: suppliers = [] } = useSuppliers();
```

- [ ] **Step 6: Add the supplier picker field in the form JSX**

Add after the `unit_cost` field div and before the `reorder_threshold` field:

```jsx
<div>
  <label className="mb-1 block text-sm font-medium text-gray-700">Proveedor</label>
  <select value={form.supplier_id} onChange={update('supplier_id')} className="input-field">
    <option value="">Sin proveedor</option>
    {suppliers.map((s) => (
      <option key={s.id} value={s.id}>{s.name}</option>
    ))}
  </select>
</div>
```

---

## Phase 6: Frontend — Purchase Orders API + Hook

### Task 7: Create `api/purchases.js` and `hooks/usePurchases.js`

**Files:**
- Create: `frontend/src/api/purchases.js`
- Create: `frontend/src/hooks/usePurchases.js`

- [ ] **Step 1: Create `frontend/src/api/purchases.js`**

```javascript
import { api } from './client';

export function fetchPurchaseOrders({ status } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const qs = params.toString();
  return api.get(`/purchases${qs ? `?${qs}` : ''}`);
}

export function fetchPurchaseOrder(id) {
  return api.get(`/purchases/${id}`);
}

export function createPurchaseOrder(data) {
  return api.post('/purchases', data);
}

export function updatePurchaseOrder(id, data) {
  return api.put(`/purchases/${id}`, data);
}
```

- [ ] **Step 2: Create `frontend/src/hooks/usePurchases.js`**

```javascript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPurchaseOrders, fetchPurchaseOrder, createPurchaseOrder, updatePurchaseOrder } from '../api/purchases';

export function usePurchaseOrders(filters) {
  return useQuery({
    queryKey: ['purchase_orders', filters],
    queryFn: () => fetchPurchaseOrders(filters),
    select: (data) => data?.purchase_orders ?? [],
  });
}

export function usePurchaseOrder(id) {
  return useQuery({
    queryKey: ['purchase_orders', id],
    queryFn: () => fetchPurchaseOrder(id),
    enabled: !!id,
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase_orders'] }),
  });
}

export function useUpdatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => updatePurchaseOrder(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase_orders'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
```

---

## Phase 7: Frontend — Purchase Orders Pages

### Task 8: Create `PurchaseOrders.jsx` (list)

**Files:**
- Create: `frontend/src/pages/PurchaseOrders.jsx`

- [ ] **Step 1: Create `frontend/src/pages/PurchaseOrders.jsx`**

```jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePurchaseOrders, useUpdatePurchaseOrder } from '../hooks/usePurchases';
import { useSuppliers } from '../hooks/useSuppliers';
import { Plus, ShoppingBag, ChevronRight, CheckCircle2, Send, XCircle, Clock } from 'lucide-react';

const STATUS_LABEL = {
  draft: 'Borrador',
  sent: 'Enviada',
  received: 'Recibida',
  cancelled: 'Cancelada',
};

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
};

const STATUS_TRANSITIONS = {
  draft: { next: 'sent', label: 'Marcar enviada', Icon: Send },
  sent: { next: 'received', label: 'Confirmar recepción', Icon: CheckCircle2 },
};

function formatCurrency(v) {
  if (v == null) return '—';
  return `$${Number(v).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PurchaseOrders() {
  const [statusFilter, setStatusFilter] = useState('');
  const { data: orders = [], isLoading } = usePurchaseOrders(statusFilter ? { status: statusFilter } : undefined);
  const { data: suppliers = [] } = useSuppliers();
  const updateMutation = useUpdatePurchaseOrder();
  const [advancing, setAdvancing] = useState(null);

  const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));

  const handleAdvance = async (order, nextStatus) => {
    setAdvancing(order.id);
    try {
      await updateMutation.mutateAsync({ id: order.id, data: { status: nextStatus } });
    } finally {
      setAdvancing(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Órdenes de compra</h1>
          <p className="mt-0.5 text-sm text-gray-500">{orders.length} orden{orders.length !== 1 ? 'es' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field w-auto text-sm"
          >
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <Link to="/app/purchases/new" className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" /> Nueva orden
          </Link>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <ShoppingBag className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">Sin órdenes de compra</p>
          <p className="mt-1 text-xs text-gray-400">Crea una orden para registrar la compra de mercancía a tus proveedores.</p>
          <Link to="/app/purchases/new" className="btn-primary mt-4">Crear orden</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const transition = STATUS_TRANSITIONS[order.status];
            const isAdvancing = advancing === order.id;
            const supplierName = order.supplier_id
              ? (supplierMap[order.supplier_id] ?? order.supplier_name)
              : order.supplier_name;

            return (
              <div key={order.id} className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                    <ShoppingBag className="h-5 w-5 text-brand-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">{supplierName}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                        {STATUS_LABEL[order.status]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {order.items?.length ?? 0} producto{(order.items?.length ?? 0) !== 1 ? 's' : ''} · {formatCurrency(order.total_cost)} · {formatDate(order.created_at)}
                    </p>
                    {order.notes && <p className="mt-1 text-xs text-gray-400 truncate">{order.notes}</p>}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {transition && (
                    <button
                      onClick={() => handleAdvance(order, transition.next)}
                      disabled={isAdvancing}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                    >
                      <transition.Icon className="h-3.5 w-3.5" />
                      {isAdvancing ? '...' : transition.label}
                    </button>
                  )}
                  <Link to={`/app/purchases/${order.id}`} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

### Task 9: Create `PurchaseOrderForm.jsx`

**Files:**
- Create: `frontend/src/pages/PurchaseOrderForm.jsx`

- [ ] **Step 1: Create `frontend/src/pages/PurchaseOrderForm.jsx`**

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreatePurchaseOrder } from '../hooks/usePurchases';
import { useSuppliers } from '../hooks/useSuppliers';
import { useProducts } from '../hooks/useProducts';
import { ArrowLeft, Plus, Trash2, Search } from 'lucide-react';

function formatCurrency(v) {
  if (!v && v !== 0) return '';
  return `$${Number(v).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PurchaseOrderForm() {
  const navigate = useNavigate();
  const { data: suppliers = [] } = useSuppliers();
  const { data: productsData } = useProducts();
  const products = productsData?.products ?? productsData ?? [];
  const createMutation = useCreatePurchaseOrder();

  const [supplierId, setSupplierId] = useState('');
  const [supplierNameFree, setSupplierNameFree] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [error, setError] = useState('');

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);
  const supplierName = selectedSupplier?.name || supplierNameFree;

  const filteredProducts = products.filter((p) =>
    productSearch.length < 2 ? false : p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const addItem = (product) => {
    setProductSearch('');
    if (items.find((i) => i.product_id === product.id)) return;
    setItems((prev) => [
      ...prev,
      {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_cost: product.unit_cost != null ? String(product.unit_cost) : '',
      },
    ]);
  };

  const updateItem = (idx, field, value) => {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };

  const removeItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalCost = items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const cost = Number(item.unit_cost) || 0;
    return sum + qty * cost;
  }, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!supplierName.trim()) {
      setError('Selecciona o escribe el nombre del proveedor');
      return;
    }
    if (items.length === 0) {
      setError('Agrega al menos un producto');
      return;
    }
    for (const item of items) {
      if (!item.quantity || Number(item.quantity) <= 0) {
        setError(`Cantidad inválida para "${item.product_name}"`);
        return;
      }
      if (!item.unit_cost || Number(item.unit_cost) < 0) {
        setError(`Costo inválido para "${item.product_name}"`);
        return;
      }
    }

    const payload = {
      supplier_name: supplierName.trim(),
      supplier_id: supplierId || undefined,
      notes: notes.trim() || undefined,
      items: items.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: Number(item.quantity),
        unit_cost: Number(item.unit_cost),
      })),
    };

    try {
      await createMutation.mutateAsync(payload);
      navigate('/app/purchases');
    } catch (err) {
      setError(err.message || 'Error al crear la orden');
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => navigate('/app/purchases')} className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Órdenes de compra
      </button>

      <h1 className="mb-6 text-xl font-bold text-gray-900">Nueva orden de compra</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {/* Supplier */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Proveedor</h2>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Seleccionar proveedor existente</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="input-field">
              <option value="">— Seleccionar —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {!supplierId && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">O escribe el nombre</label>
              <input
                value={supplierNameFree}
                onChange={(e) => setSupplierNameFree(e.target.value)}
                className="input-field"
                placeholder="Nombre del proveedor"
              />
            </div>
          )}
        </div>

        {/* Items */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Productos</h2>

          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="input-field pl-9"
                placeholder="Buscar producto por nombre..."
              />
            </div>
            {filteredProducts.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
                {filteredProducts.slice(0, 6).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addItem(p)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-gray-50 first:rounded-t-xl last:rounded-b-xl"
                  >
                    <span className="font-medium text-gray-900">{p.name}</span>
                    {p.unit_cost != null && <span className="text-xs text-gray-400">Costo: {formatCurrency(p.unit_cost)}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={item.product_id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <span className="flex-1 truncate text-sm font-medium text-gray-800">{item.product_name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div>
                      <label className="text-[10px] text-gray-400">Cantidad</label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                        className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400">Costo unit.</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unit_cost}
                        onChange={(e) => updateItem(idx, 'unit_cost', e.target.value)}
                        className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="0.00"
                      />
                    </div>
                    <button type="button" onClick={() => removeItem(idx)} className="ml-1 rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              <div className="flex justify-end pt-1">
                <span className="text-sm font-semibold text-gray-700">Total: <span className="text-brand-700">{formatCurrency(totalCost)}</span></span>
              </div>
            </div>
          )}

          {items.length === 0 && (
            <p className="text-center text-xs text-gray-400 py-4">Busca y agrega productos arriba</p>
          )}
        </div>

        {/* Notes */}
        <div className="card">
          <label className="mb-1 block text-sm font-medium text-gray-700">Notas (opcional)</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field" placeholder="Número de factura, condiciones de pago..." />
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate('/app/purchases')} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={createMutation.isPending} className="btn-primary">
            {createMutation.isPending ? 'Creando...' : 'Crear orden (borrador)'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

---

## Phase 8: Wire Up Routes and Navigation

### Task 10: Add routes and nav entries

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Layout.jsx`

- [ ] **Step 1: Add imports and routes in `App.jsx`**

Add imports after the `Profits` import:

```javascript
import SupplierList from './pages/SupplierList';
import SupplierForm from './pages/SupplierForm';
import PurchaseOrders from './pages/PurchaseOrders';
import PurchaseOrderForm from './pages/PurchaseOrderForm';
```

Add routes inside the `/app` `<Route>` block, after the `profits` route:

```jsx
<Route path="suppliers" element={<SupplierList />} />
<Route path="suppliers/new" element={<SupplierForm />} />
<Route path="suppliers/:id" element={<SupplierForm />} />
<Route path="purchases" element={<PurchaseOrders />} />
<Route path="purchases/new" element={<PurchaseOrderForm />} />
<Route path="purchases/:id" element={<PurchaseOrders />} />
```

- [ ] **Step 2: Add nav entries in `Layout.jsx`**

Add imports for the two new icons at the top of the import from lucide-react. The existing import includes many icons — add `Truck` and `Building2`:

```javascript
import {
  LayoutDashboard, Package, ShoppingCart, BrainCircuit, LogOut,
  Menu, X, Users, MessageSquare, Settings, Lock, BarChart2,
  Megaphone, TrendingUp, Truck, Building2,
} from 'lucide-react';
```

In the `NAV_KEYS` array, add after the `profits` entry:

```javascript
{ to: '/app/suppliers', icon: Building2, labelKey: 'layout.suppliers', pro: false },
{ to: '/app/purchases', icon: Truck, labelKey: 'layout.purchases', pro: false },
```

- [ ] **Step 3: Add display labels in `SidebarLink`**

In `SidebarLink`, the `span` uses conditional label overrides. Add the two new keys:

```jsx
: labelKey === 'layout.suppliers' ? 'Proveedores'
: labelKey === 'layout.purchases' ? 'Compras'
```

The full conditional chain in the span should be:

```jsx
<span className="flex-1">
  {labelKey === 'layout.leads' ? 'Prospectos'
    : labelKey === 'layout.analytics' ? 'Analíticas'
    : labelKey === 'layout.campaigns' ? 'Campañas'
    : labelKey === 'layout.profits' ? 'Ganancias'
    : labelKey === 'layout.suppliers' ? 'Proveedores'
    : labelKey === 'layout.purchases' ? 'Compras'
    : t(labelKey)}
</span>
```

---

## Phase 9: Purchase Order Detail View

### Task 11: Add detail view route for a single PO (extend `PurchaseOrders.jsx`)

The `/app/purchases/:id` route currently points to `PurchaseOrders` (list). Update it to show a detail modal/panel instead by creating a simple detail component inline within `PurchaseOrders.jsx`.

**Files:**
- Modify: `frontend/src/pages/PurchaseOrders.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create `frontend/src/pages/PurchaseOrderDetail.jsx`**

```jsx
import { useNavigate, useParams } from 'react-router-dom';
import { usePurchaseOrder, useUpdatePurchaseOrder } from '../hooks/usePurchases';
import { useSuppliers } from '../hooks/useSuppliers';
import { ArrowLeft, CheckCircle2, Send } from 'lucide-react';

const STATUS_LABEL = {
  draft: 'Borrador',
  sent: 'Enviada',
  received: 'Recibida',
  cancelled: 'Cancelada',
};

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
};

const STATUS_TRANSITIONS = {
  draft: { next: 'sent', label: 'Marcar enviada', Icon: Send },
  sent: { next: 'received', label: 'Confirmar recepción (+stock)', Icon: CheckCircle2 },
};

function formatCurrency(v) {
  if (v == null) return '—';
  return `$${Number(v).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = usePurchaseOrder(id);
  const { data: suppliers = [] } = useSuppliers();
  const updateMutation = useUpdatePurchaseOrder();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  const order = data?.purchase_order ?? data;
  if (!order) return <p className="text-sm text-gray-500">Orden no encontrada.</p>;

  const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));
  const supplierName = order.supplier_id
    ? (supplierMap[order.supplier_id] ?? order.supplier_name)
    : order.supplier_name;
  const transition = STATUS_TRANSITIONS[order.status];

  const handleAdvance = async () => {
    if (!transition) return;
    await updateMutation.mutateAsync({ id: order.id, data: { status: transition.next } });
    navigate('/app/purchases');
  };

  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => navigate('/app/purchases')} className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Órdenes de compra
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{supplierName}</h1>
          <p className="mt-0.5 text-sm text-gray-400">Creada {formatDate(order.created_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[order.status]}`}>
            {STATUS_LABEL[order.status]}
          </span>
          {transition && (
            <button
              onClick={handleAdvance}
              disabled={updateMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <transition.Icon className="h-3.5 w-3.5" />
              {updateMutation.isPending ? '...' : transition.label}
            </button>
          )}
        </div>
      </div>

      <div className="card mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs font-medium text-gray-500">
              <th className="pb-2 text-left">Producto</th>
              <th className="pb-2 text-right">Cant.</th>
              <th className="pb-2 text-right">Costo unit.</th>
              <th className="pb-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {(order.items ?? []).map((item, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-0">
                <td className="py-2 font-medium text-gray-800">{item.product_name}</td>
                <td className="py-2 text-right text-gray-600">{item.quantity}</td>
                <td className="py-2 text-right text-gray-600">{formatCurrency(item.unit_cost)}</td>
                <td className="py-2 text-right font-medium text-gray-800">{formatCurrency(item.quantity * item.unit_cost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-3 text-right text-sm font-semibold text-gray-700">Total</td>
              <td className="pt-3 text-right text-sm font-bold text-brand-700">{formatCurrency(order.total_cost)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {order.notes && (
        <div className="card text-sm text-gray-600">
          <p className="mb-1 text-xs font-medium text-gray-400">Notas</p>
          {order.notes}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update the `purchases/:id` route in `App.jsx`**

Change:
```jsx
<Route path="purchases/:id" element={<PurchaseOrders />} />
```

To:
```jsx
import PurchaseOrderDetail from './pages/PurchaseOrderDetail';
// ...
<Route path="purchases/:id" element={<PurchaseOrderDetail />} />
```

Add the import with the other new imports from Phase 8 Task 10.

---

## Post-Implementation Checklist

- [ ] Verify `delete_item` exists in `shared/db.py` (Task 1, Step 4)
- [ ] Verify `@dataclass` decorator added to `Supplier` model
- [ ] Verify Terraform plan runs without errors: `terraform plan` in `terraform/`
- [ ] Verify frontend builds without errors: `npm run build` in `frontend/`
- [ ] Smoke test: create supplier → create product with that supplier → create PO with that supplier → advance PO to "received" → verify product quantity increased
