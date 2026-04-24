'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocale } from '@/lib/locale-context';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import {
  Shield, FileText, Plus, Edit, Trash2, Eye,
  Bold, Italic, Underline, List, ListOrdered,
  Link as LinkIcon, Image, Quote, Minus,
  Heading1, Heading2, Heading3, Code, AlignLeft,
  AlignCenter, AlignRight, Undo, Redo,
  CreditCard, CheckCircle, Eye as EyeIcon, EyeOff,
  Cpu, RefreshCw, Users, MessageSquare,
} from 'lucide-react';
import { isSupabaseConfigured } from '@/storage/database/supabase-client';
import { toast } from 'sonner';

interface BlogPost {
  id: string;
  title: string;
  category: string;
  content: string;
  cover_image: string | null;
  is_published: boolean;
  created_at: string;
}

const categories = [
  'Product Updates',
  'Tips & Tricks',
  'AI Technology',
  'Video Editing',
  'News',
];

// Demo posts storage
const DEMO_POSTS_KEY = 'vidshorter_demo_posts';

function getDemoPosts(): BlogPost[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(DEMO_POSTS_KEY);
  return stored ? JSON.parse(stored) : [];
}

function saveDemoPosts(posts: BlogPost[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEMO_POSTS_KEY, JSON.stringify(posts));
}

/* ───────────────────────────────────────────────
   Payment Config Storage
─────────────────────────────────────────────── */
const PAYMENT_CONFIG_KEY = 'vidshorter_payment_config';

interface PaymentConfig {
  wechat: {
    appId: string;
    mchId: string;
    apiKey: string;
    serialNo: string;
    privateKey: string;
    notifyUrl: string;
    enabled: boolean;
  };
  alipay: {
    appId: string;
    privateKey: string;
    publicKey: string;
    notifyUrl: string;
    sandbox: boolean;
    enabled: boolean;
  };
  creem: {
    apiKey: string;
    webhookSecret: string;
    enabled: boolean;
  };
}

const defaultPaymentConfig: PaymentConfig = {
  wechat: { appId: '', mchId: '', apiKey: '', serialNo: '', privateKey: '', notifyUrl: '', enabled: false },
  alipay: { appId: '', privateKey: '', publicKey: '', notifyUrl: '', sandbox: true, enabled: false },
  creem: { apiKey: '', webhookSecret: '', enabled: false },
};

function getPaymentConfig(): PaymentConfig {
  if (typeof window === 'undefined') return defaultPaymentConfig;
  const stored = localStorage.getItem(PAYMENT_CONFIG_KEY);
  if (!stored) return defaultPaymentConfig;
  try {
    return { ...defaultPaymentConfig, ...JSON.parse(stored) };
  } catch {
    return defaultPaymentConfig;
  }
}

function savePaymentConfig(config: PaymentConfig) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PAYMENT_CONFIG_KEY, JSON.stringify(config));
}

// Export for use in payment modal
export { getPaymentConfig, type PaymentConfig };

/* ───────────────────────────────────────────────
   AI Compute Config Storage
─────────────────────────────────────────────── */
const AI_CONFIG_KEY = 'vidshorter_ai_config';

export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  modelBaseUrl: string;
  model: string;
  enabled: boolean;
}

export const defaultAiConfig: AiConfig = {
  apiKey: '',
  baseUrl: 'https://api.coze.com',
  modelBaseUrl: 'https://model.coze.com',
  model: 'doubao-seed-1-8-251228',
  enabled: false,
};

export function getAiConfig(): AiConfig {
  if (typeof window === 'undefined') return defaultAiConfig;
  const stored = localStorage.getItem(AI_CONFIG_KEY);
  if (!stored) return defaultAiConfig;
  try {
    return { ...defaultAiConfig, ...JSON.parse(stored) };
  } catch {
    return defaultAiConfig;
  }
}

function saveAiConfig(config: AiConfig) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
}

/* ───────────────────────────────────────────────
   Rich Text Editor Component
─────────────────────────────────────────────── */
interface RichEditorProps {
  value: string;
  onChange: (html: string) => void;
}

function RichEditor({ value, onChange }: RichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);

  // Sync external value → editor (only when value changes externally)
  useEffect(() => {
    const el = editorRef.current;
    if (!el || isInternalChange.current) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value;
    }
  }, [value]);

  const exec = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    isInternalChange.current = true;
    onChange(editorRef.current?.innerHTML || '');
    isInternalChange.current = false;
  }, [onChange]);

  const handleInput = useCallback(() => {
    isInternalChange.current = true;
    onChange(editorRef.current?.innerHTML || '');
    isInternalChange.current = false;
  }, [onChange]);

  const insertLink = () => {
    const url = prompt('Enter URL:');
    if (url) exec('createLink', url);
  };

  const insertImage = () => {
    const url = prompt('Enter image URL:');
    if (url) exec('insertImage', url);
  };

  const isActive = (command: string) => {
    try { return document.queryCommandState(command); } catch { return false; }
  };

  const toolbarGroups = [
    {
      items: [
        { icon: Undo, title: 'Undo', action: () => exec('undo') },
        { icon: Redo, title: 'Redo', action: () => exec('redo') },
      ],
    },
    {
      items: [
        { icon: Heading1, title: 'Heading 1', action: () => exec('formatBlock', '<h1>') },
        { icon: Heading2, title: 'Heading 2', action: () => exec('formatBlock', '<h2>') },
        { icon: Heading3, title: 'Heading 3', action: () => exec('formatBlock', '<h3>') },
      ],
    },
    {
      items: [
        { icon: Bold, title: 'Bold', cmd: 'bold', action: () => exec('bold') },
        { icon: Italic, title: 'Italic', cmd: 'italic', action: () => exec('italic') },
        { icon: Underline, title: 'Underline', cmd: 'underline', action: () => exec('underline') },
        { icon: Code, title: 'Code', action: () => exec('formatBlock', '<pre>') },
      ],
    },
    {
      items: [
        { icon: AlignLeft, title: 'Align Left', action: () => exec('justifyLeft') },
        { icon: AlignCenter, title: 'Align Center', action: () => exec('justifyCenter') },
        { icon: AlignRight, title: 'Align Right', action: () => exec('justifyRight') },
      ],
    },
    {
      items: [
        { icon: List, title: 'Bullet List', action: () => exec('insertUnorderedList') },
        { icon: ListOrdered, title: 'Ordered List', action: () => exec('insertOrderedList') },
        { icon: Quote, title: 'Blockquote', action: () => exec('formatBlock', '<blockquote>') },
        { icon: Minus, title: 'Divider', action: () => exec('insertHorizontalRule') },
      ],
    },
    {
      items: [
        { icon: LinkIcon, title: 'Insert Link', action: insertLink },
        { icon: Image, title: 'Insert Image', action: insertImage },
      ],
    },
  ];

  return (
    <div className="border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-2 border-b bg-muted/40">
        {toolbarGroups.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5">
            {gi > 0 && <div className="w-px h-5 bg-border mx-1" />}
            {group.items.map(({ icon: Icon, title, cmd, action }) => (
              <button
                key={title}
                type="button"
                title={title}
                onMouseDown={(e) => { e.preventDefault(); action(); }}
                className={`p-1.5 rounded hover:bg-muted transition-colors ${
                  cmd && isActive(cmd)
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        ))}
        {/* Font size select */}
        <div className="w-px h-5 bg-border mx-1" />
        <select
          title="Font size"
          className="text-xs px-1.5 py-1 rounded border border-input bg-background text-muted-foreground hover:text-foreground cursor-pointer"
          onChange={(e) => exec('fontSize', e.target.value)}
          defaultValue=""
        >
          <option value="" disabled>Size</option>
          <option value="1">XS</option>
          <option value="2">S</option>
          <option value="3">M</option>
          <option value="4">L</option>
          <option value="5">XL</option>
          <option value="6">2XL</option>
          <option value="7">3XL</option>
        </select>
        {/* Paragraph format */}
        <select
          title="Paragraph style"
          className="text-xs px-1.5 py-1 rounded border border-input bg-background text-muted-foreground hover:text-foreground cursor-pointer"
          onChange={(e) => { if (e.target.value) exec('formatBlock', e.target.value); }}
          defaultValue=""
        >
          <option value="" disabled>Style</option>
          <option value="<p>">Paragraph</option>
          <option value="<h1>">Heading 1</option>
          <option value="<h2>">Heading 2</option>
          <option value="<h3>">Heading 3</option>
          <option value="<h4>">Heading 4</option>
          <option value="<pre>">Code Block</option>
          <option value="<blockquote>">Quote</option>
        </select>
      </div>

      {/* Editor Area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        className="min-h-[400px] p-4 text-sm focus:outline-none prose prose-sm dark:prose-invert max-w-none
          [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-4
          [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mb-2 [&_h2]:mt-3
          [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3
          [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2
          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2
          [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground
          [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded [&_pre]:font-mono [&_pre]:text-xs
          [&_a]:text-primary [&_a]:underline
          [&_img]:max-w-full [&_img]:rounded [&_img]:my-2
          [&_hr]:border-border [&_hr]:my-4"
        style={{ lineHeight: '1.6' }}
        data-placeholder="Write your blog content here... Use the toolbar above for formatting."
      />

      {/* HTML source toggle */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t bg-muted/20 text-xs text-muted-foreground">
        <span>Rich Text Editor · HTML output</span>
        <span>{editorRef.current?.innerHTML?.length || value.length} chars</span>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────
   Admin Page
─────────────────────────────────────────────── */
export default function AdminPage() {
  const { t } = useLocale();
  const { user, accessToken, loading: authLoading } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('posts');
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>(defaultPaymentConfig);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [aiConfig, setAiConfig] = useState<AiConfig>(defaultAiConfig);
  const [testingAi, setTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<string>('');
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminFeedbacks, setAdminFeedbacks] = useState<any[]>([]);
  const [adminFeedbacksLoading, setAdminFeedbacksLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState('');
  const [adminFeedbacksError, setAdminFeedbacksError] = useState('');

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'admin')) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchPosts();
      setPaymentConfig(getPaymentConfig());
      setAiConfig(getAiConfig());
    }
  }, [user]);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    if (!accessToken) return;
    if (activeTab === 'users') fetchAdminUsers();
    if (activeTab === 'feedback') fetchAdminFeedbacks();
  }, [activeTab, user?.role, accessToken]);

  async function fetchPosts() {
    if (!isSupabaseConfigured() || user?.id?.startsWith('demo-')) {
      setPosts(getDemoPosts());
      setLoading(false);
      return;
    }

    if (!user?.id) {
      setPosts(getDemoPosts());
      setLoading(false);
      return;
    }

    try {
      const { getSupabaseClient } = await import('@/storage/database/supabase-client');
      if (!accessToken) throw new Error('Missing access token');
      const client = getSupabaseClient(accessToken);
      const { data, error } = await client
        .from('blogs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.warn('Posts fetch error, using demo mode');
      setPosts(getDemoPosts());
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setTitle('');
    setCategory('');
    setContent('');
    setCoverImage('');
    setEditingPost(null);
  }

  function editPost(post: BlogPost) {
    setEditingPost(post);
    setTitle(post.title);
    setCategory(post.category);
    setContent(post.content);
    setCoverImage(post.cover_image || '');
    setActiveTab('create');
  }

  async function handleSave(publish: boolean) {
    if (!title || !category || !content) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      if (!isSupabaseConfigured() || user?.id?.startsWith('demo-')) {
        const currentPosts = getDemoPosts();

        if (editingPost) {
          const updatedPosts = currentPosts.map(p =>
            p.id === editingPost.id
              ? { ...p, title, category, content, cover_image: coverImage || null, is_published: publish }
              : p
          );
          saveDemoPosts(updatedPosts);
          setPosts(updatedPosts);
          toast.success('Post updated successfully');
        } else {
          const newPost: BlogPost = {
            id: `demo-post-${Date.now()}`,
            title,
            category,
            content,
            cover_image: coverImage || null,
            is_published: publish,
            created_at: new Date().toISOString(),
          };
          saveDemoPosts([newPost, ...currentPosts]);
          setPosts([newPost, ...posts]);
          toast.success('Post created successfully');
        }

        resetForm();
        setActiveTab('posts');
        setSaving(false);
        return;
      }

      if (!user?.id) {
        toast.error('User not authenticated');
        setSaving(false);
        return;
      }

      const { getSupabaseClient } = await import('@/storage/database/supabase-client');
      if (!accessToken) throw new Error('Missing access token');
      const client = getSupabaseClient(accessToken);

      if (editingPost) {
        const { error } = await client
          .from('blogs')
          .update({
            title,
            category,
            content,
            cover_image: coverImage || null,
            is_published: publish,
          })
          .eq('id', editingPost.id);

        if (error) throw error;
        toast.success('Post updated successfully');
      } else {
        const { error } = await client
          .from('blogs')
          .insert({
            title,
            category,
            content,
            cover_image: coverImage || null,
            is_published: publish,
            author_id: user.id,
          });

        if (error) throw error;
        toast.success('Post created successfully');
      }

      resetForm();
      setActiveTab('posts');
      fetchPosts();
    } catch (error) {
      console.warn('Post save error, saving locally');
      const currentPosts = getDemoPosts();

      if (editingPost) {
        const updatedPosts = currentPosts.map(p =>
          p.id === editingPost.id
            ? { ...p, title, category, content, cover_image: coverImage || null, is_published: publish }
            : p
        );
        saveDemoPosts(updatedPosts);
        setPosts(updatedPosts);
        toast.success('Post updated locally');
      } else {
        const newPost: BlogPost = {
          id: `demo-post-${Date.now()}`,
          title,
          category,
          content,
          cover_image: coverImage || null,
          is_published: publish,
          created_at: new Date().toISOString(),
        };
        saveDemoPosts([newPost, ...currentPosts]);
        setPosts([newPost, ...posts]);
        toast.success('Post created locally');
      }
      resetForm();
      setActiveTab('posts');
    } finally {
      setSaving(false);
    }
  }

  async function deletePost(postId: string) {
    if (!confirm('Are you sure you want to delete this post?')) return;

    try {
      if (!isSupabaseConfigured() || user?.id?.startsWith('demo-')) {
        const updatedPosts = posts.filter(p => p.id !== postId);
        saveDemoPosts(updatedPosts);
        setPosts(updatedPosts);
        toast.success('Post deleted');
        return;
      }

      if (!user?.id) {
        toast.error('User not authenticated');
        return;
      }

      const { getSupabaseClient } = await import('@/storage/database/supabase-client');
      if (!accessToken) throw new Error('Missing access token');
      const client = getSupabaseClient(accessToken);
      const { error } = await client
        .from('blogs')
        .delete()
        .eq('id', postId);

      if (error) throw error;
      toast.success('Post deleted');
      fetchPosts();
    } catch (error) {
      console.warn('Post delete error, deleting locally');
      const updatedPosts = posts.filter(p => p.id !== postId);
      saveDemoPosts(updatedPosts);
      setPosts(updatedPosts);
      toast.success('Post deleted locally');
    }
  }

  /* ── Payment Config Helpers ── */
  function updateWechat(field: keyof PaymentConfig['wechat'], value: string | boolean) {
    setPaymentConfig(prev => ({ ...prev, wechat: { ...prev.wechat, [field]: value } }));
  }
  function updateAlipay(field: keyof PaymentConfig['alipay'], value: string | boolean) {
    setPaymentConfig(prev => ({ ...prev, alipay: { ...prev.alipay, [field]: value } }));
  }
  function updateCreem(field: keyof PaymentConfig['creem'], value: string | boolean) {
    setPaymentConfig(prev => ({ ...prev, creem: { ...prev.creem, [field]: value } }));
  }
  function handleSavePayment() {
    savePaymentConfig(paymentConfig);
    toast.success('支付配置已保存');
  }
  function toggleSecret(key: string) {
    setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
  }

  /* ── AI Config Helpers ── */
  function updateAiConfig(field: keyof AiConfig, value: string | boolean) {
    setAiConfig(prev => ({ ...prev, [field]: value }));
  }
  function handleSaveAi() {
    saveAiConfig(aiConfig);
    toast.success('AI 算力配置已保存');
    setAiTestResult('');
  }

  async function fetchAdminUsers() {
    if (!accessToken) return;
    setAdminUsersLoading(true);
    setAdminUsersError('');
    try {
      const res = await fetch('/api/admin/users?limit=200', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load users');
      setAdminUsers(Array.isArray(data.users) ? data.users : []);
    } catch (e) {
      setAdminUsersError(e instanceof Error ? e.message : 'Failed to load users');
      setAdminUsers([]);
    } finally {
      setAdminUsersLoading(false);
    }
  }

  async function fetchAdminFeedbacks() {
    if (!accessToken) return;
    setAdminFeedbacksLoading(true);
    setAdminFeedbacksError('');
    try {
      const res = await fetch('/api/feedback?limit=200', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load feedbacks');
      setAdminFeedbacks(Array.isArray(data.feedbacks) ? data.feedbacks : []);
    } catch (e) {
      setAdminFeedbacksError(e instanceof Error ? e.message : 'Failed to load feedbacks');
      setAdminFeedbacks([]);
    } finally {
      setAdminFeedbacksLoading(false);
    }
  }
  async function handleTestAi() {
    setTestingAi(true);
    setAiTestResult('');
    try {
      const res = await fetch('/api/ai-config-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: aiConfig.apiKey,
          baseUrl: aiConfig.baseUrl,
          modelBaseUrl: aiConfig.modelBaseUrl,
          model: aiConfig.model,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAiTestResult('✅ 连接成功！API Key 有效，算力配置正常。');
      } else {
        setAiTestResult(`❌ 连接失败：${data.error || '未知错误'}`);
      }
    } catch (e) {
      setAiTestResult(`❌ 网络错误：请检查 API Key 和网络连接`);
    } finally {
      setTestingAi(false);
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (authLoading || !user) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (user.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">{t('admin.title')}</h1>
          </div>
          <p className="text-muted-foreground">Manage your blog content and site settings</p>
          {!isSupabaseConfigured() && (
            <p className="text-sm text-amber-500 mt-2">
              Running in demo mode. Posts are stored locally and visible to all users.
            </p>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="posts" className="gap-2">
              <FileText className="h-4 w-4" />
              {t('admin.blog')}
              {posts.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 text-xs">{posts.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="create" className="gap-2">
              <Plus className="h-4 w-4" />
              {editingPost ? 'Edit Post' : t('admin.blog.create')}
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              用户管理
            </TabsTrigger>
            <TabsTrigger value="feedback" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              用户反馈
            </TabsTrigger>
            <TabsTrigger value="payment" className="gap-2">
              <CreditCard className="h-4 w-4" />
              支付管理
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-2">
              <Cpu className="h-4 w-4" />
              AI 算力
              {aiConfig.enabled && <CheckCircle className="h-3 w-3 text-green-500" />}
            </TabsTrigger>
          </TabsList>

          {/* ── Post List ── */}
          <TabsContent value="posts">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Blog Posts</CardTitle>
                  <CardDescription>Manage all your blog posts</CardDescription>
                </div>
                <Button size="sm" onClick={() => { resetForm(); setActiveTab('create'); }}>
                  <Plus className="h-4 w-4 mr-1" />New Post
                </Button>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-muted-foreground">{t('common.loading')}</p>
                ) : posts.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">No posts yet</p>
                    <Button onClick={() => { resetForm(); setActiveTab('create'); }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create First Post
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {posts.map((post) => (
                      <div
                        key={post.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          {post.cover_image ? (
                            <img
                              src={post.cover_image}
                              alt={post.title}
                              className="h-12 w-20 object-cover rounded flex-shrink-0"
                            />
                          ) : (
                            <div className="h-12 w-20 bg-muted rounded flex items-center justify-center flex-shrink-0">
                              <FileText className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium truncate">{post.title}</p>
                              <Badge variant={post.is_published ? 'default' : 'secondary'} className="flex-shrink-0 text-xs">
                                {post.is_published ? t('admin.blog.published') : t('admin.blog.draft')}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-xs">{post.category}</Badge>
                              <span>{formatDate(post.created_at)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0 ml-4">
                          <Button size="sm" variant="outline" onClick={() => editPost(post)} title="Edit">
                            <Edit className="h-4 w-4" />
                          </Button>
                          {post.is_published && (
                            <Button size="sm" variant="outline" asChild title="Preview">
                              <a href={`/blog/${post.id}`} target="_blank" rel="noopener noreferrer">
                                <Eye className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          <Button size="sm" variant="destructive" onClick={() => deletePost(post.id)} title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Create / Edit Post ── */}
          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle>{editingPost ? 'Edit Post' : t('admin.blog.create')}</CardTitle>
                <CardDescription>
                  {editingPost ? 'Update your blog post content' : 'Create a new blog post with the rich text editor'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">{t('admin.blog.title')} <span className="text-destructive">*</span></Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Enter post title..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">{t('admin.blog.category')} <span className="text-destructive">*</span></Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="coverImage">Cover Image URL</Label>
                  <Input
                    id="coverImage"
                    value={coverImage}
                    onChange={(e) => setCoverImage(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                  />
                  {coverImage && (
                    <img src={coverImage} alt="Cover preview" className="h-24 w-auto rounded object-cover border" />
                  )}
                </div>

                <div className="space-y-2">
                  <Label>{t('admin.blog.content')} <span className="text-destructive">*</span></Label>
                  <RichEditor value={content} onChange={setContent} />
                </div>

                <div className="flex gap-3 flex-wrap">
                  <Button onClick={() => handleSave(true)} disabled={saving} className="gap-2">
                    {saving ? t('common.loading') : `📢 ${t('admin.blog.publish')}`}
                  </Button>
                  <Button variant="outline" onClick={() => handleSave(false)} disabled={saving} className="gap-2">
                    {saving ? t('common.loading') : `💾 ${t('admin.blog.save')}`}
                  </Button>
                  {editingPost && (
                    <Button variant="ghost" onClick={() => { resetForm(); setActiveTab('posts'); }}>
                      {t('common.cancel')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>用户管理</CardTitle>
                <CardDescription>查看注册用户列表与订阅情况</CardDescription>
              </CardHeader>
              <CardContent>
                {adminUsersLoading ? (
                  <p className="text-muted-foreground">{t('common.loading')}</p>
                ) : adminUsersError ? (
                  <p className="text-sm text-destructive">{adminUsersError}</p>
                ) : adminUsers.length === 0 ? (
                  <p className="text-muted-foreground">暂无用户</p>
                ) : (
                  <div className="overflow-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                          <th className="text-left p-3">邮箱</th>
                          <th className="text-left p-3">地点</th>
                          <th className="text-left p-3">订阅</th>
                          <th className="text-left p-3">积分</th>
                          <th className="text-left p-3">角色</th>
                          <th className="text-left p-3">注册时间</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminUsers.map((u) => {
                          const sub = Array.isArray(u.subscriptions) ? u.subscriptions[0] : u.subscriptions;
                          const credits = Array.isArray(u.credits) ? u.credits[0] : u.credits;
                          const loc = [u.country, u.region, u.city].filter(Boolean).join(' / ');
                          return (
                            <tr key={u.id} className="border-t">
                              <td className="p-3">{u.email}</td>
                              <td className="p-3">{loc || '-'}</td>
                              <td className="p-3">{sub?.plan_type || 'free'} · {sub?.status || 'active'}</td>
                              <td className="p-3">{typeof credits?.balance === 'number' ? credits.balance : '-'}</td>
                              <td className="p-3">{u.role}</td>
                              <td className="p-3">{u.created_at ? formatDate(u.created_at) : '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="feedback">
            <Card>
              <CardHeader>
                <CardTitle>用户反馈汇总</CardTitle>
                <CardDescription>查看用户提交的反馈内容</CardDescription>
              </CardHeader>
              <CardContent>
                {adminFeedbacksLoading ? (
                  <p className="text-muted-foreground">{t('common.loading')}</p>
                ) : adminFeedbacksError ? (
                  <p className="text-sm text-destructive">{adminFeedbacksError}</p>
                ) : adminFeedbacks.length === 0 ? (
                  <p className="text-muted-foreground">暂无反馈</p>
                ) : (
                  <div className="space-y-3">
                    {adminFeedbacks.map((fb) => (
                      <div key={fb.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium truncate">
                            {fb.users?.email || fb.user_id}
                          </div>
                          <div className="text-xs text-muted-foreground flex-shrink-0">
                            {fb.created_at ? formatDate(fb.created_at) : ''}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                          {fb.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Payment Settings ── */}
          <TabsContent value="payment">
            <div className="space-y-6">
              {/* WeChat Pay */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded bg-[#07C160] flex items-center justify-center">
                        <span className="text-white text-xs font-bold">WX</span>
                      </div>
                      <div>
                        <CardTitle className="text-lg">微信支付</CardTitle>
                        <CardDescription>微信支付 Native API v3 配置</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {paymentConfig.wechat.enabled && (
                        <Badge className="bg-green-500 text-white gap-1">
                          <CheckCircle className="h-3 w-3" />已启用
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant={paymentConfig.wechat.enabled ? 'outline' : 'default'}
                        onClick={() => updateWechat('enabled', !paymentConfig.wechat.enabled)}
                      >
                        {paymentConfig.wechat.enabled ? '禁用' : '启用'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>AppID <span className="text-muted-foreground text-xs">(公众号/小程序/APP)</span></Label>
                      <Input
                        value={paymentConfig.wechat.appId}
                        onChange={e => updateWechat('appId', e.target.value)}
                        placeholder="wx1234567890abcdef"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>商户号 MchID</Label>
                      <Input
                        value={paymentConfig.wechat.mchId}
                        onChange={e => updateWechat('mchId', e.target.value)}
                        placeholder="1234567890"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>API 密钥 <span className="text-muted-foreground text-xs">(v3 密钥)</span></Label>
                      <div className="relative">
                        <Input
                          type={showSecrets['wx_apikey'] ? 'text' : 'password'}
                          value={paymentConfig.wechat.apiKey}
                          onChange={e => updateWechat('apiKey', e.target.value)}
                          placeholder="32位 API 密钥"
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => toggleSecret('wx_apikey')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showSecrets['wx_apikey'] ? <EyeOff className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>证书序列号 <span className="text-muted-foreground text-xs">(Serial No)</span></Label>
                      <Input
                        value={paymentConfig.wechat.serialNo}
                        onChange={e => updateWechat('serialNo', e.target.value)}
                        placeholder="7777B8E8..."
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>商户私钥 <span className="text-muted-foreground text-xs">(RSA 私钥 / PEM)</span></Label>
                      <div className="relative">
                        <Textarea
                          value={paymentConfig.wechat.privateKey}
                          onChange={e => updateWechat('privateKey', e.target.value)}
                          placeholder="-----BEGIN PRIVATE KEY-----"
                          className="min-h-[140px] pr-10 font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => toggleSecret('wx_private')}
                          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                        >
                          {showSecrets['wx_private'] ? <EyeOff className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>异步通知地址 <span className="text-muted-foreground text-xs">(Notify URL)</span></Label>
                      <Input
                        value={paymentConfig.wechat.notifyUrl}
                        onChange={e => updateWechat('notifyUrl', e.target.value)}
                        placeholder="https://yourdomain.com/api/payment/wechat/notify"
                      />
                    </div>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-blue-700 dark:text-blue-400">
                    💡 在微信支付商户平台 (pay.weixin.qq.com) 获取以上信息。Native 支付需要服务器有公网访问地址。
                  </div>
                </CardContent>
              </Card>

              {/* Alipay */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded bg-[#1677FF] flex items-center justify-center">
                        <span className="text-white text-xs font-bold">ALI</span>
                      </div>
                      <div>
                        <CardTitle className="text-lg">支付宝</CardTitle>
                        <CardDescription>支付宝开放平台 PC 网页支付配置</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {paymentConfig.alipay.enabled && (
                        <Badge className="bg-green-500 text-white gap-1">
                          <CheckCircle className="h-3 w-3" />已启用
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant={paymentConfig.alipay.enabled ? 'outline' : 'default'}
                        onClick={() => updateAlipay('enabled', !paymentConfig.alipay.enabled)}
                      >
                        {paymentConfig.alipay.enabled ? '禁用' : '启用'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Label className="text-sm">沙箱模式</Label>
                    <button
                      type="button"
                      onClick={() => updateAlipay('sandbox', !paymentConfig.alipay.sandbox)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${paymentConfig.alipay.sandbox ? 'bg-amber-400' : 'bg-primary'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${paymentConfig.alipay.sandbox ? 'translate-x-1' : 'translate-x-4'}`} />
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {paymentConfig.alipay.sandbox ? '🧪 沙箱测试模式' : '🚀 生产环境'}
                    </span>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>AppID</Label>
                      <Input
                        value={paymentConfig.alipay.appId}
                        onChange={e => updateAlipay('appId', e.target.value)}
                        placeholder="2021000000000000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>异步通知地址</Label>
                      <Input
                        value={paymentConfig.alipay.notifyUrl}
                        onChange={e => updateAlipay('notifyUrl', e.target.value)}
                        placeholder="https://yourdomain.com/api/payment/alipay/notify"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>应用私钥 <span className="text-muted-foreground text-xs">(RSA2)</span></Label>
                      <div className="relative">
                        <Input
                          type={showSecrets['ali_privkey'] ? 'text' : 'password'}
                          value={paymentConfig.alipay.privateKey}
                          onChange={e => updateAlipay('privateKey', e.target.value)}
                          placeholder="MIIEow...（应用私钥）"
                          className="pr-10 font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => toggleSecret('ali_privkey')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showSecrets['ali_privkey'] ? <EyeOff className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>支付宝公钥 <span className="text-muted-foreground text-xs">(用于验签)</span></Label>
                      <div className="relative">
                        <Input
                          type={showSecrets['ali_pubkey'] ? 'text' : 'password'}
                          value={paymentConfig.alipay.publicKey}
                          onChange={e => updateAlipay('publicKey', e.target.value)}
                          placeholder="MIIBIjAN...（支付宝公钥）"
                          className="pr-10 font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => toggleSecret('ali_pubkey')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showSecrets['ali_pubkey'] ? <EyeOff className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-blue-700 dark:text-blue-400">
                    💡 在支付宝开放平台 (open.alipay.com) 创建应用后获取以上信息。使用 RSA2 密钥格式。
                  </div>
                </CardContent>
              </Card>

              {/* Creem */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
                        <span className="text-white text-xs font-bold">CR</span>
                      </div>
                      <div>
                        <CardTitle className="text-lg">Creem 海外支付</CardTitle>
                        <CardDescription>Visa / Mastercard / Apple Pay / Google Pay</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {paymentConfig.creem.enabled && (
                        <Badge className="bg-green-500 text-white gap-1">
                          <CheckCircle className="h-3 w-3" />已启用
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant={paymentConfig.creem.enabled ? 'outline' : 'default'}
                        onClick={() => updateCreem('enabled', !paymentConfig.creem.enabled)}
                      >
                        {paymentConfig.creem.enabled ? '禁用' : '启用'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>API Key</Label>
                      <div className="relative">
                        <Input
                          type={showSecrets['creem_key'] ? 'text' : 'password'}
                          value={paymentConfig.creem.apiKey}
                          onChange={e => updateCreem('apiKey', e.target.value)}
                          placeholder="creem_sk_..."
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => toggleSecret('creem_key')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showSecrets['creem_key'] ? <EyeOff className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Webhook Secret</Label>
                      <div className="relative">
                        <Input
                          type={showSecrets['creem_webhook'] ? 'text' : 'password'}
                          value={paymentConfig.creem.webhookSecret}
                          onChange={e => updateCreem('webhookSecret', e.target.value)}
                          placeholder="whsec_..."
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => toggleSecret('creem_webhook')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showSecrets['creem_webhook'] ? <EyeOff className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-violet-50 dark:bg-violet-900/20 rounded-lg text-xs text-violet-700 dark:text-violet-400">
                    💡 在 <a href="https://www.creem.io" target="_blank" rel="noreferrer" className="underline font-medium">creem.io</a> 控制台获取 API Key。Webhook URL：<code className="bg-white/60 px-1 rounded">https://yourdomain.com/api/payment/creem/webhook</code>
                  </div>
                </CardContent>
              </Card>

              <Button onClick={handleSavePayment} className="w-full sm:w-auto px-8">
                <CheckCircle className="h-4 w-4 mr-2" />
                保存支付配置
              </Button>
            </div>
          </TabsContent>

          {/* ── AI 算力配置 ── */}
          <TabsContent value="ai">
            <div className="space-y-6">
              {/* 平台说明 */}
              <Card className="border-violet-200 dark:border-violet-800">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                      <Cpu className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">AI 算力平台 · Coze (扣子)</CardTitle>
                      <CardDescription>字节跳动旗下 AI 开放平台，底层使用豆包（Doubao）大模型</CardDescription>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      {aiConfig.enabled && (
                        <Badge className="bg-green-500 text-white gap-1">
                          <CheckCircle className="h-3 w-3" />已启用
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant={aiConfig.enabled ? 'outline' : 'default'}
                        onClick={() => updateAiConfig('enabled', !aiConfig.enabled)}
                      >
                        {aiConfig.enabled ? '禁用自定义配置' : '启用自定义配置'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div className="p-3 bg-violet-50 dark:bg-violet-900/20 rounded-lg">
                      <p className="font-medium text-violet-700 dark:text-violet-300">🤖 LLM 分析</p>
                      <p className="text-muted-foreground text-xs mt-1">豆包模型解析视频内容，识别高光时刻</p>
                    </div>
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <p className="font-medium text-blue-700 dark:text-blue-300">🎬 帧提取</p>
                      <p className="text-muted-foreground text-xs mt-1">从视频中提取关键帧用于内容分析</p>
                    </div>
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <p className="font-medium text-green-700 dark:text-green-300">✂️ 视频剪辑</p>
                      <p className="text-muted-foreground text-xs mt-1">按时间戳自动切割高光片段</p>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs text-amber-700 dark:text-amber-400">
                    💡 <strong>充值入口：</strong>
                    国内访问 <a href="https://www.coze.cn" target="_blank" rel="noreferrer" className="underline font-medium">www.coze.cn</a>（扣子）→ 工作台 → 计费中心；
                    海外访问 <a href="https://www.coze.com" target="_blank" rel="noreferrer" className="underline font-medium">www.coze.com</a>。
                    获取 API Key 后填入下方。
                  </div>
                </CardContent>
              </Card>

              {/* API 配置 */}
              <Card>
                <CardHeader>
                  <CardTitle>API Key 配置</CardTitle>
                  <CardDescription>
                    配置后将覆盖服务器环境变量 <code className="bg-muted px-1 rounded text-xs">COZE_WORKLOAD_IDENTITY_API_KEY</code>，
                    未配置时使用服务器默认配置
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>
                      API Key
                      <span className="text-muted-foreground text-xs ml-2">(COZE_WORKLOAD_IDENTITY_API_KEY)</span>
                    </Label>
                    <div className="relative">
                      <Input
                        type={showSecrets['ai_key'] ? 'text' : 'password'}
                        value={aiConfig.apiKey}
                        onChange={e => updateAiConfig('apiKey', e.target.value)}
                        placeholder="pat_xxxxxxxxxxxxxxxxxx..."
                        className="pr-10 font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => toggleSecret('ai_key')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showSecrets['ai_key'] ? <EyeOff className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      在 Coze 控制台 → 个人设置 → API 密钥 中创建
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>
                        API Base URL
                        <span className="text-muted-foreground text-xs ml-2">(COZE_INTEGRATION_BASE_URL)</span>
                      </Label>
                      <Input
                        value={aiConfig.baseUrl}
                        onChange={e => updateAiConfig('baseUrl', e.target.value)}
                        placeholder="https://api.coze.com"
                      />
                      <p className="text-xs text-muted-foreground">
                        国内用 <code className="bg-muted px-1 rounded">https://api.coze.cn</code>，
                        海外用 <code className="bg-muted px-1 rounded">https://api.coze.com</code>
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>
                        Model Base URL
                        <span className="text-muted-foreground text-xs ml-2">(COZE_INTEGRATION_MODEL_BASE_URL)</span>
                      </Label>
                      <Input
                        value={aiConfig.modelBaseUrl}
                        onChange={e => updateAiConfig('modelBaseUrl', e.target.value)}
                        placeholder="https://model.coze.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>
                      LLM 模型
                      <span className="text-muted-foreground text-xs ml-2">(视频内容分析模型)</span>
                    </Label>
                    <Input
                      value={aiConfig.model}
                      onChange={e => updateAiConfig('model', e.target.value)}
                      placeholder="doubao-seed-1-8-251228"
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      推荐模型：<code className="bg-muted px-1 rounded">doubao-seed-1-8-251228</code>（当前）·
                      <code className="bg-muted px-1 rounded ml-1">doubao-pro-32k</code> · <code className="bg-muted px-1 rounded ml-1">doubao-lite-32k</code>
                    </p>
                  </div>

                  {/* 测试结果 */}
                  {aiTestResult && (
                    <div className={`p-3 rounded-lg text-sm ${aiTestResult.startsWith('✅') ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
                      {aiTestResult}
                    </div>
                  )}

                  <div className="flex gap-3 flex-wrap">
                    <Button onClick={handleSaveAi} className="gap-2">
                      <CheckCircle className="h-4 w-4" />
                      保存 AI 配置
                    </Button>
                    <Button variant="outline" onClick={handleTestAi} disabled={testingAi || !aiConfig.apiKey} className="gap-2">
                      {testingAi ? (
                        <><RefreshCw className="h-4 w-4 animate-spin" />测试中...</>
                      ) : (
                        <><RefreshCw className="h-4 w-4" />测试连接</>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* 环境变量说明 */}
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle className="text-base">服务器部署配置（.env.local）</CardTitle>
                  <CardDescription>生产环境建议直接在服务器配置环境变量，更安全</CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="bg-muted p-4 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre">{`# Coze AI 算力配置
COZE_WORKLOAD_IDENTITY_API_KEY=pat_xxxxxxxxxxxxxxxxxx
COZE_INTEGRATION_BASE_URL=https://api.coze.com
COZE_INTEGRATION_MODEL_BASE_URL=https://model.coze.com`}
                  </pre>
                  <p className="text-xs text-muted-foreground mt-3">
                    将以上内容添加到项目根目录的 <code className="bg-muted px-1 rounded">.env.local</code> 文件中，重启服务生效。
                    管理后台配置的 Key 优先级高于环境变量。
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
