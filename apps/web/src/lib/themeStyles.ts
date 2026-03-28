/**
 * Professional Theme Design System
 * Supports both light and dark modes with proper contrast and hierarchy
 */

export const lightTheme = {
  // Backgrounds
  bg: {
    primary: 'bg-white',
    secondary: 'bg-gray-50',
    tertiary: 'bg-gray-100',
    elevated: 'bg-white',
    overlay: 'bg-white/95',
  },
  
  // Text Colors
  text: {
    primary: 'text-gray-900',
    secondary: 'text-gray-600',
    tertiary: 'text-gray-500',
    muted: 'text-gray-400',
    inverse: 'text-white',
  },
  
  // Borders
  border: {
    primary: 'border-gray-200',
    secondary: 'border-gray-300',
    accent: 'border-purple-200',
  },
  
  // Buttons
  button: {
    primary: 'bg-gradient-purple-orange text-white hover:shadow-lg',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 border border-gray-300',
    tertiary: 'bg-transparent text-gray-900 hover:bg-gray-100 border border-gray-300',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  },
  
  // Cards
  card: 'bg-white border border-gray-200 shadow-sm',
  cardHover: 'hover:shadow-md',
  
  // Typography
  heading1: 'text-3xl font-bold text-gray-900',
  heading2: 'text-2xl font-bold text-gray-900',
  heading3: 'text-lg font-semibold text-gray-900',
  body: 'text-base text-gray-600',
  label: 'text-sm font-medium text-gray-700',
  
  // Input
  input: 'bg-white border border-gray-300 text-gray-900 focus:border-purple-500 focus:ring-purple-500',
  
  // Badge/Tag
  badge: 'bg-purple-100 text-purple-900',
  badgeSuccess: 'bg-green-100 text-green-900',
  badgeWarning: 'bg-amber-100 text-amber-900',
  badgeDanger: 'bg-red-100 text-red-900',
};

export const darkTheme = {
  // Backgrounds
  bg: {
    primary: 'dark:bg-gray-950',
    secondary: 'dark:bg-gray-900',
    tertiary: 'dark:bg-gray-800',
    elevated: 'dark:bg-gray-850',
    overlay: 'dark:bg-gray-900/95',
  },
  
  // Text Colors
  text: {
    primary: 'dark:text-gray-50',
    secondary: 'dark:text-gray-300',
    tertiary: 'dark:text-gray-400',
    muted: 'dark:text-gray-500',
    inverse: 'dark:text-gray-900',
  },
  
  // Borders
  border: {
    primary: 'dark:border-gray-700',
    secondary: 'dark:border-gray-600',
    accent: 'dark:border-purple-700',
  },
  
  // Buttons
  button: {
    primary: 'dark:bg-gradient-purple-orange dark:text-white dark:hover:shadow-glow',
    secondary: 'dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 dark:border dark:border-gray-600',
    tertiary: 'dark:bg-transparent dark:text-gray-100 dark:hover:bg-gray-800 dark:border dark:border-gray-600',
    danger: 'dark:bg-red-600 dark:text-white dark:hover:bg-red-700',
  },
  
  // Cards
  card: 'dark:bg-gray-850 dark:border dark:border-gray-700 dark:shadow-lg',
  cardHover: 'dark:hover:border-gray-600',
  
  // Typography
  heading1: 'dark:text-4xl dark:font-bold dark:text-gray-50',
  heading2: 'dark:text-2xl dark:font-bold dark:text-gray-100',
  heading3: 'dark:text-lg dark:font-semibold dark:text-gray-100',
  body: 'dark:text-base dark:text-gray-300',
  label: 'dark:text-sm dark:font-medium dark:text-gray-300',
  
  // Input
  input: 'dark:bg-gray-800 dark:border dark:border-gray-700 dark:text-gray-50 dark:focus:border-purple-600 dark:focus:ring-purple-600',
  
  // Badge/Tag
  badge: 'dark:bg-purple-900/40 dark:text-purple-200',
  badgeSuccess: 'dark:bg-green-900/40 dark:text-green-200',
  badgeWarning: 'dark:bg-amber-900/40 dark:text-amber-200',
  badgeDanger: 'dark:bg-red-900/40 dark:text-red-200',
};

/**
 * Combined theme that works with light mode by default,
 * and adds dark mode classes
 */
export const theme = {
  // Backgrounds
  bg: {
    primary: `${lightTheme.bg.primary} ${darkTheme.bg.primary}`,
    secondary: `${lightTheme.bg.secondary} ${darkTheme.bg.secondary}`,
    tertiary: `${lightTheme.bg.tertiary} ${darkTheme.bg.tertiary}`,
    elevated: `${lightTheme.bg.elevated} ${darkTheme.bg.elevated}`,
    overlay: `${lightTheme.bg.overlay} ${darkTheme.bg.overlay}`,
  },
  
  // Text Colors
  text: {
    primary: `${lightTheme.text.primary} ${darkTheme.text.primary}`,
    secondary: `${lightTheme.text.secondary} ${darkTheme.text.secondary}`,
    tertiary: `${lightTheme.text.tertiary} ${darkTheme.text.tertiary}`,
    muted: `${lightTheme.text.muted} ${darkTheme.text.muted}`,
    inverse: `${lightTheme.text.inverse} ${darkTheme.text.inverse}`,
  },
  
  // Borders
  border: {
    primary: `${lightTheme.border.primary} ${darkTheme.border.primary}`,
    secondary: `${lightTheme.border.secondary} ${darkTheme.border.secondary}`,
    accent: `${lightTheme.border.accent} ${darkTheme.border.accent}`,
  },
  
  // Buttons
  button: {
    primary: `${lightTheme.button.primary} ${darkTheme.button.primary}`,
    secondary: `${lightTheme.button.secondary} ${darkTheme.button.secondary}`,
    tertiary: `${lightTheme.button.tertiary} ${darkTheme.button.tertiary}`,
    danger: `${lightTheme.button.danger} ${darkTheme.button.danger}`,
  },
  
  // Cards
  card: `${lightTheme.card} ${darkTheme.card}`,
  cardHover: `${lightTheme.cardHover} ${darkTheme.cardHover}`,
  
  // Typography
  heading1: `${lightTheme.heading1} ${darkTheme.heading1}`,
  heading2: `${lightTheme.heading2} ${darkTheme.heading2}`,
  heading3: `${lightTheme.heading3} ${darkTheme.heading3}`,
  body: `${lightTheme.body} ${darkTheme.body}`,
  label: `${lightTheme.label} ${darkTheme.label}`,
  
  // Input
  input: `${lightTheme.input} ${darkTheme.input}`,
  
  // Badge/Tag
  badge: `${lightTheme.badge} ${darkTheme.badge}`,
  badgeSuccess: `${lightTheme.badgeSuccess} ${darkTheme.badgeSuccess}`,
  badgeWarning: `${lightTheme.badgeWarning} ${darkTheme.badgeWarning}`,
  badgeDanger: `${lightTheme.badgeDanger} ${darkTheme.badgeDanger}`,
};
