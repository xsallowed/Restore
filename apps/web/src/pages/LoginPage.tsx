import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Shield, Eye, EyeOff, LogIn } from 'lucide-react';
import { authApi } from '../lib/api';
import { useAuth } from '../store/auth';

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
      const { token, user } = res.data.data;
      setAuth(token, user);
      navigate('/');
    } catch {
      toast.error('Invalid email or password');
    }
  };

  const quickLogin = (email: string, displayName: string, tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'ADMIN') => {
    const mockToken = 'mock-dev-token-' + Date.now();
    setAuth(mockToken, {
      sub: 'dev-user-' + Date.now(),
      email,
      displayName,
      restore_tier: tier,
      restore_roles: [tier === 'ADMIN' ? 'ADMIN' : tier === 'SILVER' ? 'COMMANDER' : 'RESPONDER']
    });
    toast.success(`Logged in as ${email}`);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-brand-700 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 mb-4">
            <Shield size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Restore</h1>
          <p className="text-blue-200 text-sm mt-1">Operational Resilience & Recovery Platform</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">Sign in to your account</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input
                {...register('email')}
                type="email"
                autoComplete="email"
                placeholder="analyst@org.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Quick login buttons for development */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-600 mb-3 font-medium">Quick Login (Dev)</p>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => quickLogin('admin@restore.local', 'Admin User', 'ADMIN')}
                className="flex items-center justify-center gap-2 w-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium py-2 rounded-lg text-sm transition-colors"
              >
                <LogIn size={16} />
                Admin
              </button>
              <button
                type="button"
                onClick={() => quickLogin('commander@restore.local', 'Incident Commander', 'SILVER')}
                className="flex items-center justify-center gap-2 w-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium py-2 rounded-lg text-sm transition-colors"
              >
                <LogIn size={16} />
                Commander
              </button>
              <button
                type="button"
                onClick={() => quickLogin('analyst@restore.local', 'SOC Analyst', 'BRONZE')}
                className="flex items-center justify-center gap-2 w-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium py-2 rounded-lg text-sm transition-colors"
              >
                <LogIn size={16} />
                Analyst
              </button>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex gap-2 text-xs text-gray-500">
              <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-medium">Bronze</span>
              <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-medium">Silver</span>
              <span className="inline-block px-2 py-0.5 bg-green-100 text-green-800 rounded font-medium">Gold</span>
              <span className="text-gray-400 self-center">— tier assigned at login</span>
            </div>
          </div>
        </div>

        <p className="text-center text-blue-200/60 text-xs mt-6">
          RESTORE-SDD-001 v1.1 Lean MVP
        </p>
      </div>
    </div>
  );
}
