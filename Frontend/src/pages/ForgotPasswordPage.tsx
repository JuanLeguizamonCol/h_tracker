import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Backend always returns a generic 200 (never leaks whether the email
      // exists), so we just show the confirmation regardless.
      await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
    } catch {
      /* swallow — still show the generic confirmation */
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-md">
              {sent ? <CheckCircle2 className="h-8 w-8 text-primary-foreground" /> : <Mail className="h-8 w-8 text-primary-foreground" />}
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">
            {sent ? 'Check your email' : 'Reset your password'}
          </CardTitle>
          <CardDescription className="text-sm mt-1">
            {sent
              ? 'If an account with that email exists, we’ve sent a link to reset your password. The link expires in 72 hours.'
              : 'Enter your email and we’ll send you a link to set a new password.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 pb-8">
          {sent ? (
            <Button asChild variant="outline" className="w-full">
              <Link to="/auth"><ArrowLeft className="h-4 w-4 mr-2" />Back to sign in</Link>
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@impactpoint.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full h-11 mt-2" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Send reset link
              </Button>
              <Link to="/auth" className="text-center text-sm text-muted-foreground hover:text-foreground">
                Back to sign in
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
