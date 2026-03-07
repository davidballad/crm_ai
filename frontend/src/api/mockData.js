const today = new Date().toISOString().slice(0, 10);

const PRODUCTS = [
  { id: 'prod-001', name: 'Wireless Earbuds Pro', category: 'Electronics', quantity: 145, unit_cost: 29.99, reorder_threshold: 20, sku: 'WEP-001' },
  { id: 'prod-002', name: 'USB-C Hub 7-in-1', category: 'Electronics', quantity: 8, unit_cost: 45.00, reorder_threshold: 15, sku: 'UCH-002' },
  { id: 'prod-003', name: 'Ergonomic Mouse', category: 'Accessories', quantity: 62, unit_cost: 34.50, reorder_threshold: 10, sku: 'ERM-003' },
  { id: 'prod-004', name: 'Mechanical Keyboard', category: 'Accessories', quantity: 5, unit_cost: 89.99, reorder_threshold: 10, sku: 'MKB-004' },
  { id: 'prod-005', name: 'Webcam HD 1080p', category: 'Electronics', quantity: 33, unit_cost: 54.99, reorder_threshold: 10, sku: 'WCH-005' },
  { id: 'prod-006', name: 'Laptop Stand Aluminum', category: 'Accessories', quantity: 3, unit_cost: 42.00, reorder_threshold: 8, sku: 'LSA-006' },
  { id: 'prod-007', name: 'Noise Cancelling Headphones', category: 'Electronics', quantity: 27, unit_cost: 129.99, reorder_threshold: 10, sku: 'NCH-007' },
  { id: 'prod-008', name: 'Monitor Light Bar', category: 'Lighting', quantity: 41, unit_cost: 38.00, reorder_threshold: 12, sku: 'MLB-008' },
  { id: 'prod-009', name: 'Desk Cable Organizer', category: 'Accessories', quantity: 92, unit_cost: 12.99, reorder_threshold: 20, sku: 'DCO-009' },
  { id: 'prod-010', name: 'Portable SSD 1TB', category: 'Storage', quantity: 18, unit_cost: 79.99, reorder_threshold: 10, sku: 'PSD-010' },
];

const TRANSACTIONS = [
  { id: 'txn-001', created_at: `${today}T09:14:00Z`, items: [{ product_id: 'prod-001', product_name: 'Wireless Earbuds Pro', quantity: 3 }], total: 89.97, payment_method: 'card', notes: 'Bulk order' },
  { id: 'txn-002', created_at: `${today}T10:32:00Z`, items: [{ product_id: 'prod-003', product_name: 'Ergonomic Mouse', quantity: 2 }, { product_id: 'prod-009', product_name: 'Desk Cable Organizer', quantity: 1 }], total: 81.99, payment_method: 'card', notes: '' },
  { id: 'txn-003', created_at: `${today}T11:45:00Z`, items: [{ product_id: 'prod-007', product_name: 'Noise Cancelling Headphones', quantity: 1 }], total: 129.99, payment_method: 'cash', notes: 'Walk-in customer' },
  { id: 'txn-004', created_at: `${today}T13:22:00Z`, items: [{ product_id: 'prod-005', product_name: 'Webcam HD 1080p', quantity: 2 }], total: 109.98, payment_method: 'card', notes: '' },
  { id: 'txn-005', created_at: `${today}T14:50:00Z`, items: [{ product_id: 'prod-010', product_name: 'Portable SSD 1TB', quantity: 1 }, { product_id: 'prod-008', product_name: 'Monitor Light Bar', quantity: 1 }], total: 117.99, payment_method: 'card', notes: 'Home office setup' },
  { id: 'txn-006', created_at: `${today}T15:30:00Z`, items: [{ product_id: 'prod-004', product_name: 'Mechanical Keyboard', quantity: 1 }], total: 89.99, payment_method: 'cash', notes: '' },
];

const DAILY_SUMMARY = {
  date: today,
  total_revenue: 619.91,
  transaction_count: 6,
  items_sold: 12,
};

const CONTACTS = [
  { contact_id: 'con-001', name: 'Alice Smith', email: 'alice@example.com', phone: '+15551234567', source_channel: 'whatsapp', lead_status: 'closed_won', tier: 'gold', tags: [], created_ts: new Date().toISOString() },
  { contact_id: 'con-002', name: 'Bob Jones', email: 'bob@example.com', phone: '+15559876543', source_channel: 'whatsapp', lead_status: 'interested', tier: 'silver', tags: [], created_ts: new Date().toISOString() },
  { contact_id: 'con-003', name: 'Carol Lee', email: 'carol@example.com', phone: '+15557778888', source_channel: 'whatsapp', lead_status: 'prospect', tier: 'bronze', tags: [], created_ts: new Date().toISOString() },
];

const MESSAGES = [
  { message_id: 'msg-001', channel: 'whatsapp', from_number: '+15551234567', to_number: '+15550000000', text: 'I want to order', contact_id: 'con-001', category: 'closed', created_ts: new Date().toISOString() },
  { message_id: 'msg-002', channel: 'whatsapp', from_number: '+15550000000', to_number: '+15551234567', text: 'Your order has been confirmed!', contact_id: 'con-001', category: 'closed', created_ts: new Date().toISOString() },
  { message_id: 'msg-003', channel: 'whatsapp', from_number: '+15559876543', to_number: '+15550000000', text: 'I want info', contact_id: 'con-002', category: 'active', created_ts: new Date().toISOString() },
  { message_id: 'msg-004', channel: 'whatsapp', from_number: '+15557778888', to_number: '+15550000000', text: 'Order', contact_id: 'con-003', category: 'incomplete', created_ts: new Date().toISOString() },
];

const INSIGHTS = {
  insight: {
    summary: 'Your electronics category is driving 65% of revenue today. Wireless Earbuds Pro and Webcam HD 1080p are top sellers. Three products (USB-C Hub, Mechanical Keyboard, Laptop Stand) are critically low on stock and need immediate reordering to avoid stockouts this week.',
    generated_at: new Date().toISOString(),
    forecasts: [
      'Wireless Earbuds Pro demand expected to increase 20% next week based on seasonal trends',
      'Webcam sales trending upward — consider stocking 50+ units for the upcoming quarter',
      'Monitor Light Bar showing steady growth; current stock will last approximately 3 weeks',
    ],
    reorder_suggestions: [
      { product: 'USB-C Hub 7-in-1', quantity: 50, description: 'USB-C Hub 7-in-1: order 50 units — only 8 remaining (below threshold of 15)' },
      { product: 'Mechanical Keyboard', quantity: 30, description: 'Mechanical Keyboard: order 30 units — only 5 remaining (below threshold of 10)' },
      { product: 'Laptop Stand Aluminum', quantity: 25, description: 'Laptop Stand Aluminum: order 25 units — only 3 remaining (below threshold of 8)' },
    ],
    spending_trends: [
      'Average order value increased 12% compared to last week',
      'Card payments account for 67% of transactions, up from 58% last month',
      'Afternoon sales (1-5 PM) contribute 54% of daily revenue',
    ],
    revenue_insights: [
      { day: 'Mon', revenue: 480 },
      { day: 'Tue', revenue: 620 },
      { day: 'Wed', revenue: 390 },
      { day: 'Thu', revenue: 720 },
      { day: 'Fri', revenue: 850 },
      { day: 'Sat', revenue: 560 },
      { day: 'Sun', revenue: 310 },
    ],
  },
};

function delay(ms = 200) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const mockHandlers = {
  async 'GET /inventory'() {
    await delay();
    return { products: PRODUCTS };
  },

  async 'GET /inventory/:id'(id) {
    await delay();
    const product = PRODUCTS.find((p) => p.id === id);
    if (!product) throw new Error('Product not found');
    return product;
  },

  async 'POST /inventory'(_, body) {
    await delay(300);
    const newProduct = { id: `prod-${Date.now()}`, ...body, quantity: body.quantity || 0 };
    PRODUCTS.push(newProduct);
    return newProduct;
  },

  async 'PUT /inventory/:id'(id, body) {
    await delay(300);
    const idx = PRODUCTS.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error('Product not found');
    Object.assign(PRODUCTS[idx], body);
    return PRODUCTS[idx];
  },

  async 'DELETE /inventory/:id'(id) {
    await delay(200);
    const idx = PRODUCTS.findIndex((p) => p.id === id);
    if (idx !== -1) PRODUCTS.splice(idx, 1);
    return null;
  },

  async 'GET /transactions'() {
    await delay();
    return { transactions: TRANSACTIONS };
  },

  async 'GET /transactions/summary'() {
    await delay();
    return DAILY_SUMMARY;
  },

  async 'POST /transactions'(_, body) {
    await delay(300);
    const newTxn = { id: `txn-${Date.now()}`, created_at: new Date().toISOString(), ...body };
    TRANSACTIONS.unshift(newTxn);
    return newTxn;
  },

  async 'GET /insights'() {
    await delay(400);
    return INSIGHTS;
  },

  async 'POST /insights/generate'() {
    await delay(1500);
    INSIGHTS.insight.generated_at = new Date().toISOString();
    return INSIGHTS;
  },

  async 'GET /contacts'() {
    await delay();
    return { contacts: CONTACTS };
  },
  async 'GET /contacts/:id'(id) {
    await delay();
    const c = CONTACTS.find((x) => x.contact_id === id);
    if (!c) throw new Error('Contact not found');
    return c;
  },
  async 'POST /contacts'(_, body) {
    await delay(300);
    const newContact = { contact_id: `con-${Date.now()}`, ...body, created_ts: new Date().toISOString() };
    CONTACTS.push(newContact);
    return newContact;
  },
  async 'PUT /contacts/:id'(id, body) {
    await delay(300);
    const idx = CONTACTS.findIndex((c) => c.contact_id === id);
    if (idx === -1) throw new Error('Contact not found');
    Object.assign(CONTACTS[idx], body);
    return CONTACTS[idx];
  },
  async 'PATCH /contacts/:id'(id, body) {
    await delay(300);
    const idx = CONTACTS.findIndex((c) => c.contact_id === id);
    if (idx === -1) throw new Error('Contact not found');
    Object.assign(CONTACTS[idx], body);
    return CONTACTS[idx];
  },
  async 'DELETE /contacts/:id'(id) {
    await delay(200);
    const idx = CONTACTS.findIndex((c) => c.contact_id === id);
    if (idx !== -1) CONTACTS.splice(idx, 1);
    return null;
  },
  async 'GET /contacts/:id/messages'(id) {
    await delay();
    const list = MESSAGES.filter((m) => m.contact_id === id || m.from_number);
    return { messages: list };
  },

  async 'GET /messages'() {
    await delay();
    return { messages: MESSAGES };
  },
  async 'POST /messages'(_, body) {
    await delay(300);
    const newMsg = { message_id: `msg-${Date.now()}`, category: 'active', ...body, created_ts: new Date().toISOString() };
    MESSAGES.push(newMsg);
    return newMsg;
  },
  async 'PATCH /messages/:id/flags'(id, body) {
    await delay(200);
    const idx = MESSAGES.findIndex((m) => m.message_id === id);
    if (idx === -1) throw new Error('Message not found');
    Object.assign(MESSAGES[idx], body);
    return MESSAGES[idx];
  },
  async 'PATCH /transactions/:id'(id, body) {
    await delay(300);
    const idx = TRANSACTIONS.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error('Transaction not found');
    Object.assign(TRANSACTIONS[idx], body);
    return TRANSACTIONS[idx];
  },
};

export function matchMockRoute(method, path) {
  const cleanPath = path.split('?')[0];

  const exact = `${method} ${cleanPath}`;
  if (mockHandlers[exact]) return { handler: mockHandlers[exact], params: [] };

  for (const pattern of Object.keys(mockHandlers)) {
    const [pMethod, pPath] = pattern.split(' ');
    if (pMethod !== method) continue;

    const patternParts = pPath.split('/');
    const pathParts = cleanPath.split('/');
    if (patternParts.length !== pathParts.length) continue;

    const params = [];
    let match = true;
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params.push(pathParts[i]);
      } else if (patternParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }
    if (match) return { handler: mockHandlers[pattern], params };
  }

  return null;
}
