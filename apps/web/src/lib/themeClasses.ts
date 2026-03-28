/**
 * Theme-aware Tailwind classes
 * Uses Tailwind's dark: prefix for automatic theme switching
 */

export const themeClasses = {
  // Backgrounds
  bg: {
    primary: 'bg-white dark:bg-gray-950',
    secondary: 'bg-gray-50 dark:bg-gray-900',
    tertiary: 'bg-gray-100 dark:bg-gray-800',
    elevated: 'bg-white dark:bg-gray-850',
    card: 'bg-white dark:bg-gray-850',
    input: 'bg-white dark:bg-gray-800',
  },

  // Text Colors
  text: {
    primary: 'text-gray-900 dark:text-gray-50',
    secondary: 'text-gray-600 dark:text-gray-300',
    tertiary: 'text-gray-500 dark:text-gray-400',
    muted: 'text-gray-400 dark:text-gray-500',
    inverse: 'text-white dark:text-gray-900',
  },

  // Borders
  border: {
    primary: 'border-gray-200 dark:border-gray-700',
    secondary: 'border-gray-300 dark:border-gray-600',
    accent: 'border-purple-200 dark:border-purple-700',
  },

  // Cards & Containers
  card: 'bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-lg',
  cardHover: 'hover:shadow-md dark:hover:border-gray-600',
  
  // Buttons
  button: {
    primary: 'bg-gradient-purple-orange text-white hover:shadow-lg dark:hover:shadow-glow',
    secondary: 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600',
    tertiary: 'bg-transparent text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-300 dark:border-gray-600',
    danger: 'bg-red-600 text-white hover:bg-red-700 dark:hover:bg-red-700',
  },

  // Inputs
  input: 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white hover:border-gray-400 dark:hover:border-gray-600 focus:border-purple-500 dark:focus:border-purple-600 focus:ring-purple-500 dark:focus:ring-purple-600',

  // Badges
  badge: {
    default: 'bg-purple-100 dark:bg-purple-900/40 text-purple-900 dark:text-purple-200',
    success: 'bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-200',
    warning: 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200',
    danger: 'bg-red-100 dark:bg-red-900/40 text-red-900 dark:text-red-200',
  },

  // Dividers
  divider: 'border-gray-200 dark:border-gray-700',

  // Hover States
  hover: {
    bg: 'hover:bg-gray-100 dark:hover:bg-gray-800',
    text: 'hover:text-gray-900 dark:hover:text-gray-50',
  },

  // Focus States
  focus: {
    ring: 'focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-600 focus:ring-offset-0 dark:focus:ring-offset-0',
  },
};
