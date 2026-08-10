import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { isEntraConfigured } from '@/lib/msal';

export default function Auth() {
  const { isAuthenticated, isLoading, loginWithEntra } = useAuth();
  const [entraSubmitting, setEntraSubmitting] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleEntraLogin = async () => {
    setEntraSubmitting(true);
    try {
      await loginWithEntra();
    } catch {
      toast.error('Could not sign in with Microsoft.');
    } finally {
      setEntraSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-md">
              <Clock className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Impact Hours Tracker</CardTitle>
        </CardHeader>

        <CardContent className="pt-4 pb-8">
          {isEntraConfigured ? (
            <Button
              type="button"
              className="w-full h-11"
              disabled={entraSubmitting}
              onClick={handleEntraLogin}
            >
              {entraSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sign in with Microsoft
            </Button>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Microsoft sign-in is not configured on this server.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
