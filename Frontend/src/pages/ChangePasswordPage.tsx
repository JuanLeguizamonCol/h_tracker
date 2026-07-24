import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import { useAuth } from '@/contexts/AuthContext';

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { mustChangePassword } = useAuth();
  // Forced first-login flow vs. a voluntary visit to /change-password.
  const onboarding = mustChangePassword;

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
            <CardTitle className="text-2xl font-bold">
              {onboarding ? 'Welcome — Please set your password' : 'Change your password'}
            </CardTitle>
            <CardDescription className="text-sm mt-1">
              {onboarding
                ? 'For your security, you must set a personal password before accessing the app. This is a one-time step.'
                : 'Enter your current password and choose a new one.'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <ChangePasswordForm variant={onboarding ? 'onboarding' : 'settings'} />
            {!onboarding && (
              <Button
                type="button"
                variant="ghost"
                className="w-full mt-3"
                onClick={() => navigate(-1)}
              >
                Cancel
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
