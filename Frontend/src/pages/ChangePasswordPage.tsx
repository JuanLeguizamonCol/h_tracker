import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface PasswordStrength {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
}

function checkStrength(password: string): PasswordStrength {
  return {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
  };
}

function isStrongEnough(s: PasswordStrength): boolean {
  return s.minLength && s.hasUppercase && s.hasLowercase && s.hasNumber;
}

function StrengthRow({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {met
        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
        : <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
      <span className={met ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>{label}</span>
    </div>
  );
}

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [errors, setErrors] = useState<{ current?: string; new?: string; confirm?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const strength = checkStrength(newPassword);
  const passwordsMatch = newPassword === confirmPassword;

  const validate = (): boolean => {
    const e: typeof errors = {};
    if (!currentPassword) e.current = 'Please enter your current password.';
    if (!isStrongEnough(strength)) e.new = 'Password does not meet requirements.';
    if (!confirmPassword) {
      e.confirm = 'Please confirm your new password.';
    } else if (!passwordsMatch) {
      e.confirm = 'Passwords do not match.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      await refreshProfile();
      toast.success('Password updated successfully!');
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const detail = (err as { detail?: string })?.detail;
      if (detail === 'Current password is incorrect') {
        setErrors(prev => ({ ...prev, current: 'Incorrect password. Please try again.' }));
      } else {
        toast.error('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Logo / brand mark */}
        <div className="flex justify-center mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Lock className="h-7 w-7" />
          </div>
        </div>

        <Card className="shadow-lg border-border">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl font-bold">Welcome — Please set your password</CardTitle>
            <CardDescription className="text-sm mt-1">
              For your security, you must set a personal password before accessing the app. This is a one-time step.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Current / Temporary Password */}
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current / Temporary Password</Label>
                <div className="relative">
                  <Input
                    id="current-password"
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={e => { setCurrentPassword(e.target.value); setErrors(prev => ({ ...prev, current: undefined })); }}
                    placeholder="Enter your temporary password"
                    className={errors.current ? 'border-destructive pr-10' : 'pr-10'}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.current && <p className="text-xs text-destructive">{errors.current}</p>}
              </div>

              {/* New Password */}
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => { setNewPassword(e.target.value); setErrors(prev => ({ ...prev, new: undefined })); }}
                    placeholder="Create a strong password"
                    className={errors.new ? 'border-destructive pr-10' : 'pr-10'}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Strength indicator */}
                {newPassword.length > 0 && (
                  <div className="mt-2 space-y-1 rounded-lg bg-muted/50 p-3">
                    <StrengthRow met={strength.minLength} label="At least 8 characters" />
                    <StrengthRow met={strength.hasUppercase} label="At least one uppercase letter" />
                    <StrengthRow met={strength.hasLowercase} label="At least one lowercase letter" />
                    <StrengthRow met={strength.hasNumber} label="At least one number" />
                  </div>
                )}
                {errors.new && <p className="text-xs text-destructive">{errors.new}</p>}
              </div>

              {/* Confirm New Password */}
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value); setErrors(prev => ({ ...prev, confirm: undefined })); }}
                    placeholder="Re-enter your new password"
                    className={errors.confirm ? 'border-destructive pr-10' : 'pr-10'}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.confirm && <p className="text-xs text-destructive">{errors.confirm}</p>}
                {confirmPassword.length > 0 && !errors.confirm && passwordsMatch && (
                  <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />Passwords match
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full mt-2" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Set Password & Continue'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
