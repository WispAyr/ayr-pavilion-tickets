export default function TermsPage() {
  return (
    <div className="min-h-screen bg-pavilion-900 text-gray-300">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-white mb-2">Terms & Conditions</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: March 2026</p>

        <div className="space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-gold-400 mb-3">1. Ticket Purchase</h2>
            <ul className="list-disc list-inside space-y-1.5 text-gray-400">
              <li>All ticket sales are final unless the event is cancelled by the organiser.</li>
              <li>Tickets are non-transferable unless explicitly stated otherwise.</li>
              <li>You must provide a valid email address at the time of purchase. Your tickets and receipt will be sent to this address.</li>
              <li>Tickets are subject to availability and the advertised capacity for each session.</li>
              <li>A booking fee may apply and will be clearly shown before payment.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gold-400 mb-3">2. Entry & Admission</h2>
            <ul className="list-disc list-inside space-y-1.5 text-gray-400">
              <li>A valid ticket (QR code) must be presented at the door for entry.</li>
              <li>Each ticket can only be scanned once. Duplicate or screenshot copies may be rejected.</li>
              <li>The venue reserves the right to refuse entry to any person at its discretion.</li>
              <li>Doors open at the advertised time. Late arrival is at your own risk — no refunds will be given for late entry.</li>
              <li>Where age restrictions apply, proof of age may be required.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gold-400 mb-3">3. Children & Supervision</h2>
            <ul className="list-disc list-inside space-y-1.5 text-gray-400">
              <li>Children under the age specified for the event must be accompanied by a responsible adult at all times.</li>
              <li>The required adult-to-child supervision ratio is stated on the event page and enforced at checkout.</li>
              <li>The venue and organisers accept no responsibility for unaccompanied children.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gold-400 mb-3">4. Equipment Hire & Add-ons</h2>
            <ul className="list-disc list-inside space-y-1.5 text-gray-400">
              <li>Equipment hire (e.g. skate hire) is subject to availability of the requested size on the day.</li>
              <li>Hired equipment must be returned in the same condition at the end of the session.</li>
              <li>You are responsible for any damage to hired equipment during your session. Charges may apply for damaged or lost items.</li>
              <li>If your requested size is unavailable, the closest available alternative will be offered where possible.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gold-400 mb-3">5. Refunds & Cancellations</h2>
            <ul className="list-disc list-inside space-y-1.5 text-gray-400">
              <li>Refund requests must be made at least 48 hours before the event start time.</li>
              <li>Refunds will be processed to the original payment method within 5–10 working days.</li>
              <li>Booking fees are non-refundable.</li>
              <li>If the event is cancelled by the organiser, a full refund (including booking fees) will be issued automatically.</li>
              <li>The organiser reserves the right to reschedule events. In such cases, tickets remain valid for the new date, or a refund may be requested.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gold-400 mb-3">6. Health & Safety</h2>
            <ul className="list-disc list-inside space-y-1.5 text-gray-400">
              <li>You participate in all activities at your own risk.</li>
              <li>You must follow all safety instructions given by staff and signage at the venue.</li>
              <li>The venue and organisers are not liable for any personal injury, loss, or damage to personal belongings unless caused by proven negligence.</li>
              <li>If you have any medical conditions that may affect your ability to participate, please inform staff before the session begins.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gold-400 mb-3">7. Behaviour</h2>
            <ul className="list-disc list-inside space-y-1.5 text-gray-400">
              <li>Antisocial behaviour, aggression, or intoxication will result in removal from the venue without refund.</li>
              <li>The organisers reserve the right to remove any person whose behaviour poses a risk to the safety or enjoyment of others.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gold-400 mb-3">8. Photography & Recording</h2>
            <ul className="list-disc list-inside space-y-1.5 text-gray-400">
              <li>The venue may be monitored by CCTV for security purposes.</li>
              <li>Photographs and videos may be taken during the event for promotional purposes. By attending, you consent to being photographed or filmed.</li>
              <li>If you do not wish to appear in promotional material, please inform a member of staff on arrival.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gold-400 mb-3">9. Data Protection</h2>
            <ul className="list-disc list-inside space-y-1.5 text-gray-400">
              <li>Your personal data (name, email, phone) is collected solely for the purpose of processing your ticket order and communicating event information.</li>
              <li>We will not sell or share your data with third parties except as required to fulfil your order (e.g. payment processing).</li>
              <li>Payment is processed securely via Stripe. We do not store your card details.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gold-400 mb-3">10. Contact</h2>
            <p className="text-gray-400">
              For any queries regarding these terms, your tickets, or the event, please contact us at{' '}
              <a href="mailto:info@ayrpavilion.com" className="text-gold-400 hover:underline">info@ayrpavilion.com</a>.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-pavilion-600/30 text-xs text-gray-600">
          <p>Ayr Pavilion · Ayr, Scotland</p>
        </div>
      </div>
    </div>
  );
}
