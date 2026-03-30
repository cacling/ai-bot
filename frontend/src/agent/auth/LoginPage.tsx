/**
 * LoginPage.tsx — 员工登录页
 */
import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Headset } from 'lucide-react';
import { useAuth } from './AuthProvider';

const DEMO_ACCOUNTS = [
  { username: 'demo', password: '123456', desc: '演示主管（全角色）' },
  { username: 'zhang.qi', password: '123456', desc: '坐席' },
  { username: 'chen.min', password: '123456', desc: '运营' },
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const staff = await login(username, password);
      const target = from ?? (
        staff.primary_staff_role === 'operations' ? '/staff/operations' : '/staff/workbench'
      );
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  }

  function quickLogin(u: string, p: string) {
    setUsername(u);
    setPassword(p);
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/30">
      <Card className="w-[380px]">
        <CardHeader className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2 text-primary mb-2">
            <Headset size={24} />
            <span className="text-lg font-semibold">客服工作台</span>
          </div>
          <CardTitle className="text-base font-medium">员工登录</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">账号</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={loading || !username || !password}>
              {loading ? '登录中...' : '登录'}
            </Button>
          </form>
          {/* DEV: 演示账号快捷入口 */}
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">演示账号</p>
            <div className="space-y-1">
              {DEMO_ACCOUNTS.map(({ username: u, password: p, desc }) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => quickLogin(u, p)}
                  className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                >
                  <span className="font-mono">{u}</span>
                  <span className="ml-2 text-muted-foreground/60">{desc}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
