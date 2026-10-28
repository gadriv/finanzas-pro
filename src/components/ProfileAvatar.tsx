import type { UserProfile } from '../types';
import { profileInitials } from '../lib/profiles';

const SIZES = {
  sm: 'w-6 h-6 text-[9px]',
  md: 'w-7 h-7 text-[10px]',
  lg: 'w-10 h-10 text-xs',
} as const;

interface ProfileAvatarProps {
  user: UserProfile;
  size?: keyof typeof SIZES;
}

export function ProfileAvatar({ user, size = 'md' }: ProfileAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={`${SIZES[size]} rounded-full text-white font-bold flex items-center justify-center shrink-0 select-none`}
      style={{ backgroundColor: user.color }}
    >
      {profileInitials(user.name)}
    </span>
  );
}
