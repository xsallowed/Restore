import { useTheme } from './themeContext';

export function useThemeStyles() {
  const { theme } = useTheme();

  return {
    // Backgrounds
    bgPrimary: theme === 'light' ? 'bg-white' : 'dark:bg-gray-950',
    bgSecondary: theme === 'light' ? 'bg-gray-50' : 'dark:bg-gray-900',
    bgTertiary: theme === 'light' ? 'bg-gray-100' : 'dark:bg-gray-800',
    bgElevated: theme === 'light' ? 'bg-white' : 'dark:bg-gray-850',
    
    // Text
    textPrimary: theme === 'light' ? 'text-gray-900' : 'dark:text-gray-50',
    textSecondary: theme === 'light' ? 'text-gray-600' : 'dark:text-gray-300',
    textTertiary: theme === 'light' ? 'text-gray-500' : 'dark:text-gray-400',
    textMuted: theme === 'light' ? 'text-gray-400' : 'dark:text-gray-500',
    
    // Borders
    borderPrimary: theme === 'light' ? 'border-gray-200' : 'dark:border-gray-700',
    borderSecondary: theme === 'light' ? 'border-gray-300' : 'dark:border-gray-600',
    
    // Cards
    card: theme === 'light' 
      ? 'bg-white border border-gray-200 shadow-sm' 
      : 'dark:bg-gray-850 dark:border dark:border-gray-700 dark:shadow-lg',
    
    // Buttons
    buttonPrimary: theme === 'light'
      ? 'bg-gradient-purple-orange text-white hover:shadow-lg'
      : 'dark:bg-gradient-purple-orange dark:text-white dark:hover:shadow-glow',
    buttonSecondary: theme === 'light'
      ? 'bg-gray-100 text-gray-900 hover:bg-gray-200 border border-gray-300'
      : 'dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 dark:border dark:border-gray-600',
  };
}
