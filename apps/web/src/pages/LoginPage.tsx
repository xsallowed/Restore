import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Shield, Eye, EyeOff, LogIn } from 'lucide-react';
import clsx from 'clsx';
import { authApi } from '../lib/api';
import { useAuth } from '../store/auth';
import { themeClasses } from '../lib/themeClasses';

const schema = z.object({
  email:    z.string().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
});
type Form = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const [showPw, setShowPw] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: Form) => {
    try {
      const res = await authApi.login(data.email, data.password);
      const { token, user: apiUser } = res.data.data;
      const user = {
        sub: apiUser.id || apiUser.sub,
        email: apiUser.email,
        displayName: apiUser.displayName,
        restore_tier: (apiUser.tier || apiUser.restore_tier) as 'BRONZE' | 'SILVER' | 'GOLD' | 'ADMIN',
        restore_roles: apiUser.restore_roles || apiUser.roles || [],
      };
      setAuth(token, user);
      navigate('/');
    } catch {
      toast.error('Invalid email or password');
    }
  };

  const quickLogin = (email: string) => {
    try {
      let tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'ADMIN' = 'BRONZE';
      let displayName = 'SOC Analyst';

      if (email.includes('admin')) {
        tier = 'ADMIN';
        displayName = 'Admin User';
      } else if (email.includes('commander')) {
        tier = 'SILVER';
        displayName = 'Incident Commander';
      }

      const user = {
        sub: 'dev-user-' + Date.now(),
        email,
        displayName,
        restore_tier: tier,
        restore_roles: tier === 'ADMIN' ? ['ADMIN'] : tier === 'SILVER' ? ['COMMANDER'] : ['RESPONDER'],
      };

      const token = 'dev-token-' + Date.now();
      setAuth(token, user);
      toast.success(`Logged in as ${displayName}`);
      navigate('/');
    } catch (err) {
      toast.error('Login failed');
      console.error(err);
    }
  };

  return (
    <div className={clsx('min-h-screen flex items-center justify-center p-4 relative overflow-hidden', 'bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950')}>
      {/* Subtle gradient orbs for visual interest */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-orange rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo & Branding */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-purple-orange shadow-glow mb-6">
            <Shield size={32} className="text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Restore</h1>
          <p className={clsx(themeClasses.badge.default, 'justify-center mx-auto')}>
            AI-Powered Crisis Management
          </p>
          <p className={clsx(themeClasses.text.secondary, 'text-sm mt-4')}>Build organisational resilience through intelligent response coordination and recovery strategies</p>
        </div>

        {/* Login Card */}
        <div className={clsx(themeClasses.card, 'border-gray-300 dark:border-gray-700 backdrop-blur-xl rounded-xl shadow-xl dark:shadow-2xl p-8 mb-6')}>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Sign in to your account</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Email Field */}
            <div>
              <label className={clsx(themeClasses.text.secondary, 'block text-sm font-medium mb-1.5')}>Email address</label>
              <input
                {...register('email')}
                type="email"
                autoComplete="email"
                placeholder="analyst@restore.local"
                className={clsx(themeClasses.input, 'w-full rounded-lg px-3 py-2.5 text-sm')}
              />
              {errors.email && <p className="text-red-600 dark:text-red-400 text-xs mt-1.5">{errors.email.message}</p>}
            </div>

            {/* Password Field */}
            <div>
              <label className={clsx(themeClasses.text.secondary, 'block text-sm font-medium mb-1.5')}>Password</label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={clsx(themeClasses.input, 'w-full rounded-lg px-3 py-2.5 text-sm pr-10')}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  className={clsx(themeClasses.text.tertiary, 'absolute right-3 top-1/2 -translate-y-1/2 hover:text-gray-700 dark:hover:text-gray-300 transition-colors')}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && <p className="text-red-600 dark:text-red-400 text-xs mt-1.5">{errors.password.message}</p>}
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={clsx(themeClasses.button.primary, 'w-full disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 rounded-lg font-medium')}
            >
              {isSubmitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Quick Login Section */}
          <div className={clsx('mt-8 pt-8 border-t border-gray-300 dark:border-gray-700')}>
            <p className={clsx(themeClasses.text.tertiary, 'text-xs font-semibold uppercase tracking-wider mb-4')}>Quick Login (Development)</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => quickLogin('admin@restore.local')}
                className={clsx(themeClasses.button.secondary, 'w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium')}
              >
                <LogIn size={16} />
                Admin
              </button>
              <button
                type="button"
                onClick={() => quickLogin('commander@restore.local')}
                className={clsx(themeClasses.button.secondary, 'w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium')}
              >
                <LogIn size={16} />
                Commander
              </button>
              <button
                type="button"
                onClick={() => quickLogin('analyst@restore.local')}
                className={clsx(themeClasses.button.secondary, 'w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium')}
              >
                <LogIn size={16} />
                Analyst
              </button>
            </div>
          </div>

          {/* Tier Legend */}
          <div className={clsx('mt-6 pt-6 border-t border-gray-300 dark:border-gray-700')}>
            <p className={clsx(themeClasses.text.tertiary, 'text-xs mb-3 font-medium')}>Account tiers</p>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-100 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-500/40 text-amber-900 dark:text-amber-300 rounded-full text-xs font-semibold">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                Bronze
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-100 dark:bg-blue-500/20 border border-blue-300 dark:border-blue-500/40 text-blue-900 dark:text-blue-300 rounded-full text-xs font-semibold">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                Silver
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-yellow-100 dark:bg-yellow-500/20 border border-yellow-300 dark:border-yellow-500/40 text-yellow-900 dark:text-yellow-300 rounded-full text-xs font-semibold">
                <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></span>
                Gold
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className={clsx(themeClasses.text.tertiary, 'text-center text-xs')}>
          RESTORE-SDD-001 v1.1 Lean MVP
        </p>
      </div>
    </div>
  );
}
