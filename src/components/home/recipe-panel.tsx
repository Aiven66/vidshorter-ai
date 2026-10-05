'use client';

/**
 * 配方（Recipe）面板 —— 把当前导出设置存成命名配方，一键复跑（P1-6）。
 *
 * 定位：留存 + 转化双引擎。
 *   留存 —— 用户把调好的「风格」存下来，换素材一键复跑，回访理由明确。
 *   转化 —— 免费档仅可保存 1 条，Starter+ 不限量，配方库本身成为付费台阶。
 *
 * 只负责「快照当前设置 / 列表 / 应用 / 删除」；设置项的真值仍由 video-processor 持有，
 * 应用配方通过 onApply 回调回填，避免出现第二份设置状态。
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Bookmark, Check, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  MAX_RECIPE_NAME,
  canAddRecipe,
  createRecipe,
  loadRecipes,
  recipeLimitForPlan,
  removeRecipe,
  saveRecipes,
  upsertRecipe,
  type Recipe,
  type RecipeConfig,
} from '@/lib/recipes';

interface RecipePanelProps {
  /** 当前登录用户 id（配方按账号隔离存储）；未登录为 null */
  userId: string | null;
  /** 当前方案（free/starter/pro） */
  plan: string;
  /** 管理员视为不限量 */
  isAdmin?: boolean;
  /** 当前设置快照 —— 「保存当前设置」时固化 */
  config: RecipeConfig;
  /** 应用配方：由父组件把配置回填到各设置项 */
  onApply: (config: RecipeConfig) => void;
  /** 生成/上传进行中时禁止改动设置 */
  disabled?: boolean;
}

export default function RecipePanel({
  userId,
  plan,
  isAdmin = false,
  config,
  onApply,
  disabled = false,
}: RecipePanelProps) {
  const { t } = useLocale();

  const tv = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let s = t(key);
      if (s === key) return key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
      return s;
    },
    [t],
  );

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [name, setName] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [err, setErr] = useState('');
  const [appliedId, setAppliedId] = useState<string | null>(null);

  // 账号切换时重新加载（未登录 → 空列表）
  useEffect(() => {
    setRecipes(loadRecipes(userId));
    setFormOpen(false);
    setName('');
    setErr('');
  }, [userId]);

  const limit = recipeLimitForPlan(plan, isAdmin);
  const canAdd = !!userId && canAddRecipe(plan, recipes.length, isAdmin);

  const persist = useCallback(
    (next: Recipe[]) => {
      setRecipes(next);
      if (!saveRecipes(userId, next)) setErr(tv('video.recipe.storageFailed'));
    },
    [userId, tv],
  );

  const handleSave = () => {
    setErr('');
    if (!userId) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setErr(tv('video.recipe.nameRequired'));
      return;
    }
    if (!canAdd) {
      setErr(tv('video.recipe.limitReached', { max: limit }));
      return;
    }
    persist(upsertRecipe(recipes, createRecipe(trimmed, config)));
    setName('');
    setFormOpen(false);
  };

  const handleApply = (recipe: Recipe) => {
    onApply(recipe.config);
    setAppliedId(recipe.id);
    window.setTimeout(() => setAppliedId((prev) => (prev === recipe.id ? null : prev)), 2000);
  };

  const handleDelete = (id: string) => {
    setErr('');
    persist(removeRecipe(recipes, id));
  };

  /** 配方摘要：画质 · 竖屏 · 字幕 · 场景（场景 key 缺失时不渲染原始 key） */
  const summarize = (recipe: Recipe): string => {
    const parts = [recipe.config.quality === 'hd' ? t('video.quality.hd') : t('video.quality.sd')];
    if (recipe.config.exportVertical) parts.push(t('video.vertical.label'));
    if (recipe.config.exportSubtitles) parts.push(t('video.subtitle.label'));
    if (recipe.config.scenario) {
      const key = `video.scenario.${recipe.config.scenario}.label`;
      const label = t(key);
      if (label !== key) parts.push(label);
    }
    return parts.join(' · ');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Bookmark className="h-3.5 w-3.5" />
          <span>{t('video.recipe.label')}</span>
          {recipes.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {recipes.length}
            </Badge>
          )}
        </div>
        {userId && canAdd && !formOpen && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setFormOpen(true);
              setErr('');
            }}
            className="flex items-center gap-1 text-xs text-primary transition-colors hover:opacity-80 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('video.recipe.saveTitle')}
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t('video.recipe.hint')}</p>

      {/* 未登录：配方按账号存储，引导登录 */}
      {!userId && (
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-xs font-medium">{t('video.recipe.loginTitle')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('video.recipe.loginDesc')}</p>
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link href="/login">{t('video.recipe.loginCta')}</Link>
          </Button>
        </div>
      )}

      {/* 登录用户：列表 + 空态 */}
      {userId && recipes.length > 0 && (
        <ul className="space-y-1.5">
          {recipes.map((recipe) => (
            <li
              key={recipe.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{recipe.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{summarize(recipe)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={appliedId === recipe.id ? 'secondary' : 'outline'}
                  disabled={disabled}
                  onClick={() => handleApply(recipe)}
                  className="h-7 px-2 text-xs"
                >
                  {appliedId === recipe.id ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      {t('video.recipe.appliedShort')}
                    </>
                  ) : (
                    t('video.recipe.apply')
                  )}
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => handleDelete(recipe.id)}
                  aria-label={t('video.recipe.delete')}
                  title={t('video.recipe.delete')}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {userId && recipes.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-3 py-3 text-center">
          <p className="text-xs text-muted-foreground">{t('video.recipe.empty')}</p>
        </div>
      )}

      {/* 保存表单 */}
      {userId && formOpen && canAdd && (
        <div className="flex items-center gap-2">
          <Input
            value={name}
            maxLength={MAX_RECIPE_NAME}
            placeholder={t('video.recipe.namePlaceholder')}
            disabled={disabled}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              }
            }}
            className="h-8 text-sm"
          />
          <Button type="button" size="sm" disabled={disabled} onClick={handleSave} className="h-8 shrink-0">
            {t('video.recipe.save')}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              setFormOpen(false);
              setName('');
              setErr('');
            }}
            aria-label={t('video.recipe.cancel')}
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      )}

      {/* 免费档达上限：升级引导（配方库 = 付费台阶） */}
      {userId && !canAdd && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/5 p-2.5">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">{t('video.recipe.limitTitle')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {tv('video.recipe.limitDesc', { max: limit })}
            </p>
            <Button asChild size="sm" className="mt-2 h-7 px-2 text-xs">
              <Link href="/pricing">{t('video.recipe.upgradeCta')}</Link>
            </Button>
          </div>
        </div>
      )}

      {err && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>{err}</p>
        </div>
      )}
    </div>
  );
}
