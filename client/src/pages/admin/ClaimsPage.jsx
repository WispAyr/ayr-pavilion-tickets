import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  AlertCircle,
  ShieldCheck,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { fetchProtectionClaims, approveClaim, denyClaim } from '../../lib/api';

function formatPrice(pence) {
  return `\u00a3${(pence / 100).toFixed(2)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ClaimStatusBadge({ status }) {
  const styles = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    approved: 'bg-green-500/20 text-green-400 border-green-500/30',
    denied: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  const icons = {
    pending: Clock,
    approved: CheckCircle,
    denied: XCircle,
  };
  const Icon = icons[status] || Clock;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full border capitalize ${styles[status] || styles.pending}`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
}

export default function ClaimsPage() {
  const [claims, setClaims] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [denyNotes, setDenyNotes] = useState('');
  const [showDenyForm, setShowDenyForm] = useState(null);

  const loadClaims = useCallback(() => {
    setLoading(true);
    const params = {};
    if (filter) params.status = filter;
    fetchProtectionClaims(params)
      .then((data) => {
        setClaims(data.claims || []);
        setPendingCount(data.pendingCount || 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    loadClaims();
  }, [loadClaims]);

  async function handleApprove(claimId) {
    if (!confirm('Approve this claim and issue refund?')) return;
    setActionLoading(claimId);
    try {
      await approveClaim(claimId);
      loadClaims();
    } catch (err) {
      alert(err.message || 'Failed to approve claim');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeny(claimId) {
    if (!denyNotes.trim()) {
      alert('Please provide a reason for denial');
      return;
    }
    setActionLoading(claimId);
    try {
      await denyClaim(claimId, denyNotes);
      setShowDenyForm(null);
      setDenyNotes('');
      loadClaims();
    } catch (err) {
      alert(err.message || 'Failed to deny claim');
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-green-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Protection Claims</h1>
            <p className="text-sm text-gray-500">Review and manage ticket protection claims</p>
          </div>
        </div>
        {pendingCount > 0 && (
          <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-full text-sm font-semibold">
            {pendingCount} pending
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { value: '', label: 'All' },
          { value: 'pending', label: 'Pending' },
          { value: 'approved', label: 'Approved' },
          { value: 'denied', label: 'Denied' },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-all ${
              filter === tab.value
                ? 'bg-gold-500/10 text-gold-400 border border-gold-500/20'
                : 'text-gray-400 hover:text-white hover:bg-pavilion-700 border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-gold-400 animate-spin" />
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && claims.length === 0 && (
        <div className="text-center py-20">
          <ShieldCheck className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500">No {filter || ''} claims found</p>
        </div>
      )}

      {!loading && claims.length > 0 && (
        <div className="space-y-3">
          {claims.map((claim) => {
            const isExpanded = expandedId === claim.id;
            return (
              <div
                key={claim.id}
                className="bg-pavilion-800 border border-pavilion-600/50 rounded-xl overflow-hidden"
              >
                {/* Header row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : claim.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-pavilion-700/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono text-gold-400">{claim.claimRef}</span>
                      <ClaimStatusBadge status={claim.status} />
                    </div>
                    <p className="text-sm text-white mt-1">{claim.customerName}</p>
                    <p className="text-xs text-gray-500">{claim.eventTitle}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm text-gray-400">{formatDate(claim.requestedAt)}</p>
                    {claim.refundAmount > 0 && (
                      <p className="text-sm font-medium text-white">{formatPrice(claim.refundAmount)}</p>
                    )}
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-pavilion-600/30 space-y-4">
                    <div className="grid grid-cols-2 gap-4 pt-4">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Order Ref</p>
                        <p className="text-sm text-white font-mono">{claim.orderRef}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Customer Email</p>
                        <p className="text-sm text-white">{claim.customerEmail}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Event</p>
                        <p className="text-sm text-white">{claim.eventTitle}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Event Date</p>
                        <p className="text-sm text-white">{formatDate(claim.dateTime)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Order Total</p>
                        <p className="text-sm text-white">{formatPrice(claim.orderTotal || 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Protection Fee</p>
                        <p className="text-sm text-white">{formatPrice(claim.protectionFee || 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Refund Amount</p>
                        <p className="text-sm font-semibold text-green-400">{formatPrice(claim.refundAmount || 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Category</p>
                        <p className="text-sm text-white capitalize">{claim.reasonCategory || 'other'}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Reason</p>
                      <p className="text-sm text-gray-300 bg-pavilion-700/50 rounded-lg p-3">{claim.reason}</p>
                    </div>

                    {claim.adminNotes && (
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Admin Notes</p>
                        <p className="text-sm text-gray-300 bg-pavilion-700/50 rounded-lg p-3">{claim.adminNotes}</p>
                      </div>
                    )}

                    {claim.resolvedAt && (
                      <p className="text-xs text-gray-500">
                        Resolved {formatDate(claim.resolvedAt)} by {claim.resolvedBy || 'admin'}
                      </p>
                    )}

                    {/* Actions for pending claims */}
                    {claim.status === 'pending' && (
                      <div className="flex flex-col gap-3 pt-2">
                        {showDenyForm === claim.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={denyNotes}
                              onChange={(e) => setDenyNotes(e.target.value)}
                              placeholder="Reason for denial (required, will be sent to customer)..."
                              rows={3}
                              className="w-full px-3 py-2 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 text-sm focus:border-red-500 focus:outline-none"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleDeny(claim.id)}
                                disabled={actionLoading === claim.id}
                                className="flex-1 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                {actionLoading === claim.id && <Loader2 className="w-3 h-3 animate-spin" />}
                                Confirm Deny
                              </button>
                              <button
                                onClick={() => { setShowDenyForm(null); setDenyNotes(''); }}
                                className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApprove(claim.id)}
                              disabled={actionLoading === claim.id}
                              className="flex-1 px-4 py-2.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {actionLoading === claim.id && <Loader2 className="w-3 h-3 animate-spin" />}
                              <CheckCircle className="w-4 h-4" />
                              Approve & Refund {formatPrice(claim.refundAmount || 0)}
                            </button>
                            <button
                              onClick={() => setShowDenyForm(claim.id)}
                              className="flex-1 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2"
                            >
                              <XCircle className="w-4 h-4" />
                              Deny
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
