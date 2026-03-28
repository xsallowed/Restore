/**
 * Professional Dark Theme Design System
 * High contrast, clean hierarchy, strategic accent color usage
 */

// ═══════════════════════════════════════════════════════════════
// Typography - High Contrast for Readability
// ═══════════════════════════════════════════════════════════════

export const Typography = {
  // Page headings - Large, bold, white for maximum contrast
  pageHeading: 'text-4xl md:text-5xl font-bold text-white',
  
  // Section headings - Bold, white
  sectionHeading: 'text-2xl md:text-3xl font-bold text-white',
  
  // Subsection headings - Clear hierarchy
  subsectionHeading: 'text-lg font-semibold text-white',
  
  // Card headings
  cardHeading: 'text-base font-semibold text-white',
  
  // Body text - High contrast light gray
  bodyText: 'text-base text-gray-300',
  bodyTextSmall: 'text-sm text-gray-400',
  
  // Secondary text - Lower contrast for less important info
  secondaryText: 'text-sm text-gray-500',
  
  // Label text
  labelText: 'text-sm font-medium text-gray-300',
  
  // Badge/tag text
  badge: 'text-xs font-semibold uppercase tracking-wider text-purple-300',
};

// ═══════════════════════════════════════════════════════════════
// Colors - Professional Palette
// ═══════════════════════════════════════════════════════════════

export const Colors = {
  // Primary accent - Purple
  primary: '#9333ea',
  primaryLight: '#a855f7',
  primaryDark: '#7e22ce',
  
  // Secondary accent - Orange (used sparingly)
  secondary: '#ff9500',
  
  // Tertiary accent - Gold/Yellow
  accent: '#fbbf24',
  
  // Text colors - High contrast on dark
  textWhite: '#ffffff',
  textLight: '#f3f4f6',      // gray-100
  textDefault: '#d1d5db',     // gray-300
  textSecondary: '#9ca3af',   // gray-400
  
  // Background - Dark, professional
  bgDark: '#111827',          // gray-950
  bgDarker: '#030712',        // Nearly black
  bgElevated: '#1f2937',      // gray-800
  
  // Borders - Subtle but visible
  borderLight: '#374151',     // gray-700
  borderDefault: '#4b5563',   // gray-600
};

// ═══════════════════════════════════════════════════════════════
// Button Styles - Strategic Use of Accents
// ═══════════════════════════════════════════════════════════════

export const Buttons = {
  // Primary button - Purple gradient, white text
  primary: 'inline-flex items-center justify-center gap-2 bg-gradient-purple-orange text-white px-6 py-3 rounded-lg font-semibold hover:shadow-glow transition-all active:scale-95',
  
  // Secondary button - Purple outline, white text
  secondary: 'inline-flex items-center justify-center gap-2 border-2 border-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-purple-600 hover:bg-opacity-10 transition-all',
  
  // Tertiary button - Minimal style, gray border
  tertiary: 'inline-flex items-center justify-center gap-2 border border-gray-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-700 hover:bg-opacity-50 transition-all',
  
  // Danger button - Red for destructive actions
  danger: 'inline-flex items-center justify-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition-all',
  
  // Small button - Icon buttons
  small: 'inline-flex items-center justify-center gap-1 text-gray-400 hover:text-white transition-colors',
};

// ═══════════════════════════════════════════════════════════════
// Badge Styles - Accent Colors Only
// ═══════════════════════════════════════════════════════════════

export const Badges = {
  // Purple outlined badge (for section labels)
  purpleOutline: 'inline-flex items-center gap-2 border border-purple-600 border-opacity-60 px-3 py-1.5 rounded-full text-xs font-semibold text-purple-300 uppercase tracking-wider',
  
  // Severity badges - Color coded for quick scanning
  p1: 'inline-flex px-2.5 py-1.5 rounded-md bg-red-600 text-white text-xs font-semibold',
  p2: 'inline-flex px-2.5 py-1.5 rounded-md bg-orange text-white text-xs font-semibold',
  p3: 'inline-flex px-2.5 py-1.5 rounded-md bg-gold text-gray-900 text-xs font-semibold',
  p4: 'inline-flex px-2.5 py-1.5 rounded-md bg-purple-600 text-white text-xs font-semibold',
  
  // Status badges
  success: 'inline-flex px-2.5 py-1.5 rounded-md bg-green-600 text-white text-xs font-semibold',
  warning: 'inline-flex px-2.5 py-1.5 rounded-md bg-orange text-white text-xs font-semibold',
  error: 'inline-flex px-2.5 py-1.5 rounded-md bg-red-600 text-white text-xs font-semibold',
};

// ═══════════════════════════════════════════════════════════════
// Card Styles - Subtle Elevation
// ═══════════════════════════════════════════════════════════════

export const Cards = {
  // Base card container - Elevated background
  base: 'bg-gray-800 bg-opacity-40 backdrop-blur border border-gray-700 border-opacity-50 rounded-lg p-4 transition-all hover:border-gray-600',
  
  // Large card - More padding for content
  large: 'bg-gray-800 bg-opacity-40 backdrop-blur border border-gray-700 border-opacity-50 rounded-lg p-6 transition-all',
  
  // Minimal card - Subtle background
  minimal: 'bg-gray-800 bg-opacity-20 rounded-lg p-4 border border-gray-700 border-opacity-30',
  
  // Alert card - For important information
  alert: 'bg-orange bg-opacity-10 border border-orange border-opacity-30 rounded-lg p-4',
};

// ═══════════════════════════════════════════════════════════════
// Icon Colors - Minimal Palette
// ═══════════════════════════════════════════════════════════════

export const Icons = {
  // Primary icon color - Purple for important actions
  primary: 'text-purple-600',
  
  // Secondary icon color - Light gray for secondary actions
  secondary: 'text-gray-400',
  
  // Accent icon color - Gold for success/positive
  accent: 'text-gold',
  
  // Alert icon color - Red for alerts
  alert: 'text-red-400',
  
  // Muted icon color - Subtle gray
  muted: 'text-gray-500',
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
  
  // Modal backdrop
  backdrop: 'fixed inset-0 bg-black/50 backdrop-blur-sm',
};

// ═══════════════════════════════════════════════════════════════
// Input Styles
// ═══════════════════════════════════════════════════════════════

export const Inputs = {
  // Standard input field
  standard: 'w-full bg-gray-800 border border-gray-700 hover:border-gray-600 focus:border-purple-600 text-white rounded-lg px-4 py-3 text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-purple-500 focus:ring-opacity-30',
  
  // Textarea
  textarea: 'w-full bg-gray-800 border border-gray-700 hover:border-gray-600 focus:border-purple-600 text-white rounded-lg px-4 py-3 text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-purple-500 focus:ring-opacity-30 resize-none',
  
  // Label
  label: 'block text-sm font-medium text-gray-300 mb-2',
};
