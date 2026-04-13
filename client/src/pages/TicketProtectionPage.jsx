import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ChevronLeft, CheckCircle, XCircle, HelpCircle, Mail } from 'lucide-react';
import { fetchProtectionTiers } from '../lib/api';

function formatPrice(pence) {
  return `\u00a3${(pence / 100).toFixed(2)}`;
}

function formatPriceRange(min, max) {
  if (max === null || max === undefined) return `${formatPrice(min)}+`;
  return `${formatPrice(min)} \u2013 ${formatPrice(max)}`;
}

export default function TicketProtectionPage() {
  const [tiers, setTiers] = useState([]);

  useEffect(() => {
    fetchProtectionTiers().then(setTiers).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-pavilion-900 text-gray-300">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link
          to="/events"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gold-400 transition-colors mb-6"
        >
          <ChevronLeft className="w-4 h-4" /> Back to events
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="w-8 h-8 text-green-400" />
          <h1 className="text-3xl font-bold text-white">Ticket Protection</h1>
        </div>
        <p className="text-sm text-gray-500 mb-8">Last updated: April 2026</p>

        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 mb-10">
          <p className="text-green-300 text-sm leading-relaxed">
            Ticket Protection is an optional service offered by Ayr Pavilion that allows you to request a refund if you are unable to attend an event due to unforeseen circumstances. It is not an insurance policy. All claims are reviewed by the venue on a case-by-case basis.
          </p>
        </div>

        <div className="space-y-10 text-sm leading-relaxed">

          {/* How it works */}
          <section>
            <h2 className="text-lg font-bold text-gold-400 mb-4">How It Works</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gold-500/20 text-gold-400 flex items-center justify-center text-xs font-bold">1</span>
                <div>
                  <p className="text-white font-medium">Add protection at checkout</p>
                  <p className="text-gray-400 mt-0.5">When purchasing your tickets, select "Yes, protect my tickets" before completing payment. The protection fee is calculated based on your ticket price and added to your order total.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gold-500/20 text-gold-400 flex items-center justify-center text-xs font-bold">2</span>
                <div>
                  <p className="text-white font-medium">Submit a cancellation request if needed</p>
                  <p className="text-gray-400 mt-0.5">If you are unable to attend, click the "Submit a Cancellation Request" button in your ticket confirmation email. You will need to provide your email address and a reason for your cancellation.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gold-500/20 text-gold-400 flex items-center justify-center text-xs font-bold">3</span>
                <div>
                  <p className="text-white font-medium">Your request is reviewed</p>
                  <p className="text-gray-400 mt-0.5">Our team will review your request within 48 hours. You will receive an email notification with the outcome.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gold-500/20 text-gold-400 flex items-center justify-center text-xs font-bold">4</span>
                <div>
                  <p className="text-white font-medium">Refund issued if approved</p>
                  <p className="text-gray-400 mt-0.5">If your claim is approved, a refund will be issued to your original payment method. The refund amount is your ticket total minus the non-refundable protection fee. Please allow 5&ndash;10 business days for the refund to appear on your statement.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Pricing */}
          <section>
            <h2 className="text-lg font-bold text-gold-400 mb-4">Protection Pricing</h2>
            <p className="text-gray-400 mb-4">The protection fee is based on the face value of each ticket in your order. The fee is charged per ticket.</p>
            {tiers.length > 0 && (
              <div className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-pavilion-600/30">
                      <th className="text-left px-5 py-3 text-gold-400 font-medium">Ticket Price</th>
                      <th className="text-right px-5 py-3 text-gold-400 font-medium">Protection Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiers.map((tier) => (
                      <tr key={tier.id} className="border-b border-pavilion-600/20 last:border-0">
                        <td className="px-5 py-3 text-gray-300">{formatPriceRange(tier.minPrice, tier.maxPrice)}</td>
                        <td className="px-5 py-3 text-white font-medium text-right">{formatPrice(tier.fee)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-3">Prices are per ticket. For example, if you purchase 2 tickets at &pound;25 each, the protection fee would be &pound;2.50 per ticket (&pound;5.00 total).</p>
          </section>

          {/* What's covered */}
          <section>
            <h2 className="text-lg font-bold text-gold-400 mb-3">What Is Covered</h2>
            <p className="text-gray-400 mb-3">You may submit a cancellation claim if you are unable to attend due to:</p>
            <ul className="space-y-2">
              {[
                'Illness or medical condition preventing attendance',
                'Injury that prevents you from attending',
                'Bereavement of a close family member',
                'Other genuine unforeseen circumstances beyond your control',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-400">{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* What's NOT covered */}
          <section>
            <h2 className="text-lg font-bold text-gold-400 mb-3">What Is Not Covered</h2>
            <p className="text-gray-400 mb-3">Ticket Protection does not cover the following:</p>
            <ul className="space-y-2">
              {[
                'Change of mind or simply deciding not to attend',
                'Travel disruptions, traffic, or transport cancellations',
                'Forgetting about the event or double-booking',
                'Being unable to find childcare or a babysitter',
                'Weather conditions (unless the event itself is cancelled)',
                'Disagreement with event changes (e.g. lineup changes, time adjustments)',
                'Claims submitted after the event has started',
                'Orders where Ticket Protection was not purchased',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-400">{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Important information */}
          <section>
            <h2 className="text-lg font-bold text-gold-400 mb-3">Important Information</h2>
            <ul className="list-disc list-inside space-y-1.5 text-gray-400">
              <li>Ticket Protection is <strong className="text-white">optional</strong> and is offered as a service by Ayr Pavilion. It is <strong className="text-white">not an insurance policy</strong>.</li>
              <li>The protection fee is <strong className="text-white">non-refundable</strong> in all circumstances, including if your claim is approved.</li>
              <li>All claims are reviewed by the venue on a <strong className="text-white">case-by-case basis</strong>. Purchasing protection does not guarantee a refund.</li>
              <li>Claims must be submitted <strong className="text-white">at least 24 hours before the event start time</strong>. Requests received within 24 hours of the event will not be considered.</li>
              <li>You may be asked to provide supporting evidence for your claim (e.g. a medical note).</li>
              <li>Only <strong className="text-white">one claim per order</strong> may be submitted. Protection covers all tickets in the order.</li>
              <li>If a claim is approved, the refund amount will be the <strong className="text-white">ticket total minus the protection fee</strong>. Booking fees are also non-refundable.</li>
              <li>If a claim is denied, your tickets remain valid for the event.</li>
              <li>If the event is <strong className="text-white">cancelled by the organiser</strong>, all ticket holders receive a full refund regardless of whether protection was purchased.</li>
            </ul>
          </section>

          {/* How to make a claim */}
          <section>
            <h2 className="text-lg font-bold text-gold-400 mb-3">How to Make a Claim</h2>
            <ul className="list-disc list-inside space-y-1.5 text-gray-400">
              <li>Open your ticket confirmation email and click the <strong className="text-white">"Submit a Cancellation Request"</strong> button.</li>
              <li>Enter the email address you used when purchasing your tickets.</li>
              <li>Select the reason for your cancellation and provide details.</li>
              <li>Accept the claim terms and submit your request.</li>
              <li>You will receive a confirmation email with a claim reference number.</li>
              <li>Our team will review your request and notify you of the outcome by email within 48 hours.</li>
            </ul>
          </section>

          {/* Refund timelines */}
          <section>
            <h2 className="text-lg font-bold text-gold-400 mb-3">Refund Timelines</h2>
            <ul className="list-disc list-inside space-y-1.5 text-gray-400">
              <li>Claims are typically reviewed within <strong className="text-white">48 hours</strong> of submission.</li>
              <li>If approved, refunds are processed immediately via Stripe to your original payment method.</li>
              <li>Refunds typically appear on your statement within <strong className="text-white">5&ndash;10 business days</strong>, depending on your bank or card issuer.</li>
              <li>You will receive an email confirmation when your refund has been processed.</li>
            </ul>
          </section>

          {/* Without protection */}
          <section>
            <h2 className="text-lg font-bold text-gold-400 mb-3">Without Ticket Protection</h2>
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
              <p className="text-gray-400">
                If you choose not to purchase Ticket Protection, your tickets are <strong className="text-white">non-refundable</strong>. Refunds will only be issued if the event is cancelled or postponed by the organiser. No exceptions will be made for personal circumstances, illness, or any other reason.
              </p>
            </div>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-lg font-bold text-gold-400 mb-3">Questions?</h2>
            <p className="text-gray-400">
              If you have any questions about Ticket Protection, please contact us at{' '}
              <a href="mailto:info@ayrpavilion.com" className="text-gold-400 hover:underline">info@ayrpavilion.com</a>.
            </p>
          </section>

        </div>

        <div className="mt-12 pt-6 border-t border-pavilion-600/30 text-xs text-gray-600 flex items-center justify-between">
          <p>Ayr Pavilion &middot; Ayr, Scotland</p>
          <Link to="/terms" className="text-gold-400/50 hover:text-gold-400 transition-colors">Terms & Conditions</Link>
        </div>
      </div>
    </div>
  );
}
