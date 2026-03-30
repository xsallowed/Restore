import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Shield, Eye, EyeOff, LogIn, Building2, UserPlus } from 'lucide-react';
import clsx from 'clsx';
import { api, authApi } from '../lib/api';
import { useAuth } from '../store/auth';
import { themeClasses } from '../lib/themeClasses';

// ─── Login Form ───────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email:       z.string().email('Valid email required'),
  password:    z.string().min(1, 'Password required'),
  tenant_slug: z.string().optional(),
});
type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const [showPw, setShowPw]         = useState(false);
  const [showSlug, setShowSlug]     = useState(false);
  const [view, setView]             = useState<'login' | 'register'>('login');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      const res = await api.post('/auth/login', {
        email: data.email,
        password: data.password,
        ...(data.tenant_slug ? { tenant_slug: data.tenant_slug } : {}),
      });
      const { token, user: apiUser, tenant } = res.data.data;
      setAuth(token, {
        sub: apiUser.id,
        email: apiUser.email,
        displayName: apiUser.displayName,
        restore_tier: apiUser.tier,
        restore_roles: apiUser.roles ?? [],
        tenant_id: tenant?.id ?? null,
        tenant_slug: tenant?.slug ?? null,
        is_tenant_admin: apiUser.is_tenant_admin ?? false,
      });
      navigate('/');
    } catch {
      toast.error('Invalid email or password');
    }
  };

  if (view === 'register') {
    return <RegisterPage onBack={() => setView('login')} />;
  }

  return (
    <div className={clsx('min-h-screen flex items-center justify-center p-4', themeClasses.bg.primary)}>
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-4">
            <Shield size={28} className="text-white" />
          </div>
          <h1 className={clsx('text-2xl font-bold', themeClasses.text.primary)}>Restore Platform</h1>
          <p className={clsx('text-sm mt-1', themeClasses.text.secondary)}>Sign in to your organisation</p>
        </div>

        {/* Card */}
        <div className={clsx('rounded-2xl border p-8 space-y-5', themeClasses.bg.card, themeClasses.border.primary)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className={clsx('block text-sm font-medium mb-1.5', themeClasses.text.primary)}>Email</label>
              <input {...register('email')} type="email" autoComplete="email" placeholder="you@company.com"
                className={clsx('w-full px-4 py-2.5 rounded-lg border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary,
                  errors.email ? 'border-red-400' : '')} />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className={clsx('block text-sm font-medium mb-1.5', themeClasses.text.primary)}>Password</label>
              <div className="relative">
                <input {...register('password')} type={showPw ? 'text' : 'password'} autoComplete="current-password"
                  className={clsx('w-full px-4 py-2.5 rounded-lg border text-sm pr-10', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className={clsx('absolute right-3 top-1/2 -translate-y-1/2', themeClasses.text.secondary)}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            {/* Optional tenant slug (shown on demand) */}
            <div>
              <button type="button" onClick={() => setShowSlug(!showSlug)}
                className={clsx('flex items-center gap-1.5 text-xs', themeClasses.text.secondary, 'hover:opacity-80')}>
                <Building2 size={13} />
                {showSlug ? 'Hide' : 'Specify organisation (optional)'}
              </button>
              {showSlug && (
                <div className="mt-2">
                  <input {...register('tenant_slug')} placeholder="your-org-slug"
                    className={clsx('w-full px-4 py-2.5 rounded-lg border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
                  <p className={clsx('text-xs mt-1', themeClasses.text.secondary)}>Only needed if your email exists in multiple organisations</p>
                </div>
              )}
            </div>

            <button type="submit" disabled={isSubmitting}
              className={clsx('w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-white text-sm', themeClasses.button.primary, 'disabled:opacity-50')}>
              <LogIn size={16} />
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className={clsx('border-t pt-4', themeClasses.border.primary)}>
            <p className={clsx('text-xs text-center', themeClasses.text.secondary)}>
              New organisation?{' '}
              <button onClick={() => setView('register')} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                Create account
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Register Page ────────────────────────────────────────────────────────────

const registerSchema = z.object({
  org_name:       z.string().min(2, 'Organisation name required'),
  org_slug:       z.string().min(2).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only'),
  admin_name:     z.string().min(2, 'Your name required'),
  admin_email:    z.string().email('Valid email required'),
  admin_password: z.string().min(8, 'At least 8 characters'),
});
type RegisterForm = z.infer<typeof registerSchema>;

function RegisterPage({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const [showPw, setShowPw] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterForm) => {
    try {
      const res = await api.post('/tenants/register', data);
      const { token, user: apiUser, tenant } = res.data.data;
      setAuth(token, {
        sub: apiUser.id, email: apiUser.email, displayName: apiUser.displayName,
        restore_tier: apiUser.tier, restore_roles: [],
        tenant_id: tenant.id, tenant_slug: tenant.slug, is_tenant_admin: true,
      });
      toast.success(`Welcome to Restore, ${tenant.name}!`);
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Registration failed');
    }
  };

  return (
    <div className={clsx('min-h-screen flex items-center justify-center p-4', themeClasses.bg.primary)}>
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-4">
            <UserPlus size={28} className="text-white" />
          </div>
          <h1 className={clsx('text-2xl font-bold', themeClasses.text.primary)}>Create Organisation</h1>
          <p className={clsx('text-sm mt-1', themeClasses.text.secondary)}>Set up your Restore Platform account</p>
        </div>

        <div className={clsx('rounded-2xl border p-8 space-y-4', themeClasses.bg.card, themeClasses.border.primary)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className={clsx('rounded-lg p-3 text-xs space-y-0.5', themeClasses.bg.secondary, themeClasses.text.secondary)}>
              <p className="font-medium">Organisation details</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Organisation Name</label>
                <input {...register('org_name')} placeholder="Acme Corporation"
                  className={clsx('w-full px-3 py-2 rounded-lg border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
                {errors.org_name && <p className="text-red-500 text-xs mt-0.5">{errors.org_name.message}</p>}
              </div>
              <div className="col-span-2">
                <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Organisation Slug</label>
                <input {...register('org_slug')} placeholder="acme-corp"
                  className={clsx('w-full px-3 py-2 rounded-lg border text-sm font-mono', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
                <p className={clsx('text-xs mt-0.5', themeClasses.text.secondary)}>Unique URL-safe identifier — cannot be changed later</p>
                {errors.org_slug && <p className="text-red-500 text-xs">{errors.org_slug.message}</p>}
              </div>
            </div>

            <div className={clsx('rounded-lg p-3 text-xs space-y-0.5 mt-2', themeClasses.bg.secondary, themeClasses.text.secondary)}>
              <p className="font-medium">Your admin account</p>
            </div>

            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Your Name</label>
              <input {...register('admin_name')} placeholder="Jane Smith"
                className={clsx('w-full px-3 py-2 rounded-lg border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
              {errors.admin_name && <p className="text-red-500 text-xs mt-0.5">{errors.admin_name.message}</p>}
            </div>

            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Email</label>
              <input {...register('admin_email')} type="email" placeholder="jane@company.com"
                className={clsx('w-full px-3 py-2 rounded-lg border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
              {errors.admin_email && <p className="text-red-500 text-xs mt-0.5">{errors.admin_email.message}</p>}
            </div>

            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Password</label>
              <div className="relative">
                <input {...register('admin_password')} type={showPw ? 'text' : 'password'}
                  className={clsx('w-full px-3 py-2 rounded-lg border text-sm pr-10', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className={clsx('absolute right-3 top-1/2 -translate-y-1/2', themeClasses.text.secondary)}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.admin_password && <p className="text-red-500 text-xs mt-0.5">{errors.admin_password.message}</p>}
            </div>

            <button type="submit" disabled={isSubmitting}
              className={clsx('w-full py-2.5 rounded-lg font-medium text-white text-sm', themeClasses.button.primary, 'disabled:opacity-50')}>
              {isSubmitting ? 'Creating account...' : 'Create Organisation'}
            </button>
          </form>

          <div className={clsx('border-t pt-3', themeClasses.border.primary)}>
            <button onClick={onBack} className={clsx('text-xs w-full text-center', themeClasses.text.secondary, 'hover:opacity-80')}>
              Already have an account? Sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Accept Invite Page ───────────────────────────────────────────────────────

const acceptSchema = z.object({
  display_name: z.string().min(2, 'Your name required'),
  password:     z.string().min(8, 'At least 8 characters'),
});
type AcceptForm = z.infer<typeof acceptSchema>;

export function AcceptInvitePage() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<AcceptForm>({
    resolver: zodResolver(acceptSchema),
  });

  const onSubmit = async (data: AcceptForm) => {
    try {
      const res = await api.post('/auth/accept-invite', { token, ...data });
      const { token: jwt, user: apiUser, tenant } = res.data.data;
      setAuth(jwt, {
        sub: apiUser.id, email: apiUser.email, displayName: apiUser.displayName,
        restore_tier: apiUser.tier, restore_roles: [],
        tenant_id: tenant.id, tenant_slug: tenant.slug, is_tenant_admin: false,
      });
      toast.success(`Welcome to ${tenant.name}!`);
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Invalid or expired invitation');
    }
  };

  if (!token) {
    return (
      <div className={clsx('min-h-screen flex items-center justify-center', themeClasses.bg.primary)}>
        <p className={clsx('text-red-500')}>Invalid invitation link — token missing.</p>
      </div>
    );
  }

  return (
    <div className={clsx('min-h-screen flex items-center justify-center p-4', themeClasses.bg.primary)}>
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-4">
            <Shield size={28} className="text-white" />
          </div>
          <h1 className={clsx('text-2xl font-bold', themeClasses.text.primary)}>Accept Invitation</h1>
          <p className={clsx('text-sm mt-1', themeClasses.text.secondary)}>Set up your account to join your team</p>
        </div>

        <div className={clsx('rounded-2xl border p-8 space-y-4', themeClasses.bg.card, themeClasses.border.primary)}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Your Name</label>
              <input {...register('display_name')} placeholder="Jane Smith"
                className={clsx('w-full px-3 py-2.5 rounded-lg border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
              {errors.display_name && <p className="text-red-500 text-xs mt-0.5">{errors.display_name.message}</p>}
            </div>
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Password</label>
              <input {...register('password')} type="password"
                className={clsx('w-full px-3 py-2.5 rounded-lg border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
              {errors.password && <p className="text-red-500 text-xs mt-0.5">{errors.password.message}</p>}
            </div>
            <button type="submit" disabled={isSubmitting}
              className={clsx('w-full py-2.5 rounded-lg font-medium text-white text-sm', themeClasses.button.primary, 'disabled:opacity-50')}>
              {isSubmitting ? 'Creating account...' : 'Join Organisation'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
