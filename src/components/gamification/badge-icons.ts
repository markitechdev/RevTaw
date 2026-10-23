import { Award, BookOpen, Brain, Castle, Clock, Compass, Flame, GraduationCap, Layers, ListChecks, Play, Sparkles, Target, TrendingUp, type LucideIcon } from "lucide-react";

import type { AchievementDef } from "@/lib/gamification/achievements";

/** The icon each badge shows, shared by the badge grid and the user card. */
export const BADGE_ICONS: Record<AchievementDef["icon"], LucideIcon> = {
  play: Play,
  layers: Layers,
  "list-checks": ListChecks,
  flame: Flame,
  award: Award,
  brain: Brain,
  compass: Compass,
  clock: Clock,
  target: Target,
  "trending-up": TrendingUp,
  castle: Castle,
  "book-open": BookOpen,
  "graduation-cap": GraduationCap,
  sparkles: Sparkles,
};
