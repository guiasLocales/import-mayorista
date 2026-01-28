import { readProducts, appendOrder } from './sheets-client.js';
import { ORDER_RULES, isValidEmail } from './utils.js';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        try {
            // API ROUTES
            if (path === '/api/products') {
                return await handleGetProducts(request, env, url);
            }
            if (path === '/api/orders' && request.method === 'POST') {
                return await handleSaveOrder(request, env);
            }

            // FRONTEND (Static Assets + HTMLRewriter)
            // Serve static assets from the binding
            let response = await env.ASSETS.fetch(request);

            // If it's the index page (root or index.html), inject the category
            if (response.ok && (path === '/' || path === '/index.html')) {
                const category = env.DEFAULT_CATEGORY || 'LIBRERIA';

                return new HTMLRewriter()
                    .on('#meta-category', {
                        element(element) {
                            element.setAttribute('content', category);
                        }
                    })
                    .transform(response);
            }

            return response;

        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
};

/**
 * GET /api/products
 * Query: page, pageSize, search
 */
async function handleGetProducts(request, env, url) {
    const params = url.searchParams;
    const page = Number(params.get('page') || 1);
    const pageSize = Number(params.get('pageSize') || 24);
    const search = (params.get('search') || '').toLowerCase().trim();
    const category = params.get('category') || env.DEFAULT_CATEGORY || 'LIBRERIA';

    let products = await readProducts(env, category);

    // Filter by Search (Local filter after fetching all products from sheet)
    // Optimization: If sheet is huge, filtering should happen somewhat on Sheets side, 
    // but Sheets API is limited. For <5000 rows, this is fine.
    if (search) {
        products = products.filter(p =>
            (p.name || '').toLowerCase().includes(search) ||
            (p.code || '').toLowerCase().includes(search)
        );
    }

    // Pagination
    const total = products.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;

    return new Response(JSON.stringify({
        items: products.slice(start, end),
        page: safePage,
        pageSize,
        total,
        totalPages,
        category
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

/**
 * POST /api/orders
 * Body: { client, items }
 */
async function handleSaveOrder(request, env) {
    const order = await request.json();

    if (!order || !order.client || !order.items || !order.items.length) {
        return new Response(JSON.stringify({ error: 'Pedido vacío o datos incompletos' }), { status: 400 });
    }

    // Basic Validation
    if (!order.client.name || !order.client.phone || !order.client.email) {
        return new Response(JSON.stringify({ error: 'Faltan datos del cliente' }), { status: 400 });
    }

    // Re-calculate totals server-side for security
    const rawTotal = order.items.reduce((s, it) => s + (Number(it.price) * Number(it.qty)), 0);

    if (rawTotal < ORDER_RULES.MIN_TOTAL) {
        return new Response(JSON.stringify({
            error: `Compra mínima no alcanzada. Mínimo: $${ORDER_RULES.MIN_TOTAL}`
        }), { status: 400 });
    }

    const discount = (rawTotal >= ORDER_RULES.DISCOUNT_THRESHOLD)
        ? (rawTotal * ORDER_RULES.DISCOUNT_RATE)
        : 0;

    const finalTotal = rawTotal - discount;

    // Enhance order object with server-calculated totals
    const orderPayload = {
        ...order,
        total: finalTotal
    };

    const currentCategory = env.DEFAULT_CATEGORY || 'LIBRERIA';

    // Append to Sheets
    await appendOrder(env, orderPayload, currentCategory);

    return new Response(JSON.stringify({
        ok: true,
        rawTotal,
        discount,
        total: finalTotal,
        items: order.items.length
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
