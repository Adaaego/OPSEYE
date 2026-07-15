import { useState } from 'react';
import {
  Lock,
  Mail,
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Logo } from '../logos/logo';

export default function LandingPage() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const onSubmit = (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!email || !password) {
      setError('Please fill in both fields.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setInfo(mode === 'signup' ? 'Account created successfully. Welcome to OPSEYE.' : 'Signed in successfully.');
    }, 1500);
  };

  const switchMode = (m) => {
    setMode(m);
    setError(null);
    setInfo(null);
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-ink-900 overflow-hidden">
      {/* Subtle background */}
      <div className="pointer-events-none absolute inset-0 grid-bg" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(179,134,47,0.05),transparent_60%)]" />

      {/* Top bar */}
      <header className="relative z-20 flex items-center justify-between px-6 lg:px-12 py-5">
        <Logo />
        <span className="rounded-full border border-ink-700 bg-ink-800/60 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-ink-400">
          Prototype
        </span>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* About line */}
          <div className="mb-10 text-center">
            <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
              Decision intelligence for operations that matter
            </h1>
            <p className="mt-3 text-sm text-ink-300 leading-relaxed max-w-sm mx-auto">
              OPSEYE helps teams turn operational data into clear decisions.
              Sign in or create an account to get started.
            </p>
          </div>

          {/* Auth card */}
          <div className="rounded-xl border border-ink-700 bg-ink-850/80 backdrop-blur-sm shadow-2xl shadow-black/40 overflow-hidden">
            {/* Tabs */}
            <div className="grid grid-cols-2 border-b border-ink-700">
              <button
                onClick={() => switchMode('signin')}
                className={`py-3.5 text-sm font-medium transition-colors ${
                  mode === 'signin'
                    ? 'text-white border-b-2 border-gold-500 bg-ink-800/40'
                    : 'text-ink-400 hover:text-ink-200'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => switchMode('signup')}
                className={`py-3.5 text-sm font-medium transition-colors ${
                  mode === 'signup'
                    ? 'text-white border-b-2 border-gold-500 bg-ink-800/40'
                    : 'text-ink-400 hover:text-ink-200'
                }`}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={onSubmit} className="p-7">

              {/* Email */}
              <label className="block">
                <span className="text-xs font-medium text-ink-200">Work Email</span>
                <div className="mt-2 group relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 group-focus-within:text-gold-400 transition-colors" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@yourorg.gov"
                    autoComplete="email"
                    className="w-full rounded-lg bg-ink-900 border border-ink-700 pl-11 pr-4 py-3 text-sm text-white placeholder:text-ink-500 focus:outline-none focus:border-gold-500/60 focus:ring-1 focus:ring-gold-500/30 transition-all"
                  />
                </div>
              </label>

              {/* Password */}
              <label className="block mt-5">
                <span className="text-xs font-medium text-ink-200">Password</span>
                <div className="mt-2 group relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 group-focus-within:text-gold-400 transition-colors" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'Choose a password (min 6 chars)' : 'Enter your password'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    className="w-full rounded-lg bg-ink-900 border border-ink-700 pl-11 pr-11 py-3 text-sm text-white placeholder:text-ink-500 focus:outline-none focus:border-gold-500/60 focus:ring-1 focus:ring-gold-500/30 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-200 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              {/* Error */}
              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-px" />
                  <span>{error}</span>
                </div>
              )}

              {/* Info / success */}
              {info && !error && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-px" />
                  <span>{info}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="mt-6 w-full group flex items-center justify-center gap-2 rounded-lg bg-gold-500 hover:bg-gold-400 disabled:opacity-60 disabled:cursor-not-allowed px-5 py-3 text-sm font-semibold text-ink-900 transition-all shadow-lg shadow-gold-700/20"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {mode === 'signup' ? 'Creating account…' : 'Signing in…'}
                  </>
                ) : (
                  <>
                    {mode === 'signup' ? 'Create Account' : 'Access Platform'}
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Reassurance */}
          <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-ink-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/70" />
            <span>Your data is encrypted and protected</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-ink-700/60 px-6 lg:px-12 py-5 flex items-center justify-between">
        <span className="text-[11px] font-mono text-ink-500">© 2026 OPSEYE</span>
        <div className="flex items-center gap-5 text-[11px] font-mono text-ink-500">
          <a className="hover:text-ink-300 cursor-pointer">Privacy</a>
          <a className="hover:text-ink-300 cursor-pointer">Terms</a>
          <a className="hover:text-ink-300 cursor-pointer">Support</a>
        </div>
      </footer>
    </div>
  );
}