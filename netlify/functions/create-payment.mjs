
const PRODUCTS = {
  "dreamgoals-pk": { currency: "PKR", amount: 49900, label: "DreamGoals Pro" },
  "dreamgoals-us": { currency: "USD", amount: 799, label: "DreamGoals Pro" },
};

const SITE_URL = "https://smarttoolstudio.netlify.app";

export default async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const product = PRODUCTS[body?.productCode];

    if (!product) {
      return Response.json({ error: "Invalid product selection" }, { status: 400 });
    }

    const publicKey = Netlify.env.get("SAFEPAY_PUBLIC_KEY");
    const secretKey = Netlify.env.get("SAFEPAY_SECRET_KEY");
    const environment = Netlify.env.get("SAFEPAY_ENV") || "sandbox";

    if (environment !== "sandbox") {
      return Response.json({ error: "Only Sandbox checkout is enabled." }, { status: 403 });
    }

    if (!publicKey || !secretKey) {
      return Response.json({ error: "Safepay keys are not configured." }, { status: 500 });
    }

    const Safepay = (await import("@sfpy/node-core")).default;
    const safepay = new Safepay(secretKey, {
      authType: "secret",
      host: "https://sandbox.api.getsafepay.com",
    });

    const session = await safepay.payments.session.setup({
      merchant_api_key: publicKey,
      intent: "CYBERSOURCE",
      mode: "payment",
      entry_mode: "raw",
      currency: product.currency,
      amount: product.amount,
      include_fees: false,
      metadata: {
        product: "DreamGoals Pro",
        product_code: body.productCode,
      },
    });

    const tracker = session?.data?.tracker?.token;
    if (!tracker) throw new Error("No payment tracker returned.");

    const auth = await safepay.auth.passport.create();
    const tbt = auth?.data;
    if (!tbt) throw new Error("No authentication token returned.");

    const checkout = safepay.checkouts.payment.create({
      tracker,
      tbt,
      environment: "sandbox",
      source: "hosted",
      redirect_url: `${SITE_URL}/payment-success.html`,
      cancel_url: `${SITE_URL}/payment-cancelled.html`,
    });

    const checkoutUrl = typeof checkout === "string" ? checkout : checkout?.url;

    if (!checkoutUrl || !checkoutUrl.startsWith("https://")) {
      throw new Error("Invalid checkout URL.");
    }

    return Response.json({
      checkoutUrl,
      tracker,
      currency: product.currency,
      amount: product.amount,
    });
  } catch (error) {
    console.error("Safepay checkout error:", error?.message || "Unknown error");
    return Response.json({
      error: "Could not start Sandbox checkout. Please try again."
    }, { status: 502 });
  }
};
