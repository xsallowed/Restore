/**
 * Global Style Constants
 * Defines consistent typography, colors, and component styles across the application
 */

// ═══════════════════════════════════════════════════════════════
// Typography
// ═══════════════════════════════════════════════════════════════

export const Typography = {
  // Page headings - Large, bold with gradient effect
  pageHeading: 'text-4xl md:text-5xl font-bold',
  
  // Section headings - Medium, bold
  sectionHeading: 'text-2xl md:text-3xl font-bold text-white',
  
  // Subsection headings
  subsectionHeading: 'text-lg font-semibold text-white',
  
  // Card headings
  cardHeading: 'text-base font-semibold text-white',
  
  // Body text - Main content
  bodyText: 'text-base text-dark-200',
  bodyTextSmall: 'text-sm text-dark-300',
  
  // Badge/tag text
  badge: 'text-xs font-semibold uppercase tracking-wider',
  
  // Button text
  buttonText: 'text-sm font-semibold',
};

// ═══════════════════════════════════════════════════════════════
// Colors & Gradients
// ═══════════════════════════════════════════════════════════════

export const Colors = {
  // Primary accent
  purple: '#9333ea',
  purpleDark: '#7e22ce',
  
  // Secondary accent
  orange: '#ff9500',
  
  // Tertiary accent
  gold: '#fbbf24',
  pink: '#ec4899',
  
  // Text colors
  textWhite: '#ffffff',
  textLight: '#e5e7eb',
  textGray: '#9ca3af',
  textDark: '#6b7280',
  
  // Background
  bgDark: '#111827',
  bgDarker: '#030712',
};

// ═══════════════════════════════════════════════════════════════
// Button Styles
// ═══════════════════════════════════════════════════════════════

export const Buttons = {
  // Primary button - Full gradient background
  primary: 'inline-flex items-center justify-center gap-2 bg-gradient-purple-orange text-white px-6 py-3 rounded-lg font-semibold hover:shadow-glow transition-all active:scale-95',
  
  // Secondary button - Outlined style
  secondary: 'inline-flex items-center justify-center gap-2 border-2 border-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-purple-600 hover:bg-opacity-10 transition-all',
  
  // Tertiary button - Minimal style
  tertiary: 'inline-flex items-center justify-center gap-2 text-white px-4 py-2 rounded-lg font-medium hover:bg-white/10 transition-all',
  
  // Button with just text (link style)
  link: 'inline-flex items-center gap-1 text-purple-400 hover:text-purple-300 font-medium transition-colors',
  
  // Small button
  small: 'inline-flex items-center justify-center gap-1 bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
};

// ═══════════════════════════════════════════════════════════════
// Badge Styles
// ═══════════════════════════════════════════════════════════════

export const Badges = {
  // Purple outlined badge (for subtitles/tags)
  purpleOutline: 'inline-flex items-center gap-2 border border-purple-600 border-opacity-60 px-3 py-1.5 rounded-full text-xs font-semibold text-purple-300 uppercase tracking-wider',
  
  // Severity badges
  p1: 'inline-flex px-2.5 py-1.5 rounded-md bg-red-600 text-red-100 text-xs font-semibold',
  p2: 'inline-flex px-2.5 py-1.5 rounded-md bg-orange text-gray-900 text-xs font-semibold',
  p3: 'inline-flex px-2.5 py-1.5 rounded-md bg-gold text-gray-900 text-xs font-semibold',
  p4: 'inline-flex px-2.5 py-1.5 rounded-md bg-purple-600 text-purple-100 text-xs font-semibold',
};

// ═══════════════════════════════════════════════════════════════
// Card Styles
// ═══════════════════════════════════════════════════════════════

export const Cards = {
  // Base card container
  base: 'bg-dark-900 bg-opacity-50 backdrop-blur border border-purple-600 border-opacity-20 rounded-lg p-4 transition-all hover:border-opacity-40',
  
  // Large card
  large: 'bg-dark-900 bg-opacity-50 backdrop-blur border border-purple-600 border-opacity-20 rounded-lg p-6 transition-all',
  
  // Minimal card
  minimal: 'bg-dark-800 bg-opacity-30 rounded-lg p-4 border border-dark-700 border-opacity-50',
};

// ═══════════════════════════════════════════════════════════════
// Layout Spacing
// ═══════════════════════════════════════════════════════════════

export const Spacing = {
  // Section spacing
  sectionGap: 'space-y-6',
  containerGap: 'space-y-8',
  
  // Grid spacing
  gridGap: 'gap-4',
  gridGapLarge: 'gap-6',
};

// ═══════════════════════════════════════════════════════════════
// Container Styles
// ═══════════════════════════════════════════════════════════════

export const Containers = {
  // Page container
  page: 'max-w-7xl mx-auto space-y-6',
  
  // Section container
  section: 'w-full',
};
