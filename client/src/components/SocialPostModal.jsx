import { useState, useEffect } from 'react';
import { X, Copy, Check, Share2 } from 'lucide-react';
import { generateSocialPost } from '../lib/api';

const TEMPLATES = [
  { id: 'hype', label: 'Hype', emoji: '🔥' },
  { id: 'informative', label: 'Informative', emoji: '📋' },
  { id: 'last-chance', label: 'Last Chance', emoji: '⚡' },
];

const PLATFORMS = [
  { id: 'facebook', label: 'Facebook', maxLen: null },
  { id: 'instagram', label: 'Instagram', maxLen: null },
  { id: 'twitter', label: 'X / Twitter', maxLen: 280 },
];

export default function SocialPostModal({ event, onClose }) {
  const [template, setTemplate] = useState('hype');
  const [posts, setPosts] = useState({ facebook: '', instagram: '', twitter: '' });
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    if (!event?.id) return;
    setLoading(true);
    generateSocialPost(event.id, { template })
      .then((data) => {
        const p = data.posts || data;
        setPosts({
          facebook: p.facebook || '',
          instagram: p.instagram || '',
          twitter: p.twitter || '',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [event?.id, template]);

  function handleCopy(platform) {
    navigator.clipboard.writeText(posts[platform]);
    setCopied(platform);
    setTimeout(() => setCopied(null), 2000);
  }

  function handleTextChange(platform, value) {
    setPosts((prev) => ({ ...prev, [platform]: value }));
  }

  function charCountColor(len, maxLen) {
    if (!maxLen) return 'text-gray-500';
    if (len > maxLen) return 'text-red-400';
    if (len >= 250) return 'text-yellow-400';
    return 'text-green-400';
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-pavilion-800 border border-pavilion-600 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-pavilion-600">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-gold-400" />
            <h2 className="text-lg font-semibold text-white">Generate Social Post</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Template selector */}
        <div className="p-5 border-b border-pavilion-600">
          <label className="block text-sm font-medium text-gray-400 mb-2">Template</label>
          <div className="flex gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplate(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  template === t.id
                    ? 'bg-gold-500 text-pavilion-900'
                    : 'bg-pavilion-700 text-gray-400 hover:bg-pavilion-600'
                }`}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Platform sections */}
        <div className="p-5 space-y-5">
          {loading && (
            <div className="text-center py-4">
              <div className="inline-block w-6 h-6 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-400 mt-2">Generating posts...</p>
            </div>
          )}

          {!loading &&
            PLATFORMS.map((platform) => {
              const text = posts[platform.id] || '';
              const len = text.length;
              return (
                <div key={platform.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-gray-400">{platform.label}</label>
                    <div className="flex items-center gap-2">
                      {platform.maxLen && (
                        <span className={`text-xs font-mono ${charCountColor(len, platform.maxLen)}`}>
                          {len}/{platform.maxLen}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopy(platform.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-pavilion-700 text-gray-400 hover:text-gold-400 transition-colors"
                      >
                        {copied === platform.id ? (
                          <>
                            <Check className="w-3 h-3 text-green-400" />
                            <span className="text-green-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={text}
                    onChange={(e) => handleTextChange(platform.id, e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2.5 bg-pavilion-700 border border-pavilion-600 rounded-lg text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none text-sm resize-y"
                    placeholder={`${platform.label} post text...`}
                  />
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
