'use client'

// ── Fixture category icons (z_fixtures P6) ────────────────────────────────────
// A curated Lucide set — each imported by name so only these ship (the full
// `icons` map would pull every Lucide icon into the canvas bundle). The DB
// stores the key (fixture_groups.icon); unknown keys fall back to Box.

import {
  CookingPot, Flame, Fan, Wind, AirVent, Refrigerator, Snowflake, Microwave, WashingMachine,
  Droplet, Droplets, ShowerHead, Bath, Toilet, Waves, DoorOpen, DoorClosed, AppWindow, PanelTop,
  Grid2x2, Columns2, Frame, Flower2, Leaf, Sprout, Lamp, LampCeiling, LampDesk, Lightbulb, Sofa,
  Armchair, Bed, Tv, Speaker, Coffee, Wine, CupSoda, Utensils, UtensilsCrossed, ChefHat, Soup,
  Heater, Thermometer, Plug, Zap, Trash2, Recycle, Box, Package, Archive, Shirt, Sparkles, Clock,
  Image, Book, Square, Circle, Star, Tag, type LucideIcon,
} from 'lucide-react'

export const FIXTURE_ICONS: Record<string, LucideIcon> = {
  CookingPot, Flame, Fan, Wind, AirVent, Refrigerator, Snowflake, Microwave, WashingMachine,
  Droplet, Droplets, ShowerHead, Bath, Toilet, Waves, DoorOpen, DoorClosed, AppWindow, PanelTop,
  Grid2x2, Columns2, Frame, Flower2, Leaf, Sprout, Lamp, LampCeiling, LampDesk, Lightbulb, Sofa,
  Armchair, Bed, Tv, Speaker, Coffee, Wine, CupSoda, Utensils, UtensilsCrossed, ChefHat, Soup,
  Heater, Thermometer, Plug, Zap, Trash2, Recycle, Box, Package, Archive, Shirt, Sparkles, Clock,
  Image, Book, Square, Circle, Star, Tag,
}

export const FIXTURE_ICON_KEYS = Object.keys(FIXTURE_ICONS)

export default function FixtureIcon({ name, size = 14, className }: { name: string | null | undefined; size?: number; className?: string }) {
  const Icon = (name && FIXTURE_ICONS[name]) || Box
  return <Icon size={size} className={className} strokeWidth={1.75} aria-hidden />
}

/** Grid of the curated icons; `value` highlighted. Search matches the key (e.g. "door", "fridge"). */
export function FixtureIconPicker({ value, onPick }: { value: string; onPick: (key: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1">
      {FIXTURE_ICON_KEYS.map(k => (
        <button key={k} type="button" title={k.replace(/([a-z])([A-Z0-9])/g, '$1 $2')}
          onClick={() => onPick(k)}
          className={`flex items-center justify-center h-8 rounded border transition-colors ${
            k === value ? 'border-accent bg-accent/10 text-accent-ink' : 'border-edge-strong text-ink-muted hover:bg-surface-2'
          }`}>
          <FixtureIcon name={k} size={16} />
        </button>
      ))}
    </div>
  )
}
