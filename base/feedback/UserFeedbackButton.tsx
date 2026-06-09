'use client';

/**
 * 用户反馈按钮组件
 * 
 * 提供用户反馈功能，点击打开外部反馈表单
 * 
 * @example
 * ```tsx
 * import { UserFeedbackButton } from './base/feedback/UserFeedbackButton';
 * 
 * function Navbar() {
 *   return (
 *     <nav>
 *       <UserFeedbackButton />
 *     </nav>
 *   );
 * }
 * ```
 */

import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';

export interface UserFeedbackButtonProps {
  /** 反馈表单 URL */
  feedbackUrl?: string;
  /** 按钮文本 */
  label?: string;
  /** 自定义类名 */
  className?: string;
  /** 是否在新窗口打开 */
  external?: boolean;
}

/**
 * 默认的反馈表单 URL
 * 使用 Tally.so 服务
 */
const DEFAULT_FEEDBACK_URL = 'https://tally.so/r/5BMYVb';

export function UserFeedbackButton({
  feedbackUrl = DEFAULT_FEEDBACK_URL,
  label = 'Feedback',
  className = '',
  external = true,
}: UserFeedbackButtonProps) {
  const handleClick = () => {
    if (external) {
      window.open(feedbackUrl, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = feedbackUrl;
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      asChild
      className={className}
      onClick={handleClick}
    >
      <a
        href={feedbackUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <MessageSquare className="h-4 w-4 mr-2" />
        {label}
      </a>
    </Button>
  );
}
