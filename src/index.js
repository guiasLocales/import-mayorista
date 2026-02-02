import { readProducts, appendOrder, readConfig, readCategories } from './sheets-client.js';
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
            if (path === '/api/categories') {
                return await handleGetCategories(request, env);
            }
            if (path === '/api/orders' && request.method === 'POST') {
                return await handleSaveOrder(request, env);
            }

            // FRONTEND (Static Assets + HTMLRewriter)
            // Serve static assets from the binding
            let response = await env.ASSETS.fetch(request);

            // If it's the root path, check for category parameter
            if (response.ok && path === '/') {
                const categoryParam = url.searchParams.get('category');

                if (!categoryParam) {
                    // No category specified, show categories page
                    response = await env.ASSETS.fetch(new Request(new URL('/categories.html', request.url)));
                    return response;
                } else {
                    // Category specified, show index.html with that category
                    return new HTMLRewriter()
                        .on('#meta-category', {
                            element(element) {
                                element.setAttribute('content', categoryParam);
                            }
                        })
                        .transform(response);
                }
            }

            // If it's index.html directly, use DEFAULT_CATEGORY or URL param
            if (response.ok && path === '/index.html') {
                const categoryParam = url.searchParams.get('category');
                const category = categoryParam || env.DEFAULT_CATEGORY || 'LIBRERIA';

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

    // Parallel fetch: Products + Config
    const [products, sheetConfig] = await Promise.all([
        readProducts(env, category),
        readConfig(env)
    ]);

    // Merge Config with Defaults
    const config = { ...ORDER_RULES, ...sheetConfig };

    let filteredProducts = products;

    // Filter by Search (Local filter after fetching all products from sheet)
    if (search) {
        filteredProducts = products.filter(p =>
            (p.name || '').toLowerCase().includes(search) ||
            (p.code || '').toLowerCase().includes(search)
        );
    }

    // Pagination
    const total = filteredProducts.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;

    return new Response(JSON.stringify({
        items: filteredProducts.slice(start, end),
        page: safePage,
        pageSize,
        total,
        totalPages,
        category,
        config
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

    if (!order.client.name || !order.client.phone || !order.client.email) {
        return new Response(JSON.stringify({ error: 'Faltan datos del cliente' }), { status: 400 });
    }

    // Re-calculate totals server-side for security using Dynamic Config
    const sheetConfig = await readConfig(env);
    const rules = { ...ORDER_RULES, ...sheetConfig };

    const rawTotal = order.items.reduce((s, it) => s + (Number(it.price) * Number(it.qty)), 0);

    if (rawTotal < rules.MIN_TOTAL) {
        return new Response(JSON.stringify({
            error: `Compra mínima no alcanzada. Mínimo: $${rules.MIN_TOTAL}`
        }), { status: 400 });
    }

    const discount = (rawTotal >= rules.DISCOUNT_THRESHOLD)
        ? (rawTotal * rules.DISCOUNT_RATE)
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

/**
 * GET /api/categories
 * Returns all available categories from llamada_appscript sheet
 */
async function handleGetCategories(request, env) {
    const categories = await readCategories(env);

    return new Response(JSON.stringify({
        categories
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
