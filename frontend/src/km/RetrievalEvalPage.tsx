/**
 * RetrievalEvalPage.tsx — Retrieval evaluation: test search + manage eval cases
 */
import { memo, useState, useCallback } from 'react';
import { Search, Save, ChevronDown, ChevronRight, CheckCircle2, XCircle, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type KMPage } from './KnowledgeManagementPage';

const BASE = '/api/km';

interface SearchResult {
  asset_id: string;
  title: string;
  score: number;
  confidence: number;
  snippet: string;
}

interface EvalCase {
  id: string;
  input_text: string;
  input_kind: string;
  expected_asset_ids: string[];
  actual_asset_ids: string[];
  actual_answer: string;
  citation_ok: number | null;
  answer_ok: number | null;
  reviewer: string;
  created_at: string;
}

export const RetrievalEvalPage = memo(function RetrievalEvalPage({ navigate }: { navigate: (p: KMPage) => void }) {
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(5);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [cases, setCases] = useState<EvalCase[]>([]);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`${BASE}/retrieval-eval/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), top_k: topK }),
      });
      const data = await res.json();
      setResults(data.results ?? []);
    } catch { setResults([]); }
    setSearching(false);
  }, [query, topK]);

  const handleSaveCase = useCallback(async () => {
    if (!query.trim() || results.length === 0) return;
    try {
      await fetch(`${BASE}/retrieval-eval/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input_text: query.trim(),
          input_kind: 'user_message',
          actual_asset_ids: results.map(r => r.asset_id),
        }),
      });
      loadCases();
    } catch { /* ignore */ }
  }, [query, results]);

  const loadCases = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/retrieval-eval/cases`);
      const data = await res.json();
      setCases(data.items ?? []);
    } catch { /* ignore */ }
  }, []);

  // Load cases on mount
  useState(() => { loadCases(); });

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Search test area */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Search size={14} />
            检索测试
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="输入客户问题或坐席提问..."
              className="flex-1"
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            <Select value={String(topK)} onValueChange={v => setTopK(Number(v))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Top 3</SelectItem>
                <SelectItem value="5">Top 5</SelectItem>
                <SelectItem value="10">Top 10</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleSearch} disabled={searching || !query.trim()} size="sm">
              <Search size={13} className="mr-1.5" />
              {searching ? '检索中...' : '检索'}
            </Button>
          </div>

          {results.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">命中 {results.length} 条</span>
                <Button variant="outline" size="sm" onClick={handleSaveCase}>
                  <Save size={12} className="mr-1.5" />
                  保存为评测样例
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>标题</TableHead>
                    <TableHead className="w-20">分数</TableHead>
                    <TableHead className="w-20">置信度</TableHead>
                    <TableHead>命中片段</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={r.asset_id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium text-xs">{r.title}</TableCell>
                      <TableCell><Badge variant="secondary">{r.score.toFixed(1)}</Badge></TableCell>
                      <TableCell><Badge variant={r.confidence > 0.6 ? 'default' : 'secondary'}>{(r.confidence * 100).toFixed(0)}%</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{r.snippet}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Eval cases list */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">评测样例</CardTitle>
            <Button variant="ghost" size="sm" onClick={loadCases} className="text-xs">
              刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {cases.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">暂无评测样例，使用上方检索测试后保存</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>输入问题</TableHead>
                  <TableHead className="w-24">类型</TableHead>
                  <TableHead className="w-20">引用</TableHead>
                  <TableHead className="w-20">答案</TableHead>
                  <TableHead className="w-24">评测人</TableHead>
                  <TableHead className="w-32">时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map(c => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setExpandedCase(expandedCase === c.id ? null : c.id)}>
                    <TableCell>
                      {expandedCase === c.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{c.input_text}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{c.input_kind === 'user_message' ? '客户消息' : '坐席提问'}</Badge></TableCell>
                    <TableCell>{c.citation_ok === 1 ? <CheckCircle2 size={14} className="text-green-600" /> : c.citation_ok === 0 ? <XCircle size={14} className="text-red-500" /> : <Minus size={14} className="text-muted-foreground" />}</TableCell>
                    <TableCell>{c.answer_ok === 1 ? <CheckCircle2 size={14} className="text-green-600" /> : c.answer_ok === 0 ? <XCircle size={14} className="text-red-500" /> : <Minus size={14} className="text-muted-foreground" />}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.reviewer ?? '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.created_at?.slice(0, 10)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
});
