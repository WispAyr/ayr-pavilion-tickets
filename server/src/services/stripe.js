const Stripe = require('stripe');

let stripe;

function getStripe() {
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

async function createCheckoutSession({ lineItems, customerEmail, customerName, orderRef, successUrl, cancelUrl, metadata }) {
  const s = getStripe();

  const sessionParams = {
    payment_method_types: ['card'],
    mode: 'payment',
    customer_email: customerEmail,
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      order_ref: orderRef,
      customer_name: customerName,
      ...metadata
    }
  };

  const session = await s.checkout.sessions.create(sessionParams);
  return session;
}

function constructWebhookEvent(payload, signature) {
  const s = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }

  return s.webhooks.constructEvent(payload, signature, webhookSecret);
}

async function createRefund(paymentIntentId, amountInPence) {
  const s = getStripe();

  const refundParams = {
    payment_intent: paymentIntentId
  };

  if (amountInPence) {
    refundParams.amount = amountInPence;
  }

  const refund = await s.refunds.create(refundParams);
  return refund;
}

module.exports = { getStripe, createCheckoutSession, constructWebhookEvent, createRefund };
